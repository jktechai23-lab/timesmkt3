#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── SETUP ───────────────────────────────────────────────────────────────────

const CAMPAIGN = 'c0100-dia_das_maes_2026';
const BASE     = `/home/nmaldaner/projetos/timesmkt3/prj/inema/outputs/${CAMPAIGN}`;
const ADS_DIR  = `${BASE}/ads`;
const IMGS_DIR = `${BASE}/imgs`;

fs.mkdirSync(ADS_DIR, { recursive: true });

function ip(n) {
  return `${IMGS_DIR}/${CAMPAIGN}_generated_${String(n).padStart(2,'0')}_carousel_1080x1080.jpg`;
}

// ─── SHARED BASE CSS ─────────────────────────────────────────────────────────

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1080px;overflow:hidden;background:#0D1826;}
.slide{position:relative;width:1080px;height:1080px;overflow:hidden;}
.bg-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(0.85) contrast(1.08) saturate(1.18);}
.overlay{position:absolute;inset:0;}
.brand-tag{position:absolute;bottom:52px;left:64px;font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;color:rgba(245,239,230,0.35);letter-spacing:0.22em;text-transform:uppercase;}
.slide-num{position:absolute;bottom:52px;right:64px;font-family:'Inter',sans-serif;font-size:15px;font-weight:500;color:rgba(245,166,35,0.5);letter-spacing:0.08em;}
@keyframes fadeUp{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:translateY(0);}}
@keyframes scaleIn{from{opacity:0;transform:scale(0.9);}to{opacity:1;transform:scale(1);}}
`;

// ─── SLIDE GENERATORS ────────────────────────────────────────────────────────

// Type: top — headline at top-left with vertical accent bar
function makeTopSlide(s) {
  const imgSrc   = ip(s.img);
  const fFamily  = s.serif ? "'Playfair Display',serif" : "'Space Grotesk',sans-serif";
  const fStyle   = s.italic ? 'italic' : 'normal';
  const fWeight  = s.fontWeight || 800;
  const tColor   = s.textColor || '#F5EFE6';
  const aColor   = s.accentColor || '#F5A623';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num      = String(s.n).padStart(2,'0');

  const subHtml = s.subtext
    ? `<p class="sub">${s.subtext.split('\n').map(l=>`<span style="display:block">${l}</span>`).join('')}</p>`
    : '';
  const subCSS = s.subtext
    ? `.sub{font-family:'Playfair Display',serif;font-size:${Math.round(s.fontSize*0.42)}px;font-style:italic;font-weight:400;line-height:1.42;color:rgba(245,239,230,0.8);text-align:left;max-width:840px;margin-top:24px;text-shadow:0 2px 14px rgba(0,0,0,0.55);}`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;padding:72px 80px 0;animation:fadeUp 0.5s ease both;}
.accent-bar{width:5px;height:72px;background:${aColor};border-radius:3px;margin-bottom:24px;}
.hl{font-family:${fFamily};font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.12;color:${tColor};text-align:left;max-width:900px;text-shadow:0 3px 24px rgba(0,0,0,0.72),0 0 64px rgba(0,0,0,0.4);letter-spacing:-0.01em;}
${subCSS}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="accent-bar"></div>
    <div class="hl">${linesHtml}</div>
    ${subHtml}
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: center — text centered, editorial style
function makeCenterSlide(s) {
  const imgSrc  = ip(s.img);
  const fFamily = s.serif ? "'Playfair Display',serif" : "'Space Grotesk',sans-serif";
  const fStyle  = s.italic ? 'italic' : 'normal';
  const fWeight = s.fontWeight || 800;
  const tColor  = s.textColor || '#F5EFE6';
  const aColor  = s.accentColor || '#F5A623';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 80px 180px;animation:fadeUp 0.5s ease both;}
.bar-t{width:72px;height:3px;background:${aColor};border-radius:2px;margin-bottom:28px;}
.bar-b{width:72px;height:3px;background:${aColor};border-radius:2px;margin-top:28px;opacity:0.45;}
.hl{font-family:${fFamily};font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.14;color:${tColor};text-align:center;max-width:920px;text-shadow:0 3px 24px rgba(0,0,0,0.72),0 0 64px rgba(0,0,0,0.4);}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="bar-t"></div>
    <div class="hl">${linesHtml}</div>
    <div class="bar-b"></div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: topsub — large bold headline + italic subtext below the accent line
function makeTopSubSlide(s) {
  const imgSrc  = ip(s.img);
  const aColor  = s.accentColor || '#F5A623';
  const tColor  = s.textColor || '#F5EFE6';
  const num     = String(s.n).padStart(2,'0');
  const hlLines = s.headline.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const subLines = s.sub.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;padding:68px 80px 0;animation:fadeUp 0.5s ease both;}
.eyebrow{font-family:'Inter',sans-serif;font-size:20px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${aColor};opacity:0.9;margin-bottom:18px;}
.hl{font-family:'Space Grotesk',sans-serif;font-size:${s.fontSize}px;font-weight:800;line-height:1.05;color:${tColor};text-align:left;max-width:940px;text-shadow:0 3px 24px rgba(0,0,0,0.7),0 0 60px rgba(0,0,0,0.38);letter-spacing:-0.02em;}
.rule{width:96px;height:4px;background:${aColor};border-radius:2px;margin:28px 0 24px;}
.sub{font-family:'Playfair Display',serif;font-size:${s.subSize || 52}px;font-style:italic;font-weight:400;line-height:1.3;color:rgba(245,239,230,0.82);text-align:left;max-width:880px;text-shadow:0 2px 16px rgba(0,0,0,0.6);}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="eyebrow">${s.eyebrow || 'Dia das Mães 2026'}</div>
    <div class="hl">${hlLines}</div>
    <div class="rule"></div>
    <div class="sub">${subLines}</div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: brand — INEMA badge + centered text with brand identity
function makeBrandSlide(s) {
  const imgSrc  = ip(s.img);
  const aColor  = '#F5A623';
  const cColor  = '#00B4D8';
  const num     = String(s.n).padStart(2,'0');
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.top-bar{position:absolute;top:0;left:0;right:0;height:80px;background:rgba(26,39,68,0.92);backdrop-filter:blur(8px);display:flex;align-items:center;padding:0 64px;gap:14px;}
.brand-logo{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:800;color:#F5EFE6;letter-spacing:0.12em;text-transform:uppercase;}
.brand-dot{width:8px;height:8px;border-radius:50%;background:${cColor};box-shadow:0 0 12px rgba(0,180,216,0.7);}
.brand-sub{font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:rgba(245,239,230,0.5);letter-spacing:0.1em;text-transform:uppercase;}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:100px 80px 160px;animation:fadeUp 0.5s ease both;}
.tag{display:inline-block;background:rgba(0,180,216,0.18);border:1px solid rgba(0,180,216,0.45);border-radius:9999px;padding:8px 24px;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:${cColor};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:28px;}
.hl{font-family:'Space Grotesk',sans-serif;font-size:${s.fontSize}px;font-weight:800;line-height:1.1;color:#F5EFE6;text-align:center;max-width:900px;text-shadow:0 3px 24px rgba(0,0,0,0.72);letter-spacing:-0.015em;}
.bar{width:80px;height:4px;background:${aColor};border-radius:2px;margin-top:28px;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="top-bar">
    <span class="brand-logo">INEMA</span>
    <div class="brand-dot"></div>
    <span class="brand-sub">A Primeira Professora</span>
  </div>
  <div class="content">
    <div class="tag">✦ Dia das Mães 2026</div>
    <div class="hl">${linesHtml}</div>
    <div class="bar"></div>
  </div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: pills — headline + pill badges for 3 benefits
function makePillsSlide(s) {
  const imgSrc  = ip(s.img);
  const aColor  = '#F5A623';
  const cColor  = '#00B4D8';
  const nColor  = '#1A2744';
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;padding:72px 80px 0;animation:fadeUp 0.5s ease both;}
.accent-bar{width:5px;height:64px;background:${cColor};border-radius:3px;margin-bottom:22px;}
.hl{font-family:'Space Grotesk',sans-serif;font-size:${s.fontSize}px;font-weight:800;line-height:1.1;color:#F5EFE6;text-align:left;max-width:900px;text-shadow:0 3px 24px rgba(0,0,0,0.72);letter-spacing:-0.015em;}
.pills{display:flex;flex-direction:column;gap:16px;margin-top:36px;}
.pill{display:inline-flex;align-items:center;gap:12px;background:rgba(26,39,68,0.72);backdrop-filter:blur(12px);border:1px solid rgba(0,180,216,0.35);border-radius:9999px;padding:14px 32px;width:fit-content;}
.pill-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.pill-text{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#F5EFE6;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="accent-bar"></div>
    <div class="hl">${s.headline}</div>
    <div class="pills">
      <div class="pill"><div class="pill-dot" style="background:${aColor};box-shadow:0 0 10px rgba(245,166,35,0.6);"></div><span class="pill-text">Prática.</span></div>
      <div class="pill"><div class="pill-dot" style="background:${cColor};box-shadow:0 0 10px rgba(0,180,216,0.6);"></div><span class="pill-text">Acessível.</span></div>
      <div class="pill"><div class="pill-dot" style="background:#00FF88;box-shadow:0 0 10px rgba(0,255,136,0.6);"></div><span class="pill-text">Gratuita.</span></div>
    </div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: stat — large number + supporting context text
function makeStatSlide(s) {
  const imgSrc  = ip(s.img);
  const num     = String(s.n).padStart(2,'0');
  const ctxHtml = s.context.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:80px 80px 0;animation:fadeUp 0.5s ease both;}
.label{font-family:'Inter',sans-serif;font-size:20px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:rgba(245,166,35,0.75);margin-bottom:12px;}
.stat{font-family:'Space Grotesk',sans-serif;font-size:148px;font-weight:800;line-height:1.0;color:#F5A623;text-shadow:0 4px 32px rgba(245,166,35,0.32),0 2px 60px rgba(0,0,0,0.65);letter-spacing:-0.04em;}
.ctx{font-family:'Playfair Display',serif;font-size:52px;font-style:italic;font-weight:400;line-height:1.3;color:rgba(245,239,230,0.88);text-align:center;max-width:720px;margin-top:10px;text-shadow:0 2px 16px rgba(0,0,0,0.65);}
.rule{width:100px;height:4px;background:#F5A623;border-radius:2px;margin-top:32px;opacity:0.7;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="label">comunidade INEMA</div>
    <div class="stat">${s.stat}</div>
    <div class="ctx">${ctxHtml}</div>
    <div class="rule"></div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: left — editorial left-aligned with vertical accent bar
function makeLeftSlide(s) {
  const imgSrc  = ip(s.img);
  const fFamily = s.serif ? "'Playfair Display',serif" : "'Space Grotesk',sans-serif";
  const fStyle  = s.italic ? 'italic' : 'normal';
  const fWeight = s.fontWeight || 800;
  const tColor  = s.textColor || '#F5EFE6';
  const aColor  = s.accentColor || '#F5A623';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:row;align-items:flex-start;padding:80px;}
.v-bar{width:5px;min-height:96px;background:${aColor};border-radius:4px;margin-right:28px;flex-shrink:0;margin-top:2px;}
.text-col{display:flex;flex-direction:column;animation:fadeUp 0.5s ease both;}
.hl{font-family:${fFamily};font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.12;color:${tColor};text-align:left;max-width:870px;text-shadow:0 3px 24px rgba(0,0,0,0.72),0 0 60px rgba(0,0,0,0.4);}
.sub{font-family:'Inter',sans-serif;font-size:28px;font-weight:500;color:rgba(245,239,230,0.6);margin-top:20px;letter-spacing:0.04em;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}">
  <div class="overlay" style="background:${s.overlay}"></div>
  <div class="content">
    <div class="v-bar"></div>
    <div class="text-col">
      <div class="hl">${linesHtml}</div>
      ${s.sub ? `<div class="sub">${s.sub}</div>` : ''}
    </div>
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: gradient — pure gradient background, no photo, pico emocional
function makeGradientSlide(s) {
  const fFamily = s.serif ? "'Playfair Display',serif" : "'Space Grotesk',sans-serif";
  const fStyle  = s.italic ? 'italic' : 'normal';
  const fWeight = s.fontWeight || 800;
  const tColor  = s.textColor || '#F5EFE6';
  const aColor  = s.accentColor || '#F5A623';
  const linesHtml = s.text.split('\n').map(l => `<span style="display:block">${l}</span>`).join('');
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
body{background:${s.bg};}
.slide-bg{position:absolute;inset:0;background:${s.bg};}
.bloom{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);width:680px;height:680px;background:radial-gradient(ellipse,rgba(245,166,35,0.14) 0%,transparent 68%);border-radius:50%;}
.noise{position:absolute;inset:0;opacity:0.035;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:200px;}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;animation:fadeUp 0.5s ease both;}
.eyebrow{font-family:'Inter',sans-serif;font-size:18px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:rgba(245,239,230,0.48);margin-bottom:24px;}
.bar{width:80px;height:4px;background:${aColor};border-radius:2px;margin-bottom:28px;}
.hl{font-family:${fFamily};font-size:${s.fontSize}px;font-style:${fStyle};font-weight:${fWeight};line-height:1.18;color:${tColor};text-align:center;max-width:880px;text-shadow:0 3px 20px rgba(0,0,0,0.28);}
.sub{font-family:'Playfair Display',serif;font-size:38px;font-style:italic;font-weight:400;color:rgba(245,239,230,0.6);text-align:center;margin-top:26px;line-height:1.4;}
.brand-tag{position:absolute;bottom:52px;left:64px;font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;color:rgba(245,239,230,0.35);letter-spacing:0.22em;text-transform:uppercase;}
.slide-num{position:absolute;bottom:52px;right:64px;font-family:'Inter',sans-serif;font-size:15px;font-weight:500;color:rgba(245,166,35,0.5);letter-spacing:0.08em;}
</style></head><body>
<div class="slide">
  <div class="slide-bg"></div>
  <div class="noise"></div>
  <div class="bloom"></div>
  <div class="content">
    <div class="eyebrow">Honre ela evoluindo</div>
    <div class="bar"></div>
    <div class="hl">${linesHtml}</div>
    ${s.sub ? `<p class="sub">${s.sub}</p>` : ''}
  </div>
  <div class="brand-tag">INEMA</div>
  <div class="slide-num">${num} / 15</div>
</div></body></html>`;
}

// Type: cta_image — CTA hero with image 15 as background
function makeCTASlide(s) {
  const imgSrc  = ip(s.img);
  const num     = String(s.n).padStart(2,'0');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;}
.eyebrow{font-family:'Inter',sans-serif;font-size:18px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:rgba(245,166,35,0.85);margin-bottom:14px;animation:fadeUp 0.4s ease both;}
.pre-head{font-family:'Playfair Display',serif;font-size:52px;font-style:italic;font-weight:700;color:#F5EFE6;line-height:1.2;text-align:center;text-shadow:0 3px 24px rgba(0,0,0,0.75);animation:fadeUp 0.5s ease both 0.06s;margin-bottom:18px;}
.divider{width:100px;height:4px;background:#F5A623;border-radius:2px;animation:scaleIn 0.4s ease both 0.12s;margin-bottom:16px;}
.brand-hero{font-family:'Space Grotesk',sans-serif;font-size:104px;font-weight:800;color:#F5EFE6;line-height:1.0;letter-spacing:-0.025em;text-shadow:0 0 60px rgba(245,239,230,0.18),0 4px 32px rgba(0,0,0,0.72);animation:scaleIn 0.55s ease both 0.18s;margin-bottom:6px;}
.brand-accent{color:#F5A623;}
.tagline{font-family:'Inter',sans-serif;font-size:22px;font-weight:500;color:rgba(245,239,230,0.52);letter-spacing:0.05em;animation:fadeUp 0.5s ease both 0.24s;margin-bottom:36px;}
.cta-pill{display:inline-block;background:rgba(245,166,35,0.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:2px solid rgba(245,166,35,0.5);border-radius:9999px;padding:18px 52px;font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#F5EFE6;letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 4px 28px rgba(245,166,35,0.22),0 8px 48px rgba(0,0,0,0.55);animation:scaleIn 0.5s ease both 0.32s;}
.url-hint{font-family:'Inter',sans-serif;font-size:20px;font-weight:400;color:rgba(245,239,230,0.38);margin-top:18px;letter-spacing:0.06em;animation:fadeUp 0.5s ease both 0.42s;}
</style></head><body>
<div class="slide">
  <img class="bg-img" src="file://${imgSrc}" style="filter:brightness(0.55) contrast(1.06) saturate(1.1);">
  <div class="overlay" style="background:linear-gradient(to bottom, rgba(26,39,68,0.55) 0%, rgba(26,39,68,0.75) 50%, rgba(26,39,68,0.92) 100%);"></div>
  <div class="content">
    <div class="eyebrow">Dia das Mães · 12 de Maio</div>
    <div class="pre-head">Honre o legado dela.</div>
    <div class="divider"></div>
    <div class="brand-hero">INEMA<span class="brand-accent">.</span>CLUB</div>
    <div class="tagline">Educação com IA. Gratuita. Para você.</div>
    <div class="cta-pill">Comece Grátis Agora</div>
    <div class="url-hint">inema.club</div>
  </div>
</div></body></html>`;
}

// ─── SLIDE DEFINITIONS ───────────────────────────────────────────────────────
// Source: narrative.json → carousel_texts[0-7], headlines, key_phrases
// All 15 images exist: file 01-15, no gaps

const SLIDES = [
  // 1 — HOOK: "Antes de qualquer professor — ela te ensinou a aprender."
  { n:1, img:1, type:'top',
    text:'Antes de qualquer professor —\nela te ensinou a aprender.',
    fontSize:88, italic:true, serif:true,
    overlay:'linear-gradient(to bottom, rgba(26,20,8,0.08) 0%, rgba(26,20,8,0.62) 55%, rgba(26,20,8,0.97) 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Hook — abertura emocional, mãe como primeira educadora'
  },

  // 2 — "Ela acreditou em você antes de todo mundo."
  { n:2, img:2, type:'top',
    text:'Ela acreditou em você\nantes de todo mundo.',
    fontSize:84, italic:true, serif:true,
    overlay:'linear-gradient(160deg, rgba(26,20,8,0.82) 0%, rgba(26,20,8,0.30) 42%, rgba(26,20,8,0.78) 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Confiança materna incondicional — fé que antecede tudo'
  },

  // 3 — "O mundo mudou. Você está preparado?" — tensão, cyan accent
  { n:3, img:3, type:'center',
    text:'O mundo mudou.\nVocê está preparado?',
    fontSize:96, italic:false, serif:false, fontWeight:800,
    overlay:'radial-gradient(ellipse at center, rgba(26,39,68,0.08) 0%, rgba(26,39,68,0.82) 100%)',
    accentColor:'#00B4D8', textColor:'#F5EFE6',
    concept:'Tensão — transição emocional: calor materno → urgência do mundo digital'
  },

  // 4 — "A maior homenagem / não vem embalada — vem em evolução."
  { n:4, img:4, type:'topsub',
    eyebrow:'Homenagem real',
    headline:'A maior homenagem\nque você pode dar',
    sub:'não vem embalada —\nvem em evolução.',
    fontSize:80, subSize:52,
    overlay:'linear-gradient(to bottom, rgba(26,20,8,0.14) 0%, rgba(26,20,8,0.72) 60%, rgba(26,20,8,0.97) 100%)',
    accentColor:'#F5A623',
    concept:'Virada — rejeição do presente físico, afirmação da evolução pessoal'
  },

  // 5 — "Gratidão que vira ação." — impacto máximo, display 120px
  { n:5, img:5, type:'center',
    text:'Gratidão\nque vira ação.',
    fontSize:112, italic:false, serif:false, fontWeight:800,
    overlay:'linear-gradient(to bottom, rgba(26,39,68,0.44) 0%, rgba(26,39,68,0.88) 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Pico filosófico — frase-chave da campanha, máximo impacto tipográfico'
  },

  // 6 — "O INEMA continua o que sua mãe começou." — brand badge
  { n:6, img:6, type:'brand',
    text:'O INEMA continua\no que sua mãe\ncomeçou.',
    fontSize:80,
    overlay:'linear-gradient(to bottom, rgba(26,39,68,0.72) 0%, rgba(26,39,68,0.25) 38%, rgba(26,39,68,0.78) 100%)',
    concept:'Introdução de marca — INEMA como continuação da educação materna'
  },

  // 7 — "Educação com IA. Prática. Acessível. Gratuita." — pills
  { n:7, img:7, type:'pills',
    headline:'Educação com IA.',
    fontSize:92,
    overlay:'linear-gradient(to bottom, rgba(26,39,68,0.18) 0%, rgba(26,39,68,0.78) 65%, rgba(26,39,68,0.97) 100%)',
    concept:'Benefícios — três pilares do INEMA como pill badges tech'
  },

  // 8 — "+500.000 pessoas. Conteúdo completo. Tudo de graça." — stat
  { n:8, img:8, type:'stat',
    stat:'+500K',
    context:'pessoas.\nConteúdo completo.\nTudo de graça.',
    overlay:'linear-gradient(to bottom, rgba(26,39,68,0.52) 0%, rgba(26,39,68,0.92) 100%)',
    concept:'Prova social — +500.000 pessoas, conteúdo completo gratuito'
  },

  // 9 — "Aprenda com IA. Por ela." — left editorial, cyan accent
  { n:9, img:9, type:'left',
    text:'Aprenda com IA.\nPor ela.',
    fontSize:88, italic:false, serif:false, fontWeight:800,
    overlay:'linear-gradient(135deg, rgba(26,39,68,0.88) 0%, rgba(26,39,68,0.32) 54%, rgba(26,39,68,0.72) 100%)',
    accentColor:'#00B4D8', textColor:'#F5EFE6',
    sub:'inema.club — gratuito, agora.',
    concept:'Síntese — IA + emoção materna, cyan tech accent, sub com URL'
  },

  // 10 — "Ela acreditou primeiro. Continue." — bold motivacional
  { n:10, img:10, type:'top',
    text:'Ela acreditou\nprimeiro. Continue.',
    fontSize:92, italic:false, serif:false, fontWeight:800,
    overlay:'linear-gradient(to bottom, rgba(14,22,38,0.15) 0%, rgba(14,22,38,0.65) 52%, rgba(14,22,38,0.97) 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Momentum — da confiança materna ao imperativo do crescimento'
  },

  // 11 — "O presente que não murcha." — poético, center
  { n:11, img:11, type:'center',
    text:'O presente\nque não murcha.',
    fontSize:100, italic:true, serif:true, fontWeight:700,
    overlay:'radial-gradient(ellipse at 50% 42%, rgba(26,20,8,0.04) 0%, rgba(26,20,8,0.84) 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Poético — o presente que não é físico; conhecimento como presente eterno'
  },

  // 12 — "Honre o que ela plantou em você." — left editorial, amber
  { n:12, img:12, type:'left',
    text:'Honre o que ela\nplantou em você.',
    fontSize:84, italic:true, serif:true, fontWeight:700,
    overlay:'linear-gradient(125deg, rgba(26,20,8,0.90) 0%, rgba(26,20,8,0.34) 54%, rgba(26,20,8,0.75) 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Raízes — a semente de aprendizado plantada pela mãe'
  },

  // 13 — "Sua evolução é a homenagem dela." — top, emotional peak
  { n:13, img:13, type:'top',
    text:'Sua evolução é\na homenagem dela.',
    fontSize:88, italic:true, serif:true,
    overlay:'linear-gradient(to bottom, rgba(14,22,38,0.22) 0%, rgba(14,22,38,0.68) 55%, rgba(14,22,38,0.97) 100%)',
    accentColor:'#00B4D8', textColor:'#F5EFE6',
    concept:'Pico emocional — evolução = homenagem, cyan accent para futuro'
  },

  // 14 — "O legado continua. De graça." — gradient slide, no photo
  { n:14, type:'gradient',
    text:'O legado continua.\nDe graça.',
    sub:'Porque ela ensinou que conhecimento não tem preço.',
    fontSize:88, italic:false, serif:false, fontWeight:800,
    bg:'linear-gradient(135deg, #0D1826 0%, #1A2744 40%, #142040 70%, #0A1020 100%)',
    accentColor:'#F5A623', textColor:'#F5EFE6',
    concept:'Pré-CTA — legado e gratuidade; fundo navy profundo sem foto'
  },

  // 15 — CTA: INEMA.CLUB hero com imagem 15 ao fundo
  { n:15, img:15, type:'cta',
    concept:'CTA — INEMA.CLUB em destaque máximo, inema.club URL, imagem 15 ao fundo com overlay navy'
  },
];

// ─── HTML DISPATCH ────────────────────────────────────────────────────────────

function generateHTML(s) {
  switch (s.type) {
    case 'top':      return makeTopSlide(s);
    case 'center':   return makeCenterSlide(s);
    case 'topsub':   return makeTopSubSlide(s);
    case 'brand':    return makeBrandSlide(s);
    case 'pills':    return makePillsSlide(s);
    case 'stat':     return makeStatSlide(s);
    case 'left':     return makeLeftSlide(s);
    case 'gradient': return makeGradientSlide(s);
    case 'cta':      return makeCTASlide(s);
    default: throw new Error('Unknown slide type: ' + s.type);
  }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎨 Rendering ${SLIDES.length} carousel slides — ${CAMPAIGN}\n`);

  const browser = await chromium.launch();
  const layoutData = {
    campaign: CAMPAIGN,
    campaign_theme: 'A Primeira Professora',
    generated_at: new Date().toISOString(),
    platform_targets: ['instagram', 'youtube', 'threads'],
    format: 'carousel',
    dimensions: '1080x1080',
    copy_source: 'narrative.json → carousel_texts, headlines, key_phrases',
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
    await page.goto('file://' + path.resolve(htmlFile), { waitUntil: 'networkidle' });

    // Wait for all <img> tags to be fully decoded (fix for broken placeholders)
    await page.evaluate(() => Promise.all(
      [...document.images].map(img =>
        (img.complete && img.naturalWidth > 0)
          ? null
          : new Promise(r => { img.onload = img.onerror = r; })
      )
    ));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);

    await page.screenshot({ path: pngFile });
    await page.close();

    console.log(`✓ Slide ${s.n}/15 → ${path.basename(pngFile)}`);

    const carouselText = s.type === 'cta'
      ? 'Honre o legado dela. Não pare de aprender. inema.club — comece grátis agora.'
      : s.type === 'topsub'
        ? `${s.headline.replace(/\n/g,' ')} — ${s.sub.replace(/\n/g,' ')}`
        : s.type === 'pills'
          ? `${s.headline} Prática. Acessível. Gratuita.`
          : s.type === 'stat'
            ? `${s.stat} ${(s.context||'').replace(/\n/g,' ')}`
            : s.type === 'brand'
              ? (s.text||'').replace(/\n/g,' ')
              : (s.text||'').replace(/\n/g,' ');

    const imagesUsed = s.img
      ? [`${CAMPAIGN}_generated_${String(s.img).padStart(2,'0')}_carousel_1080x1080.jpg`]
      : [];

    layoutData.slides.push({
      filename: path.basename(pngFile),
      html_source: path.basename(htmlFile),
      slide_number: s.n,
      layout_type: s.type,
      concept: s.concept,
      carousel_text: carouselText,
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
