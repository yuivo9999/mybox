import { sourceRepository } from '../repositories/sourceRepository.js';
import { userDataService } from './userDataService.js';
import { syncAllSources, testSource } from './sourceRuntimeService.js';
import { tv1LiveService } from './tv1LiveService.js';
import { sourceRegistryService } from './sourceRegistryService.js';
import { liveService } from './liveService.js';
import { cacheService } from './cacheService.js';

export const sourceManagementService = {
  async clearAll() {
    try { sourceRepository.saveAll([]); } catch (e) { console.error('Clear sources repository error:', e); }
    try { userDataService.saveSelectedSources({ movie: null, live: null }); } catch (e) {}
    try {
      const settings = userDataService.getSnapshot().settings || {};
      if (settings.defaultMovieSource || settings.defaultLiveSource) {
        userDataService.updateSettings({ defaultMovieSource: null, defaultLiveSource: null });
      }
    } catch (e) {}
    try { tv1LiveService.clear(); } catch (e) {}
    try { sourceRegistryService.clear(); } catch (e) {}
    try { liveService.clearRuntimeCache(); } catch (e) {}
    try { cacheService.clearAll(); } catch (e) {}
    return this.reload();
  },
  async reload(options = {}) {
    const snapshot = userDataService.getSnapshot();
    const selected = snapshot.selectedSources ?? {};
    const settings = snapshot.settings ?? {};
    return syncAllSources({
      ...options,
      movieSourceId: options.movieSourceId ?? selected.movie ?? settings.defaultMovieSource ?? null,
    });
  },
  async reloadMovieSource(sourceId = null) {
    const snapshot = userDataService.getSnapshot();
    const selected = sourceId ?? snapshot.selectedSources?.movie ?? snapshot.settings?.defaultMovieSource ?? null;
    return syncAllSources({ movieSourceId: selected, includeMovie: true, includeLive: false });
  },
  async save(sources) {
    sourceRepository.saveAll(sources);
    const saved = sourceRepository.getAll();
    const snapshot = userDataService.getSnapshot();
    const selected = snapshot.selectedSources ?? {};
    const settings = snapshot.settings ?? {};
    for (const type of ['movie', 'live']) {
      const selectedId = selected[type] ?? null;
      const defaultKey = type === 'movie' ? 'defaultMovieSource' : 'defaultLiveSource';
      const defaultId = settings[defaultKey] ?? null;
      if (selectedId && !saved.some(item => item.sourceType === type && item.sourceId === selectedId && item.enabled !== false)) {
        userDataService.clearSelectedSource(type, selectedId);
      }
      if (defaultId && !saved.some(item => item.sourceType === type && item.sourceId === defaultId && item.enabled !== false)) {
        userDataService.updateSettings({ [defaultKey]: null });
      }
    }
    return this.reload();
  },
  async setEnabled(sourceId, enabled) {
    const sources = sourceRepository.getAll();
    const source = sources.find(item => item.sourceId === sourceId);
    if (!source) return this.reload();
    if (!enabled) {
      userDataService.clearSelectedSource(source.sourceType, sourceId);
      const defaultKey = source.sourceType === 'live' ? 'defaultLiveSource' : 'defaultMovieSource';
      if (userDataService.getSettings()?.[defaultKey] === sourceId) {
        userDataService.updateSettings({ [defaultKey]: null });
      }
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
    userDataService.updateSettings({
      [sourceType === 'live' ? 'defaultLiveSource' : 'defaultMovieSource']: sourceId,
    });
    const now = Date.now();
    sourceRepository.saveAll(sources.map(item => ({
      ...item,
      isActive: item.sourceType === sourceType ? item.sourceId === sourceId : item.isActive,
      enabled: item.sourceId === sourceId ? true : item.enabled,
      lastUsedAt: item.sourceId === sourceId ? now : item.lastUsedAt ?? null,
    })));
    return sourceRepository.getAll();
  },
  async remove(sourceId) {
    const sources = sourceRepository.getAll();
    const source = sources.find(item => item.sourceId === sourceId);
    if (source) {
      if (source.sourceType === 'live' && source.liveMode === 'tv1') tv1LiveService.clear(sourceId);
      const selected = userDataService.getSnapshot().selectedSources;
      if (selected[source.sourceType] === sourceId) userDataService.clearSelectedSource(source.sourceType, sourceId);
      const defaultKey = source.sourceType === 'live' ? 'defaultLiveSource' : 'defaultMovieSource';
      if (userDataService.getSettings()?.[defaultKey] === sourceId) {
        userDataService.updateSettings({ [defaultKey]: null });
      }
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