/**
 * 网页端 HLS 中转（仅浏览器环境生效，Android 原生播放不使用）。
 *
 * 为什么需要：
 * - GitHub Pages 是 https 页面，浏览器禁止它加载 http:// 的 m3u8 / 分片（混合内容）。
 * - 很多 IPTV 源站没有返回 Access-Control-Allow-Origin，跨域请求会被浏览器拦截。
 * 这两类问题纯前端无法绕过，只能经过一个“HTTPS + 带 CORS 头”的中转服务。
 *
 * 中转地址格式（二选一）：
 *   1) 前缀：https://xxx.workers.dev/?url=      （自动追加 encodeURIComponent(目标地址)）
 *   2) 模板：https://xxx.workers.dev/p/{url}    （{url} 被替换为 encodeURIComponent(目标地址)）
 *
 * 配置来源（优先级从高到低）：
 *   - 浏览器 localStorage 'tvbox.hlsProxy'（直播页“网页端中转设置”里保存）
 *   - 构建变量 VITE_HLS_PROXY（可在 GitHub Actions 里设置）
 */
import { detectRuntimeEnv, RUNTIME_ENV } from './playbackStrategyDispatcher.js';

const STORAGE_KEY = 'tvbox.hlsProxy';
let memoryProxy = '';

export function getHlsProxyTemplate() {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : '';
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  if (memoryProxy && memoryProxy.trim()) return memoryProxy.trim();
  try {
    const fromEnv = import.meta.env?.VITE_HLS_PROXY;
    if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  } catch {}
  return '';
}

export function isValidHlsProxyTemplate(value) {
  const text = String(value || '').trim();
  if (!text) return true; // 允许清空
  // 页面是 https 时，中转本身必须是 https（本机调试允许 http://localhost）
  return /^https:\/\/[^\s]+$/i.test(text) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]*$/i.test(text);
}

export function setHlsProxyTemplate(value) {
  const text = String(value || '').trim();
  memoryProxy = text;
  try {
    if (text) localStorage.setItem(STORAGE_KEY, text);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  return text;
}

export function canUseHlsProxy() {
  return detectRuntimeEnv() === RUNTIME_ENV.WEB && Boolean(getHlsProxyTemplate());
}

export function isMixedContentUrl(url) {
  return typeof window !== 'undefined'
    && window.location?.protocol === 'https:'
    && /^http:\/\//i.test(String(url || ''));
}

export function buildHlsProxyUrl(url) {
  const template = getHlsProxyTemplate();
  const target = String(url || '');
  if (!template || !/^https?:\/\//i.test(target)) return null;

  // 同源请求（页面自身资源）与已经是中转地址的请求不再二次中转
  try {
    if (typeof window !== 'undefined' && new URL(target).host === window.location.host) return null;
  } catch {}
  const prefix = template.includes('{url}') ? template.split('{url}')[0] : template;
  if (prefix && target.startsWith(prefix)) return null;

  return template.includes('{url}')
    ? template.replace('{url}', encodeURIComponent(target))
    : template + encodeURIComponent(target);
}
