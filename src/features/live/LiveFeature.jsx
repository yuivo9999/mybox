import React, { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { ChevronLeft, Heart, Play, Radio, ListVideo, Sparkles } from 'lucide-react';
import { liveService } from '../../services/liveService.js';
import { playbackService } from '../../services/playbackService.js';
import { requestManager } from '../../services/requestManager.js';
import { tv1LiveService } from '../../services/tv1LiveService.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState, LoadingState } from '../../components/StateViews.jsx';

export function createLiveFeature({ channels = [] } = {}) {
  return {
    getCategories() { return liveService.getCategories(channels); },
    list(options = {}) { return liveService.listChannels(channels, options); },
    getChannel(id) { return liveService.getById(channels, id); },
    async getEPG(channel, range) { return liveService.getEPG(channel, range); },
  };
}

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

export function LiveFeature({
  channels = [],
  sources = [],
  favorites = [],
  onChannel,
  onPlay,
  onTab,
  toggleFavorite,
}) {
  const page = usePageState();
  const [selectedCategory, setSelectedCategory] = useState(globalLiveCache.selectedCategory || page?.live?.category || '全部');
  const [tv1Channels, setTv1Channels] = useState(globalLiveCache.tv1Channels || []);
  const [tv1Loading, setTv1Loading] = useState(false);
  const [tv1LoadedCount, setTv1LoadedCount] = useState(globalLiveCache.tv1Channels?.length || 0);
  const [tv1Error, setTv1Error] = useState(null);

  const enabledTv1Sources = useMemo(
    () => sources.filter(source => source.sourceType === 'live' && source.liveMode === 'tv1' && source.enabled !== false),
    [sources],
  );

  useEffect(() => { globalLiveCache.selectedCategory = selectedCategory; }, [selectedCategory]);
  useEffect(() => { globalLiveCache.tv1Channels = tv1Channels; }, [tv1Channels]);

  useEffect(() => {
    let active = true;
    setTv1Error(null);
    if (!enabledTv1Sources.length) {
      setTv1Loading(false);
      return () => { active = false; };
    }

    if (globalLiveCache.tv1Channels && globalLiveCache.tv1Channels.length > 0) {
      setTv1Channels(globalLiveCache.tv1Channels);
      setTv1Loading(false);
      return () => { active = false; };
    }

    setTv1Loading(true);
    const loadSource = async source => {
      try {
        await tv1LiveService.loadMetadata(source, {
          onChannel: channel => {
            if (!active) return;
            startTransition(() => {
              setTv1Channels(prev => {
                const next = [...prev, channel];
                globalLiveCache.tv1Channels = next;
                return next;
              });
              setTv1LoadedCount(count => count + 1);
            });
          },
        });
      } catch (error) {
        if (active && error?.name !== 'AbortError') setTv1Error(error);
      }
    };

    void Promise.all(enabledTv1Sources.map(loadSource)).finally(() => {
      if (active) setTv1Loading(false);
    });

    return () => {
      active = false;
    };
  }, [enabledTv1Sources]);

  const allChannels = useMemo(() => [...channels, ...tv1Channels], [channels, tv1Channels]);

  useEffect(() => {
    const top = Number(page.live?.scrollTop) || 0;
    requestAnimationFrame(() => window.scrollTo(0, top));
    const save = () => pageStateStore.patch('live', { scrollTop: window.scrollY });
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  const hasEnabledLiveSource = sources.some(source => source.sourceType === 'live' && source.enabled !== false);

  const categoriesList = useMemo(() => {
    const cats = new Set();
    allChannels.forEach(c => { if (c.category) cats.add(c.category); });
    return ['全部', ...Array.from(cats)];
  }, [allChannels]);

  const filteredChannels = useMemo(() => {
    if (selectedCategory === '全部') return allChannels;
    return allChannels.filter(c => (c.category || '未分类') === selectedCategory);
  }, [allChannels, selectedCategory]);

  return (
    <Page>
      <Header title="直播" />

      {hasEnabledLiveSource && (
        <>
          <div className="section-title">
            <h3>频道分组选台</h3>
            {tv1Loading && <small>正在读取：{tv1LoadedCount}</small>}
          </div>

          {tv1Error && <div className="info-card"><Radio size={18}/><div><b>部分 TV1 源读取异常</b><span>{tv1Error.message || '未知错误'}；已保留已读取的频道。</span></div></div>}

          {!allChannels.length && tv1Loading && (
            <LoadingState compact text="正在建立频道列表，暂不读取播放地址…" />
          )}

          {/* Category Tabs: Clicking tab changes channel filter */}
          {!!allChannels.length && (
            <div className="live-category-tabs-container">
              <div className="live-category-tabs-scroll">
                {categoriesList.map(cat => {
                  const count = cat === '全部' ? allChannels.length : allChannels.filter(c => (c.category || '未分类') === cat).length;
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`live-category-tab ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCategory(cat);
                        pageStateStore.patch('live', { category: cat });
                      }}
                    >
                      <span>{cat}</span>
                      <span className="count-badge">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Channel Cards Grid */}
          {!!filteredChannels.length && (
            <div className="live-channel-grid" aria-label="直播频道列表">
              {filteredChannels.map(channel => {
                const favorite = favorites.some(i => i.targetType === 'channel' && i.targetId === channel.channelId);
                const isLazy = Boolean(channel.deferredRef);
                const streamCount = channel.streams?.length ?? channel.estimatedStreamCount ?? channel.deferredRef?.lineIndices?.length ?? 0;

                return (
                  <div
                    key={channel.channelId}
                    className="live-channel-card"
                    onClick={() => (onPlay ? onPlay(channel) : onChannel?.(channel))}
                  >
                    <div className="card-logo">
                      <SmartImage src={channel.logo} alt={channel.name} fallback={<Radio size={20} />} />
                    </div>
                    <div className="card-main">
                      <div className="card-title">
                        <b>{channel.name}</b>
                      </div>
                      <div className="card-sub">
                        {isLazy ? 'TV1 专用直播' : channel.category} · {streamCount ? `${streamCount} 条线路` : '点击播放'}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`收藏 ${channel.name}`}
                      className={`card-fav-btn ${favorite ? 'active' : ''}`}
                      onClick={e => { e.stopPropagation(); toggleFavorite('channel', channel.channelId); }}
                    >
                      <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      aria-label={`播放 ${channel.name}`}
                      className="card-play-btn secondary icon-button"
                      onClick={e => {
                        e.stopPropagation();
                        onPlay ? onPlay(channel) : onChannel?.(channel);
                      }}
                    >
                      <Play size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!tv1Loading && !allChannels.length && <EmptyState text="暂无可用 Live 频道" />}
        </>
      )}
    </Page>
  );
}

export function LiveChannelPanel({
  channel,
  channels = [],
  sources = [],
  favorites = [],
  onBack,
  onPlay,
  onChannel,
  toggleFavorite,
}) {
  const feature = useMemo(() => createLiveFeature({ channels }), [channels]);
  const [epg, setEpg] = useState(channel?.epg ?? []);
  const [epgLoading, setEpgLoading] = useState(false);
  const [resolvedChannel, setResolvedChannel] = useState(channel);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState('');

  useEffect(() => {
    let active = true;
    setResolvedChannel(channel);
    setStreamError('');
    if (!channel?.deferredRef || channel?.streams?.length) {
      setStreamLoading(false);
      return () => { active = false; };
    }

    setStreamLoading(true);
    void resolveLiveChannelStreams(channel, { sources })
      .then(streams => {
        if (!active) return;
        setResolvedChannel(prev => prev?.channelId === channel.channelId
          ? { ...prev, streams }
          : prev);
      })
      .catch(error => {
        if (active && error?.name !== 'AbortError') {
          setStreamError(error?.message || '播放地址读取失败');
        }
      })
      .finally(() => {
        if (active) setStreamLoading(false);
      });

    return () => { active = false; };
  }, [channel, sources]);

  useEffect(() => {
    let active = true;
    if (channel?.capabilities?.epg === false) {
      setEpg(channel?.epg ?? []);
      setEpgLoading(false);
      return () => { active = false; };
    }
    setEpg(channel?.epg ?? []);
    setEpgLoading(true);
    const now = Date.now();
    const range = {
      startAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
    };
    feature.getEPG(channel, range).then(items => {
      if (active && items.length) setEpg(items);
    }).catch(() => {}).finally(() => {
      if (active) setEpgLoading(false);
    });
    return () => { active = false; };
  }, [channel, feature]);

  if (!channel) {
    return (
      <Page>
        <button className="back" onClick={onBack}><ChevronLeft />返回直播列表</button>
        <EmptyState text="频道不存在或已被移除" />
      </Page>
    );
  }
  const displayChannel = resolvedChannel?.channelId === channel.channelId ? resolvedChannel : channel;
  const streams = Array.isArray(displayChannel.streams) ? displayChannel.streams : [];
  const favorite = favorites.some(i => i.targetType === 'channel' && i.targetId === channel.channelId);
  const related = channels.filter(i => i.channelId !== channel.channelId && i.category === channel.category);
  const canPlay = streams.length > 0 && !streamLoading;

  const playResolved = (streamId = null) => {
    if (!canPlay) return;
    onPlay(displayChannel, streamId);
  };

  return (
    <Page>
      <button className="back" onClick={onBack}><ChevronLeft />返回直播列表</button>
      <div className="detail-hero live-detail">
        <div className="channel-logo large">
          <SmartImage src={channel.logo} alt={channel.name} fallback={<Radio size={34} />} />
        </div>
        <div>
          <span className="eyebrow">{channel.category} · {channel.sourceRefs?.length ?? 0} 个来源</span>
          <h1>{channel.name}</h1>
          <p>
            ● 正在直播 · {streamLoading ? '正在读取播放地址…' : streams.length + ' 条线路可用'}，频道身份与线路身份保持独立。
          </p>
          {streamError && <div className="info-card"><Radio size={18} /><div><b>线路读取失败</b><span>{streamError}</span></div></div>}
          <div className="actions">
            <button className="primary" disabled={!canPlay} onClick={() => playResolved()}>
              <Play size={16} />{streamLoading ? '读取线路…' : '播放'}
            </button>
            <button className={favorite ? 'secondary active-fav' : 'secondary'} onClick={() => toggleFavorite('channel', channel.channelId)}>
              <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
              {favorite ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      </div>
      <SectionTitle title="播放线路" />
      {streamLoading && <LoadingState compact text="正在按需读取频道播放地址…" />}
      {!streamLoading && !streams.length && <div className="empty compact"><span>{streamError || '暂无可用播放线路'}</span></div>}
      {!!streams.length && (
        <div className="channel-list">
          {streams.map(stream => (
            <button className="menu live-stream" key={stream.streamId} onClick={() => playResolved(stream.streamId)}>
              <Radio size={18} />
              <span>{stream.label || '默认线路'}<small>{stream.protocol || 'LIVE'} · {stream.sourceId || '—'}</small></span>
              <ChevronLeft className="flip" size={17} />
            </button>
          ))}
        </div>
      )}
      {channel.capabilities?.epg !== false && (
        <>
          <SectionTitle title="节目单" />
          {epgLoading && !epg.length && <LoadingState compact text="正在加载节目单…" />}
          {!epgLoading && !epg.length && <div className="empty compact"><span>暂无节目单</span></div>}
          {!!epg.length && (
            <div className="epg-list">
              {epg.map(program => (
                <div className="menu epg-item" key={program.programId}>
                  <span><b>{program.title || '未命名节目'}</b><small>{program.startAt || '—'} - {program.endAt || '—'}</small></span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!!related.length && (
        <>
          <SectionTitle title="频道列表" />
          <div className="channel-list">
            {channels.map(item => (
              <button className="menu" key={item.channelId} onClick={() => onChannel(item)}>
                <Radio size={18} />
                <span>{item.name}<small>{item.category}</small></span>
                <ChevronLeft className="flip" size={17} />
              </button>
            ))}
          </div>
          <SectionTitle title="同分类频道" />
          <div className="channel-list">
            {related.map(item => (
              <button className="menu" key={item.channelId} onClick={() => onChannel(item)}>
                <Radio size={18} />
                <span>{item.name}<small>{Array.isArray(item.streams) && item.streams.length ? item.streams.length + ' 条线路' : item.deferredRef ? '地址按需读取' : '暂无线路'}</small></span>
                <ChevronLeft className="flip" size={17} />
              </button>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

const Page = ({ children }) => <main className="page">{children}</main>;
const Header = ({ title }) => <header><div><span className="eyebrow">TVBOX REACT · LIVE</span><h2>{title}</h2></div></header>;
const SectionTitle = ({ title }) => <div className="section-title"><h3>{title}</h3></div>;
const InfoCard = ({ title, text }) => <div className="info-card"><Radio size={18} /><div><b>{title}</b><span>{text}</span></div></div>;
export const Empty = ({ text }) => <div className="empty"><Radio size={22} /><span>{text}</span></div>;
