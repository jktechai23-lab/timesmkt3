/**
 * audio-enrich.js — Opt-in: adiciona música de fundo e/ou SFX a um scene plan.
 *
 * **Não é parte do fluxo default** de geração de vídeo. É invocado manualmente
 * (ou por um worker que o usuário explicitamente habilitar) quando queremos
 * enriquecer o áudio de uma campanha específica.
 *
 * Dois pontos de extensão:
 *  1. addBackgroundMusic(scenePlanPath, options)
 *     - Busca no Freesound por mood/query, baixa preview, adiciona `music` e
 *       `music_volume` ao scene plan. Render pega automaticamente (já suportado
 *       em render-video-ffmpeg.js).
 *
 *  2. addSceneSfx(scenePlanPath, sceneIndexOrId, options)
 *     - Busca SFX no Pixabay (fallback Freesound), baixa, adiciona
 *       `sfx: [{file, offset_s, volume}]` na cena escolhida. Render precisa
 *       suportar este campo (extensão feita em render-video-ffmpeg.js).
 *
 * Design principles:
 *  - Opt-in: nada acontece sem chamada explícita
 *  - Idempotente: re-rodar com mesma query não duplica arquivos (checa existência)
 *  - Sem exigir network key: usa providers com fallback (Pixabay → Freesound)
 *  - Registra licença no manifest.json da pasta audio/ da campanha (rastreabilidade)
 *
 * Uso programático:
 *   const { addBackgroundMusic, addSceneSfx } = require('./audio-enrich');
 *   await addBackgroundMusic('prj/inema/outputs/c0050/scene_plan.json', {
 *     query: 'tech ambient', mood: 'upbeat', minDuration: 30, maxDuration: 120,
 *   });
 *   await addSceneSfx('prj/inema/outputs/c0050/scene_plan.json', 0, {
 *     query: 'notification pop', volume: 0.6,
 *   });
 *
 * Uso CLI (ver scripts/add-music.js e scripts/add-sfx.js).
 */

const fs = require('fs');
const path = require('path');
const { searchMusic, downloadPreview } = require('./search-music-freesound');
const { fetchSFX } = require('../media/sfx-fetcher');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────────────

function loadScenePlan(scenePlanPath) {
  const abs = path.resolve(PROJECT_ROOT, scenePlanPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`scene plan not found: ${abs}`);
  }
  const plan = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  return { abs, plan };
}

function saveScenePlan(abs, plan) {
  fs.writeFileSync(abs, JSON.stringify(plan, null, 2));
}

function resolveAudioDir(scenePlanAbs) {
  // Padrão timesmkt3: scene plans ficam em {campaign}/video/ ou {campaign}/scene_plan.json,
  // áudios em {campaign}/audio/. Resolvemos o dir de áudio subindo 1-2 níveis.
  const scenePlanDir = path.dirname(scenePlanAbs);
  // Se scene plan está em .../video/, áudio é irmão ../audio/
  if (path.basename(scenePlanDir) === 'video') {
    return path.join(path.dirname(scenePlanDir), 'audio');
  }
  // Senão, áudio é subpasta audio/ adjacente
  return path.join(scenePlanDir, 'audio');
}

function slugify(text, maxLen = 30) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen);
}

function appendLicenseManifest(audioDir, entry) {
  const manifestPath = path.join(audioDir, 'audio-enrich-manifest.json');
  let manifest = { entries: [] };
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch (_) {}
  }
  manifest.entries = manifest.entries || [];
  manifest.entries.push({ ...entry, added_at: new Date().toISOString() });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function relFromPlan(scenePlanAbs, targetAbs) {
  // Retorna path relativo ao PROJECT_ROOT (que é o que o render-video-ffmpeg espera)
  return path.relative(PROJECT_ROOT, targetAbs).split(path.sep).join('/');
}

// ── (b) Background Music ───────────────────────────────────────────────────

/**
 * Busca trilha no Freesound e adiciona ao scene plan como `music`.
 *
 * @param {string} scenePlanPath - path do scene plan (abs ou relativo ao PROJECT_ROOT)
 * @param {object} options
 * @param {string} options.query - termo de busca (ex: "tech ambient", "corporate")
 * @param {string} [options.mood] - tag adicional (upbeat, calm, epic, tense...)
 * @param {number} [options.minDuration=15] - duração mínima em segundos
 * @param {number} [options.maxDuration=180] - duração máxima em segundos
 * @param {number} [options.volume=0.15] - volume da música no mix final (0.0-1.0)
 * @param {boolean} [options.force=false] - se true, baixa mesmo se já existir música
 */
async function addBackgroundMusic(scenePlanPath, options = {}) {
  const {
    query,
    mood = '',
    minDuration = 15,
    maxDuration = 180,
    volume = 0.15,
    force = false,
  } = options;

  if (!query) throw new Error('addBackgroundMusic: options.query is required');

  const { abs, plan } = loadScenePlan(scenePlanPath);
  const audioDir = resolveAudioDir(abs);
  fs.mkdirSync(audioDir, { recursive: true });

  // Idempotência: se já tem música no scene plan e !force, aborta
  if (!force && (plan.music || plan.background_music)) {
    console.log(`[audio-enrich] scene plan já tem música (${plan.music || plan.background_music}). Use { force: true } para substituir.`);
    return { skipped: true, existing: plan.music || plan.background_music };
  }

  console.log(`[audio-enrich] buscando música: "${query}" (mood=${mood || 'any'}, ${minDuration}-${maxDuration}s)`);
  const sound = await searchMusic(query, mood, minDuration, maxDuration);
  if (!sound) {
    console.warn('[audio-enrich] nenhuma música encontrada. Scene plan não foi modificado.');
    return { skipped: true, reason: 'no_results' };
  }

  const downloadedPath = await downloadPreview(sound, audioDir);
  if (!downloadedPath) {
    console.warn('[audio-enrich] falha no download. Scene plan não foi modificado.');
    return { skipped: true, reason: 'download_failed' };
  }

  // Registra no scene plan com path relativo ao PROJECT_ROOT
  plan.music = relFromPlan(abs, downloadedPath);
  plan.music_volume = volume;
  saveScenePlan(abs, plan);

  appendLicenseManifest(audioDir, {
    kind: 'background_music',
    query, mood,
    file: path.basename(downloadedPath),
    source: 'freesound',
    freesound_id: sound.id,
    name: sound.name,
    duration: sound.duration,
    license: sound.license,
    author: sound.username,
  });

  console.log(`[audio-enrich] ✅ música adicionada: ${path.basename(downloadedPath)} (${sound.duration.toFixed(1)}s, vol ${volume})`);
  console.log(`[audio-enrich]    licença: ${sound.license}`);
  console.log(`[audio-enrich]    autor: ${sound.username}`);

  return {
    ok: true,
    music_path: plan.music,
    music_volume: plan.music_volume,
    meta: {
      name: sound.name,
      duration: sound.duration,
      license: sound.license,
      author: sound.username,
      freesound_id: sound.id,
    },
  };
}

// ── (c) Scene SFX ──────────────────────────────────────────────────────────

/**
 * Busca SFX e adiciona ao array `sfx` de uma cena específica.
 *
 * Formato final no scene plan:
 *   scene.sfx = [
 *     { file: "audio/sfx_0_notification.mp3", offset_s: 0, volume: 0.6 },
 *     ...
 *   ]
 *
 * `offset_s` é o tempo dentro da cena (0 = começo da cena). O render calcula
 * o timestamp absoluto somando as durations anteriores.
 *
 * @param {string} scenePlanPath - path do scene plan
 * @param {number|string} sceneIndexOrId - índice da cena (0-based) ou `scene.id`
 * @param {object} options
 * @param {string} options.query - termo de busca SFX
 * @param {number} [options.volume=0.5] - volume do SFX no mix
 * @param {number} [options.offset_s=0] - offset dentro da cena em segundos
 * @param {number} [options.maxDuration=5] - duração máxima do SFX
 * @param {string} [options.provider='freesound'] - freesound ou pixabay-sfx
 *
 * NOTA: pixabay-sfx é um endpoint quebrado — o Pixabay não expõe áudio via API
 * pública, só imagens. O default é 'freesound' que funciona de verdade.
 * Mantemos 'pixabay-sfx' como opção só pra interface consistente com o registry.
 */
async function addSceneSfx(scenePlanPath, sceneIndexOrId, options = {}) {
  const {
    query,
    volume = 0.5,
    offset_s = 0,
    maxDuration = 5,
    provider = 'freesound',
  } = options;

  if (!query) throw new Error('addSceneSfx: options.query is required');

  const { abs, plan } = loadScenePlan(scenePlanPath);
  const audioDir = resolveAudioDir(abs);
  fs.mkdirSync(audioDir, { recursive: true });

  // Resolve cena por índice ou id
  const scenes = plan.scenes || [];
  let sceneIdx = -1;
  if (typeof sceneIndexOrId === 'number') {
    sceneIdx = sceneIndexOrId;
  } else {
    sceneIdx = scenes.findIndex(s => s.id === sceneIndexOrId);
  }
  if (sceneIdx < 0 || sceneIdx >= scenes.length) {
    throw new Error(`cena não encontrada: ${sceneIndexOrId}`);
  }
  const scene = scenes[sceneIdx];
  const sceneLabel = scene.id || `cena ${sceneIdx}`;

  // Baixa SFX
  const sfxSlug = slugify(query, 24);
  const sfxFilename = `sfx_${String(sceneIdx).padStart(2, '0')}_${sfxSlug}.mp3`;
  const sfxPath = path.join(audioDir, sfxFilename);

  if (fs.existsSync(sfxPath)) {
    console.log(`[audio-enrich] SFX já existe: ${sfxFilename} (reutilizando)`);
  } else {
    console.log(`[audio-enrich] buscando SFX: "${query}" (max ${maxDuration}s, provider=${provider})`);
    try {
      await fetchSFX(query, sfxPath, { maxDuration, provider });
    } catch (errPrimary) {
      console.warn(`[audio-enrich] ${provider} falhou: ${errPrimary.message}`);
      const fallback = provider === 'pixabay-sfx' ? 'freesound' : 'pixabay-sfx';
      console.log(`[audio-enrich] tentando fallback: ${fallback}`);
      try {
        await fetchSFX(query, sfxPath, { maxDuration, provider: fallback });
      } catch (errFallback) {
        console.error(`[audio-enrich] fallback também falhou: ${errFallback.message}`);
        return { skipped: true, reason: 'both_providers_failed' };
      }
    }
  }

  if (!fs.existsSync(sfxPath)) {
    return { skipped: true, reason: 'file_not_downloaded' };
  }

  // Adiciona ao array scene.sfx (acumulativo — múltiplos SFX por cena OK)
  scene.sfx = scene.sfx || [];
  scene.sfx.push({
    file: relFromPlan(abs, sfxPath),
    offset_s,
    volume,
  });

  saveScenePlan(abs, plan);

  appendLicenseManifest(audioDir, {
    kind: 'sfx',
    scene: sceneLabel,
    scene_index: sceneIdx,
    query,
    file: sfxFilename,
    volume,
    offset_s,
  });

  console.log(`[audio-enrich] ✅ SFX adicionado à cena ${sceneLabel}: ${sfxFilename} (vol ${volume}, offset ${offset_s}s)`);

  return {
    ok: true,
    scene: sceneLabel,
    scene_index: sceneIdx,
    sfx_path: relFromPlan(abs, sfxPath),
    total_sfx_on_scene: scene.sfx.length,
  };
}

module.exports = {
  addBackgroundMusic,
  addSceneSfx,
};
