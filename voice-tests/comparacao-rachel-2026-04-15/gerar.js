#!/usr/bin/env node
/**
 * Gera amostras de vozes para comparação com a Rachel ElevenLabs.
 * - ElevenLabs: Rachel (original de referência)
 * - Fish Audio: Bella, Warm Gentle Midage, Ana Brazilian, Rachel-clonada, Caine
 * - MiniMax: default PT
 *
 * Uso: node gerar.js
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ttsGenerator = require('../../media/tts-generator');

const TEXTO = fs.readFileSync(path.join(__dirname, 'texto.txt'), 'utf-8').trim();
const OUT_DIR = path.join(__dirname, 'audio');

const AMOSTRAS = [
  {
    label: '01-rachel-elevenlabs',
    provider: 'elevenlabs',
    options: { voiceId: '21m00Tcm4TlvDq8ikWAM', modelId: 'eleven_multilingual_v2' },
    nota: 'Rachel — ElevenLabs (referência)',
  },
  {
    label: '02-bella-fish',
    provider: 'fish',
    options: { voiceId: 'f18e96e1ed024df98860f6ff60bd6695', model: 's1' },
    nota: 'Bella — Fish Audio S1 (expressiva/storytelling)',
  },
  {
    label: '03-warm-gentle-midage-fish',
    provider: 'fish',
    options: { voiceId: '5b0bdf4a1e9c46e4b8469730ade927b9', model: 's1' },
    nota: 'Warm Gentle Midage — Fish S1 (meia-idade, quente)',
  },
  {
    label: '04-ana-brazilian-fish',
    provider: 'fish',
    options: { voiceId: '2f41253e0f234410ab6d00a6f3617a21', model: 's1' },
    nota: 'Ana Brazilian — Fish S1 (calma, suave, gentil)',
  },
  {
    label: '05-rachel-fish-clone',
    provider: 'fish',
    options: { voiceId: 'd9845a73451849f9af5eb40101e83b83', model: 's1' },
    nota: 'Rachel clonada no Fish — tentativa de replicar Rachel via clone',
  },
  {
    label: '06-caine-fish',
    provider: 'fish',
    options: { voiceId: '8f50c4c145e44ec280fb759b32934890', model: 's1' },
    nota: 'Caine — Fish S1 (calorosa profissional)',
  },
  {
    label: '07-mulher-fish',
    provider: 'fish',
    options: { voiceId: '302d4d27c9344460a815ee46efdd5cf0', model: 's1' },
    nota: 'Mulher — Fish S1 (publicitária, amigável)',
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const resultados = [];

  for (const amostra of AMOSTRAS) {
    const outPath = path.join(OUT_DIR, `${amostra.label}.mp3`);
    console.log(`\n→ Gerando ${amostra.label} (${amostra.provider})...`);
    try {
      const inicio = Date.now();
      const r = await ttsGenerator.generateSpeech(TEXTO, outPath, {
        provider: amostra.provider,
        ...amostra.options,
      });
      const dur = ((Date.now() - inicio) / 1000).toFixed(1);
      const bytes = fs.statSync(outPath).size;
      resultados.push({
        ...amostra,
        ok: true,
        file: path.basename(outPath),
        bytes,
        duracao_gen_s: Number(dur),
      });
      console.log(`   ✅ ${bytes} bytes em ${dur}s`);
    } catch (e) {
      console.error(`   ❌ ${e.message}`);
      resultados.push({ ...amostra, ok: false, erro: e.message });
    }
  }

  const manifest = {
    criado_em: new Date().toISOString(),
    texto: TEXTO,
    amostras: resultados,
  };
  fs.writeFileSync(
    path.join(__dirname, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`\n✅ Manifest salvo. ${resultados.filter(r => r.ok).length}/${resultados.length} amostras geradas.`);
}

main().catch(e => { console.error(e); process.exit(1); });
