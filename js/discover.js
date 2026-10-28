// Descubrir: recomendaciones de manhwas, mangas, animes, series y películas.
// Para ti (según lo que tienes y te gustó), tendencias, novedades y clásicos.
import { $, $$, esc, toast, ICONS, openSheet, vibrate } from './ui.js';
import { S, TYPES, newWork, saveWork } from './store.js';
import { normKey } from './links.js';
import { ATTRIBUTION, ANI_GENRES, genreEs, discoverAniList, aniRecommendations, discoverTV, tvByGenres, wikiTrending, tvmazeSeasons } from './api.js';
import { go } from './app.js';

const TABS = [
  ['parati', '✨', 'Para ti'], ['manhwa', '📗', 'Manhwa'], ['manga', '📕', 'Manga'], ['anime', '🌸', 'Anime'], ['serie', '📺', 'Series'], ['pelicula', '🎬', 'Películas'],
];
let tab = 'parati';
let genre = null;
const items = new Map(); // tarjetas en pantalla: clave → { r, kind }
const keyOf = (r) => `${r.source}:${r.sourceId}`;

// ¿Ya está en tu biblioteca?
export function inLibrary(r) {
  const names = new Set([r.title, ...(r.altTitles || [])].map(normKey).filter(Boolean));
  return S.works.find((w) => (w.source && w.source.api === r.source && String(w.source.id) === String(r.sourceId))
    || [w.title, ...(w.aliases || [])].some((t) => names.has(normKey(t))));
}

// ---------- recomendaciones personales ----------
// Se toman las obras que más te gustaron (favoritas, mejor calificadas, en curso) y se piden sus recomendaciones.
function seeds(type = null) {
  return S.works.filter((w) => w.source?.api === 'anilist' && (!type || w.type === type) && w.status !== 'abandonado')
    .sort((a, b) => (b.favorite - a.favorite) || ((b.rating || 0) - (a.rating || 0)) || ((b.lastOpened || b.updatedAt) - (a.lastOpened || a.updatedAt)))
    .slice(0, 4);
}
const kindMatches = (r, kind) => (kind === 'manhwa' ? /Corea/.test(r.extra) : kind === 'manga' ? !/Corea|China/.test(r.extra) : kind === 'pelicula' ? /Película/.test(r.extra) : kind === 'anime' ? !/Película/.test(r.extra) : true);
export async function forYou(kind = null, limit = 24) {
  const out = new Map();
  const groups = [];
  for (const w of seeds(kind)) {
    try {
      const recs = (await aniRecommendations(w.source.id, w.type)).filter((r) => !inLibrary(r) && (!kind || kindMatches(r, kind)));
      if (recs.length) groups.push({ because: w, list: recs });
      recs.forEach((r, i) => { const k = keyOf(r); const cur = out.get(k); out.set(k, { r, kind: w.type === 'anime' && /Película/.test(r.extra) ? 'pelicula' : w.type, score: (cur?.score || 0) + 12 - i, because: cur?.because || w.title }); });
    } catch { /* sin conexión */ }
  }
  return { flat: [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit), groups };
}
// Géneros que más tienes en un tipo de obra
function topGenres(types) {
  const c = {};
  S.works.filter((w) => types.includes(w.type)).forEach((w) => (w.genres || []).forEach((g) => { c[g] = (c[g] || 0) + 1 + (w.favorite ? 2 : 0) + (w.rating >= 4 ? 1 : 0); }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, 3);
}

// ---------- tarjetas ----------
function cardHTML(r, kind, i = 0, because = '') {
  items.set(keyOf(r), { r, kind });
  const have = inLibrary(r);
  return `<button class="dcard" data-key="${esc(keyOf(r))}" style="--i:${Math.min(i, 12)}">
    <span class="dcover">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}<i>${esc(r.title.slice(0, 2).toUpperCase())}</i>
      ${have ? '<span class="dhave">✓ La tienes</span>' : r.score ? `<span class="dscore">★ ${(r.score / 10).toFixed(1)}</span>` : ''}</span>
    <b>${esc(r.title)}</b>
    <small>${esc(because ? `Porque te gustó ${because}` : [r.year, r.genres?.[0] || (r.extra || '').split(' · ')[0]].filter(Boolean).join(' · '))}</small>
  </button>`;
}
const skeleton = (n = 5) => `<div class="drow">${Array.from({ length: n }, (_, i) => `<div class="dcard skel" style="--i:${i}"><span class="dcover"></span><b></b><small></small></div>`).join('')}</div>`;
function section(id, title, sub = '') {
  return `<section class="dsec" id="${id}"><div class="sec-head"><h2>${title}</h2>${sub ? `<span class="muted small">${sub}</span>` : ''}</div><div class="dsec-body">${skeleton()}</div></section>`;
}
async function fill(root, id, loader, kind, { because = false, empty = '' } = {}) {
  const box = $(`#${id} .dsec-body`, root);
  if (!box) return;
  try {
    let list = await loader();
    if (!box.isConnected) return;
    if (!list.length) { if (empty) box.innerHTML = `<p class="muted small pad">${empty}</p>`; else $(`#${id}`, root).remove(); return; }
    // primero lo que aún no tienes
    list = [...list.filter((x) => !inLibrary(x.r || x)), ...list.filter((x) => inLibrary(x.r || x))];
    box.innerHTML = `<div class="drow">${list.map((x, i) => (x.r ? cardHTML(x.r, x.kind || kind, i, because ? x.because : '') : cardHTML(x, x.kind || kind, i))).join('')}</div>`;
  } catch {
    if (box.isConnected) box.innerHTML = '<p class="muted small pad">No se pudo cargar (¿sin conexión?).</p>';
  }
}

// ======================= PANTALLA =======================
export function renderDiscover(root, param) {
  if (TABS.some(([k]) => k === param)) tab = param;
  root.innerHTML = `
  <header class="topbar">
    <a href="#/" class="icon-btn" aria-label="Volver">${ICONS.back}</a>
    <div class="grow"><h1 class="page-title">✨ Descubrir</h1><p class="sub">Recomendaciones para leer y ver</p></div>
    <button class="icon-btn" data-global-search aria-label="Buscar en tu biblioteca">${ICONS.search}</button>
  </header>
  <div class="chips scroll-x dtabs" id="d-tabs">${TABS.map(([k, e, l]) => `<button class="chip ${k === tab ? 'on' : ''}" data-tab="${k}">${e} ${l}</button>`).join('')}</div>
  <div id="d-body"></div>
  <p class="attr">Datos de <a href="${ATTRIBUTION.anilist.url}" target="_blank" rel="noopener">AniList</a>, <a href="${ATTRIBUTION.tvmaze.url}" target="_blank" rel="noopener">TVmaze</a> (CC BY-SA 4.0) y <a href="${ATTRIBUTION.wikipedia.url}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA 4.0)</p>`;
  $('#d-tabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab; genre = null;
    $$('#d-tabs .chip', root).forEach((x) => x.classList.toggle('on', x === b));
    history.replaceState(null, '', '#/descubrir/' + tab);
    vibrate(6);
    drawTab(root);
  });
  $('#d-body', root).addEventListener('click', onCardClick);
  drawTab(root);
  const on = $('#d-tabs .on', root);
  if (on) $('#d-tabs', root).scrollLeft = on.offsetLeft - 16;
}
function onCardClick(e) {
  const c = e.target.closest('.dcard[data-key]');
  if (!c) return;
  const it = items.get(c.dataset.key);
  if (it) openPreview(it.r, it.kind);
}

function drawTab(root) {
  const body = $('#d-body', root);
  items.clear();
  body.classList.remove('tab-in'); void body.offsetWidth; body.classList.add('tab-in');
  if (tab === 'parati') {
    const hasSeeds = seeds().length > 0;
    const serieGenres = topGenres(['serie']);
    body.innerHTML = `
      ${hasSeeds ? '' : '<div class="banner">💡 Agrega manhwas, mangas o animes (eligiéndolos de la búsqueda al agregarlos) y marca tus favoritos: las recomendaciones serán a tu gusto.</div>'}
      <div id="d-because"></div>
      ${serieGenres.length ? section('d-tvfor', '📺 Series para ti', serieGenres.slice(0, 2).join(' · ')) : ''}
      ${section('d-trend-manhwa', '🔥 Manhwas en tendencia')}
      ${section('d-trend-anime', '🔥 Animes en tendencia')}
      ${section('d-trend-movies', '🎬 Películas de las que se habla')}
      ${section('d-trend-series', '📺 Series de las que se habla')}`;
    (async () => {
      const box = $('#d-because', body);
      const { groups } = await forYou();
      if (!box.isConnected) return;
      box.innerHTML = groups.slice(0, 4).map((g, gi) => `<section class="dsec"><div class="sec-head"><h2>Porque te gustó <em>${esc(g.because.title)}</em></h2></div>
        <div class="drow">${g.list.slice(0, 12).map((r, i) => cardHTML(r, g.because.type === 'anime' && /Película/.test(r.extra) ? 'pelicula' : g.because.type, i + gi)).join('')}</div></section>`).join('');
    })();
    if (serieGenres.length) fill(body, 'd-tvfor', async () => (await tvByGenres(serieGenres)).filter((r) => !inLibrary(r)).slice(0, 20), 'serie');
    fill(body, 'd-trend-manhwa', () => discoverAniList('manhwa', 'trending'), 'manhwa');
    fill(body, 'd-trend-anime', () => discoverAniList('anime', 'trending'), 'anime');
    fill(body, 'd-trend-movies', () => wikiTrending('pelicula'), 'pelicula');
    fill(body, 'd-trend-series', () => wikiTrending('serie'), 'serie');
    return;
  }
  if (['manhwa', 'manga', 'anime'].includes(tab)) {
    const k = tab, name = TYPES[k].label.toLowerCase() + (k === 'manhwa' || k === 'manga' ? 's' : 's');
    body.innerHTML = `
      ${seeds(k).length ? section('d-for', `✨ Para ti`, `según tus ${name}`) : ''}
      ${section('d-trend', `🔥 En tendencia`)}
      ${section('d-new', `🆕 Nuevos`, 'empezaron hace poco')}
      ${section('d-classic', `🏛️ Clásicos imprescindibles`, 'los mejor calificados')}
      <section class="dsec"><div class="sec-head"><h2>🎭 Por género</h2></div>
        <div class="chips scroll-x" id="d-genres">${ANI_GENRES.map((g) => `<button class="chip ${genreEs(g) === genre ? 'on' : ''}" data-genre="${esc(genreEs(g))}">${esc(genreEs(g))}</button>`).join('')}</div>
        <div id="d-genre-body"><p class="muted small pad">Elige un género para ver los más populares.</p></div></section>`;
    if (seeds(k).length) fill(body, 'd-for', async () => (await forYou(k)).flat, k, { because: true, empty: 'Aún no hay recomendaciones para ti en este tipo.' });
    fill(body, 'd-trend', () => discoverAniList(k, 'trending'), k);
    fill(body, 'd-new', () => discoverAniList(k, 'new'), k);
    fill(body, 'd-classic', () => discoverAniList(k, 'classic'), k);
    $('#d-genres', body).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-genre]');
      if (!b) return;
      genre = b.dataset.genre;
      $$('#d-genres .chip', body).forEach((x) => x.classList.toggle('on', x === b));
      const gb = $('#d-genre-body', body);
      gb.innerHTML = skeleton(6);
      try {
        const list = await discoverAniList(k, 'genre', { genre });
        if (gb.isConnected) gb.innerHTML = `<div class="dgrid">${list.map((r, i) => cardHTML(r, k, i)).join('')}</div>`;
      } catch { if (gb.isConnected) gb.innerHTML = '<p class="muted small pad">No se pudo cargar (¿sin conexión?).</p>'; }
    });
    return;
  }
  if (tab === 'serie') {
    const g = topGenres(['serie']);
    body.innerHTML = `
      ${g.length ? section('d-for', '✨ Para ti', g.slice(0, 2).join(' · ')) : ''}
      ${section('d-trend', '🔥 De las que se habla', 'lo más buscado en Wikipedia en español')}
      ${section('d-new', '🆕 Nuevas', 'estrenadas este último año')}
      ${section('d-pop', '⭐ Las más seguidas')}
      ${section('d-top', '🏛️ Mejor calificadas')}`;
    if (g.length) fill(body, 'd-for', async () => (await tvByGenres(g)).filter((r) => !inLibrary(r)).slice(0, 20), 'serie');
    fill(body, 'd-trend', () => wikiTrending('serie'), 'serie', { empty: 'No hay series en tendencia hoy.' });
    fill(body, 'd-new', () => discoverTV('new'), 'serie');
    fill(body, 'd-pop', () => discoverTV('popular'), 'serie');
    fill(body, 'd-top', () => discoverTV('top'), 'serie');
    return;
  }
  // películas
  body.innerHTML = `
    ${section('d-trend', '🔥 De las que se habla', 'lo más buscado en Wikipedia en español')}
    ${section('d-anime', '🌸 Películas de anime populares')}
    ${section('d-anime-new', '🆕 Películas de anime nuevas')}
    ${section('d-anime-classic', '🏛️ Clásicos del anime en el cine')}`;
  fill(body, 'd-trend', () => wikiTrending('pelicula'), 'pelicula', { empty: 'No hay películas en tendencia hoy.' });
  fill(body, 'd-anime', () => discoverAniList('pelicula', 'trending'), 'pelicula');
  fill(body, 'd-anime-new', () => discoverAniList('pelicula', 'new'), 'pelicula');
  fill(body, 'd-anime-classic', () => discoverAniList('pelicula', 'classic'), 'pelicula');
}

// ======================= VISTA PREVIA =======================
export function openPreview(r, kind) {
  const have = inLibrary(r);
  const attr = ATTRIBUTION[r.source];
  const s = openSheet(`
    <div class="dprev">
      <div class="dprev-cover">${r.cover ? `<img src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer">` : ''}</div>
      <div class="dprev-info">
        <span class="badge type-${kind}">${TYPES[kind]?.label || ''}</span>
        <h3>${esc(r.title)}</h3>
        <p class="muted small">${esc([r.year, r.extra, r.pubStatus, r.total ? `${r.total} ${TYPES[kind]?.reading ? 'capítulos' : kind === 'pelicula' ? '' : 'episodios'}` : ''].filter(Boolean).join(' · '))}</p>
        ${r.score ? `<p class="dprev-score">★ ${(r.score / 10).toFixed(1)} <small>/ 10</small></p>` : ''}
      </div>
    </div>
    ${r.genres?.length ? `<div class="chips wrap">${r.genres.slice(0, 6).map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}
    ${r.synopsis ? `<p class="dprev-syn" id="dp-syn">${esc(r.synopsis)}</p>${r.synopsis.length > 320 ? '<button class="link-btn small" id="dp-more">Leer más</button>' : ''}` : ''}
    <div class="col-btns dprev-actions">
      ${have ? `<button class="btn primary block" data-open="${have.id}">${ICONS.book} Ya la tienes · abrir</button>`
        : `<button class="btn primary block" data-add="pendiente">＋ Agregar como pendiente</button>
           <button class="btn block" data-add="viendo">${TYPES[kind]?.reading ? '📖 Ya la estoy leyendo' : '▶ Ya la estoy viendo'}</button>`}
    </div>
    ${attr ? `<p class="muted xsmall center">Datos de ${esc(attr.name)}</p>` : ''}`, { cls: 'tall' });
  $('#dp-more', s.el)?.addEventListener('click', (e) => { $('#dp-syn', s.el).classList.add('open'); e.currentTarget.remove(); });
  s.el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { s.close(); go('#/obra/' + o.dataset.open); return; }
    const a = e.target.closest('[data-add]');
    if (!a) return;
    const w = newWork({
      type: kind, title: r.title, cover: r.cover || '', synopsis: r.synopsis || '', genres: r.genres || [], pubStatus: r.pubStatus || '',
      total: r.total || null, year: r.year || null, aliases: [...new Set(r.altTitles || [])].filter((t) => t !== r.title),
      source: { api: r.source, id: r.sourceId, url: r.sourceUrl }, status: a.dataset.add,
    });
    await saveWork(w);
    if (r.source === 'tvmaze' && kind === 'serie') tvmazeSeasons(r.sourceId).then((seasons) => { if (seasons.length) { w.seasons = seasons; w.seasonsAt = Date.now(); saveWork(w, { touch: false }); } }).catch(() => {});
    vibrate(15);
    s.close();
    toast(`${r.title} agregada a tu biblioteca`, { icon: '✨', action: 'Abrir', onAction: () => go('#/obra/' + w.id) });
    $$(`.dcard[data-key="${CSS.escape(keyOf(r))}"] .dcover`).forEach((c) => { c.querySelector('.dscore')?.remove(); if (!c.querySelector('.dhave')) c.insertAdjacentHTML('beforeend', '<span class="dhave">✓ La tienes</span>'); });
  });
}

// ---------- recomendaciones cortas (inicio y "¿Qué sigue?") ----------
export async function quickPicks(limit = 12) {
  const { flat } = await forYou(null, limit);
  if (flat.length >= 4) return flat;
  // sin obras de AniList todavía: tendencias
  const [m, a] = await Promise.all([discoverAniList('manhwa', 'trending').catch(() => []), discoverAniList('anime', 'trending').catch(() => [])]);
  const mix = [];
  for (let i = 0; i < 8; i++) { if (m[i]) mix.push({ r: m[i], kind: 'manhwa' }); if (a[i]) mix.push({ r: a[i], kind: 'anime' }); }
  return [...flat, ...mix.filter((x) => !inLibrary(x.r))].slice(0, limit);
}
export function picksHTML(list, because = true) {
  return list.map((x, i) => cardHTML(x.r, x.kind, i, because ? x.because : '')).join('');
}
export { onCardClick as onPickClick };
