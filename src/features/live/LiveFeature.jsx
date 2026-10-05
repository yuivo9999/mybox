import React, { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { ChevronLeft, Heart, Play, Radio, ListVideo, Sparkles } from 'lucide-react';
import { liveService } from '../../services/liveService.js';
import { playbackService } from '../../services/playbackService.js';
import { requestManager } from '../../services/requestManager.js';
import { tv1LiveService } from '../../services/tv1LiveService.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState, LoadingState } from '../../components/StateViews.jsx';
import { SangtianPlayerWindow } from '../../components/theme/SangtianPlayerConsole.jsx';

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
  const videoRef = useRef(null);
  const playerWindowBodyRef = useRef(null);
  const [selectedChannelId, setSelectedChannelId] = useState(globalLiveCache.selectedChannelId);
  const [selectedCategory, setSelectedCategory] = useState(globalLiveCache.selectedCategory || page?.live?.category || '全部');
  const [activeStreamIndex, setActiveStreamIndex] = useState(globalLiveCache.activeStreamIndex || 0);
  const [tv1Channels, setTv1Channels] = useState(globalLiveCache.tv1Channels || []);
  const [tv1Loading, setTv1Loading] = useState(false);
  const [tv1LoadedCount, setTv1LoadedCount] = useState(globalLiveCache.tv1Channels?.length || 0);
  const [tv1Error, setTv1Error] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState('idle');
  const [playbackError, setPlaybackError] = useState('');
  const [resolvedPlaybackInput, setResolvedPlaybackInput] = useState(null);
  const [decoderEngine, setDecoderEngine] = useState('exo');

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

  const activeChannel = useMemo(() => {
    if (selectedChannelId) {
      const found = allChannels.find(c => c.channelId === selectedChannelId);
      if (found) return found;
    }
    return allChannels[0] || null;
  }, [allChannels, selectedChannelId]);

  const livePlaybackRequest = useMemo(() => {
    if (!activeChannel) return null;
    return playbackService.createLiveRequest({ channel: activeChannel });
  }, [activeChannel]);

  const activeStream = useMemo(() => {
    if (!activeChannel?.streams?.length) return null;
    return activeChannel.streams[activeStreamIndex] || activeChannel.streams[0];
  }, [activeChannel, activeStreamIndex]);

  const playbackController = useMemo(() => {
    if (!livePlaybackRequest) return null;
    return playbackService.createController(livePlaybackRequest, {
      onEvent: event => {
        if (event.event === 'error') setPlaybackError(event.error || '播放失败');
        if (event.event === 'stopped') setPlaybackStatus('stopped');
      },
      onStateChange: setPlaybackStatus,
      onCandidateChange: cand => {
        setResolvedPlaybackInput(null);
        if (cand) setPlaybackError('');
      },
      onResolvedInput: setResolvedPlaybackInput,
      onPlayerError: ({ error: e }) => setPlaybackError(e?.message || '加载失败'),
    });
  }, [livePlaybackRequest]);

  useEffect(() => {
    if (!playbackController || !videoRef.current) return;
    const player = playbackController.attachPlayer(videoRef.current);
    const initial = playbackController.start();
    if (initial) {
      playbackController.resolveAndLoad(initial).catch(error => setPlaybackError(error?.message || '初始化失败'));
    }
    return () => {
      void player;
      playbackController.leave();
    };
  }, [playbackController]);

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

      {activeChannel && (
        <>
          {/* Image 2 Requirement: Player Window in Live Tab */}
          <SangtianPlayerWindow
            videoRef={videoRef}
            controller={playbackController}
            videoContainerRef={playerWindowBodyRef}
            status={playbackStatus}
            candidate={activeStream ? {
              label: activeStream.label || '线路 1',
              url: activeStream.url || activeStream.mediaUrl,
              protocol: activeStream.protocol || 'HLS/M3U8',
            } : { label: '请选择频道', protocol: 'LIVE' }}
            candidates={livePlaybackRequest?.candidates ?? []}
            error={playbackError}
            resolvedInput={resolvedPlaybackInput}
            isLive
            terminalTag={activeChannel ? 'LIVE · ' + activeChannel.name : 'LIVE · 等待频道'}
            channels={allChannels}
            activeChannel={activeChannel}
            activeStreamIndex={activeStreamIndex}
            onSelectChannel={c => setSelectedChannelId(c.channelId)}
            onSwitchStreamIndex={idx => setActiveStreamIndex(idx)}
            decoderEngine={decoderEngine}
            onChangeDecoderEngine={setDecoderEngine}
          >
            <video
              ref={videoRef}
              playsInline
              preload="metadata"
              poster={activeChannel.logo}
              className="sangtian-video-element"
            />
          </SangtianPlayerWindow>

          {/* Image 3 Requirement: Live Current Card */}
          <div className="live-current-bar" style={{ display: 'flex', flexDirection: 'column', background: '#fcf9f2', border: '1px solid #e2d5bd', borderRadius: '20px', padding: '18px 20px', margin: '12px 0 16px', boxShadow: '0 4px 16px rgba(45, 34, 22, 0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', width: '100%', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                <span className="live-pill" style={{ flexShrink: 0, background: '#dcedd9', color: '#286b20', border: '1px solid #b2d8aa', padding: '4px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  ● 正在直播
                </span>
                <b style={{ fontSize: '21px', fontWeight: 900, color: '#1a1612', marginLeft: '10px', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeChannel.name}</b>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => toggleFavorite('channel', activeChannel.channelId)}
                  style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fcf9f2', border: '1px solid #dcd0bc', display: 'grid', placeItems: 'center', cursor: 'pointer', outline: 'none' }}
                  title="收藏频道"
                >
                  <Heart size={20} fill={favorites.some(i => i.targetType === 'channel' && i.targetId === activeChannel.channelId) ? '#e11d48' : 'none'} color={favorites.some(i => i.targetType === 'channel' && i.targetId === activeChannel.channelId) ? '#e11d48' : '#1a1612'} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => onPlay?.(activeChannel)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: '#8b2319', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(139, 35, 25, 0.28)', outline: 'none', whiteSpace: 'nowrap' }}
                >
                  <Play size={16} fill="#ffffff" color="#ffffff" />
                  <span>沉浸播放</span>
                </button>
              </div>
            </div>

            <div style={{ fontSize: '14px', fontWeight: 600, color: '#5c4d3c', marginTop: '6px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
              <span>📺 {activeChannel.category || '央视频道'}</span>
              <span>· {activeStream?.label || `线路 ${activeStreamIndex + 1}`}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, color: '#5c4d3c', width: '100%' }}>
              <span style={{ flexShrink: 0 }}>线路:</span>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', width: '100%' }}>
                {(activeChannel.streams?.length ? activeChannel.streams : [{ label: '线路 1' }, { label: '线路 2' }, { label: '线路 3' }]).map((st, idx) => {
                  const isCurrent = activeStreamIndex === idx;
                  return (
                    <button
                      key={st.streamId || idx}
                      type="button"
                      onClick={() => setActiveStreamIndex(idx)}
                      style={{
                        padding: '5px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        background: isCurrent ? '#d5a55a' : '#eee3cf',
                        border: isCurrent ? '1px solid #b8860b' : '1px solid #dacba8',
                        color: isCurrent ? '#ffffff' : '#2a2018',
                        cursor: 'pointer',
                        outline: 'none',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      {st.label || `线路 ${idx + 1}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

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
                    onClick={() => {
                      setSelectedChannelId(channel.channelId);
                    }}
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
                      aria-label={`沉浸播放 ${channel.name}`}
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
