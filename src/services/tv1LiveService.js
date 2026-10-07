import { requestAdapter } from './requestAdapter.js';
import { parseTXTLiveMetadataStream, parseTXTLiveLineStreams } from '../adapters/live/txtParser.js';
import { normalizeLiveChannel } from '../adapters/live/normalizeLive.js';

function isTv1Source(source) {
  return source?.sourceType === 'live' && source?.liveMode === 'tv1';
}

const sessions = new Map();

async function fetchBody(source, options = {}) {
  const response = source.localContent != null
    ? { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/plain' }), text: async () => String(source.localContent) }
    : await requestAdapter.request(source.sourceRef || source.url, {
        headers: source.headers ?? {},
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        transport: options.transport,
      });
  if (!response.ok) throw new Error('HTTP_' + response.status);
  return response.text();
}

function createSession(source, body) {
  const lines = String(body).replace(/^\uFEFF/, '').split(/\r?\n/);
  const session = { sourceId: source.sourceId, lines, metadata: [], createdAt: Date.now() };
  sessions.set(source.sourceId, session);
  return session;
}

export const tv1LiveService = {
  isSupportedSource: isTv1Source,

  async loadMetadata(source, options = {}) {
    if (!isTv1Source(source)) throw new Error('TV1_SOURCE_REQUIRED');
    const existing = sessions.get(source.sourceId);
    if (existing && Array.isArray(existing.channels) && existing.channels.length > 0 && !options.force) {
      if (typeof options.onChannel === 'function') {
        for (const channel of existing.channels) {
          options.onChannel(channel);
        }
      }
      return existing.channels;
    }

    const body = await fetchBody(source, options);
    const session = createSession(source, body);
    const capabilities = { search: true, categories: true, multiStream: true, epg: false, currentProgram: false, upcomingProgram: false };
    const result = [];
    session.metadata = [];
    await parseTXTLiveMetadataStream(body, async item => {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      session.metadata.push(item);
      const channel = normalizeLiveChannel({
        sourceId: source.sourceId,
        item,
        index: result.length,
        capabilities,
      });
      result.push(channel);
      if (typeof options.onChannel === 'function') options.onChannel(channel);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    session.channels = result;
    return result;
  },

  async getStreams(source, channelRef, options = {}) {
    if (!isTv1Source(source)) throw new Error('TV1_SOURCE_REQUIRED');
    const session = sessions.get(source.sourceId);
    if (!session) await this.loadMetadata(source, options);
    const activeSession = sessions.get(source.sourceId);
    const lineIndices = channelRef?.deferredRef?.lineIndices ?? (channelRef?.deferredRef?.lineIndex != null ? [channelRef.deferredRef.lineIndex] : []);
    if (!lineIndices.length) return [];
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let rawStreams = [];
    for (const idx of lineIndices) {
      if (activeSession.lines[idx]) {
        const lineStreams = parseTXTLiveLineStreams(activeSession.lines[idx]);
        rawStreams.push(...lineStreams);
      }
    }

    return rawStreams.map((stream, index) => ({
      ...stream,
      label: stream.label === '线路 1' || /^线路 \d+$/.test(stream.label) ? `线路 ${index + 1}` : stream.label,
      streamId: 'stream:' + source.sourceId + ':' + channelRef.sourceItemId + ':' + (index + 1),
      sourceId: source.sourceId,
      sourceChannelId: source.sourceId + ':' + channelRef.sourceItemId,
      sourceItemId: channelRef.sourceItemId,
      protocol: stream.protocol || (() => {
        const value = String(stream.url || '').trim().toLowerCase();
        if (/\.m3u8(?:[?#]|$)/i.test(value) || value.includes('/pltv/') || value.includes('/tvod/')) return 'hls';
        if (value.startsWith('rtmp://')) return 'rtmp';
        if (value.startsWith('rtsp://')) return 'rtsp';
        if (/\.flv(?:[?#]|$)/i.test(value)) return 'flv';
        if (/\.mpd(?:[?#]|$)/i.test(value)) return 'dash';
        return 'http';
      })(),
      priority: index,
      status: 'unknown',
      lastCheckedAt: null,
      failureCode: null,
      failureCount: 0,
      updatedAt: Date.now(),
    }));
  },

  async load(source, options = {}) {
    return this.loadMetadata(source, options);
  },

  async healthCheck(source, options = {}) {
    try {
      const channels = await this.loadMetadata(source, options);
      return { ok: channels.length > 0, sourceId: source.sourceId, status: channels.length ? 'healthy' : 'empty', checkedAt: Date.now(), error: null };
    } catch (error) {
      return { ok: false, sourceId: source.sourceId, status: 'error', checkedAt: Date.now(), error };
    }
  },

  clear(sourceId = null) {
    if (sourceId) sessions.delete(sourceId);
    else sessions.clear();
  },
};
