// Fútbol (dentro de Deportes) con datos públicos de ESPN: clubes y selecciones, ligas con calendario y tabla completos,
// y cada partido con goles, tarjetas, cambios, alineaciones y estadísticas.
import { $, $$, esc, toast, ICONS, openSheet, confirmDialog, debounce, relTime, hueOf, vibrate, imageToDataURL } from './ui.js';
import { S, setPref, openUrl } from './store.js';
import { ATTRIBUTION, POPULAR_LEAGUES, LEGACY_LEAGUES, soccerSearchTeams, soccerSearchLeagues, soccerTeamSchedule, soccerCalendar, soccerSummary, posEs, sportDay, sportStandings } from './api.js';
import { avatar, gameCard, statusEs, centerIn, dayLabel, addDays, cap, fmtDay, fmtLong, ytSearch, loading, errorBox, updated, tickCountdowns } from './sports.js';
import { db } from './db.js';

let tab = 'equipos';
let rootEl = null;
const TABS = ['equipos', 'ligas', 'hoy'];

// ---------- piezas visuales ----------
export const teamAvatar = (t, size = '') => avatar(t, size);
const popular = (id) => POPULAR_LEAGUES.find((p) => p.id === id);
const leagueName = (slug) => popular(slug)?.name || (S.settings.leagues || []).find((l) => l.id === slug)?.name || '';
function leagueStyle(lg) {
  const pop = popular(lg.id);
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
// "3rd in Colombian Primera A" → "3.º en Liga BetPlay"
const standingEs = (t = '', slug = '') => t.replace(/^(\d+)(?:st|nd|rd|th) in (.+)$/, (_, n, lg) => `${n}.º en ${leagueName(slug) || lg}`);
const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rival = (g, id) => (g.home.id === id ? g.away : g.home);
const scoreFor = (g, id) => (g.home.id === id ? `${g.home.score}-${g.away.score}` : `${g.away.score}-${g.home.score}`);
const resultFor = (g, id) => { const me = g.home.id === id ? g.home : g.away, ot = rival(g, id); return +me.score > +ot.score ? 'G' : +me.score < +ot.score ? 'P' : 'E'; };

// ---------- paso de la versión anterior (TheSportsDB) a ESPN ----------
let migrating = null;
function migrate() {
  if (migrating) return migrating;
  migrating = (async () => {
    let changed = false;
    // ligas: el ID viejo se cambia por el código de ESPN
    const leagues = S.settings.leagues || [];
    if (leagues.some((l) => /^\d+$/.test(l.id))) {
      const next = [];
      for (const l of leagues) {
        const slug = /^\d+$/.test(l.id) ? LEGACY_LEAGUES[l.id] : l.id;
        if (slug && !next.some((x) => x.id === slug)) next.push({ ...l, id: slug, name: popular(slug)?.name || l.name, country: popular(slug)?.country || l.country });
      }
      await setPref('leagues', next);
      changed = true;
    }
    // equipos: se buscan por nombre en ESPN y se conserva el escudo propio
    for (const t of [...S.teams]) {
      if (t.src === 'espn') continue;
      try {
        const found = (await soccerSearchTeams(t.name))[0];
        await db.del('teams', t.id);
        S.teams = S.teams.filter((x) => x.id !== t.id);
        if (found && !S.teams.some((x) => x.id === found.id)) {
          const nt = { ...found, logo: t.logo || '', order: t.order ?? S.teams.length };
          S.teams.push(nt);
          await db.put('teams', nt);
        }
        changed = true;
      } catch { /* sin conexión: se intenta la próxima vez */ migrating = null; }
    }
    return changed;
  })();
  return migrating;
}

// ---------- pantalla principal ----------
export function renderFootball(root, param) {
  rootEl = root;
  if (TABS.includes(param)) tab = param;
  root.innerHTML = `<div class="fb">
  <div class="tabs2 three" role="tablist">
    <button role="tab" class="${tab === 'equipos' ? 'on' : ''}" data-tab="equipos">🛡️ Equipos <em>${S.teams.length}</em></button>
    <button role="tab" class="${tab === 'ligas' ? 'on' : ''}" data-tab="ligas">🏆 Ligas <em>${(S.settings.leagues || []).length}</em></button>
    <button role="tab" class="${tab === 'hoy' ? 'on' : ''}" data-tab="hoy">📅 Hoy</button>
    <i class="tabs2-pill" style="--x:${TABS.indexOf(tab)}"></i>
  </div>
  <div id="fb-body"></div>
  <p class="attr">${esc(ATTRIBUTION.espn.text)} · <a href="${ATTRIBUTION.espn.url}" target="_blank" rel="noopener">ESPN</a></p></div>`;
  $('.tabs2', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    $$('.tabs2 [data-tab]', root).forEach((x) => x.classList.toggle('on', x === b));
    $('.tabs2-pill', root).style.setProperty('--x', TABS.indexOf(tab));
    drawTab();
  });
  drawTab();
  if (S.teams.some((t) => t.src !== 'espn') || (S.settings.leagues || []).some((l) => /^\d+$/.test(l.id))) {
    migrate().then((ch) => { if (ch) { toast('Tus equipos y ligas se pasaron a la nueva fuente de datos', { icon: '⚽' }); refresh(); } });
  }
}

function drawTab() {
  const body = $('#fb-body', rootEl);
  if (!body) return;
  body.classList.remove('tab-in'); void body.offsetWidth; body.classList.add('tab-in');
  const [a, b] = $$('.fb .tabs2 em', rootEl);
  if (a) a.textContent = S.teams.length;
  if (b) b.textContent = (S.settings.leagues || []).length;
  if (tab === 'ligas') drawLeagues(body); else if (tab === 'hoy') drawToday(body); else drawTeams(body);
}
const refresh = () => { if (rootEl?.isConnected && $('#fb-body', rootEl)) drawTab(); };

// ======================= EQUIPOS =======================
function drawTeams(body) {
  body.innerHTML = `
    <button class="add-big" id="add-team"><span>＋</span><b>Agregar equipo o selección</b></button>
    <div class="fb-grid" id="team-grid">${S.teams.map((t, i) => `
      <button class="fb-tile" data-team="${esc(t.id)}" style="--i:${i}">
        ${avatar(t, 'md')}
        <b>${esc(t.name)}</b>
        <small>${esc(leagueName(t.league) || t.country || '')}</small>
        <span class="fb-next" id="nx-${esc(t.id)}"><span class="dots"><i></i><i></i><i></i></span></span>
      </button>`).join('')}</div>
    ${S.teams.length ? '' : `<div class="empty small"><div class="empty-art"><span>⚽</span><span style="--i:1">🥅</span></div><h3>Sigue a tus equipos</h3><p class="muted">Toca "Agregar equipo" para buscar tu club o selección.</p></div>`}`;
  $('#add-team', body).onclick = openTeamSearch;
  $('#team-grid', body).addEventListener('click', (e) => {
    const t = e.target.closest('[data-team]');
    if (t) openTeam(S.teams.find((x) => x.id === t.dataset.team));
  });
  S.teams.forEach(async (t) => {
    const el = $('#nx-' + CSS.escape(t.id), body);
    try {
      const r = await soccerTeamSchedule(t.id);
      if (!el?.isConnected) return;
      if ((!t.color1 && r.data.color1) || t.standing !== r.data.standing) { t.color1 = t.color1 || r.data.color1; t.color2 = t.color2 || r.data.color2; t.standing = r.data.standing; db.put('teams', t); }
      const n = r.data.upcoming[0], l = r.data.results[0];
      el.innerHTML = n ? (n.state === 'in' ? `<i class="live-dot"></i> En vivo ${esc(scoreFor(n, t.id))} vs ${esc(rival(n, t.id).short || rival(n, t.id).name)}` : `📅 vs ${esc(rival(n, t.id).name)} · ${esc(fmtDay(n.ts))}`)
        : l ? `${{ G: '✅', P: '❌', E: '➖' }[resultFor(l, t.id)]} ${esc(scoreFor(l, t.id))} vs ${esc(rival(l, t.id).name)}` : 'Sin partidos próximos';
    } catch { if (el?.isConnected) el.textContent = 'Toca para ver partidos'; }
  });
}

async function followTeam(t) {
  if (S.teams.some((x) => x.id === t.id)) return false;
  const nt = { id: t.id, name: t.name, short: t.short || '', league: t.league || '', country: t.country || '', color1: t.color1 || '', color2: t.color2 || '', src: 'espn', order: S.teams.length };
  S.teams.push(nt);
  await db.put('teams', nt);
  vibrate(12);
  toast(`Ahora sigues a ${t.name}`, { icon: '⚽' });
  refresh();
  return true;
}

function openTeamSearch() {
  const s = openSheet(`
    <h3 class="sheet-title">Agregar equipo</h3>
    <div class="searchbar in-sheet"><span class="ic">${ICONS.search}</span>
      <input id="ts-q" type="search" placeholder="Club o selección (p. ej. Nacional, Colombia)" autocomplete="off" enterkeyhint="search"></div>
    <div id="ts-res"><p class="muted small center pad">Escribe al menos 3 letras.</p></div>`, { cls: 'tall' });
  const q = $('#ts-q', s.el), res = $('#ts-res', s.el);
  let token = 0, found = [];
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { res.innerHTML = '<p class="muted small center pad">Escribe al menos 3 letras.</p>'; return; }
    const tk = ++token;
    res.innerHTML = loading('Buscando…');
    try {
      found = await soccerSearchTeams(v);
      if (tk !== token) return;
      res.innerHTML = found.length ? `<ul class="team-results">${found.map((t, i) => `<li style="--i:${i}">${avatar(t, 'sm')}<div class="grow"><b>${esc(t.name)}</b><small class="muted">${esc([leagueName(t.league) || t.league, t.country].filter(Boolean).join(' · '))}</small></div>
        ${S.teams.some((x) => x.id === t.id) ? '<span class="tag ok">Siguiendo</span>' : `<button class="btn sm primary" data-addteam="${esc(t.id)}">Seguir</button>`}</li>`).join('')}</ul>`
        : '<p class="muted small center pad">No encontré equipos con ese nombre. Prueba con otra forma de escribirlo.</p>';
    } catch { if (tk === token) res.innerHTML = errorBox('No se pudo buscar (¿sin conexión?).'); }
  };
  q.addEventListener('input', debounce(search, 400));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-addteam]');
    if (b && await followTeam(found.find((t) => t.id === b.dataset.addteam))) b.outerHTML = '<span class="tag ok">Siguiendo</span>';
  });
  setTimeout(() => q.focus(), 350);
}

function openTeam(t) {
  if (!t) return;
  const s = openSheet(`
    <div class="fb-hero" style="--c1:${t.color1 || '#16a34a'};--c2:${t.color2 || '#111'}">
      <div class="fb-hero-av">${avatar(t, 'xl')}</div>
      <h3>${esc(t.name)}</h3>
      <p class="muted small" id="tm-sub">${esc(standingEs(t.standing, t.league) || leagueName(t.league) || t.country || '')}</p>
      <div class="fb-actions">
        <button class="btn sm" data-act="crest">🛡️ Escudo</button>
        <button class="btn sm" data-act="refresh">${ICONS.refresh} Actualizar</button>
        <button class="btn sm danger ghost" data-act="del">${ICONS.trash} Quitar</button>
      </div>
    </div>
    <div id="tm-body">${loading('Cargando partidos…')}</div>`, { cls: 'tall' });
  const body = $('#tm-body', s.el);
  let all = [];
  const load = async (force = false) => {
    try {
      const r = await soccerTeamSchedule(t.id, { force });
      if (!s.open) return;
      all = [...r.data.upcoming, ...r.data.results];
      const form = r.data.results.slice(0, 5).map((g) => resultFor(g, t.id));
      if (r.data.standing) $('#tm-sub', s.el).textContent = standingEs(r.data.standing, t.league);
      body.innerHTML = `<div class="mh-view">
        ${form.length ? `<div class="form-row"><span class="muted small">Últimos partidos</span><div class="form">${form.map((x) => `<i class="f${{ G: 'W', P: 'L', E: 'D' }[x]}">${x}</i>`).join('')}</div></div>` : ''}
        <section class="mh-sec"><h4>📅 Próximos partidos</h4>${r.data.upcoming.length ? `<div class="games">${r.data.upcoming.map((g, i) => gameCard(g, 'futbol', i)).join('')}</div>` : '<p class="muted small">Sin partidos programados por ahora.</p>'}</section>
        <section class="mh-sec"><h4>🏁 Últimos resultados</h4>${r.data.results.length ? `<div class="games">${r.data.results.map((g, i) => gameCard(g, 'futbol', i)).join('')}</div>` : '<p class="muted small">Sin resultados recientes.</p>'}</section>
        ${updated(r)}</div>`;
    } catch { if (s.open) body.innerHTML = errorBox('No se pudieron cargar los partidos. Revisa tu conexión.'); }
  };
  load();
  body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-game]');
    if (c) openMatch(all.find((g) => g.id === c.dataset.game));
  });
  $('.fb-actions', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'refresh') { b.classList.add('spin'); await load(true); b.classList.remove('spin'); }
    if (b.dataset.act === 'crest') {
      editCrest(t.name, t.logo, async (logo) => {
        t.logo = logo;
        await db.put('teams', t);
        $('.fb-hero-av', s.el).innerHTML = avatar(t, 'xl');
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

// ======================= HOY =======================
// Los partidos de hoy de tus ligas y equipos
async function drawToday(body) {
  const leagues = S.settings.leagues || [];
  if (!leagues.length && !S.teams.length) {
    body.innerHTML = `<div class="empty small"><div class="empty-art"><span>📅</span></div><h3>Aquí verás los partidos de hoy</h3><p class="muted">Sigue ligas o equipos y sus partidos del día aparecerán aquí, con los marcadores en vivo.</p></div>`;
    return;
  }
  body.innerHTML = loading('Buscando los partidos de hoy…');
  const today = addDays(new Date(), 0);
  const groups = await Promise.all(leagues.map(async (lg) => {
    try { return { lg, games: (await sportDay('soccer/' + lg.id, today)).data }; } catch { return { lg, games: [] }; }
  }));
  const shown = new Set(groups.flatMap((g) => g.games.map((x) => x.id)));
  const teamGames = (await Promise.all(S.teams.map(async (t) => {
    try { const r = (await soccerTeamSchedule(t.id)).data; return [...r.upcoming, ...r.results]; } catch { return []; }
  }))).flat().filter((g) => new Date(g.ts).toDateString() === new Date().toDateString() && !shown.has(g.id));
  const extra = [...new Map(teamGames.map((g) => [g.id, g])).values()];
  if (!body.isConnected || tab !== 'hoy') return;
  const all = [...groups.flatMap((g) => g.games), ...extra];
  const withGames = groups.filter((g) => g.games.length);
  body.innerHTML = all.length ? `
    <div class="day-head"><b>${cap(new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }))}</b><span>${all.length} ${all.length === 1 ? 'partido' : 'partidos'}</span></div>
    ${extra.length ? `<section class="today-sec"><h4>🛡️ Tus equipos</h4><div class="games">${extra.map((g, i) => gameCard(g, 'futbol', i)).join('')}</div></section>` : ''}
    ${withGames.map(({ lg, games }) => `<section class="today-sec"><h4>${leagueStyle(lg).flag} ${esc(lg.name)}</h4><div class="games">${games.map((g, i) => gameCard(g, 'futbol', i)).join('')}</div></section>`).join('')}`
    : `<div class="empty small"><div class="empty-art"><span>😴</span></div><h3>Hoy no juegan tus ligas ni tus equipos</h3><p class="muted">Entra a una liga para ver su calendario completo.</p></div>`;
  body.onclick = (e) => {
    const c = e.target.closest('[data-game]');
    if (c) openMatch(all.find((g) => g.id === c.dataset.game));
  };
}

// ======================= LIGAS =======================
function drawLeagues(body) {
  const mine = S.settings.leagues || [];
  body.innerHTML = `
    <button class="add-big" id="add-league"><span>＋</span><b>Agregar liga o torneo</b></button>
    <div class="fb-grid" id="lg-grid">${mine.map((lg, i) => { const st = leagueStyle(lg); return `
      <button class="fb-tile lg-tile" data-lg="${esc(lg.id)}" style="--i:${i};--c1:${st.c1};--c2:${st.c2}">
        ${leagueBadge(lg, 'md')}
        <b>${esc(lg.name)}</b>
        <small>${esc(lg.country || '')}</small>
        <span class="fb-next" id="lgn-${esc(lg.id.replace(/\W/g, '_'))}"><span class="dots"><i></i><i></i><i></i></span></span>
      </button>`; }).join('')}</div>
    ${mine.length ? '' : `<div class="empty small"><div class="empty-art"><span>🏆</span></div><h3>Sigue tus ligas</h3><p class="muted">Toca "Agregar liga o torneo" para elegir la Champions, la Premier, la liga colombiana y más.</p></div>`}`;
  $('#add-league', body).onclick = openLeagueSearch;
  $('#lg-grid', body).addEventListener('click', (e) => {
    const t = e.target.closest('[data-lg]');
    if (t) openLeague(mine.find((l) => l.id === t.dataset.lg));
  });
  mine.forEach(async (lg) => {
    const el = $('#lgn-' + lg.id.replace(/\W/g, '_'), body);
    try {
      const c = await soccerCalendar(lg.id);
      if (!el?.isConnected) return;
      const today = isoOf(new Date());
      const next = c.data.dates.find((d) => d >= today);
      el.innerHTML = next ? (next === today ? '⚽ Hay partidos hoy' : `📅 Próxima fecha: ${esc(fmtDay(dateOf(next)))}`) : (c.data.season ? esc(c.data.season) : 'Toca para ver partidos');
    } catch { if (el?.isConnected) el.textContent = 'Toca para ver partidos'; }
  });
}

async function followLeague(lg) {
  const list = [...(S.settings.leagues || [])];
  if (list.some((l) => l.id === lg.id)) return false;
  list.push({ id: lg.id, name: lg.name, country: lg.country || '' });
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
      <input id="ls-q" type="search" placeholder="Nombre o país (p. ej. Liga MX, Chile, Eredivisie)" autocomplete="off" enterkeyhint="search"></div>
    <div id="ls-res"></div>
    <h4 class="ls-title">Populares</h4>
    <div class="lg-popgrid">${POPULAR_LEAGUES.map((p, i) => `<button class="lg-chip ${mine().some((l) => l.id === p.id) ? 'on' : ''}" data-pop="${p.id}" style="--c1:${p.c1};--c2:${p.c2};--i:${i}"><span class="lg-flag">${p.flag}</span><b>${esc(p.name)}</b><small>${esc(p.country)}</small>${mine().some((l) => l.id === p.id) ? '<i class="lg-check">✓</i>' : ''}</button>`).join('')}</div>`, { cls: 'tall' });
  $('.lg-popgrid', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pop]');
    if (!b || b.classList.contains('on')) return;
    if (await followLeague(popular(b.dataset.pop))) {
      b.classList.add('on');
      b.insertAdjacentHTML('beforeend', '<i class="lg-check">✓</i>');
    }
  });
  const q = $('#ls-q', s.el), res = $('#ls-res', s.el);
  let token = 0, found = [];
  const search = async () => {
    const v = q.value.trim();
    if (v.length < 3) { res.innerHTML = ''; return; }
    const tk = ++token;
    res.innerHTML = loading('Buscando torneos…');
    try {
      found = (await soccerSearchLeagues(v)).filter((l) => !popular(l.id));
      if (tk !== token) return;
      res.innerHTML = found.length ? `<ul class="team-results">${found.map((l, i) => `<li style="--i:${i}">${leagueBadge(l, 'sm')}<div class="grow"><b>${esc(l.name)}</b></div>
        ${mine().some((x) => x.id === l.id) ? '<span class="tag ok">Siguiendo</span>' : `<button class="btn sm primary" data-addlg="${esc(l.id)}">Seguir</button>`}</li>`).join('')}</ul>`
        : '<p class="muted small center pad">No encontré otros torneos con ese nombre. Revisa también la lista de populares.</p>';
    } catch { if (tk === token) res.innerHTML = errorBox('No se pudo buscar (¿sin conexión?).'); }
  };
  q.addEventListener('input', debounce(search, 400));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-addlg]');
    if (b && await followLeague(found.find((l) => l.id === b.dataset.addlg))) b.outerHTML = '<span class="tag ok">Siguiendo</span>';
  });
}

function openLeague(lg) {
  if (!lg) return;
  const st = leagueStyle(lg);
  const s = openSheet(`
    <div class="fb-hero" style="--c1:${st.c1};--c2:${st.c2}">
      <div class="fb-hero-av">${leagueBadge(lg, 'xl')}</div>
      <h3>${esc(lg.name)}</h3>
      <p class="muted small" id="lg-sub">${esc(lg.country || '')}</p>
      <div class="fb-actions">
        <button class="btn sm" data-act="crest">🛡️ Escudo</button>
        <button class="btn sm danger ghost" data-act="del">${ICONS.trash} Quitar</button>
      </div>
    </div>
    <div class="seg mh-tabs" id="lg-tabs"><button class="on" data-v="partidos">Partidos</button><button data-v="tabla">Tabla</button><button data-v="torneos">Torneos</button></div>
    <div id="lg-body">${loading()}</div>`, { cls: 'tall' });
  const body = $('#lg-body', s.el);
  let view = 'partidos', dates = [], dayIdx = 0, games = [];
  const drawDay = async () => {
    const box = $('#lg-games', body);
    if (!box) return;
    box.innerHTML = loading('Buscando partidos…');
    try {
      const r = await sportDay('soccer/' + lg.id, dateOf(dates[dayIdx]));
      if (!s.open || view !== 'partidos') return;
      games = r.data;
      box.innerHTML = games.length ? `<div class="games">${games.map((g, i) => gameCard(g, 'futbol', i)).join('')}</div>${updated(r)}` : '<p class="muted small center pad">No hay partidos este día.</p>';
    } catch { if (s.open) box.innerHTML = errorBox(); }
  };
  const load = async () => {
    body.innerHTML = loading();
    if (view === 'torneos') {
      const country = popular(lg.id)?.country || lg.country || '';
      const others = POPULAR_LEAGUES.filter((p) => p.id !== lg.id && (p.country === country || p.id.split('.')[0] === lg.id.split('.')[0]));
      body.innerHTML = `<div class="mh-view">${others.length ? `<p class="muted small">Otros torneos${country ? ` de ${esc(country)}` : ''}:</p><div class="chips wrap">${others.map((l) => {
        const on = (S.settings.leagues || []).some((x) => x.id === l.id);
        return `<button class="chip ${on ? 'on' : ''}" data-addlg="${esc(l.id)}">${on ? '✓' : '＋'} ${esc(l.name)}</button>`;
      }).join('')}</div>` : '<p class="muted small center pad">No hay otros torneos relacionados en la lista. Búscalos con "Agregar liga o torneo".</p>'}</div>`;
      return;
    }
    if (view === 'tabla') {
      try {
        const r = await sportStandings('soccer/' + lg.id);
        if (!s.open || view !== 'tabla') return;
        const notes = [...new Map(r.data.flatMap((g) => g.rows).filter((x) => x.note?.text).map((x) => [x.note.text, x.note])).values()];
        body.innerHTML = `<div class="mh-view">${r.data.length ? `${r.data.map((g) => `
          ${r.data.length > 1 || g.name ? `<h4 class="st-name">${esc(g.name || '')}</h4>` : ''}
          <table class="lg-table fb-table"><thead><tr><th>#</th><th class="tl">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>Pts</th></tr></thead><tbody>
          ${g.rows.map((x, i) => `<tr style="--i:${Math.min(i, 20)};${x.note?.color ? `--nc:${esc(x.note.color)}` : ''}" class="${x.note?.color ? 'noted' : ''} ${S.teams.some((t) => t.id === x.id) ? 'is-fav' : ''}" data-team="${esc(x.id)}">
            <td><span class="rank r${x.rank || i + 1}">${x.rank || i + 1}</span></td>
            <td class="tl"><div class="tcell">${avatar(x, 'xs')}<span>${esc(x.name)}</span></div></td>
            <td>${esc(x.pj)}</td><td>${esc(x.w)}</td><td>${esc(x.d)}</td><td>${esc(x.l)}</td><td>${esc(x.gd)}</td><td><b>${esc(x.pts)}</b></td></tr>`).join('')}
          </tbody></table>`).join('')}
          ${notes.length ? `<ul class="st-legend">${notes.map((n) => `<li><i style="--nc:${esc(n.color)}"></i>${esc(n.text)}</li>`).join('')}</ul>` : ''}
          <p class="muted small center">Toca un equipo para seguirlo.</p>${updated(r)}`
          : '<p class="muted small center pad">Este torneo no tiene tabla de posiciones disponible.</p>'}</div>`;
      } catch { if (s.open) body.innerHTML = errorBox('Este torneo no tiene tabla de posiciones disponible.'); }
      return;
    }
    // partidos: tira con las fechas del calendario
    try {
      const c = await soccerCalendar(lg.id);
      if (!s.open || view !== 'partidos') return;
      if (c.data.season) $('#lg-sub', s.el).textContent = [lg.country, c.data.season].filter(Boolean).join(' · ');
      const today = isoOf(new Date());
      dates = c.data.dates.length ? c.data.dates : Array.from({ length: 15 }, (_, k) => isoOf(addDays(new Date(), k - 7)));
      dayIdx = dates.findIndex((d) => d >= today);
      if (dayIdx < 0) dayIdx = dates.length - 1;
      body.innerHTML = `<div class="day-strip in-sheet scroll-x" id="lg-days">${dates.map((d, i) => { const dt = dateOf(d); return `<button class="day-pill ${i === dayIdx ? 'on' : ''} ${d === today ? 'today' : ''}" data-i="${i}"><small>${dayLabel(dt)}</small><b>${dt.getDate()}</b><small>${esc(dt.toLocaleDateString('es', { month: 'short' }).replace('.', ''))}</small></button>`; }).join('')}</div>
        <div id="lg-games"></div>`;
      centerIn($('#lg-days', body), $('#lg-days .on', body));
      $('#lg-days', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        dayIdx = +b.dataset.i;
        $$('#lg-days .day-pill', body).forEach((x) => x.classList.toggle('on', x === b));
        vibrate(5);
        drawDay();
      });
      drawDay();
    } catch { if (s.open) body.innerHTML = errorBox(); }
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
    const g = e.target.closest('[data-game]');
    if (g) return openMatch(games.find((x) => x.id === g.dataset.game), lg.id);
    const row = e.target.closest('tr[data-team]');
    if (row) {
      const name = row.querySelector('.tcell span')?.textContent || '';
      if (S.teams.some((t) => t.id === row.dataset.team)) { toast(`Ya sigues a ${name}`, { icon: '⭐' }); return; }
      if (await confirmDialog(`¿Seguir a ${name}?`, 'Aparecerá en tus equipos con sus próximos partidos.', { ok: 'Seguir' })) {
        await followTeam({ id: row.dataset.team, name, league: lg.id });
        row.classList.add('is-fav');
      }
      return;
    }
    const b = e.target.closest('[data-addlg]');
    if (b && !b.classList.contains('on') && await followLeague(popular(b.dataset.addlg))) { b.classList.add('on'); b.textContent = '✓ ' + b.textContent.replace(/^＋\s*/, ''); }
  });
  $('.fb-actions', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
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
const EV_ICON = { goal: '⚽', og: '⚽', penmiss: '❌', yellow: '🟨', red: '🟥', sub: '🔄' };
function timelineHTML(d) {
  const evs = d.events.filter((e) => e.kind !== 'ht');
  if (!evs.length) return '<p class="muted small center pad">Todavía no hay goles, tarjetas ni cambios.</p>';
  return `<ul class="timeline">${d.events.map((e, i) => {
    if (e.kind === 'ht') return `<li class="tl-ht" style="--i:${i}"><span>Medio tiempo</span></li>`;
    const what = e.kind === 'sub' ? `<b>↑ ${esc(e.a)}</b><small>↓ ${esc(e.b)}</small>`
      : e.kind === 'goal' ? `<b>${esc(e.a)}${e.pen ? ' (penal)' : ''}</b>${e.b ? `<small>Asistencia: ${esc(e.b)}</small>` : ''}`
        : e.kind === 'og' ? `<b>${esc(e.a)}</b><small>Autogol</small>`
          : e.kind === 'penmiss' ? `<b>${esc(e.a)}</b><small>Penal fallado</small>`
            : `<b>${esc(e.a)}</b>`;
    return `<li class="tl-ev ${e.side} k-${e.kind}" style="--i:${Math.min(i, 30)}"><span class="tl-min">${esc(e.min)}</span><span class="tl-ic">${EV_ICON[e.kind]}</span><span class="tl-what">${what}</span></li>`;
  }).join('')}</ul>`;
}
function lineupsHTML(d, g) {
  if (!d.rosters.some((r) => r.starters.length)) return '<p class="muted small center pad">Las alineaciones aparecen más o menos una hora antes del partido.</p>';
  const order = ['home', 'away'].map((ha) => d.rosters.find((r) => r.side === ha)).filter(Boolean);
  return `<div class="lineups">${order.map((r) => `
    <section class="lu-team">
      <div class="lu-head">${avatar(r.side === 'home' ? g.home : g.away, 'sm')}<b>${esc(r.team)}</b>${r.formation ? `<span class="tag">${esc(r.formation)}</span>` : ''}</div>
      <ul class="lu-list">${r.starters.map((p) => `<li><span class="lu-num">${esc(p.num)}</span><span class="grow">${esc(p.name)}${p.goals ? ` ${'⚽'.repeat(Math.min(p.goals, 4))}` : ''}${p.out ? ' <i class="lu-out">↓</i>' : ''}</span><small>${esc(posEs(p.pos))}</small></li>`).join('')}</ul>
      ${r.bench.length ? `<details class="lu-bench"><summary>Suplentes (${r.bench.length})</summary><ul class="lu-list">${r.bench.map((p) => `<li class="${p.inn ? 'came' : ''}"><span class="lu-num">${esc(p.num)}</span><span class="grow">${esc(p.name)}${p.goals ? ' ⚽' : ''}${p.inn ? ' <i class="lu-in">↑</i>' : ''}</span><small>${esc(posEs(p.pos))}</small></li>`).join('')}</ul></details>` : ''}
    </section>`).join('')}</div>`;
}
function statsHTML(d) {
  if (!d.stats.length) return '<p class="muted small center pad">Las estadísticas aparecen cuando empieza el partido.</p>';
  const num = (v) => parseFloat(String(v || '0').replace('%', '')) || 0;
  return `<ul class="mstats">${d.stats.map((s, i) => {
    const h = num(s.home), a = num(s.away), tot = h + a || 1;
    const fmt = (v) => (s.key === 'possessionPct' ? `${v}%` : v ?? '0');
    return `<li style="--i:${i}"><div class="ms-row"><b>${esc(fmt(s.home))}</b><span>${esc(s.label)}</span><b>${esc(fmt(s.away))}</b></div>
      <div class="ms-bar"><i class="${h >= a ? 'lead' : ''}" style="width:${(h / tot) * 100}%"></i><i class="${a > h ? 'lead' : ''}" style="width:${(a / tot) * 100}%"></i></div></li>`;
  }).join('')}</ul>`;
}

export async function openMatch(g, slug = '') {
  if (!g) return;
  const done = g.state === 'post', live = g.state === 'in';
  const sc = (t) => `${esc(t.score)}${t.pen !== '' && t.pen != null ? `<small>(${esc(t.pen)})</small>` : ''}`;
  const s = openSheet(`
    <div class="match-hero solo game-hero">
      <div class="mh-league">⚽ ${esc(leagueName(slug || g.slug) || g.league || '')}${g.note ? ` · ${esc(g.note)}` : ''}</div>
      <div class="mh-row">
        <div class="mh-team">${avatar(g.home, 'lg')}<b>${esc(g.home.name)}</b><small>Local</small></div>
        <div class="mh-score">${done || live ? `<span>${sc(g.home)}</span><i>:</i><span>${sc(g.away)}</span>` : '<span class="vs-big">VS</span>'}</div>
        <div class="mh-team">${avatar(g.away, 'lg')}<b>${esc(g.away.name)}</b><small>Visitante</small></div>
      </div>
      <div class="mh-pill ${done ? 'done' : live ? 'live' : 'soon'}">${live ? '<i class="live-dot"></i> En vivo · ' : ''}${esc(done || live ? statusEs(g, 'futbol') : 'Próximo partido')}</div>
      <div class="mh-info">
        <div><span>📅</span>${esc(fmtLong(g.ts))}</div>
        ${g.state === 'pre' && new Date(g.ts) > Date.now() ? `<div><span>⏳</span>Empieza en&nbsp;<b data-cd="${esc(g.ts)}"></b></div>` : ''}
        <div id="mh-venue" ${g.venue ? '' : 'hidden'}><span>🏟️</span><b>${esc(g.venue)}${g.city ? `, ${esc(g.city)}` : ''}</b></div>
        ${g.tv ? `<div><span>📺</span>${esc(g.tv)}</div>` : ''}
      </div>
      <div class="fav-row">${[g.home, g.away].map((t) => `<button class="btn sm ${S.teams.some((x) => x.id === t.id) ? 'on' : ''}" data-follow="${esc(t.id)}">${S.teams.some((x) => x.id === t.id) ? '★ Siguiendo' : '☆ Seguir'} ${esc(t.short || t.name)}</button>`).join('')}</div>
      ${done ? `<button class="btn primary block video-btn" data-open="${esc(ytSearch(`${g.home.name} vs ${g.away.name} resumen ${g.ts.slice(0, 10)}`))}">${ICONS.play} Ver resumen en YouTube</button>` : ''}
    </div>
    ${g.state === 'pre' ? '' : '<div class="seg mh-tabs" id="mt-tabs"><button class="on" data-v="resumen">Resumen</button><button data-v="alineaciones">Alineaciones</button><button data-v="stats">Estadísticas</button></div>'}
    <div id="mt-body">${g.state === 'pre' ? '<div class="mh-view" id="mt-pre"></div>' : loading('Cargando el partido…')}</div>`, { cls: 'tall' });
  tickCountdowns(s.el);
  s.el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-open]');
    if (o) return openUrl(o.dataset.open);
    const f = e.target.closest('[data-follow]');
    if (f) {
      const t = [g.home, g.away].find((x) => x.id === f.dataset.follow);
      if (S.teams.some((x) => x.id === t.id)) { toast(`Ya sigues a ${t.name}. Para quitarlo, ábrelo en Equipos.`, { icon: '⭐' }); return; }
      await followTeam({ ...t, league: slug || g.slug || '' });
      f.classList.add('on');
      f.textContent = `★ Siguiendo ${t.short || t.name}`;
    }
  });
  let view = 'resumen', data = null;
  const draw = () => {
    const b = $('#mt-body', s.el);
    if (!b || !data) return;
    b.innerHTML = `<div class="mh-view">${view === 'alineaciones' ? lineupsHTML(data, g) : view === 'stats' ? statsHTML(data) : timelineHTML(data)}
      ${view === 'resumen' && (data.referee || data.attendance) ? `<p class="muted xsmall center">${data.referee ? `Árbitro: ${esc(data.referee)}` : ''}${data.referee && data.attendance ? ' · ' : ''}${data.attendance ? `${data.attendance.toLocaleString('es')} espectadores` : ''}</p>` : ''}</div>`;
  };
  $('#mt-tabs', s.el)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    view = b.dataset.v;
    $$('#mt-tabs button', s.el).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
  try {
    const r = await soccerSummary(g.id, { live });
    data = r.data;
    if (!s.open) return;
    if (data.venue && !g.venue) { const v = $('#mh-venue', s.el); v.hidden = false; v.querySelector('b').textContent = data.venue + (data.city ? `, ${data.city}` : ''); }
    if (g.state === 'pre') {
      // antes del partido: si ya salieron las alineaciones, se muestran
      if (data.rosters.some((x) => x.starters.length)) $('#mt-pre', s.el).innerHTML = `<h4 class="st-name">Alineaciones</h4>${lineupsHTML(data, g)}`;
    } else draw();
  } catch { const b = $('#mt-body', s.el); if (s.open && b && g.state !== 'pre') b.innerHTML = errorBox('No se pudo cargar el detalle del partido.'); }
}
