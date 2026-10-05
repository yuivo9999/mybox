/**
 * Parser for TVBox / DIYP / IPTV `#genre#` TXT live channel format.
 */

export function parseTXTLive(text) {
  if (!text) return [];
  const cleanText = String(text).replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let currentCategory = '默认频道';
  const channelsMap = new Map();
  const channelsList = [];

  for (const line of lines) {
    if (line.includes('#genre#') || /^\[.*\]$/.test(line)) {
      let cat = line.replace(/[,，]?\s*#genre#.*$/i, '').trim();
      if (/^\[(.*)\]$/.test(cat)) cat = cat.slice(1, -1).trim();
      if (cat) currentCategory = cat;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let name = '';
    let rawUrls = '';
    const commaIndex = line.search(/[,，]/);
    if (commaIndex !== -1) {
      name = line.slice(0, commaIndex).trim();
      rawUrls = line.slice(commaIndex + 1).trim();
    } else {
      const match = line.match(/^([^\s]+)\s+((?:https?|rtmp|rtsp|p2p|mitv|mms):\/\/.+)$/i);
      if (match) {
        name = match[1].trim();
        rawUrls = match[2].trim();
      } else continue;
    }
    if (!name || !rawUrls) continue;

    const urlCandidates = rawUrls.split('#').map(u => u.trim()).filter(Boolean);
    const mapKey = `${currentCategory}:::${name}`;
    let channel = channelsMap.get(mapKey);
    if (!channel) {
      channel = {
        sourceItemId: `txt-${channelsList.length + 1}-${name}`,
        canonicalId: name,
        channelKey: name,
        name,
        logo: '',
        categoryId: currentCategory,
        category: currentCategory,
        sourceOrder: channelsList.length,
        streams: [],
        epg: [],
        currentProgram: null,
        upcomingProgram: null,
      };
      channelsMap.set(mapKey, channel);
      channelsList.push(channel);
    }

    for (const cand of urlCandidates) {
      let streamUrl = cand;
      let streamLabel = `线路 ${channel.streams.length + 1}`;
      if (streamUrl.includes('$')) {
        const parts = streamUrl.split('$');
        streamUrl = parts[0].trim();
        if (parts[1]?.trim()) streamLabel = parts[1].trim();
      }
      if (/^(?:https?|rtmp|rtsp|p2p|mitv|mms):\/\//i.test(streamUrl)
        || /\.(?:m3u8|flv|mp4)(?:[?#].*)?$/i.test(streamUrl)) {
        channel.streams.push({ url: streamUrl, label: streamLabel, quality: '', resolution: '' });
      }
    }
  }
  return channelsList;
}

export function parseTXTLiveMetadata(text) {
  if (!text) return [];
  const cleanText = String(text).replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/);
  let currentCategory = '默认频道';
  const channelsMap = new Map();
  const channels = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    if (line.includes('#genre#') || /^\[.*\]$/.test(line)) {
      let cat = line.replace(/[,，]?\s*#genre#.*$/i, '').trim();
      const bracket = cat.match(/^\[(.*)\]$/);
      if (bracket) cat = bracket[1].trim();
      if (cat) currentCategory = cat;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const commaIndex = line.search(/[,，]/);
    const name = commaIndex !== -1 ? line.slice(0, commaIndex).trim() : line.match(/^([^\s]+)\s+/)?.[1]?.trim() || '';
    const rawUrls = commaIndex !== -1 ? line.slice(commaIndex + 1).trim() : line.match(/^[^\s]+\s+(.+)$/)?.[1]?.trim() || '';
    if (!name) continue;

    const urlCountInLine = Math.max(1, rawUrls ? rawUrls.split('#').filter(Boolean).length : 1);
    const key = currentCategory + ':::' + name;
    let existing = channelsMap.get(key);
    if (existing) {
      existing.deferredRef.lineIndices.push(lineIndex);
      existing.estimatedStreamCount = (existing.estimatedStreamCount || 1) + urlCountInLine;
    } else {
      const channel = {
        sourceItemId: 'txt-' + (channels.length + 1) + '-' + name,
        canonicalId: name,
        channelKey: name,
        name,
        logo: '',
        categoryId: currentCategory,
        category: currentCategory,
        sourceOrder: channels.length,
        streams: [],
        epg: [],
        currentProgram: null,
        upcomingProgram: null,
        deferredRef: { lineIndex, lineIndices: [lineIndex] },
        estimatedStreamCount: urlCountInLine,
      };
      channelsMap.set(key, channel);
      channels.push(channel);
    }
  }
  return channels;
}

export async function parseTXTLiveMetadataStream(text, onChannel) {
  if (!text) return [];
  const cleanText = String(text).replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/);
  let currentCategory = '默认频道';
  const channelsMap = new Map();
  const channels = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) continue;

    if (line.includes('#genre#') || /^\[.*\]$/.test(line)) {
      let cat = line.replace(/[,，]?\s*#genre#.*$/i, '').trim();
      const bracket = cat.match(/^\[(.*)\]$/);
      if (bracket) cat = bracket[1].trim();
      if (cat) currentCategory = cat;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const commaIndex = line.search(/[,，]/);
    const name = commaIndex !== -1 ? line.slice(0, commaIndex).trim() : line.match(/^([^\s]+)\s+/)?.[1]?.trim() || '';
    const rawUrls = commaIndex !== -1 ? line.slice(commaIndex + 1).trim() : line.match(/^[^\s]+\s+(.+)$/)?.[1]?.trim() || '';
    if (!name) continue;

    const urlCountInLine = Math.max(1, rawUrls ? rawUrls.split('#').filter(Boolean).length : 1);
    const key = currentCategory + ':::' + name;
    let existing = channelsMap.get(key);
    if (existing) {
      existing.deferredRef.lineIndices.push(lineIndex);
      existing.estimatedStreamCount = (existing.estimatedStreamCount || 1) + urlCountInLine;
    } else {
      const channel = {
        sourceItemId: 'txt-' + (channels.length + 1) + '-' + name,
        canonicalId: name,
        channelKey: name,
        name,
        logo: '',
        categoryId: currentCategory,
        category: currentCategory,
        sourceOrder: channels.length,
        streams: [],
        epg: [],
        currentProgram: null,
        upcomingProgram: null,
        deferredRef: { lineIndex, lineIndices: [lineIndex] },
        estimatedStreamCount: urlCountInLine,
      };
      channelsMap.set(key, channel);
      channels.push(channel);
      if (typeof onChannel === 'function') await onChannel(channel);
    }

    if (lineIndex > 0 && lineIndex % 1500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return channels;
}

export async function parseTXTLiveAsync(text) {
  if (!text) return [];
  const cleanText = String(text).replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let currentCategory = '默认频道';
  const channelsMap = new Map();
  const channelsList = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('#genre#') || /^\[.*\]$/.test(line)) {
      let cat = line.replace(/[,，]?\s*#genre#.*$/i, '').trim();
      if (/^\[(.*)\]$/.test(cat)) cat = cat.slice(1, -1).trim();
      if (cat) currentCategory = cat;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let name = '';
    let rawUrls = '';
    const commaIndex = line.search(/[,，]/);
    if (commaIndex !== -1) {
      name = line.slice(0, commaIndex).trim();
      rawUrls = line.slice(commaIndex + 1).trim();
    } else {
      const match = line.match(/^([^\s]+)\s+((?:https?|rtmp|rtsp|p2p|mitv|mms):\/\/.+)$/i);
      if (match) {
        name = match[1].trim();
        rawUrls = match[2].trim();
      } else continue;
    }
    if (!name || !rawUrls) continue;

    const urlCandidates = rawUrls.split('#').map(u => u.trim()).filter(Boolean);
    const mapKey = `${currentCategory}:::${name}`;
    let channel = channelsMap.get(mapKey);
    if (!channel) {
      channel = {
        sourceItemId: `txt-${channelsList.length + 1}-${name}`,
        canonicalId: name,
        channelKey: name,
        name,
        logo: '',
        categoryId: currentCategory,
        category: currentCategory,
        sourceOrder: channelsList.length,
        streams: [],
        epg: [],
        currentProgram: null,
        upcomingProgram: null,
      };
      channelsMap.set(mapKey, channel);
      channelsList.push(channel);
    }

    for (const cand of urlCandidates) {
      let streamUrl = cand;
      let streamLabel = `线路 ${channel.streams.length + 1}`;
      if (streamUrl.includes('$')) {
        const parts = streamUrl.split('$');
        streamUrl = parts[0].trim();
        if (parts[1]?.trim()) streamLabel = parts[1].trim();
      }
      if (/^(?:https?|rtmp|rtsp|p2p|mitv|mms):\/\//i.test(streamUrl)
        || /\.(?:m3u8|flv|mp4)(?:[?#].*)?$/i.test(streamUrl)) {
        channel.streams.push({ url: streamUrl, label: streamLabel, quality: '', resolution: '' });
      }
    }

    if (i > 0 && i % 1500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return channelsList;
}

export function parseTXTLiveLineStreams(line) {
  const value = String(line || '').trim();
  if (!value) return [];
  const commaIndex = value.search(/[,，]/);
  const rawUrls = commaIndex !== -1 ? value.slice(commaIndex + 1).trim() : value.match(/^[^\s]+\s+(.+)$/)?.[1]?.trim() || '';
  if (!rawUrls) return [];

  const separator = String.fromCharCode(36);
  return rawUrls.split('#').map((candidate, index) => {
    let streamUrl = candidate.trim();
    if (!streamUrl) return null;
    let label = '线路 ' + (index + 1);
    if (streamUrl.includes(separator)) {
      const parts = streamUrl.split(separator);
      streamUrl = parts.shift()?.trim() || '';
      if (parts.join(separator).trim()) label = parts.join(separator).trim();
    }
    return streamUrl ? { url: streamUrl, label, quality: '', resolution: '' } : null;
  }).filter(Boolean);
}

export function isTXTGenreFormat(text) {
  if (!text || typeof text !== 'string') return false;
  if (/#genre#/i.test(text)) return true;
  const sampleLines = text.split(/\r?\n/).slice(0, 30).filter(Boolean);
  let matchCount = 0;
  for (const line of sampleLines) {
    if (/[^,，\r\n]+[,，]\s*(?:https?|rtmp|rtsp):\/\//i.test(line)) matchCount++;
    else if (/^[^\s]+\s+(?:https?|rtmp|rtsp):\/\//i.test(line)) matchCount++;
  }
  return matchCount >= 2;
}
