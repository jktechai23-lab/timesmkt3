# timesmkt3 / IMKT3

**timesmkt3** — sistema de automação de conteúdo para marketing digital usando agentes de IA coordenados por um bot Telegram. A interface read-only (UI **IMKT3**) inspeciona campanhas e config sem tocar no pipeline.

O sistema pesquisa, cria narrativa, gera imagens, produz vídeos, adapta copy para cada plataforma e publica — tudo automatizado com aprovações humanas em cada etapa.

## Projetos irmãos

| Repo | Função | UI |
|---|---|---|
| **timesmkt3** (este) | Bot Telegram + orchestrator + 5-stage pipeline + workers + UI IMKT3 (read-only) | `:5178` |
| [**mkvideos**](https://github.com/inematds/mkvideos) (`~/projetos/mkvideos`) | Factory standalone de vídeos autorais (CriaProf, GERTRAN, DarkStory, Storytree, etc) | `:5278` |
| inemaimg (daemon FastAPI) | Geração de imagem multi-modelo (FLUX/Qwen/ERNIE) | `:8000` |
| Chatterbox (daemon TTS) | TTS local (rachel/bella) | `:7860` |
| inemavox (proxy Freesound) | Library de música/SFX | `:8010` |

Os vídeos autorais (criaprof, gertran, darkstory, storytree) **vivem agora em mkvideos**, não mais aqui. Este repo se concentra em **bot + orchestrator + workers + campanhas**.

> **Visão geral do sistema (público)** → [`doc/sistema.md`](doc/sistema.md)
> Arquitetura técnica completa → [`CLAUDE.md`](CLAUDE.md)
> Fluxo detalhado → [`doc/fluxo-pipeline-v4.md`](doc/fluxo-pipeline-v4.md)
> **Instalação em Docker (VPS ou local)** → [`doc/setup-docker.md`](doc/setup-docker.md)

---

## Quick Start (Docker)

Caminho recomendado pra VPS ou clone fresh. Containeriza bot + worker + ui + redis numa stack só.

```bash
# 1. Instale docker no host (uma vez)
curl -fsSL https://get.docker.com | sh

# 2. Clone o repo
git clone -b feature/docker-setup git@github.com:inematds/timesmkt3.git
cd timesmkt3

# 3. Setup interativo — cria .env, builda image, valida
./setup full

# 4. Crie um projeto (copia o demo INEMA como base)
./setup new minha-marca
nano prj/minha-marca/knowledge/brand_identity.md   # edita pra sua marca
nano prj/minha-marca/knowledge/product_campaign.md

# 5. Sobe
./setup start
./setup logs
```

UI fica em `http://<host>:5177`. Bot conecta no Telegram. Todos os comandos: `./setup help`.

**Comandos do `./setup`:**

| Comando | Função |
|---|---|
| `doctor` | Valida ambiente (read-only — não muda nada) |
| `full` | Build + .env wizard + doctor |
| `start` / `stop` / `restart` | Controla a stack docker compose |
| `logs [svc]` | Tail dos logs (svc: bot, worker, ui, redis) |
| `new <slug>` | Cria novo projeto em `prj/<slug>/` a partir do demo INEMA |
| `smoke` | Roda 1 campanha demo end-to-end — gasta créditos de API |

**Demo INEMA bundled** — `prj/inema/knowledge/` vem no repo como template (3 MDs reais do INEMA.CLUB). `./setup new <slug>` copia esses 3 MDs pra seu novo projeto, aí você edita. Sem demo, agentes não sobem.

### `.env` mínimo

Quando `./setup full` pausar pra você editar `.env`, preencha pelo menos isto:

```ini
# ── OBRIGATÓRIAS ──
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=1234567890:AAH-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TELEGRAM_ALLOWED_CHAT_IDS=123456789

# ── TTS — pelo menos UMA das duas ──
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# FISH_AUDIO_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Image gen (opcional, fallback gratuito) ──
IMAGE_PROVIDER=brand           # ou: kie, pollinations, pexels
# KIE_API_KEY=...              # se IMAGE_PROVIDER=kie
# PEXELS_API_KEY=...           # stock photos grátis
```

| Variável | Onde pega |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `TAVILY_API_KEY` | https://tavily.com (free tier: 1k buscas/mês) |
| `TELEGRAM_BOT_TOKEN` | @BotFather no Telegram → `/newbot` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Mande `/start` pro @userinfobot, pega o ID numérico |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `FISH_AUDIO_API_KEY` | https://fish.audio/go-api/api-keys |
| `KIE_API_KEY` (opcional) | https://kie.ai → API Keys |

**Notas:**
- `TELEGRAM_ALLOWED_CHAT_IDS` aceita lista: `123,456,789`. Outros chats são silenciosamente ignorados.
- Se quiser **OpenRouter** em vez de Anthropic direto, adicione `ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1` e use a chave do OpenRouter em `ANTHROPIC_API_KEY` (ver `doc/setup-docker.md` pros caveats).
- Stages 4/5 (publicação Instagram/YouTube/etc) estão **desabilitados por default** — não precisa preencher essas chaves agora.

`./setup doctor` valida o que está preenchido e pinga as APIs pra confirmar que as chaves funcionam.

**Detalhes** (volumes, troubleshooting, recursos mínimos, OpenRouter opt-in, convivência com PM2 local): [`doc/setup-docker.md`](doc/setup-docker.md).

---

## Pipeline — 5 Estagios

```
┌─────────────────────────────────────────────────────────┐
│  STAGE 1 — Brief & Narrativa                           │
│  Research Agent (Tavily)                                │
│  Creative Director → creative_brief.json                │
│  Copywriter → narrative.json                            │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 2 — Imagens                                      │
│  Se fonte=api: gera imagens (KIE/Pollinations)          │
│  Ad Creative Designer (Claude + Playwright)             │
│  → ads/*.png (carousel + stories)                       │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 3 — Video                                        │
│  Quick: slideshow 10-20s (sempre roda)                  │
│  Pro: 30-70s cinematografico (sob demanda)              │
│    Narracao → Photography Dir → Scene Plan → Render     │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 4 — Plataformas                                  │
│  Instagram/YouTube/TikTok/Facebook/Threads/LinkedIn     │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 5 — Distribuicao                                 │
│  Upload Supabase → Publish MD → Posting                 │
│  [APROVACAO FINAL]                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Agentes

| # | Agente | Funcao | Stage |
|---|---|---|---|
| 1 | Research Agent | Pesquisa tendencias, concorrentes, audiencia via Tavily | 1 |
| 2 | Diretor Criativo | Define angulo estrategico + direcao visual | 1 |
| 3 | Copywriter | Cria narrativa central da campanha | 1 |
| 4 | Ad Creative Designer | Cria imagens estaticas (HTML -> PNG via Playwright) | 2 |
| 5 | Video Quick | Slideshow rapido com imagens do Designer (10-20s) | 3 |
| 6 | Video Pro | Producao profissional: rascunho -> aprovacao -> final (30-60s) | 3 |
| 7 | Instagram Agent | Carousel + stories + reels + captions | 4 |
| 8 | YouTube Agent | Titulo SEO + descricao + tags + shorts | 4 |
| 9 | TikTok Agent | Video curto 9:16 + caption + hook 2s | 4 |
| 10 | Facebook Agent | Feed + stories + reels + video 16:9 | 4 |
| 11 | Threads Agent | Posts conversacionais (max 500 chars) | 4 |
| 12 | LinkedIn Agent | Post profissional + carousel PDF | 4 |
| 13 | Distribution Agent | Guardar + agendar + publicar | 5 |

---

## Como Funciona

| Componente | Papel |
|---|---|
| **Bot Telegram** (`telegram/bot.js`) | Controlador — recebe instrucoes, gerencia aprovacoes, avanca etapas |
| **Orchestrator** (`pipeline/orchestrator.js`) | Enfileira jobs no BullMQ por etapa |
| **Worker** (`pipeline/worker.js`) | Executa agentes via Claude CLI |
| **Agentes** | Especialistas — cada um le seu SKILL.md + knowledge files |
| **Agente Revisor** | Aprovador automatico (modo "agente") |

Cada agente roda como subprocess Claude (`claude -p <prompt> --dangerously-skip-permissions`). O bot spawna o worker, escuta sinais no stdout e avanca o pipeline.

---

## Modos de Aprovacao

Cada etapa pode ter um modo independente:

| Modo | Comportamento |
|---|---|
| `humano` | Pausa e espera resposta no Telegram **(padrao)** |
| `agente` | Agente Revisor avalia e decide automaticamente |
| `auto` | Avanca sem interacao |

```
Pipeline rapido      -> todas "auto", notificacoes: false
Pipeline monitorado  -> todas "agente", notificacoes: true
Distribuicao segura  -> stages 1-4 "auto", stage 5 "humano"
```

Configurar via `/modos <etapa> <modo>` no Telegram ou no payload.

---

## Fontes de Imagem

| Valor | Alias | Comportamento |
|---|---|---|
| `api` | — | Provider de IA do .env (IMAGE_PROVIDER) ou do payload |
| `free` | `gratis` | Banco de imagens gratis (FREE_IMAGE_PROVIDER: pexels, unsplash, pixabay) |
| `brand` | `marca` | Imagens de assets/ e imgs/ do projeto |
| `folder` | `pasta` | Pasta especifica via image_folder no payload |

Classificacao automatica:
- **banner** — imagem com texto/logo (nunca recorta, so letterbox)
- **clip** — arquivo de video (usa direto como fonte)
- **raw** — foto limpa (aplica Ken Burns: zoom, pan, drift)

---

## Video Quick vs Pro

| | Quick (default) | Pro (sob demanda) |
|---|---|---|
| Relacao | Independentes — podem rodar juntos na mesma campanha | Independentes — podem rodar juntos na mesma campanha |
| Trigger | Sempre roda (skip_video para pular) | `video_mode: 'pro'` no payload |
| Duracao | 10-20s | 30-60s |
| Imagens | Usa PNGs do Designer (ads/) | Usa imgs/ (raw API) e assets/ (marca) — nunca ads/ |
| Narracao | Opcional | Obrigatoria |
| Musica | Opcional | Sim |
| Fluxo | Direto | Rascunho -> aprovacao -> final |
| Texto | Topo ou centro (nunca em baixo) | Topo ou centro (nunca em baixo) |

---

## Toggle Simples / Premium

Dois agentes suportam modo simples (rapido) e premium (qualidade maxima):

| Agente | Simples (default) | Premium |
|---|---|---|
| Photography Director | Sonnet + arquivos injetados (~1-2min) | Opus + le 8 arquivos (~5-8min) |
| Scene Plan | Sonnet + photo plan injetado (~1-2min) | Opus + prompt extenso completo (~5-8min) |

Comandos no briefing:
- `foto simples` / `foto premium` — controla o Photography Director
- `videoplan simples` / `videoplan premium` — controla o Scene Plan

---

## Plataformas

Agentes de plataforma (Stage 4) adaptam a narrativa para cada rede. So rodam as plataformas em `platform_targets`.

| Plataforma | Imagem | Video | Texto |
|---|---|---|---|
| Instagram | carousel 1:1 + stories 9:16 | reels 9:16 | caption + hashtags |
| YouTube | thumbnail 16:9 | video 16:9 + shorts 9:16 | titulo + descricao + tags |
| TikTok | — | video 9:16 | caption curto |
| Facebook | feed 1:1/16:9 + stories 9:16 | video 16:9 + reels 9:16 | post longo |
| Threads | opcional | — | post 500 chars |
| LinkedIn | 1200x627 | — | post profissional |

Cada agente pode pedir retrabalho (`rework_needed`, `video_format_request`) se o formato visual nao atende.

---

## Distribuicao (Stage 5)

O Distribution Agent tem 3 responsabilidades:

1. **Guardar** — upload midia para Supabase, gera `media_urls.json`
2. **Agendar** — monta calendario unificado, gera Publish MD
3. **Publicar** — detecta APIs no .env, publica ou marca como manual

A publicacao so executa quando o usuario referencia o Publish MD pelo nome.

| Plataforma | API | Status |
|---|---|---|
| Instagram | Graph API | Implementado |
| YouTube | Data API (OAuth) | Implementado |
| Threads | graph.threads.net | Implementado |
| Facebook | Graph API | Placeholder |
| TikTok | Content Posting API | Placeholder |
| LinkedIn | Marketing API | Placeholder |

---

## Providers de Midia

O sistema escolhe automaticamente baseado nas API keys configuradas.

### Imagens

| Provider | Custo | Tipo |
|---|---|---|
| **Kie.ai Z-Image** | ~$0.004/img | Geracao por IA (padrao) |
| **Pollinations.ai** | Gratis | Geracao por IA (FLUX Schnell) |
| DALL-E 3 | ~$0.04/img | Geracao por IA |
| Stability AI | ~$0.003/img | Geracao por IA |
| **Pexels** | Gratis | Fotos stock |
| Unsplash | Gratis | Fotos stock |
| Pixabay | Gratis | Fotos + audio + musica |

### Narracao (TTS)

| Provider | Custo | Qualidade |
|---|---|---|
| **ElevenLabs** | $0.30/1k chars | Excelente |
| **Fish Audio (Bella)** | plano starter | Narracao storytelling |
| MiniMax | ~$0.01/1k chars | Alta |
| **Piper (local)** | Gratis | Boa |

O fluxo de fallback tenta vozes de TTS na ordem `ElevenLabs → Fish Audio (Bella) → MiniMax → Piper`. Quando o ElevenLabs não está disponível ele já aciona a Fish, que usa a voz Bella por padrão — bastam `FISH_AUDIO_API_KEY` e o texto em pt-BR para ter uma narração narrativa limpa.

MiniMax:
- `MINIMAX_API_KEY` e `MINIMAX_GROUP_ID`
- obter em: `https://platform.minimax.io/user-center/basic-information`

#### Vozes ElevenLabs (default: rachel)

| Voz | Estilo | Uso recomendado |
|---|---|---|
| `rachel` | Calorosa, emocional (F) | Campanhas emocionais, storytelling **(padrao)** |
| `bella` | Amigavel, clara (F) | Produto, tutorial |
| `domi` | Forte, confiante (F) | Empoderamento, lancamentos |
| `antoni` | Profissional (M) | Corporativo, B2B |
| `josh` | Profundo, quente (M) | Luxo, premium |
| `arnold` | Energetico, ousado (M) | Promocoes, urgencia |

### Selecao automatica

```
Imagem -> Kie.ai -> Pollinations -> DALL-E -> Pexels (fallback gratis)
Voz    -> ElevenLabs -> Fish Audio (Bella) -> MiniMax -> Piper (fallback local)
Musica -> Pixabay (gratis) ou Suno/ElevenLabs (pago)
```

Verificar: `npm run media:status`

---

## Efeitos de Video

### Camera

| Efeito | Uso automatico |
|---|---|
| `push-in` | Hooks, impacto |
| `pull-out` | Revelacoes |
| `ken-burns-in` / `out` | Produto, flashbacks |
| `pan-left` / `right` / `up` / `down` | Narrativa |
| `drift` | Emocional |
| `parallax-zoom` | Dinamico |
| `breathe` | CTAs |

### Texto

| Animacao | Uso automatico |
|---|---|
| `blur-in` | Hooks |
| `slide-up` / `down` | Produto |
| `per-word` | Conexao |
| `punch-in` | Reveals |
| `typewriter` | Flashbacks |
| `bounce-in` | CTAs |

---

## Regras de Texto sobre Imagens

1. **Analisar a imagem antes** de posicionar texto
2. **Nunca cobrir rostos** — texto so em areas livres
3. **Texto deve caber no frame** — padding 40px, overflow hidden
4. **Gradientes localizados** — so na zona do texto, opacidade 0.4-0.7

| Imagem com... | Onde colocar texto |
|---|---|
| Pessoas no centro | Rodape ou topo |
| Pessoas na esquerda | Direita |
| Produto no centro | Topo ou rodape |
| Texto ja na imagem | Nao duplicar |

---

## Supabase

Usado **apenas como Storage** para hospedar midia das campanhas. Sem tabelas no banco.

```
Upload (ads/*.png + video/*.mp4) -> Supabase Storage -> media_urls.json -> APIs de publicacao
```

Configuracao:
1. Criar bucket `campaign-uploads` marcado como publico
2. No `.env`: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

---

## Estrutura do Projeto

```
timesmkt3/
├── prj/                             # Projetos (um por cliente/marca)
│   └── <projeto>/
│       ├── assets/                  # Fotos e mídia da marca
│       ├── imgs/                    # Imagens de campanha
│       │   └── banners/             # Banners (nunca recortados)
│       ├── knowledge/               # brand_identity.md, product_campaign.md, platform_guidelines.md
│       └── outputs/
│           └── <campanha>/          # ← Campanhas (visíveis na UI IMKT3 :5178)
│               ├── creative/        # creative_brief.json/.md
│               ├── copy/            # narrative.json/.md
│               ├── ads/             # layout.json, HTMLs, PNGs
│               ├── video/           # scene plans, MP4s
│               ├── platforms/       # instagram.json, youtube.json, etc.
│               ├── audio/           # narrações geradas
│               ├── imgs/            # imagens geradas via API
│               ├── logs/            # log por agente
│               ├── media_urls.json  # URLs públicas do Supabase
│               └── Publish *.md     # guia de publicação
│
├── pipeline/                        # Orchestrator + workers do bot
│   ├── orchestrator.js              # Enfileira jobs no BullMQ (5 stages)
│   ├── worker.js                    # Executa agentes via Claude CLI
│   ├── worker-{ad-creative,video-pro,video-gatilhos,video-report}.js
│   ├── render-video-ffmpeg.js       # Renderiza vídeo com ffmpeg
│   ├── render-video.js              # Renderiza vídeo com Remotion
│   ├── generate-image-{kie,pollinations,inemaimg,piramyd}.js
│   ├── render-slide-png.js          # HTML → PNG via Playwright
│   ├── supabase-upload.js           # Upload para Supabase Storage
│   ├── publish_now.js               # Publicação genérica em todas as plataformas
│   ├── queues.js / redis.js         # Configuração BullMQ + Redis
│   └── payloads/                    # JSONs de campanha de exemplo
│
├── telegram/
│   ├── bot.js                       # Comandos, fluxo, aprovações
│   ├── session.js                   # Sessão por chat
│   ├── formatter.js, media.js, config.js
│
├── ui/                              # UI IMKT3 read-only (porta 5178)
│   ├── server.js                    # /api/campaigns + /api/config
│   └── public/{index.html, app.js, styles.css}
│
├── skills/                          # Specs dos agentes (SKILL.md cada)
├── media/                           # Módulo multi-provider (TTS/SFX/música helpers + voice-refs)
├── remotion-ad/                     # Projeto Remotion
├── doc/                             # Documentação
├── .env.example                     # Template de variáveis
└── CLAUDE.md                        # Documentação técnica da arquitetura
```

**Nota:** `prj/inema/videos/` (vídeos autorais) **não fica mais aqui** — migrou pra `~/projetos/mkvideos/output/videos/`.

---

## Comandos do Bot

| Comando | Funcao |
|---|---|
| `/campanha <nome>` | Inicia pipeline completo |
| `/projetos` | Lista projetos |
| `/projeto <nome>` | Seleciona projeto ativo |
| `/status` | Status do pipeline com fases detalhadas |
| `/outputs` | Lista campanhas geradas |
| `/relatorio <campanha>` | Resumo + inventario de arquivos |
| `/enviar <campanha> [tipo]` | Recebe arquivos (imagens, videos, audio, copy, tudo) |
| `/modos [etapa] [humano\|agente\|auto]` | Configura modos de aprovacao |
| `/rerun <campanha> [stage]` | Reprocessa stages (mostra config antes de rodar) |
| `/loterun <c1,c2,...> <etapas>` | Rerun em série para várias campanhas |
| `/continue <campanha>` | Continua campanha de onde parou |
| `/cancel` | Cancela pipeline ativo |
| `/aprovar` | Re-verifica aprovacoes pendentes |
| `/lote` | Ajuda de lotes |
| `/lotequick <ativos\|todos\|campanhas ...> [qtd] fonte <tipo> [modo <enxuto\|normal>]` | Batch quick |
| `/lotecontinue <batch_id>` | Retoma lote após erro |
| `/import <campanhas> <origem>` | Copia assets para `imports/` |

### Painel de Briefing

Ao iniciar campanha, o bot mostra tabela de config:

```
Config       Atual         Opcoes
──────────── ───────────── ─────────────
  Fonte imgs brand          brand / api / free / screenshot
  Provider   KIE            kie / pollinations
  Modelo     Z-Image        z-image / flux / flux-2 / seedream
  Quick      sim            sim / sem quick
  Pro        nao            pro
  Narrador   rachel         rachel / bella / domi / antoni / josh / arnold
  Duracao    60s            30 / 60
  Estilo     inema_hightech inema_hightech / 01_hero_film
  Dir.Foto   simples        simples / premium
  Scene plan simples        simples / premium
  Fundo quick escuro        escuro / blur
  Idioma     pt-BR          pt-BR / en
  Aprovacao  humano         humano / auto
  Notif      on             on / off
```

Digite o comando para alterar (ex: `pro`, `narrador bella`, `modelo flux`). `sim` para rodar, `nao` para cancelar.

### /rerun — Reprocessar Etapas

```bash
/rerun c0038 3 pro              # refazer video pro
/rerun c0038 2 api              # refazer imagens com API
/rerun c0038 imagens api        # mesmo caso, usando alias
/rerun c0038 3 pro cleanplan    # limpar planos e refazer
/rerun c0038 3 pro cleanall     # limpar tudo (plan+img+audio)
```

### /lotequick — Batch Quick

Comando:

```text
/lotequick <ativos|todos|campanhas ...> [qtd] fonte <tipo> [modo <enxuto|normal>]
```

Exemplos:

```text
/lotequick ativos 10 fonte solido #0D0D0D modo enxuto
/lotequick todos 5 fonte brand modo normal
/lotequick campanhas c2,c44,c45 fonte solido #0D0D0D modo enxuto
/lotequick c2,c44,c45 fonte brand modo normal
```

Regras:

- `ativos` usa apenas campanhas não arquivadas
- `todos` inclui arquivadas
- `campanhas ...` e lista explícita respeitam os IDs informados, mesmo se estiverem arquivados
- `fonte solido #0D0D0D` gera slides tipográficos via `ad_creative_designer`; depois o `video_quick` usa esses PNGs
- `modo enxuto` usa quick otimizado para lote
- `modo normal` usa o quick completo
- O lote grava manifesto e estado em `prj/<projeto>/imports/<batch>/`
- Os vídeos finais continuam na campanha original e também são copiados para `imports/<batch>/videos/`

Flags: `cleanplan`, `cleanimg`, `cleanaudio`, `cleanall`

### /loterun — Rerun em Série (múltiplas campanhas)

Aplica a mesma operação do `/rerun` em várias campanhas, uma por vez. Útil para gerar vários vídeos Pro, re-renderizar imagens em lote, ou refazer plataformas para muitas campanhas.

Comando:

```text
/loterun <c1,c2,...> <etapas> [flags]
```

Aceita lista (`c1,c2,c3`) ou range (`c1-c5`). Etapas e flags seguem exatamente a sintaxe do `/rerun`.

Exemplos:

```text
/loterun c10,c11,c12 video pro template data_story
/loterun c20-c25 imagens api
/loterun c1,c2,c3 video pro template gatilhos cleanall
/loterun c40,c41,c42 plataformas
```

Comportamento:

- Confirmação `sim`/`não` antes de iniciar (mostra a lista de campanhas + config da primeira)
- Roda **em série** (uma por vez, aguarda a anterior terminar)
- Notificações de progresso: `▶ N/total` / `✅ N/total` / `❌ N/total`
- Se uma falhar, **segue para a próxima** por padrão
- Resumo no final: `Lote rerun concluído — X/Y OK. Falhas: ...`

Tambem e possivel ajustar a fonte antes de confirmar com `sim`:

```text
/rerun c0038 imagens
fonte api
sim
```

Outros exemplos:

```text
fonte pasta prj/inema/imgs/site
fonte screenshot https://inema.com.br https://app.inema.club
fonte brand
```

---

## UI IMKT3 (browser, read-only)

Painel web isolado para inspecionar **campanhas** e **config** sem tocar no pipeline. **Não roda nada, não edita nada** — só lê arquivos.

```bash
npm run ui                                  # http://0.0.0.0:5178 (LAN ok)
PORT=5180 npm run ui                        # porta custom
TIMESMKT_UI_HOST=127.0.0.1 npm run ui       # restringir só ao localhost
```

**Acesso:** `http://127.0.0.1:5178`

**Endpoints (todos GET):**
- `GET /` — interface
- `GET /api/campaigns` — todas as campanhas em `prj/*/outputs/*` com payload, contagens, previews
- `GET /api/config` — versão, deps, scripts, skills, knowledge files, head do `CLAUDE.md`
- `GET /api/videos` — placeholder (vídeos autorais vivem em [mkvideos](http://127.0.0.1:5278), não aqui)
- `GET /file?path=<rel>` — serve arquivo dentro de `ROOT/` (whitelist de extensões)

### 3 abas no sidebar

| Aba | Função | Default |
|---|---|---|
| **Campanhas** | Grid de cards das campanhas (uma por `prj/<projeto>/outputs/<campanha>_<date>/`). Cada card mostra brief, 4 thumbs preview, contadores ads/imgs/vídeos, parâmetros agrupados (imagem · vídeo · distribuição · aprovação · skip). Botões abrem modais com todos os ads, imgs, vídeos (player inline), `payload.json`, `Publish*.md`, e `interactive_report.html`. | ✅ ativa |
| **Config** | Versão do projeto, dependências, scripts npm, lista de skills com 1ª linha do SKILL.md, knowledge md por projeto, head do `CLAUDE.md`. | |
| **Help** | Documentação inline da UI: o que cada aba faz, paths usados, link pra mkvideos `:5278`, lista de comandos `npm run *`. | |

**Filtros (topo):** busca livre (nome / data / projeto) + dropdown de projeto.

**Garantias de isolamento:**
- Zero deps externas (só `http`, `fs`, `path` do Node)
- Zero `spawn` / `exec` / `child_process`
- Zero `fs.write*` (server retorna 405 em qualquer POST/PUT/DELETE)
- `safeResolve` bloqueia path traversal
- Whitelist de extensões em `/file` (img/vídeo/json/md/log/etc)

Arquivos: `ui/server.js`, `ui/public/{index.html, app.js, styles.css}`. Apagar `ui/` + remover o script `ui` do `package.json` zera 100% do recurso.

---

## Templates Standalone (Factory CLI) — agora em mkvideos

Os vídeos autorais (CriaProf, GERTRAN, DarkStory, Storytree, CriaProf-CTA, Comic-A) **migraram pra `~/projetos/mkvideos/`** em 2026-05-06. Não vivem mais aqui.

Para gerar vídeo autoral:
```bash
cd ~/projetos/mkvideos
node gen-criaprof.js <slug>
node gen-gertran-nostalgia.js <slug>
node gen-storytree-happy.js
# etc.
```

Ver vídeos gerados: `http://127.0.0.1:5278` (UI mkvideos).

> **Para vídeos via bot Telegram** (campanhas), continue usando `/campanha` neste repo — o pipeline 5-stages roda `worker-video-quick.js` / `worker-video-pro.js` automaticamente.

---

## Comecando do Zero

### 1. Instalar

```bash
npm install
cd remotion-ad && npm install && cd ..
npx playwright install chromium
```

### 2. Redis

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### 3. Configurar .env

```bash
cp .env.example .env
```

Minimo:
```
TAVILY_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Recomendados:
```
IMAGE_PROVIDER=kie         # ou pollinations (gratis)
KIE_API_KEY=               # se IMAGE_PROVIDER=kie
PEXELS_API_KEY=            # fotos stock gratis
ELEVENLABS_API_KEY=        # narracao de video
FISH_AUDIO_API_KEY=        # fallback Bella para storytelling em PT-BR
```

Publicacao:
```
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
THREADS_USER_ID=
THREADS_ACCESS_TOKEN=
```

### 4. Rodar o bot (PM2)

```bash
# Iniciar via ecosystem
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# Reiniciar (apos alterar bot.js ou worker.js)
pm2 restart ecosystem.config.cjs

# Ver status / logs
pm2 list
pm2 logs timesmkt3-bot --lines 30
pm2 logs timesmkt3-worker --lines 30

# Limpar tudo
pm2 delete all
```

Atalho para ambiente local completo:

```bash
./startlocal.sh
```

O script:
- valida `.env`
- instala dependencias se faltarem
- garante o container `redis`
- inicia ou reinicia `timesmkt3-bot` e `timesmkt3-worker` no PM2 sem duplicar processos

Depois no Telegram: `/campanha minha_campanha`

Deploy de VPS mais direto em [deploy/DEPLOY.md](./deploy/DEPLOY.md).

### 5. Teste Guiado No Telegram

Teste simples do fluxo com fallback de pesquisa:

```text
/campanha teste_local --platforms instagram --images 2 --videos 0 --img-source brand --skip-research
```

Quando o bot enviar a confirmação, responder:

```text
sim
```

Validar:
- stage 1 avança mesmo com `skip_research`
- o sistema gera `research_results.json` e `creative_brief.json` simulados
- a campanha segue para imagens sem travar no monitor

Teste mais forte para validar múltiplos skips:

```text
/campanha teste_skips --platforms instagram,threads --images 2 --videos 1 --skip-research --skip-image
```

Validar:
- stage 1 não trava
- stage 2 gera fallback de `skip_image`
- `video_quick` não roda sem `ads` reais
- plataformas continuam com os artefatos simulados

Para acompanhar localmente:

```bash
npx pm2 logs timesmkt3-bot --lines 100
npx pm2 logs timesmkt3-worker --lines 100
```

Teste do lote quick:

```text
/lotequick campanhas c2,c44,c45 fonte solido #0D0D0D modo enxuto
```

Validar:
- o bot mostra `Modo: enxuto`
- campanhas explícitas são respeitadas
- no `solid`, o `Ad Creative Designer` roda antes do `Video Quick`
- o manifesto do lote é salvo em `imports/` com `command_text`, `quick_mode`, `source_spec` e `selected_campaigns`

### 5.1 Timeout de aprovacao e retomada

Quando uma etapa exige aprovacao e a resposta nao chega dentro do prazo:

- a tentativa atual da etapa expira
- o job antigo nao e reativado por aprovacao tardia
- o fluxo nao fica preso esperando indefinidamente

Se a aprovacao chegar depois do timeout, o bot informa que ela expirou e que o fluxo ja seguiu adiante.

Para retomar depois:

```text
/continue c0042
```

Ou para refazer uma etapa especifica:

```text
/rerun c0042 video quick
```

### 6. Rodar pipeline manualmente

```bash
# Enfileirar com payload
node pipeline/orchestrator.js --file pipeline/payloads/coldbrew_demo.json
```

### 7. Publicar manualmente

```bash
# Dry run (sem publicar de verdade)
node pipeline/publish_now.js prj/inema/outputs/pascoa_2026-04-20 --dry-run

# Publicar
node pipeline/publish_now.js prj/inema/outputs/pascoa_2026-04-20
```

### 7. Ver providers ativos

```bash
npm run media:status
```

---

## Problemas Comuns

| Problema | Solucao |
|---|---|
| `npm install` falha | Instalar Node.js v18+ |
| Playwright nao renderiza | `npx playwright install chromium` |
| Redis nao conecta | `docker run -d --name redis -p 6379:6379 redis:alpine` |
| Remotion falha | `cd remotion-ad && npm install` |
| ElevenLabs 401 | Verificar key e permissoes em elevenlabs.io |
| Video sai igual ao template | Passar scene_plan.json como argumento no render-video.js |
| Texto sobre rosto | Seguir regras de posicionamento (analisar imagem antes) |
| Instagram token expirado | Renovar a cada 60 dias |
| Aprovacao expirou | Retomar com `/continue CAMPANHA` ou `/rerun CAMPANHA ETAPA` |

---

## Roadmap v5

- ~~Fila multi-campanha por chat no Telegram~~ — entregue parcialmente via `/loterun` (série) e `/lotequick` (batch quick). Falta: fila realmente paralela entre chats.
- Status por campanha: `/status` listando mais de uma campanha ativa ou enfileirada no mesmo chat.
- Aprovações por campanha: respostas de aprovacao, `/continue`, `/rerun` e `/cancel` sempre vinculadas explicitamente a uma campanha, sem confundir contextos.
- Publicacao em fila de producao para clips `yt-pub-lives`: permitir enfileirar clips para processamento e publicacao ordenada nesse destino.
- Suporte a OpenRouter no v5: permitir usar OpenRouter no lugar do Claude para os agentes do pipeline (sem mexer no v4), habilitando `/model` com aliases `qwen36`, `qwen35` e `qwen25` e apontando para o `OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY` configurados no `.env`.
- Garantia de áudio em Stage 3: renderizadores quick/pro vão falhar explicitamente quando a narração exigida estiver ausente para que o bot reporte o erro em vez de entregar vídeos silenciosos.

---

## Documentacao

| Documento | Conteudo |
|---|---|
| **[doc/sistema.md](doc/sistema.md)** | **Visão geral pública — comece por aqui** |
| [CLAUDE.md](CLAUDE.md) | Arquitetura tecnica completa + versionamento + operação |
| [doc/resumo-projeto.md](doc/resumo-projeto.md) | Resumo do projeto |
| [doc/pipeline-aprovacoes.md](doc/pipeline-aprovacoes.md) | Pipeline e fluxo de aprovacoes |
| [doc/agentes-criacao.md](doc/agentes-criacao.md) | Agentes de criacao (stages 1-3) |
| [doc/agentes-distribuicao.md](doc/agentes-distribuicao.md) | Agentes de plataforma e distribuicao (stages 4-5) |
| [doc/video-pro-pipeline-completo.md](doc/video-pro-pipeline-completo.md) | Video Pro — pipeline completo |
| [doc/import-worker-campanhas.md](doc/import-worker-campanhas.md) | Comando `/import` — lotes de assets |
| [doc/modulos.md](doc/modulos.md) | Mapa de todos os módulos (`pipeline/` e `skills/`) |
| [skills/video-art-direction/SKILL.md](skills/video-art-direction/SKILL.md) | Video Art Direction — 12 presets de estilo visual |
