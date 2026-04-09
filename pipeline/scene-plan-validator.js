/**
 * scene-plan-validator.js — Pure validation of Video Pro scene plans.
 *
 * Validates rules WITHOUT modifying the plan. Returns a list of violations
 * that can be sent back to the LLM agent for correction.
 *
 * No side effects. No file writes. No image replacements.
 */

const fs = require('fs');
const path = require('path');

/**
 * Validate a scene plan against all rules.
 * @param {object} plan - Parsed scene plan JSON
 * @param {object} opts - { videoDur, projectRoot, outputDir }
 * @returns {{ valid: boolean, violations: string[] }}
 */
function validateScenePlan(plan, opts = {}) {
  const scenes = plan.scenes || [];
  const violations = [];
  const videoDur = opts.videoDur || plan.video_length || 60;
  const projectRoot = opts.projectRoot || process.cwd();
  const simplesMode = opts.simplesMode || false;

  if (scenes.length === 0) {
    return { valid: false, violations: ['Scene plan has no scenes'] };
  }

  // ── 1. Duration total ──────────────────────────────────────────────
  const totalDur = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
  if (Math.abs(totalDur - videoDur) > 2) {
    violations.push(
      `Duração total ${totalDur.toFixed(1)}s != video_length ${videoDur}s (tolerância ±2s). Redistribua as durações.`
    );
  }

  // ── 2. First cut: must be fast with LARGE text ─────────────────────
  const first = scenes[0];
  if (first) {
    if (first.duration > 1.5) {
      violations.push(
        `Cena 1 "${first.id}": duração ${first.duration}s > 1.5s. Hook deve ser rápido (≤1.5s).`
      );
    }
    const firstFontSize = first.text_layout?.font_size || 0;
    if (firstFontSize < 120) {
      violations.push(
        `Cena 1 "${first.id}": font_size ${firstFontSize}px < 120px. Hook deve ter texto GRANDE (120-140px).`
      );
    }
    const firstText = String(first.text_overlay || '').trim();
    if (!firstText && (first.visual_type || 'photo') === 'photo') {
      violations.push(
        `Cena 1 "${first.id}": text_overlay vazio. Hook DEVE ter texto de impacto.`
      );
    }
  }

  // ── 3. Last cut: CTA strong + 3s hold ─────────────────────────────
  const last = scenes[scenes.length - 1];
  if (last && last.duration < 3) {
    violations.push(
      `Última cena "${last.id}": duração ${last.duration}s < 3s. CTA precisa de ≥3s para o espectador absorver.`
    );
  }

  // ── 4. Per-scene validation ────────────────────────────────────────
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const id = scene.id || `scene_${i + 1}`;
    const vt = scene.visual_type || 'photo';
    const dur = scene.duration || 0;

    // 4a. Motion repetido em 2 consecutivas (skip in simples — system assigns motion)
    if (i > 0 && vt === 'photo' && !simplesMode) {
      const prevMotion = scenes[i - 1].motion?.type;
      const currMotion = scene.motion?.type;
      if (prevMotion && currMotion && prevMotion === currMotion && currMotion !== 'breathe') {
        violations.push(
          `Cena ${i + 1} "${id}": motion "${currMotion}" repetido (igual à cena anterior). Varie o motion.`
        );
      }
    }

    // 4b. Posição de texto 3x consecutiva (skip in simples — system handles layout)
    if (i >= 2 && vt === 'photo' && !simplesMode) {
      const p1 = scenes[i - 2].text_layout?.position;
      const p2 = scenes[i - 1].text_layout?.position;
      const p3 = scene.text_layout?.position;
      if (p1 && p2 && p3 && p1 === p2 && p2 === p3) {
        violations.push(
          `Cena ${i + 1} "${id}": posição "${p3}" repetida 3x seguidas. Alterne entre top/center.`
        );
      }
    }

    // 4c. Text overlay em cenas photo (skip in simples — system renders slides with keyword)
    if (vt === 'photo' && !simplesMode) {
      const text = String(scene.text_overlay || '').trim();
      const isLast = i === scenes.length - 1;
      const isSilentClosing = isLast && !(scene.narration || '').trim();

      if (!text && !isSilentClosing && dur >= 0.8) {
        violations.push(
          `Cena ${i + 1} "${id}": text_overlay vazio em cena photo de ${dur}s. Adicione texto (max 6 palavras) que reforce a narração.`
        );
      }

      // 4d. Texto > 6 palavras
      if (text && text.split(/\s+/).length > 6) {
        violations.push(
          `Cena ${i + 1} "${id}": text_overlay "${text}" tem ${text.split(/\s+/).length} palavras (max 6). Encurte.`
        );
      }

      // 4e. Corte com texto < 2s (exceto hook — hook é rápido de propósito)
      const isHook = i === 0 || (scene.type || '').includes('hook');
      if (text && dur < 2.0 && !isHook) {
        violations.push(
          `Cena ${i + 1} "${id}": duração ${dur}s com texto "${text}" — mínimo 2.0s para leitura.`
        );
      }
    }

    // 4f. Font size mínimo (skip in simples — system controls fonts)
    if (vt === 'photo' && !simplesMode && scene.text_layout?.font_size) {
      const fs = scene.text_layout.font_size;
      const type = scene.type || '';
      const minSize = type === 'hook' ? 120 : type === 'cta' ? 96 : 80;
      if (fs < minSize) {
        violations.push(
          `Cena ${i + 1} "${id}": font_size ${fs}px < mínimo ${minSize}px para tipo "${type || 'body'}".`
        );
      }
    }

    // 4g. Narration field obrigatório
    if (scene.narration === undefined) {
      violations.push(
        `Cena ${i + 1} "${id}": campo "narration" ausente. Adicione o trecho exato da narração (ou "" para silêncio).`
      );
    }

    // 4h. Non-photo scenes: devem ter campos próprios
    if (vt === 'chart') {
      if (!scene.chart_data || !Array.isArray(scene.chart_data) || scene.chart_data.length === 0) {
        violations.push(
          `Cena ${i + 1} "${id}": visual_type "chart" sem chart_data. Adicione array de {label, value}.`
        );
      }
      if (!scene.chart_type) {
        violations.push(
          `Cena ${i + 1} "${id}": visual_type "chart" sem chart_type. Use bar/line/pie/donut.`
        );
      }
    }
    if (vt === 'text_card') {
      if (!scene.card_title && !scene.card_body) {
        violations.push(
          `Cena ${i + 1} "${id}": visual_type "text_card" sem card_title nem card_body.`
        );
      }
    }
    if (vt === 'list') {
      if (!scene.list_items || !Array.isArray(scene.list_items) || scene.list_items.length === 0) {
        violations.push(
          `Cena ${i + 1} "${id}": visual_type "list" sem list_items. Adicione array de strings.`
        );
      }
    }

    // 4i. Image path exists (photo scenes)
    if (vt === 'photo' && scene.image) {
      const imgPath = path.isAbsolute(scene.image)
        ? scene.image
        : path.resolve(projectRoot, scene.image);
      if (!fs.existsSync(imgPath)) {
        violations.push(
          `Cena ${i + 1} "${id}": imagem não encontrada: ${scene.image}. Use um path existente.`
        );
      }
    }

    // 4j. Position "bottom" proibida em 9:16
    if (vt === 'photo' && scene.text_layout?.position === 'bottom') {
      const format = plan.format || `${plan.width || 1080}x${plan.height || 1920}`;
      if (format.includes('1920') || (plan.height && plan.height > plan.width)) {
        violations.push(
          `Cena ${i + 1} "${id}": posição "bottom" proibida em formato 9:16 (UI cobre). Use "top" ou "center".`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

module.exports = { validateScenePlan };
