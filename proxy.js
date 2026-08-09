import { pipeline } from 'stream';
import { Readable } from 'stream';

const TIMEOUT_MS = 15000;
const CF_WORKER_URL = process.env.CF_WORKER_URL || null;
const MANIFEST_CACHE_TTL_MS = 4000;
const MANIFEST_CACHE_MAX_ENTRIES = 200;
const SEGMENT_RETRY_COUNT = 1;
const SEGMENT_RETRY_DELAY_MS = 300;

const manifestCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(fetchUrl, options, retries) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(fetchUrl, options);
      if (response.status >= 500 && attempt < retries) {
        await sleep(SEGMENT_RETRY_DELAY_MS);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError' || attempt === retries) throw error;
      await sleep(SEGMENT_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function manifestType(url, contentType) {
  const path = url.toLowerCase().split('?')[0];
  if (path.endsWith('.m3u8') ||
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('application/x-mpegurl')) {
    return 'hls';
  }
  if (path.endsWith('.mpd') || contentType.includes('application/dash+xml')) {
    return 'dash';
  }
  return null;
}

function rewriteHlsManifest(manifest, manifestUrl, proxyBase) {
  const toProxied = (raw) => {
    try {
      const absolute = new URL(raw, manifestUrl).href;
      return `${proxyBase}?url=${encodeURIComponent(absolute)}`;
    } catch {
      return raw;
    }
  };

  return manifest
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
        return line.replace(/URI="([^"]+)"/, (_match, uri) => `URI="${toProxied(uri)}"`);
      }

      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      return toProxied(trimmed);
    })
    .join('\n');
}

function rewriteDashManifest(manifest, manifestUrl, proxyBase) {
  const toProxied = (raw) => {
    try {
      const absolute = new URL(raw, manifestUrl).href;
      return `${proxyBase}?url=${encodeURIComponent(absolute)}`;
    } catch {
      return raw;
    }
  };

  let rewritten = manifest.replace(
    /<BaseURL>([^<]+)<\/BaseURL>/g,
    (_match, url) => `<BaseURL>${toProxied(url.trim())}</BaseURL>`
  );

  rewritten = rewritten.replace(
    /\b(media|initialization|sourceURL)="([^"]+)"/g,
    (match, attr, url) => {
      if (url.includes('$')) return match;
      return `${attr}="${toProxied(url)}"`;
    }
  );

  return rewritten;
}

function cacheKeyFor(url) {
  return url;
}

function getCachedManifest(url) {
  const entry = manifestCache.get(cacheKeyFor(url));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    manifestCache.delete(cacheKeyFor(url));
    return null;
  }
  return entry;
}

function setCachedManifest(url, body, contentType, status) {
  if (manifestCache.size >= MANIFEST_CACHE_MAX_ENTRIES) {
    const oldestKey = manifestCache.keys().next().value;
    manifestCache.delete(oldestKey);
  }
  manifestCache.set(cacheKeyFor(url), {
    body,
    contentType,
    status,
    expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS,
  });
}

function applyHeaders(res, response) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const contentType = response.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);

  const contentLength = response.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  const contentRange = response.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);

  res.setHeader('Accept-Ranges', response.headers.get('accept-ranges') || 'bytes');
}

export const proxyMedia = async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: 'missing url' });
  }

  const cached = getCachedManifest(url);
  if (cached) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('X-Proxy-Cache', 'HIT');
    res.status(cached.status);
    return res.send(cached.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const range = req.headers.range;

    const referer = (() => { try { const u = new URL(url); return `${u.protocol}//${u.hostname}`; } catch { return ''; } })();

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': referer,
    };

    if (range) headers.Range = range;

    const fetchUrl = CF_WORKER_URL
      ? `${CF_WORKER_URL}?url=${encodeURIComponent(url)}`
      : url;

    const response = await fetchWithRetry(
      fetchUrl,
      { headers, redirect: 'follow', signal: controller.signal },
      SEGMENT_RETRY_COUNT
    );

    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      return res.status(422).json({ error: 'url returned html, not a media file' });
    }

    const type = manifestType(url, contentType);

    if (type) {
      const manifest = await response.text();
      const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;
      const rewritten = type === 'hls'
        ? rewriteHlsManifest(manifest, url, proxyBase)
        : rewriteDashManifest(manifest, url, proxyBase);
      const outContentType = type === 'hls'
        ? 'application/vnd.apple.mpegurl'
        : 'application/dash+xml';

      setCachedManifest(url, rewritten, outContentType, response.status);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', outContentType);
      res.setHeader('X-Proxy-Cache', 'MISS');
      res.status(response.status);
      return res.send(rewritten);
    }

    applyHeaders(res, response);
    res.status(response.status);

    if (!response.body) return res.end();

    const nodeStream = Readable.fromWeb(response.body);

    pipeline(nodeStream, res, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.error('stream error', err.message);
      }
    });

  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'upstream timeout' });
    }
    console.error('proxy error', error.message);
    res.status(500).json({ error: 'proxy failed' });
  }
};
