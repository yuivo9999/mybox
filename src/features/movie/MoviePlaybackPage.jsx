import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ListVideo } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { playbackService } from '../../services/playbackService.js';
import { usePersistentState } from '../../state/usePersistentState.js';
import { SangtianTopBar } from '../../components/theme/SangtianTopBar.jsx';
import { SangtianDrawer } from '../../components/theme/SangtianDrawer.jsx';
import {
  SangtianPlayerWindow,
  SangtianFloatingBar,
  SangtianConsoleCard,
} from '../../components/theme/SangtianPlayerConsole.jsx';

export function MoviePlaybackPage({
  request,
  movies = [],
  favorites = [],
  toggleFavorite,
  onBack,
  onEpisode,
  onMovie,
  onTab,
}) {
  const { recordProgress, saveSettings, settings } = usePersistentState();

  const [source, setSource] = useState(request?.metadata?.sourceId ?? request?.candidates?.[0]?.sourceId ?? '');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [status, setStatus] = useState('idle');
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [decoderEngine, setDecoderEngine] = useState('exo');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  const videoRef = useRef(null);
  const playerWindowBodyRef = useRef(null);
  const progressRef = useRef({ currentTime: 0, duration: null, persistedAt: 0 });

  useEffect(() => {
    let active = true;
    const interval = setInterval(() => {
      if (videoRef.current && active) {
        setPlaybackTime(videoRef.current.currentTime || 0);
        setTotalDuration(videoRef.current.duration || 0);
      }
    }, 250);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // VOD / Movie Info
  const movie = useMemo(() => {
    const found = movies.find(item => item.contentId === request?.contentId);
    if (found) return found;
    if (request?.metadata?.movie) return request.metadata.movie;
    if (request?.contentId) {
      return {
        contentId: request.contentId,
        title: request?.metadata?.title || '未知影片',
        poster: request?.metadata?.poster || '',
        episodes: request?.metadata?.episodes || [],
      };
    }
    return null;
  }, [movies, request]);

  const episodes = useMemo(() => {
    return movie?.episodes ?? request?.metadata?.episodes ?? [];
  }, [movie, request]);

  const episodeIndex = useMemo(() => {
    return Math.max(0, episodes.findIndex(item => item.episodeId === request?.episodeId) ?? 0);
  }, [episodes, request]);

  const currentEpisode = useMemo(() => {
    return episodes[episodeIndex] ?? null;
  }, [episodes, episodeIndex]);

  const controller = useMemo(() => playbackService.createController(request, {
    onEvent: event => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'released') setStatus('released');
      if (event.event === 'stopped') setStatus('stopped');

      // VOD Progress Tracking
      if (event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
        setPlaybackTime(currentTime);
        if (duration && Number.isFinite(duration) && duration > 0) {
          setTotalDuration(duration);
        }
        progressRef.current = { ...progressRef.current, currentTime, duration };
        if (request?.contentId && request?.episodeId && currentTime - progressRef.current.persistedAt >= 15) {
          recordProgress(request.contentId, request.episodeId, currentTime, duration, false);
          progressRef.current.persistedAt = currentTime;
        }
      }
      if (event.event === 'completed' && request?.contentId && request?.episodeId) {
        const progress = progressRef.current;
        if (progress.currentTime > 0) {
          recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, true);
        }
      }
    },
    onStateChange: setStatus,
    onCandidateChange: next => {
      setCandidate(next);
      setResolvedInput(null);
      if (next) setError('');
    },
    onResolvedInput: setResolvedInput,
    onParserError: ({ code }) => setError('解析失败：' + code),
    onPlayerError: ({ error: e }) => setError(e?.message || '播放器加载失败'),
    onExhausted: () => setStatus('error'),
  }), [request, recordProgress]);

  useEffect(() => {
    let active = true;
    const onVisibility = () => void controller.handleAppState(document.visibilityState === 'hidden' ? 'background' : 'foreground');
    document.addEventListener('visibilitychange', onVisibility);

    const player = controller.attachPlayer(videoRef.current);
    const initial = controller.start();
    setCandidate(initial);

    if (!initial) {
      setStatus('error');
      setError('没有可用的播放候选');
    } else {
      controller.resolveAndLoad(initial).catch(e => {
        if (active) setError(e?.message || '播放初始化失败');
      });
    }

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);

      if (request?.contentId && request?.episodeId && progressRef.current.currentTime > 0) {
        const progress = progressRef.current;
        recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
      }

      controller.leave();
      void player;
    };
  }, [controller, request, recordProgress]);

  useEffect(() => {
    const body = playerWindowBodyRef.current;
    if (!body || !controller?.setVideoViewBounds) return undefined;

    const syncNativeVideoSurface = () => {
      if (typeof window === 'undefined' || typeof body.getBoundingClientRect !== 'function') return;
      const rect = body.getBoundingClientRect();
      controller.setVideoViewBounds({
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
    const timer = window.setTimeout(syncNativeVideoSurface, 150);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncNativeVideoSurface);
      window.removeEventListener('orientationchange', syncNativeVideoSurface);
      window.clearTimeout(timer);
    };
  }, [controller]);

  const switchCandidate = id => {
    const next = controller.switchCandidate(id);
    if (next) {
      setCandidate(next);
      setSource(next.sourceId ?? '');
      setResolvedInput(null);
      setError('');
    }
  };

  const handleRetry = () => {
    setError('');
    const retry = controller.start();
    if (retry) {
      controller.resolveAndLoad(retry).catch(e => setError(e?.message || '重新加载失败'));
    }
  };

  const handleStop = () => {
    try {
      controller.stop();
    } catch (e) {
      console.error("Stop controller failed:", e);
    }
    setResolvedInput(null);
    try {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.removeAttribute('src');
        try {
          videoRef.current.load();
        } catch {}
      }
    } catch (e) {
      console.error("Pause video failed:", e);
    }
  };

  const handleChangePlaybackRate = rate => {
    setPlaybackRate(rate);
    if (controller?.setPlaybackRate) {
      controller.setPlaybackRate(rate);
    } else if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleSelectTheme = newTheme => {
    saveSettings({ ...settings, theme: newTheme });
  };

  const candidates = request?.candidates ?? [];
  const relatedMovies = movie ? movieService.getRelated({ movies, movie }) : [];
  const activeStreamUrl = resolvedInput?.url || candidate?.mediaUrl || candidate?.url || candidate?.metadata?.url || '';

  const candidateLabel = candidate?.metadata?.label || candidate?.label || (candidate?.index != null ? `线路 ${candidate.index + 1}` : null) || '线路 1';

  return (
    <div className="player-page theme-sangtian-layout">
      {/* 1. Rich Top Bar Controls */}
      <SangtianTopBar
        onBack={onBack}
        title={movie?.title || request?.metadata?.title}
        subTitle={currentEpisode?.title || `第 ${episodeIndex + 1} 集`}
        onHamburger={() => setDrawerOpen(true)}
        onPreview={() => {
          const next = candidates.find(item => item.candidateId !== candidate?.candidateId && !controller.failedCandidateIds?.includes(item.candidateId));
          if (next) switchCandidate(next.candidateId);
        }}
        previewText="切换源"
        workspaceText={`集数 ${episodeIndex + 1}`}
        badgeRed={String(candidates.length)}
        badgeYellow="解析"
        onWorkspace={() => setSourceModalOpen(true)}
        currentTheme={settings?.theme || 'sangtian'}
        onSelectTheme={handleSelectTheme}
        onCopyLink={() => {
          if (activeStreamUrl && navigator?.clipboard) {
            navigator.clipboard.writeText(activeStreamUrl).catch(() => {});
          }
        }}
        onReload={handleRetry}
        onOpenSettings={() => onTab?.('settings') || onBack()}
      />

      {/* Drawer */}
      <SangtianDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNav={tabKey => {
          setDrawerOpen(false);
          if (tabKey === 'movies' || tabKey === 'home') onBack();
          else onTab?.(tabKey) || onBack();
        }}
        currentTheme={settings?.theme || 'sangtian'}
        onSelectTheme={handleSelectTheme}
      />

      {/* 2. Fully Featured Video Playback Window with unified Controller */}
      <SangtianPlayerWindow
        videoRef={videoRef}
        controller={controller}
        videoContainerRef={playerWindowBodyRef}
        status={status}
        error={error}
        resolvedInput={resolvedInput}
        candidate={candidate}
        request={request}
        onRetry={handleRetry}
        onStop={handleStop}
        onSwitchCandidate={() => {
          const next = candidates.find(item => item.candidateId !== candidate?.candidateId && !controller.failedCandidateIds?.includes(item.candidateId));
          if (next) switchCandidate(next.candidateId);
        }}
        terminalTag="VOD DECODE"
        isLive={false}
        playbackRate={playbackRate}
        onChangePlaybackRate={handleChangePlaybackRate}
        title={movie?.title || request?.metadata?.title}
        episodeLabel={currentEpisode?.title || `第 ${episodeIndex + 1} 集`}
        sourceLabel={candidateLabel}
        episodes={episodes}
        currentEpisodeIndex={episodeIndex}
        onSelectEpisode={idx => onEpisode?.(movie, idx, source, request?.metadata?.returnRoute || 'detail')}
        onPreviousEpisode={episodeIndex > 0 ? () => onEpisode?.(movie, episodeIndex - 1, source, request?.metadata?.returnRoute || 'detail') : undefined}
        onNextEpisode={episodeIndex < episodes.length - 1 ? () => onEpisode?.(movie, episodeIndex + 1, source, request?.metadata?.returnRoute || 'detail') : undefined}
        candidates={candidates}
        onSelectCandidate={switchCandidate}
        onOpenSourceModal={() => setSourceModalOpen(true)}
        decoderEngine={decoderEngine}
        onChangeDecoderEngine={setDecoderEngine}
        onTimeMetricsChange={(cur, dur) => {
          setPlaybackTime(cur);
          if (dur > 0 && Number.isFinite(dur)) {
            setTotalDuration(dur);
          }
        }}
      >
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          poster={request?.metadata?.poster || movie?.poster}
          className="sangtian-video-element"
        />
      </SangtianPlayerWindow>

      {/* 3. Floating Control Bar (VOD Only) */}
      <SangtianFloatingBar
        playbackRate={playbackRate}
        isLive={false}
        onChangeRate={handleChangePlaybackRate}
        currentTime={playbackTime}
        duration={totalDuration}
      />

      {/* 4. Rich Console Console Card with unified Back/Fav buttons */}
      <SangtianConsoleCard
        title={request?.metadata?.title || movie?.title || '精彩视频'}
        subtitle={`${movie?.year || '2026'} · ${movie?.category || '高清影音'} · 第 ${episodeIndex + 1} 集`}
        description={movie?.description || '暂无内容简介。'}
        episodes={episodes}
        currentEpisodeId={request?.episodeId}
        onSelectEpisode={idx => {
          onEpisode?.(movie, idx, source, request?.metadata?.returnRoute || 'detail');
        }}
        candidates={candidates}
        currentCandidateId={candidate?.candidateId}
        onSelectCandidate={switchCandidate}
        streamUrl={activeStreamUrl}
        relatedItems={relatedMovies}
        activeItemId={null}
        onSelectRelated={next => {
          if (next) onMovie?.(next);
        }}
        onReplay={handleRetry}
        playerStatus={status}
        isLive={false}
        onBack={onBack}
        onFav={() => {
          if (request?.contentId) toggleFavorite?.('content', request.contentId);
        }}
        isFav={favorites.some(item => item.targetId === request?.contentId)}
        onTogglePip={() => {
          if (videoRef.current && document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture?.().catch(() => {});
            } else {
              videoRef.current.requestPictureInPicture?.().catch(() => {});
            }
          }
        }}
      />

      {/* 5. Context Navigation Bar for Movies with Centered Title */}
      <section className="movie-playback-context" aria-label="播放导航详情" style={{ marginTop: 12 }}>
        <div className="movie-playback-context-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', padding: '16px 0' }}>
          <div className="movie-playback-title" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            width: '100%',
            margin: '0 auto',
          }}>
            <b style={{
              fontSize: '22px',
              letterSpacing: '0.2em',
              textShadow: 'none',
              fontWeight: 'bold',
              marginBottom: '6px',
              color: '#e60012'
            }}>
              {movie?.title || request?.metadata?.title || '正在播放'}
            </b>
            <span style={{
              fontSize: '13px',
              letterSpacing: '0.08em',
              opacity: 0.85,
              color: 'var(--color-text-muted, #b39b7d)'
            }}>
              {(currentEpisode?.title || `第 ${episodeIndex + 1} 集`)} · {candidateLabel}
            </span>
          </div>
        </div>
        <div className="movie-playback-context-actions">
          <button type="button" disabled={episodeIndex <= 0} onClick={() => onEpisode?.(movie, episodeIndex - 1, source, request?.metadata?.returnRoute || 'detail')}><ChevronLeft size={15} />上一集</button>
          <button type="button" onClick={() => setSourceModalOpen(true)}><ListVideo size={15} />选集/换源</button>
          <button type="button" disabled={episodeIndex >= episodes.length - 1} onClick={() => onEpisode?.(movie, episodeIndex + 1, source, request?.metadata?.returnRoute || 'detail')}>下一集<ChevronRight size={15} /></button>
        </div>
      </section>

      {/* Source Selection Modal */}
      {sourceModalOpen && (
        <div className="sangtian-modal-backdrop" onClick={() => setSourceModalOpen(false)}>
          <div className="sangtian-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <h3>播放线路与解析切换</h3>
                <button className="close-btn" onClick={() => setSourceModalOpen(false)}>✕</button>
              </div>
            </div>

            <div className="modal-body">
              <div className="modal-section-title">可用线路 ({candidates.length})</div>
              <div className="source-cards-grid">
                {candidates.map((c, i) => {
                  const isCurrent = c.candidateId === candidate?.candidateId;
                  return (
                    <div
                      key={c.candidateId}
                      className={`source-card ${isCurrent ? 'active' : ''}`}
                      onClick={() => {
                        switchCandidate(c.candidateId);
                        setSourceModalOpen(false);
                      }}
                    >
                      <div className="card-top">
                        <span className="source-name">{c.metadata?.label || c.label || `线路 ${i + 1}`}</span>
                        {isCurrent && <span className="current-badge">正在使用</span>}
                      </div>
                      <div className="card-tags">
                        <span className="tech-tag">{c.protocol || 'HTTP'}</span>
                        <span className="tech-tag">{decoderEngine.toUpperCase()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="modal-section-title" style={{ marginTop: 20 }}>剧集选择 ({episodes.length} 集)</div>
              <div className="episodes-grid-modal">
                {episodes.map((ep, idx) => (
                  <button
                    key={ep.episodeId || idx}
                    type="button"
                    className={`modal-ep-btn ${idx === episodeIndex ? 'active' : ''}`}
                    onClick={() => {
                      onEpisode?.(movie, idx, source, request?.metadata?.returnRoute || 'detail');
                      setSourceModalOpen(false);
                    }}
                  >
                    {ep.title || `${idx + 1}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
