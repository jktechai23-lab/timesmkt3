#!/usr/bin/env node
/**
 * Standalone test: replay Phase 2.5 (TTS-per-scene + duration sync) on c0106
 * and re-render the Pro video to verify alignment.
 *
 * Does NOT go through bot/queue — just exercises the new logic on existing
 * motion plan + audio dir, then calls render-video-ffmpeg.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = 'prj/inema/outputs/c0106-cinco_niveis_claude_code';
const TASK_NAME = 'c0106-cinco_niveis_claude_code';
const NARRATOR = 'rachel';
const TTS_PROVIDER = ''; // auto

const absOutputDir = path.resolve(PROJECT_ROOT, OUTPUT_DIR);
const absAudioDir = path.resolve(absOutputDir, 'audio');
const absVideoDir = path.resolve(absOutputDir, 'video');
const generateAudioScript = path.resolve(PROJECT_ROOT, 'pipeline', 'generate-audio.js');
const renderScript = path.resolve(PROJECT_ROOT, 'pipeline', 'render-video-ffmpeg.js');

const planPath = path.resolve(absVideoDir, `${TASK_NAME}_video_01_scene_plan_motion.json`);
if (!fs.existsSync(planPath)) {
  console.error(`Missing motion plan: ${planPath}`);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
const scenes = plan.scenes || [];
console.log(`Loaded plan: ${scenes.length} scenes`);

const HOLD_MIN_SEC = 0.6;
const idx = '01';
const scenesAudioDir = path.resolve(absAudioDir, `scenes_${idx}_test`);
fs.mkdirSync(scenesAudioDir, { recursive: true });

const sceneAudioPaths = [];
for (let si = 0; si < scenes.length; si++) {
  const scene = scenes[si];
  const sceneNum = String(si + 1).padStart(2, '0');
  const scenePath = path.resolve(scenesAudioDir, `scene_${sceneNum}.mp3`);
  const narration = String(scene.narration || '').trim();
  const plannedDur = Math.max(parseFloat(scene.duration) || 1, HOLD_MIN_SEC);

  if (narration) {
    const args = [generateAudioScript, scenePath, narration, NARRATOR];
    if (TTS_PROVIDER) args.push('--provider', TTS_PROVIDER);
    console.log(`  scene ${sceneNum}: TTS "${narration.slice(0, 60)}..."`);
    execFileSync('node', args, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 120000 });

    let realDur = plannedDur;
    try {
      const probe = execFileSync('ffprobe', [
        '-v', 'quiet', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', scenePath,
      ], { encoding: 'utf-8', timeout: 10000 }).trim();
      realDur = parseFloat(probe) || plannedDur;
    } catch {}
    scene.duration = parseFloat(realDur.toFixed(2));
    console.log(`    → ${realDur.toFixed(2)}s (planned ${plannedDur}s)`);
  } else {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', String(plannedDur),
      '-c:a', 'libmp3lame', '-b:a', '128k',
      scenePath,
    ], { stdio: 'pipe', timeout: 30000 });
    scene.duration = parseFloat(plannedDur.toFixed(2));
    console.log(`  scene ${sceneNum}: SILENT ${plannedDur}s`);
  }
  sceneAudioPaths.push(scenePath);
}

const concatList = path.resolve(scenesAudioDir, 'concat.txt');
fs.writeFileSync(
  concatList,
  sceneAudioPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
);
const narPath = path.resolve(absAudioDir, `${TASK_NAME}_video_${idx}_narration.mp3`);
console.log(`Concat → ${path.relative(PROJECT_ROOT, narPath)}`);
execFileSync('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
  '-c:a', 'libmp3lame', '-b:a', '128k', narPath,
], { stdio: 'pipe', timeout: 60000 });

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
const totalDur = scenes.reduce((s, sc) => s + (parseFloat(sc.duration) || 0), 0);
console.log(`\nPlan updated. Total: ${totalDur.toFixed(1)}s, ${scenes.length} scenes synced.\n`);

const outVideo = path.resolve(absVideoDir, `${TASK_NAME}_pro_01_TTSPERSCENE.mp4`);
console.log(`Rendering → ${path.relative(PROJECT_ROOT, outVideo)}`);
execFileSync('node', [renderScript, planPath, outVideo], {
  cwd: PROJECT_ROOT, stdio: 'inherit', timeout: 300000,
});

const probe = execFileSync('ffprobe', [
  '-v', 'quiet', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', outVideo,
], { encoding: 'utf-8' }).trim();
console.log(`\nFinal video duration: ${parseFloat(probe).toFixed(2)}s (target ${totalDur.toFixed(2)}s)`);
