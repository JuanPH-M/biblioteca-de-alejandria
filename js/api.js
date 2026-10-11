// APIs gratuitas y sin clave: AniList (GraphQL), TVmaze, Wikipedia, ESPN (datos públicos) y Jolpica F1.
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
};

// ======================= OTROS DEPORTES =======================
// Fútbol, NBA, MLB y UFC: datos públicos de ESPN (sin clave). F1: Jolpica (continuación abierta de Ergast).
// Solo se usan textos y números; nunca logos ni imágenes de equipos o ligas.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN2 = 'https://site.api.espn.com/apis/v2/sports';
const F1API = 'https://api.jolpi.ca/ergast/f1';
export const SPORT_PATHS = { nba: 'basketball/nba', mlb: 'baseball/mlb', ufc: 'mma/ufc' };
ATTRIBUTION.espn = { name: 'ESPN', url: 'https://www.espn.com', text: 'Resultados y calendarios con datos públicos de ESPN' };
// 'nba', 'mlb' o una liga de fútbol como 'soccer/col.1'
const pathOf = (sport) => SPORT_PATHS[sport] || sport;
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
      score: sc ?? '', winner: !!x.winner, pen: x.shootoutScore ?? '', record: x.records?.[0]?.summary || x.record?.[0]?.displayValue || '',
      lines: (x.linescores || []).map((l) => l.displayValue ?? l.value),
    };
  };
  const st = e.status?.type || c.status?.type || {};
  return {
    id: e.id, ts: e.date, state: st.state || 'pre', detail: st.shortDetail || st.detail || '', completed: !!st.completed, clock: e.status?.displayClock || c.status?.displayClock || '',
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
    const j = await fetchJSON(`${ESPN}/${pathOf(sport)}/scoreboard?dates=${d}`);
    return (j.events || []).map(espnGame).sort((a, b) => a.ts.localeCompare(b.ts));
  }, force);
}

// Tabla por conferencia / liga
export async function sportStandings(sport, { force = false } = {}) {
  return cached('ss:' + sport, 3 * 3600e3, async () => {
    const j = await fetchJSON(`${ESPN2}/${pathOf(sport)}/standings`);
    return (j.children || []).map((g) => {
      const rows = (g.standings?.entries || []).map((en) => {
        const s = Object.fromEntries((en.stats || []).map((x) => [x.name, x]));
        const v = (k) => s[k]?.displayValue ?? '';
        return {
          id: en.team?.id, name: en.team?.displayName || '', short: en.team?.abbreviation || '', color1: hexOk(en.team?.color), color2: hexOk(en.team?.alternateColor),
          w: v('wins'), l: v('losses'), pct: v('winPercent'), gb: v('gamesBehind'), streak: v('streak'), seed: +(s.playoffSeed?.value || 0), wp: +(s.winPercent?.value || 0),
          // fútbol
          rank: +(s.rank?.value || 0), pj: v('gamesPlayed'), d: v('ties'), gd: v('pointDifferential'), pts: v('points'),
          note: en.note ? { color: en.note.color || '', text: en.note.description || '' } : null,
        };
      });
      rows.sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : a.seed && b.seed ? a.seed - b.seed : b.wp - a.wp));
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

// ---------- Fútbol (datos públicos de ESPN) ----------
// Ligas populares con su código de ESPN. Los colores son propios, no logos.
export const POPULAR_LEAGUES = [
  { id: 'col.1', name: 'Liga BetPlay', country: 'Colombia', flag: '🇨🇴', c1: '#ca8a04', c2: '#2563eb' },
  { id: 'col.2', name: 'Torneo BetPlay (Primera B)', country: 'Colombia', flag: '🇨🇴', c1: '#1d4ed8', c2: '#dc2626' },
  { id: 'col.copa', name: 'Copa Colombia', country: 'Colombia', flag: '🇨🇴', c1: '#b45309', c2: '#facc15' },
  { id: 'uefa.champions', name: 'Champions League', country: 'Europa', flag: '🇪🇺', c1: '#1e3a8a', c2: '#60a5fa' },
  { id: 'eng.1', name: 'Premier League', country: 'Inglaterra', flag: '🏴', c1: '#581c87', c2: '#22d3ee' },
  { id: 'esp.1', name: 'La Liga', country: 'España', flag: '🇪🇸', c1: '#b91c1c', c2: '#facc15' },
  { id: 'ita.1', name: 'Serie A', country: 'Italia', flag: '🇮🇹', c1: '#065f46', c2: '#38bdf8' },
  { id: 'ger.1', name: 'Bundesliga', country: 'Alemania', flag: '🇩🇪', c1: '#991b1b', c2: '#f97316' },
  { id: 'fra.1', name: 'Ligue 1', country: 'Francia', flag: '🇫🇷', c1: '#1e293b', c2: '#a3e635' },
  { id: 'uefa.europa', name: 'Europa League', country: 'Europa', flag: '🇪🇺', c1: '#c2410c', c2: '#fbbf24' },
  { id: 'uefa.europa.conf', name: 'Conference League', country: 'Europa', flag: '🇪🇺', c1: '#166534', c2: '#4ade80' },
  { id: 'conmebol.libertadores', name: 'Copa Libertadores', country: 'Sudamérica', flag: '🌎', c1: '#78350f', c2: '#fbbf24' },
  { id: 'conmebol.sudamericana', name: 'Copa Sudamericana', country: 'Sudamérica', flag: '🌎', c1: '#1e40af', c2: '#f87171' },
  { id: 'bra.1', name: 'Brasileirão', country: 'Brasil', flag: '🇧🇷', c1: '#15803d', c2: '#facc15' },
  { id: 'arg.1', name: 'Liga Profesional', country: 'Argentina', flag: '🇦🇷', c1: '#0369a1', c2: '#7dd3fc' },
  { id: 'mex.1', name: 'Liga MX', country: 'México', flag: '🇲🇽', c1: '#14532d', c2: '#ef4444' },
  { id: 'usa.1', name: 'MLS', country: 'Estados Unidos', flag: '🇺🇸', c1: '#1e3a8a', c2: '#ef4444' },
  { id: 'por.1', name: 'Liga Portugal', country: 'Portugal', flag: '🇵🇹', c1: '#166534', c2: '#dc2626' },
  { id: 'ned.1', name: 'Eredivisie', country: 'Países Bajos', flag: '🇳🇱', c1: '#c2410c', c2: '#1d4ed8' },
  { id: 'fifa.world', name: 'Mundial', country: 'FIFA', flag: '🌍', c1: '#7f1d1d', c2: '#fcd34d' },
  { id: 'fifa.worldq.conmebol', name: 'Eliminatorias Sudamericanas', country: 'Sudamérica', flag: '🌎', c1: '#713f12', c2: '#22c55e' },
  { id: 'conmebol.america', name: 'Copa América', country: 'Sudamérica', flag: '🌎', c1: '#1e3a8a', c2: '#facc15' },
  { id: 'eng.fa', name: 'FA Cup', country: 'Inglaterra', flag: '🏴', c1: '#1e3a8a', c2: '#f87171' },
  { id: 'esp.copa_del_rey', name: 'Copa del Rey', country: 'España', flag: '🇪🇸', c1: '#7c2d12', c2: '#fde047' },
];
// IDs de la versión anterior (TheSportsDB) → código de ESPN
export const LEGACY_LEAGUES = {
  4480: 'uefa.champions', 4328: 'eng.1', 4335: 'esp.1', 4332: 'ita.1', 4331: 'ger.1', 4334: 'fra.1', 4497: 'col.1', 4951: 'col.2', 5183: 'col.copa',
  4481: 'uefa.europa', 5071: 'uefa.europa.conf', 4351: 'bra.1', 4406: 'arg.1', 4501: 'conmebol.libertadores', 4724: 'conmebol.sudamericana',
  4429: 'fifa.world', 4482: 'eng.fa', 4483: 'esp.copa_del_rey',
};
const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search';

// Busca clubes y selecciones
export async function soccerSearchTeams(query) {
  const j = await fetchJSON(`${ESPN_SEARCH}?query=${encodeURIComponent(query)}&type=team&sport=soccer&limit=20`);
  return (j.items || []).filter((x) => x.sport === 'soccer' || !x.sport).map((x) => ({
    id: String(x.id), name: x.displayName, short: x.abbreviation || '', league: x.defaultLeagueSlug || x.league || '',
    country: x.location || '', src: 'espn',
  }));
}
// Busca ligas y torneos
export async function soccerSearchLeagues(query) {
  const j = await fetchJSON(`${ESPN_SEARCH}?query=${encodeURIComponent(query)}&type=league&sport=soccer&limit=20`);
  return (j.items || []).map((x) => ({ id: x.defaultLeagueSlug || x.league || x.slug, name: x.displayName, country: '' })).filter((x) => x.id);
}

// Todos los partidos de un equipo (todas las competiciones)
export async function soccerTeamSchedule(teamId, { force = false } = {}) {
  return cached('sct:' + teamId, 30 * 60e3, async () => {
    const base = `${ESPN}/soccer/all/teams/${teamId}/schedule`;
    const [past, fix] = await Promise.all([fetchJSON(base), fetchJSON(base + '?fixture=true').catch(() => ({}))]);
    const ev = [...(past.events || []), ...(fix.events || [])].map((e) => {
      const g = espnGame(e);
      const lg = POPULAR_LEAGUES.find((p) => p.id === e.league?.slug)?.name || e.league?.name || '';
      // en la tarjeta se ve de qué torneo es cada partido
      return { ...g, league: lg, slug: e.league?.slug || '', note: [lg, g.note].filter(Boolean).join(' · ') };
    });
    const uniq = [...new Map(ev.map((e) => [e.id, e])).values()];
    const t = past.team || fix.team || {};
    return {
      color1: hexOk(t.color), color2: hexOk(t.alternateColor), standing: t.standingSummary || '', record: t.recordSummary || '',
      upcoming: uniq.filter((e) => e.state !== 'post').sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, 8),
      results: uniq.filter((e) => e.state === 'post').sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8),
    };
  }, force);
}

// Fechas con partidos de una liga (para el calendario) y los partidos de la jornada actual
export async function soccerCalendar(slug, { force = false } = {}) {
  return cached('scal:' + slug, 6 * 3600e3, async () => {
    const j = await fetchJSON(`${ESPN}/soccer/${slug}/scoreboard`);
    const lg = j.leagues?.[0] || {};
    const cal = lg.calendar || [];
    const dates = typeof cal[0] === 'string' ? [...new Set(cal.map((d) => d.slice(0, 10)))] : [];
    // en torneos por fases se usan los días de los partidos que trae la jornada
    const evDates = (j.events || []).map((e) => e.date.slice(0, 10));
    return { name: lg.name || '', season: lg.season?.type?.name || lg.season?.displayName || '', dates: [...new Set([...dates, ...evDates])].sort() };
  }, force);
}

const STAT_ES = {
  possessionPct: 'Posesión', totalShots: 'Tiros', shotsOnTarget: 'Tiros al arco', wonCorners: 'Tiros de esquina', foulsCommitted: 'Faltas',
  yellowCards: 'Amarillas', redCards: 'Rojas', offsides: 'Fueras de lugar', saves: 'Atajadas', accuratePasses: 'Pases completos', totalPasses: 'Pases',
};
const POS_ES = { G: 'POR', D: 'DEF', M: 'MED', F: 'DEL' };
// Detalle de un partido: goles, tarjetas, cambios, alineaciones y estadísticas
export async function soccerSummary(eventId, { force = false, live = false } = {}) {
  return cached('ssum:' + eventId, live ? 60e3 : 6 * 3600e3, async () => {
    const j = await fetchJSON(`${ESPN}/soccer/all/summary?event=${eventId}`);
    const teamIds = (j.header?.competitions?.[0]?.competitors || []).map((c) => ({ id: c.team?.id, ha: c.homeAway }));
    const side = (id) => teamIds.find((t) => t.id === id)?.ha || '';
    const events = (j.keyEvents || []).map((k) => {
      const tx = k.type?.text || '';
      const kind = /own goal/i.test(tx) || /own goal/i.test(k.text || '') ? 'og' : /penalty.*(missed|saved)/i.test(tx) ? 'penmiss' : /goal|penalty - scored/i.test(tx) ? 'goal' : /red card/i.test(tx) ? 'red' : /yellow/i.test(tx) ? 'yellow' : /substitution/i.test(tx) ? 'sub' : /halftime/i.test(tx) ? 'ht' : '';
      const ps = (k.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
      return { kind, min: k.clock?.displayValue || '', side: side(k.team?.id), a: ps[0] || '', b: ps[1] || '', pen: /penalty/i.test(tx) || /penalty/i.test(k.text || '') };
    }).filter((e) => e.kind);
    const rosters = (j.rosters || []).map((r) => {
      const pl = (r.roster || []).map((p) => ({
        name: p.athlete?.displayName || '', num: p.jersey || '', pos: p.position?.abbreviation || '', starter: !!p.starter,
        inn: !!p.subbedIn, out: !!p.subbedOut,
        goals: +((p.stats || []).find((s) => s.name === 'totalGoals')?.value || 0),
      }));
      return { side: r.homeAway || side(r.team?.id), team: r.team?.displayName || '', formation: r.formation || '', starters: pl.filter((p) => p.starter), bench: pl.filter((p) => !p.starter) };
    });
    const stats = {};
    for (const t of j.boxscore?.teams || []) {
      const ha = t.homeAway || side(t.team?.id);
      for (const s of t.statistics || []) {
        if (!STAT_ES[s.name]) continue;
        stats[s.name] = stats[s.name] || { label: STAT_ES[s.name] };
        stats[s.name][ha] = s.displayValue;
      }
    }
    const gi = j.gameInfo || {};
    return {
      events, rosters, stats: Object.keys(STAT_ES).filter((k) => stats[k]).map((k) => ({ key: k, ...stats[k] })),
      venue: gi.venue?.fullName || '', city: [gi.venue?.address?.city, gi.venue?.address?.country].filter(Boolean).join(', '),
      attendance: gi.attendance || 0, referee: (gi.officials || [])[0]?.displayName || '',
    };
  }, force);
}
export function posEs(p = '') {
  const x = p.toUpperCase().split('-')[0];
  if (x === 'G' || x === 'GK') return 'POR';
  if (/^(CD|CB|LB|RB|D|WB|LWB|RWB|SW)$/.test(x)) return 'DEF';
  if (/^(DM|CM|LM|RM|AM|M|CDM|CAM)$/.test(x)) return 'MED';
  if (/^(F|CF|ST|LW|RW|W|S|SS)$/.test(x)) return 'DEL';
  return POS_ES[x[0]] || p;
}

