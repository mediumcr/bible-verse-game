// Shared constants & helpers.
export const TILE = 16;
export const VIEW_W = 256;
export const VIEW_H = 224;
export const HUD_H = 18;
export const DT = 1 / 60;

export const ABILITY_ORDER = ['sling', 'strength', 'staff', 'faith', 'fire', 'sun'];
export const COOLDOWNS = { sling: 0.35, strength: 0.6, staff: 1, faith: 6, fire: 1.5, sun: 8 };

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Deterministic PRNG (mulberry32).
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
