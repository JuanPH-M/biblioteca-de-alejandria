// APIs gratuitas y sin clave: AniList (GraphQL), TVmaze, Wikipedia y TheSportsDB.
import { cacheGet, cacheSet } from './db.js';

const GENRES_ES = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama', Ecchi: 'Ecchi', Fantasy: 'Fantasía',
  Horror: 'Terror', 'Mahou Shoujo': 'Mahō shōjo', Mecha: 'Mecha', Music: 'Música', Mystery: 'Misterio',
  Psychological: 'Psicológico', Romance: 'Romance', 'Sci-Fi': 'Ciencia ficción', 'Slice of Life': 'Vida cotidiana',
  Sports: 'Deportes', Supernatural: 'Sobrenatural', Thriller: 'Suspenso', 'Science-Fiction': 'Ciencia ficción',
  Crime: 'Crimen', Family: 'Familia', History: 'Historia', War: 'Bélico', Western: 'Western', Children: 'Infantil',
  Anime: 'Anime', Medical: 'Médico', Legal: 'Legal', Espionage: 'Espionaje', Food: 'Cocina', Nature: 'Naturaleza',
  Travel: 'Viajes', Military: 'Militar', Hentai: 'Adulto', Animation: 'Animación', Documentary: 'Documental',
};
export const genreEs = (g) => GENRES_ES[g] || g;

const PUB_STATUS = {
  FINISHED: 'Finalizado', RELEASING: 'En publicación', NOT_YET_RELEASED: 'Próximamente', CANCELLED: 'Cancelado', HIATUS: 'En pausa',
  Ended: 'Finalizada', Running: 'En emisión', 'To Be Determined': 'Por definir', 'In Development': 'En desarrollo',
  'Returning Series': 'Renovada', Released: 'Estrenada', 'Post Production': 'Postproducción', Canceled: 'Cancelada', Planned: 'Planeada',
};
export const pubStatusEs = (s) => PUB_STATUS[s] || s || '';

const stripHtml = (s = '') => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

async function fetchJSON(url, opts = {}, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ---------- AniList ----------
const ANILIST_Q = `query($s:String,$t:MediaType){Page(perPage:10){media(search:$s,type:$t,sort:SEARCH_MATCH){
  id title{romaji english native userPreferred} synonyms coverImage{large extraLarge color} description(asHtml:false)
  genres status chapters episodes countryOfOrigin format siteUrl seasonYear startDate{year}}}}`;

export async function searchAniList(query, type) {
  const mediaType = type === 'anime' ? 'ANIME' : 'MANGA';
  const data = await fetchJSON('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_Q, variables: { s: query, t: mediaType } }),
  });
  let list = data?.data?.Page?.media || [];
  // Manhwa = origen coreano; Manga = japonés. Se ordenan primero los que coinciden.
  if (type === 'manhwa') list = [...list].sort((a, b) => (b.countryOfOrigin === 'KR') - (a.countryOfOrigin === 'KR'));
  if (type === 'manga') list = [...list].sort((a, b) => (b.countryOfOrigin === 'JP') - (a.countryOfOrigin === 'JP'));
  return list.map((m) => ({
    source: 'anilist',
    sourceId: m.id,
    sourceUrl: m.siteUrl,
    title: m.title.english || m.title.romaji || m.title.userPreferred,
    altTitles: [m.title.romaji, m.title.english, m.title.native, ...(m.synonyms || [])].filter(Boolean),
    cover: m.coverImage?.extraLarge || m.coverImage?.large || '',
    color: m.coverImage?.color || null,
    synopsis: stripHtml(m.description || ''),
    genres: (m.genres || []).map(genreEs),
    pubStatus: pubStatusEs(m.status),
    total: type === 'anime' ? m.episodes : m.chapters,
    year: m.seasonYear || m.startDate?.year || null,
    extra: [m.countryOfOrigin === 'KR' ? 'Corea' : m.countryOfOrigin === 'CN' ? 'China' : m.countryOfOrigin === 'JP' ? 'Japón' : m.countryOfOrigin, m.format].filter(Boolean).join(' · '),
  }));
}

// ---------- TVmaze ----------
export async function searchTVmaze(query) {
  const data = await fetchJSON('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(query));
  return data.map(({ show: s }) => ({
    source: 'tvmaze',
    sourceId: s.id,
    sourceUrl: s.url,
    title: s.name,
    altTitles: [],
    cover: s.image?.medium || s.image?.original || '',
    synopsis: stripHtml(s.summary || ''),
    genres: (s.genres || []).map(genreEs),
    pubStatus: pubStatusEs(s.status),
    total: null,
    year: s.premiered ? +s.premiered.slice(0, 4) : null,
    extra: [s.network?.name || s.webChannel?.name, s.language].filter(Boolean).join(' · '),
  }));
}

// Temporadas de una serie de TVmaze: [{ n, eps }] (solo las que tienen episodios anunciados)
export async function tvmazeSeasons(showId) {
  const data = await fetchJSON(`https://api.tvmaze.com/shows/${showId}/seasons`);
  return data.filter((s) => s.episodeOrder > 0).map((s) => ({ n: s.number, eps: s.episodeOrder }));
}

// ---------- Wikipedia (gratis, sin clave) ----------
// Nombre y sinopsis desde Wikipedia en español; el póster desde Wikipedia en inglés,
// que es donde suelen estar los pósters de películas y series.
const wikiApi = (lang, params) => {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  Object.entries({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  // Wikimedia pide identificar la app con este encabezado
  return fetchJSON(url.href, { headers: { 'Api-User-Agent': 'BibliotecaDeAlejandria/1.1 (https://github.com/JuanPH-M/biblioteca-de-alejandria)' } });
};
const portrait = (t) => t && t.height > t.width * 1.15;

export async function searchWikipedia(query, type) {
  const hint = type === 'pelicula' ? 'película' : 'serie de televisión';
  const d = await wikiApi('es', {
    generator: 'search', gsrsearch: `${query} ${hint}`, gsrlimit: '10',
    prop: 'pageimages|extracts|langlinks|pageprops|info', inprop: 'url',
    exintro: '1', explaintext: '1', exsentences: '5', exlimit: 'max',
    piprop: 'thumbnail', pithumbsize: '500', lllang: 'en', lllimit: 'max', ppprop: 'disambiguation',
  });
  const isKind = type === 'pelicula' ? /pel[ií]cula|film/i : /serie|programa de televisi|miniserie|telenovela/i;
  let pages = (d?.query?.pages || []).filter((p) => !p.pageprops || !('disambiguation' in p.pageprops));
  pages.sort((a, b) => a.index - b.index);
  const matching = pages.filter((p) => isKind.test((p.extract || '').slice(0, 300)));
  pages = (matching.length ? matching : pages).slice(0, 6);
  // pósters desde Wikipedia en inglés (en español casi no hay pósters)
  const enTitles = pages.map((p) => p.langlinks?.[0]?.title).filter(Boolean);
  const enThumbs = {};
  if (enTitles.length) {
    try {
      const en = await wikiApi('en', { titles: enTitles.join('|'), prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '500', pilicense: 'any', redirects: '1' });
      const redirects = Object.fromEntries((en?.query?.redirects || []).map((r) => [r.to, r.from]));
      for (const p of en?.query?.pages || []) if (p.thumbnail) enThumbs[redirects[p.title] || p.title] = p.thumbnail;
    } catch { /* sin póster en inglés */ }
  }
  return pages.map((p) => {
    const en = enThumbs[p.langlinks?.[0]?.title];
    const es = p.thumbnail;
    const thumb = portrait(en) ? en : portrait(es) ? es : en || es;
    const extract = (p.extract || '').trim();
    const enTitle = p.langlinks?.[0]?.title || '';
    const year = extract.match(/(?:pel[ií]cula|serie)[^.]{0,160}?\b((?:19|20)\d{2})\b/i)?.[1] || enTitle.match(/\b((?:19|20)\d{2})\b/)?.[1] || extract.match(/\b((?:19|20)\d{2})\b/)?.[1];
    return {
      source: 'wikipedia',
      sourceId: p.pageid,
      sourceUrl: p.fullurl || `https://es.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      title: p.title.replace(/\s*\((pel[ií]cula|serie de televisi[oó]n|serie|miniserie|película de \d{4}|\d{4})\)$/i, ''),
      altTitles: [p.langlinks?.[0]?.title?.replace(/\s*\((film|TV series|miniseries|\d{4} film)\)$/i, '')].filter(Boolean),
      cover: thumb?.source ? thumb.source.replace(/\?utm_[^#]*$/, '') : '',
      synopsis: extract,
      genres: [],
      pubStatus: '',
      total: null,
      year: year ? +year : null,
      extra: 'Wikipedia',
    };
  });
}

// Búsqueda combinada según el tipo de obra
export async function searchInfo(query, type) {
  const q = query.trim();
  if (q.length < 2) return [];
  if (['manhwa', 'manga', 'anime'].includes(type)) return searchAniList(q, type);
  if (type === 'serie') {
    const [tv, wk] = await Promise.allSettled([searchTVmaze(q), searchWikipedia(q, 'serie')]);
    return [...(tv.value || []).slice(0, 6), ...(wk.value || []).slice(0, 3)];
  }
  if (type === 'pelicula') {
    const [wk, an] = await Promise.allSettled([searchWikipedia(q, 'pelicula'), searchAniList(q, 'anime')]);
    return [...(wk.value || []), ...(an.value || []).filter((m) => /MOVIE/.test(m.extra)).slice(0, 2)];
  }
  return [];
}

export const ATTRIBUTION = {
  anilist: { name: 'AniList', url: 'https://anilist.co', text: 'Datos e imágenes de AniList' },
  tvmaze: { name: 'TVmaze', url: 'https://www.tvmaze.com', text: 'Datos de TVmaze (CC BY-SA 4.0)' },
  wikipedia: { name: 'Wikipedia', url: 'https://es.wikipedia.org', text: 'Textos de Wikipedia (CC BY-SA 4.0)' },
  thesportsdb: { name: 'TheSportsDB', url: 'https://www.thesportsdb.com', text: 'Datos de fútbol de TheSportsDB' },
};

// ---------- TheSportsDB (clave pública gratuita "123") ----------
const SDB = 'https://www.thesportsdb.com/api/v1/json/123';

export async function searchTeams(query) {
  const d = await fetchJSON(`${SDB}/searchteams.php?t=${encodeURIComponent(query.trim())}`);
  return (d.teams || []).filter((t) => t.strSport === 'Soccer').map(teamFromApi);
}
export function teamFromApi(t) {
  return {
    id: t.idTeam,
    name: t.strTeam,
    short: t.strTeamShort || '',
    alt: t.strTeamAlternate || '',
    league: t.strLeague || '',
    leagueId: t.idLeague || '',
    country: t.strCountry || '',
    stadium: t.strStadium || '',
    founded: t.intFormedYear || '',
    color1: t.strColour1 || '',
    color2: t.strColour2 || '',
  };
}

const evFromApi = (e) => ({
  id: e.idEvent,
  home: e.strHomeTeam, away: e.strAwayTeam, homeId: e.idHomeTeam, awayId: e.idAwayTeam,
  hs: e.intHomeScore, as: e.intAwayScore,
  league: e.strLeague, leagueId: e.idLeague, season: e.strSeason, round: e.intRound,
  ts: e.strTimestamp ? e.strTimestamp + (e.strTimestamp.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(e.strTimestamp) ? '' : 'Z') : (e.dateEvent ? e.dateEvent + 'T' + (e.strTime || '00:00:00') + 'Z' : null),
  status: e.strStatus || '', venue: e.strVenue || '',
});

// La clave gratuita devuelve 1 partido próximo y 1 último; se completa con las jornadas vecinas de la liga.
export async function teamFixtures(team, { force = false } = {}) {
  const key = 'fx:' + team.id;
  const cached = await cacheGet(key, 60 * 60 * 1000);
  if (cached && cached.fresh && !force) return { ...cached.data, cachedAt: cached.t };
  try {
    const [nx, ls] = await Promise.all([
      fetchJSON(`${SDB}/eventsnext.php?id=${team.id}`).catch(() => ({})),
      fetchJSON(`${SDB}/eventslast.php?id=${team.id}`).catch(() => ({})),
    ]);
    const next = (nx.events || []).map(evFromApi);
    const last = (ls.results || []).map(evFromApi);
    const mine = (e) => e.homeId === team.id || e.awayId === team.id;
    const asked = new Set();
    const rounds = async (ev, deltas) => {
      if (!ev || !ev.round || !ev.leagueId || !ev.season) return [];
      const r = parseInt(ev.round, 10);
      const urls = deltas.map((d) => r + d).filter((n) => n > 0 && n < 60)
        .map((n) => `${SDB}/eventsround.php?id=${ev.leagueId}&r=${n}&s=${ev.season}`)
        .filter((u) => !asked.has(u) && asked.add(u));
      const res = await Promise.all(urls.map((u) => fetchJSON(u).catch(() => ({}))));
      return res.flatMap((x) => (x.events || []).map(evFromApi)).filter(mine);
    };
    // jornadas vecinas del próximo partido y del último (cubre liga y copa)
    const [moreNext, moreLast, leagueNext] = await Promise.all([rounds(next[0], [1, 2]), rounds(last[0], [-1, -2]), next[0]?.leagueId !== last[0]?.leagueId ? rounds(last[0], [1, 2]) : []]);
    moreNext.push(...leagueNext);
    const now = Date.now();
    const uniq = (arr) => [...new Map(arr.map((e) => [e.id, e])).values()];
    const upcoming = uniq([...next, ...moreNext]).filter((e) => !e.ts || new Date(e.ts).getTime() > now - 3 * 3600e3).sort((a, b) => (a.ts || '').localeCompare(b.ts || '')).slice(0, 4);
    const results = uniq([...last, ...moreLast]).filter((e) => e.hs != null && e.hs !== '').sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 4);
    const data = { upcoming, results };
    await cacheSet(key, data);
    return { ...data, cachedAt: Date.now() };
  } catch (err) {
    if (cached) return { ...cached.data, cachedAt: cached.t, offline: true };
    throw err;
  }
}

// ---------- Ligas y detalle de partidos (TheSportsDB) ----------
// Ligas populares (IDs de TheSportsDB). Los colores son propios, no logos.
export const POPULAR_LEAGUES = [
  { id: '4480', name: 'Champions League', country: 'Europa', flag: '🇪🇺', c1: '#1e3a8a', c2: '#60a5fa' },
  { id: '4328', name: 'Premier League', country: 'Inglaterra', flag: '🏴', c1: '#581c87', c2: '#22d3ee' },
  { id: '4335', name: 'La Liga', country: 'España', flag: '🇪🇸', c1: '#b91c1c', c2: '#facc15' },
  { id: '4332', name: 'Serie A', country: 'Italia', flag: '🇮🇹', c1: '#065f46', c2: '#38bdf8' },
  { id: '4331', name: 'Bundesliga', country: 'Alemania', flag: '🇩🇪', c1: '#991b1b', c2: '#f97316' },
  { id: '4334', name: 'Ligue 1', country: 'Francia', flag: '🇫🇷', c1: '#1e293b', c2: '#a3e635' },
  { id: '4497', name: 'Liga BetPlay', country: 'Colombia', flag: '🇨🇴', c1: '#ca8a04', c2: '#2563eb' },
  { id: '4951', name: 'Torneo BetPlay (Primera B)', country: 'Colombia', flag: '🇨🇴', c1: '#1d4ed8', c2: '#dc2626' },
  { id: '5183', name: 'Copa Colombia', country: 'Colombia', flag: '🇨🇴', c1: '#b45309', c2: '#facc15' },
  { id: '4481', name: 'Europa League', country: 'Europa', flag: '🇪🇺', c1: '#c2410c', c2: '#fbbf24' },
  { id: '5071', name: 'Conference League', country: 'Europa', flag: '🇪🇺', c1: '#166534', c2: '#4ade80' },
  { id: '4351', name: 'Brasileirão', country: 'Brasil', flag: '🇧🇷', c1: '#15803d', c2: '#facc15' },
  { id: '4406', name: 'Liga Profesional', country: 'Argentina', flag: '🇦🇷', c1: '#0369a1', c2: '#7dd3fc' },
  { id: '4501', name: 'Copa Libertadores', country: 'Sudamérica', flag: '🌎', c1: '#78350f', c2: '#fbbf24' },
  { id: '4724', name: 'Copa Sudamericana', country: 'Sudamérica', flag: '🌎', c1: '#1e40af', c2: '#f87171' },
  { id: '4429', name: 'Mundial', country: 'FIFA', flag: '🌍', c1: '#7f1d1d', c2: '#fcd34d' },
  { id: '4482', name: 'FA Cup', country: 'Inglaterra', flag: '🏴', c1: '#1e3a8a', c2: '#f87171' },
  { id: '4483', name: 'Copa del Rey', country: 'España', flag: '🇪🇸', c1: '#7c2d12', c2: '#fde047' },
];

const COUNTRY_EN = {
  espana: 'Spain', inglaterra: 'England', alemania: 'Germany', francia: 'France', italia: 'Italy', brasil: 'Brazil',
  mexico: 'Mexico', estadosunidos: 'USA', eeuu: 'USA', paisesbajos: 'Netherlands', holanda: 'Netherlands', peru: 'Peru',
  escocia: 'Scotland', belgica: 'Belgium', turquia: 'Turkey', japon: 'Japan', arabiasaudita: 'Saudi Arabia', gales: 'Wales',
  suiza: 'Switzerland', grecia: 'Greece', rusia: 'Russia', ucrania: 'Ukraine', dinamarca: 'Denmark', suecia: 'Sweden',
  noruega: 'Norway', polonia: 'Poland', austria: 'Austria', croacia: 'Croatia', europa: 'Europe', mundo: 'World',
};
const normC = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

export function leagueFromApi(l) {
  return { id: l.idLeague, name: l.strLeague, alt: l.strLeagueAlternate || '', country: l.strCountry || '', season: l.strCurrentSeason || '' };
}
export async function searchLeagues(country) {
  const c = COUNTRY_EN[normC(country)] || country.trim();
  const d = await fetchJSON(`${SDB}/search_all_leagues.php?c=${encodeURIComponent(c)}&s=Soccer`);
  return (d.countries || d.countrys || []).filter((l) => !l.strSport || l.strSport === 'Soccer').map(leagueFromApi);
}

// Próxima jornada, últimos resultados y tabla de una liga
export async function leagueOverview(lg, { force = false } = {}) {
  const key = 'lg:' + lg.id;
  const cached = await cacheGet(key, 60 * 60 * 1000);
  if (cached && cached.fresh && !force) return { ...cached.data, cachedAt: cached.t };
  try {
    const [past, next] = await Promise.all([
      fetchJSON(`${SDB}/eventspastleague.php?id=${lg.id}`).catch(() => ({})),
      fetchJSON(`${SDB}/eventsnextleague.php?id=${lg.id}`).catch(() => ({})),
    ]);
    const pe = (past.events || []).map(evFromApi)[0];
    const ne = (next.events || []).map(evFromApi)[0];
    const season = ne?.season || pe?.season || lg.season;
    const roundOf = (ev) => (ev?.round && ev.round !== '0' ? ev.round : null);
    const rounds = [...new Set([roundOf(pe), roundOf(ne)].filter(Boolean))];
    const roundEvents = (await Promise.all(rounds.map((r) => fetchJSON(`${SDB}/eventsround.php?id=${lg.id}&r=${r}&s=${season}`).catch(() => ({})))))
      .flatMap((x) => (x.events || []).map(evFromApi));
    const all = [...new Map([...roundEvents, pe, ne].filter(Boolean).map((e) => [e.id, e])).values()];
    const played = (e) => e.hs != null && e.hs !== '';
    const results = all.filter(played).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const upcoming = all.filter((e) => !played(e)).sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    let table = [];
    try {
      const t = await fetchJSON(`${SDB}/lookuptable.php?l=${lg.id}&s=${season}`);
      table = (t.table || []).map((r) => ({ rank: +r.intRank, team: r.strTeam, teamId: r.idTeam, played: +r.intPlayed, w: +r.intWin, d: +r.intDraw, l: +r.intLoss, gd: +r.intGoalDifference, pts: +r.intPoints, form: r.strForm || '', group: r.strGroup || '' }));
    } catch { /* tabla no disponible */ }
    const data = { results, upcoming, table, season, round: roundOf(ne) || roundOf(pe) };
    await cacheSet(key, data);
    return { ...data, cachedAt: Date.now() };
  } catch (err) {
    if (cached) return { ...cached.data, cachedAt: cached.t, offline: true };
    throw err;
  }
}

// Datos básicos de un partido (estadio, ciudad y video del resumen si existe)
export async function matchInfo(id) {
  const key = 'mi:' + id;
  const cached = await cacheGet(key, 6 * 60 * 60 * 1000);
  if (cached && cached.fresh) return cached.data;
  try {
    const ev = await fetchJSON(`${SDB}/lookupevent.php?id=${id}`);
    const e = (ev.events || [])[0] || {};
    const data = {
      venue: e.strVenue || '', city: e.strCity || '',
      video: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(e.strVideo || '') ? e.strVideo : '',
    };
    await cacheSet(key, data);
    return data;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}

// ======================= OTROS DEPORTES =======================
// NBA, MLB y UFC: datos públicos de ESPN (sin clave). F1: Jolpica (continuación abierta de Ergast).
// Solo se usan textos y números; nunca logos ni imágenes de equipos o ligas.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN2 = 'https://site.api.espn.com/apis/v2/sports';
const F1API = 'https://api.jolpi.ca/ergast/f1';
export const SPORT_PATHS = { nba: 'basketball/nba', mlb: 'baseball/mlb', ufc: 'mma/ufc' };
ATTRIBUTION.espn = { name: 'ESPN', url: 'https://www.espn.com', text: 'Resultados y calendarios con datos públicos de ESPN' };
ATTRIBUTION.jolpica = { name: 'Jolpica F1', url: 'https://github.com/jolpica/jolpica-f1', text: 'Datos de Fórmula 1 de Jolpica (Ergast)' };

// Guarda en caché y, si no hay conexión, devuelve lo último que se descargó
async function cached(key, maxAge, fn, force = false) {
  const c = await cacheGet(key, maxAge);
  if (c && c.fresh && !force) return { data: c.data, cachedAt: c.t };
  try {
    const data = await fn();
    await cacheSet(key, data);
    return { data, cachedAt: Date.now() };
  } catch (err) {
    if (c) return { data: c.data, cachedAt: c.t, offline: true };
    throw err;
  }
}
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const hexOk = (c) => (/^[0-9a-f]{6}$/i.test(c || '') ? '#' + c : '');

function espnGame(e) {
  const c = e.competitions?.[0] || {};
  const side = (ha) => {
    const x = (c.competitors || []).find((k) => k.homeAway === ha) || {};
    const t = x.team || {};
    const sc = typeof x.score === 'object' ? x.score?.displayValue : x.score;
    return {
      id: t.id, name: t.displayName || t.name || '?', short: t.abbreviation || '', color1: hexOk(t.color), color2: hexOk(t.alternateColor),
      score: sc ?? '', winner: !!x.winner, record: x.records?.[0]?.summary || x.record?.[0]?.displayValue || '',
      lines: (x.linescores || []).map((l) => l.displayValue ?? l.value),
    };
  };
  const st = e.status?.type || c.status?.type || {};
  return {
    id: e.id, ts: e.date, state: st.state || 'pre', detail: st.shortDetail || st.detail || '', completed: !!st.completed,
    home: side('home'), away: side('away'),
    venue: c.venue?.fullName || '', city: [c.venue?.address?.city, c.venue?.address?.state].filter(Boolean).join(', '),
    note: (c.notes || []).map((n) => n.headline).filter(Boolean).join(' · ') || c.series?.summary || '',
    tv: [...new Set((c.broadcasts || []).flatMap((b) => b.names || []))].join(', '),
  };
}

// Partidos de un día (NBA o MLB). Los días ya jugados se guardan más tiempo.
export async function sportDay(sport, date, { force = false } = {}) {
  const d = ymd(date);
  const past = date < new Date(Date.now() - 36 * 3600e3);
  return cached(`sd:${sport}:${d}`, past ? 7 * 864e5 : 5 * 60e3, async () => {
    const j = await fetchJSON(`${ESPN}/${SPORT_PATHS[sport]}/scoreboard?dates=${d}`);
    return (j.events || []).map(espnGame).sort((a, b) => a.ts.localeCompare(b.ts));
  }, force);
}

// Tabla por conferencia / liga
export async function sportStandings(sport, { force = false } = {}) {
  return cached('ss:' + sport, 3 * 3600e3, async () => {
    const j = await fetchJSON(`${ESPN2}/${SPORT_PATHS[sport]}/standings`);
    return (j.children || []).map((g) => {
      const rows = (g.standings?.entries || []).map((en) => {
        const s = Object.fromEntries((en.stats || []).map((x) => [x.name, x]));
        const v = (k) => s[k]?.displayValue ?? '';
        return {
          id: en.team?.id, name: en.team?.displayName || '', short: en.team?.abbreviation || '', color1: hexOk(en.team?.color), color2: hexOk(en.team?.alternateColor),
          w: v('wins'), l: v('losses'), pct: v('winPercent'), gb: v('gamesBehind'), streak: v('streak'), seed: +(s.playoffSeed?.value || 0), wp: +(s.winPercent?.value || 0),
        };
      });
      rows.sort((a, b) => (a.seed && b.seed ? a.seed - b.seed : b.wp - a.wp));
      return { name: g.name, rows };
    });
  }, force);
}

// Partidos de un equipo (próximos y últimos)
export async function sportTeamSchedule(sport, teamId, { force = false } = {}) {
  return cached(`st:${sport}:${teamId}`, 30 * 60e3, async () => {
    const base = `${ESPN}/${SPORT_PATHS[sport]}/teams/${teamId}/schedule`;
    const [a, b] = await Promise.all([fetchJSON(base), fetchJSON(base + '?seasontype=3').catch(() => ({}))]);
    const ev = [...(a.events || []), ...(b.events || [])].map(espnGame);
    const uniq = [...new Map(ev.map((e) => [e.id, e])).values()];
    return {
      upcoming: uniq.filter((e) => e.state !== 'post').sort((x, y) => x.ts.localeCompare(y.ts)).slice(0, 5),
      results: uniq.filter((e) => e.state === 'post').sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, 5),
    };
  }, force);
}

// ---------- UFC ----------
const UFC_METHOD = { Kotko: 'KO/TKO', 'KO/TKO': 'KO/TKO', Submission: 'Sumisión', Decision: 'Decisión', 'Unanimous Decision': 'Decisión unánime', 'Split Decision': 'Decisión dividida', 'Majority Decision': 'Decisión mayoritaria', DQ: 'Descalificación', 'No Contest': 'Sin resultado', Draw: 'Empate' };
function ufcFight(c) {
  const f = [...(c.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((x) => ({
    name: x.athlete?.displayName || '?', country: x.athlete?.flag?.alt || '', record: x.records?.[0]?.summary || '', winner: !!x.winner,
  }));
  const raw = (c.details || []).map((d) => d.type?.text || '').find((t) => /winner/i.test(t)) || '';
  const m = raw.replace(/^.*winner\s*/i, '').trim();
  const done = c.status?.type?.state === 'post';
  return {
    weight: c.type?.abbreviation || '', fighters: f, done,
    method: UFC_METHOD[m] || m, round: done ? c.status?.period : null, clock: done ? c.status?.displayClock : '',
    ts: c.date, rounds: c.format?.regulation?.periods || 3,
  };
}
export async function ufcEvents({ force = false } = {}) {
  const y = new Date().getFullYear();
  const years = new Date().getMonth() >= 10 ? [y, y + 1] : [y];
  return cached('ufc:' + years.join(','), 30 * 60e3, async () => {
    const res = await Promise.all(years.map((yy) => fetchJSON(`${ESPN}/mma/ufc/scoreboard?dates=${yy}`).catch(() => ({}))));
    if (!res.some((j) => j.events)) throw new Error('sin datos');
    const ev = res.flatMap((j) => j.events || []).map((e) => {
      const c0 = e.competitions?.[0] || {};
      // la pelea estelar es la última de la cartelera: se pone primero
      const fights = (e.competitions || []).map(ufcFight).reverse();
      return {
        id: e.id, name: e.name, ts: e.date, state: e.status?.type?.state || 'pre',
        venue: c0.venue?.fullName || '', city: [c0.venue?.address?.city, c0.venue?.address?.state, c0.venue?.address?.country].filter(Boolean).join(', '),
        fights,
      };
    });
    return [...new Map(ev.map((e) => [e.id, e])).values()].sort((a, b) => a.ts.localeCompare(b.ts));
  }, force);
}

// ---------- Fórmula 1 ----------
const SESSIONS = { FirstPractice: 'Práctica 1', SecondPractice: 'Práctica 2', ThirdPractice: 'Práctica 3', SprintQualifying: 'Clasificación sprint', SprintShootout: 'Clasificación sprint', Sprint: 'Sprint', Qualifying: 'Clasificación' };
const tsOf = (o) => (o?.date ? `${o.date}T${o.time || '00:00:00Z'}` : null);
export async function f1Season({ force = false } = {}) {
  return cached('f1:season', 6 * 3600e3, async () => {
    const [cal, wins] = await Promise.all([
      fetchJSON(`${F1API}/current.json`),
      fetchJSON(`${F1API}/current/results/1.json?limit=40`).catch(() => ({})),
    ]);
    const winners = Object.fromEntries((wins.MRData?.RaceTable?.Races || []).map((r) => [r.round, r.Results?.[0]]));
    return (cal.MRData?.RaceTable?.Races || []).map((r) => {
      const w = winners[r.round];
      return {
        season: r.season, round: r.round, name: r.raceName, circuit: r.Circuit?.circuitName || '',
        place: [r.Circuit?.Location?.locality, r.Circuit?.Location?.country].filter(Boolean).join(', '),
        country: r.Circuit?.Location?.country || '', ts: tsOf(r), sprint: !!r.Sprint,
        sessions: [...Object.entries(SESSIONS).filter(([k]) => r[k]).map(([k, label]) => ({ label, ts: tsOf(r[k]) })), { label: 'Carrera', ts: tsOf(r) }].sort((a, b) => (a.ts || '').localeCompare(b.ts || '')),
        winner: w ? { name: `${w.Driver.givenName} ${w.Driver.familyName}`, team: w.Constructor?.name || '' } : null,
      };
    });
  }, force);
}
// kind: results | qualifying | sprint
export async function f1Results(season, round, kind = 'results') {
  return (await cached(`f1:${kind}:${season}:${round}`, 7 * 864e5, async () => {
    const j = await fetchJSON(`${F1API}/${season}/${round}/${kind}.json?limit=40`);
    const race = j.MRData?.RaceTable?.Races?.[0];
    const list = race?.Results || race?.QualifyingResults || race?.SprintResults || [];
    return list.map((x) => ({
      pos: x.positionText || x.position, name: `${x.Driver.givenName} ${x.Driver.familyName}`, code: x.Driver.code || '',
      team: x.Constructor?.name || '', points: x.points || '', grid: x.grid || '',
      time: x.Time?.time || x.Q3 || x.Q2 || x.Q1 || x.status || '', fastest: x.FastestLap?.rank === '1',
    }));
  })).data;
}
export async function f1Standings({ force = false } = {}) {
  return cached('f1:standings', 3 * 3600e3, async () => {
    const [d, c] = await Promise.all([
      fetchJSON(`${F1API}/current/driverStandings.json?limit=40`),
      fetchJSON(`${F1API}/current/constructorStandings.json?limit=40`),
    ]);
    const dl = d.MRData?.StandingsTable?.StandingsLists?.[0] || {};
    const cl = c.MRData?.StandingsTable?.StandingsLists?.[0] || {};
    return {
      round: dl.round || '',
      drivers: (dl.DriverStandings || []).map((x) => ({ pos: x.position || x.positionText, name: `${x.Driver.givenName} ${x.Driver.familyName}`, code: x.Driver.code || '', team: x.Constructors?.[0]?.name || '', points: x.points, wins: x.wins })),
      teams: (cl.ConstructorStandings || []).map((x) => ({ pos: x.position || x.positionText, name: x.Constructor.name, points: x.points, wins: x.wins })),
    };
  }, force);
}
