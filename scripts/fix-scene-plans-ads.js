#!/usr/bin/env node
/**
 * fix-scene-plans-ads.js
 *
 * Aplica sanitizeAdsImages em scene_plan_motion.json existentes.
 * Útil pra corrigir campanhas antigas sem regenerar via /rerun cleanplan.
 *
 * Uso:
 *   node scripts/fix-scene-plans-ads.js prj/inema/outputs/c0097-... [more dirs]
 *   node scripts/fix-scene-plans-ads.js --maes   # atalho: 5 campanhas mães inema
 */

const fs = require('fs');
const path = require('path');
const { sanitizeAdsImages } = require('../pipeline/sanitize-scene-plan-ads');

const ROOT = path.resolve(__dirname, '..');

const MAES_SHORTCUT = [
  'prj/inema/outputs/c0097-dia_das_maes_2026',
  'prj/inema/outputs/c0098-dias_das_maes_2026',
  'prj/inema/outputs/c0099-dia_das_maes_2026',
  'prj/inema/outputs/c0100-dia_das_maes_2026',
  'prj/inema/outputs/c0101-dia_das_maes_2026',
];

function findScenePlans(campaignDir) {
  const videoDir = path.join(campaignDir, 'video');
  if (!fs.existsSync(videoDir)) return [];
  return fs.readdirSync(videoDir)
    .filter((f) => /_scene_plan_motion\.json$/.test(f))
    .map((f) => path.join(videoDir, f));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Uso: node scripts/fix-scene-plans-ads.js <campaign-dir> [more...] | --maes');
    process.exit(1);
  }

  const dirs = args[0] === '--maes'
    ? MAES_SHORTCUT.map((d) => path.resolve(ROOT, d))
    : args.map((a) => path.resolve(process.cwd(), a));

  let totalReplaced = 0;
  let totalNulled = 0;
  let totalScanned = 0;

  for (const campaignDir of dirs) {
    if (!fs.existsSync(campaignDir)) {
      console.log(`[skip] ${campaignDir} (não existe)`);
      continue;
    }
    const imgsDir = path.join(campaignDir, 'imgs');
    const plans = findScenePlans(campaignDir);
    if (plans.length === 0) {
      console.log(`[skip] ${path.basename(campaignDir)} (sem scene_plan_motion.json)`);
      continue;
    }
    console.log(`\n[${path.basename(campaignDir)}] ${plans.length} plan(s), imgs/ existe: ${fs.existsSync(imgsDir)}`);
    for (const planPath of plans) {
      const r = sanitizeAdsImages(planPath, imgsDir, (m) => console.log(`  ${m}`));
      if (r.scanned) {
        totalScanned += 1;
        totalReplaced += r.replaced;
        totalNulled += r.nulled;
        if (r.replaced === 0 && r.nulled === 0) {
          console.log(`  ${path.basename(planPath)}: clean (no ads/ paths)`);
        }
      }
    }
  }

  console.log(`\n=== Resumo ===`);
  console.log(`Scene plans escaneados: ${totalScanned}`);
  console.log(`Substituições (ads/ → imgs/): ${totalReplaced}`);
  console.log(`Nulled (imgs/ vazia → fundo sólido): ${totalNulled}`);
}

main();
