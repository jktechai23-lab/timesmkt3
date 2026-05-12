/**
 * bot-import.js — /import command
 *
 * Copies videos, ads, imgs, report, gatilhos from multiple campaigns
 * to a central `importa/` folder under the project.
 *
 * Syntax:
 *   /import <campaigns> <source> [modifier]
 *
 * Campaigns:
 *   c55 c56          → list
 *   c55-c59          → range
 *   todos            → all campaigns in project
 *
 * Sources:
 *   videos           → video/*.mp4 only
 *   ads              → ads/*.png only
 *   imgs             → imgs/*.jpg only
 *   report           → whole report/ folder
 *   gatilhos         → whole gatilhos/ folder
 *
 * Modifiers (filter inside source):
 *   gatilhos ads     → only carousel PNGs from gatilhos/
 *   gatilhos videos  → only video MP4s from gatilhos/
 *   report ads       → only carousel PNGs from report/
 *   report videos    → only video MP4 from report/
 *
 * Examples:
 *   /import c55 c56 videos
 *   /import c55-c59 report ads
 *   /import todos gatilhos videos
 */

const fs = require('fs');
const path = require('path');

const VALID_SOURCES = ['videos', 'ads', 'imgs', 'report', 'gatilhos'];
const VALID_MODIFIERS = ['ads', 'videos'];

function extractCampaignNumber(folderName) {
  const m = folderName.match(/^c(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function expandCampaignQuery(query, allCampaigns) {
  // query like: "c55 c56 c57" or "c55-c59" or "todos"
  const tokens = query.split(/\s+/).map(t => t.trim()).filter(Boolean);
  const matched = new Set();

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (lower === 'todos' || lower === 'all') {
      for (const c of allCampaigns) matched.add(c);
      continue;
    }

    // Range: c55-c59
    const range = lower.match(/^c(\d+)-c(\d+)$/i);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = parseInt(range[2], 10);
      for (const c of allCampaigns) {
        const num = extractCampaignNumber(c);
        if (num !== null && num >= from && num <= to) matched.add(c);
      }
      continue;
    }

    // Single: c55 or c0055
    const single = lower.match(/^c(\d+)$/i);
    if (single) {
      const num = parseInt(single[1], 10);
      const found = allCampaigns.find(c => extractCampaignNumber(c) === num);
      if (found) matched.add(found);
    }
  }

  return Array.from(matched).sort();
}

function shortCampaign(folder) {
  // c0055-xxx → c55
  const num = extractCampaignNumber(folder);
  return num !== null ? `c${num}` : folder;
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) {
    for (const entry of fs.readdirSync(p)) rmrf(path.join(p, entry));
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Process import for a single campaign + source + modifier combo.
 * Returns count of items copied.
 */
function processImport(campaignFolder, campaignDir, importDir, source, modifier) {
  const shortName = shortCampaign(campaignFolder);
  let count = 0;

  // ── VIDEOS ──────────────────────────────────────────────────────────
  if (source === 'videos' && !modifier) {
    // Copy all .mp4 from video/ folder
    const videoDir = path.join(campaignDir, 'video');
    if (!fs.existsSync(videoDir)) return 0;

    const destDir = path.join(importDir, 'videos');
    for (const file of fs.readdirSync(videoDir)) {
      if (!file.endsWith('.mp4')) continue;
      // Extract variant: quick, pro_data_story, pro_explainer, etc.
      let variant = 'quick';
      const quickMatch = file.match(/_quick_/);
      const proMatch = file.match(/_pro_\d+(?:_([a-z_]+?))?_\d{8}/);
      if (quickMatch) variant = 'quick';
      else if (proMatch && proMatch[1]) variant = `pro_${proMatch[1]}`;
      else if (proMatch) variant = 'pro';

      const destName = `${shortName}_${variant}.mp4`;
      const destPath = path.join(destDir, destName);
      copyFile(path.join(videoDir, file), destPath);
      count++;
    }
  }

  // ── ADS ─────────────────────────────────────────────────────────────
  if (source === 'ads' && !modifier) {
    // Copy ads/ folder — each ad becomes its own folder
    const adsDir = path.join(campaignDir, 'ads');
    if (!fs.existsSync(adsDir)) return 0;

    const pngs = fs.readdirSync(adsDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (pngs.length === 0) return 0;

    // All PNGs in one folder per campaign
    const destDir = path.join(importDir, 'ads', `${shortName}_ad_01`);
    rmrf(destDir);
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of pngs) {
      copyFile(path.join(adsDir, file), path.join(destDir, file));
      count++;
    }
  }

  // ── IMGS ────────────────────────────────────────────────────────────
  if (source === 'imgs' && !modifier) {
    const imgsDir = path.join(campaignDir, 'imgs');
    if (!fs.existsSync(imgsDir)) return 0;

    const destDir = path.join(importDir, 'imgs', shortName);
    rmrf(destDir);
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of fs.readdirSync(imgsDir)) {
      const ext = path.extname(file).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
      copyFile(path.join(imgsDir, file), path.join(destDir, file));
      count++;
    }
  }

  // ── REPORT ──────────────────────────────────────────────────────────
  if (source === 'report') {
    const reportDir = path.join(campaignDir, 'report');
    if (!fs.existsSync(reportDir)) return 0;

    if (!modifier) {
      // Whole report folder — split into ads/ and videos/
      // Videos
      const videoSrc = path.join(reportDir, 'report_video.mp4');
      if (fs.existsSync(videoSrc)) {
        copyFile(videoSrc, path.join(importDir, 'videos', `${shortName}_report.mp4`));
        count++;
      }
      // Ads: all report_carousel_*.png go to one folder
      const carousels = fs.readdirSync(reportDir).filter(f => f.startsWith('report_carousel_') && f.endsWith('.png'));
      if (carousels.length > 0) {
        const adsDest = path.join(importDir, 'ads', `${shortName}_report`);
        rmrf(adsDest);
        fs.mkdirSync(adsDest, { recursive: true });
        for (const file of carousels) {
          copyFile(path.join(reportDir, file), path.join(adsDest, file));
          count++;
        }
      }
    } else if (modifier === 'videos') {
      const videoSrc = path.join(reportDir, 'report_video.mp4');
      if (fs.existsSync(videoSrc)) {
        copyFile(videoSrc, path.join(importDir, 'videos', `${shortName}_report.mp4`));
        count++;
      }
    } else if (modifier === 'ads') {
      const carousels = fs.readdirSync(reportDir).filter(f => f.startsWith('report_carousel_') && f.endsWith('.png'));
      if (carousels.length > 0) {
        const adsDest = path.join(importDir, 'ads', `${shortName}_report`);
        rmrf(adsDest);
        fs.mkdirSync(adsDest, { recursive: true });
        for (const file of carousels) {
          copyFile(path.join(reportDir, file), path.join(adsDest, file));
          count++;
        }
      }
    }
  }

  // ── GATILHOS ────────────────────────────────────────────────────────
  if (source === 'gatilhos') {
    const gatilhosDir = path.join(campaignDir, 'gatilhos');
    if (!fs.existsSync(gatilhosDir)) return 0;

    const hookFolders = fs.readdirSync(gatilhosDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    for (const hookFolder of hookFolders) {
      // hookFolder format: "g01_slug" or legacy "hook_01_slug"
      const hookPath = path.join(gatilhosDir, hookFolder);
      const gNum = hookFolder.match(/^(g\d+|hook_\d+)/)?.[0]?.replace('hook_', 'g').replace(/^(g\d+)_?/, (m, g) => g.padStart(3, 'g0').replace(/^gg/, 'g')) || 'g01';
      // Simpler: extract number and normalize
      const numMatch = hookFolder.match(/\d+/);
      const gNormalized = numMatch ? `g${numMatch[0].padStart(2, '0')}` : 'g01';
      const slugMatch = hookFolder.replace(/^(hook_\d+_|g\d+_)/, '');
      const fullName = `${shortName}_${gNormalized}_${slugMatch}`;

      if (!modifier || modifier === 'videos') {
        const mp4s = fs.readdirSync(hookPath).filter(f => f.endsWith('.mp4'));
        const videoFile = mp4s.includes('video.mp4') ? 'video.mp4' : mp4s[0];
        if (videoFile) {
          copyFile(path.join(hookPath, videoFile), path.join(importDir, 'videos', `${fullName}.mp4`));
          count++;
        }
      }

      if (!modifier || modifier === 'ads') {
        const carousels = fs.readdirSync(hookPath).filter(f => f.startsWith('carousel_') && f.endsWith('.png'));
        if (carousels.length > 0) {
          const adsDest = path.join(importDir, 'ads', fullName);
          rmrf(adsDest);
          fs.mkdirSync(adsDest, { recursive: true });
          for (const file of carousels) {
            copyFile(path.join(hookPath, file), path.join(adsDest, file));
            count++;
          }
        }
      }
    }
  }

  return count;
}

function registerImportCommand(bot, { projectRoot, session }) {
  bot.command('import', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);
    const projectDir = s.projectDir;

    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        '<b>/import — Copiar assets para pasta imports/</b>\n\n'
        + 'Uso: <code>/import &lt;campanhas&gt; &lt;origem&gt;...</code>\n\n'
        + '<b>Campanhas:</b>\n'
        + '• <code>c55 c56</code> — lista\n'
        + '• <code>c55-c59</code> — range\n'
        + '• <code>todos</code> — todas do projeto\n\n'
        + '<b>Origens (pode combinar várias):</b>\n'
        + '• <code>videos</code> — apenas video/*.mp4\n'
        + '• <code>ads</code> — apenas ads/*.png\n'
        + '• <code>imgs</code> — apenas imgs/*.jpg\n'
        + '• <code>report</code> — pasta report/ completa\n'
        + '• <code>gatilhos</code> — pasta gatilhos/ completa\n\n'
        + '<b>Modificadores (após report/gatilhos):</b>\n'
        + '• <code>report videos</code> — só o .mp4 do report\n'
        + '• <code>report ads</code> — só os carousels do report\n'
        + '• <code>gatilhos videos</code> — só os .mp4 dos gatilhos\n'
        + '• <code>gatilhos ads</code> — só os carousels dos gatilhos\n\n'
        + '<b>Exemplos:</b>\n'
        + '<code>/import c55 c56 videos ads</code>\n'
        + '<code>/import c55-c59 report</code>\n'
        + '<code>/import todos gatilhos videos</code>\n'
        + '<code>/import c56 videos ads gatilhos report</code>\n\n'
        + '<b>Destino:</b> <code>' + projectDir + '/imports/</code>',
        { parse_mode: 'HTML' },
      );
    }

    // Parse tokens
    const tokens = raw.split(/\s+/).filter(Boolean);

    // Find first source token — anything before is campaigns
    const firstSourceIdx = tokens.findIndex(t => VALID_SOURCES.includes(t.toLowerCase()));
    if (firstSourceIdx === -1) {
      return ctx.reply(`Origem não encontrada. Use: ${VALID_SOURCES.join(', ')}`);
    }

    const campaignTokens = tokens.slice(0, firstSourceIdx);
    if (campaignTokens.length === 0) {
      return ctx.reply('Especifique as campanhas. Ex: <code>/import c55 videos</code>', { parse_mode: 'HTML' });
    }

    // Parse remaining tokens — each token is a source (videos, ads, imgs, report, gatilhos)
    // Modifier rule: 'videos' or 'ads' right after 'report' or 'gatilhos' is a modifier
    // unless no modifier is needed (then both are separate sources)
    const sourceSpecs = [];
    let i = firstSourceIdx;
    while (i < tokens.length) {
      const tok = tokens[i].toLowerCase();
      if (!VALID_SOURCES.includes(tok)) {
        return ctx.reply(`Token inesperado: "${tok}". Origens válidas: ${VALID_SOURCES.join(', ')}`);
      }
      // If this is report/gatilhos and the next token is videos/ads,
      // treat next as modifier (user wants filtered content from this source)
      const next = tokens[i + 1]?.toLowerCase();
      if (['report', 'gatilhos'].includes(tok) && next && VALID_MODIFIERS.includes(next)) {
        sourceSpecs.push({ source: tok, modifier: next });
        i += 2;
      } else {
        sourceSpecs.push({ source: tok, modifier: null });
        i += 1;
      }
    }

    // Get all campaigns in project
    const outputsDir = path.resolve(projectRoot, projectDir, 'outputs');
    if (!fs.existsSync(outputsDir)) {
      return ctx.reply(`Projeto sem outputs: ${projectDir}`);
    }
    const allCampaigns = fs.readdirSync(outputsDir)
      .filter(f => fs.statSync(path.join(outputsDir, f)).isDirectory())
      .sort();

    // Expand campaign query
    const campaignQuery = campaignTokens.join(' ');
    const matchedCampaigns = expandCampaignQuery(campaignQuery, allCampaigns);

    if (matchedCampaigns.length === 0) {
      return ctx.reply(`Nenhuma campanha encontrada para: ${campaignQuery}`);
    }

    const importDir = path.resolve(projectRoot, projectDir, 'imports');
    fs.mkdirSync(importDir, { recursive: true });

    const label = sourceSpecs.map(ss => ss.modifier ? `${ss.source} ${ss.modifier}` : ss.source).join(' + ');
    await ctx.reply(
      `📦 Importando <b>${label}</b> de <b>${matchedCampaigns.length}</b> campanha(s)...\n\n`
      + matchedCampaigns.map(c => `• ${c}`).join('\n'),
      { parse_mode: 'HTML' },
    );

    let totalCopied = 0;
    const perCampaign = [];
    for (const campaign of matchedCampaigns) {
      const campaignDir = path.join(outputsDir, campaign);
      let campaignCount = 0;
      const errors = [];
      for (const spec of sourceSpecs) {
        try {
          const count = processImport(campaign, campaignDir, importDir, spec.source, spec.modifier);
          campaignCount += count;
        } catch (e) {
          errors.push(`${spec.source}: ${e.message.slice(0, 40)}`);
        }
      }
      totalCopied += campaignCount;
      const errSuffix = errors.length > 0 ? ` (${errors.join(', ')})` : '';
      perCampaign.push(`${shortCampaign(campaign)}: ${campaignCount}${errSuffix}`);
    }

    await ctx.reply(
      `✅ Import concluído — <b>${totalCopied}</b> arquivos copiados\n\n`
      + perCampaign.join('\n') + '\n\n'
      + `Pasta: <code>${path.relative(projectRoot, importDir)}/</code>`,
      { parse_mode: 'HTML' },
    );
  });
}

module.exports = { registerImportCommand };
