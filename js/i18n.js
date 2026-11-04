// Tiny i18n: t(key, vars) with {name} placeholders. Falls back to English, then the key itself.
let dict = { en: {}, es: {} };
let lang = 'en';
const listeners = [];
let globalVars = () => ({});
// Built-in fallbacks used only when data/i18n.json lacks a key.
const FALLBACK = {
  en: { 'sign.arena_locked': 'A mighty Giant waits beyond. Find the power to make the sun stand still first!',
    'ui.confirm_new': 'Start a new game? Your saved progress will be lost.', 'ui.yes': 'Yes', 'ui.no': 'No' },
  es: { 'sign.arena_locked': 'Un Gigante poderoso espera más allá. ¡Primero busca el poder de detener el sol!',
    'ui.confirm_new': '¿Empezar una nueva partida? Se perderá tu progreso guardado.', 'ui.yes': 'Sí', 'ui.no': 'No' },
};
// Provider for input-aware placeholders ({use}, {cycle}, {interact}, {menu}).
export function setGlobalVars(fn) { globalVars = fn; }

export function initI18n(d) { dict = d && typeof d === 'object' ? d : { en: {}, es: {} }; }
export function getLang() { return lang; }
export function setLang(l) {
  lang = l === 'es' ? 'es' : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}
export function onLangChange(fn) { listeners.push(fn); }
export function has(key) { return !!(dict[lang] && dict[lang][key] != null) || !!(dict.en && dict.en[key] != null); }

export function t(key, vars) {
  let s = dict[lang] && dict[lang][key];
  if (s == null) s = dict.en && dict.en[key];
  if (s == null) s = FALLBACK[lang][key];
  if (s == null) return key;
  return format(s, vars);
}

// Fill {placeholders} from vars, then from the global input-aware vars.
export function format(s, vars) {
  const all = Object.assign({}, globalVars(), vars || {});
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (all[k] != null ? String(all[k]) : m));
}
