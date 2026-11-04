// Asset & data loading. All paths are relative (GitHub Pages friendly).
export async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`);
  return r.json();
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image ' + url));
    img.src = url;
  });
}

// Only allow simple relative directories for ?data=
export function sanitizeDataDir(v) {
  if (!v) return null;
  if (!/^[A-Za-z0-9_\-/.]+$/.test(v) || v.includes('..') || v.startsWith('/') || v.includes('//')) return null;
  return v.replace(/\/+$/, '');
}

export async function loadAll(dataDir = 'data') {
  const spriteDir = 'assets/sprites/';
  const sheetP = loadJSON(spriteDir + 'spritesheet.json').catch((e) => {
    console.warn('[loader] spritesheet.json missing; using placeholders', e.message);
    return { tileSize: 16, image: null, frames: {} };
  });
  const [sheet, map, verses, i18n] = await Promise.all([
    sheetP,
    loadJSON(`${dataDir}/maps/wilderness.json`),
    loadJSON(`${dataDir}/verses.json`),
    loadJSON(`${dataDir}/i18n.json`),
  ]);
  let img = null;
  if (sheet.image) {
    try { img = await loadImage(spriteDir + sheet.image); } catch (e) { console.warn('[loader]', e.message); }
  }
  return { sheet, img, map, verses, i18n };
}
