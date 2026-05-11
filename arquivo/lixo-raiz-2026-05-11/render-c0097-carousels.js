#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── SETUP ───────────────────────────────────────────────────────────────────

const CAMPAIGN = 'c0097-dia_das_maes_2026';
const BASE     = `/home/nmaldaner/projetos/timesmkt3/prj/inema/outputs/${CAMPAIGN}`;
const ADS_DIR  = `${BASE}/ads`;
const IMGS_DIR = `${BASE}/imgs`;

fs.mkdirSync(ADS_DIR, { recursive: true });

// Map image slot → actual file number (images 04 and 09 don't exist)
const IMG_MAP = { 1:1, 2:2, 3:3, 4:5, 5:6, 6:7, 7:8, 8:10, 9:11, 10:12, 11:13, 12:14, 13:15 };

function ip(slot) {
  const n = IMG_MAP[slot];
  return `${IMGS_DIR}/${CAMPAIGN}_generated_${String(n).padStart(2,'0')}_carousel_1080x1080.jpg`;
}

// ─── SHARED BASE CSS ─────────────────────────────────────────────────────────

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Montserrat:wght@600;700;800;900&family=Inter:wght@400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#18080a;}
.slide{position:relative;width:1080px;height:1080px;overflow:hidden;}
.bg-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(0.86) contrast(1.1) saturate(1.18);}
.overlay{position:absolute;inset:0;}
.brand-tag{position:absolute;bottom:52px;left:64px;font-family:'Montserrat',sans-serif;font-size:17px;font-weight:700;color:rgba(255,248,240,0.38);letter-spacing:0.18em;text-transform:uppercase;}
.slide-num{position:absolute;bottom:52px;right:64px;font-family:'Montserrat',sans-serif;font-size:16px;font-weight:500;color:rgba(245,197,24,0.52);letter-spacing:0.08em;}
@keyframes fadeUp{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:translateY(0);}}
@keyframes scaleIn{from{opacity:0;transform:scale(0.9);}to{opacity:1;transform:scale(1);}}
`;

// ─── SLIDE GENERATORS ────────────────────────────────────────────────────────

function makeTopSlide(s) {
  const imgSrc  = ip(s.imgSlot);
  const fStyle  = s.italic === false ? 'normal' : 'italic';
  const fWeight = s.fontWeight || 700;
  const tColor  = s.textColor || '#FFF8F0';
  const aColor  = s.accentColor || '#F5C518';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  const subtextCSS = s.subtext
    ? `.sub{font-family:'Playfair Display',serif;font-size:${Math.round(s.fontSize*0.44)}px;font-style:italic;font-weight:400;line-height:1.42;color:rgba(255,248,240,0.82);text-align:center;max-width:820px;margin-top:22px;text-shadow:0 2px 14px rgba(0,0,0,0.52);}`
    : '';
  const subtextHtml = s.subtext
    ? `<p class="sub">${s.subtext.split('\n').map(l=>`<span style="display:block">${l}</span>`).join('')}</p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:72px 80px 0;animation:fadeUp 0.5s ease both;}
.bar{width:72px;height:3px;background:${aColor};border-radius:2px;margin-bottom:28px;}
.hl{font-family:'Playfair Display',serif;font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.15;color:${tColor};text-align:center;max-width:940px;text-shadow:0 3px 22px rgba(0,0,0,0.68),0 0 64px rgba(0,0,0,0.38);letter-spacing:-0.01em;}
${subtextCSS}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="bar"></div>
    <div class="hl">${linesHtml}</div>
    ${subtextHtml}
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

function makeCenterSlide(s) {
  const imgSrc  = ip(s.imgSlot);
  const fStyle  = s.italic === false ? 'normal' : 'italic';
  const fWeight = s.fontWeight || 700;
  const tColor  = s.textColor || '#FFF8F0';
  const aColor  = s.accentColor || '#E8956D';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 80px 180px;animation:fadeUp 0.5s ease both;}
.bar{width:64px;height:2px;background:${aColor};border-radius:2px;margin-bottom:30px;}
.bar-b{width:64px;height:2px;background:${aColor};border-radius:2px;margin-top:30px;opacity:0.55;}
.hl{font-family:'Playfair Display',serif;font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.18;color:${tColor};text-align:center;max-width:900px;text-shadow:0 3px 22px rgba(0,0,0,0.7),0 0 64px rgba(0,0,0,0.38);}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="bar"></div>
    <div class="hl">${linesHtml}</div>
    <div class="bar-b"></div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

function makeStatSlide(s) {
  const imgSrc = ip(s.imgSlot);
  const num    = String(s.n).padStart(2,'0');
  const ctxHtml = s.context.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:88px 80px 0;animation:fadeUp 0.5s ease both;}
.stat{font-family:'Montserrat',sans-serif;font-size:160px;font-weight:900;line-height:1.0;color:#F5C518;text-shadow:0 4px 30px rgba(245,197,24,0.38),0 2px 60px rgba(0,0,0,0.62);letter-spacing:-0.03em;}
.ctx{font-family:'Playfair Display',serif;font-size:52px;font-style:italic;font-weight:400;line-height:1.32;color:rgba(255,248,240,0.88);text-align:center;max-width:720px;margin-top:12px;text-shadow:0 2px 16px rgba(0,0,0,0.65);}
.rule{width:120px;height:3px;background:#F5C518;border-radius:2px;margin-top:36px;opacity:0.75;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="stat">${s.stat}</div>
    <div class="ctx">${ctxHtml}</div>
    <div class="rule"></div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

function makeLeftSlide(s) {
  const imgSrc  = ip(s.imgSlot);
  const fStyle  = s.italic === false ? 'normal' : 'italic';
  const fWeight = s.fontWeight || 700;
  const tColor  = s.textColor || '#FFF8F0';
  const aColor  = s.accentColor || '#F5C518';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:row;align-items:flex-start;padding:80px;}
.v-accent{width:4px;min-height:90px;background:${aColor};border-radius:4px;margin-right:28px;flex-shrink:0;margin-top:4px;}
.text-col{display:flex;flex-direction:column;animation:fadeUp 0.5s ease both;}
.hl{font-family:'Playfair Display',serif;font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.15;color:${tColor};text-align:left;max-width:860px;text-shadow:0 3px 22px rgba(0,0,0,0.68),0 0 64px rgba(0,0,0,0.38);letter-spacing:-0.01em;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="v-accent"></div>
    <div class="text-col">
      <div class="hl">${linesHtml}</div>
    </div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Slide 14 — gradient only, no photo. Warm emotional peak.
function makeGradientSlide(s) {
  const fStyle  = s.italic === false ? 'normal' : 'italic';
  const fWeight = s.fontWeight || 700;
  const tColor  = s.textColor || '#FFF8F0';
  const aColor  = s.accentColor || '#F5C518';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  const subtextHtml = s.subtext
    ? `<p class="sub">${s.subtext}</p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
body{background:${s.bg};}
.slide-bg{position:absolute;inset:0;background:${s.bg};}
.noise{position:absolute;inset:0;opacity:0.04;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:200px;}
.bloom{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:700px;background:radial-gradient(ellipse,rgba(245,197,24,0.18) 0%,transparent 70%);border-radius:50%;}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;animation:fadeUp 0.5s ease both;}
.eyebrow{font-family:'Montserrat',sans-serif;font-size:18px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,248,240,0.55);margin-bottom:28px;}
.bar{width:80px;height:3px;background:${aColor};border-radius:2px;margin-bottom:32px;}
.hl{font-family:'Playfair Display',serif;font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.22;color:${tColor};text-align:center;max-width:880px;text-shadow:0 3px 22px rgba(0,0,0,0.35);}
.sub{font-family:'Playfair Display',serif;font-size:38px;font-style:italic;font-weight:400;color:rgba(255,248,240,0.65);text-align:center;margin-top:28px;line-height:1.4;}
.flower{font-size:52px;margin-top:36px;filter:drop-shadow(0 2px 12px rgba(245,197,24,0.4));}
.brand-tag{position:absolute;bottom:52px;left:64px;font-family:'Montserrat',sans-serif;font-size:17px;font-weight:700;color:rgba(255,248,240,0.38);letter-spacing:0.18em;text-transform:uppercase;}
.slide-num{position:absolute;bottom:52px;right:64px;font-family:'Montserrat',sans-serif;font-size:16px;font-weight:500;color:rgba(245,197,24,0.52);letter-spacing:0.08em;}
</style></head><body>
<div class="slide">
  <div class="slide-bg"></div>
  <div class="noise"></div>
  <div class="bloom"></div>
  <div class="content">
    <div class="eyebrow">Honre ela evoluindo</div>
    <div class="bar"></div>
    <div class="hl">${linesHtml}</div>
    ${subtextHtml}
    <div class="flower">🌸</div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Slide 15 — CTA: dark INEMA brand, no photo
function makeCTASlide(s) {
  const num = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
body{background:#0A0A14;}
.slide-bg{position:absolute;inset:0;background:linear-gradient(135deg,#0D0D0D 0%,#141428 45%,#0A0A1A 100%);}
.glow-ring{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:680px;height:680px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,255,136,0.07) 0%,rgba(0,153,255,0.05) 40%,transparent 70%);}
.noise{position:absolute;inset:0;opacity:0.03;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:200px;}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;}
.eyebrow{font-family:'Montserrat',sans-serif;font-size:18px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:rgba(245,197,24,0.7);margin-bottom:16px;animation:fadeUp 0.4s ease both;}
.pre-head{font-family:'Playfair Display',serif;font-size:54px;font-style:italic;font-weight:700;color:#FFF8F0;line-height:1.15;text-align:center;text-shadow:0 3px 22px rgba(0,0,0,0.72);animation:fadeUp 0.5s ease both 0.06s;margin-bottom:20px;}
.divider{width:110px;height:3px;background:#F5C518;border-radius:2px;animation:scaleIn 0.4s ease both 0.12s;margin-bottom:18px;}
.brand-hero{font-family:'Montserrat',sans-serif;font-size:112px;font-weight:900;color:#00FF88;line-height:1.0;letter-spacing:-0.025em;text-shadow:0 0 80px rgba(0,255,136,0.28),0 4px 32px rgba(0,0,0,0.62);animation:scaleIn 0.55s ease both 0.18s;margin-bottom:6px;}
.tagline{font-family:'Inter',sans-serif;font-size:24px;font-weight:500;color:rgba(255,248,240,0.5);letter-spacing:0.05em;animation:fadeUp 0.5s ease both 0.24s;margin-bottom:32px;}
.cta-pill{display:inline-block;background:rgba(255,255,255,0.1);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1.5px solid rgba(255,255,255,0.28);border-radius:9999px;padding:20px 56px;font-family:'Montserrat',sans-serif;font-size:24px;font-weight:800;color:#FFF8F0;letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 4px 28px rgba(0,255,136,0.2),0 8px 48px rgba(0,0,0,0.42);animation:scaleIn 0.5s ease both 0.32s;}
.url-hint{font-family:'Inter',sans-serif;font-size:20px;font-weight:400;color:rgba(255,248,240,0.35);margin-top:20px;letter-spacing:0.06em;animation:fadeUp 0.5s ease both 0.42s;}
</style></head><body>
<div class="slide">
  <div class="slide-bg"></div>
  <div class="noise"></div>
  <div class="glow-ring"></div>
  <div class="content">
    <div class="eyebrow">Dia das Mães 2026</div>
    <div class="pre-head">Honre ela evoluindo.</div>
    <div class="divider"></div>
    <div class="brand-hero">INEMA.CLUB</div>
    <div class="tagline">Evolução. Formação. Comunidade.</div>
    <div class="cta-pill">Acesse → inema.vip</div>
    <div class="url-hint">inema.vip</div>
  </div>
</div></body></html>`;
}

// ─── SLIDE DEFINITIONS ───────────────────────────────────────────────────────
// Narrative source: narrative.json → carousel_texts (15 entries)
// Images: slots 1-13 map to existing files via IMG_MAP (skipping 04 and 09)
// Slides 14-15: gradient backgrounds only

const SLIDES = [
  // 1 — HOOK: "Ela não tinha sala de aula..."
  { n:1, imgSlot:1, type:'top',
    text:'Ela não tinha\nsala de aula...',
    fontSize:96, italic:true,
    overlay:'linear-gradient(to bottom, rgba(44,24,16,0.08) 0%, rgba(44,24,16,0.58) 55%, rgba(44,24,16,0.96) 100%)',
    accentColor:'#F5C518', textColor:'#FFF8F0',
    concept:'Hook — abertura emocional, abre o carrossel com tensão poética'
  },
  // 2 — "Mas foi a maior professora da sua vida."
  { n:2, imgSlot:2, type:'top',
    text:'Mas foi a maior professora\nda sua vida.',
    fontSize:80, italic:true,
    overlay:'linear-gradient(to bottom, rgba(44,24,16,0.12) 0%, rgba(44,24,16,0.65) 58%, rgba(44,24,16,0.97) 100%)',
    accentColor:'#F5C518', textColor:'#FFF8F0',
    concept:'Resolução do hook — identidade materna como educadora'
  },
  // 3 — "Ela acordou cedo enquanto você dormia."
  { n:3, imgSlot:3, type:'top',
    text:'Ela acordou cedo\nenquanto você dormia.',
    fontSize:78, italic:true,
    overlay:'linear-gradient(160deg, rgba(44,24,16,0.82) 0%, rgba(44,24,16,0.28) 44%, rgba(44,24,16,0.72) 100%)',
    accentColor:'#E8956D', textColor:'#FFF8F0',
    concept:'Sacrifício silencioso — dedicação cotidiana'
  },
  // 4 — "Abriu mão de sonhos para que você realizasse os seus."
  { n:4, imgSlot:4, type:'top',   // slot 4 → file 05 via IMG_MAP
    text:'Abriu mão de sonhos\npara que você realizasse\nos seus.',
    fontSize:66, italic:true,
    overlay:'linear-gradient(to bottom, rgba(44,24,16,0.18) 0%, rgba(44,24,16,0.70) 60%, rgba(44,24,16,0.97) 100%)',
    accentColor:'#E8956D', textColor:'#FFF8F0',
    concept:'Sacrifício — sonhos adiados por amor (image_05)'
  },
  // 5 — "Trabalhou, lutou e nunca desistiu..."
  { n:5, imgSlot:5, type:'top',   // slot 5 → file 06
    text:'Trabalhou, lutou\ne nunca desistiu —\nmesmo quando parecia impossível.',
    fontSize:60, italic:false, fontWeight:700,
    overlay:'linear-gradient(to bottom, rgba(30,10,5,0.28) 0%, rgba(30,10,5,0.78) 65%, rgba(30,10,5,0.97) 100%)',
    accentColor:'#F5C518', textColor:'#FFF8F0',
    concept:'Força e persistência materna (image_06)'
  },
  // 6 — "Tudo o que você é hoje começou com ela."
  { n:6, imgSlot:6, type:'top',   // slot 6 → file 07
    text:'Tudo o que você é\nhoje começou com ela.',
    fontSize:84, italic:true,
    overlay:'linear-gradient(to bottom, rgba(20,10,5,0.12) 0%, rgba(20,10,5,0.55) 50%, rgba(20,10,5,0.94) 100%)',
    accentColor:'#E8956D', textColor:'#F5C518',
    concept:'Herança materna — texto dourado, identidade formada por amor (image_07)'
  },
  // 7 — "As mãos que trabalharam por você."
  { n:7, imgSlot:7, type:'center', // slot 7 → file 08
    text:'As mãos que\ntrabalharam por você.',
    fontSize:88, italic:true,
    overlay:'radial-gradient(ellipse at center, rgba(44,24,16,0.08) 0%, rgba(44,24,16,0.74) 100%)',
    accentColor:'#E8956D', textColor:'#FFF8F0',
    concept:'Mãos como símbolo do trabalho materno — layout centralizado (image_08)'
  },
  // 8 — "Os abraços que curavam qualquer dor."
  { n:8, imgSlot:8, type:'center', // slot 8 → file 10
    text:'Os abraços que\ncuravam qualquer dor.',
    fontSize:88, italic:true,
    overlay:'radial-gradient(ellipse at 50% 38%, rgba(44,24,16,0.04) 0%, rgba(44,24,16,0.8) 100%)',
    accentColor:'#E8956D', textColor:'#FFF8F0',
    concept:'Amor materno — abraços que curam (image_10)'
  },
  // 9 — "O amor que nunca pediu nada em troca."
  { n:9, imgSlot:9, type:'center', // slot 9 → file 11
    text:'O amor que nunca\npediu nada em troca.',
    fontSize:84, italic:true,
    overlay:'radial-gradient(ellipse at center, rgba(44,24,16,0.0) 0%, rgba(44,24,16,0.82) 100%)',
    accentColor:'#F5C518', textColor:'#FFF8F0',
    concept:'Amor incondicional — puro, sem expectativas (image_11)'
  },
  // 10 — STAT: "88% dos brasileiros..."
  { n:10, imgSlot:10, type:'stat', // slot 10 → file 12
    stat:'88%',
    context:'dos brasileiros têm\na melhor relação da vida\ncom a mãe.',
    overlay:'linear-gradient(to bottom, rgba(44,24,16,0.48) 0%, rgba(44,24,16,0.90) 100%)',
    concept:'Dado emocional — 88% dos brasileiros e a mãe (image_12)'
  },
  // 11 — "Porque amor que forma, transforma para sempre." (left-aligned)
  { n:11, imgSlot:11, type:'left', // slot 11 → file 13
    text:'Porque amor que forma,\ntransforma para sempre.',
    fontSize:76, italic:true,
    overlay:'linear-gradient(125deg, rgba(44,24,16,0.88) 0%, rgba(44,24,16,0.36) 55%, rgba(44,24,16,0.72) 100%)',
    accentColor:'#F5C518', textColor:'#FFF8F0',
    concept:'Virada filosófica — amor que transforma, editorial left-aligned (image_13)'
  },
  // 12 — "A maior homenagem que você pode dar a ela..."
  { n:12, imgSlot:12, type:'top', // slot 12 → file 14
    text:'A maior homenagem\nque você pode dar a ela...',
    fontSize:76, italic:true,
    overlay:'linear-gradient(to bottom, rgba(44,24,16,0.28) 0%, rgba(44,24,16,0.78) 65%, rgba(44,24,16,0.97) 100%)',
    accentColor:'#E8956D', textColor:'#FFF8F0',
    concept:'Tensão — construção dramática antes da virada (image_14)'
  },
  // 13 — "Não vem numa caixa." (IMPACTFUL — bold 900, máximo impacto)
  { n:13, imgSlot:13, type:'center', // slot 13 → file 15
    text:'Não vem\nnuma caixa.',
    fontSize:120, italic:false, fontWeight:900,
    overlay:'linear-gradient(to bottom, rgba(28,8,4,0.60) 0%, rgba(28,8,4,0.90) 100%)',
    accentColor:'#E8956D', textColor:'#FFF8F0',
    concept:'Virada — homenagem não é produto, é evolução. Bold 900 (image_15)'
  },
  // 14 — Gradient slide: "É você se tornando a melhor versão de si mesmo."
  { n:14, type:'gradient',
    text:'É você se tornando\na melhor versão\nde si mesmo.',
    subtext:'A INEMA é a continuação do que ela começou.',
    fontSize:72, italic:true,
    bg:'linear-gradient(135deg, #2C1810 0%, #6B2D1E 28%, #C4603A 55%, #E8956D 75%, #F5C518 100%)',
    accentColor:'#F5C518', textColor:'#FFF8F0',
    concept:'Pico emocional — evolução pessoal como homenagem, fundo gradiente quente sem foto'
  },
  // 15 — CTA: INEMA.CLUB hero — dark brand gradient, no photo
  { n:15, type:'cta',
    concept:'CTA — INEMA.CLUB como destino da evolução, inema.vip como URL, fundo dark INEMA sem foto'
  },
];

// ─── HTML DISPATCH ────────────────────────────────────────────────────────────

function generateHTML(s) {
  switch (s.type) {
    case 'top':      return makeTopSlide(s);
    case 'center':   return makeCenterSlide(s);
    case 'stat':     return makeStatSlide(s);
    case 'left':     return makeLeftSlide(s);
    case 'gradient': return makeGradientSlide(s);
    case 'cta':      return makeCTASlide(s);
    default: throw new Error('Unknown type: ' + s.type);
  }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎨 Rendering ${SLIDES.length} carousel slides for ${CAMPAIGN}\n`);

  const browser = await chromium.launch();
  const layoutData = {
    campaign: CAMPAIGN,
    generated_at: new Date().toISOString(),
    platform_targets: ['instagram', 'youtube', 'threads'],
    format: 'carousel',
    slides: []
  };

  for (const s of SLIDES) {
    const num      = String(s.n).padStart(2, '0');
    const htmlFile = path.join(ADS_DIR, `${CAMPAIGN}_carousel_${num}.html`);
    const pngFile  = path.join(ADS_DIR, `${CAMPAIGN}_carousel_${num}.png`);

    const html = generateHTML(s);
    fs.writeFileSync(htmlFile, html, 'utf-8');

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1080 });

    // Use goto file:// so that file:// <img> src paths resolve correctly under Chromium
    await page.goto('file://' + path.resolve(htmlFile), { waitUntil: 'networkidle' });

    // Wait for every <img> to be fully loaded AND decoded (naturalWidth > 0)
    await page.evaluate(() => Promise.all(
      [...document.images].map(img =>
        (img.complete && img.naturalWidth > 0)
          ? null
          : new Promise(r => { img.onload = img.onerror = r; })
      )
    ));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700); // buffer for CSS animations to complete

    await page.screenshot({ path: pngFile });
    await page.close();

    console.log(`✓ Slide ${s.n}/15 → ${path.basename(pngFile)}`);

    const carouselText = s.type === 'cta'
      ? 'Honre ela evoluindo. → inema.vip'
      : s.type === 'stat'
        ? `${s.stat} ${(s.context || '').replace(/\n/g, ' ')}`
        : (s.text || '').replace(/\n/g, ' ');

    const imagesUsed = s.imgSlot
      ? [`${CAMPAIGN}_generated_${String(IMG_MAP[s.imgSlot]).padStart(2,'0')}_carousel_1080x1080.jpg`]
      : [];

    layoutData.slides.push({
      filename: path.basename(pngFile),
      html_source: path.basename(htmlFile),
      dimensions: '1080x1080',
      slide_number: s.n,
      layout_type: s.type,
      concept: s.concept,
      carousel_text: carouselText,
      copy_source: 'narrative.json → carousel_texts',
      images_used: imagesUsed
    });
  }

  await browser.close();

  const layoutPath = path.join(ADS_DIR, 'layout.json');
  fs.writeFileSync(layoutPath, JSON.stringify(layoutData, null, 2), 'utf-8');

  console.log('\n✓ layout.json saved');
  console.log(`\n✅ All 15 slides rendered → ${ADS_DIR}\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
