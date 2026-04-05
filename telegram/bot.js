/**
 * Telegram Bot for timesmkt3
 *
 * Receives instructions via Telegram, dispatches pipeline jobs,
 * and returns results (text, images, videos) to the chat.
 *
 * Usage: node telegram/bot.js
 */

const path = require('path');
const crypto = require('crypto');
const { getEnv } = require('../config/env');

const { Bot, InputFile } = require('grammy');
const fs = require('fs');

const https = require('https');
const config = require('./config');
const session = require('./session');
const { toTelegramHTML, splitMessage } = require('./formatter');
const { sendPhoto, sendVideo, sendDocument, sendCampaignOutputs } = require('./media');
const { isWorkerRunning, ensureWorker: ensureWorkerProcess } = require('./worker-process');
const { runClaude: runClaudeProcess } = require('./claude-runner');
const { resolveStageAlias, buildPayload, buildConfigTable, showCampaignConfirmation, parseCampaignFromText } = require('./campaign-utils');
const {
  createScanPendingApprovals,
  registerOperationalCommands,
} = require('./bot-operations');
const { startContinuousMonitor } = require('./bot-monitor');
const { createBotRuntime } = require('./bot-runtime');
const { registerStatusCommand } = require('./bot-status');
const { registerRerunCommands, normalizeProjectFolder } = require('./bot-rerun');
const { createPendingTextHandlers } = require('./bot-text-pending');
const {
  createCampaignOutputHandlers,
  detectProjectFromText,
  findCampaign,
  findCampaignAcrossProjects,
} = require('./campaign-outputs');
const { createV3Flow } = require('./v3-flow');
const { IMPORTS_DIR, scanBatch } = require('../scripts/campaign-import-worker');
const {
  readChatContext,
  writeImageApproval,
  writeVideoApproval,
  formatStoryboardMessage,
  sendImageApprovalRequest: sendImageApprovalRequestBase,
  sendVideoApprovalRequest: sendVideoApprovalRequestBase,
  scanPendingApprovals: scanPendingApprovalsBase,
} = require('./approval-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const runtimeEnv = {
  IMAGE_PROVIDER: getEnv('IMAGE_PROVIDER', 'kie'),
  KIE_DEFAULT_MODEL: getEnv('KIE_DEFAULT_MODEL', 'z-image'),
};
const ensureWorker = () => ensureWorkerProcess({ projectRoot: PROJECT_ROOT });
const sendStageApprovalRequestRef = { current: null };
const sendImageApprovalRequest = (_ctx, chatId, outputDir) => sendImageApprovalRequestBase({
  projectRoot: PROJECT_ROOT,
  botApi: bot.api,
  session,
  chatId,
  outputDir,
});
const sendVideoApprovalRequest = (_ctx, chatId, outputDir) => sendVideoApprovalRequestBase({
  projectRoot: PROJECT_ROOT,
  botApi: bot.api,
  session,
  chatId,
  outputDir,
  escapeHtml,
});

// Module-level so /rerun can clear signals for re-processed stages
const monitoredSignals = new Set();

const { enqueueStage: _enqueueStage, STAGES } = require('../pipeline/orchestrator');
const { pipelineQueue } = require('../pipeline/queues');

const bot = new Bot(config.botToken);
const { sendCampaignReport, sendCampaignFiles } = createCampaignOutputHandlers({
  splitMessage,
  toTelegramHTML,
  sendPhoto,
  sendVideo,
  sendDocument,
});
const scanPendingApprovals = createScanPendingApprovals({
  projectRoot: PROJECT_ROOT,
  bot,
  session,
  scanPendingApprovalsBase,
  sendImageApprovalRequest,
  sendVideoApprovalRequest,
});
registerOperationalCommands(bot, {
  projectRoot: PROJECT_ROOT,
  session,
  escapeHtml,
  findCampaign,
  findCampaignAcrossProjects,
});
registerStatusCommand(bot, {
  projectRoot: PROJECT_ROOT,
  session,
});
registerRerunCommands(bot, {
  projectRoot: PROJECT_ROOT,
  session,
  findCampaign,
  findCampaignAcrossProjects,
  resolveStageAlias,
  buildConfigTable,
});

const BOT_ACK = 'inemamkt >';

function listProjectCampaignFolders(projectDir, { includeArchived = false } = {}) {
  const outputsDir = path.join(PROJECT_ROOT, projectDir, 'outputs');
  if (!fs.existsSync(outputsDir)) return [];
  return fs.readdirSync(outputsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(outputsDir, name, 'creative', 'creative_brief.json')))
    .filter((name) => includeArchived || !fs.existsSync(path.join(outputsDir, name, 'archived.json')))
    .sort()
    .reverse();
}

function parseBatchImageSource(raw, projectDir) {
  const input = String(raw || 'brand').trim();
  const solidMatch = input.match(/^(solido|solid)(?:\s+(.+))?$/i);
  if (solidMatch) {
    return {
      image_source: 'solid',
      image_background_color: solidMatch[2] || '#0D0D0D',
      image_folder: null,
    };
  }

  const folderMatch = input.match(/^(pasta|folder)\s+(.+)$/i);
  if (folderMatch) {
    return {
      image_source: 'folder',
      image_folder: normalizeProjectFolder(projectDir, folderMatch[2].trim()),
      image_background_color: null,
    };
  }

  if (input.includes('/') || input.includes('\\')) {
    return {
      image_source: 'folder',
      image_folder: normalizeProjectFolder(projectDir, input),
      image_background_color: null,
    };
  }

  const aliases = { marca: 'brand', gratis: 'free', captura: 'screenshot' };
  const source = aliases[input.toLowerCase()] || input.toLowerCase() || 'brand';
  return {
    image_source: source,
    image_folder: null,
    image_background_color: null,
  };
}

function parseBatchQuickMode(raw) {
  const input = String(raw || '').trim().toLowerCase();
  if (!input) return 'enxuto';
  if (['enxuto', 'enxuta'].includes(input)) return 'enxuto';
  if (input === 'normal') return 'normal';
  return 'enxuto';
}

function parseExplicitCampaigns(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveBatchDir(projectDir, batchId) {
  const safeBatchId = String(batchId || '').trim();
  if (!safeBatchId) return null;

  const candidates = [
    path.join(PROJECT_ROOT, projectDir, 'imports', safeBatchId),
    path.join(PROJECT_ROOT, projectDir, 'outputs', 'imports', safeBatchId),
  ];

  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, 'manifest.json'))
    || fs.existsSync(path.join(candidate, '.state.json'))
  )) || null;
}

// ── Auth middleware ──────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  // If allowedChatIds is empty, allow all (dev mode)
  if (config.allowedChatIds.length > 0) {
    const chatId = String(ctx.chat?.id);
    if (!config.allowedChatIds.includes(chatId)) {
      return ctx.reply('Acesso nao autorizado.');
    }
  }

  // Send ack before processing any message
  if (ctx.message?.text) {
    const text = ctx.message.text;
    const skipAck = /^\/(start|help|projetos|outputs|status)/.test(text);
    if (!skipAck) await ctx.reply(BOT_ACK);
  } else if (ctx.message?.photo || ctx.message?.document) {
    await ctx.reply(BOT_ACK);
  }

  await next();
});

// ── /start ──────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  await ctx.reply(
    `Ola! Sou o bot do <b>timesmkt3 v4.3</b>.\n\n` +
    `Projeto ativo: <code>${s.projectDir}</code>\n\n` +
    `<b>Comandos principais:</b>\n` +
    `/campanha &lt;nome&gt; — rodar pipeline 5 etapas\n` +
    `/rerun &lt;campanha&gt; &lt;etapas&gt; — reprocessar etapas\n` +
    `/continue &lt;campanha&gt; — continuar de onde parou\n` +
    `/status — ver status do pipeline\n` +
    `/enviar &lt;campanha&gt; [tipo] — receber arquivos\n` +
    `/cancel — cancelar pipeline ativo\n` +
    `/projetos — listar/mudar projeto\n` +
    `/help — menu completo`,
    { parse_mode: 'HTML' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `<b>timesmkt3 v4.3 — Menu Completo</b>\n\n` +

    `<b>Pipeline (5 etapas)</b>\n` +
    `/campanha &lt;nome&gt; [opcoes] — pipeline completo\n` +
    `/lote — ajuda de lotes\n` +
    `/lotequick &lt;ativos|todos|campanhas ...&gt; [qtd] fonte ... [modo ...] — batch quick\n` +
    `/lotecontinue &lt;batch_id&gt; — retomar lote do erro\n` +
    `/rerun &lt;campanha&gt; &lt;etapas&gt; — reprocessar\n` +
    `/continue &lt;campanha&gt; — continuar de onde parou\n` +
    `/cancel — cancelar pipeline ativo\n` +
    `/status — status por etapa\n` +
    `/outputs — listar campanhas\n` +
    `/relatorio &lt;campanha&gt; — resumo de arquivos\n` +
    `/enviar &lt;campanha&gt; [imagens|videos|audio|copy|tudo]\n` +
    `/aprovar — re-verificar aprovacoes pendentes\n` +
    `/modos [etapa] [humano|agente|auto]\n\n` +

    `<b>Etapas do pipeline:</b>\n` +
    `  1. Estrategia — Research + Diretor Criativo + Copywriter\n` +
    `  2. Imagens — Ad Creative Designer (validação aspect ratio)\n` +
    `  3. Video — Quick (ffmpeg) + Pro (Diretor de Foto + Opus + Remotion)\n` +
    `  4. Plataformas — Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn\n` +
    `  5. Distribuicao — Upload + Agendar + Publicar\n\n` +

    `<b>Projetos</b>\n` +
    `/projetos — lista projetos\n` +
    `/projeto &lt;nome&gt; — muda projeto ativo\n\n` +

    `<b>Agentes avulsos</b>\n` +
    `/pesquisa &lt;tema&gt; — Research Agent\n` +
    `/copy &lt;campanha&gt; — Copywriter Agent\n\n` +

    `<b>Midia</b>\n` +
    `/img-api, /img-free, /img-pasta\n` +
    `/tts-api — narracao ElevenLabs\n` +
    `/media-status — APIs configuradas\n\n` +

    `<b>Fotos (upload)</b>\n` +
    `/fotoprojeto — fotos vao para assets/\n` +
    `/fotocampanha — fotos vao para campanha ativa\n\n` +

    `<b>Rerun / Continue:</b>\n` +
    `<code>/continue c16</code> — continua de onde parou\n` +
    `<code>/continue c16 screenshot</code> — com capturas do site\n` +
    `<code>/rerun c15 video pro</code>\n` +
    `<code>/rerun c14 imagens api</code>\n` +
    `<code>/rerun c13 2,3</code>\n` +
    `<code>/lote</code>\n` +
    `<code>/lotequick ativos 10 fonte solido #0D0D0D modo enxuto</code>\n` +
    `<code>/lotequick campanhas c2,c44,c45 fonte brand modo normal</code>\n` +
    `Ajustes do lote: <code>fonte api</code>, <code>fonte pasta prj/inema/imgs</code>, <code>fonte screenshot https://site.com</code>, <code>modo enxuto</code>, <code>modo normal</code>\n\n` +

    `<b>Conversa</b>\n` +
    `/novochat — limpa historico\n` +
    `Texto livre = conversa com Claude`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpcampanha ──────────────────────────────────────────────────────────

bot.command('helpcampanha', async (ctx) => {
  await ctx.reply(
    `<b>PIPELINE COMPLETO — timesmkt3 v4.3</b>\n\n` +

    `O pipeline roda em <b>5 etapas</b>:\n` +
    `  <b>1.</b> Estrategia — Research + Diretor Criativo + Copywriter\n` +
    `  <b>2.</b> Imagens — Ad Creative Designer (validação 1:1/9:16)\n` +
    `  <b>3.</b> Video\n` +
    `      ▶️ Quick — slideshow 15s (ffmpeg)\n` +
    `      ▶️ Pro — Diretor de Fotografia + Scene Plan + Remotion 60s\n` +
    `  <b>4.</b> Plataformas — Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn\n` +
    `  <b>5.</b> Distribuicao — Upload + Agendar + Publicar\n\n` +

    `<b>Fases do Video Pro:</b>\n` +
    `  1. Narração (ElevenLabs)\n` +
    `  1.5 Timing áudio (ffprobe)\n` +
    `  1.6 Diretor de Fotografia (Opus)\n` +
    `  2. Scene Plan (Opus)\n` +
    `  3. Imagens (se API)\n` +
    `  4. Render (Remotion)\n\n` +

    `A cada etapa o bot envia o resultado e aguarda confirmação (modo padrão). Veja /helpaprovacoes.\n\n` +

    `<b>Como iniciar:</b>\n` +
    `Descreva sua campanha em linguagem natural:\n` +
    `<i>"quero uma campanha de páscoa para o projeto coldbrew com 5 imagens geradas por IA"</i>\n\n` +
    `Ou via comando:\n` +
    `<code>/campanha &lt;nome&gt; [opcoes]</code>\n\n` +

    `<b>Opções:</b>\n` +
    `  --date YYYY-MM-DD (padrão: hoje)\n` +
    `  --lang pt-BR|en (padrão: pt-BR)\n` +
    `  --platforms instagram,youtube,threads\n` +
    `  --images N — qtd de imagens (padrão: 5)\n` +
    `  --videos N — qtd de vídeos (padrão: 1)\n` +
    `  --skip-research — pula pesquisa\n` +
    `  --skip-image — pula imagens\n` +
    `  --skip-video — pula vídeo\n\n` +

    `<b>Exemplos:</b>\n` +
    `<code>/campanha pascoa_2026 --images 5</code>\n` +
    `<code>/campanha black_friday --skip-research --images 3</code>\n` +
    `<code>/campanha lancamento --platforms instagram --videos 1</code>\n\n` +

    `<b>Acompanhamento:</b>\n` +
    `/status — etapa atual e agentes rodando\n` +
    `/outputs — lista campanhas prontas\n` +
    `/enviar &lt;pasta&gt; — recebe os arquivos aqui\n` +
    `/helpaprovacoes — configurar modos de aprovação`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpaprovacoes ────────────────────────────────────────────────────────

bot.command('helpaprovacoes', async (ctx) => {
  await ctx.reply(
    `<b>APROVAÇÕES — Como funciona</b>\n\n` +

    `O pipeline v4 tem <b>5 pontos de aprovação</b>, um por etapa:\n\n` +
    `  <b>Etapa 1</b> — Brief Criativo\n` +
    `  O Diretor de Criação entrega o ângulo estratégico da campanha.\n` +
    `  Você aprova antes das imagens e copy serem gerados.\n\n` +
    `  <b>Etapa 2</b> — Imagens & Copy\n` +
    `  Imagens chegam ao vivo à medida que são geradas.\n` +
    `  Copy (Instagram, Threads, YouTube) é mostrado para aprovação.\n\n` +
    `  <b>Etapa 3</b> — Vídeo\n` +
    `  Roteiro cena a cena é enviado para revisão antes da renderização.\n\n` +
    `  <b>Etapa 4</b> — Distribuição\n` +
    `  Confirmação final antes de publicar nas plataformas.\n\n` +

    `<b>Modos por etapa:</b>\n\n` +
    `  👤 <b>humano</b> — você recebe o resultado e responde <b>sim</b> ou <b>não</b> (padrão)\n` +
    `  🤖 <b>agente</b> — Agente Revisor avalia e decide automaticamente; só notifica se pedir ajuste\n` +
    `  ⚡ <b>auto</b> — avança sem nenhuma aprovação\n\n` +

    `<b>Configurar antes de rodar:</b>\n` +
    `Descreva no briefing:\n` +
    `<i>"campanha de páscoa, aprovação por agente em tudo"</i>\n` +
    `<i>"campanha sem aprovações, notificações desativadas"</i>\n` +
    `<i>"aprovação humana só no brief e na distribuição"</i>\n\n` +

    `<b>Configurar durante a campanha:</b>\n` +
    `<code>/modos todas auto</code> — sem aprovações\n` +
    `<code>/modos todas agente</code> — Agente Revisor em tudo\n` +
    `<code>/modos 1 humano</code> — só etapa 1 com aprovação humana\n` +
    `<code>/modos 3 auto</code> — vídeo sem aprovação\n` +
    `<code>/modos notificacoes off</code> — silencia notificações de agentes\n\n` +

    `<b>O Agente Revisor:</b>\n` +
    `Quando modo <code>agente</code> está ativo, o revisor lê os outputs e decide:\n` +
    `  ✅ Aprovado → avança automaticamente\n` +
    `  ⚠️ Ajuste necessário → manda o feedback para você decidir\n\n` +

    `<b>Respostas aceitas nas aprovações:</b>\n` +
    `  <b>sim</b> / ok / confirma / vai / bora → avança\n` +
    `  <b>não</b> / cancela → cancela a campanha\n` +
    `  Qualquer texto longo → ajuste (ex: "deixa o copy mais direto")`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpimagens ───────────────────────────────────────────────────────────

bot.command('helpimagens', async (ctx) => {
  await ctx.reply(
    `<b>IMAGENS — Comandos</b>\n\n` +

    `<b>/img-api [prompt]</b> — Gera imagem via IA (~$0.004)\n` +
    `  --provider: kie (padrao), dalle, stability\n` +
    `  --ratio: 1:1, 4:3, 3:4, 16:9, 9:16\n` +
    `  --quality: standard, hd\n` +
    `Exemplos:\n` +
    `<code>/img-api mae e filha tomando cafe juntas</code>\n` +
    `<code>/img-api --provider dalle cafe em estilo cartoon</code>\n` +
    `<code>/img-api --ratio 9:16 cold brew em fundo escuro</code>\n\n` +

    `<b>/img-free [busca]</b> — Foto stock gratuita\n` +
    `  --provider: pexels (padrao), unsplash, pixabay\n` +
    `  --orientation: landscape, portrait, square\n` +
    `Exemplos:\n` +
    `<code>/img-free cafe da manha com familia</code>\n` +
    `<code>/img-free --provider pixabay --orientation portrait cafe</code>\n\n` +

    `<b>/img-svg [descricao]</b> — HTML→PNG via Playwright (gratis)\n` +
    `  --size: 1080x1080 (padrao), 1080x1920, 1920x1080\n` +
    `Exemplos:\n` +
    `<code>/img-svg card de produto com fundo escuro e texto dourado</code>\n` +
    `<code>/img-svg --size 1080x1920 story com headline bold</code>\n\n` +

    `<b>/img-pasta [caminho]</b> — Usa imagens locais\n` +
    `<code>/img-pasta prj/coldbrew-coffee-co/assets/</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpvideos ────────────────────────────────────────────────────────────

bot.command('helpvideos', async (ctx) => {
  await ctx.reply(
    `<b>VIDEOS — Comandos</b>\n\n` +

    `<b>/video-api [prompt]</b> — Gera video completo (gratis)\n` +
    `O Claude cria um scene plan → Remotion renderiza o video.\n` +
    `  --count: quantidade (padrao: 1)\n` +
    `  --fmt: v (vertical), q (quadrado), h (horizontal)\n` +
    `  --duration: 10, 15, 20, 30 segundos\n` +
    `Exemplos:\n` +
    `<code>/video-api mae e filha preparando cold brew</code>\n` +
    `<code>/video-api --count 2 --fmt v campanha de Pascoa</code>\n` +
    `<code>/video-api --duration 15 --fmt v,q campanha de Natal</code>\n\n` +

    `<b>/video-fmt [formato]</b> — Define formato\n` +
    `  v = 1080x1920 — Reels, Stories, Shorts\n` +
    `  q = 1080x1080 — Feed Instagram\n` +
    `  h = 1920x1080 — YouTube\n` +
    `  v,q = gera nos dois formatos\n\n` +

    `<b>/video-clip-pasta [caminho]</b> — Clips locais como assets\n` +
    `<code>/video-clip-pasta prj/coldbrew-coffee-co/assets/clips/</code>\n\n` +

    `<b>Como funciona o video:</b>\n` +
    `1. Claude gera um scene_plan.json com cenas, textos, cores\n` +
    `2. Remotion renderiza cada cena em video MP4\n` +
    `3. Cenas: Hook (0-3s) → Produto (3-8s) → Beneficio (8-12s) → CTA (12-15s)\n` +
    `4. Todas as animacoes usam o brand palette do projeto`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpaudio ─────────────────────────────────────────────────────────────

bot.command('helpaudio', async (ctx) => {
  await ctx.reply(
    `<b>AUDIO — Musica, SFX e Narracao</b>\n\n` +

    `<b>MUSICA</b>\n\n` +
    `<b>/musica-free [busca]</b> — Royalty-free (gratis)\n` +
    `  --provider: pixabay (padrao), freesound\n` +
    `  --duration: duracao max em segundos\n` +
    `<code>/musica-free lo-fi piano suave</code>\n` +
    `<code>/musica-free --duration 30 piano acustico</code>\n\n` +

    `<b>/musica-api [prompt]</b> — Musica via IA (~$0.05)\n` +
    `  --provider: suno | --duration: 15, 30, 60\n` +
    `<code>/musica-api lo-fi para video de Dia das Maes</code>\n\n` +

    `<b>EFEITOS SONOROS</b>\n\n` +
    `<b>/sfx-free [busca]</b> — SFX gratuito\n` +
    `  --provider: pixabay (padrao), freesound\n` +
    `<code>/sfx-free cafe sendo servido</code>\n` +
    `<code>/sfx-free whoosh transition</code>\n\n` +

    `<b>NARRACAO / TTS</b>\n\n` +
    `<b>/tts-api [texto]</b> — Voz IA premium (~$0.30/1k chars)\n` +
    `  --provider: elevenlabs (padrao), openai, minimax\n` +
    `  --voice:\n` +
    `    ElevenLabs: Rachel (fem, quente), Bella (fem, suave),\n` +
    `    Antoni (masc), Josh (masc, grave), Arnold (masc, forte)\n` +
    `    OpenAI: nova (fem), shimmer (fem), echo (quente),\n` +
    `    onyx (masc, grave), alloy (neutra), fable (expressiva)\n` +
    `  --lang: pt-BR, en, es\n` +
    `<code>/tts-api --voice Rachel Presente perfeito.</code>\n\n` +

    `<b>/tts-free [texto]</b> — TTS local (Piper, gratis)\n` +
    `<code>/tts-free Cada gole e um abraco.</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpcustos ────────────────────────────────────────────────────────────

bot.command('helpcustos', async (ctx) => {
  await ctx.reply(
    `<b>REFERENCIA DE CUSTOS</b>\n\n` +
    `<pre>` +
    `Comando        Custo          Provider\n` +
    `─────────────────────────────────────────\n` +
    `/img-api       ~$0.004/img    Kie.ai\n` +
    `/img-free      gratis         Pexels\n` +
    `/img-svg       gratis         Playwright\n` +
    `/video-api     gratis         Remotion\n` +
    `/musica-free   gratis         Pixabay\n` +
    `/musica-api    ~$0.05         Suno\n` +
    `/sfx-free      gratis         Pixabay\n` +
    `/tts-api       ~$0.30/1k ch   ElevenLabs\n` +
    `/tts-free      gratis         Piper\n` +
    `/campanha      variavel       todos` +
    `</pre>\n\n` +
    `O pipeline (/campanha) usa Claude Sonnet para cada agente.\n` +
    `Custo depende do numero de agentes e tamanho dos outputs.`,
    { parse_mode: 'HTML' }
  );
});

// ── /projetos ───────────────────────────────────────────────────────────────

bot.command('projetos', async (ctx) => {
  const prjDir = path.join(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjDir)) {
    return ctx.reply('Nenhum projeto encontrado. Pasta prj/ nao existe.');
  }

  const projects = fs.readdirSync(prjDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  if (projects.length === 0) {
    return ctx.reply('Nenhum projeto encontrado em prj/.');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const current = s.projectDir;

  const lines = projects.map(p => {
    const full = `prj/${p}`;
    const marker = full === current ? ' (ativo)' : '';
    return `- <code>${p}</code>${marker}`;
  });

  await ctx.reply(
    `<b>Projetos:</b>\n\n${lines.join('\n')}\n\nUse /projeto &lt;nome&gt; para mudar.`,
    { parse_mode: 'HTML' }
  );
});

// ── /projeto <nome> ─────────────────────────────────────────────────────────

bot.command('projeto', async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) {
    return ctx.reply('Use: /projeto <nome>\nExemplo: /projeto coldbrew-coffee-co');
  }

  const fullPath = path.join(PROJECT_ROOT, 'prj', name);
  if (!fs.existsSync(fullPath)) {
    return ctx.reply(`Projeto nao encontrado: prj/${name}`);
  }

  const chatId = String(ctx.chat.id);
  session.setProject(chatId, `prj/${name}`);

  await ctx.reply(`Projeto ativo: <code>prj/${name}</code>`, { parse_mode: 'HTML' });
});

// ── /outputs ────────────────────────────────────────────────────────────────

bot.command('outputs', async (ctx) => {
  const prjRoot = path.join(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjRoot)) return ctx.reply('Nenhuma campanha gerada ainda.');

  const projects = fs.readdirSync(prjRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const lines = [];
  for (const prj of projects) {
    const outputsDir = path.join(prjRoot, prj, 'outputs');
    if (!fs.existsSync(outputsDir)) continue;
    const folders = fs.readdirSync(outputsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
    if (folders.length > 0) {
      lines.push(`<b>${prj}:</b>`);
      folders.forEach(f => lines.push(`  - <code>${f}</code>`));
    }
  }

  if (lines.length === 0) return ctx.reply('Nenhuma campanha gerada ainda.');

  await ctx.reply(
    `<b>Campanhas disponíveis:</b>\n\n${lines.join('\n')}\n\nUse /relatorio &lt;pasta&gt; ou /enviar &lt;pasta&gt; [tipo]`,
    { parse_mode: 'HTML' }
  );
});

bot.command('lotequick', async (ctx) => {
  const raw = ctx.match?.trim() || '';
  if (!raw) {
    return ctx.reply(
      '<b>/lotequick — Batch de vídeos quick</b>\n\n'
      + 'Uso: <code>/lotequick &lt;ativos|todos|campanhas ...&gt; [qtd] fonte &lt;tipo&gt; [modo &lt;enxuto|normal&gt;]</code>\n\n'
      + 'Exemplos:\n'
      + '<code>/lotequick ativos 10 fonte solido #0D0D0D modo enxuto</code>\n'
      + '<code>/lotequick todos 5 fonte brand modo normal</code>\n'
      + '<code>/lotequick campanhas c1,c2,c3 fonte solido #0D0D0D modo enxuto</code>\n'
      + '<code>/lotequick c1,c2,c3 fonte brand modo normal</code>\n'
      + '<code>/lotequick ativos fonte pasta prj/inema/imgs/lote_abril modo normal</code>\n\n'
      + 'Regras:\n'
      + '• <b>campanhas</b> e lista explícita respeitam os IDs informados, incluindo arquivadas\n'
      + '• <b>modo enxuto</b> usa quick otimizado para lote\n'
      + '• <b>modo normal</b> roda o quick completo',
      { parse_mode: 'HTML' },
    );
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const forceNew = /\bnew\b/i.test(raw);
  const rawNoNew = raw.replace(/\bnew\b/gi, '').trim();
  const modeMatch = rawNoNew.match(/\bmodo\s+(enxuto|enxuta|normal)\b/i) || rawNoNew.match(/\b(enxuto|enxuta|normal)\b\s*$/i);
  const quickMode = parseBatchQuickMode(modeMatch?.[1] || '');
  const rawClean = modeMatch
    ? `${rawNoNew.slice(0, modeMatch.index).trim()} ${rawNoNew.slice(modeMatch.index + modeMatch[0].length).trim()}`.trim()
    : rawNoNew;
  const fonteMatch = rawClean.match(/\bfonte\b\s+(.+)$/i);
  const sourceSpec = fonteMatch ? fonteMatch[1].trim() : 'brand';
  const selectorRaw = fonteMatch ? rawClean.slice(0, fonteMatch.index).trim() : rawClean;
  const parts = selectorRaw.split(/\s+/).filter(Boolean);

  let scope = 'ativos';
  let explicitCampaigns = [];
  let cursor = 0;

  const isScopeWord = /^(ativos|ativo|todos|all|campanhas)$/i.test(parts[0] || '');
  const nextLooksCampaigns = parts[1] && /[a-z0-9]/.test(parts[1]) && !/^\d+$/.test(parts[1]);

  if (/^(ativos|ativo)$/i.test(parts[0] || '') && !nextLooksCampaigns) {
    scope = 'ativos';
    cursor = 1;
  } else if (/^(todos|all)$/i.test(parts[0] || '') && !nextLooksCampaigns) {
    scope = 'todos';
    cursor = 1;
  } else if (/^campanhas$/i.test(parts[0] || '')) {
    scope = 'campanhas';
    explicitCampaigns = parseExplicitCampaigns(parts.slice(1).join(' '));
    cursor = parts.length;
  } else {
    // Direct list (with or without scope prefix): /lotequick c1,c2 or /lotequick todos c1,c2
    scope = 'campanhas';
    const listStart = isScopeWord ? 1 : 0;
    explicitCampaigns = parseExplicitCampaigns(parts.slice(listStart).join(' '));
    cursor = parts.length;
  }

  let quantity = null;
  if ((scope === 'ativos' || scope === 'todos') && /^\d+$/.test(parts[cursor] || '')) {
    quantity = Number(parts[cursor]);
    cursor += 1;
  }

  const includeArchived = scope === 'todos' || scope === 'campanhas';
  const allCampaigns = listProjectCampaignFolders(s.projectDir, { includeArchived });
  let selected = [];
  if (scope === 'campanhas') {
    selected = explicitCampaigns
      .map((query) => {
        const lower = query.toLowerCase();
        // Normalize cN → c000N for matching (e.g. c1 → c0001, c45 → c0045)
        const padded = lower.replace(/^c(\d+)$/, (_, n) => `c${n.padStart(4, '0')}`);
        return allCampaigns.find((name) => {
          const n = name.toLowerCase();
          return n === lower || n === padded || n.startsWith(padded) || n.includes(lower);
        }) || null;
      })
      .filter(Boolean);
  } else {
    selected = quantity ? allCampaigns.slice(0, quantity) : allCampaigns;
  }

  if (selected.length === 0) {
    const label = scope === 'campanhas'
      ? 'da lista'
      : scope === 'todos'
        ? 'no projeto'
        : 'ativa';
    return ctx.reply(`Nenhuma campanha ${label} encontrada em <code>${s.projectDir}</code>.`, { parse_mode: 'HTML' });
  }

  const imageConfig = parseBatchImageSource(sourceSpec, s.projectDir);
  const sourceLabel = imageConfig.image_source === 'solid'
    ? `sólido ${imageConfig.image_background_color}`
    : imageConfig.image_source === 'folder'
      ? `pasta ${imageConfig.image_folder}`
      : imageConfig.image_source;

  session.setPendingLote(chatId, {
    projectDir: s.projectDir,
    scope,
    selected,
    imageConfig,
    sourceLabel,
    quickMode,
    sourceSpec,
    commandText: raw,
    forceNew,
  });

  const preview = selected.slice(0, 10).map((name) => `• <code>${name}</code>`).join('\n');
  const more = selected.length > 10 ? `\n<i>...e mais ${selected.length - 10}</i>` : '';

  await ctx.reply(
    `<b>Lote quick — confirmação</b>\n\n`
    + `Projeto: <code>${s.projectDir}</code>\n`
    + `Escopo: <b>${scope}</b>\n`
    + `Campanhas: <b>${selected.length}</b>\n`
    + `Fonte de imagem: <b>${sourceLabel}</b>\n\n`
    + `Modo: <b>${quickMode}</b>\n\n`
    + `${preview}${more}\n\n`
    + `Responda <b>sim</b> para iniciar ou <b>não</b> para cancelar.`,
    { parse_mode: 'HTML' },
  );
});

bot.command('lotecontinue', async (ctx) => {
  const batchId = ctx.match?.trim();
  if (!batchId) {
    return ctx.reply(
      '<b>/lotecontinue — Retomar lote</b>\n\n'
      + 'Uso: <code>/lotecontinue &lt;batch_id&gt;</code>\n\n'
      + 'Exemplo:\n'
      + '<code>/lotecontinue tg_lotequick_1775305296801_4d0556</code>',
      { parse_mode: 'HTML' },
    );
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const batchDir = resolveBatchDir(s.projectDir, batchId);

  if (!batchDir) {
    return ctx.reply(
      `Lote nao encontrado em <code>${s.projectDir}</code>: <code>${escapeHtml(batchId)}</code>`,
      { parse_mode: 'HTML' },
    );
  }

  await ctx.reply(
    `<b>Retomando lote</b>\n\n`
    + `Projeto: <code>${s.projectDir}</code>\n`
    + `Batch: <code>${escapeHtml(batchId)}</code>\n`
    + `Pasta: <code>${escapeHtml(path.relative(PROJECT_ROOT, batchDir).replace(/\\/g, '/'))}</code>`,
    { parse_mode: 'HTML' },
  );

  try {
    const result = await scanBatch(batchDir, {
      keepGoing: true,
      onProgress: async ({ status, campaign_id, index, total, error }) => {
        if (status === 'starting') {
          await ctx.reply(`Lote ${escapeHtml(batchId)}: iniciando <code>${escapeHtml(campaign_id)}</code> (${index}/${total})`, { parse_mode: 'HTML' });
          return;
        }
        if (status === 'done') {
          await ctx.reply(`Lote ${escapeHtml(batchId)}: concluida <code>${escapeHtml(campaign_id)}</code> (${index}/${total})`, { parse_mode: 'HTML' });
          return;
        }
        if (status === 'failed') {
          await ctx.reply(
            `Lote ${escapeHtml(batchId)}: falha em <code>${escapeHtml(campaign_id)}</code> (${index}/${total})\n<code>${escapeHtml(error || 'erro desconhecido')}</code>`,
            { parse_mode: 'HTML' },
          );
        }
      },
    });

    const okCount = result.detalhes.filter((item) => item.ok).length;
    const failCount = result.detalhes.length - okCount;
    await ctx.reply(
      `<b>Lote retomado</b>\n\n`
      + `Batch: <code>${escapeHtml(batchId)}</code>\n`
      + `Processados nesta retomada: <b>${okCount}</b>\n`
      + `Falhas nesta retomada: <b>${failCount}</b>\n`
      + `Total do lote: <b>${result.total}</b>\n`
      + `Restantes: <b>${result.restantes}</b>`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    await ctx.reply(
      `<b>Falha ao retomar lote</b>\n\n`
      + `Batch: <code>${escapeHtml(batchId)}</code>\n`
      + `Erro: <code>${escapeHtml(err.message || String(err))}</code>`,
      { parse_mode: 'HTML' },
    );
  }
});

bot.command('lote', async (ctx) => {
  await ctx.reply(
    '<b>Lotes</b>\n\n'
    + 'Comandos disponíveis:\n'
    + '<code>/lotequick &lt;ativos|todos|campanhas ...&gt; [qtd] fonte &lt;tipo&gt; [modo &lt;enxuto|normal&gt;]</code>\n\n'
    + '<code>/lotecontinue &lt;batch_id&gt;</code>\n\n'
    + 'Escopos:\n'
    + '• <b>ativos</b> — só campanhas não arquivadas\n'
    + '• <b>todos</b> — inclui arquivadas\n\n'
    + '• <b>campanhas</b> — lista explícita; respeita os IDs mesmo se estiverem arquivados\n\n'
    + 'Fontes:\n'
    + '• <code>fonte solido #0D0D0D</code>\n'
    + '• <code>fonte brand</code>\n'
    + '• <code>fonte api</code>\n'
    + '• <code>fonte free</code>\n'
    + '• <code>fonte pasta prj/inema/imgs/lote</code>\n\n'
    + 'Modos:\n'
    + '• <code>modo enxuto</code> — lote rápido, quick otimizado\n'
    + '• <code>modo normal</code> — quick completo\n\n'
    + 'Exemplos:\n'
    + '<code>/lotequick ativos 10 fonte solido #0D0D0D modo enxuto</code>\n'
    + '<code>/lotequick todos 5 fonte brand modo normal</code>\n'
    + '<code>/lotequick campanhas c1,c2,c3 fonte solido #0D0D0D modo enxuto</code>\n'
    + '<code>/lotequick c1,c2,c3 fonte brand modo normal</code>\n'
    + '<code>/lotequick ativos fonte pasta prj/inema/imgs/lote_abril modo normal</code>\n'
    + '<code>/lotecontinue tg_lotequick_1775305296801_4d0556</code>',
    { parse_mode: 'HTML' },
  );
});

// ── /relatorio <campanha> ────────────────────────────────────────────────────
// Send the Publish MD summary + list of available files for download

bot.command('relatorio', async (ctx) => {
  const folder = ctx.match?.trim();
  if (!folder) {
    return ctx.reply('Use: /relatorio <campanha>\nExemplo: /relatorio dia_das_maes_2026-05-10');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  let outputDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs', folder);

  if (!fs.existsSync(outputDir)) {
    // Try to find the campaign in any project
    const prjRoot = path.join(PROJECT_ROOT, 'prj');
    const projects = fs.existsSync(prjRoot) ? fs.readdirSync(prjRoot) : [];
    let found = null;
    for (const prj of projects) {
      const candidate = path.join(prjRoot, prj, 'outputs', folder);
      if (fs.existsSync(candidate)) { found = candidate; session.setProject(chatId, `prj/${prj}`); break; }
    }
    if (!found) return ctx.reply(`Campanha nao encontrada: ${folder}\n\nUse /outputs para listar campanhas disponíveis.`);
    outputDir = found;
  }

  await sendCampaignReport(ctx, outputDir, folder);
});

// ── /enviar <campanha> [tipo] ────────────────────────────────────────────────
// Download specific file types from a campaign
// ── /cancel ──────────────────────────────────────────────────────────────────

bot.command('cancel', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (!s.runningTask) {
    return ctx.reply('Nenhum pipeline ativo para cancelar.');
  }

  const taskName = s.runningTask.taskName;
  const outputDir = s.runningTask.outputDir;

  // Archive campaign so it won't be resumed on restart
  if (outputDir) {
    try {
      const campDir = path.join(PROJECT_ROOT, outputDir);
      fs.writeFileSync(
        path.join(campDir, 'archived.json'),
        JSON.stringify({ archived: true, reason: 'user cancel', at: new Date().toISOString() }, null, 2),
      );
    } catch {}
  }

  // Kill worker processes
  try {
    const { execSync } = require('child_process');
    const pids = execSync("ps aux | grep 'worker.js' | grep -v grep | awk '{print $2}'").toString().trim();
    if (pids) {
      for (const pid of pids.split('\n')) {
        try { process.kill(Number(pid), 'SIGTERM'); } catch {}
      }
    }
  } catch {}

  // Clear session state
  session.clearRunningTask(chatId);
  session.clearCampaignV3(chatId);
  session.clearPendingStageApproval(chatId);
  session.clearPendingVideoApproval(chatId);
  session.clearPendingCampaign(chatId);
  session.clearPendingRerun(chatId);
  session.clearPendingImageError(chatId);
  session.clearPendingLote(chatId);

  await ctx.reply(`Pipeline <b>${taskName}</b> cancelado.`, { parse_mode: 'HTML' });
});

// ── /enviar <campanha> [tipo] ────────────────────────────────────────────────
// tipo: imagens | videos | audio | copy | tudo

bot.command('enviar', async (ctx) => {
  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply(
      'Use: /enviar &lt;campanha&gt; [tipo]\n\n' +
      'Tipos: <code>imagens</code>, <code>videos</code>, <code>audio</code>, <code>copy</code>, <code>tudo</code>\n\n' +
      'Exemplos:\n' +
      '<code>/enviar dia_das_maes_2026-05-10 imagens</code>\n' +
      '<code>/enviar dia_das_maes_2026-05-10 videos</code>\n' +
      '<code>/enviar dia_das_maes_2026-05-10 tudo</code>',
      { parse_mode: 'HTML' }
    );
  }

  const parts = raw.split(/\s+/);
  const folder = parts[0];
  const tipo = parts[1] || 'tudo';

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  // Find campaign with partial match (c15 → c0015-pascoa2026)
  let outputDir = null;
  let resolvedFolder = findCampaign(PROJECT_ROOT, s.projectDir, folder);
  if (resolvedFolder) {
    outputDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs', resolvedFolder);
  } else {
    const result = findCampaignAcrossProjects(PROJECT_ROOT, folder);
    if (result) {
      resolvedFolder = result.campaignFolder;
      outputDir = path.join(PROJECT_ROOT, result.projectDir, 'outputs', resolvedFolder);
      session.setProject(chatId, result.projectDir);
    }
  }
  if (!outputDir || !fs.existsSync(outputDir)) {
    return ctx.reply(`Campanha nao encontrada: ${folder}\n\nUse /outputs para listar campanhas disponíveis.`);
  }

  await ctx.reply(`Enviando <b>${tipo}</b> de <code>${resolvedFolder}</code>...`, { parse_mode: 'HTML' });
  await sendCampaignFiles(ctx, outputDir, tipo);
});

// ── /campanha ───────────────────────────────────────────────────────────────

bot.command('campanha', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (s.runningTask) {
    return ctx.reply(`Ja existe um pipeline rodando: ${s.runningTask.taskName}. Use /status para acompanhar.`);
  }

  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply(
      'Use: /campanha <nome> [opcoes]\n\n' +
      'Opcoes:\n' +
      '  --date YYYY-MM-DD\n' +
      '  --lang pt-BR|en\n' +
      '  --platforms instagram,youtube,threads\n' +
      '  --images N\n' +
      '  --videos N\n' +
      '  --img-source brand|pexels|api|screenshot\n' +
      '  --img-model flux-kontext-pro|flux-kontext-max|gpt-image-1\n' +
      '  --skip-research / --skip-image / --skip-video\n\n' +
      'Ou escreva livremente o que quer na campanha — eu organizo e confirmo antes de rodar.'
    );
  }

  const args = raw.split(/\s+/);
  const taskName = args[0];
  const opts = parseArgs(args.slice(1));

  const today = new Date().toISOString().slice(0, 10);
  const payload = buildPayload(taskName, opts, s.projectDir, today, runtimeEnv);

  await showCampaignConfirmation({ ctx, chatId, payload, session, env: runtimeEnv });
});

// ── /pesquisa <tema> ────────────────────────────────────────────────────────

bot.command('pesquisa', async (ctx) => {
  const tema = ctx.match?.trim();
  if (!tema) {
    return ctx.reply('Use: /pesquisa <tema>\nExemplo: /pesquisa cold brew coffee trends');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  await ctx.reply(`Iniciando pesquisa: "${tema}"...`);

  const today = new Date().toISOString().slice(0, 10);
  const folderName = tema.replace(/\s+/g, '_').toLowerCase();
  const outputDir = path.join(s.projectDir, 'outputs', `${folderName}_${today}`);

  const prompt = `You are the Marketing Research Agent. Follow skills/marketing-research-agent/SKILL.md.
Task: Research "${tema}".
Date: ${today}
Output directory: ${outputDir}/
IMPORTANT: All output files MUST be in Brazilian Portuguese (pt-BR).
Read ${s.projectDir}/knowledge/brand_identity.md and ${s.projectDir}/knowledge/product_campaign.md for brand context.
Save: research_results.json, research_brief.md, interactive_report.html to ${outputDir}/`;

  runClaude(prompt, 'research_agent', (code, stdout) => {
    if (code === 0) {
      ctx.reply(`Pesquisa concluida! Use /enviar ${folderName}_${today} para receber os arquivos.`);
    } else {
      ctx.reply(`Pesquisa falhou (exit code ${code}).`);
    }
  });
});

// ── /copy <campanha> ────────────────────────────────────────────────────────

bot.command('copy', async (ctx) => {
  const campanha = ctx.match?.trim();
  if (!campanha) {
    return ctx.reply('Use: /copy <nome_da_campanha>\nExemplo: /copy dia_das_maes_2026-05-10');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const outputDir = path.join(s.projectDir, 'outputs', campanha);

  if (!fs.existsSync(path.join(PROJECT_ROOT, outputDir))) {
    return ctx.reply(`Campanha nao encontrada: ${outputDir}`);
  }

  await ctx.reply(`Gerando copy para "${campanha}"...`);

  const prompt = `You are the Copywriter Agent. Follow skills/copywriter-agent/SKILL.md.
Task: Write copy for campaign "${campanha}".
Platforms: instagram, youtube, threads
Research input: ${outputDir}/research_results.json
IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).
Read ${s.projectDir}/knowledge/brand_identity.md, ${s.projectDir}/knowledge/product_campaign.md, ${s.projectDir}/knowledge/platform_guidelines.md.
Save to ${outputDir}/copy/: threads_post.txt, instagram_caption.txt, youtube_metadata.json, copy_output.json`;

  runClaude(prompt, 'copywriter_agent', (code) => {
    if (code === 0) {
      ctx.reply(`Copy gerado! Use /enviar ${campanha} para receber os arquivos.`);
    } else {
      ctx.reply(`Geracao de copy falhou (exit code ${code}).`);
    }
  });
});

// ── /foto-projeto [pasta] ────────────────────────────────────────────────────
// Route next photos to project-level folder (default: imgs/)

bot.command('fotoprojeto', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const folder = ctx.match?.trim() || 'imgs';

  session.setPhotoTarget(chatId, 'project', folder);

  await ctx.reply(
    `Fotos enviadas serao salvas em:\n<code>${s.projectDir}/${folder}/</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /foto-campanha [pasta] ───────────────────────────────────────────────────
// Route next photos to current campaign's assets folder

bot.command('fotocampanha', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const folder = ctx.match?.trim() || 'assets';

  if (!s.runningTask) {
    return ctx.reply(
      'Nenhuma campanha ativa. Use /campanha para iniciar uma ou use /fotoprojeto para salvar no projeto.'
    );
  }

  session.setPhotoTarget(chatId, 'campaign', folder);

  await ctx.reply(
    `Fotos enviadas serao salvas em:\n<code>${s.runningTask.outputDir}/${folder}/</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── Photo/document handler ───────────────────────────────────────────────────

bot.on('message:photo', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const caption = ctx.message.caption?.trim() || '';

  // Allow inline destination override: "campanha" or "projeto [pasta]"
  let { destination, folder } = s.photoTarget;
  if (/^campanha/i.test(caption)) {
    destination = 'campaign';
    folder = caption.split(/\s+/)[1] || 'assets';
  } else if (/^projeto/i.test(caption)) {
    destination = 'project';
    folder = caption.split(/\s+/)[1] || 'imgs';
  }

  // Resolve destination folder
  let destDir;
  if (destination === 'campaign') {
    if (!s.runningTask) {
      return ctx.reply(
        'Nenhuma campanha ativa. Enviando para o projeto.\n' +
        `Use /fotocampanha apos iniciar uma campanha.`
      );
    }
    destDir = path.join(PROJECT_ROOT, s.runningTask.outputDir, folder);
  } else {
    destDir = path.join(PROJECT_ROOT, s.projectDir, folder);
  }

  fs.mkdirSync(destDir, { recursive: true });

  // Get highest resolution photo
  const photo = ctx.message.photo.at(-1);
  const file = await ctx.api.getFile(photo.file_id);
  const ext = path.extname(file.file_path) || '.jpg';
  const filename = `foto_${Date.now()}${ext}`;
  const savePath = path.join(destDir, filename);

  // Download file from Telegram
  await downloadTelegramFile(file.file_path, savePath);

  const relPath = path.relative(PROJECT_ROOT, savePath);
  await ctx.reply(
    `Foto salva em:\n<code>${relPath}</code>\n\n` +
    `Use /fotoprojeto ou /fotocampanha para mudar o destino.`,
    { parse_mode: 'HTML' }
  );
});

// ── Telegram file downloader ─────────────────────────────────────────────────

function downloadTelegramFile(filePath, savePath) {
  const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(savePath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    }).on('error', reject);
  });
}

// ── /novochat ───────────────────────────────────────────────────────────────

bot.command('novochat', async (ctx) => {
  const chatId = String(ctx.chat.id);
  session.clearHistory(chatId);
  await ctx.reply('Historico limpo. Nova conversa iniciada.');
});

// ── Free text → campaign confirmation or Claude conversation ─────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  // Ignore commands (already handled above)
  if (text.startsWith('/')) return;

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (await handlePendingImageError(ctx, chatId, s, text)) return;

  // ── V3 stage approval ──────────────────────────────────────────────────
  if (s.campaignV3?.pendingApproval) {
    const handled = await handleV3StageApproval(ctx, chatId, s, text);
    if (handled) return;
  }

  if (await handlePendingVideoApproval(ctx, chatId, s, text)) return;

  if (await handlePendingRerun(ctx, chatId, s, text)) return;

  if (await handlePendingLote(ctx, chatId, s, text)) return;

  if (await handlePendingCampaign(ctx, chatId, s, text)) return;

  // ── Detect rerun intent in free text ─────────────────────────────────
  const rerunKeywords = /\b(recri[ae]|refaz|refazer|reprocessa|re-?run|gera? novas?|nova vers[ãa]o|outra vers[ãa]o|recriar)\b/i;
  const campaignRef = text.match(/\b(c\d{1,4})\b/i);
  if (rerunKeywords.test(text) && campaignRef && !s.runningTask && !s.processing) {
    let rerunProjectDir = detectProjectFromText(PROJECT_ROOT, text, s.projectDir);
    let campaignFolder = findCampaign(PROJECT_ROOT, rerunProjectDir, campaignRef[1]);

    // Search all projects if not found
    if (!campaignFolder) {
      const prjRoot = path.join(PROJECT_ROOT, 'prj');
      if (fs.existsSync(prjRoot)) {
        for (const prj of fs.readdirSync(prjRoot)) {
          const found = findCampaign(PROJECT_ROOT, `prj/${prj}`, campaignRef[1]);
          if (found) { rerunProjectDir = `prj/${prj}`; campaignFolder = found; break; }
        }
      }
    }

    if (rerunProjectDir !== s.projectDir) session.setProject(chatId, rerunProjectDir);

    if (campaignFolder) {
      // Detect which stages from the text
      const stageAliases = text.toLowerCase().split(/[\s,]+/).map(resolveStageAlias).filter(Boolean);
      const stages = stageAliases.length > 0 ? [...new Set(stageAliases)].sort() : [2]; // default: imagens

      const outputDir = `${rerunProjectDir}/outputs/${campaignFolder}`;
      const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);
      const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
      let briefData = {};
      if (fs.existsSync(briefPath)) {
        try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
      }

      const payload = {
        task_name: campaignFolder,
        task_date: new Date().toISOString().slice(0, 10),
        project_dir: rerunProjectDir,
        output_dir: outputDir,
        platform_targets: briefData.platforms || ['instagram', 'youtube', 'threads', 'facebook', 'tiktok', 'linkedin'],
        language: 'pt-BR',
        image_count: 5,
        image_formats: ['carousel_1080x1080', 'story_1080x1920'],
        video_count: 1,
        image_source: 'brand',
        image_model: runtimeEnv.KIE_DEFAULT_MODEL || (runtimeEnv.IMAGE_PROVIDER === 'pollinations' ? 'flux' : 'z-image'),
        use_brand_overlay: true,
        campaign_brief: briefData.campaign_angle || '',
        video_mode: 'quick',
        approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
        notifications: true,
        skip_dependencies: true,
      };

      const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
      const stageList = stages.map(n => `  <b>${n}.</b> ${stageLabels[n]}`).join('\n');

      await ctx.reply(
        `<b>Reprocessar campanha: ${campaignFolder}</b>\n\n` +
        `Etapas:\n${stageList}\n\n` +
        `Responda <b>sim</b> para iniciar.`,
        { parse_mode: 'HTML' }
      );

      session.setPendingRerun(chatId, { payload, stages, campaignFolder });
      return;
    }
  }

  // ── Detect campaign intent in free text ────────────────────────────────
  const campaignKeywords = /\b(campanha|campaign|pascoa|natal|ano.?novo|dia.das.maes|black.friday|lancamento|carrossel|carousel|video|imagem|post|reel|story|stories|publici|anuncio|anúncio)\b/i;
  const campaignIntent = campaignKeywords.test(text) && text.length > 30;

  if (campaignIntent && !s.processing) {
    if (s.runningTask) {
      // Has active campaign — treat as chat
    } else {
      await ctx.reply('Entendi — vou organizar o briefing da campanha...');
      parseCampaignFromText({ text, projectDir: s.projectDir, projectRoot: PROJECT_ROOT, runClaude, callback: (payload) => {
        if (payload) {
          session.setPendingCampaign(chatId, payload);
          showCampaignConfirmation({ ctx, chatId, payload, session, env: runtimeEnv });
        } else {
          // Fall through to regular Claude chat
          handleChatMessage(ctx, chatId, s, text);
        }
      }, env: runtimeEnv });
      return;
    }
  }

  handleChatMessage(ctx, chatId, s, text);
});

// ── Campaign payload builder ─────────────────────────────────────────────────


// ── Refactored chat message handler ─────────────────────────────────────────

async function sendStageApprovalRequest(ctx, chatId, stage) {
  const cv = session.getCampaignV3(chatId);
  if (!cv) return;

  const mode = cv.approvalModes[`stage${stage}`] || 'humano';
  const outputDir = cv.outputDir;

  // Auto mode — advance without review but still send key deliverables
  if (mode === 'auto') {
    // Stage 1: send research report even in auto mode
    if (stage === 1 && cv.notifications !== false) {
      const reportPath = path.join(PROJECT_ROOT, outputDir, 'interactive_report.html');
      const briefMdPath = path.join(PROJECT_ROOT, outputDir, 'research_brief.md');
      if (fs.existsSync(reportPath)) {
        await bot.api.sendDocument(chatId, new InputFile(reportPath), {
          caption: '📊 Relatório interativo da pesquisa'
        }).catch(() => {});
      }
      if (fs.existsSync(briefMdPath)) {
        await bot.api.sendDocument(chatId, new InputFile(briefMdPath), {
          caption: '📋 Research Brief'
        }).catch(() => {});
      }
    }
    await ctx.reply(`Etapa ${stage} concluída — avançando automaticamente...`).catch(() => {});
    await runStage(ctx, chatId, stage + 1);
    return;
  }

  // Agente mode — Agente Revisor evaluates and decides
  if (mode === 'agente') {
    await ctx.reply(`Etapa ${stage} concluída — Agente Revisor avaliando...`).catch(() => {});
    runAgentReview(ctx, chatId, stage, outputDir);
    return;
  }

  // humano mode
  session.setPendingStageApproval(chatId, { stage, type: 'humano' });

  if (stage === 1) {
    // Send research report files
    const reportPath = path.join(PROJECT_ROOT, outputDir, 'interactive_report.html');
    const briefMdPath = path.join(PROJECT_ROOT, outputDir, 'research_brief.md');
    if (fs.existsSync(reportPath)) {
      await bot.api.sendDocument(chatId, new InputFile(reportPath), {
        caption: '📊 Relatório interativo da pesquisa'
      }).catch(() => {});
    }
    if (fs.existsSync(briefMdPath)) {
      await bot.api.sendDocument(chatId, new InputFile(briefMdPath), {
        caption: '📋 Research Brief'
      }).catch(() => {});
    }

    const briefPath = path.join(PROJECT_ROOT, outputDir, 'creative', 'creative_brief.md');
    if (fs.existsSync(briefPath)) {
      const brief = fs.readFileSync(briefPath, 'utf-8');
      for (const part of splitMessage(toTelegramHTML(brief))) {
        await ctx.reply(part, { parse_mode: 'HTML' }).catch(() => ctx.reply(part));
      }
    }
    await ctx.reply(
      '<b>Brief criativo pronto — Etapa 1/5 ✅</b>\n\n' +
      'Responda <b>sim</b> para avançar para imagens e copy.\n' +
      '<b>não</b> para cancelar a campanha.\n' +
      'Ou descreva ajustes.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 2) {
    // Show images produced by Ad Creative Designer
    const lines = ['<b>Imagens prontas — Etapa 2/5 ✅</b>\n'];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

    // Send generated images
    const imgsDir = path.join(PROJECT_ROOT, outputDir, 'imgs');
    const adsDir = path.join(PROJECT_ROOT, outputDir, 'ads');
    for (const dir of [imgsDir, adsDir]) {
      if (fs.existsSync(dir)) {
        const imgFiles = fs.readdirSync(dir)
          .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('approved'))
          .sort();
        for (const f of imgFiles) {
          await bot.api.sendPhoto(chatId, new InputFile(path.join(dir, f)), {
            caption: f,
          }).catch(e => console.error('[stage2 img]', e.message));
        }
      }
    }

    await ctx.reply(
      'Responda <b>sim</b> para avancar para video.\nOu descreva o que ajustar.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 3) {
    // Video done — show storyboard and ask about platforms
    const msg = formatStoryboardMessage(PROJECT_ROOT, outputDir, escapeHtml);
    if (msg) {
      await ctx.reply(msg, { parse_mode: 'HTML' });
    }

    // Show current platform targets and ask if user wants to change
    const currentPlatforms = cv.payload.platform_targets || [];
    const allPlatforms = ['instagram', 'youtube', 'tiktok', 'facebook', 'threads', 'linkedin'];
    const platformLabels = {
      instagram: 'Instagram (carousel + stories + reels)',
      youtube: 'YouTube (video + shorts)',
      tiktok: 'TikTok (video curto)',
      facebook: 'Facebook (feed + stories + reels + video)',
      threads: 'Threads (texto + imagem)',
      linkedin: 'LinkedIn (post profissional)',
    };

    const platformList = allPlatforms.map(p => {
      const active = currentPlatforms.includes(p) ? '✅' : '⬜';
      return `  ${active} <code>${p}</code> — ${platformLabels[p]}`;
    }).join('\n');

    await ctx.reply(
      '<b>Video pronto — Etapa 3/5 ✅</b>\n\n' +
      '<b>Plataformas selecionadas:</b>\n' +
      platformList + '\n\n' +
      'Responda <b>sim</b> para gerar copy para estas plataformas.\n' +
      'Ou liste as plataformas desejadas (ex: <code>instagram,youtube,tiktok</code>).\n' +
      '<b>nao</b> para cancelar.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 4) {
    // Platform copy done — show summaries
    const platformsDir = path.join(PROJECT_ROOT, outputDir, 'platforms');
    const lines = ['<b>Copy de plataforma pronto — Etapa 4/5 ✅</b>\n'];

    if (fs.existsSync(platformsDir)) {
      const mdFiles = fs.readdirSync(platformsDir).filter(f => f.endsWith('.md')).sort();
      for (const f of mdFiles) {
        const content = fs.readFileSync(path.join(platformsDir, f), 'utf-8');
        const preview = content.slice(0, 400);
        const name = f.replace('.md', '').toUpperCase();
        lines.push(`<b>${name}:</b>`);
        lines.push(`<i>${escapeHtml(preview)}${content.length > 400 ? '...' : ''}</i>\n`);
      }
    }

    // Check for rework requests
    if (fs.existsSync(platformsDir)) {
      const jsonFiles = fs.readdirSync(platformsDir).filter(f => f.endsWith('.json'));
      const reworks = [];
      for (const f of jsonFiles) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(platformsDir, f), 'utf-8'));
          if (data.rework_needed) reworks.push(`<b>${f}:</b> ${escapeHtml(data.rework_needed)}`);
        } catch {}
      }
      if (reworks.length > 0) {
        lines.push('<b>⚠️ Retrabalho solicitado:</b>');
        reworks.forEach(r => lines.push(r));
        lines.push('');
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    await ctx.reply(
      'Responda <b>sim</b> para avancar para distribuicao.\nOu descreva ajustes.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 5) {
    await ctx.reply(
      '<b>Pronto para distribuicao — Etapa 5/5</b>\n\n' +
      'Tudo certo para preparar a publicacao.\n' +
      'Responda <b>sim</b> para gerar o Publish MD.\n<b>nao</b> para cancelar.',
      { parse_mode: 'HTML' }
    );
  }
}

sendStageApprovalRequestRef.current = sendStageApprovalRequest;


// ── Claude CLI runner (for individual agents) ───────────────────────────────

function runClaude(prompt, agentName, callback) {
  return runClaudeProcess({ prompt, agentName, callback, projectRoot: PROJECT_ROOT });
}

const { handleChatMessage, runPipeline, runPipelineV3 } = createBotRuntime({
  bot,
  session,
  projectRoot: PROJECT_ROOT,
  ensureWorker,
  enqueueStage: _enqueueStage,
  stages: STAGES,
  splitMessage,
  toTelegramHTML,
  sendCampaignReport,
  sendImageApprovalRequest,
  sendVideoApprovalRequest,
  runClaude,
});
const {
  handlePendingImageError,
  handlePendingVideoApproval,
  handlePendingRerun,
  handlePendingCampaign,
  handlePendingLote,
} = createPendingTextHandlers({
  projectRoot: PROJECT_ROOT,
  session,
  bot,
  monitoredSignals,
  ensureWorker,
  stages: STAGES,
  enqueueStage: _enqueueStage,
  writeVideoApproval,
  runClaude,
  sendVideoApprovalRequest,
  showCampaignConfirmation,
  parseCampaignFromText,
  runPipelineV3,
  env: runtimeEnv,
});

const { runStage, runAgentReview, handleV3StageApproval } = createV3Flow({
  session,
  bot,
  projectRoot: PROJECT_ROOT,
  stages: STAGES,
  enqueueStage: _enqueueStage,
  runClaude,
  splitMessage,
  toTelegramHTML,
  escapeHtml,
  sendStageApprovalRequestRef,
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Arg parser ──────────────────────────────────────────────────────────────

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith('--')) {
        opts[key] = true; // flag
      } else {
        opts[key] = nextArg;
        i++;
      }
    }
  }
  return opts;
}

// ── Start bot ───────────────────────────────────────────────────────────────

bot.catch((err) => {
  // Conflict error (409) — another bot instance is polling. Wait and retry via PM2.
  if (err?.error_code === 409 || err?.message?.includes('Conflict')) {
    console.error('[bot] Conflict detected — another instance is polling. Exiting in 10s for PM2 retry...');
    setTimeout(() => process.exit(1), 10000); // PM2 will restart after delay
    return;
  }
  console.error('Bot error:', err.message);
});

// (rerun command moved above bot.on message:text)

// ── /aprovar — re-scan pending approvals ─────────────────────────────────────

bot.command('aprovar', async (ctx) => {
  await scanPendingApprovals(ctx.chat.id.toString(), ctx);
});

// Handle unhandled rejections (polling conflicts, etc.)
process.on('unhandledRejection', (err) => {
  if (err?.error_code === 409 || String(err).includes('Conflict')) {
    console.error('[bot] Polling conflict — waiting 10s before PM2 restart...');
    setTimeout(() => process.exit(1), 10000);
  } else {
    console.error('[bot] Unhandled rejection:', err);
  }
});

bot.start({ drop_pending_updates: true,
  onStart: async (botInfo) => {
    console.log(`Bot @${botInfo.username} rodando (long-polling)`);
    console.log(`Projeto padrao: ${session.DEFAULT_PROJECT}`);
    console.log('Ctrl+C para parar.\n');

    // Clear any leftover jobs from previous runs
    await pipelineQueue.obliterate({ force: true }).catch((err) => console.error('[startup] Failed to clear queue:', err.message));
    console.log('[startup] Queue cleared.');

    // Check for existing workers (no longer killing them — they may be valid)
    if (isWorkerRunning()) {
      console.log('Worker already running — will use existing.');
    } else {
      console.log('No worker running — will spawn on demand.');
    }

    startContinuousMonitor({
      bot,
      session,
      projectRoot: PROJECT_ROOT,
      monitoredSignals,
      readChatContext,
      writeImageApproval,
      writeVideoApproval,
      sendImageApprovalRequest,
      sendVideoApprovalRequest,
      sendStageApprovalRequest,
      enqueueStage: _enqueueStage,
      stages: STAGES,
    });
  },
});
