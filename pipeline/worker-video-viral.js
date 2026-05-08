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
const { execFileSync, spawn } = require('child_process');
const { renderSlidePNG, resolvePreset, closeBrowser } = require('./render-slide-png');
const { rewritePainTrend } = require('./consumer-voice-rewriter');

const CLAUDE_PATH = '/home/nmaldaner/.local/bin/claude';

/**
 * Invoca claude -p e retorna stdout. Timeout default 120s.
 */
function callClaudeP(prompt, { timeoutMs = 120000, model = 'sonnet' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_PATH, [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', model,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: 'spawn error' }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }));
    setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, timeoutMs);
  });
}

function extractJSON(text) {
  if (!text) return null;
  // procura primeiro objeto JSON balanceado
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

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
 * Lê creative_brief.json + brand_identity.md + copy/ pra montar contexto de
 * campanha que alimenta o renderer (cores, pill text) e o LLM (grounding).
 */
function loadCampaignContext(projectRoot, projectDir, outputDir) {
  const ctx = {
    brand_pill: 'INEMA.CLUB',
    colors: ['#C87941', '#F5C87A', '#1A1A2E', '#FFFFFF'],
    mood: '',
    typography_mood: '',
    photography_style: '',
    narrative_arc: [],
    approved_ctas: [],
    campaign_theme: '',
    emotional_hook: '',
    positioning: '',
    brand_identity: '',
    copy_carousel_texts: [],
    copy_video_narration: [],
  };

  // creative_brief.json
  try {
    const briefPath = path.resolve(projectRoot, outputDir, 'creative', 'creative_brief.json');
    if (fs.existsSync(briefPath)) {
      const brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
      const vd = brief.visual_direction || {};
      if (Array.isArray(vd.dominant_colors) && vd.dominant_colors.length >= 2) ctx.colors = vd.dominant_colors;
      if (vd.mood) ctx.mood = String(vd.mood);
      if (vd.typography_mood) ctx.typography_mood = String(vd.typography_mood);
      if (vd.photography_style) ctx.photography_style = String(vd.photography_style);
      if (Array.isArray(brief.narrative_arc)) ctx.narrative_arc = brief.narrative_arc;
      if (Array.isArray(brief.approved_ctas)) ctx.approved_ctas = brief.approved_ctas;
      if (brief.campaign_theme) ctx.campaign_theme = String(brief.campaign_theme);
      if (brief.emotional_hook) ctx.emotional_hook = String(brief.emotional_hook);
      if (brief.positioning_statement) ctx.positioning = String(brief.positioning_statement);
    }
  } catch {}

  // brand_identity.md (pra grounding do LLM)
  try {
    const biPath = path.resolve(projectRoot, projectDir, 'knowledge', 'brand_identity.md');
    if (fs.existsSync(biPath)) {
      ctx.brand_identity = fs.readFileSync(biPath, 'utf-8').slice(0, 6000);
    }
  } catch {}

  // copy/ — textos aprovados (referência de tom, não copia)
  try {
    const copyDir = path.resolve(projectRoot, outputDir, 'copy');
    if (fs.existsSync(copyDir)) {
      for (const f of fs.readdirSync(copyDir)) {
        if (f.endsWith('.json')) {
          try {
            const j = JSON.parse(fs.readFileSync(path.join(copyDir, f), 'utf-8'));
            if (Array.isArray(j.carousel_texts)) ctx.copy_carousel_texts = j.carousel_texts.slice(0, 8);
            if (Array.isArray(j.video_narration)) ctx.copy_video_narration = j.video_narration.slice(0, 5);
          } catch {}
        }
      }
    }
  } catch {}

  // brand_pill: brand do research ou default
  try {
    const resPath = path.resolve(projectRoot, outputDir, 'research_results.json');
    if (fs.existsSync(resPath)) {
      const r = JSON.parse(fs.readFileSync(resPath, 'utf-8'));
      if (r.brand) ctx.brand_pill = `${String(r.brand).toUpperCase()}.CLUB`;
    }
  } catch {}

  return ctx;
}

/**
 * Decide nº de cenas pelo target duration. Inclui sempre punch_hook + cta + hold.
 * 20s = 5 cenas (atual), 30s = 7 cenas, 45s = 9 cenas, 60s+ = 11-12 cenas.
 */
function planSceneCount(targetSeconds) {
  if (targetSeconds <= 22) return 5;
  if (targetSeconds <= 32) return 7;
  if (targetSeconds <= 47) return 9;
  if (targetSeconds <= 65) return 11;
  return 12;
}

/**
 * Bias do template visual no LLM scene plan:
 *  - viral (default): mix natural photo + text_card
 *  - data_story: priorize chart e text_card com numbers
 *  - narrativo: priorize text_card grande com copy emocional
 *  - brand_film: priorize photo com texto minimal
 *  - explainer: priorize list e text_card numbered
 */
function templateBiasGuidance(template) {
  const t = (template || 'viral').toLowerCase();
  if (t === 'data_story') {
    return 'BIAS DE VISUAL_TYPE: 1 cena chart com chart_type "bar" e chart_data [{label,value}] (use research.trends como fonte; quando não houver numero, gere escala 10/8/6/4). Restante text_card com numeros e stats.';
  }
  if (t === 'narrativo') {
    return 'BIAS DE VISUAL_TYPE: maioria text_card com card_title curto e impactante. Use photo apenas em punch_hook. Foco no peso da palavra escrita.';
  }
  if (t === 'brand_film') {
    return 'BIAS DE VISUAL_TYPE: maioria photo, texto minimal (só keyword). Atmosfera cinematográfica, deixa a imagem respirar.';
  }
  if (t === 'explainer') {
    return 'BIAS DE VISUAL_TYPE: 2-3 cenas list com list_items numerados (3 a 5 items cada). Use text_card pra contexto entre listas.';
  }
  // viral (default)
  return 'BIAS DE VISUAL_TYPE: punch_hook = photo com keyword grande. 2-3 cenas text_card com card_title+card_body emocional. 1 cena pode ser photo só com keyword. Termina sempre em cta + hold.';
}

/**
 * Gera scene plan emocional via Claude — grounded em brand+research+copy.
 * Retorna array de cenas ou null se falhar.
 */
async function generateScenePlanLLM({
  hook, hookSource, painCard, painBody, trendCard, trendBody,
  ctx, template, targetDuration, ctaBrand, ctaAction, log,
}) {
  const sceneCount = planSceneCount(targetDuration);
  const guidance = templateBiasGuidance(template);

  const arcGuide = ctx.narrative_arc.length > 0
    ? `ARCO NARRATIVO DA CAMPANHA (referência de TOM, não copia literal):\n${ctx.narrative_arc.map((s, i) => `${i+1}. ${s}`).join('\n')}`
    : '';

  const ctaGuide = ctx.approved_ctas.length > 0
    ? `CTAS APROVADOS (use um na cena CTA):\n${ctx.approved_ctas.slice(0, 5).map((c) => `- ${c}`).join('\n')}`
    : '';

  const copyHint = ctx.copy_carousel_texts.length > 0
    ? `TEXTOS DA CAMPANHA (referência de pegada, NÃO copia):\n${ctx.copy_carousel_texts.slice(0, 5).map((t) => typeof t === 'string' ? `- ${t}` : `- ${t.text || t.headline || JSON.stringify(t).slice(0, 100)}`).join('\n')}`
    : '';

  const brandHint = ctx.brand_identity
    ? `BRAND IDENTITY (siga o tom):\n${ctx.brand_identity.slice(0, 1500)}\n\n`
    : '';

  const prompt = `Você é um copywriter brasileiro especialista em copy de Reels/TikTok que viralizam.

CAMPANHA: ${ctx.campaign_theme || 'campanha de marketing'}
${ctx.positioning ? `POSICIONAMENTO: ${ctx.positioning.slice(0, 300)}\n` : ''}${ctx.emotional_hook ? `EMOÇÃO ALVO: ${ctx.emotional_hook.slice(0, 200)}\n` : ''}${ctx.mood ? `MOOD VISUAL: ${ctx.mood.slice(0, 200)}\n` : ''}${ctx.typography_mood ? `TIPOGRAFIA: ${ctx.typography_mood.slice(0, 200)}\n` : ''}
${brandHint}${arcGuide ? arcGuide + '\n\n' : ''}${copyHint ? copyHint + '\n\n' : ''}${ctaGuide ? ctaGuide + '\n\n' : ''}HOOK PRINCIPAL DESSE VÍDEO:
"${hook}"
(fonte: ${hookSource})

DADOS DE APOIO (já reescritos em voz do consumidor):
- Pain: ${painCard || '(sem pain)'}
- Pain body: ${painBody || ''}
- Trend: ${trendCard || '(sem trend)'}
- Trend body: ${trendBody || ''}

TAREFA: Escreva um scene_plan JSON pra UM vídeo Reels vertical 9:16 de ~${targetDuration}s com ${sceneCount} cenas que:

1. PRIMEIRA CENA = punch_hook (3-4s): keyword GIGANTE em uppercase 2-3 palavras impactantes, type "hook", visual_type "photo" (só a keyword sobre foto)
2. CENAS DO MEIO (${sceneCount - 3} cenas): construa arco emocional — vulnerabilidade nomeada → contraste → revelação → prova. Use power words PT-BR: NUNCA, EXISTE, AINDA DÁ TEMPO, AGORA, HOJE, VOCÊ. Direct address (você/sua). Frases curtas, ritmo de Reels.
3. PENÚLTIMA CENA = cta (4-5s): visual_type "cta", cta_brand "${ctaBrand}", cta_action de um dos CTAs aprovados
4. ÚLTIMA CENA = hold (3s): visual_type "cta" com cta_brand só, cta_action vazio

${guidance}

REGRAS DE TEXTO:
- card_title: max 60 chars, frase de impacto, sem emojis
- card_body: max 110 chars, complementa o title
- keyword: max 25 chars, uppercase, 2-3 palavras
- narration: 1 frase POR cena (10-25 palavras), conversacional, soa natural quando lido em voz alta
- TODAS as cenas devem ter narration (exceto hold que pode ficar vazio)
- Tom MUITO PRÓXIMO da campanha — leia BRAND IDENTITY e respeite

OUTPUT: APENAS JSON válido, no formato:
{
  "scenes": [
    {
      "id": "punch_hook",
      "type": "hook",
      "visual_type": "photo",
      "keyword": "PALAVRA GIGANTE",
      "duration": 3,
      "card_title": "",
      "card_body": "",
      "narration": "frase falada nessa cena."
    },
    {
      "id": "cena_2",
      "type": "problem",
      "visual_type": "text_card",
      "keyword": "DOR",
      "duration": 5,
      "card_title": "Frase impacto",
      "card_body": "Detalhe.",
      "narration": "..."
    }
    /* ... */,
    {
      "id": "cta",
      "type": "cta",
      "visual_type": "cta",
      "keyword": "AGORA",
      "duration": 4,
      "cta_brand": "${ctaBrand}",
      "cta_action": "Acesse grátis",
      "narration": "..."
    },
    {
      "id": "hold",
      "type": "cta",
      "visual_type": "cta",
      "keyword": "${ctaBrand}",
      "duration": 3,
      "cta_brand": "${ctaBrand}",
      "cta_action": "",
      "narration": ""
    }
  ]
}

Garanta que durations somem aproximadamente ${targetDuration}s. SOMENTE JSON, sem markdown nem texto fora.`;

  log(`  [scene-plan-llm] requesting ${sceneCount} scenes for ${targetDuration}s...`);
  const t0 = Date.now();
  const result = await callClaudeP(prompt, { timeoutMs: 120000 });
  const elapsed = Math.round((Date.now() - t0) / 1000);

  if (!result.ok) {
    log(`  [scene-plan-llm] failed (${elapsed}s): ${result.stderr.slice(0, 80)}`);
    return null;
  }

  const parsed = extractJSON(result.stdout);
  if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    log(`  [scene-plan-llm] no valid JSON in output (${elapsed}s)`);
    return null;
  }

  log(`  [scene-plan-llm] ok (${elapsed}s, ${parsed.scenes.length} cenas)`);
  return parsed.scenes;
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
    videoTemplate = 'viral',  // 'viral' (default) | 'narrativo' | 'data_story' | 'brand_film' | 'explainer'
    targetDuration = 30,       // segundos; default 30 (V2 spec, V1 era 20)
    log,
  } = opts;

  // Resolve template: 'auto' → 'viral' (default do tipo)
  const slideTemplate = (!videoTemplate || videoTemplate === 'auto') ? 'viral' : videoTemplate;

  // ── Carrega contexto da campanha (brand_identity, creative_brief, copy) ──
  const ctx = loadCampaignContext(projectRoot, projectDir, outputDir);
  const brandForRender = {
    pill_text: ctaBrand || ctx.brand_pill || 'INEMA.CLUB',
    colors: ctx.colors,
  };

  const researchPath = path.resolve(projectRoot, outputDir, 'research_results.json');
  if (!fs.existsSync(researchPath)) {
    throw new Error(`research_results.json not found at ${researchPath}`);
  }

  const research = JSON.parse(fs.readFileSync(researchPath, 'utf-8'));
  const viralDir = path.resolve(projectRoot, outputDir, 'viral');
  fs.mkdirSync(viralDir, { recursive: true });

  log(outputDir, 'video_viral', `VIRAL V1: extracting hooks (template=${slideTemplate}, music=${musicEnabled?'on':'off'}, caption=${captionsEnabled?'on':'off'})...`);

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

    // ── Punch hook keyword fallback ──
    const hookWords = h.hook.split(/\s+/).filter((w) => w.length > 3).slice(0, 2).join(' ').toUpperCase() || 'ATENÇÃO';

    // ── Scene plan: tenta LLM grounded (C+); fallback hardcoded se falhar ──
    let scenes = await generateScenePlanLLM({
      hook: h.hook,
      hookSource: h.source,
      painCard, painBody, trendCard, trendBody,
      ctx,
      template: slideTemplate,
      targetDuration,
      ctaBrand,
      ctaAction: h.cta || ctaAction,
      log: (m) => log(outputDir, 'video_viral', m),
    });

    if (!scenes || scenes.length === 0) {
      log(outputDir, 'video_viral', `  [scene-plan] LLM failed — using hardcoded 5-cena fallback`);
      const captionVT = captionsEnabled ? 'text_card' : 'photo';
      scenes = [
        {
          id: 'punch_hook', type: 'hook', visual_type: captionVT,
          keyword: hookWords, duration: 3,
          card_title: captionsEnabled ? h.hook.slice(0, 80) : '',
          card_body: '',
          narration: h.hook,
        },
        {
          id: 'problema', type: 'problem', visual_type: captionVT,
          keyword: painCard ? painCard.split(' ').filter((w) => w.length > 3).slice(0, 2).join(' ').toUpperCase() : 'PRA VOCÊ',
          duration: 5,
          card_title: captionsEnabled ? (painCard || '').slice(0, 60) || 'Você sente isso também.' : '',
          card_body: captionsEnabled ? (painBody || '').slice(0, 100) : '',
          narration: painCard || painBody || '',
        },
        {
          id: 'prova', type: 'data', visual_type: captionVT,
          keyword: 'PRA VOCÊ', duration: 5,
          card_title: captionsEnabled ? (trendCard || '').slice(0, 60) : '',
          card_body: captionsEnabled ? (trendBody || '').slice(0, 100) : '',
          narration: (trendCard || '').slice(0, 80),
        },
        {
          id: 'cta', type: 'cta', visual_type: 'cta',
          keyword: 'COMECE AGORA', duration: 4,
          cta_brand: ctaBrand,
          cta_action: h.cta || ctaAction,
          narration: `Acesse ${ctaBrand}.`,
        },
        {
          id: 'hold', type: 'cta', visual_type: 'cta',
          keyword: ctaBrand, duration: 3,
          cta_brand: ctaBrand,
          cta_action: '',
          narration: '',
        },
      ];
    }

    // Injeta brand context em cada cena (renderer usa pra brand pill + cores)
    for (let si = 0; si < scenes.length; si += 1) {
      scenes[si].brand = brandForRender;
      scenes[si].scene_index = si;
      scenes[si].scene_total = scenes.length;
    }

    // ── Narration ──
    const wantsNarration = videoAudio === 'narration' || videoAudio === 'both';
    let narrationFile = null;
    let captionTimingPath = null;

    if (wantsNarration) {
      // Narração é construída a partir do narration.scene.narration (LLM já gerou).
      // Cenas hold (última, narration vazia) ficam silenciosas.
      const sceneNarrations = scenes.map((s, i) => ({
        idx: i,
        id: s.id || `s${i}`,
        text: String(s.narration || '').trim(),
      })).filter((p) => p.text.length > 0);

      const scriptParts = sceneNarrations.map((p) => p.text);
      const sceneIds = sceneNarrations.map((p) => p.id);

      narrationFile = path.join(itemDir, 'narration.mp3');
      const totalChars = scriptParts.reduce((sum, p) => sum + p.length, 0);
      if (totalChars > 20 && scriptParts.length > 0) {
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

          const audioDur = probeDurationSec(narrationFile);
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

    // ── Render slides (template determinado por slideTemplate) ──
    const motionCycle = ['zoom_in', 'push-in', 'drift', 'breathe', 'ken-burns-in'];
    for (let si = 0; si < scenes.length; si += 1) {
      const scene = scenes[si];
      const bgImage = bgImages.length > 0 ? bgImages[(hi * scenes.length + si) % bgImages.length] : null;
      const slidePath = path.join(itemDir, `slide_${String(si + 1).padStart(2, '0')}.png`);

      try {
        await renderSlidePNG(scene, preset, bgImage, 1080, 1920, slidePath, slideTemplate);
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
      viral_duration = null,
    } = job.data;

    const targetDuration = (typeof viral_duration === 'number' && viral_duration >= 15 && viral_duration <= 90)
      ? viral_duration
      : 30;

    log(output_dir, 'video_viral', `Starting viral worker (music=${music_enabled}, caption=${captions_enabled}, duration=${targetDuration}s)`);

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
        videoTemplate: job.data.video_template || 'viral',
        targetDuration,
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
