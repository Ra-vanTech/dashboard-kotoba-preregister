const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config({ path: '.env.local' });

const PORT = process.env.PORT || 5173;
const SHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  throw new Error('Missing Google Sheets credentials in .env.local');
}

const app = express();
app.disable('x-powered-by');

const cache = {
  data: null,
  fetchedAt: 0
};
const CACHE_TTL_MS = 60 * 1000;
let cachedSheetTitle = null;

const truthyValues = new Set(['true', '1', 'yes', 'si']);

const isTruthy = (value) => {
  return truthyValues.has(String(value || '').trim().toLowerCase());
};

const normalizeHeader = (header) => String(header || '').trim().toLowerCase();

const isRowEmpty = (row) => {
  return row.every((cell) => !String(cell || '').trim());
};

const getAuthClient = () => {
  const formattedKey = PRIVATE_KEY.replace(/\\n/g, '\n');
  return new google.auth.JWT(CLIENT_EMAIL, null, formattedKey, [
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ]);
};

const getSheetTitle = async (sheets) => {
  if (cachedSheetTitle) {
    return cachedSheetTitle;
  }

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID
  });
  cachedSheetTitle = metadata.data.sheets?.[0]?.properties?.title || null;
  return cachedSheetTitle;
};

const fetchSheetRows = async () => {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetTitle = await getSheetTitle(sheets);
  const range = sheetTitle ? `${sheetTitle}!A1:Z` : 'A1:Z';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });

  return response.data.values || [];
};

const buildSummary = async () => {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const rows = await fetchSheetRows();
  if (!rows.length) {
    const emptySummary = {
      total: 0,
      marketingYes: 0,
      marketingRate: 0,
      countries: [],
      unknownCount: 0,
      topCountry: null,
      updatedAt: new Date().toISOString()
    };
    cache.data = emptySummary;
    cache.fetchedAt = now;
    return emptySummary;
  }

  const headerRow = rows[0];
  const headers = headerRow.map(normalizeHeader);
  const indexOf = (name) => headers.indexOf(name);
  const getValue = (row, name) => {
    const idx = indexOf(name);
    if (idx === -1) {
      return '';
    }
    return row[idx] || '';
  };

  let total = 0;
  let marketingYes = 0;
  let unknownCount = 0;
  const countryCounts = {};

  for (const row of rows.slice(1)) {
    if (!row.length || isRowEmpty(row)) {
      continue;
    }

    const email = getValue(row, 'email');
    const timestamp = getValue(row, 'timestamp');
    if (!String(email || '').trim() && !String(timestamp || '').trim()) {
      continue;
    }

    total += 1;

    const marketing = getValue(row, 'acepta_marketing');
    if (isTruthy(marketing)) {
      marketingYes += 1;
    }

    const countryRaw = getValue(row, 'ip_country');
    const country = String(countryRaw || 'unknown').trim().toUpperCase();
    if (!country || country === 'UNKNOWN') {
      unknownCount += 1;
      continue;
    }

    countryCounts[country] = (countryCounts[country] || 0) + 1;
  }

  const countries = Object.entries(countryCounts).map(([code, count]) => ({
    code,
    count
  }));
  countries.sort((a, b) => b.count - a.count);

  const summary = {
    total,
    marketingYes,
    marketingRate: total ? marketingYes / total : 0,
    countries,
    unknownCount,
    topCountry: countries[0] || null,
    updatedAt: new Date().toISOString()
  };

  cache.data = summary;
  cache.fetchedAt = now;
  return summary;
};

app.get('/api/summary', async (req, res) => {
  try {
    const summary = await buildSummary();
    res.json(summary);
  } catch (error) {
    console.error('Failed to load sheet data', error);
    res.status(500).json({
      error: 'Failed to load sheet data'
    });
  }
});

app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
});
