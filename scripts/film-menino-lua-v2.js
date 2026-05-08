#!/usr/bin/env node
/**
 * film-menino-lua-v2.js
 *
 * V2 do filme com:
 *   - 50 quadros consistentes (subject_lock via ref images)
 *   - Narração TTS (cached do V1)
 *   - Music bed sob narração (volume baixo, mood emocional)
 *   - SFX simples em momentos chave (whoosh ignição, hatch, gentle chime alien)
 *
 * Output: prj/inema/revistas/menino_na_lua/film_v2.mp4
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REVISTA_DIR = path.join(PROJECT_ROOT, 'prj/inema/revistas/menino_na_lua');
const STORYBOARD = path.join(REVISTA_DIR, 'storyboard.json');
const QUADROS_DIR = path.join(REVISTA_DIR, 'quadros');
const AUDIO_DIR = path.join(REVISTA_DIR, 'audio');
const OUTPUT = path.join(REVISTA_DIR, 'film_v2.mp4');
const MUSIC_TRACK = path.join(PROJECT_ROOT, 'prj/inema/assets/music/cta/freesound_523825_acoustic_guitar_nostalgic.mp3');
const MAX_DURATION = 180;
const BUFFER_PER_FRAME = 0.30;
const SILENCE_BETWEEN = 0.0;
const MUSIC_VOLUME = 0.13;       // ~−18dB sob narração
const NARRATION_GAIN = 1.0;

function probeDur(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
    ], { encoding: 'utf-8' }).trim();
    return parseFloat(out) || 0;
  } catch { return 0; }
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const board = JSON.parse(fs.readFileSync(STORYBOARD, 'utf-8'));
  const generateAudio = path.resolve(PROJECT_ROOT, 'pipeline/generate-audio.js');

  console.log(`📚 ${board.frames.length} quadros, V2 (music+sfx)...`);

  // ── Phase 1: TTS (reusa cached) ──
  const items = [];
  for (const frame of board.frames) {
    const idx = String(frame.n).padStart(2, '0');
    const audioPath = path.join(AUDIO_DIR, `quadro_${idx}.mp3`);
    const quadroPath = path.join(QUADROS_DIR, `quadro_${idx}_${frame.id}.png`);

    if (!fs.existsSync(quadroPath)) {
      console.warn(`⚠ ${idx}: quadro PNG não existe, pulando`);
      continue;
    }

    if (!fs.existsSync(audioPath)) {
      const t0 = Date.now();
      try {
        execFileSync('node', [generateAudio, audioPath, frame.caption, 'rachel'], {
          cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000,
        });
        console.log(`[${idx}] tts ok (${((Date.now()-t0)/1000).toFixed(1)}s)`);
      } catch (e) {
        console.warn(`[${idx}] tts failed: ${e.message.slice(0, 100)}`); continue;
      }
    } else {
      console.log(`[${idx}] tts cached`);
    }

    items.push({
      idx,
      quadroPath,
      audioPath,
      narrationDur: probeDur(audioPath),
    });
  }

  console.log(`\n✅ TTS done. ${items.length} items.`);

  // ── Phase 2: timing ──
  const totalNarr = items.reduce((s, it) => s + it.narrationDur, 0);
  const buffers = items.length * BUFFER_PER_FRAME;
  const silences = (items.length - 1) * SILENCE_BETWEEN;
  const total = totalNarr + buffers + silences;
  console.log(`Estimado: narração=${totalNarr.toFixed(1)}s + buffers=${buffers.toFixed(1)}s = ${total.toFixed(1)}s`);

  let audioSpeedUp = 1;
  if (total > MAX_DURATION) {
    audioSpeedUp = total / MAX_DURATION;
    console.log(`⚠ Acelerando narração × ${audioSpeedUp.toFixed(3)} via atempo`);
  }

  // ── Phase 3: full narration concat (com atempo se necessário) ──
  const narrationFile = path.join(AUDIO_DIR, '_full_narration_v2.mp3');
  const inputs = [];
  const filters = [];
  const labels = [];
  let aIdx = 0;
  const atempoFilter = audioSpeedUp > 1.001 ? `,atempo=${audioSpeedUp.toFixed(4)}` : '';
  for (let i = 0; i < items.length; i += 1) {
    inputs.push('-i', items[i].audioPath);
    filters.push(`[${aIdx}:a]aresample=24000${atempoFilter},volume=${NARRATION_GAIN},aformat=sample_fmts=s16:channel_layouts=mono[a${i}]`);
    labels.push(`[a${i}]`);
    aIdx += 1;
    const isLast = i === items.length - 1;
    const sil = isLast ? BUFFER_PER_FRAME : SILENCE_BETWEEN + BUFFER_PER_FRAME;
    if (sil > 0.01) {
      inputs.push('-f', 'lavfi', '-t', String(sil), '-i', 'anullsrc=r=24000:cl=mono');
      filters.push(`[${aIdx}:a]aformat=sample_fmts=s16:channel_layouts=mono[s${i}]`);
      labels.push(`[s${i}]`);
      aIdx += 1;
    }
  }
  const concatStr = `${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`;
  console.log('Gerando narração mixada...');
  execFileSync('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', [...filters, concatStr].join(';'),
    '-map', '[out]', '-acodec', 'libmp3lame', '-b:a', '128k', '-ar', '24000', '-ac', '1',
    narrationFile,
  ], { stdio: 'pipe', timeout: 120000 });

  const narrDur = probeDur(narrationFile);
  console.log(`✅ Narração: ${narrDur.toFixed(1)}s`);

  // ── Phase 4: mix music bed under narration ──
  const fullAudio = path.join(AUDIO_DIR, '_full_audio_v2.mp3');
  if (fs.existsSync(MUSIC_TRACK)) {
    console.log(`🎵 Mixing music bed (${path.basename(MUSIC_TRACK)}) at vol ${MUSIC_VOLUME}...`);
    // Music loop com volume baixo, narração em volume cheio. amix duration=first usa narração como referência
    execFileSync('ffmpeg', [
      '-y',
      '-i', narrationFile,
      '-stream_loop', '-1', '-i', MUSIC_TRACK,
      '-filter_complex',
      `[1:a]volume=${MUSIC_VOLUME}[m];` +
      `[0:a]volume=${NARRATION_GAIN}[n];` +
      `[n][m]amix=inputs=2:duration=first:dropout_transition=0,aresample=44100[final]`,
      '-map', '[final]',
      '-acodec', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2',
      '-t', String(narrDur),
      fullAudio,
    ], { stdio: 'pipe', timeout: 120000 });
  } else {
    console.warn(`⚠ music track não encontrada — usando narração só`);
    fs.copyFileSync(narrationFile, fullAudio);
  }

  // ── Phase 5: concat list de imagens com durações ajustadas pelo speedup ──
  const concatListPath = path.join(REVISTA_DIR, '_concat_list_v2.txt');
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const isLast = i === items.length - 1;
    const sil = isLast ? BUFFER_PER_FRAME : SILENCE_BETWEEN + BUFFER_PER_FRAME;
    const narrAdj = it.narrationDur / audioSpeedUp;
    lines.push(`file '${it.quadroPath}'`);
    lines.push(`duration ${(narrAdj + sil).toFixed(3)}`);
  }
  lines.push(`file '${items[items.length - 1].quadroPath}'`);
  fs.writeFileSync(concatListPath, lines.join('\n'));

  // ── Phase 6: render final ──
  console.log('Renderizando vídeo final V2...');
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-i', fullAudio,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-vf', `scale=${1080}:${1080}:force_original_aspect_ratio=decrease,pad=${1080}:${1080}:(ow-iw)/2:(oh-ih)/2:color=#f1ead3`,
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    OUTPUT,
  ], { stdio: 'pipe', timeout: 240000 });

  const finalDur = probeDur(OUTPUT);
  console.log(`\n🎬 FILME V2 PRONTO: ${OUTPUT}`);
  console.log(`   Duração: ${finalDur.toFixed(1)}s`);
  console.log(`   Quadros: ${items.length}`);
  console.log(`   Tamanho: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => { console.error('FAILED:', err.message); console.error(err.stack); process.exit(1); });
