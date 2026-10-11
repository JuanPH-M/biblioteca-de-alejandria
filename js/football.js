// Fútbol: mis equipos y ligas en recuadros; al tocar uno se abre su información.
import { $, $$, esc, toast, ICONS, openSheet, confirmDialog, debounce, relTime, hueOf, initials, vibrate, imageToDataURL } from './ui.js';
import { S, setPref, openUrl } from './store.js';
import { searchTeams, teamFixtures, ATTRIBUTION, POPULAR_LEAGUES, searchLeagues, leagueOverview, matchInfo } from './api.js';
import { db } from './db.js';

let tab = 'equipos';
let rootEl = null;

// ---------- piezas visuales ----------
const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// Escudo: el que tú subas; si no, iniciales con colores
export function teamAvatar(t, size = '') {
  const name = t.name || t.team || '?';
  const known = t.logo ? t : S.teams.find((x) => (t.id && x.id === t.id) || norm(x.name) === norm(name));
  if (known?.logo) return `<span class="team-av logo ${size}"><img src="${esc(known.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('logo');this.remove()"></span>`;
  const c1 = /^#[0-9a-f]{3,8}$/i.test(t.color1 || '') ? t.color1 : `hsl(${hueOf(name)} 70% 45%)`;
  const c2 = /^#[0-9a-f]{3,8}$/i.test(t.color2 || '') ? t.color2 : `hsl(${(hueOf(name) + 40) % 360} 70% 30%)`;
  const label = (t.short && t.short.length <= 4 ? t.short : initials(name)).toUpperCase();
  return `<span class="team-av ${size}" style="--c1:${c1};--c2:${c2}">${esc(label)}</span>`;
}
function leagueStyle(lg) {
  const pop = POPULAR_LEAGUES.find((p) => p.id === lg.id);
  return {
    c1: pop?.c1 || `hsl(${hueOf(lg.name)} 60% 30%)`,
    c2: pop?.c2 || `hsl(${(hueOf(lg.name) + 60) % 360} 70% 55%)`,
    flag: pop?.flag || '🏆',
  };
}
function leagueBadge(lg, size = '') {
  const st = leagueStyle(lg);
  if (lg.logo) return `<span class="lg-badge logo ${size}"><img src="${esc(lg.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  return `<span class="lg-badge ${size}" style="--c1:${st.c1};--c2:${st.c2}">${st.flag}</span>`;
}
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Fecha por confirmar');
const shortDate = (ts) => (ts ? new Date(ts).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const played = (e) => e.hs != null && e.hs !== '';

function eventHTML(e, myId = null) {
  const past = played(e);
  let res = '';
  if (past && myId) {
    const home = e.homeId === myId;
    const my = home ? +e.hs : +e.as, other = home ? +e.as : +e.hs;
    res = my > other ? 'win' : my < other ? 'loss' : 'draw';
  }
  return `<li class="ev ${res}" data-ev='${esc(JSON.stringify(e))}' tabindex="0" role="button" aria-label="${esc(e.home)} contra ${esc(e.away)}">
    <div class="ev-teams"><span class="${e.homeId === myId ? 'me' : ''}">${esc(e.home)}</span>${teamAvatar({ name: e.home, id: e.homeId }, 'xs')}
      ${past ? `<b class="score">${esc(e.hs)} – ${esc(e.as)}</b>` : `<b class="vs">${e.ts ? new Date(e.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : 'vs'}</b>`}
      ${teamAvatar({ name: e.away, id: e.awayId }, 'xs')}<span class="${e.awayId === myId ? 'me' : ''}">${esc(e.away)}</span></div>
    <div class="ev-meta">${esc(e.league || '')}${e.round && e.round !== '0' ? ` · J${esc(e.round)}` : ''} · ${esc(fmtDate(e.ts))}</div>
    ${res ? `<span class="res-tag">${res === 'win' ? 'G' : res === 'loss' ? 'P' : 'E'}</span>` : '<span class="ev-arrow">›</span>'}
  </li>`;
}
function evListHTML(list, myId, max = 6) {
  if (!list.length) return '';
  return `<ul class="evs">${list.map((e, i) => (i < max ? eventHTML(e, myId) : eventHTML(e, myId).replace('class="ev ', 'class="ev more-ev '))).join('')}</ul>
    ${list.length > max ? `<button class="link-btn small" data-more>Ver ${list.length - max} más</button>` : ''}`;
}
// Clics comunes dentro de hojas: partidos y "ver más"
function bindEvents(container) {
  container.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { more.previousElementSibling.classList.add('show-all'); more.remove(); return; }
    const row = e.target.closest('[data-ev]');
    if (row) openMatch(JSON.parse(row.dataset.ev));
  });
}

// ---------- pantalla principal ----------
export function renderFootball(root, param) {
  rootEl = root;
  if (param === 'ligas' || param === 'equipos') tab = param;
  root.innerHTML = `<div class="fb">
  <header class="topbar">
    <div class="grow"><h1 class="page-title big">⚽ Fútbol</h1><p class="sub">Tus equipos y ligas, partido a partido</p></div>
    <a href="#/ajustes" class="icon-btn" aria-label="Ajustes">${ICONS.gear}</a>
  </header>
  <div class="tabs2" role="tablist">
    <button role="tab" class="${tab === 'equipos' ? 'on' : ''}" data-tab="equipos">🛡️ Equipos <em>${S.teams.length}</em></button>
    <button role="tab" class="${tab === 'ligas' ? 'on' : ''}" data-tab="ligas">🏆 Ligas <em>${(S.settings.leagues || []).length}</em></button>
    <i class="tabs2-pill" style="--x:${tab === 'ligas' ? 1 : 0}"></i>
  </div>
  <div id="fb-body"></div>
  <p class="attr">${esc(ATTRIBUTION.thesportsdb.text)} · <a href="${ATTRIBUTION.thesportsdb.url}" target="_blank" rel="noopener">thesportsdb.com</a></p></div>`;
  $('.tabs2', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    $$('.tabs2 [data-tab]', root).forEach((x) => x.classList.toggle('on', x === b));
    $('.tabs2-pill', root).style.setProperty('--x', tab === 'ligas' ? 1 : 0);
    drawTab();
  });
  drawTab();
}

function drawTab() {
  const body = $('#fb-body', rootEl);
  if (!body) return;
  body.classList.remove('tab-in'); void body.offsetWidth; body.classList.add('tab-in');
  const [a, b] = $$('.tabs2 em', rootEl);
  if (a) a.textContent = S.teams.length;
  if (b) b.textContent = (S.settings.leagues || []).length;
  if (tab === 'ligas') drawLeagues(body); else drawTeams(body);
}
const refresh = () => { if (rootEl?.isConnected && $('#fb-body', rootEl)) drawTab(); };

// ======================= EQUIPOS =======================
function drawTeams(body) {
  body.innerHTML = `
    <button class="add-big" id="add-team"><span>＋</span><b>Agregar equipo o selección</b></button>
    <div class="fb-grid" id="team-grid">${S.teams.map((t, i) => `
      <button class="fb-tile" data-team="${t.id}" style="--i:${i}">
        ${teamAvatar(t, 'md')}
        <b>${esc(t.name)}</b>
        <small>${esc(t.league || t.country || '')}</small>
        <span class="fb-next" id="nx-${t.id}"><span class="dots"><i></i><i></i><i></i></span></span>
      </button>`).join('')}</div>
    ${S.teams.length ? '' : `<div class="empty small"><div class="empty-art"><span>⚽</span><span style="--i:1">🥅</span></div><h3>Sigue a tus equipos</h3><p class="muted">Toca "Agregar equipo" para buscar tu club o selección.</p></div>`}`;
  $('#add-team', body).onclick = openTeamSearch;
  $('#team-grid', body).addEventListener('click', (e) => {
    const t = e.target.closest('[data-team]');
    if (t) openTeam(S.teams.find((x) => x.id === t.dataset.team));
  });
  // resumen del próximo partido en cada recuadro
  S.teams.forEach(async (t) => {
    const el = $('#nx-' + t.id, body);
    try {
      const fx = await teamFixtures(t);
      if (!el.isConnected) return;
      const n = fx.upcoming[0], l = fx.results[0];
      el.innerHTML = n ? `📅 vs ${esc(n.homeId === t.id ? n.away : n.home)} · ${esc(shortDate(n.ts))}`
        : l ? `Último: ${esc(l.hs)}–${esc(l.as)} vs ${esc(l.homeId === t.id ? l.away : l.home)}` : 'Sin partidos próximos';
    } catch { if (el.isConnected) el.textContent = 'Toca para ver partidos'; }
  });
}

function openTeamSearch() {
  const s = openSheet(`
    <h3 class="sheet-title">Agregar equipo</h3>
    <div class="searchbar in-sheet"><span class="ic">${ICONS.search}</span>
      <input id="ts-q" type="search" placeholder="Club o selección (p. ej. Nacional, Colombia)" autocomplete="off" enterkeyhint="search"></div>
    <div id="ts-res"><p class="muted small center pad">Escribe al menos 3 letras.</p></div>`, { cls: 'tall' });
  const q = $('#ts-q', s.el), res = $('#ts-res', s.el);
  let token = 0;
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { res.innerHTML = '<p class="muted small center pad">Escribe al menos 3 letras.</p>'; return; }
    const tk = ++token;
    res.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando…</div>';
    try {
      const teams = await searchTeams(v);
      if (tk !== token) return;
      res.innerHTML = teams.length ? `<ul class="team-results">${teams.map((t, i) => `<li style="--i:${i}">${teamAvatar(t, 'sm')}<div class="grow"><b>${esc(t.name)}</b><small class="muted">${esc([t.league, t.country].filter(Boolean).join(' · '))}</small></div>
        ${S.teams.some((x) => x.id === t.id) ? '<span class="tag ok">Siguiendo</span>' : `<button class="btn sm primary" data-addteam='${esc(JSON.stringify(t))}'>Seguir</button>`}</li>`).join('')}</ul>`
        : '<p class="muted small center pad">No encontré equipos con ese nombre. Prueba con el nombre completo o en inglés.</p>';
    } catch { if (tk === token) res.innerHTML = '<p class="muted small center pad">No se pudo buscar (¿sin conexión?).</p>'; }
  };
  q.addEventListener('input', debounce(search, 450));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-addteam]');
    if (!b) return;
    const t = JSON.parse(b.dataset.addteam);
    t.order = S.teams.length;
    S.teams.push(t);
    await db.put('teams', t);
    vibrate(12);
    toast(`Ahora sigues a ${t.name}`, { icon: '⚽' });
    b.outerHTML = '<span class="tag ok">Siguiendo</span>';
    refresh();
  });
  setTimeout(() => q.focus(), 350);
}

function openTeam(t) {
  const s = openSheet(`
    <div class="fb-hero">
      <div class="fb-hero-av">${teamAvatar(t, 'xl')}</div>
      <h3>${esc(t.name)}</h3>
      <p class="muted small">${esc([t.league, t.country].filter(Boolean).join(' · '))}</p>
      <div class="fb-actions">
        <button class="btn sm" data-act="crest">🛡️ Escudo</button>
        <button class="btn sm" data-act="refresh">${ICONS.refresh} Actualizar</button>
        <button class="btn sm danger ghost" data-act="del">${ICONS.trash} Quitar</button>
      </div>
    </div>
    <div id="tm-body"><div class="loading-row"><span class="spinner"></span> Cargando partidos…</div></div>`, { cls: 'tall' });
  const body = $('#tm-body', s.el);
  bindEvents(body);
  const load = async (force = false) => {
    try {
      const fx = await teamFixtures(t, { force });
      if (!s.open) return;
      body.innerHTML = `<div class="mh-view">
        <section class="mh-sec"><h4>📅 Próximos partidos</h4>${evListHTML(fx.upcoming, t.id) || '<p class="muted small">Sin partidos programados en los datos disponibles.</p>'}</section>
        <section class="mh-sec"><h4>🏁 Últimos resultados</h4>${evListHTML(fx.results, t.id) || '<p class="muted small">Sin resultados recientes.</p>'}</section>
        <p class="muted xsmall center">${fx.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(fx.cachedAt)} · toca un partido para ver más</p></div>`;
    } catch { if (s.open) body.innerHTML = '<p class="muted small center pad">No se pudieron cargar los partidos. Revisa tu conexión.</p>'; }
  };
  load();
  $('.fb-actions', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'refresh') { b.classList.add('spin'); await load(true); b.classList.remove('spin'); }
    if (b.dataset.act === 'crest') {
      editCrest(t.name, t.logo, async (logo) => {
        t.logo = logo;
        await db.put('teams', t);
        $('.fb-hero-av', s.el).innerHTML = teamAvatar(t, 'xl');
        refresh();
      });
    }
    if (b.dataset.act === 'del') {
      if (!(await confirmDialog('¿Dejar de seguir este equipo?', `${t.name} se quitará de tu lista. Puedes volver a agregarlo cuando quieras.`, { ok: 'Quitar equipo', danger: true }))) return;
      S.teams = S.teams.filter((x) => x.id !== t.id);
      await db.del('teams', t.id);
      toast(`${t.name} quitado`, { icon: '🗑️' });
      s.close();
      refresh();
    }
  });
}

// ======================= LIGAS =======================
function drawLeagues(body) {
  const mine = S.settings.leagues || [];
  body.innerHTML = `
    <button class="add-big" id="add-league"><span>＋</span><b>Agregar liga o torneo</b></button>
    <div class="fb-grid" id="lg-grid">${mine.map((lg, i) => { const st = leagueStyle(lg); return `
      <button class="fb-tile lg-tile" data-lg="${lg.id}" style="--i:${i};--c1:${st.c1};--c2:${st.c2}">
        ${leagueBadge(lg, 'md')}
        <b>${esc(lg.name)}</b>
        <small>${esc(lg.country || '')}</small>
        <span class="fb-next" id="lgn-${lg.id}"><span class="dots"><i></i><i></i><i></i></span></span>
      </button>`; }).join('')}</div>
    ${mine.length ? '' : `<div class="empty small"><div class="empty-art"><span>🏆</span></div><h3>Sigue tus ligas</h3><p class="muted">Toca "Agregar liga o torneo" para elegir la Champions, la Premier, la liga colombiana y más.</p></div>`}`;
  $('#add-league', body).onclick = openLeagueSearch;
  $('#lg-grid', body).addEventListener('click', (e) => {
    const t = e.target.closest('[data-lg]');
    if (t) openLeague(mine.find((l) => l.id === t.dataset.lg));
  });
  mine.forEach(async (lg) => {
    const el = $('#lgn-' + lg.id, body);
    try {
      const o = await leagueOverview(lg);
      if (!el.isConnected) return;
      const n = o.upcoming[0];
      el.innerHTML = n ? `📅 ${esc(n.home)} vs ${esc(n.away)}` : o.round ? `Jornada ${esc(o.round)}` : 'Toca para ver partidos';
    } catch { if (el.isConnected) el.textContent = 'Toca para ver partidos'; }
  });
}

async function followLeague(lg) {
  const list = [...(S.settings.leagues || [])];
  if (list.some((l) => l.id === lg.id)) return false;
  list.push(lg);
  await setPref('leagues', list);
  vibrate(12);
  toast(`Sigues ${lg.name}`, { icon: '🏆' });
  refresh();
  return true;
}

function openLeagueSearch() {
  const mine = () => S.settings.leagues || [];
  const s = openSheet(`
    <h3 class="sheet-title">Agregar liga o torneo</h3>
    <div class="searchbar in-sheet"><span class="ic">${ICONS.search}</span>
      <input id="ls-q" type="search" placeholder="Buscar por país (p. ej. Colombia, México, España)" autocomplete="off" enterkeyhint="search"></div>
    <div id="ls-res"></div>
    <h4 class="ls-title">Populares</h4>
    <div class="lg-popgrid">${POPULAR_LEAGUES.map((p, i) => `<button class="lg-chip ${mine().some((l) => l.id === p.id) ? 'on' : ''}" data-pop="${p.id}" style="--c1:${p.c1};--c2:${p.c2};--i:${i}"><span class="lg-flag">${p.flag}</span><b>${esc(p.name)}</b><small>${esc(p.country)}</small>${mine().some((l) => l.id === p.id) ? '<i class="lg-check">✓</i>' : ''}</button>`).join('')}</div>`, { cls: 'tall' });
  $('.lg-popgrid', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pop]');
    if (!b || b.classList.contains('on')) return;
    const p = POPULAR_LEAGUES.find((x) => x.id === b.dataset.pop);
    if (await followLeague({ id: p.id, name: p.name, country: p.country, season: '' })) {
      b.classList.add('on');
      b.insertAdjacentHTML('beforeend', '<i class="lg-check">✓</i>');
    }
  });
  const q = $('#ls-q', s.el), res = $('#ls-res', s.el);
  let token = 0;
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { res.innerHTML = ''; return; }
    const tk = ++token;
    res.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando torneos…</div>';
    try {
      const found = await searchLeagues(v);
      if (tk !== token) return;
      res.innerHTML = found.length ? `<ul class="team-results">${found.map((l, i) => `<li style="--i:${i}">${leagueBadge(l, 'sm')}<div class="grow"><b>${esc(l.name)}</b><small class="muted">${esc(l.country)}${l.season ? ` · ${esc(l.season)}` : ''}</small></div>
        ${mine().some((x) => x.id === l.id) ? '<span class="tag ok">Siguiendo</span>' : `<button class="btn sm primary" data-addlg='${esc(JSON.stringify(l))}'>Seguir</button>`}</li>`).join('')}</ul>`
        : '<p class="muted small center pad">No encontré torneos para ese país. Prueba con el nombre en inglés (p. ej. Spain).</p>';
    } catch { if (tk === token) res.innerHTML = '<p class="muted small center pad">No se pudo buscar (¿sin conexión?).</p>'; }
  };
  q.addEventListener('input', debounce(search, 450));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-addlg]');
    if (b && await followLeague(JSON.parse(b.dataset.addlg))) b.outerHTML = '<span class="tag ok">Siguiendo</span>';
  });
}

function openLeague(lg) {
  const st = leagueStyle(lg);
  const s = openSheet(`
    <div class="fb-hero" style="--c1:${st.c1};--c2:${st.c2}">
      <div class="fb-hero-av">${leagueBadge(lg, 'xl')}</div>
      <h3>${esc(lg.name)}</h3>
      <p class="muted small" id="lg-sub">${esc(lg.country || '')}</p>
      <div class="fb-actions">
        <button class="btn sm" data-act="crest">🛡️ Escudo</button>
        <button class="btn sm" data-act="refresh">${ICONS.refresh} Actualizar</button>
        <button class="btn sm danger ghost" data-act="del">${ICONS.trash} Quitar</button>
      </div>
    </div>
    <div class="seg mh-tabs" id="lg-tabs"><button class="on" data-v="partidos">Partidos</button><button data-v="tabla">Tabla</button><button data-v="torneos">Torneos</button></div>
    <div id="lg-body"><div class="loading-row"><span class="spinner"></span> Cargando…</div></div>`, { cls: 'tall' });
  const body = $('#lg-body', s.el);
  bindEvents(body);
  let view = 'partidos';
  const load = async (force = false) => {
    if (view === 'torneos') {
      body.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando torneos del mismo país…</div>';
      const pop = POPULAR_LEAGUES.find((p) => p.id === lg.id);
      const country = pop?.country || lg.country || '';
      try {
        const intl = /europa|sudam|fifa|world/i.test(country);
        const list = intl ? POPULAR_LEAGUES.filter((p) => p.country === country).map((p) => ({ id: p.id, name: p.name, country: p.country })) : await searchLeagues(country);
        const others = list.filter((l) => l.id !== lg.id);
        if (!s.open || view !== 'torneos') return;
        body.innerHTML = `<div class="mh-view">${others.length ? `<p class="muted small">Otros torneos de ${esc(country)}:</p><div class="chips wrap">${others.map((l) => {
          const on = (S.settings.leagues || []).some((x) => x.id === l.id);
          return `<button class="chip ${on ? 'on' : ''}" data-addlg='${esc(JSON.stringify(l))}'>${on ? '✓' : '＋'} ${esc(l.name)}</button>`;
        }).join('')}</div>` : '<p class="muted small center pad">No encontré otros torneos relacionados.</p>'}</div>`;
      } catch { if (s.open) body.innerHTML = '<p class="muted small center pad">No se pudieron cargar los torneos.</p>'; }
      return;
    }
    try {
      const o = await leagueOverview(lg, { force });
      if (!s.open || view === 'torneos') return;
      $('#lg-sub', s.el).textContent = [lg.country, o.season, o.round ? `Jornada ${o.round}` : ''].filter(Boolean).join(' · ');
      if (view === 'tabla') {
        body.innerHTML = `<div class="mh-view">${o.table.length ? `<table class="lg-table"><thead><tr><th>#</th><th class="tl">Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead><tbody>
          ${o.table.map((r, i) => `<tr style="--i:${i}"><td><span class="rank r${r.rank}">${r.rank}</span></td><td class="tl"><div class="tcell">${teamAvatar({ name: r.team, id: r.teamId }, 'xs')}<span>${esc(r.team)}</span></div></td><td>${r.played}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}
          </tbody></table>${o.table.length <= 5 ? '<p class="note">Los datos gratuitos solo incluyen los primeros puestos de la tabla.</p>' : ''}` : '<p class="muted small center pad">Tabla no disponible para este torneo.</p>'}</div>`;
      } else {
        body.innerHTML = `<div class="mh-view">
          ${o.upcoming.length ? `<section class="mh-sec"><h4>📅 Próximos partidos</h4>${evListHTML(o.upcoming, null)}</section>` : ''}
          ${o.results.length ? `<section class="mh-sec"><h4>🏁 Últimos resultados</h4>${evListHTML(o.results, null)}</section>` : ''}
          ${!o.upcoming.length && !o.results.length ? '<p class="muted small center pad">Sin partidos en los datos disponibles.</p>' : ''}
          <p class="muted xsmall center">${o.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(o.cachedAt)}</p></div>`;
      }
    } catch { if (s.open) body.innerHTML = '<p class="muted small center pad">No se pudo cargar. Revisa tu conexión.</p>'; }
  };
  load();
  $('#lg-tabs', s.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    view = b.dataset.v;
    $$('#lg-tabs button', s.el).forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-addlg]');
    if (b && !b.classList.contains('on') && await followLeague(JSON.parse(b.dataset.addlg))) { b.classList.add('on'); b.textContent = '✓ ' + b.textContent.replace(/^＋\s*/, ''); }
  });
  $('.fb-actions', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'refresh') { b.classList.add('spin'); await load(true); b.classList.remove('spin'); }
    if (b.dataset.act === 'crest') {
      editCrest(lg.name, lg.logo, async (logo) => {
        lg.logo = logo;
        await setPref('leagues', (S.settings.leagues || []).map((l) => (l.id === lg.id ? lg : l)));
        $('.fb-hero-av', s.el).innerHTML = leagueBadge(lg, 'xl');
        refresh();
      });
    }
    if (b.dataset.act === 'del') {
      if (!(await confirmDialog('¿Dejar de seguir esta liga?', `${lg.name} se quitará de tus ligas.`, { ok: 'Quitar liga', danger: true }))) return;
      await setPref('leagues', (S.settings.leagues || []).filter((l) => l.id !== lg.id));
      toast(`${lg.name} quitada`, { icon: '🗑️' });
      s.close();
      refresh();
    }
  });
}

// ---------- escudo propio (link o galería) ----------
function editCrest(name, current, onSave) {
  const s = openSheet(`
    <h3 class="sheet-title">Escudo de ${esc(name)}</h3>
    <p class="muted small">Pega el link de una imagen o elige una de tu galería. Se guarda solo en tu teléfono.</p>
    <div class="crest-edit">
      <div class="crest-prev" id="cr-prev">${current ? `<img src="${esc(current)}" alt="">` : '<span>🛡️</span>'}</div>
      <div class="grow col-btns">
        <input id="cr-url" type="url" placeholder="https://…" value="${current && !current.startsWith('data:') ? esc(current) : ''}">
        <div class="row-btns sm">
          <label class="btn sm">${ICONS.upload} Galería<input type="file" accept="image/*" id="cr-file" hidden></label>
          <button class="btn sm ghost" id="cr-del">Quitar</button>
        </div>
      </div>
    </div>
    <div class="row-btns"><button class="btn ghost" id="cr-cancel">Cancelar</button><button class="btn primary" id="cr-save">Guardar escudo</button></div>`);
  let logo = current || '';
  const prev = () => { $('#cr-prev', s.el).innerHTML = logo ? `<img src="${esc(logo)}" alt="" onerror="this.replaceWith(document.createTextNode('⚠️'))">` : '<span>🛡️</span>'; };
  $('#cr-url', s.el).addEventListener('input', debounce((e) => { logo = e.target.value.trim(); prev(); }, 300));
  $('#cr-file', s.el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { logo = await imageToDataURL(f, 200, 'image/png'); $('#cr-url', s.el).value = ''; prev(); } catch { toast('No se pudo leer la imagen.'); }
  });
  $('#cr-del', s.el).onclick = () => { logo = ''; $('#cr-url', s.el).value = ''; prev(); };
  $('#cr-cancel', s.el).onclick = () => s.close();
  $('#cr-save', s.el).onclick = async () => {
    await onSave(logo);
    vibrate(12);
    toast(logo ? 'Escudo guardado' : 'Escudo quitado', { icon: '🛡️' });
    s.close();
  };
}

// ======================= PARTIDO =======================
// Solo el partido y su resultado (los datos gratuitos no traen alineaciones ni goleadores completos)
export async function openMatch(e) {
  const past = played(e);
  const rawDate = e.ts ? new Date(e.ts).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Fecha por confirmar';
  const dateTxt = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const s = openSheet(`
    <div class="match-hero solo">
      <div class="mh-league">${esc(e.league || '')}${e.round && e.round !== '0' ? ` · Jornada ${esc(e.round)}` : ''}</div>
      <div class="mh-row">
        <div class="mh-team">${teamAvatar({ name: e.home, id: e.homeId }, 'lg')}<b>${esc(e.home)}</b><small>Local</small></div>
        <div class="mh-score">${past ? `<span>${esc(e.hs)}</span><i>:</i><span>${esc(e.as)}</span>` : '<span class="vs-big">VS</span>'}</div>
        <div class="mh-team">${teamAvatar({ name: e.away, id: e.awayId }, 'lg')}<b>${esc(e.away)}</b><small>Visitante</small></div>
      </div>
      <div class="mh-pill ${past ? 'done' : 'soon'}">${past ? 'Finalizado' : 'Próximo partido'}</div>
      <div class="mh-info">
        <div><span>📅</span>${esc(dateTxt)}</div>
        <div id="mh-venue" hidden><span>🏟️</span><b></b></div>
      </div>
      <div id="mh-video"></div>
    </div>`);
  const ytSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.home} vs ${e.away} resumen ${e.ts ? e.ts.slice(0, 10) : ''}`)}`;
  if (past) $('#mh-video', s.el).innerHTML = `<button class="btn primary block video-btn" data-open="${esc(ytSearch)}">${ICONS.play} Ver resumen en YouTube</button>`;
  s.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-open]'); if (b) openUrl(b.dataset.open); });
  try {
    const d = await matchInfo(e.id);
    if (!s.open) return;
    if (d.venue) { const v = $('#mh-venue', s.el); v.hidden = false; v.querySelector('b').textContent = d.venue + (d.city ? `, ${d.city}` : ''); }
    if (past && d.video) $('#mh-video', s.el).innerHTML = `<button class="btn primary block video-btn" data-open="${esc(d.video)}">${ICONS.play} Ver resumen en YouTube</button>`;
  } catch { /* se queda con lo básico */ }
}
