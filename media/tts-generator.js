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
const { execFileSync } = require('child_process');
const { getEnvVar, getBestProvider } = require('./providers');

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

// ── OpenAI TTS ──────────────────────────────────────────────────────────────

async function generateOpenAITTS(text, outputPath, options = {}) {
  const apiKey = getEnvVar('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const voice = options.voice || 'nova'; // alloy, echo, fable, onyx, nova, shimmer
  const model = options.model || 'tts-1'; // tts-1 or tts-1-hd
  const speed = options.speed || 1.0;

  const body = JSON.stringify({
    model,
    input: text,
    voice,
    speed,
    response_format: 'mp3',
  });

  const audioBuffer = await httpPostBinary(
    'api.openai.com',
    '/v1/audio/speech',
    body,
    {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
  );

  fs.writeFileSync(outputPath, audioBuffer);
  console.log(`  ✅ OpenAI TTS saved: ${outputPath} (voice: ${voice})`);
  return { provider: 'openai-tts', voice, chars: text.length, path: outputPath };
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

async function generateSpeech(text, outputPath, options = {}) {
  const provider = options.provider || getBestProvider('tts')?.id || 'openai-tts';

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  switch (provider) {
    case 'elevenlabs': return generateElevenLabs(text, outputPath, options);
    case 'minimax': return generateMiniMax(text, outputPath, options);
    case 'openai-tts': return generateOpenAITTS(text, outputPath, options);
    case 'local-piper': return generatePiper(text, outputPath, options);
    default: throw new Error(`Unknown TTS provider: ${provider}`);
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
  'openai-tts': {
    'alloy': 'Neutral, balanced',
    'echo': 'Warm, conversational',
    'fable': 'Expressive, British',
    'onyx': 'Deep, authoritative',
    'nova': 'Friendly, female',
    'shimmer': 'Soft, gentle',
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
  generateElevenLabs,
  generateMiniMax,
  generateOpenAITTS,
  generatePiper,
  VOICES,
};
