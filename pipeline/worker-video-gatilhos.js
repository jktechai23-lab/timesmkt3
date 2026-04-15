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
    videoAudio = 'narration', // 'narration' | 'none' | 'music'
    narrator = 'rachel',
    ttsProvider = 'auto',
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

  // ── Extract hooks from multiple sources (support EN + PT field names) ──

  const hooks = [];

  // From ad_hooks / hooks_de_anuncio (strings)
  const adHooks = research.ad_hooks || research.hooks_de_anuncio || [];
  for (const hook of adHooks) {
    hooks.push({
      hook: typeof hook === 'string' ? hook : hook.text || hook.hook || '',
      source: 'ad_hook',
      emotion: '',
      cta: ctaAction,
    });
  }

  // From video_concepts / conceitos_de_video (objects with hook, format, cta)
  for (const vc of (research.video_concepts || research.conceitos_de_video || [])) {
    const hookText = vc.hook || vc.title || vc.titulo || '';
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

  // From marketing_angles / angulos_de_marketing (objects with angle, emotion)
  for (const ma of (research.marketing_angles || research.angulos_de_marketing || [])) {
    const hookText = ma.angle || ma.angulo || ma.positioning || ma.posicionamento || '';
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

  // Collect background images — PRIORITY: campaign images (imgs/) that are about the subject
  // Only fall back to assets/ if no campaign images exist
  // If nothing clean is available, use null (solid bg from preset)
  const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const skipPatterns = /banner|logo_|oficial_|badge_|stats_|apresenta|convite|_texto|texto_|_text|clean_|semcoroa|interno_|premium_|inema_.*v\d|classico|gold_/i;
  const skipDirs = ['logo', 'logos', 'brand', 'icons'];
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

  // Campaign images ONLY (they match the topic and are clean — no text)
  // NEVER use ads/ (carousels have text baked in — overlay on top = unreadable)
  // assets/ as last resort but filtered (no logos/banners/text)
  // If nothing clean → solid background (no image)
  const campaignImages = collectImages(imgsDir);
  const assetImages = collectImages(assetsDir);
  const bgImages = campaignImages.length > 0
    ? campaignImages
    : assetImages;

  if (bgImages.length === 0) {
    log(outputDir, 'video_pro', '⚠ No images found for gatilhos — using solid background');
  } else {
    log(outputDir, 'video_pro', `Background images: ${campaignImages.length} campaign, ${assetImages.length} assets → using ${bgImages.length}`);
  }

  // ── Extract supporting data for enriching hooks ──────────────────────

  const pains = (research.consumer_motivations || research.motivacoes_do_consumidor || []).filter(p => p.pain_point || p.motivation || p.dor || p.motivacao);
  const trends = (research.industry_trends || research.tendencias_do_setor || []).filter(t => t.trend || t.detail || t.tendencia || t.detalhe);

  log(outputDir, 'video_pro', `Supporting data: ${pains.length} pain points, ${trends.length} trends`);

  // ── Generate each hook ──────────────────────────────────────────────

  const renderScript = path.resolve(projectRoot, 'pipeline/render-video-ffmpeg.js');
  let completed = 0;

  for (let hi = 0; hi < hooks.length; hi++) {
    const h = hooks[hi];
    const hookSlug = slugify(h.hook) || `g${hi + 1}`;
    const gNum = `g${String(hi + 1).padStart(2, '0')}`;
    const hookDir = path.join(gatilhosDir, `${gNum}_${hookSlug}`);
    fs.mkdirSync(hookDir, { recursive: true });

    log(outputDir, 'video_pro', `Gatilho ${hi + 1}/${hooks.length}: "${h.hook.slice(0, 50)}..."`);

    // Match hook to a related pain point (cycle through available)
    const pain = pains[hi % pains.length] || {};
    const painText = pain.pain_point || pain.dor || pain.motivation || pain.motivacao || '';
    const painTrigger = pain.emotional_trigger || pain.gatilho_emocional || pain.description || pain.descricao || '';

    // Match hook to a related data point (cycle through available)
    const trend = trends[hi % trends.length] || {};
    const trendText = trend.trend || trend.tendencia || '';
    const trendDetail = trend.detail || trend.descricao || '';

    // Extract a keyword from the hook (first 2-3 impactful words)
    const hookWords = h.hook.split(/\s+/).filter(w => w.length > 3).slice(0, 2).join(' ').toUpperCase() || 'ATENÇÃO';

    // Build 5 scene mini-plan (<30s) — hook → dor → prova → CTA → hold
    const scenes = [
      // Scene 1: HOOK — frase de impacto (scroll-stopper)
      {
        id: 'hook', type: 'hook', visual_type: 'text_card',
        keyword: hookWords, duration: 4,
        card_title: h.hook.slice(0, 80),
        card_body: '',
        narration: '',
      },
      // Scene 2: PROBLEMA — a dor que o hook endereça
      {
        id: 'problema', type: 'problem', visual_type: 'text_card',
        keyword: painText ? painText.split(' ').slice(0, 2).join(' ').toUpperCase() : 'O PROBLEMA',
        duration: 5,
        card_title: painText.slice(0, 60) || 'O mercado mudou.',
        card_body: painTrigger.slice(0, 100) || '',
        narration: '',
      },
      // Scene 3: PROVA — dado que sustenta (do research trends)
      {
        id: 'prova', type: 'data', visual_type: trendText ? 'text_card' : 'photo',
        keyword: 'OS DADOS',
        duration: 5,
        card_title: trendText.slice(0, 60) || '',
        card_body: trendDetail.slice(0, 100) || '',
        narration: '',
      },
      // Scene 4: CTA — marca + ação clara
      {
        id: 'cta', type: 'cta', visual_type: 'cta',
        keyword: 'COMECE AGORA', duration: 4,
        cta_brand: ctaBrand,
        cta_action: h.cta || ctaAction,
        narration: '',
      },
      // Scene 5: HOLD — CTA silencioso
      {
        id: 'hold', type: 'cta', visual_type: 'cta',
        keyword: ctaBrand, duration: 3,
        cta_brand: ctaBrand,
        cta_action: '',
        narration: '',
      },
    ];

    // ── Narration per hook ──────────────────────────────────────────
    const wantsNarration = videoAudio === 'narration' || videoAudio === 'both';
    let hookNarrationFile = null;

    if (wantsNarration) {
      // Build narration: hook text + pain + trend (short, <30s spoken)
      const scriptParts = [
        h.hook,
        painText ? painText : '',
        trendText ? trendText.slice(0, 80) : '',
        `Acesse ${ctaBrand}.`,
      ].filter(Boolean);
      const script = scriptParts.join('. ').slice(0, 500);

      // Set narration text per scene
      scenes[0].narration = h.hook;
      scenes[1].narration = painText || painTrigger || '';
      scenes[2].narration = trendText.slice(0, 80) || '';
      scenes[3].narration = `Acesse ${ctaBrand}.`;
      scenes[4].narration = '';

      hookNarrationFile = path.join(hookDir, 'narration.mp3');
      if (script.length > 20) {
        try {
          const generateAudio = path.resolve(projectRoot, 'pipeline/generate-audio.js');
          const args = [generateAudio, hookNarrationFile, script, narrator];
          if (ttsProvider && ttsProvider !== 'auto') args.push('--provider', ttsProvider);
          execFileSync('node', args, { cwd: projectRoot, stdio: 'pipe', timeout: 60000 });
          log(outputDir, 'video_pro', `  Narration generated: ${path.basename(hookDir)}/narration.mp3`);
        } catch (e) {
          log(outputDir, 'video_pro', `  Narration failed: ${e.message.slice(0, 100)}`);
          hookNarrationFile = null;
        }
      } else {
        hookNarrationFile = null;
      }
    } else {
      for (const s of scenes) s.narration = '';
    }

    const totalDur = scenes.reduce((s, sc) => s + sc.duration, 0);

    const plan = {
      titulo: `Gatilho: ${h.hook.slice(0, 40)}`,
      video_length: totalDur,
      format: '9:16',
      width: 1080, height: 1920,
      voice: wantsNarration ? narrator : null,
      narration_file: hookNarrationFile,
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
