export function createLiveDataSource({ fetchChannels }) {
  if (typeof fetchChannels !== 'function') throw new TypeError('fetchChannels must be a function');
  return Object.freeze({ fetchChannels });
}
