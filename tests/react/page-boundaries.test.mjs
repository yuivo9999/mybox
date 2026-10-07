import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('src/app/App.jsx');
assert.doesNotMatch(app, /createPlaybackCore/);
assert.doesNotMatch(app, /sourceRuntimeService/);
assert.doesNotMatch(app, /persistent\.(saveSources|setSourceEnabled|setSourceActive|removeSource)/);

const playbackPage = read('src/pages/PlaybackPage.jsx');
const movieFeature = read('src/features/movie/MovieFeature.jsx');
const moviePlaybackPage = read('src/features/movie/MoviePlaybackPage.jsx');
assert.doesNotMatch(playbackPage, /createPlaybackCore/);
assert.doesNotMatch(movieFeature, /createPlaybackCore|playbackService|usePersistentState/);
assert.match(movieFeature, /MoviePlaybackPage/);
assert.match(moviePlaybackPage, /playbackService\.createController/);
assert.doesNotMatch(moviePlaybackPage, /\bpersistent\./);

const mainPage = read('src/pages/MainPage.jsx');
assert.doesNotMatch(mainPage, /FileReader|new Blob\(|URL\.createObjectURL|document\.createElement/);
assert.match(mainPage, /sourceConfigService/);

const userData = read('src/services/userDataService.js');
const userRepository = read('src/repositories/userDataRepository.js');
const persistentStore = read('src/state/persistentStateStore.js');
assert.doesNotMatch(userData, /sourceRepository|getSourceConfig|saveSourceConfig|touchSource/);
assert.doesNotMatch(userRepository, /getSourceConfig|saveSourceConfig/);
assert.doesNotMatch(persistentStore, /sourceRepository|saveSources\(|setSourceEnabled|setSourceActive|removeSource/);

console.log('React/data/source boundary checks passed.');
