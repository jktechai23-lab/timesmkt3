const fs = require('fs');
const path = require('path');
const { getEnv, getDefaultImageModel } = require('../config/env');

function normalizeProjectFolder(projectDir, folderPath) {
  const raw = String(folderPath || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('prj/')) return raw;
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('imgs/') || raw.startsWith('assets/')) return `${projectDir}/${raw}`;
  return `${projectDir}/imgs/${raw.replace(/^\.?\//, '')}`;
}

// Parse a comma/space-separated campaign list and expand ranges (c1-c5 → c1,c2,c3,c4,c5)
function parseCampaignList(raw) {
  const tokens = String(raw || '')
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    const rangeMatch = tok.match(/^c(\d+)-c(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        for (let i = start; i <= end; i += 1) out.push(`c${i}`);
        continue;
      }
    }
    out.push(tok);
  }
  return out;
}

// Build rerun payloads for a single campaign. Shared by /rerun and /loterun.
// Returns { ok, error?, payloads?, sortedStages?, videoTemplates?, videoMode? }
function buildRerunPayloads({ stageTokens, campaignFolder, projectDir, projectRoot, resolveStageAlias }) {
  if (!Array.isArray(stageTokens) || stageTokens.length === 0) {
    return { ok: false, error: 'Especifique quais etapas. Ex: video quick' };
  }

  const outputDir = `${projectDir}/outputs/${campaignFolder}`;
  const absOutputDir = path.resolve(projectRoot, outputDir);

  const allTokens = stageTokens.join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean);
  const stageNumbers = new Set();
  let videoQuick = false;
  let videoPro = false;
  let videoViral = false;
  let videoDraft = false;
  let musicEnabled = false;
  let captionsEnabled = false;
  let viralDuration = null;  // segundos, null = default 30 do worker

  const origPayloadPath = path.join(absOutputDir, 'campaign_payload.json');
  let origPayload = {};
  try { origPayload = JSON.parse(fs.readFileSync(origPayloadPath, 'utf-8')); } catch {}

  const videoTemplates = [];
  let imageSource = origPayload.image_source || 'brand';
  let payloadImageFolder = origPayload.image_folder || null;
  let payloadImageBackgroundColor = origPayload.image_background_color || null;
  const screenshotUrls = Array.isArray(origPayload.screenshot_urls) ? [...origPayload.screenshot_urls] : [];
  const cleanFlags = { plan: false, img: false, audio: false };

  for (let i = 0; i < allTokens.length; i += 1) {
    const token = allTokens[i];
    const next = allTokens[i + 1];

    if ((token === 'video' || token === 'videos') && next === 'quick') {
      stageNumbers.add(3); videoQuick = true; i += 1; continue;
    }
    if ((token === 'video' || token === 'videos') && next === 'pro') {
      stageNumbers.add(3); videoPro = true; i += 1; continue;
    }
    if ((token === 'video' || token === 'videos') && next === 'viral') {
      stageNumbers.add(3); videoViral = true; i += 1; continue;
    }
    if (token === 'quick') { stageNumbers.add(3); videoQuick = true; continue; }
    if (token === 'pro') { stageNumbers.add(3); videoPro = true; continue; }
    if (token === 'viral') { stageNumbers.add(3); videoViral = true; continue; }
    if (token === 'musica' || token === 'music' || token === 'trilha') { musicEnabled = true; continue; }
    if (token === 'caption' || token === 'captions' || token === 'legenda' || token === 'legendas') { captionsEnabled = true; continue; }
    if (token === 'draft') { videoDraft = true; continue; }

    // Duration token: 20s, 30s, 45s, 60s, 90s ou raw 30 (validado entre 15-90)
    {
      const m = token.match(/^(\d{2,3})s?$/);
      if (m) {
        const v = parseInt(m[1], 10);
        if (v >= 15 && v <= 90) { viralDuration = v; continue; }
      }
    }

    const validTemplates = ['auto', 'data_story', 'explainer', 'narrativo', 'brand_film', 'report', 'gatilhos'];
    if (token === 'template' && next && validTemplates.includes(next)) {
      videoTemplates.push(next); i += 1; continue;
    }
    if (validTemplates.includes(token) && token !== 'auto') {
      videoTemplates.push(token); continue;
    }

    if (token === 'cleanplan' || token === 'limparplano') { cleanFlags.plan = true; continue; }
    if (token === 'cleanimg' || token === 'limparimagens') { cleanFlags.img = true; continue; }
    if (token === 'cleanaudio' || token === 'limparaudio') { cleanFlags.audio = true; continue; }
    if (token === 'cleanall' || token === 'limpartudo') { cleanFlags.plan = true; cleanFlags.img = true; cleanFlags.audio = true; continue; }

    if (token === 'screenshot' || token === 'screenshots' || token === 'captura' || token === 'capturas') {
      imageSource = 'screenshot'; continue;
    }
    if (token === 'api') { imageSource = 'api'; payloadImageFolder = null; payloadImageBackgroundColor = null; screenshotUrls.length = 0; continue; }
    if (token === 'brand' || token === 'marca') { imageSource = 'brand'; payloadImageFolder = null; payloadImageBackgroundColor = null; screenshotUrls.length = 0; continue; }
    if (token === 'free' || token === 'gratis' || token === 'stock') { imageSource = 'free'; payloadImageFolder = null; payloadImageBackgroundColor = null; screenshotUrls.length = 0; continue; }
    if (token === 'pasta' || token === 'folder') {
      imageSource = 'folder';
      payloadImageBackgroundColor = null;
      screenshotUrls.length = 0;
      if (next && !resolveStageAlias(next) && !['quick', 'pro', 'screenshot', 'api', 'free'].includes(next)) {
        payloadImageFolder = normalizeProjectFolder(projectDir, next);
        i += 1;
      }
      continue;
    }
    if (token === 'solido' || token === 'solid') {
      imageSource = 'solid';
      payloadImageFolder = null;
      screenshotUrls.length = 0;
      if (next && !resolveStageAlias(next) && !['quick', 'pro', 'screenshot', 'api', 'free', 'brand', 'marca', 'folder', 'pasta'].includes(next)) {
        payloadImageBackgroundColor = next;
        i += 1;
      } else {
        payloadImageBackgroundColor = '#0D0D0D';
      }
      continue;
    }

    if (token.match(/^https?:\/\//) || token.match(/\.\w{2,4}$/)) {
      screenshotUrls.push(token.startsWith('http') ? token : `https://${token}`);
      if (imageSource === 'brand') imageSource = 'screenshot';
      continue;
    }

    const resolved = resolveStageAlias(token);
    if (resolved) {
      stageNumbers.add(resolved);
      if (resolved === 3 && !videoQuick && !videoPro) videoQuick = true;
    }
  }

  const sortedStages = [...stageNumbers].sort();
  if (sortedStages.length === 0) {
    return { ok: false, error: 'Etapas nao reconhecidas. Use: brief, imagens, video quick, video pro, plataformas, distribuicao.' };
  }

  let briefData = {};
  const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
  if (fs.existsSync(briefPath)) {
    try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
  }

  const hasSpecialTemplate = videoTemplates.some((t) => t === 'gatilhos' || t === 'report');
  if (hasSpecialTemplate) {
    videoPro = true;
    videoQuick = false;
  }

  if (videoPro && !hasSpecialTemplate) videoQuick = true;
  // Se viral foi pedido sozinho (sem quick/pro), NÃO força quick
  if (videoViral && !videoPro && !videoQuick) {
    // viral standalone — quick fica off
  }
  const videoMode = videoPro && videoQuick ? 'both' : videoPro ? 'pro' : (videoViral && !videoQuick ? 'viral' : 'quick');

  if (videoTemplates.length === 0) videoTemplates.push(origPayload.video_template || 'auto');

  const payloads = videoTemplates.map((tpl) => ({
    task_name: campaignFolder,
    task_date: new Date().toISOString().slice(0, 10),
    project_dir: projectDir,
    output_dir: outputDir,
    platform_targets: briefData.platforms || ['instagram'],
    language: 'pt-BR',
    image_count: origPayload.image_count || 5,
    image_formats: origPayload.image_formats || ['carousel_1080x1080'],
    video_count: 1,
    image_source: imageSource,
    image_folder: payloadImageFolder,
    image_background_color: payloadImageBackgroundColor,
    image_model: getDefaultImageModel(),
    image_provider: origPayload.image_provider || null,
    image_reference: origPayload.image_reference || null,
    image_reference_note: origPayload.image_reference_note || null,
    screenshot_urls: screenshotUrls,
    use_brand_overlay: true,
    campaign_brief: briefData.campaign_angle || origPayload.campaign_brief || '',
    video_mode: videoMode,
    video_quick: videoQuick,
    video_pro: videoPro,
    video_viral: videoViral,
    music_enabled: musicEnabled,
    captions_enabled: captionsEnabled,
    viral_duration: viralDuration,
    video_draft: videoDraft,
    video_template: tpl,
    approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
    notifications: true,
    skip_dependencies: true,
    skip_completed: false,
  }));

  if (cleanFlags.plan || cleanFlags.img || cleanFlags.audio) {
    for (const p of payloads) p.cleanFlags = cleanFlags;
  }

  return { ok: true, payloads, sortedStages, videoTemplates, videoMode, cleanFlags };
}

function registerRerunCommands(bot, deps) {
  const {
    projectRoot,
    session,
    findCampaign,
    findCampaignAcrossProjects,
    resolveStageAlias,
    buildConfigTable,
  } = deps;

  bot.command('continue', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);

    if (s.runningTask) {
      return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
    }

    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        '<b>/continue — Continuar campanha de onde parou</b>\n\n'
        + 'Uso: <code>/continue &lt;campanha&gt;</code>\n\n'
        + 'Detecta automaticamente quais etapas faltam e continua.\n'
        + 'Aceita flags de imagem: screenshot, api, free\n\n'
        + 'Exemplos:\n'
        + '<code>/continue c16</code>\n'
        + '<code>/continue c16 screenshot</code>\n'
        + '<code>/continue c16 inema.club</code>',
        { parse_mode: 'HTML' },
      );
    }

    const tokens = raw.split(/\s+/);
    const campaignQuery = tokens[0];

    let imageSource = 'brand';
    let userRequestedPro = false;
    let userRequestedQuick = false;
    let userRequestedDraft = false;
    const screenshotUrls = [];
    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i].toLowerCase();
      if (token === 'pro') { userRequestedPro = true; continue; }
      if (token === 'quick') { userRequestedQuick = true; continue; }
      if (token === 'draft') { userRequestedDraft = true; continue; }
      if (token === 'screenshot' || token === 'screenshots' || token === 'captura' || token === 'capturas') { imageSource = 'screenshot'; continue; }
      if (token === 'api') { imageSource = 'api'; continue; }
      if (token === 'free' || token === 'gratis' || token === 'stock') { imageSource = 'free'; continue; }
      if (token.match(/^https?:\/\//) || token.match(/\.\w{2,4}$/)) {
        screenshotUrls.push(token.startsWith('http') ? token : `https://${token}`);
        if (imageSource === 'brand') imageSource = 'screenshot';
      }
    }

    let projectDir = s.projectDir;
    let campaignFolder = findCampaign(projectRoot, projectDir, campaignQuery);
    if (!campaignFolder) {
      const result = findCampaignAcrossProjects(projectRoot, campaignQuery);
      if (result) {
        projectDir = result.projectDir;
        campaignFolder = result.campaignFolder;
      }
    }
    if (!campaignFolder) {
      return ctx.reply(`Campanha "${campaignQuery}" nao encontrada em nenhum projeto.`);
    }
    if (projectDir !== s.projectDir) session.setProject(chatId, projectDir);

    const outputDir = `${projectDir}/outputs/${campaignFolder}`;
    const absOutputDir = path.resolve(projectRoot, outputDir);

    const has = (rel) => fs.existsSync(path.join(absOutputDir, rel));
    const hasAny = (dir, ext) => {
      const fullDir = path.join(absOutputDir, dir);
      if (!fs.existsSync(fullDir)) return false;
      return fs.readdirSync(fullDir).some((file) => file.endsWith(ext));
    };

    const stageStatus = {
      1: has('creative/creative_brief.json') && has('copy/narrative.json'),
      2: hasAny('ads', '.png'),
      3: hasAny('video', '.mp4'),
      4: hasAny('platforms', '.json'),
      5: has(`Publish ${campaignFolder} ${new Date().toISOString().slice(0, 10)}.md`) || fs.readdirSync(absOutputDir).some((file) => file.startsWith('Publish ')),
    };

    const missingStages = [];
    for (let stage = 1; stage <= 5; stage += 1) {
      if (!stageStatus[stage]) missingStages.push(stage);
    }

    if (missingStages.length === 0) {
      return ctx.reply(`Campanha <b>${campaignFolder}</b> esta completa! Todos os 5 estagios ja foram executados.\n\nUse /rerun para reprocessar etapas especificas.`, { parse_mode: 'HTML' });
    }

    let briefData = {};
    const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
    if (fs.existsSync(briefPath)) {
      try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
    }

    let originalPayload = null;
    const savedPayloadPath = path.join(absOutputDir, 'campaign_payload.json');
    if (fs.existsSync(savedPayloadPath)) {
      try { originalPayload = JSON.parse(fs.readFileSync(savedPayloadPath, 'utf-8')); } catch {}
    }

    let videoPro;
    let videoQuick;
    if (userRequestedPro || userRequestedQuick) {
      videoPro = userRequestedPro;
      videoQuick = true;
    } else if (originalPayload?.video_mode) {
      videoPro = originalPayload.video_pro === true;
      videoQuick = originalPayload.video_quick !== false;
    } else {
      const videoDir = path.join(absOutputDir, 'video');
      const audioDir = path.join(absOutputDir, 'audio');
      const hasScenePlan = fs.existsSync(videoDir) && fs.readdirSync(videoDir).some((file) => file.includes('scene_plan'));
      const hasNarration = fs.existsSync(audioDir) && fs.readdirSync(audioDir).some((file) => file.includes('narration'));
      videoPro = hasScenePlan || hasNarration;
      videoQuick = true;
    }
    const videoMode = videoPro ? 'both' : 'quick';

    const payload = {
      task_name: campaignFolder,
      task_date: new Date().toISOString().slice(0, 10),
      project_dir: projectDir,
      output_dir: outputDir,
      platform_targets: briefData.platforms || ['instagram'],
      language: 'pt-BR',
      image_count: 5,
      image_formats: ['carousel_1080x1080'],
      video_count: 1,
      image_source: imageSource,
      image_folder: null,
      image_model: getDefaultImageModel(),
      screenshot_urls: screenshotUrls,
      use_brand_overlay: true,
      campaign_brief: briefData.campaign_angle || '',
      video_mode: videoMode,
      video_quick: videoQuick,
      video_pro: videoPro,
      video_draft: userRequestedDraft,
      video_template: originalPayload?.video_template || 'auto',
      approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
      notifications: true,
      skip_dependencies: true,
      skip_completed: true,
    };

    const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    const statusLines = [];
    for (let stage = 1; stage <= 5; stage += 1) {
      const icon = stageStatus[stage] ? '✅' : '⏳';
      if (stage === 3) {
        const quickIcon = stageStatus[3] ? '✅' : '▶️';
        const proIcon = stageStatus[3] ? '✅' : (videoPro ? '▶️' : '⬜');
        statusLines.push(`${icon} <b>${stage}.</b> Video`);
        statusLines.push(`    ${quickIcon} Quick`);
        if (videoPro) statusLines.push(`    ${proIcon} Pro`);
      } else {
        statusLines.push(`${icon} <b>${stage}.</b> ${stageLabels[stage]}`);
      }
    }

    const imgLabels = { brand: 'marca', screenshot: 'screenshots do site', api: 'IA (API)', free: 'banco gratis' };
    const imgInfo = imageSource !== 'brand' ? `\nImagens: <b>${imgLabels[imageSource] || imageSource}</b>` : '';
    const urlInfo = screenshotUrls.length > 0 ? `\nURLs: ${screenshotUrls.join(', ')}` : '';
    const videoInfo = `\nVideo Quick: <b>${videoQuick ? '1' : '0'}</b> | Video Pro: <b>${videoPro ? '1' : '0'}</b>`;

    await ctx.reply(
      `<b>Continuar: ${campaignFolder}</b>\n`
      + `Projeto: <code>${projectDir}</code>${imgInfo}${videoInfo}${urlInfo}\n\n`
      + statusLines.join('\n')
      + '\n\n'
      + `Vai executar ${missingStages.length} etapa(s) pendente(s).\n`
      + 'Responda <b>sim</b> para iniciar.',
      { parse_mode: 'HTML' },
    );

    session.setPendingRerun(chatId, { payload, stages: missingStages, campaignFolder });
  });

  bot.command('rerun', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);

    if (s.runningTask) {
      return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
    }

    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        '<b>/rerun — Reprocessar etapas de campanha existente</b>\n\n'
        + 'Uso: <code>/rerun &lt;campanha&gt; &lt;etapas&gt;</code>\n\n'
        + 'Exemplos:\n'
        + '<code>/rerun c13 imagens</code>\n'
        + '<code>/rerun c13 video quick</code>\n'
        + '<code>/rerun c13 video pro</code>\n'
        + '<code>/rerun c13 video pro screenshot</code>\n'
        + '<code>/rerun c13 video pro inema.club</code>\n'
        + '<code>/rerun c13 imagens api</code>\n'
        + '<code>/rerun c13 2,3</code>\n'
        + '<code>/rerun c13 video pro cleanplan</code>\n'
        + '<code>/rerun c13 video pro cleanall</code>\n'
        + '<code>/rerun c13 video pro data_story</code>\n'
        + '<code>/rerun c13 video pro template explainer</code>\n\n'
        + 'Fonte de imagens: <i>brand</i> (default), <i>screenshot</i>, <i>api</i>, <i>free</i>, <i>pasta</i>\n'
        + 'Templates: <i>auto</i>, <i>data_story</i>, <i>explainer</i>, <i>narrativo</i>, <i>brand_film</i>\n'
        + 'Limpeza: <i>cleanplan</i>, <i>cleanimg</i>, <i>cleanaudio</i>, <i>cleanall</i>',
        { parse_mode: 'HTML' },
      );
    }

    const args = raw.split(/\s+/);
    const campaignQuery = args[0];
    const stageArgs = args.slice(1).join(' ').split(',').map((item) => item.trim()).filter(Boolean);

    let projectDir = s.projectDir;
    let campaignFolder = findCampaign(projectRoot, projectDir, campaignQuery);
    if (!campaignFolder) {
      const result = findCampaignAcrossProjects(projectRoot, campaignQuery);
      if (result) {
        projectDir = result.projectDir;
        campaignFolder = result.campaignFolder;
      }
    }
    if (!campaignFolder) {
      return ctx.reply(`Campanha "${campaignQuery}" nao encontrada em nenhum projeto.`);
    }

    if (projectDir !== s.projectDir) {
      session.setProject(chatId, projectDir);
    }

    const outputDir = `${projectDir}/outputs/${campaignFolder}`;
    const absOutputDir = path.resolve(projectRoot, outputDir);

    if (stageArgs.length === 0) {
      return ctx.reply('Especifique quais etapas. Ex: <code>/rerun c13 video quick</code>', { parse_mode: 'HTML' });
    }

    const built = buildRerunPayloads({
      stageTokens: stageArgs,
      campaignFolder,
      projectDir,
      projectRoot,
      resolveStageAlias,
    });
    if (!built.ok) {
      return ctx.reply(built.error);
    }
    const { payloads, sortedStages, videoTemplates, cleanFlags } = built;
    const payload = payloads[0];

    const stageLabelsMap = { 1: 'Brief', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    const stageLabel = sortedStages.map((stage) => (
      stage === 3
        ? `Video ${payload.video_pro && payload.video_quick ? 'Quick + Pro' : payload.video_pro ? 'Pro' : 'Quick'}`
        : stageLabelsMap[stage]
    )).join(' + ');

    const configLines = buildConfigTable(payload, `Reprocessar: ${campaignFolder}`);
    if (videoTemplates.length > 1) {
      configLines.push(`\n<b>Templates (${videoTemplates.length}):</b> ${videoTemplates.join(', ')}`);
      configLines.push(`<i>Cada template gera um vídeo Pro separado (${videoTemplates.length} vídeos)</i>`);
    }
    configLines.push(`\n<b>Etapas:</b> ${stageLabel}`);
    if (payload.cleanFlags) {
      const cleans = [];
      if (payload.cleanFlags.plan) cleans.push('planos');
      if (payload.cleanFlags.img) cleans.push('imagens');
      if (payload.cleanFlags.audio) cleans.push('áudio');
      if (cleans.length) configLines.push(`<b>Limpar:</b> ${cleans.join(', ')}`);
    }
    configLines.push('\n<i>• = alterado do default</i>');
    configLines.push('Responda <b>sim</b> para iniciar ou ajuste antes.');
    configLines.push('<code>não</code> — cancelar');

    await ctx.reply(configLines.join('\n'), { parse_mode: 'HTML' });
    session.setPendingRerun(chatId, { payloads, stages: sortedStages, campaignFolder });
  });

  bot.command('loterun', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);

    if (s.runningTask) {
      return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
    }

    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        '<b>/loterun — Rerun em série para múltiplas campanhas</b>\n\n'
        + 'Uso: <code>/loterun &lt;campanhas&gt; &lt;etapas&gt; [flags]</code>\n\n'
        + 'Campanhas: lista (<code>c1,c2,c3</code>) ou range (<code>c1-c5</code>).\n'
        + 'Etapas e flags: mesma sintaxe do /rerun.\n\n'
        + '<b>Tipos de vídeo:</b> <code>quick</code>, <code>pro</code>, <code>viral</code> (combinable).\n'
        + '<b>Flags do viral:</b> <code>musica</code> (trilha+ducking), <code>caption</code> (legendas).\n\n'
        + 'Exemplos:\n'
        + '<code>/loterun c10,c11,c12 video pro template data_story</code>\n'
        + '<code>/loterun c20-c25 imagens api</code>\n'
        + '<code>/loterun c1,c2,c3 video pro template gatilhos cleanall</code>\n'
        + '<code>/loterun c5,c6 video viral musica caption</code>\n'
        + '<code>/loterun c5 video pro viral</code> (roda os dois em paralelo)\n\n'
        + '<i>Roda uma campanha por vez. Se uma falhar, segue para a próxima.</i>',
        { parse_mode: 'HTML' },
      );
    }

    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return ctx.reply('Uso: <code>/loterun &lt;c1,c2,...&gt; &lt;etapas&gt;</code>', { parse_mode: 'HTML' });
    }

    const campaignQueries = parseCampaignList(parts[0]);
    if (campaignQueries.length === 0) {
      return ctx.reply('Lista de campanhas inválida. Use <code>c1,c2,c3</code> ou <code>c1-c5</code>.', { parse_mode: 'HTML' });
    }

    const stageArgs = parts.slice(1).join(' ').split(',').map((item) => item.trim()).filter(Boolean);

    // Resolve each campaign and build payloads
    const resolved = [];
    const missing = [];
    for (const q of campaignQueries) {
      let projectDir = s.projectDir;
      let folder = findCampaign(projectRoot, projectDir, q);
      if (!folder) {
        const r = findCampaignAcrossProjects(projectRoot, q);
        if (r) { projectDir = r.projectDir; folder = r.campaignFolder; }
      }
      if (!folder) { missing.push(q); continue; }

      const built = buildRerunPayloads({
        stageTokens: stageArgs,
        campaignFolder: folder,
        projectDir,
        projectRoot,
        resolveStageAlias,
      });
      if (!built.ok) {
        return ctx.reply(`Falha em <code>${q}</code>: ${built.error}`, { parse_mode: 'HTML' });
      }
      resolved.push({ query: q, projectDir, campaignFolder: folder, payloads: built.payloads, sortedStages: built.sortedStages, videoTemplates: built.videoTemplates });
    }

    if (resolved.length === 0) {
      return ctx.reply(`Nenhuma campanha encontrada: ${missing.join(', ')}`);
    }

    // Show confirmation — use first resolved for the config table
    const first = resolved[0];
    const firstPayload = first.payloads[0];
    const stageLabelsMap = { 1: 'Brief', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    const stageLabel = first.sortedStages.map((stage) => (
      stage === 3
        ? `Video ${firstPayload.video_pro && firstPayload.video_quick ? 'Quick + Pro' : firstPayload.video_pro ? 'Pro' : 'Quick'}`
        : stageLabelsMap[stage]
    )).join(' + ');

    const configLines = buildConfigTable(firstPayload, `Lote rerun — ${resolved.length} campanhas`);
    if (first.videoTemplates.length > 1) {
      configLines.push(`\n<b>Templates (${first.videoTemplates.length}):</b> ${first.videoTemplates.join(', ')}`);
    }
    configLines.push(`\n<b>Etapas:</b> ${stageLabel}`);
    if (firstPayload.cleanFlags) {
      const cleans = [];
      if (firstPayload.cleanFlags.plan) cleans.push('planos');
      if (firstPayload.cleanFlags.img) cleans.push('imagens');
      if (firstPayload.cleanFlags.audio) cleans.push('áudio');
      if (cleans.length) configLines.push(`<b>Limpar:</b> ${cleans.join(', ')}`);
    }
    const preview = resolved.slice(0, 10).map((r, i) => `${i + 1}. <code>${r.campaignFolder}</code>`).join('\n');
    const more = resolved.length > 10 ? `\n<i>...e mais ${resolved.length - 10}</i>` : '';
    configLines.push(`\n<b>Campanhas (${resolved.length}):</b>\n${preview}${more}`);
    if (missing.length > 0) {
      configLines.push(`\n<b>Não encontradas:</b> ${missing.join(', ')}`);
    }
    configLines.push('\n<i>Roda em série. Se uma falhar, segue a próxima.</i>');
    configLines.push('Responda <b>sim</b> para iniciar ou <b>não</b> para cancelar.');

    await ctx.reply(configLines.join('\n'), { parse_mode: 'HTML' });
    session.setPendingLoterun(chatId, { items: resolved });
  });
}

module.exports = { registerRerunCommands, normalizeProjectFolder, buildRerunPayloads, parseCampaignList };
