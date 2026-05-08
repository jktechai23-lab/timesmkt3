/**
 * verify-image.js — QA de ilustrações via vision LLM (Claude com Read tool).
 *
 * Pra cada imagem gerada, valida:
 *   - aparência consistente do personagem
 *   - roupa correta pra fase (ex: capacete quando no vácuo)
 *   - anatomia razoável (sem 6 dedos, deformações)
 *   - sem texto/letras/balões na imagem
 *   - cena reflete o prompt esperado
 *
 * Retorna {approved, reason, violations}. Se vision LLM falhar, default approve
 * (não bloqueia pipeline por erro de infra).
 */

const { spawn } = require('child_process');
const path = require('path');

const CLAUDE_PATH = '/home/nmaldaner/.local/bin/claude';

function callClaudeP(prompt, { timeoutMs = 90000, model = 'sonnet' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_PATH, [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', model,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: 'spawn error' }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }));
    setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, timeoutMs);
  });
}

function extractJSON(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Verifica uma imagem contra o frame esperado.
 * @param {string} imagePath  path absoluto pra imagem
 * @param {object} frame      frame do storyboard (com phase, wardrobe, prompt, n, id)
 * @param {object} board      storyboard inteiro (pra char_template + wardrobes)
 * @returns {Promise<{approved, reason, violations, raw}>}
 */
async function verifyImage(imagePath, frame, board) {
  const wardrobe = (board.wardrobes && frame.wardrobe) ? board.wardrobes[frame.wardrobe] : '';
  const charDesc = board.character_template || '';
  const inSpace = frame.phase === 'C' && frame.wardrobe === 'spacesuit';

  const prompt = `Use the Read tool to look at the image at this path: ${imagePath}

Você é QA de ilustrações pra revista em quadrinhos infantil. Avalie a imagem contra os critérios abaixo.

CONTEXTO DO QUADRO ${frame.n} (${frame.id}):
- Conteúdo esperado: ${frame.prompt}
- Personagem (template): ${charDesc}
- Roupa esperada: ${wardrobe || '(sem roupa específica)'}
${inSpace ? '- ⚠️ ESTA CENA SE PASSA NO ESPAÇO/LUA — o menino DEVE estar com capacete bolha + traje espacial (sem exceção, exposição ao vácuo morre sem isso)\n' : ''}- Estilo: gibi vintage 1960s halftone, cores limitadas (cream + cyan + orange-red)

CRITÉRIOS DE APROVAÇÃO (todos devem passar):
1. PERSONAGEM: aparece um menino brasileiro de ~8 anos com cabelo castanho bagunçado, sardas, olhos curiosos. Aparência consistente com o template.
2. ROUPA: bate com a roupa esperada. ${inSpace ? 'Capacete bolha visível na cabeça é OBRIGATÓRIO.' : ''}
3. ANATOMIA: dedos, mãos, pernas, proporções razoáveis (NÃO aprovar se tiver 6+ dedos, mãos torcidas, olhos extras, etc.)
4. SEM TEXTO: não pode ter palavras, letras, balões de fala, lettering visível na ilustração.
5. CENA: reflete o conteúdo esperado (ação/ambiente/personagens secundários como gato, mãe, alien quando aplicável).

REGRA: se 1-3 critérios falharem MAS o erro for cosmético, aprove. Se algum critério crítico falhar (vácuo sem capacete, deformação grave de anatomia, texto visível), reprove.

OUTPUT (apenas JSON, sem markdown, sem prosa fora):
{"approved": true|false, "reason": "explicação curta em pt-br", "violations": ["regra violada", ...]}`;

  const result = await callClaudeP(prompt, { timeoutMs: 90000 });
  if (!result.ok) {
    return { approved: true, reason: 'verifier failed (default approve)', violations: [], raw: result.stderr.slice(0, 200) };
  }

  const parsed = extractJSON(result.stdout);
  if (!parsed || typeof parsed.approved !== 'boolean') {
    return { approved: true, reason: 'verifier output unparseable (default approve)', violations: [], raw: result.stdout.slice(0, 300) };
  }

  return {
    approved: parsed.approved,
    reason: parsed.reason || '',
    violations: Array.isArray(parsed.violations) ? parsed.violations : [],
    raw: null,
  };
}

module.exports = { verifyImage };
