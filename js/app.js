// Biblioteca de Alejandría — arranque, rutas, biblioteca y detalle de obra.
import { $, $$, esc, toast, coverHTML, rollNumber, floatText, confetti, tilt, vibrate, debounce, ICONS, relTime, reducedMotion, closeAllSheets, confirmDialog, whenSettled, openSheet, onLongPress, sheetsOpen } from './ui.js';
import { S, TYPES, STATUSES, statusLabel, statusHint, loadAll, saveWork, deleteWork, getWork, changeProgress, setProgress, progressLabel, continueTarget, openUrl, filteredWorks, searchWorks, setPref, currentNumber, applyLinkToWork, needsLink, isTrackOnly, platformsOf, seasonEpisodes, seriesTotals, BROWSERS, browserChoices, setBrowserPicker } from './store.js';
import { PLATFORMS, STREAMING, parseLink } from './links.js';
import { ATTRIBUTION, tvmazeShow, tvmazeFind, wikidataIdFor, wikidataCast, pubStatusEs } from './api.js';
import { openEditor, openPasteSheet, openAddChooser } from './editor.js';
import { renderPlatforms, renderPlatform, renderStats, renderSettings, renderImport, todayCount, isIOS, isStandalone, openInstallHelp } from './sections.js';
import { renderSports } from './sports.js';
import { renderDiscover, quickPicks, picksHTML, onPickClick } from './discover.js';

const view = $('#view');
export const APP_VERSION = '2.5.0';

// ---------- iconos SVG en el HTML estático ----------
function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => { if (!el.firstChild) el.innerHTML = ICONS[el.dataset.icon] || ''; });
}

// ---------- navegación ----------
export function go(hash) {
  closeAllSheets();
  whenSettled(() => { location.hash = hash; });
}

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: name || 'home', param: rest.join('/') ? decodeURIComponent(rest.join('/')) : null };
}

let lastRoute = null;
let lastRouteKeyBefore = null;
let lastDetailId = null; // para que la portada vuelva a su tarjeta al regresar
const clearVTNames = () => $$('[style*="view-transition-name"]').forEach((el) => { el.style.viewTransitionName = ''; });
// Al tocar una portada se marca para la transición compartida
document.addEventListener('click', (e) => {
  const link = e.target.closest('.card-link, .c-cover, .sp-cover');
  if (!link) return;
  clearVTNames();
  const cover = link.querySelector('.cover');
  if (cover) cover.style.viewTransitionName = 'vt-cover';
}, true);
// Los links guardados se abren con el navegador elegido en Ajustes
document.addEventListener('click', (e) => {
  const a = e.target.closest('a.link-url');
  if (!a) return;
  e.preventDefault();
  openUrl(a.href);
});
export async function render({ keepScroll = false } = {}) {
  const r = parseRoute();
  if (r.name === 'nuevo') { history.replaceState(null, '', '#/'); await render(); openEditor(); return; }
  if (r.name === 'pegar') { history.replaceState(null, '', '#/'); await render(); openPasteSheet(); return; }
  const routeKey = r.name + '/' + (r.param || '');
  const changed = routeKey !== lastRoute;
  const scrollY = window.scrollY;
  lastRoute = routeKey;
  const map = {
    home: renderHome, obra: (el) => renderDetail(el, r.param), plataformas: renderPlatforms, plataforma: (el) => renderPlatform(el, r.param),
    descubrir: (el) => renderDiscover(el, r.param), deportes: (el) => renderSports(el, r.param), futbol: (el) => renderSports(el, 'futbol', r.param), stats: renderStats, ajustes: renderSettings, importar: renderImport,
  };
  const fn = map[r.name] || renderHome;
  const update = async () => {
    view.classList.remove('view-enter');
    await fn(view);
    hydrateIcons(view);
    if (changed) window.scrollTo(0, 0);
    else if (keepScroll) window.scrollTo(0, scrollY);
  };
  const useVT = changed && document.startViewTransition && !reducedMotion() && lastRouteKeyBefore !== null;
  lastRouteKeyBefore = routeKey;
  if (useVT) {
    const t = document.startViewTransition(update);
    t.ready.catch(() => {});
    // si el navegador no llega a pintar (pestaña en segundo plano), se salta la animación
    const guard = setTimeout(() => t.skipTransition(), 450);
    await t.updateCallbackDone.catch(() => {});
    clearTimeout(guard);
    t.finished.catch(() => {}).finally(clearVTNames);
  } else {
    await update();
    if (changed) { void view.offsetWidth; view.classList.add('view-enter'); }
  }
  const tab = { home: 'home', obra: 'home', descubrir: 'home', plataformas: 'plataformas', plataforma: 'plataformas', futbol: 'deportes', deportes: 'deportes', stats: 'stats', ajustes: 'stats', importar: 'stats' }[r.name] || 'home';
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}
window.addEventListener('hashchange', () => render());
document.addEventListener('click', (e) => { if (e.target.closest('[data-global-search]')) openSearchSheet(); });
// Tocar la pestaña en la que ya estás te sube al inicio (o vuelve a la pantalla principal de esa pestaña)
document.querySelector('.tabbar')?.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-tab]');
  if (!a) return;
  const ic = a.querySelector('.ic');
  ic?.classList.remove('tap'); void ic?.offsetWidth; ic?.classList.add('tap');
  if (a.classList.contains('active') && location.hash === a.getAttribute('href')) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
});

// ---------- tarjetas ----------
export function cardHTML(w, i = 0) {
  const st = STATUSES[w.status];
  const plats = platformsOf(w);
  const pct = w.total ? Math.min(100, (currentNumber(w) / w.total) * 100) : 0;
  return `<article class="card ${w.favorite ? 'is-fav' : ''}" data-id="${w.id}" style="--i:${Math.min(i, 20)};--sc:${st?.color}">
    <a href="#/obra/${w.id}" class="card-link" aria-label="${esc(w.title)}">
      ${coverHTML(w)}
      <div class="card-badges">
        <span class="badge type-${w.type}">${TYPES[w.type].label}</span>
        ${w.favorite ? `<span class="badge fav" aria-label="Favorito">${ICONS.heart}</span>` : ''}
      </div>
      ${plats.length ? `<div class="card-plats">${plats.map((p) => `<i style="--c:${PLATFORMS[p]?.color}" title="${esc(PLATFORMS[p]?.name)}"></i>`).join('')}</div>` : ''}
      ${pct ? `<div class="card-pbar"><i style="width:${pct}%"></i></div>` : ''}
    </a>
    <div class="card-info">
      <h3>${esc(w.title)}</h3>
      <div class="card-meta"><span class="sdot" style="--c:${st?.color}"></span><span>${esc(statusLabel(w.status, w.type))}</span></div>
      <div class="card-row">
        <span class="card-prog" data-prog>${esc(progressLabel(w))}</span>
        ${w.lastRead || w.watchedAt ? `<span class="card-when">🕒 ${esc(fmtWhen(w.lastRead || w.watchedAt))}</span>` : ''}
        ${w.rating ? `<span class="card-stars" aria-label="${w.rating} estrellas">★ ${w.rating}</span>` : ''}
      </div>
    </div>
  </article>`;
}

function finishPrompt(w) {
  toast(`¡Llegaste al final de ${w.title}!`, {
    icon: '🏁', action: 'Marcar terminado', onAction: async () => {
      w.status = 'terminado'; await saveWork(w); confetti(); render({ keepScroll: true });
    },
  });
}

// ---------- biblioteca ----------
// Última vez que avanzaste o abriste el link (si nunca, la última edición)
const lastTouch = (w) => Math.max(w.lastRead || 0, w.lastOpened || 0) || w.updatedAt || 0;
function continueList() {
  return S.works.filter((w) => ['viendo', 'emision'].includes(w.status)).sort((a, b) => lastTouch(b) - lastTouch(a)).slice(0, 12);
}

let greeted = false;
// Fecha y hora de hoy, en pequeño debajo del nombre
const clockText = () => { const d = new Date(); const t = d.toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); return t.charAt(0).toUpperCase() + t.slice(1); };
setInterval(() => { const c = document.getElementById('clock'); if (c) c.textContent = clockText(); }, 20000);
const showInstallHint = () => !isStandalone() && (isIOS() || installPrompt) && !(S.settings.installHint > Date.now() - 30 * 864e5);
async function renderHome(root) {
  const f = S.filters;
  const total = S.works.length;
  const backupDays = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / 864e5) : null;
  const showBackup = total >= 3 && (backupDays == null || backupDays > 14) && !(S.settings.backupSnooze > Date.now());
  const cont = continueList();
  const [, ...rest] = cont;
  const spotPool = spotlightPool(cont);
  const spot = spotPool[0];
  const h = new Date().getHours();
  const hello = h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const today = todayCount();
  root.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <a href="#/" class="brand-logo" id="brand-logo" aria-label="Ir al inicio"><img src="icons/icon.svg" alt="" width="38" height="38"></a>
      <div class="brand-text"><h1 class="brand-title ${greeted ? '' : 'greeting'}" id="brand-title">${greeted ? 'Biblioteca de Alejandría' : `${hello} <span class="wave">👋</span>`}</h1><p class="sub">${total} ${total === 1 ? 'obra' : 'obras'}${today ? ` · hoy ${today} ${today === 1 ? 'avance' : 'avances'}` : ''}</p><p class="clock" id="clock">${clockText()}</p></div>
    </div>
    <a href="#/ajustes" class="icon-btn" aria-label="Ajustes">${ICONS.gear}</a>
  </header>
  ${showInstallHint() ? `<div class="banner install-hint"><span>📲 Instala la app en tu ${isIOS() ? 'iPhone' : 'teléfono'} para usarla a pantalla completa.</span><button class="btn sm" id="ih-how">Cómo</button><button class="icon-btn xs" id="ih-x" aria-label="Ocultar">${ICONS.close}</button></div>` : ''}
  ${showBackup ? `<div class="banner warn"><span>💾 ${backupDays == null ? 'Aún no has hecho un respaldo.' : `Tu último respaldo fue ${relTime(S.settings.lastBackup)}.`}</span><a href="#/ajustes" class="btn sm">Respaldar</a></div>` : ''}
  <div class="search-wrap">
    <div class="searchbar">
      <span class="ic">${ICONS.search}</span>
      <input id="q" type="search" placeholder="Buscar en tu biblioteca…" value="${esc(f.q)}" autocomplete="off" enterkeyhint="search" role="combobox" aria-expanded="false" aria-controls="suggest">
      <button class="icon-btn xs q-clear ${f.q ? '' : 'hidden'}" id="q-clear" aria-label="Borrar búsqueda">${ICONS.close}</button>
      <button class="paste-btn" id="paste-btn">${ICONS.link}<span>Pegar link</span></button>
    </div>
    <div class="suggest" id="suggest" role="listbox" hidden></div>
  </div>
  ${spot && !f.q ? `<div class="spot-deck" id="spot-deck">${spotlightHTML(spot)}${spotPool.length > 1 ? `<div class="spot-dots" role="tablist" aria-label="Obras destacadas">${spotPool.map((w, i) => `<button class="${i ? '' : 'on'}" data-spot="${i}" aria-label="${esc(w.title)}"><i></i></button>`).join('')}</div>` : ''}</div>` : ''}
  ${!f.q ? `<div class="pick-row ${total >= 2 ? '' : 'solo'}">
    ${total >= 2 ? `<button class="next-pick" id="next-pick"><span class="dice">🎲</span><span><b>¿Qué sigue?</b><small>La suerte elige qué seguir</small></span></button>` : ''}
    <a class="next-pick disc" href="#/descubrir"><span class="dice">✨</span><span><b>Descubrir</b><small>Recomendaciones nuevas y clásicas</small></span></a>
  </div>` : ''}
  ${rest.length && !f.q ? `
  <section class="continue">
    <div class="sec-head"><h2>Continuar</h2><span class="muted small">${cont.length} en curso</span></div>
    <div class="carousel" id="carousel">
      ${rest.map((w, i) => { const t = continueTarget(w); const pct = progressPct(w); return `
        <div class="c-item" data-id="${w.id}" style="--i:${i}">
          <a href="#/obra/${w.id}" class="c-cover">${coverHTML(w)}${pct != null ? `<span class="c-bar"><i style="width:${pct}%"></i></span>` : ''}</a>
          <div class="c-title">${esc(w.title)}</div>
          <div class="c-row"><span class="muted small">${esc(progressLabel(w))}</span>
          ${t ? `<button class="c-go" data-continue="${w.id}" ${!t.next && t.list ? 'data-mode="list"' : ''} aria-label="Continuar">${ICONS.play}</button>` : ''}</div>
        </div>`; }).join('')}
    </div>
  </section>` : ''}
  ${!f.q ? `<section class="continue" id="for-you-sec">
    <div class="sec-head"><h2>✨ Te puede gustar</h2><a href="#/descubrir" class="link-btn small">Ver más</a></div>
    <div class="drow" id="for-you">${Array.from({ length: 4 }, (_, i) => `<div class="dcard skel" style="--i:${i}"><span class="dcover"></span><b></b><small></small></div>`).join('')}</div>
  </section>` : ''}
  <div class="${total ? '' : 'hidden'}">
  <div class="sec-head types-head"><h2>Explorar</h2></div>
  <div class="type-cards" id="type-chips" role="tablist">
    ${[['all', '✨', 'Todo'], ...Object.entries(TYPES).map(([k, t]) => [k, t.emoji, t.label])].map(([k, emo, l], i) => `<button class="tcard type-${k} ${f.type === k ? 'on' : ''}" data-type="${k}" role="tab" aria-selected="${f.type === k}" style="--i:${i}">
      <span class="tc-emoji">${emo}</span><span class="tc-label">${l}</span><span class="tc-count">${((n) => `${n} ${n === 1 ? 'obra' : 'obras'}`)(k === 'all' ? total : S.works.filter((w) => w.type === k).length)}</span></button>`).join('')}
  </div>
  <div class="filter-row">
    <label class="select"><select id="f-status" aria-label="Estado">
      <option value="all">Todos los estados</option>
      ${Object.entries(STATUSES).map(([k, s]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}
    </select></label>
    <label class="select"><select id="f-platform" aria-label="Plataforma">
      <option value="all">Todas las plataformas</option>
      ${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}" ${f.platform === k ? 'selected' : ''}>${p.name}</option>`).join('')}
    </select></label>
    <button class="icon-btn sm ${f.fav ? 'on-fav' : ''}" id="f-fav" aria-pressed="${f.fav}" aria-label="Solo favoritos">${ICONS.heart}</button>
    <label class="select compact"><select id="f-sort" aria-label="Ordenar">
      ${[['updated', 'Recientes'], ['title', 'A–Z'], ['rating', 'Mejor calificadas'], ['added', 'Agregadas']].map(([k, l]) => `<option value="${k}" ${S.settings.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
    <button class="icon-btn sm" id="f-view" aria-label="Cambiar vista">${S.settings.view === 'grid' ? ICONS.list : ICONS.grid}</button>
  </div>
  </div>
  <div id="grid"></div>`;
  renderGrid();

  const q = $('#q', root);
  const sug = $('#suggest', root);
  const showSuggest = () => {
    const v = q.value.trim();
    $('#q-clear', root).classList.toggle('hidden', !v);
    if (!v) { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
    const found = searchWorks(v, 6);
    const all = filteredWorks().length;
    sug.innerHTML = (found.length ? found.map((w, i) => `<button class="sg-item" role="option" data-open-work="${w.id}" style="--i:${i}">
        ${coverHTML(w, 'xs')}
        <span class="sg-text"><b>${esc(w.title)}</b><small>${TYPES[w.type].emoji} ${TYPES[w.type].label} · ${esc(progressLabel(w) || statusLabel(w.status, w.type))}</small></span>
        <span class="sdot" style="--c:${STATUSES[w.status]?.color}"></span></button>`).join('')
      : `<div class="sg-empty">No tienes nada parecido a "<b>${esc(v)}</b>".</div>`)
      + `<div class="sg-foot">${all > 0 ? `<button class="link-btn small" data-sg="all">Ver ${all} ${all === 1 ? 'resultado' : 'resultados'} abajo</button>` : ''}<button class="link-btn small" data-sg="add">＋ Agregar "${esc(v.slice(0, 30))}"</button></div>`;
    sug.hidden = false;
    q.setAttribute('aria-expanded', 'true');
  };
  q.addEventListener('input', debounce(() => { f.q = q.value; renderGrid(); showSuggest(); }, 140));
  q.addEventListener('focus', () => { if (q.value.trim()) showSuggest(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { sug.hidden = true; q.blur(); }
    if (e.key === 'Enter') { const first = sug.querySelector('[data-open-work]'); if (first && !sug.hidden) first.click(); }
  });
  q.addEventListener('blur', () => setTimeout(() => { if (!sug.contains(document.activeElement)) sug.hidden = true; }, 180));
  sug.addEventListener('pointerdown', (e) => e.preventDefault()); // no cerrar antes del toque
  sug.addEventListener('click', (e) => {
    const it = e.target.closest('[data-open-work]');
    if (it) { sug.hidden = true; vibrate(8); go('#/obra/' + it.dataset.openWork); return; }
    const a = e.target.closest('[data-sg]');
    if (a?.dataset.sg === 'all') { sug.hidden = true; q.blur(); $('#grid', root).scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }
    if (a?.dataset.sg === 'add') { sug.hidden = true; q.blur(); openEditor(null, { prefill: { title: q.value.trim() } }); }
  });
  $('#q-clear', root).onclick = () => { q.value = ''; f.q = ''; renderGrid(); showSuggest(); q.focus(); };
  $('#paste-btn', root).onclick = () => openPasteSheet();
  $('#type-chips', root).addEventListener('click', (e) => {
    const c = e.target.closest('[data-type]');
    if (!c) return;
    f.type = c.dataset.type;
    $$('#type-chips .tcard').forEach((x) => { x.classList.toggle('on', x === c); x.setAttribute('aria-selected', x === c); });
    vibrate(8);
    c.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    renderGrid();
  });
  $('#f-status', root).onchange = (e) => { f.status = e.target.value; renderGrid(); };
  $('#f-platform', root).onchange = (e) => { f.platform = e.target.value; renderGrid(); };
  $('#f-sort', root).onchange = async (e) => { await setPref('sort', e.target.value); renderGrid(); };
  $('#f-fav', root).onclick = (e) => { f.fav = !f.fav; e.currentTarget.classList.toggle('on-fav', f.fav); e.currentTarget.setAttribute('aria-pressed', f.fav); renderGrid(); };
  $('#f-view', root).onclick = async (e) => {
    const btn = e.currentTarget;
    await setPref('view', S.settings.view === 'grid' ? 'list' : 'grid');
    btn.innerHTML = S.settings.view === 'grid' ? ICONS.list : ICONS.grid;
    renderGrid();
  };
  // el saludo se muestra al abrir la app y luego cambia al nombre
  if (!greeted) {
    greeted = true;
    setTimeout(() => {
      const t = $('#brand-title');
      if (!t) return;
      t.classList.add('swap-out');
      setTimeout(() => { t.innerHTML = 'Biblioteca de Alejandría'; t.classList.remove('greeting', 'swap-out'); t.classList.add('swap-in'); }, reducedMotion() ? 0 : 320);
    }, 2200);
  }
  $('#ih-how', root)?.addEventListener('click', () => { if (!promptInstall()) openInstallHelp(); });
  $('#ih-x', root)?.addEventListener('click', async (e) => { e.currentTarget.closest('.banner').remove(); await setPref('installHint', Date.now()); });
  root.addEventListener('click', onContinueClick);
  root.addEventListener('click', onCardClick);
  if (spot && !f.q) startSpotRotation(root, spotPool);
  $('#next-pick', root)?.addEventListener('click', openRoulette);
  // el logo vuelve al inicio: limpia la búsqueda y sube
  $('#brand-logo', root)?.addEventListener('click', (e) => {
    e.preventDefault();
    vibrate(8);
    const logo = e.currentTarget;
    logo.classList.remove('spin'); void logo.offsetWidth; logo.classList.add('spin');
    if (S.filters.q || S.filters.type !== 'all' || S.filters.status !== 'all' || S.filters.platform !== 'all' || S.filters.fav) {
      Object.assign(S.filters, { q: '', type: 'all', status: 'all', platform: 'all', fav: false });
      render();
    }
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  // recomendaciones en el inicio
  const fy = $('#for-you', root);
  if (fy) {
    fy.addEventListener('click', onPickClick);
    quickPicks(12).then((list) => {
      if (!fy.isConnected) return;
      if (list.length) fy.innerHTML = picksHTML(list); else $('#for-you-sec', root)?.remove();
    }).catch(() => $('#for-you-sec', root)?.remove());
  }
  // al volver del detalle, la portada regresa a su tarjeta
  if (lastDetailId) {
    const back = root.querySelector(`[data-id="${lastDetailId}"] .cover`);
    if (back && document.startViewTransition) back.style.viewTransitionName = 'vt-cover';
    lastDetailId = null;
  }
}

function progressPct(w) {
  if (w.type === 'serie') { const tot = seriesTotals(w); return tot ? Math.round((tot.seen / tot.total) * 100) : null; }
  return w.total ? Math.min(100, Math.round((currentNumber(w) / w.total) * 100)) : null;
}

// Toda la tarjeta destacada (y cada elemento del carrusel) abre la obra, no solo la portada
function onCardClick(e) {
  const card = e.target.closest('.spotlight, .c-item');
  if (!card || e.target.closest('button, a') || card.dataset.swiped) return;
  const cover = card.querySelector('.cover');
  if (cover && document.startViewTransition) { clearVTNames(); cover.style.viewTransitionName = 'vt-cover'; }
  go('#/obra/' + card.dataset.id);
}

// La tarjeta destacada pasa sola a la siguiente obra en curso cada 5 segundos.
// Se puede deslizar o tocar los puntos; se detiene mientras la tocas o hay una ventana abierta.
const SPOT_MS = 5000;
function startSpotRotation(root, pool) {
  const deck = $('#spot-deck', root);
  if (!deck || pool.length < 2) return;
  let i = 0, holdUntil = 0, startX = null, startY = 0;
  const show = (n, dir = 1) => {
    i = (n + pool.length) % pool.length;
    const old = deck.querySelector('.spotlight');
    const tmp = document.createElement('div');
    tmp.innerHTML = spotlightHTML(pool[i]);
    const nu = tmp.firstElementChild;
    if (!reducedMotion()) nu.classList.add(dir > 0 ? 'sp-in-next' : 'sp-in-prev');
    old.replaceWith(nu);
    $$('.spot-dots button', deck).forEach((d, k) => { d.classList.toggle('on', k === i); d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; });
  };
  const timer = setInterval(() => {
    if (!deck.isConnected) { clearInterval(timer); return; }
    if (document.hidden || sheetsOpen() || Date.now() < holdUntil) return;
    show(i + 1);
  }, SPOT_MS);
  deck.addEventListener('click', (e) => {
    const d = e.target.closest('[data-spot]');
    if (!d) return;
    e.stopPropagation();
    holdUntil = Date.now() + SPOT_MS;
    show(+d.dataset.spot, +d.dataset.spot >= i ? 1 : -1);
  });
  // deslizar con el dedo
  deck.addEventListener('pointerdown', (e) => { startX = e.clientX; startY = e.clientY; holdUntil = Date.now() + 60e3; });
  const end = (e) => {
    holdUntil = Date.now() + SPOT_MS;
    if (startX == null) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const card = deck.querySelector('.spotlight');
      card.dataset.swiped = '1'; // que el deslizamiento no abra la obra
      setTimeout(() => delete card.dataset.swiped, 50);
      show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      vibrate(6);
    }
  };
  deck.addEventListener('pointerup', end);
  deck.addEventListener('pointercancel', () => { startX = null; holdUntil = Date.now() + SPOT_MS; });
}

// Tarjeta grande con la obra que estás siguiendo
// Qué se muestra en la tarjeta destacada: lo último que sigues, lo que llevas tiempo sin abrir,
// algún pendiente y alguna favorita (cada una con su motivo)
function spotlightPool(cont) {
  const out = [], seen = new Set();
  const add = (w, why) => { if (w && !seen.has(w.id)) { seen.add(w.id); out.push({ ...w, _why: why }); } };
  const DAY = 864e5;
  cont.filter((w) => Date.now() - lastTouch(w) <= 5 * DAY).slice(0, 2).forEach((w) => add(w, 'recent'));
  S.works.filter((w) => ['viendo', 'emision', 'pausado'].includes(w.status) && Date.now() - lastTouch(w) > 5 * DAY)
    .sort((a, b) => lastTouch(a) - lastTouch(b)).slice(0, 2).forEach((w) => add(w, 'stale'));
  const pend = S.works.filter((w) => w.status === 'pendiente').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  add(pend[0], 'pending');
  add(S.works.filter((w) => w.favorite && !['terminado', 'abandonado'].includes(w.status)).sort((a, b) => lastTouch(a) - lastTouch(b))[0], 'fav');
  cont.slice(2).forEach((w) => { if (out.length < 6) add(w, 'recent'); });
  return out.slice(0, 6);
}
function spotKicker(w) {
  const r = TYPES[w.type].reading;
  if (w._why === 'stale') {
    const d = Math.floor((Date.now() - lastTouch(w)) / 864e5);
    return `⏳ Llevas ${d} ${d === 1 ? 'día' : 'días'} sin ${r ? 'leerla' : 'verla'}`;
  }
  if (w._why === 'pending') return `📌 Pendiente · ¿${r ? 'la empiezas' : 'la ves'} hoy?`;
  if (w._why === 'fav') return '❤️ Una de tus favoritas';
  return r ? '📖 Sigues leyendo' : '📺 Sigues viendo';
}

function spotlightHTML(w) {
  const t = continueTarget(w);
  const pct = progressPct(w);
  const C = 2 * Math.PI * 26;
  return `<section class="spotlight" data-id="${w.id}" role="link" tabindex="0" aria-label="Abrir ${esc(w.title)}">
    <div class="sp-bg">${w.cover ? `<img src="${esc(w.cover)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
    <a href="#/obra/${w.id}" class="sp-cover" aria-label="${esc(w.title)}">${coverHTML(w)}</a>
    <div class="sp-info">
      <span class="sp-kicker ${w._why || ''}">${spotKicker(w)}</span>
      <h2>${esc(w.title)}</h2>
      <div class="sp-meta">
        ${pct != null ? `<svg class="ring" viewBox="0 0 60 60" aria-label="${pct}%"><circle cx="30" cy="30" r="26" class="ring-bg"/><circle cx="30" cy="30" r="26" class="ring-fg" style="--len:${C};--off:${C * (1 - pct / 100)}"/><text x="30" y="35" text-anchor="middle">${pct}%</text></svg>` : ''}
        <div><b>${esc(progressLabel(w, false))}</b><small>🕒 ${fmtWhen(w.lastRead || w.lastOpened || w.updatedAt)}</small></div>
      </div>
      <div class="sp-actions">
        ${t ? (t.next
          ? `<button class="btn primary sm" data-continue="${w.id}">${ICONS.play} ${TYPES[w.type].unit} ${t.next}</button>${t.last ? `<button class="btn sm ghost-glass" data-continue="${w.id}" data-mode="last">↺ ${TYPES[w.type].unit} ${t.last.n}</button>` : ''}`
          : t.list
            ? `<button class="btn primary sm" data-continue="${w.id}" data-mode="list">📚 Capítulos</button><button class="btn sm ghost-glass" data-continue="${w.id}" data-mode="last">↺ Último</button>`
            : `<button class="btn primary sm" data-continue="${w.id}">${ICONS.play} Abrir</button>`)
          : `<a class="btn primary sm" href="#/obra/${w.id}">${ICONS.edit} Registrar avance</a>`}
      </div>
    </div>
  </section>`;
}

// ---------- Buscar otra obra (desde cualquier pantalla) ----------
export function openSearchSheet() {
  const recent = [...S.works].sort((a, b) => lastTouch(b) - lastTouch(a)).slice(0, 8);
  const itemHTML = (w, i) => `<button class="sg-item" data-open-work="${w.id}" style="--i:${i}">
      ${coverHTML(w, 'xs')}
      <span class="sg-text"><b>${esc(w.title)}</b><small>${TYPES[w.type].emoji} ${TYPES[w.type].label} · ${esc(progressLabel(w) || statusLabel(w.status, w.type))}</small></span>
      <span class="sdot" style="--c:${STATUSES[w.status]?.color}"></span></button>`;
  const s = openSheet(`<h3 class="sheet-title">🔎 Buscar en tu biblioteca</h3>
    <div class="searchbar in-sheet"><span class="ic">${ICONS.search}</span>
      <input id="ss-q" type="search" placeholder="Nombre de la obra…" autocomplete="off" enterkeyhint="search"></div>
    <div id="ss-res" class="ss-res">${recent.length ? `<p class="ss-label">Lo último que abriste</p>${recent.map(itemHTML).join('')}` : '<p class="muted small center pad">Tu biblioteca está vacía.</p>'}</div>`, { cls: 'tall' });
  const q = $('#ss-q', s.el), res = $('#ss-res', s.el);
  q.addEventListener('input', debounce(() => {
    const v = q.value.trim();
    if (!v) { res.innerHTML = recent.length ? `<p class="ss-label">Lo último que abriste</p>${recent.map(itemHTML).join('')}` : ''; return; }
    const found = searchWorks(v, 12);
    res.innerHTML = found.length ? found.map(itemHTML).join('') : `<div class="sg-empty">No tienes nada parecido a "<b>${esc(v)}</b>".</div><button class="btn block" data-ss-add>＋ Agregar "${esc(v.slice(0, 30))}"</button>`;
  }, 120));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') res.querySelector('[data-open-work]')?.click(); });
  res.addEventListener('click', (e) => {
    const it = e.target.closest('[data-open-work]');
    if (it) { vibrate(8); s.close(); whenSettled(() => go('#/obra/' + it.dataset.openWork)); return; }
    if (e.target.closest('[data-ss-add]')) { const v = q.value.trim(); s.close(); whenSettled(() => openEditor(null, { prefill: { title: v } })); }
  });
}

// ---------- ¿Qué sigue? (ruleta) ----------
function openRoulette() {
  const pool = (kind) => S.works.filter((w) => ['pendiente', 'viendo', 'emision', 'pausado'].includes(w.status) && (kind === 'all' || (kind === 'leer' ? TYPES[w.type].reading : !TYPES[w.type].reading)));
  let kind = 'all';
  const s = openSheet(`<h3 class="sheet-title center">🎲 ¿Qué sigue?</h3>
    <div class="seg mini3" id="rl-kind"><button class="on" data-k="all">Todo</button><button data-k="leer">Leer</button><button data-k="ver">Ver</button></div>
    <div class="slot"><div class="slot-reel" id="rl-reel"></div><div class="slot-glow"></div></div>
    <div class="rl-result" id="rl-result"><p class="muted small center">Toca girar y deja que la suerte decida.</p></div>
    <div class="row-btns"><button class="btn primary lg" id="rl-spin">🎰 Girar</button></div>
    <div class="rl-new"><div class="sec-head"><h4>✨ O prueba algo nuevo</h4><a href="#/descubrir" class="link-btn small" id="rl-more">Ver más</a></div>
      <div class="drow" id="rl-picks">${Array.from({ length: 3 }, (_, i) => `<div class="dcard skel" style="--i:${i}"><span class="dcover"></span><b></b><small></small></div>`).join('')}</div></div>`, { cls: 'roulette' });
  const rp = $('#rl-picks', s.el);
  rp.addEventListener('click', onPickClick);
  $('#rl-more', s.el).addEventListener('click', (e) => { e.preventDefault(); s.close(); whenSettled(() => go('#/descubrir')); });
  quickPicks(10).then((list) => { if (rp.isConnected) rp.innerHTML = list.length ? picksHTML(list) : '<p class="muted small">Sin recomendaciones por ahora.</p>'; }).catch(() => { if (rp.isConnected) rp.innerHTML = '<p class="muted small">Sin conexión.</p>'; });
  const reel = $('#rl-reel', s.el), result = $('#rl-result', s.el);
  const H = 186;
  let spinning = false;
  const fill = (list) => { reel.style.transition = 'none'; reel.style.transform = 'translateY(0)'; reel.innerHTML = list.map((w) => `<div class="slot-item">${coverHTML(w)}</div>`).join(''); };
  const preview = () => { const p = pool(kind); fill(p.length ? p.slice(0, 1) : []); result.innerHTML = p.length ? `<p class="muted small center">${p.length} ${p.length === 1 ? 'opción' : 'opciones'} en la ruleta</p>` : '<p class="muted small center">No hay obras pendientes o en curso de este tipo.</p>'; };
  preview();
  $('#rl-kind', s.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b || spinning) return;
    kind = b.dataset.k;
    $$('#rl-kind button', s.el).forEach((x) => x.classList.toggle('on', x === b));
    preview();
  });
  $('#rl-spin', s.el).onclick = () => {
    const p = pool(kind);
    if (!p.length || spinning) return;
    spinning = true;
    const pick = p[Math.floor(Math.random() * p.length)];
    const seq = [];
    const rounds = Math.max(18, p.length * 3);
    for (let i = 0; i < rounds; i++) seq.push(p[Math.floor(Math.random() * p.length)]);
    seq.push(pick);
    fill(seq);
    result.innerHTML = '<p class="muted small center rl-wait">Girando…</p>';
    vibrate(10);
    void reel.offsetHeight;
    const dur = reducedMotion() ? 0 : 2600;
    reel.style.transition = dur ? `transform ${dur}ms cubic-bezier(.12,.8,.18,1)` : 'none';
    reel.style.transform = `translateY(${-(seq.length - 1) * H}px)`;
    let ticks = 0;
    const tick = setInterval(() => { if (++ticks < 14) vibrate(4); else clearInterval(tick); }, 120);
    setTimeout(() => {
      spinning = false;
      clearInterval(tick);
      vibrate(30);
      const r = reel.parentElement.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2, 30);
      result.innerHTML = `<div class="rl-pick"><span class="badge type-${pick.type}">${TYPES[pick.type].emoji} ${TYPES[pick.type].label}</span><h3>${esc(pick.title)}</h3><p class="muted small">${esc(progressLabel(pick, false))} · ${esc(statusLabel(pick.status, pick.type))}</p>
        <a class="btn primary block" href="#/obra/${pick.id}" id="rl-open">Vamos con esta</a></div>`;
      $('#rl-open', s.el).onclick = (e) => { e.preventDefault(); go('#/obra/' + pick.id); };
      $('#rl-spin', s.el).textContent = '🎰 Girar otra vez';
      $('#rl-spin', s.el).classList.remove('primary');
    }, dur + 50);
  };
}

// ---------- acciones rápidas (mantener presionada una tarjeta) ----------
function openQuickActions(el) {
  const w = getWork(el.dataset.id);
  if (!w) return;
  const t = continueTarget(w);
  const s = openSheet(`
    <div class="qa-head">${coverHTML(w, 'sm')}<div class="grow"><span class="badge type-${w.type}">${TYPES[w.type].emoji} ${TYPES[w.type].label}</span><h3>${esc(w.title)}</h3><p class="muted small">${esc(progressLabel(w, false))}</p></div></div>
    <div class="field"><span>Cambiar estado</span><div class="chips wrap" id="qa-status">
      ${Object.entries(STATUSES).map(([k, st]) => `<button class="chip ${w.status === k ? 'on' : ''}" data-status="${k}"><span class="sdot" style="--c:${st.color}"></span>${statusLabel(k, w.type)}</button>`).join('')}
    </div></div>
    ${isTrackOnly(w) ? `<div class="field"><span>Dónde la veo</span><div class="chips wrap" id="qa-plat">${STREAMING.map((k) => `<button class="chip ${w.platform === k ? 'on' : ''}" data-plat="${k}"><span class="sdot" style="--c:${PLATFORMS[k].color}"></span>${esc(PLATFORMS[k].name)}</button>`).join('')}</div></div>` : ''}
    <div class="qa-grid">
      <button class="qa-btn ${w.favorite ? 'on' : ''}" id="qa-fav">${ICONS.heart}<span>${w.favorite ? 'Quitar favorito' : 'Favorito'}</span></button>
      <button class="qa-btn" id="qa-open">${ICONS.eye}<span>Ver detalle</span></button>
      <button class="qa-btn" id="qa-edit">${ICONS.edit}<span>Editar</span></button>
      ${t ? `<button class="qa-btn" id="qa-go">${t.next ? ICONS.play : t.list ? '📚' : ICONS.play}<span>${t.next ? `Siguiente · ${TYPES[w.type].unit} ${t.next}` : t.list ? 'Ver capítulos' : 'Abrir link'}</span></button>` : ''}
      ${t?.last && (t.next || t.list) ? `<button class="qa-btn" id="qa-last">↺<span>Último visto${t.last.n ? ` · ${TYPES[w.type].unit} ${t.last.n}` : ''}</span></button>` : ''}
    </div>`);
  $('#qa-status', s.el).addEventListener('click', async (e) => {
    const c = e.target.closest('[data-status]');
    if (!c) return;
    w.status = c.dataset.status;
    await saveWork(w);
    $$('#qa-status .chip', s.el).forEach((x) => x.classList.toggle('on', x === c));
    vibrate(10);
    if (w.status === 'terminado') { const r = c.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top); }
    setTimeout(() => { s.close(); render({ keepScroll: true }); }, 350);
  });
  $('#qa-plat', s.el)?.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-plat]');
    if (!c) return;
    w.platform = w.platform === c.dataset.plat ? '' : c.dataset.plat;
    await saveWork(w);
    $$('#qa-plat .chip', s.el).forEach((x) => x.classList.toggle('on', x.dataset.plat === w.platform));
    vibrate(10);
    toast(w.platform ? `${w.title} → ${PLATFORMS[w.platform].name}` : 'Plataforma quitada', { icon: '📺' });
    setTimeout(() => { s.close(); render({ keepScroll: true }); }, 350);
  });
  $('#qa-fav', s.el).onclick = async () => { w.favorite = !w.favorite; await saveWork(w); vibrate(12); s.close(); render({ keepScroll: true }); toast(w.favorite ? 'Agregada a favoritos' : 'Quitada de favoritos', { icon: w.favorite ? '❤️' : '🤍' }); };
  $('#qa-open', s.el).onclick = () => go('#/obra/' + w.id);
  $('#qa-edit', s.el).onclick = () => { s.close(); whenSettled(() => openEditor(w)); };
  $('#qa-go', s.el)?.addEventListener('click', () => { doContinue(w, t.next ? 'next' : t.list ? 'list' : 'next'); s.close(); });
  $('#qa-last', s.el)?.addEventListener('click', () => { doContinue(w, 'last'); s.close(); });
}
onLongPress(document, '.card, .c-item, .spotlight', openQuickActions);

// "Preguntar cada vez": hoja para elegir en qué navegador abrir el link
setBrowserPicker((url, onOpen) => {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* */ }
  const s = openSheet(`<h3 class="sheet-title">¿Con qué lo abro?</h3>
    <p class="muted small">${esc(host)}</p>
    <div class="br-pick">${browserChoices().filter((k) => k !== 'ask').map((k, i) => `<button class="br-opt" data-pick="${k}" style="--i:${i}"><span class="br-emoji">${BROWSERS[k].emoji}</span><span class="grow"><b>${esc(BROWSERS[k].name)}</b></span></button>`).join('')}</div>
    <label class="br-remember"><input type="checkbox" id="br-rem"> Usar siempre este navegador</label>`);
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const k = b.dataset.pick;
    openUrl(url, { browser: k, onOpen });
    if ($('#br-rem', s.el).checked) { setPref('browser', k); toast(`Los links se abrirán siempre con ${BROWSERS[k].name}`, { icon: BROWSERS[k].emoji }); }
    s.close();
  });
});

function renderGrid() {
  const grid = $('#grid');
  if (!grid) return;
  const list = filteredWorks();
  grid.className = S.settings.view === 'list' ? 'grid list' : 'grid';
  if (!S.works.length) {
    grid.className = '';
    grid.innerHTML = `<div class="empty">
      <div class="empty-art">${['📗', '🌸', '📺', '🎬'].map((e, i) => `<span style="--i:${i}">${e}</span>`).join('')}</div>
      <h2>Tu biblioteca está vacía</h2>
      <p class="muted">Agrega tu primera obra, pega el link de un capítulo o importa tus marcadores de Chrome.</p>
      <div class="col-btns">
        <button class="btn primary" id="e-add">${ICONS.plus} Agregar obra</button>
        <button class="btn" id="e-paste">${ICONS.link} Pegar link de capítulo</button>
        <a class="btn ghost" href="#/importar">${ICONS.upload} Importar marcadores</a>
        <a class="btn ghost" href="#/descubrir">✨ Descubrir qué leer o ver</a>
      </div></div>`;
    $('#e-add').onclick = () => openAddChooser();
    $('#e-paste').onclick = () => openPasteSheet();
    return;
  }
  if (!list.length) {
    grid.className = '';
    grid.innerHTML = `<div class="empty small"><h3>Sin resultados</h3><p class="muted">Prueba con otro nombre o quita filtros.</p><button class="btn ghost" id="clear-f">Quitar filtros</button></div>`;
    $('#clear-f').onclick = () => { Object.assign(S.filters, { q: '', type: 'all', status: 'all', platform: 'all', fav: false }); render(); };
    return;
  }
  grid.innerHTML = list.map((w, i) => cardHTML(w, i)).join('');
}

async function onContinueClick(e) {
  const b = e.target.closest('[data-continue]');
  const mode = b?.dataset.mode || 'next';
  if (!b) return;
  e.preventDefault();
  const w = getWork(b.dataset.continue);
  if (w) doContinue(w, mode);
}

export async function doContinue(w, mode = 'next') {
  const t = continueTarget(w);
  if (!t) { toast('Esta obra no tiene links guardados.'); return; }
  const u = TYPES[w.type].unitLong;
  // primero se abre el link (iPhone lo exige en el mismo toque) y después se guarda
  // lo que se guarda solo pasa si el link se abrió (con "Preguntar cada vez" puedes cancelar)
  const onOpen = () => {
    w.lastOpened = Date.now();
    saveWork(w, { touch: false });
    setPendingRead(w, t, mode);
    toast(`Al volver te pregunto hasta qué ${u} llegaste`, { icon: '📝', timeout: 2500 });
  };
  if (mode === 'list' && t.list) openUrl(t.list, { onOpen });
  else if (mode === 'last' && t.last) openUrl(t.last.url, { onOpen });
  else openUrl(t.list && !t.next ? t.list : t.url, { onOpen });
}

// ---------- ¿Hasta dónde leíste? (al volver a la app) ----------
// La app no puede ver lo que haces dentro de otra página, así que al regresar
// pregunta hasta qué capítulo llegaste y guarda el link donde quedaste.
const PENDING_KEY = 'ba-pending-read';
function setPendingRead(w, t, mode) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ id: w.id, at: Date.now(), from: currentNumber(w), expect: mode === 'next' && t.next ? t.next : null, mode })); } catch { /* sin almacenamiento */ }
}
function takePendingRead() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (!p || Date.now() - p.at < 12000) return null; // volvió enseguida: se pregunta la próxima vez
    localStorage.removeItem(PENDING_KEY);
    return Date.now() - p.at < 24 * 3600e3 ? p : null;
  } catch { return null; }
}
function checkReturn() {
  const p = takePendingRead();
  const w = p && getWork(p.id);
  if (w && !document.querySelector('.sheet-wrap')) openCheckIn(w, p);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(checkReturn, 400); });

export function openCheckIn(w, p = { mode: 'manual' }) {
  if (needsLink(w)) return openLinkFirst(w, p);
  const t = TYPES[w.type];
  const cur = currentNumber(w);
  let val = p.expect ?? (p.mode === 'last' || p.mode === 'manual' ? cur : cur + 1);
  if (val < cur) val = cur;
  const s = openSheet(`
    <div class="ci-head">${coverHTML(w, 'xs')}<div class="grow"><small>${p.mode === 'manual' ? 'Registrar avance' : `Volviste de ${t.reading ? 'leer' : 'ver'}`}</small><h3>${esc(w.title)}</h3></div></div>
    <p class="ci-q">¿Hasta qué ${t.unitLong} llegaste?</p>
    <div class="ci-stepper">
      <button class="cbtn minus" data-ci="-1" aria-label="Uno menos">−</button>
      <div class="ci-val"><input id="ci-n" type="number" inputmode="decimal" min="0" step="any" value="${val}" aria-label="${t.unitLong}"><small>antes: ${t.unit} ${cur}</small></div>
      <button class="cbtn plus" data-ci="1" aria-label="Uno más">+</button>
    </div>
    <div class="chips center ci-quick">${[1, 2, 5, 10].map((n) => `<button class="chip" data-add="${n}">+${n}</button>`).join('')}</div>
    <div class="field"><span>Link del ${t.unitLong} donde quedaste (opcional)</span>
      <div class="field-row"><input id="ci-url" type="url" inputmode="url" placeholder="https://…" value="${esc(p.url || '')}"><button class="btn sm" id="ci-paste">Pegar</button></div>
      <small class="muted ci-hint">Así <b>Último visto</b> abrirá justo ese ${t.unitLong}. Si el link trae el número, el contador se ajusta solo.</small>
    </div>
    <div class="row-btns"><button class="btn ghost" id="ci-no">${p.mode === 'manual' ? 'Cancelar' : 'No leí nada'}</button><button class="btn primary" id="ci-save">Guardar</button></div>`, { cls: 'checkin' });
  const input = $('#ci-n', s.el);
  const setVal = (v, dir) => {
    const n = Math.max(0, Math.round(v * 100) / 100);
    input.value = n;
    input.classList.remove('bump'); void input.offsetWidth; input.classList.add('bump');
    vibrate(6);
    void dir;
  };
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ci]');
    if (b) setVal((parseFloat(input.value) || 0) + +b.dataset.ci, +b.dataset.ci);
    const a = e.target.closest('[data-add]');
    if (a) setVal(Math.max(cur, parseFloat(input.value) || 0) + +a.dataset.add, 1);
  });
  const urlIn = $('#ci-url', s.el);
  const readUrl = () => {
    const parsed = urlIn.value.trim() ? parseLink(urlIn.value.trim(), S.patterns) : null;
    if (parsed?.chapter != null && parsed.chapter > (parseFloat(input.value) || 0)) setVal(parsed.chapter, 1);
    return parsed;
  };
  urlIn.addEventListener('input', debounce(readUrl, 250));
  $('#ci-paste', s.el).onclick = async () => {
    try { urlIn.value = (await navigator.clipboard.readText()).trim(); readUrl(); }
    catch { urlIn.focus(); toast('Mantén presionado el campo y elige "Pegar".'); }
  };
  if (p.url) readUrl();
  $('#ci-no', s.el).onclick = () => s.close();
  $('#ci-save', s.el).onclick = async () => {
    const parsed = readUrl();
    let n = parseFloat(input.value);
    if (parsed && parsed.platform === 'web') await applyLinkToWork(w, parsed);
    if (!isNaN(n) && n !== currentNumber(w)) await setProgress(w, w.type === 'serie' ? { episode: Math.round(n) } : { chapter: n });
    if (w.status === 'pendiente' && n > 0) { w.status = 'viendo'; await saveWork(w); }
    s.close();
    vibrate(15);
    const gained = currentNumber(w) - cur;
    if (gained > 0) confetti(innerWidth / 2, innerHeight * 0.45, Math.min(40, 10 + gained * 2));
    toast(gained > 0 ? `${w.title}: +${gained} → ${progressLabel(w)}` : `${w.title}: ${progressLabel(w)}`, { icon: '✅' });
    if (w.total && currentNumber(w) >= w.total && w.status !== 'terminado') finishPrompt(w);
    render({ keepScroll: true });
  };
}

// Paso 1: link del último capítulo · Paso 2: qué número es
export function openLinkFirst(w, p = { mode: 'manual' }) {
  const t = TYPES[w.type];
  const cur = currentNumber(w);
  const saved = (w.links || [])[0]?.url || '';
  const verb = t.reading ? 'leíste' : 'viste';
  const s = openSheet(`
    <div class="ci-head">${coverHTML(w, 'xs')}<div class="grow"><small>${p.mode === 'manual' ? 'Nuevo ' + t.unitLong : `Volviste de ${t.reading ? 'leer' : 'ver'}`}</small><h3>${esc(w.title)}</h3></div></div>
    <div class="lf-dots"><i class="on"></i><i></i></div>
    <div id="lf-1" class="lf-step">
      <p class="ci-q">1. Pega el link del último ${t.unitLong} que ${verb}</p>
      <div class="field-row"><input id="lf-url" type="url" inputmode="url" placeholder="https://…" autocomplete="off"><button class="btn sm" id="lf-paste">Pegar</button></div>
      <p class="lf-msg muted small" id="lf-msg">Ábrelo en la página, copia el link de la barra de direcciones y pégalo aquí.</p>
      <div class="row-btns"><button class="btn ghost" id="lf-cancel">${p.mode === 'manual' ? 'Cancelar' : 'No leí nada'}</button><button class="btn primary" id="lf-next" disabled>Siguiente →</button></div>
    </div>
    <div id="lf-2" class="lf-step" hidden>
      <p class="ci-q">2. ¿Qué ${t.unitLong} es este link?</p>
      <div class="lf-prev" id="lf-prev"></div>
      <div class="ci-stepper">
        <button class="cbtn minus" data-ci="-1" aria-label="Uno menos">−</button>
        <div class="ci-val"><input id="ci-n" type="number" inputmode="decimal" min="0" step="any" value="${cur + 1}" aria-label="${t.unitLong}"><small>antes: ${t.unit} ${cur}</small></div>
        <button class="cbtn plus" data-ci="1" aria-label="Uno más">+</button>
      </div>
      <div class="chips center ci-quick">${[1, 2, 5, 10].map((n) => `<button class="chip" data-add="${n}">+${n}</button>`).join('')}</div>
      <div class="row-btns"><button class="btn ghost" id="lf-back">← Cambiar link</button><button class="btn primary" id="lf-save">Guardar</button></div>
    </div>`, { cls: 'checkin' });
  const urlIn = $('#lf-url', s.el), msg = $('#lf-msg', s.el), next = $('#lf-next', s.el), num = $('#ci-n', s.el);
  let parsed = null;
  const validate = () => {
    const v = urlIn.value.trim();
    parsed = v ? parseLink(v, S.patterns) : null;
    let ok = !!parsed && parsed.platform === 'web';
    if (!v) msg.textContent = 'Ábrelo en la página, copia el link de la barra de direcciones y pégalo aquí.';
    else if (!parsed) msg.textContent = '⚠️ Eso no parece un link válido.';
    else if (parsed.platform !== 'web') { msg.textContent = '⚠️ Pega el link de la página donde lees.'; ok = false; }
    else if (parsed.url === saved && !p.url) { msg.textContent = '⚠️ Es el mismo link que ya tenías guardado. Pega el del capítulo nuevo.'; ok = false; }
    else msg.textContent = `✓ Link de ${parsed.host}`;
    msg.classList.toggle('ok', ok);
    next.disabled = !ok;
    return ok;
  };
  urlIn.addEventListener('input', debounce(validate, 150));
  $('#lf-paste', s.el).onclick = async () => {
    try { urlIn.value = (await navigator.clipboard.readText()).trim(); validate(); }
    catch { urlIn.focus(); toast('Mantén presionado el campo y elige "Pegar".'); }
  };
  const goStep = (n) => {
    $('#lf-1', s.el).hidden = n !== 1;
    $('#lf-2', s.el).hidden = n !== 2;
    $$('.lf-dots i', s.el).forEach((d, i) => d.classList.toggle('on', i < n));
    if (n === 2) {
      let shown = parsed.url; try { const u = new URL(parsed.url); shown = u.hostname.replace(/^www\./, '') + decodeURI(u.pathname); } catch { /* */ }
      $('#lf-prev', s.el).innerHTML = `<span class="pbadge" style="--c:${PLATFORMS.web.color}">Link</span><span>${esc(shown)}</span>`;
      if (parsed.chapter != null) num.value = parsed.chapter;
    }
  };
  next.onclick = () => { if (validate()) goStep(2); };
  $('#lf-back', s.el).onclick = () => goStep(1);
  $('#lf-cancel', s.el).onclick = () => s.close();
  const setVal = (v) => { num.value = Math.max(0, Math.round(v * 100) / 100); num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); vibrate(6); };
  $('#lf-2', s.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-ci]');
    if (b) setVal((parseFloat(num.value) || 0) + +b.dataset.ci);
    const a = e.target.closest('[data-add]');
    if (a) setVal(cur + +a.dataset.add);
  });
  $('#lf-save', s.el).onclick = async () => {
    const n = parseFloat(num.value);
    if (isNaN(n) || n < 0) { toast('Escribe el número del ' + t.unitLong + '.'); return; }
    await applyLinkToWork(w, parsed);
    if (n !== currentNumber(w)) await setProgress(w, { chapter: n });
    if (w.status === 'pendiente' && n > 0) { w.status = 'viendo'; await saveWork(w); }
    s.close();
    vibrate(15);
    const gained = currentNumber(w) - cur;
    if (gained > 0) confetti(innerWidth / 2, innerHeight * 0.45, Math.min(40, 10 + gained * 2));
    toast(`${w.title}: ${progressLabel(w)} · link guardado`, { icon: '✅' });
    if (w.total && currentNumber(w) >= w.total && w.status !== 'terminado') finishPrompt(w);
    render({ keepScroll: true });
  };
  if (p.url) { urlIn.value = p.url; if (validate()) goStep(2); }
}

// ---------- detalle ----------
function starsHTML(rating) {
  return `<div class="stars" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= rating ? 'on' : ''}" data-star="${n}" role="radio" aria-checked="${n === rating}" aria-label="${n} estrellas">${ICONS.star}</button>`).join('')}</div>`;
}

// "hoy, 21:34" · "ayer, 21:34" · "14 oct, 21:34"
export function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `hoy, ${time}`;
  if (d.toDateString() === y.toDateString()) return `ayer, ${time}`;
  return `${d.toLocaleDateString('es', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).replace('.', '')}, ${time}`;
}
// Cuándo fue el último avance y cuándo abriste el link
function lastReadHTML(w) {
  const t = TYPES[w.type];
  const rows = [];
  if (w.type === 'pelicula') { if (w.watchedAt) rows.push(`🎬 La viste ${fmtWhen(w.watchedAt)}`); }
  else if (w.lastRead) rows.push(`🕒 Último ${t.unitLong} ${t.reading ? 'leído' : 'visto'}: <b>${esc(progressLabel(w, false))}</b> · ${fmtWhen(w.lastRead)}`);
  if (w.lastOpened && !isTrackOnly(w)) rows.push(`🔗 Abriste el link ${fmtWhen(w.lastOpened)}`);
  return rows.length ? rows.map((r) => `<span>${r}</span>`).join('') : '';
}
function updateLastRead(w, root) { const el = $('#last-read', root); if (el) { el.innerHTML = lastReadHTML(w); el.hidden = !el.innerHTML; } }

function counterHTML(w) {
  const t = TYPES[w.type];
  if (w.type === 'pelicula') {
    const seen = w.status === 'terminado';
    return `<section class="panel counter-panel movie-panel">
      <button class="btn ${seen ? 'success' : 'primary'} block lg" id="movie-seen">${seen ? '✓ Vista' : '🎬 Marcar como vista'}</button>
      <p class="muted small center">${seen ? (w.watchedAt ? `La viste ${fmtWhen(w.watchedAt)}` : 'Ya la viste') : 'Cuando la veas, márcala aquí para llevar tu registro.'}</p>
    </section>`;
  }
  if (w.type === 'serie') {
    const sn = w.progress.season || 1, ep = w.progress.episode || 0;
    const eps = seasonEpisodes(w);
    return `<section class="panel counter-panel series-panel">
      <div class="ep-now">
        <small>Vas en</small>
        <div class="ep-big"><span class="ep-tag">T</span><b id="season-num">${sn}</b><span class="ep-sep">·</span><span class="ep-tag">E</span><button class="num" id="num" aria-label="Editar episodio">${ep}</button></div>
        <small id="ep-of">${eps ? `de ${eps} episodios en la temporada ${sn}` : 'toca el número del episodio para editarlo'}</small>
      </div>
      <div class="counter series">
        <button class="cbtn minus" data-step="-1" aria-label="Restar un episodio">−1</button>
        <button class="cbtn plus" data-step="1" aria-label="Sumar un episodio"><span>+1 episodio</span></button>
      </div>
      <div class="pbar ${eps ? '' : 'hidden'}"><i style="width:${eps ? Math.min(100, (ep / eps) * 100) : 0}%"></i></div>
      <div class="season-row">
        <span class="muted">Temporada</span>
        <div class="stepper"><button class="icon-btn sm" data-season="-1" aria-label="Temporada anterior">−</button><b id="season-num2">${sn}</b><button class="icon-btn sm" data-season="1" aria-label="Temporada siguiente">+</button></div>
        <button class="btn sm ghost" id="new-season">Siguiente temporada</button>
      </div>
      <div class="muted small center" id="series-total">${seriesTotalText(w)}</div>
    </section>`;
  }
  const n = currentNumber(w);
  const pct = w.total ? Math.min(100, (n / w.total) * 100) : null;
  if (needsLink(w)) {
    return `<section class="panel counter-panel">
      <div class="counter locked">
        <div class="cval">
          <small>${t.unitLong[0].toUpperCase() + t.unitLong.slice(1)}</small>
          <button class="num" id="num" aria-label="Actualizar con el link">${n}</button>
          <small>${w.total ? `de ${w.total}` : 'según tu último link'}</small>
        </div>
        <button class="cbtn plus lf-btn" id="lf-open" aria-label="Registrar nuevo capítulo"><span>🔗</span><b>Nuevo ${t.unitLong}</b><small>pega su link</small></button>
      </div>
      ${pct != null ? `<div class="pbar"><i style="width:${pct}%"></i></div><div class="muted small center">${Math.round(pct)}% completado</div>` : ''}
      <p class="lf-note">🔒 En este sitio el link no dice el número del ${t.unitLong}. Para avanzar, pega primero el link del último ${t.unitLong} que ${t.reading ? 'leíste' : 'viste'} y luego elige qué número es; así el contador y el link nunca se desfasan.</p>
    </section>`;
  }
  return `<section class="panel counter-panel">
    <div class="counter">
      <button class="cbtn minus" data-step="-1" aria-label="Restar uno">−1</button>
      <div class="cval">
        <small>${t.unitLong[0].toUpperCase() + t.unitLong.slice(1)}</small>
        <button class="num" id="num" aria-label="Editar número">${n}</button>
        <small>${w.total ? `de ${w.total}` : 'toca el número para editar'}</small>
      </div>
      <button class="cbtn plus" data-step="1" aria-label="Sumar uno"><span>+1</span></button>
    </div>
    ${pct != null ? `<div class="pbar"><i style="width:${pct}%"></i></div><div class="muted small center">${Math.round(pct)}% completado</div>` : ''}
  </section>`;
}

// Celebraciones al llegar a números redondos
function milestone(w, anchor) {
  const n = w.type === 'serie' ? (seriesTotals(w)?.seen ?? w.progress.watched ?? 0) : currentNumber(w);
  if (!n || n % 10 !== 0) return;
  const r = anchor.getBoundingClientRect();
  const big = n % 50 === 0;
  confetti(r.left + r.width / 2, r.top, big ? 50 : 18);
  vibrate(big ? [20, 40, 20] : 20);
  toast(`${big ? '🏆' : '🎉'} ¡${n} ${TYPES[w.type].unitLong}s de ${w.title}!`);
}

function seriesTotalText(w) {
  const tot = seriesTotals(w);
  if (tot) return `${tot.seen} de ${tot.total} episodios vistos · ${w.seasons.length} ${w.seasons.length === 1 ? 'temporada' : 'temporadas'}`;
  return w.progress.watched ? `${w.progress.watched} episodios vistos en total` : '';
}

// Actualiza el panel de la serie sin recargar la pantalla
function refreshSeries(w, root, dir) {
  const sn = w.progress.season || 1, eps = seasonEpisodes(w);
  rollNumber($('#num', root), w.progress.episode || 0, dir);
  rollNumber($('#season-num', root), sn, dir);
  $('#season-num2', root).textContent = sn;
  $('#ep-of', root).textContent = eps ? `de ${eps} episodios en la temporada ${sn}` : 'toca el número del episodio para editarlo';
  const bar = $('.series-panel .pbar', root);
  bar.classList.toggle('hidden', !eps);
  bar.firstElementChild.style.width = (eps ? Math.min(100, ((w.progress.episode || 0) / eps) * 100) : 0) + '%';
  $('#series-total', root).textContent = seriesTotalText(w);
}

function platformPanelHTML(w) {
  return `<section class="panel">
    <div class="sec-head"><h3>Dónde la veo</h3><span class="muted small">${w.platform ? 'toca otra vez para quitar' : 'elige la plataforma'}</span></div>
    <div class="chips wrap" id="plat-chips">${STREAMING.map((k) => `<button class="chip ${w.platform === k ? 'on' : ''}" data-plat="${k}"><span class="sdot" style="--c:${PLATFORMS[k].color}"></span>${esc(PLATFORMS[k].name)}</button>`).join('')}</div>
  </section>`;
}

function linksHTML(w) {
  const links = w.links || [];
  return `<section class="panel">
    <div class="sec-head"><h3>Dónde lo ${TYPES[w.type].reading ? 'leo' : 'veo'}</h3><button class="btn sm" id="add-link">${ICONS.plus} Link</button></div>
    ${links.length ? '<p class="muted xsmall">Se guardan el último link y el anterior.</p>' : ''}
    ${links.length ? `<ul class="links">${links.map((l, i) => {
      const p = PLATFORMS[l.platform] || PLATFORMS.web;
      let shown = l.url; try { const u = new URL(l.url); shown = u.hostname.replace(/^www\./, '') + decodeURI(u.pathname); } catch { /* */ }
      return `<li class="link-row" data-link="${l.id}">
        <span class="pbadge" style="--c:${p.color}">${esc(p.name)}</span>
        <span class="link-main"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="link-url">${esc(shown)}</a>
        <small class="link-when">${i === 0 ? 'Actual' : 'Anterior'}${l.addedAt ? ` · guardado ${fmtWhen(l.addedAt)}` : ''}</small></span>
        ${i === 0 ? '<span class="muted small" title="Link principal">★</span>' : `<button class="icon-btn xs" data-primary="${l.id}" aria-label="Hacer principal">☆</button>`}
        <button class="icon-btn xs" data-dellink="${l.id}" aria-label="Quitar link">${ICONS.close}</button>
      </li>`;
    }).join('')}</ul>` : `<p class="muted small">Sin links. Agrega dónde ${TYPES[w.type].reading ? 'lo lees' : 'lo ves'} para usar el botón Continuar.</p>`}
  </section>`;
}

async function renderDetail(root, id) {
  const w = getWork(id);
  if (!w) { root.innerHTML = `<div class="empty"><h2>No encontrada</h2><a class="btn" href="#/">Volver</a></div>`; return; }
  const t = TYPES[w.type];
  const target = continueTarget(w);
  const attr = w.source?.api ? ATTRIBUTION[w.source.api] : null;
  root.innerHTML = `
  <div class="detail">
    <div class="hero">
      <div class="hero-bg">${w.cover ? `<img src="${esc(w.cover)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
      <header class="topbar clear">
        <button class="icon-btn" id="back" aria-label="Volver">${ICONS.back}</button>
        <div class="grow"></div>
        <button class="icon-btn" id="d-search" aria-label="Buscar otra obra">${ICONS.search}</button>
        <button class="icon-btn ${w.favorite ? 'on-fav' : ''}" id="fav" aria-label="Favorito" aria-pressed="${w.favorite}">${ICONS.heart}</button>
        <button class="icon-btn" id="edit" aria-label="Editar">${ICONS.edit}</button>
      </header>
      <div class="hero-main">
        <div class="hero-cover" id="hero-cover">${coverHTML(w)}<span class="glare"></span></div>
        <div class="hero-info">
          <div class="chips tight"><span class="badge type-${w.type}">${t.emoji} ${t.label}</span>${w.year ? `<span class="badge soft">${esc(w.year)}</span>` : ''}${w.pubStatus ? `<span class="badge soft">${esc(w.pubStatus)}</span>` : ''}${w.platform ? `<span class="pbadge" style="--c:${PLATFORMS[w.platform]?.color}">${esc(PLATFORMS[w.platform]?.name)}</span>` : ''}</div>
          <h1>${esc(w.title)}</h1>
          ${starsHTML(w.rating || 0)}
          ${(w.genres || []).length ? `<div class="genres">${w.genres.slice(0, 5).map((g) => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>

    ${target ? `<div class="go-row" id="go-row">${goRowHTML(w, target)}</div><button class="link-btn small go-search" id="go-checkin">📝 ¿Leíste más? Registrar hasta dónde llegaste</button>${target.list && target.listGuessed && target.search && target.search !== target.list ? `<button class="link-btn small go-search" id="go-search">🔎 ¿No es la página de capítulos? Buscar la obra en el sitio</button>` : ''}` : ''}

    ${counterHTML(w)}
    <div class="last-read" id="last-read" ${lastReadHTML(w) ? '' : 'hidden'}>${lastReadHTML(w)}</div>

    ${w.type === 'serie' ? '<section class="panel seasons-panel" id="seasons-panel" hidden></section>' : ''}

    <section class="panel">
      <h3>Estado</h3>
      <div class="chips wrap" id="status-chips">
        ${Object.entries(STATUSES).map(([k, s]) => `<button class="chip ${w.status === k ? 'on' : ''}" data-status="${k}" style="--c:${s.color}"><span class="sdot" style="--c:${s.color}"></span>${statusLabel(k, w.type)}</button>`).join('')}
      </div>
      <p class="status-hint" id="st-hint">${esc(statusHint(w.status, w.type))}</p>
    </section>

    ${isTrackOnly(w) ? platformPanelHTML(w) : linksHTML(w)}

    ${w.synopsis ? `<section class="panel"><h3>Sinopsis</h3><p class="synopsis clamp" id="synopsis">${esc(w.synopsis)}</p><button class="link-btn" id="more">Ver más</button></section>` : ''}

    ${isTrackOnly(w) ? '<section class="panel cast-panel" id="cast-panel" hidden></section>' : ''}

    <section class="panel">
      <div class="sec-head"><h3>Notas</h3><span class="muted small" id="note-state"></span></div>
      <textarea id="notes" rows="4" placeholder="Escribe lo que quieras recordar…">${esc(w.notes || '')}</textarea>
    </section>

    <div class="meta-foot">
      <span>Agregada ${relTime(w.createdAt)} · actualizada ${relTime(w.updatedAt)}</span>
      ${attr ? `<span>${esc(attr.text)} · <a href="${esc(w.source.url || attr.url)}" target="_blank" rel="noopener">ver en ${esc(attr.name)}</a></span>` : ''}
    </div>
    <button class="btn danger ghost block" id="delete">${ICONS.trash} Eliminar obra</button>
  </div>`;

  tilt($('#hero-cover', root), 16);
  lastDetailId = w.id;
  if (document.startViewTransition) $('#hero-cover .cover', root).style.viewTransitionName = 'vt-cover';
  $('#back', root).onclick = () => (history.length > 1 && lastRouteWasInternal ? history.back() : go('#/'));
  $('#edit', root).onclick = () => openEditor(w);
  $('#d-search', root).onclick = () => openSearchSheet();
  $('#fav', root).onclick = async (e) => {
    const btn = e.currentTarget;
    w.favorite = !w.favorite;
    btn.classList.toggle('on-fav', w.favorite);
    btn.setAttribute('aria-pressed', w.favorite);
    if (w.favorite) { vibrate(15); const r = btn.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, 14); }
    await saveWork(w);
  };
  $('#go-row', root)?.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) doContinue(w, b.dataset.go); });
  $('#go-checkin', root)?.addEventListener('click', () => openCheckIn(w, { mode: 'manual' }));
  $('#go-search', root)?.addEventListener('click', () => { const t = continueTarget(w); if (t?.search) openUrl(t.search); });
  $('#more', root)?.addEventListener('click', (e) => { $('#synopsis').classList.toggle('clamp'); e.target.textContent = $('#synopsis').classList.contains('clamp') ? 'Ver más' : 'Ver menos'; });

  // estrellas
  root.querySelector('.stars').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-star]');
    if (!b) return;
    const n = +b.dataset.star;
    w.rating = w.rating === n ? 0 : n;
    await saveWork(w);
    $$('.star', root).forEach((s, i) => { s.classList.toggle('on', i < w.rating); s.classList.remove('pop'); if (i < w.rating) { void s.offsetWidth; s.style.animationDelay = i * 40 + 'ms'; s.classList.add('pop'); } });
    vibrate(8);
  });

  // contador
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', async () => {
    const d = +b.dataset.step;
    vibrate(d > 0 ? 14 : 8);
    await changeProgress(w, d);
    if (w.type === 'serie') {
      refreshSeries(w, root, d);
      if (w.seasonJump) { toast(`¡Empieza la temporada ${w.seasonJump}!`, { icon: '📺' }); delete w.seasonJump; }
    } else rollNumber($('#num', root), currentNumber(w), d);
    if (d > 0) { floatText(b, '+1'); milestone(w, b); }
    refreshContinue(w, root);
    updatePbar(w, root);
    updateLastRead(w, root);
    if (w.type === 'serie') drawSeasons(w, root);
    if (w.justFinished) { delete w.justFinished; finishPrompt(w); }
  }));
  $('#num', root)?.addEventListener('click', (e) => (needsLink(w) ? openLinkFirst(w, { mode: 'manual' }) : editNumber(w, e.currentTarget, root)));
  $('#lf-open', root)?.addEventListener('click', () => openLinkFirst(w, { mode: 'manual' }));
  const lastSeason = () => ((w.seasons || []).length ? Math.max(...w.seasons.map((x) => x.n)) : Infinity);
  root.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', async () => {
    const want = (w.progress.season || 1) + +b.dataset.season;
    if (want > lastSeason()) { toast(`${w.title} tiene ${lastSeason()} ${lastSeason() === 1 ? 'temporada' : 'temporadas'}`, { icon: '📺' }); return; }
    await setProgress(w, { season: want });
    refreshSeries(w, root, +b.dataset.season);
    drawSeasons(w, root);
  }));
  $('#new-season', root)?.addEventListener('click', async () => {
    if ((w.progress.season || 1) >= lastSeason()) { toast(`Esa es la última temporada${seriesInfo.get(w.id)?.ended ? ': la serie terminó' : ' anunciada por ahora'}`, { icon: '📺' }); return; }
    await setProgress(w, { season: (w.progress.season || 1) + 1 });
    w.progress.episode = 0; await saveWork(w);
    refreshSeries(w, root, 1);
    drawSeasons(w, root);
    toast(`Temporada ${w.progress.season}: listo para el episodio 1`, { icon: '📺' });
  });
  $('#movie-seen', root)?.addEventListener('click', async (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const seen = w.status !== 'terminado';
    w.status = seen ? 'terminado' : 'pendiente';
    w.watchedAt = seen ? Date.now() : null;
    await saveWork(w);
    if (seen) { confetti(r.left + r.width / 2, r.top); import('./store.js').then((m) => m.logActivity(1)); }
    render({ keepScroll: true });
  });

  // estado
  $('#status-chips', root).addEventListener('click', async (e) => {
    const c = e.target.closest('[data-status]');
    if (!c || c.dataset.status === w.status) return;
    w.status = c.dataset.status;
    await saveWork(w);
    $$('#status-chips .chip', root).forEach((x) => x.classList.toggle('on', x === c));
    $('#st-hint', root).textContent = statusHint(w.status, w.type);
    if (w.status === 'terminado') { const r = c.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top); vibrate(30); }
  });

  // plataforma (series y películas)
  $('#plat-chips', root)?.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-plat]');
    if (!c) return;
    w.platform = w.platform === c.dataset.plat ? '' : c.dataset.plat;
    await saveWork(w);
    vibrate(8);
    render({ keepScroll: true });
  });
  if (w.type === 'serie') loadSeriesInfo(w, root);
  if (w.type === 'pelicula') loadCast(w, root);

  // links
  $('#add-link', root)?.addEventListener('click', () => openPasteSheet({ work: w }));
  root.querySelector('.links')?.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-dellink]');
    const pri = e.target.closest('[data-primary]');
    if (del) {
      const removed = w.links.find((l) => l.id === del.dataset.dellink);
      w.links = w.links.filter((l) => l.id !== del.dataset.dellink);
      await saveWork(w); render({ keepScroll: true });
      toast('Link quitado', { action: 'Deshacer', onAction: async () => { w.links.push(removed); await saveWork(w); render({ keepScroll: true }); } });
    } else if (pri) {
      const i = w.links.findIndex((l) => l.id === pri.dataset.primary);
      w.links.unshift(w.links.splice(i, 1)[0]);
      await saveWork(w); render({ keepScroll: true });
    }
  });

  // notas (guardado automático)
  const notes = $('#notes', root);
  const saveNotes = debounce(async () => { w.notes = notes.value; await saveWork(w); $('#note-state').textContent = 'Guardado ✓'; }, 600);
  notes.addEventListener('input', () => { $('#note-state').textContent = 'Escribiendo…'; saveNotes(); });

  $('#delete', root).onclick = async () => {
    if (!(await confirmDialog(`¿Eliminar ${TYPES[w.type].label.toLowerCase()}?`, `Se borrará "${w.title}" con su progreso, notas${isTrackOnly(w) ? '' : ' y links'}. Esta acción no se puede deshacer después de unos segundos.`, { ok: 'Sí, eliminar', danger: true }))) return;
    const copy = JSON.parse(JSON.stringify(w));
    await deleteWork(w.id);
    go('#/');
    toast('Obra eliminada', { action: 'Deshacer', onAction: async () => { await saveWork(copy, { touch: false }); render(); } });
  };
}

// ======================= SERIES: temporadas, episodios y reparto =======================
async function checkNewSeasons() {
  if (!navigator.onLine) return;
  const due = S.works.filter((w) => w.type === 'serie' && tvIdOf(w) && w.status !== 'abandonado' && Date.now() - (w.seasonsAt || 0) > 864e5).slice(0, 8);
  for (const w of due) {
    try {
      const info = await tvmazeShow(tvIdOf(w), { force: true });
      const seasons = info.seasons.map((x) => ({ n: x.n, eps: x.eps }));
      const old = (w.seasons || []).length;
      if (seasons.length) w.seasons = seasons;
      w.seasonsAt = Date.now();
      const st = pubStatusEs(info.status);
      if (st) w.pubStatus = st;
      await saveWork(w, { touch: false });
      if (old && seasons.length > old) toast(`📺 ¡${w.title} tiene temporada nueva! Ya son ${seasons.length}.`, { timeout: 6000 });
    } catch { /* se intenta otro día */ }
  }
}
const seriesInfo = new Map(); // id de la obra → datos de TVmaze (solo en memoria)
const pickedSeason = new Map();
const normT = (t = '') => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const tvIdOf = (w) => (w.source?.api === 'tvmaze' ? w.source.id : w.tvmazeId || null);

async function loadSeriesInfo(w, root) {
  try {
    let id = tvIdOf(w);
    // series agregadas a mano o desde Wikipedia: se busca en TVmaze una con el mismo nombre
    if (!id && !w.tvmazeTried && navigator.onLine) {
      const f = await tvmazeFind(w.title);
      w.tvmazeTried = true;
      if (f && [w.title, ...(w.aliases || [])].some((t) => normT(t) === normT(f.name))) { w.tvmazeId = f.id; id = f.id; }
      await saveWork(w, { touch: false });
    }
    if (!id) { loadCast(w, root); return; }
    const old = (w.seasons || []).length;
    const stale = !w.seasonsAt || Date.now() - w.seasonsAt > (/Running|emisi/i.test(w.pubStatus || '') ? 12 * 3600e3 : 7 * 864e5);
    const info = await tvmazeShow(id, { force: stale && navigator.onLine });
    seriesInfo.set(w.id, info);
    // temporadas siempre al día: si sale una nueva se agrega sola
    const seasons = info.seasons.map((x) => ({ n: x.n, eps: x.eps }));
    if (seasons.length && JSON.stringify(seasons) !== JSON.stringify(w.seasons)) {
      w.seasons = seasons;
      if (old && seasons.length > old) toast(`¡${w.title} tiene temporada nueva! Ya son ${seasons.length}.`, { icon: '📺', timeout: 6000 });
    }
    w.seasonsAt = Date.now();
    const st = pubStatusEs(info.status);
    if (st) w.pubStatus = st;
    await saveWork(w, { touch: false });
    if (!root.isConnected || !location.hash.endsWith(w.id)) return;
    refreshSeries(w, root, 0);
    drawSeasons(w, root);
    drawCast(root, info.cast);
  } catch { /* sin conexión: se queda con lo guardado */ }
}

function drawSeasons(w, root) {
  const panel = $('#seasons-panel', root);
  const info = seriesInfo.get(w.id);
  if (!panel || !info || !info.seasons.length) return;
  const cur = w.progress.season || 1, ep = w.progress.episode || 0;
  const sel = pickedSeason.get(w.id) || cur;
  const total = info.seasons.reduce((a, x) => a + x.eps, 0);
  const seen = (sn, n) => sn < cur || (sn === cur && n <= ep);
  const season = info.seasons.find((x) => x.n === sel) || info.seasons[0];
  const eps = info.episodes.filter((e) => e.s === season.n);
  const year = (d) => (d ? d.slice(0, 4) : '');
  const fmtD = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '');
  const now = Date.now();
  panel.hidden = false;
  panel.innerHTML = `
    <div class="sec-head"><h3>📺 Temporadas</h3><span class="muted small">${info.ended ? 'Finalizada' : 'En emisión'} · ${info.seasons.length} ${info.seasons.length === 1 ? 'temporada' : 'temporadas'} · ${total} episodios</span></div>
    <div class="season-chips scroll-x">${info.seasons.map((x) => {
      const done = x.n < cur || (x.n === cur && ep >= x.eps);
      return `<button class="season-chip ${x.n === season.n ? 'on' : ''} ${done ? 'done' : ''} ${x.n === cur ? 'now' : ''}" data-pick-season="${x.n}"><b>T${x.n}</b><small>${x.eps} ep.${done ? ' ✓' : ''}</small></button>`;
    }).join('')}</div>
    <div class="season-head">
      <b>Temporada ${season.n}</b>
      <span class="muted small">${season.eps} episodios${season.premiere ? ` · ${year(season.premiere)}${season.end && year(season.end) !== year(season.premiere) ? `–${year(season.end)}` : ''}` : ''}${season.aired < season.eps ? ` · ${season.aired} emitidos` : ''}</span>
    </div>
    <ul class="ep-list">${eps.map((e) => {
      const isSeen = seen(e.s, e.n), isNext = e.s === cur && e.n === ep + 1;
      const future = e.stamp && new Date(e.stamp).getTime() > now;
      return `<li class="ep-row ${isSeen ? 'seen' : ''} ${isNext ? 'next' : ''} ${future ? 'future' : ''}">
        <div class="ep-img">${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}<span>E${e.n}</span></div>
        <div class="ep-text">
          <b>${e.n}. ${esc(e.name || `Episodio ${e.n}`)}</b>
          <small>${future ? `Sale el ${fmtD(e.date)}` : fmtD(e.date)}${e.runtime ? ` · ${e.runtime} min` : ''}${isNext ? ' · <em>el que sigue</em>' : ''}</small>
          ${e.summary ? (isSeen ? `<p class="ep-sum">${esc(e.summary)}</p>` : `<button class="ep-spoil" data-reveal>🙈 Sinopsis oculta para no darte spoilers · tocar para leerla</button><p class="ep-sum" hidden>${esc(e.summary)}</p>`) : ''}
        </div>
        ${future ? '' : `<button class="ep-mark ${isSeen ? 'on' : ''}" data-mark="${e.s}:${e.n}" aria-label="${isSeen ? 'Visto' : 'Marcar visto hasta aquí'}">${isSeen ? '✓' : '○'}</button>`}
      </li>`;
    }).join('')}</ul>
    <details class="spoiler-notes">
      <summary>🙈 Mis notas con spoilers · temporada ${season.n}</summary>
      <textarea rows="3" data-snotes="${season.n}" placeholder="Lo que pasó en esta temporada (queda escondido hasta que abras este apartado)">${esc((w.seasonNotes || {})[season.n] || '')}</textarea>
    </details>
    <p class="muted xsmall">Toca ○ para marcar visto hasta ese episodio. Datos de TVmaze (CC BY-SA 4.0).</p>`;
  if (!panel.dataset.bound) {
    panel.dataset.bound = '1';
    panel.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-pick-season]');
      if (c) { pickedSeason.set(w.id, +c.dataset.pickSeason); vibrate(5); drawSeasons(w, root); return; }
      const r = e.target.closest('[data-reveal]');
      if (r) { r.nextElementSibling.hidden = false; r.nextElementSibling.classList.add('open'); r.remove(); return; }
      const sum = e.target.closest('.ep-sum');
      if (sum) { sum.classList.toggle('open'); return; }
      const m = e.target.closest('[data-mark]');
      if (m) {
        const [sn, n] = m.dataset.mark.split(':').map(Number);
        const beforeS = w.progress.season || 1, beforeE = w.progress.episode || 0;
        // tocar el último visto lo desmarca
        const isLast = sn === beforeS && n === beforeE;
        await setProgress(w, { season: sn, episode: isLast ? n - 1 : n });
        if (w.status === 'pendiente') { w.status = 'viendo'; await saveWork(w); }
        vibrate(10);
        const fwd = sn > beforeS || (sn === beforeS && (w.progress.episode || 0) > beforeE);
        refreshSeries(w, root, fwd ? 1 : -1);
        updateLastRead(w, root);
        refreshContinue(w, root);
        drawSeasons(w, root);
        const tot = seriesTotals(w);
        if (fwd && tot && tot.seen >= tot.total && w.status !== 'terminado' && seriesInfo.get(w.id)?.ended) finishPrompt(w);
      }
    });
    panel.addEventListener('input', debounce(async (e) => {
      const t = e.target.closest('[data-snotes]');
      if (!t) return;
      w.seasonNotes = { ...(w.seasonNotes || {}), [t.dataset.snotes]: t.value };
      await saveWork(w, { touch: false });
    }, 500));
  }
}

// Reparto: TVmaze (series) o Wikidata (películas y series sin TVmaze)
async function loadCast(w, root) {
  try {
    const qid = await wikidataIdFor(w);
    if (!qid) return;
    if (w.wikidataId !== qid) { w.wikidataId = qid; await saveWork(w, { touch: false }); }
    const c = await wikidataCast(qid);
    if (root.isConnected) drawCast(root, c.cast, c.directors);
  } catch { /* sin reparto */ }
}
function drawCast(root, cast = [], directors = []) {
  const panel = $('#cast-panel', root);
  if (!panel || (!cast.length && !directors.length)) return;
  const person = (p) => `<li><span class="cast-img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}<i>${esc(p.name.split(' ').map((x) => x[0]).slice(0, 2).join(''))}</i></span><b>${esc(p.name)}</b>${p.role ? `<small>${esc(p.role)}</small>` : ''}</li>`;
  panel.hidden = false;
  panel.innerHTML = `<div class="sec-head"><h3>🎭 Reparto</h3>${directors.length ? `<span class="muted small">Dirección: ${esc(directors.map((d) => d.name).join(', '))}</span>` : ''}</div>
    <ul class="cast-row">${cast.map(person).join('')}</ul>`;
}

function goRowHTML(w, t) {
  const u = TYPES[w.type].unit;
  if (t.next) {
    return `<button class="btn primary lg go-next" data-go="next">${ICONS.play}<span><small>Siguiente</small>${u} ${t.next}</span></button>
      ${t.last ? `<button class="btn lg go-last" data-go="last"><b>↺</b><span><small>Último visto</small>${u} ${t.last.n}</span></button>` : ''}`;
  }
  if (t.list) {
    return `<button class="btn primary lg go-next" data-go="list"><b>📚</b><span><small>Para el siguiente</small>Ver capítulos</span></button>
      <button class="btn lg go-last" data-go="last"><b>↺</b><span><small>Último visto</small>${t.last?.n ? `${u} ${t.last.n}` : 'Abrir link'}</span></button>`;
  }
  return `<button class="btn primary lg go-next" data-go="next">${ICONS.play}<span><small>Continuar</small>Abrir link</span></button>`;
}
function refreshContinue(w, root) {
  const row = $('#go-row', root);
  const t = continueTarget(w);
  if (row && t) row.innerHTML = goRowHTML(w, t);
}
function updatePbar(w, root) {
  const bar = $('.counter-panel .pbar i', root);
  if (bar && w.total) {
    const pct = Math.min(100, (currentNumber(w) / w.total) * 100);
    bar.style.width = pct + '%';
    bar.parentElement.nextElementSibling.textContent = Math.round(pct) + '% completado';
  }
}

function editNumber(w, btn, root) {
  const cur = currentNumber(w);
  const input = document.createElement('input');
  input.type = 'number'; input.inputMode = 'decimal'; input.min = '0'; input.step = 'any';
  input.value = cur; input.className = 'num-input';
  btn.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const v = parseFloat(input.value);
    if (save && !isNaN(v) && v !== cur) await setProgress(w, w.type === 'serie' ? { episode: Math.round(v) } : { chapter: v });
    render({ keepScroll: true });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
}

// Parallax suave en el encabezado del detalle
let parRaf = 0;
window.addEventListener('scroll', () => {
  if (parRaf || reducedMotion()) return;
  parRaf = requestAnimationFrame(() => {
    parRaf = 0;
    const bg = document.querySelector('.hero-bg');
    if (!bg) return;
    const y = Math.min(window.scrollY, 400);
    bg.style.transform = `translateY(${y * 0.45}px)`;
    const main = document.querySelector('.hero-main');
    if (main) { main.style.transform = `translateY(${y * 0.12}px)`; main.style.opacity = String(Math.max(0.2, 1 - y / 380)); }
  });
}, { passive: true });

let lastRouteWasInternal = false;
window.addEventListener('hashchange', () => { lastRouteWasInternal = true; });

// ---------- arranque ----------
function applyTheme() {
  const d = document.documentElement;
  d.dataset.accent = S.settings.accent || 'violet';
  d.dataset.amoled = S.settings.amoled ? '1' : '0';
  d.dataset.motion = S.settings.motion === 'off' ? 'off' : 'auto';
}
export { applyTheme };

function updateOnline() { $('#offline-pill').hidden = navigator.onLine; }

async function handleShareTarget() {
  const p = new URLSearchParams(location.search);
  const shared = p.get('share_url') || p.get('share_text') || p.get('share_title');
  if (!shared) return;
  history.replaceState(null, '', location.pathname + location.hash);
  const m = shared.match(/https?:\/\/\S+/);
  openPasteSheet({ url: m ? m[0] : shared });
}

async function start() {
  hydrateIcons();
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    toast('No se pudo abrir la base de datos local. ¿Estás en modo incógnito?', { timeout: 8000 });
  }
  applyTheme();
  $('#fab').onclick = () => { vibrate(10); openAddChooser(); };
  await render();
  setTimeout(() => $('#splash')?.classList.add('hide'), reducedMotion() ? 0 : 350);
  setTimeout(() => $('#splash')?.remove(), 1200);
  updateOnline();
  setTimeout(checkNewSeasons, 5000);
  addEventListener('online', updateOnline);
  addEventListener('offline', updateOnline);
  handleShareTarget();
  setTimeout(checkReturn, 900);
  registerSW();
}

// ---------- service worker y actualizaciones ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost') return; // en desarrollo local se omite (127.0.0.1 sí lo usa, para probar sin conexión)
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ask = (worker) => toast('Hay una nueva versión de la app', { icon: '✨', action: 'Actualizar', timeout: 15000, onAction: () => worker.postMessage('skipWaiting') });
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) ask(nw); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn('SW', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

// Instalación (Android/Chrome)
export let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; document.documentElement.classList.add('can-install'); });
window.addEventListener('appinstalled', () => { installPrompt = null; document.documentElement.classList.remove('can-install'); toast('¡App instalada! Búscala en tu pantalla de inicio.', { icon: '🏛️' }); });
export function promptInstall() {
  if (!installPrompt) return false;
  installPrompt.prompt();
  installPrompt.userChoice.finally(() => { installPrompt = null; });
  return true;
}

start();
