export function createLiveRegistry() {
  const adapters = new Map();
  return {
    register(adapter) { adapters.set(adapter.sourceId, adapter); return adapter; },
    unregister(sourceId) { adapters.delete(sourceId); },
    get(sourceId) { return adapters.get(sourceId) ?? null; },
    list() { return [...adapters.values()]; },
    clear() { adapters.clear(); },
  };
}
