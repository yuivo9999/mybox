const loaded = new Map();

export function loadFont(font) {
  if (!font?.id || !font?.cssUrl || typeof document === 'undefined') return Promise.resolve(false);
  if (loaded.has(font.id)) return loaded.get(font.id);
  const promise = new Promise((resolve) => {
    const existing = document.querySelector(`link[data-mybox-font="${font.id}"]`);
    if (existing) { resolve(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font.cssUrl;
    link.dataset.myboxFont = font.id;
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
  loaded.set(font.id, promise);
  return promise;
}

export async function ensureFont(font) {
  const ok = await loadFont(font);
  if (ok && typeof document !== 'undefined' && document.fonts?.load) {
    try { await document.fonts.load(`16px "${font.family}"`); } catch {}
  }
  return ok;
}
