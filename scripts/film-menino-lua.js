#!/usr/bin/env node
/**
 * film-menino-lua.js
 *
 * Compõe filme da revista "menino na lua" a partir dos 50 quadros + TTS.
 *
 * Pipeline:
 *   1. Pra cada caption do storyboard, gera narration TTS (Chatterbox/Rachel).
 *   2. Mede duração de cada narração via ffprobe.
 *   3. Cada quadro fica visível (narration_dur + 0.6s buffer) com crossfade 0.3s.
 *   4. Concat narrations com 0.3s silêncio entre cada → trilha completa.
 *   5. ffmpeg compose: imagens + áudio → film.mp4 1080×1080 H264+AAC.
 *
 * Se total > 180s, comprime durations proporcionalmente.
 *
 * Output: prj/inema/revistas/menino_na_lua/film.mp4
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REVISTA_DIR = path.join(PROJECT_ROOT, 'prj/inema/revistas/menino_na_lua');
const STORYBOARD = path.join(REVISTA_DIR, 'storyboard.json');
const QUADROS_DIR = path.join(REVISTA_DIR, 'quadros');
const AUDIO_DIR = path.join(REVISTA_DIR, 'audio');
const OUTPUT = path.join(REVISTA_DIR, 'film.mp4');
const MAX_DURATION = 180; // 3 min
const BUFFER_PER_FRAME = 0.30; // segundos extras após narração (tight pra caber em 3min)
const SILENCE_BETWEEN = 0.0; // sem pausa entre narrações (cada caption flui pra próxima)
const CROSSFADE = 0.0; // crossfade entre frames (0 = cut hard, mais simples)
const SPEED_UP_AUDIO = true; // se total > MAX, acelera narração via atempo

function probeDur(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
    ], { encoding: 'utf-8' }).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const board = JSON.parse(fs.readFileSync(STORYBOARD, 'utf-8'));
  const generateAudio = path.resolve(PROJECT_ROOT, 'pipeline/generate-audio.js');

  console.log(`📚 ${board.frames.length} quadros, gerando TTS...`);

  // ── Phase 1: TTS pra cada caption ──
  const items = [];
  for (const frame of board.frames) {
    const idx = String(frame.n).padStart(2, '0');
    const audioPath = path.join(AUDIO_DIR, `quadro_${idx}.mp3`);
    const quadroPath = path.join(QUADROS_DIR, `quadro_${idx}_${frame.id}.png`);

    if (!fs.existsSync(quadroPath)) {
      console.warn(`⚠ ${idx}: quadro PNG não existe, pulando: ${quadroPath}`);
      continue;
    }

    if (!fs.existsSync(audioPath)) {
      const t0 = Date.now();
      try {
        execFileSync('node', [generateAudio, audioPath, frame.caption, 'rachel'], {
          cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000,
        });
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[${idx}] tts ok (${dt}s): ${frame.caption.slice(0, 50)}...`);
      } catch (e) {
        console.warn(`[${idx}] tts failed: ${e.message.slice(0, 100)}`);
        continue;
      }
    } else {
      console.log(`[${idx}] tts cached`);
    }

    const dur = probeDur(audioPath);
    items.push({
      n: frame.n,
      idx,
      caption: frame.caption,
      quadroPath,
      audioPath,
      narrationDur: dur,
      frameDur: dur + BUFFER_PER_FRAME,
    });
  }

  console.log(`\n✅ TTS done. ${items.length} items.`);

  // ── Phase 2: calcular total e comprimir se necessário ──
  let totalNarr = items.reduce((s, it) => s + it.narrationDur, 0);
  let totalSilence = (items.length - 1) * SILENCE_BETWEEN;
  let totalBuffer = items.length * BUFFER_PER_FRAME;
  let total = totalNarr + totalSilence + totalBuffer;

  console.log(`Total estimado: narration=${totalNarr.toFixed(1)}s + silêncio=${totalSilence.toFixed(1)}s + buffer=${totalBuffer.toFixed(1)}s = ${total.toFixed(1)}s`);

  let compress = 1;
  let audioSpeedUp = 1;
  if (total > MAX_DURATION) {
    if (SPEED_UP_AUDIO) {
      // Acelera narração via atempo (preserva pitch). Ratio = total / max
      audioSpeedUp = total / MAX_DURATION;
      console.log(`⚠ Total ${total.toFixed(1)}s > ${MAX_DURATION}s. Acelerando narração × ${audioSpeedUp.toFixed(3)} via atempo`);
    } else {
      compress = MAX_DURATION / total;
      console.log(`⚠ Total ${total.toFixed(1)}s > ${MAX_DURATION}s. Comprimindo durations × ${compress.toFixed(3)}`);
      for (const it of items) {
        it.frameDur = it.frameDur * compress;
      }
    }
  }

  // ── Phase 3: concat narrations com silêncio entre ──
  const narrationFile = path.join(AUDIO_DIR, '_full_narration.mp3');
  const concatInputs = [];
  const concatFilters = [];
  const concatLabels = [];
  let aIdx = 0;
  const atempoFilter = audioSpeedUp > 1.001 ? `,atempo=${audioSpeedUp.toFixed(4)}` : '';
  for (let i = 0; i < items.length; i += 1) {
    concatInputs.push('-i', items[i].audioPath);
    concatFilters.push(`[${aIdx}:a]aresample=24000${atempoFilter},aformat=sample_fmts=s16:channel_layouts=mono[a${i}]`);
    concatLabels.push(`[a${i}]`);
    aIdx += 1;
    const isLast = i === items.length - 1;
    const sil = isLast ? BUFFER_PER_FRAME : SILENCE_BETWEEN + BUFFER_PER_FRAME;
    if (sil > 0.01) {
      concatInputs.push('-f', 'lavfi', '-t', String(sil), '-i', 'anullsrc=r=24000:cl=mono');
      concatFilters.push(`[${aIdx}:a]aformat=sample_fmts=s16:channel_layouts=mono[s${i}]`);
      concatLabels.push(`[s${i}]`);
      aIdx += 1;
    }
  }
  const concatStr = `${concatLabels.join('')}concat=n=${concatLabels.length}:v=0:a=1[out]`;
  console.log('Concatenando narração completa...');
  execFileSync('ffmpeg', [
    '-y', ...concatInputs,
    '-filter_complex', [...concatFilters, concatStr].join(';'),
    '-map', '[out]', '-acodec', 'libmp3lame', '-b:a', '128k', '-ar', '24000', '-ac', '1',
    narrationFile,
  ], { stdio: 'pipe', timeout: 120000 });

  const fullNarrationDur = probeDur(narrationFile);
  console.log(`✅ Narração: ${fullNarrationDur.toFixed(1)}s total`);

  // ── Phase 4: gera lista concat de imagens com durações + áudio ──
  // Usa concat demuxer (mais simples que filter_complex pra muitas imagens).
  // Cada quadro fica visível pela duração da SUA narração acelerada + buffer.
  const concatListPath = path.join(REVISTA_DIR, '_concat_list.txt');
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const isLast = i === items.length - 1;
    const sil = isLast ? BUFFER_PER_FRAME : SILENCE_BETWEEN + BUFFER_PER_FRAME;
    const narrAdj = it.narrationDur / audioSpeedUp;
    const frameTime = narrAdj + sil;
    lines.push(`file '${it.quadroPath}'`);
    lines.push(`duration ${frameTime.toFixed(3)}`);
  }
  // ffmpeg concat demuxer requer última imagem repetida sem duration
  lines.push(`file '${items[items.length - 1].quadroPath}'`);
  fs.writeFileSync(concatListPath, lines.join('\n'));

  console.log('Renderizando vídeo final...');
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-i', narrationFile,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-vf', `scale=${1080}:${1080}:force_original_aspect_ratio=decrease,pad=${1080}:${1080}:(ow-iw)/2:(oh-ih)/2:color=#f1ead3`,
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    OUTPUT,
  ], { stdio: 'pipe', timeout: 180000 });

  const finalDur = probeDur(OUTPUT);
  console.log(`\n🎬 FILME PRONTO: ${OUTPUT}`);
  console.log(`   Duração: ${finalDur.toFixed(1)}s`);
  console.log(`   Quadros: ${items.length}`);
  console.log(`   Tamanho: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => { console.error('FAILED:', err.message); console.error(err.stack); process.exit(1); });
