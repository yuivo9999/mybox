import { DEFAULT_FONT_ID } from '../config/fontCatalog.js';

export function createFavoriteId(targetType, targetId) {
  return `favorite:${targetType}:${targetId}`;
}

export function createHistoryId(targetType, targetId, episodeId = '') {
  return `history:${targetType}:${targetId}:${episodeId || 'live'}`;
}

export function createProgressId(contentId, episodeId = '') {
  return `progress:${contentId}:${episodeId || 'content'}`;
}

export function createSearchId(keyword) {
  return `search:${encodeURIComponent(keyword.trim().toLowerCase())}`;
}

export const defaultPlaybackSettings = () => ({
  moviePlayer: 'ijk',
  livePlayer: 'ijk',
  fallbackEnabled: true,
  fallbackOrder: ['ijk', 'exo', 'native'],
  decoder: { exo: 'auto', ijk: 'hardware', native: 'system' },
});

export const defaultSettings = () => ({
  initialized: false,
  autoplayResume: true,
  defaultMovieSource: null,
  defaultLiveSource: null,
  theme: 'sangtian',
  fontSize: 'medium',
  fontFamily: DEFAULT_FONT_ID,
  cardStyle: 'poster',
  density: 'comfortable',
  playback: defaultPlaybackSettings(),
});

export const normalizePlaybackSettings = (value = {}) => {
  const input = value && typeof value === 'object' ? value : {};
  const decoder = input.decoder && typeof input.decoder === 'object' ? input.decoder : {};
  const order = Array.isArray(input.fallbackOrder) ? input.fallbackOrder.filter(item => ['exo', 'ijk', 'native'].includes(item)) : [];
  const fallbackOrder = [...new Set([...order, 'exo', 'ijk', 'native'])].slice(0, 3);
  return {
    ...defaultPlaybackSettings(),
    ...input,
    moviePlayer: ['exo', 'ijk', 'native'].includes(input.moviePlayer) ? input.moviePlayer : 'ijk',
    livePlayer: ['exo', 'ijk', 'native'].includes(input.livePlayer) ? input.livePlayer : 'ijk',
    fallbackEnabled: input.fallbackEnabled !== false,
    fallbackOrder,
    decoder: {
      exo: ['auto', 'hardware', 'software'].includes(decoder.exo) ? decoder.exo : 'auto',
      ijk: ['auto', 'hardware', 'software'].includes(decoder.ijk) ? decoder.ijk : 'hardware',
      native: 'system',
    },
  };
};

export const normalizeSettings = (value = {}) => {
  const input = value && typeof value === 'object' ? value : {};
  return { ...defaultSettings(), ...input, fontFamily: typeof input.fontFamily === 'string' && input.fontFamily ? input.fontFamily : DEFAULT_FONT_ID, playback: normalizePlaybackSettings(input.playback) };
};

export const emptyUserData = () => ({
  favorites: [],
  history: [],
  progress: [],
  searches: [],
  settings: defaultSettings(),
  selectedSources: { movie: null, live: null },
});
