#!/usr/bin/env node
// One-shot: re-render slides + video for c0104 viral.
// Mantém scene_plan.json e narration.mp3 existentes.
// Usa fix de text='#FFFFFF' aplicado em pipeline/render-slide-png.js viralSlide().

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const { renderSlidePNG, resolvePreset, closeBrowser } = require(path.join(projectRoot, 'pipeline/render-slide-png'));

const outputDir = 'prj/inema/outputs/c0104-dia_das_maes_presente';
const viralDir = path.join(projectRoot, outputDir, 'viral');
const imgsDir = path.join(projectRoot, outputDir, 'imgs');
const stylePreset = 'inema_hightech';
const slideTemplate = 'viral';
const renderScript = path.join(projectRoot, 'pipeline/render-video-ffmpeg.js');

const styleDictPath = path.join(projectRoot, 'skills/video-engineering/style-dictionary.json');
const preset = resolvePreset(stylePreset, styleDictPath);

// bgImages mesma lógica do worker
const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];
const skipPatterns = /banner|logo_|oficial_|badge_|stats_|apresenta|convite|_texto|texto_|_text|clean_|semcoroa|interno_|premium_|inema_.*v\d|classico|gold_/i;
const skipDirs = ['logo', 'logos', 'brand', 'icons'];

function collectImages(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const results = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skipDirs.includes(entry.name.toLowerCase())) continue;
        walk(path.join(d, entry.name));
      } else if (imgExts.includes(path.extname(entry.name).toLowerCase())) {
        if (skipPatterns.test(entry.name)) continue;
        results.push(path.join(d, entry.name));
      }
    }
  };
  walk(dir);
  return results.sort();
}

const bgImages = collectImages(imgsDir);
console.log(`bgImages: ${bgImages.length} found in imgs/`);

const subdirs = fs.readdirSync(viralDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('v'))
  .map((e) => e.name)
  .sort();

console.log(`Viral subdirs: ${subdirs.length}`);

let okSlides = 0, failSlides = 0, okVideos = 0, failVideos = 0;

(async () => {
  for (let hi = 0; hi < subdirs.length; hi += 1) {
    const sub = subdirs[hi];
    const itemDir = path.join(viralDir, sub);
    const planPath = path.join(itemDir, 'scene_plan.json');
    if (!fs.existsSync(planPath)) {
      console.log(`  [${sub}] no scene_plan.json — skipping`);
      continue;
    }
    let plan;
    try {
      plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    } catch (e) {
      console.log(`  [${sub}] plan parse failed: ${e.message}`);
      continue;
    }
    const scenes = plan.scenes || [];

    for (let si = 0; si < scenes.length; si += 1) {
      const scene = scenes[si];
      const bgImage = bgImages.length > 0 ? bgImages[(hi * scenes.length + si) % bgImages.length] : null;
      const slidePath = path.join(itemDir, `slide_${String(si + 1).padStart(2, '0')}.png`);
      try {
        await renderSlidePNG(scene, preset, bgImage, 1080, 1920, slidePath, slideTemplate);
        scene.image = slidePath;
        scene._slide = true;
        okSlides += 1;
      } catch (e) {
        console.log(`  [${sub}] slide ${si + 1} fail: ${e.message.slice(0, 120)}`);
        failSlides += 1;
      }
    }
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');

    const videoPath = path.join(itemDir, 'video.mp4');
    try {
      execFileSync('node', [renderScript, planPath, videoPath], {
        cwd: projectRoot, stdio: 'pipe', timeout: 180000,
      });
      console.log(`  [${sub}] OK (hi=${hi}, ${scenes.length} scenes)`);
      okVideos += 1;
    } catch (e) {
      console.log(`  [${sub}] video render fail: ${(e.stderr?.toString() || e.message).slice(0, 200)}`);
      failVideos += 1;
    }
  }

  await closeBrowser();
  console.log(`\nDone. slides ok=${okSlides} fail=${failSlides} | videos ok=${okVideos} fail=${failVideos}`);
})();
