// APIs gratuitas y oficiales: AniList (GraphQL), TVmaze, TMDB (clave opcional del usuario) y TheSportsDB.
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

// ---------- TMDB (opcional, con la clave gratuita del usuario) ----------
function tmdbRequest(path, key, params = {}) {
  const url = new URL('https://api.themoviedb.org/3' + path);
  Object.entries({ language: 'es-ES', include_adult: 'false', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers = { Accept: 'application/json' };
  if (key.length > 60) headers.Authorization = 'Bearer ' + key; // token de lectura v4
  else url.searchParams.set('api_key', key); // clave v3
  return fetchJSON(url.href, { headers });
}
export async function searchTMDB(query, type, key) {
  if (!key) return [];
  const kind = type === 'pelicula' ? 'movie' : 'tv';
  const data = await tmdbRequest('/search/' + kind, key, { query });
  const genres = await tmdbGenres(kind, key).catch(() => ({}));
  return (data.results || []).slice(0, 10).map((r) => ({
    source: 'tmdb',
    sourceId: r.id,
    sourceUrl: `https://www.themoviedb.org/${kind}/${r.id}`,
    title: r.title || r.name,
    altTitles: [r.original_title || r.original_name].filter(Boolean),
    cover: r.poster_path ? 'https://image.tmdb.org/t/p/w500' + r.poster_path : '',
    synopsis: r.overview || '',
    genres: (r.genre_ids || []).map((g) => genres[g]).filter(Boolean),
    pubStatus: '',
    total: null,
    year: (r.release_date || r.first_air_date || '').slice(0, 4) || null,
    extra: r.original_language ? r.original_language.toUpperCase() : '',
  }));
}
const genreCache = {};
async function tmdbGenres(kind, key) {
  if (genreCache[kind]) return genreCache[kind];
  const d = await tmdbRequest(`/genre/${kind}/list`, key);
  genreCache[kind] = Object.fromEntries((d.genres || []).map((g) => [g.id, g.name]));
  return genreCache[kind];
}
export async function testTMDBKey(key) {
  const d = await tmdbRequest('/configuration', key);
  return !!d.images;
}

// Búsqueda combinada según el tipo de obra
export async function searchInfo(query, type, tmdbKey) {
  const q = query.trim();
  if (q.length < 2) return [];
  if (['manhwa', 'manga', 'anime'].includes(type)) {
    const res = await searchAniList(q, type);
    if (type === 'anime' && tmdbKey && res.length < 3) res.push(...(await searchTMDB(q, 'serie', tmdbKey).catch(() => [])));
    return res;
  }
  if (type === 'serie') {
    const [tm, tv] = await Promise.allSettled([tmdbKey ? searchTMDB(q, 'serie', tmdbKey) : Promise.resolve([]), searchTVmaze(q)]);
    return [...(tm.value || []), ...(tv.value || [])];
  }
  if (type === 'pelicula') {
    if (tmdbKey) return searchTMDB(q, 'pelicula', tmdbKey);
    // Sin TMDB: AniList cubre películas de anime
    const r = await searchAniList(q, 'anime').catch(() => []);
    return r.filter((m) => /MOVIE/.test(m.extra));
  }
  return [];
}

export const ATTRIBUTION = {
  anilist: { name: 'AniList', url: 'https://anilist.co', text: 'Datos e imágenes de AniList' },
  tvmaze: { name: 'TVmaze', url: 'https://www.tvmaze.com', text: 'Datos de TVmaze (CC BY-SA 4.0)' },
  tmdb: { name: 'TMDB', url: 'https://www.themoviedb.org', text: 'Este producto usa la API de TMDB, pero no está avalado ni certificado por TMDB.' },
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
