/**
 * render-visual-png.js — Generates PNG images for non-photo visual_types
 * (chart, text_card, list, split) using Playwright screenshots of HTML.
 *
 * Each function returns the absolute path of the generated PNG.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ─── Shared browser instance ────────────────────────────────────────────────

let _browser = null;

async function getBrowser() {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser && _browser.isConnected()) {
    await _browser.close();
    _browser = null;
  }
}

// ─── Core: HTML → PNG via Playwright ────────────────────────────────────────

async function htmlToPNG(html, width, height, outputPath) {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    // Small delay for Chart.js animations to settle
    await page.waitForTimeout(300);
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await page.close();
  }
  return outputPath;
}

// ─── Shared CSS base ────────────────────────────────────────────────────────

function baseCSS(bgColor = '#0D0D0D') {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;900&family=Lora:wght@400;700&family=DM+Serif+Display&family=Oswald:wght@700;900&family=Space+Grotesk:wght@400;700&display=swap');
    body {
      width: 100%; height: 100%;
      background: ${bgColor};
      font-family: 'Montserrat', sans-serif;
      color: #FFFFFF;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
  `;
}

// ─── 1. Chart PNG ───────────────────────────────────────────────────────────

/**
 * Render a chart (bar, line, pie, area) to PNG.
 *
 * @param {object} opts
 * @param {string} opts.chart_type - 'bar' | 'line' | 'pie' | 'area' | 'donut'
 * @param {string} opts.chart_title - Chart title
 * @param {Array}  opts.chart_data - Array of { label, value, color? }
 * @param {object} opts.colors - { primary, secondary, accent, bg, text }
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.outputPath
 */
async function renderChartPNG(opts) {
  const {
    chart_type = 'bar',
    chart_title = '',
    chart_data = [],
    colors = {},
    width = 1080,
    height = 1920,
    outputPath,
  } = opts;

  const bg = colors.bg || '#0D0D0D';
  const primary = colors.primary || '#0099FF';
  const accent = colors.accent || '#FFD700';
  const textColor = colors.text || '#FFFFFF';
  const gridColor = colors.grid || 'rgba(255,255,255,0.1)';

  const defaultPalette = [primary, '#00FF88', accent, '#FF6B6B', '#A78BFA', '#F472B6', '#34D399', '#FBBF24'];
  const dataWithColors = chart_data.map((d, i) => ({
    ...d,
    color: d.color || defaultPalette[i % defaultPalette.length],
  }));

  const labels = JSON.stringify(dataWithColors.map(d => d.label));
  const values = JSON.stringify(dataWithColors.map(d => d.value));
  const bgColors = JSON.stringify(dataWithColors.map(d => d.color));

  const isPie = chart_type === 'pie' || chart_type === 'donut';
  const chartJsType = isPie ? 'doughnut' : (chart_type === 'area' ? 'line' : chart_type);

  const fillOption = chart_type === 'area' ? 'fill: true,' : '';
  const cutout = chart_type === 'donut' ? "cutout: '55%'," : (chart_type === 'pie' ? "cutout: '0%'," : '');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  ${baseCSS(bg)}
  .title {
    font-family: 'DM Serif Display', serif;
    font-size: ${Math.round(height * 0.04)}px;
    font-weight: 700;
    color: ${textColor};
    text-align: center;
    margin-top: ${Math.round(height * 0.08)}px;
    margin-bottom: ${Math.round(height * 0.03)}px;
    padding: 0 ${Math.round(width * 0.08)}px;
    line-height: 1.2;
  }
  .chart-container {
    width: ${Math.round(width * 0.85)}px;
    height: ${Math.round(height * 0.55)}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  canvas { max-width: 100%; max-height: 100%; }
  .highlight {
    font-family: 'Oswald', sans-serif;
    font-size: ${Math.round(height * 0.06)}px;
    font-weight: 900;
    color: ${accent};
    text-align: center;
    margin-top: ${Math.round(height * 0.03)}px;
  }
</style>
</head><body>
  <div class="title">${escapeHtml(chart_title)}</div>
  <div class="chart-container"><canvas id="chart"></canvas></div>
  ${chart_data.find(d => d.highlight) ? `<div class="highlight">${escapeHtml(chart_data.find(d => d.highlight)?.highlight || '')}</div>` : ''}
<script>
  Chart.defaults.color = '${textColor}';
  Chart.defaults.font.family = 'Montserrat';
  Chart.defaults.font.weight = 700;
  Chart.defaults.font.size = ${Math.round(height * 0.018)};
  new Chart(document.getElementById('chart'), {
    type: '${chartJsType}',
    data: {
      labels: ${labels},
      datasets: [{
        data: ${values},
        backgroundColor: ${bgColors},
        borderColor: ${isPie ? bgColors : JSON.stringify([primary])},
        borderWidth: ${isPie ? 2 : 3},
        borderRadius: ${isPie ? 0 : 8},
        ${fillOption}
        tension: 0.3,
        pointRadius: ${chart_type === 'line' ? 6 : 0},
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      ${cutout}
      plugins: {
        legend: { display: ${isPie}, position: 'bottom', labels: { padding: 20, font: { size: ${Math.round(height * 0.02)} } } },
        tooltip: { enabled: false },
      },
      scales: ${isPie ? '{}' : `{
        x: { grid: { color: '${gridColor}' }, ticks: { font: { size: ${Math.round(height * 0.016)} } } },
        y: { grid: { color: '${gridColor}' }, beginAtZero: true, ticks: { font: { size: ${Math.round(height * 0.016)} } } }
      }`}
    }
  });
</script>
</body></html>`;

  return htmlToPNG(html, width, height, outputPath);
}

// ─── 2. Text Card PNG ───────────────────────────────────────────────────────

/**
 * Render a text card (headline + body text on styled background) to PNG.
 *
 * @param {object} opts
 * @param {string} opts.card_title - Main headline
 * @param {string} opts.card_body - Body text or subtitle
 * @param {string} opts.card_bg - Background color or gradient
 * @param {string} opts.card_text_color - Text color
 * @param {string} opts.card_accent - Accent color for decorative elements
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.outputPath
 */
async function renderTextCardPNG(opts) {
  const {
    card_title = '',
    card_body = '',
    card_bg = '#0D0D0D',
    card_text_color = '#FFFFFF',
    card_accent = '#0099FF',
    width = 1080,
    height = 1920,
    outputPath,
  } = opts;

  const bgStyle = card_bg.includes('gradient') ? `background: ${card_bg};` : `background: ${card_bg};`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  ${baseCSS(card_bg)}
  body { ${bgStyle} }
  .card {
    width: ${Math.round(width * 0.82)}px;
    padding: ${Math.round(height * 0.06)}px ${Math.round(width * 0.06)}px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: ${Math.round(height * 0.03)}px;
  }
  .accent-bar {
    width: ${Math.round(width * 0.12)}px;
    height: 6px;
    background: ${card_accent};
    border-radius: 3px;
    margin-bottom: ${Math.round(height * 0.01)}px;
  }
  .title {
    font-family: 'DM Serif Display', serif;
    font-size: ${Math.round(height * 0.05)}px;
    font-weight: 700;
    color: ${card_text_color};
    line-height: 1.15;
  }
  .body {
    font-family: 'Lora', serif;
    font-size: ${Math.round(height * 0.028)}px;
    font-weight: 400;
    color: ${card_text_color};
    opacity: 0.85;
    line-height: 1.5;
  }
  .quote-mark {
    font-family: 'DM Serif Display', serif;
    font-size: ${Math.round(height * 0.1)}px;
    color: ${card_accent};
    opacity: 0.3;
    line-height: 0.8;
  }
</style>
</head><body>
  <div class="card">
    <div class="accent-bar"></div>
    ${card_title ? `<div class="title">${escapeHtml(card_title)}</div>` : ''}
    ${card_body ? `<div class="body">${escapeHtml(card_body)}</div>` : ''}
  </div>
</body></html>`;

  return htmlToPNG(html, width, height, outputPath);
}

// ─── 3. List PNG ────────────────────────────────────────────────────────────

/**
 * Render a list (numbered or bulleted items) to PNG.
 *
 * @param {object} opts
 * @param {string} opts.list_title - Section title
 * @param {Array}  opts.list_items - Array of { text, icon? } or strings
 * @param {boolean} opts.numbered - Use numbers instead of bullets
 * @param {object} opts.colors - { bg, text, accent, bullet }
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.outputPath
 */
async function renderListPNG(opts) {
  const {
    list_title = '',
    list_items = [],
    numbered = false,
    colors = {},
    width = 1080,
    height = 1920,
    outputPath,
  } = opts;

  const bg = colors.bg || '#0D0D0D';
  const textColor = colors.text || '#FFFFFF';
  const accent = colors.accent || '#0099FF';
  const bulletColor = colors.bullet || accent;

  const items = list_items.map((item, i) => {
    const text = typeof item === 'string' ? item : item.text;
    const marker = numbered
      ? `<span class="number">${i + 1}</span>`
      : `<span class="bullet"></span>`;
    return `<div class="item">${marker}<span class="text">${escapeHtml(text)}</span></div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  ${baseCSS(bg)}
  .container {
    width: ${Math.round(width * 0.82)}px;
    padding: ${Math.round(height * 0.06)}px 0;
    display: flex;
    flex-direction: column;
    gap: ${Math.round(height * 0.025)}px;
  }
  .title {
    font-family: 'DM Serif Display', serif;
    font-size: ${Math.round(height * 0.04)}px;
    font-weight: 700;
    color: ${textColor};
    margin-bottom: ${Math.round(height * 0.02)}px;
    line-height: 1.2;
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: ${Math.round(width * 0.04)}px;
    padding: ${Math.round(height * 0.012)}px 0;
  }
  .bullet {
    flex-shrink: 0;
    width: ${Math.round(width * 0.025)}px;
    height: ${Math.round(width * 0.025)}px;
    border-radius: 50%;
    background: ${bulletColor};
    margin-top: ${Math.round(height * 0.008)}px;
  }
  .number {
    flex-shrink: 0;
    font-family: 'Oswald', sans-serif;
    font-size: ${Math.round(height * 0.035)}px;
    font-weight: 900;
    color: ${bulletColor};
    min-width: ${Math.round(width * 0.08)}px;
    line-height: 1;
  }
  .text {
    font-family: 'Montserrat', sans-serif;
    font-size: ${Math.round(height * 0.026)}px;
    font-weight: 500;
    color: ${textColor};
    line-height: 1.4;
  }
</style>
</head><body>
  <div class="container">
    ${list_title ? `<div class="title">${escapeHtml(list_title)}</div>` : ''}
    ${items}
  </div>
</body></html>`;

  return htmlToPNG(html, width, height, outputPath);
}

// ─── 4. Split PNG ───────────────────────────────────────────────────────────

/**
 * Render a split comparison (two images side by side with labels) to PNG.
 *
 * @param {object} opts
 * @param {string} opts.split_left - Path to left image
 * @param {string} opts.split_right - Path to right image
 * @param {string} opts.label_left - Label for left side
 * @param {string} opts.label_right - Label for right side
 * @param {object} opts.colors - { bg, text, accent, divider }
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.outputPath
 */
async function renderSplitPNG(opts) {
  const {
    split_left = '',
    split_right = '',
    label_left = 'ANTES',
    label_right = 'DEPOIS',
    colors = {},
    width = 1080,
    height = 1920,
    outputPath,
  } = opts;

  const bg = colors.bg || '#0D0D0D';
  const textColor = colors.text || '#FFFFFF';
  const accent = colors.accent || '#0099FF';
  const divider = colors.divider || accent;

  // Convert image paths to data URIs if they exist
  const leftData = split_left && fs.existsSync(split_left)
    ? `data:image/jpeg;base64,${fs.readFileSync(split_left).toString('base64')}`
    : '';
  const rightData = split_right && fs.existsSync(split_right)
    ? `data:image/jpeg;base64,${fs.readFileSync(split_right).toString('base64')}`
    : '';

  const leftContent = leftData
    ? `<img src="${leftData}" class="img" />`
    : `<div class="placeholder">${escapeHtml(label_left)}</div>`;
  const rightContent = rightData
    ? `<img src="${rightData}" class="img" />`
    : `<div class="placeholder">${escapeHtml(label_right)}</div>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  ${baseCSS(bg)}
  .split {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .panels {
    flex: 1;
    display: flex;
    gap: 4px;
  }
  .panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }
  .panel .img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .placeholder {
    font-family: 'Montserrat', sans-serif;
    font-size: ${Math.round(height * 0.03)}px;
    font-weight: 700;
    color: ${textColor};
    opacity: 0.3;
  }
  .divider {
    width: 4px;
    background: ${divider};
  }
  .labels {
    display: flex;
    height: ${Math.round(height * 0.08)}px;
    align-items: center;
  }
  .label {
    flex: 1;
    text-align: center;
    font-family: 'Oswald', sans-serif;
    font-size: ${Math.round(height * 0.025)}px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  .label-left { color: ${textColor}; opacity: 0.6; }
  .label-right { color: ${accent}; }
</style>
</head><body>
  <div class="split">
    <div class="panels">
      <div class="panel">${leftContent}</div>
      <div class="divider"></div>
      <div class="panel">${rightContent}</div>
    </div>
    <div class="labels">
      <div class="label label-left">${escapeHtml(label_left)}</div>
      <div class="label label-right">${escapeHtml(label_right)}</div>
    </div>
  </div>
</body></html>`;

  return htmlToPNG(html, width, height, outputPath);
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Render a scene's visual_type to PNG.
 * Returns the path to the generated PNG, or null if visual_type is 'photo'.
 */
async function renderSceneVisual(scene, vidW, vidH, tmpDir, sceneIndex) {
  const vt = scene.visual_type || 'photo';
  if (vt === 'photo') return null;

  const outputPath = path.join(tmpDir, `visual_${String(sceneIndex).padStart(2, '0')}.png`);
  const colors = scene.visual_colors || {};

  switch (vt) {
    case 'chart':
      return renderChartPNG({
        chart_type: scene.chart_type || 'bar',
        chart_title: scene.chart_title || '',
        chart_data: scene.chart_data || [],
        colors,
        width: vidW,
        height: vidH,
        outputPath,
      });

    case 'text_card':
      return renderTextCardPNG({
        card_title: scene.card_title || '',
        card_body: scene.card_body || '',
        card_bg: scene.card_bg || colors.bg || '#0D0D0D',
        card_text_color: scene.card_text_color || colors.text || '#FFFFFF',
        card_accent: scene.card_accent || colors.accent || '#0099FF',
        width: vidW,
        height: vidH,
        outputPath,
      });

    case 'list':
      return renderListPNG({
        list_title: scene.list_title || '',
        list_items: scene.list_items || [],
        numbered: scene.list_numbered || false,
        colors,
        width: vidW,
        height: vidH,
        outputPath,
      });

    case 'split':
      return renderSplitPNG({
        split_left: scene.split_left || '',
        split_right: scene.split_right || '',
        label_left: scene.split_label_left || 'ANTES',
        label_right: scene.split_label_right || 'DEPOIS',
        colors,
        width: vidW,
        height: vidH,
        outputPath,
      });

    default:
      return null;
  }
}

// ─── Util ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  renderChartPNG,
  renderTextCardPNG,
  renderListPNG,
  renderSplitPNG,
  renderSceneVisual,
  closeBrowser,
};
