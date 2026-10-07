import React, { useState, useEffect, useRef } from 'react';
import {
  Copy, Maximize2, Minimize2, RotateCw, Sparkles, Terminal, Paperclip,
  Play, Pause, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Rewind, FastForward,
  FileText, LayoutGrid, SlidersHorizontal, Check, RefreshCw, Ratio,
  Lock, Unlock, ListVideo, Square, Heart, Search, Radio
} from 'lucide-react';

export function SangtianPlayerWindow({
  videoRef, controller, status, error, resolvedInput, candidate, request, onRetry, onSwitchCandidate, onStop,
  onFullscreen, terminalTag = 'BASH', children, videoContainerRef, isLive = false,
  playbackRate = 1.0, onChangePlaybackRate,
  channels = [], activeChannel = null, activeStreamIndex = 0, onSelectChannel, onSwitchStreamIndex,
  decoderEngine = 'exo', onChangeDecoderEngine,
  isImmersive = false, onToggleImmersive,
  title = '', episodeLabel = '', sourceLabel = '',
  episodes = [], currentEpisodeIndex = 0, onSelectEpisode,
  onPreviousEpisode, onNextEpisode,
  candidates = [], onSelectCandidate, onOpenSourceModal,
  onTimeMetricsChange,
}) {
  const [showTerminal, setShowTerminal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isSystemFullscreen, setIsSystemFullscreen] = useState(false);
  const [isWebFullscreen, setIsWebFullscreen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [aspectMode, setAspectMode] = useState('fill');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);
  const [bufferRate, setBufferRate] = useState(0);
  const [networkDownlink, setNetworkDownlink] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFullscreenBar, setShowFullscreenBar] = useState(true);
  const [showEmbeddedNav, setShowEmbeddedNav] = useState(true);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [showEpisodeSidebar, setShowEpisodeSidebar] = useState(false);
  const [episodePage, setEpisodePage] = useState(0);
  const [isStoppedManually, setIsStoppedManually] = useState(false);

  useEffect(() => {
    setIsStoppedManually(false);
  }, [candidate?.candidateId, candidate?.url, resolvedInput?.url]);

  const lastBufferRef = useRef({ time: 0, buffered: 0 });
  const controlsTimeoutRef = useRef(null);
  const embeddedTimeoutRef = useRef(null);

  const streamUrl = resolvedInput?.url || candidate?.mediaUrl || candidate?.url || candidate?.metadata?.url || '';
  const aspectOptions = [
    { id: 'fill', label: '铺满', title: '铺满画面（可能裁切）' },
    { id: 'original', label: '原始', title: '保持视频源比例' },
    { id: '16:9', label: '16:9', title: '16:9' },
    { id: '4:3', label: '4:3', title: '4:3' },
  ];
  const currentAspect = aspectOptions.find(item => item.id === aspectMode) || aspectOptions[0];

  const handleCycleAspect = () => {
    const currentIndex = aspectOptions.findIndex(item => item.id === aspectMode);
    const nextIndex = (currentIndex + 1) % aspectOptions.length;
    setAspectMode(aspectOptions[nextIndex].id);
  };

  const formatTime = value => {
    if (!Number.isFinite(value)) return '00:00';
    const total = Math.max(0, Math.floor(value));
    return `${Math.floor(total / 3600) ? String(Math.floor(total / 3600)).padStart(2,'0') + ':' : ''}${String(Math.floor((total % 3600) / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  };

  const syncMediaMetrics = () => {
    const video = videoRef?.current;
    if (!video) return;
    const cur = Number(video.currentTime) || 0;
    const dur = Number(video.duration) || 0;
    setCurrentTime(cur);
    setDuration(dur);
    onTimeMetricsChange?.(cur, dur);
    let forwardBuffer = 0;
    try {
      if (video.buffered?.length) {
        const end = video.buffered.end(video.buffered.length - 1);
        forwardBuffer = Math.max(0, end - cur);
      }
    } catch {}
    setBufferedSeconds(forwardBuffer);
    const now = performance.now();
    const previous = lastBufferRef.current;
    if (previous.time > 0 && now > previous.time && forwardBuffer >= previous.buffered) {
      setBufferRate((forwardBuffer - previous.buffered) / ((now - previous.time) / 1000));
    }
    lastBufferRef.current = { time: now, buffered: forwardBuffer };
  };

  useEffect(() => {
    let boundVideo = null;
    const events = ['timeupdate', 'progress', 'loadedmetadata', 'durationchange', 'playing', 'pause', 'waiting', 'canplay', 'seeking', 'seeked'];
    const update = () => {
      const video = videoRef?.current;
      if (video) {
        syncMediaMetrics();
        const activePlaying = !video.paused && !video.ended && (video.currentTime > 0 || video.readyState >= 2);
        setIsPlaying(activePlaying);
        if (video !== boundVideo) {
          if (boundVideo) {
            events.forEach(event => boundVideo.removeEventListener(event, update));
          }
          boundVideo = video;
          events.forEach(event => video.addEventListener(event, update));
        }
      }
    };

    const timer = window.setInterval(update, 250);
    update();

    return () => {
      window.clearInterval(timer);
      if (boundVideo) {
        events.forEach(event => boundVideo.removeEventListener(event, update));
      }
    };
  }, [videoRef, candidate, resolvedInput, status]);

  useEffect(() => {
    const connection = typeof navigator !== 'undefined'
      ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
      : null;
    const update = () => setNetworkDownlink(Number.isFinite(Number(connection?.downlink)) ? Number(connection.downlink) : null);
    update();
    connection?.addEventListener?.('change', update);
    return () => connection?.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isSystem = Boolean(document.fullscreenElement);
      setIsSystemFullscreen(isSystem);
      if (!isSystem && !isWebFullscreen) {
        setShowLeftSidebar(false);
        setShowRightSidebar(false);
        setShowEpisodeSidebar(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isWebFullscreen]);

  // Auto-hide fullscreen controls after 3 seconds of inactivity
  const fullscreen = isSystemFullscreen || isImmersive || isWebFullscreen;

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowFullscreenBar(true);
    if (fullscreen && isPlaying && !isLocked && !showLeftSidebar && !showRightSidebar && !showEpisodeSidebar) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowFullscreenBar(false);
      }, 3000);
    }
  };

  const handleFullscreenBlankClick = (e) => {
    if (!fullscreen || isLocked) return;
    const isInteractive = Boolean(
      e.target.closest('button, input, select, textarea, a, .setting-btn, .sidebar-channel-item, .sidebar-chip, .close-sidebar-btn, .sangtian-ep-btn, .quick-line-pill')
    );
    if (!isInteractive) {
      e.stopPropagation();
      setShowFullscreenBar(prev => {
        const nextState = !prev;
        if (!nextState) {
          setShowLeftSidebar(false);
          setShowRightSidebar(false);
          setShowEpisodeSidebar(false);
        } else if (isPlaying) {
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = setTimeout(() => {
            setShowFullscreenBar(false);
          }, 3000);
        }
        return nextState;
      });
    }
  };

  const resetEmbeddedControlsTimeout = () => {
    if (embeddedTimeoutRef.current) clearTimeout(embeddedTimeoutRef.current);
    setShowEmbeddedNav(true);
    if (!fullscreen && isPlaying) {
      embeddedTimeoutRef.current = setTimeout(() => {
        setShowEmbeddedNav(false);
      }, 3000);
    }
  };

  const handleEmbeddedBlankClick = (e) => {
    if (fullscreen) return;
    const isInteractive = Boolean(
      e.target.closest('button, input, select, textarea, a, .setting-btn, .sidebar-channel-item, .sidebar-chip, .close-sidebar-btn, .sangtian-ep-btn')
    );
    if (!isInteractive) {
      e.stopPropagation();
      setShowEmbeddedNav(prev => {
        const nextState = !prev;
        if (nextState && isPlaying) {
          if (embeddedTimeoutRef.current) clearTimeout(embeddedTimeoutRef.current);
          embeddedTimeoutRef.current = setTimeout(() => {
            setShowEmbeddedNav(false);
          }, 3000);
        }
        return nextState;
      });
    }
  };

  useEffect(() => {
    if (fullscreen && isPlaying && !isLocked) {
      resetControlsTimeout();
    } else if (fullscreen) {
      setShowFullscreenBar(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [fullscreen, isPlaying, isLocked, showLeftSidebar, showRightSidebar, showEpisodeSidebar]);

  useEffect(() => {
    if (!fullscreen && isPlaying) {
      resetEmbeddedControlsTimeout();
    } else if (!fullscreen) {
      setShowEmbeddedNav(true);
      if (embeddedTimeoutRef.current) clearTimeout(embeddedTimeoutRef.current);
    }
    return () => {
      if (embeddedTimeoutRef.current) clearTimeout(embeddedTimeoutRef.current);
    };
  }, [fullscreen, isPlaying]);

  const [selectedSidebarCat, setSelectedSidebarCat] = useState('全部');

  const sidebarCategories = React.useMemo(() => {
    const cats = new Set();
    channels.forEach(c => { if (c.category) cats.add(c.category); });
    return ['全部', ...Array.from(cats)];
  }, [channels]);

  const filteredSidebarChannels = React.useMemo(() => {
    if (selectedSidebarCat === '全部') return channels;
    return channels.filter(c => (c.category || '未分类') === selectedSidebarCat);
  }, [channels, selectedSidebarCat]);

  const [clockTime, setClockTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const d = new Date();
      setClockTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const availableStreams = (activeChannel?.streams && activeChannel.streams.length > 0)
    ? activeChannel.streams
    : (candidates && candidates.length > 0)
    ? candidates
    : [];
  const totalStreams = availableStreams.length > 0 ? availableStreams.length : 1;
  const currentStreamNum = Math.min(totalStreams, Math.max(1, (activeStreamIndex ?? 0) + 1));

  const handlePrevStream = (e) => {
    e?.stopPropagation?.();
    if (!totalStreams || totalStreams <= 1) return;
    const prev = (activeStreamIndex != null && activeStreamIndex > 0) ? activeStreamIndex - 1 : totalStreams - 1;
    if (onSwitchStreamIndex) onSwitchStreamIndex(prev);
    const cand = candidates?.[prev];
    if (cand?.candidateId && onSelectCandidate) onSelectCandidate(cand.candidateId);
    else if (onSwitchCandidate) onSwitchCandidate(cand?.candidateId || prev);
  };

  const handleNextStream = (e) => {
    e?.stopPropagation?.();
    if (!totalStreams || totalStreams <= 1) return;
    const next = (activeStreamIndex != null && activeStreamIndex + 1 < totalStreams) ? activeStreamIndex + 1 : 0;
    if (onSwitchStreamIndex) onSwitchStreamIndex(next);
    const cand = candidates?.[next];
    if (cand?.candidateId && onSelectCandidate) onSelectCandidate(cand.candidateId);
    else if (onSwitchCandidate) onSwitchCandidate(cand?.candidateId || next);
  };

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && streamUrl) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleToggleFullscreen = async () => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }
    const elem = videoContainerRef?.current?.parentElement || videoRef?.current?.parentElement || videoRef?.current;
    const currentlyActive = isSystemFullscreen || isWebFullscreen || isImmersive;

    if (!currentlyActive) {
      if (isLive && onToggleImmersive) {
        onToggleImmersive(true);
      }
      setIsWebFullscreen(true);
      setShowFullscreenBar(true);
      if (elem?.requestFullscreen) {
        try {
          await elem.requestFullscreen();
        } catch {}
      }
      try { await screen.orientation?.lock?.(isLandscape ? 'landscape' : 'portrait'); } catch {}
    } else {
      if (isLive && onToggleImmersive) {
        onToggleImmersive(false);
      }
      setIsWebFullscreen(false);
      setShowLeftSidebar(false);
      setShowRightSidebar(false);
      setShowEpisodeSidebar(false);
      setIsLocked(false);
      if (document.fullscreenElement) {
        try { await document.exitFullscreen?.(); } catch {}
      }
      try { screen.orientation?.unlock?.(); } catch {}
    }
  };

  const handleToggleLandscape = async () => {
    const next = !isLandscape;
    setIsLandscape(next);
    try { await screen.orientation?.lock?.(next ? 'landscape' : 'portrait'); } catch {}
  };

  const handleSeek = value => {
    const val = Number(value);
    if (!Number.isFinite(val)) return;
    if (controller?.seek) {
      controller.seek(val);
    } else {
      const video = videoRef?.current;
      if (video && Number.isFinite(video.duration)) {
        video.currentTime = val;
      }
    }
    setCurrentTime(val);
    resetControlsTimeout();
  };

  const handlePlayPause = () => {
    if (controller) {
      if (isPlaying) {
        controller.pause();
      } else {
        controller.play().catch(() => {});
      }
    } else {
      const video = videoRef?.current;
      if (!video) return;
      if (video.paused) video.play().catch(() => {}); else video.pause();
    }
    resetControlsTimeout();
  };

  const handleSkip = seconds => {
    if (isLive) return;
    const dur = duration || (videoRef?.current?.duration ?? 0);
    const cur = currentTime || (videoRef?.current?.currentTime ?? 0);
    if (dur <= 0) return;
    const nextTime = Math.max(0, Math.min(dur, cur + seconds));
    if (controller?.seek) {
      controller.seek(nextTime);
    } else if (videoRef?.current) {
      videoRef.current.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
    resetControlsTimeout();
  };

  const handleCycleRate = () => {
    const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const nextRate = rates[nextIndex];
    onChangePlaybackRate?.(nextRate);
    if (controller?.setPlaybackRate) {
      controller.setPlaybackRate(nextRate);
    } else if (videoRef?.current) {
      videoRef.current.playbackRate = nextRate;
    }
    resetControlsTimeout();
  };

  const episodeGroups = [];
  for (let i = 0; i < episodes.length; i += 50) {
    episodeGroups.push(episodes.slice(i, i + 50));
  }
  const currentGroupEpisodes = episodeGroups[episodePage] ?? episodes;

  const renderedChildren = children;
  const bufferPct = duration > 0 ? Math.min(100, (bufferedSeconds / duration) * 100) : 0;
  const loadSpeed = bufferRate > 0 ? `${bufferRate.toFixed(1)} 秒/秒` : '—';
  const displayTitle = title || request?.metadata?.title || (isLive ? activeChannel?.name : '正在播放');
  const displayEpisode = episodeLabel || (episodes.length > 0 ? `第 ${currentEpisodeIndex + 1} 集` : '');

  return (
    <div
      className={`sangtian-window ${isLive ? 'is-live-direct' : ''} ${isLandscape ? 'is-landscape' : ''} ${fullscreen ? 'is-system-fullscreen is-web-fullscreen' : ''} aspect-${aspectMode.replace(':','-')}`}
      onMouseMove={fullscreen ? resetControlsTimeout : resetEmbeddedControlsTimeout}
      onTouchStart={fullscreen ? resetControlsTimeout : resetEmbeddedControlsTimeout}
    >
      {!fullscreen && (
        <div className="sangtian-window-bar">
          <div className="sangtian-window-tag"><span>{terminalTag}</span></div>
          <div className="sangtian-window-actions">
            <button
              className="sangtian-window-btn"
              onClick={() => {
                setIsStoppedManually(true);
                onStop?.();
              }}
              title="停止播放"
            >
              <Square size={13}/>
              <span>停止</span>
            </button>
            <button className="sangtian-window-btn" onClick={handleCopyLink} title="复制播放链接">
              {copied ? <Check size={13}/> : <Copy size={13}/>}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
            <button className={`sangtian-window-btn ${isLandscape ? 'active' : ''}`} onClick={handleToggleLandscape} title="方向">
              <RotateCw size={13}/>
              <span>{isLandscape ? '竖屏' : '横屏'}</span>
            </button>
            <button className={`sangtian-window-btn ${aspectMode !== 'fill' ? 'active' : ''}`} onClick={handleCycleAspect} title={currentAspect.title}>
              <Ratio size={13}/>
              <span>{currentAspect.label}</span>
            </button>
            <button className="sangtian-window-btn icon-only" onClick={handleToggleFullscreen} title="全屏播放">
              <Maximize2 size={13}/>
            </button>
          </div>
        </div>
      )}

      <div ref={videoContainerRef} className="sangtian-window-body">
        {showTerminal ? (
          <div className="sangtian-terminal-panel">
            <pre className="terminal-code">{`播放信息

模式：${isLive ? 'Live 直连' : '影视解析'}
协议：${resolvedInput?.protocol || candidate?.protocol || '未知'}
源：${candidate?.sourceId || '—'}
状态：${status || 'idle'}
播放进度：${formatTime(currentTime)} / ${formatTime(duration)}
已缓冲：${formatTime(bufferedSeconds)}
加载速率：${loadSpeed}
网络估速：${networkDownlink != null ? networkDownlink + ' Mbps' : '不可用'}
播放地址：${streamUrl || '等待地址…'}`}</pre>
            <div className="terminal-footer">
              <button className="terminal-back-btn" onClick={()=>setShowTerminal(false)}>
                <Play size={13}/>
                <span>返回视频播放</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {renderedChildren}
            {(() => {
              const isStopped = isStoppedManually || status === 'stopped';
              if (isStopped) {
                return (
                  <div className="sangtian-video-overlay stopped">
                    <div
                      className="sangtian-stopped-play-btn"
                      onClick={() => {
                        setIsStoppedManually(false);
                        if (onRetry) onRetry();
                        else if (videoRef?.current) videoRef.current.play?.();
                      }}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: 'rgba(213, 165, 90, 0.95)',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#1a1816',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        marginBottom: 8,
                      }}
                    >
                      <Play size={24} style={{ marginLeft: 3 }} />
                    </div>
                    <span style={{ fontSize: 13, color: '#ecd9ba', fontWeight: 500 }}>已停止播放</span>
                    {onRetry && (
                      <button
                        type="button"
                        className="sangtian-btn-sand"
                        onClick={() => {
                          setIsStoppedManually(false);
                          onRetry();
                        }}
                        style={{ marginTop: 10, padding: '4px 12px', fontSize: 12, borderRadius: 6 }}
                      >
                        重新连接播放
                      </button>
                    )}
                  </div>
                );
              }
              if (!resolvedInput && candidate && status !== 'error') {
                return (
                  <div className="sangtian-video-overlay">
                    <div className="sangtian-loading-spinner"/>
                    <span>{isLive ? '正在连接直播直链…' : '正在解析视频播放地址…'}</span>
                  </div>
                );
              }
              if (resolvedInput && status !== 'error' && (status === 'loading' || status === 'preparing') && !isPlaying && currentTime === 0) {
                return (
                  <div className="sangtian-video-overlay compact" style={{ pointerEvents: 'none' }}>
                    <div className="sangtian-loading-spinner"/>
                    <span>正在缓冲…</span>
                  </div>
                );
              }
              return null;
            })()}
            {status === 'error' && (
              <div className="sangtian-video-error">
                <b>{isLive ? '直播直连失败' : '播放解析失败'}</b>
                <span>{error || '当前播放链路没有可用候选。'}</span>
                <div className="sangtian-error-btns">
                  <button className="sangtian-btn-red" onClick={onRetry}>重新播放</button>
                  {onSwitchCandidate && (
                    <button
                      className="sangtian-btn-sand"
                      onClick={() => onSwitchCandidate()}
                    >
                      切换备用线路
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Embedded Navigation Bar inside Video Window (Non-fullscreen) */}
            {!fullscreen && !showTerminal && status !== 'error' && (
              <div
                className={`sangtian-embedded-player-nav ${isLandscape ? 'mode-landscape' : 'mode-portrait'} ${showEmbeddedNav ? 'visible' : ''}`}
                onClick={handleEmbeddedBlankClick}
              >
                {/* Embedded Top Control Bar */}
                <div className="embedded-nav-top">
                  <div className="embedded-nav-title-group">
                    <span className="embedded-nav-title">{displayTitle}</span>
                    {displayEpisode && <span className="embedded-nav-badge">{displayEpisode}</span>}
                    {sourceLabel && <span className="embedded-nav-source">{sourceLabel}</span>}
                  </div>
                  <div className="embedded-nav-top-actions">
                    {!isLive && episodes.length > 1 && (
                      <button
                        type="button"
                        className="embedded-nav-btn"
                        onClick={() => setShowEpisodeSidebar(!showEpisodeSidebar)}
                        title="选集"
                      >
                        <ListVideo size={13} />
                        <span>选集</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={`embedded-nav-btn ${aspectMode !== 'fill' ? 'active' : ''}`}
                      onClick={handleCycleAspect}
                      title={currentAspect.title}
                    >
                      <Ratio size={13} />
                      <span>{currentAspect.label}</span>
                    </button>
                    <button
                      type="button"
                      className={`embedded-nav-btn ${isLandscape ? 'active' : ''}`}
                      onClick={handleToggleLandscape}
                      title="切换横竖屏"
                    >
                      <RotateCw size={13} />
                      <span>{isLandscape ? '竖屏' : '横屏'}</span>
                    </button>
                    <button
                      type="button"
                      className="embedded-nav-btn icon-only"
                      onClick={handleToggleFullscreen}
                      title="全屏"
                    >
                      <Maximize2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Embedded Bottom Control Bar */}
                <div className="embedded-nav-bottom">
                  {!isLive && (
                    <div className="embedded-progress-row">
                      <span className="time-text">{formatTime(currentTime)}</span>
                      <input
                        type="range"
                        className="embedded-progress-slider"
                        min="0"
                        max={duration || 0}
                        step="0.1"
                        value={Math.min(currentTime, duration || 0)}
                        onChange={e => handleSeek(e.target.value)}
                        aria-label="播放进度"
                      />
                      <span className="time-text">{formatTime(duration)}</span>
                    </div>
                  )}

                  <div className="embedded-controls-row">
                    <div className="embedded-controls-left">
                      <button
                        type="button"
                        className="embedded-play-btn"
                        onClick={handlePlayPause}
                        title={isPlaying ? '暂停' : '播放'}
                      >
                        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                      </button>

                      {!isLive && onPreviousEpisode && (
                        <button type="button" className="embedded-icon-btn" onClick={onPreviousEpisode} title="上一集">
                          <ChevronLeft size={16} />
                          <span className="btn-text">上一集</span>
                        </button>
                      )}

                      {!isLive && onNextEpisode && (
                        <button type="button" className="embedded-icon-btn" onClick={onNextEpisode} title="下一集">
                          <span className="btn-text">下一集</span>
                          <ChevronRight size={16} />
                        </button>
                      )}
                    </div>

                    <div className="embedded-controls-right">
                      {!isLive && (
                        <button type="button" className="embedded-nav-btn speed-btn" onClick={handleCycleRate} title="切换倍速">
                          <span>{playbackRate}x</span>
                        </button>
                      )}
                      <button type="button" className="embedded-nav-btn icon-only" onClick={handleToggleFullscreen} title="全屏">
                        <Maximize2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Locked Screen Overlay */}
            {fullscreen && isLocked && (
              <div className="sangtian-fullscreen-lock-pill" onClick={(e) => { e.stopPropagation(); setIsLocked(false); }}>
                <Unlock size={16} />
                <span>点击解锁控制</span>
              </div>
            )}

            {/* Fullscreen Overlay Controls */}
            {fullscreen && !isLocked && (
              <div
                className={`sangtian-fullscreen-controls ${isLandscape ? 'landscape' : 'portrait'} ${showFullscreenBar ? 'visible' : ''}`}
                onClick={handleFullscreenBlankClick}
              >
                {/* Fullscreen Top Bar */}
                <div className="sangtian-fullscreen-topbar">
                  <div className="sangtian-topbar-left-triggers">
                    <button
                      type="button"
                      className="sangtian-trigger-btn"
                      onClick={(e) => { e.stopPropagation(); handleToggleFullscreen(); }}
                      title="退出全屏"
                    >
                      <ChevronLeft size={18} />
                      <span>返回</span>
                    </button>
                    {isLive ? (
                      <>
                        <button
                          type="button"
                          className="sangtian-trigger-btn"
                          onClick={(e) => { e.stopPropagation(); setShowLeftSidebar(!showLeftSidebar); setShowRightSidebar(false); setShowEpisodeSidebar(false); }}
                        >
                          <LayoutGrid size={15} />
                          <span>选台</span>
                        </button>
                        <span className="channel-title-badge">{activeChannel?.name || '直播频道'}</span>
                      </>
                    ) : (
                      <div className="movie-fullscreen-title-box">
                        <span className="movie-fullscreen-title">{displayTitle}</span>
                        {displayEpisode && <span className="movie-fullscreen-episode">{displayEpisode}</span>}
                        {sourceLabel && <span className="movie-fullscreen-source">{sourceLabel}</span>}
                      </div>
                    )}
                  </div>

                  <div className="sangtian-topbar-right-actions">
                    {/* VOD Episode Selector Trigger */}
                    {!isLive && episodes.length > 1 && (
                      <button
                        type="button"
                        className="sangtian-trigger-btn"
                        onClick={(e) => { e.stopPropagation(); setShowEpisodeSidebar(!showEpisodeSidebar); setShowRightSidebar(false); }}
                      >
                        <ListVideo size={15} />
                        <span>选集 ({episodes.length})</span>
                      </button>
                    )}

                    {/* Settings / Lines Trigger */}
                    <button
                      type="button"
                      className="sangtian-trigger-btn"
                      onClick={(e) => { e.stopPropagation(); setShowRightSidebar(!showRightSidebar); setShowLeftSidebar(false); setShowEpisodeSidebar(false); }}
                    >
                      <SlidersHorizontal size={15} />
                      <span>{isLive ? '线路与解码' : '线路设置'}</span>
                    </button>

                    {/* Lock Screen Button */}
                    <button
                      type="button"
                      className="sangtian-trigger-btn"
                      onClick={(e) => { e.stopPropagation(); setIsLocked(true); }}
                      title="锁定屏幕控制"
                    >
                      <Lock size={15} />
                    </button>

                    {/* Clock & Exit Button */}
                    <span className="fullscreen-clock-badge">{clockTime}</span>
                    <button
                      type="button"
                      className="sangtian-exit-btn-top"
                      onClick={(e) => { e.stopPropagation(); handleToggleFullscreen(); }}
                      title="退出全屏"
                    >
                      <Minimize2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Left Channel Sidebar for Live */}
                {isLive && showLeftSidebar && (
                  <div className="sangtian-fullscreen-left-sidebar" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-header">
                      <b>频道选择 ({filteredSidebarChannels.length})</b>
                      <button className="close-sidebar-btn" onClick={() => setShowLeftSidebar(false)}>✕</button>
                    </div>
                    <div className="sidebar-category-chips">
                      {sidebarCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={`sidebar-chip ${selectedSidebarCat === cat ? 'active' : ''}`}
                          onClick={() => setSelectedSidebarCat(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="sidebar-channel-list">
                      {filteredSidebarChannels.map((chan) => {
                        const isCurrent = chan.channelId === activeChannel?.channelId;
                        return (
                          <div
                            key={chan.channelId}
                            className={`sidebar-channel-item ${isCurrent ? 'active' : ''}`}
                            onClick={() => { onSelectChannel?.(chan); setShowLeftSidebar(false); }}
                          >
                            <span className="chan-name">{chan.name}</span>
                            {isCurrent && <span className="chan-active-tag">● 播放中</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Right Episode Sidebar for VOD / Movies in Fullscreen */}
                {!isLive && showEpisodeSidebar && (
                  <div className="sangtian-fullscreen-right-sidebar" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-header">
                      <b>剧集选集 ({episodes.length} 集)</b>
                      <button className="close-sidebar-btn" onClick={() => setShowEpisodeSidebar(false)}>✕</button>
                    </div>
                    {episodeGroups.length > 1 && (
                      <div className="sidebar-category-chips" style={{ marginTop: 6 }}>
                        {episodeGroups.map((_, i) => (
                          <button
                            key={i}
                            className={`sidebar-chip ${episodePage === i ? 'active' : ''}`}
                            onClick={() => setEpisodePage(i)}
                          >
                            {i * 50 + 1}–{Math.min((i + 1) * 50, episodes.length)}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="sidebar-settings-content" style={{ marginTop: 6 }}>
                      <div className="settings-btn-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' }}>
                        {currentGroupEpisodes.map((ep, idx) => {
                          const realIdx = episodePage * 50 + idx;
                          const isCurrent = realIdx === currentEpisodeIndex;
                          return (
                            <button
                              key={ep.episodeId || realIdx}
                              className={`setting-btn ${isCurrent ? 'active' : ''}`}
                              onClick={() => {
                                onSelectEpisode?.(realIdx);
                                setShowEpisodeSidebar(false);
                              }}
                              title={ep.title}
                            >
                              {ep.title || `${realIdx + 1}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Right Settings Sidebar */}
                {showRightSidebar && (
                  <div className="sangtian-fullscreen-right-sidebar" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-header">
                      <b>{isLive ? '播放与解码设置' : '线路与播放设置'}</b>
                      <button className="close-sidebar-btn" onClick={() => setShowRightSidebar(false)}>✕</button>
                    </div>
                    <div className="sidebar-settings-content">
                      <div className="settings-group">
                        <label>画面比例</label>
                        <div className="settings-btn-grid">
                          {aspectOptions.map((opt) => (
                            <button
                              key={opt.id}
                              className={`setting-btn ${aspectMode === opt.id ? 'active' : ''}`}
                              onClick={() => setAspectMode(opt.id)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* VOD Candidate Lines */}
                      {!isLive && candidates?.length > 0 && (
                        <div className="settings-group">
                          <label>备用播放线路 ({candidates.length})</label>
                          <div className="settings-btn-grid vertical">
                            {candidates.map((c, idx) => (
                              <button
                                key={c.candidateId}
                                className={`setting-btn ${candidate?.candidateId === c.candidateId ? 'active' : ''}`}
                                onClick={() => {
                                  onSelectCandidate?.(c.candidateId);
                                  setShowRightSidebar(false);
                                }}
                              >
                                {c.metadata?.label || c.label || (c.index != null ? `线路 ${c.index + 1}` : `线路 ${idx + 1}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live Stream Switcher */}
                      {isLive && (() => {
                        const liveStreams = (activeChannel?.streams && activeChannel.streams.length > 0)
                          ? activeChannel.streams
                          : (candidates && candidates.length > 0)
                          ? candidates.map((c, i) => ({
                              streamId: c.candidateId || `stream-${i}`,
                              label: c.metadata?.label || c.label || (c.index != null ? `线路 ${c.index + 1}` : `线路 ${i + 1}`),
                              protocol: c.protocol || '',
                              candidateId: c.candidateId,
                            }))
                          : [];
                        if (!liveStreams.length) return null;
                        return (
                          <div className="settings-group">
                            <label>直播换线 ({liveStreams.length})</label>
                            <div className="settings-btn-grid vertical">
                              {liveStreams.map((stream, idx) => {
                                const isCurrent = activeStreamIndex === idx || (stream.candidateId && candidate?.candidateId === stream.candidateId);
                                return (
                                  <button
                                    key={stream.streamId || stream.candidateId || idx}
                                    className={`setting-btn ${isCurrent ? 'active' : ''}`}
                                    onClick={() => {
                                      if (onSwitchStreamIndex) {
                                        onSwitchStreamIndex(idx);
                                      } else if (stream.candidateId && onSelectCandidate) {
                                        onSelectCandidate(stream.candidateId);
                                      } else if (candidates?.[idx]?.candidateId && onSelectCandidate) {
                                        onSelectCandidate(candidates[idx].candidateId);
                                      }
                                      setShowRightSidebar(false);
                                    }}
                                  >
                                    {stream.label || `线路 ${idx + 1}`} {stream.protocol ? `· ${stream.protocol}` : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="settings-group">
                        <label>解码内核 (Decoder Engine)</label>
                        <div className="settings-btn-grid vertical">
                          {[
                            { id: 'exo', name: 'ExoPlayer (MediaCodec 硬解推荐)' },
                            { id: 'ijk', name: 'IJKPlayer (FFmpeg 软解兼容)' },
                            { id: 'native', name: 'Android System Native' },
                            { id: 'html5', name: 'HTML5 Web Engine' },
                          ].map((engine) => (
                            <button
                              key={engine.id}
                              className={`setting-btn ${decoderEngine === engine.id ? 'active' : ''}`}
                              onClick={() => onChangeDecoderEngine?.(engine.id)}
                            >
                              {engine.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="settings-group exit-section">
                        <button
                          type="button"
                          className="sangtian-big-exit-btn"
                          onClick={() => {
                            setShowRightSidebar(false);
                            handleToggleFullscreen();
                          }}
                        >
                          <Minimize2 size={18} />
                          <span>退出全屏模式</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Center Control (Play/Pause & Rewind/FastForward) */}
                <div className="sangtian-fullscreen-center" onDoubleClick={handlePlayPause}>
                  {!isLive ? (
                    <div className="fullscreen-skip-row">
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleSkip(-10); }} aria-label="后退10秒">
                        <Rewind size={20}/>
                        <span>-10s</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
                        className="fullscreen-play-btn"
                        aria-label={isPlaying ? '暂停' : '播放'}
                      >
                        {isPlaying ? <Pause size={28} fill="currentColor"/> : <Play size={28} fill="currentColor"/>}
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleSkip(10); }} aria-label="前进10秒">
                        <FastForward size={20}/>
                        <span>+10s</span>
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={(e) => { e.stopPropagation(); handlePlayPause(); }} className="fullscreen-play-btn">
                      {isPlaying ? <Pause size={26}/> : <Play size={26}/>}
                    </button>
                  )}
                </div>

                {/* Fullscreen Bottom Bar */}
                <div className="sangtian-fullscreen-bottombar">
                  {!isLive && (
                    <>
                      <div className="sangtian-fullscreen-progress">
                        <span>{formatTime(currentTime)}</span>
                        <input
                          type="range"
                          min="0"
                          max={duration || 0}
                          step="0.1"
                          value={Math.min(currentTime, duration || 0)}
                          onChange={e => handleSeek(e.target.value)}
                          aria-label="播放进度"
                        />
                        <span>{formatTime(duration)}</span>
                      </div>
                      <div className="sangtian-fullscreen-metrics">
                        <span>缓冲 {bufferPct.toFixed(0)}%</span>
                        <span>加载 {loadSpeed}</span>
                        <span>网络 {networkDownlink != null ? networkDownlink + ' Mbps' : '—'}</span>
                      </div>
                    </>
                  )}

                  {/* Middle Bottom Translucent Bar for Live */}
                  {isLive && (
                    <div className="sangtian-fullscreen-live-centerbar">
                      <div className="stream-switcher-badge">
                        <button
                          type="button"
                          className="stream-nav-btn"
                          onClick={handlePrevStream}
                          title="切换到上一条线路"
                          disabled={totalStreams <= 1}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          className="stream-counter-text-btn"
                          onClick={handleNextStream}
                          title="点击切换到下一条线路"
                        >
                          <span>线路 {currentStreamNum} / {totalStreams}</span>
                        </button>
                        <button
                          type="button"
                          className="stream-nav-btn"
                          onClick={handleNextStream}
                          title="切换到下一条线路"
                          disabled={totalStreams <= 1}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                      <span className="live-channel-title-center">
                        {activeChannel?.name || '直播频道'}
                      </span>
                      <div className="live-realtime-clock">
                        <span className="live-pill">● 直播</span>
                        <span className="clock-digits">{clockTime}</span>
                      </div>
                    </div>
                  )}

                  <div className="sangtian-fullscreen-actions">
                    {!isLive && onPreviousEpisode && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPreviousEpisode(); }} title="上一集">
                        <ChevronLeft size={15}/>上一集
                      </button>
                    )}
                    {!isLive && onNextEpisode && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onNextEpisode(); }} title="下一集">
                        下一集<ChevronRight size={15}/>
                      </button>
                    )}
                    {!isLive && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleCycleRate(); }} title="切换倍速">
                        <Play size={14}/>{playbackRate}x
                      </button>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleLandscape(); }}>
                      <RotateCw size={15}/>{isLandscape ? '竖屏' : '横屏'}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleCycleAspect(); }}>
                      <Ratio size={15}/>{currentAspect.label}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleFullscreen(); }}>
                      <Minimize2 size={15}/>退出
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SangtianFloatingBar({
  playbackRate = 1.0,
  onChangeRate,
  currentTime = 0,
  duration = 0,
  isLive = false,
}) {
  const rates = [0.75, 1.0, 1.25, 1.5, 2.0];

  const handleCycleSpeed = (dir) => {
    const idx = rates.indexOf(playbackRate);
    if (dir === 'up') {
      const nextIdx = Math.min(rates.length - 1, (idx === -1 ? 1 : idx) + 1);
      onChangeRate?.(rates[nextIdx]);
    } else {
      const nextIdx = Math.max(0, (idx === -1 ? 1 : idx) - 1);
      onChangeRate?.(rates[nextIdx]);
    }
  };

  const formatTime = value => {
    if (!Number.isFinite(value)) return '00:00';
    const total = Math.max(0, Math.floor(value));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timeString = `${formatTime(currentTime)} / ${formatTime(duration)}`;

  return (
    <div className="sangtian-floating-bar">
      {!isLive && (
        <div className="sangtian-zoom-controls">
          <button
            className="sangtian-zoom-btn"
            onClick={() => handleCycleSpeed('down')}
            title="减速播放"
          >
            -
          </button>
          <span className="sangtian-speed-label">{playbackRate}x</span>
          <button
            className="sangtian-zoom-btn"
            onClick={() => handleCycleSpeed('up')}
            title="加速播放"
          >
            +
          </button>
        </div>
      )}

      <div
        className="sangtian-model-pill"
        style={{ cursor: 'default', userSelect: 'none' }}
      >
        <Sparkles size={14} className="sparkle-gold" />
        <span className="model-pill-text">{timeString}</span>
      </div>
    </div>
  );
}

export function SangtianConsoleCard({
  title,
  subtitle,
  description,
  episodes = [],
  currentEpisodeId,
  onSelectEpisode,
  sources = [],
  currentSource,
  onSelectSource,
  candidates = [],
  currentCandidateId,
  onSelectCandidate,
  streamUrl,
  relatedItems = [],
  onSelectRelated,
  onReplay,
  onTogglePip,
  playerStatus = 'idle',
  isLive = false,
  activeItemId,
  onBack,
  onFav,
  isFav = false,
  onSearchSameName,
}) {
  const [activeTab, setActiveTab] = useState('episodes'); // 'episodes' | 'info' | 'sources'
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedLiveCat, setSelectedLiveCat] = useState('全部');

  const handleCopyStream = () => {
    if (navigator?.clipboard?.writeText && streamUrl) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const liveCategories = React.useMemo(() => {
    if (!isLive || !relatedItems.length) return ['全部'];
    const cats = new Set();
    relatedItems.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return ['全部', ...Array.from(cats)];
  }, [isLive, relatedItems]);

  const filteredLiveChannels = React.useMemo(() => {
    if (!isLive) return [];
    if (selectedLiveCat === '全部') return relatedItems;
    return relatedItems.filter(item => (item.category || '未分类') === selectedLiveCat);
  }, [isLive, selectedLiveCat, relatedItems]);

  return (
    <div className="sangtian-console-card">
      {/* Sub-header Bar: Toggles & View Switches */}
      <div className="sangtian-console-subbar" style={!isLive ? { justifyContent: 'flex-end' } : undefined}>
        {isLive && (
          <div className="console-toggles">
            <div className="console-live-status">
              <span className="live-pill">LIVE 直连</span>
              <span>{playerStatus === 'playing' ? '播放中' : playerStatus === 'buffering' ? '缓冲中' : playerStatus === 'reconnecting' ? '自动重连中' : playerStatus === 'error' ? '播放失败' : '连接中'}</span>
            </div>
          </div>
        )}

        <div className="console-tab-switches">
          {onBack && (
            <button
              className="console-tab-btn back-button"
              onClick={onBack}
              title="返回上一页"
            >
              <ChevronLeft size={14} />
              <span>返回</span>
            </button>
          )}
          {onFav && (
            <button
              className={`console-tab-btn fav-button ${isFav ? 'active-fav' : ''}`}
              onClick={onFav}
              title={isFav ? "取消收藏" : "加入收藏"}
              style={{ color: isFav ? '#e11d48' : 'inherit' }}
            >
              <Heart size={14} fill={isFav ? '#e11d48' : 'none'} />
              <span>{isFav ? '已收藏' : '收藏'}</span>
            </button>
          )}
          {onSearchSameName && (
            <button
              className="console-tab-btn same-name-button"
              onClick={onSearchSameName}
              title="全网跨源搜同名影视"
            >
              <Search size={14} />
              <span>搜同名</span>
            </button>
          )}
          <button
            className={`console-tab-btn ${activeTab === 'episodes' ? 'active' : ''}`}
            onClick={() => setActiveTab('episodes')}
            title={isLive ? "频道选择" : "选集播放"}
          >
            <LayoutGrid size={14} />
            <span>{isLive ? '频道' : '选集'}</span>
          </button>
          <button
            className={`console-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
            title={isLive ? "直播信息" : "剧集信息与简介"}
          >
            <FileText size={14} />
            <span>{isLive ? '信息' : '简介'}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Content */}
      <div className="sangtian-console-body">
        {/* Tab 1: Episodes (选集) OR Channels Grid for Live */}
        {activeTab === 'episodes' && (
          <div className="console-episodes-section">
            <div className="console-section-header">
              <span className="section-eyebrow">
                {isLive ? (filteredLiveChannels.length > 0 ? "LIVE CHANNELS · 频道切换" : "LIVE DIRECT · 当前直播") : "EPISODES · 选集列表"}
              </span>
              <h4>{title}</h4>
            </div>

            {isLive ? (
              <div className="sangtian-channel-selector-wrapper">
                {/* Category Filter Pills */}
                {liveCategories.length > 1 && (
                  <div className="sangtian-console-category-scroll">
                    {liveCategories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className={`console-category-pill ${selectedLiveCat === cat ? 'active' : ''}`}
                        onClick={() => setSelectedLiveCat(cat)}
                      >
                        <span>{cat}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick Line Candidates Bar if lines exist */}
                {candidates.length > 0 && (
                  <div className="console-quick-lines-bar">
                    <span className="quick-lines-label">当前线路:</span>
                    <div className="quick-lines-chips">
                      {candidates.map((c, index) => {
                        const isCurrentLine = c.candidateId === currentCandidateId;
                        const lineName = c.metadata?.label || c.label || (c.index != null ? `线路 ${c.index + 1}` : `线路 ${index + 1}`);
                        return (
                          <button
                            key={c.candidateId}
                            type="button"
                            className={`quick-line-pill ${isCurrentLine ? 'active' : ''}`}
                            onClick={() => {
                              onSelectCandidate?.(c.candidateId);
                              onSwitchCandidate?.(c.candidateId);
                              if (isLive) {
                                onSwitchStreamIndex?.(index);
                              }
                            }}
                          >
                            {lineName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Channels Grid */}
                <div className="sangtian-channel-selection-grid">
                  {filteredLiveChannels.map((item) => {
                    const isCurrent = item.channelId === activeItemId;
                    return (
                      <button
                        key={item.channelId}
                        type="button"
                        className={`sangtian-channel-btn ${isCurrent ? 'active' : ''}`}
                        onClick={() => onSelectRelated?.(item)}
                      >
                        <div className="channel-logo-mini">
                          {item.logo ? <img src={item.logo} alt="" /> : <Radio size={14} />}
                        </div>
                        <div className="channel-info-mini">
                          <span className="channel-name-mini">{item.name}</span>
                          <span className="channel-sub-mini">
                            {isCurrent ? '● 正在播放' : (item.category || '直播频道')}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : episodes.length > 0 ? (
              <div className="sangtian-episode-grid">
                {episodes.map((ep, idx) => {
                  const isCurrent = ep.episodeId === currentEpisodeId || idx === 0 && !currentEpisodeId;
                  return (
                    <button
                      key={ep.episodeId || idx}
                      className={`sangtian-ep-btn ${isCurrent ? 'active' : ''}`}
                      onClick={() => onSelectEpisode?.(idx)}
                    >
                      <span>{ep.title || `${idx + 1}`}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="sangtian-empty-text">当前内容暂无更多选集可供切换</div>
            )}
          </div>
        )}

        {/* Tab 2: Information & Synopsis (视频信息与简介) */}
        {activeTab === 'info' && (
          <div className="console-info-section">
            <div className="console-section-header">
              <span className="section-eyebrow">{isLive ? "LIVE · 当前直播" : "OVERVIEW · 详细资料"}</span>
              <h4>{title}</h4>
            </div>
            {subtitle && <p className="console-subtitle">{subtitle}</p>}
            <p className="console-description">{description || '暂无剧情简介。'}</p>

            <div className="console-info-actions" style={{ display: 'flex', gap: '8px', margin: '12px 0', flexWrap: 'wrap' }}>
              {onSearchSameName && (
                <button
                  type="button"
                  className="secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
                  onClick={onSearchSameName}
                  title="全网跨源搜索同名影视"
                >
                  <Search size={15} />
                  <span>全网搜同名</span>
                </button>
              )}
              {onFav && (
                <button
                  type="button"
                  className={`secondary ${isFav ? 'active-fav' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: isFav ? 'rgba(225,29,72,0.15)' : 'rgba(255,255,255,0.08)', color: isFav ? '#f43f5e' : '#fff', border: isFav ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.15)' }}
                  onClick={onFav}
                >
                  <Heart size={15} fill={isFav ? '#f43f5e' : 'none'} />
                  <span>{isFav ? '已收藏' : '收藏'}</span>
                </button>
              )}
            </div>

            <div className="console-url-snippet">
              <span className="snippet-label">当前流直链：</span>
              <code className="snippet-code">{streamUrl || '加载中…'}</code>
              <button className="snippet-copy-btn" onClick={handleCopyStream}>
                {copiedLink ? <Check size={14} color="#54c46f" /> : <Copy size={14} />}
                <span>{copiedLink ? '已复制' : '复制直链'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Related Recommendations (相关推荐) - Hidden for live because channels are in the main tab */}
        {!isLive && relatedItems.length > 0 && (
          <div className="console-related-section">
            <div className="console-section-header">
              <span className="section-eyebrow">RECOMMENDED · 相关推荐</span>
            </div>
            <div className="sangtian-related-row">
              {relatedItems.slice(0, 6).map(item => (
                <div
                  key={item.contentId || item.channelId}
                  className="sangtian-related-card"
                  onClick={() => onSelectRelated?.(item)}
                >
                  <img src={item.poster || item.logo} alt={item.title || item.name} />
                  <b>{item.title || item.name}</b>
                  <small>{item.category || item.year || '精彩视听'}</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
