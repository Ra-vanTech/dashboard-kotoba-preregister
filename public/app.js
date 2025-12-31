const { useEffect, useMemo, useState } = React;
const html = htm.bind(React.createElement);

const numberFormatter = new Intl.NumberFormat('es-MX');

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' });
  } catch (error) {
    return null;
  }
})();

const stripDiacritics = (value) => {
  if (!value || typeof value.normalize !== 'function') {
    return value || '';
  }
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const formatCountryLabel = (code) => {
  if (code === 'UNKNOWN') {
    return 'Desconocido';
  }
  if (regionNames) {
    const name = regionNames.of(code);
    if (name) {
      return stripDiacritics(name);
    }
  }
  return code;
};

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

const formatDate = (isoString) => {
  if (!isoString) {
    return '-';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const App = () => {
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const fetchSummary = async () => {
    try {
      setStatus('loading');
      setError('');
      const response = await fetch('/api/summary');
      if (!response.ok) {
        throw new Error('Request failed');
      }
      const data = await response.json();
      setSummary(data);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError('No se pudo cargar la data del Sheet');
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (!summary || !window.svgMap) {
      return;
    }
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      return;
    }
    mapContainer.innerHTML = '';
    const values = {};
    summary.countries.forEach((entry) => {
      values[entry.code] = { count: entry.count };
    });

    new svgMap({
      targetElementID: 'map',
      data: {
        data: {
          count: {
            name: 'Pre-registros',
            format: '{0}'
          }
        },
        applyData: 'count',
        values
      },
      colorMin: '#cbb2ff',
      colorMax: '#5a2bbf',
      colorNoData: '#c8c6cf',
      noDataText: 'Sin datos'
    });
  }, [summary]);

  const total = summary?.total || 0;
  const marketingYes = summary?.marketingYes || 0;
  const marketingRate = summary?.marketingRate || 0;
  const unknownCount = summary?.unknownCount || 0;

  const topCountries = useMemo(() => {
    if (!summary) {
      return [];
    }
    const items = summary.countries.slice(0, 6);
    if (unknownCount > 0) {
      items.push({ code: 'UNKNOWN', count: unknownCount });
    }
    return items;
  }, [summary, unknownCount]);

  const maxCountryCount = topCountries.reduce(
    (maxValue, entry) => Math.max(maxValue, entry.count),
    1
  );

  const topCountryLabel = summary?.topCountry
    ? `${formatCountryLabel(summary.topCountry.code)} ${numberFormatter.format(
        summary.topCountry.count
      )}`
    : '-';

  const milestones = [100, 1000].map((target) => {
    const progressValue = Math.min(100, (total / target) * 100);
    return {
      target,
      progress: progressValue.toFixed(1),
      remaining: Math.max(0, target - total)
    };
  });

  const statusTone =
    status === 'error' ? '#d64c4c' : status === 'loading' ? '#f6b042' : '#27c281';
  const statusShadow =
    status === 'error'
      ? '0 0 0 4px rgba(214, 76, 76, 0.15)'
      : status === 'loading'
      ? '0 0 0 4px rgba(246, 176, 66, 0.2)'
      : '0 0 0 4px rgba(39, 194, 129, 0.15)';

  return html`
    <div className="page">
      <header className="hero">
        <div className="brand">
          <img
            className="brand-logo"
            src="static/logoRavan.png"
            alt="RavanTech logo"
          />
          <div>
            <h1 className="hero-title">Kotoba PreRegistros</h1>
            <p className="hero-subtitle">
              Dashboard interno para trykotoba.com
            </p>
          </div>
        </div>
        <div className="hero-actions">
          <div className="status-pill">
            <span
              className="status-dot"
              style=${{ background: statusTone, boxShadow: statusShadow }}
            ></span>
            ${status === 'loading'
              ? 'Cargando'
              : status === 'error'
              ? 'Error'
              : 'Listo'}
            ${summary ? ` - ${formatDate(summary.updatedAt)}` : ''}
          </div>
          <button
            className="button"
            onClick=${fetchSummary}
            disabled=${status === 'loading'}
          >
            Refrescar
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="card full milestones-hero">
          <div className="milestones-header">
            <div>
              <p className="milestones-title">Milestones</p>
              <p className="milestones-sub">
                Objetivo global: ${numberFormatter.format(total)} preregistros
              </p>
            </div>
            <div className="milestones-total">
              ${numberFormatter.format(total)}
              <span>Total actual</span>
            </div>
          </div>
          <div className="milestone-grid">
            ${milestones.map((item) => html`
              <div className="milestone-card">
                <div className="milestone-top">
                  <span className="milestone-label">Meta ${item.target}</span>
                  <span className="milestone-percent">${item.progress}%</span>
                </div>
                <div
                  className="progress progress-large"
                  style=${{ '--progress': `${item.progress}%` }}
                >
                  <span></span>
                </div>
                <div className="progress-meta">
                  <span>${numberFormatter.format(total)} / ${item.target}</span>
                  <span>
                    ${item.remaining
                      ? `Faltan ${numberFormatter.format(item.remaining)}`
                      : 'Meta superada'}
                  </span>
                </div>
              </div>
            `)}
          </div>
        </section>

        ${status === 'error'
          ? html`<section className="card full error">${error}</section>`
          : null}

        <section className="card highlight">
          <p className="metric-label">Total preregistros</p>
          <p className="metric-value">${numberFormatter.format(total)}</p>
          <p className="metric-sub">Meta activa: 100 y 1000 preregistros</p>
        </section>

        <section className="card">
          <div className="kpi-row">
            <span className="metric-label">Acepta marketing</span>
          </div>
          <div className="kpi-value">${numberFormatter.format(marketingYes)}</div>
          <p className="kpi-note">
            ${formatPercent(marketingRate)} del total
          </p>
        </section>

        <section className="card">
          <div className="kpi-row">
            <span className="metric-label">Origen por pais</span>
            <span className="kpi-note">
              ${topCountryLabel}
            </span>
          </div>
          <ul className="country-list">
            ${topCountries.length
              ? topCountries.map((entry) => {
                  const fill = `${(entry.count / maxCountryCount) * 100}%`;
                  return html`<li className="country-item">
                    <span className="country-label"
                      >${formatCountryLabel(entry.code)}</span
                    >
                    <div className="country-bar" style=${{ '--fill': fill }}>
                      <span></span>
                    </div>
                    <span>${numberFormatter.format(entry.count)}</span>
                  </li>`;
                })
              : html`<li className="kpi-note">Sin datos aun</li>`}
          </ul>
          ${summary && unknownCount > 0
            ? html`<p className="kpi-note">
                ${unknownCount} preregistros sin pais
              </p>`
            : null}
        </section>

        <section className="card full map-card">
          <div className="kpi-row">
            <p className="map-title">Mapa de preregistros</p>
            <span className="kpi-note">
              ${summary?.countries.length
                ? `${summary.countries.length} paises con data`
                : 'Sin paises con data'}
            </span>
          </div>
          <div id="map"></div>
        </section>
      </main>

      <footer className="footer">
        <span>Fuente: Google Sheets</span>
        <span>RavanTech interno - trykotoba.com</span>
      </footer>
    </div>
  `;
};

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
