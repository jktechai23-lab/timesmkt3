## Project Overview

**timesmkt3 v4.5.4** — INEMA Time de Agentes de Marketing. Sistema de automação de conteúdo social via Claude Code, construído no Antigravity IDE.

13+ agentes especializados coordenados por um bot em pipeline de 5 etapas. Cada agente roda como subprocesso `claude -p <prompt> --dangerously-skip-permissions` com acesso total a tools. A pasta `skills/` contém as **instruction specs** de cada agente (não são Claude Code skills — são specs operacionais).

Demo brand: Cold Brew Coffee Co. (`prj/coldbrew-coffee-co/`).

---

## Versionamento

Padrão: `timesmkt3 vMAJOR.RECURSO.BUG`

| Campo | Incrementar quando |
|---|---|
| `MAJOR` | Mudança de arquitetura ou redesign completo do fluxo |
| `RECURSO` | Novo agente, aprovação, provider ou feature |
| `BUG` | Correção de bug, ajuste de comportamento, fix de prompt |

**Regra crítica:** `BUG` acumula e **nunca zera quando RECURSO incrementa**. Só zera quando `MAJOR` incrementa.

Sempre atualizar a versão no topo deste arquivo e no `package.json`.

---

## Limitações ativas (não publicamos hoje)

**Stages 4 (plataformas) e 5 (distribuição) estão DESABILITADAS** globalmente. O sistema gera conteúdo até o vídeo (stage 3) e para — não posta nada nas redes nem faz upload pro Supabase.

| Bloqueio | Onde | Como reverter |
|---|---|---|
| Auto-advance do monitor para após stage 3 | `telegram/bot-monitor.js` — `MAX_AUTO_STAGE = 3` | Trocar pra `5` |
| `enqueueStage` recusa agentes de stage 4/5 | `pipeline/orchestrator.js` — `DISABLED_AGENTS` Set | Esvaziar o Set |

Comandos como `/rerun cXX plataformas` ou `/rerun cXX distribuicao` **não rodam** mesmo se chamados — orchestrator filtra os agentes bloqueados antes de enfileirar.

Quando voltar a publicar, mudar os 2 lugares acima.

---

## Estrutura de projetos

Projetos ficam em `prj/<slug>/` com `assets/`, `knowledge/`, `outputs/`. Todo payload precisa incluir `project_dir` (ex: `"project_dir": "prj/coldbrew-coffee-co"`).

---

## System Architecture

Pipeline de 5 etapas, cada uma com seu gate de aprovação:

1. **Estratégia & Narrativa** — Research → Diretor Criativo → Copywriter → [APROVAÇÃO 1]
2. **Imagens** — Ad Creative Designer → [APROVAÇÃO 2]
3. **Vídeo** — Video Quick (default) + Video Pro (sob demanda, independentes) → [APROVAÇÃO 3]
4. **Plataformas** — 6 agentes (só rodam as de `platform_targets`) → [APROVAÇÃO 4]
5. **Distribuição** — upload + agendar + publicar → [APROVAÇÃO 5]

**Componentes:**
- Bot (`telegram/bot.js`) — controlador; avança etapas após aprovação
- Orchestrator (`pipeline/orchestrator.js`) — enfileira jobs via `enqueueStage()`
- Worker (`pipeline/worker.js`) — executa agentes; emite `[STAGE1_DONE]`, `[STAGE2_IMAGE_READY]`, `[IMAGE_APPROVAL_NEEDED]`

**Modos de aprovação por etapa** (via `approval_modes` no payload): `humano` (padrão, aguarda confirmação), `auto` (avança direto), `agente` (Revisor decide).

**Gate interno de imagens vs. aprovação de stage:**
O worker emite `[IMAGE_APPROVAL_NEEDED]` após gerar imagens via API — gate **interno** que aguarda `imgs/approved.json` para seguir montando o ad HTML. O bot v3 escreve esse arquivo automaticamente. A aprovação real (humano/agente/auto) acontece no **gate de stage 2**, depois que `ad_creative_designer` + `copywriter_agent` completam. Os dois mecanismos são independentes.

---

## Orchestrator

Spec: `skills/orchestrator/SKILL.md`.

Não é agente — é coordenador Node.js. Aceita payload JSON com `task_name`, `task_date`, `project_dir`, `platform_targets` e skip flags. Enfileira na fila `ai-content-pipeline` (BullMQ). Logs em `<project_dir>/outputs/<task_name>_<date>/logs/`.

### Runtime

**Redis** via Docker local (`redis:alpine`, porta 6379, `--restart unless-stopped`). Se der `ECONNREFUSED 6379`:
```bash
docker start redis
```

**PM2** — bot e worker rodam via PM2. **Nunca deixar 2 instâncias do mesmo processo** (mensagens duplicadas, jobs 2x). Antes de iniciar, rodar `npx pm2 list`. Se já existe, usar `restart` em vez de `start`. Processos persistem via `pm2 save`.

```bash
npx pm2 restart bot worker    # após alterar bot.js ou worker.js
npx pm2 delete all            # emergência: limpa fantasmas
```

### Pipeline Commands

```bash
npm run pipeline:run                     # payload demo
npm run pipeline:run:payload '<json>'    # payload inline
```

### Skip Flags

| Flag | Efeito |
|---|---|
| `skip_research: true` | Pula Research; requer `<project_dir>/assets/<task_name>/` existente |
| `skip_image: true` | Pula Ad Creative Designer |
| `skip_video: true` | Pula Video Quick e Pro |

---

## Comando /import

Copia assets de múltiplas campanhas para uma pasta `imports/` central do projeto.

```
/import <campanhas> <origem> [modificador]
```

**Campanhas:** lista (`c55 c56`), range (`c55-c59`), ou `todos`.

**Origens:** `videos` (MP4 quick+pro), `ads` (PNG carousels), `imgs` (JPG gerados), `report` (pasta completa), `gatilhos` (pasta completa).

**Modificadores** (só para `report` / `gatilhos`): `videos` ou `ads`.

**Destino:** `prj/<projeto>/imports/{videos,ads}/` com prefixo da campanha.

Exemplos:
```
/import c55-c59 report
/import todos gatilhos videos
/import c56 gatilhos ads
```

Reimports sobrescrevem.

---

## Agents

Cada agente tem sua spec detalhada no respectivo `SKILL.md` — ler o SKILL.md para prompts, responsabilidades completas, outputs.

| # | Agente | Spec | Output principal |
|---|---|---|---|
| 0 | Creative Director | `skills/creative-director/SKILL.md` | `creative/creative_brief.{json,md}` (emite `[STAGE1_DONE]`) |
| 1 | Marketing Research | `skills/marketing-research-agent/SKILL.md` | `research_results.json`, `research_brief.md`, `interactive_report.html` (via Tavily SDK) |
| 2 | Ad Creative Designer | `skills/ad-creative-designer/SKILL.md` | `ads/{layout.json,ad.html,styles.css,instagram_ad.png}` (render Playwright 1080×1080) |
| 3a | Video Quick | `skills/video-editor-agent/SKILL.md` | `video/ad.mp4` (slideshow 10-20s, ffmpeg) |
| 3b | Video Pro | `skills/video-editor-agent/SKILL.md` (mode: pro) | `video/ad_pro.mp4` (30-60s, narração+música, Remotion) |
| 4 | Platform Agents (6x) | `doc/agentes-distribuicao.md` | `platforms/{instagram,youtube,tiktok,facebook,threads,linkedin}.{json,md}` |
| 5 | Distribution | `skills/distribution-agent/SKILL.md` | `media_urls.json` + `Publish <task_name> <date>.md` (upload Supabase, posta só se o Publish MD for referenciado pelo nome) |

**Art direction de vídeo:** `skills/video-art-direction/SKILL.md` provê 12 presets visuais (cinematic, editorial, bold, minimal, etc.) usados por Quick e Pro.

**Regra fixa de imagens geradas via API:** imagens de modelos (KIE/z-image) devem ser **limpas de texto** — texto sempre sobreposto via HTML/CSS na montagem, nunca embutido na geração.

### Video Pro Templates

Templates controlam o `visual_type` de cada cena (não só fotos). Uso: `"video_template": "<template>"` no payload, ou "template <nome>" na descrição no Telegram.

| Template | Mix visual |
|---|---|
| `auto` (padrão) | Agente decide |
| `data_story` | ~60% chart, ~20% text_card, ~20% photo |
| `explainer` | ~40% list/text_card, ~30% photo, ~30% chart |
| `narrativo` | ~50% text_card, ~30% photo, ~20% chart |
| `brand_film` | ~70% photo, ~20% text_card, ~10% chart |

**Visual types por cena:** `photo`, `chart` (Chart.js bar/line/pie/donut), `text_card`, `list`, `split`.

**Implementação:** `pipeline/render-visual-png.js` (PNGs via Playwright), `pipeline/render-video-ffmpeg.js` (pre-render), `pipeline/worker-video-pro.js` (injeta template no scene plan). Múltiplos templates coexistem no mesmo output dir (compartilham áudio/imagens).

---

## Knowledge Files

Em cada `<project_dir>/knowledge/`:

- `brand_identity.md` — tom, emojis, CTA, hashtags. Usado por todos os agentes.
- `product_campaign.md` — features, assets, ângulos. Usado por Research, Ad Creative, Video, Copywriter.
- `platform_guidelines.md` — best practices por plataforma. Usado por Ad Creative, Copywriter, Distribution.

---

## Tech Stack

| Tool | Uso |
|---|---|
| BullMQ + Redis (Docker local) | Fila e worker |
| Tavily AI SDK (`@tavily/core`) | Research |
| Playwright (`chromium`) | HTML → PNG |
| ffmpeg | Video Quick + pré-render visual types |
| Remotion | Video Pro |
| Supabase (`@supabase/supabase-js`) | Hosting de mídia + URLs públicas |
| Instagram Graph API | Publicação IG |
| YouTube Data API | Publicação YT (OAuth `YOUTUBE_REFRESH_TOKEN`) |
| graph.threads.net | Publicação Threads |
