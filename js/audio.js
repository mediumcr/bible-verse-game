// Scripture Quest — audio.js
// 8-bit / NES-style synthesized audio using only the WebAudio API (no audio files).
//
// API (GDD section 6):
//   Audio.init()              call on first user gesture; safe to call repeatedly
//   Audio.setMuted(bool)      Audio.isMuted()
//   Audio.sfx(name)           unknown names are ignored
//   Audio.music(name|null)    'title' | 'overworld' | 'den' | 'boss' | 'victory' | null
//
// Every call is a silent no-op before init() or when WebAudio is unavailable; nothing throws.
//
// MUSIC SOURCES (all original or public domain):
//   title     — OLD HUNDREDTH (Genevan Psalter, attr. Louis Bourgeois, 1551) — public domain hymn tune
//   overworld — original composition for Scripture Quest
//   den       — original composition for Scripture Quest
//   boss      — original composition for Scripture Quest
//   victory   — original composition for Scripture Quest (short fanfare)

// ---------------------------------------------------------------------------------------------
// Note / duration parsing
// ---------------------------------------------------------------------------------------------
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  let n = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 12 * (parseInt(m[3], 10) + 1) + n;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const N = (s) => mtof(noteToMidi(s));

// Duration token -> length in sixteenth notes. "4" quarter, "8" eighth, "4." dotted quarter, "1" whole.
function durToSteps(tok) {
  const dotted = tok.endsWith('.');
  const base = 16 / parseInt(dotted ? tok.slice(0, -1) : tok, 10);
  return dotted ? base * 1.5 : base;
}

// "C4 8, E4 8, R 4" -> [{n:'C4'|'R'|drum, d:steps}]
function parseSeq(str) {
  return str.split(',').map((x) => x.trim()).filter(Boolean).map((tok) => {
    const [n, d] = tok.split(/\s+/);
    return { n, d: durToSteps(d) };
  });
}

// ---------------------------------------------------------------------------------------------
// Track definitions (compact). Each bar = 16 sixteenth-note steps, 4/4 time.
// melody: note string; chords: "C 1, Am 2, ..." drive both the arpeggio (harmony) and bass channels.
// ---------------------------------------------------------------------------------------------
const TRACKS = {
  // OLD HUNDREDTH ("Praise God, from whom all blessings flow"), Genevan Psalter 1551 — public domain.
  // 12 bars, stately, in G major.
  title: {
    bpm: 92, loop: true,
    melody: { wave: 'p25', vol: 0.20, transpose: 0, notes:
      'G4 2, G4 4, F#4 4, E4 4, D4 4, G4 4, A4 4, B4 1,' +
      'B4 2, B4 4, B4 4, A4 4, G4 4, C5 4, B4 4, A4 1,' +
      'G4 2, A4 4, B4 4, A4 4, G4 4, E4 4, F#4 4, G4 1,' +
      'D5 2, B4 4, G4 4, A4 4, C5 4, B4 4, A4 4, G4 1' },
    chords: 'G 2, D 2, Em 4, Bm 4, G 4, D 4, G 1,' +
            'G 2, Em 2, D 4, Em 4, C 4, G 4, D 1,' +
            'G 2, D 4, G 4, D 4, Em 4, C 4, D 4, G 1,' +
            'G 1, D 4, Am 4, G 4, D 4, G 1',
    arp: { wave: 'p12', vol: 0.07, oct: 3, step: 2, pattern: [0, 2, 1, 2] },
    bass: { vol: 0.30, oct: 2, style: 'half' },
  },

  // Original — adventurous, hopeful. C major, 16 bars.
  overworld: {
    bpm: 132, loop: true,
    melody: { wave: 'p50', vol: 0.15, transpose: 12, notes:
      'C4 8, E4 8, G4 4, E4 8, G4 8, C5 4,' +
      'B4 8, A4 8, E4 4, A4 4., G4 8,' +
      'F4 8, A4 8, C5 8, A4 8, G4 8, F4 8, E4 8, F4 8,' +
      'G4 4., D4 8, B3 4, D4 4,' +
      'E4 8, G4 8, C5 4, B4 8, A4 8, G4 4,' +
      'A4 8, C5 8, E5 4, D5 8, C5 8, A4 4,' +
      'F4 8, A4 8, C5 8, A4 8, B4 8, D5 8, G4 4,' +
      'C5 2., R 4,' +
      'D4 8, F4 8, A4 4, F4 8, A4 8, D5 4,' +
      'B4 8, A4 8, G4 8, D4 8, G4 2,' +
      'E4 8, G4 8, B4 4, G4 8, B4 8, E5 4,' +
      'C5 8, B4 8, A4 8, E4 8, A4 2,' +
      'A4 4, C5 4, F5 4, C5 4,' +
      'B4 4, D5 4, G5 4., F5 8,' +
      'E5 8, D5 8, C5 8, A4 8, B4 8, C5 8, D5 4,' +
      'C5 2, G4 4, E4 4' },
    chords: 'C 1, Am 1, F 1, G 1, C 1, Am 1, F 2, G 2, C 1,' +
            'Dm 1, G 1, Em 1, Am 1, F 1, G 1, F 2, G 2, C 1',
    arp: { wave: 'p12', vol: 0.06, oct: 4, step: 2, pattern: [0, 2, 1, 2] },
    bass: { vol: 0.30, oct: 2, style: 'walk' },
    drums: { vol: 0.5, pattern: 'K 8, H 8, S 8, H 8, K 8, K 8, S 8, H 8' },
  },

  // Original — tense, minor (A minor), slow heartbeat. 8 bars.
  den: {
    bpm: 96, loop: true,
    melody: { wave: 'p25', vol: 0.15, transpose: 0, notes:
      'A4 4, R 8, C5 8, B4 4, R 8, E4 8,' +
      'A4 4., G#4 8, A4 4, R 4,' +
      'C5 4, R 8, D5 8, C5 4, A4 4,' +
      'G#4 2, E4 2,' +
      'A4 8, B4 8, C5 8, E5 8, D#5 4, E5 4,' +
      'F5 4., E5 8, D5 4, A4 4,' +
      'B4 4, C5 8, B4 8, G#4 4, E4 4,' +
      'A4 2., R 4' },
    chords: 'Am 1, Am 1, F 1, E 1, Am 1, Dm 1, E 1, Am 1',
    arp: { wave: 'p12', vol: 0.06, oct: 3, step: 4, pattern: [0, 1, 2, 1] },
    bass: { vol: 0.32, oct: 2, style: 'pulse' },
    drums: { vol: 0.35, pattern: 'K 8, K 8, R 4, R 4, H 4' },
  },

  // Original — fast, driving, E minor. 8 bars.
  boss: {
    bpm: 168, loop: true,
    melody: { wave: 'p50', vol: 0.14, transpose: -12, notes:
      'E5 8, E5 8, B4 8, E5 8, G5 8, F#5 8, E5 8, B4 8,' +
      'D5 8, E5 8, F#5 8, G5 8, A5 4, G5 8, F#5 8,' +
      'E5 8, E5 8, C5 8, E5 8, G5 8, A5 8, G5 8, E5 8,' +
      'F#5 8, D5 8, A4 8, D5 8, F#5 4, A5 4,' +
      'B5 8, A5 8, G5 8, F#5 8, E5 8, F#5 8, G5 8, B5 8,' +
      'A5 8, G5 8, F#5 8, E5 8, D#5 4, B4 4,' +
      'C6 8, B5 8, A5 8, G5 8, F#5 8, A5 8, D6 8, A5 8,' +
      'B5 4, F#5 8, D#5 8, B4 4, R 4' },
    chords: 'Em 1, Em 1, C 1, D 1, Em 1, Em 2, B 2, C 2, D 2, B 1',
    arp: { wave: 'p12', vol: 0.05, oct: 4, step: 1, pattern: [0, 1, 2, 3] },
    bass: { vol: 0.32, oct: 2, style: 'drive' },
    drums: { vol: 0.55, pattern: 'K 8, H 8, S 8, H 8, K 8, K 8, S 8, S 16, S 16' },
  },

  // Original — short victory fanfare (2 bars, plays once then stops).
  victory: {
    bpm: 140, loop: false,
    melody: { wave: 'p25', vol: 0.18, transpose: 0, notes:
      'G4 16, C5 16, E5 16, G5 16, C6 4, A5 8, B5 8, C6 4,' +
      'D6 8, C6 8, B5 8, D6 8, C6 2' },
    chords: 'C 2, F 4, C 4, G 2, C 2',
    arp: { wave: 'p12', vol: 0.06, oct: 4, step: 1, pattern: [0, 1, 2, 3] },
    bass: { vol: 0.32, oct: 2, style: 'walk' },
    drums: { vol: 0.5, pattern: 'K 4, S 8, S 8, K 4, S 4, K 8, S 8, K 8, S 8, K 2' },
  },
};

// ---------------------------------------------------------------------------------------------
// Track compiler: definitions -> flat sorted event list (times in sixteenth steps).
// ---------------------------------------------------------------------------------------------
function parseChord(name) {
  const m = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (!m) return null;
  const root = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const third = m[3] === 'm' ? 3 : 4;
  return [root, root + third, root + 7, root + 12];
}

const compiledCache = {};

function compileTrack(name) {
  if (compiledCache[name]) return compiledCache[name];
  const def = TRACKS[name];
  if (!def) return null;
  const ev = [];
  let melLen = 0;

  // Melody
  for (const { n, d } of parseSeq(def.melody.notes)) {
    if (n !== 'R') {
      const m = noteToMidi(n);
      if (m != null) ev.push({ t: melLen, d, k: 'tone', w: def.melody.wave, m: m + (def.melody.transpose || 0), v: def.melody.vol, g: 0.92, env: 'lead' });
    }
    melLen += d;
  }

  // Chords -> arp + bass
  const chords = parseSeq(def.chords);
  let t = 0;
  for (const { n, d } of chords) {
    const tones = parseChord(n);
    if (tones) {
      // arpeggio
      const a = def.arp;
      if (a) {
        for (let s = 0, i = 0; s < d; s += a.step, i++) {
          const len = Math.min(a.step, d - s);
          const semi = tones[a.pattern[i % a.pattern.length]];
          ev.push({ t: t + s, d: len, k: 'tone', w: a.wave, m: 12 * (a.oct + 1) + semi, v: a.vol, g: 0.7, env: 'pluck' });
        }
      }
      // bass
      const b = def.bass;
      if (b) {
        const root = 12 * (b.oct + 1) + tones[0];
        const push = (tt, dd, m, gate = 0.9) => ev.push({ t: t + tt, d: dd, k: 'tone', w: 'tri', m, v: b.vol, g: gate, env: 'bass' });
        if (b.style === 'half') {
          for (let s = 0; s < d; s += 8) push(s, Math.min(8, d - s), root);
        } else if (b.style === 'walk') {
          for (let s = 0, i = 0; s < d; s += 4, i++) push(s, Math.min(4, d - s), i % 2 ? root + 7 : root);
        } else if (b.style === 'drive') {
          for (let s = 0, i = 0; s < d; s += 2, i++) push(s, Math.min(2, d - s), i % 4 === 3 ? root + 12 : root, 0.75);
        } else if (b.style === 'pulse') {
          for (let s = 0; s < d; s += 8) { push(s, Math.min(2, d - s), root, 0.8); if (s + 2 < d) push(s + 2, Math.min(2, d - s - 2), root, 0.8); }
        }
      }
    }
    t += d;
  }
  const chordLen = t;

  // Drums: repeat bar pattern to fill
  const total = Math.max(melLen, chordLen);
  if (def.drums) {
    const pat = parseSeq(def.drums.pattern);
    const patLen = pat.reduce((s, x) => s + x.d, 0);
    for (let base = 0; base < total; base += patLen) {
      let s = 0;
      for (const { n, d } of pat) {
        if (base + s >= total) break;
        if (n !== 'R') ev.push({ t: base + s, d, k: 'drum', n, v: def.drums.vol });
        s += d;
      }
    }
  }

  if (melLen !== chordLen && typeof console !== 'undefined') {
    console.warn(`[audio] track '${name}' melody (${melLen}) and chord (${chordLen}) lengths differ`);
  }
  ev.sort((a, b) => a.t - b.t);
  const out = { name, bpm: def.bpm, loop: def.loop, len: total, events: ev, stepSec: 60 / def.bpm / 4 };
  compiledCache[name] = out;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Engine state
// ---------------------------------------------------------------------------------------------
let ctx = null;
let unsupported = false;
let master = null, musicGain = null, sfxGain = null;
let waves = {};
let noiseBuf = null;
let muted = false;
let pendingTrack;          // track requested before init (undefined = none)
let current = null;        // currently scheduled track playback
let timer = null;
let visHooked = false;

const MASTER_VOL = 0.8;
const MUSIC_VOL = 0.38;
const SFX_VOL = 0.75;
const LOOKAHEAD = 0.15;    // seconds scheduled ahead
const TICK_MS = 25;
const MAX_VOICES = 3;

function makePulseWave(duty) {
  const H = 32;
  const real = new Float32Array(H);
  const imag = new Float32Array(H);
  for (let n = 1; n < H; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
  }
  return ctx.createPeriodicWave(real, imag);
}

function setup() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) { unsupported = true; return; }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_VOL;
  let out = master;
  if (typeof ctx.createDynamicsCompressor === 'function') {
    const comp = ctx.createDynamicsCompressor();
    try {
      comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.15;
    } catch (e) { /* ignore */ }
    master.connect(comp);
    out = comp;
  }
  out.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = MUSIC_VOL; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = SFX_VOL; sfxGain.connect(master);

  waves = { p12: makePulseWave(0.125), p25: makePulseWave(0.25), p50: makePulseWave(0.5) };

  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

function hookVisibility() {
  if (visHooked || typeof document === 'undefined' || !document.addEventListener) return;
  visHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try {
      if (document.hidden) { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); }
      else { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { /* ignore */ }
  });
}

// ---------------------------------------------------------------------------------------------
// Voice helpers
// ---------------------------------------------------------------------------------------------
function cleanup(src, ...nodes) {
  src.onended = () => { for (const n of [src, ...nodes]) { try { n.disconnect(); } catch (e) { /* ignore */ } } };
}

// Pitched voice. o: {w, f, f2, vol, attack, release, sus, decay, vib, vibRate}
function tone(dest, t, dur, o) {
  const osc = ctx.createOscillator();
  const w = o.w || 'p50';
  if (waves[w]) osc.setPeriodicWave(waves[w]);
  else osc.type = w === 'tri' ? 'triangle' : w;
  const f = o.f;
  osc.frequency.setValueAtTime(f, t);
  if (o.f2 && o.f2 > 0) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const g = ctx.createGain();
  const vol = o.vol == null ? 0.2 : o.vol;
  const atk = Math.min(o.attack == null ? 0.004 : o.attack, dur * 0.5);
  const rel = Math.min(o.release == null ? 0.03 : o.release, dur - atk);
  const sus = o.sus == null ? 1 : o.sus;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  const decEnd = Math.min(t + atk + (o.decay || 0.08), t + dur - rel);
  if (sus !== 1 && decEnd > t + atk) g.gain.linearRampToValueAtTime(vol * sus, decEnd);
  g.gain.setValueAtTime(vol * sus, Math.max(t + atk, t + dur - rel));
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g); g.connect(dest);
  let lfo = null, lg = null;
  if (o.vib) {
    lfo = ctx.createOscillator(); lg = ctx.createGain();
    lfo.frequency.value = o.vibRate || 6; lg.gain.value = o.vib;
    lfo.connect(lg); lg.connect(osc.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.02);
    cleanup(lfo, lg);
  }
  osc.start(t); osc.stop(t + dur + 0.02);
  cleanup(osc, g);
  return { osc, gain: g };
}

// Noise voice. o: {vol, type, f, f2, q, attack, release}
function noise(dest, t, dur, o) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = o.type || 'bandpass';
  filt.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f2) filt.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  filt.Q.value = o.q == null ? 1 : o.q;
  const g = ctx.createGain();
  const vol = o.vol == null ? 0.15 : o.vol;
  const atk = Math.min(o.attack == null ? 0.002 : o.attack, dur * 0.8);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  if (o.release == null) g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  else { g.gain.setValueAtTime(vol, Math.max(t + atk, t + dur - o.release)); g.gain.linearRampToValueAtTime(0, t + dur); }
  src.connect(filt); filt.connect(g); g.connect(dest);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  cleanup(src, filt, g);
  return { src, filter: filt, gain: g };
}

// Sequence of notes: [[note, dur], ...] played back-to-back; returns total time.
function seq(dest, t, notes, o) {
  let s = 0;
  for (const [n, d] of notes) {
    if (n !== 'R') tone(dest, t + s, d, { ...o, f: typeof n === 'number' ? n : N(n) });
    s += d;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// SFX definitions: fn(dest, t) -> duration (s)
// ---------------------------------------------------------------------------------------------
const SFX = {
  step(d, t) {
    noise(d, t, 0.03, { vol: 0.03, type: 'highpass', f: 2600 });
    return 0.04;
  },
  chest_open(d, t) {
    noise(d, t, 0.12, { vol: 0.06, type: 'bandpass', f: 900, q: 3 });
    tone(d, t, 0.12, { w: 'p50', f: 160, f2: 340, vol: 0.10 });
    tone(d, t + 0.13, 0.08, { w: 'p25', f: N('E5'), vol: 0.14 });
    tone(d, t + 0.21, 0.22, { w: 'p25', f: N('A5'), vol: 0.14, sus: 0.6 });
    return 0.45;
  },
  verse_get(d, t) {
    // bright ascending arpeggio + echo, ending on a sustained chord
    const ar = [['C5', 0.065], ['E5', 0.065], ['G5', 0.065], ['C6', 0.065], ['E6', 0.065], ['G6', 0.065]];
    seq(d, t, ar, { w: 'p25', vol: 0.13 });
    seq(d, t + 0.1, ar, { w: 'p12', vol: 0.05 });
    const e = t + 0.45;
    tone(d, e, 0.12, { w: 'p25', f: N('E6'), vol: 0.13 });
    tone(d, e + 0.12, 0.6, { w: 'p25', f: N('C7'), vol: 0.12, sus: 0.5, decay: 0.3, release: 0.25, vib: 8 });
    tone(d, e + 0.12, 0.6, { w: 'p12', f: N('G6'), vol: 0.06, sus: 0.5, decay: 0.3, release: 0.25 });
    tone(d, e + 0.12, 0.6, { w: 'tri', f: N('C4'), vol: 0.25, release: 0.3 });
    return 1.2;
  },
  ability_get(d, t) {
    // triumphant fanfare
    const mel = [['C5', 0.12], ['G4', 0.08], ['C5', 0.08], ['E5', 0.14], ['G5', 0.14], ['R', 0.04],
                 ['E5', 0.1], ['G5', 0.1], ['C6', 0.85]];
    seq(d, t, mel, { w: 'p50', vol: 0.12, sus: 0.8, release: 0.06 });
    const hl = [['E4', 0.12], ['E4', 0.08], ['E4', 0.08], ['G4', 0.14], ['B4', 0.14], ['R', 0.04],
                ['G4', 0.1], ['B4', 0.1], ['G5', 0.85]];
    seq(d, t, hl, { w: 'p12', vol: 0.06, sus: 0.8 });
    tone(d, t, 0.4, { w: 'tri', f: N('C3'), vol: 0.3 });
    tone(d, t + 0.4, 0.3, { w: 'tri', f: N('G2'), vol: 0.3 });
    tone(d, t + 0.8, 0.85, { w: 'tri', f: N('C3'), vol: 0.3, release: 0.3 });
    tone(d, t + 0.8, 0.85, { w: 'sine', f: N('E6'), vol: 0.04, vib: 10, vibRate: 7, release: 0.4 });
    noise(d, t + 0.8, 0.5, { vol: 0.05, type: 'highpass', f: 6000 });
    return 1.7;
  },
  heart_get(d, t) {
    seq(d, t, [['A5', 0.06], ['E6', 0.06], ['A6', 0.12]], { w: 'p25', vol: 0.12 });
    seq(d, t + 0.06, [['A5', 0.06], ['E6', 0.06], ['A6', 0.12]], { w: 'p12', vol: 0.04 });
    return 0.32;
  },
  hit_enemy(d, t) {
    noise(d, t, 0.07, { vol: 0.12, type: 'bandpass', f: 2500, q: 1.5 });
    tone(d, t, 0.08, { w: 'p50', f: 520, f2: 170, vol: 0.10 });
    return 0.1;
  },
  enemy_die(d, t) {
    noise(d, t, 0.3, { vol: 0.13, type: 'bandpass', f: 1600, f2: 250, q: 1 });
    tone(d, t, 0.25, { w: 'p25', f: 900, f2: 90, vol: 0.08 });
    return 0.32;
  },
  hero_hurt(d, t) {
    tone(d, t, 0.28, { w: 'p50', f: 900, f2: 140, vol: 0.14 });
    tone(d, t, 0.28, { w: 'p12', f: 870, f2: 130, vol: 0.06 });
    noise(d, t, 0.06, { vol: 0.08, type: 'highpass', f: 1500 });
    return 0.3;
  },
  hero_die(d, t) {
    const s = seq(d, t, [['E5', 0.12], ['D#5', 0.12], ['D5', 0.12], ['C#5', 0.12], ['C5', 0.12], ['B4', 0.14]],
      { w: 'p50', vol: 0.12, sus: 0.7 });
    tone(d, t + s, 0.5, { w: 'p25', f: N('A4'), f2: N('A3'), vol: 0.12, release: 0.2 });
    tone(d, t + s, 0.5, { w: 'tri', f: N('A2'), f2: N('A1'), vol: 0.25, release: 0.2 });
    return s + 0.5;
  },
  sling(d, t) {
    noise(d, t, 0.12, { vol: 0.09, type: 'bandpass', f: 600, f2: 3500, q: 2 });
    tone(d, t, 0.06, { w: 'p25', f: 400, f2: 1000, vol: 0.05 });
    return 0.14;
  },
  smash(d, t) {
    noise(d, t, 0.3, { vol: 0.26, type: 'lowpass', f: 2000, f2: 180, q: 0.7 });
    tone(d, t, 0.25, { w: 'tri', f: 150, f2: 40, vol: 0.45 });
    tone(d, t, 0.05, { w: 'p50', f: 220, f2: 80, vol: 0.08 });
    return 0.32;
  },
  staff_part(d, t) {
    // long filtered noise swell (waters parting) + low rumble
    const n = noise(d, t, 1.2, { vol: 0.24, type: 'lowpass', f: 250, q: 3, attack: 0.6, release: 0.55 });
    n.filter.frequency.cancelScheduledValues(t);
    n.filter.frequency.setValueAtTime(250, t);
    n.filter.frequency.exponentialRampToValueAtTime(2400, t + 0.65);
    n.filter.frequency.exponentialRampToValueAtTime(400, t + 1.2);
    tone(d, t, 1.15, { w: 'tri', f: 58, f2: 44, vol: 0.3, attack: 0.3, release: 0.5 });
    tone(d, t + 0.5, 0.6, { w: 'sine', f: N('E5'), f2: N('B5'), vol: 0.03, attack: 0.2, release: 0.3 });
    return 1.2;
  },
  shield(d, t) {
    const ar = [];
    for (let i = 0; i < 12; i++) ar.push([['E5', 'B5', 'E6', 'B6'][i % 4], 0.035]);
    seq(d, t, ar, { w: 'p12', vol: 0.08 });
    tone(d, t, 0.5, { w: 'sine', f: N('E6'), vol: 0.05, vib: 15, vibRate: 9, release: 0.2 });
    return 0.5;
  },
  fire(d, t) {
    // whoosh
    const n = noise(d, t, 0.75, { vol: 0.22, type: 'bandpass', f: 300, q: 1.2, attack: 0.08, release: 0.4 });
    n.filter.frequency.cancelScheduledValues(t);
    n.filter.frequency.setValueAtTime(300, t);
    n.filter.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
    n.filter.frequency.exponentialRampToValueAtTime(400, t + 0.75);
    tone(d, t + 0.15, 0.4, { w: 'tri', f: 90, f2: 40, vol: 0.25 });
    // crackle
    for (let i = 0; i < 9; i++) {
      const ct = t + 0.15 + Math.random() * 0.7;
      noise(d, ct, 0.015 + Math.random() * 0.02, { vol: 0.08 + Math.random() * 0.1, type: 'highpass', f: 3000 + Math.random() * 3000 });
    }
    return 0.9;
  },
  sun(d, t) {
    // shimmering rising chord with staggered entries and vibrato
    const v = [['C5', 'p25'], ['E5', 'p12'], ['G5', 'p25'], ['C6', 'p12']];
    v.forEach(([n, w], i) => {
      const st = t + i * 0.08;
      tone(d, st, 1.1 - i * 0.08, { w, f: N(n), f2: N(n) * 1.335, vol: 0.07, attack: 0.05, release: 0.35, vib: 6, vibRate: 7 + i });
    });
    tone(d, t, 1.1, { w: 'tri', f: N('C3'), f2: N('F3'), vol: 0.25, attack: 0.1, release: 0.4 });
    const sp = [];
    for (let i = 0; i < 14; i++) sp.push([['G6', 'C7', 'E7'][i % 3], 0.05]);
    seq(d, t + 0.3, sp, { w: 'p12', vol: 0.03 });
    return 1.15;
  },
  menu_move(d, t) {
    tone(d, t, 0.04, { w: 'p25', f: 990, vol: 0.07 });
    return 0.05;
  },
  menu_select(d, t) {
    tone(d, t, 0.05, { w: 'p25', f: 880, vol: 0.09 });
    tone(d, t + 0.05, 0.1, { w: 'p25', f: 1320, vol: 0.09 });
    return 0.16;
  },
  dialog_blip(d, t) {
    tone(d, t, 0.03, { w: 'p50', f: 500 + Math.random() * 70, vol: 0.045, release: 0.01 });
    return 0.035;
  },
  boss_stomp(d, t) {
    tone(d, t, 0.4, { w: 'tri', f: 100, f2: 30, vol: 0.55 });
    noise(d, t, 0.35, { vol: 0.3, type: 'lowpass', f: 450, f2: 80, q: 0.8 });
    return 0.42;
  },
  boss_spear(d, t) {
    noise(d, t, 0.25, { vol: 0.12, type: 'bandpass', f: 2600, f2: 500, q: 3 });
    tone(d, t, 0.2, { w: 'p12', f: 1400, f2: 350, vol: 0.05 });
    return 0.27;
  },
  boss_hurt(d, t) {
    tone(d, t, 0.12, { w: 'p50', f: 320, f2: 140, vol: 0.14 });
    tone(d, t + 0.13, 0.15, { w: 'p50', f: 280, f2: 110, vol: 0.13 });
    noise(d, t, 0.08, { vol: 0.1, type: 'bandpass', f: 1200 });
    return 0.3;
  },
  boss_die(d, t) {
    [0, 0.25, 0.5, 0.75, 1.0, 1.3].forEach((o, i) => {
      noise(d, t + o, 0.35 + i * 0.03, { vol: 0.22, type: 'lowpass', f: 2200 - i * 200, f2: 100, q: 0.7 });
    });
    tone(d, t, 1.7, { w: 'tri', f: 200, f2: 30, vol: 0.35, release: 0.4 });
    tone(d, t, 0.9, { w: 'p50', f: 600, f2: 60, vol: 0.06 });
    return 1.9;
  },
  checkpoint(d, t) {
    const n = [['G5', 0.08], ['C6', 0.08], ['E6', 0.28]];
    seq(d, t, n, { w: 'p25', vol: 0.1, sus: 0.7 });
    seq(d, t + 0.09, n, { w: 'p12', vol: 0.035, sus: 0.7 });
    return 0.5;
  },
  error(d, t) {
    tone(d, t, 0.09, { w: 'p50', f: 150, vol: 0.12 });
    tone(d, t + 0.12, 0.13, { w: 'p50', f: 140, vol: 0.12 });
    return 0.26;
  },
};

const voices = {};   // sfx name -> [{g, end}]

// ---------------------------------------------------------------------------------------------
// Music scheduler
// ---------------------------------------------------------------------------------------------
function drum(dest, t, name, v) {
  if (name === 'K') {
    tone(dest, t, 0.12, { w: 'tri', f: 160, f2: 42, vol: 0.6 * v });
    noise(dest, t, 0.03, { vol: 0.12 * v, type: 'lowpass', f: 800 });
  } else if (name === 'S') {
    noise(dest, t, 0.11, { vol: 0.28 * v, type: 'bandpass', f: 1900, q: 0.8 });
    tone(dest, t, 0.05, { w: 'tri', f: 240, f2: 130, vol: 0.25 * v });
  } else if (name === 'H') {
    noise(dest, t, 0.035, { vol: 0.12 * v, type: 'highpass', f: 7000 });
  } else if (name === 'O') {
    noise(dest, t, 0.15, { vol: 0.1 * v, type: 'highpass', f: 6000 });
  }
}

function playEvent(pb, e, time) {
  const dur = e.d * pb.track.stepSec;
  if (e.k === 'drum') { drum(pb.gain, time, e.n, e.v); return; }
  const gated = Math.max(0.03, dur * e.g);
  const o = { w: e.w, f: mtof(e.m), vol: e.v };
  if (e.env === 'lead') { o.sus = 0.7; o.decay = 0.1; o.release = 0.03; }
  else if (e.env === 'pluck') { o.sus = 0.4; o.decay = 0.06; o.release = 0.02; }
  else { o.release = 0.03; }
  tone(pb.gain, time, gated, o);
}

function tick() {
  timer = null;
  if (!ctx || !current) return;
  const pb = current;
  const now = ctx.currentTime;
  const horizon = now + LOOKAHEAD;
  const sec = pb.track.stepSec;
  const evs = pb.track.events;
  let guard = 0;
  try {
    while (!pb.done && guard++ < 4000) {
      if (pb.idx >= evs.length) {
        if (pb.track.loop) { pb.loopStart += pb.track.len * sec; pb.idx = 0; continue; }
        pb.done = true; pb.endTime = pb.loopStart + pb.track.len * sec; break;
      }
      const e = evs[pb.idx];
      const time = pb.loopStart + e.t * sec;
      if (time >= horizon) break;
      if (time >= now - 0.03) playEvent(pb, e, Math.max(time, now));
      pb.idx++;
    }
  } catch (err) { /* never throw from scheduler */ }
  if (pb.done && now > pb.endTime + 0.6) {
    // non-looping track finished
    try { pb.gain.disconnect(); } catch (e) { /* ignore */ }
    if (current === pb) current = null;
    return;
  }
  timer = setTimeout(tick, TICK_MS);
}

function fadeOutAndDrop(g, time = 0.35) {
  try {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + time);
  } catch (e) { /* ignore */ }
  setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, time * 1000 + 300);
}

function startMusic(name) {
  if (current && current.name === name && !current.done) return; // already playing
  if (current) { fadeOutAndDrop(current.gain); current = null; }
  if (timer) { clearTimeout(timer); timer = null; }
  if (name == null) return;
  const track = compileTrack(name);
  if (!track) return;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(1, now + 0.08);
  g.connect(musicGain);
  current = { name, track, gain: g, idx: 0, loopStart: now + 0.1, done: false, endTime: 0 };
  tick();
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------
function init() {
  try {
    if (unsupported) return;
    if (!ctx) {
      setup();
      if (!ctx) return;
      hookVisibility();
      if (pendingTrack !== undefined) { const p = pendingTrack; pendingTrack = undefined; startMusic(p); }
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (ctx.state === 'suspended' && !hidden) {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {
    ctx = null; unsupported = true;
  }
}

function setMuted(b) {
  muted = !!b;
  if (!ctx || !master) return;
  try {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOL, now + 0.05);
  } catch (e) { /* ignore */ }
}

function isMuted() { return muted; }

function sfx(name) {
  if (!ctx || muted) return;
  const fn = Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : null;
  if (!fn) return;
  try {
    const now = ctx.currentTime;
    const list = (voices[name] || []).filter((v) => v.end > now);
    while (list.length >= MAX_VOICES) {
      const old = list.shift();
      fadeOutAndDrop(old.g, 0.03);
    }
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(sfxGain);
    const dur = fn(g, now + 0.005) || 0.5;
    list.push({ g, end: now + dur });
    voices[name] = list;
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, (dur + 0.5) * 1000);
  } catch (e) { /* never throw */ }
}

function music(name) {
  if (name != null && !TRACKS[name]) return; // unknown track ignored
  if (!ctx) { if (!unsupported) pendingTrack = name == null ? undefined : name; return; }
  try { startMusic(name == null ? null : name); } catch (e) { /* never throw */ }
}

export const Audio = { init, setMuted, isMuted, sfx, music };
