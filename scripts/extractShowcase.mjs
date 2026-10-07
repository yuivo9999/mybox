import { parseJSONMovies } from '../src/adapters/movie/jsonParser.js';
import fs from 'fs';

const titles = [
  { title: '流浪地球2', category: '电影', query: '流浪地球2' },
  { title: '封神第一部：朝歌风云', category: '电影', query: '封神第一部' },
  { title: '星际穿越', category: '电影', query: '星际穿越' },
  { title: '奥本海默', category: '电影', query: '奥本海默' },
  { title: '沙丘2', category: '电影', query: '沙丘2' },
  { title: '热辣滚烫', category: '电影', query: '热辣滚烫' },
  { title: '飞驰人生2', category: '电影', query: '飞驰人生2' },
  { title: '第二十条', category: '电影', query: '第二十条' },
  { title: '消失的她', category: '电影', query: '消失的她' },
  { title: '长安三万里', category: '电影', query: '长安三万里' },
  { title: '孤注一掷', category: '电影', query: '孤注一掷' },
  { title: '三大队', category: '电影', query: '三大队' },
  { title: '狂飙', category: '电视剧', query: '狂飙' },
  { title: '三体', category: '电视剧', query: '三体' },
  { title: '繁花', category: '电视剧', query: '繁花' },
  { title: '漫长的季节', category: '电视剧', query: '漫长的季节' },
  { title: '凡人修仙传', category: '动漫', query: '凡人修仙传' },
  { title: '完美世界', category: '动漫', query: '完美世界' },
  { title: '歌手2024', category: '综艺', query: '歌手2024' },
  { title: '无双战神', category: '短剧', query: '无双' }
];

const apiBases = [
  'https://ikunzyapi.com/api.php/provide/vod?ac=detail&wd=',
  'https://cj.lziapi.com/api.php/provide/vod/?ac=detail&wd=',
  'https://hhzyapi.com/api.php/provide/vod/?ac=detail&wd=',
  'https://api.guangsuapi.com/api.php/provide/vod/?ac=detail&wd=',
  'https://www.hongniuzy2.com/api.php/provide/vod/?ac=detail&wd='
];

async function run() {
  const showcaseList = [];

  for (const item of titles) {
    let found = null;
    for (const base of apiBases) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(base + encodeURIComponent(item.query), { signal: controller.signal }).then(r => r.json());
        clearTimeout(timer);
        const list = res?.list || [];
        const match = list.find(x => x.vod_name === item.title || x.vod_name === item.query || x.vod_name?.includes(item.query)) || list[0];
        if (match && match.vod_play_url) {
          found = match;
          break;
        }
      } catch (e) {}
    }

    if (found) {
      const parsed = parseJSONMovies([found])[0];
      showcaseList.push({
        contentId: 'static_' + parsed.sourceItemId,
        title: found.vod_name,
        category: item.category,
        sourceCategoryName: parsed.sourceCategoryName || item.category,
        mediaType: item.category === '电影' ? 'movie' : item.category === '电视剧' ? 'series' : item.category === '动漫' ? 'anime' : item.category === '综艺' ? 'variety' : 'short-drama',
        year: parsed.year || '2023',
        region: parsed.region || '中国大陆',
        rating: parsed.rating || '8.2',
        updateInfo: parsed.updateInfo || '4K超清',
        remarks: parsed.updateInfo || '4K超清',
        poster: parsed.poster,
        backdrop: parsed.backdrop || parsed.poster,
        description: parsed.description || (found.vod_name + ' 高清精彩正片。'),
        actors: parsed.actors || [],
        director: parsed.director || '',
        episodes: parsed.episodes,
        playUrl: parsed.episodes?.[0]?.playbackCandidates?.[0]?.mediaUrl || '',
        playbackCandidates: parsed.episodes?.[0]?.playbackCandidates || [],
        popularity: parsed.popularity || 90
      });
      console.log('✅ Real showcase item created:', found.vod_name, 'episodes:', parsed.episodes?.length, 'stream:', parsed.episodes?.[0]?.playbackCandidates?.[0]?.mediaUrl);
    }
  }

  console.log('--- Total Real Items Generated:', showcaseList.length);
  fs.writeFileSync('./showcase_extracted.json', JSON.stringify(showcaseList, null, 2));
}

run();
