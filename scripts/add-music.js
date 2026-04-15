#!/usr/bin/env node
/**
 * add-music.js — CLI opt-in para adicionar trilha sonora de fundo a um scene plan.
 *
 * **Não é parte do fluxo default** do pipeline. Você chama isso explicitamente
 * quando decide que um vídeo específico merece música. O scene plan é atualizado
 * em-place com os campos `music` e `music_volume`, e o render-video-ffmpeg.js
 * pega automaticamente na próxima execução.
 *
 * Fonte: Freesound.org (via pipeline/search-music-freesound.js).
 * Licença: varia por trilha — registrada em audio-enrich-manifest.json na
 * pasta audio/ da campanha, para rastreabilidade.
 *
 * Uso:
 *   node scripts/add-music.js <scene_plan.json> "<query>" [options]
 *
 * Exemplos:
 *   node scripts/add-music.js prj/inema/outputs/c0067-lancamento_deerflow/video/c0067_plan.json "tech ambient"
 *   node scripts/add-music.js path/to/plan.json "corporate" --mood upbeat --min 30 --max 120 --volume 0.2
 *   node scripts/add-music.js path/to/plan.json "cinematic epic" --force  # substitui música existente
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { addBackgroundMusic } = require('../pipeline/audio-enrich');

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const opts = { mood: '', minDuration: 15, maxDuration: 180, volume: 0.15, force: false };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--mood')        { opts.mood = args[++i] || ''; }
    else if (a === '--min')    { opts.minDuration = Number(args[++i]); }
    else if (a === '--max')    { opts.maxDuration = Number(args[++i]); }
    else if (a === '--volume') { opts.volume = Number(args[++i]); }
    else if (a === '--force')  { opts.force = true; }
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
}

function printHelp() {
  console.log(`
Uso: node scripts/add-music.js <scene_plan.json> "<query>" [options]

Opções:
  --mood <tag>     Tag adicional de mood (upbeat, calm, epic, cinematic, ambient...)
  --min <sec>      Duração mínima da trilha em segundos (default: 15)
  --max <sec>      Duração máxima da trilha em segundos (default: 180)
  --volume <0-1>   Volume da música no mix final (default: 0.15)
  --force          Substitui música existente no scene plan (sem isso, aborta se já tiver)

Requer FREESOUND_API_KEY no .env.

Exemplos:
  node scripts/add-music.js prj/inema/outputs/c0067/video/plan.json "tech ambient"
  node scripts/add-music.js prj/xxx/video/plan.json "corporate" --mood upbeat --min 60
  node scripts/add-music.js prj/xxx/video/plan.json "epic cinematic" --force --volume 0.2
`);
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  if (positional.length < 2) {
    printHelp();
    process.exit(1);
  }
  const [scenePlanPath, query] = positional;

  try {
    const result = await addBackgroundMusic(scenePlanPath, {
      query,
      mood: opts.mood,
      minDuration: opts.minDuration,
      maxDuration: opts.maxDuration,
      volume: opts.volume,
      force: opts.force,
    });

    if (result.skipped) {
      console.log(`\n[add-music] pulado: ${result.reason || 'ja tem musica'}`);
      if (result.existing) console.log(`    musica atual: ${result.existing}`);
      process.exit(0);
    }

    console.log(`\n[add-music] ✅ sucesso`);
    console.log(`    music: ${result.music_path}`);
    console.log(`    volume: ${result.music_volume}`);
    console.log(`    ${result.meta.name} (${result.meta.duration.toFixed(1)}s)`);
    console.log(`    por ${result.meta.author} — ${result.meta.license}`);
    console.log(`\n   Próximo passo: rode o render-video-ffmpeg normalmente, ele já vai mixar a música.`);
  } catch (err) {
    console.error(`\n[add-music] ❌ ${err.message}`);
    if (/FREESOUND_API_KEY/.test(err.message)) {
      console.error(`\n   Obtenha uma key gratuita em https://freesound.org/apiv2/apply/`);
      console.error(`   Adicione ao .env: FREESOUND_API_KEY=sua_key`);
    }
    process.exit(2);
  }
}

main();
