#!/usr/bin/env node
/**
 * build-revista-menino-lua.js
 *
 * Gera uma revista em quadrinhos estilo gibi antigo:
 *   1. Pra cada quadro do storyboard, gera imagem LIMPA via inemaimg.
 *   2. Compõe HTML com a imagem + caption box estilo vintage comics
 *      (texto sobreposto no topo OU rodapé do quadro).
 *   3. Renderiza PNG final via Playwright.
 *
 * Output:
 *   imgs/quadro_NN_<id>.jpg   (imagem limpa do model)
 *   quadros/quadro_NN_<id>.png (versão final com caption box)
 *
 * Uso:
 *   node scripts/build-revista-menino-lua.js [--only N]
 */

const fs = require('fs');
const path = require('path');
const { generateImage } = require('../pipeline/generate-image-inemaimg');
const { chromium } = require('playwright');

const REVISTA_DIR = path.resolve(__dirname, '..', 'prj/inema/revistas/menino_na_lua');
const STORYBOARD = path.join(REVISTA_DIR, 'storyboard.json');
const IMGS_DIR = path.join(REVISTA_DIR, 'imgs');
const QUADROS_DIR = path.join(REVISTA_DIR, 'quadros');
const MODEL = process.env.INEMAIMG_MODEL || 'flux2-klein';

function compose(frame, imagePath, board) {
  const captionTop = frame.caption_position === 'top';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Special+Elite&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${board.width}px; height:${board.height}px; }
  body {
    background: #f1ead3;
    font-family: 'Special Elite', 'Courier New', monospace;
    position: relative;
    overflow: hidden;
  }
  .panel {
    width: 100%; height: 100%;
    position: relative;
    border: 8px solid #1a1a1a;
    box-shadow: inset 0 0 0 4px #f1ead3, inset 0 0 0 5px #1a1a1a;
  }
  .img-frame {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    background-image: url('file://${imagePath}');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
  .img-frame::after {
    content: '';
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle, rgba(0,0,0,0.18) 1px, transparent 1.5px);
    background-size: 4px 4px;
    mix-blend-mode: multiply;
    pointer-events: none;
    opacity: 0.4;
  }
  .caption {
    position: absolute;
    left: 32px; right: 32px;
    ${captionTop ? 'top: 32px;' : 'bottom: 32px;'}
    background: #f4ecc7;
    border: 4px solid #1a1a1a;
    padding: 18px 28px;
    box-shadow: 6px 6px 0 #1a1a1a;
    font-size: 36px;
    line-height: 1.25;
    color: #1a1a1a;
    font-weight: 700;
    text-align: left;
    letter-spacing: 0.3px;
    z-index: 10;
  }
  .caption::before {
    content: '${String(frame.n).padStart(2, '0')}';
    display: inline-block;
    background: #1a1a1a;
    color: #f4ecc7;
    padding: 2px 12px;
    margin-right: 14px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px;
    letter-spacing: 2px;
    vertical-align: middle;
  }
  .pages-corner {
    position: absolute;
    bottom: 14px; right: 18px;
    background: #1a1a1a;
    color: #f4ecc7;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    padding: 4px 10px;
    letter-spacing: 1px;
    z-index: 11;
  }
</style></head>
<body>
  <div class="panel">
    <div class="img-frame"></div>
    <div class="caption">${escape(frame.caption)}</div>
    <div class="pages-corner">${frame.n} / ${board.frames.length}</div>
  </div>
</body></html>`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveRefImage(frame, board) {
  if (!frame.phase || !board.phases) return null;
  const refName = board.phases[frame.phase];
  if (!refName) return null;
  const refPath = path.join(path.dirname(IMGS_DIR), 'refs', refName);
  return fs.existsSync(refPath) ? refPath : null;
}

function buildPrompt(frame, board) {
  const parts = [];
  if (board.character_template) parts.push(board.character_template);
  const wardrobe = frame.wardrobe && board.wardrobes ? board.wardrobes[frame.wardrobe] : null;
  if (wardrobe) parts.push(wardrobe);
  parts.push(frame.prompt);
  parts.push(board.style_base);
  return parts.filter(Boolean).join('. ');
}

async function buildOne(frame, board, browser) {
  const idx = String(frame.n).padStart(2, '0');
  const imgPath = path.join(IMGS_DIR, `quadro_${idx}_${frame.id}.jpg`);
  const outPath = path.join(QUADROS_DIR, `quadro_${idx}_${frame.id}.png`);

  // 1. Gera imagem limpa com subject_lock via reference image
  if (!fs.existsSync(imgPath)) {
    const fullPrompt = buildPrompt(frame, board);
    const refImage = resolveRefImage(frame, board);
    const refs = refImage ? [refImage] : [];
    console.log(`[${idx}] generating phase=${frame.phase || '-'} wardrobe=${frame.wardrobe || '-'}: ${frame.prompt.slice(0, 50)}...`);
    const t0 = Date.now();
    await generateImage(imgPath, fullPrompt, MODEL, board.format, refs);
    console.log(`[${idx}] image saved (${((Date.now() - t0) / 1000).toFixed(1)}s)${refImage ? ' [ref-locked]' : ''}`);
    fs.writeFileSync(imgPath.replace(/\.[^.]+$/, '_prompt.txt'), fullPrompt);
  } else {
    console.log(`[${idx}] image exists, skipping gen`);
  }

  // 2. Compose HTML
  const html = compose(frame, imgPath, board);
  const htmlPath = outPath.replace('.png', '.html');
  fs.writeFileSync(htmlPath, html);

  // 3. Render PNG
  const page = await browser.newPage({ viewport: { width: board.width, height: board.height } });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
  console.log(`[${idx}] rendered: ${outPath}`);
}

async function main() {
  const board = JSON.parse(fs.readFileSync(STORYBOARD, 'utf-8'));
  fs.mkdirSync(IMGS_DIR, { recursive: true });
  fs.mkdirSync(QUADROS_DIR, { recursive: true });

  const onlyArg = process.argv.indexOf('--only');
  const onlyN = onlyArg > -1 ? parseInt(process.argv[onlyArg + 1], 10) : null;

  const browser = await chromium.launch();
  try {
    for (const frame of board.frames) {
      if (onlyN !== null && frame.n !== onlyN) continue;
      await buildOne(frame, board, browser);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n✅ Done. Quadros: ${QUADROS_DIR}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
