import React, { useEffect, useRef, useState } from 'react';
import { Home, Film, Radio, Heart, User } from 'lucide-react';
import { contentService } from '../services/contentService.js';
import { playbackService } from '../services/playbackService.js';
import { cacheService } from '../services/cacheService.js';
import { sourceManagementService } from '../services/sourceManagementService.js';
import { usePersistentState } from '../state/usePersistentState.js';
import { useSessionState } from '../state/useSessionState.js';
import { sessionStateStore } from '../state/sessionStateStore.js';
import { pageStateStore } from '../state/pageStateStore.js';
import { MovieFeature } from '../features/movie/MovieFeature.jsx';
import { LiveFeature, LiveChannelPanel, resolveLiveChannelStreams, globalLiveCache } from '../features/live/LiveFeature.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { webViewRuntime } from '../runtime/webViewRuntime.js';
import { MainPage } from '../pages/MainPage.jsx';
import { PlaybackPage } from '../pages/PlaybackPage.jsx';
import { LoadingState, ErrorState } from '../components/StateViews.jsx';
import { getFontById } from '../config/fontCatalog.js';
import { ensureFont } from '../services/fontLoader.js';
import { getGestureDirection, getTopLevelSwipeTarget, getParentForRoute, isSwipeExcludedTarget } from './navigationGesture.js';

export function App(){
 const session=useSessionState(); const persistent=usePersistentState(); const {tab,route,selected}=session;
 const [contentState,setContentState]=useState({status:'idle',movies:[],channels:[],error:null,sourceLoading:false,movieCategories:[],movieActiveCategory:null,movieSourceId:null,movieCategoryLoading:false});
 const [sourceErrorDismissed,setSourceErrorDismissed]=useState(false);
 const reloadGenerationRef=useRef(0);
 const applySourceResult=(result,generation=reloadGenerationRef.current)=>{
   if(generation!==reloadGenerationRef.current)return;
   const incomingMovies=contentService.getMovies(result.movies);
   const failed=result.results.filter(item=>item.status==='rejected');
   const selectedMovieSourceId=persistent.selectedSources?.movie ?? persistent.settings?.defaultMovieSource ?? null;
   const resultMovieSourceId=result.results.find(item=>item.status==='fulfilled'&&item.sourceId)?.sourceId ?? selectedMovieSourceId ?? null;
   const selectedMovieFailed=Boolean(selectedMovieSourceId)&&failed.some(item=>item.sourceId===selectedMovieSourceId);
   setContentState(state=>{
     const sameMovieSource=Boolean(state.movieSourceId)&&state.movieSourceId===resultMovieSourceId;
     const movies=sameMovieSource ? contentService.getMovies([...(state.movies??[]),...incomingMovies]) : incomingMovies;
     const categories=[...(sameMovieSource ? (state.movieCategories??[]) : []),...(result.movieCategories??[])];
     const seen=new Set();
     const uniqueCategories=categories.filter(item=>{const key=String(item.sourceId||resultMovieSourceId)+':'+String(item.id||item.name);if(seen.has(key))return false;seen.add(key);return true;});
     return {status:selectedMovieFailed&&!movies.length?'error':'success',movies,channels:result.channels?.length?result.channels:state.channels,error:failed.length?failed:null,sourceLoading:false,movieCategories:uniqueCategories,movieActiveCategory:result.movieActiveCategory??state.movieActiveCategory??null,movieSourceId:resultMovieSourceId,movieCategoryLoading:false};
   });
   persistent.reload?.();
 };
 const reloadSources=async(movieSourceIdOverride=undefined,{background=false,includeMovie=true,includeLive=!background,liveSourceIds=null,movieCategoryId=null,movieCategoryName='',moviePage=1,moviePageSize=24}={})=>{
   const generation=++reloadGenerationRef.current;
   setSourceErrorDismissed(false);
   if(!background) setContentState(state=>({...state,status:'loading',error:null,sourceLoading:false}));
   else setContentState(state=>({...state,error:null,sourceLoading:true,movieCategoryLoading:includeMovie}));
   try{
     const selectedMovieSourceId = movieSourceIdOverride !== undefined
       ? movieSourceIdOverride
       : (persistent.selectedSources?.movie ?? persistent.settings?.defaultMovieSource ?? null);
     const result=await sourceManagementService.reload({
       movieSourceId: selectedMovieSourceId,
       includeMovie,
       includeLive,
       liveSourceIds,
       movieCategoryId,
       movieCategoryName,
       moviePage,
       moviePageSize,
     });
     applySourceResult(result,generation);
   }catch(error){
     if(generation!==reloadGenerationRef.current)return;
     setContentState(state=>({status:background?'success':'error',movies:background?state.movies:[],channels:state.channels,error,sourceLoading:false,movieCategoryLoading:false}));
   }
 };
 useEffect(()=>{cacheService.prune();},[]);
 useEffect(()=>{
   if(persistent.settings?.initialized) void reloadSources();
 },[persistent.settings?.initialized]);
 useEffect(()=>{
   if(tab!=='live'||contentState.channels.length!==0||contentState.status==='loading') return;
   // TV1 专用源由 LiveFeature 按源生命周期独立懒加载；这里不能因为
   // contentState.channels 为空而反复触发全局 reload，否则只有 TV1 源时会形成循环刷新。
   const hasReloadableLive=persistent.sources?.some(source => (
     source.sourceType==='live'
     && source.liveMode!=='tv1'
     && source.enabled!==false
     && Boolean(source.sourceRef||source.url)
   ));
   if(hasReloadableLive) void reloadSources();
 },[tab,contentState.channels.length,contentState.status,persistent.sources]);
 useEffect(()=>webViewRuntime.mount({onBack:()=>{
   if(typeof document!=='undefined'&&document.fullscreenElement){void webViewRuntime.setFullscreen(false);return true}
   if(route==='movie-play'){sessionStateStore.patch({route:selected?.metadata?.returnRoute||'detail'});return true}   if(route==='live-play'){handleLiveBack();return true}
   if(route==='detail'||route==='live-channel'||route==='search'){sessionStateStore.patch({route:null,selected:null});return true}
   return false;
 },onAppStateChange:(state)=>{if(state==='foreground'&&(route==='movie-play'||route==='live-play'))webViewRuntime.call('getAppState')} }),[route]);

 const openMovie=(movie,routeOverride=null)=>{
   if(routeOverride==='search'){sessionStateStore.patch({tab:'movies',route:'search',selected:null});return}
   if(!movie)return;
   if(movie.contentId) persistent.touchFavorite?.('content', movie.contentId);
   sessionStateStore.patch({selected:movie,route:'detail',tab:'movies'});
 };
 const playMovie=(movie,episodeIndex=0,sourceId=null,returnRoute='detail')=>{
   if(!movie)return;
   const episodes=(Array.isArray(movie.episodes)&&movie.episodes.length>0)
     ? movie.episodes
     : (Array.isArray(movie.metadata?.episodes) && movie.metadata.episodes.length > 0)
     ? movie.metadata.episodes
     : [{
         episodeId: `${movie.contentId || 'movie'}:ep:1`,
         title: '正片',
         episodeNumber: 1,
         playbackCandidates: movie.playbackCandidates || (movie.playUrl ? [{ mediaUrl: movie.playUrl, label: '默认线路' }] : []),
       }];
   const episode=episodes[episodeIndex]??episodes[0]; if(!episode)return;
   const progress=persistent.progress.find((item)=>item.contentId===movie.contentId&&item.episodeId===episode.episodeId);
   const preferredSource=sourceId||persistent.selectedSources?.movie||persistent.settings?.defaultMovieSource||null;
   const fullMovie={...movie,episodes};
   const request=playbackService.createVODRequest({content:fullMovie,episode,episodeIndex,preferredSource,metadata:{title:movie.title,poster:movie.poster,episodeTitle:episode.title??'',sourceId:preferredSource,returnRoute,movie:fullMovie,episodes,startPositionSeconds:persistent.settings?.autoplayResume?(progress?.completed?0:(progress?.positionSeconds??0)):0}});
   if(preferredSource){const sourceCandidates=request.candidates.filter(candidate=>candidate.sourceId===preferredSource);if(sourceCandidates.length)request.candidates=sourceCandidates;sourceManagementService.touchUsage(preferredSource);}
   sessionStateStore.patch({selected:request,route:'movie-play',tab:'movies'}); persistent.recordMoviePlay(fullMovie,episodeIndex,sourceId);
 };
 const testSource=async(source)=>{
   if(!source?.sourceId)return;
   const current=persistent.sources;
   const mark=(status)=>{sourceManagementService.updateStatus(source.sourceId,status);persistent.reload?.();};
   mark('测试中');
   try{
     const result=await sourceManagementService.test(source);
     mark(result.ok?'可用':'不可用');
     if(result.ok) void reloadSources();
   }catch{
     mark('不可用');
   }
 };
 const saveSources=async(next)=>{const validIds=new Set(next.map(source=>source.sourceId));const current=persistent.settings||{};const patch={};if(current.defaultMovieSource&&!validIds.has(current.defaultMovieSource))patch.defaultMovieSource=null;if(current.defaultLiveSource&&!validIds.has(current.defaultLiveSource))patch.defaultLiveSource=null;const result=await sourceManagementService.save(next);if(Object.keys(patch).length)persistent.updateSettings(patch);else persistent.reload?.();applySourceResult(result);};
 const setSourceEnabled=async(id,enabled)=>{
   const source=persistent.sources.find(item=>item.sourceId===id);
   const result=await sourceManagementService.setEnabled(id,enabled);
   const patch={};
   if(!enabled&&source?.sourceType==='movie'&&persistent.settings?.defaultMovieSource===id)patch.defaultMovieSource=null;
   if(!enabled&&source?.sourceType==='live'&&persistent.settings?.defaultLiveSource===id)patch.defaultLiveSource=null;
   if(!enabled&&source?.sourceType==='live'&&route==='live-play'){
     const invalid=selected?.candidates?.length
       ? selected.candidates.every(candidate=>candidate.sourceId===id)
       : selected?.metadata?.sourceId===id;
     if(invalid) sessionStateStore.patch({route:'live-channel',selected:null});
   }
   if(Object.keys(patch).length)persistent.updateSettings(patch);else persistent.reload?.();
   applySourceResult(result);
 };
 const setSourceActive=async(id)=>{
   const source=persistent.sources.find(item=>item.sourceId===id);
   await sourceManagementService.setActive(id);
   persistent.reload?.();
   if(source?.sourceType==='movie'){
     void reloadSources(id,{background:true,includeMovie:true,includeLive:false});
   }else if(source?.sourceType==='live'){
     void reloadSources(undefined,{background:true,includeMovie:false,includeLive:true,liveSourceIds:[id]});
   }
 };
 const removeSource=async(id)=>{
   const source=persistent.sources.find(item=>item.sourceId===id);
   const result=await sourceManagementService.remove(id);
   const patch={};
   if(source?.sourceType==='movie'&&persistent.settings?.defaultMovieSource===id)patch.defaultMovieSource=null;
   if(source?.sourceType==='live'&&persistent.settings?.defaultLiveSource===id)patch.defaultLiveSource=null;
   if(source?.sourceType==='live'&&route==='live-play'){
     const invalid=selected?.candidates?.length
       ? selected.candidates.every(candidate=>candidate.sourceId===id)
       : selected?.metadata?.sourceId===id;
     if(invalid) sessionStateStore.patch({route:'live-channel',selected:null});
   }
   if(Object.keys(patch).length)persistent.updateSettings(patch);else persistent.reload?.();
   applySourceResult(result);
 };
 const nav=(key)=>sessionStateStore.patch({tab:key,route:null,selected:null});

 // 全局 Android 风格横向导航：顶层五页使用左右切页；下一级页面右滑返回父级。
 const swipeRef = useRef({active:false,startX:0,startY:0,pointerId:null,blocked:false});
 const handleSwipePointerDown = (event) => {
   if (event.pointerType === 'mouse' || event.isPrimary === false) return;
   swipeRef.current = {active:true,startX:event.clientX,startY:event.clientY,pointerId:event.pointerId,blocked:isSwipeExcludedTarget(event.target)};
 };
 const handleSwipePointerUp = (event) => {
   const gesture = swipeRef.current;
   swipeRef.current = {active:false,startX:0,startY:0,pointerId:null,blocked:false};
   if (!gesture.active || event.pointerId !== gesture.pointerId || gesture.blocked || isSwipeExcludedTarget(event.target)) return;
   const direction = getGestureDirection(event.clientX - gesture.startX, event.clientY - gesture.startY);
   if (!direction) return;

   // 全屏/播放器状态优先退出全屏，不触发页面切换。
   if (typeof document !== 'undefined' && document.fullscreenElement) {
     const exitFullscreen = document.exitFullscreen?.();
     exitFullscreen?.catch?.(() => {});
     return;
   }

   // 子页面只把“右滑”定义为 Android 返回手势；左滑不改变页面层级。
   if (route) {
     if (direction !== 'right') return;
     if (route === 'movie-play') {
       sessionStateStore.patch({route:selected?.metadata?.returnRoute||'detail',selected:selected?.metadata?.returnRoute==='detail'?selected:null});
     } else if (route === 'detail' || route === 'search') {
       sessionStateStore.patch({route:null,selected:null});
     } else if (route === 'live-play') {
       sessionStateStore.patch({route:'live-channel',selected:contentState.channels.find(c => c.channelId === selected?.channelId) ?? null});
     } else if (route === 'live-channel') {
       sessionStateStore.patch({route:null,selected:null});
     }
     return;
   }

   // 管理页同样属于应用导航栈：右滑回到所属的上一级页面。
   if (direction === 'right') {
     const parentTab = getParentForRoute({tab, route:null, selected});
     if (parentTab) {
       nav(parentTab);
       return;
     }
   }

   // 顶层五页统一为 Android 横向分页：左滑下一页，右滑上一页。
   const targetTab = getTopLevelSwipeTarget(tab, direction);
   if (targetTab) nav(targetTab);
 };
 const openSearchHistory=(keyword)=>{pageStateStore.patch('search',{query:keyword});sessionStateStore.patch({tab:'movies',route:'search',selected:null});};
 const openLiveChannel=(channel)=>{
   if(!channel)return;
   persistent.touchFavorite?.('channel', channel.channelId);
   sessionStateStore.patch({selected:channel,route:'live-channel',tab:'live'});
 };
 const handleLiveBack = () => {
   const returnRoute = selected?.metadata?.returnRoute;
   if (returnRoute === 'live-channel') {
     const channelObj = selected?.metadata?.channel || contentState.channels.find(c => c.channelId === selected?.channelId) || null;
     if (channelObj) {
       sessionStateStore.patch({ route: 'live-channel', selected: channelObj });
       return;
     }
   }
   sessionStateStore.patch({ route: null, selected: null, tab: 'live' });
 };
 const playLive=async(channel,streamId=null,returnRoute=null)=>{
   if(!channel)return;
   persistent.touchFavorite?.('channel', channel.channelId);
   persistent.recordLivePlay(channel, streamId);

   let resolvedChannel = channel;
   if (channel.deferredRef && (!channel.streams || !channel.streams.length)) {
     try {
       const streams = await resolveLiveChannelStreams(channel, { sources: persistent.sources });
       if (streams && streams.length > 0) {
         resolvedChannel = { ...channel, streams };
       }
     } catch (err) {
       console.error('Failed to resolve live streams:', err);
     }
   }

   const preferredSource=persistent.settings?.defaultLiveSource||null;
   const request=playbackService.createLiveRequest({channel:resolvedChannel,preferredSource,metadata:{title:resolvedChannel.name,category:resolvedChannel.category,channelId:resolvedChannel.channelId,channel:resolvedChannel,returnRoute}});
   if(streamId){
     const index=request.candidates.findIndex((candidate)=>candidate.streamId===streamId);
     if(index>=0){
       request.candidates=[request.candidates[index],...request.candidates.filter((_,i)=>i!==index)];
       sourceManagementService.touchUsage(request.candidates[0]?.sourceId);
     }
   } else if(request.candidates[0]?.sourceId) {
     sourceManagementService.touchUsage(request.candidates[0]?.sourceId);
   }
   sessionStateStore.patch({selected:request,route:'live-play',tab:'live'});
 };
 const movieActive=['detail','movie-play','search'].includes(route)||tab==='home'||tab==='movies';
 const isManagementTab = ['sources', 'settings', 'appearance', 'me', 'about', 'data-management', 'history', 'search-history'].includes(tab);

 useEffect(()=>{ void ensureFont(getFontById(persistent.settings?.fontFamily)); },[persistent.settings?.fontFamily]);

 if(!persistent.settings?.initialized) return <FirstLaunch onLater={()=>persistent.saveSettings({...persistent.settings,initialized:true,initializedAt:Date.now()})} onSources={()=>{persistent.saveSettings({...persistent.settings,initialized:true,initializedAt:Date.now()});nav('sources')}}/>;
 
 const selectedFont=getFontById(persistent.settings?.fontFamily);
 const appearanceClass=`theme-${persistent.settings?.theme||'sangtian'} font-${persistent.settings?.fontSize||'medium'} app-font-${persistent.settings?.fontFamily||'noto-sans-sc'} cards-${persistent.settings?.cardStyle||'poster'} density-${persistent.settings?.density||'comfortable'}`;

 return (
  <div className={`app-shell ${appearanceClass}`} style={{'--app-font-family':`"${selectedFont.family}",Inter,ui-sans-serif,system-ui,sans-serif`}} onPointerDown={handleSwipePointerDown} onPointerUp={handleSwipePointerUp} onPointerCancel={() => { swipeRef.current = {active:false,startX:0,startY:0,pointerId:null}; }}>
    <div className="screen">
      {(() => {
        // 1. If in a management tab, always show it
        if (isManagementTab) {
          return <MainPage tab={tab} movies={contentState.movies} channels={contentState.channels} favorites={persistent.favorites} history={persistent.history} progress={persistent.progress} settings={persistent.settings} sources={persistent.sources} searches={persistent.searches} onTab={nav} onMovie={openMovie} onLive={playLive} onLiveChannel={openLiveChannel} onSearchHistory={openSearchHistory} toggleFavorite={persistent.toggleFavorite} onClearData={persistent.clearUserData} onClearHistory={persistent.clearHistory} onClearSearches={persistent.clearSearches} onRemoveSearch={persistent.removeSearch} onClearCache={persistent.clearCache} onSourceEnabled={setSourceEnabled} onSourceActive={setSourceActive} onUpdateSettings={persistent.updateSettings} onTestSource={testSource} onSaveSources={saveSources} onRemoveSource={removeSource}/>;
        }

        // 2. Handle sync states for content tabs (only when active in movie tab)
        const selectedMovieSourceId = persistent.selectedSources?.movie ?? persistent.settings?.defaultMovieSource ?? null;
        if (movieActive && (contentState.status === 'idle' || contentState.status === 'loading') && selectedMovieSourceId && !contentState.sourceLoading) {
          return <main className="page"><LoadingState text="正在加载当前影视源…"/></main>;
        }

        if (contentState.status === 'error') {
          return (
            <>
              {movieActive
                ? <MovieFeature route={route} tab={tab} selected={selected} movies={contentState.movies} channels={contentState.channels} history={persistent.history} progress={persistent.progress} selectedSources={persistent.selectedSources} sources={persistent.sources} movieCategories={contentState.movieCategories} movieActiveCategory={contentState.movieActiveCategory} movieCategoryLoading={contentState.movieCategoryLoading} onLoadMovieCategory={(category)=>{setContentState(state=>({...state,movieActiveCategory:category??state.movieActiveCategory,movieCategoryLoading:true}));void reloadSources(undefined,{background:true,includeMovie:true,includeLive:false,movieCategoryId:category?.id??null,movieCategoryName:category?.name??''})}} onSelectMovieSource={setSourceActive} favorites={persistent.favorites} onMovie={openMovie} onPlay={playMovie} onTab={nav} onBack={()=>sessionStateStore.patch({route:route==='movie-play'?(selected?.metadata?.returnRoute||'detail'):null,selected:route==='movie-play'&&selected?.metadata?.returnRoute==='detail'?selected:null})} onLive={playLive} recordSearch={persistent.recordSearch} toggleFavorite={persistent.toggleFavorite}/>
                : route === 'live-channel'
                  ? <LiveChannelPanel channel={selected} channels={contentState.channels} sources={persistent.sources} favorites={persistent.favorites} onBack={()=>sessionStateStore.patch({route:null,selected:null,tab:'live'})} onPlay={playLive} onChannel={openLiveChannel} toggleFavorite={persistent.toggleFavorite}/>
                  : route === 'live-play'
                    ? <PlaybackPage request={selected} kind="live" channels={contentState.channels} favorites={persistent.favorites} onChannel={openLiveChannel} onPlay={playLive} toggleFavorite={persistent.toggleFavorite} onTab={nav} onBack={handleLiveBack}/>
                    : <MainPage tab={tab} movies={contentState.movies} channels={contentState.channels} favorites={persistent.favorites} history={persistent.history} progress={persistent.progress} settings={persistent.settings} sources={persistent.sources} searches={persistent.searches} onTab={nav} onMovie={openMovie} onLive={playLive} onLiveChannel={openLiveChannel} onSearchHistory={openSearchHistory} toggleFavorite={persistent.toggleFavorite} onClearData={persistent.clearUserData} onClearHistory={persistent.clearHistory} onClearSearches={persistent.clearSearches} onRemoveSearch={persistent.removeSearch} onClearCache={persistent.clearCache} onSourceEnabled={setSourceEnabled} onSourceActive={setSourceActive} onUpdateSettings={persistent.updateSettings} onTestSource={testSource} onSaveSources={saveSources} onRemoveSource={removeSource}/>}
              {!sourceErrorDismissed && <ErrorState text="无法加载源" onClose={()=>setSourceErrorDismissed(true)}/>}
            </>
          );
        }

        // 3. Show normal content features
        return movieActive 
          ? <MovieFeature route={route} tab={tab} selected={selected} movies={contentState.movies} channels={contentState.channels} history={persistent.history} progress={persistent.progress} selectedSources={persistent.selectedSources} sources={persistent.sources} movieCategories={contentState.movieCategories} movieActiveCategory={contentState.movieActiveCategory} movieCategoryLoading={contentState.movieCategoryLoading} onLoadMovieCategory={(category)=>{setContentState(state=>({...state,movieActiveCategory:category??state.movieActiveCategory,movieCategoryLoading:true}));void reloadSources(undefined,{background:true,includeMovie:true,includeLive:false,movieCategoryId:category?.id??null,movieCategoryName:category?.name??''})}} onSelectMovieSource={setSourceActive} favorites={persistent.favorites} onMovie={openMovie} onPlay={playMovie} onTab={nav} onBack={()=>sessionStateStore.patch({route:route==='movie-play'?(selected?.metadata?.returnRoute||'detail'):null,selected:route==='movie-play'&&selected?.metadata?.returnRoute==='detail'?selected:null})} onLive={playLive} recordSearch={persistent.recordSearch} toggleFavorite={persistent.toggleFavorite}/>
          : route === 'live-channel' ? <LiveChannelPanel channel={selected} channels={contentState.channels} sources={persistent.sources} favorites={persistent.favorites} onBack={()=>sessionStateStore.patch({route:null,selected:null,tab:'live'})} onPlay={playLive} onChannel={openLiveChannel} toggleFavorite={persistent.toggleFavorite}/>
          : route === 'live-play' ? <PlaybackPage request={selected} kind="live" channels={contentState.channels} favorites={persistent.favorites} onChannel={openLiveChannel} onPlay={playLive} toggleFavorite={persistent.toggleFavorite} onTab={nav} onBack={handleLiveBack}/>
          : <MainPage tab={tab} movies={contentState.movies} channels={contentState.channels} favorites={persistent.favorites} history={persistent.history} progress={persistent.progress} settings={persistent.settings} sources={persistent.sources} searches={persistent.searches} onTab={nav} onMovie={openMovie} onLive={playLive} onLiveChannel={openLiveChannel} onSearchHistory={openSearchHistory} toggleFavorite={persistent.toggleFavorite} onClearData={persistent.clearUserData} onClearHistory={persistent.clearHistory} onClearSearches={persistent.clearSearches} onRemoveSearch={persistent.removeSearch} onClearCache={persistent.clearCache} onSourceEnabled={setSourceEnabled} onSourceActive={setSourceActive} onUpdateSettings={persistent.updateSettings} onTestSource={testSource} onSaveSources={saveSources} onRemoveSource={removeSource}/>;
      })()}
      
      {!route && <BottomNav tab={tab} onTab={nav}/>}
    </div>
  </div>
 );
}

function AppFrame({children}){return <div className="app-shell"><div className="screen">{children}</div></div>}
function BottomNav({tab,onTab}){return <nav>{[['home',Home,'首页'],['movies',Film,'影视'],['live',Radio,'直播'],['favorites',Heart,'收藏'],['me',User,'我的']].map(([key,Icon,label])=><button className={tab===key?'active':''} onClick={()=>onTab(key)} key={key}><Icon size={21} fill={tab===key?'currentColor':'none'}/><span>{label}</span></button>)}</nav>}
export function AppRoot(){
 const {tab,route,selected}=useSessionState();
 const recoverFromPageError=()=>{
   if(route==='movie-play'){
     const returnRoute=selected?.metadata?.returnRoute||'detail';
     sessionStateStore.patch({tab:'movies',route:returnRoute,selected:returnRoute==='detail'?selected:null});
   }else if(route==='detail'||route==='search'){
     sessionStateStore.patch({tab:'movies',route:null,selected:null});
   }else if(route==='live-play'){
     sessionStateStore.patch({tab:'live',route:null,selected:null});
   }else if(route==='live-channel'){
     sessionStateStore.patch({tab:'live',route:null,selected:null});
   }else if(route==='appearance'){
     sessionStateStore.patch({tab:'settings',route:null,selected:null});
   }else if(route==='settings'||route==='sources'||route==='data-management'||route==='history'||route==='search-history'){
     sessionStateStore.patch({tab:'me',route:null,selected:null});
   }
 };
 return <ErrorBoundary route={route} onReset={recoverFromPageError}><App/></ErrorBoundary>;
}

function FirstLaunch({onLater,onSources}){return <div className="app-shell"><div className="screen"><main className="page first-launch"><div className="profile"><div className="avatar">T</div><div><span className="eyebrow">TVBOX REACT</span><h1>欢迎使用</h1><span>当前还没有配置内容源</span></div></div><div className="actions"><button className="primary" onClick={onSources}>去添加源</button><button className="secondary" onClick={onLater}>稍后设置</button></div></main></div></div>}
