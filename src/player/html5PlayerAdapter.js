import Hls from 'hls.js';
import { buildHlsProxyUrl, canUseHlsProxy, isMixedContentUrl } from '../playback/hlsWebProxy.js';
import { PlayerState, PlayerCapability, createPlayerCapabilities, createPlayerAdapterContract } from './playerInterface.js';

export function createHtml5PlayerAdapter(video, hooks = {}) {
  if (!video) throw new Error('PLAYER_ELEMENT_REQUIRED');
  let state=PlayerState.IDLE,input=null,released=false,buffering=false;
  let hlsInstance=null;
  let hlsRecoveryCount=0;
  let hlsGeneration=0;

  const cleanupHls = () => {
    if (hlsInstance) {
      try {
        hlsInstance.stopLoad();
      } catch {}
      try {
        hlsInstance.detachMedia();
      } catch {}
      try {
        hlsInstance.destroy();
      } catch {}
      hlsInstance = null;
    }
  };

  const emit=(event,data={})=>hooks.onEvent?.({event,...data});
  const onLoadStart=()=>{state=PlayerState.LOADING;emit('loading');};
  const onWaiting=()=>{if(!buffering){buffering=true;state=PlayerState.BUFFERING;emit('bufferingStart');emit('buffering');}};
  const endBuffering=()=>{if(buffering){buffering=false;emit('bufferingEnd');} if(state===PlayerState.BUFFERING)state=PlayerState.PLAYING;};
  const onCanPlay=()=>{endBuffering();state=PlayerState.PREPARING;emit('prepared');};
  const onPlaying=()=>{endBuffering();state=PlayerState.PLAYING;emit('playing');};
  const onPause=()=>{if(state!==PlayerState.COMPLETED&&state!==PlayerState.STOPPED&&!released){state=PlayerState.PAUSED;emit('paused');}};
  const onTimeUpdate=()=>emit('progress',{currentTime:video.currentTime,duration:video.duration});
  const onEnded=()=>{state=PlayerState.COMPLETED;emit('completed');};
  const onError=()=>{state=PlayerState.ERROR;emit('error',{nativeError:video.error});};
  const bind=()=>{for(const [e,h] of [['loadstart',onLoadStart],['waiting',onWaiting],['canplay',onCanPlay],['playing',onPlaying],['pause',onPause],['timeupdate',onTimeUpdate],['durationchange',onTimeUpdate],['loadedmetadata',onTimeUpdate],['ended',onEnded],['error',onError]])video.addEventListener(e,h);};
  const unbind=()=>{for(const [e,h] of [['loadstart',onLoadStart],['waiting',onWaiting],['canplay',onCanPlay],['playing',onPlaying],['pause',onPause],['timeupdate',onTimeUpdate],['durationchange',onTimeUpdate],['loadedmetadata',onTimeUpdate],['ended',onEnded],['error',onError]])video.removeEventListener(e,h);};
  const trackList=(list)=>Array.from(list??[]).map((t,i)=>({id:String(t.id??t.language??i),label:t.label??t.language??`Track ${i+1}`,language:t.language??'',kind:t.kind??''}));
  bind();

  const adapter={
    get capabilities(){return createPlayerCapabilities(video);},
    load(next){
       if(released)throw new Error('PLAYER_ADAPTER_RELEASED');
       input=next;
       state=PlayerState.LOADING;
       hlsRecoveryCount=0;
       cleanupHls();
       video.pause();
       video.removeAttribute('src');
       try { video.load(); } catch (e) {}

       const urlLower = String(next.url || '').toLowerCase();
       const isHls = Boolean(next.url && (urlLower.includes('.m3u8') || urlLower.includes('/pltv/') || urlLower.includes('/tvod/') || urlLower.includes('.ctv') || urlLower.includes('playlist') || next.protocol === 'hls' || next.format === 'hls'));
      const isLiveStream = Boolean(
        next.kind === 'live' ||
        next.protocol === 'LIVE' ||
        next.playerHint?.isLive ||
        next.playerHint?.live ||
        next.metadata?.isLive
      );
      const isLowLatency = Boolean(next.playerHint?.webMode === 'hls_lowlatency' || isLiveStream);

      if (isHls && Hls.isSupported()) {
        const tryAutoplay = () => {
          const p = video.play();
          p?.catch?.(err => {
            if (err?.name === 'NotAllowedError' && !video.muted) {
              video.muted = true;
              video.play()?.catch?.(() => {});
            }
          });
        };

        const mixed = isMixedContentUrl(next.url);
        if (mixed && !canUseHlsProxy()) {
          // https 页面无法加载 http 源：立即给出明确错误，不再空等 25 秒超时
          state = PlayerState.ERROR;
          Promise.resolve().then(() => {
            if (!released && input === next) emit('error', { nativeError: new Error('HLS_UNSUPPORTED:MIXED_CONTENT_NEED_HTTPS_PROXY') });
          });
        } else {
          // viaProxy=true 时，hls.js 的每个请求（清单、分片、密钥）都改走中转
          const startHls = (viaProxy) => {
            try {
              hlsGeneration += 1;
              const currentHlsGen = hlsGeneration;
              const isCurrentHls = () => hlsGeneration === currentHlsGen && hlsInstance === hls;
              let fragLoadedCount = 0;
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: isLowLatency,
                liveSyncMode: 'buffered',
                startOnSegmentBoundary: true,
                initialLiveManifestSize: 6,
                backBufferLength: isLiveStream ? 30 : 60,
                maxBufferLength: isLiveStream ? 12 : 30,
                maxMaxBufferLength: isLiveStream ? 35 : 120,
                maxBufferSize: 80 * 1000 * 1000,
                maxBufferHole: 0.8,
                highBufferWatchdogPeriod: 2,
                nudgeOffset: 0.2,
                nudgeMaxRetry: 5,
                liveSyncDurationCount: isLiveStream ? 3 : 6,
                liveMaxLatencyDurationCount: isLiveStream ? 15 : 40,
                fragLoadingTimeOut: 25000,
                manifestLoadingTimeOut: 25000,
                xhrSetup: (xhr, requestUrl) => {
                  if (!viaProxy) return;
                  const proxied = buildHlsProxyUrl(requestUrl);
                  if (proxied) xhr.open('GET', proxied, true);
                },
              });
              hlsInstance = hls;
              hls.attachMedia(video);
              hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(next.url);
              });
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                hlsRecoveryCount = 0;
                endBuffering();
                state = PlayerState.PREPARING;
                emit('prepared');
                if (next.playerHint?.autoplay !== false) tryAutoplay();
              });
              hls.on(Hls.Events.FRAG_LOADED, () => {
                fragLoadedCount += 1;
                if (fragLoadedCount === 1) {
                  hls.config.maxBufferLength = Math.max(hls.config.maxBufferLength, 30);
                } else if (fragLoadedCount === 2) {
                  hls.config.maxBufferLength = Math.max(hls.config.maxBufferLength, 45);
                } else if (fragLoadedCount >= 3) {
                  hls.config.maxBufferLength = 60;
                }
              });
              hls.on(Hls.Events.ERROR, (event, data) => {
                if (!data.fatal) return;
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    // 直连失败（跨域/不可达）且已配置中转：自动改走中转重试一次
                    if (!viaProxy && canUseHlsProxy()) {
                      hlsRecoveryCount = 0;
                      cleanupHls();
                      startHls(true);
                      break;
                    }
                    if (hlsRecoveryCount < 1) {
                      hlsRecoveryCount += 1;
                      hls.startLoad();
                    } else {
                      cleanupHls();
                      state = PlayerState.ERROR;
                      emit('error', { nativeError: new Error('HLS_NETWORK_ERROR:' + (data.details || 'fatal')) });
                    }
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    if (hlsRecoveryCount < 1) {
                      hlsRecoveryCount += 1;
                      hls.recoverMediaError();
                    } else {
                      cleanupHls();
                      state = PlayerState.ERROR;
                      emit('error', { nativeError: new Error('HLS_MEDIA_ERROR:' + (data.details || 'fatal')) });
                    }
                    break;
                  default:
                    cleanupHls();
                    state = PlayerState.ERROR;
                    emit('error', { nativeError: new Error('HLS_ERROR:' + (data.details || 'fatal')) });
                    break;
                }
              });
            } catch {
              video.src = next.url;
              video.load();
            }
          };
          startHls(mixed);
        }
      } else {
        video.src = next.url;
        video.autoplay = next.playerHint?.autoplay !== false;
        video.load();
      }

      if(next.cookies&&typeof document!=='undefined'){try{for(const cookie of String(next.cookies).split(/;\s*/)){const i=cookie.indexOf('=');if(i>0)document.cookie=cookie;}}catch{}}
      if(next.headers&&Object.keys(next.headers).length)emit('requestContextIgnored',{reason:'HTML5_VIDEO_CANNOT_SET_CUSTOM_HEADERS'});
      return input;
    },
    prepare(){if(!input)throw new Error('PLAYER_INPUT_REQUIRED');if(hlsInstance)return input;if(state===PlayerState.ERROR)return input;state=PlayerState.PREPARING;video.load();return input;},
    play(){
      if(!input)throw new Error('PLAYER_INPUT_REQUIRED');
      if(state===PlayerState.ERROR)return Promise.resolve();
      const attempt=()=>{
        const p=video.play();
        if(!p||typeof p.catch!=='function')return Promise.resolve();
        return p.catch(err=>{
          if(err?.name==='AbortError')return undefined;
          if(err?.name==='NotAllowedError'&&!video.muted){video.muted=true;return video.play()?.catch?.(()=>undefined);}
          throw err;
        });
      };
      // HLS 起播需等清单与首片段下载完成，这里不阻塞加载流程；真实失败由 HLS 错误事件上报
      if(hlsInstance){void attempt().catch(()=>{});return Promise.resolve();}
      return attempt();
    },
    pause(){video.pause();return true;},
    seek(seconds){if(!Number.isFinite(seconds))return false;if(!Number.isFinite(video.duration)&&!video.seekable?.length)return false;video.currentTime=Math.max(0,seconds);return video.currentTime;},
    setPlaybackRate(rate){const r=Number(rate);if(Number.isFinite(r)&&r>0){video.playbackRate=r;}return video.playbackRate;},
    stop(){
      cleanupHls();
      try { video.pause(); } catch {}
      try { video.src = ""; } catch {}
      try { video.removeAttribute('src'); } catch {}
      try { video.load(); } catch {}
      state=PlayerState.STOPPED;
      emit('stopped');
    },
    setVolume(value){const n=Number(value);if(!Number.isFinite(n))return video.volume;video.volume=Math.min(1,Math.max(0,n));return video.volume;},
    getState(){return {state,input,currentTime:video.currentTime,duration:video.duration};},
    getAudioTracks(){return trackList(video.audioTracks);},
    getSubtitleTracks(){return trackList(video.textTracks);},
    selectAudioTrack(trackId){if(!video.audioTracks)return false;for(const t of video.audioTracks)t.enabled=String(t.id)===String(trackId);emit('audioTrackChanged',{trackId});return true;},
    selectSubtitleTrack(trackId){if(!video.textTracks)return false;for(const t of video.textTracks)t.mode=String(t.id)===String(trackId)?'showing':'disabled';emit('subtitleTrackChanged',{trackId});return true;},
    getQualities(){return input?.manifest?.variants?.map((v,i)=>({qualityId:String(v.attributes?.['VIDEO-RANGE']??v.attributes?.RESOLUTION??i),width:Number(v.attributes?.RESOLUTION?.split('x')?.[0]??0),height:Number(v.attributes?.RESOLUTION?.split('x')?.[1]??0),bitrate:Number(v.attributes?.BANDWIDTH??0),url:v.url}))??[];},
    selectQuality(qualityId){const q=this.getQualities().find(x=>x.qualityId===String(qualityId));if(!q)return false;const wasPlaying=!video.paused;const pos=video.currentTime;video.src=q.url;video.load();if(wasPlaying)void video.play();if(Number.isFinite(pos))try{video.currentTime=pos;}catch{}emit('qualityChanged',{quality:q});return q;},
    release(){if(released)return;released=true;cleanupHls();unbind();try { video.pause(); } catch {} try { video.src = ""; } catch {} try { video.removeAttribute('src'); } catch {} try { video.load(); } catch {} state=PlayerState.RELEASED;emit('released');},
  };
  return createPlayerAdapterContract(adapter);
}
