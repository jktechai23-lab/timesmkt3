/**
 * render-slide-png.js — Renders Video Pro scenes as designed slides (like carousel).
 *
 * Each scene becomes a professional slide with:
 * - Background image + dark overlay
 * - Keyword at top (large, bold, accent color)
 * - Content in center (chart, list, text card, or empty for photo)
 * - Uses preset colors/fonts from style-dictionary
 *
 * Replaces render-visual-png.js for the simples mode.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

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

async function htmlToPNG(html, width, height, outputPath) {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await page.close();
  }
  return outputPath;
}

// ─── Default preset (inema_hightech) ─────────────────────────────────────

const DEFAULT_PRESET = {
  primary: '#0099FF',
  secondary: '#00FF88',
  accent: '#FFD700',
  bg: '#080C14',
  text: '#FFFFFF',
  fontHeadline: 'Space Grotesk',
  fontBody: 'Inter',
  fontSerif: 'DM Serif Display',
  fontAccent: 'Oswald',
};

function resolvePreset(presetName, styleDictPath) {
  const preset = { ...DEFAULT_PRESET };
  try {
    if (styleDictPath && fs.existsSync(styleDictPath)) {
      const dict = JSON.parse(fs.readFileSync(styleDictPath, 'utf-8'));
      const style = dict.styles?.[presetName];
      if (style?.palette) {
        Object.assign(preset, style.palette);
      }
    }
  } catch {}
  return preset;
}

// ─── Escape HTML ─────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Build background layer ─────────────────────────────────────────────

function bgLayer(bgImage, preset) {
  if (bgImage && fs.existsSync(bgImage)) {
    const data = `data:image/jpeg;base64,${fs.readFileSync(bgImage).toString('base64')}`;
    return `
      <img src="${data}" style="
        position:absolute; top:0; left:0; width:100%; height:100%;
        object-fit:cover; object-position:center;
        filter: brightness(0.55) contrast(1.15) saturate(1.1);
      " />
      <div style="
        position:absolute; top:0; left:0; width:100%; height:100%;
        background: linear-gradient(180deg,
          rgba(0,0,0,0.7) 0%,
          rgba(0,0,0,0.3) 30%,
          rgba(0,0,0,0.2) 60%,
          rgba(0,0,0,0.75) 100%
        );
      "></div>
    `;
  }
  return `<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:${preset.bg};"></div>`;
}

// ─── Keyword bar (top) ──────────────────────────────────────────────────

function keywordHTML(keyword, preset, h) {
  if (!keyword) return '';
  return `
    <div style="
      position:absolute; top:${Math.round(h * 0.06)}px; left:${Math.round(h * 0.04)}px; right:${Math.round(h * 0.04)}px;
      z-index:10;
    ">
      <div style="
        display:inline-block;
        font-family:'${preset.fontAccent}',sans-serif;
        font-size:${Math.round(h * 0.055)}px;
        font-weight:900;
        text-transform:uppercase;
        letter-spacing:0.05em;
        color:${preset.secondary};
        text-shadow: 0 4px 32px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.4);
        line-height:1.1;
      ">${esc(keyword)}</div>
    </div>
  `;
}

// ─── Content builders per visual_type ───────────────────────────────────

function contentPhoto(scene, preset, w, h) {
  // Photo: just keyword + bg image, no content box
  return '';
}

function contentChart(scene, preset, w, h) {
  const chartType = scene.chart_type || 'bar';
  const chartData = scene.chart_data || [];
  const chartTitle = scene.chart_title || '';
  const isPie = chartType === 'pie' || chartType === 'donut';
  const jsType = isPie ? 'doughnut' : (chartType === 'area' ? 'line' : chartType);
  const cutout = chartType === 'donut' ? "cutout:'55%'," : chartType === 'pie' ? "cutout:'0%'," : '';
  const fill = chartType === 'area' ? 'fill:true,' : '';

  const defaultColors = [preset.primary, preset.secondary, preset.accent, '#FF6B6B', '#A78BFA', '#F472B6'];
  const labels = JSON.stringify(chartData.map(d => d.label));
  const values = JSON.stringify(chartData.map(d => d.value));
  const colors = JSON.stringify(chartData.map((d, i) => d.color || defaultColors[i % defaultColors.length]));

  return `
    <div style="
      position:absolute; top:${Math.round(h * 0.18)}px; left:${Math.round(w * 0.06)}px;
      right:${Math.round(w * 0.06)}px; bottom:${Math.round(h * 0.12)}px;
      z-index:10; display:flex; flex-direction:column; align-items:center;
    ">
      ${chartTitle ? `<div style="
        font-family:'${preset.fontSerif}',serif;
        font-size:${Math.round(h * 0.032)}px;
        font-weight:700; color:${preset.text};
        text-align:center; margin-bottom:${Math.round(h * 0.02)}px;
        text-shadow: 0 2px 16px rgba(0,0,0,0.6);
      ">${esc(chartTitle)}</div>` : ''}
      <div style="
        flex:1; width:100%;
        background:rgba(255,255,255,0.04);
        backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:16px;
        padding:${Math.round(h * 0.02)}px;
        display:flex; align-items:center; justify-content:center;
      ">
        <canvas id="chart" style="max-width:100%;max-height:100%;"></canvas>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
      Chart.defaults.color='${preset.text}';
      Chart.defaults.font.family='Inter';
      Chart.defaults.font.weight=700;
      Chart.defaults.font.size=${Math.round(h * 0.018)};
      new Chart(document.getElementById('chart'),{
        type:'${jsType}',
        data:{labels:${labels},datasets:[{data:${values},backgroundColor:${colors},
          borderColor:${isPie ? colors : JSON.stringify([preset.primary])},
          borderWidth:${isPie ? 2 : 3},borderRadius:${isPie ? 0 : 8},${fill}tension:0.3,
          pointRadius:${chartType === 'line' ? 6 : 0}}]},
        options:{responsive:true,maintainAspectRatio:false,animation:false,${cutout}
          plugins:{legend:{display:${isPie},position:'bottom',labels:{padding:20,font:{size:${Math.round(h * 0.02)}}}},tooltip:{enabled:false}},
          scales:${isPie ? '{}' : `{x:{grid:{color:'rgba(255,255,255,0.06)'}},y:{grid:{color:'rgba(255,255,255,0.06)'},beginAtZero:true}}`}}
      });
    </script>
  `;
}

function contentTextCard(scene, preset, w, h) {
  const title = scene.card_title || '';
  const body = scene.card_body || '';
  return `
    <div style="
      position:absolute; top:${Math.round(h * 0.22)}px; left:${Math.round(w * 0.08)}px;
      right:${Math.round(w * 0.08)}px; bottom:${Math.round(h * 0.15)}px;
      z-index:10; display:flex; flex-direction:column; justify-content:center;
    ">
      <div style="
        background:rgba(255,255,255,0.05);
        backdrop-filter:blur(18px);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:20px;
        padding:${Math.round(h * 0.045)}px ${Math.round(w * 0.06)}px;
      ">
        <div style="
          width:${Math.round(w * 0.12)}px; height:5px;
          background:linear-gradient(90deg, ${preset.primary}, ${preset.secondary});
          border-radius:3px; margin-bottom:${Math.round(h * 0.025)}px;
        "></div>
        ${title ? `<div style="
          font-family:'${preset.fontSerif}',serif;
          font-size:${Math.round(h * 0.042)}px;
          font-weight:700; color:${preset.text};
          line-height:1.2; margin-bottom:${Math.round(h * 0.02)}px;
          text-shadow: 0 2px 16px rgba(0,0,0,0.5);
        ">${esc(title)}</div>` : ''}
        ${body ? `<div style="
          font-family:'${preset.fontBody}',sans-serif;
          font-size:${Math.round(h * 0.026)}px;
          font-weight:400; color:${preset.text}; opacity:0.8;
          line-height:1.5;
        ">${esc(body)}</div>` : ''}
      </div>
    </div>
  `;
}

function contentList(scene, preset, w, h) {
  const title = scene.list_title || '';
  const items = scene.list_items || [];
  const numbered = scene.list_numbered || false;

  const itemsHTML = items.map((item, i) => {
    const text = typeof item === 'string' ? item : item.text;
    const marker = numbered
      ? `<span style="
          font-family:'${preset.fontAccent}',sans-serif;
          font-size:${Math.round(h * 0.032)}px; font-weight:900;
          color:${preset.primary}; min-width:${Math.round(w * 0.08)}px;
          line-height:1;
        ">${i + 1}</span>`
      : `<span style="
          width:${Math.round(w * 0.02)}px; height:${Math.round(w * 0.02)}px;
          border-radius:50%; background:${preset.primary};
          flex-shrink:0; margin-top:${Math.round(h * 0.006)}px;
        "></span>`;
    return `
      <div style="display:flex; align-items:flex-start; gap:${Math.round(w * 0.04)}px;
        padding:${Math.round(h * 0.01)}px 0;">
        ${marker}
        <span style="
          font-family:'${preset.fontBody}',sans-serif;
          font-size:${Math.round(h * 0.024)}px; font-weight:500;
          color:${preset.text}; line-height:1.4;
        ">${esc(text)}</span>
      </div>
    `;
  }).join('');

  return `
    <div style="
      position:absolute; top:${Math.round(h * 0.20)}px; left:${Math.round(w * 0.08)}px;
      right:${Math.round(w * 0.08)}px; bottom:${Math.round(h * 0.12)}px;
      z-index:10; display:flex; flex-direction:column; justify-content:center;
    ">
      <div style="
        background:rgba(255,255,255,0.04);
        backdrop-filter:blur(14px);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:20px;
        padding:${Math.round(h * 0.035)}px ${Math.round(w * 0.06)}px;
      ">
        ${title ? `<div style="
          font-family:'${preset.fontSerif}',serif;
          font-size:${Math.round(h * 0.034)}px;
          font-weight:700; color:${preset.text};
          margin-bottom:${Math.round(h * 0.02)}px; line-height:1.2;
          text-shadow: 0 2px 12px rgba(0,0,0,0.5);
        ">${esc(title)}</div>` : ''}
        ${itemsHTML}
      </div>
    </div>
  `;
}

// ─── Main render function ───────────────────────────────────────────────

/**
 * Render a scene as a designed slide PNG.
 *
 * @param {object} scene - Scene data (visual_type, keyword, content fields)
 * @param {object} preset - Color/font preset { primary, secondary, accent, bg, text, fontHeadline, fontBody, fontSerif, fontAccent }
 * @param {string|null} bgImage - Absolute path to background image (or null)
 * @param {number} width - Output width (e.g. 1080)
 * @param {number} height - Output height (e.g. 1920)
 * @param {string} outputPath - Where to save the PNG
 * @returns {Promise<string>} Path to generated PNG
 */
async function renderSlidePNG(scene, preset, bgImage, width, height, outputPath) {
  const p = { ...DEFAULT_PRESET, ...preset };
  const vt = scene.visual_type || 'photo';
  const keyword = scene.keyword || '';

  let contentHTML = '';
  switch (vt) {
    case 'chart': contentHTML = contentChart(scene, p, width, height); break;
    case 'text_card': contentHTML = contentTextCard(scene, p, width, height); break;
    case 'list': contentHTML = contentList(scene, p, width, height); break;
    default: contentHTML = contentPhoto(scene, p, width, height); break;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700;800&family=Inter:wght@400;500;700&family=DM+Serif+Display&family=Oswald:wght@700;900&family=Lora:wght@400;700&family=Montserrat:wght@400;500;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:${width}px; height:${height}px;
    overflow:hidden; position:relative;
    font-family:'${p.fontBody}',sans-serif;
    color:${p.text};
    background:${p.bg};
  }
</style>
</head><body>
  ${bgLayer(bgImage, p)}
  ${keywordHTML(keyword, p, height)}
  ${contentHTML}
</body></html>`;

  return htmlToPNG(html, width, height, outputPath);
}

/**
 * Render all scenes in a plan as slide PNGs.
 * Returns map of sceneIndex → pngPath.
 */
async function renderAllSlides(plan, preset, imagesDir, assetsDir, width, height, tmpDir) {
  const scenes = plan.scenes || [];
  const slidePNGs = {};

  // Collect available images for cycling
  const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const collectImages = (dir) => {
    if (!dir || !fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => imgExts.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(dir, f));
  };
  const availableImages = [...collectImages(imagesDir), ...collectImages(assetsDir)];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // Pick background image: use scene.image if exists, otherwise cycle through available
    let bgImage = scene.image && fs.existsSync(scene.image) ? scene.image : null;
    if (!bgImage && availableImages.length > 0) {
      bgImage = availableImages[i % availableImages.length];
    }

    const outputPath = path.join(tmpDir, `slide_${String(i).padStart(2, '0')}.png`);
    try {
      await renderSlidePNG(scene, preset, bgImage, width, height, outputPath);
      slidePNGs[i] = outputPath;
    } catch (err) {
      console.log(`  Slide ${i} render failed: ${err.message}`);
    }
  }

  await closeBrowser();
  return slidePNGs;
}

module.exports = { renderSlidePNG, renderAllSlides, resolvePreset, closeBrowser };
