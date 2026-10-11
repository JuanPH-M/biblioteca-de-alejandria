// Reconocimiento de links: plataformas, patrones de sitios de lectura y marcadores de Chrome.
// La app SOLO guarda y abre links: nunca descarga ni muestra el contenido de los sitios.

// Plataformas: nombres en texto y colores propios (sin logos oficiales).
export const PLATFORMS = {
  netflix: { name: 'Netflix', color: '#e11d48', glyph: '▶', hosts: ['netflix.com'] },
  prime: { name: 'Prime Video', color: '#0ea5e9', glyph: '▶', hosts: ['primevideo.com', 'amazon.com/gp/video', 'amazon.es/gp/video'] },
  disney: { name: 'Disney+', color: '#3b5bdb', glyph: '▶', hosts: ['disneyplus.com', 'disney.com'] },
  hbo: { name: 'HBO Max', color: '#8b5cf6', glyph: '▶', hosts: ['hbomax.com', 'max.com', 'play.max.com'] },
  youtube: { name: 'YouTube', color: '#ef4444', glyph: '▶', hosts: ['youtube.com', 'youtu.be'] },
  crunchyroll: { name: 'Crunchyroll', color: '#f97316', glyph: '▶', hosts: ['crunchyroll.com'] },
  web: { name: 'Página web', color: '#14b8a6', glyph: '📖', hosts: [] },
};
export const STREAMING = ['netflix', 'prime', 'disney', 'hbo', 'youtube', 'crunchyroll'];

export function detectPlatform(host, href = '') {
  host = host.replace(/^www\./, '');
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (p.hosts.some((h) => (h.includes('/') ? href.includes(h) : h.endsWith('.') ? host.startsWith(h) : host === h || host.endsWith('.' + h)))) return key;
  }
  return 'web';
}

// ---------- utilidades de texto ----------
export const normKey = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const STOP = new Set(['leer', 'read', 'manga', 'manhwa', 'manhua', 'comic', 'comics', 'series', 'serie', 'chapter', 'chapters', 'capitulo', 'capitulos', 'cap', 'ver', 'watch', 'episode', 'episodio', 'title', 'titulo', 'obra', 'obras', 'library', 'biblioteca', 'webtoon', 'es', 'en', 'view', 'reader', 'lector', 'online', 'index', 'html', 'php']);

export function slugToTitle(slug = '') {
  let s = decodeURIComponent(slug).replace(/\.(html?|php)$/i, '');
  s = s.replace(/[-_](capitulo|chapter|cap|ch|episodio|ep)[-_]?\d+.*$/i, '');
  s = s.replace(/([-_](\d{4,}|[a-f0-9]{8,}))+$/i, ''); // ids largos al final
  s = s.replace(/[-_]+/g, ' ').trim();
  return s.split(' ').filter(Boolean).map((w, i) => (i > 0 && /^(de|del|la|el|los|las|y|of|the|a|en|no|to)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

export function cleanBookmarkTitle(t = '') {
  return t
    .replace(/\s*[|–—-]\s*(netflix|prime video|amazon[^|]*|disney\+?|hbo max|max|youtube|crunchyroll)\s*$/i, '')
    .replace(/^(ver|watch)\s+/i, '')
    .replace(/\s*[|–—-]\s*[^|–—-]*(scans?|manhwa|manga|web|leer|online|comics?|\.com|\.co|\.net|olympus|toon)[^|–—-]*$/i, '')
    .replace(/\s*(cap[ií]tulo|cap\.?|chapter|ch\.?|episodio|ep\.?)\s*#?\d+(\.\d+)?.*$/i, '')
    .replace(/^(leer|read|ver)\s+/i, '')
    .replace(/\s+#?\d+(\.\d+)?$/, '')
    .trim();
}

export function chapterFromText(t = '') {
  const m = t.match(/(?:cap[ií]tulo|cap\.?|chapter|ch\.?|episodio|ep\.?)\s*#?(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : null;
}

const nextOf = (n) => Math.floor(n) + 1;
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(n));

// ---------- reglas conocidas ----------
const RULES = [
  {
    id: 'mhscans',
    label: 'MHScans',
    test: (host) => /(^|\.)mhscans\./.test(host),
    re: /\/series\/([^/]+)\/capitulo-(\d+(?:\.\d+)?)/i,
    parse(u) {
      const m = u.pathname.match(this.re);
      if (!m) return null;
      return { slug: m[1], title: slugToTitle(m[1]), chapter: parseFloat(m[2]), mode: 'known' };
    },
    build(u, n) {
      const url = new URL(u.href);
      url.pathname = url.pathname.replace(/capitulo-\d+(?:\.\d+)?/i, 'capitulo-' + fmtNum(n));
      return url.href;
    },
  },
  {
    id: 'leercapitulo',
    label: 'LeerCapitulo',
    test: (host) => /(^|\.)leercapitulo\./.test(host),
    re: /\/leer\/([^/]+)\/([^/]+)\/(\d+(?:\.\d+)?)\/?/i,
    parse(u) {
      const m = u.pathname.match(this.re);
      if (!m) return null;
      return { slug: m[2], title: slugToTitle(m[2]), chapter: parseFloat(m[3]), mode: 'known' };
    },
    build(u, n) {
      const url = new URL(u.href);
      url.pathname = url.pathname.replace(this.re, (all, code, name) => `/leer/${code}/${name}/${fmtNum(n)}/`);
      return url.href;
    },
  },
  {
    id: 'manhwaweb',
    label: 'ManhwaWeb',
    test: (host) => /(^|\.)manhwaweb\./.test(host),
    // /leer/{nombre}-_{id}-{N}_{sufijo}
    re: /\/leer\/(.+?)[-_]+_?([a-z0-9]+)-(\d+(?:\.\d+)?)(?:_([^/]*))?\/?$/i,
    parse(u, patterns) {
      const m = u.pathname.match(this.re);
      if (!m) return null;
      const confirmed = patterns?.[u.hostname.replace(/^www\./, '')]?.confirmed;
      return { slug: m[1], title: slugToTitle(m[1]), chapter: parseFloat(m[3]), mode: confirmed ? 'known' : 'confirm' };
    },
    build(u, n) {
      const url = new URL(u.href);
      url.pathname = url.pathname.replace(this.re, (all, name, id, ch, suf) => `/leer/${name}-_${id}-${fmtNum(n)}${suf !== undefined ? '_' + suf : ''}`);
      return url.href;
    },
  },
  {
    id: 'olympus',
    label: 'Olympus',
    test: (host) => /olympus/.test(host),
    re: /\/capitulo\/([^/]+)\/([^/?#]+)/i,
    parse(u) {
      const m = u.pathname.match(this.re);
      const s = u.pathname.match(/\/series\/([^/?#]+)/i);
      const slug = m ? m[2] : s ? s[1] : null;
      if (!slug) return null;
      // el slug trae "comic-" y una marca de fecha: se quitan para el nombre
      return { slug, title: slugToTitle(slug.replace(/^(comic|manhwa|manga)-/i, '')), chapter: null, mode: 'nochapter' };
    },
    build: () => null, // el número del link es un id interno, no el capítulo
    // la página de la serie (lista de capítulos) usa el mismo slug: /series/{slug}
    series(u) {
      const m = u.pathname.match(this.re);
      if (m) return `${u.origin}/series/${m[2]}`;
      return /\/series\//i.test(u.pathname) ? u.href : null;
    },
  },
];
export const KNOWN_SITES = RULES.map((r) => r.label);

// Números en la ruta del link (para sitios desconocidos)
export function findNumbers(u) {
  const out = [];
  const re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(u.pathname))) out.push({ value: parseFloat(m[0]), raw: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

function guessTitle(u) {
  const segs = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  let best = '', bestScore = 0;
  for (const seg of segs) {
    const words = seg.split(/[-_.\s]+/).filter((w) => /[a-záéíóúñ]/i.test(w) && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
    const score = words.join('').length;
    if (score > bestScore) { best = seg; bestScore = score; }
  }
  return { slug: best, title: best ? slugToTitle(best) : '' };
}

export function toURL(raw) {
  if (!raw) return null;
  raw = raw.trim();
  try { return new URL(raw); } catch { /* sigue */ }
  try { if (/^[\w-]+(\.[\w-]+)+/.test(raw)) return new URL('https://' + raw); } catch { /* nada */ }
  return null;
}

// Analiza un link. patterns = { [host]: {fromEnd, confirmed, none} }
// mode: streaming | known | confirm | nochapter | pattern | pick | manual
export function parseLink(raw, patterns = {}) {
  const u = toURL(raw);
  if (!u || !/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '');
  const platform = detectPlatform(host, u.href);
  const base = { url: u.href, host, platform, title: '', slug: '', chapter: null, mode: 'manual', numbers: [], rule: null };
  if (platform !== 'web') {
    return { ...base, mode: 'streaming', title: guessStreamingTitle(u) };
  }
  const pat = patterns[host];
  const userPicked = pat && pat.fromEnd != null; // el número elegido por el usuario tiene prioridad
  for (const rule of RULES) {
    if (!rule.test(host)) continue;
    const r = rule.parse(u, patterns);
    if (r && userPicked && rule.id !== 'olympus') {
      const numbers = findNumbers(u);
      const idx = numbers.length - 1 - pat.fromEnd;
      if (idx >= 0) return { ...base, ...r, rule: null, numbers, chapter: numbers[idx].value, mode: 'pattern', numIndex: idx };
    }
    if (r) return { ...base, ...r, rule: rule.id, numbers: findNumbers(u) };
  }
  const numbers = findNumbers(u);
  const g = guessTitle(u);
  const res = { ...base, ...g, numbers };
  if (pat && !pat.none && numbers.length) {
    const idx = numbers.length - 1 - pat.fromEnd;
    if (idx >= 0) return { ...res, chapter: numbers[idx].value, mode: 'pattern', numIndex: idx };
  }
  if (pat?.none) return { ...res, mode: 'manual' };
  if (!numbers.length) return { ...res, mode: 'manual' };
  // Sugerencia: número precedido por "capitulo", "chapter", "ep"…
  const kw = /(cap[ií]tulo|chapter|cap|ch|episodio|episode|ep)[-_/.\s]*$/i;
  const sIdx = numbers.findIndex((n) => kw.test(u.pathname.slice(Math.max(0, n.start - 14), n.start)));
  if (sIdx >= 0) return { ...res, mode: 'pick', suggest: sIdx, numIndex: sIdx, chapter: numbers[sIdx].value };
  return { ...res, mode: 'pick' };
}

function guessStreamingTitle(u) {
  // Algunos links de streaming incluyen el nombre (p. ej. /title/nombre-de-la-serie)
  const segs = u.pathname.split('/').filter((s) => /[a-z]{3,}/i.test(s) && !/^(title|watch|browse|detail|series|movies|movie|video|play|es|en|es-es|es-419|gp|dp)$/i.test(s));
  const seg = segs.find((s) => s.includes('-'));
  return seg ? slugToTitle(seg) : '';
}

// Construye el link del capítulo n a partir de un link guardado (o null si no se puede)
export function chapterUrl(rawUrl, n, patterns = {}) {
  const u = toURL(rawUrl);
  if (!u || n == null || n < 0) return null;
  const host = u.hostname.replace(/^www\./, '');
  const userPicked = patterns[host] && patterns[host].fromEnd != null;
  for (const rule of RULES) {
    if (!rule.test(host) || (userPicked && rule.id !== 'olympus')) continue;
    const parsed = rule.parse(u, patterns);
    if (!parsed) return null;
    if (parsed.mode === 'confirm' || parsed.mode === 'nochapter') return parsed.mode === 'confirm' ? rule.build(u, n) : null;
    return rule.build(u, n);
  }
  const pat = patterns[host];
  if (!pat || pat.none) return null;
  const nums = findNumbers(u);
  const idx = nums.length - 1 - pat.fromEnd;
  if (idx < 0) return null;
  const num = nums[idx];
  const url = new URL(u.href);
  url.pathname = u.pathname.slice(0, num.start) + fmtNum(n) + u.pathname.slice(num.end);
  return url.href;
}

// Link a la lista de capítulos de la obra (sitios donde no se puede armar el siguiente capítulo).
// Funciona con cualquier sitio: se deduce del link del capítulo quitando la parte del capítulo.
const CH_SEG = /^(?:cap[ií]tulo|chapter|chap|cap|ch|episodio|episode|ep|c)[-_.]?\d+(?:[.-]\d+)?(?:\.html?)?$/i;
const CH_SUFFIX = /[-_](?:cap[ií]tulo|chapter|chap|cap|ch|episodio|episode|ep)[-_.]?\d+(?:[.-]\d+)?(?:\.html?)?$/i;
const READ_WORDS = /^(leer|read|reader|ver|view|viewer|lector|capitulo|capitulos|chapter|chapters|episode|episodio|cap|c|r)$/i;
const isNum = (s) => /^\d+(?:\.\d+)?$/.test(s);
const hasWord = (s) => /[a-záéíóúñ]{3}/i.test(s) && !READ_WORDS.test(s) && !isNum(s);

export function seriesUrl(rawUrl) {
  const u = toURL(rawUrl);
  if (!u) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  // 1) sitios conocidos con su propia regla (p. ej. Olympus)
  const rule = RULES.find((r) => r.test(host) && r.series);
  if (rule) { const r = rule.series(u); if (r) return r; }
  const segs = u.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const build = (parts) => `${u.origin}/${parts.map(encodeURIComponent).join('/')}/`;
  // 2) /manga/obra/capitulo-12  ·  /series/obra/12  →  /manga/obra/  ·  /series/obra/
  const idx = segs.findIndex((s, i) => i > 0 && (CH_SEG.test(s) || isNum(s)));
  if (idx > 0) {
    const parent = segs.slice(0, idx);
    if (parent.some(hasWord)) return build(parent);
  }
  // 3) /obra-capitulo-12  ·  /leer/obra-chapter-12  →  /obra/  (sin las palabras de lectura)
  const j = segs.findIndex((s) => CH_SUFFIX.test(s));
  if (j >= 0) {
    const slug = segs[j].replace(CH_SUFFIX, '');
    const before = segs.slice(0, j).filter((s) => !READ_WORDS.test(s));
    if (hasWord(slug)) return build([...before, slug]);
  }
  // 4) /chapter/12345/obra  →  la última parte con nombre suele ser la obra
  const named = segs.filter(hasWord);
  if (idx === 0 || (segs.length && READ_WORDS.test(segs[0]))) {
    if (named.length) return build(['series', named[named.length - 1]]);
  }
  return null;
}

// Búsqueda de la obra dentro del mismo sitio (último recurso)
export function siteSearchUrl(rawUrl, title) {
  const u = toURL(rawUrl);
  if (!u) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${u.hostname.replace(/^www\./, '')} ${title}`)}`;
}

export const nextChapterUrl = (rawUrl, chapter, patterns) => (chapter == null ? null : chapterUrl(rawUrl, nextOf(chapter), patterns));

// Busca una obra existente que corresponda al link analizado
export function findWorkForLink(parsed, works) {
  if (!parsed) return null;
  const key = normKey(parsed.title);
  for (const w of works) {
    if ((w.links || []).some((l) => l.host === parsed.host && parsed.slug && l.slug === parsed.slug)) return w;
  }
  if (!key) return null;
  return works.find((w) => normKey(w.title) === key || (w.aliases || []).some((a) => normKey(a) === key)) || null;
}

// ---------- marcadores de Chrome ----------
const STATUS_HINTS = [
  [/termin|complet|acabad|finaliz|vistos?$|le[ií]dos?$|finished|completed/i, 'terminado'],
  [/abandon|dropped|drop\b/i, 'abandonado'],
  [/pausa|hiatus|on.?hold|paused/i, 'pausado'],
  [/pendien|por leer|por ver|para leer|para ver|despu[eé]s|later|plan to/i, 'pendiente'],
  [/emisi[oó]n|al d[ií]a|ongoing|semanal|nuevos cap/i, 'emision'],
  [/leyendo|viendo|actual|reading|watching|siguiendo/i, 'viendo'],
];
const TYPE_HINTS = [
  [/manhwa|webtoon/i, 'manhwa'], [/manga/i, 'manga'], [/anime/i, 'anime'],
  [/pel[ií]cula|movie|cine/i, 'pelicula'], [/series?\b|tv/i, 'serie'],
];
const READING_HINT = /cap[ií]tulo|chapter|leer|read|manga|manhwa|manhua|scan|webtoon|comic|toon|olympus/i;

export function statusFromFolders(folders) {
  for (let i = folders.length - 1; i >= 0; i--) for (const [re, s] of STATUS_HINTS) if (re.test(folders[i])) return s;
  return null;
}
export function typeFromFolders(folders) {
  for (let i = folders.length - 1; i >= 0; i--) for (const [re, t] of TYPE_HINTS) if (re.test(folders[i])) return t;
  return null;
}

// Lee el HTML exportado por Chrome (formato Netscape Bookmark) y devuelve marcadores con su ruta de carpetas
export function parseBookmarksHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  function walk(dl, folders) {
    if (!dl) return;
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') {
        if (dt.tagName === 'DL') walk(dt, folders);
        continue;
      }
      const h3 = dt.querySelector(':scope > h3');
      const a = dt.querySelector(':scope > a');
      if (h3) {
        let sub = dt.querySelector(':scope > dl');
        if (!sub) { // en algunos exportes el DL es hermano del DT
          let sib = dt.nextElementSibling;
          if (sib && sib.tagName === 'DL') sub = sib;
        }
        const name = h3.textContent.trim();
        const isRoot = /^(barra de marcadores|bookmarks bar|bookmarks toolbar|otros marcadores|other bookmarks|marcadores|bookmarks|mobile bookmarks|marcadores del m[oó]vil)$/i.test(name);
        walk(sub, isRoot ? folders : [...folders, name]);
      } else if (a) {
        out.push({ url: a.getAttribute('href') || '', text: a.textContent.trim(), folders, added: +(a.getAttribute('add_date') || 0) });
      }
    }
  }
  const root = doc.querySelector('dl');
  walk(root, []);
  if (!out.length) doc.querySelectorAll('a[href]').forEach((a) => out.push({ url: a.getAttribute('href'), text: a.textContent.trim(), folders: [], added: 0 }));
  return out;
}

// Agrupa marcadores por obra (dejando el capítulo más alto) y sugiere tipo y estado
export function analyzeBookmarks(bookmarks, patterns = {}) {
  const groups = new Map();
  let ignored = 0;
  for (const b of bookmarks) {
    const p = parseLink(b.url, patterns);
    if (!p) { ignored++; continue; }
    const folderText = b.folders.join(' / ');
    const isStreaming = p.mode === 'streaming';
    const recognized = p.rule || p.mode === 'pattern' || isStreaming;
    if (!recognized && !READING_HINT.test(b.url + ' ' + b.text + ' ' + folderText)) { ignored++; continue; }

    let title = p.title;
    const fromText = cleanBookmarkTitle(b.text);
    if (isStreaming || (!p.rule && fromText && fromText.length > 1)) title = fromText || title;
    if (!title) title = fromText || p.host;
    let chapter = p.chapter;
    if (chapter == null && p.mode !== 'nochapter' && !isStreaming) chapter = chapterFromText(b.text);
    if (chapter == null && p.mode === 'pick' && p.numbers.length) chapter = null;

    const key = normKey(title) || p.url;
    const type = typeFromFolders(b.folders) || (isStreaming ? (p.platform === 'crunchyroll' ? 'anime' : 'serie') : 'manhwa');
    const status = statusFromFolders(b.folders) || (isStreaming ? 'viendo' : 'viendo');
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { key, title, type, status, chapter, url: p.url, host: p.host, slug: p.slug, platform: p.platform, mode: p.mode, rule: p.rule, count: 1, folders: folderText, selected: true });
    } else {
      g.count++;
      if (chapter != null && (g.chapter == null || chapter > g.chapter)) { g.chapter = chapter; g.url = p.url; g.mode = p.mode; }
    }
  }
  const items = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return { items, ignored, total: bookmarks.length };
}
