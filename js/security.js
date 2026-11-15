// Límites de confianza compartidos por enlaces, imágenes y respaldos v1.
export function safeURL(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function imageURL(value) {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'blob:' && url.origin === location.origin) return value;
  } catch { /* imagen remota o valor inválido */ }
  return safeURL(value);
}

// No permite cerrar atributos ni introducir otras declaraciones CSS.
export function safeColor(value, fallback = '#64748b') {
  return typeof value === 'string' && /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d.,%\s/+-]+\))$/i.test(value) ? value : fallback;
}

const record = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const types = ['manhwa', 'manga', 'anime', 'serie', 'pelicula'];
const statuses = ['pendiente', 'viendo', 'emision', 'pausado', 'terminado', 'abandonado'];
const platforms = ['', 'web', 'netflix', 'prime', 'disney', 'hbo', 'youtube', 'crunchyroll', 'apple', 'paramount', 'vix', 'pluto', 'mubi'];
const invalid = () => { throw new Error('El archivo no es un respaldo válido de Biblioteca de Alejandría.'); };

// Se valida todo antes de borrar/escribir: un archivo rechazado conserva los datos actuales.
// Se mantienen campos opcionales y el formato de exportación existente.
export function validateBackup(data) {
  let nodes = 0;
  function tree(value, depth = 0) {
    if (++nodes > 1000000 || depth > 24) invalid();
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      // Un sustituto aislado rompe encodeURIComponent aunque JSON.parse lo acepte.
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) invalid();
      return;
    }
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(); return; }
    if (typeof value !== 'object') invalid();
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
      tree(child, depth + 1);
    }
  }
  tree(data);
  if (!record(data) || data.app !== 'biblioteca-de-alejandria' || data.version !== 1 || !Array.isArray(data.works)) invalid();
  for (const key of ['patterns', 'teams']) if (data[key] != null && !Array.isArray(data[key])) invalid();
  if (data.settings != null && !record(data.settings)) invalid();
  const optional = (obj, key, check) => { if (obj[key] != null && !check(obj[key])) invalid(); };
  const url = (v) => typeof v === 'string' && (!v || !!safeURL(v));
  const image = (v) => typeof v === 'string' && (!v || !!imageURL(v));
  const text = (v) => typeof v === 'string';
  const bool = (v) => typeof v === 'boolean';
  function team(t) {
    if (!record(t) || typeof t.id !== 'string' || !t.id || typeof t.name !== 'string') invalid();
    for (const k of ['short', 'league', 'country', 'sport']) optional(t, k, text);
    for (const k of ['color1', 'color2']) optional(t, k, (v) => !v || safeColor(v, '') === v);
    optional(t, 'logo', image);
    optional(t, 'order', finite);
  }
  const ids = new Set();
  for (const w of data.works) {
    if (!record(w) || typeof w.id !== 'string' || !w.id || ids.has(w.id) || typeof w.title !== 'string' || !w.title.trim()) invalid();
    ids.add(w.id);
    if (w.type === null || w.status === null || w.progress === null) invalid();
    optional(w, 'type', (v) => types.includes(v));
    optional(w, 'status', (v) => statuses.includes(v));
    for (const k of ['synopsis', 'pubStatus', 'notes']) optional(w, k, text);
    for (const k of ['genres', 'aliases']) optional(w, k, strings);
    for (const k of ['favorite', 'justFinished']) optional(w, k, bool);
    for (const k of ['total', 'year', 'createdAt', 'updatedAt', 'watchedAt', 'lastRead', 'lastOpened', 'seasonJump']) optional(w, k, finite);
    optional(w, 'rating', (v) => Number.isInteger(v) && v >= 0 && v <= 5);
    optional(w, 'platform', (v) => platforms.includes(v));
    optional(w, 'cover', image);
    optional(w, 'chaptersUrl', url);
    optional(w, 'progress', (p) => record(p) && Object.values(p).every(finite));
    optional(w, 'source', (s) => record(s) && typeof s.api === 'string' && (s.id == null || typeof s.id === 'string' || finite(s.id)) && (s.url == null || url(s.url)));
    optional(w, 'seasons', (s) => Array.isArray(s) && s.every((x) => record(x) && finite(x.n) && finite(x.eps)));
    optional(w, 'spoilers', Array.isArray);
    optional(w, 'seasonNotes', (s) => record(s) && Object.values(s).every(text));
    optional(w, 'links', (links) => Array.isArray(links) && links.every((l) => {
      if (!record(l) || !safeURL(l.url)) return false;
      for (const k of ['host', 'slug', 'mode', 'rule']) optional(l, k, text);
      optional(l, 'platform', (v) => platforms.includes(v));
      for (const k of ['chapter', 'addedAt', 'openedAt']) optional(l, k, finite);
      return true;
    }));
    optional(w, 'reminder', (r) => record(r) && typeof r.on === 'boolean' && Array.isArray(r.days) && r.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && (r.time == null || (typeof r.time === 'string' && /^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/.test(r.time))));
  }
  for (const p of data.patterns || []) {
    if (!record(p) || typeof p.host !== 'string' || !/^[a-z0-9.-]+$/i.test(p.host)) invalid();
    optional(p, 'fromEnd', (n) => Number.isInteger(n) && n >= 0);
    for (const k of ['none', 'confirmed']) optional(p, k, bool);
  }
  for (const t of data.teams || []) team(t);
  const s = data.settings || {};
  for (const k of ['installHint', 'lastBackup']) optional(s, k, finite);
  for (const k of ['amoled', 'haptics', 'showRecs', 'showClock', 'remindersOn', 'remindOnOpen']) optional(s, k, bool);
  for (const k of ['view', 'accent', 'motion', 'sort', 'browser', 'sport', 'startTab', 'notifToastDay']) optional(s, k, text);
  for (const k of ['activity', 'notifSeen']) optional(s, k, (v) => record(v) && Object.values(v).every((x) => finite(x) || typeof x === 'boolean'));
  optional(s, 'leagues', (v) => Array.isArray(v) && v.every((l) => {
    if (typeof l === 'string') return true; // selección de versiones anteriores
    if (!record(l) || typeof l.id !== 'string' || typeof l.name !== 'string') return false;
    optional(l, 'logo', image);
    return true;
  }));
  optional(s, 'sportFavs', (v) => record(v) && Object.values(v).every((list) => {
    if (!Array.isArray(list)) return false;
    list.forEach(team);
    return true;
  }));
  return data;
}
