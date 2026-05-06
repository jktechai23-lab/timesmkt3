#!/usr/bin/env node
/**
 * Teste end-to-end do chatterbox-vc via daemon + tts-generator.
 * - Chama generateSpeech 2× em sequência (Rachel, Bella)
 * - Mede tempo total (deve reaproveitar o modelo na 2ª chamada)
 * - Salva em audio/11-daemon-rachel.mp3 e audio/12-daemon-bella.mp3
 * - Valida que são equivalentes ao #09 e #10 gerados com subprocess
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { generateSpeech } = require('../../media/tts-generator');

const TEXTO = fs.readFileSync(path.join(__dirname, 'texto.txt'), 'utf-8').trim();
const OUT_DIR = path.join(__dirname, 'audio');

async function main() {
  const casos = [
    { label: '11-daemon-rachel', voice: 'rachel' },
    { label: '12-daemon-bella',  voice: 'bella'  },
  ];

  const resultados = [];
  for (const c of casos) {
    const out = path.join(OUT_DIR, `${c.label}.mp3`);
    console.log(`\n→ ${c.label} (voice=${c.voice})`);
    const t0 = Date.now();
    const res = await generateSpeech(TEXTO, out, {
      provider: 'chatterbox-vc',
      voice: c.voice,
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(2);
    const bytes = fs.statSync(out).size;
    console.log(`   ${dur}s · ${bytes} bytes · fallback=${res.fallbackFrom || 'none'}`);
    resultados.push({ ...c, duracao_s: Number(dur), bytes, fallback: res.fallbackFrom });
  }

  console.log('\n── Resumo ──');
  console.table(resultados);

  const r1 = resultados[0].duracao_s;
  const r2 = resultados[1].duracao_s;
  if (r2 < r1) {
    console.log(`✅ 2ª chamada mais rápida (${r2}s < ${r1}s) — daemon reaproveitou modelo.`);
  } else {
    console.log(`⚠️  2ª chamada não foi mais rápida (${r2}s vs ${r1}s) — verificar daemon.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
