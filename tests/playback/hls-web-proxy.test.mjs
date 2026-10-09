import assert from 'node:assert/strict';
import {
  getHlsProxyTemplate,
  isValidHlsProxyTemplate,
  setHlsProxyTemplate,
  canUseHlsProxy,
  isMixedContentUrl,
  buildHlsProxyUrl,
} from '../../src/playback/hlsWebProxy.js';

console.log('Testing hlsWebProxy...');

// Test 1: validation
assert.equal(isValidHlsProxyTemplate(''), true);
assert.equal(isValidHlsProxyTemplate('https://worker.dev/?url='), true);
assert.equal(isValidHlsProxyTemplate('http://localhost:8088/?url='), true);
assert.equal(isValidHlsProxyTemplate('ftp://invalid'), false);
assert.equal(isValidHlsProxyTemplate('http://unsafe.com/?url='), false);

// Test 2: set and get
setHlsProxyTemplate('https://my-proxy.workers.dev/?url=');
assert.equal(getHlsProxyTemplate(), 'https://my-proxy.workers.dev/?url=');

// Test 3: build url
const target = 'http://example.com/live.m3u8';
const built = buildHlsProxyUrl(target);
assert.equal(built, 'https://my-proxy.workers.dev/?url=http%3A%2F%2Fexample.com%2Flive.m3u8');

// Test 4: template replacement with {url}
setHlsProxyTemplate('https://my-proxy.workers.dev/p/{url}');
const builtTmpl = buildHlsProxyUrl(target);
assert.equal(builtTmpl, 'https://my-proxy.workers.dev/p/http%3A%2F%2Fexample.com%2Flive.m3u8');

// Test 5: already proxied url should not be double-proxied
const alreadyProxied = 'https://my-proxy.workers.dev/p/something';
assert.equal(buildHlsProxyUrl(alreadyProxied), null);

// Cleanup
setHlsProxyTemplate('');

console.log('hlsWebProxy tests passed.');
