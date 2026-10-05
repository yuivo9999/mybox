function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.movies)) return value.movies;
  if (Array.isArray(value?.vod)) return value.vod;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

function splitRoutes(value) {
  if (Array.isArray(value)) return value.map(item => String(item ?? '').trim()).filter(Boolean);
  return String(value ?? '').split('$$$').map(item => item.trim()).filter(Boolean);
}

function parseRouteEpisodes(route, routeIndex = 0, routeLabel = '') {
  return String(route ?? '')
    .split('#')
    .map((entry, index) => {
      const value = entry.trim();
      if (!value) return null;
      const separator = value.indexOf('$');
      if (separator < 0) return { title: value, episodeNumber: index + 1, playbackCandidates: [] };
      const title = value.slice(0, separator).trim() || `第${index + 1}集`;
      const url = value.slice(separator + 1).trim();
      return {
        title,
        episodeNumber: index + 1,
        playbackCandidates: url ? [{ mediaUrl: url, label: routeLabel || `线路${routeIndex + 1}`, metadata: { tvboxPlayFlag: routeLabel || `线路${routeIndex + 1}`, tvboxRouteIndex: routeIndex } }] : [],
      };
    })
    .filter(Boolean);
}

function asEpisodes(item) {
  const raw = item?.episodes ?? item?.eps ?? item?.playlists;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\s*[|,]\s*/).filter(Boolean).map(title => ({ title }));
  }
  const routes = splitRoutes(item?.vod_play_url);
  if (routes.length) {
    const routeLabels = splitRoutes(item?.vod_play_from);
    return routes.flatMap((route, index) => parseRouteEpisodes(route, index, routeLabels[index] || ''));
  }
  return [];
}

export function parseJSONMovies(input) {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  return asArray(value).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const episodes = asEpisodes(item);
    const urls = Array.isArray(item.urls) ? item.urls : [];
    const typeId = item.type_id != null ? String(item.type_id).trim() : (item.typeId != null ? String(item.typeId).trim() : '');
    const typeName = String(item.type_name ?? item.category ?? item.vod_class ?? item.group ?? item.categoryName ?? '未分类').trim();
    const rawDescription = String(item.description ?? item.desc ?? item.vod_content ?? '');
    const cleanDesc = rawDescription.replace(/<\/?[^>]+(>|$)/g, '').replace(/&nbsp;/g, ' ').trim();
    const updateInfo = String(item.updateInfo ?? item.vod_remarks ?? item.remarks ?? item.vod_state ?? item.note ?? '').trim();
    const poster = String(item.poster ?? item.pic ?? item.vod_pic ?? item.image ?? '').trim();
    const backdrop = String(item.backdrop ?? item.pic_slide ?? item.vod_pic_slide ?? '').trim();

    return [{
      sourceItemId: String(item.sourceItemId ?? item.vod_id ?? item.id ?? `item-${index + 1}`),
      title: String(item.title ?? item.name ?? item.vod_name ?? `内容 ${index + 1}`).trim(),
      titleEn: String(item.titleEn ?? item.vod_en ?? item.en ?? '').trim(),
      type: item.type ?? item.vod_type ?? item.contentType ?? item.mediaType ?? '',
      category: typeName,
      sourceCategoryId: typeId,
      sourceCategoryIds: typeId ? [typeId] : [],
      sourceCategoryName: typeName,
      sourceCategoryNames: [typeName],
      poster,
      backdrop,
      description: cleanDesc,
      year: String(item.year ?? item.vod_year ?? '').trim(),
      region: String(item.region ?? item.vod_area ?? '').trim(),
      director: String(item.director ?? item.vod_director ?? '').trim(),
      actors: Array.isArray(item.actors) ? item.actors : String(item.vod_actor ?? '').split(/[,，/\s]+/).filter(Boolean),
      popularity: Number(item.popularity ?? item.vod_hits ?? 0) || 0,
      updateInfo,
      rating: String(item.rating ?? item.vod_score ?? item.vod_douban_score ?? '').trim(),
      episodes: episodes.length ? episodes : (urls.length ? urls.map((url, i) => ({ title: `第${i + 1}集`, playbackCandidates: [{ mediaUrl: url }] })) : []),
    }];
  });
}

/**
 * Normalize a TVBox/CatVod Spider response into the same raw item shape used by
 * the normal movie pipeline. Accepts common vod_* and playback fields.
 */
export function parseTVBoxResult(input) {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  const list = asArray(value);
  return list.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const typeId = item.type_id != null ? String(item.type_id).trim() : (item.typeId != null ? String(item.typeId).trim() : '');
    const typeName = String(item.type_name ?? item.category ?? item.vod_class ?? item.group ?? item.categoryName ?? '').trim();
    const rawDesc = String(item.description ?? item.desc ?? item.vod_content ?? '');
    const cleanDesc = rawDesc.replace(/<\/?[^>]+(>|$)/g, '').replace(/&nbsp;/g, ' ').trim();

    return [{
      sourceItemId: String(item.sourceItemId ?? item.vod_id ?? item.id ?? `item-${index + 1}`),
      canonicalId: item.canonicalId ?? item.globalId ?? item.vod_id ?? item.id ?? '',
      title: String(item.title ?? item.name ?? item.vod_name ?? `内容 ${index + 1}`).trim(),
      type: item.type ?? item.contentType ?? item.vod_type ?? '',
      category: typeName,
      sourceCategoryId: typeId,
      sourceCategoryIds: typeId ? [typeId] : [],
      sourceCategoryName: typeName,
      sourceCategoryNames: typeName ? [typeName] : [],
      poster: String(item.poster ?? item.pic ?? item.vod_pic ?? item.image ?? '').trim(),
      backdrop: String(item.backdrop ?? item.vod_pic_slide ?? item.pic_slide ?? '').trim(),
      description: cleanDesc,
      year: String(item.year ?? item.vod_year ?? '').trim(),
      region: String(item.region ?? item.area ?? item.vod_area ?? '').trim(),
      director: String(item.director ?? item.vod_director ?? '').trim(),
      actors: Array.isArray(item.actors) ? item.actors : String(item.vod_actor ?? '').split(/[,，/\\s]+/).filter(Boolean),
      popularity: Number(item.popularity ?? item.vod_hits ?? 0) || 0,
      updateInfo: String(item.updateInfo ?? item.vod_remarks ?? item.vod_state ?? '').trim(),
      rating: String(item.rating ?? item.vod_score ?? item.vod_douban_score ?? '').trim(),
      episodes: asEpisodes(item),
    }];
  });
}
