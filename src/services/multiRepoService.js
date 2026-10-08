import { storage } from '../storage/storage.js';
import { fetchRepoWithFallback } from './multiRepoFetcher.js';
import { aggregateRepos } from './multiRepoAggregator.js';
import { sourceRepository } from '../repositories/sourceRepository.js';

const STORAGE_KEY_MULTI_REPOS = 'multi_repos';
const STORAGE_KEY_LAST_AGGREGATED = 'last_aggregated_repo_config';

export const DEFAULT_PRESET_REPOS = Object.freeze([
  {
    id: 'repo_fty',
    name: '饭太硬',
    primaryUrl: 'http://饭太硬.com/tv',
    backupUrls: [
      'http://xn--sss604efuw.com/tv',
      'https://www.ftytv.com/tv',
      'https://ghfast.top/https://raw.githubusercontent.com/fantaiying/ext/master/tvbox.json',
    ],
    enabled: true,
    status: 'idle',
    siteCount: 0,
    liveCount: 0,
  },
  {
    id: 'repo_feimao',
    name: '肥猫',
    primaryUrl: 'http://肥猫.com/tv',
    backupUrls: [
      'http://xn--z7x900a.com/tv',
      'http://feedcat.top/tv',
    ],
    enabled: true,
    status: 'idle',
    siteCount: 0,
    liveCount: 0,
  },
  {
    id: 'repo_qiaoji',
    name: '巧技',
    primaryUrl: 'http://cdn.qiaoji8.com/tvbox.json',
    backupUrls: [
      'https://ghfast.top/https://raw.githubusercontent.com/qiaoji8/tvbox/master/tvbox.json',
    ],
    enabled: true,
    status: 'idle',
    siteCount: 0,
    liveCount: 0,
  },
  {
    id: 'repo_moyu',
    name: '摸鱼儿',
    primaryUrl: 'http://我不是.摸鱼儿.top',
    backupUrls: [
      'http://xn--654a.xn--2qux23c9zi.top',
      'https://ghfast.top/https://raw.githubusercontent.com/moyu/tvbox/master/tv.json',
    ],
    enabled: true,
    status: 'idle',
    siteCount: 0,
    liveCount: 0,
  },
  {
    id: 'repo_xiaopingguo',
    name: '小苹果',
    primaryUrl: 'https://agit.ai/pingguo/rec/raw/branch/master/tvbox.json',
    backupUrls: [
      'https://ghproxy.net/https://raw.githubusercontent.com/xiaopingguo/tvbox/master/apple.json',
    ],
    enabled: true,
    status: 'idle',
    siteCount: 0,
    liveCount: 0,
  },
]);

function initRepos() {
  if (typeof window === 'undefined') {
    return DEFAULT_PRESET_REPOS;
  }
  if (storage.has(STORAGE_KEY_MULTI_REPOS)) {
    const existing = storage.read(STORAGE_KEY_MULTI_REPOS, null);
    if (Array.isArray(existing) && existing.length > 0) {
      return existing;
    }
  }
  storage.write(STORAGE_KEY_MULTI_REPOS, DEFAULT_PRESET_REPOS);
  return DEFAULT_PRESET_REPOS;
}

export const multiRepoService = {
  getAll() {
    return initRepos();
  },

  getRepo(id) {
    const repos = this.getAll();
    return repos.find(r => r.id === id) || null;
  },

  saveAll(repos) {
    storage.write(STORAGE_KEY_MULTI_REPOS, repos);
    return repos;
  },

  addRepo({ name, primaryUrl, backupUrls = [] }) {
    const repos = this.getAll();
    const newRepo = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '自定义多仓').trim(),
      primaryUrl: String(primaryUrl || '').trim(),
      backupUrls: Array.isArray(backupUrls) ? backupUrls.map(u => String(u).trim()).filter(Boolean) : [],
      enabled: true,
      status: 'idle',
      siteCount: 0,
      liveCount: 0,
      createdAt: Date.now(),
    };
    const next = [newRepo, ...repos];
    this.saveAll(next);
    return newRepo;
  },

  updateRepo(id, patch) {
    const repos = this.getAll();
    const next = repos.map(r => r.id === id ? { ...r, ...patch } : r);
    this.saveAll(next);
    return next.find(r => r.id === id);
  },

  removeRepo(id) {
    const repos = this.getAll();
    const next = repos.filter(r => r.id !== id);
    this.saveAll(next);
    return next;
  },

  toggleRepo(id, enabled) {
    return this.updateRepo(id, { enabled });
  },

  restoreDefaults() {
    this.saveAll(DEFAULT_PRESET_REPOS);
    return DEFAULT_PRESET_REPOS;
  },

  async syncRepo(id, options = {}) {
    const repo = this.getRepo(id);
    if (!repo) throw new Error('REPO_NOT_FOUND');

    this.updateRepo(id, { status: 'syncing', errorMessage: null });

    try {
      const result = await fetchRepoWithFallback(repo, options);
      if (result.ok && result.config) {
        const sites = Array.isArray(result.config.sites) ? result.config.sites : [];
        const lives = Array.isArray(result.config.lives) ? result.config.lives : [];
        const parses = Array.isArray(result.config.parses) ? result.config.parses : [];

        const updated = this.updateRepo(id, {
          status: 'success',
          lastSyncAt: Date.now(),
          durationMs: result.durationMs,
          usedUrl: result.usedUrl,
          punycodeUrl: result.punycodeUrl,
          siteCount: sites.length,
          liveCount: lives.length,
          parseCount: parses.length,
          config: result.config,
          attempts: result.attempts,
          errorMessage: null,
        });
        return { ok: true, repo: updated };
      }

      const updated = this.updateRepo(id, {
        status: 'error',
        lastSyncAt: Date.now(),
        attempts: result.attempts,
        errorMessage: result.error || '所有主/备用地址请求均失败',
      });
      return { ok: false, repo: updated, error: result.error };
    } catch (err) {
      const updated = this.updateRepo(id, {
        status: 'error',
        lastSyncAt: Date.now(),
        errorMessage: err?.message || '同步异常',
      });
      return { ok: false, repo: updated, error: err?.message };
    }
  },

  async syncAll(options = {}) {
    const repos = this.getAll().filter(r => r.enabled !== false);
    const results = [];
    for (const repo of repos) {
      // Synchronize each repository sequentially or with slight delay to avoid bursting
      const res = await this.syncRepo(repo.id, options);
      results.push(res);
    }
    return results;
  },

  aggregateSelected(selectedIds = null) {
    const allRepos = this.getAll();
    const targetRepos = Array.isArray(selectedIds) && selectedIds.length > 0
      ? allRepos.filter(r => selectedIds.includes(r.id) && r.config)
      : allRepos.filter(r => r.enabled !== false && r.config);

    const aggregated = aggregateRepos(targetRepos);
    storage.write(STORAGE_KEY_LAST_AGGREGATED, aggregated);
    return aggregated;
  },

  getLastAggregated() {
    return storage.read(STORAGE_KEY_LAST_AGGREGATED, null);
  },

  /**
   * Parses multi-repo URLs imported by user (supports TVBox standard `urls` JSON format or raw text lines)
   */
  parseMultiRepoText(text) {
    if (!text || typeof text !== 'string') return [];
    const trimmed = text.trim();
    if (!trimmed) return [];

    // Try JSON format {"urls": [{"url": "...", "name": "..."}, ...]}
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const obj = JSON.parse(trimmed);
        const list = Array.isArray(obj) ? obj : Array.isArray(obj.urls) ? obj.urls : [];
        if (list.length > 0) {
          return list.map((item, idx) => ({
            id: `repo_imported_${Date.now()}_${idx}`,
            name: String(item.name || `导入仓源-${idx + 1}`).trim(),
            primaryUrl: String(item.url || '').trim(),
            backupUrls: Array.isArray(item.backupUrls) ? item.backupUrls : [],
            enabled: true,
            status: 'idle',
            siteCount: 0,
            liveCount: 0,
          })).filter(r => r.primaryUrl);
        }
      } catch {}
    }

    // Line-separated text
    const lines = trimmed.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const result = [];
    let current = null;

    lines.forEach((line, idx) => {
      // Format: name,url or name#url or http...
      if (line.includes(',') || line.includes('#')) {
        const [namePart, ...urlParts] = line.split(/[,#]/);
        const urlPart = urlParts.join('');
        if (/^https?:\/\//i.test(urlPart.trim())) {
          current = {
            id: `repo_line_${Date.now()}_${idx}`,
            name: namePart.trim() || `仓源-${idx + 1}`,
            primaryUrl: urlPart.trim(),
            backupUrls: [],
            enabled: true,
            status: 'idle',
            siteCount: 0,
            liveCount: 0,
          };
          result.push(current);
          return;
        }
      }

      if (/^https?:\/\//i.test(line)) {
        if (!current) {
          current = {
            id: `repo_line_${Date.now()}_${idx}`,
            name: `仓源-${result.length + 1}`,
            primaryUrl: line,
            backupUrls: [],
            enabled: true,
            status: 'idle',
            siteCount: 0,
            liveCount: 0,
          };
          result.push(current);
        } else {
          // If previous exists and next line is another URL, treat as backup URL
          current.backupUrls.push(line);
        }
      }
    });

    return result;
  },

  /**
   * Applies aggregated TVBox single-repo config to active application source repository
   */
  async applyAggregatedConfigToActiveSources(aggregatedConfig, { sourceConfigService }) {
    if (!aggregatedConfig || !Array.isArray(aggregatedConfig.sites)) {
      throw new Error('NO_VALID_AGGREGATED_CONFIG');
    }

    // Convert TVBox config into normalized system source models
    const parsedSources = sourceConfigService.parseText(
      JSON.stringify(aggregatedConfig),
      { fileName: '聚合单仓.json' }
    );

    const currentSources = sourceRepository.getAll();
    const aggregatedBundleId = 'bundle_tvbox_aggregated_single';

    // Remove any previous aggregated bundle sources
    const retainedSources = currentSources.filter(s => s.bundleId !== aggregatedBundleId);

    // Mark all newly imported aggregated sources with the bundle ID
    const sourcesToInsert = (await parsedSources).map(s => ({
      ...s,
      bundleId: aggregatedBundleId,
      isAggregatedSingleRepo: true,
    }));

    const finalSources = [...retainedSources, ...sourcesToInsert];
    sourceRepository.saveAll(finalSources);
    return {
      sources: finalSources,
      addedCount: sourcesToInsert.length,
      siteCount: aggregatedConfig.sites.length,
      liveCount: (aggregatedConfig.lives || []).length,
    };
  },
};
