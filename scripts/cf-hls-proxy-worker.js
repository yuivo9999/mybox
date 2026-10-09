/**
 * Cloudflare Worker：HLS / m3u8 的 HTTPS + CORS 中转
 *
 * 部署（免费额度即可，约 10 万次请求/天；HLS 每个分片算一次请求）：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Create Worker
 *   2. 点 Edit code，把本文件全部内容粘贴进去，改好下面的 ALLOWED_ORIGINS，Deploy
 *   3. 得到地址如 https://xxx.your-name.workers.dev
 *   4. 在网页直播页“网页端中转设置”里填：  https://xxx.your-name.workers.dev/?url=
 *      （或在仓库 Settings → Variables 中新增 HLS_PROXY_URL，值同上，重新部署 Pages）
 *
 * 注意：
 *   - 请把 ALLOWED_ORIGINS 改成你自己的 Pages 域名，否则任何人都能把你的 Worker 当公共代理用。
 *   - Worker 访问“IP:端口”形式的源站时，Cloudflare 对出站端口/IP 有限制，个别源可能仍失败；
 *     此时可改用 Vercel / 自建 Node 中转（接口约定相同：?url=目标地址）。
 */
const ALLOWED_ORIGINS = [
  // 'https://你的用户名.github.io',
];

function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  // IPv6：回环、唯一本地(fc00::/7)、链路本地(fe80::/10)
  if (host.startsWith('[')) return host === '[::1]' || /^\[f[cd]/.test(host) || /^\[fe[89ab]/.test(host);
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const a = Number(m[1]); const b = Number(m[2]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function corsHeaders(origin) {
  const allowAll = ALLOWED_ORIGINS.length === 0;
  const allowed = allowAll || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? (allowAll ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }
    if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden origin', { status: 403, headers: cors });
    }

    const params = new URL(request.url).searchParams;
    const target = params.get('url');
    if (!target) return new Response('Missing url parameter', { status: 400, headers: cors });

    let targetUrl;
    try { targetUrl = new URL(target); } catch { return new Response('Invalid url', { status: 400, headers: cors }); }
    if (!/^https?:$/.test(targetUrl.protocol)) return new Response('Unsupported protocol', { status: 400, headers: cors });
    if (isBlockedHost(targetUrl.hostname)) return new Response('Blocked host', { status: 403, headers: cors });

    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: '*/*',
    });
    const range = request.headers.get('Range');
    if (range) headers.set('Range', range);
    const referer = params.get('referer');
    if (referer) headers.set('Referer', referer);

    try {
      const upstream = await fetch(targetUrl.toString(), { method: request.method, headers, redirect: 'follow' });
      const out = new Headers(upstream.headers);
      for (const [key, value] of Object.entries(cors)) out.set(key, value);
      out.delete('content-security-policy');
      out.delete('set-cookie');
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
    } catch (error) {
      return new Response('Upstream fetch failed: ' + (error?.message || 'unknown'), { status: 502, headers: cors });
    }
  },
};
