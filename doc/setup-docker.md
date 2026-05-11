# timesmkt3 — setup em Docker

Stack containerizada do pipeline. Roda em VPS Linux ou local. Mesma image (`timesmkt3:latest`) faz papel de bot, worker e UI — diferença é o `command:` no compose.

## Pré-requisitos

No host (VPS ou desktop):

- **Docker** + plugin **compose** (v2). Mínimo `docker compose version` ≥ 2.20.
- **curl**, **git** (vem em qualquer Ubuntu/Debian).
- **Recomendado**: 2+ vCPUs, 4 GB RAM, 20 GB disco. Worker spawna Chromium + ffmpeg + subprocesses do Claude CLI — ideal 4 vCPU / 6 GB.

Tudo o mais (ffmpeg, chromium, Claude CLI, Node 20) vai dentro da image.

## Sequência primeira vez

```bash
git clone https://github.com/inematds/timesmkt3.git
cd timesmkt3
./setup full
```

`./setup full`:

1. Verifica se docker tá disponível.
2. Cria `.env` a partir de `.env.example` se não existir, e pede pra você editar.
3. Roda `docker compose build` (~5-8 min na primeira vez).
4. Roda `./setup doctor` no fim pra validar.

Depois de `full`:

```bash
./setup start    # docker compose up -d
./setup logs     # tail dos 4 services
```

UI fica em `http://localhost:5177` (configurável via `TIMESMKT3_UI_PORT`).

## .env mínimo

Pelo menos estas chaves precisam estar preenchidas:

| Variável | Pra que serve | Onde pega |
|---|---|---|
| `ANTHROPIC_API_KEY` | Todos os agentes (Claude CLI headless) | https://console.anthropic.com/settings/keys |
| `TAVILY_API_KEY` | Research agent | https://tavily.com (free tier) |
| `TELEGRAM_BOT_TOKEN` | Controlador do pipeline | @BotFather no Telegram |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Allowlist de chat IDs | Mande `/myid` pro @userinfobot |
| `ELEVENLABS_API_KEY` **ou** `FISH_AUDIO_API_KEY` | TTS pra vídeo Pro/Quick | elevenlabs.io ou fish.audio |

Opcionais por feature: `KIE_API_KEY` (image gen), `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (publicação — desabilitada por default), `INSTAGRAM_*`/`YOUTUBE_*`/`THREADS_*` (publicação).

### OpenRouter (opcional)

Se quiser usar OpenRouter em vez de Anthropic direto:

```bash
ANTHROPIC_API_KEY=<sua-chave-openrouter>
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
```

A Claude CLI roteia tudo via OpenRouter. **Não é oficialmente testado** — pode haver drift de features (prompt caching, tool features novos). Use por sua conta.

## Comandos do `setup`

```
./setup doctor       Valida ambiente (read-only — não muda nada)
./setup full         Build + .env wizard + doctor
./setup start        docker compose up -d
./setup stop         docker compose down (volumes preservados)
./setup restart      stop + start
./setup logs [svc]   tail logs (bot|worker|ui|redis)
./setup smoke        Roda campanha demo end-to-end — GASTA CRÉDITOS
./setup help
```

## Volumes e persistência

Bind mounts (do host pro container):

- `./prj` → `/app/prj` — campanhas, knowledge, outputs ficam no host.
- `./logs` → `/app/logs` — logs do worker/bot.

Named volume:

- `redis-data` → `/data` no container redis. Persiste a fila BullMQ entre restarts.

Pra **wipe total**:

```bash
./setup stop
docker compose down -v   # APAGA redis-data também (fila perdida)
rm -rf logs prj/*/outputs   # limpa outputs no host se quiser
```

## Reverse proxy / TLS

Setup **não** configura nginx/Caddy. UI fica direto na porta do host. Pra cloud com domínio:

- Caddy / nginx no host com `proxy_pass http://localhost:5177`.
- Cloudflare Tunnel apontando pra `localhost:5177`.
- Caddy externo com TLS automático.

Fora do escopo do setup pra evitar suporte de DNS/firewall/renovação de certificado.

## Convivência com PM2 local

Se você tem `npx pm2 list` mostrando processos `timesmkt3-bot`/`worker`/`ui`/`tts-daemon` rodando, **não dá pra ter os dois ativos ao mesmo tempo**:

- Mesmo `TELEGRAM_BOT_TOKEN` → bot duplicado responde 2x no Telegram.
- Mesmo `prj/` (bind mount no Docker, cwd no PM2) → race conditions em scene plans, approvals, JSON files.
- Porta 5177 conflita.

**Migrar pra Docker**:

```bash
npx pm2 stop all
npx pm2 save           # salva estado pra voltar depois
./setup start
```

**Voltar pra PM2**:

```bash
./setup stop
npx pm2 resurrect
```

**Adeus PM2**:

```bash
npx pm2 stop all && npx pm2 delete all
npx pm2 unstartup     # se tinha auto-start no boot
./setup start
```

## Resource limits

Por default não tem `mem_limit`/`cpus` no compose — Docker compete livre com o host. Em VPS pequeno (2 vCPU/4 GB), worker pode levar a máquina inteira ao limite quando spawna múltiplos jobs.

`./setup doctor` avisa se host está abaixo do mínimo (2 vCPU, 4 GB). Pra forçar limite, adicione no `docker-compose.yml`:

```yaml
worker:
  ...
  mem_limit: 3g
  cpus: 1.5
```

## TTS local (Chatterbox VC) — opt-in

O daemon Python do Chatterbox VC **não vem no Docker** por default (era complicado de container-izar e exigia GPU). Pra TTS, use ElevenLabs ou Fish Audio (cloud, ambos free tier). 

Se quiser Chatterbox local, vai precisar setup separado fora do Docker — ver `media/python/` no repo.

## Troubleshooting

**`Cannot connect to the Docker daemon`** — `sudo systemctl start docker` ou adicione seu usuário ao grupo docker (`sudo usermod -aG docker $USER`, relogue).

**Build lenta na primeira vez** — `npx playwright install chromium` baixa ~150 MB. Esperado. Próximas builds usam cache.

**`Redis connection refused`** — service `redis` ainda subindo. `docker compose ps` mostra `(healthy)`. Aguarde 10s.

**Bot não responde no Telegram** — `./setup logs bot`. Procura `Bot started`. Se ver `401 Unauthorized`, token errado. Se ver `Conflict: terminated by other getUpdates`, tem outro processo (PM2?) usando o mesmo token.

**Worker travando** — `docker stats`. Se memória passar do limite do host, configure `mem_limit` (ver acima) ou aumente swap.

**UI 502/connection refused** — service `ui` falhou ao subir. `./setup logs ui`. Verifique se `TIMESMKT3_UI_PORT` não tá em uso por outro processo do host (`ss -tlnp | grep 5177`).

**Claude CLI erro `not authenticated`** — `ANTHROPIC_API_KEY` faltando ou inválida no `.env`. Confirma com `./setup doctor`.
