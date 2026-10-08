import { toPunycodeUrl } from '../utils/punycode.js';
import { requestAdapter } from './requestAdapter.js';

/**
 * Concise User-Agent string to avoid anti-scraping challenges
 * Many TVBox CMS/JSON endpoints check User-Agent and block full browser signatures.
 */
export const CONCISE_USER_AGENT = 'okhttp/3.15';

/**
 * Strips single-line (//) and multi-line block (/* ... * /) comments from raw JSON strings
 */
export function stripJSONComments(str) {
  if (!str) return '';
  let out = '';
  let inString = false;
  let i = 0;
  const len = str.length;
  while (i < len) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      out += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      i += 1;
    } else if (char === '/' && nextChar === '/') {
      i += 2;
      while (i < len && str[i] !== '\n' && str[i] !== '\r') i += 1;
    } else if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < len && !(str[i] === '*' && str[i + 1] === '/')) i += 1;
      i += 2;
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

/**
 * Sanitizes unescaped control characters inside string literals (newlines, tabs, null bytes)
 */
export function sanitizeJSONControlChars(str) {
  if (!str) return '';
  let out = '';
  let inString = false;
  let i = 0;
  const len = str.length;
  while (i < len) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
        out += char;
      } else if (char === '\n') {
        out += '\\n';
      } else if (char === '\r') {
        out += '\\r';
      } else if (char === '\t') {
        out += '\\t';
      } else if (char.charCodeAt(0) < 0x20) {
        out += ' ';
      } else {
        out += char;
      }
      i += 1;
      continue;
    }
    if (char === '"') inString = true;
    out += char;
    i += 1;
  }
  return out;
}

/**
 * Strips trailing commas from object and array literals in JSON strings
 */
export function stripTrailingCommas(str) {
  if (!str) return '';
  let out = '';
  let inString = false;
  let i = 0;
  const len = str.length;
  while (i < len) {
    const char = str[i];
    const nextChar = str[i + 1];
    if (inString) {
      if (char === '\\') {
        out += char + (nextChar || '');
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      out += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      i += 1;
      continue;
    }
    if (char === ',') {
      let j = i + 1;
      while (j < len && /\s/.test(str[j])) j += 1;
      if (str[j] === '}' || str[j] === ']') {
        i += 1;
        continue;
      }
    }
    out += char;
    i += 1;
  }
  return out;
}

/**
 * Robust relaxed JSON parser for TVBox configuration files
 */
export function parseRobustTVBoxConfig(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('CONFIG_EMPTY_PAYLOAD');
  }
  let raw = text.replace(/^\uFEFF/, '').trim();
  if (!raw) throw new Error('CONFIG_EMPTY_PAYLOAD');

  // Handle Base64-encoded TVBox configuration payload
  if (/^([A-Za-z0-9+/=_-]{40,})$/.test(raw) || raw.startsWith('**')) {
    const candidate = raw.startsWith('**') ? raw.slice(2) : raw;
    try {
      const decoded = typeof atob === 'function' ? atob(candidate) : Buffer.from(candidate, 'base64').toString('utf-8');
      if (decoded && (decoded.includes('{') || decoded.includes('['))) {
        raw = decoded.trim();
      }
    } catch {}
  }

  const cleaned = stripTrailingCommas(sanitizeJSONControlChars(stripJSONComments(raw)));
  return JSON.parse(cleaned);
}

/**
 * Determines whether an error is transient (eligible for retry) or deterministic (skip retry)
 */
function isTransientError(error, status) {
  // If HTTP status code is 4xx or 5xx, this is a deterministic server response -> DO NOT RETRY
  if (status && status >= 400) {
    return false;
  }

  const msg = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  // Known transient errors
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('empty_response') ||
    name === 'aborterror' ||
    name === 'timeouterror' ||
    code === 'timeout'
  ) {
    return true;
  }

  return false;
}

/**
 * Sleep helper for backoff
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch a single URL with Punycode conversion, concise UA, and Smart Retry
 */
export async function fetchWithSmartRetry(rawUrl, options = {}) {
  const punycodeUrl = toPunycodeUrl(rawUrl);
  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 2;
  const timeoutMs = options.timeoutMs || 6000;
  let lastError = null;
  let lastStatus = 0;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    attempts += 1;
    const startTime = Date.now();
    try {
      const res = await requestAdapter.request(punycodeUrl, {
        headers: {
          'User-Agent': CONCISE_USER_AGENT,
          'Accept': 'application/json, text/plain, */*',
          ...(options.headers || {}),
        },
        timeoutMs,
        signal: options.signal,
      });

      const durationMs = Date.now() - startTime;
      lastStatus = res?.status || 200;

      if (!res.ok) {
        // Deterministic HTTP error (4xx / 5xx)
        const error = new Error(`HTTP_${lastStatus}`);
        error.status = lastStatus;
        error.durationMs = durationMs;
        // Do not retry 4xx/5xx - immediately throw to return / fallback
        throw error;
      }

      const bodyText = await res.text();
      if (!bodyText || !bodyText.trim()) {
        const emptyError = new Error('EMPTY_RESPONSE');
        emptyError.status = 200;
        emptyError.durationMs = durationMs;
        throw emptyError;
      }

      return {
        ok: true,
        text: bodyText,
        status: lastStatus,
        durationMs,
        punycodeUrl,
        attempts,
      };
    } catch (err) {
      lastError = err;
      const status = err?.status || lastStatus;
      const transient = isTransientError(err, status);

      // If NOT transient (e.g. 4xx/5xx deterministic failure), do not retry! Directly break and fail
      if (!transient || attempt >= maxRetries) {
        break;
      }

      // Backoff delay: 300ms, 600ms
      const backoff = (attempt + 1) * 300;
      await sleep(backoff);
    }
  }

  return {
    ok: false,
    text: null,
    status: lastStatus,
    error: lastError?.message || 'FETCH_FAILED',
    punycodeUrl,
    attempts,
  };
}

/**
 * Fetches a multi-repo config item with multi-address fallback
 * Tries primaryUrl first, then backupUrls in order
 */
export async function fetchRepoWithFallback(repo, options = {}) {
  const primary = String(repo.primaryUrl || repo.url || '').trim();
  const backups = Array.isArray(repo.backupUrls)
    ? repo.backupUrls.map(u => String(u || '').trim()).filter(Boolean)
    : [];

  const addressQueue = [...new Set([primary, ...backups].filter(Boolean))];
  if (!addressQueue.length) {
    return {
      ok: false,
      repoId: repo.id,
      name: repo.name,
      config: null,
      usedUrl: null,
      attempts: [],
      error: 'NO_VALID_URL',
    };
  }

  const attemptLogs = [];
  let successfulResult = null;

  for (let idx = 0; idx < addressQueue.length; idx += 1) {
    const candidateUrl = addressQueue[idx];
    const isPrimary = idx === 0;

    const result = await fetchWithSmartRetry(candidateUrl, options);
    attemptLogs.push({
      url: candidateUrl,
      punycodeUrl: result.punycodeUrl,
      isPrimary,
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs || 0,
      retryCount: Math.max(0, result.attempts - 1),
      error: result.error || null,
    });

    if (result.ok && result.text) {
      try {
        const parsed = parseRobustTVBoxConfig(result.text);
        successfulResult = {
          usedUrl: candidateUrl,
          punycodeUrl: result.punycodeUrl,
          durationMs: result.durationMs,
          config: parsed,
        };
        break; // Successfully fetched! No need to try remaining backup URLs
      } catch (parseError) {
        // JSON parsing failure on this URL
        attemptLogs[attemptLogs.length - 1].parseError = parseError.message;
        attemptLogs[attemptLogs.length - 1].ok = false;
      }
    }
  }

  if (successfulResult) {
    return {
      ok: true,
      repoId: repo.id,
      name: repo.name,
      usedUrl: successfulResult.usedUrl,
      punycodeUrl: successfulResult.punycodeUrl,
      durationMs: successfulResult.durationMs,
      config: successfulResult.config,
      attempts: attemptLogs,
    };
  }

  return {
    ok: false,
    repoId: repo.id,
    name: repo.name,
    usedUrl: null,
    config: null,
    attempts: attemptLogs,
    error: attemptLogs[attemptLogs.length - 1]?.error || 'ALL_ADDRESSES_FAILED',
  };
}
