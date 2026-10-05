import { createMovieRegistry } from '../adapters/movie/movieRegistry.js';
import { createMovieAdapter } from '../adapters/movie/movieAdapter.js';
import { createSourceAdapter } from '../adapters/sourceAdapterFactory.js';
import { contentService } from './contentService.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';
import { requestManager } from './requestManager.js';
import { errorService } from './errorService.js';

export const movieRegistry = createMovieRegistry();

/**
 * Movie adapter dispatch boundary.
 *
 * Only standard HTTP VOD sources are allowed into the generic HTTP adapter.
 * TVBox extension sources stay out of the generic HTTP adapter path.
 * Dedicated adapters are created through sourceAdapterFactory.
 *
 * Local/user-created movie sources do not carry sourceCapability, so they
 * continue to use the existing generic adapter path.
 */
export function canUseHttpMovieAdapter(source = {}) {
  const capability = String(source.sourceCapability || '').trim();
  const adapterType = String(source.adapterType || '').trim();

  if (capability.startsWith('tvbox-') || adapterType.startsWith('tvbox-')) return false;
  if (!capability && !adapterType) return true;

  return capability === 'direct-http-vod' && adapterType === 'http-vod';
}

function cacheKey(sourceId, params = {}) {
  return createCacheKey({
    namespace: CacheNamespace.SOURCE,
    sourceId,
    contentId: 'movies',
    params: {
      type: 'movies',
      categoryId: params.categoryId ?? '',
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 24,
      keyword: String(params.keyword ?? ''),
    },
  });
}

async function load(adapter, options = {}) {
  const key = cacheKey(adapter.sourceId, options);
  const cached = cacheStorage.get(CacheNamespace.SOURCE, key, { allowStale: true });
  if (cached.hit && !cached.stale) return { value: cached.value, stale: false, fromCache: true };

  try {
    const value = await requestManager.run(
      `movie:source:${adapter.sourceId}`,
      signal => adapter.getMovies({ ...options, signal, page: options.page ?? 1, limit: options.pageSize ?? options.limit ?? 24 }),
    );

    if (Array.isArray(value) && value.length) {
      cacheStorage.set(CacheNamespace.SOURCE, key, value);
      return { value, stale: false };
    }

    if (cached.hit) return { value: cached.value, stale: true };
    return { value: [], stale: false };
  } catch (error) {
    if (cached.hit) {
      return {
        value: cached.value,
        stale: true,
        error: errorService.classifySource(error, {
          scope: 'movie-source-cache-fallback',
          sourceId: adapter.sourceId,
        }),
      };
    }
    throw error;
  }
}

export async function testMovieSource(source, options = {}) {
  const adapter = createMovieAdapter({
    ...source,
    sourceRef: source?.sourceRef || source?.url,
  }, options.transport);

  return adapter.healthCheck({ signal: options.signal });
}

export async function syncMovieSources(sourceConfigs = [], selectedSourceId = null, options = {}) {
  movieRegistry.clear();

  const enabledMovieSources = sourceConfigs.filter(source =>
    source.enabled !== false
    && source.sourceType === 'movie'
  );

  const targetSource = (selectedSourceId && enabledMovieSources.find(source => source.sourceId === selectedSourceId))
    || enabledMovieSources[0]
    || null;

  const selected = targetSource ? [targetSource] : [];

  const adapters = [];
  const unsupported = [];
  selected.forEach(source => {
    try {
      if (canUseHttpMovieAdapter(source)) {
        adapters.push(createMovieAdapter({
          ...source,
          sourceRef: source.sourceRef || source.url,
        }));
      } else {
        adapters.push(createSourceAdapter(source));
      }
    } catch (error) {
      unsupported.push({
        sourceId: source.sourceId,
        name: source.name || '',
        adapterType: source.adapterType || null,
        sourceCapability: source.sourceCapability || null,
        error,
      });
    }
  });

  adapters.forEach(adapter => movieRegistry.register(adapter));

  const settled = await Promise.all(movieRegistry.list().map(async adapter => {
    try {
      // 第一阶段只取得分类索引；第二阶段只请求当前分类第一页。
      const categoryKey = createCacheKey({
        namespace: CacheNamespace.SOURCE,
        sourceId: adapter.sourceId,
        contentId: 'categories',
        params: { type: 'movie-categories' },
      });
      const cachedCategories = cacheStorage.get(CacheNamespace.SOURCE, categoryKey, { allowStale: true });
      const categories = cachedCategories.hit
        ? cachedCategories.value
        : (typeof adapter.getCategories === 'function'
          ? await adapter.getCategories({ signal: options.signal, timeoutMs: options.timeoutMs ?? 5000 })
          : []);
      if (!cachedCategories.hit && Array.isArray(categories) && categories.length) {
        cacheStorage.set(CacheNamespace.SOURCE, categoryKey, categories);
      }
      const rawCategories = (Array.isArray(categories) ? categories : [])
        .map((item, index) => ({
          id: String(item?.id ?? item?.type_id ?? '').trim(),
          name: String(item?.name ?? item?.type_name ?? item?.label ?? item ?? '').trim(),
          sourceId: adapter.sourceId,
        }))
        .filter(item => item.name && item.name !== '全部');

      const allCategory = { id: 'all', name: '全部', sourceId: adapter.sourceId };
      const normalizedCategories = [allCategory, ...rawCategories];

      const requestedCategoryId = options.categoryId != null ? String(options.categoryId).trim() : '';
      const requestedCategoryName = String(options.categoryName ?? '').trim();

      const activeCategory = (requestedCategoryId || requestedCategoryName)
        ? (normalizedCategories.find(item =>
            (requestedCategoryId && item.id === requestedCategoryId)
            || (requestedCategoryName && item.name === requestedCategoryName)
          ) || allCategory)
        : allCategory;

      const isAll = !activeCategory || activeCategory.id === 'all' || activeCategory.name === '全部';

      const result = await load(adapter, {
        categoryId: isAll ? '' : activeCategory.id,
        categoryName: isAll ? '' : activeCategory.name,
        page: Number(options.page) || 1,
        pageSize: Number(options.pageSize) || 24,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
      });

      const taggedValue = (result.value ?? []).map(item => ({
        ...item,
        sourceCategoryId: item.sourceCategoryId || (isAll ? '' : activeCategory.id),
        sourceCategoryName: item.sourceCategoryName || (isAll ? (item.category || '') : activeCategory.name),
      }));

      return {
        status: 'fulfilled',
        sourceId: adapter.sourceId,
        value: taggedValue,
        categories: normalizedCategories,
        activeCategory,
        stale: result.stale,
        fromCache: result.fromCache,
        capabilities: adapter.getCapabilities(),
        definition: adapter.getDefinition(),
        adapterStatus: adapter.getStatus(),
      };
    } catch (reason) {
      return {
        status: 'rejected',
        sourceId: adapter.sourceId,
        reason: errorService.classifySource(reason, {
          scope: 'movie-source',
          sourceId: adapter.sourceId,
        }),
        categories: [],
        activeCategory: null,
        capabilities: adapter.getCapabilities(),
        definition: adapter.getDefinition(),
        adapterStatus: adapter.getStatus(),
      };
    }
  }));

  return {
    movies: contentService.getMovies(
      settled.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    ),
    categories: settled.flatMap(result => result.status === 'fulfilled' ? result.categories : []),
    activeCategory: settled.find(result => result.status === 'fulfilled' && result.activeCategory)?.activeCategory ?? null,
    results: [...settled, ...unsupported.map(item => ({
      status: 'rejected',
      ...item,
      categories: [],
      activeCategory: null,
    }))],
  };
}

export async function searchMovieSources(sourceConfigs = [], keyword = '', options = {}) {
  const query = String(keyword ?? '').trim();
  if (!query) return { query: '', results: [], failed: [], completed: 0 };

  const candidates = sourceConfigs.filter(source =>
    source?.sourceType === 'movie'
    && source?.enabled !== false
  );
  const pageSize = Math.max(1, Math.min(20, Number(options.pageSize) || 12));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 4500);
  const results = [];
  const failed = [];
  let completedCount = 0;
  const onSourceResult = typeof options.onSourceResult === 'function' ? options.onSourceResult : null;

  if (!candidates.length) {
    return { query, results: [], failed: [], completed: 0 };
  }

  // Concurrent execution across all enabled movie sources
  const searchTasks = candidates.map(async (source, index) => {
    if (options.signal?.aborted) {
      const error = new Error('Search aborted');
      error.name = 'AbortError';
      throw error;
    }

    let entry;
    try {
      const adapter = createSourceAdapter({
        ...source,
        sourceRef: source.sourceRef || source.url,
      }, options);
      if (typeof adapter.search !== 'function') throw new Error('MOVIE_SOURCE_SEARCH_UNSUPPORTED');
      const response = await adapter.search(
        { query, page: 1, pageSize },
        { signal: options.signal, timeoutMs },
      );
      entry = {
        sourceId: source.sourceId,
        sourceName: source.name || source.sourceId,
        status: 'fulfilled',
        items: Array.isArray(response?.items) ? response.items : [],
      };
      results.push(entry);
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
      entry = {
        sourceId: source.sourceId,
        sourceName: source.name || source.sourceId,
        status: 'rejected',
        reason: errorService.classifySource(error, {
          scope: 'movie-source-search',
          sourceId: source.sourceId,
        }),
      };
      failed.push(entry);
    }

    completedCount += 1;
    onSourceResult?.(entry, { index: index + 1, total: candidates.length, completed: completedCount });
    return entry;
  });

  await Promise.allSettled(searchTasks);

  return { query, results, failed, completed: candidates.length };
}
