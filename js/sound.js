// Guarded wrapper around js/audio.js (owned by the audio agent).
// If the module is missing or throws, the game keeps running silently.
const noop = { init() {}, setMuted() {}, isMuted() { return false; }, sfx() {}, music() {} };
let impl = noop;
let muted = false;
let current;      // last requested music track (undefined = never requested)
let inited = false;

function safe(fn) { try { fn(); } catch (e) { console.warn('[audio]', e); } }

export const sound = {
  async load() {
    try {
      const m = await import('./audio.js');
      if (m && m.Audio) impl = m.Audio;
    } catch (e) {
      console.warn('[audio] module unavailable, running silent:', e && e.message);
    }
    safe(() => impl.setMuted(muted));
    if (current !== undefined) safe(() => impl.music(current));
    if (inited) safe(() => impl.init());
  },
  init() { inited = true; safe(() => impl.init()); },
  sfx(name) { safe(() => impl.sfx(name)); },
  music(name) {
    if (name === current) return;
    current = name;
    safe(() => impl.music(name));
  },
  currentMusic() { return current; },
  setMuted(b) { muted = !!b; safe(() => impl.setMuted(muted)); },
  isMuted() { return muted; },
};
