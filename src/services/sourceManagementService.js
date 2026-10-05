import { sourceRepository } from '../repositories/sourceRepository.js';
import { userDataService } from './userDataService.js';
import { syncAllSources, testSource } from './sourceRuntimeService.js';
import { tv1LiveService } from './tv1LiveService.js';

export const sourceManagementService = {
  async reload(options = {}) {
    const selected = userDataService.getSnapshot().selectedSources;
    return syncAllSources({ ...options, movieSourceId: options.movieSourceId ?? selected.movie ?? null });
  },
  async reloadMovieSource(sourceId = null) {
    const selected = sourceId ?? userDataService.getSnapshot().selectedSources.movie ?? null;
    return syncAllSources({ movieSourceId: selected, includeMovie: true, includeLive: false });
  },
  async save(sources) {
    sourceRepository.saveAll(sources);
    return this.reload();
  },
  async setEnabled(sourceId, enabled) {
    const sources = sourceRepository.getAll();
    const source = sources.find(item => item.sourceId === sourceId);
    if (!source) return this.reload();
    if (!enabled) {
      userDataService.clearSelectedSource(source.sourceType, sourceId);
      if (source.sourceType === 'live' && source.liveMode === 'tv1') tv1LiveService.clear(sourceId);
    }
    sourceRepository.saveAll(sources.map(item => item.sourceId === sourceId ? { ...item, enabled: Boolean(enabled), isActive: enabled ? item.isActive : false } : item));
    return this.reload();
  },
  async setActive(sourceId) {
    const sources = sourceRepository.getAll();
    const source = sources.find(item => item.sourceId === sourceId);
    if (!source) return this.reload();
    const sourceType = source.sourceType || 'movie';
    userDataService.setSelectedSource(sourceType, sourceId);
    const now = Date.now();
    sourceRepository.saveAll(sources.map(item => ({
      ...item,
      isActive: item.sourceType === sourceType ? item.sourceId === sourceId : item.isActive,
      enabled: item.sourceId === sourceId ? true : item.enabled,
      lastUsedAt: item.sourceId === sourceId ? now : item.lastUsedAt ?? null,
    })));
    return sources;
  },
  async remove(sourceId) {
    const sources = sourceRepository.getAll();
    const source = sources.find(item => item.sourceId === sourceId);
    if (source) {
      if (source.sourceType === 'live' && source.liveMode === 'tv1') tv1LiveService.clear(sourceId);
      const selected = userDataService.getSnapshot().selectedSources;
      if (selected[source.sourceType] === sourceId) userDataService.clearSelectedSource(source.sourceType, sourceId);
    }
    sourceRepository.saveAll(sources.filter(item => item.sourceId !== sourceId));
    return this.reload();
  },
  updateStatus(sourceId, status) {
    const sources = sourceRepository.getAll();
    sourceRepository.saveAll(sources.map(item => item.sourceId === sourceId ? { ...item, status } : item));
  },
  touchUsage(sourceId) {
    if (!sourceId) return;
    const sources = sourceRepository.getAll();
    const now = Date.now();
    sourceRepository.saveAll(sources.map(item => item.sourceId === sourceId ? { ...item, lastUsedAt: now } : item));
  },
  test: testSource,
};