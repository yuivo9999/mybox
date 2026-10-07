import Hls from 'hls.js';
import { PlayerState, PlayerCapability, createPlayerCapabilities, createPlayerAdapterContract } from './playerInterface.js';

export function createHtml5PlayerAdapter(video, hooks = {}) {
  if (!video) throw new Error('PLAYER_ELEMENT_REQUIRED');
  let state=PlayerState.IDLE,input=null,released=false,buffering=false;
  let hlsInstance=null;
  let hlsRecoveryCount=0;

  const cleanupHls = () => {
    if (hlsInstance) {
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

      const isHls = Boolean(next.url && (next.url.includes('.m3u8') || next.protocol === 'hls' || next.format === 'hls'));
      const isLiveStream = Boolean(
        next.kind === 'live' ||
        next.protocol === 'LIVE' ||
        next.playerHint?.isLive ||
        next.metadata?.isLive
      );

      if (isHls && Hls.isSupported()) {
        try {
          // 统一直播与流媒体播放内核技术：
          // 1. 初次打开时采用即时低延时快速加载起播（低延时首次渲染）。
          // 2. 随播放进行，动态逐步将前置缓冲区提升至 60 秒提前量（progressive lookahead buffer），抗网络抖动，杜绝卡顿。
          let fragLoadedCount = 0;
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 60,
            maxBufferLength: isLiveStream ? 15 : 30, // 初始快速起播
            maxMaxBufferLength: 120,
            maxBufferSize: 80 * 1000 * 1000,
            maxBufferHole: 0.8,
            highBufferWatchdogPeriod: 2,
            nudgeOffset: 0.2,
            nudgeMaxRetry: 5,
            liveSyncDurationCount: 6,
            liveMaxLatencyDurationCount: 40,
            fragLoadingTimeOut: 25000,
            manifestLoadingTimeOut: 25000,
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
            if (next.playerHint?.autoplay !== false) {
              video.play().catch(() => {});
            }
          });
          hls.on(Hls.Events.FRAG_LOADED, () => {
            fragLoadedCount += 1;
            // 逐步提前缓存至 60 秒直播内容提前量：15s -> 30s -> 45s -> 60s
            if (fragLoadedCount === 1) {
              hls.config.maxBufferLength = Math.max(hls.config.maxBufferLength, 30);
            } else if (fragLoadedCount === 2) {
              hls.config.maxBufferLength = Math.max(hls.config.maxBufferLength, 45);
            } else if (fragLoadedCount >= 3) {
              hls.config.maxBufferLength = 60;
            }
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (hlsRecoveryCount < 1) {
                    hlsRecoveryCount += 1;
                    hls.startLoad();
                  } else {
                    cleanupHls();
                    state = PlayerState.ERROR;
                    emit('error', { nativeError: new Error(data.details || 'HLS_FATAL_NETWORK_ERROR') });
                  }
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  if (hlsRecoveryCount < 1) {
                    hlsRecoveryCount += 1;
                    hls.recoverMediaError();
                  } else {
                    cleanupHls();
                    state = PlayerState.ERROR;
                    emit('error', { nativeError: new Error(data.details || 'HLS_FATAL_MEDIA_ERROR') });
                  }
                  break;
                default:
                  cleanupHls();
                  state = PlayerState.ERROR;
                  emit('error', { nativeError: new Error(data.details || 'HLS_FATAL_ERROR') });
                  break;
              }
            }
          });
        } catch {
          video.src = next.url;
          video.load();
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
    prepare(){if(!input)throw new Error('PLAYER_INPUT_REQUIRED');state=PlayerState.PREPARING;video.load();return input;},
    play(){if(!input)throw new Error('PLAYER_INPUT_REQUIRED');return video.play()??Promise.resolve();},
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
