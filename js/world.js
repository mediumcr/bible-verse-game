// Tile map: parsing, collision and persistent map edits.
import { TILE } from './util.js';

export const DEFAULT_LEGEND = {
  '.': 'grass', ',': 'sand', '=': 'path', '~': 'water', '#': 'stone_wall', 'T': 'palm',
  'r': 'rock', 'o': 'boulder', '*': 'thorn', 'A': 'tent', 'd': 'den_floor', 'a': 'arena_floor',
};
export const WALKABLE = new Set(['grass', 'sand', 'path', 'parted', 'den_floor', 'arena_floor']);
// Tiles that stop thrown projectiles (water does not).
const PROJECTILE_BLOCK = new Set(['stone_wall', 'palm', 'rock', 'boulder', 'thorn', 'tent']);
// Object tiles drawn over a ground underlay (in case their art has transparency).
const OBJECT_TILES = new Set(['palm', 'rock', 'boulder', 'thorn', 'tent', 'stone_wall']);
const GROUND = ['grass', 'sand', 'path', 'den_floor', 'arena_floor'];

export const TILE_SPRITE = { parted: 'tile_parted_sea' };

export class World {
  constructor(map) {
    this.map = map;
    this.w = map.width | 0;
    this.h = map.height | 0;
    this.legend = Object.assign({}, DEFAULT_LEGEND, map.legend || {});
    this.reset();
  }

  reset() {
    const { w, h } = this;
    this.tiles = new Array(w * h);
    const rows = this.map.rows || [];
    const unknown = new Set();
    for (let y = 0; y < h; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        let t = ch !== undefined ? this.legend[ch] : 'stone_wall';
        if (!t) { unknown.add(ch); t = 'stone_wall'; }
        this.tiles[y * w + x] = t;
      }
    }
    if (unknown.size) console.warn('[world] unknown map chars treated as walls:', [...unknown].join(''));
    this.edits = new Map();
    this.computeUnderlay();
  }

  computeUnderlay() {
    const { w, h } = this;
    this.under = new Array(w * h).fill(null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = this.tiles[y * w + x];
      if (!OBJECT_TILES.has(t)) continue;
      const counts = {};
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = this.get(x + dx, y + dy);
        if (GROUND.includes(n)) counts[n] = (counts[n] || 0) + 1;
      }
      let best = 'sand', bc = 0;
      for (const [k, v] of Object.entries(counts)) if (v > bc) { best = k; bc = v; }
      this.under[y * w + x] = best;
    }
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : 'stone_wall'; }
  underAt(x, y) { return this.inBounds(x, y) ? this.under[y * this.w + x] : null; }

  set(x, y, tile, record = true) {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.w + x] = tile;
    this.under[y * this.w + x] = null;
    if (record) this.edits.set(`${x},${y}`, tile);
  }

  applyEdits(list) {
    for (const e of list || []) if (e && this.inBounds(e.x, e.y)) this.set(e.x, e.y, e.tile);
  }
  editList() {
    return [...this.edits].map(([k, tile]) => { const [x, y] = k.split(',').map(Number); return { x, y, tile }; });
  }

  isWalkable(x, y) { return WALKABLE.has(this.get(x, y)); }
  blocksProjectile(x, y) { return !this.inBounds(x, y) || PROJECTILE_BLOCK.has(this.get(x, y)); }

  // Does a pixel rect overlap any solid tile? Optional predicate for extra restrictions.
  rectSolid(r, extraBlock) {
    const x0 = Math.floor(r.x / TILE), y0 = Math.floor(r.y / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE), y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!this.isWalkable(x, y)) return true;
      if (extraBlock && extraBlock(this.get(x, y), x, y)) return true;
    }
    return false;
  }
}
