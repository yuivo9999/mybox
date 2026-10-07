import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const args = new Set(process.argv.slice(2));

function sourceFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(relative));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) result.push(relative);
  }
  return result;
}
const allSourceFiles = sourceFiles('src');

function expectNo(file, patterns, label = file) {
  const source = read(file);
  for (const pattern of patterns) assert.doesNotMatch(source, pattern, label + ' contains forbidden dependency');
}
function expect(file, patterns, label = file) {
  const source = read(file);
  for (const pattern of patterns) assert.match(source, pattern, label + ' missing required contract');
}

expectNo('src/app/App.jsx', [/createPlaybackCore/, /sourceRuntimeService/, /persistent\.saveSources/, /persistent\.setSourceEnabled/, /persistent\.setSourceActive/, /persistent\.removeSource/]);
expectNo('src/pages/PlaybackPage.jsx', [/createPlaybackCore/]);
expectNo('src/features/movie/MovieFeature.jsx', [/createPlaybackCore/, /playbackService/, /usePersistentState/]);
expectNo('src/pages/MainPage.jsx', [/new Blob\(/, /FileReader/, /URL\.createObjectURL/, /document\.createElement/]);
expect('src/pages/MainPage.jsx', [/sourceConfigService/]);
expect('src/app/App.jsx', [/sourceManagementService/]);
expect('src/features/movie/MovieFeature.jsx', [/MoviePlaybackPage/]);
expect('src/services/sourceConfigService.js', [/importFile/, /download/]);
expect('src/services/sourceManagementService.js', [/setEnabled/, /setActive/, /remove/, /updateStatus/, /touchUsage/]);
expectNo('src/services/userDataService.js', [/sourceRepository/, /getSourceConfig/, /saveSourceConfig/, /touchSource/]);
expectNo('src/repositories/userDataRepository.js', [/getSourceConfig/, /saveSourceConfig/]);
expectNo('src/state/persistentStateStore.js', [/sourceRepository/, /saveSources\(/, /setSourceEnabled/, /setSourceActive/, /removeSource/]);
expect('src/features/movie/MoviePlaybackPage.jsx', [/playbackService\.createController/, /recordProgress/]);
expect('src/runtime/nativeHttpBridge.js', [
  /CapacitorHttp\.request/,
  /isNativeHttpAvailable/,
  /ALLOWED_METHODS/,
  /ALLOWED_RESPONSE_TYPES/,
  /connectTimeout/,
  /readTimeout/,
  /signal/,
  /UNSUPPORTED_PROTOCOL/,
  /NETWORK_ERROR/,
  /TIMEOUT/,
  /headers/,
]);
expect('src/runtime/webViewRuntime.js', [/nativeHttp/, /nativeHttpRequest/, /ALLOWED_BRIDGE_METHODS/, /BRIDGE_METHOD_NOT_ALLOWED/]);
expect('android/app/src/main/java/com/yuivo9999/mybox123/NativePlaybackBridge.java', [
  /playbackGeneration/,
  /MimeTypes\.APPLICATION_M3U8/,
  /generation != playbackGeneration \|\| released/,
  /fallbackOrError\(.*generation/,
]);

expectNo('src/runtime/nativeHttpBridge.js', [/window\.Android/, /eval\(/, /Function\(/]);


// Settings completeness: every user-facing setting must be backed by persistent state and a real event path.
// Stage 3 request-layer contract: environment selection stays in one adapter; source adapters never inspect Android or call the native bridge directly.
expect('src/services/requestAdapter.js', [/browserRequest/, /nativeRequest/, /requestAdapter/, /webViewRuntime\.capabilities\.nativeHttp/, /resilientFetch/, /errorService\.classifyNetwork/]);
expect('src/services/requestManager.js', [/concurrency/, /AbortController/, /const cancel/, /cancelAll/]);
expect('src/adapters/movie/movieAdapter.js', [/requestAdapter\.request/, /transport = null/]);
expect('src/adapters/live/liveAdapter.js', [/requestAdapter\.request/, /transport = null/]);
expectNo('src/adapters/movie/movieAdapter.js', [/resilientFetch/, /nativeHttpRequest/, /webViewRuntime/]);
expectNo('src/adapters/live/liveAdapter.js', [/resilientFetch/, /nativeHttpRequest/, /webViewRuntime/]);
expect('src/services/movieSourceService.js', [/createMovieAdapter\(\{/, /options\.transport\)/]);
expect('src/services/sourceRegistryService.js', [/registerLiveSource\(source, transport = null\)/, /options\.transport\)/]);
expect('src/parsers/hlsParser.js', [/context\.fetchManifest/, /context\.fetch \?\? fetch/]);

expect('src/models/userData.js', [/defaultSettings/, /normalizeSettings/, /autoplayResume/, /defaultMovieSource/, /defaultLiveSource/, /theme/, /fontSize/, /cardStyle/, /density/]);
expect('src/services/userDataService.js', [/normalizeSettings/, /updateSettings/]);
expect('src/state/persistentStateStore.js', [/updateSettings/]);
expect('src/pages/MainPage.jsx', [/自动继续播放/, /默认影视线路/, /默认直播线路/, /主题/, /字体/, /卡片显示/, /显示密度/, /SettingMenu/, /onUpdateSettings/]);
expect('src/app/App.jsx', [/persistent\.settings/, /defaultMovieSource/, /defaultLiveSource/, /autoplayResume/, /onUpdateSettings/]);
expect('src/services/playbackService.js', [/preferredSource/, /getVODCandidates/, /createVODRequest/, /createLiveRequest/]);
expect('src/playback/playbackCore.js', [
  /operationEpoch/,
  /isOperationCurrent/,
  /recoverCandidateId/,
  /task\.currentCandidateId!==recoverCandidateId/,
  /operationEpoch\+=1/,
]);
expect('src/player/html5PlayerAdapter.js', [
  /hlsGeneration/,
  /isCurrentHls/,
  /liveSyncMode: 'buffered'/,
  /startOnSegmentBoundary: true/,
  /initialLiveManifestSize: 6/,
  /prepare\(\).*if\(hlsInstance\)return input/,
]);

expect('src/pages/PlaybackPage.jsx', [/重新播放/, /切换线路/]);
expectNo('src/pages/MainPage.jsx', [/title="自动继续播放"\/>/, /title="默认播放线路"\/>/, /title="主题"\/>/, /title="字体"\/>/, /title="卡片显示"\/>/, /title="显示密度"\/>/]);

const pageAndFeatureFiles = allSourceFiles.filter(file => file.startsWith('src/pages/') || file.startsWith('src/features/'));
for (const file of pageAndFeatureFiles) expectNo(file, [/\bcreatePlaybackCore\s*\(/, /\bFileReader\b/, /\bnew Blob\(/, /URL\.createObjectURL/], file);
for (const file of allSourceFiles) {
  const source = read(file);
  if (file !== 'src/playback/playbackCore.js' && file !== 'src/services/playbackService.js') assert.doesNotMatch(source, /from ['"][^'"]*playbackCore[^'"]*['"]/);
  if (file !== 'src/services/sourceManagementService.js' && file !== 'src/services/sourceRuntimeService.js') assert.doesNotMatch(source, /from ['"][^'"]*sourceRuntimeService[^'"]*['"]/);
}

const packageJson = JSON.parse(read('package.json'));
for (const script of ['test:live','test:playback','test:parser','test:player','test:state','test:movie','test:cache','test:errors','test:webview-runtime','test:performance','test:data-contract','test:acceptance','test:architecture','test:execution']) {
  assert.match(packageJson.scripts[script] ?? '', /tests\/architecture\/test-runner\.mjs/, 'missing test runner: ' + script);
}
assert.ok(packageJson.engines?.node, 'Node engine must be pinned');
assert.notEqual(packageJson.dependencies?.react, 'latest');
assert.notEqual(packageJson.dependencies?.vite, 'latest');
assert.notEqual(packageJson.dependencies?.['@vitejs/plugin-react'], 'latest');
assert.notEqual(packageJson.dependencies?.['lucide-react'], 'latest');

if (args.has('all') || args.size === 0) {
  console.log('Architecture/data-boundary static checks passed.');
}
