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
