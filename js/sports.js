// Deportes: fútbol, NBA, MLB, Fórmula 1 y UFC en un solo lugar.
// Solo textos, números y colores propios: ningún logo de equipos, ligas o marcas.
import { $, $$, esc, toast, ICONS, openSheet, confirmDialog, debounce, relTime, hueOf, initials, vibrate } from './ui.js';
import { S, setPref, openUrl } from './store.js';
import { ATTRIBUTION, sportDay, sportStandings, sportTeamSchedule, ufcEvents, f1Season, f1Results, f1Standings } from './api.js';
import { renderFootball } from './football.js';

export const SPORTS = [
  { k: 'futbol', emoji: '⚽', name: 'Fútbol', sub: 'Tus equipos y ligas', c: '#16a34a' },
  { k: 'nba', emoji: '🏀', name: 'NBA', sub: 'Baloncesto', c: '#ea580c' },
  { k: 'mlb', emoji: '⚾', name: 'MLB', sub: 'Béisbol', c: '#2563eb' },
  { k: 'f1', emoji: '🏎️', name: 'F1', sub: 'Fórmula 1', c: '#dc2626' },
  { k: 'ufc', emoji: '🥊', name: 'UFC', sub: 'Artes marciales mixtas', c: '#a16207' },
];
const SP = Object.fromEntries(SPORTS.map((s) => [s.k, s]));

let rootEl = null;
let sport = null;
let liveTimer = null;

// ---------- utilidades ----------
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
export const fmtDay = (ts) => cap(new Date(ts).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }));
export const fmtLong = (ts) => cap(new Date(ts).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }));
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x; };
export function dayLabel(d) {
  const t = new Date();
  if (sameDay(d, t)) return 'Hoy';
  if (sameDay(d, addDays(t, -1))) return 'Ayer';
  if (sameDay(d, addDays(t, 1))) return 'Mañana';
  return cap(d.toLocaleDateString('es', { weekday: 'short' }).replace('.', ''));
}
function countdown(ts) {
  const ms = new Date(ts) - Date.now();
  if (ms <= 0) return 'Ahora';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return d ? `${d} d ${h} h ${m} min` : h ? `${h} h ${m} min ${s} s` : `${m} min ${s} s`;
}
// Cuentas regresivas que se actualizan solas mientras están en pantalla
export function tickCountdowns(root) {
  const els = $$('[data-cd]', root);
  if (!els.length) return;
  const up = () => els.forEach((el) => { el.textContent = countdown(el.dataset.cd); });
  up();
  const t = setInterval(() => { if (!els[0].isConnected) { clearInterval(t); return; } up(); }, 1000);
}
// centra un elemento dentro de una fila con scroll horizontal (sin mover la página)
export function centerIn(row, el) {
  if (row && el) row.scrollLeft = el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2;
}
export const ytSearch = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
export const loading = (txt = 'Cargando…') => `<div class="loading-row"><span class="spinner"></span> ${txt}</div>`;
export const errorBox = (txt = 'No se pudo cargar. Revisa tu conexión.') => `<p class="muted small center pad">${txt}</p>`;
export const updated = (r) => `<p class="muted xsmall center">${r.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(r.cachedAt)}</p>`;

// Escudo genérico: iniciales con los colores del equipo (nunca su logo)
export function avatar(t, size = '') {
  const name = t.name || '?';
  // escudo propio que subiste para ese equipo de fútbol
  const mine = t.logo ? t : S.teams.find((x) => x.id === t.id && x.logo);
  if (mine?.logo) return `<span class="team-av logo ${size}"><img src="${esc(mine.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('logo');this.remove()"></span>`;
  const c1 = t.color1 || `hsl(${hueOf(name)} 65% 42%)`;
  const c2 = t.color2 && t.color2.toLowerCase() !== t.color1?.toLowerCase() ? t.color2 : `hsl(${(hueOf(name) + 40) % 360} 65% 28%)`;
  const label = (t.short && t.short.length <= 4 ? t.short : initials(name)).toUpperCase();
  return `<span class="team-av ${size}" style="--c1:${c1};--c2:${c2}">${esc(label)}</span>`;
}

// Estado del partido en español
export function statusEs(g, sp = sport) {
  if (sp === 'futbol') {
    if (g.state === 'pre') return /postponed/i.test(g.detail) ? 'Aplazado' : /canceled|cancelled/i.test(g.detail) ? 'Cancelado' : fmtTime(g.ts);
    if (g.state === 'post') return /pen/i.test(g.detail) ? 'Final (penales)' : /AET|ET/i.test(g.detail) ? 'Final (prórroga)' : /postponed/i.test(g.detail) ? 'Aplazado' : 'Final';
    if (/HT|half/i.test(g.detail)) return 'Medio tiempo';
    return g.clock && g.clock !== "0'" ? g.clock : g.detail;
  }
  if (g.state === 'pre') {
    if (/postponed/i.test(g.detail)) return 'Aplazado';
    if (/canceled|cancelled/i.test(g.detail)) return 'Cancelado';
    return fmtTime(g.ts);
  }
  if (g.state === 'post') {
    const extra = g.detail.match(/Final\/(OT|\d+)/i);
    if (!extra) return /postponed/i.test(g.detail) ? 'Aplazado' : 'Final';
    return extra[1].toUpperCase() === 'OT' ? 'Final (prórroga)' : /\d/.test(extra[1]) && sp === 'mlb' ? `Final (${extra[1]} entradas)` : 'Final (prórroga)';
  }
  const d = g.detail;
  if (/half/i.test(d)) return 'Medio tiempo';
  if (/delay/i.test(d)) return 'Retrasado';
  const inn = d.match(/(Top|Bot|Bottom|Mid|Middle|End)\s+(\d+)/i);
  if (inn) return `${{ top: 'Alta', bot: 'Baja', bottom: 'Baja', mid: 'Mitad', middle: 'Mitad', end: 'Fin' }[inn[1].toLowerCase()]} ${inn[2]}ª`;
  const q = d.match(/(\d+:\d+)\s*-\s*(\d)(?:st|nd|rd|th)/i) || d.match(/(\d)(?:st|nd|rd|th)\s*(?:Qtr|Quarter)?\s*(\d+:\d+)?/i);
  if (q) return /:/.test(q[1]) ? `${q[2]}.º cuarto · ${q[1]}` : `${q[1]}.º cuarto${q[2] ? ' · ' + q[2] : ''}`;
  if (/OT/.test(d)) return 'Prórroga';
  return d;
}
const GROUP_ES = { 'Eastern Conference': 'Conferencia Este', 'Western Conference': 'Conferencia Oeste', 'American League': 'Liga Americana', 'National League': 'Liga Nacional' };
const streakEs = (s = '') => s.replace(/^W/, 'G').replace(/^L/, 'P');

// ---------- favoritos (NBA / MLB) ----------
const favs = (sp) => (S.settings.sportFavs || {})[sp] || [];
const isFav = (sp, id) => (sp === 'futbol' ? S.teams : favs(sp)).some((t) => t.id === id);
async function toggleFav(sp, team) {
  const all = { ...(S.settings.sportFavs || {}) };
  const list = favs(sp);
  const on = list.some((t) => t.id === team.id);
  all[sp] = on ? list.filter((t) => t.id !== team.id) : [...list, { id: team.id, name: team.name, short: team.short || '', color1: team.color1 || '', color2: team.color2 || '' }];
  await setPref('sportFavs', all);
  vibrate(10);
  toast(on ? `Dejaste de seguir a ${team.name}` : `Ahora sigues a ${team.name}`, { icon: on ? '🗑️' : '⭐' });
  return !on;
}

// ======================= PANTALLA PRINCIPAL =======================
export function renderSports(root, param, sub) {
  rootEl = root;
  clearInterval(liveTimer);
  sport = SP[param] ? param : (SP[S.settings.sport] ? S.settings.sport : 'futbol');
  root.innerHTML = `<div class="sports" style="--sc:${SP[sport].c}">
  <header class="topbar">
    <div class="grow"><h1 class="page-title big">🏟️ Deportes</h1><p class="sub" id="sp-sub">${esc(SP[sport].sub)}</p></div>
    <a href="#/ajustes" class="icon-btn" aria-label="Ajustes">${ICONS.gear}</a>
  </header>
  <div class="sport-switch scroll-x" role="tablist">${SPORTS.map((s, i) => `<button role="tab" class="sport-pill ${s.k === sport ? 'on' : ''}" data-sport="${s.k}" style="--c:${s.c};--i:${i}" aria-selected="${s.k === sport}"><span>${s.emoji}</span><b>${s.name}</b></button>`).join('')}</div>
  <div id="sport-body"></div></div>`;
  $('.sport-switch', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-sport]');
    if (!b || b.dataset.sport === sport) return;
    vibrate(6);
    history.replaceState(null, '', '#/deportes/' + b.dataset.sport);
    switchSport(b.dataset.sport);
  });
  drawSport(sub);
  // la píldora elegida a la vista
  centerIn($('.sport-switch', root), $('.sport-pill.on', root));
}

function switchSport(k) {
  clearInterval(liveTimer);
  sport = k;
  setPref('sport', k);
  $('.sports', rootEl).style.setProperty('--sc', SP[k].c);
  $('#sp-sub', rootEl).textContent = SP[k].sub;
  $$('.sport-pill', rootEl).forEach((x) => { x.classList.toggle('on', x.dataset.sport === k); x.setAttribute('aria-selected', x.dataset.sport === k); });
  drawSport();
}

function drawSport(sub) {
  const body = $('#sport-body', rootEl);
  body.classList.remove('tab-in'); void body.offsetWidth; body.classList.add('tab-in');
  if (sport === 'futbol') return renderFootball(body, sub);
  if (sport === 'f1') return drawF1(body);
  if (sport === 'ufc') return drawUFC(body);
  return drawLeague(body, sport);
}
const attrHTML = (a) => `<p class="attr">${esc(ATTRIBUTION[a].text)} · <a href="${ATTRIBUTION[a].url}" target="_blank" rel="noopener">${esc(ATTRIBUTION[a].name)}</a></p>`;

// ======================= NBA / MLB =======================
const leagueState = { nba: { view: 'partidos', day: 0 }, mlb: { view: 'partidos', day: 0 } };

function drawLeague(body, sp) {
  const st = leagueState[sp];
  body.innerHTML = `
    <div class="tabs2 three" role="tablist">
      <button role="tab" class="${st.view === 'partidos' ? 'on' : ''}" data-v="partidos">📅 Partidos</button>
      <button role="tab" class="${st.view === 'tabla' ? 'on' : ''}" data-v="tabla">📊 Tabla</button>
      <button role="tab" class="${st.view === 'equipos' ? 'on' : ''}" data-v="equipos">⭐ Equipos <em>${favs(sp).length}</em></button>
      <i class="tabs2-pill" style="--x:${['partidos', 'tabla', 'equipos'].indexOf(st.view)}"></i>
    </div>
    <div id="lg-view"></div>
    ${attrHTML('espn')}`;
  $('.tabs2', body).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || b.dataset.v === st.view) return;
    st.view = b.dataset.v;
    $$('.tabs2 [data-v]', body).forEach((x) => x.classList.toggle('on', x === b));
    $('.tabs2-pill', body).style.setProperty('--x', ['partidos', 'tabla', 'equipos'].indexOf(st.view));
    drawLeagueView(body, sp);
  });
  drawLeagueView(body, sp);
}

function drawLeagueView(body, sp) {
  clearInterval(liveTimer);
  const v = $('#lg-view', body);
  v.classList.remove('tab-in'); void v.offsetWidth; v.classList.add('tab-in');
  const st = leagueState[sp];
  if (st.view === 'tabla') return drawStandings(v, sp);
  if (st.view === 'equipos') return drawFavTeams(v, sp);
  return drawDays(v, sp);
}

// --- calendario por días ---
function drawDays(v, sp) {
  const st = leagueState[sp];
  const today = addDays(new Date(), 0);
  const days = Array.from({ length: 15 }, (_, k) => k - 5);
  v.innerHTML = `<div class="day-strip scroll-x" id="day-strip">${days.map((n) => { const d = addDays(today, n); return `<button class="day-pill ${n === st.day ? 'on' : ''} ${n === 0 ? 'today' : ''}" data-day="${n}"><small>${dayLabel(d)}</small><b>${d.getDate()}</b></button>`; }).join('')}</div>
    <div id="day-games">${loading('Buscando partidos…')}</div>`;
  centerIn($('#day-strip', v), $('#day-strip .on', v));
  $('#day-strip', v).addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    st.day = +b.dataset.day;
    $$('#day-strip .day-pill', v).forEach((x) => x.classList.toggle('on', x === b));
    vibrate(5);
    loadDay(v, sp);
  });
  loadDay(v, sp);
}

async function loadDay(v, sp, force = false) {
  clearInterval(liveTimer);
  const st = leagueState[sp];
  const box = $('#day-games', v);
  const date = addDays(new Date(), st.day);
  if (!force) box.innerHTML = loading('Buscando partidos…');
  try {
    const r = await sportDay(sp, date, { force });
    if (!box.isConnected || leagueState[sp].day !== st.day) return;
    const games = [...r.data].sort((a, b) => (+isFavGame(sp, b) - +isFavGame(sp, a)) || (a.state === 'in' ? -1 : 0) - (b.state === 'in' ? -1 : 0) || a.ts.localeCompare(b.ts));
    const live = games.filter((g) => g.state === 'in').length;
    box.innerHTML = games.length ? `
      <div class="day-head"><b>${cap(date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }))}</b><span>${games.length} ${games.length === 1 ? 'partido' : 'partidos'}${live ? ` · <i class="live-dot"></i> ${live} en vivo` : ''}</span></div>
      <div class="games">${games.map((g, i) => gameCard(g, sp, i)).join('')}</div>${updated(r)}`
      : `<div class="empty small"><div class="empty-art"><span>${SP[sp].emoji}</span></div><h3>Sin partidos este día</h3><p class="muted">${sp === 'nba' ? 'La temporada de la NBA va de octubre a junio.' : 'La temporada de la MLB va de marzo a octubre.'} Prueba otro día.</p></div>`;
    box.onclick = (e) => {
      const c = e.target.closest('[data-game]');
      if (c) openGame(games.find((g) => g.id === c.dataset.game), sp, () => loadDay(v, sp, true));
    };
    // en vivo: se actualiza solo cada 45 s
    if (live) liveTimer = setInterval(() => { if (!box.isConnected) { clearInterval(liveTimer); return; } if (!document.hidden) loadDay(v, sp, true); }, 45000);
  } catch { if (box.isConnected) box.innerHTML = errorBox(); }
}
const isFavGame = (sp, g) => isFav(sp, g.home.id) || isFav(sp, g.away.id);

export function gameCard(g, sp, i = 0) {
  const done = g.state === 'post', live = g.state === 'in';
  const row = (t) => `<div class="gc-team ${done && t.winner ? 'win' : ''} ${done && !t.winner ? 'lose' : ''}">
      ${avatar(t, 'sm')}<span class="gc-name">${esc(t.name)}${isFav(sp, t.id) ? ' <i class="fav-star">★</i>' : ''}${t.record ? `<small>${esc(t.record)}</small>` : ''}</span>
      ${done || live ? `<b class="gc-score">${esc(t.score)}${t.pen !== '' && t.pen != null ? `<small> (${esc(t.pen)})</small>` : ''}</b>` : ''}</div>`;
  return `<button class="game-card ${live ? 'is-live' : ''} ${isFavGame(sp, g) ? 'is-fav' : ''}" data-game="${g.id}" style="--i:${Math.min(i, 12)}">
    <div class="gc-top"><span class="gc-status ${live ? 'live' : done ? 'done' : ''}">${live ? '<i class="live-dot"></i> ' : ''}${esc(statusEs(g, sp))}${sp === 'futbol' && !done && !live ? ` · ${esc(fmtDay(g.ts))}` : ''}</span>${g.note ? `<span class="gc-note">${esc(g.note)}</span>` : ''}</div>
    ${row(g.away)}${row(g.home)}
  </button>`;
}

function openGame(g, sp, onRefresh) {
  if (!g) return;
  const done = g.state === 'post', live = g.state === 'in';
  const lines = Math.max(g.home.lines.length, g.away.lines.length);
  const unit = sp === 'mlb' ? 'Entrada' : 'Cuarto';
  const s = openSheet(`
    <div class="match-hero solo game-hero">
      <div class="mh-league">${SP[sp].emoji} ${SP[sp].name}${g.note ? ` · ${esc(g.note)}` : ''}</div>
      <div class="mh-row">
        <div class="mh-team">${avatar(g.away, 'lg')}<b>${esc(g.away.name)}</b><small>Visitante${g.away.record ? ` · ${esc(g.away.record)}` : ''}</small></div>
        <div class="mh-score">${done || live ? `<span>${esc(g.away.score)}</span><i>:</i><span>${esc(g.home.score)}</span>` : '<span class="vs-big">VS</span>'}</div>
        <div class="mh-team">${avatar(g.home, 'lg')}<b>${esc(g.home.name)}</b><small>Local${g.home.record ? ` · ${esc(g.home.record)}` : ''}</small></div>
      </div>
      <div class="mh-pill ${done ? 'done' : live ? 'live' : 'soon'}">${live ? '<i class="live-dot"></i> En vivo · ' : ''}${esc(done ? statusEs(g) : live ? statusEs(g) : 'Próximo partido')}</div>
      ${lines ? `<div class="linescore scroll-x"><table><thead><tr><th class="tl">${unit}</th>${Array.from({ length: lines }, (_, k) => `<th>${k + 1}</th>`).join('')}<th>T</th></tr></thead><tbody>
        ${[g.away, g.home].map((t) => `<tr><td class="tl">${esc(t.short || t.name)}</td>${Array.from({ length: lines }, (_, k) => `<td>${esc(t.lines[k] ?? '')}</td>`).join('')}<td><b>${esc(t.score)}</b></td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <div class="mh-info">
        <div><span>📅</span>${esc(fmtLong(g.ts))}</div>
        ${g.state === 'pre' && new Date(g.ts) > Date.now() ? `<div><span>⏳</span>Empieza en&nbsp;<b data-cd="${esc(g.ts)}"></b></div>` : ''}
        ${g.venue ? `<div><span>🏟️</span>${esc(g.venue)}${g.city ? `, ${esc(g.city)}` : ''}</div>` : ''}
        ${g.tv ? `<div><span>📺</span>${esc(g.tv)}</div>` : ''}
      </div>
      <div class="fav-row">${[g.away, g.home].map((t) => `<button class="btn sm ${isFav(sp, t.id) ? 'on' : ''}" data-fav="${esc(t.id)}">${isFav(sp, t.id) ? '★ Siguiendo' : '☆ Seguir'} ${esc(t.short || t.name)}</button>`).join('')}</div>
      ${done ? `<button class="btn primary block video-btn" data-open="${esc(ytSearch(`${g.away.name} vs ${g.home.name} highlights ${g.ts.slice(0, 10)}`))}">${ICONS.play} Ver resumen en YouTube</button>` : ''}
      ${live ? `<button class="btn block" data-refresh>${ICONS.refresh} Actualizar marcador</button>` : ''}
    </div>`);
  tickCountdowns(s.el);
  s.el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-open]');
    if (o) return openUrl(o.dataset.open);
    if (e.target.closest('[data-refresh]')) { s.close(); onRefresh?.(); return; }
    const f = e.target.closest('[data-fav]');
    if (f) {
      const team = [g.away, g.home].find((t) => t.id === f.dataset.fav);
      const on = await toggleFav(sp, team);
      f.classList.toggle('on', on);
      f.textContent = `${on ? '★ Siguiendo' : '☆ Seguir'} ${team.short || team.name}`;
      refreshCounts(sp);
    }
  });
}
function refreshCounts(sp) {
  const em = $('.tabs2 [data-v="equipos"] em', rootEl);
  if (em) em.textContent = favs(sp).length;
}

// --- tabla ---
async function drawStandings(v, sp, force = false) {
  v.innerHTML = loading('Cargando tabla…');
  try {
    const r = await sportStandings(sp, { force });
    if (!v.isConnected) return;
    v.innerHTML = r.data.length ? `${r.data.map((g) => `
      <section class="panel st-group"><h3>${esc(GROUP_ES[g.name] || g.name)}</h3>
      <table class="lg-table st-table"><thead><tr><th>#</th><th class="tl">Equipo</th><th>G</th><th>P</th><th>%</th><th>Dif.</th><th>Racha</th></tr></thead><tbody>
      ${g.rows.map((t, i) => `<tr data-team="${esc(t.id)}" class="${isFav(sp, t.id) ? 'is-fav' : ''} ${sp === 'nba' && i === 6 ? 'cut' : ''} ${sp === 'nba' && i === 10 ? 'cut2' : ''}" style="--i:${i}">
        <td><span class="rank r${i + 1}">${i + 1}</span></td>
        <td class="tl"><div class="tcell">${avatar(t, 'xs')}<span>${esc(t.name)}</span>${isFav(sp, t.id) ? '<i class="fav-star">★</i>' : ''}</div></td>
        <td>${esc(t.w)}</td><td>${esc(t.l)}</td><td>${esc(t.pct)}</td><td>${esc(t.gb || '-')}</td><td class="${/^W/.test(t.streak) ? 'up' : /^L/.test(t.streak) ? 'down' : ''}">${esc(streakEs(t.streak))}</td></tr>`).join('')}
      </tbody></table></section>`).join('')}
      ${sp === 'nba' ? '<p class="note">Los 6 primeros de cada conferencia van directo a playoffs; del 7 al 10 juegan el play-in.</p>' : '<p class="note">G: ganados · P: perdidos · Dif.: juegos detrás del líder.</p>'}
      <p class="muted small center">Toca un equipo para ver sus partidos y seguirlo.</p>${updated(r)}`
      : errorBox('La tabla aún no está disponible.');
    v.onclick = (e) => {
      const row = e.target.closest('[data-team]');
      if (!row) return;
      const t = r.data.flatMap((g) => g.rows).find((x) => x.id === row.dataset.team);
      if (t) openTeamSheet(sp, t, () => drawStandings(v, sp));
    };
  } catch { if (v.isConnected) v.innerHTML = errorBox(); }
}

// --- mis equipos ---
function drawFavTeams(v, sp) {
  const list = favs(sp);
  v.innerHTML = `
    <button class="add-big" id="add-fav"><span>＋</span><b>Seguir un equipo de la ${SP[sp].name}</b></button>
    <div class="fb-grid">${list.map((t, i) => `
      <button class="fb-tile" data-team="${esc(t.id)}" style="--i:${i}">
        ${avatar(t, 'md')}<b>${esc(t.name)}</b><small>${SP[sp].name}</small>
        <span class="fb-next" id="fv-${sp}-${esc(t.id)}"><span class="dots"><i></i><i></i><i></i></span></span>
      </button>`).join('')}</div>
    ${list.length ? '' : `<div class="empty small"><div class="empty-art"><span>${SP[sp].emoji}</span><span style="--i:1">⭐</span></div><h3>Sigue a tus equipos</h3><p class="muted">Sus partidos aparecerán primero y con una estrella.</p></div>`}`;
  $('#add-fav', v).onclick = () => openTeamPicker(sp, () => drawFavTeams(v, sp));
  v.onclick = (e) => {
    const b = e.target.closest('[data-team]');
    if (b) openTeamSheet(sp, list.find((t) => t.id === b.dataset.team), () => drawFavTeams(v, sp));
  };
  list.forEach(async (t) => {
    const el = $(`#fv-${sp}-${CSS.escape(t.id)}`, v);
    try {
      const r = await sportTeamSchedule(sp, t.id);
      if (!el?.isConnected) return;
      const n = r.data.upcoming[0], l = r.data.results[0];
      const rival = (g) => (g.home.id === t.id ? g.away : g.home);
      const mine = (g) => (g.home.id === t.id ? g.home : g.away);
      el.innerHTML = n ? `📅 vs ${esc(rival(n).short || rival(n).name)} · ${esc(fmtDay(n.ts))}`
        : l ? `${mine(l).winner ? '✅ Ganó' : '❌ Perdió'} ${esc(l.home.id === t.id ? `${l.home.score}-${l.away.score}` : `${l.away.score}-${l.home.score}`)} vs ${esc(rival(l).short || rival(l).name)}` : 'Sin partidos próximos';
    } catch { if (el?.isConnected) el.textContent = 'Toca para ver partidos'; }
  });
}

async function openTeamPicker(sp, onDone) {
  const s = openSheet(`<h3 class="sheet-title">Seguir equipo · ${SP[sp].name}</h3>
    <div class="searchbar in-sheet"><span class="ic">${ICONS.search}</span><input id="tp-q" type="search" placeholder="Filtrar por nombre" autocomplete="off"></div>
    <div id="tp-res">${loading('Cargando equipos…')}</div>`, { cls: 'tall', onClose: onDone });
  let teams = [];
  const draw = () => {
    const q = $('#tp-q', s.el).value.trim().toLowerCase();
    const l = teams.filter((t) => !q || t.name.toLowerCase().includes(q) || (t.short || '').toLowerCase().includes(q));
    $('#tp-res', s.el).innerHTML = `<ul class="team-results">${l.map((t, i) => `<li style="--i:${Math.min(i, 15)}">${avatar(t, 'sm')}<div class="grow"><b>${esc(t.name)}</b><small class="muted">${esc(t.group)} · ${esc(t.w)}-${esc(t.l)}</small></div>
      <button class="btn sm ${isFav(sp, t.id) ? '' : 'primary'}" data-fav="${esc(t.id)}">${isFav(sp, t.id) ? '★ Siguiendo' : 'Seguir'}</button></li>`).join('')}</ul>`;
  };
  try {
    const r = await sportStandings(sp);
    teams = r.data.flatMap((g) => g.rows.map((t) => ({ ...t, group: GROUP_ES[g.name] || g.name }))).sort((a, b) => a.name.localeCompare(b.name));
    if (!s.open) return;
    draw();
  } catch { $('#tp-res', s.el).innerHTML = errorBox(); }
  $('#tp-q', s.el).addEventListener('input', debounce(draw, 150));
  $('#tp-res', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    const t = teams.find((x) => x.id === b.dataset.fav);
    const on = await toggleFav(sp, t);
    b.classList.toggle('primary', !on);
    b.textContent = on ? '★ Siguiendo' : 'Seguir';
    refreshCounts(sp);
  });
}

function openTeamSheet(sp, t, onChange) {
  if (!t) return;
  const s = openSheet(`
    <div class="fb-hero" style="--c1:${t.color1 || SP[sp].c};--c2:${t.color2 || '#111'}">
      <div class="fb-hero-av">${avatar(t, 'xl')}</div>
      <h3>${esc(t.name)}</h3>
      <p class="muted small">${SP[sp].emoji} ${SP[sp].name}${t.w ? ` · ${esc(t.w)}-${esc(t.l)}` : ''}</p>
      <div class="fb-actions">
        <button class="btn sm ${isFav(sp, t.id) ? 'on' : 'primary'}" data-act="fav">${isFav(sp, t.id) ? '★ Siguiendo' : '☆ Seguir'}</button>
        <button class="btn sm" data-act="refresh">${ICONS.refresh} Actualizar</button>
      </div>
    </div>
    <div id="ts-body">${loading('Cargando partidos…')}</div>`, { cls: 'tall', onClose: onChange });
  const body = $('#ts-body', s.el);
  let all = [];
  const load = async (force = false) => {
    try {
      const r = await sportTeamSchedule(sp, t.id, { force });
      if (!s.open) return;
      all = [...r.data.upcoming, ...r.data.results];
      body.innerHTML = `<div class="mh-view">
        <section class="mh-sec"><h4>📅 Próximos partidos</h4>${r.data.upcoming.length ? `<div class="games">${r.data.upcoming.map((g, i) => gameCard(g, sp, i)).join('')}</div>` : '<p class="muted small">Sin partidos programados por ahora.</p>'}</section>
        <section class="mh-sec"><h4>🏁 Últimos resultados</h4>${r.data.results.length ? `<div class="games">${r.data.results.map((g, i) => gameCard(g, sp, i)).join('')}</div>` : '<p class="muted small">Sin resultados recientes.</p>'}</section>
        ${updated(r)}</div>`;
    } catch { if (s.open) body.innerHTML = errorBox(); }
  };
  load();
  body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-game]');
    if (c) openGame(all.find((g) => g.id === c.dataset.game), sp);
  });
  $('.fb-actions', s.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'refresh') { b.classList.add('spin'); await load(true); b.classList.remove('spin'); }
    if (b.dataset.act === 'fav') {
      if (isFav(sp, t.id) && !(await confirmDialog('¿Dejar de seguir este equipo?', `${t.name} se quitará de Mis equipos.`, { ok: 'Dejar de seguir', danger: true }))) return;
      const on = await toggleFav(sp, t);
      b.classList.toggle('on', on); b.classList.toggle('primary', !on);
      b.textContent = on ? '★ Siguiendo' : '☆ Seguir';
      refreshCounts(sp);
    }
  });
}

// ======================= FÓRMULA 1 =======================
const GP_ES = {
  Australian: 'Australia', Chinese: 'China', Japanese: 'Japón', Bahrain: 'Baréin', 'Saudi Arabian': 'Arabia Saudita', Miami: 'Miami',
  'Emilia Romagna': 'Emilia-Romaña', Monaco: 'Mónaco', Spanish: 'España', Canadian: 'Canadá', Austrian: 'Austria', British: 'Gran Bretaña',
  Belgian: 'Bélgica', Hungarian: 'Hungría', Dutch: 'Países Bajos', Italian: 'Italia', Azerbaijan: 'Azerbaiyán', Singapore: 'Singapur',
  'United States': 'Estados Unidos', 'Mexico City': 'Ciudad de México', Mexican: 'México', 'São Paulo': 'São Paulo', Brazilian: 'Brasil',
  'Las Vegas': 'Las Vegas', Qatar: 'Catar', 'Abu Dhabi': 'Abu Dabi', Madrid: 'Madrid', Portuguese: 'Portugal', French: 'Francia', German: 'Alemania', Turkish: 'Turquía',
};
// "United States Grand Prix" → "Gran Premio de Estados Unidos"
function gpName(name = '', short = false) {
  const m = name.match(/^(.*?) Grand Prix(.*)$/);
  if (!m) return name;
  const rest = m[2].replace(/^ in /, ' en ');
  return `${short ? 'GP' : 'Gran Premio'} de ${GP_ES[m[1]] || m[1]}${rest}`;
}
let f1View = 'calendario';
async function drawF1(body, force = false) {
  body.innerHTML = `<div id="f1-hero">${loading('Cargando la temporada…')}</div>
    <div class="tabs2 three" role="tablist">
      <button role="tab" class="${f1View === 'calendario' ? 'on' : ''}" data-v="calendario">🗓️ Calendario</button>
      <button role="tab" class="${f1View === 'pilotos' ? 'on' : ''}" data-v="pilotos">🧑‍✈️ Pilotos</button>
      <button role="tab" class="${f1View === 'equipos' ? 'on' : ''}" data-v="equipos">🏭 Equipos</button>
      <i class="tabs2-pill" style="--x:${['calendario', 'pilotos', 'equipos'].indexOf(f1View)}"></i>
    </div>
    <div id="f1-view"></div>
    ${attrHTML('jolpica')}`;
  $('.tabs2', body).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || b.dataset.v === f1View) return;
    f1View = b.dataset.v;
    $$('.tabs2 [data-v]', body).forEach((x) => x.classList.toggle('on', x === b));
    $('.tabs2-pill', body).style.setProperty('--x', ['calendario', 'pilotos', 'equipos'].indexOf(f1View));
    drawF1View(body, races);
  });
  let races = [];
  try {
    const r = await f1Season({ force });
    races = r.data;
    if (!body.isConnected) return;
    const now = Date.now();
    const next = races.find((x) => x.ts && new Date(x.ts).getTime() > now - 3 * 3600e3);
    const done = races.filter((x) => x.winner).length;
    const last = [...races].reverse().find((x) => x.winner);
    $('#f1-hero', body).innerHTML = next ? `
      <section class="f1-hero">
        <div class="f1-stripes"></div>
        <span class="f1-kicker">Ronda ${esc(next.round)} de ${races.length} · ${esc(next.season)}${next.sprint ? ' · Fin de semana sprint' : ''}</span>
        <h2>${esc(gpName(next.name))}</h2>
        <p class="muted small">📍 ${esc(next.circuit)} · ${esc(next.place)}</p>
        <div class="f1-cd"><small>La carrera empieza en</small><b data-cd="${esc(next.ts)}"></b></div>
        <ul class="f1-sessions">${next.sessions.map((x) => `<li class="${x.ts && new Date(x.ts) < now ? 'past' : ''} ${x.label === 'Carrera' ? 'race' : ''}"><span>${esc(x.label)}</span><b>${x.ts ? esc(fmtDay(x.ts)) + ' · ' + esc(fmtTime(x.ts)) : 'Por confirmar'}</b></li>`).join('')}</ul>
        <div class="f1-prog"><i style="width:${Math.round((done / races.length) * 100)}%"></i></div>
        <small class="muted">${done} de ${races.length} carreras disputadas${last ? ` · Última: 🏆 ${esc(last.winner.name)}` : ''}</small>
      </section>` : `<section class="f1-hero"><div class="f1-stripes"></div><h2>Temporada ${esc(races[0]?.season || '')} terminada</h2><p class="muted small">${last ? `Última carrera: 🏆 ${esc(last.winner.name)}` : ''}</p></section>`;
    tickCountdowns(body);
    drawF1View(body, races, r);
  } catch { if (body.isConnected) $('#f1-hero', body).innerHTML = errorBox(); }
}

async function drawF1View(body, races, meta) {
  const v = $('#f1-view', body);
  v.classList.remove('tab-in'); void v.offsetWidth; v.classList.add('tab-in');
  if (f1View === 'calendario') {
    const now = Date.now();
    const nextIdx = races.findIndex((x) => x.ts && new Date(x.ts).getTime() > now - 3 * 3600e3);
    v.innerHTML = `<ul class="f1-cal">${races.map((x, i) => {
      const past = x.winner || (x.ts && new Date(x.ts).getTime() < now - 3 * 3600e3);
      return `<li><button class="f1-race ${past ? 'past' : ''} ${i === nextIdx ? 'next' : ''}" data-round="${esc(x.round)}" style="--i:${Math.min(i, 14)}">
        <span class="f1-round">${esc(x.round)}</span>
        <span class="grow"><b>${esc(gpName(x.name, true))}</b><small>${esc(x.place)} · ${x.ts ? esc(fmtDay(x.ts)) : ''}</small></span>
        ${x.winner ? `<span class="f1-win">🏆 ${esc(x.winner.name.split(' ').slice(-1)[0])}</span>` : i === nextIdx ? '<span class="tag ok">Próxima</span>' : x.sprint ? '<span class="tag">Sprint</span>' : ''}
      </button></li>`;
    }).join('')}</ul>${meta ? updated(meta) : ''}`;
    v.onclick = (e) => {
      const b = e.target.closest('[data-round]');
      if (b) openRace(races.find((x) => x.round === b.dataset.round));
    };
    return;
  }
  v.innerHTML = loading('Cargando campeonato…');
  try {
    const r = await f1Standings();
    if (!v.isConnected) return;
    const list = f1View === 'pilotos' ? r.data.drivers : r.data.teams;
    const max = +(list[0]?.points || 1) || 1;
    const top = list.slice(0, 3);
    v.innerHTML = list.length ? `
      <div class="podium">${[1, 0, 2].filter((k) => top[k]).map((k) => `<div class="pd pd${k + 1}" style="--i:${k}"><span class="pd-medal">${['🥇', '🥈', '🥉'][k]}</span><b>${esc(f1View === 'pilotos' ? top[k].name.split(' ').slice(-1)[0] : top[k].name)}</b><small>${esc(top[k].points)} pts</small><i></i></div>`).join('')}</div>
      <ul class="f1-stand">${list.map((x, i) => `<li style="--i:${Math.min(i, 20)}"><span class="rank r${i + 1}">${esc(x.pos || i + 1)}</span>
        <span class="grow"><b>${esc(x.name)}</b>${x.team ? `<small>${esc(x.team)}</small>` : ''}<span class="f1-bar"><i style="width:${Math.max(2, (+x.points / max) * 100)}%"></i></span></span>
        <span class="f1-pts"><b>${esc(x.points)}</b><small>${+x.wins ? `${esc(x.wins)} ${+x.wins === 1 ? 'victoria' : 'victorias'}` : 'pts'}</small></span></li>`).join('')}</ul>
      <p class="muted xsmall center">Después de la ronda ${esc(r.data.round)} · ${r.offline ? 'Sin conexión · ' : ''}Actualizado ${relTime(r.cachedAt)}</p>`
      : errorBox('El campeonato aún no empieza.');
  } catch { if (v.isConnected) v.innerHTML = errorBox(); }
}

function openRace(x) {
  if (!x) return;
  const past = x.winner || (x.ts && new Date(x.ts) < Date.now());
  const kinds = [['results', 'Carrera'], ['qualifying', 'Clasificación'], ...(x.sprint ? [['sprint', 'Sprint']] : [])];
  let kind = 'results';
  const s = openSheet(`
    <div class="f1-hero in-sheet"><div class="f1-stripes"></div>
      <span class="f1-kicker">Ronda ${esc(x.round)} · ${esc(x.season)}</span>
      <h2>${esc(gpName(x.name))}</h2>
      <p class="muted small">📍 ${esc(x.circuit)} · ${esc(x.place)}</p>
      ${!past && x.ts ? `<div class="f1-cd"><small>Empieza en</small><b data-cd="${esc(x.ts)}"></b></div>` : ''}
      <ul class="f1-sessions">${x.sessions.map((k) => `<li class="${k.ts && new Date(k.ts) < Date.now() ? 'past' : ''} ${k.label === 'Carrera' ? 'race' : ''}"><span>${esc(k.label)}</span><b>${k.ts ? esc(fmtDay(k.ts)) + ' · ' + esc(fmtTime(k.ts)) : 'Por confirmar'}</b></li>`).join('')}</ul>
    </div>
    ${past ? `<div class="seg mh-tabs" id="rc-tabs">${kinds.map(([k, l], i) => `<button class="${i ? '' : 'on'}" data-k="${k}">${l}</button>`).join('')}</div><div id="rc-body">${loading()}</div>
      <button class="btn primary block video-btn" data-open="${esc(ytSearch(`F1 ${x.season} ${x.name} highlights`))}">${ICONS.play} Ver resumen en YouTube</button>` : ''}`, { cls: 'tall' });
  tickCountdowns(s.el);
  s.el.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) openUrl(o.dataset.open); });
  if (!past) return;
  const load = async () => {
    const box = $('#rc-body', s.el);
    box.innerHTML = loading();
    try {
      const list = await f1Results(x.season, x.round, kind);
      if (!s.open) return;
      box.innerHTML = list.length ? `<ul class="f1-stand result">${list.map((r, i) => `<li style="--i:${Math.min(i, 20)}" class="${i < 3 ? 'top' : ''}"><span class="rank r${i + 1}">${esc(r.pos)}</span>
        <span class="grow"><b>${esc(r.name)}${r.fastest ? ' <i class="tag fast">⏱ Vuelta rápida</i>' : ''}</b><small>${esc(r.team)}${kind !== 'qualifying' && r.grid ? ` · salió ${esc(r.grid)}.º` : ''}</small></span>
        <span class="f1-pts"><b>${esc(kind === 'qualifying' ? r.time : r.points ? `+${r.points}` : '')}</b><small>${esc(kind === 'qualifying' ? '' : statusF1(r.time))}</small></span></li>`).join('')}</ul>`
        : '<p class="muted small center pad">Los resultados aún no están disponibles.</p>';
    } catch { if (s.open) box.innerHTML = errorBox(); }
  };
  load();
  $('#rc-tabs', s.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    kind = b.dataset.k;
    $$('#rc-tabs button', s.el).forEach((k) => k.classList.toggle('on', k === b));
    load();
  });
}
const statusF1 = (t = '') => (/^\+?\d+ Laps?$/i.test(t) ? t.replace(/Laps?/i, 'vueltas').replace('1 vueltas', '1 vuelta') : t === 'Retired' || t === 'DNF' ? 'Abandonó' : t === 'Disqualified' ? 'Descalificado' : t === 'Did not start' ? 'No salió' : t === 'Lapped' ? 'Doblado' : t);

// ======================= UFC =======================
let ufcView = 'proximos';
async function drawUFC(body, force = false) {
  body.innerHTML = `<div id="ufc-hero">${loading('Cargando eventos…')}</div>
    <div class="tabs2" role="tablist">
      <button role="tab" class="${ufcView === 'proximos' ? 'on' : ''}" data-v="proximos">📅 Próximos</button>
      <button role="tab" class="${ufcView === 'resultados' ? 'on' : ''}" data-v="resultados">🏁 Resultados</button>
      <i class="tabs2-pill" style="--x:${ufcView === 'resultados' ? 1 : 0}"></i>
    </div>
    <div id="ufc-view"></div>
    ${attrHTML('espn')}`;
  let events = [], meta = null;
  const drawList = () => {
    const v = $('#ufc-view', body);
    v.classList.remove('tab-in'); void v.offsetWidth; v.classList.add('tab-in');
    const list = ufcView === 'proximos' ? events.filter((e) => e.state !== 'post') : events.filter((e) => e.state === 'post').reverse();
    v.innerHTML = list.length ? `<ul class="ufc-list">${list.map((e, i) => {
      const main = e.fights[0];
      const w = main?.fighters.find((f) => f.winner);
      return `<li><button class="ufc-ev ${e.state === 'in' ? 'is-live' : ''}" data-ev="${esc(e.id)}" style="--i:${Math.min(i, 14)}">
        <span class="ufc-date"><b>${new Date(e.ts).getDate()}</b><small>${esc(new Date(e.ts).toLocaleDateString('es', { month: 'short' }).replace('.', ''))}</small></span>
        <span class="grow"><b>${esc(e.name)}</b><small>${e.state === 'in' ? '<i class="live-dot"></i> En vivo · ' : ''}${esc(e.city || e.venue || '')} · ${e.fights.length} peleas</small>
          ${main && ufcView === 'resultados' && w ? `<small class="ufc-res">🏆 ${esc(w.name)}${main.method ? ` · ${esc(main.method)}` : ''}${main.round ? ` (R${esc(main.round)})` : ''}</small>` : ''}</span>
        <span class="ev-arrow">›</span></button></li>`;
    }).join('')}</ul>${meta ? updated(meta) : ''}` : `<p class="muted small center pad">${ufcView === 'proximos' ? 'No hay eventos anunciados por ahora.' : 'Aún no hay resultados este año.'}</p>`;
    v.onclick = (ev) => {
      const b = ev.target.closest('[data-ev]');
      if (b) openUFCEvent(events.find((e) => e.id === b.dataset.ev));
    };
  };
  $('.tabs2', body).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || b.dataset.v === ufcView) return;
    ufcView = b.dataset.v;
    $$('.tabs2 [data-v]', body).forEach((x) => x.classList.toggle('on', x === b));
    $('.tabs2-pill', body).style.setProperty('--x', ufcView === 'resultados' ? 1 : 0);
    drawList();
  });
  try {
    const r = await ufcEvents({ force });
    events = r.data; meta = r;
    if (!body.isConnected) return;
    const next = events.find((e) => e.state !== 'post');
    const main = next?.fights[0];
    $('#ufc-hero', body).innerHTML = next ? `
      <button class="ufc-hero" data-hero="${esc(next.id)}">
        <span class="ufc-kicker">${next.state === 'in' ? '<i class="live-dot"></i> En vivo ahora' : 'Próximo evento'}</span>
        <h2>${esc(next.name)}</h2>
        ${main && main.fighters.length === 2 ? `<div class="ufc-vs"><div><b>${esc(main.fighters[0].name)}</b><small>${esc(main.fighters[0].record)}${main.fighters[0].country ? ` · ${esc(main.fighters[0].country)}` : ''}</small></div><span>VS</span><div><b>${esc(main.fighters[1].name)}</b><small>${esc(main.fighters[1].record)}${main.fighters[1].country ? ` · ${esc(main.fighters[1].country)}` : ''}</small></div></div><p class="ufc-weight">${esc(weightEs(main.weight))} · ${main.rounds} asaltos</p>` : ''}
        <div class="f1-cd"><small>${next.state === 'in' ? 'Empezó' : 'Empieza en'}</small><b ${next.state === 'in' ? '' : `data-cd="${esc(next.ts)}"`}>${next.state === 'in' ? esc(fmtTime(next.ts)) : ''}</b></div>
        <small class="muted">📅 ${esc(fmtLong(next.ts))}${next.venue ? ` · 📍 ${esc(next.venue)}` : ''}</small>
      </button>` : '';
    $('[data-hero]', body)?.addEventListener('click', () => openUFCEvent(next));
    tickCountdowns(body);
    drawList();
  } catch { if (body.isConnected) $('#ufc-hero', body).innerHTML = errorBox(); }
}
const WEIGHTS = { Flyweight: 'Peso mosca', Bantamweight: 'Peso gallo', Featherweight: 'Peso pluma', Lightweight: 'Peso ligero', Welterweight: 'Peso wélter', Middleweight: 'Peso medio', 'Light Heavyweight': 'Peso semipesado', Heavyweight: 'Peso pesado', Strawweight: 'Peso paja', Catchweight: 'Peso pactado' };
const weightEs = (w = '') => { const women = /^W\s/.test(w); const base = w.replace(/^W\s/, '').replace(/^Women's\s/i, ''); return (WEIGHTS[base] || base) + (women || /^Women/i.test(w) ? ' femenino' : ''); };

function openUFCEvent(e) {
  if (!e) return;
  const done = e.state === 'post';
  const s = openSheet(`
    <div class="ufc-hero in-sheet">
      <span class="ufc-kicker">${done ? 'Resultados' : e.state === 'in' ? '<i class="live-dot"></i> En vivo' : 'Cartelera'}</span>
      <h2>${esc(e.name)}</h2>
      <small class="muted">📅 ${esc(fmtLong(e.ts))}</small>
      ${e.venue ? `<small class="muted">📍 ${esc(e.venue)}${e.city ? ` · ${esc(e.city)}` : ''}</small>` : ''}
      ${!done && e.state !== 'in' ? `<div class="f1-cd"><small>Empieza en</small><b data-cd="${esc(e.ts)}"></b></div>` : ''}
    </div>
    <ul class="fight-card">${e.fights.map((f, i) => `<li class="${i === 0 ? 'main' : ''}" style="--i:${Math.min(i, 14)}">
      <div class="fc-top"><span>${i === 0 ? '⭐ Pelea estelar · ' : ''}${esc(weightEs(f.weight))}</span>${f.done ? `<span class="fc-method">${esc(f.method || 'Final')}${f.round ? ` · R${esc(f.round)} ${esc(f.clock || '')}` : ''}</span>` : ''}</div>
      <div class="fc-row">${f.fighters.map((x, k) => `${k ? '<span class="fc-vs">vs</span>' : ''}<div class="fc-f ${f.done ? (x.winner ? 'win' : 'lose') : ''}"><b>${x.winner ? '✓ ' : ''}${esc(x.name)}</b><small>${esc(x.record)}${x.country ? ` · ${esc(x.country)}` : ''}</small></div>`).join('')}</div>
    </li>`).join('')}</ul>
    ${done ? `<button class="btn primary block video-btn" data-open="${esc(ytSearch(`${e.name} highlights`))}">${ICONS.play} Ver resumen en YouTube</button>` : ''}`, { cls: 'tall' });
  tickCountdowns(s.el);
  s.el.addEventListener('click', (ev) => { const o = ev.target.closest('[data-open]'); if (o) openUrl(o.dataset.open); });
}
