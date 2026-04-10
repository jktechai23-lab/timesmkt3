/**
 * worker-video-report.js — Template "report"
 *
 * Reads research_results.json and automatically generates:
 * - Carousel slides (PNG) with key statistics and charts
 * - 1 video with all slides
 * - Copies interactive_report.html
 *
 * No Claude agent needed — data is already structured in JSON.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSlidePNG, renderAllSlides, resolvePreset, closeBrowser } = require('./render-slide-png');

function slugify(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

/**
 * Generate report carousel + video from research data.
 * @param {object} opts - { projectRoot, outputDir, projectDir, taskName, stylePreset, videoAudio, narrator, ttsProvider, log }
 */
async function generateReport(opts) {
  const {
    projectRoot, outputDir, projectDir, taskName,
    stylePreset = 'inema_hightech',
    videoAudio = 'narration', // 'narration' | 'none' | 'music'
    narrator = 'bella',
    ttsProvider = 'auto',
    log,
  } = opts;

  const researchPath = path.resolve(projectRoot, outputDir, 'research_results.json');
  if (!fs.existsSync(researchPath)) {
    throw new Error(`research_results.json not found at ${researchPath}`);
  }

  const research = JSON.parse(fs.readFileSync(researchPath, 'utf-8'));
  const reportDir = path.resolve(projectRoot, outputDir, 'report');
  fs.mkdirSync(reportDir, { recursive: true });

  log(outputDir, 'video_pro', 'Template REPORT: generating from research data...');

  // Copy interactive_report.html
  const htmlSrc = path.resolve(projectRoot, outputDir, 'interactive_report.html');
  if (fs.existsSync(htmlSrc)) {
    fs.copyFileSync(htmlSrc, path.join(reportDir, 'interactive_report.html'));
    log(outputDir, 'video_pro', 'Copied interactive_report.html to report/');
  }

  // ── Build scene plan from research data ─────────────────────────────

  const scenes = [];
  const brandRaw = research.brand || taskName;
  const brand = brandRaw.toUpperCase();
  const brandUrl = `${brand}.CLUB`;

  // Scene 1: Hook
  scenes.push({
    id: 'hook_01', type: 'hook', visual_type: 'photo',
    keyword: 'OS DADOS FALAM', duration: 2,
    narration: `Os dados da pesquisa de ${brand} revelam oportunidades surpreendentes.`,
  });

  // Scene 2: Industry trends (chart)
  if (research.industry_trends?.length > 0) {
    const trends = research.industry_trends.slice(0, 4);
    scenes.push({
      id: 'trend_01', type: 'data', visual_type: 'chart',
      keyword: 'TENDÊNCIAS', duration: 7,
      chart_type: 'bar',
      chart_title: 'Principais Tendências do Setor',
      chart_data: trends.map((t, i) => ({
        label: (t.trend || '').slice(0, 25),
        value: t.intensity || t.relevance_score || (10 - i * 2),
      })),
      narration: trends[0]?.detail?.slice(0, 100) || 'As tendências mostram crescimento acelerado.',
    });
  }

  // Scene 3: Consumer motivations (chart — pain intensity)
  if (research.consumer_motivations?.length > 0) {
    const pains = research.consumer_motivations.slice(0, 5);
    scenes.push({
      id: 'pain_01', type: 'data', visual_type: 'chart',
      keyword: 'DORES DO MERCADO', duration: 7,
      chart_type: 'bar',
      chart_title: 'Intensidade das Dores (1-10)',
      chart_data: pains.map(p => ({
        label: (p.pain_point || p.motivation || '').slice(0, 20),
        value: p.intensity || 7,
      })),
      narration: pains[0]?.description?.slice(0, 100) || 'As dores mais intensas do público-alvo.',
    });
  }

  // Scene 4: Market opportunity (text_card)
  const opp = research.market_opportunity || research.opportunities || {};
  if (opp.summary || opp.size_estimate) {
    scenes.push({
      id: 'opp_01', type: 'insight', visual_type: 'text_card',
      keyword: 'OPORTUNIDADE', duration: 6,
      card_title: opp.summary?.slice(0, 60) || 'Oportunidade de Mercado',
      card_body: opp.size_estimate?.slice(0, 120) || opp.urgency?.slice(0, 120) || '',
      narration: opp.summary?.slice(0, 100) || 'Uma oportunidade significativa no mercado.',
    });
  }

  // Scene 5: Competitor gaps (text_card)
  if (research.competitor_messaging?.length > 0) {
    const comp = research.competitor_messaging[0];
    scenes.push({
      id: 'comp_01', type: 'insight', visual_type: 'text_card',
      keyword: 'CONCORRÊNCIA', duration: 6,
      card_title: `Gap: ${(comp.competitor || comp.competitor_type || '').slice(0, 30)}`,
      card_body: (comp.weakness || comp.gap || comp.inema_gap || '').slice(0, 120),
      narration: (comp.weakness || comp.gap || '').slice(0, 100),
    });
  }

  // Scene 6: Marketing angles (list)
  if (research.marketing_angles?.length > 0) {
    scenes.push({
      id: 'angles_01', type: 'product', visual_type: 'list',
      keyword: 'ÂNGULOS DE ATAQUE', duration: 8,
      list_title: 'Melhores Posicionamentos',
      list_items: research.marketing_angles.slice(0, 5).map(a => a.angle || a.positioning || ''),
      list_numbered: true,
      narration: 'Os ângulos de marketing mais eficazes para esta campanha.',
    });
  }

  // Scene 7: Content topics (list)
  if (research.content_topics?.length > 0) {
    scenes.push({
      id: 'topics_01', type: 'product', visual_type: 'list',
      keyword: 'TÓPICOS VIRAIS', duration: 8,
      list_title: 'Temas com Maior Potencial',
      list_items: research.content_topics.slice(0, 5).map(t => typeof t === 'string' ? t.slice(0, 60) : (t.topic || '').slice(0, 60)),
      list_numbered: false,
      narration: 'Os tópicos de conteúdo com maior potencial de engajamento.',
    });
  }

  // Scene 8: CTA
  scenes.push({
    id: 'cta_01', type: 'cta', visual_type: 'cta',
    keyword: 'DADOS COMPLETOS', duration: 4,
    cta_brand: brandUrl,
    cta_action: 'Veja o relatório completo',
    narration: `Acesse o relatório completo em ${brand}.`,
  });

  // Scene 9: Silent hold
  scenes.push({
    id: 'hold_01', type: 'cta', visual_type: 'cta',
    keyword: brand.toUpperCase(), duration: 3,
    cta_brand: brandUrl,
    cta_action: '',
    narration: '',
  });

  // ── Narration: build script from scene content ────────────────────────
  const wantsNarration = videoAudio === 'narration' || videoAudio === 'both';
  let narrationFile = null;

  if (wantsNarration) {
    // Build narration script from scene card_title + card_body
    const scriptParts = scenes
      .filter(s => s.type !== 'cta' && (s.card_title || s.list_title || s.keyword))
      .map(s => {
        if (s.card_title && s.card_body) return `${s.card_title}. ${s.card_body}`;
        if (s.card_title) return s.card_title;
        if (s.list_title && s.list_items?.length) return `${s.list_title}: ${s.list_items.slice(0, 3).join(', ')}`;
        return '';
      })
      .filter(Boolean);

    const script = scriptParts.join('. ').slice(0, 2000);
    const audioDir = path.resolve(projectRoot, outputDir, 'report');
    narrationFile = path.join(audioDir, 'report_narration.mp3');

    if (script.length > 20) {
      log(outputDir, 'video_pro', `Generating report narration (${script.length} chars, voice: ${narrator})...`);
      try {
        const generateAudio = path.resolve(projectRoot, 'pipeline/generate-audio.js');
        const args = [generateAudio, narrationFile, script, narrator];
        if (ttsProvider && ttsProvider !== 'auto') args.push('--provider', ttsProvider);
        execFileSync('node', args, { cwd: projectRoot, stdio: 'pipe', timeout: 120000 });
        log(outputDir, 'video_pro', `Report narration generated: ${path.basename(narrationFile)}`);
      } catch (e) {
        log(outputDir, 'video_pro', `Report narration failed: ${e.message.slice(0, 150)}`);
        narrationFile = null;
      }
    } else {
      narrationFile = null;
    }

    // Set narration text per scene (for timing sync)
    for (let si = 0; si < scenes.length; si++) {
      const s = scenes[si];
      if (s.type === 'cta' || (!s.card_title && !s.list_title)) {
        s.narration = '';
      } else if (s.card_title && s.card_body) {
        s.narration = `${s.card_title}. ${s.card_body}`;
      } else {
        s.narration = s.card_title || s.list_title || '';
      }
    }
  } else {
    // Mudo — clear all narration
    for (const s of scenes) s.narration = '';
  }

  // Calculate total duration
  const totalDur = scenes.reduce((s, sc) => s + sc.duration, 0);

  const plan = {
    titulo: `Relatório de Pesquisa — ${brand}`,
    video_length: totalDur,
    format: '9:16',
    width: 1080,
    height: 1920,
    voice: wantsNarration ? narrator : null,
    narration_file: narrationFile,
    music: null,
    music_volume: 0.15,
    scenes,
  };

  // Save scene plan
  const planPath = path.join(reportDir, 'report_scene_plan.json');
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
  log(outputDir, 'video_pro', `Report scene plan: ${scenes.length} scenes, ${totalDur}s`);

  // ── Render slides ─────────────────────────────────────────────────────

  const styleDictPath = path.resolve(projectRoot, 'skills/video-engineering/style-dictionary.json');
  const preset = resolvePreset(stylePreset, styleDictPath);
  const imgsDir = path.resolve(projectRoot, outputDir, 'imgs');
  const assetsDir = path.resolve(projectRoot, projectDir, 'assets');
  const slidesDir = path.join(reportDir, 'slides');
  fs.mkdirSync(slidesDir, { recursive: true });

  log(outputDir, 'video_pro', 'Rendering report slides...');
  const pngMap = await renderAllSlides(plan, preset, imgsDir, assetsDir, 1080, 1920, slidesDir, 'data_story');

  // Update plan with slide paths + motion
  const motionCycle = ['zoom_in', 'pan_right', 'drift', 'ken-burns-in', 'push-in', 'breathe'];
  for (const [idx, pngPath] of Object.entries(pngMap)) {
    plan.scenes[idx].image = pngPath;
    plan.scenes[idx]._slide = true;
    plan.scenes[idx].motion = { type: motionCycle[idx % motionCycle.length], intensity: 'moderate' };
  }
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');

  // Save carousels (copy slides as carousel PNGs)
  for (const [idx, pngPath] of Object.entries(pngMap)) {
    const carouselName = `report_carousel_${String(Number(idx) + 1).padStart(2, '0')}.png`;
    fs.copyFileSync(pngPath, path.join(reportDir, carouselName));
  }
  log(outputDir, 'video_pro', `Report carousels: ${Object.keys(pngMap).length} slides saved`);

  // ── Render video ──────────────────────────────────────────────────────

  const videoPath = path.join(reportDir, 'report_video.mp4');
  const renderScript = path.resolve(projectRoot, 'pipeline/render-video-ffmpeg.js');

  log(outputDir, 'video_pro', 'Rendering report video...');
  try {
    execFileSync('node', [renderScript, planPath, videoPath], {
      cwd: projectRoot, stdio: 'pipe', timeout: 300000,
    });
    log(outputDir, 'video_pro', `Report video rendered: ${videoPath}`);
  } catch (e) {
    log(outputDir, 'video_pro', `Report video render failed: ${e.message.slice(0, 200)}`);
  }

  await closeBrowser();

  return {
    reportDir,
    carousels: Object.keys(pngMap).length,
    video: fs.existsSync(videoPath) ? videoPath : null,
  };
}

module.exports = { generateReport };
