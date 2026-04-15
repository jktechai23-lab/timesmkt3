/**
 * TTS Generator — Multi-provider text-to-speech
 *
 * Supports: ElevenLabs, MiniMax, OpenAI TTS, Piper (local)
 *
 * Usage:
 *   const { generateSpeech } = require('./tts-generator');
 *   await generateSpeech('Bom dia, mãe.', 'output.mp3', { provider: 'elevenlabs', language: 'pt-BR' });
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');
const { getEnvVar, getBestProvider, TTS_FALLBACK } = require('./providers');

// ── ElevenLabs ──────────────────────────────────────────────────────────────

async function generateElevenLabs(text, outputPath, options = {}) {
  const apiKey = getEnvVar('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  // Default voice: Rachel (female, warm) — good for PT-BR
  const voiceId = options.voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel
  const modelId = options.modelId || 'eleven_multilingual_v2';
  const stability = options.stability || 0.5;
  const similarityBoost = options.similarityBoost || 0.75;

  const body = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarityBoost,
    },
  });

  const audioBuffer = await httpPostBinary(
    'api.elevenlabs.io',
    `/v1/text-to-speech/${voiceId}`,
    body,
    {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    }
  );

  fs.writeFileSync(outputPath, audioBuffer);
  console.log(`  ✅ ElevenLabs TTS saved: ${outputPath} (${text.length} chars)`);
  return { provider: 'elevenlabs', chars: text.length, path: outputPath };
}

// ── MiniMax TTS ─────────────────────────────────────────────────────────────

async function generateMiniMax(text, outputPath, options = {}) {
  const apiKey = getEnvVar('MINIMAX_API_KEY');
  if (!apiKey) throw new Error('MINIMAX_API_KEY not configured');

  const voiceId = options.voiceId || 'female-shaonv'; // Female Chinese/Multilingual
  const speed = options.speed || 1.0;
  const pitch = options.pitch || 0;
  const volume = options.volume || 1;
  const model = options.model || 'speech-2.8-turbo';

  const body = JSON.stringify({
    text,
    model,
    stream: false,
    language_boost: 'Portuguese',
    output_format: 'hex',
    voice_setting: {
      voice_id: voiceId,
      speed,
      vol: volume,
      pitch,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    },
  });

  const response = await httpPost(
    'api.minimax.io',
    '/v1/t2a_v2',
    body,
    {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
  );

  const data = JSON.parse(response);
  if (data?.data?.audio) {
    const audioBuffer = Buffer.from(data.data.audio, 'hex');
    fs.writeFileSync(outputPath, audioBuffer);
    console.log(`  ✅ MiniMax TTS saved: ${outputPath}`);
    return { provider: 'minimax', chars: text.length, path: outputPath };
  }

  throw new Error(`MiniMax TTS failed: ${JSON.stringify(data)}`);
}

// ── Fish Audio ───────────────────────────────────────────────────────────────

async function generateFishAudio(text, outputPath, options = {}) {
  const apiKey = getEnvVar('FISH_AUDIO_API_KEY');
  if (!apiKey) throw new Error('FISH_AUDIO_API_KEY not configured');

  const voiceId = options.voiceId || 'f18e96e1ed024df98860f6ff60bd6695'; // Bella
  const model = options.model || 's1';
  const speed = options.speed || 0.88;
  const body = JSON.stringify({
    text,
    reference_id: voiceId,
    format: 'mp3',
    model,
    prosody: {
      speed,
      pitch: options.pitch || 0,
    },
  });

  const audioBuffer = await httpPostBinary(
    'api.fish.audio',
    '/v1/tts',
    body,
    {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
  );

  fs.writeFileSync(outputPath, audioBuffer);
  console.log(`  ✅ Fish Audio TTS saved: ${outputPath} (voice ${voiceId})`);
  return { provider: 'fish', voiceId, chars: text.length, path: outputPath };
}

// ── OpenAI TTS ──────────────────────────────────────────────────────────────

// ── Chatterbox VC (daemon local — Edge TTS + ChatterboxVC) ──────────────────

const CHATTERBOX_DAEMON_URL = process.env.TTS_DAEMON_URL || 'http://127.0.0.1:7860';

async function generateChatterboxVC(text, outputPath, options = {}) {
  const voice = options.voice || options.voiceId || 'rachel';
  const lang = options.lang || 'pt';
  const bitrate = options.bitrate || '128k';
  const maxAttempts = options.maxAttempts || 3;
  const retryDelayMs = options.retryDelayMs || 2000;

  const body = JSON.stringify({ text, voice, lang, bitrate });

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const audioBuffer = await httpPostBinaryLocal(
        CHATTERBOX_DAEMON_URL + '/tts/vc',
        body,
        { 'Content-Type': 'application/json' },
      );

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, audioBuffer);
      console.log(`  ✅ Chatterbox VC saved: ${outputPath} (voice ${voice}, ${text.length} chars)`);
      return { provider: 'chatterbox-vc', voice, chars: text.length, path: outputPath };
    } catch (e) {
      lastErr = e;
      const retriable = /ECONNREFUSED|ETIMEDOUT|ECONNRESET|HTTP 503/.test(e.message);
      if (!retriable || attempt === maxAttempts) break;
      console.warn(`  ⚠️  Chatterbox daemon attempt ${attempt}/${maxAttempts} failed (${e.message.slice(0, 80)}). Retrying in ${retryDelayMs}ms...`);
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }
  throw new Error(`Chatterbox VC daemon unavailable: ${lastErr?.message || 'unknown'}`);
}

// ── Piper (Local) ───────────────────────────────────────────────────────────

async function generatePiper(text, outputPath, options = {}) {
  const model = options.model || 'pt_BR-faber-medium';

  try {
    // Check if piper is installed
    execFileSync('which', ['piper'], { stdio: 'pipe' });
  } catch {
    throw new Error('Piper not installed. Install: pip install piper-tts');
  }

  const tempInput = path.join(path.dirname(outputPath), '_piper_input.txt');
  fs.writeFileSync(tempInput, text);

  try {
    execFileSync('piper', [
      '--model', model,
      '--output_file', outputPath,
    ], {
      input: text,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    console.log(`  ✅ Piper TTS saved: ${outputPath} (local, model: ${model})`);
    return { provider: 'local-piper', model, chars: text.length, path: outputPath };
  } finally {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
  }
}

// ── Unified Interface ───────────────────────────────────────────────────────

async function generateSpeechSingle(text, outputPath, options = {}) {
  const provider = options.provider || getBestProvider('tts')?.id || 'openai-tts';

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  switch (provider) {
    case 'elevenlabs':    return generateElevenLabs(text, outputPath, options);
    case 'minimax':       return generateMiniMax(text, outputPath, options);
    case 'fish':          return generateFishAudio(text, outputPath, options);
    case 'chatterbox-vc': return generateChatterboxVC(text, outputPath, options);
    case 'local-piper':   return generatePiper(text, outputPath, options);
    default: throw new Error(`Unknown TTS provider: ${provider}`);
  }
}

/**
 * Gera fala com fallback automático. Se o provider primário falhar (ex.: daemon
 * Chatterbox não responde), tenta o fallback mapeado em TTS_FALLBACK.
 * Desabilita com options.noFallback = true.
 */
async function generateSpeech(text, outputPath, options = {}) {
  const primary = options.provider || getBestProvider('tts')?.id || 'openai-tts';
  const fallback = options.fallback
    || (options.noFallback ? null : TTS_FALLBACK[primary]);

  try {
    return await generateSpeechSingle(text, outputPath, { ...options, provider: primary });
  } catch (err) {
    if (!fallback || fallback === primary) throw err;
    console.warn(`  ⚠️  TTS provider '${primary}' failed: ${err.message.slice(0, 140)}`);
    console.warn(`  ↪  Fallback → '${fallback}'`);
    const result = await generateSpeechSingle(text, outputPath, {
      ...options,
      provider: fallback,
      noFallback: true, // evita cascata infinita
    });
    return { ...result, fallbackFrom: primary };
  }
}

// List available voices per provider
const VOICES = {
  elevenlabs: {
    'Rachel': '21m00Tcm4TlvDq8ikWAM',
    'Domi': 'AZnzlk1XvdvUeBnXmlld',
    'Bella': 'EXAVITQu4vr4xnSDxMaL',
    'Antoni': 'ErXwobaYiN019PkySvjV',
    'Josh': 'TxGEqnHWrfWFTfGW9XjX',
    'Arnold': 'VR6AewLTigWG4xSOukaG',
  },
  fish: {
    'Bella': 'f18e96e1ed024df98860f6ff60bd6695',
    'Warm Gentle Midage': '5b0bdf4a1e9c46e4b8469730ade927b9',
    'Ana Brazilian': '2f41253e0f234410ab6d00a6f3617a21',
  },
  'chatterbox-vc': {
    'Rachel': 'rachel',  // → media/voice-refs/rachel.wav (default)
    'Bella':  'bella',   // → media/voice-refs/bella.wav
  },
};

// ── HTTP Helpers ────────────────────────────────────────────────────────────

function httpPost(host, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host, path: urlPath, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpPostBinaryLocal(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      host: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString('utf-8').slice(0, 300)}`));
        resolve(buffer);
      });
    });
    req.on('error', reject);
    req.setTimeout(600000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

function httpPostBinary(host, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host, path: urlPath, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`));
        else resolve(buffer);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  generateSpeech,
  generateSpeechSingle,
  generateElevenLabs,
  generateMiniMax,
  generatePiper,
  generateFishAudio,
  generateChatterboxVC,
  VOICES,
};
