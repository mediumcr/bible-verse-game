// The 6 abilities (GDD section 2).
import { TILE, DIRS, COOLDOWNS } from './util.js';
import { Projectile } from './entities.js';
import { sound } from './sound.js';

function areaRect(tx, ty, w = 1, h = 1) { return { x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE }; }

const HANDLERS = {
  sling(g) {
    const h = g.hero, d = DIRS[h.dir], c = h.center();
    g.projectiles.push(new Projectile('stone', c.x + d.x * 6, c.y - 2 + d.y * 6, d.x * 200, d.y * 200, 7 * TILE, 'hero'));
    sound.sfx('sling');
    return true;
  },

  strength(g) {
    const h = g.hero, ft = h.frontTile(), fp = h.frontPoint();
    sound.sfx('smash');
    g.addEffect('fx_smash', ft.x * TILE, ft.y * TILE, 0.3);
    g.shake = Math.max(g.shake, 0.12);
    let edited = false;
    if (g.world.get(ft.x, ft.y) === 'boulder') {
      g.world.set(ft.x, ft.y, 'sand');
      g.addEffect('fx_puff', ft.x * TILE, ft.y * TILE, 0.4);
      edited = true;
    }
    // melee reach: 16x16 in front, extended 6px further in the facing direction
    const d = DIRS[h.dir];
    const hit = { x: fp.x - 8, y: fp.y - 8, w: 16, h: 16 };
    if (d.x > 0) hit.w += 6; else if (d.x < 0) { hit.x -= 6; hit.w += 6; }
    if (d.y > 0) hit.h += 6; else if (d.y < 0) { hit.y -= 6; hit.h += 6; }
    g.damageArea(hit, 3, h.center());
    if (edited) g.autosave();
    return true;
  },

  staff(g) {
    const h = g.hero, d = DIRS[h.dir];
    let { x, y } = h.frontTile();
    const perp = d.x ? { x: 0, y: 1 } : { x: 1, y: 0 };
    let converted = 0;
    for (let i = 0; i < 10; i++) {
      const t = g.world.get(x, y);
      if (t !== 'water' && t !== 'parted') break;
      if (t === 'water') { g.world.set(x, y, 'parted'); converted++; }
      for (const s of [-1, 1]) {
        const sx = x + perp.x * s, sy = y + perp.y * s;
        if (g.world.get(sx, sy) === 'water') { g.world.set(sx, sy, 'parted'); converted++; }
      }
      x += d.x; y += d.y;
    }
    h.actT = 0.4;
    if (converted) {
      sound.sfx('staff_part');
      g.shake = Math.max(g.shake, 0.25);
      g.flash = 0.25;
      g.autosave();
      return true;
    }
    sound.sfx('error');
    return 'fail';
  },

  faith(g) {
    g.hero.shield = 3;
    sound.sfx('shield');
    return true;
  },

  fire(g) {
    const h = g.hero, d = DIRS[h.dir], ht = h.tile();
    const cx = ht.x + d.x * 3, cy = ht.y + d.y * 3;
    let edited = false;
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      g.addEffect('fx_fire_elijah', xx * TILE, yy * TILE, 0.7, 8);
      if (g.world.get(xx, yy) === 'thorn') { g.world.set(xx, yy, 'sand'); edited = true; }
    }
    sound.sfx('fire');
    g.flash = 0.15;
    g.damageArea(areaRect(cx - 1, cy - 1, 3, 3), 2, { x: cx * TILE + 8, y: cy * TILE + 8 });
    if (edited) g.autosave();
    return true;
  },

  sun(g) {
    g.freezeT = 3;
    sound.sfx('sun');
    return true;
  },
};

export function useAbility(g) {
  const id = g.progress.equipped;
  if (!id || !HANDLERS[id] || !g.hasAbility(id)) { sound.sfx('error'); return false; }
  if ((g.cooldowns[id] || 0) > 0) return false;
  const res = HANDLERS[id](g);
  // a failed staff cast only gets a short cooldown
  g.cooldowns[id] = res === 'fail' ? 0.3 : COOLDOWNS[id];
  g.cooldownMax[id] = g.cooldowns[id];
  g.hero.actT = Math.max(g.hero.actT, 0.15);
  return res === true;
}
