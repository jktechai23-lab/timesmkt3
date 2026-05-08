/**
 * Teste end-to-end do tipo viral em c0099-dia_das_maes_2026.
 * Enfileira job video_viral direto na queue (bypassa bot/parser).
 */

const path = require('path');
const { enqueueStage } = require('../pipeline/orchestrator');

(async () => {
  const projectRoot = path.resolve(__dirname, '..');
  process.chdir(projectRoot);

  const taskName = 'c0099-dia_das_maes_2026';
  const projectDir = 'prj/inema';
  const outputDir = `${projectDir}/outputs/${taskName}`;

  const payload = {
    task_name: taskName,
    task_date: '2026-05-07',
    project_dir: projectDir,
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
    music_enabled: false,
    captions_enabled: false,
    viral_duration: 30,
    video_template: 'viral',
    skip_research: true,
    skip_image: true,
    skip_video: false,
    skip_dependencies: true,
    skip_completed: false,
    notifications: false,
    approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
  };

  console.log('Enqueueing video_viral job...');
  const jobs = await enqueueStage(payload, ['video_viral']);
  console.log(`Enqueued ${jobs.length} job(s):`, jobs.map((j) => j.name));
  console.log('Watch progress in /home/nmaldaner/.pm2/logs/timesmkt3-worker-out.log');
  console.log(`Output will be in: ${outputDir}/viral/`);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
