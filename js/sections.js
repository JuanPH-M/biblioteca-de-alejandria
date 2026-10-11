// Secciones: plataformas, fútbol, estadísticas, ajustes (respaldo) e importación de marcadores.
import { $, $$, esc, toast, ICONS, openSheet, confirmDialog, debounce, readFile, download, relTime, hueOf, initials, coverHTML, vibrate } from './ui.js';
import { S, TYPES, STATUSES, statusLabel, saveWork, newWork, setPref, deletePattern, buildBackup, restoreBackup, linkFromParsed } from './store.js';
import { PLATFORMS, STREAMING, parseBookmarksHTML, analyzeBookmarks, normKey, KNOWN_SITES } from './links.js';
import { searchTeams, teamFixtures, ATTRIBUTION, searchInfo } from './api.js';
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
export function renderPlatforms(root) {
  const count = (k) => S.works.filter((w) => (w.links || []).some((l) => l.platform === k)).length;
  root.innerHTML = `${pageHeader('Plataformas', 'Dónde ves y lees cada cosa')}
  <div class="plat-grid">
    ${[...STREAMING, 'web'].map((k, i) => {
      const p = PLATFORMS[k], n = count(k);
      return `<a href="#/plataforma/${k}" class="plat-tile" style="--c:${p.color};--i:${i}">
        <span class="plat-glyph">${k === 'web' ? ICONS.book : ICONS.play}</span>
        <span class="plat-name">${esc(p.name)}</span>
        <span class="plat-count">${n} ${n === 1 ? 'obra' : 'obras'}</span>
      </a>`;
    }).join('')}
  </div>`;
}

export function renderPlatform(root, key) {
  const p = PLATFORMS[key] || PLATFORMS.web;
  const list = S.works.filter((w) => (w.links || []).some((l) => l.platform === key)).sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = Object.keys(STATUSES).map((st) => [st, list.filter((w) => w.status === st)]).filter(([, l]) => l.length);
  root.innerHTML = `${backHeader(esc(p.name), `${list.length} ${list.length === 1 ? 'obra' : 'obras'}`, '#/plataformas')}
  <div class="plat-hero" style="--c:${p.color}"><span>${key === 'web' ? ICONS.book : ICONS.play}</span><b>${esc(p.name)}</b></div>
  ${list.length ? groups.map(([st, l]) => `<h2 class="group-title"><span class="sdot" style="--c:${STATUSES[st].color}"></span>${STATUSES[st].label} <em>${l.length}</em></h2>
    <div class="grid">${l.map((w, i) => cardHTML(w, i)).join('')}</div>`).join('')
    : `<div class="empty small"><h3>Nada en ${esc(p.name)} todavía</h3><p class="muted">Cuando agregues un link de ${esc(p.name)} a una obra aparecerá aquí.</p></div>`}`;
}

// ======================= FÚTBOL =======================
function teamAvatar(t, size = '') {
  const c1 = /^#[0-9a-f]{3,8}$/i.test(t.color1) ? t.color1 : `hsl(${hueOf(t.name)} 70% 45%)`;
  const c2 = /^#[0-9a-f]{3,8}$/i.test(t.color2) ? t.color2 : `hsl(${(hueOf(t.name) + 40) % 360} 70% 30%)`;
  const label = (t.short && t.short.length <= 4 ? t.short : initials(t.name)).toUpperCase();
  return `<span class="team-av ${size}" style="--c1:${c1};--c2:${c2}">${esc(label)}</span>`;
}
const fmtDate = (ts) => {
  if (!ts) return 'Fecha por confirmar';
  const d = new Date(ts);
  return d.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
function eventHTML(e, team, past) {
  const homeIsMe = e.homeId === team.id;
  let res = '';
  if (past) {
    const my = homeIsMe ? +e.hs : +e.as, other = homeIsMe ? +e.as : +e.hs;
    res = my > other ? 'win' : my < other ? 'loss' : 'draw';
  }
  return `<li class="ev ${res}">
    <div class="ev-teams"><span class="${homeIsMe ? 'me' : ''}">${esc(e.home)}</span>
      ${past ? `<b class="score">${esc(e.hs)} – ${esc(e.as)}</b>` : '<b class="vs">vs</b>'}
      <span class="${!homeIsMe ? 'me' : ''}">${esc(e.away)}</span></div>
    <div class="ev-meta">${esc(e.league || '')}${e.round ? ` · J${esc(e.round)}` : ''} · ${esc(fmtDate(e.ts))}</div>
    ${past ? `<span class="res-tag">${res === 'win' ? 'G' : res === 'loss' ? 'P' : 'E'}</span>` : ''}
  </li>`;
}

export function renderFootball(root) {
  root.innerHTML = `${pageHeader('Mis equipos', 'Próximos partidos y últimos resultados')}
  <div class="searchbar">
    <span class="ic">${ICONS.search}</span>
    <input id="team-q" type="search" placeholder="Buscar equipo (p. ej. Atlético Nacional)" autocomplete="off" enterkeyhint="search">
  </div>
  <div id="team-results"></div>
  <div id="teams">${S.teams.length ? '' : `<div class="empty small"><div class="empty-art"><span>⚽</span></div><h3>Agrega tus equipos</h3><p class="muted">Busca por nombre y toca "Agregar".</p></div>`}</div>
  <p class="attr">${esc(ATTRIBUTION.thesportsdb.text)} · <a href="${ATTRIBUTION.thesportsdb.url}" target="_blank" rel="noopener">thesportsdb.com</a>. Los escudos oficiales no se muestran: se usan iniciales y colores.</p>`;

  const q = $('#team-q', root), results = $('#team-results', root);
  let token = 0;
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { results.innerHTML = ''; return; }
    const tk = ++token;
    results.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando…</div>';
    try {
      const teams = await searchTeams(v);
      if (tk !== token) return;
      results.innerHTML = teams.length ? `<ul class="team-results">${teams.map((t) => `<li>${teamAvatar(t, 'sm')}<div class="grow"><b>${esc(t.name)}</b><small class="muted">${esc([t.league, t.country].filter(Boolean).join(' · '))}</small></div>
        ${S.teams.some((x) => x.id === t.id) ? '<span class="muted small">Agregado</span>' : `<button class="btn sm primary" data-addteam='${esc(JSON.stringify(t))}'>Agregar</button>`}</li>`).join('')}</ul>`
        : '<div class="muted small pad">No encontré equipos de fútbol con ese nombre. Prueba con el nombre completo o en inglés.</div>';
    } catch {
      if (tk === token) results.innerHTML = '<div class="muted small pad">No se pudo buscar (¿sin conexión?).</div>';
    }
  };
  q.addEventListener('input', debounce(search, 500));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  results.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-addteam]');
    if (!b) return;
    const t = JSON.parse(b.dataset.addteam);
    t.order = S.teams.length;
    S.teams.push(t);
    await db.put('teams', t);
    vibrate(12);
    toast(`${t.name} agregado`, { icon: '⚽' });
    q.value = ''; results.innerHTML = '';
    drawTeams();
  });
  drawTeams();

  function drawTeams() {
    const box = $('#teams', root);
    if (!S.teams.length) return;
    box.innerHTML = S.teams.map((t, i) => `
      <section class="team-card" data-team="${t.id}" style="--i:${i}">
        <div class="team-head">${teamAvatar(t)}<div class="grow"><h3>${esc(t.name)}</h3><small class="muted">${esc([t.league, t.country].filter(Boolean).join(' · '))}</small></div>
          <button class="icon-btn sm" data-refresh="${t.id}" aria-label="Actualizar">${ICONS.refresh}</button>
          <button class="icon-btn sm" data-delteam="${t.id}" aria-label="Quitar equipo">${ICONS.trash}</button></div>
        <div class="team-body" id="fx-${t.id}"><div class="loading-row"><span class="spinner"></span> Cargando partidos…</div></div>
      </section>`).join('');
    S.teams.forEach((t) => loadFixtures(t));
  }
  async function loadFixtures(t, force = false) {
    const box = $('#fx-' + t.id, root);
    if (!box) return;
    try {
      const fx = await teamFixtures(t, { force });
      box.innerHTML = `
        <h4>Próximos</h4>
        ${fx.upcoming.length ? `<ul class="evs">${fx.upcoming.map((e) => eventHTML(e, t, false)).join('')}</ul>` : '<p class="muted small">Sin partidos programados en los datos disponibles.</p>'}
        <h4>Últimos resultados</h4>
        ${fx.results.length ? `<ul class="evs">${fx.results.map((e) => eventHTML(e, t, true)).join('')}</ul>` : '<p class="muted small">Sin resultados recientes.</p>'}
        <p class="muted xsmall">${fx.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(fx.cachedAt)}</p>`;
    } catch {
      box.innerHTML = '<p class="muted small">No se pudieron cargar los partidos. Revisa tu conexión.</p>';
    }
  }
  $('#teams', root).addEventListener('click', async (e) => {
    const r = e.target.closest('[data-refresh]');
    const d = e.target.closest('[data-delteam]');
    if (r) {
      const t = S.teams.find((x) => x.id === r.dataset.refresh);
      r.classList.add('spin');
      await loadFixtures(t, true);
      r.classList.remove('spin');
    }
    if (d) {
      const t = S.teams.find((x) => x.id === d.dataset.delteam);
      if (!(await confirmDialog('¿Quitar equipo?', `${t.name} dejará de aparecer en tu lista.`, { ok: 'Quitar', danger: true }))) return;
      S.teams = S.teams.filter((x) => x.id !== t.id);
      await db.del('teams', t.id);
      renderFootball(root);
    }
  });
}

// ======================= ESTADÍSTICAS =======================
export function streakDays() {
  const a = S.settings.activity || {};
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d = new Date();
  if (!a[key(d)]) d.setDate(d.getDate() - 1); // la racha sigue viva si hoy aún no hay actividad
  let n = 0;
  while (a[key(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
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
  const streak = streakDays();
  const topRated = W.filter((w) => w.rating).sort((a, b) => b.rating - a.rating || b.updatedAt - a.updatedAt).slice(0, 5);

  root.innerHTML = `${pageHeader('Estadísticas', `${W.length} obras en tu biblioteca`)}
  <div class="kpis">
    ${[['📖', chapters, 'capítulos leídos'], ['📺', episodes, 'episodios vistos'], ['🎬', movies, 'películas vistas'], ['❤️', favs.length, 'favoritas'], ['🏁', W.filter((w) => w.status === 'terminado').length, 'terminadas'], ['🔥', streak, streak === 1 ? 'día de racha' : 'días de racha']].map(([ic, n, l], i) => `
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
  const accents = { violet: '#8b5cf6', gold: '#f59e0b', cyan: '#06b6d4', rose: '#f43f5e', emerald: '#10b981' };
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
    <div class="field inline"><span>Color</span><div class="swatches">${Object.entries(accents).map(([k, c]) => `<button class="swatch ${st.accent === k ? 'on' : ''}" data-accent="${k}" style="--c:${c}" aria-label="${k}"></button>`).join('')}</div></div>
    <label class="toggle"><span>Negro puro (AMOLED)</span><input type="checkbox" id="amoled" ${st.amoled ? 'checked' : ''}><i></i></label>
    <label class="toggle"><span>Reducir animaciones</span><input type="checkbox" id="motion" ${st.motion === 'off' ? 'checked' : ''}><i></i></label>
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
    </ul>
    <p class="small muted">Código abierto con licencia MIT.</p>
  </section>`;

  $('#export', root).onclick = async () => {
    const data = await buildBackup();
    const d = new Date();
    download(`biblioteca-alejandria-${d.toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
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
  $$('[data-accent]', root).forEach((b) => b.onclick = async () => { await setPref('accent', b.dataset.accent); applyTheme(); $$('[data-accent]', root).forEach((x) => x.classList.toggle('on', x === b)); });
  $('#amoled', root).onchange = async (e) => { await setPref('amoled', e.target.checked); applyTheme(); };
  $('#motion', root).onchange = async (e) => { await setPref('motion', e.target.checked ? 'off' : 'auto'); applyTheme(); };
  root.querySelector('.pattern-list')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delpat]');
    if (!b) return;
    await deletePattern(b.dataset.delpat);
    renderSettings(root);
  });
  $('#install', root).onclick = () => {
    if (!promptInstall()) {
      openSheet(`<h3 class="sheet-title">Instalar en Android</h3><ol class="steps">
        <li>Abre esta página en <b>Chrome</b>.</li><li>Toca el menú <b>⋮</b> (arriba a la derecha).</li>
        <li>Elige <b>Agregar a pantalla de inicio</b> o <b>Instalar app</b>.</li><li>Confirma con <b>Instalar</b>.</li></ol>
        <p class="muted small">Si ya está instalada, ábrela desde el ícono del templo dorado.</p>`);
    }
  };
  $('#fill-covers', root).onclick = () => fillCovers();
  $('#wipe', root).onclick = async () => {
    if (!(await confirmDialog('¿Borrar todo?', 'Se eliminarán obras, equipos, patrones y ajustes de este teléfono. Haz un respaldo antes.', { ok: 'Borrar todo', danger: true }))) return;
    await Promise.all(['works', 'patterns', 'teams', 'settings', 'cache'].map((s) => db.clear(s)));
    location.reload();
  };
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
        if (!(ex.links || []).some((l) => l.url === it.url)) ex.links = [link, ...(ex.links || []).filter((l) => !(l.host === it.host && l.slug && l.slug === it.slug))];
        if (it.chapter != null && it.chapter > (ex.progress.chapter || 0) && ex.type !== 'serie') ex.progress.chapter = it.chapter;
        await saveWork(ex);
        updated++;
      } else {
        const w = newWork({ title: it.title, type: it.type, status: it.status, links: [link] });
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

