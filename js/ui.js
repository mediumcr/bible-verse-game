// UI: title, HUD, dialog, verse card, ability reveal, journal, pause, game over, victory/credits, toasts.
import { VIEW_W, VIEW_H, HUD_H, ABILITY_ORDER } from './util.js';
import { drawText, wrapText, measure, LINE_H } from './font.js';
import { t, getLang } from './i18n.js';
import { sound } from './sound.js';

export const COL = {
  white: '#f8f8f8', gold: '#f8d050', gray: '#a8a8c0', dim: '#686888', red: '#f86868',
  shadow: '#000000', bg: '#0c0e22', parch: '#e8dcb8', brown: '#6a5a3a',
};

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function frame(ctx, x, y, w, h, c) {
  rect(ctx, x, y, w, 1, c); rect(ctx, x, y + h - 1, w, 1, c);
  rect(ctx, x, y, 1, h, c); rect(ctx, x + w - 1, y, 1, h, c);
}

export function panel(ctx, x, y, w, h, style = 'normal') {
  rect(ctx, x, y, w, h, COL.bg);
  if (style === 'golden') {
    frame(ctx, x, y, w, h, '#f8d050');
    frame(ctx, x + 1, y + 1, w - 2, h - 2, '#fff0a0');
    frame(ctx, x + 2, y + 2, w - 4, h - 4, '#b07818');
    for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]]) {
      rect(ctx, cx, cy, 5, 5, '#f8d050'); rect(ctx, cx + 1, cy + 1, 3, 3, '#fff8d0'); rect(ctx, cx + 2, cy + 2, 1, 1, '#b07818');
    }
  } else {
    frame(ctx, x, y, w, h, COL.parch);
    frame(ctx, x + 1, y + 1, w - 2, h - 2, COL.brown);
  }
}

// last input device decides touch vs keyboard wording
const isTouchUI = (g) => (g && g.input ? g.input.lastDevice === 'touch' : document.body.classList.contains('touch'));

function blink(g, rate = 2) { return Math.floor(g.time * rate * 2) % 2 === 0; }

function drawArrow(ctx, g, x, y) {
  if (blink(g, 1.5)) drawText(ctx, '▼', x, y, COL.gold);
}

function paginate(lines, per) {
  const pages = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  return pages.length ? pages : [['']];
}

function confirmPressed(inp) { return inp.pressed('interact') || inp.pressed('action'); }

// ---------------------------------------------------------------- verse helpers
const TAGS = { kjv: 'KJV', ntv: 'NTV', rv1909: 'RVR1909' };

export function verseText(g, verse, lang = getLang()) {
  if (!verse) return { text: '', tag: '' };
  const tr = (g.versesData && g.versesData.translations) || {};
  const text = verse.text || {};
  const order = [];
  const cfg = tr[lang] || {};
  if (cfg.default) order.push(cfg.default);
  if (cfg.fallback) order.push(cfg.fallback);
  if (lang === 'es') order.push('ntv', 'rv1909'); else order.push('kjv');
  for (const k of order) if (text[k]) return { text: text[k], tag: TAGS[k] || k.toUpperCase() };
  for (const [k, v] of Object.entries(text)) if (v) return { text: v, tag: TAGS[k] || k.toUpperCase() };
  return { text: '', tag: '' };
}
function loc(obj, lang = getLang()) { if (!obj) return ''; if (typeof obj === 'string') return obj; return obj[lang] || obj.en || ''; }

// ---------------------------------------------------------------- Dialog
export class DialogOverlay {
  constructor(g, items, onClose) {
    this.type = 'dialog';
    this.g = g; this.items = items; this.onClose = onClose;
    this.idx = 0;
    this.layout();
  }
  resolve(it) {
    if (typeof it === 'string') return t(it);
    if (it.key) return t(it.key, it.vars);
    return it.text || '';
  }
  layout() {
    const lines = wrapText(this.resolve(this.items[this.idx]), 232);
    this.pages = paginate(lines, 4);
    this.page = 0; this.chars = 0;
  }
  relayout() { this.layout(); }
  pageLen() { return this.pages[this.page].join('').length; }
  update(dt, inp) {
    const total = this.pageLen();
    if (this.chars < total) {
      const before = Math.floor(this.chars);
      this.chars = Math.min(total, this.chars + dt * 48);
      const after = Math.floor(this.chars);
      if (Math.floor(after / 3) !== Math.floor(before / 3)) sound.sfx('dialog_blip');
    }
    if (confirmPressed(inp) || inp.pressed('pause')) {
      if (this.chars < total && !inp.pressed('pause')) { this.chars = total; return; }
      if (this.page < this.pages.length - 1 && !inp.pressed('pause')) { this.page++; this.chars = 0; return; }
      if (this.idx < this.items.length - 1 && !inp.pressed('pause')) { this.idx++; this.layout(); return; }
      this.g.closeOverlay(this);
      if (this.onClose) this.onClose();
    }
  }
  draw(ctx) {
    const h = 4 * LINE_H + 10, y = VIEW_H - h - 4, x = 4, w = VIEW_W - 8;
    panel(ctx, x, y, w, h);
    let left = Math.floor(this.chars);
    this.pages[this.page].forEach((line, i) => {
      if (left <= 0) return;
      drawText(ctx, line, x + 8, y + 5 + i * LINE_H, COL.white, { max: left });
      left -= line.length;
    });
    if (this.chars >= this.pageLen()) drawArrow(ctx, this.g, x + w - 12, y + h - 12);
  }
}

// ---------------------------------------------------------------- Verse card
export class VerseOverlay {
  constructor(g, verseId, opts = {}) {
    this.type = 'verse';
    this.g = g; this.verseId = verseId; this.opts = opts;
    this.appear = 0;
    this.layout();
  }
  layout() {
    const g = this.g;
    this.verse = this.opts.verse || g.verseById.get(this.verseId) || null;
    const { text, tag } = verseText(g, this.verse);
    this.ref = this.verse ? loc(this.verse.ref) : this.verseId;
    this.theme = this.verse ? loc(this.verse.theme) : '';
    this.tag = tag;
    this.golden = this.verse && this.verse.rarity === 'golden';
    this.pages = paginate(wrapText(text ? `${text}` : '...', 212), 9);
    this.page = 0;
  }
  relayout() { const p = this.page; this.layout(); this.page = Math.min(p, this.pages.length - 1); }
  update(dt, inp) {
    this.appear = Math.min(1, this.appear + dt * 4);
    if (this.appear < 1) return;
    if (inp.pressed('pause')) { this.close(); return; }
    if (confirmPressed(inp)) {
      if (this.page < this.pages.length - 1) { this.page++; sound.sfx('menu_move'); } else this.close();
    }
  }
  close() { this.g.closeOverlay(this); if (this.opts.onClose) this.opts.onClose(); }
  draw(ctx) {
    const g = this.g;
    const w = 236;
    const head = this.opts.fromChest ? wrapText(t('ui.got_verse'), w - 16).slice(0, 2) : [];
    const lines = this.pages[this.page];
    const per = Math.max(...this.pages.map((p) => p.length));
    const h = Math.max(96, 10 + head.length * LINE_H + (head.length ? 3 : 0) + 18 + per * LINE_H + 24);
    const x = (VIEW_W - w) >> 1;
    const y = ((VIEW_H - h) >> 1) + Math.round((1 - this.appear) * 30);
    rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.5)');
    panel(ctx, x, y, w, h, this.golden ? 'golden' : 'normal');
    let cy = y + 8;
    head.forEach((l) => {
      drawText(ctx, l, VIEW_W / 2, cy, this.golden ? COL.gold : COL.white, { align: 'center', shadow: COL.shadow });
      cy += LINE_H;
    });
    if (head.length) cy += 3;
    g.renderer.draw(this.golden ? 'item_verse_scroll_gold' : 'item_verse_scroll', x + 10, cy - 2);
    drawText(ctx, this.ref, x + 30, cy + 1, COL.gold, { shadow: COL.shadow });
    if (this.theme && measure(this.ref) + measure(this.theme) + 50 < w) drawText(ctx, this.theme, x + w - 10, cy + 1, COL.gray, { align: 'right' });
    cy += 18;
    rect(ctx, x + 10, cy - 4, w - 20, 1, this.golden ? '#b07818' : COL.brown);
    lines.forEach((line, i) => drawText(ctx, line, x + 12, cy + i * LINE_H, COL.white));
    // footer: translation tag + paging
    const tagW = measure(this.tag) + 8;
    rect(ctx, x + w - tagW - 10, y + h - 17, tagW, 11, this.golden ? '#b07818' : COL.brown);
    drawText(ctx, this.tag, x + w - 14, y + h - 17, COL.white, { align: 'right' });
    if (this.pages.length > 1) drawText(ctx, `${this.page + 1}/${this.pages.length}`, x + 10, y + h - 17, COL.gray);
    drawArrow(ctx, g, VIEW_W / 2 - 3, y + h - 14);
  }
}

// ---------------------------------------------------------------- Ability reveal
export class AbilityOverlay {
  constructor(g, id, onClose) {
    this.type = 'ability'; this.g = g; this.id = id; this.onClose = onClose; this.appear = 0;
    this.layout();
  }
  layout() {
    this.name = t(`ability.${this.id}.name`);
    this.descLines = wrapText(t(`ability.${this.id}.desc`), 200).slice(0, 7);
  }
  relayout() { this.layout(); }
  update(dt, inp) {
    this.appear = Math.min(1, this.appear + dt * 3);
    if (this.appear < 1) return;
    if (confirmPressed(inp) || inp.pressed('pause')) { this.g.closeOverlay(this); if (this.onClose) this.onClose(); }
  }
  draw(ctx) {
    const g = this.g, w = 220, h = 70 + this.descLines.length * LINE_H + 16;
    const x = (VIEW_W - w) >> 1, y = (VIEW_H - h) >> 1;
    rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.45)');
    panel(ctx, x, y, w, h, 'golden');
    const head = wrapText(t('ui.got_ability', { name: this.name }), w - 20);
    head.slice(0, 2).forEach((l, i) => drawText(ctx, l, VIEW_W / 2, y + 7 + i * LINE_H, COL.gold, { align: 'center', shadow: COL.shadow }));
    const iy = y + 8 + Math.min(2, head.length) * LINE_H + 2;
    // rays behind icon
    const pulse = 0.5 + 0.5 * Math.sin(g.time * 6);
    ctx.fillStyle = `rgba(255,220,120,${0.25 + 0.25 * pulse})`;
    ctx.fillRect(VIEW_W / 2 - 20, iy - 2, 40, 36);
    g.renderer.draw(`icon_${this.id}`, VIEW_W / 2 - 16, iy, { scale: 2 });
    drawText(ctx, t(`ability.${this.id}.ref`), VIEW_W / 2, iy + 36, COL.gray, { align: 'center' });
    this.descLines.forEach((l, i) => drawText(ctx, l, x + 10, iy + 50 + i * LINE_H, COL.white));
    drawArrow(ctx, g, x + w - 14, y + h - 13);
  }
}

// ---------------------------------------------------------------- Pause menu
export class PauseOverlay {
  constructor(g) { this.type = 'pause'; this.g = g; this.idx = 0; }
  items() {
    return [
      { id: 'resume', label: t('ui.resume') },
      { id: 'journal', label: t('ui.journal') },
      { id: 'lang', label: t('ui.language') },
      { id: 'sound', label: sound.isMuted() ? t('ui.sound_off') : t('ui.sound_on') },
      { id: 'quit', label: t('ui.save_quit') },
    ];
  }
  relayout() {}
  update(dt, inp) {
    const items = this.items();
    if (inp.pressed('pause')) { this.g.closeOverlay(this); sound.sfx('menu_select'); return; }
    if (inp.pressed('up')) { this.idx = (this.idx + items.length - 1) % items.length; sound.sfx('menu_move'); }
    if (inp.pressed('down')) { this.idx = (this.idx + 1) % items.length; sound.sfx('menu_move'); }
    const it = items[this.idx];
    if ((inp.pressed('left') || inp.pressed('right')) && (it.id === 'lang' || it.id === 'sound')) this.activate(it.id);
    else if (confirmPressed(inp)) this.activate(it.id);
  }
  activate(id) {
    const g = this.g;
    sound.sfx('menu_select');
    if (id === 'resume') g.closeOverlay(this);
    else if (id === 'journal') g.pushOverlay(new JournalOverlay(g));
    else if (id === 'lang') g.toggleLang();
    else if (id === 'sound') g.toggleMute();
    else if (id === 'quit') g.saveAndQuit();
  }
  draw(ctx) {
    const g = this.g;
    rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.55)');
    const items = this.items();
    const w = 168, h = 22 + items.length * 14 + 6;
    const x = (VIEW_W - w) >> 1, y = 26;
    panel(ctx, x, y, w, h);
    drawText(ctx, t('ui.verses_count', { n: g.progress.verses.length, total: g.verseTotal() }), VIEW_W / 2, y + 6, COL.gold, { align: 'center' });
    items.forEach((it, i) => {
      const sel = i === this.idx;
      const iy = y + 22 + i * 14;
      if (sel) { rect(ctx, x + 6, iy - 2, w - 12, 13, '#2a3466'); drawText(ctx, '►', x + 10, iy - 1, COL.gold); }
      drawText(ctx, it.label, x + 20, iy - 1, sel ? COL.white : COL.gray);
    });
    // controls help
    const help = wrapText(isTouchUI(g) ? t('ui.controls_touch') : t('ui.controls_keyboard'), 236);
    const hy = y + h + 8;
    panel(ctx, 4, hy, VIEW_W - 8, help.length * LINE_H + 8);
    help.forEach((l, i) => drawText(ctx, l, 10, hy + 4 + i * LINE_H, COL.gray));
  }
}

// ---------------------------------------------------------------- Verse journal
export class JournalOverlay {
  constructor(g) { this.type = 'journal'; this.g = g; this.idx = 0; }
  relayout() {}
  list() { return (this.g.versesData && this.g.versesData.verses) || []; }
  update(dt, inp) {
    const list = this.list();
    const n = Math.max(1, list.length);
    if (inp.pressed('pause')) { this.g.closeOverlay(this); sound.sfx('menu_select'); return; }
    if (inp.pressed('up')) { this.idx = (this.idx + n - 1) % n; sound.sfx('menu_move'); }
    if (inp.pressed('down')) { this.idx = (this.idx + 1) % n; sound.sfx('menu_move'); }
    if (confirmPressed(inp)) {
      const v = list[this.idx];
      if (v && this.g.progress.verses.includes(v.id)) { sound.sfx('menu_select'); this.g.pushOverlay(new VerseOverlay(this.g, v.id)); } else sound.sfx('error');
    }
  }
  draw(ctx) {
    const g = this.g, list = this.list();
    rect(ctx, 0, 0, VIEW_W, VIEW_H, '#0c0e22');
    panel(ctx, 2, 2, VIEW_W - 4, VIEW_H - 4);
    drawText(ctx, t('ui.journal'), 10, 7, COL.gold, { shadow: COL.shadow });
    drawText(ctx, t('ui.verses_count', { n: g.progress.verses.length, total: g.verseTotal() }), VIEW_W - 10, 7, COL.white, { align: 'right' });
    const rowH = 11, top = 22;
    list.forEach((v, i) => {
      const got = g.progress.verses.includes(v.id);
      const sel = i === this.idx, y = top + i * rowH;
      if (sel) rect(ctx, 6, y - 1, VIEW_W - 12, rowH, '#2a3466');
      drawText(ctx, `${i + 1}.`, 20, y, COL.dim, { align: 'right' });
      if (sel) drawText(ctx, '►', 8, y, COL.gold);
      const golden = v.rarity === 'golden';
      drawText(ctx, got ? loc(v.ref) : t('ui.unknown_verse'), 26, y, got ? (golden ? COL.gold : COL.white) : COL.dim);
      if (got && golden) drawText(ctx, '*', VIEW_W - 14, y, COL.gold);
    });
    // detail box
    const by = top + Math.max(10, list.length) * rowH + 4, bh = VIEW_H - by - 8;
    rect(ctx, 6, by, VIEW_W - 12, 1, COL.brown);
    const v = list[this.idx];
    if (v) {
      const got = g.progress.verses.includes(v.id);
      let lines;
      if (got) {
        const { text, tag } = verseText(g, v);
        lines = wrapText(`${text} (${tag})`, VIEW_W - 24);
        const max = Math.floor((bh - 4) / LINE_H);
        if (lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, '') + ' ...'; }
        lines.forEach((l, i) => drawText(ctx, l, 12, by + 4 + i * LINE_H, COL.white));
      } else {
        lines = wrapText(`${t('ui.hint')}: ${loc(v.hint)}`, VIEW_W - 24);
        lines.slice(0, 4).forEach((l, i) => drawText(ctx, l, 12, by + 4 + i * LINE_H, COL.gray));
      }
    }
  }
}

// ---------------------------------------------------------------- Yes/No confirmation (default No)
export class ConfirmOverlay {
  constructor(g, key, onYes) { this.type = 'confirm'; this.g = g; this.key = key; this.onYes = onYes; this.idx = 1; }
  relayout() {}
  update(dt, inp) {
    if (inp.pressed('left') || inp.pressed('right') || inp.pressed('up') || inp.pressed('down')) { this.idx = 1 - this.idx; sound.sfx('menu_move'); }
    if (inp.pressed('pause')) { this.g.closeOverlay(this); sound.sfx('menu_select'); return; }
    if (confirmPressed(inp)) {
      sound.sfx('menu_select');
      this.g.closeOverlay(this);
      if (this.idx === 0 && this.onYes) this.onYes();
    }
  }
  draw(ctx) {
    rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.55)');
    const lines = wrapText(t(this.key), 196);
    const w = 216, h = lines.length * LINE_H + 36, x = (VIEW_W - w) >> 1, y = (VIEW_H - h) >> 1;
    panel(ctx, x, y, w, h);
    lines.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, y + 7 + i * LINE_H, COL.white, { align: 'center' }));
    const by = y + h - 19;
    [t('ui.yes'), t('ui.no')].forEach((label, i) => {
      const cx = VIEW_W / 2 + (i === 0 ? -40 : 40), sel = i === this.idx;
      const bw = measure(label) + 20;
      if (sel) rect(ctx, cx - bw / 2, by - 2, bw, 14, '#2a3466');
      if (sel) drawText(ctx, '►', cx - bw / 2 + 3, by, COL.gold);
      drawText(ctx, label, cx + 3, by, sel ? COL.white : COL.gray, { align: 'center' });
    });
  }
}

// ---------------------------------------------------------------- Title screen
export class TitleScreen {
  constructor(g) { this.g = g; this.phase = 'press'; this.idx = 0; }
  items() {
    const it = [];
    if (this.g.hasSave()) it.push({ id: 'continue', label: t('ui.continue') });
    it.push({ id: 'new', label: t('ui.new_game') });
    it.push({ id: 'lang', label: t('ui.language') });
    return it;
  }
  reset() { this.phase = 'press'; this.idx = 0; }
  update(dt, inp) {
    if (this.phase === 'press') {
      if (confirmPressed(inp) || inp.pressed('pause')) { this.phase = 'menu'; this.idx = 0; sound.sfx('menu_select'); }
      return;
    }
    const items = this.items();
    if (this.idx >= items.length) this.idx = 0;
    if (inp.pressed('up')) { this.idx = (this.idx + items.length - 1) % items.length; sound.sfx('menu_move'); }
    if (inp.pressed('down')) { this.idx = (this.idx + 1) % items.length; sound.sfx('menu_move'); }
    const it = items[this.idx];
    if (it.id === 'lang' && (inp.pressed('left') || inp.pressed('right'))) { sound.sfx('menu_select'); this.g.toggleLang(); return; }
    if (confirmPressed(inp)) {
      sound.sfx('menu_select');
      if (it.id === 'continue') this.g.continueGame();
      else if (it.id === 'new') {
        if (this.g.hasSave()) this.g.pushOverlay(new ConfirmOverlay(this.g, 'ui.confirm_new', () => this.g.newGame()));
        else this.g.newGame();
      }
      else if (it.id === 'lang') this.g.toggleLang();
    }
  }
  draw(ctx) {
    const g = this.g, r = g.renderer;
    // backdrop: slowly panning view of the map
    const mw = g.world.w * 16, mh = g.world.h * 16;
    const span = Math.max(1, mw - VIEW_W);
    const px = (0.5 - Math.cos(g.time * 0.04) * 0.5) * span;
    const ps = g.map.playerStart || { y: 0 };
    const py = Math.max(0, Math.min(mh - VIEW_H, ps.y * 16 - VIEW_H / 2));
    g.drawTiles(ctx, { x: Math.round(px), y: Math.round(py) });
    rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(8,8,28,0.62)');
    // title text (2x, wrapped)
    const title = t('ui.title');
    const lines = wrapText(title, VIEW_W - 16, 2);
    let y = 28 - (lines.length - 1) * 10;
    for (const l of lines) {
      drawText(ctx, l, VIEW_W / 2 + 1, y + 1, '#6a3a08', { align: 'center', scale: 2 });
      drawText(ctx, l, VIEW_W / 2, y, COL.gold, { align: 'center', scale: 2, shadow: '#000' });
      y += 22;
    }
    const sub = wrapText(t('ui.subtitle'), VIEW_W - 24);
    sub.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, y + 2 + i * LINE_H, COL.white, { align: 'center', shadow: COL.shadow }));
    // little hero + lion + scroll decoration
    const decoY = y + 6 + sub.length * LINE_H;
    r.draw(`hero_down_${Math.floor(g.time * 3) % 2}`, VIEW_W / 2 - 8, decoY);
    r.draw('item_verse_scroll_gold', VIEW_W / 2 - 34, decoY);
    r.draw('icon_sling', VIEW_W / 2 + 18, decoY);
    const my = decoY + 26;
    if (this.phase === 'press') {
      if (blink(g, 1)) drawText(ctx, t('ui.press_start'), VIEW_W / 2, my + 10, COL.white, { align: 'center', shadow: COL.shadow });
    } else {
      const items = this.items();
      const w = 150, h = items.length * 14 + 8, x = (VIEW_W - w) >> 1;
      panel(ctx, x, my, w, h);
      items.forEach((it, i) => {
        const sel = i === this.idx, iy = my + 5 + i * 14;
        if (sel) { rect(ctx, x + 4, iy - 1, w - 8, 13, '#2a3466'); drawText(ctx, '►', x + 8, iy, COL.gold); }
        drawText(ctx, it.label, x + 18, iy, sel ? COL.white : COL.gray);
      });
    }
    drawText(ctx, 'L: English / Español', VIEW_W / 2, VIEW_H - 13, COL.dim, { align: 'center' });
  }
}

// ---------------------------------------------------------------- Victory & credits
export class VictoryScreen {
  constructor(g) { this.g = g; this.phase = 'verse'; this.t = 0; this.scroll = 0; this.layout(); }
  relayout() { this.layout(); }
  layout() {
    const g = this.g;
    const vv = g.versesData && g.versesData.victoryVerse;
    const { text, tag } = verseText(g, vv);
    this.ref = vv ? loc(vv.ref) : '1 Samuel 17:47';
    this.tag = tag;
    this.verseLines = wrapText(text, 212);
    this.msgLines = wrapText(t('ui.victory_msg'), 220);
    // credits
    const lines = [];
    const push = (txt, color = COL.white) => wrapText(txt, 232).forEach((l) => lines.push({ text: l, color }));
    push(t('ui.credits'), COL.gold); lines.push({ text: '' });
    push(t('ui.credits_body')); lines.push({ text: '' });
    const tr = (g.versesData && g.versesData.translations) || {};
    const all = [...((g.versesData && g.versesData.verses) || []), g.versesData && g.versesData.victoryVerse].filter(Boolean);
    const used = (k) => all.some((v) => v.text && v.text[k]);
    for (const lang of ['en', 'es']) {
      const cfg = tr[lang] || {};
      for (const [k, v] of Object.entries(cfg)) {
        if (!v || typeof v !== 'object' || !v.credit) continue;
        if (k === 'ntv' && !used('ntv')) continue; // NTV credit only when NTV text is actually shown
        push(`${v.name || k} (${TAGS[k] || k.toUpperCase()})`, COL.gold);
        push(v.credit, COL.gray);
        lines.push({ text: '' });
      }
    }
    push(t('ui.verses_count', { n: g.progress.verses.length, total: g.verseTotal() }), COL.gold);
    lines.push({ text: '' });
    push(t('ui.title'), COL.gold);
    this.credits = lines;
  }
  update(dt, inp) {
    this.t += dt;
    if (this.phase === 'verse') {
      if (this.t > 1 && confirmPressed(inp)) { this.phase = 'credits'; this.t = 0; this.scroll = 0; sound.sfx('menu_select'); }
    } else {
      const total = this.credits.length * LINE_H + VIEW_H;
      const fast = this.g.input.isDown('interact') || this.g.input.isDown('action');
      this.scroll = Math.min(total - VIEW_H + 20, this.scroll + dt * (fast ? 80 : 18));
      const done = this.scroll >= total - VIEW_H + 20;
      if (done && confirmPressed(inp)) { sound.sfx('menu_select'); this.g.goTitle(); }
      if (inp.pressed('pause')) this.g.goTitle();
    }
  }
  draw(ctx) {
    const g = this.g;
    rect(ctx, 0, 0, VIEW_W, VIEW_H, '#100c20');
    // gentle golden rays
    for (let i = 0; i < 12; i++) {
      const a = g.time * 0.2 + (i * Math.PI) / 6;
      ctx.fillStyle = 'rgba(248,208,80,0.05)';
      ctx.beginPath(); ctx.moveTo(128, 112);
      ctx.lineTo(128 + Math.cos(a) * 300, 112 + Math.sin(a) * 300);
      ctx.lineTo(128 + Math.cos(a + 0.2) * 300, 112 + Math.sin(a + 0.2) * 300);
      ctx.fill();
    }
    if (this.phase === 'verse') {
      drawText(ctx, t('ui.victory'), VIEW_W / 2, 8, COL.gold, { align: 'center', scale: 2, shadow: '#000' });
      let y = 34;
      this.msgLines.slice(0, 3).forEach((l) => { drawText(ctx, l, VIEW_W / 2, y, COL.white, { align: 'center' }); y += LINE_H; });
      const h = 28 + this.verseLines.length * LINE_H + 16;
      panel(ctx, 10, y + 4, VIEW_W - 20, h, 'golden');
      drawText(ctx, this.ref, VIEW_W / 2, y + 11, COL.gold, { align: 'center' });
      this.verseLines.forEach((l, i) => drawText(ctx, l, 22, y + 27 + i * LINE_H, COL.white));
      drawText(ctx, this.tag, VIEW_W - 22, y + h - 10, COL.gray, { align: 'right' });
      const cy = y + h + 10;
      drawText(ctx, t('ui.verses_count', { n: g.progress.verses.length, total: g.verseTotal() }), VIEW_W / 2, cy, COL.gold, { align: 'center' });
      if (this.t > 1) drawArrow(ctx, g, VIEW_W / 2 - 3, VIEW_H - 14);
    } else {
      let y = VIEW_H - Math.round(this.scroll);
      for (const l of this.credits) {
        if (y > -LINE_H && y < VIEW_H) drawText(ctx, l.text, VIEW_W / 2, y, l.color || COL.white, { align: 'center' });
        y += LINE_H;
      }
      const total = this.credits.length * LINE_H + VIEW_H;
      if (this.scroll >= total - VIEW_H + 20) drawArrow(ctx, g, VIEW_W - 14, VIEW_H - 14);
    }
  }
}

// ---------------------------------------------------------------- HUD & misc
const SCROLL_X = 210;
export function drawHUD(ctx, g) {
  const r = g.renderer, p = g.progress, h = g.hero;
  rect(ctx, 0, 0, VIEW_W, HUD_H, '#0a0a1c');
  rect(ctx, 0, HUD_H, VIEW_W, 1, '#3a3456');
  for (let i = 0; i < h.maxHearts; i++) r.draw(i < h.hearts ? 'ui_heart_full' : 'ui_heart_empty', 1 + i * 13, 1);
  // equipped ability
  const ax = 92;
  rect(ctx, ax, 1, 16, 16, '#202048');
  frame(ctx, ax - 1, 0, 18, 18, COL.parch);
  const id = p.equipped;
  if (id) {
    r.draw(`icon_${id}`, ax, 1);
    const cd = g.cooldowns[id] || 0, max = g.cooldownMax[id] || 1;
    if (cd > 0) {
      const ph = Math.ceil(16 * Math.min(1, cd / max));
      rect(ctx, ax, 1, 16, ph, 'rgba(0,0,0,0.65)');
    }
    // name gets the full width up to the verse scroll icon; never truncated (icon only if too long)
    const name = t(`ability.${id}.name`);
    if (measure(name) <= SCROLL_X - (ax + 21) - 2) drawText(ctx, name, ax + 21, 4, COL.white, { shadow: COL.shadow });
    // owned ability pips
    p.abilities.forEach((a, i) => rect(ctx, ax + 21 + ABILITY_ORDER.indexOf(a) * 5, 15, 3, 2, a === id ? COL.gold : COL.dim));
  }
  // verse counter
  r.draw('item_verse_scroll', SCROLL_X, 1);
  drawText(ctx, `${p.verses.length}/${g.verseTotal()}`, SCROLL_X + 16, 4, COL.white, { shadow: COL.shadow });
}

export function drawToast(ctx, g) {
  const toast = g.toasts[0];
  if (!toast) return;
  const text = toast.key ? t(toast.key, toast.vars) : toast.text;
  const lines = wrapText(text, 224).slice(0, 4);
  const w = Math.min(VIEW_W - 8, Math.max(...lines.map((l) => measure(l))) + 14);
  const h = lines.length * LINE_H + 7;
  const x = (VIEW_W - w) >> 1, y = HUD_H + 4;
  const a = Math.min(1, toast.t * 6, (toast.dur - toast.t) * 4);
  ctx.save(); ctx.globalAlpha = Math.max(0, a);
  panel(ctx, x, y, w, h);
  lines.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, y + 4 + i * LINE_H, COL.white, { align: 'center' }));
  ctx.restore();
}

export function drawPrompt(ctx, g, kind) {
  let text = t('ui.press_interact');
  if (isTouchUI(g)) text = text.replace(/\bE\b/, 'A');
  const w = measure(text) + 12;
  const x = (VIEW_W - w) >> 1, y = VIEW_H - 18;
  panel(ctx, x, y, w, 15);
  drawText(ctx, text, VIEW_W / 2, y + 2, COL.gold, { align: 'center' });
}

export function drawBossBar(ctx, g) {
  const b = g.boss;
  const w = 160, x = (VIEW_W - w) >> 1, y = VIEW_H - 16;
  panel(ctx, x - 4, y - 12, w + 8, 26);
  drawText(ctx, t('ui.boss_name'), VIEW_W / 2, y - 10, COL.white, { align: 'center' });
  rect(ctx, x, y + 2, w, 6, '#401020');
  rect(ctx, x, y + 2, Math.round((w * b.hp) / b.maxHp), 6, b.vulnerable(g) ? COL.gold : '#d84040');
}

export function drawGameOver(ctx, g) {
  rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(40,0,8,0.82)');
  drawText(ctx, t('ui.game_over'), VIEW_W / 2, 80, COL.red, { align: 'center', scale: 2, shadow: '#000' });
  if (blink(g, 1)) {
    const lines = wrapText(t('ui.try_again'), 220);
    lines.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, 120 + i * LINE_H, COL.white, { align: 'center' }));
  }
}
