import { parseJSONMovies } from './jsonParser.js';
import { normalizeMovie } from './normalizeMovie.js';
import { ErrorCode, toAppError } from '../../models/errors.js';
import { requestAdapter } from '../../services/requestAdapter.js';

const DEFAULT_CAPABILITIES = Object.freeze([
  'search',
  'categories',
  'list',
  'filter',
  'sort',
  'detail',
  'episodes',
  'playUrl',
  'recommendations',
]);

export function createMovieAdapter(config, transport = null) {
  const sourceId = String(config.sourceId ?? '').trim();
  if (!sourceId) throw new Error('MOVIE_SOURCE_ID_REQUIRED');

  const sourceDefinition = Object.freeze({
    sourceId,
    name: String(config.name ?? sourceId),
    type: 'movie',
    endpoint: String(config.sourceRef || config.url || '').trim(),
    enabled: config.enabled !== false,
    priority: Number.isFinite(Number(config.priority)) ? Number(config.priority) : 0,
    capabilities: [...new Set(Array.isArray(config.capabilities) && config.capabilities.length ? config.capabilities : DEFAULT_CAPABILITIES)],
    sourceCapability: String(config.sourceCapability || '').trim() || undefined,
    adapterType: String(config.adapterType || '').trim() || undefined,
    tvboxAdapterKind: config.tvboxAdapterKind ?? undefined,
    tvboxRequiresJar: config.tvboxRequiresJar === true,
    tvboxJar: config.tvboxJar ?? undefined,
    tvboxType: config.tvboxType ?? undefined,
    timeoutMs: Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : undefined,
    categories: Array.isArray(config.categories) ? config.categories : [],
  });

  let lastError = null;
  let lastCheckedAt = null;
  let status = config.enabled === false ? 'disabled' : String(config.status ?? 'unknown');

  const request = async (options = {}) => {
    if (sourceDefinition.adapterType === 'tvbox-extension') {
      throw toAppError(new Error('TVBOX_EXTENSION_UNSUPPORTED'), {
        code: ErrorCode.SOURCE,
        scope: 'movie-source-adapter',
        context: {
          sourceId,
          sourceCapability: sourceDefinition.sourceCapability,
          tvboxAdapterKind: sourceDefinition.tvboxAdapterKind,
        },
      });
    }
    if (!sourceDefinition.endpoint) {
      throw toAppError(new Error('MOVIE_SOURCE_ENDPOINT_REQUIRED'), {
        code: ErrorCode.SOURCE,
        scope: 'movie-source-request',
        context: { sourceId },
      });
    }
    let finalUrl = sourceDefinition.endpoint;
    if (finalUrl.includes('api.php') || finalUrl.includes('provide/vod') || finalUrl.includes('/vod/')) {
      const query = new URLSearchParams();
      const categoryOnly = options.categoryOnly === true;
      if (categoryOnly) {
        if (!/[?&]ac=/.test(finalUrl)) query.set('ac', 'list');
        else finalUrl = finalUrl.replace(/([?&])ac=[^&]*/i, '$1ac=list');
      } else {
        // 请求具体内容列表时，必须采用 ac=detail 才能准确抓取到海报图 vod_pic、角标 vod_remarks 和播放线路集数，绝不遗漏内容
        if (!/[?&]ac=/.test(finalUrl)) query.set('ac', 'detail');
        else finalUrl = finalUrl.replace(/([?&])ac=[^&]*/i, '$1ac=detail');
      }
      if (options.categoryId != null && String(options.categoryId).trim() && !/[?&]t=/.test(finalUrl)) query.set('t', String(options.categoryId).trim());
      if (options.page != null && Number(options.page) > 0 && !/[?&]pg=/.test(finalUrl)) query.set('pg', String(Math.max(1, Number(options.page))));
      if (options.keyword != null && String(options.keyword).trim() && !/[?&]wd=/.test(finalUrl)) query.set('wd', String(options.keyword).trim());
      if (options.limit != null && Number(options.limit) > 0 && !/[?&]limit=/.test(finalUrl)) query.set('limit', String(Math.min(100, Number(options.limit))));
      const suffix = query.toString();
      if (suffix) finalUrl += (finalUrl.includes('?') ? '&' : '?') + suffix;
    }

    const requestHeaders = { ...(config.headers ?? {}) };
    if (config.userAgent && !requestHeaders['User-Agent'] && !requestHeaders['user-agent']) requestHeaders['User-Agent'] = config.userAgent;
    if (config.referer && !requestHeaders.Referer && !requestHeaders.referer) requestHeaders.Referer = config.referer;
    if (config.cookies && !requestHeaders.Cookie && !requestHeaders.cookie) requestHeaders.Cookie = config.cookies;

    let response;
    try {
      response = config.localContent != null
        ? { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: async () => String(config.localContent) }
        : await requestAdapter.request(finalUrl, {
        headers: requestHeaders,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? config.timeoutMs,
        transport,
      });
    } catch (error) {
      throw toAppError(error, {
        code: ErrorCode.NETWORK,
        retryable: true,
        scope: 'movie-source-request',
        context: { sourceId, endpoint: finalUrl },
      });
    }

    if (!response?.ok) {
      throw toAppError(new Error(`HTTP_${response?.status ?? 0}`), {
        code: ErrorCode.SOURCE_RESPONSE,
        scope: 'movie-source-response',
        context: { sourceId, status: response?.status ?? 0 },
      });
    }

    return response;
  };

  const load = async (options = {}) => {
    try {
      const response = await request(options);
      const body = await response.text();
      const normalizedBody = String(body ?? '').replace(/^\uFEFF/, '').trim();
      if (!normalizedBody) {
        throw toAppError(new Error('MOVIE_SOURCE_EMPTY_RESPONSE'), {
          code: ErrorCode.SOURCE_EMPTY,
          scope: 'movie-source-empty',
          context: { sourceId },
        });
      }
      const contentType = String(response?.headers?.get?.('content-type') ?? '').toLowerCase();
      if (contentType.includes('text/html') && !/^\s*(?:\{|\[)/.test(normalizedBody)) {
        throw toAppError(new Error('MOVIE_SOURCE_HTML_RESPONSE'), {
          code: ErrorCode.SOURCE_RESPONSE,
          scope: 'movie-source-response',
          context: { sourceId, contentType },
        });
      }

      let raw;
      try {
        raw = parseJSONMovies(normalizedBody);
      if (!raw || (Array.isArray(raw) && raw.length === 0) || (raw?.list && Array.isArray(raw.list) && raw.list.length === 0 && Number(raw.total ?? 0) === 0)) {
        return [];
      }
      } catch (error) {
        throw toAppError(error, {
          code: ErrorCode.PARSE,
          scope: 'movie-source-parse',
          context: { sourceId },
        });
      }

      if (!Array.isArray(raw)) {
        throw toAppError(new Error('MOVIE_SOURCE_INVALID_RESULT'), {
          code: ErrorCode.PARSE,
          scope: 'movie-source-parse',
          context: { sourceId },
        });
      }

      if (!raw.length) {
        throw toAppError(new Error('MOVIE_SOURCE_EMPTY_RESULT'), {
          code: ErrorCode.SOURCE_EMPTY,
          scope: 'movie-source-empty',
          context: { sourceId },
        });
      }

      const normalized = raw.map((item, index) => {
        try {
          if (!item || typeof item !== 'object') throw new Error('MOVIE_SOURCE_FIELD_MISSING');
          if (!(item.sourceItemId ?? item.id) || !(item.title ?? item.name)) throw new Error('MOVIE_SOURCE_FIELD_MISSING');
          return normalizeMovie({
            sourceId,
            item,
            index,
            sourceMetadata: {
              sourceCapability: config.sourceCapability,
              adapterType: config.adapterType,
              tvboxAdapterKind: config.tvboxAdapterKind,
              tvboxRequiresJar: config.tvboxRequiresJar,
              tvboxJar: config.tvboxJar,
              tvboxType: config.tvboxType,
              playerType: config.playerType,
              headers: config.headers,
              userAgent: config.userAgent,
              referer: config.referer,
              cookies: config.cookies,
              tvboxParseConfig: config.tvboxParseConfig,
            },
          });
        } catch (error) {
          throw toAppError(error, {
            code: ErrorCode.NORMALIZE,
            scope: 'movie-source-normalize',
            context: {
              sourceId,
              sourceItemId: item?.sourceItemId ?? item?.id ?? null,
              index,
            },
          });
        }
      });

      lastError = null;
      status = 'healthy';
      lastCheckedAt = Date.now();
      return normalized;
    } catch (error) {
      const normalized = toAppError(error, {
        context: { sourceId },
        scope: error?.scope ?? 'movie-source',
      });
      lastError = normalized;
      status = 'error';
      lastCheckedAt = Date.now();
      throw normalized;
    }
  };

  const ensureMovies = async (options = {}) => {
    if (Array.isArray(options.items)) return options.items;
    return load(options);
  };

  const requireCapability = (capability) => {
    if (!sourceDefinition.capabilities.includes(capability)) {
      throw toAppError(new Error(`MOVIE_CAPABILITY_UNSUPPORTED:${capability}`), {
        code: ErrorCode.SOURCE,
        scope: 'movie-source-capability',
        context: { sourceId, capability },
      });
    }
  };

  const getCategories = async (options = {}) => {
    requireCapability('categories');
    try {
      const response = await request({ ...options, categoryOnly: true, page: 1, limit: 1 });
      const body = String(await response.text()).replace(/^\uFEFF/, '').trim();
      const value = JSON.parse(body);
      const raw = value?.class ?? value?.classes ?? value?.categories ?? value?.type ?? value?.data?.class ?? [];
      const list = Array.isArray(raw) ? raw : [];
      if (list.length > 0) {
        return list.map((item, index) => ({
          id: String(item?.type_id ?? item?.typeId ?? item?.id ?? item?.value ?? index + 1),
          name: String(item?.type_name ?? item?.name ?? item?.label ?? item?.title ?? item ?? '').trim(),
        })).filter(item => item.name);
      }
    } catch {
      // Fallback to static category definition if offline or response lacks class list
    }
    if (Array.isArray(sourceDefinition.categories) && sourceDefinition.categories.length) {
      return sourceDefinition.categories.map((item, index) => {
        if (typeof item === 'string') {
          return { id: String(index + 1), name: item.trim() };
        }
        return {
          id: String(item?.type_id ?? item?.id ?? item?.typeId ?? item?.value ?? index + 1),
          name: String(item?.type_name ?? item?.name ?? item?.label ?? item?.title ?? '').trim(),
        };
      }).filter(item => item.name);
    }
    return [];
  };

  const filterItems = (movies, params = {}) => {
    requireCapability('filter');
    let result = movies;
    if (params.category) result = result.filter(item => item.category === params.category);
    if (params.year) result = result.filter(item => String(item.year) === String(params.year));
    if (params.type) result = result.filter(item => item.type === params.type || item.contentType === params.type);
    if (params.region) result = result.filter(item => item.region === params.region);
    return result;
  };

  const sortItems = (movies, params = {}) => {
    requireCapability('sort');
    const sortBy = params.sortBy ?? 'popularity';
    const direction = params.order === 'asc' ? 1 : -1;
    return [...movies].sort((a, b) => {
      const left = a?.[sortBy] ?? '';
      const right = b?.[sortBy] ?? '';
      if (left === right) return 0;
      return left > right ? direction : -direction;
    });
  };

  const getList = async (params = {}, options = {}) => {
    requireCapability('list');
    let movies = await ensureMovies(options);
    if (params.category || params.year || params.type || params.region) movies = filterItems(movies, params);
    if (params.sortBy) movies = sortItems(movies, params);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 20));
    return {
      items: movies.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: movies.length,
    };
  };

  const search = async (params = {}, options = {}) => {
    requireCapability('search');
    const query = String(params.query ?? params.keyword ?? '').trim().toLowerCase();
    if (!query) return getList(params, options);
    // Prefer source-side keyword search for HTTP VOD endpoints. This avoids
    // downloading an entire source catalogue just to find one title.
    const movies = await ensureMovies({
      ...options,
      keyword: query,
    });
    const filtered = movies.filter(item =>
      [item.title, item.subtitle, item.description, item.category, item.titleEn]
        .some(value => String(value ?? '').toLowerCase().includes(query))
    );
    return {
      ...await getList({ ...params, page: 1 }, { ...options, items: filtered }),
      items: filtered.slice(0, Math.max(1, Number(params.pageSize) || 20)),
      total: filtered.length,
    };
  };

  const getDetail = async (contentRef, options = {}) => {
    requireCapability('detail');
    const movies = await ensureMovies(options);
    const ref = typeof contentRef === 'string'
      ? contentRef
      : contentRef?.contentId ?? contentRef?.sourceItemId;
    return movies.find(item =>
      item.contentId === ref ||
      item.legacyContentId === ref ||
      item.sourceRefs?.some(source => source.sourceItemId === ref)
    ) ?? null;
  };

  const getEpisodes = async (contentRef, options = {}) => {
    requireCapability('episodes');
    const detail = await getDetail(contentRef, options);
    return detail?.episodes ?? [];
  };

  const getPlaybackCandidates = async (episodeRef, options = {}) => {
    requireCapability('playUrl');
    const episodeId = typeof episodeRef === 'string' ? episodeRef : episodeRef?.episodeId;
    const movies = await ensureMovies(options);
    return movies
      .flatMap(item => item.episodes ?? [])
      .find(episode => episode.episodeId === episodeId)
      ?.playbackCandidates ?? [];
  };

  const getRecommendations = async (contentRef, options = {}) => {
    requireCapability('recommendations');
    const movies = await ensureMovies(options);
    const current = await getDetail(contentRef, options);
    const category = current?.category;
    return movies
      .filter(item => item.contentId !== current?.contentId && (!category || item.category === category))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, Math.max(1, Math.min(50, Number(options.limit) || 12)));
  };

  const healthCheck = async (options = {}) => {
    if (sourceDefinition.adapterType === 'tvbox-extension') {
      return {
        ok: false,
        sourceId,
        status: 'unsupported',
        checkedAt: Date.now(),
        error: toAppError(new Error('TVBOX_EXTENSION_UNSUPPORTED'), {
          code: ErrorCode.SOURCE,
          scope: 'movie-source-adapter',
          context: {
            sourceId,
            sourceCapability: sourceDefinition.sourceCapability,
            tvboxAdapterKind: sourceDefinition.tvboxAdapterKind,
          },
        }),
      };
    }
    try {
      await load(options);
      return {
        ok: true,
        sourceId,
        status: 'healthy',
        checkedAt: lastCheckedAt,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        sourceId,
        status: 'error',
        checkedAt: lastCheckedAt,
        error: toAppError(error, { context: { sourceId } }),
      };
    }
  };

  const getDefinition = () => ({
    ...sourceDefinition,
    status,
    lastCheckedAt,
  });

  return {
    sourceId,
    definition: getDefinition(),
    getDefinition,
    getCapabilities: () => [...sourceDefinition.capabilities],
    getMovies: load,
    search,
    getCategories,
    getList,
    filter: filterItems,
    sort: sortItems,
    getDetail,
    getEpisodes,
    getPlaybackCandidates,
    getRecommendations,
    healthCheck,
    getStatus: () => ({ status, lastCheckedAt, error: lastError }),
  };
}
