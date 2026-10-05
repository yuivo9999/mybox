import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, ListVideo, Film, RotateCw, Ratio, Play } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { playbackService } from '../../services/playbackService.js';
import { usePersistentState } from '../../state/usePersistentState.js';
import { SangtianTopBar } from '../../components/theme/SangtianTopBar.jsx';
import { SangtianDrawer } from '../../components/theme/SangtianDrawer.jsx';
import {
  SangtianPlayerWindow,
  SangtianFloatingBar,
  SangtianConsoleCard
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
  const progressRef = useRef({ currentTime: 0, duration: null, persistedAt: 0 });
  const [source, setSource] = useState(request?.metadata?.sourceId ?? request?.candidates?.[0]?.sourceId ?? '');
  const [candidate, setCandidate] = useState(request?.candidates?.[0] ?? null);
  const [status, setStatus] = useState('idle');
  const [resolvedInput, setResolvedInput] = useState(null);
  const [error, setError] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [decoderEngine, setDecoderEngine] = useState('exo');
  const videoRef = useRef(null);
  const videoContainerRef = useRef(null);

  const movie = movies.find(item => item.contentId === request?.contentId);
  const episodes = movie?.episodes ?? request?.metadata?.episodes ?? [];
  const episodeIndex = Math.max(0, episodes.findIndex(item => item.episodeId === request?.episodeId) ?? 0);
  const currentEpisode = episodes[episodeIndex] ?? null;

  const controller = useMemo(() => playbackService.createController(request, {
    onEvent: event => {
      if (event.event === 'error') setError(event.error || '播放候选失败');
      if (event.event === 'progress') {
        const currentTime = event.currentTime ?? 0;
        const duration = event.duration ?? null;
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
    onCandidateChange: setCandidate,
    onResolvedInput: setResolvedInput,
    onParserError: ({ code }) => setError('解析失败：' + code),
    onPlayerError: ({ error: playerError }) => setError(playerError?.message || '播放器加载失败'),
    onExhausted: () => setStatus('error'),
  }), [request, recordProgress]);

  useEffect(() => {
    let active = true;
    const player = controller.attachPlayer(videoRef.current);
    const initial = controller.start();
    setCandidate(initial);
    if (!initial) {
      setStatus('error');
      setError('没有可用的播放候选');
    } else {
      controller.resolveAndLoad(initial).catch(errorValue => {
        if (active) setError(errorValue?.message || '播放初始化失败');
      });
    }
    return () => {
      active = false;
      if (request?.contentId && request?.episodeId && progressRef.current.currentTime > 0) {
        const progress = progressRef.current;
        recordProgress(request.contentId, request.episodeId, progress.currentTime, progress.duration, false);
      }
      controller.leave();
      void player;
    };
  }, [controller, request, recordProgress]);

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
    const nextCandidate = controller.start();
    if (nextCandidate) {
      controller.resolveAndLoad(nextCandidate).catch(errorValue => {
        setError(errorValue?.message || '重新加载失败');
      });
    }
  };

  const handleChangePlaybackRate = rate => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleVideoEnded = () => {
    if (episodeIndex < episodes.length - 1) {
      onEpisode?.(movie, episodeIndex + 1, source, request?.metadata?.returnRoute || 'detail');
    }
  };

  const candidates = request?.candidates ?? [];
  const relatedMovies = movie ? movieService.getRelated({ movies, movie }) : [];
  const activeStreamUrl = resolvedInput?.url || candidate?.url || candidate?.metadata?.url || '';

  const handleSelectTheme = newTheme => {
    saveSettings({ ...settings, theme: newTheme });
  };

  const candidateLabel = candidate?.metadata?.label || candidate?.label || source || '默认线路';

  return (
    <div className="player-page theme-sangtian-layout">
      {/* 1. Top Bar */}
      <SangtianTopBar
        onHamburger={() => setDrawerOpen(true)}
        onPreview={() => {
          const next = candidates.find(c => c.candidateId !== candidate?.candidateId);
          if (next) switchCandidate(next.candidateId);
        }}
        previewText="换源"
        workspaceText={`集数 ${episodeIndex + 1}`}
        badgeRed={`${candidates.length || 8}`}
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

      {/* 2. Context Navigation Bar */}
      <section className="movie-playback-context" aria-label="播放导航详情">
        <div className="movie-playback-context-main">
          <button className="movie-playback-back" type="button" onClick={onBack} aria-label="返回影视详情"><ChevronLeft size={18} /></button>
          <div className="movie-playback-title">
            <b>{movie?.title || request?.metadata?.title || '正在播放'}</b>
            <span>{currentEpisode?.title || `第 ${episodeIndex + 1} 集`} · {candidateLabel}</span>
          </div>
          <button className="movie-playback-fav" type="button" onClick={() => request?.contentId && toggleFavorite?.('content', request.contentId)} aria-label="收藏">
            <Heart size={17} fill={favorites.some(item => item.targetType === 'content' && item.targetId === request?.contentId) ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="movie-playback-context-actions">
          <button type="button" disabled={episodeIndex <= 0} onClick={() => onEpisode?.(movie, episodeIndex - 1, source, request?.metadata?.returnRoute || 'detail')}><ChevronLeft size={15} />上一集</button>
          <button type="button" onClick={() => setSourceModalOpen(true)}><ListVideo size={15} />选集/换源</button>
          <button type="button" disabled={episodeIndex >= episodes.length - 1} onClick={() => onEpisode?.(movie, episodeIndex + 1, source, request?.metadata?.returnRoute || 'detail')}>下一集<ChevronRight size={15} /></button>
        </div>
      </section>

      {/* 3. Fully Featured Video Playback Window */}
      <SangtianPlayerWindow
        videoRef={videoRef}
        status={status}
        error={error}
        resolvedInput={resolvedInput}
        candidate={candidate}
        request={request}
        onRetry={handleRetry}
        onSwitchCandidate={() => {
          const next = candidates.find(c => c.candidateId !== candidate?.candidateId);
          if (next) switchCandidate(next.candidateId);
        }}
        playbackRate={playbackRate}
        onChangePlaybackRate={handleChangePlaybackRate}
        title={movie?.title || request?.metadata?.title || '正在播放'}
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
        videoContainerRef={videoContainerRef}
        terminalTag="VOD DECODE"
        isLive={false}
        channels={[]}
        activeChannel={null}
        activeStreamIndex={0}
        decoderEngine={decoderEngine}
        onChangeDecoderEngine={setDecoderEngine}
      >
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          poster={request?.metadata?.poster || movie?.poster}
          className="sangtian-video-element"
          onEnded={handleVideoEnded}
        />
        {status === 'error' && (
          <div className="video-error" style={{ display: 'none' }}>
            <span>{error}</span>
            <button onClick={handleRetry}>重新播放</button>
          </div>
        )}
      </SangtianPlayerWindow>

      {/* 4. Floating Control Bar */}
      <SangtianFloatingBar
        playbackRate={playbackRate}
        onChangeRate={handleChangePlaybackRate}
        currentCandidateLabel={`✦ ${candidateLabel}`}
        onOpenSourceModal={() => setSourceModalOpen(true)}
      />

      {/* 5. Console Card display */}
      <SangtianConsoleCard
        title={request?.metadata?.title || movie?.title || '精彩视频'}
        subtitle={`${movie?.year || '2026'} · ${movie?.category || '高清影音'} · 第 ${episodeIndex + 1} 集`}
        description={movie?.description || '暂无视频简介。'}
        episodes={episodes}
        currentEpisodeId={request?.episodeId}
        onSelectEpisode={idx => onEpisode?.(movie, idx, source, request?.metadata?.returnRoute || 'detail')}
        candidates={candidates}
        currentCandidateId={candidate?.candidateId}
        onSelectCandidate={switchCandidate}
        streamUrl={activeStreamUrl}
        relatedItems={relatedMovies}
        onSelectRelated={onMovie}
        onReplay={handleRetry}
        playerStatus={status}
        isLive={false}
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

      {/* Source/Episode Selection modal */}
      {sourceModalOpen && (
        <div className="sangtian-modal-backdrop" onClick={() => setSourceModalOpen(false)}>
          <div className="sangtian-modal" onClick={e => e.stopPropagation()}>
            <h4>选择播放源与集数</h4>
            {episodes.length > 0 && (
              <div className="modal-episodes-section" style={{ marginBottom: 16 }}>
                <h5>剧集选集</h5>
                <div className="chips" style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {episodes.map((ep, idx) => (
                    <button
                      key={ep.episodeId}
                      className={episodeIndex === idx ? 'active' : ''}
                      onClick={() => {
                        onEpisode?.(movie, idx, source, request?.metadata?.returnRoute || 'detail');
                        setSourceModalOpen(false);
                      }}
                    >
                      {ep.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h5>线路 / 播放源</h5>
              <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {candidates.map((item, idx) => (
                  <button
                    key={item.candidateId}
                    className={candidate?.candidateId === item.candidateId ? 'active' : ''}
                    onClick={() => { switchCandidate(item.candidateId); setSourceModalOpen(false); }}
                  >
                    {item.metadata?.label || item.label || (item.index != null ? `线路 ${item.index + 1}` : `线路 ${idx + 1}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="actions" style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => setSourceModalOpen(false)}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
