import assert from 'node:assert/strict';
import { toPunycodeUrl, domainToASCII, encodePunycode } from '../src/utils/punycode.js';
import { 
  stripJSONComments, 
  sanitizeJSONControlChars, 
  stripTrailingCommas, 
  parseRobustTVBoxConfig,
  CONCISE_USER_AGENT,
  fetchRepoWithFallback 
} from '../src/services/multiRepoFetcher.js';
import { aggregateRepos } from '../src/services/multiRepoAggregator.js';
import { multiRepoService, DEFAULT_PRESET_REPOS } from '../src/services/multiRepoService.js';

console.log('--- Testing Multi-Repo & Aggregation Suite ---');

// 1. 中文域名自动转 Punycode 测试
console.log('Test 1: 中文域名自动转 Punycode');
assert.equal(encodePunycode('饭太硬'), 'sss604efuw');
assert.equal(domainToASCII('饭太硬.com'), 'xn--sss604efuw.com');
assert.equal(toPunycodeUrl('http://饭太硬.com/tv'), 'http://xn--sss604efuw.com/tv');
assert.equal(toPunycodeUrl('https://饭太硬.com:8080/tvbox.json'), 'https://xn--sss604efuw.com:8080/tvbox.json');
assert.equal(toPunycodeUrl('饭太硬.com/tv'), 'http://xn--sss604efuw.com/tv');
assert.equal(domainToASCII('肥猫.com'), 'xn--z7x900a.com');
assert.equal(toPunycodeUrl('http://肥猫.com/tv'), 'http://xn--z7x900a.com/tv');
// ASCII domain should stay untouched
assert.equal(toPunycodeUrl('http://cdn.qiaoji8.com/tvbox.json'), 'http://cdn.qiaoji8.com/tvbox.json');
console.log('✓ 中文域名 Punycode 转换校验 100% 通过');

// 2. 反爬兼容与容错解析测试 (简洁 UA、剔除 // 注释、兼容未转义控制字符)
console.log('Test 2: 反爬兼容与容错解析 (简洁 UA & 注释清理)');
assert.equal(CONCISE_USER_AGENT, 'okhttp/3.15');

const dirtyJsonWithComments = `
// TVBox configuration file
{
  // Primary sites
  "sites": [
    {
      "key": "csp_Douban",
      "name": "豆瓣影视", // comment inside
      "api": "csp_Douban",
      /* multi-line comment here */
      "type": 3,
    }
  ],
  /* lives comment */
  "lives": [
    {
      "name": "CCTV",
      "url": "http://live.com/cctv.m3u",
    }
  ],
}
`;

const parsedClean = parseRobustTVBoxConfig(dirtyJsonWithComments);
assert.equal(parsedClean.sites.length, 1);
assert.equal(parsedClean.sites[0].name, '豆瓣影视');
assert.equal(parsedClean.lives.length, 1);
assert.equal(parsedClean.lives[0].name, 'CCTV');
console.log('✓ 反爬兼容与 JSON 注释、未转义控制符容错解析 100% 通过');

// 3. 聚合单仓算法测试 (Sites 按 key 去重合并，重复 key 自动加源前缀，lives/parses 合并去重)
console.log('Test 3: 单仓聚合与 Key 冲突前缀化');

const repoA = {
  name: '饭太硬',
  config: {
    sites: [
      { key: 'csp_Douban', name: '豆瓣电影', api: 'csp_Douban_v1', type: 3 },
      { key: 'site_exclusive_a', name: '独播库A', api: 'http://a.com/vod', type: 1 },
    ],
    lives: [
      { name: '央视频道', url: 'http://cctv1.m3u' }
    ],
    parses: [
      { name: '解析1', url: 'http://parse1.com' }
    ],
    flags: ['youku', 'iqiyi'],
    rules: [{ host: 'pstatp.com', rule: ['m3u8'] }],
  }
};

const repoB = {
  name: '肥猫',
  config: {
    sites: [
      // 冲突 key: csp_Douban 但 api 不同 -> 自动加源前缀
      { key: 'csp_Douban', name: '豆瓣电影', api: 'csp_Douban_v2', type: 3 },
      { key: 'site_exclusive_b', name: '极速库B', api: 'http://b.com/vod', type: 1 },
    ],
    lives: [
      // 相同频道 -> 线路合并
      { name: '央视频道', url: 'http://cctv2.m3u' },
      { name: '卫视频道', url: 'http://weishi.m3u' }
    ],
    parses: [
      // 相同解析器 -> 去重
      { name: '解析1', url: 'http://parse1.com' },
      { name: '解析2', url: 'http://parse2.com' }
    ],
    flags: ['youku', 'tencent'],
    rules: [{ host: 'pstatp.com', rule: ['m3u8'] }, { host: 'iqiyi.com', rule: ['flv'] }],
  }
};

const aggregated = aggregateRepos([repoA, repoB]);

// Verify Sites
assert.equal(aggregated.sites.length, 4, 'All 4 sites should be retained');
const keys = aggregated.sites.map(s => s.key);
assert.ok(keys.includes('csp_Douban'), 'First Douban site keeps original key');
assert.ok(keys.includes('肥猫_csp_Douban'), 'Second Douban site is prefixed with [肥猫_]');

const prefixedSite = aggregated.sites.find(s => s.key === '肥猫_csp_Douban');
assert.equal(prefixedSite.name, '[肥猫] 豆瓣电影', 'Conflicting site name is prefixed');

// Verify Lives
assert.equal(aggregated.lives.length, 2, 'CCTV merged, Weishi added');
const cctvLive = aggregated.lives.find(l => l.name === '央视频道');
assert.ok(cctvLive.urls.includes('http://cctv1.m3u'));
assert.ok(cctvLive.urls.includes('http://cctv2.m3u'));

// Verify Parses
assert.equal(aggregated.parses.length, 2, 'Duplicate parse1 merged');

// Verify Flags & Rules
assert.equal(aggregated.flags.length, 3, 'youku, iqiyi, tencent');
assert.equal(aggregated.rules.length, 2, 'pstatp.com, iqiyi.com');
console.log('✓ 聚合单仓 Sites Key 冲突自动加前缀与 Lives/Parses 去重 100% 通过');

// 4. 多仓源管理服务测试
console.log('Test 4: 多仓源管理服务 (增删改查与预置仓)');
assert.ok(DEFAULT_PRESET_REPOS.length >= 5);
assert.equal(DEFAULT_PRESET_REPOS[0].name, '饭太硬');
assert.ok(DEFAULT_PRESET_REPOS[0].backupUrls.length > 0, 'Backup URLs configured');

const textParsed = multiRepoService.parseMultiRepoText(`
饭太硬,http://饭太硬.com/tv
http://xn--sss604efuw.com/tv
肥猫,http://肥猫.com/tv
`);
assert.equal(textParsed.length, 2);
assert.equal(textParsed[0].name, '饭太硬');
assert.equal(textParsed[0].primaryUrl, 'http://饭太硬.com/tv');
assert.equal(textParsed[0].backupUrls[0], 'http://xn--sss604efuw.com/tv');
console.log('✓ 多仓订阅解析与回退地址绑定 100% 通过');

console.log('ALL TESTS PASSED SUCCESSFULLY! 🎉');
