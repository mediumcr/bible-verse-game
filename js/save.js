// localStorage save, GDD section 3.
export const SAVE_KEY = 'scripture-quest-save-v1';

function arr(v) { return Array.isArray(v) ? v : []; }

export class SaveStore {
  constructor(enabled = true) {
    this.enabled = enabled;
    try { this.ls = window.localStorage; } catch (e) { this.ls = null; }
  }
  load() {
    if (!this.enabled || !this.ls) return null;
    try {
      const raw = this.ls.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      return {
        lang: s.lang === 'es' ? 'es' : 'en',
        muted: !!s.muted,
        hearts: Number.isFinite(s.hearts) ? s.hearts : 3,
        maxHearts: Number.isFinite(s.maxHearts) ? Math.max(3, Math.min(6, s.maxHearts)) : 3,
        abilities: arr(s.abilities).filter((a) => typeof a === 'string'),
        equipped: typeof s.equipped === 'string' ? s.equipped : null,
        verses: arr(s.verses).filter((a) => typeof a === 'string'),
        openedChests: arr(s.openedChests).filter((a) => typeof a === 'string'),
        mapEdits: arr(s.mapEdits).filter((e) => e && Number.isInteger(e.x) && Number.isInteger(e.y) && typeof e.tile === 'string'),
        checkpoint: s.checkpoint && Number.isFinite(s.checkpoint.x) && Number.isFinite(s.checkpoint.y) ? s.checkpoint : null,
        bossDefeated: !!s.bossDefeated,
        talkedToElder: !!s.talkedToElder,
      };
    } catch (e) {
      console.warn('[save] could not read save', e);
      return null;
    }
  }
  exists() { return !!this.load(); }
  write(obj) {
    if (!this.enabled || !this.ls) return false;
    try { this.ls.setItem(SAVE_KEY, JSON.stringify(obj)); return true; } catch (e) { console.warn('[save] write failed', e); return false; }
  }
  patch(fields) {
    const cur = this.load();
    if (!cur) return false;
    return this.write(Object.assign(cur, fields));
  }
  clear() { if (this.ls) try { this.ls.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
}
