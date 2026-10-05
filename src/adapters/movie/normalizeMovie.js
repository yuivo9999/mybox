import { normalizeContent } from '../../models/content.js';

export function normalizeMovie({ sourceId, item, index = 0, sourceMetadata = {} }) {
  const playbackMetadata = Object.fromEntries(
    Object.entries({
      sourceCapability: sourceMetadata.sourceCapability,
      adapterType: sourceMetadata.adapterType,
      tvboxAdapterKind: sourceMetadata.tvboxAdapterKind,
      tvboxRequiresJar: sourceMetadata.tvboxRequiresJar,
      tvboxJar: sourceMetadata.tvboxJar,
      playerType: sourceMetadata.tvboxType ?? sourceMetadata.playerType,
      headers: sourceMetadata.headers,
      userAgent: sourceMetadata.userAgent,
      referer: sourceMetadata.referer,
      cookies: sourceMetadata.cookies,
      tvboxIJKProfiles: sourceMetadata.tvboxIJKProfiles,
      tvboxParseConfig: sourceMetadata.tvboxParseConfig,
    }).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  const normalizeCandidate = (candidate = {}) => ({
    ...candidate,
    metadata: { ...playbackMetadata, ...(candidate.metadata ?? {}) },
    headers: { ...(sourceMetadata.headers ?? {}), ...(candidate.headers ?? {}) },
    userAgent: candidate.userAgent ?? sourceMetadata.userAgent,
    referer: candidate.referer ?? sourceMetadata.referer,
    cookies: candidate.cookies ?? sourceMetadata.cookies ?? '',
  });
  const episodes = (item.episodes ?? []).map((episode, episodeIndex) => {
    if (typeof episode === 'string') return { title: episode };
    return {
      sourceItemId: episode.sourceItemId ?? episode.id ?? `${item.sourceItemId ?? item.id}:episode:${episodeIndex + 1}`,
      canonicalEpisodeId: episode.canonicalEpisodeId ?? episode.globalId ?? '',
      title: episode.title ?? episode.name ?? `第${episodeIndex + 1}集`,
      description: episode.description ?? episode.desc ?? '',
      episodeNumber: episode.episodeNumber ?? episode.number ?? episodeIndex + 1,
      playbackCandidates: [
        ...(Array.isArray(episode.playbackCandidates) ? episode.playbackCandidates : []),
        ...(episode.url ? [{ mediaUrl: episode.url, protocol: episode.protocol, label: episode.label }] : []),
      ].filter(candidate => candidate.mediaUrl || candidate.url).map(normalizeCandidate),
    };
  });

  const actors = Array.isArray(item.actors) ? item.actors : (Array.isArray(item.cast) ? item.cast : []);
  const director = item.director ?? item.directors?.[0] ?? '';

  return normalizeContent({
    sourceId,
    sourceItemId: item.sourceItemId ?? item.id ?? `item-${index + 1}`,
    canonicalId: item.canonicalId ?? item.globalId ?? item.externalId ?? item.tmdbId ?? item.imdbId ?? '',
    title: item.title ?? item.name ?? '',
    titleEn: item.titleEn ?? item.vod_en ?? item.en ?? '',
    subtitle: item.subtitle ?? item.subTitle ?? '',
    type: item.type ?? item.contentType ?? '',
    sourceCategoryId: item.sourceCategoryId ?? '',
    sourceCategoryIds: item.sourceCategoryIds ?? (item.sourceCategoryId ? [item.sourceCategoryId] : []),
    sourceCategoryName: item.sourceCategoryName ?? item.category ?? '',
    sourceCategoryNames: item.sourceCategoryNames ?? (item.sourceCategoryName ? [item.sourceCategoryName] : []),
    rating: item.rating ?? item.vod_score ?? '',
    poster: item.poster ?? item.pic ?? item.cover ?? '',
    backdrop: item.backdrop ?? item.background ?? '',
    background: item.background ?? item.backdrop ?? '',
    description: item.description ?? item.desc ?? '',
    year: item.year ?? item.releaseYear ?? '',
    category: item.category ?? item.class ?? '',
    region: item.region ?? item.area ?? '',
    director,
    actors,
    cast: actors,
    popularity: item.popularity,
    updateInfo: item.updateInfo ?? item.updateStatus ?? item.status ?? '',
    totalEpisodes: item.totalEpisodes ?? item.episodeCount,
    episodeCount: item.episodeCount ?? item.totalEpisodes,
    currentEpisode: item.currentEpisode,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    episodes,
  });
}
