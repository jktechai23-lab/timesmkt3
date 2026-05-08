/**
 * worker-video-viral.js — Tipo "viral" (V1)
 *
 * Vídeo curto com pegada de Reels/TikTok:
 * - bg image full-frame da campanha (estilo ad)
 * - text overlay grande com palavra-chave em punch hook (cena 1, 0-3s)
 * - narração TTS (default Chatterbox/auto)
 * - música opcional (com ducking, controlado por flag music_enabled)
 * - captions opcionais (sentence-level baked no slide; word-timing salvo
 *   em caption_timing.json pra V2 com ASS karaoke ou Whisper)
 *
 * Lê hooks de research_results.json (mesmo extrator do gatilhos) e gera
 * 1 vídeo por hook em viral/v01_<slug>/.
 *
 * V2 features (não nesse arquivo):
 * - Word-by-word caption via ASS karaoke
 * - Whisper post-TTS pra timing perfeito
 * - Pattern interrupts (zoom in/out, color shifts)
 * - Multi-template (data_story/brand_film aplicáveis)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSlidePNG, resolvePreset, closeBrowser } = require('./render-slide-png');
const { rewritePainTrend } = require('./consumer-voice-rewriter');

function slugify(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
}

/**
 * Concatena N mp3s em um único arquivo, inserindo silêncio entre cada par.
 * (Cópia idêntica do gatilhos worker — manter funções locais por enquanto pra
 * não criar dependência circular. V2 pode extrair pra módulo audio-utils.js.)
 */
function concatPartsWithSilence(partFiles, silencesSec, outputFile) {
  const inputs = [];
  const filters = [];
  const concatLabels = [];
  let idx = 0;

  for (let i = 0; i < partFiles.length; i += 1) {
    inputs.push('-i', partFiles[i]);
    filters.push(`[${idx}:a]aresample=24000,aformat=sample_fmts=s16:channel_layouts=mono[p${i}]`);
    concatLabels.push(`[p${i}]`);
    idx += 1;

    const silence = silencesSec[i];
    if (i < partFiles.length - 1 && silence > 0) {
      inputs.push('-f', 'lavfi', '-t', String(silence), '-i', 'anullsrc=r=24000:cl=mono');
      filters.push(`[${idx}:a]aformat=sample_fmts=s16:channel_layouts=mono[s${i}]`);
      concatLabels.push(`[s${i}]`);
      idx += 1;
    }
  }

  const concatStr = `${concatLabels.join('')}concat=n=${concatLabels.length}:v=0:a=1[out]`;
  const filterComplex = [...filters, concatStr].join(';');

  execFileSync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-acodec', 'libmp3lame', '-b:a', '128k', '-ar', '24000', '-ac', '1',
    outputFile,
  ], { stdio: 'pipe', timeout: 60000 });
}

/**
 * Mede duração de um mp3 via ffprobe.
 */
function probeDurationSec(mp3Path) {
  try {
    const probe = execFileSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', mp3Path,
    ], { encoding: 'utf-8', timeout: 10000 }).trim();
    return parseFloat(probe) || 0;
  } catch {
    return 0;
  }
}

/**
 * Estima word timing (V1) — proporcional ao length da palavra dentro da
 * sentença, sentenças proporcionais à duração total do áudio.
 *
 * Espelha Phase 1.5 do worker-video-pro.js mas com granularidade word-level.
 *
 * Saída: { audioDuration, totalWords, words: [{word, start, end, scene_id}] }
 */
function estimateWordTiming(scriptParts, sceneIds, audioDuration, silencesSec = []) {
  const allWords = [];
  if (audioDuration <= 0 || scriptParts.length === 0) {
    return { audioDuration, totalWords: 0, words: [] };
  }

  // Estima duração de cada parte (sentença) proporcional ao word count.
  // Reserva tempo pros silêncios entre partes.
  const totalSilence = silencesSec.reduce((s, x) => s + x, 0);
  const speakDuration = Math.max(0.01, audioDuration - totalSilence);
  const wordCounts = scriptParts.map((s) => s.split(/\s+/).filter(Boolean).length);
  const totalWords = wordCounts.reduce((s, n) => s + n, 0);
  if (totalWords === 0) return { audioDuration, totalWords: 0, words: [] };

  let currentTime = 0;
  for (let pi = 0; pi < scriptParts.length; pi += 1) {
    const wc = wordCounts[pi];
    if (wc === 0) continue;
    const partDuration = (wc / totalWords) * speakDuration;
    const sceneId = sceneIds[pi] || `s${pi}`;

    // Distribui tempo entre palavras, com peso por length (palavras longas duram +)
    const words = scriptParts[pi].split(/\s+/).filter(Boolean);
    const totalLen = words.reduce((s, w) => s + Math.max(2, w.length), 0);
    let wt = currentTime;
    for (const w of words) {
      const weight = Math.max(2, w.length) / totalLen;
      const dur = partDuration * weight;
      allWords.push({
        word: w,
        start: parseFloat(wt.toFixed(3)),
        end: parseFloat((wt + dur).toFixed(3)),
        scene_id: sceneId,
        source: 'estimated',
      });
      wt += dur;
    }

    currentTime += partDuration;
    if (pi < silencesSec.length) currentTime += silencesSec[pi];
  }

  return { audioDuration, totalWords, words: allWords };
}

/**
 * Escolhe uma trilha de música. Prioridade:
 *   1. prj/<dir>/assets/music/*.mp3
 *   2. assets/music/*.mp3 (global)
 * Retorna path absoluto ou null.
 */
function pickMusicTrack(projectRoot, projectDir) {
  const candidates = [
    path.join(projectRoot, projectDir, 'assets', 'music'),
    path.join(projectRoot, 'assets', 'music'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f));
    if (files.length === 0) continue;
    // Pick first deterministically — V2 pode escolher por mood
    return path.join(dir, files[0]);
  }
  return null;
}

/**
 * Generate viral videos batch from research data.
 * @param {object} opts
 * @returns {Promise<{viralDir, count, completed}>}
 */
async function generateViral(opts) {
  const {
    projectRoot, outputDir, projectDir, taskName,
    stylePreset = 'inema_hightech',
    ctaBrand = 'INEMA.CLUB', ctaAction = 'Acesse grátis',
    videoAudio = 'narration',
    narrator = 'rachel',
    ttsProvider = 'auto',
    consumerRewrite = true,
    consumerPersona = '',
    musicEnabled = false,
    captionsEnabled = false,
    log,
  } = opts;

  const researchPath = path.resolve(projectRoot, outputDir, 'research_results.json');
  if (!fs.existsSync(researchPath)) {
    throw new Error(`research_results.json not found at ${researchPath}`);
  }

  const research = JSON.parse(fs.readFileSync(researchPath, 'utf-8'));
  const viralDir = path.resolve(projectRoot, outputDir, 'viral');
  fs.mkdirSync(viralDir, { recursive: true });

  log(outputDir, 'video_viral', `VIRAL V1: extracting hooks (music=${musicEnabled?'on':'off'}, caption=${captionsEnabled?'on':'off'})...`);

  // ── Fuzzy field resolver (espelha gatilhos worker) ──
  function findArray(obj, ...roots) {
    for (const root of roots) {
      if (Array.isArray(obj[root]) && obj[root].length > 0) return obj[root];
    }
    const normalize = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normalizedRoots = roots.map(normalize);
    for (const key of Object.keys(obj)) {
      if (!Array.isArray(obj[key]) || obj[key].length === 0) continue;
      const nk = normalize(key);
      for (const nr of normalizedRoots) {
        if (nk.includes(nr) || nr.includes(nk)) return obj[key];
      }
    }
    return [];
  }

  function findProp(obj, ...keys) {
    for (const k of keys) {
      const v = obj[k];
      if (v != null && v !== '') return v;
    }
    return '';
  }

  // ── Extract hooks ──
  const hooks = [];
  const adHooks = findArray(research, 'ad_hooks', 'hooks_de_anuncio', 'hooks_anuncios', 'hooks_anuncio', 'hooks');
  for (const hook of adHooks) {
    hooks.push({
      hook: typeof hook === 'string' ? hook : findProp(hook, 'text', 'hook', 'titulo', 'title'),
      source: 'ad_hook',
      emotion: '',
      cta: ctaAction,
    });
  }

  const videoConcepts = findArray(research, 'video_concepts', 'conceitos_de_video', 'conceitos_video', 'conceito_video');
  for (const vc of videoConcepts) {
    const hookText = findProp(vc, 'hook', 'title', 'titulo');
    if (hookText && !hooks.find((h) => h.hook === hookText)) {
      hooks.push({
        hook: hookText,
        source: 'video_concept',
        emotion: findProp(vc, 'narrative_framework', 'narrative', 'narrativa'),
        cta: vc.cta || ctaAction,
        format: findProp(vc, 'format', 'formato'),
      });
    }
  }

  const marketingAngles = findArray(research, 'marketing_angles', 'angulos_de_marketing', 'angulos_marketing', 'angulo_marketing');
  for (const ma of marketingAngles) {
    const hookText = findProp(ma, 'angle', 'angulo', 'titulo', 'title', 'positioning', 'posicionamento');
    if (hookText && !hooks.find((h) => h.hook === hookText)) {
      hooks.push({
        hook: hookText.length > 60 ? hookText.slice(0, 60) : hookText,
        source: 'marketing_angle',
        emotion: findProp(ma, 'emotion', 'why_it_works', 'narrativa', 'narrative'),
        cta: ma.cta || ctaAction,
      });
    }
  }

  if (hooks.length === 0) {
    log(outputDir, 'video_viral', 'VIRAL: no hooks found in research_results.json');
    return { viralDir, count: 0, completed: 0 };
  }

  log(outputDir, 'video_viral', `Found ${hooks.length} hooks to process`);

  // ── Style preset ──
  const styleDictPath = path.resolve(projectRoot, 'skills/video-engineering/style-dictionary.json');
  const preset = resolvePreset(stylePreset, styleDictPath);
  const imgsDir = path.resolve(projectRoot, outputDir, 'imgs');
  const assetsDir = path.resolve(projectRoot, projectDir, 'assets');

  // ── Background images (mesmo filtro do gatilhos: imgs/ da campanha primeiro) ──
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

  const campaignImages = collectImages(imgsDir);
  const assetImages = collectImages(assetsDir);
  const bgImages = campaignImages.length > 0 ? campaignImages : assetImages;

  if (bgImages.length === 0) {
    log(outputDir, 'video_viral', '⚠ No images found — using solid background');
  } else {
    log(outputDir, 'video_viral', `Background images: ${campaignImages.length} campaign, ${assetImages.length} assets → using ${bgImages.length}`);
  }

  // ── Music track ──
  let musicPath = null;
  if (musicEnabled) {
    musicPath = pickMusicTrack(projectRoot, projectDir);
    if (musicPath) {
      log(outputDir, 'video_viral', `Music track: ${path.relative(projectRoot, musicPath)}`);
    } else {
      log(outputDir, 'video_viral', '⚠ Music enabled but no track found in assets/music — skipping');
    }
  }

  // ── Supporting data ──
  const pains = findArray(research, 'consumer_motivations', 'motivacoes_do_consumidor', 'motivacoes_consumidor', 'motivacao_consumidor', 'pain_points', 'dores')
    .filter((p) => findProp(p, 'pain_point', 'motivation', 'dor', 'motivacao'));
  const trends = findArray(research, 'industry_trends', 'tendencias_do_setor', 'tendencias_mercado', 'tendencia_mercado', 'market_trends', 'tendencias')
    .filter((t) => findProp(t, 'trend', 'detail', 'tendencia', 'detalhe', 'titulo', 'descricao'));

  log(outputDir, 'video_viral', `Supporting data: ${pains.length} pains, ${trends.length} trends`);

  // ── Generate each viral ──
  const renderScript = path.resolve(projectRoot, 'pipeline/render-video-ffmpeg.js');
  const metaItems = [];
  let completed = 0;

  for (let hi = 0; hi < hooks.length; hi += 1) {
    const h = hooks[hi];
    const hookSlug = slugify(h.hook) || `v${hi + 1}`;
    const vNum = `v${String(hi + 1).padStart(2, '0')}`;
    const itemDir = path.join(viralDir, `${vNum}_${hookSlug}`);
    fs.mkdirSync(itemDir, { recursive: true });

    log(outputDir, 'video_viral', `Viral ${hi + 1}/${hooks.length}: "${h.hook.slice(0, 50)}..."`);

    const pain = pains[hi % Math.max(1, pains.length)] || {};
    const trend = trends[hi % Math.max(1, trends.length)] || {};

    // Consumer voice transformation (Layer A/B/C — igual gatilhos)
    let painCard, painBody, trendCard, trendBody;
    if (consumerRewrite) {
      const cv = await rewritePainTrend({
        hook: h.hook,
        pain,
        trend,
        persona: consumerPersona,
        ctaBrand,
        log: (m) => log(outputDir, 'video_viral', `  ${m}`),
      });
      painCard = cv.painCard;
      painBody = cv.painBody;
      trendCard = cv.trendCard;
      trendBody = cv.trendBody;
      if (cv.source !== 'fallback') {
        log(outputDir, 'video_viral', `  Consumer voice (${cv.source}): pain="${(painCard || '').slice(0, 40)}..."`);
      }
    } else {
      painCard = findProp(pain, 'pain_point', 'dor', 'motivation', 'motivacao', 'titulo', 'title');
      painBody = findProp(pain, 'emotional_trigger', 'gatilho_emocional', 'description', 'descricao', 'desejo');
      trendCard = findProp(trend, 'trend', 'tendencia', 'titulo', 'title');
      trendBody = findProp(trend, 'detail', 'descricao', 'description', 'detalhe');
    }

    // ── Punch hook keyword (cena 1, 0-3s) ──
    // Escolhe 2 palavras curtas mais "fortes" do hook (>3 chars), uppercase
    const hookWords = h.hook.split(/\s+/).filter((w) => w.length > 3).slice(0, 2).join(' ').toUpperCase() || 'ATENÇÃO';

    // ── Scene plan: 5 cenas curtas (~25-30s total) ──
    // Diferenças do gatilho:
    //  - Cena 1 (PUNCH HOOK): duration 3s (mais curto, mais punch), keyword grande sem card_title
    //  - Cenas usam visual_type='photo' quando captionsEnabled=false (foto + keyword overlay)
    //  - Cenas usam 'text_card' quando captionsEnabled=true (foto + texto cheio overlay)
    const captionVT = captionsEnabled ? 'text_card' : 'photo';
    const scenes = [
      {
        // Scene 1: PUNCH HOOK — frase de impacto, 3s
        id: 'punch_hook', type: 'hook', visual_type: captionVT,
        keyword: hookWords, duration: 3,
        card_title: captionsEnabled ? h.hook.slice(0, 80) : '',
        card_body: '',
        narration: '',
      },
      {
        // Scene 2: PROBLEMA
        id: 'problema', type: 'problem', visual_type: captionVT,
        keyword: painCard ? painCard.split(' ').filter((w) => w.length > 3).slice(0, 2).join(' ').toUpperCase() : 'PRA VOCÊ',
        duration: 5,
        card_title: captionsEnabled ? (painCard || '').slice(0, 60) || 'Você sente isso também.' : '',
        card_body: captionsEnabled ? (painBody || '').slice(0, 100) : '',
        narration: '',
      },
      {
        // Scene 3: PROVA
        id: 'prova', type: 'data', visual_type: captionVT,
        keyword: 'PRA VOCÊ', duration: 5,
        card_title: captionsEnabled ? (trendCard || '').slice(0, 60) : '',
        card_body: captionsEnabled ? (trendBody || '').slice(0, 100) : '',
        narration: '',
      },
      {
        // Scene 4: CTA
        id: 'cta', type: 'cta', visual_type: 'cta',
        keyword: 'COMECE AGORA', duration: 4,
        cta_brand: ctaBrand,
        cta_action: h.cta || ctaAction,
        narration: '',
      },
      {
        // Scene 5: HOLD silencioso
        id: 'hold', type: 'cta', visual_type: 'cta',
        keyword: ctaBrand, duration: 3,
        cta_brand: ctaBrand,
        cta_action: '',
        narration: '',
      },
    ];

    // ── Narration ──
    const wantsNarration = videoAudio === 'narration' || videoAudio === 'both';
    let narrationFile = null;
    let captionTimingPath = null;

    if (wantsNarration) {
      const scriptParts = [
        h.hook,
        painCard || '',
        trendCard ? trendCard.slice(0, 80) : '',
        `Acesse ${ctaBrand}.`,
      ].filter((p) => p && p.trim().length > 0).map((p) => p.trim());

      // Set narration text per scene (4 partes mapeiam pras 4 primeiras cenas)
      scenes[0].narration = h.hook;
      scenes[1].narration = painCard || painBody || '';
      scenes[2].narration = (trendCard || '').slice(0, 80);
      scenes[3].narration = `Acesse ${ctaBrand}.`;
      scenes[4].narration = '';

      narrationFile = path.join(itemDir, 'narration.mp3');
      const totalChars = scriptParts.reduce((sum, p) => sum + p.length, 0);
      if (totalChars > 20) {
        const tmpDir = path.join(itemDir, '_tts_tmp');
        try {
          fs.mkdirSync(tmpDir, { recursive: true });
          const generateAudio = path.resolve(projectRoot, 'pipeline/generate-audio.js');
          const partFiles = [];

          for (let pi = 0; pi < scriptParts.length; pi += 1) {
            const partFile = path.join(tmpDir, `p${pi}.mp3`);
            const args = [generateAudio, partFile, scriptParts[pi], narrator];
            if (ttsProvider && ttsProvider !== 'auto') args.push('--provider', ttsProvider);
            execFileSync('node', args, { cwd: projectRoot, stdio: 'pipe', timeout: 60000 });
            partFiles.push(partFile);
          }

          const silencesSec = [];
          for (let pi = 0; pi < partFiles.length - 1; pi += 1) {
            silencesSec.push(pi === partFiles.length - 2 ? 0.6 : 0.4);
          }

          concatPartsWithSilence(partFiles, silencesSec, narrationFile);
          log(outputDir, 'video_viral', `  Narration generated (${scriptParts.length} frases + pausas)`);

          // ── Caption timing JSON (sempre gerado, usado em V2 — barato) ──
          const audioDur = probeDurationSec(narrationFile);
          const sceneIds = ['punch_hook', 'problema', 'prova', 'cta'];
          const timing = estimateWordTiming(scriptParts, sceneIds, audioDur, silencesSec);
          captionTimingPath = path.join(itemDir, 'caption_timing.json');
          fs.writeFileSync(captionTimingPath, JSON.stringify(timing, null, 2));
          log(outputDir, 'video_viral', `  Caption timing: ${timing.totalWords} words in ${audioDur.toFixed(1)}s`);
        } catch (e) {
          log(outputDir, 'video_viral', `  Narration failed: ${e.message.slice(0, 100)}`);
          narrationFile = null;
        } finally {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        }
      } else {
        narrationFile = null;
      }
    } else {
      for (const s of scenes) s.narration = '';
    }

    const totalDur = scenes.reduce((s, sc) => s + sc.duration, 0);

    const plan = {
      titulo: `Viral: ${h.hook.slice(0, 40)}`,
      video_length: totalDur,
      format: '9:16',
      width: 1080, height: 1920,
      voice: wantsNarration ? narrator : null,
      narration_file: narrationFile,
      music: musicPath ? path.relative(projectRoot, musicPath) : null,
      music_volume: musicPath ? 0.12 : 0,  // mais baixo que default (0.15) pra não competir com narração
      scenes,
    };

    // ── Render slides (template "viral") ──
    const motionCycle = ['zoom_in', 'push-in', 'drift', 'breathe', 'ken-burns-in'];
    for (let si = 0; si < scenes.length; si += 1) {
      const scene = scenes[si];
      const bgImage = bgImages.length > 0 ? bgImages[(hi * 5 + si) % bgImages.length] : null;
      const slidePath = path.join(itemDir, `slide_${String(si + 1).padStart(2, '0')}.png`);

      try {
        await renderSlidePNG(scene, preset, bgImage, 1080, 1920, slidePath, 'viral');
        scene.image = slidePath;
        scene._slide = true;
        scene.motion = { type: motionCycle[si % motionCycle.length], intensity: 'moderate' };
      } catch (err) {
        log(outputDir, 'video_viral', `  Slide ${si} failed: ${err.message}`);
      }
    }

    // ── Save plan ──
    const planPath = path.join(itemDir, 'scene_plan.json');
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');

    // ── Render video ──
    const videoPath = path.join(itemDir, 'video.mp4');
    try {
      execFileSync('node', [renderScript, planPath, videoPath], {
        cwd: projectRoot, stdio: 'pipe', timeout: 120000,
      });
      log(outputDir, 'video_viral', `  Video rendered: ${path.basename(itemDir)}/video.mp4`);
      completed += 1;
      metaItems.push({
        id: vNum,
        slug: hookSlug,
        duration_sec: totalDur,
        scenes: scenes.length,
        music: Boolean(musicPath),
        captions: captionsEnabled,
      });
    } catch (e) {
      log(outputDir, 'video_viral', `  Video render failed: ${e.message.slice(0, 150)}`);
    }
  }

  await closeBrowser();

  // ── Save batch _meta.json ──
  const metaPath = path.join(viralDir, '_meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    type: 'viral',
    version: 1,
    generated_at: new Date().toISOString(),
    music_enabled: musicEnabled,
    captions_enabled: captionsEnabled,
    music_track: musicPath ? path.relative(projectRoot, musicPath) : null,
    hooks_total: hooks.length,
    videos_generated: completed,
    videos: metaItems,
  }, null, 2));

  log(outputDir, 'video_viral', `VIRAL complete: ${completed}/${hooks.length} videos rendered`);

  return {
    viralDir,
    count: hooks.length,
    completed,
  };
}

/**
 * Factory que cria o handler BullMQ pra video_viral.
 * Espelha createWorkerVideoProHandler (worker-video-pro.js) mas mais enxuto —
 * tipo viral é determinístico, não invoca Claude pra scene plan.
 */
function createWorkerVideoViralHandler({ projectRoot, log, readBrandContext }) {
  return async function handleVideoViral(job) {
    const {
      task_name, task_date, output_dir, project_dir,
      music_enabled = false,
      captions_enabled = false,
    } = job.data;

    log(output_dir, 'video_viral', `Starting viral worker (music=${music_enabled}, caption=${captions_enabled})`);

    try {
      // Resolve CTA brand a partir do research ou brand_identity
      let ctaBrandName = '';
      const resPath = path.resolve(projectRoot, output_dir, 'research_results.json');
      if (fs.existsSync(resPath)) {
        try { ctaBrandName = JSON.parse(fs.readFileSync(resPath, 'utf-8')).brand || ''; } catch {}
      }
      if (!ctaBrandName) {
        const brandCtx = (readBrandContext ? readBrandContext(projectRoot, project_dir) : null) || {};
        ctaBrandName = brandCtx.brand || '';
      }
      const ctaBrand = ctaBrandName ? `${ctaBrandName.toUpperCase()}.CLUB` : 'INEMA.CLUB';

      const result = await generateViral({
        projectRoot,
        outputDir: output_dir,
        projectDir: project_dir,
        taskName: task_name,
        stylePreset: job.data.style_preset || 'inema_hightech',
        videoAudio: job.data.video_audio || 'narration',
        narrator: job.data.narrator || 'rachel',
        ttsProvider: job.data.tts_provider || 'auto',
        consumerRewrite: job.data.consumer_rewrite !== false,
        consumerPersona: job.data.consumer_persona || job.data.target_audience || '',
        musicEnabled: music_enabled,
        captionsEnabled: captions_enabled,
        ctaBrand,
        ctaAction: job.data.cta_action || 'Acesse grátis',
        log,
      });

      log(output_dir, 'video_viral', `Viral complete: ${result.completed}/${result.count} videos`);
      log(output_dir, 'video_viral', 'Completed successfully.');
      return { status: 'completed', type: 'viral', ...result };
    } catch (e) {
      log(output_dir, 'video_viral', `Viral failed: ${e.message}`);
      return { status: 'failed', reason: e.message };
    }
  };
}

module.exports = { generateViral, createWorkerVideoViralHandler };
