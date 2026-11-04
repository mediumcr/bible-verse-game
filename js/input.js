// Keyboard + touch input mapped to abstract actions.
// Actions: up down left right action cycle interact pause lang mute
const CODE_MAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'action', KeyJ: 'action', KeyQ: 'cycle', KeyK: 'cycle',
  KeyE: 'interact', Enter: 'interact', NumpadEnter: 'interact',
  Escape: 'pause', KeyP: 'pause', KeyL: 'lang', KeyM: 'mute',
};
const KEY_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', ' ': 'action', j: 'action', q: 'cycle', k: 'cycle',
  e: 'interact', Enter: 'interact', Escape: 'pause', p: 'pause', l: 'lang', m: 'mute',
};
export const ACTIONS = ['up', 'down', 'left', 'right', 'action', 'cycle', 'interact', 'pause', 'lang', 'mute'];

export function keyToAction(key) {
  if (ACTIONS.includes(key)) return key;
  if (CODE_MAP[key]) return CODE_MAP[key];
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (typeof key === 'string' && KEY_MAP[key.toLowerCase()]) return KEY_MAP[key.toLowerCase()];
  return null;
}

export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

export class Input {
  constructor() {
    this.sources = new Map(); // sourceId -> action
    this.queue = new Set();
    this.now = new Set();
    this.dirOrder = []; // most recent last
    this.onGesture = null;
    this.onTap = null; // canvas tap callback -> returns action to queue or null
    this.lastDevice = 'keyboard';
  }

  setSource(id, action, isDown) {
    const was = this.isDown(action);
    if (isDown) this.sources.set(id, action); else this.sources.delete(id);
    const nowDown = this.isDown(action);
    if (nowDown && !was) {
      this.queue.add(action);
      if (['up', 'down', 'left', 'right'].includes(action)) {
        this.dirOrder = this.dirOrder.filter((d) => d !== action);
        this.dirOrder.push(action);
      }
    }
    if (!nowDown && was) this.dirOrder = this.dirOrder.filter((d) => d !== action);
  }

  isDown(action) {
    for (const v of this.sources.values()) if (v === action) return true;
    return false;
  }

  queuePress(action) { this.queue.add(action); }

  latch() { this.now = this.queue; this.queue = new Set(); }
  pressed(a) { return this.now.has(a); }
  consume(a) { this.now.delete(a); }
  clearAll() { this.sources.clear(); this.dirOrder = []; this.queue.clear(); }

  // Movement vector + preferred facing
  axis() {
    let x = 0, y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('up')) y -= 1;
    if (this.isDown('down')) y += 1;
    let face = null;
    for (let i = this.dirOrder.length - 1; i >= 0; i--) {
      if (this.isDown(this.dirOrder[i])) { face = this.dirOrder[i]; break; }
    }
    return { x, y, face };
  }

  gesture() { if (this.onGesture) this.onGesture(); }

  attach(canvas, touchRoot) {
    window.addEventListener('keydown', (e) => {
      const a = CODE_MAP[e.code] || KEY_MAP[e.key];
      this.gesture();
      if (!a) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      this.lastDevice = 'keyboard';
      if (!e.repeat) this.setSource('k:' + e.code, a, true);
    });
    window.addEventListener('keyup', (e) => {
      const a = CODE_MAP[e.code] || KEY_MAP[e.key];
      if (a) this.setSource('k:' + e.code, a, false);
    });
    window.addEventListener('blur', () => { this.sources.clear(); this.dirOrder = []; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.sources.clear(); this.dirOrder = []; } });

    canvas.addEventListener('pointerdown', (e) => {
      this.gesture();
      if (e.pointerType === 'touch') this.lastDevice = 'touch';
      const a = this.onTap ? this.onTap() : null;
      if (a) this.queuePress(a);
    });

    if (touchRoot) this.attachTouch(touchRoot);
    // Stop page scroll/zoom gestures on the game surface.
    document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#touch, canvas')) e.preventDefault(); });
  }

  attachTouch(root) {
    const dpad = root.querySelector('.dpad');
    const updateDpad = (e) => {
      const r = dpad.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const dead = 0.28;
      let h = null, v = null;
      if (Math.abs(dx) > dead && Math.abs(dx) > Math.abs(dy) * 0.5) h = dx < 0 ? 'left' : 'right';
      if (Math.abs(dy) > dead && Math.abs(dy) > Math.abs(dx) * 0.5) v = dy < 0 ? 'up' : 'down';
      this.setDpad(h, v);
      dpad.dataset.h = h || ''; dpad.dataset.v = v || '';
    };
    const clearDpad = () => { this.setDpad(null, null); dpad.dataset.h = ''; dpad.dataset.v = ''; };
    let dpadPointer = null;
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.gesture(); this.lastDevice = 'touch';
      dpadPointer = e.pointerId;
      try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      updateDpad(e);
    });
    dpad.addEventListener('pointermove', (e) => { if (e.pointerId === dpadPointer) updateDpad(e); });
    const end = (e) => { if (e.pointerId === dpadPointer) { dpadPointer = null; clearDpad(); } };
    dpad.addEventListener('pointerup', end);
    dpad.addEventListener('pointercancel', end);
    dpad.addEventListener('lostpointercapture', end);

    root.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.dataset.action;
      const id = 'btn:' + action;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); this.gesture(); this.lastDevice = 'touch';
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        btn.classList.add('down');
        this.setSource(id, action, true);
      });
      const up = () => { btn.classList.remove('down'); this.setSource(id, action, false); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    });
  }

  setDpad(h, v) {
    for (const d of ['left', 'right']) this.setSource('dpad:' + d, d, h === d);
    for (const d of ['up', 'down']) this.setSource('dpad:' + d, d, v === d);
  }
}
