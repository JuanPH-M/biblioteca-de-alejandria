// Estado de la app y acciones sobre las obras.
import { db, getSetting, setSetting, uid } from './db.js';
import { parseLink, normKey, nextChapterUrl, chapterUrl, findWorkForLink, seriesUrl, siteSearchUrl } from './links.js';

export const TYPES = {
  manhwa: { label: 'Manhwa', unit: 'Cap.', unitLong: 'capítulo', reading: true, emoji: '📗' },
  manga: { label: 'Manga', unit: 'Cap.', unitLong: 'capítulo', reading: true, emoji: '📕' },
  anime: { label: 'Anime', unit: 'Ep.', unitLong: 'episodio', reading: false, emoji: '🌸' },
  serie: { label: 'Serie', unit: 'Ep.', unitLong: 'episodio', reading: false, emoji: '📺' },
  pelicula: { label: 'Película', unit: '', unitLong: '', reading: false, emoji: '🎬' },
};
export const STATUSES = {
  pendiente: { label: 'Pendiente', color: '#94a3b8' },
  viendo: { label: 'Viendo/Leyendo', color: '#22d3ee' },
  emision: { label: 'En emisión', color: '#a78bfa' },
  pausado: { label: 'Pausado', color: '#fbbf24' },
  terminado: { label: 'Terminado', color: '#34d399' },
  abandonado: { label: 'Abandonado', color: '#f87171' },
};
// En series y películas solo se lleva el registro: plataforma y progreso, sin links que abrir.
export const TRACK_ONLY = ['serie', 'pelicula'];
export const isTrackOnly = (w) => TRACK_ONLY.includes(w.type);

// Plataformas de una obra: la elegida (series/películas) y las de sus links
export function platformsOf(w) {
  const set = new Set((w.links || []).map((l) => l.platform));
  if (w.platform) set.add(w.platform);
  return [...set];
}

// Temporadas conocidas (de TVmaze): [{ n, eps }]
export const seasonEpisodes = (w, n = w.progress.season || 1) => (w.seasons || []).find((s) => s.n === n)?.eps || null;
export function seriesTotals(w) {
  const seasons = w.seasons || [];
  if (!seasons.length) return null;
  const cur = w.progress.season || 1;
  const total = seasons.reduce((a, s) => a + s.eps, 0);
  const seen = seasons.filter((s) => s.n < cur).reduce((a, s) => a + s.eps, 0) + Math.min(w.progress.episode || 0, seasonEpisodes(w) || Infinity);
  return { total, seen: Math.min(seen, total), lastSeason: seasons[seasons.length - 1].n };
}

export const statusLabel = (status, type) => (status === 'viendo' ? (TYPES[type]?.reading ? 'Leyendo' : 'Viendo') : STATUSES[status]?.label || status);

export const S = {
  works: [],
  patterns: {},
  teams: [],
  settings: { leagues: [], installHint: 0, lastBackup: 0, view: 'grid', accent: 'violet', amoled: false, motion: 'auto', activity: {}, sort: 'updated' },
  filters: { q: '', type: 'all', status: 'all', platform: 'all', fav: false },
};

const SETTING_KEYS = Object.keys(S.settings);

export async function loadAll() {
  const [works, patterns, teams] = await Promise.all([db.all('works'), db.all('patterns'), db.all('teams')]);
  S.works = works;
  const migrate = works.filter((w) => TRACK_ONLY.includes(w.type) && (w.links || []).length);
  for (const w of migrate) {
    w.platform = w.platform || (w.links.find((l) => l.platform !== 'web') || {}).platform || '';
    w.links = [];
  }
  if (migrate.length) await db.putMany('works', migrate);
  S.patterns = Object.fromEntries(patterns.map((p) => [p.host, p]));
  S.teams = teams.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const k of SETTING_KEYS) S.settings[k] = await getSetting(k, S.settings[k]);
  db.del('settings', 'tmdbKey').catch(() => {}); // limpieza de la versión anterior
}

export function setPref(key, value) {
  S.settings[key] = value;
  return setSetting(key, value);
}

export function newWork(data = {}) {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    type: 'manhwa',
    status: 'viendo',
    progress: { chapter: 0, season: 1, episode: 0, watched: 0 },
    total: null,
    rating: 0,
    favorite: false,
    cover: '',
    synopsis: '',
    genres: [],
    pubStatus: '',
    source: null,
    aliases: [],
    links: [],
    platform: '',
    chaptersUrl: '',
    seasons: null,
    year: null,
    watchedAt: null,
    notes: '',
    spoilers: [],
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

export async function saveWork(w, { touch = true } = {}) {
  if (touch) w.updatedAt = Date.now();
  const i = S.works.findIndex((x) => x.id === w.id);
  if (i >= 0) S.works[i] = w; else S.works.push(w);
  await db.put('works', w);
  return w;
}
export async function deleteWork(id) {
  S.works = S.works.filter((w) => w.id !== id);
  await db.del('works', id);
}
export const getWork = (id) => S.works.find((w) => w.id === id);

export async function savePattern(host, data) {
  const p = { host, ...data, at: Date.now() };
  S.patterns[host] = p;
  await db.put('patterns', p);
}
export async function deletePattern(host) {
  delete S.patterns[host];
  await db.del('patterns', host);
}

// Registro de actividad diaria (para la racha y el mapa de calor)
export function logActivity(n = 1) {
  const d = new Date();
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = { ...(S.settings.activity || {}) };
  a[k] = Math.max(0, (a[k] || 0) + n);
  return setPref('activity', a);
}

// ---------- progreso ----------
export function currentNumber(w) {
  return w.type === 'serie' ? w.progress.episode || 0 : w.progress.chapter || 0;
}
export function progressLabel(w, short = true) {
  const t = TYPES[w.type];
  if (w.type === 'pelicula') return w.status === 'terminado' ? 'Vista' : '';
  if (w.type === 'serie') return `T${w.progress.season || 1} · E${w.progress.episode || 0}`;
  const n = w.progress.chapter || 0;
  return `${short ? t.unit : t.unitLong[0].toUpperCase() + t.unitLong.slice(1)} ${n}${w.total ? ' / ' + w.total : ''}`;
}

export async function changeProgress(w, delta) {
  if (w.type === 'pelicula') return w;
  const p = { ...w.progress };
  if (w.type === 'serie') {
    p.episode = Math.max(0, (p.episode || 0) + delta);
    if (p.episode !== w.progress.episode) p.watched = Math.max(0, (p.watched || 0) + delta);
    // con temporadas conocidas: al pasar el último episodio salta a la siguiente temporada
    const eps = seasonEpisodes(w, p.season || 1);
    if (delta > 0 && eps && p.episode > eps) {
      const next = (w.seasons || []).find((s) => s.n > (p.season || 1));
      if (next) { p.season = next.n; p.episode = 1; w.seasonJump = next.n; }
      else { p.episode = eps; p.watched = Math.max(0, p.watched - 1); }
    }
    if (delta < 0 && p.episode === 0 && (p.season || 1) > 1 && w.progress.episode === 0) {
      const prev = [...(w.seasons || [])].reverse().find((s) => s.n < (p.season || 1));
      if (prev) { p.season = prev.n; p.episode = prev.eps; }
    }
    const tot = seriesTotals({ ...w, progress: p });
    if (delta > 0 && tot && tot.seen >= tot.total && w.status !== 'terminado' && /Final/i.test(w.pubStatus || '')) w.justFinished = true;
  } else {
    p.chapter = Math.max(0, Math.round(((p.chapter || 0) + delta) * 100) / 100);
    if (Math.floor(p.chapter) !== p.chapter && delta > 0) p.chapter = Math.floor(p.chapter);
  }
  const changed = p.episode !== w.progress.episode || p.chapter !== w.progress.chapter || p.season !== w.progress.season;
  w.progress = p;
  if (delta > 0 && changed) {
    if (w.status === 'pendiente') w.status = 'viendo';
    if (w.total && p.chapter >= w.total && w.type !== 'serie' && w.status !== 'terminado') w.justFinished = true;
    await logActivity(delta);
  }
  if (delta < 0 && changed) await logActivity(delta);
  return saveWork(w);
}

export async function setProgress(w, { chapter, season, episode }) {
  const p = { ...w.progress };
  if (chapter != null && !isNaN(chapter)) {
    const d = chapter - (p.chapter || 0);
    p.chapter = Math.max(0, chapter);
    if (d > 0) await logActivity(Math.min(d, 50));
  }
  if (season != null && !isNaN(season)) p.season = Math.max(1, season);
  if (episode != null && !isNaN(episode)) {
    const d = episode - (p.episode || 0);
    p.episode = Math.max(0, episode);
    p.watched = Math.max(0, (p.watched || 0) + d);
  }
  w.progress = p;
  return saveWork(w);
}

// ---------- links ----------
export function primaryLink(w) {
  return (w.links || [])[0] || null;
}
export function linkFromParsed(p) {
  return { id: uid(), url: p.url, platform: p.platform, host: p.host, slug: p.slug || '', rule: p.rule || null };
}

// Link para el botón "Continuar": siguiente capítulo si se puede armar, si no el link guardado
export function continueTarget(w) {
  if (isTrackOnly(w)) return null;
  const l = primaryLink(w);
  if (!l) return null;
  if (l.platform === 'web' && TYPES[w.type]?.reading !== undefined && w.type !== 'pelicula') {
    const n = currentNumber(w);
    const next = nextChapterUrl(l.url, n, S.patterns);
    // último visto: el capítulo actual (si se puede armar el link) o el link guardado
    const last = n > 0 ? { url: chapterUrl(l.url, n, S.patterns) || l.url, n } : null;
    if (next && n > 0) return { url: next, next: Math.floor(n) + 1, link: l, last };
    if (next && n === 0) {
      const first = chapterUrl(l.url, 1, S.patterns);
      return { url: first || l.url, next: first ? 1 : null, link: l, last: null };
    }
    // sitios donde el link no dice el capítulo (p. ej. Olympus): lista de capítulos + último link guardado
    // si no se puede deducir la página de capítulos, se busca la obra dentro del mismo sitio
    const auto = seriesUrl(l.url);
    const list = w.chaptersUrl || auto || siteSearchUrl(l.url, w.title);
    return { url: l.url, next: null, link: l, list, listGuessed: !w.chaptersUrl, search: siteSearchUrl(l.url, w.title), last: { url: l.url, n: n || null, saved: true } };
  }
  return { url: l.url, next: null, link: l, last: null };
}

// Abre un link en el navegador. Se usa un enlace real porque Safari (iPhone)
// bloquea window.open si no ocurre en el mismo toque del usuario.
// Obras cuyo link no trae el número del capítulo (no se puede armar el siguiente):
// el contador solo cambia pegando primero el link del último capítulo.
export function needsLink(w) {
  if (!w || isTrackOnly(w) || !TYPES[w.type]) return false;
  const l = primaryLink(w);
  if (!l || l.platform !== 'web') return false;
  return !continueTarget(w)?.next;
}

export function openUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Aplica un link analizado a una obra existente (actualiza progreso en vez de duplicar)
export async function applyLinkToWork(w, parsed) {
  if (isTrackOnly(w)) {
    // series y películas no guardan links: solo se toma la plataforma
    if (parsed.platform !== 'web') w.platform = parsed.platform;
    await saveWork(w);
    return null;
  }
  const links = [...(w.links || [])];
  const sameIdx = links.findIndex((l) => l.host === parsed.host && (!parsed.slug || !l.slug || l.slug === parsed.slug));
  const nl = linkFromParsed(parsed);
  if (sameIdx >= 0) links[sameIdx] = { ...links[sameIdx], ...nl, id: links[sameIdx].id };
  else links.unshift(nl);
  // el link recién pegado pasa a ser el principal
  const idx = links.findIndex((l) => l.url === nl.url);
  if (idx > 0) links.unshift(links.splice(idx, 1)[0]);
  w.links = links;
  let changed = null;
  if (parsed.chapter != null) {
    const cur = currentNumber(w);
    if (w.type === 'serie') {
      if (parsed.chapter > (w.progress.episode || 0)) { await setProgress(w, { episode: parsed.chapter }); changed = { from: cur, to: parsed.chapter }; }
    } else if (parsed.chapter > (w.progress.chapter || 0)) {
      await setProgress(w, { chapter: parsed.chapter });
      changed = { from: cur, to: parsed.chapter };
    } else if (parsed.chapter < (w.progress.chapter || 0)) {
      changed = { lower: true, from: cur, to: parsed.chapter };
    }
  }
  if (w.status === 'pendiente' && changed && !changed.lower) w.status = 'viendo';
  await saveWork(w);
  return changed;
}

export function analyzeUrl(raw) {
  const parsed = parseLink(raw, S.patterns);
  if (!parsed) return null;
  return { parsed, existing: findWorkForLink(parsed, S.works) };
}

// ---------- filtros ----------
export function filteredWorks(base = S.works) {
  const f = S.filters;
  const q = normKey(f.q);
  let list = base.filter((w) => {
    if (f.type !== 'all' && w.type !== f.type) return false;
    if (f.status !== 'all' && w.status !== f.status) return false;
    if (f.fav && !w.favorite) return false;
    if (f.platform !== 'all' && !platformsOf(w).includes(f.platform)) return false;
    if (q && !normKey(w.title).includes(q) && !(w.aliases || []).some((a) => normKey(a).includes(q))) return false;
    return true;
  });
  const sort = S.settings.sort;
  const by = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    title: (a, b) => a.title.localeCompare(b.title, 'es'),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.updatedAt - a.updatedAt,
    added: (a, b) => b.createdAt - a.createdAt,
  }[sort] || ((a, b) => b.updatedAt - a.updatedAt);
  return list.sort(by);
}

// ---------- respaldo ----------
export async function buildBackup() {
  const [works, patterns, teams, settings] = await Promise.all([db.all('works'), db.all('patterns'), db.all('teams'), db.all('settings')]);
  return {
    app: 'biblioteca-de-alejandria',
    version: 1,
    exportedAt: new Date().toISOString(),
    works, patterns, teams,
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
  };
}

export async function restoreBackup(data, mode = 'merge') {
  if (!data || data.app !== 'biblioteca-de-alejandria' || !Array.isArray(data.works)) throw new Error('El archivo no es un respaldo válido de Biblioteca de Alejandría.');
  const works = data.works.filter((w) => w && w.id && w.title).map((w) => newWork(w));
  if (mode === 'replace') {
    await Promise.all(['works', 'patterns', 'teams'].map((s) => db.clear(s)));
    await db.putMany('works', works);
    await db.putMany('patterns', (data.patterns || []).filter((p) => p.host));
    await db.putMany('teams', (data.teams || []).filter((t) => t.id));
    for (const [k, v] of Object.entries(data.settings || {})) if (SETTING_KEYS.includes(k) && k !== 'lastBackup') await setSetting(k, v);
  } else {
    const current = new Map((await db.all('works')).map((w) => [w.id, w]));
    const byTitle = new Map([...current.values()].map((w) => [w.type + ':' + normKey(w.title), w]));
    const toPut = [];
    for (const w of works) {
      const ex = current.get(w.id) || byTitle.get(w.type + ':' + normKey(w.title));
      if (!ex) toPut.push(w);
      else if ((w.updatedAt || 0) > (ex.updatedAt || 0)) toPut.push({ ...w, id: ex.id });
    }
    await db.putMany('works', toPut);
    await db.putMany('patterns', (data.patterns || []).filter((p) => p.host));
    await db.putMany('teams', (data.teams || []).filter((t) => t.id));
    const s = data.settings || {};
    if (s.activity) {
      const a = { ...(S.settings.activity || {}) };
      for (const [k, v] of Object.entries(s.activity)) a[k] = Math.max(a[k] || 0, v);
      await setSetting('activity', a);
    }
  }
  await loadAll();
  return works.length;
}
