// Secciones: plataformas, fútbol, estadísticas, ajustes (respaldo) e importación de marcadores.
import { $, $$, esc, toast, ICONS, openSheet, confirmDialog, debounce, readFile, download, relTime, hueOf, initials, coverHTML, vibrate } from './ui.js';
import { S, TYPES, STATUSES, TRACK_ONLY, platformsOf, statusLabel, progressLabel, saveWork, newWork, setPref, deletePattern, buildBackup, restoreBackup, linkFromParsed, BROWSERS, browserChoices, openUrl, IS_IOS, IS_ANDROID } from './store.js';
import { PLATFORMS, STREAMING, parseBookmarksHTML, analyzeBookmarks, normKey, KNOWN_SITES } from './links.js';
import { ATTRIBUTION, searchInfo } from './api.js';
import { db } from './db.js';
import { cardHTML, render, go, applyTheme, promptInstall, APP_VERSION } from './app.js';

const backHeader = (title, sub = '', back = '#/') => `
  <header class="topbar">
    <a href="${back}" class="icon-btn" aria-label="Volver">${ICONS.back}</a>
    <div class="grow"><h1 class="page-title">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
  </header>`;
const pageHeader = (title, sub = '') => `
  <header class="topbar">
    <div class="grow"><h1 class="page-title big">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    <a href="#/ajustes" class="icon-btn" aria-label="Ajustes">${ICONS.gear}</a>
  </header>`;

// ======================= PLATAFORMAS =======================
const NONE_KEY = 'ninguna';
function platformWorks(key) {
  if (key === NONE_KEY) return S.works.filter((w) => TRACK_ONLY.includes(w.type) && !platformsOf(w).length);
  return S.works.filter((w) => platformsOf(w).includes(key));
}
const PLAT_DESC = { netflix: 'Series y películas', prime: 'Series y películas', disney: 'Series y películas', hbo: 'Series y películas', youtube: 'Videos y series', crunchyroll: 'Anime', web: 'Manhwas y mangas', [NONE_KEY]: 'Series y películas sin elegir' };

function statusBar(list) {
  if (!list.length) return '<div class="sbar empty"></div>';
  return `<div class="sbar">${Object.entries(STATUSES).map(([k, st]) => { const n = list.filter((w) => w.status === k).length; return n ? `<i style="--c:${st.color};flex:${n}" title="${st.label}: ${n}"></i>` : ''; }).join('')}</div>`;
}
function coverStack(list) {
  const withCover = [...list].sort((a, b) => (b.lastOpened || b.updatedAt) - (a.lastOpened || a.updatedAt)).slice(0, 3);
  return `<div class="pstack">${withCover.map((w, i) => `<span style="--k:${i}">${coverHTML(w)}</span>`).join('')}</div>`;
}

export function renderPlatforms(root) {
  const keys = [...STREAMING, 'web'];
  const none = platformWorks(NONE_KEY);
  const used = keys.filter((k) => platformWorks(k).length);
  const inPlat = new Set(keys.flatMap((k) => platformWorks(k).map((w) => w.id)));
  const active = [...inPlat].map(getWorkById).filter((w) => w && ['viendo', 'emision'].includes(w.status)).length;
  const sorted = [...keys].sort((a, b) => platformWorks(b).length - platformWorks(a).length);
  root.innerHTML = `${pageHeader('📺 Plataformas', 'Dónde ves y lees cada cosa')}
  <section class="plat-summary">
    <div><b data-count="${inPlat.size}">${inPlat.size}</b><small>obras con plataforma</small></div>
    <div><b data-count="${used.length}">${used.length}</b><small>plataformas en uso</small></div>
    <div><b data-count="${active}">${active}</b><small>en curso</small></div>
  </section>
  ${none.length ? `<a href="#/plataforma/${NONE_KEY}" class="banner warn plat-none"><span>🤔 ${none.length} ${none.length === 1 ? 'serie o película no tiene' : 'series o películas no tienen'} plataforma. Tócalo para elegirla.</span><b>›</b></a>` : ''}
  <div class="plat-grid2">
    ${sorted.map((k, i) => {
      const p = PLATFORMS[k], list = platformWorks(k);
      const going = list.filter((w) => ['viendo', 'emision'].includes(w.status)).length;
      return `<a href="#/plataforma/${k}" class="ptile ${list.length ? '' : 'is-empty'}" style="--c:${p.color};--i:${i}">
        <div class="ptile-top"><span class="plat-glyph">${k === 'web' ? ICONS.book : ICONS.play}</span>${list.length ? coverStack(list) : ''}</div>
        <b class="ptile-name">${esc(p.name)}</b>
        <small class="ptile-desc">${list.length ? `${list.length} ${list.length === 1 ? 'obra' : 'obras'}${going ? ` · ${going} en curso` : ''}` : PLAT_DESC[k]}</small>
        ${statusBar(list)}
      </a>`;
    }).join('')}
  </div>
  <p class="muted small center pad">Toca una plataforma para ver todo lo que tienes ahí. En series y películas la plataforma se elige dentro de cada obra.</p>`;
  animateCounts(root);
}

export function renderPlatform(root, key) {
  const isNone = key === NONE_KEY;
  const p = isNone ? { name: 'Sin plataforma', color: '#64748b' } : (PLATFORMS[key] || PLATFORMS.web);
  const list = platformWorks(key).sort((a, b) => b.updatedAt - a.updatedAt);
  const going = list.filter((w) => ['viendo', 'emision'].includes(w.status));
  const done = list.filter((w) => w.status === 'terminado').length;
  const progressSum = list.reduce((s2, w) => s2 + (w.type === 'serie' ? Math.max(w.progress.watched || 0, w.progress.episode || 0) : w.type === 'pelicula' ? 0 : Math.floor(w.progress.chapter || 0)), 0);
  let filter = 'all';
  root.innerHTML = `${backHeader(esc(p.name), `${list.length} ${list.length === 1 ? 'obra' : 'obras'}`, '#/plataformas')}
  <section class="plat-hero2" style="--c:${p.color}">
    <div class="ph-glow"></div>
    <div class="ph-row"><span class="plat-glyph big">${isNone ? '🤔' : key === 'web' ? ICONS.book : ICONS.play}</span><div><h2>${esc(p.name)}</h2><small>${PLAT_DESC[key] || ''}</small></div></div>
    <div class="ph-stats">
      <div><b data-count="${list.length}">${list.length}</b><small>obras</small></div>
      <div><b data-count="${going.length}">${going.length}</b><small>en curso</small></div>
      <div><b data-count="${done}">${done}</b><small>terminadas</small></div>
      <div><b data-count="${progressSum}">${progressSum}</b><small>${key === 'web' ? 'capítulos' : 'cap./ep.'}</small></div>
    </div>
    ${statusBar(list)}
  </section>
  ${isNone && list.length ? '<p class="note" style="margin:0 16px 10px">Abre cada una y elige en "Dónde la veo" su plataforma, o mantén presionada la tarjeta.</p>' : ''}
  ${going.length > 1 ? `<section class="continue"><div class="sec-head"><h2>En curso aquí</h2></div><div class="carousel">${going.map((w, i) => `
    <div class="c-item" data-id="${w.id}" style="--i:${i}"><a href="#/obra/${w.id}" class="c-cover">${coverHTML(w)}</a><div class="c-title">${esc(w.title)}</div><div class="c-row"><span class="muted small">${esc(progressLabel(w))}</span></div></div>`).join('')}</div></section>` : ''}
  ${list.length ? `<div class="chips scroll-x pf-chips" id="pf-chips">
      <button class="chip on" data-pf="all">Todas <em>${list.length}</em></button>
      ${Object.entries(STATUSES).map(([k, st]) => { const n = list.filter((w) => w.status === k).length; return n ? `<button class="chip" data-pf="${k}"><span class="sdot" style="--c:${st.color}"></span>${statusLabel(k, list[0].type)} <em>${n}</em></button>` : ''; }).join('')}
    </div>
    <div class="grid" id="pf-grid"></div>`
    : `<div class="empty small"><div class="empty-art"><span>${isNone ? '🎉' : '📭'}</span></div><h3>${isNone ? 'Todas tus series y películas tienen plataforma' : `Nada en ${esc(p.name)} todavía`}</h3><p class="muted">${isNone ? '' : key === 'web' ? 'Agrega el link de donde lees un manhwa o manga y aparecerá aquí.' : `Elige ${esc(p.name)} en "Dónde la veo" al agregar una serie o película.`}</p>${isNone ? '' : '<button class="btn primary" id="pf-add">＋ Agregar</button>'}</div>`}`;
  const draw = () => {
    const g = $('#pf-grid', root);
    if (!g) return;
    const l = filter === 'all' ? list : list.filter((w) => w.status === filter);
    g.innerHTML = l.map((w, i) => cardHTML(w, i)).join('');
  };
  draw();
  $('#pf-chips', root)?.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pf]');
    if (!c) return;
    filter = c.dataset.pf;
    $$('#pf-chips .chip', root).forEach((x) => x.classList.toggle('on', x === c));
    vibrate(6);
    draw();
  });
  $('#pf-add', root)?.addEventListener('click', () => import('./editor.js').then((m) => m.openAddChooser()));
  root.querySelectorAll('.c-item').forEach((card) => card.addEventListener('click', (e) => { if (!e.target.closest('a, button')) go('#/obra/' + card.dataset.id); }));
  animateCounts(root);
}

function animateCounts(root) {
  $$('[data-count]', root).forEach((el) => {
    const target = +el.dataset.count;
    if (document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches || !target) { el.textContent = target.toLocaleString('es'); return; }
    const t0 = performance.now(), dur = 800;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString('es'); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
const getWorkById = (id) => S.works.find((w) => w.id === id);

// ======================= ESTADÍSTICAS =======================
export function todayCount() {
  const d = new Date();
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (S.settings.activity || {})[k] || 0;
}

export function renderStats(root) {
  const W = S.works;
  const reading = W.filter((w) => TYPES[w.type].reading);
  const chapters = reading.reduce((s, w) => s + Math.floor(w.progress.chapter || 0), 0);
  const episodes = W.filter((w) => w.type === 'anime').reduce((s, w) => s + (w.progress.chapter || 0), 0) + W.filter((w) => w.type === 'serie').reduce((s, w) => s + Math.max(w.progress.watched || 0, w.progress.episode || 0), 0);
  const movies = W.filter((w) => w.type === 'pelicula' && w.status === 'terminado').length;
  const favs = W.filter((w) => w.favorite);
  const byType = Object.entries(TYPES).map(([k, t]) => [t.label, W.filter((w) => w.type === k).length, k]);
  const byStatus = Object.entries(STATUSES).map(([k, s]) => [s.label, W.filter((w) => w.status === k).length, s.color]);
  const maxT = Math.max(1, ...byType.map((x) => x[1]));
  const total = W.length || 1;
  // dona de estados
  let acc = 0;
  const conic = byStatus.filter((x) => x[1]).map(([, n, c]) => { const a0 = acc; acc += (n / total) * 360; return `${c} ${a0}deg ${acc}deg`; }).join(',') || 'var(--surface-2) 0 360deg';
  // géneros
  const gcount = {};
  W.forEach((w) => (w.genres || []).forEach((g) => { gcount[g] = (gcount[g] || 0) + 1; }));
  const topGenres = Object.entries(gcount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // mapa de calor 16 semanas
  const act = S.settings.activity || {};
  const days = [];
  const today = new Date();
  const start = new Date(today); // lunes de hace 15 semanas
  start.setDate(today.getDate() - 7 * 15 - ((today.getDay() + 6) % 7));
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push([k, act[k] || 0]);
  }
  const maxA = Math.max(1, ...days.map((d) => d[1]));
  const lvl = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / maxA) * 4)));
  const topRated = W.filter((w) => w.rating).sort((a, b) => b.rating - a.rating || b.updatedAt - a.updatedAt).slice(0, 5);

  root.innerHTML = `${pageHeader('Estadísticas', `${W.length} obras en tu biblioteca`)}
  <div class="kpis">
    ${[['📖', chapters, 'capítulos leídos'], ['📺', episodes, 'episodios vistos'], ['🎬', movies, 'películas vistas'], ['❤️', favs.length, 'favoritas'], ['🏁', W.filter((w) => w.status === 'terminado').length, 'terminadas'], ['▶️', W.filter((w) => ['viendo', 'emision'].includes(w.status)).length, 'en curso']].map(([ic, n, l], i) => `
      <div class="kpi" style="--i:${i}"><span class="kpi-ic">${ic}</span><b data-count="${n}">0</b><small>${l}</small></div>`).join('')}
  </div>

  <section class="panel">
    <h3>Por tipo</h3>
    <div class="bars">${byType.map(([l, n, k], i) => `<div class="bar-row"><span>${l}</span><div class="bar"><i class="type-${k}" style="--w:${(n / maxT) * 100}%;--i:${i}"></i></div><b>${n}</b></div>`).join('')}</div>
  </section>

  <section class="panel">
    <h3>Por estado</h3>
    <div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(${conic})"><div><b>${W.length}</b><small>obras</small></div></div>
      <ul class="legend">${byStatus.map(([l, n, c]) => `<li><span class="sdot" style="--c:${c}"></span>${l}<b>${n}</b></li>`).join('')}</ul>
    </div>
  </section>

  <section class="panel">
    <div class="sec-head"><h3>Actividad</h3><span class="muted small">últimas 16 semanas</span></div>
    <div class="heat">${days.map(([k, n]) => `<i class="l${lvl(n)}" title="${k}: ${n}"></i>`).join('')}</div>
    <div class="heat-legend muted xsmall">menos <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> más</div>
  </section>

  ${topGenres.length ? `<section class="panel"><h3>Géneros favoritos</h3><div class="genre-cloud">${topGenres.map(([g, n], i) => `<span style="--i:${i};--s:${1 + (n / topGenres[0][1]) * 0.4}">${esc(g)} <em>${n}</em></span>`).join('')}</div></section>` : ''}

  ${topRated.length ? `<section class="panel"><h3>Mejor calificadas</h3><ul class="mini-list">${topRated.map((w) => `<li><a href="#/obra/${w.id}">${coverHTML(w, 'xs')}<span class="grow">${esc(w.title)}<small class="muted">${TYPES[w.type].label}</small></span><span class="gold">${'★'.repeat(w.rating)}</span></a></li>`).join('')}</ul></section>` : ''}

  ${favs.length ? `<section class="panel"><h3>Favoritas</h3><div class="fav-strip">${favs.slice(0, 12).map((w) => `<a href="#/obra/${w.id}" title="${esc(w.title)}">${coverHTML(w, 'sm')}</a>`).join('')}</div></section>` : ''}`;

  // contadores animados
  $$('[data-count]', root).forEach((el) => {
    const target = +el.dataset.count;
    if (document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) { el.textContent = target.toLocaleString('es'); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('es'); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ======================= AJUSTES =======================
export function renderSettings(root) {
  const st = S.settings;
  const days = st.lastBackup ? Math.floor((Date.now() - st.lastBackup) / 864e5) : null;
  const patterns = Object.values(S.patterns);
  const accents = [
    ['violet', 'Violeta', '#8b5cf6', '#ec4899'], ['azul', 'Azul', '#3b82f6', '#06b6d4'], ['cyan', 'Cian', '#06b6d4', '#3b82f6'],
    ['emerald', 'Esmeralda', '#10b981', '#84cc16'], ['gold', 'Dorado', '#f59e0b', '#ef4444'], ['naranja', 'Naranja', '#f97316', '#facc15'],
    ['rose', 'Coral', '#f43f5e', '#a855f7'], ['rojo', 'Rojo', '#dc2626', '#f97316'], ['rosa', 'Rosa', '#ec4899', '#8b5cf6'], ['blanco', 'Blanco', '#f4f4f5', '#71717a'],
  ];
  root.innerHTML = `${backHeader('Ajustes', `Versión ${APP_VERSION}`, '#/')}

  <section class="panel">
    <h3>💾 Respaldo</h3>
    <div class="backup-state ${days == null || days > 14 ? 'warn' : 'ok'}">
      <b>Último respaldo: ${st.lastBackup ? `${new Date(st.lastBackup).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} (${relTime(st.lastBackup)})` : 'nunca'}</b>
      <small>${days == null || days > 14 ? 'Te recomiendo respaldar cada 2 semanas. Tus datos viven solo en este teléfono.' : 'Todo bien. Guarda el archivo en Drive o en tu computador.'}</small>
    </div>
    <div class="col-btns">
      <button class="btn primary" id="export">${ICONS.download} Exportar respaldo (JSON)</button>
      <label class="btn">${ICONS.upload} Importar respaldo<input type="file" accept=".json,application/json" id="import-json" hidden></label>
    </div>
  </section>

  <section class="panel">
    <h3>🔖 Marcadores de Chrome</h3>
    <p class="muted small">Importa el archivo .html que exporta Chrome. Reconozco ${KNOWN_SITES.join(', ')} y los sitios que ya me enseñaste.</p>
    <a class="btn block" href="#/importar">${ICONS.upload} Importar marcadores</a>
  </section>

  <section class="panel">
    <h3>🎨 Apariencia</h3>
    <p class="muted small">Elige el color de la app. Con <b>Blanco</b> el fondo es negro, las letras blancas y los botones blancos.</p>
    <div class="palette">${accents.map(([k, name, c, c2], i) => `<button class="pal ${st.accent === k ? 'on' : ''}" data-accent="${k}" style="--c:${c};--c2:${c2};--i:${i}" aria-label="Color ${name}"><i></i><span>${name}</span></button>`).join('')}</div>
    <label class="toggle"><span>Negro puro (AMOLED)</span><input type="checkbox" id="amoled" ${st.amoled ? 'checked' : ''}><i></i></label>
    <label class="toggle"><span>Reducir animaciones</span><input type="checkbox" id="motion" ${st.motion === 'off' ? 'checked' : ''}><i></i></label>
  </section>

  <section class="panel" id="browser-panel">
    <h3>🔗 Abrir los links con</h3>
    <p class="muted small">Elige dónde se abren tus capítulos y links: dentro de la app o en el navegador que prefieras.</p>
    <div class="br-list" role="radiogroup">${browserChoices().map((k, i) => { const b = BROWSERS[k]; const on = (st.browser || 'system') === k; return `<button class="br-opt ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-browser="${k}" style="--i:${i}">
      <span class="br-emoji">${b.emoji}</span><span class="grow"><b>${esc(b.name)}</b>${b.desc ? `<small>${esc(b.desc)}</small>` : ''}</span><i class="br-radio"></i></button>`; }).join('')}</div>
    ${IS_IOS || IS_ANDROID ? '<p class="note">Si eliges un navegador que no tienes instalado, el link se abre en el navegador normal.</p>' : '<p class="note">En el teléfono podrás elegir Chrome, Brave, Firefox, Safari y otros. En el computador se usa el navegador actual.</p>'}
    <button class="btn block" id="br-test">${ICONS.play} Probar con un link</button>
  </section>

  <section class="panel">
    <h3>🧩 Patrones de sitios</h3>
    ${patterns.length ? `<ul class="pattern-list">${patterns.map((p) => `<li><div class="grow"><b>${esc(p.host)}</b><small class="muted">${p.none ? 'Sin número de capítulo' : p.confirmed ? 'Patrón confirmado' : `Capítulo = número ${p.fromEnd + 1}° desde el final`}</small></div><button class="icon-btn xs" data-delpat="${esc(p.host)}" aria-label="Borrar patrón">${ICONS.close}</button></li>`).join('')}</ul>`
      : '<p class="muted small">Cuando pegues links de sitios nuevos y elijas el número del capítulo, aparecerán aquí.</p>'}
  </section>

  <section class="panel">
    <h3>🛠️ Herramientas</h3>
    <div class="col-btns">
      <button class="btn" id="fill-covers">${ICONS.sparkle} Completar portadas faltantes</button>
      <button class="btn install-btn" id="install">📲 Instalar app</button>
      <button class="btn danger ghost" id="wipe">${ICONS.trash} Borrar todos los datos</button>
    </div>
  </section>

  <section class="panel about">
    <h3>Acerca de</h3>
    <p class="small">Biblioteca de Alejandría guarda <b>solo tus links y tu progreso</b>. No aloja, descarga ni muestra capítulos, episodios ni videos: los links se abren en tu navegador.</p>
    <ul class="small attr-list">
      <li>Datos de manhwa, manga y anime: <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a></li>
      <li>Datos de series: <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a> (CC BY-SA 4.0)</li>
      <li>Datos de películas y series: <a href="https://es.wikipedia.org" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA 4.0)</li>
      <li>Fútbol: <a href="https://www.thesportsdb.com" target="_blank" rel="noopener">TheSportsDB</a></li>
      <li>NBA, MLB y UFC: datos públicos de <a href="https://www.espn.com" target="_blank" rel="noopener">ESPN</a></li>
      <li>Fórmula 1: <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener">Jolpica F1</a> (Ergast)</li>
    </ul>
    <p class="small muted">Código abierto con licencia MIT.</p>
  </section>`;

  $('#export', root).onclick = async () => {
    const data = await buildBackup();
    const d = new Date();
    const name = `biblioteca-alejandria-${d.toISOString().slice(0, 10)}.json`;
    const text = JSON.stringify(data, null, 1);
    const file = typeof File !== 'undefined' ? new File([text], name, { type: 'application/json' }) : null;
    if (isIOS() && file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Respaldo Biblioteca de Alejandría' }); } catch (err) { if (err.name === 'AbortError') return; download(name, text); }
    } else download(name, text);
    await setPref('lastBackup', Date.now());
    toast(`Respaldo exportado: ${data.works.length} obras`, { icon: '💾' });
    renderSettings(root);
  };
  $('#import-json', root).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await readFile(f)); } catch { toast('El archivo no es un JSON válido.'); return; }
    if (data?.app !== 'biblioteca-de-alejandria') { toast('Ese archivo no es un respaldo de esta app.'); return; }
    const s = openSheet(`<h3 class="sheet-title">Importar respaldo</h3>
      <p class="muted">${data.works.length} obras, ${(data.teams || []).length} equipos y ${(data.patterns || []).length} patrones · exportado ${esc(new Date(data.exportedAt).toLocaleString('es'))}</p>
      <div class="col-btns">
        <button class="btn primary" data-mode="merge"><b>Unir</b> · agrega lo nuevo y conserva lo más reciente</button>
        <button class="btn danger" data-mode="replace"><b>Reemplazar</b> · borra lo actual y usa el respaldo</button>
      </div>`);
    s.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-mode]');
      if (!b) return;
      if (b.dataset.mode === 'replace' && !(await confirmDialog('¿Reemplazar todo?', 'Se borrarán las obras, equipos y patrones actuales.', { ok: 'Reemplazar', danger: true }))) return;
      try {
        await restoreBackup(data, b.dataset.mode);
        applyTheme();
        s.close();
        toast(b.dataset.mode === 'replace' ? 'Respaldo restaurado' : 'Respaldo unido', { icon: '✅' });
        render();
      } catch (err) { toast(err.message || 'No se pudo importar.'); }
    });
  };
  $$('[data-accent]', root).forEach((b) => b.onclick = async () => { await setPref('accent', b.dataset.accent); applyTheme(); vibrate(10); $$('[data-accent]', root).forEach((x) => x.classList.toggle('on', x === b)); });
  $('#browser-panel .br-list', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-browser]');
    if (!b) return;
    await setPref('browser', b.dataset.browser);
    vibrate(8);
    $$('[data-browser]', root).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    toast(`Los links se abrirán con: ${BROWSERS[b.dataset.browser].name}`, { icon: BROWSERS[b.dataset.browser].emoji });
  });
  $('#br-test', root).onclick = () => openUrl('https://es.wikipedia.org/wiki/Biblioteca_de_Alejandr%C3%ADa');
  $('#amoled', root).onchange = async (e) => { await setPref('amoled', e.target.checked); applyTheme(); };
  $('#motion', root).onchange = async (e) => { await setPref('motion', e.target.checked ? 'off' : 'auto'); applyTheme(); };
  root.querySelector('.pattern-list')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delpat]');
    if (!b) return;
    if (!(await confirmDialog('¿Borrar este patrón?', `La app volverá a preguntarte cuál es el número del capítulo en ${b.dataset.delpat}.`, { ok: 'Borrar', danger: true }))) return;
    await deletePattern(b.dataset.delpat);
    renderSettings(root);
  });
  $('#install', root).onclick = () => {
    if (!promptInstall()) openInstallHelp();
  };
  $('#fill-covers', root).onclick = () => fillCovers();
  $('#wipe', root).onclick = async () => {
    if (!(await confirmDialog('¿Borrar todo?', 'Se eliminarán obras, equipos, patrones y ajustes de este teléfono. Haz un respaldo antes.', { ok: 'Borrar todo', danger: true }))) return;
    await Promise.all(['works', 'patterns', 'teams', 'settings', 'cache'].map((s) => db.clear(s)));
    location.reload();
  };
}

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function openInstallHelp() {
  const ios = isIOS();
  openSheet(`<h3 class="sheet-title">📲 Instalar la app</h3>
    ${isStandalone() ? '<p class="banner ok">✅ Ya la estás usando instalada.</p>' : ''}
    <div class="seg mini3 two" id="ih-tabs"><button class="${ios ? '' : 'on'}" data-os="android">Android</button><button class="${ios ? 'on' : ''}" data-os="ios">iPhone</button></div>
    <ol class="steps big-steps" data-os-steps="android" ${ios ? 'hidden' : ''}>
      <li><span>1</span><div>Abre la app en <b>Google Chrome</b>.</div></li>
      <li><span>2</span><div>Toca el menú <b>⋮</b> arriba a la derecha.</div></li>
      <li><span>3</span><div>Elige <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</div></li>
      <li><span>4</span><div>Confirma con <b>Instalar</b>. Aparece el ícono del templo dorado.</div></li>
    </ol>
    <ol class="steps big-steps" data-os-steps="ios" ${ios ? '' : 'hidden'}>
      <li><span>1</span><div>Abre la app en <b>Safari</b> (en iPhone solo Safari permite instalarla).</div></li>
      <li><span>2</span><div>Toca el botón <b>Compartir</b> <i class="ios-share">⬆︎</i> abajo en el centro.</div></li>
      <li><span>3</span><div>Baja y elige <b>Agregar a inicio</b>.</div></li>
      <li><span>4</span><div>Toca <b>Agregar</b> arriba a la derecha. Ábrela siempre desde el ícono.</div></li>
    </ol>
    <p class="muted small">Instalada funciona a pantalla completa y sin internet para ver tu lista.</p>`).el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-os]');
    if (!b) return;
    const sheet = b.closest('.sheet-body');
    $$('[data-os]', sheet).forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-os-steps]', sheet).forEach((ol) => { ol.hidden = ol.dataset.osSteps !== b.dataset.os; });
  });
}

// Busca portada y datos para las obras que no tienen (respeta los límites de las APIs)
export async function fillCovers(ids = null) {
  const list = S.works.filter((w) => !w.cover && (!ids || ids.includes(w.id)));
  if (!list.length) { toast('Todas las obras tienen portada.'); return; }
  if (!navigator.onLine) { toast('Necesitas conexión para buscar portadas.'); return; }
  const s = openSheet(`<h3 class="sheet-title">Buscando portadas</h3><p class="muted small" id="fc-msg">0 de ${list.length}</p><div class="pbar"><i id="fc-bar" style="width:0%"></i></div><button class="btn ghost block" id="fc-stop">Detener</button>`);
  let stop = false, found = 0;
  $('#fc-stop', s.el).onclick = () => { stop = true; s.close(); };
  for (let i = 0; i < list.length && !stop; i++) {
    const w = list[i];
    try {
      const res = await searchInfo(w.title, w.type);
      const key = normKey(w.title);
      const best = res.find((r) => normKey(r.title) === key || (r.altTitles || []).some((a) => normKey(a) === key)) || (res[0] && res.length && normKey(res[0].title).includes(key.slice(0, 6)) ? res[0] : null);
      if (best && best.cover) {
        w.cover = best.cover;
        if (!w.synopsis) w.synopsis = best.synopsis;
        if (!w.genres?.length) w.genres = best.genres;
        if (!w.pubStatus) w.pubStatus = best.pubStatus;
        if (!w.total && best.total) w.total = best.total;
        if (!w.source) w.source = { api: best.source, id: best.sourceId, url: best.sourceUrl };
        await saveWork(w, { touch: false });
        found++;
      }
    } catch { /* se sigue con la siguiente */ }
    if (!s.open) break;
    $('#fc-msg', s.el).textContent = `${i + 1} de ${list.length} · ${found} encontradas`;
    $('#fc-bar', s.el).style.width = ((i + 1) / list.length) * 100 + '%';
    await new Promise((r) => setTimeout(r, 800)); // AniList permite ~90 consultas por minuto
  }
  if (s.open) s.close();
  toast(`${found} portadas encontradas`, { icon: '🖼️' });
  render({ keepScroll: true });
}

// ======================= IMPORTAR MARCADORES =======================
let importState = null;

export function renderImport(root) {
  root.innerHTML = `${backHeader('Importar marcadores', 'Desde el archivo .html de Chrome', '#/ajustes')}
  <section class="panel">
    <ol class="steps small">
      <li>En el computador, abre Chrome y presiona <b>Ctrl + Shift + O</b>.</li>
      <li>Toca <b>⋮</b> → <b>Exportar marcadores</b> y guarda el archivo .html.</li>
      <li>Pásalo al teléfono (Drive, WhatsApp, cable…) y selecciónalo aquí.</li>
    </ol>
    <label class="btn primary block">${ICONS.upload} Elegir archivo .html<input type="file" accept=".html,.htm,text/html" id="bm-file" hidden></label>
  </section>
  <div id="bm-review"></div>`;
  $('#bm-file', root).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const html = await readFile(f);
      const bms = parseBookmarksHTML(html);
      importState = analyzeBookmarks(bms, S.patterns);
      drawReview();
    } catch (err) {
      console.error(err);
      toast('No pude leer ese archivo de marcadores.');
    }
  };
  if (importState) drawReview();

  function drawReview() {
    const box = $('#bm-review', root);
    const { items, ignored, total } = importState;
    const existingKey = new Map(S.works.map((w) => [normKey(w.title), w]));
    const sel = items.filter((i) => i.selected).length;
    box.innerHTML = `
      <div class="import-sum"><b>${total}</b> marcadores · <b>${items.length}</b> obras detectadas · ${ignored} ignorados (no parecen lecturas ni streaming)</div>
      <div class="row-btns sm"><button class="btn sm ghost" id="bm-all">Marcar todas</button><button class="btn sm ghost" id="bm-none">Desmarcar todas</button></div>
      <ul class="bm-list">${items.map((it, i) => {
        const ex = existingKey.get(normKey(it.title));
        return `<li class="bm ${it.selected ? '' : 'off'}" data-i="${i}" style="--i:${Math.min(i, 20)}">
          <label class="check"><input type="checkbox" data-sel ${it.selected ? 'checked' : ''}><i></i></label>
          <div class="bm-main">
            <input class="bm-title" data-f="title" value="${esc(it.title)}" aria-label="Nombre">
            <div class="bm-meta">
              <select data-f="type" aria-label="Tipo">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
              <select data-f="status" aria-label="Estado">${Object.entries(STATUSES).map(([k]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${statusLabel(k, it.type)}</option>`).join('')}</select>
              <label class="bm-ch">Cap. <input type="number" step="any" min="0" data-f="chapter" value="${it.chapter ?? ''}" placeholder="?"></label>
            </div>
            <small class="muted">${esc(PLATFORMS[it.platform].name)} · ${esc(it.host)}${it.count > 1 ? ` · ${it.count} marcadores unidos` : ''}${it.folders ? ` · 📁 ${esc(it.folders)}` : ''}${ex ? ' · <span class="tag">ya existe: se actualizará</span>' : ''}${it.mode === 'pick' ? ' · <span class="tag warn">sitio nuevo</span>' : ''}</small>
          </div>
          <button class="icon-btn xs" data-rm aria-label="Quitar de la lista">${ICONS.close}</button>
        </li>`;
      }).join('')}</ul>
      <div class="sticky-actions"><button class="btn primary block lg" id="bm-save" ${sel ? '' : 'disabled'}>Guardar ${sel} ${sel === 1 ? 'obra' : 'obras'}</button></div>`;

    $('#bm-all', box).onclick = () => { items.forEach((i) => { i.selected = true; }); drawReview(); };
    $('#bm-none', box).onclick = () => { items.forEach((i) => { i.selected = false; }); drawReview(); };
    const list = $('.bm-list', box);
    list.addEventListener('change', (e) => {
      const li = e.target.closest('[data-i]');
      const it = items[+li.dataset.i];
      if (e.target.matches('[data-sel]')) { it.selected = e.target.checked; li.classList.toggle('off', !it.selected); updateCount(); }
      const f = e.target.dataset.f;
      if (f === 'chapter') it.chapter = e.target.value === '' ? null : parseFloat(e.target.value);
      else if (f) it[f] = e.target.value;
    });
    list.addEventListener('click', (e) => {
      if (!e.target.closest('[data-rm]')) return;
      const li = e.target.closest('[data-i]');
      items.splice(+li.dataset.i, 1);
      drawReview();
    });
    const updateCount = () => {
      const n = items.filter((i) => i.selected).length;
      const b = $('#bm-save', box);
      b.disabled = !n;
      b.textContent = `Guardar ${n} ${n === 1 ? 'obra' : 'obras'}`;
    };
    $('#bm-save', box).onclick = saveImport;
  }

  async function saveImport() {
    const chosen = importState.items.filter((i) => i.selected);
    const byKey = new Map(S.works.map((w) => [normKey(w.title), w]));
    let created = 0, updated = 0;
    const newIds = [];
    for (const it of chosen) {
      const link = linkFromParsed({ url: it.url, platform: it.platform, host: it.host, slug: it.slug, rule: it.rule });
      const ex = byKey.get(normKey(it.title));
      if (ex) {
        if (TRACK_ONLY.includes(ex.type)) { if (it.platform !== 'web') ex.platform = it.platform; }
        else if (!(ex.links || []).some((l) => l.url === it.url)) ex.links = [link, ...(ex.links || []).filter((l) => !(l.host === it.host && l.slug && l.slug === it.slug))];
        if (it.chapter != null && it.chapter > (ex.progress.chapter || 0) && ex.type !== 'serie') ex.progress.chapter = it.chapter;
        await saveWork(ex);
        updated++;
      } else {
        const track = TRACK_ONLY.includes(it.type);
        const w = newWork({ title: it.title, type: it.type, status: it.status, links: track ? [] : [link], platform: track && it.platform !== 'web' ? it.platform : '' });
        if (it.chapter != null) { if (it.type === 'serie') w.progress.episode = it.chapter; else w.progress.chapter = it.chapter; }
        await saveWork(w);
        byKey.set(normKey(w.title), w);
        newIds.push(w.id);
        created++;
      }
    }
    importState = null;
    vibrate(20);
    const s = openSheet(`<h3 class="sheet-title">¡Importación lista! 🎉</h3>
      <p>${created} obras nuevas y ${updated} actualizadas.</p>
      <p class="muted small">¿Busco portadas, sinopsis y géneros automáticamente para las obras nuevas? (usa AniList/TVmaze, tarda ~1 segundo por obra)</p>
      <div class="col-btns"><button class="btn primary" id="go-covers">${ICONS.sparkle} Buscar portadas</button><button class="btn ghost" id="go-home">Ahora no</button></div>`);
    $('#go-covers', s.el).onclick = () => { s.close(); go('#/'); setTimeout(() => fillCovers(newIds), 400); };
    $('#go-home', s.el).onclick = () => { s.close(); go('#/'); };
  }
}

