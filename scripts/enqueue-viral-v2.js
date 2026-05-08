#!/usr/bin/env node
/**
 * enqueue-viral-v2.js — Enfileira viral V2 pra uma ou mais campanhas.
 *
 * Uso:
 *   node scripts/enqueue-viral-v2.js c0047 c0097 c0098 c0100 c0101
 *   node scripts/enqueue-viral-v2.js c0099 --duration 45 --template data_story
 *   node scripts/enqueue-viral-v2.js c0099 --music --caption
 *
 * Limpa viral/ existente antes de enfileirar (re-render limpo).
 */

const fs = require('fs');
const path = require('path');
const { enqueueStage } = require('../pipeline/orchestrator');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_DIR = 'prj/inema';

(async () => {
  process.chdir(PROJECT_ROOT);
  const args = process.argv.slice(2);
  const flags = {
    duration: 30,
    template: 'viral',
    music: false,
    caption: false,
  };
  const campaignSlugs = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--duration') { flags.duration = parseInt(args[++i], 10); continue; }
    if (a === '--template') { flags.template = args[++i]; continue; }
    if (a === '--music') { flags.music = true; continue; }
    if (a === '--caption') { flags.caption = true; continue; }
    campaignSlugs.push(a);
  }

  if (campaignSlugs.length === 0) {
    console.error('Uso: node scripts/enqueue-viral-v2.js <c0047> [c0097 ...] [--duration 45] [--template <name>] [--music] [--caption]');
    process.exit(1);
  }

  for (const slug of campaignSlugs) {
    const outputsDir = path.join(PROJECT_ROOT, PROJECT_DIR, 'outputs');
    const matches = fs.readdirSync(outputsDir).filter((d) => d.startsWith(`${slug}-`));
    if (matches.length === 0) {
      console.warn(`⚠ ${slug}: pasta não encontrada em outputs/, pulando`);
      continue;
    }
    const taskName = matches[0];
    const outputDir = `${PROJECT_DIR}/outputs/${taskName}`;
    const absViralDir = path.join(PROJECT_ROOT, outputDir, 'viral');

    // Limpa viral antigo
    if (fs.existsSync(absViralDir)) {
      fs.rmSync(absViralDir, { recursive: true, force: true });
      console.log(`🧹 ${slug}: viral/ antigo limpo`);
    }

    const payload = {
      task_name: taskName,
      task_date: new Date().toISOString().slice(0, 10),
      project_dir: PROJECT_DIR,
      output_dir: outputDir,
      platform_targets: ['instagram'],
      language: 'pt-BR',
      image_count: 5,
      image_formats: ['carousel_1080x1080'],
      video_count: 1,
      image_source: 'brand',
      use_brand_overlay: true,
      campaign_brief: '',
      video_mode: 'viral',
      video_quick: false,
      video_pro: false,
      video_viral: true,
      music_enabled: flags.music,
      captions_enabled: flags.caption,
      viral_duration: flags.duration,
      video_template: flags.template,
      skip_research: true,
      skip_image: true,
      skip_video: false,
      skip_dependencies: true,
      skip_completed: false,
      notifications: false,
      approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
    };

    const jobs = await enqueueStage(payload, ['video_viral']);
    console.log(`✅ ${slug} (${taskName}): enqueued, jobs=${jobs.length}`);
  }

  console.log('\nWatch: tail -f /home/nmaldaner/.pm2/logs/timesmkt3-worker-out.log');
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
