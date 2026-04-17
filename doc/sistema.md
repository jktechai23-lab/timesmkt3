# Sistema timesmkt3

> **timesmkt3 v4.5** — INEMA Time de Agentes de Marketing. Sistema de automação de marketing de conteúdo alimentado por agentes IA coordenados por um bot do Telegram.

Este documento é a visão geral pública do sistema. Para operação interna detalhada (versionamento, PM2, Redis, comando `/import` etc.), veja [`CLAUDE.md`](../CLAUDE.md) na raiz.

---

## O que o sistema faz

Transforma um briefing em linguagem natural em conteúdo publicável em 6 plataformas, passando por 5 etapas com aprovações humanas configuráveis:

```
Briefing → Pesquisa → Estratégia → Copy → Imagens → Vídeo → Plataformas → Distribuição
```

13+ agentes especializados, cada um rodando como subprocesso `claude -p` com acesso total a ferramentas (Read, Write, Bash, Playwright, ffmpeg, Remotion, APIs de mídia).

---

## Arquitetura — 5 Estágios

```
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: Estratégia & Narrativa                            │
│  Research Agent → Diretor Criativo → Copywriter             │
│                          [APROVAÇÃO 1 — brief + narrativa]  │
├─────────────────────────────────────────────────────────────┤
│  Stage 2: Imagens                                           │
│  Ad Creative Designer                                       │
│                          [APROVAÇÃO 2 — imagens estáticas]  │
├─────────────────────────────────────────────────────────────┤
│  Stage 3: Vídeo                                             │
│  Video Quick (ffmpeg) + Video Pro (Remotion, sob demanda)   │
│                          [APROVAÇÃO 3 — vídeo + plataformas]│
├─────────────────────────────────────────────────────────────┤
│  Stage 4: Plataformas                                       │
│  6 agentes nativos: IG + YT + TikTok + FB + Threads + LI    │
│                          [APROVAÇÃO 4 — copy nativo]        │
├─────────────────────────────────────────────────────────────┤
│  Stage 5: Distribuição                                      │
│  Upload Supabase + Agendar + Publicar via APIs oficiais     │
│                          [APROVAÇÃO 5 — publicar]           │
└─────────────────────────────────────────────────────────────┘
```

Detalhamento por etapa em [`fluxo-pipeline-v4.md`](fluxo-pipeline-v4.md) e manuais dedicados:

- [Stage 1 — Estratégia](manual-stage1-estrategia.md)
- [Stage 2 — Imagens](manual-stage2-imagens.md)
- [Stage 3 — Vídeo](manual-stage3-video.md)
- [Stage 4 — Plataformas](manual-stage4-plataformas.md)
- [Stage 5 — Distribuição](manual-stage5-distribuicao.md)

---

## Componentes

| Componente | Papel |
|---|---|
| **Bot Telegram** (`telegram/bot.js`) | Controlador do pipeline — recebe comandos, enfileira jobs, gerencia aprovações |
| **Orchestrator** (`pipeline/orchestrator.js`) | Enfileira agentes por etapa via `enqueueStage()` |
| **Worker** (`pipeline/worker.js`) | Executa agentes; emite sinais `[STAGE1_DONE]`, `[STAGE2_IMAGE_READY]`, `[IMAGE_APPROVAL_NEEDED]` |
| **BullMQ + Redis** | Fila de jobs com persistência |
| **PM2** | Process manager — mantém bot + worker + TTS daemon rodando |

### Modos de aprovação por etapa

Configurável via `approval_modes` no payload:

| Modo | Comportamento |
|---|---|
| `humano` | Bot envia resultado e aguarda confirmação (padrão) |
| `auto` | Avança automaticamente |
| `agente` | Agente Revisor avalia e decide |

Detalhes em [`pipeline-aprovacoes.md`](pipeline-aprovacoes.md).

---

## Agentes

### Criação
- **Marketing Research Agent** — 5 buscas Tavily (tendências, concorrentes, audiência, hooks, virais); gera JSON + Markdown + HTML interativo
- **Creative Director** — escolhe UM ângulo estratégico; define direção visual e guardrails
- **Copywriter Agent** — narrativa central consumida pelos agentes de plataforma
- **Ad Creative Designer** — gera JSON de layout, renderiza HTML → PNG 1080×1080 via Playwright
- **Video Quick** — slideshow 10-20s com Ken Burns + transições via ffmpeg
- **Video Pro** — vídeo profissional 30-60s com narração + música + scene plan via Remotion

Specs completas em [`agentes-criacao.md`](agentes-criacao.md).

### Plataformas (Stage 4)
6 agentes nativos (um por plataforma) que adaptam a narrativa central ao formato específico. Só rodam as plataformas listadas em `platform_targets`. Specs em [`agentes-distribuicao.md`](agentes-distribuicao.md).

### Distribuição (Stage 5)
Upload para Supabase (bucket `campaign-uploads`), gera `media_urls.json`, monta `Publish <campanha>.md` advisory. Publicação real só ocorre quando o usuário referencia o MD pelo nome.

---

## Templates de Vídeo Pro

Controlam o `visual_type` de cada cena:

| Template | Foco | Mix visual |
|---|---|---|
| `auto` | Agente decide (padrão) | Livre |
| `data_story` | Dados/estatísticas | ~60% chart, ~20% card, ~20% foto |
| `explainer` | Explicar conceitos | ~40% list/card, ~30% foto, ~30% chart |
| `narrativo` | Narrativa visual | ~50% card, ~30% foto, ~20% chart |
| `brand_film` | Cinematográfico | ~70% foto, ~20% card, ~10% chart |
| `report` | Relatório factual | Slides informativos |
| `gatilhos` | Hooks/ganchos | Slides curtos de impacto |

Múltiplos templates podem rodar em paralelo: `/rerun c13 video pro data_story explainer` gera 2 vídeos. Detalhes em [`video-pro-pipeline-completo.md`](video-pro-pipeline-completo.md).

---

## Comandos do Bot

### Pipeline
| Comando | Função |
|---|---|
| `/campanha <nome>` | Roda pipeline completo (5 etapas) |
| `/rerun <campanha> <etapas> [flags]` | Reprocessar etapas específicas |
| `/continue <campanha>` | Continuar de onde parou |
| `/cancel` | Cancelar pipeline ativo |
| `/status` | Status detalhado por etapa |

### Lotes
| Comando | Função |
|---|---|
| `/lotequick <campanhas> fonte ...` | Batch video quick (uma campanha por vez) |
| `/loterun <c1,c2,...> <etapas>` | Batch rerun em série (ex: vários Pro) |
| `/lotecontinue <batch_id>` | Retomar lote após erro |

Exemplos:
```
/loterun c10,c11,c12 video pro template data_story
/loterun c20-c25 imagens api
/lotequick ativos 10 fonte solido #0D0D0D modo enxuto
```

### Saídas
| Comando | Função |
|---|---|
| `/outputs` | Listar campanhas |
| `/relatorio <campanha>` | Resumo + arquivos disponíveis |
| `/enviar <campanha> [tipo]` | Receber arquivos no chat |
| `/import <campanhas> <origem>` | Copiar assets para `imports/` |

Comando `/import` tem sintaxe rica (ranges, modificadores). Ver [`import-worker-campanhas.md`](import-worker-campanhas.md).

### Fontes de imagem
`brand` (assets da marca) · `api` (IA via provider) · `free` (banco grátis) · `screenshot <URL>` · `folder <path>` · `solid <#hex>`

### Flags de limpeza
`cleanplan` · `cleanimg` · `cleanaudio` · `cleanall`

Menu completo via `/help` no bot.

---

## Estrutura de Diretórios

### Projetos
Cada cliente/marca tem seu próprio subdiretório sob `prj/`:

```
prj/
└── <cliente>/
    ├── assets/                 ← produtos, logos, fotos
    ├── knowledge/              ← brand_identity, product_campaign, platform_guidelines
    ├── imports/                ← lotes exportados (videos/ads)
    └── outputs/                ← campanhas geradas
        └── <campanha>/
            ├── research_results.json
            ├── creative/creative_brief.json
            ├── copy/narrative.json
            ├── ads/            ← layouts + PNG 1080×1080
            ├── imgs/           ← imagens geradas (API ou assets)
            ├── video/          ← MP4 Quick + Pro
            ├── audio/          ← narração (Chatterbox/Fish/ElevenLabs)
            ├── platforms/      ← copy nativo por plataforma
            ├── logs/           ← log por agente
            └── Publish <campanha> <data>.md
```

### Knowledge Files (`<projeto>/knowledge/`)
- **`brand_identity.md`** — tom, voz, emojis, CTAs, hashtags
- **`product_campaign.md`** — produto, selling points, visuais, ângulos
- **`platform_guidelines.md`** — best practices por plataforma

Todos os agentes consultam esses arquivos como fonte de verdade do projeto.

---

## Tech Stack

| Ferramenta | Uso |
|---|---|
| Node.js + Telegraf | Bot e orchestrator |
| BullMQ + Redis | Fila de jobs |
| Claude CLI (`claude -p`) | Execução de agentes |
| Tavily AI SDK | Pesquisa de mercado |
| Playwright (Chromium) | HTML → PNG 1080×1080 |
| ffmpeg | Render video Quick |
| Remotion (React) | Render video Pro |
| Chatterbox VC (local) | TTS default, gratuito |
| Fish Audio / ElevenLabs | TTS fallback |
| Supabase Storage | Hospedagem de mídia |
| Instagram Graph API | Publicação IG |
| YouTube Data API | Publicação YT |
| Threads API | Publicação Threads |

---

## Fluxo de Dados

Do payload inicial à publicação, cada etapa consome JSONs da etapa anterior:

```
campaign_payload.json
  → research_results.json
  → creative/creative_brief.json
  → copy/narrative.json
  → ads/layout.json + *.png
  → video/*_scene_plan.json + *.mp4
  → platforms/*.json
  → media_urls.json
  → Publish <campanha>.md
```

Detalhes em [`fluxo-dados-pipeline.md`](fluxo-dados-pipeline.md).

---

## Aprovações

Por padrão cada etapa pede confirmação humana via Telegram. O usuário pode:
- Responder `sim` para aprovar
- Dar feedback em texto livre → agente ajusta e re-envia
- Responder `auto`/`humano`/`agente` via `/modos` para mudar o modo

Gate interno de imagens (`[IMAGE_APPROVAL_NEEDED]`) é separado do gate de stage — o bot escreve `imgs/approved.json` automaticamente quando o usuário aprova as imagens individuais.

---

## Documentação Relacionada

**Manuais por etapa:**
- [Stage 1 — Estratégia](manual-stage1-estrategia.md)
- [Stage 2 — Imagens](manual-stage2-imagens.md)
- [Stage 3 — Vídeo](manual-stage3-video.md)
- [Stage 4 — Plataformas](manual-stage4-plataformas.md)
- [Stage 5 — Distribuição](manual-stage5-distribuicao.md)

**Temas específicos:**
- [Fluxo completo v4](fluxo-pipeline-v4.md)
- [Fluxo de dados](fluxo-dados-pipeline.md)
- [Comandos do pipeline](manual-pipeline-comandos.md)
- [Aprovações](pipeline-aprovacoes.md)
- [Video Pro (pipeline completo)](video-pro-pipeline-completo.md)
- [Video Pro com Opus](video-pro-opus.md)
- [Remotion — componentes](manual-remotion-componentes.md)
- [TTS daemon (Chatterbox)](tts-daemon-notas.md)
- [Import worker (lotes)](import-worker-campanhas.md)
- [Agentes de criação](agentes-criacao.md)
- [Agentes de distribuição](agentes-distribuicao.md)

**Decisões arquiteturais:**
- [Migração CLI → API](migracao-cli-para-api.md)
- [LLM Provider multi-campanha](plano-llm-provider-multicampanha.md)
- [Plano Remotion renderer](plano-remotion-renderer.md)

**Interno (operação diária):**
- [`CLAUDE.md`](../CLAUDE.md) — versionamento, PM2, Redis, comando `/import`, regras de comportamento
