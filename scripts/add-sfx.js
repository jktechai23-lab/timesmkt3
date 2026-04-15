#!/usr/bin/env node
/**
 * add-sfx.js — CLI opt-in para adicionar SFX a uma cena específica de um scene plan.
 *
 * **Não é parte do fluxo default** do pipeline. Você chama isso explicitamente
 * quando decide que uma cena de um vídeo merece um efeito sonoro. O scene plan
 * é atualizado em-place: o campo `scene.sfx[]` é acrescentado (ou adicionado),
 * e o render-video-ffmpeg.js mixa via adelay no filter_complex do ffmpeg.
 *
 * Múltiplos SFX por cena: cada invocação adiciona ao array — não substitui.
 * O offset_s é relativo ao início da cena (0 = entrada, 2 = 2s depois de começar).
 * O render calcula o timestamp absoluto somando as durações das cenas anteriores.
 *
 * Fonte: Freesound (via Pixabay fallback que hoje retorna imagens, então só
 * Freesound funciona na prática — ver ivox2/fontes-audio-catalogo.md).
 *
 * Uso:
 *   node scripts/add-sfx.js <scene_plan.json> <scene_index_or_id> "<query>" [options]
 *
 * Exemplos:
 *   node scripts/add-sfx.js path/to/plan.json 0 "notification pop"
 *   node scripts/add-sfx.js path/to/plan.json hook "whoosh" --offset 0.5 --volume 0.4
 *   node scripts/add-sfx.js path/to/plan.json 2 "applause" --max 3 --volume 0.7
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { addSceneSfx } = require('../pipeline/audio-enrich');

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const opts = { volume: 0.5, offset_s: 0, maxDuration: 5, provider: 'freesound' };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--volume')   { opts.volume = Number(args[++i]); }
    else if (a === '--offset') { opts.offset_s = Number(args[++i]); }
    else if (a === '--max')    { opts.maxDuration = Number(args[++i]); }
    else if (a === '--provider') { opts.provider = args[++i]; }
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
Uso: node scripts/add-sfx.js <scene_plan.json> <scene_index_or_id> "<query>" [options]

Argumentos:
  scene_plan.json      Path do scene plan a modificar
  scene_index_or_id    Índice numérico (0-based) OU o campo "id" de uma cena
  query                Termo de busca (ex: "notification", "whoosh", "coffee pour")

Opções:
  --offset <sec>   Offset do SFX dentro da cena em segundos (default: 0 = início)
  --volume <0-1>   Volume do SFX no mix final (default: 0.5)
  --max <sec>      Duração máxima do SFX em segundos (default: 5)
  --provider <p>   Provider preferido: pixabay-sfx (default, fallback freesound) ou freesound

Requer FREESOUND_API_KEY ou PIXABAY_API_KEY no .env.

NOTA: Pixabay só retorna imagens via API pública — use Freesound para SFX reais.

Exemplos:
  node scripts/add-sfx.js path/to/plan.json 0 "notification pop"
  node scripts/add-sfx.js path/to/plan.json hook "whoosh" --offset 0.5 --volume 0.4
  node scripts/add-sfx.js path/to/plan.json 2 "applause" --max 3 --volume 0.7
`);
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  if (positional.length < 3) {
    printHelp();
    process.exit(1);
  }
  const [scenePlanPath, sceneRef, query] = positional;

  // Tenta interpretar sceneRef como índice numérico primeiro; senão usa como id
  const sceneIndexOrId = /^\d+$/.test(sceneRef) ? parseInt(sceneRef, 10) : sceneRef;

  try {
    const result = await addSceneSfx(scenePlanPath, sceneIndexOrId, {
      query,
      volume: opts.volume,
      offset_s: opts.offset_s,
      maxDuration: opts.maxDuration,
      provider: opts.provider,
    });

    if (result.skipped) {
      console.log(`\n[add-sfx] pulado: ${result.reason}`);
      process.exit(0);
    }

    console.log(`\n[add-sfx] ✅ sucesso`);
    console.log(`    cena: ${result.scene} (index ${result.scene_index})`);
    console.log(`    sfx: ${result.sfx_path}`);
    console.log(`    total de SFX nesta cena: ${result.total_sfx_on_scene}`);
    console.log(`\n   Próximo passo: rode o render-video-ffmpeg normalmente, ele já vai mixar o SFX.`);
  } catch (err) {
    console.error(`\n[add-sfx] ❌ ${err.message}`);
    if (/FREESOUND_API_KEY/.test(err.message)) {
      console.error(`\n   Obtenha uma key gratuita em https://freesound.org/apiv2/apply/`);
      console.error(`   Adicione ao .env: FREESOUND_API_KEY=sua_key`);
    }
    process.exit(2);
  }
}

main();
