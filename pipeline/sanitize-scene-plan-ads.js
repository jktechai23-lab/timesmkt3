/**
 * sanitize-scene-plan-ads.js
 *
 * Video Pro proíbe imagens de ads/ (carousels com texto+logo embutido) como
 * background — regra documentada em skills/video-editor-agent/SKILL.md:130 e
 * worker-video-pro.js:1003. Mesmo assim o agente Claude CLI que monta o
 * scene_plan_motion.json às vezes ignora a regra e aponta `image:` pra ads/.
 *
 * Esse módulo varre um scene plan, troca qualquer image que aponte pra ads/
 * por uma foto limpa de imgs/ (round-robin). Se imgs/ estiver vazia, seta
 * scene.image=null pro renderer cair em fundo sólido do preset.
 */

const fs = require('fs');
const path = require('path');

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SKIP_PATTERNS = /banner|logo_|oficial_|badge_|stats_|apresenta|convite|_texto|texto_|_text|clean_|semcoroa|interno_|premium_|inema_.*v\d|classico|gold_|approved\.json/i;

function listCleanImgs(imgsDir) {
  if (!fs.existsSync(imgsDir)) return [];
  const out = [];
  try {
    for (const entry of fs.readdirSync(imgsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMG_EXT.has(ext)) continue;
      if (SKIP_PATTERNS.test(entry.name)) continue;
      out.push(path.join(imgsDir, entry.name));
    }
  } catch {
    return [];
  }
  return out.sort();
}

function isAdsPath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return false;
  const norm = imagePath.replace(/\\/g, '/');
  return /\/ads\//.test(norm);
}

/**
 * Sanitize a scene plan file in place.
 * Returns { planPath, total, replaced, nulled, imgsAvailable, scanned }.
 */
function sanitizeAdsImages(planPath, imgsDir, log = () => {}) {
  if (!fs.existsSync(planPath)) {
    return { planPath, total: 0, replaced: 0, nulled: 0, imgsAvailable: 0, scanned: false };
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  } catch (e) {
    log(`[sanitize-ads] could not parse ${path.basename(planPath)}: ${e.message}`);
    return { planPath, total: 0, replaced: 0, nulled: 0, imgsAvailable: 0, scanned: false };
  }

  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const cleanImgs = listCleanImgs(imgsDir);

  let replaced = 0;
  let nulled = 0;
  let cursor = 0;

  for (const scene of scenes) {
    if (!isAdsPath(scene.image)) continue;
    if (cleanImgs.length > 0) {
      scene.image = cleanImgs[cursor % cleanImgs.length];
      cursor += 1;
      replaced += 1;
    } else {
      scene.image = null;
      nulled += 1;
    }
  }

  if (replaced > 0 || nulled > 0) {
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    log(`[sanitize-ads] ${path.basename(planPath)}: ${replaced} replaced, ${nulled} nulled (imgs available: ${cleanImgs.length})`);
  }

  return {
    planPath,
    total: scenes.length,
    replaced,
    nulled,
    imgsAvailable: cleanImgs.length,
    scanned: true,
  };
}

module.exports = { sanitizeAdsImages, listCleanImgs, isAdsPath };
