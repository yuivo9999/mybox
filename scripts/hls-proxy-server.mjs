#!/usr/bin/env node
/**
 * 本地 HLS/m3u8 HTTPS/HTTP 开发测试中转服务
 * 
 * 启动：node scripts/hls-proxy-server.mjs [端口，默认 8088]
 * 用法：http://localhost:8088/?url=目标m3u8地址
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const PORT = parseInt(process.env.PORT || process.argv[2] || '8088', 10);

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, User-Agent');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const target = reqUrl.searchParams.get('url');

  if (!target) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('HLS Proxy Server is running. Usage: /?url=<target_m3u8_url>');
    return;
  }

  let targetParsed;
  try {
    targetParsed = new URL(target);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid url parameter');
    return;
  }

  const client = targetParsed.protocol === 'https:' ? https : http;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: '*/*',
  };
  if (req.headers.range) headers.Range = req.headers.range;
  const referer = reqUrl.searchParams.get('referer');
  if (referer) headers.Referer = referer;

  const proxyReq = client.request(
    targetParsed,
    {
      method: req.method,
      headers,
    },
    proxyRes => {
      // Handle redirects
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const nextUrl = new URL(proxyRes.headers.location, target).toString();
        res.writeHead(302, { Location: `/?url=${encodeURIComponent(nextUrl)}` });
        res.end();
        return;
      }

      setCorsHeaders(res);
      const outHeaders = { ...proxyRes.headers };
      delete outHeaders['content-security-policy'];
      delete outHeaders['set-cookie'];
      res.writeHead(proxyRes.statusCode, outHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', err => {
    setCorsHeaders(res);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Upstream error: ${err.message}`);
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HLS CORS Proxy Server running at http://0.0.0.0:${PORT}/?url=`);
});
