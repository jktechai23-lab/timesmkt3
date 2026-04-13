/**
 * render-slide-png.js — Renders Video Pro scenes as designed slides.
 *
 * 4 template layouts with distinct visual identities:
 * - data_story: dark bg, hero numbers, charts, tech authority
 * - explainer: light cards, numbered steps, didactic
 * - narrativo: bold centered text, emotional impact, high contrast
 * - brand_film: minimal text, lower third, photo-dominant
 *
 * + CTA layout (shared, adapted per template colors)
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

const DEFAULT_PRESET = {
  primary: '#0099FF', secondary: '#00FF88', accent: '#FFD700',
  bg: '#080C14', text: '#FFFFFF',
  fontHeadline: 'Space Grotesk', fontBody: 'Inter',
  fontSerif: 'DM Serif Display', fontAccent: 'Oswald',
};

function resolvePreset(presetName, styleDictPath) {
  const preset = { ...DEFAULT_PRESET };
  try {
    if (styleDictPath && fs.existsSync(styleDictPath)) {
      const dict = JSON.parse(fs.readFileSync(styleDictPath, 'utf-8'));
      const style = dict.styles?.[presetName];
      if (style?.palette) Object.assign(preset, style.palette);
    }
  } catch {}
  return preset;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Shared: Google Fonts import ────────────────────────────────────────

const FONTS_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=Inter:wght@300;400;500;700&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Oswald:wght@700;900&family=Bebas+Neue&family=Montserrat:wght@400;500;700;800;900&family=Anton&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@300;400;600&display=swap');`;

// ─── Shared: Background image layer ─────────────────────────────────────

function bgLayer(bgImage, overlayCSS) {
  if (bgImage && fs.existsSync(bgImage)) {
    const data = `data:image/jpeg;base64,${fs.readFileSync(bgImage).toString('base64')}`;
    return `
      <img src="${data}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(0.55) contrast(1.15) saturate(1.1);" />
      <div style="position:absolute;top:0;left:0;width:100%;height:100%;${overlayCSS}"></div>
    `;
  }
  return '';
}

// ─── Chart.js script (shared) ───────────────────────────────────────────

function chartScript(scene, preset, w, h, fontFamily, fontColor, gridColor) {
  const chartType = scene.chart_type || 'bar';
  const chartData = scene.chart_data || [];
  const isPie = chartType === 'pie' || chartType === 'donut';
  const jsType = isPie ? 'doughnut' : (chartType === 'area' ? 'line' : chartType);
  const cutout = chartType === 'donut' ? "cutout:'55%'," : chartType === 'pie' ? "cutout:'0%'," : '';
  const fill = chartType === 'area' ? 'fill:true,' : '';
  const defaultColors = [preset.primary, preset.secondary, preset.accent, '#FF6B6B', '#A78BFA', '#F472B6'];
  const labels = JSON.stringify(chartData.map(d => d.label));
  const values = JSON.stringify(chartData.map(d => d.value));
  const colors = JSON.stringify(chartData.map((d, i) => d.color || defaultColors[i % defaultColors.length]));

  return `
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
      Chart.defaults.color='${fontColor}';
      Chart.defaults.font.family='${fontFamily}';
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
          scales:${isPie ? '{}' : `{x:{grid:{color:'${gridColor}'}},y:{grid:{color:'${gridColor}'},beginAtZero:true}}`}}
      });
    </script>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE: DATA STORY
// Dark bg, hero numbers, Space Grotesk, tech authority
// ═══════════════════════════════════════════════════════════════════════════

function dataStorySlide(scene, p, bgImage, w, h) {
  const vt = scene.visual_type || 'photo';
  const keyword = scene.keyword || '';
  const overlay = `background:linear-gradient(180deg, rgba(10,10,15,0.85) 0%, rgba(10,10,15,0.6) 40%, rgba(10,10,15,0.75) 100%);`;

  let content = '';
  if (vt === 'chart') {
    const heroValue = (scene.chart_data || [])[0]?.value || '';
    const heroLabel = scene.chart_title || '';
    content = `
      <div style="position:absolute;top:${Math.round(h*0.06)}px;left:${Math.round(w*0.06)}px;right:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:600;color:${p.primary};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:${Math.round(h*0.008)}px;">${esc(keyword)}</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.09)}px;font-weight:800;color:${p.text};line-height:1;margin-bottom:${Math.round(h*0.008)}px;text-shadow:0 4px 40px rgba(0,0,0,0.8);">${esc(String(heroValue))}</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:${Math.round(h*0.024)}px;font-weight:400;color:${p.text};opacity:0.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(heroLabel)}</div>
      </div>
      <div style="position:absolute;top:${Math.round(h*0.28)}px;left:${Math.round(w*0.04)}px;right:${Math.round(w*0.04)}px;bottom:${Math.round(h*0.06)}px;z-index:10;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:${Math.round(h*0.02)}px;">
        <canvas id="chart" style="max-width:100%;max-height:100%;"></canvas>
      </div>
      ${chartScript(scene, p, w, h, 'Space Grotesk', p.text, 'rgba(255,255,255,0.06)')}
    `;
  } else if (vt === 'text_card') {
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w*0.08)}px;">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.022)}px;font-weight:600;color:${p.primary};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:${Math.round(h*0.02)}px;">${esc(keyword)}</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.045)}px;font-weight:800;color:${p.text};line-height:1.15;margin-bottom:${Math.round(h*0.02)}px;text-shadow:0 2px 20px rgba(0,0,0,0.6);">${esc(scene.card_title || '')}</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:${Math.round(h*0.026)}px;color:${p.text};opacity:0.75;line-height:1.5;">${esc(scene.card_body || '')}</div>
      </div>
    `;
  } else if (vt === 'list') {
    const items = (scene.list_items || []).map((item, i) => {
      const text = typeof item === 'string' ? item : item.text;
      return `<div style="display:flex;align-items:flex-start;gap:${Math.round(w*0.04)}px;padding:${Math.round(h*0.012)}px 0;">
        <span style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.032)}px;font-weight:800;color:${p.primary};min-width:${Math.round(w*0.07)}px;">${i+1}</span>
        <span style="font-family:'DM Sans',sans-serif;font-size:${Math.round(h*0.024)}px;font-weight:500;color:${p.text};line-height:1.4;">${esc(text)}</span>
      </div>`;
    }).join('');
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w*0.08)}px;">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.022)}px;font-weight:600;color:${p.primary};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:${Math.round(h*0.015)}px;">${esc(keyword)}</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.035)}px;font-weight:700;color:${p.text};margin-bottom:${Math.round(h*0.025)}px;">${esc(scene.list_title || '')}</div>
        ${items}
      </div>
    `;
  } else {
    // photo
    content = `
      <div style="position:absolute;top:${Math.round(h*0.06)}px;left:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:${Math.round(h*0.055)}px;font-weight:800;color:${p.secondary};text-transform:uppercase;letter-spacing:0.05em;text-shadow:0 4px 32px rgba(0,0,0,0.8);">${esc(keyword)}</div>
      </div>
    `;
  }

  return wrapHTML(content, bgLayer(bgImage, overlay), p, w, h);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE: EXPLAINER
// Light cards, Plus Jakarta Sans, numbered steps, didactic
// ═══════════════════════════════════════════════════════════════════════════

function explainerSlide(scene, p, bgImage, w, h) {
  const vt = scene.visual_type || 'photo';
  const keyword = scene.keyword || '';
  const overlay = `background:linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.7) 100%);`;

  let content = '';
  if (vt === 'chart') {
    content = `
      <div style="position:absolute;top:${Math.round(h*0.06)}px;left:${Math.round(w*0.06)}px;right:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:700;color:${p.primary};text-transform:uppercase;letter-spacing:0.1em;">${esc(keyword)}</div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.03)}px;font-weight:800;color:${p.text};margin-top:${Math.round(h*0.008)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(scene.chart_title || '')}</div>
      </div>
      <div style="position:absolute;top:${Math.round(h*0.16)}px;left:${Math.round(w*0.05)}px;right:${Math.round(w*0.05)}px;bottom:${Math.round(h*0.06)}px;z-index:10;background:rgba(255,255,255,0.08);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:${Math.round(h*0.025)}px;">
        <canvas id="chart" style="max-width:100%;max-height:100%;"></canvas>
      </div>
      ${chartScript(scene, p, w, h, 'Plus Jakarta Sans', p.text, 'rgba(255,255,255,0.08)')}
    `;
  } else if (vt === 'text_card') {
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w*0.07)}px;">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:700;color:${p.primary};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:${Math.round(h*0.02)}px;">${esc(keyword)}</div>
        <div style="background:rgba(255,255,255,0.07);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:${Math.round(h*0.04)}px ${Math.round(w*0.06)}px;">
          <div style="width:${Math.round(w*0.1)}px;height:4px;background:${p.primary};border-radius:2px;margin-bottom:${Math.round(h*0.025)}px;"></div>
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.038)}px;font-weight:800;color:${p.text};line-height:1.2;margin-bottom:${Math.round(h*0.015)}px;">${esc(scene.card_title || '')}</div>
          <div style="font-family:'Inter',sans-serif;font-size:${Math.round(h*0.024)}px;color:${p.text};opacity:0.8;line-height:1.5;">${esc(scene.card_body || '')}</div>
        </div>
      </div>
    `;
  } else if (vt === 'list') {
    const items = (scene.list_items || []).map((item, i) => {
      const text = typeof item === 'string' ? item : item.text;
      return `<div style="display:flex;align-items:center;gap:${Math.round(w*0.04)}px;padding:${Math.round(h*0.015)}px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="width:${Math.round(w*0.1)}px;height:${Math.round(w*0.1)}px;border-radius:50%;background:${p.primary};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.024)}px;font-weight:800;color:#fff;">${i+1}</span>
        </div>
        <span style="font-family:'Inter',sans-serif;font-size:${Math.round(h*0.023)}px;font-weight:500;color:${p.text};line-height:1.3;">${esc(text)}</span>
      </div>`;
    }).join('');
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w*0.07)}px;">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:700;color:${p.primary};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:${Math.round(h*0.015)}px;">${esc(keyword)}</div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.032)}px;font-weight:700;color:${p.text};margin-bottom:${Math.round(h*0.025)}px;">${esc(scene.list_title || '')}</div>
        ${items}
      </div>
    `;
  } else {
    content = `
      <div style="position:absolute;top:${Math.round(h*0.06)}px;left:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:${Math.round(h*0.05)}px;font-weight:800;color:${p.text};text-shadow:0 4px 32px rgba(0,0,0,0.8);">${esc(keyword)}</div>
      </div>
    `;
  }

  return wrapHTML(content, bgLayer(bgImage, overlay), p, w, h);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE: NARRATIVO (ex carousel_narrativo)
// Bebas Neue / Montserrat, bold centered text, emotional impact
// ═══════════════════════════════════════════════════════════════════════════

function narrativoSlide(scene, p, bgImage, w, h) {
  const vt = scene.visual_type || 'photo';
  const keyword = scene.keyword || '';
  const overlay = `background:linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.7) 100%);`;

  let content = '';
  if (vt === 'chart') {
    content = `
      <div style="position:absolute;top:${Math.round(h*0.06)}px;left:0;right:0;z-index:10;text-align:center;padding:0 ${Math.round(w*0.06)}px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:${Math.round(h*0.05)}px;color:${p.accent};letter-spacing:0.08em;">${esc(keyword)}</div>
        <div style="font-family:'Montserrat',sans-serif;font-size:${Math.round(h*0.024)}px;font-weight:700;color:${p.text};margin-top:${Math.round(h*0.008)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(scene.chart_title || '')}</div>
      </div>
      <div style="position:absolute;top:${Math.round(h*0.18)}px;left:${Math.round(w*0.06)}px;right:${Math.round(w*0.06)}px;bottom:${Math.round(h*0.06)}px;z-index:10;">
        <canvas id="chart" style="max-width:100%;max-height:100%;"></canvas>
      </div>
      ${chartScript(scene, p, w, h, 'Montserrat', p.text, 'rgba(255,255,255,0.05)')}
    `;
  } else if (vt === 'text_card') {
    // Narrativo: frase gigante centralizada, sem box
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${Math.round(w*0.08)}px;text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:${Math.round(h*0.075)}px;color:${p.text};line-height:1.05;letter-spacing:0.03em;text-shadow:0 4px 40px rgba(0,0,0,0.9);">${esc(scene.card_title || '')}</div>
        ${scene.card_body ? `<div style="font-family:'Montserrat',sans-serif;font-size:${Math.round(h*0.026)}px;font-weight:500;color:${p.text};opacity:0.8;margin-top:${Math.round(h*0.03)}px;line-height:1.4;">${esc(scene.card_body)}</div>` : ''}
      </div>
    `;
  } else if (vt === 'list') {
    const items = (scene.list_items || []).map((item, i) => {
      const text = typeof item === 'string' ? item : item.text;
      return `<div style="text-align:center;padding:${Math.round(h*0.012)}px 0;">
        <span style="font-family:'Montserrat',sans-serif;font-size:${Math.round(h*0.028)}px;font-weight:800;color:${p.accent};">${i+1}. </span>
        <span style="font-family:'Montserrat',sans-serif;font-size:${Math.round(h*0.026)}px;font-weight:600;color:${p.text};">${esc(text)}</span>
      </div>`;
    }).join('');
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${Math.round(w*0.06)}px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:${Math.round(h*0.055)}px;color:${p.accent};letter-spacing:0.06em;margin-bottom:${Math.round(h*0.02)}px;">${esc(keyword)}</div>
        ${items}
      </div>
    `;
  } else {
    // photo: palavra gigante centralizada
    content = `
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;align-items:center;justify-content:center;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:${Math.round(h*0.09)}px;color:${p.text};text-align:center;letter-spacing:0.04em;text-shadow:0 6px 50px rgba(0,0,0,0.9),0 0 100px rgba(0,0,0,0.5);padding:0 ${Math.round(w*0.06)}px;">${esc(keyword)}</div>
      </div>
    `;
  }

  return wrapHTML(content, bgLayer(bgImage, overlay), p, w, h);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE: BRAND FILM
// Minimal text, lower third, Cormorant Garamond / Inter Light, photo-dominant
// ═══════════════════════════════════════════════════════════════════════════

function brandFilmSlide(scene, p, bgImage, w, h) {
  const vt = scene.visual_type || 'photo';
  const keyword = scene.keyword || '';
  // Light overlay — photo is the star
  const overlay = `background:linear-gradient(180deg, transparent 0%, transparent 50%, rgba(0,0,0,0.5) 100%);`;

  let content = '';
  if (vt === 'chart') {
    content = `
      <div style="position:absolute;top:${Math.round(h*0.50)}px;left:${Math.round(w*0.06)}px;right:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:${Math.round(h*0.022)}px;font-weight:300;color:${p.text};opacity:0.7;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:${Math.round(h*0.01)}px;">${esc(keyword)}</div>
        <div style="height:${Math.round(h*0.35)}px;"><canvas id="chart" style="max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ${chartScript(scene, p, w, h, 'Inter', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.04)')}
    `;
  } else if (vt === 'text_card') {
    // Mid-lower — elegant, minimal
    content = `
      <div style="position:absolute;top:${Math.round(h*0.55)}px;left:${Math.round(w*0.06)}px;right:${Math.round(w*0.06)}px;z-index:10;">
        <div style="width:${Math.round(w*0.08)}px;height:2px;background:${p.text};opacity:0.4;margin-bottom:${Math.round(h*0.02)}px;"></div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:${Math.round(h*0.04)}px;font-weight:300;color:${p.text};line-height:1.25;letter-spacing:0.02em;">${esc(scene.card_title || '')}</div>
        ${scene.card_body ? `<div style="font-family:'Inter',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:300;color:${p.text};opacity:0.65;margin-top:${Math.round(h*0.015)}px;line-height:1.5;letter-spacing:0.03em;">${esc(scene.card_body)}</div>` : ''}
      </div>
    `;
  } else if (vt === 'list') {
    const items = (scene.list_items || []).map((item, i) => {
      const text = typeof item === 'string' ? item : item.text;
      return `<div style="padding:${Math.round(h*0.008)}px 0;">
        <span style="font-family:'Inter',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:300;color:${p.text};opacity:0.8;line-height:1.5;">${esc(text)}</span>
      </div>`;
    }).join('');
    content = `
      <div style="position:absolute;top:${Math.round(h*0.52)}px;left:${Math.round(w*0.06)}px;right:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:${Math.round(h*0.022)}px;font-weight:300;color:${p.text};opacity:0.6;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:${Math.round(h*0.015)}px;">${esc(keyword)}</div>
        ${items}
      </div>
    `;
  } else {
    // photo: minimal keyword at mid-lower — photo is everything
    content = `
      <div style="position:absolute;top:${Math.round(h*0.58)}px;left:${Math.round(w*0.06)}px;z-index:10;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:${Math.round(h*0.035)}px;font-weight:300;color:${p.text};letter-spacing:0.15em;text-transform:uppercase;text-shadow:0 2px 20px rgba(0,0,0,0.6);">${esc(keyword)}</div>
      </div>
    `;
  }

  return wrapHTML(content, bgLayer(bgImage, overlay), p, w, h);
}

// ─── CTA (shared, colors from preset) ───────────────────────────────────

function ctaSlide(scene, p, bgImage, w, h) {
  const brand = scene.cta_brand || 'INEMA.CLUB';
  const action = scene.cta_action || '';
  const keyword = scene.keyword || '';
  const overlay = `background:radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.8) 100%);`;

  const content = `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${Math.round(w*0.08)}px;">
      ${keyword ? `<div style="font-family:'Inter',sans-serif;font-size:${Math.round(h*0.02)}px;font-weight:600;color:${p.text};opacity:0.5;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:${Math.round(h*0.03)}px;">${esc(keyword)}</div>` : ''}
      <div style="font-family:'Montserrat',sans-serif;font-size:${Math.round(h*0.065)}px;font-weight:900;color:${p.text};text-align:center;line-height:1.1;text-shadow:0 4px 40px rgba(0,0,0,0.8);margin-bottom:${Math.round(h*0.025)}px;">${esc(brand)}</div>
      <div style="width:${Math.round(w*0.15)}px;height:3px;background:linear-gradient(90deg, ${p.primary}, ${p.secondary});border-radius:2px;margin-bottom:${Math.round(h*0.03)}px;"></div>
      ${action ? `<div style="background:linear-gradient(135deg, ${p.primary}, ${p.secondary});padding:${Math.round(h*0.016)}px ${Math.round(w*0.1)}px;border-radius:9999px;font-family:'Inter',sans-serif;font-size:${Math.round(h*0.024)}px;font-weight:700;color:#000;text-align:center;box-shadow:0 4px 30px rgba(0,153,255,0.3);">${esc(action)}</div>` : ''}
    </div>
  `;

  return wrapHTML(content, bgLayer(bgImage, overlay), p, w, h);
}

// ─── HTML wrapper ───────────────────────────────────────────────────────

function wrapHTML(content, bg, p, w, h) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  ${FONTS_IMPORT}
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:${w}px; height:${h}px; overflow:hidden; position:relative; background:${p.bg}; }
</style>
</head><body>
  ${bg}
  ${content}
</body></html>`;
}

// ─── Main render function ───────────────────────────────────────────────

async function renderSlidePNG(scene, preset, bgImage, width, height, outputPath, templateName) {
  const p = { ...DEFAULT_PRESET, ...preset };
  const vt = scene.visual_type || 'photo';
  const isCTA = vt === 'cta' || (scene.type || '').includes('cta');

  let html;
  if (isCTA) {
    html = ctaSlide(scene, p, bgImage, width, height);
  } else {
    switch (templateName) {
      case 'data_story': html = dataStorySlide(scene, p, bgImage, width, height); break;
      case 'explainer': html = explainerSlide(scene, p, bgImage, width, height); break;
      case 'narrativo': html = narrativoSlide(scene, p, bgImage, width, height); break;
      case 'brand_film': html = brandFilmSlide(scene, p, bgImage, width, height); break;
      default: html = dataStorySlide(scene, p, bgImage, width, height); break; // auto fallback
    }
  }

  return htmlToPNG(html, width, height, outputPath);
}

async function renderAllSlides(plan, preset, imagesDir, assetsDir, width, height, tmpDir, templateName) {
  const scenes = plan.scenes || [];
  const slidePNGs = {};

  const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];

  // Folders that contain brand/text images — skip entirely
  // ads/ contains carousels with baked-in text — NEVER use as background
  const skipDirs = ['logo', 'logos', 'brand', 'icons', 'ads'];

  // Filename patterns that indicate text/branding — skip these images
  const skipPatterns = /banner|logo_|oficial_|badge_|stats_|apresenta|convite|_texto|texto_|_text|clean_|semcoroa|interno_|premium_|inema_.*v\d|classico|gold_|carousel_|_ad\.|_post\.|_story/i;

  const collectImages = (dir) => {
    if (!dir || !fs.existsSync(dir)) return [];
    const results = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // Skip brand/logo directories
          if (skipDirs.includes(entry.name.toLowerCase())) continue;
          walk(path.join(d, entry.name));
        } else if (imgExts.includes(path.extname(entry.name).toLowerCase())) {
          // Skip files with brand/text patterns in name
          if (skipPatterns.test(entry.name)) continue;
          results.push(path.join(d, entry.name));
        }
      }
    };
    walk(dir);
    return results;
  };

  const allImages = [...collectImages(imagesDir), ...collectImages(assetsDir)];
  const availableImages = allImages;

  if (availableImages.length === 0) {
    console.log('⚠ No clean photographic images found — using solid background from preset');
    console.log('  Tip: add photos to assets/photos/ for better video backgrounds');
  } else {
    console.log(`  Found ${availableImages.length} clean images for backgrounds`);
  }

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    let bgImage = scene.image && fs.existsSync(scene.image) ? scene.image : null;
    if (!bgImage && availableImages.length > 0) {
      bgImage = availableImages[i % availableImages.length];
    }

    const outputPath = path.join(tmpDir, `slide_${String(i).padStart(2, '0')}.png`);
    try {
      await renderSlidePNG(scene, preset, bgImage, width, height, outputPath, templateName || 'auto');
      slidePNGs[i] = outputPath;
    } catch (err) {
      console.log(`  Slide ${i} render failed: ${err.message}`);
    }
  }

  await closeBrowser();
  return slidePNGs;
}

module.exports = { renderSlidePNG, renderAllSlides, resolvePreset, closeBrowser };
