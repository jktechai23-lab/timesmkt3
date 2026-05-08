#!/usr/bin/env node
/**
 * gen-refs-menino-lua.js — Gera 3 reference images do menino pra subject_lock V2.
 *
 * A: pajamas (frames 1-9, sonho/estudo)
 * B: casual clothes (frames 10-16 build, 45-50 return)
 * C: silver spacesuit + helmet (frames 17-44 voo/lua)
 */

const path = require('path');
const fs = require('fs');
const { generateImage } = require('../pipeline/generate-image-inemaimg');

const REVISTA_DIR = path.resolve(__dirname, '..', 'prj/inema/revistas/menino_na_lua');
const REFS_DIR = path.join(REVISTA_DIR, 'refs');
const STYLE = "vintage 1960s comic book illustration, halftone dots texture, bold ink outlines, limited color palette (cream paper, faded cyan, warm orange-red), retro silver-age comics aesthetic";

const CHAR = "8-year-old Brazilian boy named Tomé, messy chestnut brown hair with cowlick, light freckles across nose and cheeks, big curious warm-brown eyes, slim build, friendly determined expression, the SAME boy across all references";

const REFS = [
  {
    id: 'A_pajamas',
    prompt: `Full-body character reference sheet of ${CHAR}, wearing blue and white striped cotton pajamas with small rocket print, barefoot, standing in neutral pose facing camera, simple cream paper background, single character clearly visible. ${STYLE}, NO text, NO speech bubbles, NO lettering`,
  },
  {
    id: 'B_casual',
    prompt: `Full-body character reference sheet of ${CHAR}, wearing striped red and white t-shirt, denim shorts, simple sneakers, standing in neutral pose facing camera, simple cream paper background, single character clearly visible. ${STYLE}, NO text, NO speech bubbles, NO lettering`,
  },
  {
    id: 'C_spacesuit',
    prompt: `Full-body character reference sheet of ${CHAR}, wearing a homemade silver foil spacesuit covered in duct tape patches, fishbowl-style transparent bubble helmet over head with antenna, gloves and boots, standing in neutral pose facing camera, simple cream paper background, single character clearly visible. ${STYLE}, NO text, NO speech bubbles, NO lettering`,
  },
];

(async () => {
  fs.mkdirSync(REFS_DIR, { recursive: true });
  process.env.INEMAIMG_QUALITY = 'high'; // refs em alta qualidade pra serem fortes na hora de condicionar
  for (const ref of REFS) {
    const out = path.join(REFS_DIR, `ref_${ref.id}.jpg`);
    if (fs.existsSync(out)) {
      console.log(`[${ref.id}] já existe, pulando`);
      continue;
    }
    console.log(`[${ref.id}] gerando...`);
    await generateImage(out, ref.prompt, 'flux2-klein', '1:1');
  }
  console.log(`\n✅ ${REFS.length} refs em: ${REFS_DIR}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
