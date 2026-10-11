// Fútbol: mis equipos, ligas que sigo y detalle de cada partido.
import { $, $$, esc, toast, ICONS, openSheet, confirmDialog, debounce, relTime, hueOf, initials, vibrate } from './ui.js';
import { S, setPref, openUrl } from './store.js';
import { searchTeams, teamFixtures, ATTRIBUTION, POPULAR_LEAGUES, searchLeagues, leagueOverview, matchDetail } from './api.js';
import { db } from './db.js';

let tab = 'equipos';

// ---------- piezas visuales ----------
export function teamAvatar(t, size = '') {
  const name = t.name || t.team || '?';
  const c1 = /^#[0-9a-f]{3,8}$/i.test(t.color1 || '') ? t.color1 : `hsl(${hueOf(name)} 70% 45%)`;
  const c2 = /^#[0-9a-f]{3,8}$/i.test(t.color2 || '') ? t.color2 : `hsl(${(hueOf(name) + 40) % 360} 70% 30%)`;
  const label = (t.short && t.short.length <= 4 ? t.short : initials(name)).toUpperCase();
  return `<span class="team-av ${size}" style="--c1:${c1};--c2:${c2}">${esc(label)}</span>`;
}
const fmtDate = (ts) => {
  if (!ts) return 'Fecha por confirmar';
  return new Date(ts).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const played = (e) => e.hs != null && e.hs !== '';

// Fila de partido (se toca para ver el detalle)
function eventHTML(e, myId = null) {
  const past = played(e);
  let res = '';
  if (past && myId) {
    const home = e.homeId === myId;
    const my = home ? +e.hs : +e.as, other = home ? +e.as : +e.hs;
    res = my > other ? 'win' : my < other ? 'loss' : 'draw';
  }
  return `<li class="ev ${res}" data-ev='${esc(JSON.stringify(e))}' tabindex="0" role="button" aria-label="${esc(e.home)} contra ${esc(e.away)}">
    <div class="ev-teams"><span class="${e.homeId === myId ? 'me' : ''}">${esc(e.home)}</span>
      ${past ? `<b class="score">${esc(e.hs)} – ${esc(e.as)}</b>` : `<b class="vs">${e.ts ? new Date(e.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : 'vs'}</b>`}
      <span class="${e.awayId === myId ? 'me' : ''}">${esc(e.away)}</span></div>
    <div class="ev-meta">${esc(e.league || '')}${e.round && e.round !== '0' ? ` · J${esc(e.round)}` : ''} · ${esc(fmtDate(e.ts))}</div>
    ${res ? `<span class="res-tag">${res === 'win' ? 'G' : res === 'loss' ? 'P' : 'E'}</span>` : '<span class="ev-arrow">›</span>'}
  </li>`;
}

function evListHTML(list, myId, max = 6) {
  if (!list.length) return '';
  const extra = list.length > max;
  return `<ul class="evs">${list.map((e, i) => (i < max ? eventHTML(e, myId) : eventHTML(e, myId).replace('class="ev ', 'class="ev more-ev '))).join('')}</ul>
    ${extra ? `<button class="link-btn small" data-more>Ver ${list.length - max} más</button>` : ''}`;
}

// ---------- pantalla ----------
export function renderFootball(root, param) {
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
  <p class="attr">${esc(ATTRIBUTION.thesportsdb.text)} · <a href="${ATTRIBUTION.thesportsdb.url}" target="_blank" rel="noopener">thesportsdb.com</a>. Sin escudos oficiales: se usan iniciales y colores.</p></div>`;
  const wrap = $('.fb', root);
  $('.tabs2', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    $$('.tabs2 [data-tab]', root).forEach((x) => x.classList.toggle('on', x === b));
    $('.tabs2-pill', root).style.setProperty('--x', tab === 'ligas' ? 1 : 0);
    drawTab(root);
  });
  // tocar un partido abre su detalle
  wrap.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { more.previousElementSibling.classList.add('show-all'); more.remove(); return; }
    const row = e.target.closest('[data-ev]');
    if (row) openMatch(JSON.parse(row.dataset.ev));
  });
  wrap.addEventListener('keydown', (e) => { const row = e.target.closest?.('[data-ev]'); if (row && e.key === 'Enter') openMatch(JSON.parse(row.dataset.ev)); });
  drawTab(root);
}

function drawTab(root) {
  const body = $('#fb-body', root);
  body.classList.remove('tab-in'); void body.offsetWidth; body.classList.add('tab-in');
  if (tab === 'ligas') drawLeagues(body, root); else drawTeams(body, root);
}

// ======================= EQUIPOS =======================
function drawTeams(body, root) {
  body.innerHTML = `
  <div class="searchbar">
    <span class="ic">${ICONS.search}</span>
    <input id="team-q" type="search" placeholder="Buscar equipo o selección (p. ej. Nacional, Colombia)" autocomplete="off" enterkeyhint="search">
  </div>
  <div id="team-results"></div>
  <div id="teams"></div>`;
  const q = $('#team-q', body), results = $('#team-results', body);
  let token = 0;
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { results.innerHTML = ''; return; }
    const tk = ++token;
    results.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando…</div>';
    try {
      const teams = await searchTeams(v);
      if (tk !== token) return;
      results.innerHTML = teams.length ? `<ul class="team-results">${teams.map((t, i) => `<li style="--i:${i}">${teamAvatar(t, 'sm')}<div class="grow"><b>${esc(t.name)}</b><small class="muted">${esc([t.league, t.country].filter(Boolean).join(' · '))}</small></div>
        ${S.teams.some((x) => x.id === t.id) ? '<span class="tag ok">Siguiendo</span>' : `<button class="btn sm primary" data-addteam='${esc(JSON.stringify(t))}'>Seguir</button>`}</li>`).join('')}</ul>`
        : '<div class="muted small pad">No encontré equipos con ese nombre. Prueba con el nombre completo o en inglés.</div>';
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
    toast(`Ahora sigues a ${t.name}`, { icon: '⚽' });
    q.value = ''; results.innerHTML = '';
    list();
    updateCounts(root);
  });

  const list = () => {
    const box = $('#teams', body);
    if (!S.teams.length) {
      box.innerHTML = `<div class="empty small"><div class="empty-art"><span>⚽</span><span style="--i:1">🥅</span></div><h3>Sigue a tus equipos</h3><p class="muted">Busca arriba un club o una selección y toca "Seguir".</p></div>`;
      return;
    }
    box.innerHTML = S.teams.map((t, i) => `
      <section class="team-card" data-team="${t.id}" style="--i:${i}">
        <div class="team-head">${teamAvatar(t)}<div class="grow"><h3>${esc(t.name)}</h3><small class="muted">${esc([t.league, t.country].filter(Boolean).join(' · '))}</small></div>
          <button class="icon-btn sm" data-refresh="${t.id}" aria-label="Actualizar">${ICONS.refresh}</button>
          <button class="icon-btn sm" data-delteam="${t.id}" aria-label="Dejar de seguir">${ICONS.trash}</button></div>
        <div class="team-body" id="fx-${t.id}"><div class="loading-row"><span class="spinner"></span> Cargando partidos…</div></div>
      </section>`).join('');
    S.teams.forEach((t) => loadFixtures(t));
  };
  async function loadFixtures(t, force = false) {
    const box = $('#fx-' + t.id, body);
    if (!box) return;
    try {
      const fx = await teamFixtures(t, { force });
      box.innerHTML = `
        <h4>Próximos</h4>
        ${evListHTML(fx.upcoming, t.id) || '<p class="muted small">Sin partidos programados en los datos disponibles.</p>'}
        <h4>Últimos resultados</h4>
        ${evListHTML(fx.results, t.id) || '<p class="muted small">Sin resultados recientes.</p>'}
        <p class="muted xsmall">${fx.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(fx.cachedAt)} · toca un partido para ver detalles</p>`;
    } catch {
      box.innerHTML = '<p class="muted small">No se pudieron cargar los partidos. Revisa tu conexión.</p>';
    }
  }
  $('#teams', body).addEventListener('click', async (e) => {
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
      if (!(await confirmDialog('¿Dejar de seguir este equipo?', `${t.name} se quitará de tu lista. Puedes volver a agregarlo cuando quieras.`, { ok: 'Quitar equipo', danger: true }))) return;
      S.teams = S.teams.filter((x) => x.id !== t.id);
      await db.del('teams', t.id);
      toast(`${t.name} quitado`, { icon: '🗑️' });
      list();
      updateCounts(root);
    }
  });
  list();
}

// ======================= LIGAS =======================
function leagueStyle(lg) {
  const pop = POPULAR_LEAGUES.find((p) => p.id === lg.id);
  const c1 = pop?.c1 || `hsl(${hueOf(lg.name)} 60% 30%)`, c2 = pop?.c2 || `hsl(${(hueOf(lg.name) + 60) % 360} 70% 55%)`;
  return { c1, c2, flag: pop?.flag || '🏆', short: pop?.name || lg.name };
}

function drawLeagues(body, root) {
  const mine = S.settings.leagues || [];
  body.innerHTML = `
  <section class="lg-add">
    <div class="sec-head"><h3>Agregar ligas y torneos</h3></div>
    <div class="lg-pop">${POPULAR_LEAGUES.map((p, i) => {
      const on = mine.some((l) => l.id === p.id);
      return `<button class="lg-chip ${on ? 'on' : ''}" data-pop="${p.id}" style="--c1:${p.c1};--c2:${p.c2};--i:${i}"><span class="lg-flag">${p.flag}</span><b>${esc(p.name)}</b><small>${esc(p.country)}</small>${on ? '<i class="lg-check">✓</i>' : ''}</button>`;
    }).join('')}</div>
    <div class="searchbar lg-search">
      <span class="ic">${ICONS.search}</span>
      <input id="lg-q" type="search" placeholder="Buscar torneos por país (p. ej. Colombia, México, España)" autocomplete="off" enterkeyhint="search">
    </div>
    <div id="lg-results"></div>
  </section>
  <div id="leagues"></div>`;

  const follow = async (lg) => {
    const list = [...(S.settings.leagues || [])];
    if (list.some((l) => l.id === lg.id)) return;
    list.push(lg);
    await setPref('leagues', list);
    vibrate(12);
    toast(`Sigues ${lg.name}`, { icon: '🏆' });
    drawLeagues(body, root);
    updateCounts(root);
  };
  $('.lg-pop', body).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pop]');
    if (!b) return;
    const p = POPULAR_LEAGUES.find((x) => x.id === b.dataset.pop);
    const existing = (S.settings.leagues || []).find((l) => l.id === p.id);
    if (existing) { await unfollow(existing); return; }
    follow({ id: p.id, name: p.name, country: p.country, season: '' });
  });
  const unfollow = async (lg) => {
    if (!(await confirmDialog('¿Dejar de seguir esta liga?', `${lg.name} se quitará de tus ligas.`, { ok: 'Quitar liga', danger: true }))) return;
    await setPref('leagues', (S.settings.leagues || []).filter((l) => l.id !== lg.id));
    toast(`${lg.name} quitada`, { icon: '🗑️' });
    drawLeagues(body, root);
    updateCounts(root);
  };

  const q = $('#lg-q', body), results = $('#lg-results', body);
  let token = 0;
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { results.innerHTML = ''; return; }
    const tk = ++token;
    results.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando torneos…</div>';
    try {
      const found = await searchLeagues(v);
      if (tk !== token) return;
      results.innerHTML = found.length ? `<ul class="team-results">${found.map((l, i) => { const st = leagueStyle(l); return `<li style="--i:${i}"><span class="lg-badge" style="--c1:${st.c1};--c2:${st.c2}">${st.flag}</span><div class="grow"><b>${esc(l.name)}</b><small class="muted">${esc(l.country)}${l.season ? ` · ${esc(l.season)}` : ''}</small></div>
        ${(S.settings.leagues || []).some((x) => x.id === l.id) ? '<span class="tag ok">Siguiendo</span>' : `<button class="btn sm primary" data-addlg='${esc(JSON.stringify(l))}'>Seguir</button>`}</li>`; }).join('')}</ul>`
        : '<div class="muted small pad">No encontré torneos para ese país. Prueba con el nombre en inglés (p. ej. Spain).</div>';
    } catch {
      if (tk === token) results.innerHTML = '<div class="muted small pad">No se pudo buscar (¿sin conexión?).</div>';
    }
  };
  q.addEventListener('input', debounce(search, 500));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-addlg]');
    if (b) { q.value = ''; results.innerHTML = ''; follow(JSON.parse(b.dataset.addlg)); }
  });

  const box = $('#leagues', body);
  if (!mine.length) {
    box.innerHTML = `<div class="empty small"><div class="empty-art"><span>🏆</span></div><h3>Sigue tus ligas</h3><p class="muted">Toca la Champions, la Premier o busca los torneos de tu país.</p></div>`;
    return;
  }
  box.innerHTML = mine.map((lg, i) => { const st = leagueStyle(lg); return `
    <section class="lg-card" data-lg="${lg.id}" style="--i:${i};--c1:${st.c1};--c2:${st.c2}">
      <div class="lg-head"><span class="lg-badge">${st.flag}</span><div class="grow"><h3>${esc(lg.name)}</h3><small class="muted" id="lgsub-${lg.id}">${esc(lg.country || '')}</small></div>
        <button class="icon-btn sm" data-lgref="${lg.id}" aria-label="Actualizar">${ICONS.refresh}</button>
        <button class="icon-btn sm" data-lgdel="${lg.id}" aria-label="Dejar de seguir">${ICONS.trash}</button></div>
      <div class="seg mini3 lg-tabs"><button class="on" data-lgtab="partidos">Partidos</button><button data-lgtab="tabla">Tabla</button><button data-lgtab="torneos">Torneos</button></div>
      <div class="lg-body" id="lgb-${lg.id}"><div class="loading-row"><span class="spinner"></span> Cargando…</div></div>
    </section>`; }).join('');
  mine.forEach((lg) => loadLeague(lg, 'partidos'));

  async function loadLeague(lg, view, force = false) {
    const b = $('#lgb-' + lg.id, body);
    if (!b) return;
    if (view === 'torneos') {
      b.innerHTML = '<div class="loading-row"><span class="spinner"></span> Buscando torneos del mismo país…</div>';
      try {
        const country = lg.country && !/europa|sudam|fifa|world/i.test(lg.country) ? lg.country : '';
        const pop = POPULAR_LEAGUES.find((p) => p.id === lg.id);
        const list = country ? await searchLeagues(pop ? pop.country : country) : POPULAR_LEAGUES.filter((p) => p.country === (pop?.country || lg.country)).map((p) => ({ id: p.id, name: p.name, country: p.country }));
        const others = list.filter((l) => l.id !== lg.id);
        b.innerHTML = others.length ? `<p class="muted small">Otros torneos de ${esc(pop?.country || lg.country)}:</p><div class="chips wrap">${others.map((l) => {
          const on = (S.settings.leagues || []).some((x) => x.id === l.id);
          return `<button class="chip ${on ? 'on' : ''}" data-addlg='${esc(JSON.stringify(l))}'>${on ? '✓' : '+'} ${esc(l.name)}</button>`;
        }).join('')}</div>` : '<p class="muted small">No encontré otros torneos relacionados.</p>';
      } catch { b.innerHTML = '<p class="muted small">No se pudieron cargar los torneos.</p>'; }
      return;
    }
    if (!b.innerHTML.includes('evs') && !b.innerHTML.includes('lg-table')) b.innerHTML = '<div class="loading-row"><span class="spinner"></span> Cargando…</div>';
    try {
      const o = await leagueOverview(lg, { force });
      const sub = $('#lgsub-' + lg.id, body);
      if (sub) sub.textContent = [lg.country, o.season, o.round ? `Jornada ${o.round}` : ''].filter(Boolean).join(' · ');
      if (view === 'tabla') {
        b.innerHTML = o.table.length ? `<table class="lg-table"><thead><tr><th>#</th><th class="tl">Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead><tbody>
          ${o.table.map((r, i) => `<tr style="--i:${i}"><td><span class="rank r${r.rank}">${r.rank}</span></td><td class="tl"><div class="tcell">${teamAvatar({ name: r.team }, 'xs')}<span>${esc(r.team)}</span></div>${r.form ? `<div class="form">${[...r.form.slice(-5)].map((f) => `<i class="f${f}">${f === 'W' ? 'G' : f === 'L' ? 'P' : 'E'}</i>`).join('')}</div>` : ''}</td><td>${r.played}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}
          </tbody></table>${o.table.length <= 5 ? '<p class="muted xsmall">La API gratuita solo entrega los primeros puestos de la tabla.</p>' : ''}`
          : '<p class="muted small">Tabla no disponible para este torneo.</p>';
      } else {
        b.innerHTML = `
          ${o.upcoming.length ? `<h4>Próximos partidos</h4>${evListHTML(o.upcoming, null)}` : ''}
          ${o.results.length ? `<h4>Últimos resultados</h4>${evListHTML(o.results, null)}` : ''}
          ${!o.upcoming.length && !o.results.length ? '<p class="muted small">Sin partidos en los datos disponibles.</p>' : ''}
          <p class="muted xsmall">${o.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(o.cachedAt)} · toca un partido para ver detalles</p>`;
      }
    } catch {
      b.innerHTML = '<p class="muted small">No se pudo cargar la liga. Revisa tu conexión.</p>';
    }
  }
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-lgtab]');
    if (t) {
      const card = t.closest('[data-lg]');
      $$('[data-lgtab]', card).forEach((x) => x.classList.toggle('on', x === t));
      const lg = mine.find((l) => l.id === card.dataset.lg);
      loadLeague(lg, t.dataset.lgtab);
      return;
    }
    const r = e.target.closest('[data-lgref]');
    if (r) {
      const card = r.closest('[data-lg]');
      const lg = mine.find((l) => l.id === r.dataset.lgref);
      r.classList.add('spin');
      await loadLeague(lg, $('[data-lgtab].on', card).dataset.lgtab, true);
      r.classList.remove('spin');
      return;
    }
    const d = e.target.closest('[data-lgdel]');
    if (d) { await unfollow(mine.find((l) => l.id === d.dataset.lgdel)); return; }
    const add = e.target.closest('[data-addlg]');
    if (add) {
      const lg = JSON.parse(add.dataset.addlg);
      if ((S.settings.leagues || []).some((x) => x.id === lg.id)) return;
      follow(lg);
    }
  });
}

function updateCounts(root) {
  const [a, b] = $$('.tabs2 em', root);
  if (a) a.textContent = S.teams.length;
  if (b) b.textContent = (S.settings.leagues || []).length;
}

// ======================= DETALLE DE PARTIDO =======================
export async function openMatch(e) {
  const past = played(e);
  const s = openSheet(`
    <div class="match-hero">
      <div class="mh-league">${esc(e.league || '')}${e.round && e.round !== '0' ? ` · Jornada ${esc(e.round)}` : ''}</div>
      <div class="mh-row">
        <div class="mh-team">${teamAvatar({ name: e.home }, 'lg')}<b>${esc(e.home)}</b></div>
        <div class="mh-score">${past ? `<span>${esc(e.hs)}</span><i>–</i><span>${esc(e.as)}</span>` : `<small>${esc(fmtDate(e.ts))}</small>`}</div>
        <div class="mh-team">${teamAvatar({ name: e.away }, 'lg')}<b>${esc(e.away)}</b></div>
      </div>
      <div class="mh-meta" id="mh-meta">${past ? 'Finalizado' : 'Próximo partido'}</div>
    </div>
    <div id="mh-body"><div class="loading-row"><span class="spinner"></span> Cargando detalles del partido…</div></div>`, { cls: 'tall' });
  const body = $('#mh-body', s.el);
  try {
    const d = await matchDetail(e.id);
    if (!s.open) return;
    const meta = [d.venue && `🏟️ ${d.venue}${d.city ? `, ${d.city}` : ''}`, d.referee && `🧑‍⚖️ ${d.referee}`, d.spectators && `👥 ${(+d.spectators).toLocaleString('es')}`].filter(Boolean);
    if (meta.length) $('#mh-meta', s.el).innerHTML = meta.map(esc).join(' · ');
    const goals = d.timeline.filter((t) => t.type === 'goal');
    const subs = d.timeline.filter((t) => t.type.startsWith('subst'));
    const cards = d.timeline.filter((t) => t.type === 'card');
    const side = (list, home) => list.filter((t) => t.home === home);
    const goalRow = (t) => `<li><span class="min">${t.min}'</span><span>⚽ <b>${esc(t.player)}</b>${/own/i.test(t.detail) ? ' <em>(en contra)</em>' : /pen/i.test(t.detail) ? ' <em>(penal)</em>' : ''}${t.assist ? `<small>asistencia: ${esc(t.assist)}</small>` : ''}</span></li>`;
    const sections = [];
    if (d.video) sections.push(`<button class="btn primary block video-btn" id="mh-video">${ICONS.play} Ver resumen y goles en YouTube</button>`);
    if (goals.length) sections.push(`<section class="mh-sec"><h4>⚽ Goles</h4><div class="mh-cols"><ul class="tl">${side(goals, true).map(goalRow).join('') || '<li class="muted small">—</li>'}</ul><ul class="tl right">${side(goals, false).map(goalRow).join('') || '<li class="muted small">—</li>'}</ul></div></section>`);
    if (subs.length) sections.push(`<section class="mh-sec"><h4>🔁 Cambios</h4><ul class="tl">${subs.map((t) => `<li><span class="min">${t.min}'</span><span><span class="in">▲ ${esc(t.player)}</span>${t.assist ? ` <span class="out">▼ ${esc(t.assist)}</span>` : ''}<small>${esc(t.team)}</small></span></li>`).join('')}</ul></section>`);
    if (cards.length) sections.push(`<section class="mh-sec"><h4>🟨 Tarjetas</h4><ul class="tl">${cards.map((t) => `<li><span class="min">${t.min}'</span><span>${/red/i.test(t.detail) ? '🟥' : '🟨'} <b>${esc(t.player)}</b><small>${esc(t.team)}${t.comment ? ` · ${esc(t.comment)}` : ''}</small></span></li>`).join('')}</ul></section>`);
    if (d.lineup.length) {
      const col = (home) => {
        const xs = d.lineup.filter((p) => p.home === home);
        const st = xs.filter((p) => !p.sub), sb = xs.filter((p) => p.sub);
        const li = (p) => `<li><span class="num">${esc(p.num)}</span><span>${esc(p.name)}<small>${esc(p.pos)}</small></span></li>`;
        return `<div><h5>${esc(home ? e.home : e.away)}</h5><ul class="lu">${st.map(li).join('') || '<li class="muted small">Sin datos</li>'}</ul>${sb.length ? `<h6>Suplentes</h6><ul class="lu subs">${sb.map(li).join('')}</ul>` : ''}</div>`;
      };
      sections.push(`<section class="mh-sec"><h4>📋 Alineaciones</h4><div class="mh-cols">${col(true)}${col(false)}</div></section>`);
    }
    if (d.stats.length) {
      sections.push(`<section class="mh-sec"><h4>📊 Estadísticas</h4>${d.stats.map((st) => {
        const h = parseFloat(st.home) || 0, a = parseFloat(st.away) || 0, tot = h + a || 1;
        return `<div class="stat"><div class="stat-top"><b>${esc(st.home)}</b><span>${esc(st.name)}</span><b>${esc(st.away)}</b></div><div class="stat-bar"><i class="h" style="--w:${(h / tot) * 100}%"></i><i class="a" style="--w:${(a / tot) * 100}%"></i></div></div>`;
      }).join('')}</section>`);
    }
    if (!sections.length) {
      sections.push(`<p class="muted small center pad">${past ? 'Este partido no tiene detalles disponibles en la API gratuita.' : 'Las alineaciones y los goles aparecen cuando el partido se juega.'}</p>`);
    } else if (d.limited) {
      sections.push('<p class="muted xsmall center">Con la clave gratuita de TheSportsDB algunos datos llegan incompletos (máx. 5 por sección).</p>');
    }
    body.innerHTML = sections.join('');
    $('#mh-video', s.el)?.addEventListener('click', () => openUrl(d.video));
  } catch {
    if (s.open) body.innerHTML = '<p class="muted small center pad">No se pudieron cargar los detalles. Revisa tu conexión.</p>';
  }
}
