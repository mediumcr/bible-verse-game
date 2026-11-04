// Boot, fixed-timestep loop, layout, and QA hooks (GDD section 7).
import { DT, VIEW_W, VIEW_H } from './util.js';
import { Input, keyToAction, isTouchDevice } from './input.js';
import { loadAll, sanitizeDataDir } from './loader.js';
import { initI18n, setLang, getLang, setGlobalVars } from './i18n.js';
import { SaveStore } from './save.js';
import { Renderer, layoutCanvas } from './renderer.js';
import { Game } from './game.js';
import { drawText } from './font.js';
import { sound } from './sound.js';

const params = new URLSearchParams(location.search);
const flags = {
  debug: params.get('debug') === '1',
  test: params.get('test') === '1',
  nosave: params.get('nosave') === '1',
  lang: params.get('lang') === 'es' || params.get('lang') === 'en' ? params.get('lang') : null,
  data: sanitizeDataDir(params.get('data')) || 'data',
};

const canvas = document.getElementById('game');
const touchRoot = document.getElementById('touch');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W; canvas.height = VIEW_H;
ctx.imageSmoothingEnabled = false;

const touch = isTouchDevice();
if (touch) document.body.classList.add('touch');

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const portrait = vh > vw;
  let availW = vw, availH = vh;
  const CTRL_H = 190, GAP = 10;
  if (touch && portrait) availH = Math.max(120, vh - CTRL_H - GAP - 16);
  const { cssH } = layoutCanvas(canvas, availW, availH);
  document.body.classList.toggle('portrait', touch && portrait);
  if (touch && portrait) {
    // vertically centre the canvas + controls group
    const top = Math.max(8, Math.floor((vh - (cssH + GAP + CTRL_H)) / 2));
    canvas.style.marginTop = top + 'px';
    touchRoot.style.top = (top + cssH + GAP) + 'px';
    touchRoot.style.height = CTRL_H + 'px';
  } else {
    canvas.style.marginTop = '';
    touchRoot.style.top = '';
    touchRoot.style.height = '';
  }
}
layout();
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 100));

function message(lines, color = '#f8f8f8') {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  lines.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, 90 + i * 12, color, { align: 'center' }));
}

async function boot() {
  const input = new Input();
  if (touch) input.lastDevice = 'touch';
  setGlobalVars(() => (input.lastDevice === 'touch'
    ? { use: 'B', cycle: '⟳', interact: 'A', menu: '☰' }
    : { use: 'Space', cycle: 'Q', interact: 'E', menu: 'Esc' }));
  input.onGesture = () => sound.init();
  input.attach(canvas, touchRoot);
  sound.load();
  message(['Loading...']);

  let data;
  try {
    data = await loadAll(flags.data);
  } catch (e) {
    console.error('[boot] failed to load game data:', e);
    message(['Could not load game data.', String(e.message || e).slice(0, 40)], '#f86868');
    return;
  }
  initI18n(data.i18n);
  const store = new SaveStore(!flags.nosave);
  const save = store.load();
  const navEs = (navigator.language || '').toLowerCase().startsWith('es');
  setLang(flags.lang || (save && save.lang) || (navEs ? 'es' : 'en'));
  if (save && save.muted) sound.setMuted(true);

  const renderer = new Renderer(canvas, data.sheet, data.img);
  const game = new Game({ data, renderer, input, store, flags });
  input.onTap = () => (game.scene !== 'play' || game.overlays.length ? 'interact' : null);

  // ------------------------------------------------------------ loop
  let last = performance.now(), acc = 0, frames = 0, fpsT = 0;
  const tick = () => { input.latch(); game.update(DT); };
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!flags.test) {
      acc += dt;
      while (acc >= DT) { tick(); acc -= DT; }
    }
    frames++; fpsT += dt;
    if (fpsT >= 0.5) { game.fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    try { game.render(); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------ QA hooks
  const step = (ms = DT * 1000) => {
    const n = Math.max(1, Math.round(ms / (DT * 1000)));
    for (let i = 0; i < n; i++) tick();
    game.render();
    return game.snapshot();
  };
  let pressId = 0;
  window.__game = {
    ready: true,
    flags,
    game,
    get state() { return game.snapshot(); },
    teleport(tx, ty) { game.teleport(tx, ty); game.render(); return game.snapshot(); },
    give(id) { game.give(id); return game.snapshot(); },
    openChest(id) { const ok = game.openChestById(id); game.render(); return ok; },
    setScene(name) { game.setScene(name); game.render(); return game.snapshot(); },
    step,
    press(key, ms = 100) {
      const action = keyToAction(key);
      if (!action) throw new Error('unknown key ' + key);
      sound.init();
      const id = 'press:' + (pressId++);
      input.setSource(id, action, true);
      if (flags.test) {
        step(ms);
        input.setSource(id, action, false);
        return game.snapshot();
      }
      return new Promise((res) => setTimeout(() => { input.setSource(id, action, false); res(game.snapshot()); }, ms));
    },
    setLang(l) { if (l !== getLang()) game.toggleLang(); return getLang(); },
  };
}

boot();
