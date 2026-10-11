// Biblioteca de Alejandría — arranque, rutas, biblioteca y detalle de obra.
import { $, $$, esc, toast, coverHTML, rollNumber, floatText, confetti, tilt, vibrate, debounce, ICONS, relTime, reducedMotion, closeAllSheets, confirmDialog, whenSettled } from './ui.js';
import { S, TYPES, STATUSES, statusLabel, loadAll, saveWork, deleteWork, getWork, changeProgress, setProgress, progressLabel, continueTarget, openUrl, filteredWorks, setPref, currentNumber } from './store.js';
import { PLATFORMS } from './links.js';
import { ATTRIBUTION } from './api.js';
import { openEditor, openPasteSheet } from './editor.js';
import { renderPlatforms, renderPlatform, renderFootball, renderStats, renderSettings, renderImport, streakDays } from './sections.js';
import { uid } from './db.js';

const view = $('#view');
export const APP_VERSION = '1.0.0';

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
    futbol: renderFootball, stats: renderStats, ajustes: renderSettings, importar: renderImport,
  };
  const fn = map[r.name] || renderHome;
  view.classList.remove('view-enter');
  await fn(view);
  hydrateIcons(view);
  if (changed) {
    void view.offsetWidth;
    view.classList.add('view-enter');
    window.scrollTo(0, 0);
  } else if (keepScroll) window.scrollTo(0, scrollY);
  const tab = { home: 'home', obra: 'home', plataformas: 'plataformas', plataforma: 'plataformas', futbol: 'futbol', stats: 'stats', ajustes: 'stats', importar: 'stats' }[r.name] || 'home';
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}
window.addEventListener('hashchange', () => render());

// ---------- tarjetas ----------
export function cardHTML(w, i = 0) {
  const st = STATUSES[w.status];
  const plats = [...new Set((w.links || []).map((l) => l.platform))];
  const canPlus = w.type !== 'pelicula';
  const pct = w.total ? Math.min(100, (currentNumber(w) / w.total) * 100) : 0;
  return `<article class="card" data-id="${w.id}" style="--i:${Math.min(i, 20)}">
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
        ${canPlus ? `<button class="card-plus" data-plus="${w.id}" aria-label="Sumar uno">+1</button>` : ''}
      </div>
    </div>
  </article>`;
}

export async function quickPlus(btn) {
  const w = getWork(btn.dataset.plus);
  if (!w) return;
  vibrate(12);
  await changeProgress(w, 1);
  const card = btn.closest('.card');
  const prog = card?.querySelector('[data-prog]');
  rollNumber(prog, progressLabel(w), 1);
  floatText(btn, '+1');
  if (w.justFinished) { delete w.justFinished; finishPrompt(w); }
}

function finishPrompt(w) {
  toast(`¡Llegaste al final de ${w.title}!`, {
    icon: '🏁', action: 'Marcar terminado', onAction: async () => {
      w.status = 'terminado'; await saveWork(w); confetti(); render({ keepScroll: true });
    },
  });
}

// Delegación global: botones +1 de las tarjetas
document.addEventListener('click', (e) => {
  const plus = e.target.closest('[data-plus]');
  if (plus) { e.preventDefault(); quickPlus(plus); }
});

// ---------- biblioteca ----------
function continueList() {
  return S.works.filter((w) => ['viendo', 'emision'].includes(w.status)).sort((a, b) => (b.lastOpened || b.updatedAt) - (a.lastOpened || a.updatedAt)).slice(0, 12);
}

async function renderHome(root) {
  const f = S.filters;
  const total = S.works.length;
  const streak = streakDays();
  const backupDays = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / 864e5) : null;
  const showBackup = total >= 3 && (backupDays == null || backupDays > 14) && !(S.settings.backupSnooze > Date.now());
  const cont = continueList();
  root.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <img src="icons/icon.svg" alt="" width="38" height="38">
      <div><h1>Biblioteca de Alejandría</h1><p class="sub">${total} ${total === 1 ? 'obra' : 'obras'}${streak ? ` · 🔥 racha de ${streak} ${streak === 1 ? 'día' : 'días'}` : ''}</p></div>
    </div>
    <a href="#/ajustes" class="icon-btn" aria-label="Ajustes">${ICONS.gear}</a>
  </header>
  ${showBackup ? `<div class="banner warn"><span>💾 ${backupDays == null ? 'Aún no has hecho un respaldo.' : `Tu último respaldo fue ${relTime(S.settings.lastBackup)}.`}</span><a href="#/ajustes" class="btn sm">Respaldar</a></div>` : ''}
  <div class="searchbar">
    <span class="ic">${ICONS.search}</span>
    <input id="q" type="search" placeholder="Buscar por nombre…" value="${esc(f.q)}" autocomplete="off" enterkeyhint="search">
    <button class="paste-btn" id="paste-btn">${ICONS.link}<span>Pegar link</span></button>
  </div>
  ${cont.length && !f.q ? `
  <section class="continue">
    <div class="sec-head"><h2>Continuar</h2><span class="muted small">${cont.length} en curso</span></div>
    <div class="carousel" id="carousel">
      ${cont.map((w) => { const t = continueTarget(w); return `
        <div class="c-item" data-id="${w.id}">
          <a href="#/obra/${w.id}" class="c-cover">${coverHTML(w)}<span class="c-shine"></span></a>
          <div class="c-title">${esc(w.title)}</div>
          <div class="c-row"><span class="muted small">${esc(progressLabel(w))}</span>
          ${t ? `<button class="c-go" data-continue="${w.id}" aria-label="Continuar">${ICONS.play}</button>` : `<button class="c-go ghost" data-plus="${w.id}" aria-label="Sumar uno">+1</button>`}</div>
        </div>`; }).join('')}
    </div>
  </section>` : ''}
  <div class="${total ? '' : 'hidden'}">
  <div class="chips scroll-x" id="type-chips" role="tablist">
    ${[['all', 'Todo'], ...Object.entries(TYPES).map(([k, t]) => [k, t.label])].map(([k, l]) => `<button class="chip ${f.type === k ? 'on' : ''}" data-type="${k}">${l}<em>${k === 'all' ? total : S.works.filter((w) => w.type === k).length}</em></button>`).join('')}
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
  q.addEventListener('input', debounce(() => { f.q = q.value; renderGrid(); }, 160));
  $('#paste-btn', root).onclick = () => openPasteSheet();
  $('#type-chips', root).addEventListener('click', (e) => {
    const c = e.target.closest('[data-type]');
    if (!c) return;
    f.type = c.dataset.type;
    $$('#type-chips .chip').forEach((x) => x.classList.toggle('on', x === c));
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
  root.addEventListener('click', onContinueClick);
  setupCarousel($('#carousel', root));
}

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
      </div></div>`;
    $('#e-add').onclick = () => openEditor();
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

// Carrusel 3D: las portadas giran según su distancia al centro
function setupCarousel(el) {
  if (!el) return;
  if (reducedMotion()) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const cx = el.getBoundingClientRect().left + el.clientWidth / 2;
    for (const item of el.children) {
      const r = item.getBoundingClientRect();
      const d = (r.left + r.width / 2 - cx) / el.clientWidth;
      const rot = Math.max(-35, Math.min(35, d * -50));
      const cover = item.firstElementChild;
      cover.style.transform = `perspective(600px) rotateY(${rot}deg) scale(${1 - Math.min(0.12, Math.abs(d) * 0.18)})`;
      cover.style.setProperty('--shine', `${50 + d * 80}%`);
    }
  };
  el.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

async function onContinueClick(e) {
  const b = e.target.closest('[data-continue]');
  if (!b) return;
  e.preventDefault();
  const w = getWork(b.dataset.continue);
  if (w) doContinue(w);
}

export async function doContinue(w) {
  const t = continueTarget(w);
  if (!t) { toast('Esta obra no tiene links guardados.'); return; }
  w.lastOpened = Date.now();
  await saveWork(w, { touch: false });
  openUrl(t.url);
  if (t.next != null && t.next > currentNumber(w)) {
    toast(`Abriendo ${TYPES[w.type].unitLong} ${t.next}`, {
      icon: '📖', action: `Marcar ${TYPES[w.type].unit} ${t.next}`, onAction: async () => {
        await setProgress(w, w.type === 'serie' ? { episode: t.next } : { chapter: t.next });
        await import('./store.js').then((m) => m.logActivity(1));
        render({ keepScroll: true });
        toast(`${w.title}: ${progressLabel(w)}`, { icon: '✅' });
      },
    });
  }
}

// ---------- detalle ----------
function starsHTML(rating) {
  return `<div class="stars" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= rating ? 'on' : ''}" data-star="${n}" role="radio" aria-checked="${n === rating}" aria-label="${n} estrellas">${ICONS.star}</button>`).join('')}</div>`;
}

function counterHTML(w) {
  const t = TYPES[w.type];
  if (w.type === 'pelicula') {
    const seen = w.status === 'terminado';
    return `<section class="panel counter-panel"><button class="btn ${seen ? 'success' : 'primary'} block lg" id="movie-seen">${seen ? '✓ Vista' : 'Marcar como vista'}</button></section>`;
  }
  const n = currentNumber(w);
  const pct = w.total ? Math.min(100, (n / w.total) * 100) : null;
  return `<section class="panel counter-panel">
    ${w.type === 'serie' ? `<div class="season-row">
      <span class="muted">Temporada</span>
      <div class="stepper"><button class="icon-btn sm" data-season="-1" aria-label="Temporada anterior">−</button><b id="season-num">${w.progress.season || 1}</b><button class="icon-btn sm" data-season="1" aria-label="Temporada siguiente">+</button></div>
      <button class="btn sm ghost" id="new-season">Nueva temporada</button>
    </div>` : ''}
    <div class="counter">
      <button class="cbtn minus" data-step="-1" aria-label="Restar uno">−1</button>
      <div class="cval">
        <small>${t.unitLong[0].toUpperCase() + t.unitLong.slice(1)}${w.type === 'serie' ? '' : ''}</small>
        <button class="num" id="num" aria-label="Editar número">${n}</button>
        <small>${w.total ? `de ${w.total}` : 'toca el número para editar'}</small>
      </div>
      <button class="cbtn plus" data-step="1" aria-label="Sumar uno"><span>+1</span></button>
    </div>
    ${pct != null ? `<div class="pbar"><i style="width:${pct}%"></i></div><div class="muted small center">${Math.round(pct)}% completado</div>` : ''}
    ${w.type === 'serie' && w.progress.watched ? `<div class="muted small center">${w.progress.watched} episodios vistos en total</div>` : ''}
  </section>`;
}

function linksHTML(w) {
  const links = w.links || [];
  return `<section class="panel">
    <div class="sec-head"><h3>Dónde lo ${TYPES[w.type].reading ? 'leo' : 'veo'}</h3><button class="btn sm" id="add-link">${ICONS.plus} Link</button></div>
    ${links.length ? `<ul class="links">${links.map((l, i) => {
      const p = PLATFORMS[l.platform] || PLATFORMS.web;
      let shown = l.url; try { const u = new URL(l.url); shown = u.hostname.replace(/^www\./, '') + decodeURI(u.pathname); } catch { /* */ }
      return `<li class="link-row" data-link="${l.id}">
        <span class="pbadge" style="--c:${p.color}">${esc(p.name)}</span>
        <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="link-url">${esc(shown)}</a>
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
        <button class="icon-btn ${w.favorite ? 'on-fav' : ''}" id="fav" aria-label="Favorito" aria-pressed="${w.favorite}">${ICONS.heart}</button>
        <button class="icon-btn" id="edit" aria-label="Editar">${ICONS.edit}</button>
      </header>
      <div class="hero-main">
        <div class="hero-cover" id="hero-cover">${coverHTML(w)}<span class="glare"></span></div>
        <div class="hero-info">
          <div class="chips tight"><span class="badge type-${w.type}">${t.emoji} ${t.label}</span>${w.pubStatus ? `<span class="badge soft">${esc(w.pubStatus)}</span>` : ''}</div>
          <h1>${esc(w.title)}</h1>
          ${starsHTML(w.rating || 0)}
          ${(w.genres || []).length ? `<div class="genres">${w.genres.slice(0, 5).map((g) => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>

    ${target ? `<button class="btn primary block lg continue-btn" id="continue">${ICONS.play} Continuar${target.next ? ` · ${t.unit} ${target.next}` : ''}</button>` : ''}

    ${counterHTML(w)}

    <section class="panel">
      <h3>Estado</h3>
      <div class="chips wrap" id="status-chips">
        ${Object.entries(STATUSES).map(([k, s]) => `<button class="chip ${w.status === k ? 'on' : ''}" data-status="${k}" style="--c:${s.color}"><span class="sdot" style="--c:${s.color}"></span>${statusLabel(k, w.type)}</button>`).join('')}
      </div>
    </section>

    ${linksHTML(w)}

    ${w.synopsis ? `<section class="panel"><h3>Sinopsis</h3><p class="synopsis clamp" id="synopsis">${esc(w.synopsis)}</p><button class="link-btn" id="more">Ver más</button></section>` : ''}

    <section class="panel">
      <div class="sec-head"><h3>Notas</h3><span class="muted small" id="note-state"></span></div>
      <textarea id="notes" rows="4" placeholder="Escribe lo que quieras recordar…">${esc(w.notes || '')}</textarea>
    </section>

    <section class="panel">
      <div class="sec-head"><h3>Spoilers</h3><span class="muted small">toca para revelar</span></div>
      <div id="spoilers">${(w.spoilers || []).map((s) => `<div class="spoiler" data-sp="${s.id}" tabindex="0" role="button" aria-label="Spoiler oculto, toca para revelar"><span class="sp-text">${esc(s.text)}</span><button class="icon-btn xs sp-del" data-delsp="${s.id}" aria-label="Borrar spoiler">${ICONS.close}</button></div>`).join('') || '<p class="muted small">Guarda aquí lo que no quieres ver por accidente.</p>'}</div>
      <div class="sp-add"><textarea id="sp-new" rows="2" placeholder="Nuevo spoiler…"></textarea><button class="btn sm" id="sp-save">Agregar</button></div>
    </section>

    <div class="meta-foot">
      <span>Agregada ${relTime(w.createdAt)} · actualizada ${relTime(w.updatedAt)}</span>
      ${attr ? `<span>${esc(attr.text)} · <a href="${esc(w.source.url || attr.url)}" target="_blank" rel="noopener">ver en ${esc(attr.name)}</a></span>` : ''}
    </div>
    <button class="btn danger ghost block" id="delete">${ICONS.trash} Eliminar obra</button>
  </div>`;

  tilt($('#hero-cover', root), 16);
  $('#back', root).onclick = () => (history.length > 1 && lastRouteWasInternal ? history.back() : go('#/'));
  $('#edit', root).onclick = () => openEditor(w);
  $('#fav', root).onclick = async (e) => {
    const btn = e.currentTarget;
    w.favorite = !w.favorite;
    btn.classList.toggle('on-fav', w.favorite);
    btn.setAttribute('aria-pressed', w.favorite);
    if (w.favorite) { vibrate(15); const r = btn.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, 14); }
    await saveWork(w);
  };
  $('#continue', root)?.addEventListener('click', () => doContinue(w));
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
    rollNumber($('#num', root), currentNumber(w), d);
    if (d > 0) floatText(b, '+1');
    refreshContinue(w, root);
    updatePbar(w, root);
    if (w.justFinished) { delete w.justFinished; finishPrompt(w); }
  }));
  $('#num', root)?.addEventListener('click', (e) => editNumber(w, e.currentTarget, root));
  root.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', async () => {
    await setProgress(w, { season: (w.progress.season || 1) + +b.dataset.season });
    rollNumber($('#season-num', root), w.progress.season, +b.dataset.season);
  }));
  $('#new-season', root)?.addEventListener('click', async () => {
    await setProgress(w, { season: (w.progress.season || 1) + 1 });
    w.progress.episode = 0; await saveWork(w);
    rollNumber($('#season-num', root), w.progress.season, 1);
    rollNumber($('#num', root), 0, -1);
    toast(`Temporada ${w.progress.season} · episodio 0`);
  });
  $('#movie-seen', root)?.addEventListener('click', async (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const seen = w.status !== 'terminado';
    w.status = seen ? 'terminado' : 'pendiente';
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
    if (w.status === 'terminado') { const r = c.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top); vibrate(30); }
  });

  // links
  $('#add-link', root).onclick = () => openPasteSheet({ work: w });
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

  // spoilers
  $('#spoilers', root).addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delsp]');
    if (del) {
      e.stopPropagation();
      if (!(await confirmDialog('¿Borrar spoiler?', 'Esta nota se eliminará.', { ok: 'Borrar', danger: true }))) return;
      w.spoilers = w.spoilers.filter((s) => s.id !== del.dataset.delsp);
      await saveWork(w); render({ keepScroll: true });
      return;
    }
    const sp = e.target.closest('.spoiler');
    if (sp) sp.classList.toggle('revealed');
  });
  $('#spoilers', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('spoiler')) e.target.classList.toggle('revealed'); });
  $('#sp-save', root).onclick = async () => {
    const text = $('#sp-new').value.trim();
    if (!text) return;
    w.spoilers = [...(w.spoilers || []), { id: uid(), text, at: Date.now() }];
    await saveWork(w); render({ keepScroll: true });
  };

  $('#delete', root).onclick = async () => {
    if (!(await confirmDialog('¿Eliminar obra?', `Se borrará "${w.title}" con su progreso, notas y links.`, { ok: 'Eliminar', danger: true }))) return;
    const copy = JSON.parse(JSON.stringify(w));
    await deleteWork(w.id);
    go('#/');
    toast('Obra eliminada', { action: 'Deshacer', onAction: async () => { await saveWork(copy, { touch: false }); render(); } });
  };
}

function refreshContinue(w, root) {
  const btn = $('#continue', root);
  if (!btn) return;
  const t = continueTarget(w);
  btn.innerHTML = `${ICONS.play} Continuar${t?.next ? ` · ${TYPES[w.type].unit} ${t.next}` : ''}`;
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
  $('#fab').onclick = () => { vibrate(10); openEditor(); };
  await render();
  setTimeout(() => $('#splash')?.classList.add('hide'), reducedMotion() ? 0 : 350);
  setTimeout(() => $('#splash')?.remove(), 1200);
  updateOnline();
  addEventListener('online', updateOnline);
  addEventListener('offline', updateOnline);
  handleShareTarget();
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
