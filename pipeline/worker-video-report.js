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
const { rewritePainTrend } = require('./consumer-voice-rewriter');

function slugify(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

// Deriva o "assunto" do report a partir das fontes mais informativas.
// Prioridade: research.subject/tema → audience → task_name humanizado → brand.
function deriveReportSubject(research, taskName, brand) {
  const fromResearch = research.subject || research.tema || research.campaign_topic || research.topic || '';
  if (fromResearch && String(fromResearch).trim()) return String(fromResearch).trim();

  const audience = research.target_audience || research.niche || research.publico_alvo || '';
  if (audience && String(audience).trim()) return String(audience).trim();

  // Humaniza task_name: c0099-dia_das_maes_2026 → "Dia das Mães 2026"
  if (taskName) {
    const cleaned = String(taskName).replace(/^c\d+[-_]/i, '').replace(/[_-]+/g, ' ').trim();
    if (cleaned) {
      return cleaned
        .split(' ')
        .map((w) => w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
        .join(' ');
    }
  }
  return brand || 'a campanha';
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
    narrator = 'rachel',
    ttsProvider = 'auto',
    consumerRewrite = true,    // reescreve pain/trend pro ângulo do consumidor (usa research consumer_voice se houver, senão claude -p)
    consumerPersona = '',       // ex: "filho adulto homenageando mãe", "gestor de PME"
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

  // ── Normalize field names (research may use EN or PT keys) ──────────
  const r = {
    trends: research.industry_trends || research.tendencias_do_setor || [],
    pains: research.consumer_motivations || research.motivacoes_do_consumidor || [],
    competitors: research.competitor_messaging || research.mensagens_dos_concorrentes || [],
    angles: research.marketing_angles || research.angulos_de_marketing || [],
    topics: research.content_topics || research.topicos_de_conteudo || [],
    hooks: research.ad_hooks || research.hooks_de_anuncio || [],
    opportunity: research.market_opportunity || research.opportunities || research.metricas_de_mercado || {},
  };

  // ── Build scene plan from research data ─────────────────────────────

  const scenes = [];
  const brandRaw = research.brand || research.empresa_origem || '';
  const brand = brandRaw ? brandRaw.toUpperCase() : 'INEMA';
  const brandUrl = `${brand}.CLUB`;
  const audience = research.target_audience || research.niche || '';

  // ── Consumer voice rewrite (Layer A or B) ─────────────────────────
  // Reescreve top pain + second pain + top trend pro ângulo do cliente final.
  // Usa o título do report como "hook" pra dar contexto à reescrita.
  const reportSubject0 = deriveReportSubject(research, taskName, brand);
  const topTrendRaw = (r.trends)[0] || {};
  const topPainRaw = (r.pains)[0] || {};
  const secondPainRaw = (r.pains)[1] || {};

  let cv1 = null;
  let cv2 = null;
  if (consumerRewrite) {
    const heroHook = topTrendRaw.trend || topTrendRaw.tendencia ||
      `Você quer entender o que está acontecendo em ${reportSubject0}.`;

    cv1 = await rewritePainTrend({
      hook: heroHook,
      pain: topPainRaw,
      trend: topTrendRaw,
      persona: consumerPersona,
      ctaBrand: `${brand}.CLUB`,
      log: (m) => log(outputDir, 'video_pro', `  ${m}`),
    });

    if (secondPainRaw && Object.keys(secondPainRaw).length > 0) {
      cv2 = await rewritePainTrend({
        hook: heroHook,
        pain: secondPainRaw,
        trend: topTrendRaw,
        persona: consumerPersona,
        ctaBrand: `${brand}.CLUB`,
        log: (m) => log(outputDir, 'video_pro', `  ${m}`),
      });
    }

    if (cv1 && cv1.source !== 'fallback') {
      log(outputDir, 'video_pro', `  Report consumer voice (${cv1.source}): trend="${cv1.trendCard.slice(0, 40)}..." pain="${cv1.painCard.slice(0, 40)}..."`);
    }
  }

  // ── Scene 0: Título do report — propósito do vídeo ─────────────────
  const reportSubject = reportSubject0;
  scenes.push({
    id: 'title_00', type: 'title', visual_type: 'text_card',
    keyword: 'ANÁLISE DE CONEXÃO', duration: 4,
    card_title: `Análise da Conexão Report com ${reportSubject}`,
    card_body: `Estudo de mercado e oportunidades para ${brand}`,
    narration: `Análise da conexão report com ${reportSubject}.`,
  });

  // ── Scene 1: Hook — grab attention with consumer-voice trend ───────
  const topTrend = topTrendRaw;
  const hookText = (cv1?.trendCard) ||
    topTrend?.trend || topTrend?.tendencia ||
    'Algo mudou. E talvez você já tenha sentido.';
  scenes.push({
    id: 'hook_01', type: 'hook', visual_type: 'text_card',
    keyword: 'VOCÊ SABIA?', duration: 3,
    card_title: hookText,
    card_body: '',
    narration: hookText,
  });

  // ── Scene 2: The real problem — consumer-voice pain ────────────────
  const topPain = topPainRaw;
  if (topPain && Object.keys(topPain).length > 0) {
    const painTitle = (cv1?.painCard) ||
      topPain.pain_point || topPain.dor || topPain.motivation || topPain.motivacao || '';
    const painBody = (cv1?.painBody) ||
      topPain.description || topPain.descricao || topPain.emotional_trigger || topPain.gatilho_emocional || '';
    scenes.push({
      id: 'problem_01', type: 'problem', visual_type: 'text_card',
      keyword: 'PRA VOCÊ', duration: 6,
      card_title: painTitle,
      card_body: painBody,
      narration: `${painTitle}. ${painBody}`,
    });
  }

  // ── Scene 3: Data that proves the problem — chart ──────────────────
  if (r.trends?.length >= 2) {
    const trends = r.trends.slice(0, 4);
    scenes.push({
      id: 'data_01', type: 'data', visual_type: 'chart',
      keyword: 'OS NÚMEROS', duration: 8,
      chart_type: 'bar',
      chart_title: 'O que os dados mostram',
      chart_data: trends.map((t, i) => ({
        label: (t.trend || '').slice(0, 30),
        value: t.intensity || t.relevance_score || (10 - i * 2),
      })),
      narration: trends.map(t => t.trend || '').join('. '),
    });
  }

  // ── Scene 4: More pain — consumer-voice ───────────────────────────
  const secondPain = secondPainRaw;
  if (secondPain && Object.keys(secondPain).length > 0) {
    const painTitle = (cv2?.painCard) ||
      secondPain.pain_point || secondPain.dor || secondPain.motivation || '';
    const trigger = (cv2?.painBody) ||
      secondPain.emotional_trigger || secondPain.gatilho_emocional || secondPain.description || secondPain.descricao || '';
    scenes.push({
      id: 'stake_01', type: 'problem', visual_type: 'text_card',
      keyword: 'O QUE MUDA PRA VOCÊ', duration: 6,
      card_title: painTitle,
      card_body: trigger,
      narration: `${painTitle}. ${trigger}`,
    });
  }

  // ── Scene 5: What competitors are missing — your advantage ─────────
  if (r.competitors?.length > 0) {
    const comp = r.competitors[0];
    const gap = comp.weakness || comp.fraqueza || comp.gap || comp.lacuna || comp.inema_gap || '';
    const compName = comp.competitor || comp.concorrente || comp.competitor_type || comp.tipo || 'a concorrência';
    scenes.push({
      id: 'advantage_01', type: 'insight', visual_type: 'text_card',
      keyword: 'SUA VANTAGEM', duration: 6,
      card_title: `O que ${compName} não oferece`,
      card_body: gap,
      narration: `${compName} ${gap}`,
    });
  }

  // ── Scene 6: The solution — what we offer (list of benefits) ───────
  if (r.angles?.length > 0) {
    scenes.push({
      id: 'solution_01', type: 'solution', visual_type: 'list',
      keyword: 'A SOLUÇÃO', duration: 8,
      list_title: `O que ${brand} oferece para você`,
      list_items: r.angles.slice(0, 4).map(a => a.angle || a.angulo || a.positioning || a.posicionamento || ''),
      list_numbered: true,
      narration: r.angles.slice(0, 3).map(a => a.angle || '').join('. '),
    });
  }

  // ── Scene 7: Social proof — topics that are trending ───────────────
  if (r.topics?.length > 0) {
    const topics = r.topics.slice(0, 4).map(t => typeof t === 'string' ? t : (t.topic || t.topico || ''));
    scenes.push({
      id: 'proof_01', type: 'proof', visual_type: 'list',
      keyword: 'O QUE FUNCIONA', duration: 8,
      list_title: 'Temas que mais engajam hoje',
      list_items: topics,
      list_numbered: false,
      narration: `Os temas que mais funcionam: ${topics.slice(0, 2).join(' e ')}.`,
    });
  }

  // ── Scene 8: Urgency — market opportunity ──────────────────────────
  const opp = research.market_opportunity || research.opportunities || {};
  if (opp.summary || opp.urgency) {
    scenes.push({
      id: 'urgency_01', type: 'urgency', visual_type: 'text_card',
      keyword: 'AGORA', duration: 5,
      card_title: opp.urgency || 'O momento é agora',
      card_body: opp.summary || '',
      narration: `${opp.urgency || 'A janela está aberta'}. ${opp.summary || ''}`,
    });
  }

  // ── Scene 9: CTA — clear brand + action ────────────────────────────
  scenes.push({
    id: 'cta_01', type: 'cta', visual_type: 'cta',
    keyword: 'COMECE AGORA', duration: 4,
    cta_brand: brandUrl,
    cta_action: 'Acesse grátis',
    narration: `Acesse ${brandUrl} e comece agora. É gratuito.`,
  });

  // ── Scene 10: Silent hold ──────────────────────────────────────────
  scenes.push({
    id: 'hold_01', type: 'cta', visual_type: 'cta',
    keyword: brandUrl, duration: 3,
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
