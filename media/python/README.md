# media/python — TTS Daemon

Daemon FastAPI que mantém o modelo Chatterbox VC carregado em memória para
pipeline batch de narração do timesmkt3.

## Por que daemon

Cada geração via subprocess Python custa ~10s de cold start (import torch +
load do modelo). Em batch (ex: 15 narrações de uma campanha), isso vira 150s
de overhead antes de começar a produzir. O daemon carrega o modelo uma vez
na inicialização e serve todas as chamadas seguintes em ~3s cada.

## Arquitetura

```
Node (tts-generator.js)  ──HTTP──▶  FastAPI (tts_daemon.py)  ──▶  ChatterboxVC (GPU)
                                                             └─▶  edge_tts (MS Azure)
```

Fluxo por requisição:
1. Recebe `{text, voice, lang}` no POST /tts/vc
2. Edge TTS (`pt-BR-FranciscaNeural`) gera mp3 com prosódia PT-BR nativa
3. ChatterboxVC troca o timbre para o voice-ref escolhido
4. ffmpeg converte wav → mp3
5. Retorna os bytes do mp3 na resposta HTTP

## Dependências

Rodam no conda env `chatterbox`:
- `torch` (CUDA)
- `chatterbox` (VC model)
- `soundfile`, `numpy`
- `fastapi`, `uvicorn[standard]`, `edge-tts` (instalados via pip)
- `ffmpeg` no PATH do sistema

## Endpoints

### `GET /health`
Status do daemon: modelo carregado, device, vozes disponíveis.

```bash
curl http://127.0.0.1:7860/health
```

### `GET /voices`
Lista as vozes disponíveis (arquivos em `../voice-refs/*.wav`).

### `POST /tts/vc`
Gera narração. Body JSON:

```json
{
  "text": "Texto a falar...",
  "voice": "rachel",
  "lang": "pt",
  "bitrate": "128k"
}
```

Retorno: `audio/mpeg` (bytes do mp3), com headers `X-TTS-*` contendo timing.

```bash
curl -X POST http://127.0.0.1:7860/tts/vc \
  -H "Content-Type: application/json" \
  -d '{"text":"Olá mundo","voice":"rachel"}' \
  --output teste.mp3
```

## Rodar manual

```bash
/home/nmaldaner/miniconda3/envs/chatterbox/bin/python3 \
  -m uvicorn tts_daemon:app --host 127.0.0.1 --port 7860
```

## Rodar via pm2 (produção)

Já configurado em `timesmkt3/ecosystem.config.cjs` como app `timesmkt3-tts-daemon`.

```bash
cd /home/nmaldaner/projetos/timesmkt3
pm2 start ecosystem.config.cjs --only timesmkt3-tts-daemon
pm2 logs timesmkt3-tts-daemon
pm2 restart timesmkt3-tts-daemon    # ao adicionar nova voz em voice-refs/
```

## Adicionar nova voz

Coloque um WAV 24kHz mono de até 10s em `../voice-refs/NOME.wav`. O daemon
re-escaneia a pasta em cada request (então não precisa restart para descobrir,
mas restart é mais seguro).

Ver `../voice-refs/README.md` para o comando `ffmpeg` de conversão.

## Troubleshooting

**"model not loaded" (503)**
O daemon ainda está carregando (primeiro 5-10s após startup). Aguarde ou
confira com `/health`.

**"voice 'X' not found" (404)**
O WAV da voz não está em `voice-refs/`. Confirme o nome do arquivo.

**"edge_tts failed" (502)**
Problema de rede com o endpoint Microsoft Azure Speech. Normalmente é
transiente — retry automático no lado Node resolve.

**"chatterbox vc failed" (500)**
Problema de inference (OOM, tensor shape, etc.). Ver `pm2 logs` para stacktrace.
Sintoma conhecido: o bug `sdpa/output_attentions` é **exclusivo do Chatterbox
TTS puro** e não afeta o VC. Se aparecer algo com `attn_implementation`, é
outro lugar — abrir issue.
