// Sprite drawing, magenta placeholders, integer-scaled canvas layout.
import { VIEW_W, VIEW_H } from './util.js';

export class Renderer {
  constructor(canvas, sheet, img) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.frames = (sheet && sheet.frames) || {};
    this.img = img;
    this.warned = new Set();
  }

  has(name) { return !!(this.img && this.frames[name]); }

  // Resolve an animated base ("tile_water") or a static frame name; returns a frame name or null.
  resolve(base, t = 0, fps = 2) {
    if (this.has(base)) return base;
    if (this.has(base + '_0')) {
      const n = this.has(base + '_1') ? 2 : 1;
      return base + '_' + (Math.floor(t * fps) % n);
    }
    return null;
  }

  placeholder(x, y, w = 16, h = 16, name = '') {
    const c = this.ctx;
    c.fillStyle = '#ff00ff';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#000';
    for (let i = 0; i < Math.min(w, h); i += 4) c.fillRect(x + i, y + i, 2, 2);
    if (name && !this.warned.has(name)) {
      this.warned.add(name);
      console.warn('[sprites] missing frame:', name);
    }
  }

  // Draw a frame at integer pos. opts: {rot (quarter turns), alpha, flipX, w, h (placeholder size)}
  draw(name, x, y, opts = {}) {
    x = Math.round(x); y = Math.round(y);
    const f = name && this.has(name) ? this.frames[name] : null;
    if (!f) { this.placeholder(x, y, opts.w || 16, opts.h || 16, name); return; }
    const c = this.ctx;
    const needXf = opts.rot || opts.flipX || opts.alpha !== undefined || opts.scale;
    if (!needXf) { c.drawImage(this.img, f.x, f.y, f.w, f.h, x, y, f.w, f.h); return; }
    const s = opts.scale || 1;
    c.save();
    if (opts.alpha !== undefined) c.globalAlpha = opts.alpha;
    c.translate(x + (f.w * s) / 2, y + (f.h * s) / 2);
    if (opts.rot) c.rotate((opts.rot * Math.PI) / 2);
    if (opts.flipX) c.scale(-1, 1);
    c.drawImage(this.img, f.x, f.y, f.w, f.h, (-f.w * s) / 2, (-f.h * s) / 2, f.w * s, f.h * s);
    c.restore();
  }

  // Draw a sub-rect of a frame into dest rect (dw x dh = final size); rot in quarter turns (+1 = clockwise).
  drawSlice(name, sx, sy, sw, sh, dx, dy, dw, dh, rot = 0) {
    const f = this.has(name) ? this.frames[name] : null;
    if (!f) return;
    const c = this.ctx;
    if (!rot) { c.drawImage(this.img, f.x + sx, f.y + sy, sw, sh, dx, dy, sw, sh); return; }
    c.save();
    c.translate(dx + dw / 2, dy + dh / 2);
    c.rotate((rot * Math.PI) / 2);
    c.drawImage(this.img, f.x + sx, f.y + sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    c.restore();
  }

  drawAnim(base, x, y, t, fps = 4, opts = {}) {
    const n = this.resolve(base, t, fps);
    this.draw(n || base, x, y, opts);
  }
}

// Integer scaling (in device pixels) to fit the available area. Returns the CSS size.
export function layoutCanvas(canvas, availW, availH) {
  const dpr = window.devicePixelRatio || 1;
  let s = Math.floor(Math.min((availW * dpr) / VIEW_W, (availH * dpr) / VIEW_H));
  let cssW, cssH;
  if (s >= 1) {
    cssW = (VIEW_W * s) / dpr; cssH = (VIEW_H * s) / dpr;
  } else {
    const f = Math.min(availW / VIEW_W, availH / VIEW_H);
    cssW = VIEW_W * f; cssH = VIEW_H * f; s = f * dpr;
  }
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  return { cssW, cssH, scale: s };
}
