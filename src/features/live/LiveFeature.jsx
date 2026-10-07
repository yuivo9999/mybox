import React, { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { ChevronLeft, Heart, Play, Radio } from 'lucide-react';
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

export function LiveFeature({ channels = [], sources = [], favorites = [], onChannel, onPlay, onTab, toggleFavorite }) {
  const page = usePageState();
  const videoRef = useRef(null);
  const playerWindowBodyRef = useRef(null);
  const [selectedChannelId, setSelectedChannelId] = useState(globalLiveCache.selectedChannelId);
  const [selectedCategory, setSelectedCategory] = useState(globalLiveCache.selectedCategory || '全部');
  const [activeStreamIndex, setActiveStreamIndex] = useState(globalLiveCache.activeStreamIndex || 0);
  const [tv1Channels, setTv1Channels] = useState(globalLiveCache.tv1Channels || []);
  const [tv1Loading, setTv1Loading] = useState(false);
  const [tv1LoadedCount, setTv1LoadedCount] = useState(globalLiveCache.tv1Channels?.length || 0);
  const [tv1Error, setTv1Error] = useState(null);
  const [resolvedStreams, setResolvedStreams] = useState(globalLiveCache.resolvedStreams || {});
  const [streamLoading, setStreamLoading] = useState(false);
  const [decoderEngine, setDecoderEngine] = useState(globalLiveCache.decoderEngine || 'exo');
  const [isImmersive, setIsImmersive] = useState(globalLiveCache.isImmersive || false);

  const enabledTv1Sources = useMemo(
    () => sources.filter(source => source.sourceType === 'live' && source.liveMode === 'tv1' && source.enabled !== false),
    [sources],
  );

  // Sync state changes to global Live Cache
  useEffect(() => { globalLiveCache.selectedChannelId = selectedChannelId; }, [selectedChannelId]);
  useEffect(() => { globalLiveCache.selectedCategory = selectedCategory; }, [selectedCategory]);
  useEffect(() => { globalLiveCache.activeStreamIndex = activeStreamIndex; }, [activeStreamIndex]);
  useEffect(() => { globalLiveCache.tv1Channels = tv1Channels; }, [tv1Channels]);
  useEffect(() => { globalLiveCache.resolvedStreams = resolvedStreams; }, [resolvedStreams]);
  useEffect(() => { globalLiveCache.decoderEngine = decoderEngine; }, [decoderEngine]);
  useEffect(() => { globalLiveCache.isImmersive = isImmersive; }, [isImmersive]);

  useEffect(() => {
    if (page?.live?.channelId && page.live.channelId !== selectedChannelId) {
      setSelectedChannelId(page.live.channelId);
      if (page.live.category) setSelectedCategory(page.live.category);
      if (typeof page?.live?.streamIndex === 'number' && page.live.streamIndex >= 0) {
        setActiveStreamIndex(page.live.streamIndex);
      } else if (typeof globalLiveCache.activeStreamIndex === 'number' && globalLiveCache.activeStreamIndex >= 0) {
        setActiveStreamIndex(globalLiveCache.activeStreamIndex);
      }
    }
  }, [page?.live?.channelId, page?.live?.category, page?.live?.streamIndex, selectedChannelId]);

  useEffect(() => {
    let active = true;
    setTv1Error(null);
    if (!enabledTv1Sources.length) {
      setTv1Loading(false);
      return () => { active = false; };
    }

    // Skip network re-fetch if channels are already loaded in global cache
    if (globalLiveCache.tv1Channels && globalLiveCache.tv1Channels.length > 0) {
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

  // 源启停/删除后，立即丢弃已经失效的频道选择与延迟流缓存。
  // 不能只依赖页面卸载：Live 页面可能一直挂载，而 sources 会原地变化。
  useEffect(() => {
    const availableIds = new Set(allChannels.map(channel => channel.channelId));
    setResolvedStreams(prev => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([channelId]) => availableIds.has(channelId)),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    if (selectedChannelId && !availableIds.has(selectedChannelId)) {
      setSelectedChannelId('');
      setActiveStreamIndex(0);
    }
  }, [allChannels, selectedChannelId]);
  const activeChannelBase = useMemo(
    () => allChannels.find(channel => channel.channelId === selectedChannelId) || null,
    [allChannels, selectedChannelId],
  );
  const activeChannel = useMemo(() => {
    if (!activeChannelBase) return null;
    const lazyStreams = resolvedStreams[activeChannelBase.channelId];
    return lazyStreams ? { ...activeChannelBase, streams: lazyStreams } : activeChannelBase;
  }, [activeChannelBase, resolvedStreams]);

  const activeStream = activeChannel?.streams?.[activeStreamIndex] || activeChannel?.streams?.[0] || null;
  const [currentEPG, setCurrentEPG] = useState(null);
  const streamAbortRef = useRef(null);

  const livePlaybackRequest = useMemo(() => {
    if (!activeChannel?.streams?.length) return null;
    return playbackService.createLiveRequest({ channel: activeChannel });
  }, [activeChannel?.channelId, activeChannel?.streams]);

  const [playbackCandidate, setPlaybackCandidate] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState('idle');
  const [playbackError, setPlaybackError] = useState('');
  const [resolvedPlaybackInput, setResolvedPlaybackInput] = useState(null);

  const activeStreamIndexRef = useRef(activeStreamIndex);
  activeStreamIndexRef.current = activeStreamIndex;
  const livePlaybackRequestRef = useRef(livePlaybackRequest);
  livePlaybackRequestRef.current = livePlaybackRequest;
  const playbackControllerRef = useRef(null);

  const playbackController = useMemo(() => {
    if (!livePlaybackRequest) return null;
    const ctrl = playbackService.createController(livePlaybackRequest, {
      onStateChange: setPlaybackStatus,
      onCandidateChange: next => {
        setPlaybackCandidate(next);
        if (next) {
          setPlaybackError('');
          const req = livePlaybackRequestRef.current;
          const index = req?.candidates?.findIndex(item => item.candidateId === next.candidateId);
          if (index != null && index >= 0) setActiveStreamIndex(index);
        }
      },
      onResolvedInput: setResolvedPlaybackInput,
      onPlayerError: ({ error }) => {
        const errMsg = error?.message || '播放器加载失败';
        setPlaybackError(errMsg);
      },
      onParserError: ({ code }) => setPlaybackError('解析失败：' + code),
      onExhausted: () => setPlaybackStatus('error'),
    });
    playbackControllerRef.current = ctrl;
    return ctrl;
  }, [livePlaybackRequest]);
  playbackControllerRef.current = playbackController;

  // Load current EPG program details when active channel changes
  useEffect(() => {
    let active = true;
    setCurrentEPG(null);
    if (!activeChannel) return undefined;

    liveService.getEPG(activeChannel).then(programs => {
      if (!active || !programs?.length) return;
      const now = Date.now();
      const current = programs.find(p => p.startAt <= now && p.endAt >= now) || programs[0];
      if (current) setCurrentEPG(current);
    }).catch(() => {});

    return () => { active = false; };
  }, [activeChannel]);

  const loadChannelStreams = async channel => {
    if (!channel?.deferredRef || resolvedStreams[channel.channelId]) return;

    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
    }
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setStreamLoading(true);
    setSelectedChannelId(channel.channelId);
    setActiveStreamIndex(0);
    try {
      const streams = await resolveLiveChannelStreams(channel, {
        sources: enabledTv1Sources,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setResolvedStreams(prev => ({ ...prev, [channel.channelId]: streams }));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setTv1Error(error);
    } finally {
      if (!controller.signal.aborted) {
        setStreamLoading(false);
      }
    }
  };

  const selectChannel = (channel, targetStreamIndex = 0) => {
    setSelectedChannelId(channel.channelId);
    setActiveStreamIndex(targetStreamIndex);
    globalLiveCache.activeStreamIndex = targetStreamIndex;
    setPlaybackCandidate(null);
    setResolvedPlaybackInput(null);
    setPlaybackError('');
    if (channel.deferredRef) {
      void loadChannelStreams(channel);
    }
  };

  // Keyboard & TV Box Remote D-Pad Navigation (Up/Down Arrow Keys)
  useEffect(() => {
    const handleKeyDown = event => {
      if (!allChannels.length) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const currentIndex = allChannels.findIndex(c => c.channelId === selectedChannelId);
        let nextIndex = 0;
        if (event.key === 'ArrowUp') {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : allChannels.length - 1;
        } else {
          nextIndex = currentIndex < allChannels.length - 1 ? currentIndex + 1 : 0;
        }
        const nextChannel = allChannels[nextIndex];
        if (nextChannel) selectChannel(nextChannel);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allChannels, selectedChannelId]);

  useEffect(() => {
    const body = playerWindowBodyRef.current;
    if (!body || !playbackController?.setVideoViewBounds) return undefined;

    const syncNativeVideoSurface = () => {
      if (typeof window === 'undefined' || typeof body.getBoundingClientRect !== 'function') return;
      const rect = body.getBoundingClientRect();
      playbackController.setVideoViewBounds({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };

    syncNativeVideoSurface();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncNativeVideoSurface)
      : null;
    observer?.observe(body);
    window.addEventListener('resize', syncNativeVideoSurface);
    window.addEventListener('orientationchange', syncNativeVideoSurface);
    window.addEventListener('scroll', syncNativeVideoSurface, { passive: true });
    document.addEventListener('scroll', syncNativeVideoSurface, { passive: true });
    const timer = window.setTimeout(syncNativeVideoSurface, 150);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncNativeVideoSurface);
      window.removeEventListener('orientationchange', syncNativeVideoSurface);
      window.removeEventListener('scroll', syncNativeVideoSurface);
      document.removeEventListener('scroll', syncNativeVideoSurface);
      window.clearTimeout(timer);
    };
  }, [playbackController]);

  useEffect(() => {
    if (!playbackController) {
      setPlaybackCandidate(null);
      setResolvedPlaybackInput(null);
      setPlaybackStatus('idle');
      setPlaybackError('');
      return undefined;
    }
    const player = playbackController.attachPlayer(videoRef.current);
    const initial = playbackController.start();
    const currentStreamIdx = activeStreamIndexRef.current || 0;
    const req = livePlaybackRequestRef.current;
    let chosenCandidate = initial;
    if (currentStreamIdx > 0 && req?.candidates?.[currentStreamIdx]) {
      const targetCandidate = req.candidates[currentStreamIdx];
      const switched = playbackController.switchCandidate(targetCandidate.candidateId);
      if (switched) chosenCandidate = switched;
    }
    setPlaybackCandidate(chosenCandidate);
    setResolvedPlaybackInput(null);
    if (chosenCandidate) {
      playbackController.resolveAndLoad(chosenCandidate).catch(error => setPlaybackError(error?.message || '播放初始化失败'));
    } else {
      setPlaybackStatus('error');
      setPlaybackError('没有可用的播放候选');
    }
    return () => {
      void player;
      playbackController.leave();
    };
  }, [playbackController]);

  useEffect(() => {
    const top = Number(page.live.scrollTop) || 0;
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

  const handleSwitchStream = (index) => {
    if (index < 0 || !activeChannel?.streams?.length) return;
    const boundedIndex = Math.max(0, Math.min(index, activeChannel.streams.length - 1));
    setActiveStreamIndex(boundedIndex);
    globalLiveCache.activeStreamIndex = boundedIndex;
    const req = livePlaybackRequestRef.current;
    const candidate = req?.candidates?.[boundedIndex];
    setPlaybackError('');
    setResolvedPlaybackInput(null);
    if (candidate && playbackControllerRef.current) {
      const switched = playbackControllerRef.current.switchCandidate(candidate.candidateId);
      setPlaybackCandidate(candidate);
      if (!switched) {
        playbackControllerRef.current.resolveAndLoad(candidate).catch(e => setPlaybackError(e?.message || '线路加载失败'));
      }
    } else if (activeChannel.streams[boundedIndex]) {
      const stream = activeChannel.streams[boundedIndex];
      const customCandidate = {
        candidateId: stream.streamId || `stream-${activeChannel.channelId}-${boundedIndex + 1}`,
        mediaUrl: stream.mediaUrl || stream.url,
        url: stream.mediaUrl || stream.url,
        label: stream.label || `线路 ${boundedIndex + 1}`,
        protocol: stream.protocol || 'HLS/M3U8',
        sourceId: stream.sourceId,
        channelId: activeChannel.channelId,
        kind: 'live',
      };
      setPlaybackCandidate(customCandidate);
      if (playbackControllerRef.current) {
        playbackControllerRef.current.resolveAndLoad(customCandidate).catch(e => setPlaybackError(e?.message || '线路加载失败'));
      }
    }
  };

  const handleStartImmersivePlay = async (channelToPlay = activeChannel, streamId = activeStream?.streamId) => {
    if (!channelToPlay) return;
    let targetIdx = 0;
    if (streamId && Array.isArray(channelToPlay.streams)) {
      const idx = channelToPlay.streams.findIndex(s => s.streamId === streamId || s.url === streamId);
      if (idx >= 0) targetIdx = idx;
    }
    if (channelToPlay.deferredRef && !resolvedStreams[channelToPlay.channelId]) {
      await loadChannelStreams(channelToPlay);
    }
    selectChannel(channelToPlay, targetIdx);
    setIsImmersive(true);
  };

  return (
    <Page>
      <Header title="直播" />

      <SangtianPlayerWindow
        videoRef={videoRef}
        controller={playbackController}
        videoContainerRef={playerWindowBodyRef}
        status={playbackStatus}
        candidate={activeStream ? {
          label: playbackCandidate?.label || activeStream.label || '默认线路',
          url: playbackCandidate?.mediaUrl || activeStream.url,
          protocol: playbackCandidate?.protocol || activeStream.protocol || 'HLS/M3U8',
          sourceId: playbackCandidate?.sourceId || activeStream.sourceId,
          candidateId: playbackCandidate?.candidateId,
        } : { label: '请选择频道', protocol: 'LIVE' }}
        candidates={livePlaybackRequest?.candidates ?? []}
        error={playbackError}
        resolvedInput={resolvedPlaybackInput}
        isLive
        terminalTag={activeChannel ? 'LIVE · ' + activeChannel.name : 'LIVE · 等待频道'}
        channels={allChannels}
        activeChannel={activeChannel}
        activeStreamIndex={activeStreamIndex}
        onSelectChannel={selectChannel}
        onSwitchStreamIndex={handleSwitchStream}
        onSelectCandidate={id => {
          const req = livePlaybackRequestRef.current;
          const idx = req?.candidates?.findIndex(c => c.candidateId === id);
          if (idx != null && idx >= 0) {
            handleSwitchStream(idx);
          }
        }}
        onSwitchCandidate={candidateOrEvent => {
          const req = livePlaybackRequestRef.current;
          const streamsCount = activeChannel?.streams?.length || req?.candidates?.length || 0;
          if (typeof candidateOrEvent === 'string') {
            const idx = req?.candidates?.findIndex(c => c.candidateId === candidateOrEvent);
            if (idx != null && idx >= 0) {
              handleSwitchStream(idx);
              return;
            }
          }
          if (streamsCount > 1) {
            const nextIdx = (activeStreamIndexRef.current + 1) % streamsCount;
            handleSwitchStream(nextIdx);
          }
        }}
        onRetry={() => {
          setPlaybackError('');
          if (playbackController) {
            const initial = playbackController.start();
            if (initial) {
              setPlaybackCandidate(initial);
              playbackController.resolveAndLoad(initial).catch(err => setPlaybackError(err?.message || '播放重试失败'));
            }
          }
        }}
        onStop={() => {
          try {
            playbackController?.stop();
          } catch (e) {
            console.error("Stop live controller failed:", e);
          }
          setResolvedPlaybackInput(null);
          try {
            if (videoRef.current) {
              videoRef.current.pause();
              videoRef.current.src = "";
              videoRef.current.removeAttribute('src');
              try { videoRef.current.load(); } catch {}
            }
          } catch (e) {
            console.error("Pause live video failed:", e);
          }
        }}
        decoderEngine={decoderEngine}
        onChangeDecoderEngine={setDecoderEngine}
        isImmersive={isImmersive}
        onToggleImmersive={() => setIsImmersive(v => !v)}
      />

      {activeChannel && (
        <div className="live-current-bar">
          <div className="live-current-header">
            <div className="live-current-info">
              <span className="live-pill">● 正在直播</span>
              <span className="live-channel-name">{activeChannel.name}</span>
              <span className="live-channel-meta">
                {activeChannel.category} · {activeStream?.label || (streamLoading ? '正在读取地址…' : '等待播放')}
                {currentEPG ? ` · 节目：${currentEPG.title || currentEPG.name}` : ''}
              </span>
            </div>

            <div className="live-current-actions">
              <button
                type="button"
                className="secondary icon-button live-fav-btn"
                onClick={() => toggleFavorite('channel', activeChannel.channelId)}
                title="收藏频道"
              >
                <Heart size={16} fill={favorites.some(i => i.targetType === 'channel' && i.targetId === activeChannel.channelId) ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className="primary live-play-btn"
                onClick={() => handleStartImmersivePlay(activeChannel, activeStream?.streamId)}
                disabled={!activeChannel}
              >
                <Play size={14} />
                <span>沉浸播放</span>
              </button>
            </div>
          </div>

          {activeChannel.streams?.length > 1 && (
            <div className="live-stream-switcher">
              <span className="switcher-label">线路 ({activeChannel.streams.length}):</span>
              <div className="switcher-pills">
                {activeChannel.streams.map((stream, index) => (
                  <button
                    key={stream.streamId || index}
                    type="button"
                    className={`switcher-pill ${activeStreamIndex === index ? 'active' : ''}`}
                    onClick={() => handleSwitchStream(index)}
                  >
                    {stream.label || '线路 ' + (index + 1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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

          {/* Category Tabs: Clicking tab changes channel filter below WITHOUT stopping video playback */}
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

          {/* Channel Cards Grid for Selected Category */}
          {!!filteredChannels.length && (
            <div className="live-channel-grid" aria-label="直播频道列表">
              {filteredChannels.map(channel => {
                const isCurrent = channel.channelId === activeChannel?.channelId;
                const favorite = favorites.some(i => i.targetType === 'channel' && i.targetId === channel.channelId);
                const isLazy = Boolean(channel.deferredRef);
                const isResolving = streamLoading && selectedChannelId === channel.channelId && isLazy;
                const streamCount = resolvedStreams[channel.channelId]?.length ?? channel.streams?.length ?? channel.estimatedStreamCount ?? channel.deferredRef?.lineIndices?.length ?? 0;

                return (
                  <div
                    key={channel.channelId}
                    className={`live-channel-card ${isCurrent ? 'is-playing' : ''}`}
                    onClick={() => selectChannel(channel)}
                  >
                    <div className="card-logo">
                      <SmartImage src={channel.logo} alt={channel.name} fallback={<Radio size={20} />} />
                    </div>
                    <div className="card-main">
                      <div className="card-title">
                        <b>{channel.name}</b>
                        {isCurrent && <span className="live-pill">● 播放中</span>}
                      </div>
                      <div className="card-sub">
                        {isResolving ? '正在读取地址…' : isLazy ? 'TV1 按需读取' : channel.category} · {streamCount ? `${streamCount} 条线路` : '点击播放'}
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
                      onClick={async e => {
                        e.stopPropagation();
                        await handleStartImmersivePlay(channel);
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
