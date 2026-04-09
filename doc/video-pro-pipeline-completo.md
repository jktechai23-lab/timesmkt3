# Video Pro — Pipeline Completo

**timesmkt3 v4.4.4** — Documentacao tecnica do pipeline de video profissional.

---

## Visao Geral

O Video Pro gera videos de 30-60s com 25-50 cortes cinematograficos, narracao sincronizada e efeitos visuais. O pipeline tem **6 fases** executadas sequencialmente pelo worker.

```
Fase 1    → Narracao (TTS — Fish Audio, voz Bella default)
Fase 1.5  → Timing do audio (ffprobe)
Fase 1.6  → Diretor de Fotografia (escolhe preset de estilo + tipografia)
Fase 2    → Scene Plan — 4 sub-fases (A: Analise, B: EDL, C: Assets, D: Motion)
Fase 2.5  → Validacao + auto-fixes (avisa fallbacks)
Fase 3    → Render (Remotion ou FFmpeg)
```

---

## Fase 1: Narracao

Gera audio de voz via TTS (Text-to-Speech).

**Providers disponiveis:**
- `fish` — Fish Audio, voz Bella (DEFAULT)
- `elevenlabs` — vozes premium (rachel, bella, domi, antoni, josh, arnold)
- `openai` — fallback
- `auto` — detecta o melhor disponivel

**Voz padrao:** Bella

**Processo:**
1. Claude gera o roteiro de narracao (50-60s, pt-BR)
2. Script enviado ao TTS provider
3. Audio salvo em `{output_dir}/audio/{task_name}_video_01_narration.mp3`
4. Se audio ja existe de run anterior, pula esta fase

**Fallback:** Se o provider principal falhar, tenta o proximo disponivel. O bot avisa no Telegram quando fallback e usado.

---

## Fase 1.5: Timing do Audio

Analisa o audio com `ffprobe` para sincronizar cenas.

**Calculo:**
- Extrai duracao total do audio (ex: 69.7s)
- `video_length = ceil(audio_duration) + 3s` (3s de hold silencioso no final para CTA)
- Distribui sentencas proporcionalmente: ~2.5 palavras/segundo em pt-BR

**Saida:** `{output_dir}/audio/{task_name}_video_01_timing.json`

---

## Fase 1.6: Diretor de Fotografia

Um agente Claude (Opus ou Sonnet) define toda a linguagem visual ANTES da edicao.

**Decisoes que toma:**
1. **Preset de estilo** (1 dos 12 disponiveis — ver secao abaixo)
2. **Paleta de cores** — primary, secondary, accent, background
3. **Tipografia** — fonte de titulo, corpo, pesos (auto / serif / sans / condensed / mono)
4. **Shot-by-shot** — para cada segmento de narracao:
   - Qual imagem usar
   - Enquadramento (close-up, medium, wide)
   - Posicao do rosto (para evitar texto em cima)
   - Movimento de camera (qual dos 12 tipos)
   - Texto overlay (max 6 palavras)

**Saida:** `{output_dir}/video/photography_plan.json`

**Fallback:** Se timeout (>600s), gera plano automatico com assets locais. **O bot avisa no Telegram:** "Dir. Foto timeout — usando plano fallback"

---

## Fase 2: Scene Plan (Plano de Edicao)

O agente Claude cria o **Edit Decision List** com 25-50 cortes em 4 sub-fases:

### Fase A — Analise e Roteiro
- Le: `brand_identity.md`, `product_campaign.md`, `creative_brief.json`
- Escolhe framework narrativo: AIDA, PAS, Hero's Journey, Before/After, Edu-Tainment
- Define mood: energetico, lifestyle, premium, emocional, festivo
- Calcula budget de cortes baseado no mood

### Fase B — EDL (Edit Decision List)
Cria 25-50 cortes respeitando budget por mood:

| Mood | Cortes/60s | Duracao media |
|------|-----------|---------------|
| energetico | 30-50 | 1-2s |
| lifestyle | 17-30 | 2-3.5s |
| premium | 12-20 | 3-5s |
| emocional | 10-16 | 4-6s |

### Fase C — Atribuicao de Assets
- Atribui imagens aos cortes
- Reuso criativo: mesma imagem + crop diferente + motion diferente = parece diferente
- Max 5 usos por imagem
- Se template ativo: atribui visual_type (chart/text_card/list/split/photo) por cena

### Fase D — Motion e Pos-Producao
Para cada corte define:
- **Motion** (1 dos 12 tipos — zoom_in, pan_right, push-in, etc.)
- **Animacao de texto** (1 dos 9 tipos — punch-in, per-word, typewriter, etc.)
- **Transicao** (cut / crossfade / fade_black)
- **Overlay** (dark / warm / cool / sepia + opacidade)
- **Tipo visual** (photo / chart / text_card / list / split)

### Regras obrigatorias (rejeita se violar):

- NUNCA mesmo motion em 2 cortes consecutivos
- NUNCA mesma posicao de texto em 3 cortes consecutivos
- **Primeiro corte <= 1.5s com texto GRANDE (120-140px, bold, impactante)**
- Ultimo corte >= 3s (CTA forte e claro) + 3s hold silencioso depois
- Cortes < 0.8s: sem texto
- **Cortes com texto >= 2.0s** (minimo para leitura confortavel)
- Max 6 palavras por text_overlay
- Soma das duracoes = video_length (tolerancia +-2s)

**Saida:** `{output_dir}/video/{task_name}_video_01[_template]_scene_plan_motion.json`

---

## Fase 2.5: Validacao e Auto-Fixes

Correcoes automaticas aplicadas ao scene plan:

| Regra | O que faz |
|-------|-----------|
| Carousel em `/ads/` | Substitui por foto raw |
| Motion repetido | Troca 2o consecutivo |
| Posicao texto 3x | Troca 3a consecutiva |
| Duracao < video_length | Estende ultimo corte |
| Font size < minimo | Forca 80px (body), 96px (CTA), 120px (hook) |
| Texto > 6 palavras | Trunca |
| Template + image_has_text | Forca texto overlay (6 primeiras palavras da narracao) |
| Narracao ausente | Adiciona campo vazio |

**Avisos de fallback no Telegram:**
- "Dir. Foto timeout — usando plano fallback"
- "Remotion falhou — usando FFmpeg"

---

## Movimentos de Camera (12 tipos)

| Motion | Efeito | Quando usar |
|--------|--------|-------------|
| `zoom_in` | Aproximacao gradual | Revelacao, intimidade |
| `zoom_out` | Afastamento gradual | Contexto, expansao |
| `pan_right` | Horizontal → | Descoberta, progresso |
| `pan_left` | Horizontal ← | Reflexao, retorno |
| `push-in` | Zoom rapido (spring) | Hook, impacto |
| `pull-out` | Zoom rapido reverso | Revelacao dramatica |
| `drift` | Oscilacao sinusoidal | Conexao emocional |
| `parallax-zoom` | Zoom + drift vertical | Destaque de beneficio |
| `breathe` | Pulsacao sutil (1.02x) | CTA, contemplacao |
| `ken-burns-in` | Pan + zoom lento | Fotos premium |
| `ken-burns-out` | Pan reverso + zoom out | Nostalgia, flashback |
| `tilt-shift` | Zoom + rotacao leve | Detalhe de produto |

**Intensidades:** aggressive (1.0→1.20), moderate (1.0→1.12), subtle (1.0→1.06), static (sem movimento)

---

## Animacoes de Texto (9 tipos)

| Animacao | Efeito | Uso |
|----------|--------|-----|
| `punch-in` | Palavras entram com impacto | Hook, urgencia |
| `per-word` | Palavra por palavra | Storytelling |
| `blur-in` | Desfoca e foca | Revelacao |
| `slide-up` | Sobe de baixo | Padrao |
| `typewriter` | Caractere por caractere | Dados, numeros |
| `bounce-in` | Palavras tremem | CTA, celebracao |
| `scale-up` | Cresce do centro | Destaque |
| `fade` | Fade simples | Premium |
| `split-lines` | Linhas aparecem individualmente | Listas |

---

## Transicoes

| Transicao | Duracao | Frequencia |
|-----------|---------|-----------|
| `cut` | 0s | 80-90% em energetico |
| `crossfade` | 0.3-0.5s | 60%+ em premium |
| `fade_black` | 0.4-1.0s | Entre secoes narrativas |

---

## 12 Presets de Estilo Visual

Cada preset define cores, fontes, motion, audio e mood. O Diretor de Fotografia escolhe 1 na Fase 1.6.

### 1. inema_hightech (PADRAO)
**Para:** Tech, IA, automacao, INEMA
**Cores:** Cyan #0099FF, green #00FF88, gold #FFD700, bg #080C14
**Fontes:** Space Grotesk 800, Oswald 900 CAPS
**Motion:** push-in agressivo, parallax-zoom, zoom_in tech
**Audio:** Synthwave/electronic 110-130 BPM

### 2. Neon Futurista
**Para:** Tech, startups, inovacao digital
**Cores:** Cyan #00E5FF, neon green #39FF14, violet #7B2FFF, bg #0D0D0D
**Fontes:** Space Grotesk 800 CAPS, JetBrains Mono
**Motion:** push-in agressivo, parallax-zoom
**Audio:** Synthwave 110-130 BPM
**Ref:** MasterClass, Notion

### 3. Premium Minimal
**Para:** Luxo, moda, joias, produtos premium
**Cores:** #FFFFFF, #1A1A1A, gold #C9A96E
**Fontes:** Playfair Display 700, Inter 300 light
**Motion:** ken-burns sutil, drift sutil, NUNCA agressivo
**Audio:** Piano + strings, 60-80 BPM
**Ref:** Cartier, Rolex, Apple

### 4. Energetico
**Para:** Fitness, esportes, eventos, juventude
**Cores:** Orange-red #FF4500, yellow #FFD700, neon green #00FF88
**Fontes:** Oswald 800 CAPS, Bebas Neue
**Motion:** push-in agressivo, zoom_in agressivo
**Audio:** EDM/trap 120-145 BPM
**Ref:** Nike, Gatorade, Red Bull

### 5. Emocional Cinematico
**Para:** Familia, saude, causas sociais, datas comemorativas
**Cores:** Warm white #FFF5E1, brown #2C1810, earth #D4956A
**Fontes:** Lora 700, Inter 400
**Motion:** zoom_in sutil, drift sutil, NUNCA agressivo
**Audio:** Piano, folk acustico, 70-90 BPM
**Ref:** Dove, Airbnb

### 6. Corporate Clean
**Para:** B2B, SaaS, LinkedIn, apresentacoes corporativas
**Cores:** Blue #0066CC, white, green #00B894
**Fontes:** Inter 700, Helvetica Neue Bold
**Motion:** zoom_in sutil, pan_right moderado
**Audio:** Ambient corporativo, 80-100 BPM
**Ref:** Salesforce, HubSpot, Slack

### 7. Streetwear Urban
**Para:** Moda urbana, TikTok, musica, 18-30 anos
**Cores:** Black, white, neon pink #FF3366, acid green #00FFAA
**Fontes:** Archivo Black 900, Druk Wide Bold CAPS
**Motion:** push-in agressivo, movimentos abruptos
**Audio:** Trap/drill, 130-150 BPM
**Ref:** Supreme, Off-White, Nike SNKRS

### 8. Nature Organic
**Para:** Sustentabilidade, wellness, alimentos naturais, yoga
**Cores:** Forest green #2D5016, earth #8B6F47, light green #A8C686
**Fontes:** DM Serif Display, Libre Baskerville, Nunito
**Motion:** ken-burns moderado, drift sutil
**Audio:** Acustico, folk, sons da natureza, 70-90 BPM
**Ref:** Aesop, Natura, Lush

### 9. Retro Vintage
**Para:** Nostalgia, artesanal, cerveja craft, barbearias
**Cores:** Burnt orange #C75B12, dark brown #2B1810, vintage yellow #F4D03F
**Fontes:** Abril Fatface, Playfair Display 900, Courier Prime
**Motion:** ken-burns moderado, zoom_in sutil
**Audio:** Jazz, blues, vinyl, 70-95 BPM
**Efeito obrigatorio:** Film grain + sepia em 100% dos frames
**Ref:** Jack Daniel's, Levi's, Harley-Davidson

### 10. Bold Pop
**Para:** Promocoes, Black Friday, e-commerce, CTAs
**Cores:** Red-pink #FF0055, yellow #FFD600, green #00C853
**Fontes:** Montserrat 900 Black CAPS, Poppins 700
**Motion:** push-in moderado, breathe para CTA
**Audio:** Pop comercial, jingle, 100-120 BPM
**Ref:** McDonald's, Amazon, Magazine Luiza

### 11. Dark Dramatic
**Para:** Thriller, perfume, bebidas premium, marcas de poder
**Cores:** Black #0D0D0D, dark blue #1A1A2E, blood red #8B0000
**Fontes:** Cinzel 700, Bodoni Moda 700, Inter 300
**Motion:** zoom_in lento e sutil, static dominante
**Audio:** Drone/ambient, percussao tribal, 60-80 BPM
**Ref:** Tom Ford, Dior Sauvage, Hennessy

### 12. Playful Colorful
**Para:** Kids, games, apps infantis, pets
**Cores:** Coral #FF6B6B, turquoise #4ECDC4, yellow #FFE66D
**Fontes:** Fredoka One, Baloo 2 800, Nunito 600
**Motion:** zoom_in moderado, bounce, breathe
**Audio:** Ukulele, glockenspiel, 100-120 BPM
**Ref:** Duolingo, LEGO, Headspace Kids

### 13. Editorial Documentary
**Para:** Jornalismo, documentarios, educacao, case studies
**Cores:** #1A1A1A, #F5F5F5, blue-gray #2C3E50, red accent #E74C3C
**Fontes:** Source Serif Pro 700, Merriweather 700, Inter 400
**Motion:** ken-burns moderado, pan_right moderado
**Audio:** Ambient, piano minimal, 70-90 BPM
**Ref:** NYT, Bloomberg, Netflix docs, TED

---

## Templates (Distribuicao de visual_type)

Cada template define a proporcao de tipos visuais no video. Sao 5 templates disponiveis.

### `auto` (padrao)
Todas as cenas sao `photo` com text overlay. Agente tem liberdade total. Comportamento classico do Video Pro.

### `data_story` — Dados como protagonista
| visual_type | % | Uso |
|-------------|---|-----|
| `chart` | ~60% | Graficos bar/line/pie para cada dado mencionado |
| `text_card` | ~20% | Insights-chave, frases de impacto |
| `photo` | ~20% | Hook, transicoes, CTA |

**Estrutura tipo:** hook (photo) → dado 1 (chart) → insight (text_card) → dado 2 (chart) → comparacao (chart) → CTA (photo)
**Regra critica:** Toda vez que a narracao menciona numero, porcentagem ou estatistica, a cena DEVE ser `chart` com os dados reais.

### `explainer` — Explicar conceitos
| visual_type | % | Uso |
|-------------|---|-----|
| `list` + `text_card` | ~40% | Passos, definicoes, pontos-chave |
| `photo` | ~30% | Contexto, exemplos, lifestyle |
| `chart` | ~30% | Dados de suporte |

**Estrutura tipo:** hook (photo) → problema (text_card) → passo 1 (list) → evidencia (chart) → passo 2 (list) → beneficio (text_card) → CTA (photo)

### `carousel_narrativo` — Narrativa visual
| visual_type | % | Uso |
|-------------|---|-----|
| `text_card` | ~50% | Texto grande de impacto, cada card = 1 afirmacao |
| `photo` | ~30% | Imagens emocionais, produto |
| `chart` | ~20% | Dados que sustentam a narrativa |

**Estrutura tipo:** hook (text_card) → contexto (photo) → ponto 1 (text_card) → evidencia (chart) → ponto 2 (text_card) → CTA (text_card)

### `brand_film` — Cinematografico
| visual_type | % | Uso |
|-------------|---|-----|
| `photo` | ~70% | Fotografia cinematografica com motion variado |
| `text_card` | ~20% | Momentos de texto minimalista e elegante |
| `chart` | ~10% | Apenas quando dado critico e narrado |

**Estrutura tipo:** hook (photo) → sequencia (photo x 4-6) → insight (text_card) → dado (chart) → sequencia (photo x 3-4) → CTA (text_card)

---

## 5 Tipos Visuais (visual_type)

### `photo` (padrao)
Foto + text overlay (ASS subtitle) + camera motion.
- **Campos:** `image`, `motion`, `text_overlay`, `text_layout`
- **Motion:** Um dos 12 tipos (zoom_in, pan_right, push-in, etc.)
- **Animacao texto:** Um dos 9 tipos (punch-in, per-word, fade, etc.)
- **Transicao:** cut / crossfade / fade_black
- Segue todas as regras de posicao e tipografia

### `chart` — Grafico de dados
Renderizado como PNG via Playwright + Chart.js. Sem ASS subtitle.
- **Campos:** `chart_type` (bar/line/pie/donut/area), `chart_title`, `chart_data`
- **chart_data:** array de `{label, value, color?}`
- **Sem motion, sem image** — imagem gerada automaticamente
- **Quando usar:** narracao menciona numero, porcentagem, estatistica

### `text_card` — Card tipografico
Texto grande sobre fundo estilizado. Sem ASS subtitle.
- **Campos:** `card_title`, `card_body`, `card_bg`, `card_accent`
- **Design:** barra decorativa accent + titulo DM Serif + corpo Lora
- **Sem motion, sem image**
- **Quando usar:** frases de impacto, citacoes, definicoes, insights

### `list` — Lista de itens
Itens numerados ou com bullets. Sem ASS subtitle.
- **Campos:** `list_title`, `list_items`, `list_numbered`
- **Design:** bullets ou numeros em cor accent
- **Sem motion, sem image**
- **Quando usar:** passos, features, checklist, processos

### `split` — Comparacao lado a lado
Duas imagens com labels. Sem ASS subtitle.
- **Campos:** `split_left`, `split_right`, `split_label_left`, `split_label_right`
- **Design:** divisor vertical em accent, labels Oswald CAPS
- **Sem motion**
- **Quando usar:** antes/depois, comparacoes, contrastes

---

## Renderizacao

### Escolha do renderer:
- **Se scene plan tem visual_types (chart/text_card/list/split)** → FFmpeg (obrigatorio)
- **Se so photo** → Remotion (com fallback para FFmpeg)
- **Se Remotion falhar** → FFmpeg automatico + aviso no Telegram

### Pipeline FFmpeg:
1. Pre-renderiza visual_types para PNG (Playwright + Chart.js)
2. Para cada cena photo: aplica motion (zoompan), fade in/out, background band
3. Para cada cena non-photo: usa PNG gerado, sem motion, sem ASS subtitle
4. Concatena todos os segmentos
5. Aplica ASS subtitles (SOMENTE sobre fotos)
6. Mixa narracao + musica de fundo

### Pipeline Remotion:
1. Scene plan passado como props ao componente React
2. DynamicScene.tsx renderiza cada cena com animacoes React
3. Suporta animacoes de texto, camera motion, transicoes
4. NAO suporta chart/text_card/list (futuro)

---

## Fonte de Imagens

| Fonte | Descricao |
|-------|-----------|
| `brand` | Imagens do `{project_dir}/assets/` (default) |
| `api` | Gera via IA (KIE, Pollinations, etc.) |
| `folder` | Pasta customizada |
| `screenshot` | Capturas de sites |
| `free` | Stock gratuito (Pexels, Unsplash) |
| `solid` | Sem imagens, fundo solido + tipografia |

---

## Opcoes de Tipografia

| Opcao | Fontes | Uso |
|-------|--------|-----|
| `auto` | Definida pelo preset de estilo (default) |  |
| `serif` | Lora, DM Serif Display | Editorial, premium |
| `sans` | Montserrat, Inter | Corporate, moderno |
| `condensed` | Oswald, Bebas Neue | Urgencia, impacto |
| `mono` | JetBrains Mono, Space Grotesk | Tech, dados |

---

## CTA Final

O CTA no final do video deve ser:
- **Forte e claro** — mensagem direta de acao
- **Texto grande** (96-120px)
- **Duracao >= 3s** com o CTA visivel
- **+ 3s de hold silencioso** depois (narration: "") para o espectador absorver
- **Total:** ~6s de presenca do CTA no final

---

## Como usar no Telegram

**Campanha nova com template:**
```
quero um video pro sobre automacoes com IA, template data_story
```

**Rerun com template:**
```
/rerun c49 3 pro data_story
/rerun c49 video pro explainer
/rerun c49 3 pro template carousel_narrativo
```

**Templates disponiveis:**
`auto`, `data_story`, `explainer`, `carousel_narrativo`, `brand_film`

**Opcoes no briefing:**
- Estilo: inema_hightech / neon_futurista / premium_minimal / energetico / emocional / corporate / streetwear / nature / retro / bold_pop / dark_dramatic / playful / editorial
- Tipografia: auto / serif / sans / condensed / mono
- Template: auto / data_story / explainer / carousel_narrativo / brand_film
- Narrador: bella / rachel / domi / antoni / josh / arnold
- TTS: auto / elevenlabs / fish / openai

---

## Arquivos do Pipeline

| Arquivo | Funcao |
|---------|--------|
| `pipeline/worker-video-pro.js` | Orquestrador das 6 fases |
| `pipeline/render-video-ffmpeg.js` | Renderer FFmpeg |
| `pipeline/render-video.js` | Dispatcher (escolhe renderer) |
| `pipeline/render-visual-png.js` | Gera PNGs de chart/text_card/list/split |
| `pipeline/video-audio.js` | TTS providers (fish, elevenlabs, openai) |
| `skills/video-editor-agent/SKILL.md` | Spec do agente editor (sub-fases A/B/C/D) |
| `skills/video-art-direction/SKILL.md` | 12+ presets visuais |
| `skills/photography-director/SKILL.md` | Spec do diretor de foto |
| `remotion-ad/src/DynamicAd.tsx` | Composicao Remotion |
| `remotion-ad/src/scenes/DynamicScene.tsx` | Renderer por cena |

---

*Documentacao atualizada em 2026-04-08 — timesmkt3 v4.4.4*
