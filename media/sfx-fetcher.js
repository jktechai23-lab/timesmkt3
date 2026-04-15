/**
 * Sound Effects Fetcher — Multi-provider SFX
 *
 * Supports: Freesound.org, Pixabay Audio
 *
 * Usage:
 *   const { fetchSFX } = require('./sfx-fetcher');
 *   await fetchSFX('coffee pour', 'output.mp3', { provider: 'freesound' });
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getEnvVar, getBestProvider } = require('./providers');

// ── Freesound.org ───────────────────────────────────────────────────────────

async function fetchFreesound(query, outputPath, options = {}) {
  const apiKey = getEnvVar('FREESOUND_API_KEY');
  if (!apiKey) throw new Error('FREESOUND_API_KEY not configured');

  const duration = options.maxDuration || 10; // max seconds

  // URLSearchParams escapa tudo corretamente, incluindo o filter com [0 TO N]
  const params = new URLSearchParams({
    query,
    filter: `duration:[0 TO ${duration}]`,
    fields: 'id,name,previews,duration,license,username',
    page_size: '1',
    sort: 'rating_desc',
    token: apiKey,
  });
  const url = `/apiv2/search/text/?${params.toString()}`;

  const response = await httpGet('freesound.org', url);
  const data = JSON.parse(response);

  if (!data.results || data.results.length === 0) {
    throw new Error(`No Freesound results for: ${query}`);
  }

  const sound = data.results[0];
  const previewUrl = sound.previews['preview-hq-mp3'] || sound.previews['preview-lq-mp3'];

  await downloadFile(previewUrl, outputPath);
  console.log(`  ✅ Freesound SFX saved: ${outputPath} (${sound.name}, ${sound.duration.toFixed(1)}s)`);
  return {
    provider: 'freesound',
    name: sound.name,
    duration: sound.duration,
    license: sound.license,
    author: sound.username,
    path: outputPath,
  };
}

// ── Pixabay Audio ───────────────────────────────────────────────────────────

async function fetchPixabay(query, outputPath, options = {}) {
  const apiKey = getEnvVar('PIXABAY_API_KEY');
  // Pixabay requires API key for their API, but we can use their public search
  const keyParam = apiKey ? `&key=${apiKey}` : '';
  const category = options.category || ''; // music, sfx

  const url = `/api/?q=${encodeURIComponent(query)}&audio_type=${category}&per_page=3${keyParam}`;

  try {
    const response = await httpGet('pixabay.com', url);
    const data = JSON.parse(response);

    if (!data.hits || data.hits.length === 0) {
      throw new Error(`No Pixabay results for: ${query}`);
    }

    const audio = data.hits[0];
    await downloadFile(audio.audio, outputPath);
    console.log(`  ✅ Pixabay SFX saved: ${outputPath}`);
    return { provider: 'pixabay', path: outputPath };
  } catch (err) {
    throw new Error(`Pixabay fetch failed: ${err.message}`);
  }
}

// ── Unified Interface ───────────────────────────────────────────────────────

async function fetchSFX(query, outputPath, options = {}) {
  const provider = options.provider || getBestProvider('sfx')?.id || 'freesound';

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  switch (provider) {
    case 'freesound': return fetchFreesound(query, outputPath, options);
    case 'pixabay-sfx': return fetchPixabay(query, outputPath, { ...options, category: 'sfx' });
    default: throw new Error(`Unknown SFX provider: ${provider}`);
  }
}

async function fetchMusic(query, outputPath, options = {}) {
  const provider = options.provider || getBestProvider('music')?.id || 'pixabay-music';

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  switch (provider) {
    case 'pixabay-music': return fetchPixabay(query, outputPath, { ...options, category: 'music' });
    case 'freesound': return fetchFreesound(query, outputPath, options);
    default: throw new Error(`Unknown music provider: ${provider}`);
  }
}

// ── HTTP Helpers ────────────────────────────────────────────────────────────

function httpGet(host, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path: urlPath, method: 'GET', headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = new URL(res.headers.location);
        httpGet(redirectUrl.host, redirectUrl.pathname + redirectUrl.search, headers)
          .then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      const file = fs.createWriteStream(outputPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

module.exports = {
  fetchSFX,
  fetchMusic,
  fetchFreesound,
  fetchPixabay,
};
