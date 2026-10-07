import { liveService } from '../../services/liveService.js';
import { requestManager } from '../../services/requestManager.js';
import { tv1LiveService } from '../../services/tv1LiveService.js';

// Global Live State Cache across Tab Navigations
export const globalLiveCache = {
  tv1Channels: [],
  selectedChannelId: '',
  selectedCategory: '全部',
  resolvedStreams: {},
  activeStreamIndex: 0,
  decoderEngine: 'exo',
  isImmersive: false,
};

export async function resolveLiveChannelStreams(channel, { sources = [], signal } = {}) {
  if (!channel) return [];
  if (Array.isArray(channel.streams) && channel.streams.length) return channel.streams;
  if (!channel.deferredRef) return [];

  const tv1Source = channel.sourceRefs?.find(ref =>
    sources.some(source =>
      source.sourceId === ref.sourceId
      && source.sourceType === 'live'
      && source.liveMode === 'tv1'
      && source.enabled !== false
    )
  );
  const source = tv1Source
    ? sources.find(item => item.sourceId === tv1Source.sourceId)
    : null;

  if (source) {
    return requestManager.run(
      'tv1-streams:' + source.sourceId + ':' + channel.channelId,
      requestSignal => tv1LiveService.getStreams(source, channel, {
        signal: signal || requestSignal,
      }),
    );
  }

  return requestManager.run(
    'live-deferred-streams:' + channel.channelId,
    requestSignal => liveService.getStreams(channel, {
      signal: signal || requestSignal,
    }),
  );
}
