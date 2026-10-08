/**
 * TVBox Multi-Repo Aggregator Engine
 * Aggregates multiple TVBox single-repo configs into a unified single repository:
 * - Deduplicates and merges 'sites' by key; prefixes conflicting keys with repo name
 * - Deduplicates and merges 'lives' channels and stream URLs
 * - Merges and deduplicates 'parses' (resolvers)
 * - Merges and deduplicates 'flags', 'rules', 'ads', and 'doh'
 */

export function aggregateRepos(repos = [], options = {}) {
  const aggregatedSites = [];
  const siteKeySet = new Set();
  const siteIdentitySet = new Set(); // To detect true duplicates (api + type + ext)

  const livesMap = new Map(); // name -> live entry
  const parsesMap = new Map(); // id/url -> parse entry
  const flagSet = new Set();
  const ruleMap = new Map(); // host -> rule entry
  const adSet = new Set();
  const dohMap = new Map();

  const activeRepos = Array.isArray(repos)
    ? repos.filter(r => r && r.config && typeof r.config === 'object')
    : [];

  activeRepos.forEach((repo) => {
    const repoName = String(repo.name || '仓源').trim();
    const config = repo.config || {};

    // 1. Sites aggregation with smart key prefixing
    if (Array.isArray(config.sites)) {
      config.sites.forEach((site, sIdx) => {
        if (!site || typeof site !== 'object') return;
        const rawKey = String(site.key || `site_${sIdx + 1}`).trim();
        const rawName = String(site.name || rawKey).trim();
        const api = String(site.api || '').trim();
        const type = site.type;
        const ext = typeof site.ext === 'object' ? JSON.stringify(site.ext) : String(site.ext || '');

        const identity = `${api}|${type}|${ext}`;
        // If exact same API endpoint and ext already exists across repos, skip duplicate
        if (api && siteIdentitySet.has(identity)) {
          return;
        }

        let finalKey = rawKey;
        let finalName = rawName;

        if (siteKeySet.has(rawKey)) {
          // Key collision! Automatically prefix with source repository name
          finalKey = `${repoName}_${rawKey}`;
          finalName = `[${repoName}] ${rawName}`;
          // In case the prefixed key also collides
          if (siteKeySet.has(finalKey)) {
            finalKey = `${finalKey}_${sIdx + 1}`;
          }
        }

        siteKeySet.add(finalKey);
        if (api) siteIdentitySet.add(identity);

        aggregatedSites.push({
          ...site,
          key: finalKey,
          name: finalName,
          _originRepo: repoName,
          _originalKey: rawKey,
        });
      });
    }

    // 2. Lives aggregation
    if (Array.isArray(config.lives)) {
      config.lives.forEach((live, lIdx) => {
        if (!live || typeof live !== 'object') return;
        const liveName = String(live.name || `直播源-${lIdx + 1}`).trim();
        const liveKey = String(live.key || liveName).trim();

        // Extract all candidate stream URLs
        const urls = [];
        if (live.url) urls.push(live.url);
        if (Array.isArray(live.urls)) live.urls.forEach(u => urls.push(u));

        if (livesMap.has(liveKey)) {
          // Merge stream URLs without duplicates
          const existing = livesMap.get(liveKey);
          const mergedUrls = [...new Set([...(existing.urls || (existing.url ? [existing.url] : [])), ...urls])];
          existing.urls = mergedUrls;
        } else {
          livesMap.set(liveKey, {
            ...live,
            name: liveName,
            urls: [...new Set(urls)],
            _originRepo: repoName,
          });
        }
      });
    }

    // 3. Parses (Resolvers) aggregation
    if (Array.isArray(config.parses)) {
      config.parses.forEach((parse, pIdx) => {
        if (!parse || typeof parse !== 'object') return;
        const parseUrl = String(parse.url || '').trim();
        const parseName = String(parse.name || `解析-${pIdx + 1}`).trim();
        const parseId = parseUrl || parseName;

        if (!parsesMap.has(parseId)) {
          parsesMap.set(parseId, {
            ...parse,
            name: parseName,
            url: parseUrl,
            _originRepo: repoName,
          });
        }
      });
    }

    // 4. Flags aggregation
    if (Array.isArray(config.flags)) {
      config.flags.forEach(f => {
        const flagStr = String(f || '').trim();
        if (flagStr) flagSet.add(flagStr);
      });
    }

    // 5. Rules aggregation
    if (Array.isArray(config.rules)) {
      config.rules.forEach(rule => {
        if (!rule || typeof rule !== 'object') return;
        const host = String(rule.host || '').trim();
        if (host && !ruleMap.has(host)) {
          ruleMap.set(host, rule);
        }
      });
    }

    // 6. Ads filtering rules
    if (Array.isArray(config.ads)) {
      config.ads.forEach(ad => {
        const adStr = String(ad || '').trim();
        if (adStr) adSet.add(adStr);
      });
    }

    // 7. DoH aggregation
    if (Array.isArray(config.doh)) {
      config.doh.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const dohUrl = String(item.url || item.name || '').trim();
        if (dohUrl && !dohMap.has(dohUrl)) {
          dohMap.set(dohUrl, item);
        }
      });
    }
  });

  const aggregatedLives = Array.from(livesMap.values());
  const aggregatedParses = Array.from(parsesMap.values());
  const aggregatedFlags = Array.from(flagSet);
  const aggregatedRules = Array.from(ruleMap.values());
  const aggregatedAds = Array.from(adSet);
  const aggregatedDoh = Array.from(dohMap.values());

  return {
    sites: aggregatedSites,
    lives: aggregatedLives,
    parses: aggregatedParses,
    flags: aggregatedFlags,
    rules: aggregatedRules,
    ads: aggregatedAds,
    doh: aggregatedDoh,
    meta: {
      aggregatedAt: Date.now(),
      repoCount: activeRepos.length,
      siteCount: aggregatedSites.length,
      liveCount: aggregatedLives.length,
      parseCount: aggregatedParses.length,
      sourceRepoNames: activeRepos.map(r => r.name),
    },
  };
}
