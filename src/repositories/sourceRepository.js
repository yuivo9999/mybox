import { storage } from '../storage/storage.js';

function createSourceId(source) {
  if (source?.sourceId) return String(source.sourceId);
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `local-${crypto.randomUUID()}`;
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSource(source = {}) {
  const sourceId = createSourceId(source);
  return {
    ...source,
    sourceId,
    bundleId: String(source.bundleId || ('bundle_' + sourceId)).trim(),
    sourceKey: String(source.sourceKey || sourceId).trim(),
    name: String(source.name ?? sourceId).trim() || sourceId,
    sourceType: source.sourceType === 'live' ? 'live' : 'movie',
    sourceRef: String(source.sourceRef || source.url || '').trim(),
    url: String(source.url || source.sourceRef || '').trim(),
    enabled: source.enabled !== false,
    status: source.status ?? '未测试',
    capabilities: Array.isArray(source.capabilities) ? [...new Set(source.capabilities.filter(Boolean))] : [],
  };
}

export const sourceRepository = {
  getAll: (fallback = []) => storage.read('sources', fallback),
  saveAll: (sources) => storage.write('sources', (Array.isArray(sources) ? sources : []).map(normalizeSource)),
};
