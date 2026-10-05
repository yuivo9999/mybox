export const PlaybackErrorKind = Object.freeze({
  NETWORK: 'network',
  PARSER: 'parser',
  PLAYER: 'player',
  EXPIRED: 'expired',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
});

export function classifyPlaybackError(error, context = {}) {
  const code = String(context.code ?? error?.code ?? error?.message ?? '').toLowerCase();
  if (code.includes('expired') || code.includes('sessionexpired')) return PlaybackErrorKind.EXPIRED;
  if (code.includes('unsupported') || code.includes('notmatched')) return PlaybackErrorKind.UNSUPPORTED;
  if (code.includes('parser') || code.includes('manifest')) return PlaybackErrorKind.PARSER;
  if (code.includes('network') || code.includes('timeout') || code.includes('media_load')) return PlaybackErrorKind.NETWORK;
  if (error?.name === 'NotSupportedError') return PlaybackErrorKind.UNSUPPORTED;
  return context.fromParser ? PlaybackErrorKind.PARSER : PlaybackErrorKind.PLAYER;
}
