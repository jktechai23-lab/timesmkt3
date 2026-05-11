# ─────────────────────────────────────────────────────────────────────
# timesmkt3 — image única usada pelos services bot, worker e ui.
# Diferenciação por `command:` no docker-compose.yml.
# ─────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim

# ── System deps ──────────────────────────────────────────────────────
# - ffmpeg: render de vídeo (Quick e Pro)
# - chromium e libs: Playwright headless (HTML→PNG dos slides e ads)
# - git, curl, ca-certificates: para `claude` CLI fetch e debug
# - dumb-init: PID 1 sane (sinais propagam corretamente)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      git \
      curl \
      ca-certificates \
      dumb-init \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libnspr4 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*

# ── Claude Code CLI ──────────────────────────────────────────────────
# Headless via ANTHROPIC_API_KEY — sem login interativo.
# O pipeline chama `claude -p <prompt> --dangerously-skip-permissions` em subprocesso.
RUN npm install -g @anthropic-ai/claude-code

# ── App user (não rodar como root) ───────────────────────────────────
RUN groupadd --system --gid 1001 timesmkt && \
    useradd  --system --uid 1001 --gid timesmkt --create-home --shell /bin/bash timesmkt

WORKDIR /app

# ── Node deps (cache layer) ──────────────────────────────────────────
COPY --chown=timesmkt:timesmkt package.json ./
RUN npm install --omit=dev && npm cache clean --force

# ── Playwright browsers ──────────────────────────────────────────────
# Usa o chromium do apt-get (já instalado acima). Playwright lê PLAYWRIGHT_BROWSERS_PATH
# se quiser evitar download duplicado. Por simplicidade aqui baixamos o chromium do Playwright
# que costuma ser mais compatível com a versão do node module.
ENV PLAYWRIGHT_BROWSERS_PATH=/home/timesmkt/.cache/ms-playwright
RUN mkdir -p /home/timesmkt/.cache && chown -R timesmkt:timesmkt /home/timesmkt/.cache
USER timesmkt
RUN npx playwright install chromium

# ── App code ─────────────────────────────────────────────────────────
USER root
COPY --chown=timesmkt:timesmkt . .
USER timesmkt

# Pastas que vão receber bind-mount (cria pra evitar permissão errada)
RUN mkdir -p /app/prj /app/logs

# ── Runtime defaults ─────────────────────────────────────────────────
ENV NODE_ENV=production
ENV TIMESMKT3_UI_PORT=5177

# Sinais propagados via dumb-init (Ctrl-C, docker stop)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default = bot. Compose sobrescreve por service (worker, ui).
CMD ["node", "telegram/bot.js"]
