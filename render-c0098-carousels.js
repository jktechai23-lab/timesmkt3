#!/usr/bin/env node
/**
 * render-c0098-carousels.js
 * Generates and renders 15 carousel slides for c0098-dias_das_maes_2026
 * Playwright + Chromium → 1080×1080 PNG
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CAMPAIGN = 'c0098-dias_das_maes_2026';
const OUT_DIR = path.resolve(`prj/inema/outputs/${CAMPAIGN}/ads`);
const IMGS_DIR = path.resolve(`prj/inema/outputs/${CAMPAIGN}/imgs`);

const imgPath = (n) =>
  `${IMGS_DIR}/${CAMPAIGN}_generated_${String(n).padStart(2, '0')}_carousel_1080x1080.jpg`;

// ─── Slide definitions ────────────────────────────────────────────────────────

const slides = [
  { id: '01', text: 'Antes de qualquer conquista... havia ela.', image: imgPath(1), layout: 'hero_top', subtext: null },
  { id: '02', text: 'Ela apostou em você quando nem você acreditava.', image: imgPath(2), layout: 'editorial_top', subtext: null },
  { id: '03', text: 'Cada silêncio suportado foi um ato de amor.', image: imgPath(3), layout: 'panel_left', subtext: null },
  { id: '04', text: 'Ela não precisava de certificado para te formar.', image: imgPath(4), layout: 'circle_center', subtext: null },
  { id: '05', text: "Cada 'você consegue' ficou para sempre.", image: imgPath(5), layout: 'glass_center', subtext: null },
  { id: '06', text: 'Mãe solo. Mãe trabalhadora. Mãe forte.', image: imgPath(6), layout: 'triple_line', subtext: null },
  { id: '07', text: 'Do Norte ao Sul. Do Nordeste ao Sudeste. Amor sem fronteiras.', image: imgPath(7), layout: 'hero_top', subtext: null },
  { id: '08', text: 'Mãos que seguraram. Mãos que soltaram quando era hora.', image: imgPath(8), layout: 'editorial_bottom_band', subtext: null },
  { id: '09', text: 'O maior investimento que ela fez foi em você.', image: null, layout: 'pure_design', subtext: 'Sem pedir retorno. Sem exigir resultado.\nSó amor.' },
  { id: '10', text: 'Ela nunca pediu retorno. Só o seu futuro.', image: imgPath(10), layout: 'diagonal_overlay', subtext: null },
  { id: '11', text: 'Atrás de cada profissional do futuro, há uma mãe extraordinária.', image: imgPath(11), layout: 'panel_right', subtext: null },
  { id: '12', text: 'O legado silencioso que carregamos para sempre.', image: imgPath(12), layout: 'contemplative', subtext: null },
  { id: '13', text: 'Ela não precisava de IA. Ela entendia de você.', image: imgPath(13), layout: 'contrast_badge', subtext: null },
  { id: '14', text: 'Quinze retratos. Uma só história. A sua.', image: imgPath(14), layout: 'frame_editorial', subtext: null },
  { id: '15', text: 'Salva e manda pra ela. 💙', image: imgPath(15), layout: 'cta_final', subtext: 'Feliz Dia das Mães.' },
];

// ─── HTML generators ──────────────────────────────────────────────────────────

const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,600;1,700&family=Inter:wght@300;400;500;600&family=Raleway:wght@300;400;500;600&display=swap" rel="stylesheet">`;

const baseStyle = `* { margin: 0; padding: 0; box-sizing: border-box; } body { width: 1080px; height: 1080px; overflow: hidden; position: relative; }`;

const inemaLogo = (color = '#FFFFFF', size = 20) =>
  `<div style="position:absolute;bottom:40px;left:48px;font-family:'Inter',sans-serif;font-size:${size}px;font-weight:600;letter-spacing:0.15em;color:${color};opacity:0.9;">INEMA</div>`;

const slideNum = (id) =>
  `<div style="position:absolute;bottom:40px;right:48px;font-family:'Inter',sans-serif;font-size:18px;font-weight:400;letter-spacing:0.1em;color:rgba(255,255,255,0.5);">${id}/15</div>`;

function hero_top({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.88) contrast(1.08) saturate(1.15);}
  .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,8,2,0.65) 0%,rgba(20,8,2,0.1) 45%,rgba(20,8,2,0.45) 100%);}
  .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:72px 64px 0;}
  .accent-line{width:48px;height:3px;background:#F5C47A;margin-bottom:24px;border-radius:2px;}
  .headline{font-family:'Playfair Display',serif;font-size:80px;font-weight:900;font-style:italic;color:#FFF7ED;text-align:center;line-height:1.1;letter-spacing:-0.01em;text-shadow:0 4px 32px rgba(0,0,0,0.6),0 0 60px rgba(0,0,0,0.3);}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .accent-line{animation:fadeUp 0.5s ease both 0.1s;}.headline{animation:fadeUp 0.5s ease both;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="content"><div class="accent-line"></div><div class="headline">${text}</div></div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function editorial_top({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.82) contrast(1.1) saturate(1.2);}
  .overlay{position:absolute;inset:0;background:linear-gradient(160deg,rgba(15,6,0,0.75) 0%,rgba(15,6,0,0.35) 40%,rgba(15,6,0,0.2) 70%,rgba(15,6,0,0.5) 100%);}
  .content{position:absolute;top:0;left:0;right:0;padding:60px 72px;}
  .quote-mark{font-family:'Playfair Display',serif;font-size:120px;font-weight:900;color:#F5C47A;line-height:0.7;margin-bottom:8px;opacity:0.9;}
  .headline{font-family:'Playfair Display',serif;font-size:70px;font-weight:700;color:#FFFFFF;line-height:1.15;letter-spacing:0.01em;text-shadow:0 3px 20px rgba(0,0,0,0.7);}
  .divider{width:56px;height:2px;background:linear-gradient(90deg,#FF8C5A,#F5C47A);margin-top:28px;border-radius:2px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  .quote-mark{animation:fadeUp 0.4s ease both;}.headline{animation:fadeUp 0.5s ease both 0.05s;}.divider{animation:fadeUp 0.5s ease both 0.1s;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="content">
    <div class="quote-mark">"</div>
    <div class="headline">${text}</div>
    <div class="divider"></div>
  </div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function panel_left({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .layout{display:flex;width:1080px;height:1080px;}
  .panel{width:400px;flex-shrink:0;background:linear-gradient(145deg,#F5C47A 0%,#FF8C5A 100%);display:flex;flex-direction:column;justify-content:center;padding:56px 44px;position:relative;}
  .panel-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.4);margin-bottom:32px;}
  .panel-headline{font-family:'Playfair Display',serif;font-size:60px;font-weight:900;color:#2C1A0E;line-height:1.1;letter-spacing:-0.01em;}
  .panel-brand{position:absolute;bottom:40px;left:44px;font-family:'Inter',sans-serif;font-size:20px;font-weight:600;letter-spacing:0.15em;color:rgba(44,26,14,0.6);}
  .panel-num{position:absolute;bottom:40px;right:28px;font-family:'Inter',sans-serif;font-size:18px;color:rgba(44,26,14,0.4);}
  .photo{flex:1;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.9) contrast(1.05) saturate(1.1);}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}.panel-headline{animation:fadeIn 0.5s ease both 0.05s;}
  </style></head><body>
  <div class="layout">
    <div class="panel">
      <div class="panel-dot"></div>
      <div class="panel-headline">${text}</div>
      <div class="panel-brand">INEMA</div>
      <div class="panel-num">${id}/15</div>
    </div>
    <div class="photo"></div>
  </div>
  </body></html>`;
}

function circle_center({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  body{background:linear-gradient(145deg,#FEF3E2 0%,#FDDCB0 40%,#FFCFA3 100%);}
  .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;}
  .circle-wrap{width:400px;height:400px;border-radius:50%;overflow:hidden;border:6px solid #FF8C5A;box-shadow:0 8px 48px rgba(180,80,20,0.3);margin:0 auto 44px;flex-shrink:0;}
  .circle-wrap img{width:100%;height:100%;object-fit:cover;filter:brightness(0.92) saturate(1.15);}
  .headline{font-family:'Playfair Display',serif;font-size:64px;font-weight:700;font-style:italic;color:#2C1A0E;text-align:center;line-height:1.12;max-width:860px;}
  .dots{display:flex;gap:8px;margin-top:28px;justify-content:center;}
  .dots span{width:8px;height:8px;border-radius:50%;}
  .dots span:nth-child(1){background:#FF8C5A;}.dots span:nth-child(2){background:#F5C47A;}.dots span:nth-child(3){background:#0099FF;}
  .inema-lbl{position:absolute;bottom:40px;left:0;right:0;text-align:center;font-family:'Inter',sans-serif;font-size:20px;font-weight:600;letter-spacing:0.15em;color:rgba(44,26,14,0.5);}
  .slide-n{position:absolute;bottom:40px;right:48px;font-family:'Inter',sans-serif;font-size:18px;color:rgba(44,26,14,0.4);}
  @keyframes scaleIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
  .circle-wrap{animation:scaleIn 0.5s ease both;}.headline{animation:scaleIn 0.5s ease both 0.05s;}
  </style></head><body>
  <div class="content">
    <div class="circle-wrap"><img src="file://${image}" /></div>
    <div class="headline">${text}</div>
    <div class="dots"><span></span><span></span><span></span></div>
  </div>
  <div class="inema-lbl">INEMA</div><div class="slide-n">${id}/15</div>
  </body></html>`;
}

function glass_center({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.78) contrast(1.12) saturate(1.18);}
  .overlay{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 0%,rgba(0,0,0,0.4) 100%);}
  .glass-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:820px;padding:56px 64px;background:rgba(255,240,220,0.15);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,220,170,0.35);border-radius:16px;text-align:center;}
  .glass-line{width:40px;height:2px;background:#F5C47A;margin:0 auto 24px;border-radius:2px;}
  .headline{font-family:'Playfair Display',serif;font-size:72px;font-weight:900;font-style:italic;color:#FFF7ED;line-height:1.1;text-shadow:0 4px 24px rgba(0,0,0,0.5);}
  .glass-line-b{width:40px;height:2px;background:#FF8C5A;margin:24px auto 0;border-radius:2px;}
  @keyframes fadeUp{from{opacity:0;transform:translate(-50%,-45%)}to{opacity:1;transform:translate(-50%,-50%)}}
  .glass-box{animation:fadeUp 0.5s ease both;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="glass-box">
    <div class="glass-line"></div>
    <div class="headline">${text}</div>
    <div class="glass-line-b"></div>
  </div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function triple_line({ text, image, id }) {
  const lines = text.split('. ').filter(Boolean);
  const lineItems = lines.map(l =>
    `<div class="line-item"><div class="line-accent"></div><div class="line-text">${l.trim().replace(/\.$/, '')}.</div></div>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.7) contrast(1.12) saturate(1.2);}
  .overlay{position:absolute;inset:0;background:linear-gradient(0deg,rgba(20,8,2,0.88) 0%,rgba(20,8,2,0.3) 50%,rgba(20,8,2,0.62) 100%);}
  .content{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);padding:0 72px;}
  .line-item{display:flex;align-items:center;gap:20px;margin-bottom:18px;}
  .line-accent{width:6px;height:56px;background:#FF8C5A;border-radius:3px;flex-shrink:0;}
  .line-text{font-family:'Playfair Display',serif;font-size:80px;font-weight:900;color:#FFF7ED;line-height:1;text-shadow:0 4px 24px rgba(0,0,0,0.6);}
  @keyframes slideIn{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}
  .line-item:nth-child(1){animation:slideIn 0.4s ease both 0s}
  .line-item:nth-child(2){animation:slideIn 0.4s ease both 0.08s}
  .line-item:nth-child(3){animation:slideIn 0.4s ease both 0.16s}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="content">${lineItems}</div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function editorial_bottom_band({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center 30%/cover no-repeat;filter:brightness(0.9) contrast(1.08) saturate(1.15);}
  .band{position:absolute;bottom:0;left:0;right:0;height:400px;background:linear-gradient(0deg,rgba(20,8,2,0.92) 0%,rgba(20,8,2,0.75) 60%,transparent 100%);padding:0 64px;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:68px;}
  .ornament{display:flex;align-items:center;gap:16px;margin-bottom:20px;}
  .ornament-line{height:1px;width:40px;background:#F5C47A;}
  .ornament-dot{width:6px;height:6px;border-radius:50%;background:#F5C47A;}
  .headline{font-family:'Playfair Display',serif;font-size:68px;font-weight:700;font-style:italic;color:#FFF7ED;line-height:1.12;text-shadow:0 4px 24px rgba(0,0,0,0.6);max-width:900px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .headline{animation:fadeUp 0.5s ease both;}
  </style></head><body>
  <div class="bg"></div>
  <div class="band">
    <div class="ornament"><div class="ornament-line"></div><div class="ornament-dot"></div></div>
    <div class="headline">${text}</div>
  </div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function pure_design({ text, subtext, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  body{background:linear-gradient(135deg,#F5C47A 0%,#FF8C5A 45%,#FF6B3D 100%);}
  .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;}
  .big-symbol{font-size:140px;color:rgba(255,255,255,0.15);margin-bottom:-20px;line-height:1;}
  .headline{font-family:'Playfair Display',serif;font-size:78px;font-weight:900;color:#2C1A0E;text-align:center;line-height:1.1;letter-spacing:-0.01em;max-width:860px;}
  .divider{width:60px;height:3px;background:rgba(44,26,14,0.3);border-radius:2px;margin:32px auto;}
  .subtext{font-family:'Raleway',sans-serif;font-size:38px;font-weight:400;color:rgba(44,26,14,0.7);text-align:center;line-height:1.5;white-space:pre-line;max-width:700px;}
  .inema-lbl{position:absolute;bottom:40px;left:0;right:0;text-align:center;font-family:'Inter',sans-serif;font-size:22px;font-weight:600;letter-spacing:0.2em;color:rgba(44,26,14,0.45);}
  .slide-n{position:absolute;bottom:40px;right:48px;font-family:'Inter',sans-serif;font-size:18px;color:rgba(44,26,14,0.4);}
  @keyframes fadeIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
  .headline{animation:fadeIn 0.5s ease both;}.subtext{animation:fadeIn 0.5s ease both 0.1s;}
  </style></head><body>
  <div class="content">
    <div class="big-symbol">∞</div>
    <div class="headline">${text}</div>
    <div class="divider"></div>
    <div class="subtext">${subtext || ''}</div>
  </div>
  <div class="inema-lbl">INEMA</div><div class="slide-n">${id}/15</div>
  </body></html>`;
}

function diagonal_overlay({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.8) contrast(1.1) saturate(1.15);}
  .overlay{position:absolute;inset:0;background:linear-gradient(120deg,rgba(15,6,0,0.15) 0%,rgba(15,6,0,0.25) 40%,rgba(15,6,0,0.8) 100%);}
  .content{position:absolute;top:50%;right:0;transform:translateY(-50%);width:680px;padding:0 72px 0 48px;text-align:right;}
  .eyebrow{font-family:'Inter',sans-serif;font-size:18px;font-weight:500;letter-spacing:0.2em;color:#F5C47A;text-transform:uppercase;margin-bottom:20px;}
  .headline{font-family:'Playfair Display',serif;font-size:70px;font-weight:900;font-style:italic;color:#FFF7ED;line-height:1.1;text-shadow:0 4px 28px rgba(0,0,0,0.6);}
  .right-line{width:56px;height:3px;background:#FF8C5A;border-radius:2px;margin-left:auto;margin-top:28px;}
  @keyframes fadeRight{from{opacity:0;transform:translateY(-50%) translateX(20px)}to{opacity:1;transform:translateY(-50%) translateX(0)}}
  .content{animation:fadeRight 0.5s ease both;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="content">
    <div class="eyebrow">Dia das Mães · 2026</div>
    <div class="headline">${text}</div>
    <div class="right-line"></div>
  </div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function panel_right({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .layout{display:flex;width:1080px;height:1080px;}
  .photo{flex:1;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.88) contrast(1.08) saturate(1.1);}
  .panel{width:440px;flex-shrink:0;background:linear-gradient(160deg,#2C1A0E 0%,#1A0A04 100%);display:flex;flex-direction:column;justify-content:center;padding:56px 48px;position:relative;}
  .panel-eyebrow{font-family:'Inter',sans-serif;font-size:14px;font-weight:500;letter-spacing:0.25em;color:#F5C47A;text-transform:uppercase;margin-bottom:24px;}
  .panel-headline{font-family:'Playfair Display',serif;font-size:54px;font-weight:700;color:#FFF7ED;line-height:1.15;}
  .panel-accent{width:40px;height:2px;background:#FF8C5A;border-radius:2px;margin-top:32px;}
  .panel-brand{position:absolute;bottom:40px;left:48px;font-family:'Inter',sans-serif;font-size:20px;font-weight:600;letter-spacing:0.15em;color:rgba(255,247,237,0.4);}
  .panel-num{position:absolute;bottom:40px;right:32px;font-family:'Inter',sans-serif;font-size:18px;color:rgba(255,247,237,0.3);}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}.panel-headline{animation:fadeIn 0.5s ease both 0.05s;}
  </style></head><body>
  <div class="layout">
    <div class="photo"></div>
    <div class="panel">
      <div class="panel-eyebrow">Dia das Mães · 2026</div>
      <div class="panel-headline">${text}</div>
      <div class="panel-accent"></div>
      <div class="panel-brand">INEMA</div>
      <div class="panel-num">${id}/15</div>
    </div>
  </div>
  </body></html>`;
}

function contemplative({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.72) contrast(1.05) saturate(1.1);}
  .overlay{position:absolute;inset:0;background:rgba(20,8,2,0.52);}
  .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;}
  .rule{width:100%;max-width:640px;height:1px;background:rgba(245,196,122,0.45);}
  .headline{font-family:'Playfair Display',serif;font-size:76px;font-weight:900;font-style:italic;color:#FFF7ED;text-align:center;line-height:1.12;padding:40px 0;text-shadow:0 4px 28px rgba(0,0,0,0.7);}
  .caption{font-family:'Raleway',sans-serif;font-size:22px;font-weight:300;letter-spacing:0.2em;color:#F5C47A;text-transform:uppercase;margin-top:24px;}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .headline{animation:fadeIn 0.5s ease both;}.rule{animation:fadeIn 0.5s ease both 0.1s;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="content">
    <div class="rule"></div>
    <div class="headline">${text}</div>
    <div class="rule"></div>
    <div class="caption">O Legado Silencioso</div>
  </div>
  ${inemaLogo('#F5C47A')}${slideNum(id)}
  </body></html>`;
}

function contrast_badge({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.82) contrast(1.1) saturate(1.15);}
  .overlay{position:absolute;inset:0;background:linear-gradient(200deg,rgba(0,153,255,0.15) 0%,rgba(20,8,2,0.72) 100%);}
  .badge{position:absolute;top:52px;right:52px;background:#0099FF;border-radius:9999px;padding:10px 28px;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;letter-spacing:0.1em;color:#FFFFFF;text-transform:uppercase;}
  .content{position:absolute;bottom:0;left:0;right:0;padding:0 64px 72px;}
  .headline{font-family:'Playfair Display',serif;font-size:74px;font-weight:900;font-style:italic;color:#FFF7ED;line-height:1.1;text-shadow:0 4px 28px rgba(0,0,0,0.7);max-width:900px;}
  .sub{font-family:'Inter',sans-serif;font-size:26px;font-weight:400;color:#F5C47A;margin-top:16px;letter-spacing:0.03em;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .headline{animation:fadeUp 0.5s ease both;}.badge{animation:fadeUp 0.4s ease both 0.1s;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="badge">INEMA · 2026</div>
  <div class="content">
    <div class="headline">${text}</div>
    <div class="sub">Dia das Mães · 2026</div>
  </div>
  ${slideNum(id)}
  </body></html>`;
}

function frame_editorial({ text, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  body{background:#1A0A04;}
  .frame{position:absolute;inset:28px;overflow:hidden;border-radius:4px;}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.78) contrast(1.1) saturate(1.15);}
  .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,8,2,0.55) 0%,rgba(20,8,2,0.15) 45%,rgba(20,8,2,0.72) 100%);}
  .frame-border{position:absolute;inset:20px;border:1px solid rgba(245,196,122,0.4);border-radius:2px;pointer-events:none;}
  .content{position:absolute;bottom:0;left:0;right:0;padding:0 64px 68px;}
  .meta{font-family:'Inter',sans-serif;font-size:16px;font-weight:500;letter-spacing:0.2em;color:#F5C47A;text-transform:uppercase;margin-bottom:18px;}
  .headline{font-family:'Playfair Display',serif;font-size:76px;font-weight:900;font-style:italic;color:#FFF7ED;line-height:1.1;text-shadow:0 4px 28px rgba(0,0,0,0.7);}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .headline{animation:fadeUp 0.5s ease both;}
  </style></head><body>
  <div class="frame">
    <div class="bg"></div><div class="overlay"></div><div class="frame-border"></div>
    <div class="content">
      <div class="meta">Quinze Retratos · Amor Real</div>
      <div class="headline">${text}</div>
    </div>
  </div>
  <div style="position:absolute;bottom:8px;left:32px;font-family:'Inter',sans-serif;font-size:20px;font-weight:600;letter-spacing:0.15em;color:rgba(245,196,122,0.55);">INEMA</div>
  <div style="position:absolute;bottom:8px;right:32px;font-family:'Inter',sans-serif;font-size:18px;color:rgba(245,196,122,0.4);">${id}/15</div>
  </body></html>`;
}

function cta_final({ text, subtext, image, id }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS}<style>
  ${baseStyle}
  .bg{position:absolute;inset:0;background:url('file://${image}') center/cover no-repeat;filter:brightness(0.52) contrast(1.1) saturate(1.1);}
  .overlay{position:absolute;inset:0;background:linear-gradient(160deg,rgba(15,6,0,0.65) 0%,rgba(244,92,20,0.2) 50%,rgba(15,6,0,0.82) 100%);}
  .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;}
  .brand-url{font-family:'Inter',sans-serif;font-size:96px;font-weight:700;letter-spacing:0.06em;color:#FFFFFF;text-align:center;text-shadow:0 4px 32px rgba(0,0,0,0.7);line-height:1;}
  .brand-sub{font-family:'Raleway',sans-serif;font-size:26px;font-weight:300;letter-spacing:0.25em;color:#F5C47A;text-transform:uppercase;margin-top:12px;text-align:center;}
  .divider{width:80px;height:2px;background:linear-gradient(90deg,#F5C47A,#FF8C5A);border-radius:2px;margin:32px auto;}
  .cta-btn{background:linear-gradient(135deg,#F5C47A,#FF8C5A);border-radius:9999px;padding:20px 56px;font-family:'Inter',sans-serif;font-size:28px;font-weight:700;letter-spacing:0.06em;color:#2C1A0E;box-shadow:0 6px 32px rgba(255,140,90,0.55);text-align:center;}
  .cta-sub{font-family:'Playfair Display',serif;font-size:36px;font-weight:400;font-style:italic;color:rgba(255,247,237,0.88);margin-top:24px;text-align:center;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  .brand-url{animation:fadeUp 0.5s ease both;}
  @keyframes scaleIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
  .cta-btn{animation:scaleIn 0.4s ease both 0.3s;}
  </style></head><body>
  <div class="bg"></div><div class="overlay"></div>
  <div class="content">
    <div class="brand-url">INEMA.CLUB</div>
    <div class="brand-sub">Plataforma gratuita de formação em IA</div>
    <div class="divider"></div>
    <div class="cta-btn">${text}</div>
    <div class="cta-sub">${subtext}</div>
  </div>
  </body></html>`;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

function generateHTML(slide) {
  switch (slide.layout) {
    case 'hero_top':              return hero_top(slide);
    case 'editorial_top':         return editorial_top(slide);
    case 'panel_left':            return panel_left(slide);
    case 'circle_center':         return circle_center(slide);
    case 'glass_center':          return glass_center(slide);
    case 'triple_line':           return triple_line(slide);
    case 'editorial_bottom_band': return editorial_bottom_band(slide);
    case 'pure_design':           return pure_design(slide);
    case 'diagonal_overlay':      return diagonal_overlay(slide);
    case 'panel_right':           return panel_right(slide);
    case 'contemplative':         return contemplative(slide);
    case 'contrast_badge':        return contrast_badge(slide);
    case 'frame_editorial':       return frame_editorial(slide);
    case 'cta_final':             return cta_final(slide);
    default:                      return hero_top(slide);
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function renderSlide(page, htmlPath, pngPath) {
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map(img =>
        img.complete && img.naturalWidth > 0
          ? null
          : new Promise(r => { img.onload = img.onerror = r; })
      )
    )
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: pngPath });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 });

  const layout = { campaign: CAMPAIGN, date: '2026-05-05', slides: [] };

  for (const slide of slides) {
    const filename = `${CAMPAIGN}_carousel_${slide.id}`;
    const htmlFile = path.join(OUT_DIR, `${filename}.html`);
    const pngFile  = path.join(OUT_DIR, `${filename}.png`);

    console.log(`[${slide.id}/15] ${slide.layout} — "${slide.text.substring(0, 55)}"`);

    const html = generateHTML(slide);
    fs.writeFileSync(htmlFile, html, 'utf8');

    await renderSlide(page, htmlFile, pngFile);

    layout.slides.push({
      filename: path.basename(pngFile),
      html_source: path.basename(htmlFile),
      dimensions: '1080x1080',
      layout: slide.layout,
      concept: slide.text,
      copy_source: 'narrative.json → carousel_texts',
      images_used: slide.image ? [path.basename(slide.image)] : [],
    });

    console.log(`    ✓ ${path.basename(pngFile)}`);
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT_DIR, 'layout.json'), JSON.stringify(layout, null, 2));
  console.log('\nDone. layout.json saved.');
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
