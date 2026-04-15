module.exports = {
  apps: [
    {
      name: 'timesmkt3-bot',
      script: 'telegram/bot.js',
      cwd: '/home/nmaldaner/projetos/timesmkt3',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'timesmkt3-worker',
      script: 'pipeline/worker.js',
      cwd: '/home/nmaldaner/projetos/timesmkt3',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      // Daemon Python (FastAPI) que mantém Chatterbox VC carregado na GPU.
      // Servido em 127.0.0.1:7860. Consumido por media/tts-generator.js via
      // generateChatterboxVC (provider 'chatterbox-vc', default atual).
      // Fallback automático: se cair, tts-generator usa Fish Audio.
      name: 'timesmkt3-tts-daemon',
      cwd: '/home/nmaldaner/projetos/timesmkt3/media/python',
      script: '/home/nmaldaner/miniconda3/envs/chatterbox/bin/python3',
      args: '-m uvicorn tts_daemon:app --host 127.0.0.1 --port 7860 --log-level info',
      interpreter: 'none', // não usa node para esse
      autorestart: true,
      watch: false,
      max_restarts: 5,
      restart_delay: 10000,
      kill_timeout: 15000, // deixa o modelo descarregar antes de matar
      max_memory_restart: '6G',
      env: {
        TTS_DAEMON_PORT: '7860',
        TTS_DAEMON_HOST: '127.0.0.1',
        PYTHONUNBUFFERED: '1',
      },
    },
  ],
};
