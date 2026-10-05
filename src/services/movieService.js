import { contentService } from './contentService.js';
import { MEDIA_TYPE, MEDIA_TAXONOMY } from '../config/mediaTaxonomy.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';

function sourceIdentity(movies = []) {
  const sourceIds = new Set();
  movies.forEach((movie) => (movie.sourceRefs ?? []).forEach((ref) => ref?.sourceId && sourceIds.add(ref.sourceId)));
  return [...sourceIds].sort().join(',') || 'aggregate';
}
function cachedDetail(movies, contentId) {
  const movie = contentService.getById(movies, contentId);
  if (!movie) return null;
  const key = createCacheKey({ namespace: CacheNamespace.DETAIL, sourceId: sourceIdentity([movie]), contentId: movie.contentId, params: { kind: 'detail' } });
  const cached = cacheStorage.get(CacheNamespace.DETAIL, key, { allowStale: true });
  if (cached.hit && !cached.stale) return cached.value;
  cacheStorage.set(CacheNamespace.DETAIL, key, movie); return movie;
}
function normalizeText(value) { return String(value ?? '').trim().toLowerCase(); }
function applyFilters(items, filters = {}) {
  return items.filter((movie) => {
    if (filters.year && String(movie.year) !== String(filters.year)) return false;
    if (filters.type && filters.type !== '全部' && movie.type !== filters.type) return false;
    if (filters.region && filters.region !== '全部' && movie.region !== filters.region) return false;
    if (filters.status && filters.status !== '全部' && movie.status !== filters.status) return false;
    if (filters.mediaType && filters.mediaType !== 'all' && movie.mediaType !== filters.mediaType) return false;
    if (filters.categoryId && filters.categoryId !== 'all' && !(movie.categoryIds ?? []).includes(filters.categoryId)) return false;
    return true;
  });
}
function sortItems(items, sort = 'default') {
  return [...items].sort((a, b) => {
    if (sort === 'latest') return Number(b.year || 0) - Number(a.year || 0) || String(b.title).localeCompare(String(a.title));
    if (sort === 'title') return String(a.title).localeCompare(String(b.title), 'zh-Hans');
    if (sort === 'popular') return Number(b.popularity ?? b.rating ?? 0) - Number(a.popularity ?? a.rating ?? 0);
    if (sort === 'time') return Number(b.updatedAt ?? b.year ?? 0) - Number(a.updatedAt ?? a.year ?? 0);
    return 0;
  });
}
function getContinueWatching({ movies = [], history = [], progress = [], limit = 4 } = {}) {
  const progressById = new Map(progress.map(item => [item.progressId, item]));
  return [...history]
    .filter(item => item.targetType === 'content')
    .sort((a, b) => Number(b.lastPlayedAt ?? 0) - Number(a.lastPlayedAt ?? 0))
    .map(item => {
      const movie = cachedDetail(movies, item.targetId);
      if (!movie) return null;
      const progressId = `progress:${item.targetId}:${item.episodeId || 'content'}`;
      const currentProgress = progressById.get(progressId);
      const merged = { ...item, ...(currentProgress ?? {}) };
      if (merged.completed) return null;
      const episodeIndex = Math.max(0, movie.episodes?.findIndex(episode => episode.episodeId === item.episodeId) ?? 0);
      return { movie, episodeIndex, history: merged, progress: currentProgress ?? null };
    })
    .filter(Boolean)
    .slice(0, limit);
}
export const movieService = {
  list({ movies = [], category = '全部', page = 1, pageSize = 50, filters = {}, sort = 'default' } = {}) {
    const safePage = Math.max(1, Number(page) || 1), safePageSize = Math.max(1, Number(pageSize) || 50);
    const key = createCacheKey({ namespace: CacheNamespace.MOVIE, sourceId: sourceIdentity(movies), contentId: 'list', params: { category, page: safePage, pageSize: safePageSize, filters, sort } });
    const cached = cacheStorage.get(CacheNamespace.MOVIE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    let filtered = movies.filter((movie) => {
      if (category === '全部') return true;
      if (category === '电影') return movie.mediaType === MEDIA_TYPE.MOVIE;
      if (category === '电视剧') return movie.mediaType === MEDIA_TYPE.TV;
      if (category === '综艺') return movie.mediaType === MEDIA_TYPE.VARIETY;
      return (movie.categoryIds ?? []).includes(category) || (movie.categoryLabels ?? []).includes(category) || movie.category === category;
    });
    filtered = sortItems(applyFilters(filtered, filters), sort);
    const start = (safePage - 1) * safePageSize;
    const value = { items: filtered.slice(start, start + safePageSize), page: safePage, pageSize: safePageSize, total: filtered.length, hasMore: start + safePageSize < filtered.length };
    cacheStorage.set(CacheNamespace.MOVIE, key, value); return value;
  },
  search({ movies = [], keyword = '' } = {}) {
    const clean = normalizeText(keyword); if (!clean) return [];
    const key = createCacheKey({ namespace: CacheNamespace.MOVIE, sourceId: sourceIdentity(movies), contentId: 'search', params: { keyword: clean } });
    const cached = cacheStorage.get(CacheNamespace.MOVIE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    const value = movies.filter((movie) => normalizeText(movie.title).includes(clean) || normalizeText(movie.titleEn).includes(clean) || normalizeText(movie.description).includes(clean) || normalizeText(movie.category).includes(clean) || (movie.categoryLabels ?? []).some(label => normalizeText(label).includes(clean)));
    cacheStorage.set(CacheNamespace.MOVIE, key, value); return value;
  },
  getDetail({ movies = [], contentId } = {}) { return cachedDetail(movies, contentId); },
  getEpisode({ movies = [], contentId, episodeId } = {}) {
    const content = cachedDetail(movies, contentId); if (!content) return null;
    const key = createCacheKey({ namespace: CacheNamespace.EPISODE, sourceId: sourceIdentity([content]), contentId: content.contentId, params: { episodeId: episodeId ?? '' } });
    const cached = cacheStorage.get(CacheNamespace.EPISODE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    const value = content.episodes?.find((episode) => episode.episodeId === episodeId) ?? null;
    if (value) cacheStorage.set(CacheNamespace.EPISODE, key, value); return value;
  },
  getRelated({ movies = [], movie, limit = 6 } = {}) {
    if (!movie) return [];
    return movies.filter((item) => item.contentId !== movie.contentId && item.category === movie.category).slice(0, limit);
  },
  getHome({ movies = [], history = [], progress = [], limit = 4 } = {}) {
    const continueWatching = getContinueWatching({ movies, history, progress, limit });
    const categories = ['电影', '电视剧', '综艺'];
    const taxonomy = {
      movie: MEDIA_TAXONOMY.movie.map(item => item.label),
      tv: MEDIA_TAXONOMY.tv.map(item => item.label),
      variety: MEDIA_TAXONOMY.variety.map(item => item.label),
    };
    const regions = [...new Set(movies.map((movie) => movie.region).filter(Boolean))];
    const years = [...new Set(movies.map((movie) => movie.year).filter(Boolean))].sort((a,b) => Number(b)-Number(a));
    const statuses = [...new Set(movies.map((movie) => movie.status).filter(Boolean))];
    const types = [...new Set(movies.map((movie) => movie.type).filter(Boolean))];
    const byType = (mediaType) => movies.filter(movie => movie.mediaType === mediaType);
    const latest = [...movies].sort((a,b)=>Number(b.year||0)-Number(a.year||0));
    return {
      continueWatching,
      recommended: movies.slice(0, limit),
      popular: movies.slice(0, limit),
      latest: latest.slice(0, limit),
      popularMovies: byType(MEDIA_TYPE.MOVIE).slice(0, limit),
      popularSeries: byType(MEDIA_TYPE.TV).slice(0, limit),
      popularVariety: byType(MEDIA_TYPE.VARIETY).slice(0, limit),
      movieRanking: [...byType(MEDIA_TYPE.MOVIE)].sort((a,b)=>Number(b.popularity??b.rating??0)-Number(a.popularity??a.rating??0)).slice(0, limit),
      tvRanking: [...byType(MEDIA_TYPE.TV)].sort((a,b)=>Number(b.popularity??b.rating??0)-Number(a.popularity??a.rating??0)).slice(0, limit),
      varietyRanking: [...byType(MEDIA_TYPE.VARIETY)].sort((a,b)=>Number(b.popularity??b.rating??0)-Number(a.popularity??a.rating??0)).slice(0, limit),
      categories,
      taxonomy,
      filters: { types, regions, years, statuses },
    };
  },
  clearCache() { cacheStorage.clear(CacheNamespace.MOVIE); cacheStorage.clear(CacheNamespace.DETAIL); cacheStorage.clear(CacheNamespace.EPISODE); },
};
