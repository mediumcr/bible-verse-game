// Game state machine: scenes, world simulation, chests, saves, rendering orchestration.
import { TILE, VIEW_W, VIEW_H, HUD_H, ABILITY_ORDER, clamp, aabb, makeRng } from './util.js';
import { World, TILE_SPRITE } from './world.js';
import { Hero, Enemy, Boss } from './entities.js';
import { useAbility } from './abilities.js';
import * as UI from './ui.js';
import { t, getLang, setLang } from './i18n.js';
import { drawText } from './font.js';
import { sound } from './sound.js';

const FIXED_VERSE_TOTAL = 10;

export class Game {
  constructor({ data, renderer, input, store, flags }) {
    this.data = data;
    this.renderer = renderer;
    this.ctx = renderer.ctx;
    this.input = input;
    this.store = store;
    this.flags = flags;
    this.map = data.map;
    this.versesData = data.verses || { verses: [] };
    this.verseById = new Map();
    for (const v of this.versesData.verses || []) this.verseById.set(v.id, v);
    if (this.versesData.victoryVerse) this.verseById.set(this.versesData.victoryVerse.id, this.versesData.victoryVerse);
    this.world = new World(this.map);
    this.rng = makeRng(flags.test ? 12345 : (Date.now() & 0xffffffff));
    this.time = 0;
    this.scene = 'title';
    this.overlays = [];
    this.toasts = [];
    this.cam = { x: 0, y: 0 };
    this.shake = 0; this.flash = 0; this.freezeT = 0;
    this.started = false;
    this.godMode = false;
    this.title = new UI.TitleScreen(this);
    this.progress = this.freshProgress();
    this.hero = new Hero(this.map.playerStart ? this.map.playerStart.x : 1, this.map.playerStart ? this.map.playerStart.y : 1);
    this.enemies = []; this.boss = null; this.projectiles = []; this.effects = []; this.pickups = []; this.shockwaves = [];
    this.cooldowns = {}; this.cooldownMax = {};
    this.chests = []; this.npcs = []; this.signs = [];
    this.talked = new Set();
    this.tileCache = new Map();
    this.fps = 0;
    sound.music('title');
  }

  // ------------------------------------------------------------ progress / save
  freshProgress() {
    const ps = this.map.playerStart || { x: 1, y: 1 };
    const camp = (this.map.checkpoints || [])[0];
    return {
      abilities: [], equipped: null, verses: [], openedChests: [],
      checkpoint: camp ? { id: camp.id, x: camp.x, y: camp.y } : { id: 'start', x: ps.x, y: ps.y },
      bossDefeated: false,
    };
  }
  hasSave() { return !!this.store.load(); }
  hasAbility(id) { return this.progress.abilities.includes(id); }
  verseTotal() { return (this.versesData.verses || []).length || FIXED_VERSE_TOTAL; }

  saveObject() {
    const p = this.progress;
    return {
      lang: getLang(), muted: sound.isMuted(),
      hearts: this.hero.hearts, maxHearts: this.hero.maxHearts,
      abilities: [...p.abilities], equipped: p.equipped, verses: [...p.verses],
      openedChests: [...p.openedChests], mapEdits: this.world.editList(),
      checkpoint: p.checkpoint, bossDefeated: p.bossDefeated,
      talkedToElder: this.talked.has('elder'),
    };
  }
  autosave() { if (this.started) this.store.write(this.saveObject()); }

  // ------------------------------------------------------------ scene control
  setupLevel(save) {
    this.world.reset();
    if (save) this.world.applyEdits(save.mapEdits);
    const p = this.progress;
    this.chests = (this.map.chests || []).map((c) => ({ ...c, opened: p.openedChests.includes(c.id) }));
    this.npcs = (this.map.npcs || []).map((n) => ({ ...n }));
    this.signs = (this.map.signs || []).map((s) => ({ ...s }));
    this.enemies = (this.map.enemies || []).map((e) => new Enemy(e.type, e.x, e.y, this.rng));
    this.boss = this.map.boss && !p.bossDefeated ? new Boss(this.map.boss) : null;
    this.projectiles = []; this.effects = []; this.pickups = []; this.shockwaves = [];
    this.cooldowns = {}; this.cooldownMax = {};
    this.freezeT = 0; this.shake = 0; this.flash = 0;
    this.victoryT = 0;
    const cp = p.checkpoint;
    this.hero = new Hero(cp.x, cp.y);
    this.overlays = []; this.toasts = [];
    this.started = true;
    this.scene = 'play';
    this.updateCamera(true);
    this.updateMusic();
  }

  newGame() {
    this.progress = this.freshProgress();
    this.talked = new Set();
    this.setupLevel(null);
    this.hero.hearts = this.hero.maxHearts = 3;
    this.autosave();
  }

  continueGame() {
    const s = this.store.load();
    if (!s) { this.newGame(); return; }
    this.progress = {
      abilities: ABILITY_ORDER.filter((a) => s.abilities.includes(a)),
      equipped: s.equipped && s.abilities.includes(s.equipped) ? s.equipped : (s.abilities[0] || null),
      verses: s.verses, openedChests: s.openedChests,
      checkpoint: s.checkpoint || this.freshProgress().checkpoint,
      bossDefeated: s.bossDefeated,
    };
    if (this.progress.checkpoint && !this.world.isWalkable(this.progress.checkpoint.x, this.progress.checkpoint.y)) {
      // keep it, spawn logic will escape walls via findSpawnNear
      const sp = this.findSpawnNear(this.progress.checkpoint.x, this.progress.checkpoint.y);
      this.progress.checkpoint = { ...this.progress.checkpoint, x: sp.x, y: sp.y };
    }
    this.talked = new Set(s.talkedToElder ? ['elder'] : []);
    this.setupLevel(s);
    this.hero.maxHearts = s.maxHearts;
    this.hero.hearts = s.hearts > 0 ? Math.min(s.hearts, s.maxHearts) : s.maxHearts;
  }

  goTitle() {
    this.scene = 'title';
    this.overlays = []; this.toasts = [];
    this.title.reset();
    this.input.clearAll();
    sound.music('title');
  }

  saveAndQuit() {
    this.autosave();
    this.goTitle();
  }

  startVictory() {
    if (!this.started) this.newGame();
    this.overlays = [];
    this.scene = 'victory';
    this.victory = new UI.VictoryScreen(this);
    sound.music('victory');
  }

  setScene(name) {
    switch (name) {
      case 'title': this.goTitle(); break;
      case 'play':
        if (!this.started) this.newGame();
        this.overlays = []; this.scene = 'play'; this.updateMusic(); break;
      case 'pause': if (!this.started) this.newGame(); this.scene = 'play'; this.pushOverlay(new UI.PauseOverlay(this)); break;
      case 'journal': if (!this.started) this.newGame(); this.scene = 'play'; this.pushOverlay(new UI.JournalOverlay(this)); break;
      case 'gameover': if (!this.started) this.newGame(); this.overlays = []; this.scene = 'gameover'; this.hero.hearts = 0; sound.music(null); break;
      case 'victory': this.startVictory(); break;
      default: console.warn('[game] unknown scene', name);
    }
  }

  pushOverlay(o) { this.overlays.push(o); }
  closeOverlay(o) { this.overlays = this.overlays.filter((x) => x !== o); }
  topOverlay() { return this.overlays[this.overlays.length - 1] || null; }

  toast(key, vars, dur = 3.5) {
    // avoid duplicate consecutive toasts
    const last = this.toasts[this.toasts.length - 1];
    if (last && last.key === key && JSON.stringify(last.vars) === JSON.stringify(vars)) return;
    this.toasts.push({ key, vars, t: 0, dur });
    if (this.toasts.length > 3) this.toasts.splice(1, 1);
  }

  toggleLang() {
    setLang(getLang() === 'en' ? 'es' : 'en');
    for (const o of this.overlays) if (o.relayout) o.relayout();
    if (this.victory) this.victory.relayout();
    if (this.store.load()) this.store.patch({ lang: getLang() });
  }
  toggleMute() {
    sound.setMuted(!sound.isMuted());
    if (this.store.load()) this.store.patch({ muted: sound.isMuted() });
  }

  // ------------------------------------------------------------ helpers
  heroInArena() {
    if (!this.boss) return false;
    const a = this.boss.arena, c = this.hero.center();
    return c.x >= a.x && c.x < a.x + a.w && c.y >= a.y && c.y < a.y + a.h;
  }
  objectRects() {
    const out = [];
    for (const c of this.chests) out.push({ x: c.x * TILE, y: c.y * TILE, w: TILE, h: TILE });
    for (const n of this.npcs) out.push({ x: n.x * TILE + 1, y: n.y * TILE + 2, w: 14, h: 14 });
    for (const s of this.signs) out.push({ x: s.x * TILE + 2, y: s.y * TILE + 4, w: 12, h: 12 });
    return out;
  }
  solidObjectHit(r) {
    for (const o of this._objRects || this.objectRects()) if (aabb(r, o)) return true;
    return false;
  }
  heroBlocked(r) { return this.world.rectSolid(r) || this.solidObjectHit(r); }

  occupied(x, y) {
    return this.chests.some((c) => c.x === x && c.y === y) || this.npcs.some((n) => n.x === x && n.y === y) ||
      this.signs.some((s) => s.x === x && s.y === y);
  }
  findSpawnNear(x, y) {
    const order = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
    if (this.world.isWalkable(x, y) && !this.occupied(x, y)) return { x, y };
    for (let r = 1; r <= 4; r++) {
      for (const [dx, dy] of order) {
        const nx = x + dx * r, ny = y + dy * r;
        if (this.world.isWalkable(nx, ny) && !this.occupied(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  addEffect(name, x, y, dur, fps = 6) { this.effects.push({ name, x, y, t: 0, dur, fps }); }

  damageArea(rect, n, from) {
    let hit = false;
    for (const e of this.enemies) if (e.alive && aabb(rect, e.hitbox())) hit = e.damage(n, from, this) || hit;
    if (this.boss && !this.boss.dead && aabb(rect, this.boss.hitbox())) hit = this.boss.damage(n, this) === 'hit' || hit;
    return hit;
  }

  facingInteractable() {
    const h = this.hero, ft = h.frontTile(), ht = h.tile();
    const chest = this.chests.find((c) => !c.opened && c.x === ft.x && c.y === ft.y);
    if (chest) return { kind: 'chest', obj: chest };
    const npc = this.npcs.find((n) => n.x === ft.x && n.y === ft.y);
    if (npc) return { kind: 'npc', obj: npc };
    const sign = this.signs.find((s) => (s.x === ft.x && s.y === ft.y) || (s.x === ht.x && s.y === ht.y));
    if (sign) return { kind: 'sign', obj: sign };
    return null;
  }

  interact() {
    const it = this.facingInteractable();
    if (!it) return false;
    if (it.kind === 'chest') this.openChest(it.obj);
    else if (it.kind === 'npc') this.talkTo(it.obj);
    else if (it.kind === 'sign') { sound.sfx('dialog_blip'); this.pushOverlay(new UI.DialogOverlay(this, [it.obj.text])); }
    return true;
  }

  talkTo(npc) {
    const id = npc.id || 'npc';
    let lines;
    if (this.talked.has(id)) {
      const after = npc.dialogAfter || `dialog.${id}_after`;
      lines = t(after) === after ? [(npc.dialog || []).slice(-1)[0] || after] : [after];
    } else lines = npc.dialog && npc.dialog.length ? npc.dialog : [`dialog.${id}_1`];
    // face the hero
    sound.sfx('dialog_blip');
    this.pushOverlay(new UI.DialogOverlay(this, lines, () => {
      if (!this.talked.has(id)) { this.talked.add(id); this.autosave(); }
    }));
  }

  openChestById(id) {
    if (!this.started) this.newGame();
    const c = this.chests.find((x) => x.id === id);
    if (!c) { console.warn('[game] no chest', id); return false; }
    return this.openChest(c);
  }

  openChest(c) {
    if (c.opened) return false;
    c.opened = true;
    const p = this.progress;
    if (!p.openedChests.includes(c.id)) p.openedChests.push(c.id);
    sound.sfx('chest_open');
    const what = c.contains || {};
    const rx = c.x * TILE, ry = c.y * TILE - 10;
    if (what.type === 'verse') {
      const v = this.verseById.get(what.verseId);
      if (!v) console.warn('[game] chest refers to unknown verse', what.verseId);
      if (!p.verses.includes(what.verseId)) p.verses.push(what.verseId);
      this.addEffect(v && v.rarity === 'golden' ? 'item_verse_scroll_gold' : 'item_verse_scroll', rx, ry, 1.0, 0);
      sound.sfx('verse_get');
      this.pushOverlay(new UI.VerseOverlay(this, what.verseId, { fromChest: true }));
    } else if (what.type === 'ability') {
      const id = what.ability;
      if (!p.abilities.includes(id)) p.abilities.push(id);
      p.abilities.sort((a, b) => ABILITY_ORDER.indexOf(a) - ABILITY_ORDER.indexOf(b));
      p.equipped = id;
      const sp = this.findSpawnNear(c.x, c.y + 1);
      this.setCheckpoint(c.id, sp.x, sp.y, false);
      this.hero.hearts = this.hero.maxHearts;
      this.addEffect(`icon_${id}`, rx, ry, 1.0, 0);
      sound.sfx('ability_get');
      this.pushOverlay(new UI.AbilityOverlay(this, id, () => this.toast(`tip.${id}`, null, 6)));
    } else if (what.type === 'heart') {
      this.hero.maxHearts = Math.min(6, this.hero.maxHearts + 1);
      this.hero.hearts = this.hero.maxHearts;
      this.addEffect('item_heart', rx, ry, 1.0, 0);
      sound.sfx('heart_get');
      this.pushOverlay(new UI.DialogOverlay(this, ['ui.got_heart']));
    }
    this.autosave();
    return true;
  }

  give(id) {
    if (!this.started) this.newGame();
    const ids = id === 'all' ? ABILITY_ORDER : [id];
    for (const a of ids) {
      if (!ABILITY_ORDER.includes(a)) { console.warn('[game] unknown ability', a); continue; }
      if (!this.progress.abilities.includes(a)) this.progress.abilities.push(a);
      this.progress.equipped = a;
    }
    this.progress.abilities.sort((a, b) => ABILITY_ORDER.indexOf(a) - ABILITY_ORDER.indexOf(b));
  }

  teleport(tx, ty) {
    if (!this.started) this.newGame();
    this.hero.placeAt(tx, ty);
    this.updateCamera(true);
  }

  cycleAbility() {
    const p = this.progress;
    if (!p.abilities.length) { sound.sfx('error'); return; }
    const i = p.abilities.indexOf(p.equipped);
    p.equipped = p.abilities[(i + 1) % p.abilities.length];
    sound.sfx('menu_move');
    this.toasts = this.toasts.filter((x) => x.key !== 'ui.equipped');
    this.toast('ui.equipped', { name: t(`ability.${p.equipped}.name`) }, 1.6);
  }

  onBossDefeated() {
    this.progress.bossDefeated = true;
    const b = this.boss;
    for (let i = 0; i < 6; i++) this.addEffect('fx_puff', b.x + (i % 3) * 10, b.y + Math.floor(i / 3) * 14, 0.6 + i * 0.1);
    this.shake = 0.6;
    this.victoryT = 2.5;
    this.projectiles = this.projectiles.filter((p) => p.owner !== 'boss');
    this.shockwaves = [];
    this.autosave();
  }

  respawn() {
    const cp = this.progress.checkpoint;
    const mh = this.hero.maxHearts || 3;
    this.hero = new Hero(cp.x, cp.y);
    this.hero.maxHearts = mh;
    this.hero.hearts = this.hero.maxHearts;
    this.projectiles = []; this.shockwaves = []; this.freezeT = 0;
    for (const e of this.enemies) if (e.alive) e.reset();
    if (this.boss && !this.boss.dead) this.boss.reset();
    this.scene = 'play';
    this.updateCamera(true);
    this.updateMusic();
    this.autosave();
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const inp = this.input;
    this.time += dt;
    if (inp.pressed('lang')) this.toggleLang();
    if (inp.pressed('mute')) this.toggleMute();

    const top = this.topOverlay();
    if (top) { top.update(dt, inp); return; }

    // toasts only tick while visible (no overlay on top)
    if (this.toasts.length) {
      const tt = this.toasts[0]; tt.t += dt;
      if (tt.t >= tt.dur) this.toasts.shift();
    }

    if (this.scene === 'title') { this.title.update(dt, inp); return; }
    if (this.scene === 'victory') { this.victory.update(dt, inp); return; }
    if (this.scene === 'gameover') {
      if (inp.pressed('interact') || inp.pressed('action')) { sound.sfx('menu_select'); this.respawn(); }
      return;
    }
    if (this.scene === 'play') this.updatePlay(dt, inp);
  }

  updatePlay(dt, inp) {
    const h = this.hero;
    this._objRects = this.objectRects();
    if (this.shake > 0) this.shake -= dt;
    if (this.flash > 0) this.flash -= dt;
    for (const k of Object.keys(this.cooldowns)) if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    const frozen = this.freezeT > 0;
    if (frozen) this.freezeT = Math.max(0, this.freezeT - dt);

    if (h.dead) {
      h.deathT -= dt;
      if (h.deathT <= 0) { this.scene = 'gameover'; sound.music(null); }
      this.tickEffects(dt);
      return;
    }

    if (inp.pressed('pause')) { sound.sfx('menu_select'); this.pushOverlay(new UI.PauseOverlay(this)); return; }
    if (inp.pressed('interact')) this.interact();
    if (this.overlays.length) return;
    if (inp.pressed('cycle')) this.cycleAbility();
    if (inp.pressed('action')) useAbility(this);

    const prevX = h.x, prevY = h.y;
    const wasIn = this.heroInArena();
    h.update(dt, this, inp);
    if (this.boss && !this.boss.dead && !this.hasAbility('sun') && !wasIn && this.heroInArena()) {
      // the arena stays closed until the hero owns Joshua's Sun
      h.x = prevX; h.y = prevY; h.kb = null;
      if (!this.toasts.length || this.toasts[0].key !== 'sign.arena_locked') {
        sound.sfx('error');
        // urgent: show right away, ahead of any queued tips
        this.toasts = [{ key: 'sign.arena_locked', vars: null, t: 0, dur: 4 }, ...this.toasts.filter((x) => x.key !== 'sign.arena_locked')];
      }
    }

    if (!frozen) for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.x - h.x) > 22 * TILE || Math.abs(e.y - h.y) > 18 * TILE) continue;
      e.update(dt, this);
    }
    if (this.boss && !this.boss.dead && !frozen) this.boss.update(dt, this);

    this.updateProjectiles(dt, frozen);
    this.updateShockwaves(dt, frozen);
    this.tickEffects(dt);
    this.updatePickups(dt);
    this.checkCheckpoints();

    if (this.victoryT > 0) {
      this.victoryT -= dt;
      if (this.victoryT <= 0) { this.startVictory(); return; }
    }
    this.updateCamera(false);
    this.updateMusic();
  }

  updateProjectiles(dt, frozen) {
    const h = this.hero;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.bounced) {
        p.fade -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.fade <= 0) p.dead = true;
        continue;
      }
      if (frozen && p.owner === 'boss') continue;
      const dx = p.vx * dt, dy = p.vy * dt;
      p.x += dx; p.y += dy; p.dist += Math.hypot(dx, dy);
      if (p.dist >= p.maxDist) { p.dead = true; continue; }
      if (this.world.blocksProjectile(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) {
        p.dead = true;
        if (p.kind === 'stone') this.addEffect('fx_puff', p.x - 8, p.y - 8, 0.2);
        continue;
      }
      const hb = p.hitbox();
      if (p.owner === 'hero') {
        for (const e of this.enemies) {
          if (!e.alive || e.isPeaceful(this) || !aabb(hb, e.hitbox())) continue;
          if (e.damage(1, { x: p.x - p.vx, y: p.y - p.vy }, this)) { p.dead = true; break; }
        }
        if (!p.dead && this.boss && !this.boss.dead && aabb(hb, this.boss.hitbox())) {
          const res = this.boss.damage(1, this);
          if (res === 'blocked') { p.bounced = true; p.vx *= -0.5; p.vy *= -0.5; p.fade = 0.25; }
          else p.dead = true;
        }
      } else if (aabb(hb, h.hitbox()) && !h.dead) {
        if (h.hurt(1, { x: p.x - p.vx, y: p.y - p.vy }, this) || h.shield > 0) p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updateShockwaves(dt, frozen) {
    const hc = this.hero.center();
    for (const s of this.shockwaves) {
      if (frozen) continue; // frozen rings neither grow nor hurt
      s.r += 120 * dt;
      // the ring is drawn as an ellipse (vertical radius * 0.7); use the same shape for damage
      const d = Math.hypot(hc.x - s.x, (hc.y - s.y) / 0.7);
      if (!s.hit && Math.abs(d - s.r) < 6) {
        if (this.hero.hurt(1, s, this)) s.hit = true;
      }
    }
    this.shockwaves = this.shockwaves.filter((s) => s.r < s.maxR);
  }

  tickEffects(dt) {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
  }

  updatePickups(dt) {
    const hb = this.hero.hitbox();
    for (const p of this.pickups) {
      p.t += dt;
      if (aabb(hb, { x: p.x + 3, y: p.y + 3, w: 10, h: 10 })) {
        p.dead = true;
        if (this.hero.hearts < this.hero.maxHearts) this.hero.hearts++;
        sound.sfx('heart_get');
      }
      if (p.t > 10) p.dead = true;
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  // camp/start = 0, then cp_<ability> / c_<ability> = 1..6 in ability order; unknown ids = -1 (always allowed)
  cpRank(id) {
    if (!id || id === 'camp' || id === 'start') return 0;
    const m = /^(?:cp_|c_)(\w+)$/.exec(id);
    if (m) { const i = ABILITY_ORDER.indexOf(m[1]); if (i >= 0) return i + 1; }
    return -1;
  }

  // Returns true if the checkpoint changed. Never moves backwards; same tile never re-triggers.
  setCheckpoint(id, x, y, announce = true) {
    const cur = this.progress.checkpoint;
    if (cur && cur.x === x && cur.y === y) return false;
    const r = this.cpRank(id), cr = cur ? this.cpRank(cur.id) : 0;
    if (r >= 0 && cr >= 0 && r < cr) return false;
    this.progress.checkpoint = { id, x, y };
    if (announce && r !== cr) { sound.sfx('checkpoint'); this.toast('ui.checkpoint'); }
    this.autosave();
    return true;
  }

  checkCheckpoints() {
    const ht = this.hero.tile();
    for (const cp of this.map.checkpoints || []) {
      if (cp.x === ht.x && cp.y === ht.y) this.setCheckpoint(cp.id, cp.x, cp.y, true);
    }
  }

  updateMusic() {
    if (this.scene !== 'play') return;
    let track = 'overworld';
    if (this.boss && !this.boss.dead && this.heroInArena()) track = 'boss';
    else {
      const ht = this.hero.tile();
      if (this.world.get(ht.x, ht.y) === 'den_floor') track = 'den';
    }
    sound.music(track);
  }

  updateCamera(snap) {
    const c = this.hero.center();
    const mw = this.world.w * TILE, mh = this.world.h * TILE;
    let x = c.x - VIEW_W / 2, y = c.y - (VIEW_H + HUD_H) / 2;
    x = mw <= VIEW_W ? (mw - VIEW_W) / 2 : clamp(x, 0, mw - VIEW_W);
    y = mh + HUD_H <= VIEW_H ? (mh - VIEW_H - HUD_H) / 2 : clamp(y, -HUD_H, mh - VIEW_H);
    this.cam.x = Math.round(x); this.cam.y = Math.round(y);
  }

  snapshot() {
    const h = this.hero, ht = h.tile(), top = this.topOverlay();
    return {
      scene: top ? top.type : this.scene,
      baseScene: this.scene,
      overlays: this.overlays.map((o) => o.type),
      player: { x: ht.x, y: ht.y, px: Math.round(h.x), py: Math.round(h.y), dir: h.dir, hearts: h.hearts, maxHearts: h.maxHearts, shield: h.shield > 0 },
      abilities: [...this.progress.abilities],
      equipped: this.progress.equipped,
      verses: [...this.progress.verses],
      openedChests: [...this.progress.openedChests],
      bossHp: this.boss ? this.boss.hp : (this.progress.bossDefeated ? 0 : null),
      bossState: this.boss ? this.boss.state : null,
      bossDefeated: this.progress.bossDefeated,
      checkpoint: { ...this.progress.checkpoint },
      freeze: this.freezeT,
      cooldowns: { ...this.cooldowns },
      lang: getLang(),
      muted: sound.isMuted(),
      music: sound.currentMusic() ?? null,
      enemies: this.enemies.map((e) => ({ type: e.type, x: Math.floor((e.x + 8) / TILE), y: Math.floor((e.y + 8) / TILE), hp: e.hp, alive: e.alive, peaceful: e.isPeaceful(this) })),
      toasts: this.toasts.map((x) => x.key),
      mapEdits: this.world.editList(),
    };
  }

  // ------------------------------------------------------------ render
  tileFrame(name) {
    let c = this.tileCache.get(name);
    if (!c) {
      const base = TILE_SPRITE[name] || 'tile_' + name;
      const r = this.renderer;
      if (r.has(base)) c = { kind: 's', f: base };
      else if (r.has(base + '_0')) c = { kind: 'a', f: base };
      else c = { kind: 'm', f: base };
      this.tileCache.set(name, c);
    }
    if (c.kind === 'a') return this.renderer.resolve(c.f, this.time, 2);
    return c.f;
  }

  drawTiles(ctx, cam) {
    const w = this.world, r = this.renderer;
    const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
    const x1 = Math.ceil((cam.x + VIEW_W) / TILE), y1 = Math.ceil((cam.y + VIEW_H) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!w.inBounds(x, y)) continue;
      const px = x * TILE - cam.x, py = y * TILE - cam.y;
      const tile = w.get(x, y);
      if (tile === 'parted') { this.drawParted(px, py, x, y); continue; }
      const under = w.underAt(x, y);
      if (under) r.draw(this.tileFrame(under), px, py);
      r.draw(this.tileFrame(tile), px, py);
    }
  }

  // Parted sea: sand floor with a water wall only on sides that border real water,
  // so a 3-wide channel reads as one channel with walls on its outer edges.
  drawParted(px, py, x, y) {
    const r = this.renderer, w = this.world;
    const f = r.resolve('tile_parted_sea', this.time, 2);
    if (!f || !r.has('tile_sand')) { r.draw(f || 'tile_parted_sea_0', px, py); return; }
    r.draw('tile_sand', px, py);
    const S = 6; // wall slice width taken from the left edge of the parted-sea art
    if (w.get(x - 1, y) === 'water') r.drawSlice(f, 0, 0, S, 16, px, py, S, 16, 0);
    if (w.get(x + 1, y) === 'water') r.drawSlice(f, 16 - S, 0, S, 16, px + 16 - S, py, S, 16, 0);
    if (w.get(x, y - 1) === 'water') r.drawSlice(f, 0, 0, S, 16, px, py, 16, S, 1);
    if (w.get(x, y + 1) === 'water') r.drawSlice(f, 0, 0, S, 16, px, py + 16 - S, 16, S, -1);
  }

  drawSign(ctx, s, cam) {
    const x = s.x * TILE - cam.x, y = s.y * TILE - cam.y;
    ctx.fillStyle = '#3a2410'; ctx.fillRect(x + 7, y + 9, 2, 7);
    ctx.fillStyle = '#1a1008'; ctx.fillRect(x + 2, y + 2, 12, 9);
    ctx.fillStyle = '#b07838'; ctx.fillRect(x + 3, y + 3, 10, 7);
    ctx.fillStyle = '#d8a058'; ctx.fillRect(x + 3, y + 3, 10, 1);
    ctx.fillStyle = '#5a3818'; ctx.fillRect(x + 5, y + 5, 6, 1); ctx.fillRect(x + 5, y + 7, 5, 1);
  }

  drawWorld(ctx) {
    const r = this.renderer;
    const cam = { x: this.cam.x, y: this.cam.y };
    if (this.shake > 0) { cam.x += Math.round((this.rng() - 0.5) * 4); cam.y += Math.round((this.rng() - 0.5) * 4); }
    this.drawTiles(ctx, cam);
    const frozen = this.freezeT > 0;
    const list = [];
    const vis = (x, y, s = 16) => x + s > cam.x && x < cam.x + VIEW_W && y + s > cam.y && y < cam.y + VIEW_H;
    for (const c of this.chests) if (vis(c.x * TILE, c.y * TILE)) list.push({ y: c.y * TILE + 15, d: () => r.draw(c.opened ? 'chest_open' : 'chest_closed', c.x * TILE - cam.x, c.y * TILE - cam.y) });
    for (const s of this.signs) if (vis(s.x * TILE, s.y * TILE)) list.push({ y: s.y * TILE + 15, d: () => (r.has('sign_post') ? r.draw('sign_post', s.x * TILE - cam.x, s.y * TILE - cam.y) : this.drawSign(ctx, s, cam)) });
    for (const n of this.npcs) if (vis(n.x * TILE, n.y * TILE)) list.push({ y: n.y * TILE + 15, d: () => r.draw(n.sprite || 'npc_prophet', n.x * TILE - cam.x, n.y * TILE - cam.y) });
    for (const p of this.pickups) {
      if (p.t > 7 && Math.floor(p.t * 10) % 2) continue;
      list.push({ y: p.y + 14, d: () => r.draw('item_heart', p.x - cam.x, p.y - cam.y - Math.round(Math.abs(Math.sin(p.t * 4)) * 2)) });
    }
    for (const e of this.enemies) if (e.alive && vis(e.x, e.y)) list.push({ y: e.y + 15, d: () => e.draw(r, cam, frozen) });
    if (this.boss && !this.boss.dead && vis(this.boss.x, this.boss.y, 32)) list.push({ y: this.boss.y + 31, d: () => this.boss.draw(r, cam, this) });
    list.push({ y: this.hero.y + 15.5, d: () => this.hero.draw(r, cam, this.time) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();

    for (const s of this.shockwaves) {
      const n = Math.max(8, Math.floor((2 * Math.PI * s.r) / 14));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        r.drawAnim('fx_shockwave', s.x + Math.cos(a) * s.r - 8 - cam.x, s.y + Math.sin(a) * s.r * 0.7 - 8 - cam.y, this.time, 10);
      }
    }
    for (const e of this.effects) {
      if (e.fps === 0) {
        // item reveal rising above a chest
        r.draw(e.name, e.x - cam.x, e.y - cam.y - Math.round(Math.min(1, e.t * 3) * 6));
      } else r.drawAnim(e.name, e.x - cam.x, e.y - cam.y, e.t, e.fps);
    }
    for (const p of this.projectiles) p.draw(r, cam);

    if (frozen) {
      ctx.fillStyle = `rgba(255,184,40,${this.freezeT < 0.6 ? 0.18 + 0.12 * Math.sin(this.time * 30) : 0.34})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,230,${Math.min(0.5, this.flash * 2)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.flags.debug) this.drawDebug(ctx, cam);
  }

  drawDebug(ctx, cam) {
    const w = this.world;
    ctx.globalAlpha = 0.35;
    const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
    for (let y = y0; y <= y0 + 15; y++) for (let x = x0; x <= x0 + 17; x++) {
      if (!w.inBounds(x, y)) continue;
      ctx.fillStyle = w.isWalkable(x, y) ? 'rgba(0,0,0,0)' : '#ff2020';
      ctx.fillRect(x * TILE - cam.x, y * TILE - cam.y, TILE, TILE);
      ctx.fillStyle = '#000';
      ctx.fillRect(x * TILE - cam.x, y * TILE - cam.y, TILE, 1);
      ctx.fillRect(x * TILE - cam.x, y * TILE - cam.y, 1, TILE);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1;
    const box = (b) => ctx.strokeRect(Math.round(b.x - cam.x) + 0.5, Math.round(b.y - cam.y) + 0.5, b.w - 1, b.h - 1);
    box(this.hero.hitbox());
    ctx.strokeStyle = '#ffff00';
    for (const e of this.enemies) if (e.alive) box(e.hitbox());
    if (this.boss && !this.boss.dead) box(this.boss.hitbox());
    for (const o of this.objectRects()) { ctx.strokeStyle = '#00ffff'; box(o); }
  }

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.scene === 'title') this.title.draw(ctx);
    else if (this.scene === 'victory') this.victory.draw(ctx);
    else {
      this.drawWorld(ctx);
      UI.drawHUD(ctx, this);
      if (this.scene === 'play' && !this.overlays.length) {
        if (this.boss && !this.boss.dead && this.boss.active && this.heroInArena()) UI.drawBossBar(ctx, this);
        else if (!this.hero.dead && this.facingInteractable()) UI.drawPrompt(ctx, this);
      }
      if (!this.overlays.length) UI.drawToast(ctx, this);
      if (this.scene === 'gameover') UI.drawGameOver(ctx, this);
    }
    for (const o of this.overlays) o.draw(ctx);
    if (this.flags.debug) {
      drawText(ctx, `FPS ${this.fps}`, VIEW_W - 4, VIEW_H - 12, '#00ff00', { align: 'right', shadow: '#000' });
      if (this.started) { const ht = this.hero.tile(); drawText(ctx, `${ht.x},${ht.y}`, 4, VIEW_H - 12, '#00ff00', { shadow: '#000' }); }
    }
  }
}
