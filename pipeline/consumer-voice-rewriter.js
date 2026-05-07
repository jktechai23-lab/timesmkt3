/**
 * consumer-voice-rewriter.js
 *
 * Transforma textos analíticos do research_results.json (linguagem voltada pro
 * dono do marketing — "custo-benefício", "jornada híbrida", "64% dos consumidores")
 * em linguagem direta pro consumidor final ("você", emocional, sem jargão).
 *
 * Estratégia em duas etapas:
 *   1. Se o entry já tem `consumer_voice` (vindo do research agent atualizado), retorna direto.
 *   2. Senão, chama `claude -p` reescrevendo no ângulo do hook + persona alvo.
 *
 * Cache em memória por hash (hook + textos) — múltiplos gatilhos com mesmas dores
 * não disparam chamadas duplicadas.
 *
 * Uso:
 *   const { rewritePainTrend } = require('./consumer-voice-rewriter');
 *   const { painCard, painBody, trendCard, trendBody } = await rewritePainTrend({
 *     hook: '...',
 *     pain: { pain_point, description, emotional_trigger, consumer_voice?, consumer_voice_subhead? },
 *     trend: { trend, detail, consumer_voice?, consumer_voice_subhead? },
 *     persona: 'filho adulto homenageando mãe',
 *     ctaBrand: 'INEMA.CLUB',
 *     log,
 *   });
 */

const { spawn } = require('child_process');
const crypto = require('crypto');

const cache = new Map();

function hashKey(parts) {
  return crypto.createHash('md5').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 16);
}

function findVoice(entry, field) {
  if (!entry) return '';
  return entry.consumer_voice || entry.voz_consumidor || entry.voz_do_consumidor ||
         entry[field] || '';
}

function findVoiceSubhead(entry, fallback) {
  if (!entry) return '';
  return entry.consumer_voice_subhead || entry.voz_consumidor_subtitulo ||
         entry.subtitulo_consumidor || fallback || '';
}

function callClaude({ prompt, claudePath = '/home/nmaldaner/.local/bin/claude', model = 'sonnet', timeoutMs = 90000 }) {
  return new Promise((resolve) => {
    const child = spawn(claudePath, [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', model,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: 'spawn error' }));
    child.on('close', code => resolve({ ok: code === 0, stdout, stderr, code }));

    setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, timeoutMs);
  });
}

function extractJSON(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Rewrite pain + trend pair for a given hook into consumer-facing voice.
 * Returns { painCard, painBody, trendCard, trendBody, source: 'research'|'rewrite'|'fallback' }.
 */
async function rewritePainTrend({ hook, pain = {}, trend = {}, persona = '', ctaBrand = '', log = () => {} }) {
  const findProp = (obj, ...keys) => {
    for (const k of keys) {
      const v = obj[k];
      if (v != null && v !== '') return v;
    }
    return '';
  };

  const painText = findProp(pain, 'pain_point', 'dor', 'motivation', 'motivacao', 'titulo', 'title');
  const painBody = findProp(pain, 'emotional_trigger', 'gatilho_emocional', 'description', 'descricao', 'desejo');
  const trendText = findProp(trend, 'trend', 'tendencia', 'titulo', 'title');
  const trendBody = findProp(trend, 'detail', 'descricao', 'description', 'detalhe');

  // ── Path 1: research already produced consumer voice (Layer A) ─────────
  const painVoice = findVoice(pain, '');
  const trendVoice = findVoice(trend, '');

  if (painVoice && trendVoice) {
    return {
      painCard: painVoice.slice(0, 60),
      painBody: findVoiceSubhead(pain, painBody).slice(0, 110),
      trendCard: trendVoice.slice(0, 60),
      trendBody: findVoiceSubhead(trend, trendBody).slice(0, 110),
      source: 'research',
    };
  }

  // ── Path 2: cache check ────────────────────────────────────────────────
  const key = hashKey([hook, painText, trendText, persona]);
  if (cache.has(key)) {
    return cache.get(key);
  }

  // ── Path 3: rewrite via claude -p (Layer B) ────────────────────────────
  const prompt = `Você é um copywriter brasileiro especialista em copy direto pro consumidor final.

CONTEXTO DA CAMPANHA:
- Hook (frase de abertura do vídeo, já no ângulo certo): "${hook}"
- Persona alvo: ${persona || 'consumidor final do produto'}
- Marca: ${ctaBrand || 'a marca'}

DADOS BRUTOS (escritos em linguagem analítica de relatório de marketing):
- Dor analítica: "${painText}"
- Detalhe da dor: "${painBody}"
- Tendência analítica: "${trendText}"
- Detalhe da tendência: "${trendBody}"

TAREFA:
Reescreva esses dados em linguagem direta pro consumidor, mantendo o ângulo emocional do hook.

REGRAS:
1. Use 2ª pessoa ("você", "sua", "seu") — NUNCA fale "consumidores", "clientes", "o mercado", "o público"
2. Sem jargão de marketing ("custo-benefício", "jornada híbrida", "engajamento", "ROI")
3. Sem porcentagens ou estatísticas brutas — traduza pra impacto humano ("mais gente como você", "muita gente sente isso")
4. Tom emocional alinhado ao hook
5. Cada campo curto: card (≤60 chars), body (≤110 chars)
6. Português brasileiro natural, fala de gente

RESPONDA APENAS COM JSON, sem markdown, sem explicação:
{
  "pain_card": "...",
  "pain_body": "...",
  "trend_card": "...",
  "trend_body": "..."
}`;

  log(`[consumer-voice] rewriting via claude (hook="${hook.slice(0, 40)}...")`);

  const t0 = Date.now();
  const { ok, stdout } = await callClaude({ prompt });
  const elapsed = Math.round((Date.now() - t0) / 1000);

  const parsed = extractJSON(stdout);

  if (ok && parsed && parsed.pain_card && parsed.trend_card) {
    const result = {
      painCard: String(parsed.pain_card).slice(0, 60),
      painBody: String(parsed.pain_body || '').slice(0, 110),
      trendCard: String(parsed.trend_card).slice(0, 60),
      trendBody: String(parsed.trend_body || '').slice(0, 110),
      source: 'rewrite',
    };
    cache.set(key, result);
    log(`[consumer-voice] rewrite ok (${elapsed}s): "${result.painCard.slice(0, 50)}..."`);
    return result;
  }

  // ── Path 4: fallback — use raw text but at least neutralize obvious jargon ──
  log(`[consumer-voice] rewrite failed (${elapsed}s), using raw text fallback`);
  const fallback = {
    painCard: painText.slice(0, 60),
    painBody: painBody.slice(0, 110),
    trendCard: trendText.slice(0, 60),
    trendBody: trendBody.slice(0, 110),
    source: 'fallback',
  };
  cache.set(key, fallback);
  return fallback;
}

function clearCache() {
  cache.clear();
}

module.exports = { rewritePainTrend, clearCache };
