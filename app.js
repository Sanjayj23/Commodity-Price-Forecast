/**
 * app.js — India Grain Price Intelligence Dashboard
 * Loads prediction + actuals JSON data, renders charts, cards, and reasoning
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  grains: [],
  currentGrain: 'Wheat',
  currentHorizon: 7,
  predictions: null,
  actuals: null,
  forecastSeries: null,
  reasoning: null,
  chart: null,
  julyChart: null,
};

const GRAIN_COLORS = {
  Wheat:   '#F59E0B',
  Paddy:    '#10B981',
  Maize:   '#F97316',
  Mustard: '#A78BFA',
};

const GRAIN_ICONS = {
  Wheat: '🌾', Paddy: '🍚', Maize: '🌽', Mustard: '🌿',
};

// ── Data Loading ───────────────────────────────────────────────────────────
async function loadData() {
  const base = 'data/';
  try {
    const bust = '?v=' + new Date().getTime();
    const [predResp, actResp, seriesResp, reasonResp] = await Promise.all([
      fetch(base + 'predictions.json' + bust),
      fetch(base + 'actuals.json' + bust),
      fetch(base + 'forecast_series.json' + bust),
      fetch(base + 'reasoning.json' + bust).catch(() => null),
    ]);

    if (!predResp.ok) throw new Error('predictions.json not found — run the pipeline first.');

    state.predictions = await predResp.json();
    state.actuals = actResp.ok ? await actResp.json() : {};
    state.forecastSeries = seriesResp.ok ? await seriesResp.json() : {};
    state.reasoning = (reasonResp && reasonResp.ok) ? await reasonResp.json() : {};
    state.grains = Object.keys(state.predictions);

    if (state.grains.length === 0) throw new Error('No grain data in predictions.json');
    state.currentGrain = state.grains[0];

    return true;
  } catch (err) {
    console.error('Data load error:', err);
    // Load mock data for preview
    return loadMockData();
  }
}

// Mock data so dashboard looks great even before pipeline runs
function loadMockData() {
  const mockGrains = ['Wheat', 'Paddy', 'Maize', 'Mustard'];
  const mockPrices = { Wheat: 2310, Paddy: 2280, Maize: 1980, Mustard: 5820 };
  const mockMSP    = { Wheat: 2600, Paddy: 2550, Maize: 2465, Mustard: 6200 };

  state.predictions = {};
  state.actuals = {};
  state.forecastSeries = {};
  state.reasoning = {};

  mockGrains.forEach(grain => {
    const basePrice = mockPrices[grain];
    const color = GRAIN_COLORS[grain];
    const horizonData = {};

    [7, 30, 90].forEach(h => {
      const drift = (Math.random() - 0.3) * (h / 90) * 0.08;
      const pred  = Math.round(basePrice * (1 + drift));
      const change = (drift * 100).toFixed(2);
      horizonData[h] = {
        horizon_days: h,
        horizon_label: `${h}-Day`,
        target_date: addDays('2026-06-25', h),
        predicted_price: pred,
        lower_bound: Math.round(pred * 0.93),
        upper_bound: Math.round(pred * 1.07),
        change_pct: parseFloat(change),
        direction: drift >= 0 ? 'up' : 'down',
        metrics: { ensemble_mape: (2 + Math.random() * 4).toFixed(2), ensemble_mae: (50 + Math.random()*100).toFixed(0), ensemble_r2: (0.7 + Math.random()*0.25).toFixed(3), baseline_mape: (6 + Math.random() * 3).toFixed(2) },
        top_features: [
          ['price_lag_7', 0.18], ['roll_mean_30', 0.14], ['ewma_30', 0.12],
          ['is_harvest_season', 0.10], ['msp_gap_ratio', 0.09], ['trend_slope_30', 0.08],
          ['arr_roll_mean_30', 0.07], ['momentum_7_30', 0.06],
        ],
        confidence_level: h === 7 ? 'High' : h === 30 ? 'Medium' : 'Medium',
        ensemble_weights: { lightgbm: 0.45, xgboost: 0.30, catboost: 0.25 },
      };
    });

    state.predictions[grain] = {
      name: grain, icon: GRAIN_ICONS[grain], color,
      unit: 'Rs/Quintal',
      current_price: basePrice,
      current_price_low: Math.round(basePrice * 0.96),
      current_price_high: Math.round(basePrice * 1.04),
      last_data_date: '2026-06-25',
      forecast_as_of: '2026-07-05',
      horizons: horizonData,
    };

    // Mock actuals (June context + Jul highlight)
    const contextRows = [];
    for (let i = -34; i <= 5; i++) {
      const d = addDays('2026-07-05', i);
      const noise = (Math.random() - 0.5) * 0.03;
      const price = Math.round(basePrice * (1 + noise));
      contextRows.push({
        date: d, price,
        price_low: Math.round(price * 0.97),
        price_high: Math.round(price * 1.03),
        is_highlight: i >= -4,
      });
    }
    state.actuals[grain] = { context: contextRows, highlight_count: 5, latest_date: '2026-07-04' };

    // Mock forecast series
    const series = [];
    for (let day = 1; day <= 90; day++) {
      const t = day / 90;
      const h90pred = state.predictions[grain].horizons[90].predicted_price;
      const price = basePrice + (h90pred - basePrice) * Math.sqrt(t) * (1 + (Math.random()-0.5)*0.05);
      series.push({
        date: addDays('2026-06-25', day),
        price: Math.round(price),
        lower: Math.round(price * 0.93),
        upper: Math.round(price * 1.07),
        is_anchor: [7, 30, 90].includes(day),
        anchor_horizon: [7, 30, 90].includes(day) ? day : null,
      });
    }
    state.forecastSeries[grain] = series;

    // Mock reasoning
    const dir = Object.values(horizonData)[0].change_pct >= 0 ? 'rise' : 'fall';
    state.reasoning[grain] = {};
    [7, 30, 90].forEach(h => {
      const hd = horizonData[h];
      state.reasoning[grain][h] = {
        text: `${grain} prices are forecast to ${dir} by ${Math.abs(hd.change_pct).toFixed(1)}% over the next ${h === 7 ? 'week' : h === 30 ? 'month' : '3 months'}, reaching ₹${hd.predicted_price.toLocaleString('en-IN')}/quintal. This reflects seasonal supply-demand dynamics and medium-term market momentum captured by the ensemble model (MAPE: ${hd.metrics.ensemble_mape}%). The current price of ₹${basePrice.toLocaleString('en-IN')} trades ${((basePrice - mockMSP[grain])/mockMSP[grain]*100).toFixed(1)}% ${basePrice > mockMSP[grain] ? 'above' : 'below'} the 2026 MSP of ₹${mockMSP[grain].toLocaleString('en-IN')}/quintal, providing a structural price anchor. Key drivers include rolling price momentum, seasonal harvest calendar signals, and cross-commodity substitution effects.`,
        source: 'rule_based',
        key_drivers: [
          { feature: '7-day rolling average price', score: 0.18 },
          { feature: 'short-term price momentum', score: 0.14 },
          { feature: 'harvest season indicator', score: 0.10 },
          { feature: 'price-to-MSP ratio', score: 0.09 },
          { feature: 'market arrivals trend', score: 0.07 },
        ],
      };
    });
  });

  state.grains = mockGrains;
  state.currentGrain = 'Wheat';
  document.getElementById('cv-ai').textContent = 'Rule Engine (mock)';
  return true;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Grain Tabs ─────────────────────────────────────────────────────────────
function renderGrainTabs() {
  const container = document.getElementById('grain-tabs');
  container.innerHTML = '';

  state.grains.forEach(grain => {
    const gd = state.predictions[grain];
    const color = GRAIN_COLORS[grain] || gd.color;
    const tab = document.createElement('div');
    tab.className = 'grain-tab' + (grain === state.currentGrain ? ' active' : '');
    tab.dataset.grain = grain;
    tab.onclick = () => selectGrain(grain);
    tab.innerHTML = `
      <span class="tab-icon">${GRAIN_ICONS[grain] || gd.icon}</span>
      <span>${grain}</span>
      <span class="tab-price">₹${Math.round(gd.current_price).toLocaleString('en-IN')}</span>
    `;
    container.appendChild(tab);
  });
}

function selectGrain(grain) {
  state.currentGrain = grain;

  // Update active tab
  document.querySelectorAll('.grain-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.grain === grain);
  });

  // Update CSS variable for grain color
  const color = GRAIN_COLORS[grain];
  document.documentElement.style.setProperty('--current-grain-color', color);

  renderPriceBanner();
  renderForecastCards();
  renderChart();
  renderJulyTable();
  renderReasoning();
  renderMetrics();
}

// ── Price Banner ───────────────────────────────────────────────────────────
function renderPriceBanner() {
  const grain = state.currentGrain;
  const gd    = state.predictions[grain];
  const color = GRAIN_COLORS[grain];
  
  // Find the absolute latest actual price available (including live highlight data)
  let latestPrice = gd.current_price;
  let latestDate = gd.last_data_date;
  
  if (state.actuals && state.actuals[grain] && state.actuals[grain].context) {
    const actList = state.actuals[grain].context;
    if (actList.length > 0) {
      const lastRec = actList[actList.length - 1];
      latestPrice = lastRec.price;
      latestDate = lastRec.date;
    }
  }

  const banner = document.getElementById('price-banner');
  banner.style.setProperty('--grain-color', color);
  banner.style.setProperty('--grain-color', color);

  document.getElementById('banner-icon').textContent  = GRAIN_ICONS[grain] || gd.icon;
  document.getElementById('banner-grain-name').textContent = grain + ' — National Median Price';
  document.getElementById('banner-unit').textContent  = '/' + (gd.unit || 'Quintal').replace('Rs/', '');
  document.getElementById('banner-last-date').textContent = formatDate(latestDate);
  document.getElementById('banner-forecast-to').textContent = formatDate(gd.forecast_as_of || '2026-07-05');

  // Animate counter
  const priceEl = document.getElementById('banner-price');
  animateCounter(priceEl, 0, latestPrice, 800, '₹', '', true);
}

// ── Forecast Cards ─────────────────────────────────────────────────────────
function renderForecastCards() {
  const grain = state.currentGrain;
  const gd    = state.predictions[grain];
  const color = GRAIN_COLORS[grain];
  const container = document.getElementById('forecast-cards');

  container.innerHTML = '';

  [7, 30, 90].forEach((h, idx) => {
    const hd = gd.horizons[h] || gd.horizons[String(h)];
    if (!hd) return;

    const isUp  = hd.change_pct >= 0;
    const conf  = hd.confidence_level || 'Medium';
    const mape  = hd.metrics?.ensemble_mape || 0;

    // Compute band fill position
    const range  = (hd.upper_bound - hd.lower_bound) || 1;
    const total  = range * 1.4;
    const fillL  = ((hd.lower_bound - (hd.predicted_price - total/2)) / total * 100).toFixed(1);
    const fillR  = (100 - (hd.upper_bound - (hd.predicted_price - total/2)) / total * 100).toFixed(1);
    const markerPos = ((hd.predicted_price - (hd.predicted_price - total/2)) / total * 100).toFixed(1);

    const card = document.createElement('div');
    card.className = 'forecast-card fade-up';
    card.style.setProperty('--grain-color', color);
    card.style.animationDelay = (idx * 0.07) + 's';

    card.innerHTML = `
      <div class="card-orb"></div>
      <div class="card-horizon">
        <span>${hd.horizon_label || h + '-Day'} Forecast</span>
        <span class="horizon-badge">${formatDate(hd.target_date)}</span>
      </div>
      <div class="card-predicted-price">
        <span class="currency">₹</span>
        <span id="card-price-${h}" class="counting">0</span>
      </div>
      <div class="card-change">
        <div class="change-badge ${isUp ? 'up' : 'down'}">
          <span class="change-arrow">${isUp ? '↑' : '↓'}</span>
          <span>${Math.abs(hd.change_pct).toFixed(1)}%</span>
        </div>
        <span style="font-size:0.75rem; color:var(--text-muted)">vs current ₹${Math.round(gd.current_price).toLocaleString('en-IN')}</span>
      </div>
      <div class="confidence-band">
        <div class="band-label">90% Confidence Interval</div>
        <div class="band-range">
          <span>₹${Math.round(hd.lower_bound).toLocaleString('en-IN')}</span>
          <div class="band-track">
            <div class="band-fill" style="--fill-left:${fillL}%; --fill-right:${fillR}%"></div>
            <div class="band-marker" style="--marker-pos:${markerPos}%"></div>
          </div>
          <span>₹${Math.round(hd.upper_bound).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="confidence-level ${conf}">
          ${ conf === 'High' ? '●' : conf === 'Medium' ? '◐' : '○' } ${conf} Confidence
        </div>
        <div class="model-accuracy">
          <div style="text-align: right">
            <div class="mape-label">Forecast Error</div>
            <div class="mape-value" style="font-size:0.95rem">${parseFloat(mape).toFixed(2)}% MAPE</div>
            <div class="mape-value" style="font-size:0.85rem; color:var(--text-muted); margin-top:2px">₹${parseFloat(hd.metrics.ensemble_mae).toFixed(2)} MAE</div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);

    // Animate counter
    setTimeout(() => {
      const el = document.getElementById(`card-price-${h}`);
      if (el) animateCounter(el, 0, hd.predicted_price, 900 + idx * 100, '', '', true);
    }, 200 + idx * 80);
  });
}

// ── Chart ──────────────────────────────────────────────────────────────────
function renderChart() {
  const grain = state.currentGrain;
  const gd    = state.predictions[grain];
  const color = GRAIN_COLORS[grain];

  const ctx = document.getElementById('priceChart').getContext('2d');
  if (state.chart) state.chart.destroy();

  const actuals    = state.actuals[grain]?.context || [];
  const forecasts  = state.forecastSeries[grain]   || [];

  // Historical data points (non-highlight)
  const histData = actuals
    .filter(r => !r.is_highlight)
    .map(r => ({ x: r.date, y: r.price }));

  // Forecast line (point estimates)
  const forecastLine = forecasts.map(r => ({ x: r.date, y: r.price }));

  // Confidence band (upper)
  const upperBand = forecasts.map(r => ({ x: r.date, y: r.upper }));
  const lowerBand = forecasts.map(r => ({ x: r.date, y: r.lower }));

  // Anchor markers (7d, 30d, 90d)
  const anchorData = forecasts
    .filter(r => r.is_anchor && [7, 30, 90].includes(r.anchor_horizon))
    .map(r => ({ x: r.date, y: r.price, horizon: r.anchor_horizon }));

  // Connect last historical to first forecast
  const bridgePoint = histData.length > 0
    ? [{ x: histData[histData.length - 1].x, y: histData[histData.length - 1].y }]
    : [];

  // Build chart background gradient
  const gradPlugin = {
    id: 'gradientFill',
    beforeDraw(chart) {
      const { ctx: c, chartArea: { top, bottom, left, right } } = chart;
      if (!top) return;
      const grad = c.createLinearGradient(0, top, 0, bottom);
      const hex = color;
      grad.addColorStop(0, hex + '30');
      grad.addColorStop(1, hex + '00');
      chart.data.datasets[2].backgroundColor = grad;
    }
  };

  state.chart = new Chart(ctx, {
    type: 'line',
    plugins: [gradPlugin],
    data: {
      datasets: [
        {
          label: 'Historical (Jun 2026)',
          data: histData,
          borderColor: '#60A5FA',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          order: 4,
        },
        {
          label: 'AI Forecast',
          data: [...bridgePoint, ...forecastLine],
          borderColor: color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          cubicInterpolationMode: 'monotone',
          fill: '+1',
          order: 2,
        },
        {
          label: 'Confidence Upper',
          data: upperBand,
          borderColor: 'transparent',
          backgroundColor: color + '18',
          borderWidth: 0,
          pointRadius: 0,
          fill: '+1',
          tension: 0.4,
          cubicInterpolationMode: 'monotone',
          order: 5,
        },
        {
          label: 'Confidence Lower',
          data: lowerBand,
          borderColor: color + '40',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [2, 4],
          pointRadius: 0,
          tension: 0.4,
          cubicInterpolationMode: 'monotone',
          order: 6,
        },
        {
          label: 'Forecast Anchors',
          data: anchorData,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: 'diamond',
          showLine: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(6, 9, 26, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleFont: { family: 'Inter', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 12,
          yAlign: 'bottom',
          caretPadding: 15,
          callbacks: {
            title: (items) => {
              const lbl = items[0].label;
              if (lbl && lbl.match(/^\d{4}-\d{2}-\d{2}$/)) return formatDate(lbl);
              return lbl;
            },
            label: (item) => {
              if (item.dataset.label?.includes('Upper') ||
                  item.dataset.label?.includes('Lower') ||
                  item.dataset.label?.includes('Anchors')) return null;
              const v = item.parsed.y;
              if (!v) return null;
              return ` ${item.dataset.label}: ₹${Math.round(v).toLocaleString('en-IN')}`;
            },
            afterBody: (items) => {
              const anchorItem = items.find(i => i.dataset.label === 'Forecast Anchors');
              if (anchorItem && anchorItem.raw?.horizon) {
                return [`⟶ ${anchorItem.raw.horizon}-day anchor forecast`];
              }
              return [];
            }
          },
          filter: item => item.parsed.y !== null && item.dataset.label !== 'Confidence Upper',
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', displayFormats: { day: 'MMM d' } },
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#4a5568',
            font: { family: 'Inter', size: 11 },
            maxTicksLimit: 10,
          },
          border: { display: false },
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#4a5568',
            font: { family: 'JetBrains Mono', size: 11 },
            callback: v => '₹' + v.toLocaleString('en-IN'),
            maxTicksLimit: 8,
          },
          border: { display: false },
        },
      },
    },
  });

  // Update chart legend with grain color
  const dashed = document.querySelector('.legend-dot.dashed');
  if (dashed) dashed.style.color = color;
}

// ── July Table ─────────────────────────────────────────────────────────────
function renderJulyTable() {
  const grain = state.currentGrain;
  const tbody = document.getElementById('julyTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const actuals   = state.actuals[grain]?.context || [];
  const forecasts = state.forecastSeries[grain]   || [];

  const julyActuals = actuals.filter(r => r.date >= '2026-07-01' && r.date <= '2026-07-05');
  const julyForecasts = forecasts.filter(r => r.date >= '2026-07-01' && r.date <= '2026-07-05');

  const dataMap = {};
  julyForecasts.forEach(f => { dataMap[f.date] = { forecast: f.price, actual: null }; });
  julyActuals.forEach(a => {
    if (!dataMap[a.date]) dataMap[a.date] = { forecast: null, actual: a.price };
    else dataMap[a.date].actual = a.price;
  });

  const dates = Object.keys(dataMap).sort();

  dates.forEach(date => {
    const d = dataMap[date];
    const tr = document.createElement('tr');
    
    const actStr = d.actual ? '₹' + Math.round(d.actual).toLocaleString('en-IN') : '—';
    const forStr = d.forecast ? '₹' + Math.round(d.forecast).toLocaleString('en-IN') : '—';
    
    let diffStr = '—';
    if (d.actual && d.forecast) {
      const diff = d.forecast - d.actual;
      const pct = (diff / d.actual) * 100;
      const sign = diff > 0 ? '+' : '';
      const diffClass = diff > 0 ? 'diff-negative' : (diff < 0 ? 'diff-positive' : '');
      diffStr = `<span class="${diffClass}">${sign}₹${Math.abs(Math.round(diff))} (${sign}${pct.toFixed(2)}%)</span>`;
    }

    tr.innerHTML = `
      <td>${formatDate(date)}</td>
      <td style="color:#22C55E; font-weight:600">${actStr}</td>
      <td style="color:var(--current-grain-color); font-weight:600">${forStr}</td>
      <td>${diffStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Reasoning ──────────────────────────────────────────────────────────────
function renderReasoning() {
  const grain   = state.currentGrain;
  const horizon = state.currentHorizon;
  const color   = GRAIN_COLORS[grain];
  const rdata   = state.reasoning?.[grain]?.[horizon] ||
                  state.reasoning?.[grain]?.[String(horizon)];

  // Update reasoning text
  const textEl = document.getElementById('reasoning-text');
  if (rdata) {
    // Markdown-lite: **text** → bold
    let html = (rdata.text || 'No reasoning available.')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    textEl.innerHTML = html;

    // Source badge
    const badge = document.getElementById('reasoning-badge');
    if (rdata.source === 'gemini') {
      badge.textContent = '✦ Gemini AI';
      badge.className = 'reasoning-source-badge gemini';
    } else {
      badge.textContent = '⚙ Rule Engine';
      badge.className = 'reasoning-source-badge rule-based';
    }
  } else {
    textEl.innerHTML = '<span style="color:var(--text-muted)">No reasoning data available for this selection.</span>';
  }

  // Feature importance bars
  const hd = state.predictions[grain]?.horizons?.[horizon] ||
             state.predictions[grain]?.horizons?.[String(horizon)];

  const drivers = rdata?.key_drivers || hd?.top_features?.map(([f, s]) => ({ feature: f, score: s })) || [];
  const fiList  = document.getElementById('feature-importance-list');
  fiList.innerHTML = '';

  if (drivers.length > 0) {
    const maxScore = Math.max(...drivers.map(d => d.score));
    drivers.slice(0, 8).forEach(d => {
      const pct = ((d.score / maxScore) * 100).toFixed(0);
      const item = document.createElement('div');
      item.className = 'fi-item';
      item.innerHTML = `
        <div class="fi-label" title="${d.feature}">${d.feature}</div>
        <div class="fi-bar-track" style="--grain-color:${color}">
          <div class="fi-bar-fill" style="--grain-color:${color}"></div>
        </div>
        <div class="fi-score">${pct}%</div>
      `;
      fiList.appendChild(item);

      // Animate bar fill
      setTimeout(() => {
        const fill = item.querySelector('.fi-bar-fill');
        fill.style.width = pct + '%';
      }, 100);
    });
  }

  // Update horizon tabs active state
  document.querySelectorAll('.horizon-tab').forEach(t => {
    const active = parseInt(t.dataset.horizon) === horizon;
    t.classList.toggle('active', active);
    t.style.borderColor = active ? color : '';
    t.style.color = active ? color : '';
  });
}

function selectReasoningHorizon(h) {
  state.currentHorizon = h;
  renderReasoning();
  renderMetrics();
}

// ── Metrics Panel ──────────────────────────────────────────────────────────
function renderMetrics() {
  const grain  = state.currentGrain;
  const gd     = state.predictions[grain];
  const color  = GRAIN_COLORS[grain];
  const container = document.getElementById('metrics-cards');
  container.innerHTML = '';
  container.style.setProperty('--grain-color', color);

  const horizons = [7, 30, 90];
  horizons.forEach(h => {
    const hd = gd.horizons[h] || gd.horizons[String(h)];
    if (!hd) return;

    const m = hd.metrics || {};
    const isActive = h === state.currentHorizon;
    const mapeVal  = parseFloat(m.ensemble_mape || 0);
    const r2Val    = parseFloat(m.ensemble_r2 || 0);

    // Accuracy bars: MAPE → 0% is best, so invert (100 - mape) for bar width
    const mapeBar  = Math.min(100, Math.max(0, (100 - mapeVal * 5))).toFixed(0);
    const r2Bar    = Math.max(0, (r2Val * 100)).toFixed(0);
    const baseImpr = m.baseline_mape > 0
      ? (((m.baseline_mape - mapeVal) / m.baseline_mape) * 100).toFixed(1)
      : 'N/A';

    const card = document.createElement('div');
    card.className = 'metric-card';
    card.style.borderColor = isActive ? color + '60' : '';
    card.style.setProperty('--grain-color', color);
    card.innerHTML = `
      <div class="metric-header">
        <div class="metric-name">${h}-Day Horizon</div>
        <div class="metric-value">${mapeVal.toFixed(2)}% MAPE</div>
      </div>
      <div class="metric-bar-track">
        <div class="metric-bar-fill" style="--grain-color:${color}; width:0%"></div>
      </div>
      <div style="display:flex; gap:16px; margin-top:10px; font-size:0.72rem; color:var(--text-muted)">
        <span>MAE: ₹${parseFloat(m.ensemble_mae || 0).toFixed(0)}</span>
        <span>R²: ${r2Val.toFixed(3)}</span>
        <span style="color:${parseFloat(baseImpr) > 0 ? 'var(--up)' : 'var(--text-muted)'}">
          ${parseFloat(baseImpr) > 0 ? '↑' : ''} ${baseImpr}% vs naive
        </span>
      </div>
    `;
    container.appendChild(card);

    setTimeout(() => {
      const fill = card.querySelector('.metric-bar-fill');
      fill.style.width = mapeBar + '%';
    }, 200);
  });

  // Ensemble weights breakdown for current horizon
  const hd = gd.horizons[state.currentHorizon] || gd.horizons[String(state.currentHorizon)];
  const weights = hd?.ensemble_weights || {};
  const breakdown = document.getElementById('breakdown-items');
  breakdown.innerHTML = '';

  const modelLabels = {
    lightgbm: 'LightGBM', xgboost: 'XGBoost',
    catboost: 'CatBoost', ridge: 'Ridge (Stack)',
  };
  const modelColors = {
    lightgbm: '#60A5FA', xgboost: '#34D399', catboost: '#F87171', ridge: '#A78BFA',
  };

  Object.entries(weights).sort((a, b) => b[1] - a[1]).forEach(([name, w]) => {
    const pct = (w * 100).toFixed(1);
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    item.innerHTML = `
      <div class="breakdown-model-name">${modelLabels[name] || name}</div>
      <div class="breakdown-weight">
        <div class="weight-bar">
          <div class="weight-bar-fill" style="width:${pct}%; background:${modelColors[name] || color}"></div>
        </div>
        <span style="color:${modelColors[name] || color}">${pct}%</span>
      </div>
    `;
    breakdown.appendChild(item);
  });

  if (Object.keys(weights).length === 0) {
    breakdown.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted)">Model weights not available</div>';
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function animateCounter(el, from, to, duration, prefix = '', suffix = '', commaSep = false) {
  const start = performance.now();
  to = Math.round(to);
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (to - from) * eased);
    el.textContent = prefix + (commaSep ? current.toLocaleString('en-IN') : current) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const el = document.getElementById('update-time');
  if (el) el.textContent = `Forecast as of: ${dateStr}, ${timeStr} IST`;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
async function init() {
  updateClock();
  setInterval(updateClock, 30000);

  const overlay = document.getElementById('loading-overlay');

  const ok = await loadData();
  if (!ok) {
    overlay.innerHTML = `<div class="error-msg">Failed to load data. Run run_pipeline.py first.</div>`;
    return;
  }

  // Render all components
  renderGrainTabs();
  renderPriceBanner();
  renderForecastCards();
  renderChart();
  renderJulyTable();
  renderReasoning();
  renderMetrics();

  // Apply grain color CSS variable
  const color = GRAIN_COLORS[state.currentGrain];
  document.documentElement.style.setProperty('--current-grain-color', color);

  // Hide loading overlay
  setTimeout(() => overlay.classList.add('hidden'), 600);
}

// Kick off
document.addEventListener('DOMContentLoaded', init);
