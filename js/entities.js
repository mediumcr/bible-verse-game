// Hero, enemies (4 AI types), the Giant boss, projectiles, effects, pickups.
import { TILE, DIRS, aabb, clamp } from './util.js';
import { sound } from './sound.js';

// Move an entity along one axis in small sub-steps; returns true if blocked.
function stepAxis(ent, axis, d, blocked) {
  if (!d) return false;
  const n = Math.max(1, Math.ceil(Math.abs(d) / 0.5));
  const s = d / n;
  for (let i = 0; i < n; i++) {
    ent[axis] += s;
    if (blocked(ent.hitbox())) { ent[axis] -= s; return true; }
  }
  return false;
}

export function moveBody(ent, dx, dy, blocked) {
  // If already overlapping something (e.g. after a teleport) let it move freely to escape.
  if (blocked(ent.hitbox())) { ent.x += dx; ent.y += dy; return { bx: false, by: false }; }
  const bx = stepAxis(ent, 'x', dx, blocked);
  const by = stepAxis(ent, 'y', dy, blocked);
  return { bx, by };
}

// ---------------------------------------------------------------- Hero
export class Hero {
  constructor(tx, ty) {
    this.x = tx * TILE; this.y = ty * TILE;
    this.dir = 'down';
    this.hearts = 3; this.maxHearts = 3;
    this.invuln = 0; this.shield = 0;
    this.walkT = 0; this.moving = false;
    this.kb = null; this.dead = false; this.deathT = 0;
    this.actT = 0; // brief "using ability" pose
  }
  hitbox() { return { x: this.x + 3, y: this.y + 5, w: 10, h: 10 }; }
  center() { return { x: this.x + 8, y: this.y + 10 }; }
  tile() { const c = this.center(); return { x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE) }; }
  frontPoint() { const c = this.center(), d = DIRS[this.dir]; return { x: c.x + d.x * 11, y: c.y + d.y * 11 }; }
  frontTile() { const p = this.frontPoint(); return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }; }
  placeAt(tx, ty) { this.x = tx * TILE; this.y = ty * TILE; this.kb = null; }

  update(dt, g, inp) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.actT > 0) this.actT -= dt;
    const blocked = (r) => g.heroBlocked(r);
    if (this.kb) {
      moveBody(this, this.kb.x * dt, this.kb.y * dt, blocked);
      this.kb.t -= dt;
      if (this.kb.t <= 0) this.kb = null;
      return;
    }
    const ax = inp.axis();
    if (ax.face) this.dir = ax.face;
    this.moving = !!(ax.x || ax.y);
    if (!this.moving) { this.walkT = 0; return; }
    const speed = 72; // 4.5 tiles/s
    let vx = ax.x, vy = ax.y;
    if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
    const dx = vx * speed * dt, dy = vy * speed * dt;
    const { bx, by } = moveBody(this, dx, dy, blocked);
    // Corner assist: slide around tile corners when pushing straight into them.
    const step = speed * dt;
    if (bx && !ax.y) this.nudge('y', Math.sign(dx), step, blocked);
    if (by && !ax.x) this.nudge('x', Math.sign(dy), step, blocked);
    this.walkT += dt;
  }

  nudge(axis, pushSign, step, blocked) {
    const other = axis === 'y' ? 'x' : 'y';
    for (let off = 1; off <= 7; off++) {
      for (const s of [-1, 1]) {
        const hb = this.hitbox();
        hb[axis] += s * off;
        hb[other] += pushSign * 1;
        if (!blocked(hb)) { stepAxis(this, axis, s * Math.min(step, off), blocked); return; }
      }
    }
  }

  hurt(n, from, g) {
    if (this.dead || this.invuln > 0 || this.shield > 0 || g.godMode) return false;
    this.hearts = Math.max(0, this.hearts - n);
    this.invuln = 1;
    const c = this.center();
    let kx = c.x - from.x, ky = c.y - from.y;
    const len = Math.hypot(kx, ky) || 1;
    this.kb = { x: (kx / len) * 150, y: (ky / len) * 150, t: 0.14 };
    if (this.hearts <= 0) {
      this.dead = true; this.deathT = 1.0; this.kb = null;
      sound.sfx('hero_die');
    } else sound.sfx('hero_hurt');
    g.shake = Math.max(g.shake, 0.15);
    return true;
  }

  draw(r, cam, time) {
    if (this.invuln > 0 && !this.dead && Math.floor(this.invuln * 16) % 2 === 0) return;
    const frame = this.moving ? Math.floor(this.walkT * 8) % 2 : 0;
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.dead) {
      // spin through facings as a simple death animation
      const dirs = ['down', 'left', 'up', 'right'];
      r.draw(`hero_${dirs[Math.floor(time * 12) % 4]}_0`, x, y);
      return;
    }
    r.draw(`hero_${this.dir}_${frame}`, x, y);
    if (this.shield > 0) {
      const blink = this.shield < 0.8 && Math.floor(this.shield * 10) % 2 === 0;
      if (!blink) r.drawAnim('fx_shield', x, y, time, 8);
    }
  }
}

// ---------------------------------------------------------------- Enemies
export const ENEMY_DEFS = {
  serpent: { hp: 1, speed: 16, dmg: 1 },
  scorpion: { hp: 2, speed: 22, dmg: 1, charge: 96 },
  jackal: { hp: 2, speed: 26, dmg: 1, chase: 54, range: 5 },
  lion: { hp: 4, speed: 22, dmg: 2, chase: 44, range: 6 },
};
const SIDE_VIEW = new Set(['serpent', 'jackal', 'lion']);

export class Enemy {
  constructor(type, tx, ty, rng) {
    this.type = ENEMY_DEFS[type] ? type : 'serpent';
    this.def = ENEMY_DEFS[this.type];
    this.spawn = { x: tx, y: ty };
    this.rng = rng;
    this.reset();
  }
  reset() {
    this.x = this.spawn.x * TILE; this.y = this.spawn.y * TILE;
    this.hp = this.def.hp; this.alive = true;
    this.state = 'wander'; this.t = 0.5 + this.rng() * 1.5;
    this.dir = 'down'; this.vx = 0; this.vy = 0;
    this.hurtT = 0; this.kb = null; this.animT = this.rng(); this.faceLeft = false;
    this.chargeCd = 0;
  }
  hitbox() { return { x: this.x + 2, y: this.y + 2, w: 12, h: 12 }; }
  center() { return { x: this.x + 8, y: this.y + 8 }; }

  isPeaceful(g) { return this.type === 'lion' && g.hasAbility('faith'); }

  blockedFn(g) {
    const denOnly = this.type === 'lion';
    return (r) => g.world.rectSolid(r, denOnly ? (t) => t !== 'den_floor' : null) || g.solidObjectHit(r);
  }

  pickWander() {
    const r = this.rng();
    const dirs = ['up', 'down', 'left', 'right'];
    if (r < 0.25) { this.vx = 0; this.vy = 0; } else {
      const d = DIRS[dirs[Math.floor(this.rng() * 4)]];
      this.vx = d.x; this.vy = d.y;
    }
    this.t = 0.8 + this.rng() * 1.6;
  }

  update(dt, g) {
    if (!this.alive) return;
    this.animT += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.chargeCd > 0) this.chargeCd -= dt;
    const blocked = this.blockedFn(g);
    if (this.kb) {
      moveBody(this, this.kb.x * dt, this.kb.y * dt, blocked);
      this.kb.t -= dt; if (this.kb.t <= 0) this.kb = null;
      return;
    }
    const hc = g.hero.center(), ec = this.center();
    const dx = hc.x - ec.x, dy = hc.y - ec.y;
    const dist = Math.hypot(dx, dy);
    const heroAlive = !g.hero.dead;
    const peaceful = this.isPeaceful(g);
    let speed = this.def.speed;

    if (this.state === 'charge') {
      speed = this.def.charge;
      this.t -= dt;
      const res = moveBody(this, this.vx * speed * dt, this.vy * speed * dt, blocked);
      if (res.bx || res.by || this.t <= 0) { this.state = 'rest'; this.t = 0.7; this.vx = this.vy = 0; }
    } else if (this.state === 'rest') {
      this.t -= dt;
      if (this.t <= 0) { this.state = 'wander'; this.pickWander(); this.chargeCd = 0.8; }
    } else {
      let chasing = false;
      if (heroAlive && !peaceful && this.def.chase && dist < this.def.range * TILE) {
        chasing = true;
        speed = this.def.chase;
        const len = dist || 1;
        this.vx = dx / len; this.vy = dy / len;
        if (Math.abs(dx) < 2) this.vx = 0;
        if (Math.abs(dy) < 2) this.vy = 0;
      } else if (heroAlive && this.type === 'scorpion' && this.chargeCd <= 0) {
        const aligned = (Math.abs(dx) < 7 && Math.abs(dy) < 6 * TILE) || (Math.abs(dy) < 7 && Math.abs(dx) < 6 * TILE);
        if (aligned) {
          this.state = 'charge'; this.t = 1.2;
          if (Math.abs(dx) > Math.abs(dy)) { this.vx = Math.sign(dx); this.vy = 0; } else { this.vx = 0; this.vy = Math.sign(dy); }
        }
      }
      if (this.state === 'wander') {
        if (!chasing) {
          this.t -= dt;
          if (this.t <= 0) this.pickWander();
          if (peaceful) speed = 12;
        }
        const res = moveBody(this, this.vx * speed * dt, this.vy * speed * dt, blocked);
        if (!chasing && (res.bx || res.by)) this.pickWander();
      }
    }
    if (this.vx < 0) this.faceLeft = true; else if (this.vx > 0) this.faceLeft = false;

    // Contact damage
    if (heroAlive && !peaceful && aabb(this.hitbox(), g.hero.hitbox())) g.hero.hurt(this.def.dmg, ec, g);
  }

  // Returns true if damage was applied.
  damage(n, from, g) {
    if (!this.alive || this.hurtT > 0 || this.isPeaceful(g)) return false;
    this.hp -= n;
    this.hurtT = 0.3;
    const ec = this.center();
    let kx = ec.x - from.x, ky = ec.y - from.y; const len = Math.hypot(kx, ky) || 1;
    this.kb = { x: (kx / len) * 140, y: (ky / len) * 140, t: 0.12 };
    if (this.state === 'charge') { this.state = 'rest'; this.t = 0.5; }
    if (this.hp <= 0) {
      this.alive = false;
      sound.sfx('enemy_die');
      g.addEffect('fx_puff', this.x, this.y, 0.4);
      if (g.rng() < 0.2) g.pickups.push({ x: this.x, y: this.y, t: 0 });
    } else sound.sfx('hit_enemy');
    return true;
  }

  draw(r, cam, frozen) {
    if (!this.alive) return;
    if (this.hurtT > 0 && Math.floor(this.hurtT * 20) % 2 === 0) return;
    const flip = SIDE_VIEW.has(this.type) && this.faceLeft;
    const fps = this.state === 'charge' ? 10 : 4;
    r.drawAnim(`enemy_${this.type}`, this.x - cam.x, this.y - cam.y, this.animT, fps, flip ? { flipX: true } : {});
  }
}

// ---------------------------------------------------------------- Boss: the Giant
export class Boss {
  constructor(def) {
    this.spawn = { x: def.x, y: def.y };
    const a = def.arena || { x: def.x - 6, y: def.y - 4, w: 14, h: 10 };
    this.arena = { x: a.x * TILE, y: a.y * TILE, w: a.w * TILE, h: a.h * TILE };
    this.arenaTiles = a;
    this.maxHp = 16;
    this.reset();
  }
  reset() {
    this.x = this.spawn.x * TILE; this.y = this.spawn.y * TILE;
    this.hp = this.maxHp; this.state = 'idle'; this.t = 0; this.shield = true;
    this.hurtT = 0; this.animT = 0; this.dead = false; this.thrown = false; this.active = false;
  }
  hitbox() { return { x: this.x + 4, y: this.y + 4, w: 24, h: 27 }; }
  center() { return { x: this.x + 16, y: this.y + 18 }; }

  vulnerable(g) { return g.freezeT > 0 || !this.shield; }

  update(dt, g) {
    if (this.dead) return;
    this.animT += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    const hc = g.hero.center(), bc = this.center();
    const dx = hc.x - bc.x, dy = hc.y - bc.y;
    const fast = this.hp <= 8;
    switch (this.state) {
      case 'idle':
        this.shield = true;
        if (g.heroInArena()) { this.active = true; this.state = 'intro'; this.t = 1.5; }
        break;
      case 'intro': // name bar shows, Giant stays put for 1.5 s
        this.shield = true;
        this.t -= dt;
        if (this.t <= 0) { this.state = 'walk'; this.t = 1.6; }
        break;
      case 'walk': {
        this.shield = true;
        const len = Math.hypot(dx, dy) || 1;
        const sp = fast ? 36 : 28;
        if (len > 6) { this.x += (dx / len) * sp * dt; this.y += (dy / len) * sp * dt; }
        this.clampArena();
        this.t -= dt;
        if (this.t <= 0) { this.state = 'windup'; this.t = fast ? 0.45 : 0.6; }
        break;
      }
      case 'windup':
        this.shield = true;
        this.t -= dt;
        if (this.t <= 0) {
          sound.sfx('boss_stomp');
          g.shockwaves.push({ x: bc.x, y: bc.y + 8, r: 10, maxR: 64, hit: false });
          g.shake = 0.35;
          this.state = 'down'; this.t = 2.5; this.shield = false;
        }
        break;
      case 'down':
        this.shield = false;
        this.t -= dt;
        if (this.t <= 0) { this.state = 'throw'; this.t = 0.7; this.thrown = false; this.shield = true; }
        break;
      case 'throw':
        this.shield = true;
        if (!this.thrown) {
          this.thrown = true;
          let vx = 0, vy = 0;
          if (Math.abs(dx) > Math.abs(dy)) vx = Math.sign(dx); else vy = Math.sign(dy) || 1;
          g.projectiles.push(new Projectile('spear', bc.x + vx * 14, bc.y + vy * 14, vx * 150, vy * 150, 14 * TILE, 'boss'));
          sound.sfx('boss_spear');
        }
        this.t -= dt;
        if (this.t <= 0) { this.state = 'walk'; this.t = (fast ? 1.4 : 2.0) + g.rng() * 0.8; }
        break;
    }
    // no contact damage during the stomp recovery window
    if (this.state !== 'down' && !g.hero.dead && aabb(this.hitbox(), g.hero.hitbox())) g.hero.hurt(1, bc, g);
  }

  clampArena() {
    const a = this.arena;
    this.x = clamp(this.x, a.x, a.x + a.w - 32);
    this.y = clamp(this.y, a.y, a.y + a.h - 32);
  }

  // Returns 'hit' | 'blocked' | 'none'
  damage(n, g) {
    if (this.dead) return 'none';
    if (!this.vulnerable(g)) { sound.sfx('error'); return 'blocked'; }
    if (this.hurtT > 0) return 'none';
    this.hp = Math.max(0, this.hp - n);
    this.hurtT = 0.3;
    if (this.hp <= 0) {
      this.dead = true;
      sound.sfx('boss_die');
      g.onBossDefeated();
    } else sound.sfx('boss_hurt');
    return 'hit';
  }

  draw(r, cam, g) {
    if (this.dead) return;
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.hurtT > 0 && Math.floor(this.hurtT * 20) % 2 === 0) {
      r.draw('boss_giant_hurt', x, y, { w: 32, h: 32 });
      return;
    }
    let name;
    if (this.hurtT > 0) name = 'boss_giant_hurt';
    else if (this.state === 'windup' || this.state === 'down') name = 'boss_giant_stomp';
    else name = r.resolve('boss_giant', this.state === 'walk' ? this.animT : 0, 4) || 'boss_giant_0';
    r.draw(name, x, y, { w: 32, h: 32 });
  }
}

// ---------------------------------------------------------------- Projectiles
export class Projectile {
  constructor(kind, x, y, vx, vy, maxDist, owner) {
    Object.assign(this, { kind, x, y, vx, vy, maxDist, owner });
    this.dist = 0; this.dead = false; this.bounced = false; this.fade = 0;
  }
  hitbox() {
    if (this.kind === 'spear') return this.vx ? { x: this.x - 7, y: this.y - 2, w: 14, h: 4 } : { x: this.x - 2, y: this.y - 7, w: 4, h: 14 };
    return { x: this.x - 3, y: this.y - 3, w: 6, h: 6 };
  }
  draw(r, cam) {
    if (this.kind === 'spear') {
      const rot = this.vx > 0 ? 0 : this.vx < 0 ? 2 : this.vy > 0 ? 1 : 3;
      r.draw('fx_spear', this.x - 8 - cam.x, this.y - 8 - cam.y, { rot });
    } else {
      r.draw('fx_sling_stone', this.x - 8 - cam.x, this.y - 8 - cam.y, this.bounced ? { alpha: Math.max(0, this.fade / 0.25) } : {});
    }
  }
}
