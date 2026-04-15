# voice-refs

Referências de voz usadas pelo provider `chatterbox-vc` (daemon em `../python/tts_daemon.py`).

## Formato obrigatório

- WAV 24 kHz mono
- Máximo 10 segundos (o Chatterbox MTL corta em `DEC_COND_LEN` = 10s)
- Sem ruído de fundo, sem música, voz única

## Adicionar uma nova voz

```bash
# A partir de qualquer mp3/wav/mp4 com 10+ segundos de fala limpa:
ffmpeg -y -i entrada.mp3 -ar 24000 -ac 1 -t 10 voice-refs/NOME.wav
```

Depois, na chamada Node:

```javascript
await generateSpeech(texto, saida, {
  provider: 'chatterbox-vc',
  voice: 'nome',  // precisa bater com o nome do .wav
});
```

O daemon descobre novas vozes automaticamente no startup. Se adicionar uma enquanto ele estiver rodando, reinicie:

```bash
pm2 restart timesmkt3-tts-daemon
```

## Vozes atuais

| Nome | Origem | Notas |
|---|---|---|
| `rachel` | ElevenLabs (21m00Tcm4TlvDq8ikWAM) | Referência padrão dos c0001-c0014 do 1old, voz default do provider |
| `bella` | Fish Audio (f18e96e1ed024df98860f6ff60bd6695) | Expressiva, storytelling, alternativa quente |
