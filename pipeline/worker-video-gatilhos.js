/**
 * worker-video-gatilhos.js — Template "gatilhos"
 *
 * Reads research_results.json, extracts ad_hooks + video_concepts + marketing_angles,
 * and generates for EACH hook:
 * - 3-5 carousel slides (PNG)
 * - 1 short video (<30s)
 *
 * Each hook gets its own subfolder under gatilhos/
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSlidePNG, resolvePreset, closeBrowser } = require('./render-slide-png');

function slugify(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
}

/**
 * Generate gatilhos (hooks) carousel + video batch from research data.
 * @param {object} opts - { projectRoot, outputDir, projectDir, taskName, stylePreset, ctaBrand, ctaAction, log }
 */
async function generateGatilhos(opts) {
  const {
    projectRoot, outputDir, projectDir, taskName,
    stylePreset = 'inema_hightech',
    ctaBrand = 'INEMA.CLUB', ctaAction = 'Acesse grátis',
    log,
  } = opts;

  const researchPath = path.resolve(projectRoot, outputDir, 'research_results.json');
  if (!fs.existsSync(researchPath)) {
    throw new Error(`research_results.json not found at ${researchPath}`);
  }

  const research = JSON.parse(fs.readFileSync(researchPath, 'utf-8'));
  const gatilhosDir = path.resolve(projectRoot, outputDir, 'gatilhos');
  fs.mkdirSync(gatilhosDir, { recursive: true });

  log(outputDir, 'video_pro', 'Template GATILHOS: extracting hooks from research...');

  // ── Extract hooks from multiple sources ─────────────────────────────

  const hooks = [];

  // From ad_hooks (strings)
  for (const hook of (research.ad_hooks || [])) {
    hooks.push({
      hook: typeof hook === 'string' ? hook : hook.text || hook.hook || '',
      source: 'ad_hook',
      emotion: '',
      cta: ctaAction,
    });
  }

  // From video_concepts (objects with hook, format, cta)
  for (const vc of (research.video_concepts || [])) {
    const hookText = vc.hook || vc.title || '';
    if (hookText && !hooks.find(h => h.hook === hookText)) {
      hooks.push({
        hook: hookText,
        source: 'video_concept',
        emotion: vc.narrative_framework || vc.narrative || '',
        cta: vc.cta || ctaAction,
        format: vc.format || '',
      });
    }
  }

  // From marketing_angles (objects with angle, emotion)
  for (const ma of (research.marketing_angles || [])) {
    const hookText = ma.angle || ma.positioning || '';
    if (hookText && !hooks.find(h => h.hook === hookText)) {
      hooks.push({
        hook: hookText,
        source: 'marketing_angle',
        emotion: ma.emotion || ma.why_it_works || '',
        cta: ma.cta || ctaAction,
      });
    }
  }

  if (hooks.length === 0) {
    log(outputDir, 'video_pro', 'GATILHOS: no hooks found in research_results.json');
    return { gatilhosDir, count: 0 };
  }

  log(outputDir, 'video_pro', `Found ${hooks.length} hooks to process`);

  // ── Style preset ────────────────────────────────────────────────────

  const styleDictPath = path.resolve(projectRoot, 'skills/video-engineering/style-dictionary.json');
  const preset = resolvePreset(stylePreset, styleDictPath);
  const imgsDir = path.resolve(projectRoot, outputDir, 'imgs');
  const assetsDir = path.resolve(projectRoot, projectDir, 'assets');

  // Collect background images
  const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const skipDirs = ['logo', 'logos', 'brand', 'icons'];
  const skipPatterns = /banner|logo_|oficial_|badge_|stats_|apresenta|convite|_texto|texto_|_text|clean_|semcoroa|interno_|premium_|inema_.*v\d|classico|gold_/i;
  const collectImages = (dir) => {
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
    return results;
  };
  const bgImages = [...collectImages(imgsDir), ...collectImages(assetsDir)];

  // ── Generate each hook ──────────────────────────────────────────────

  const renderScript = path.resolve(projectRoot, 'pipeline/render-video-ffmpeg.js');
  let completed = 0;

  for (let hi = 0; hi < hooks.length; hi++) {
    const h = hooks[hi];
    const hookSlug = slugify(h.hook) || `hook_${hi + 1}`;
    const hookDir = path.join(gatilhosDir, `hook_${String(hi + 1).padStart(2, '0')}_${hookSlug}`);
    fs.mkdirSync(hookDir, { recursive: true });

    log(outputDir, 'video_pro', `Gatilho ${hi + 1}/${hooks.length}: "${h.hook.slice(0, 50)}..."`);

    // Build 5 scene mini-plan (<30s)
    const scenes = [
      // Scene 1: Hook impact (text_card — narrativo style, big text)
      {
        id: 'hook', type: 'hook', visual_type: 'text_card',
        keyword: 'GATILHO', duration: 4,
        card_title: h.hook.slice(0, 80),
        card_body: '',
        narration: h.hook,
      },
      // Scene 2: Emotional trigger
      {
        id: 'emotion', type: 'problem', visual_type: 'text_card',
        keyword: h.emotion ? h.emotion.split(' ').slice(0, 2).join(' ').toUpperCase() : 'POR QUÊ',
        duration: 5,
        card_title: h.emotion?.slice(0, 60) || 'Isso muda tudo.',
        card_body: h.format?.slice(0, 80) || '',
        narration: h.emotion?.slice(0, 80) || 'Isso muda tudo para o seu negócio.',
      },
      // Scene 3: Photo breathing space
      {
        id: 'visual', type: 'transition', visual_type: 'photo',
        keyword: 'AÇÃO', duration: 3,
        narration: 'E você pode começar agora.',
      },
      // Scene 4: CTA
      {
        id: 'cta', type: 'cta', visual_type: 'cta',
        keyword: 'COMECE', duration: 5,
        cta_brand: ctaBrand,
        cta_action: h.cta || ctaAction,
        narration: h.cta || `Acesse ${ctaBrand} e comece agora.`,
      },
      // Scene 5: Silent hold
      {
        id: 'hold', type: 'cta', visual_type: 'cta',
        keyword: ctaBrand, duration: 3,
        cta_brand: ctaBrand,
        cta_action: '',
        narration: '',
      },
    ];

    // Gatilhos are visual-only for now — no TTS audio
    for (const s of scenes) s.narration = '';

    const totalDur = scenes.reduce((s, sc) => s + sc.duration, 0);

    const plan = {
      titulo: `Gatilho: ${h.hook.slice(0, 40)}`,
      video_length: totalDur,
      format: '9:16',
      width: 1080, height: 1920,
      voice: null,
      narration_file: null,
      music: null, music_volume: 0.15,
      scenes,
    };

    // Render slides
    const motionCycle = ['push-in', 'drift', 'breathe', 'zoom_in', 'ken-burns-in'];
    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si];
      const bgImage = bgImages.length > 0 ? bgImages[(hi * 5 + si) % bgImages.length] : null;
      const slidePath = path.join(hookDir, `carousel_${String(si + 1).padStart(2, '0')}.png`);

      try {
        await renderSlidePNG(scene, preset, bgImage, 1080, 1920, slidePath, 'narrativo');
        scene.image = slidePath;
        scene._slide = true;
        scene.motion = { type: motionCycle[si % motionCycle.length], intensity: 'moderate' };
      } catch (err) {
        log(outputDir, 'video_pro', `  Slide ${si} failed: ${err.message}`);
      }
    }

    // Save plan
    const planPath = path.join(hookDir, 'scene_plan.json');
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');

    // Render video
    const videoPath = path.join(hookDir, 'video.mp4');
    try {
      execFileSync('node', [renderScript, planPath, videoPath], {
        cwd: projectRoot, stdio: 'pipe', timeout: 120000,
      });
      log(outputDir, 'video_pro', `  Video rendered: ${path.basename(hookDir)}/video.mp4`);
      completed++;
    } catch (e) {
      log(outputDir, 'video_pro', `  Video render failed: ${e.message.slice(0, 150)}`);
    }
  }

  await closeBrowser();

  log(outputDir, 'video_pro', `GATILHOS complete: ${completed}/${hooks.length} videos rendered`);

  return {
    gatilhosDir,
    count: hooks.length,
    completed,
  };
}

module.exports = { generateGatilhos };
