export function normalizeMovieSourceDefinition(source = {}) {
  const sourceId = String(source.sourceId ?? '').trim();
  if (!sourceId) throw new Error('MOVIE_SOURCE_ID_REQUIRED');

  return {
    sourceId,
    name: String(source.name ?? sourceId).trim() || sourceId,
    type: 'movie',
    endpoint: String(source.sourceRef || source.url || source.endpoint || '').trim(),
    enabled: source.enabled !== false,
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    capabilities: Array.isArray(source.capabilities) ? [...new Set(source.capabilities.filter(Boolean))] : [],
    status: String(source.status ?? 'unknown'),
    lastCheckedAt: source.lastCheckedAt ?? null,
  };
}

export function createMovieRegistry() {
  const adapters = new Map();

  return {
    register(adapter) {
      if (!adapter?.sourceId) throw new Error('MOVIE_ADAPTER_SOURCE_ID_REQUIRED');
      adapters.set(adapter.sourceId, adapter);
      return adapter;
    },
    unregister(sourceId) {
      adapters.delete(sourceId);
    },
    get(sourceId) {
      return adapters.get(sourceId) ?? null;
    },
    getDefinition(sourceId) {
      const adapter = adapters.get(sourceId);
      return adapter ? normalizeMovieSourceDefinition(adapter.getDefinition?.() ?? adapter.definition) : null;
    },
    getCapabilities(sourceId) {
      return [...(adapters.get(sourceId)?.getCapabilities?.() ?? [])];
    },
    list() {
      return [...adapters.values()].sort((a, b) =>
        (a.getDefinition?.().priority ?? 0) - (b.getDefinition?.().priority ?? 0)
      );
    },
    listDefinitions() {
      return [...adapters.values()].map(adapter =>
        normalizeMovieSourceDefinition(adapter.getDefinition?.() ?? adapter.definition)
      );
    },
    clear() {
      adapters.clear();
    },
  };
}
