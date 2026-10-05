export const PlaybackKind = Object.freeze({
  VOD: 'vod',
  LIVE: 'live',
});

export const PlaybackRequestStatus = Object.freeze({
  CREATED: 'created',
  LOADING: 'loading',
  PLAYING: 'playing',
  FAILED: 'failed',
  STOPPED: 'stopped',
  RELEASED: 'released',
});

export const PlaybackFailureCode = Object.freeze({
  NETWORK: 'network',
  PARSER: 'parser',
  PLAYER: 'player',
  EXPIRED: 'expired',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
});

export function createPlaybackCandidateId({
  kind,
  sourceId,
  streamId = '',
  contentId = '',
  episodeId = '',
  channelId = '',
  mediaUrl = '',
}) {
  const identity = [kind, sourceId, streamId, contentId, episodeId, channelId, mediaUrl].map((value) => String(value ?? '').trim()).join('|');
  return `candidate:${encodeURIComponent(identity)}`;
}

export function normalizePlaybackCandidate(input = {}) {
  const mediaUrl = String(input.mediaUrl ?? input.url ?? '').trim();
  const kind = input.kind === PlaybackKind.LIVE ? PlaybackKind.LIVE : PlaybackKind.VOD;
  const candidate = {
    candidateId: input.candidateId || createPlaybackCandidateId({ ...input, kind, mediaUrl }),
    mediaUrl,
    sourceId: String(input.sourceId ?? '').trim(),
    streamId: input.streamId ? String(input.streamId) : undefined,
    contentId: input.contentId ? String(input.contentId) : undefined,
    episodeId: input.episodeId ? String(input.episodeId) : undefined,
    channelId: input.channelId ? String(input.channelId) : undefined,
    protocol: input.protocol ? String(input.protocol).toLowerCase() : inferProtocol(mediaUrl),
    headers: { ...(input.headers ?? {}) },
    cookies: input.cookies ?? '',
    referer: input.referer ?? '',
    userAgent: input.userAgent ?? '',
    token: input.token ?? undefined,
    timeoutMs: input.timeoutMs ?? undefined,
    retryCount: input.retryCount ?? undefined,
    expiresAt: input.expiresAt ?? undefined,
    parserHint: input.parserHint ?? undefined,
    playerHint: input.playerHint ?? undefined,
    priority: Number.isFinite(input.priority) ? input.priority : 0,
    metadata: { ...(input.metadata ?? {}) },
    kind,
  };
  if (!candidate.mediaUrl) throw new Error('PLAYBACK_CANDIDATE_URL_REQUIRED');
  return candidate;
}

export function isPlaybackCandidateExpired(candidate, now = Date.now()) {
  if (!candidate?.expiresAt) return false;
  const expiresAt = typeof candidate.expiresAt === 'number' ? candidate.expiresAt : Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function createPlaybackRequest(input = {}) {
  const candidates = (input.candidates ?? []).map(normalizePlaybackCandidate);
  const requestId = input.requestId || `playback-request:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const taskId = input.taskId || `playback-task:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    requestId,
    taskId,
    kind: input.kind === PlaybackKind.LIVE ? PlaybackKind.LIVE : PlaybackKind.VOD,
    contentId: input.contentId,
    episodeId: input.episodeId,
    channelId: input.channelId,
    candidates: candidates.map((candidate) => ({ ...candidate, headers: { ...candidate.headers }, metadata: { ...candidate.metadata } })),
    primaryCandidateId: candidates[0]?.candidateId ?? null,
    fallbackCandidateIds: candidates.slice(1).map((candidate) => candidate.candidateId),
    createdAt: Date.now(),
    metadata: { ...(input.metadata ?? {}) },
  };
}

function inferProtocol(url) {
  const value = String(url ?? '').toLowerCase();
  if (value.includes('.m3u8')) return 'hls';
  if (value.includes('.mpd')) return 'dash';
  if (value.startsWith('rtmp://')) return 'rtmp';
  if (value.startsWith('rtsp://')) return 'rtsp';
  if (/\.flv(?:\?|$)/.test(value)) return 'flv';
  return 'http';
}
