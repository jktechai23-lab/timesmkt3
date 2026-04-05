/**
 * Multi-provider TTS audio generator for pipeline narration.
 *
 * Usage:
 *   node pipeline/generate-audio.js <output_mp3> <text> [voice_id_or_name] [--provider <auto|elevenlabs|minimax|openai>]
 */

const { generateSpeech } = require('../media/tts-generator');
const { getEnv } = require('../config/env');

const DEFAULT_VOICE = 'rachel';
const ELEVENLABS_VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  bella: 'EXAVITQu4vr4xnSDxMaL',
  antoni: 'ErXwobaYiN019PkySvjV',
  domi: 'AZnzlk1XvdvUeBnXmlld',
  josh: 'TxGEqnHWrfWFTfGW9XjX',
  arnold: 'VR6AewLTigWG4xSOukaG',
};

const OPENAI_VOICE_MAP = {
  rachel: 'nova',
  bella: 'nova',
  domi: 'shimmer',
  antoni: 'onyx',
  josh: 'onyx',
  arnold: 'echo',
};

const MINIMAX_VOICE_MAP = {
  rachel: 'female-shaonv',
  bella: 'female-shaonv',
  domi: 'female-shaonv',
  antoni: 'male-qn-qingse',
  josh: 'male-qn-qingse',
  arnold: 'male-qn-qingse',
};

const DEFAULT_PROVIDER_ORDER = ['elevenlabs', 'minimax', 'openai-tts'];

function normalizeProvider(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value === 'auto') return null;
  if (value === 'openai') return 'openai-tts';
  return value;
}

function parseCliArgs(argv) {
  const args = [...argv];
  let provider = '';

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--provider') {
      provider = args[i + 1] || '';
      args.splice(i, 2);
      i -= 1;
    }
  }

  return {
    outputPath: args[0],
    text: args[1],
    voiceIdOrName: args[2] || DEFAULT_VOICE,
    provider,
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildProviderOrder(explicitProvider) {
  const requested = normalizeProvider(explicitProvider || getEnv('TTS_PROVIDER', ''));
  if (requested) return [requested];
  return unique(DEFAULT_PROVIDER_ORDER);
}

function providerLabel(provider) {
  return provider === 'openai-tts' ? 'openai' : provider;
}

function buildSpeechOptions(provider, voiceIdOrName) {
  const voice = String(voiceIdOrName || DEFAULT_VOICE).trim();
  const voiceKey = voice.toLowerCase();

  switch (provider) {
    case 'elevenlabs':
      return { voiceId: ELEVENLABS_VOICES[voiceKey] || voice || ELEVENLABS_VOICES.rachel };
    case 'minimax':
      return { voiceId: MINIMAX_VOICE_MAP[voiceKey] || voice || MINIMAX_VOICE_MAP.rachel };
    case 'openai-tts':
      return { voice: OPENAI_VOICE_MAP[voiceKey] || voice || OPENAI_VOICE_MAP.rachel };
    default:
      return {};
  }
}

async function generateAudio(outputPath, text, voiceIdOrName = DEFAULT_VOICE, preferredProvider = '') {
  const providers = buildProviderOrder(preferredProvider);
  const errors = [];

  for (const provider of providers) {
    try {
      const result = await generateSpeech(text, outputPath, {
        provider,
        ...buildSpeechOptions(provider, voiceIdOrName),
      });
      return { ...result, provider };
    } catch (err) {
      errors.push(`${providerLabel(provider)}: ${err.message}`);
      if (normalizeProvider(preferredProvider)) break;
    }
  }

  throw new Error(`TTS generation failed (${providerLabel(normalizeProvider(preferredProvider) || 'auto')}): ${errors.join(' | ')}`);
}

if (require.main === module) {
  const { outputPath, text, voiceIdOrName, provider } = parseCliArgs(process.argv.slice(2));
  if (!outputPath || !text) {
    console.error('Usage: node pipeline/generate-audio.js <output.mp3> <text> [voice_id_or_name] [--provider <auto|elevenlabs|minimax|openai>]');
    process.exit(1);
  }

  generateAudio(outputPath, text, voiceIdOrName, provider)
    .then((result) => {
      console.log(`✅ Audio saved: ${result.path}`);
      console.log(`Provider: ${providerLabel(result.provider)}`);
    })
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  generateAudio,
  normalizeProvider,
};
