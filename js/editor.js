// Editor de obras (agregar/editar) y hoja "Pegar link".
import { $, $$, esc, openSheet, whenSettled, toast, debounce, imageToDataURL, ICONS, coverHTML, confetti, vibrate } from './ui.js';
import { S, TYPES, STATUSES, TRACK_ONLY, statusLabel, newWork, saveWork, analyzeUrl, applyLinkToWork, linkFromParsed, savePattern, progressLabel } from './store.js';
import { PLATFORMS, STREAMING, parseLink, nextChapterUrl, KNOWN_SITES } from './links.js';
import { searchInfo, ATTRIBUTION, tvmazeSeasons } from './api.js';
import { render, go, openCheckIn } from './app.js';

// ---------- análisis visual de un link ----------
// Devuelve HTML que explica qué se reconoció y permite elegir el número de capítulo.
export function linkReportHTML(parsed) {
  if (!parsed) return `<div class="lr bad">No parece un link válido.</div>`;
  const p = PLATFORMS[parsed.platform];
  const head = `<div class="lr-head"><span class="pbadge" style="--c:${p.color}">${esc(p.name)}</span><span class="muted small">${esc(parsed.host)}</span></div>`;
  const next = parsed.chapter != null ? nextChapterUrl(parsed.url, parsed.chapter, S.patterns) : null;
  const title = parsed.title ? `<div><b>${esc(parsed.title)}</b></div>` : '';
  switch (parsed.mode) {
    case 'streaming':
      return `<div class="lr ok">${head}${title}<div class="small muted">Link de streaming guardado. El progreso lo llevas con el contador.</div></div>`;
    case 'known':
    case 'pattern':
      return `<div class="lr ok">${head}${title}<div>Capítulo <b>${parsed.chapter}</b> ${next ? '<span class="tag ok">siguiente automático ✓</span>' : ''}</div>
        ${parsed.mode === 'pattern' ? `<button class="link-btn small" data-repick>¿No es el capítulo? Elegir otro número</button>` : ''}</div>`;
    case 'confirm':
      return `<div class="lr warn">${head}${title}<div>¿El capítulo es <b>${parsed.chapter}</b>?</div>
        <div class="row-btns sm"><button class="btn sm primary" data-confirm-yes>Sí, es el capítulo</button><button class="btn sm ghost" data-repick>Elegir otro número</button></div></div>`;
    case 'nochapter':
      return `<div class="lr info">${head}${title}<div class="small">En este sitio el número del link es un código interno, no el capítulo: el capítulo lo llevas con el contador. Tendrás el botón <b>Ver capítulos</b> para elegir el siguiente y <b>Último visto</b> para volver a este.</div></div>`;
    case 'pick':
      return `<div class="lr warn">${head}${title}
        ${parsed.suggest != null ? `<div>Parece que el capítulo es <b>${esc(parsed.numbers[parsed.suggest].raw)}</b>.</div><div class="row-btns sm"><button class="btn sm primary" data-pick="${parsed.suggest}">Sí, es el capítulo</button></div><div class="small muted">O toca otro número del link:</div>`
          : `<div class="small">Sitio nuevo: toca el número que corresponde al capítulo.</div>`}
        ${numbersPickerHTML(parsed)}<div class="xsmall muted">Lo recordaré para ${esc(parsed.host)}.</div></div>`;
    default:
      return `<div class="lr info">${head}${title}<div class="small">No hay número de capítulo en el link. Se guarda el link y llevas el contador a mano.</div></div>`;
  }
}

function numbersPickerHTML(parsed) {
  let html = '';
  let last = 0;
  const rawPath = new URL(parsed.url).pathname;
  // ruta con los números resaltados y tocables
  parsed.numbers.forEach((n, i) => {
    html += esc(safeDecode(rawPath.slice(last, n.start))) + `<button class="num-chip ${parsed.numIndex === i ? 'on' : ''}" data-pick="${i}">${esc(n.raw)}</button>`;
    last = n.end;
  });
  html += esc(safeDecode(rawPath.slice(last)));
  return `<div class="path-pick">${html}</div><button class="link-btn small" data-pick-none>Ninguno es el capítulo</button>`;
}
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// Conecta los botones del reporte (elegir número, confirmar) — llama onChange(parsedNuevo)
export function bindLinkReport(container, getParsed, onChange) {
  container.addEventListener('click', async (e) => {
    const parsed = getParsed();
    if (!parsed) return;
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const i = +pick.dataset.pick;
      await savePattern(parsed.host, { fromEnd: parsed.numbers.length - 1 - i });
      toast(`Patrón guardado para ${parsed.host}`, { icon: '🧩' });
      onChange(parseLink(parsed.url, S.patterns));
    } else if (e.target.closest('[data-pick-none]')) {
      await savePattern(parsed.host, { none: true });
      onChange(parseLink(parsed.url, S.patterns));
    } else if (e.target.closest('[data-confirm-yes]')) {
      await savePattern(parsed.host, { confirmed: true });
      toast(`Confirmado: ${parsed.host} usará este patrón`, { icon: '✅' });
      onChange(parseLink(parsed.url, S.patterns));
    } else if (e.target.closest('[data-repick]')) {
      const fresh = { ...parsed, mode: 'pick', numIndex: parsed.numIndex };
      onChange(fresh, true);
    }
  });
}

// ---------- hoja: Pegar link ----------
export function openPasteSheet({ work = null, url = '' } = {}) {
  const s = openSheet(`
    <h3 class="sheet-title">${work ? `Agregar link a <span class="accent">${esc(work.title)}</span>` : 'Pegar link de capítulo'}</h3>
    <p class="muted small">${work ? 'Pega el link de la plataforma o del capítulo.' : `Reconozco ${KNOWN_SITES.join(', ')}, plataformas de streaming y aprendo sitios nuevos.`}</p>
    <div class="field-row">
      <input id="pl-url" type="url" inputmode="url" placeholder="https://…" value="${esc(url)}" autocomplete="off">
      <button class="btn" id="pl-clip" title="Pegar del portapapeles">Pegar</button>
    </div>
    <div id="pl-report"></div>
    <div id="pl-actions" class="col-btns"></div>
  `);
  const input = $('#pl-url', s.el), report = $('#pl-report', s.el), actions = $('#pl-actions', s.el);
  let parsed = null, existing = work;

  const draw = (p = parsed, keepMode = false) => {
    parsed = p;
    if (!input.value.trim()) { report.innerHTML = ''; actions.innerHTML = ''; return; }
    if (!keepMode && !work && parsed) existing = analyzeUrl(parsed.url)?.existing || null;
    report.innerHTML = linkReportHTML(parsed);
    if (!parsed) { actions.innerHTML = ''; return; }
    const needsPick = parsed.mode === 'pick' || parsed.mode === 'confirm';
    let html = '';
    if (existing) {
      const ch = parsed.chapter;
      html += `<div class="match-card">${coverHTML(existing, 'xs')}<div><b>${esc(existing.title)}</b><div class="muted small">Ahora: ${esc(progressLabel(existing))}${ch != null ? ` → ${TYPES[existing.type].unit} ${ch}` : ''}</div></div></div>
        <button class="btn primary block" id="pl-update" ${needsPick ? 'disabled' : ''}>${ch != null ? 'Actualizar progreso' : 'Guardar link en esta obra'}</button>`;
      if (!work) html += `<button class="btn ghost block" id="pl-new">No es esta, crear obra nueva</button>`;
    } else {
      html += `<button class="btn primary block" id="pl-new" ${needsPick ? 'disabled' : ''}>Crear obra con este link</button>`;
    }
    if (needsPick) html += `<button class="link-btn small center" id="pl-skip">Guardar sin capítulo</button>`;
    actions.innerHTML = html;
  };

  const analyze = () => {
    const v = input.value.trim();
    draw(v ? parseLink(v, S.patterns) : null);
  };
  input.addEventListener('input', debounce(analyze, 200));
  bindLinkReport(report, () => parsed, (p, keep) => draw(p, keep));

  $('#pl-clip', s.el).onclick = async () => {
    try { input.value = (await navigator.clipboard.readText()).trim(); analyze(); }
    catch { input.focus(); toast('Mantén presionado el campo y elige "Pegar".'); }
  };

  actions.addEventListener('click', async (e) => {
    if (!parsed) return;
    const skip = e.target.closest('#pl-skip');
    if (skip) { parsed = { ...parsed, chapter: null, mode: 'manual' }; draw(parsed, true); return; }
    if (e.target.closest('#pl-update')) {
      const w = existing;
      const res = await applyLinkToWork(w, parsed);
      s.close();
      vibrate(15);
      if (res?.lower) {
        toast(`El link es del cap. ${res.to}, menor que tu progreso (${res.from}). Se guardó el link.`, {
          action: `Usar ${res.to}`, onAction: async () => { w.progress.chapter = res.to; await saveWork(w); render({ keepScroll: true }); },
        });
      } else toast(res ? `${w.title}: ${progressLabel(w)}` : `Link guardado en ${w.title}`, { icon: '✅' });
      if (!work) go('#/obra/' + w.id); else render({ keepScroll: true });
      // el link no dice el capítulo: se pregunta hasta dónde llegaste
      if (parsed.chapter == null && parsed.platform === 'web' && !TRACK_ONLY.includes(w.type)) whenSettled(() => setTimeout(() => openCheckIn(w, { mode: 'manual' }), 450));
    } else if (e.target.closest('#pl-new')) {
      const p = parsed;
      s.close();
      whenSettled(() => openEditor(null, { fromLink: p }));
    }
  });

  if (url) analyze();
  else setTimeout(() => input.focus(), 350);
}

const TYPE_HINTS = {
  manhwa: 'Ej.: Solo Leveling…', manga: 'Ej.: One Piece…', anime: 'Ej.: Frieren…', serie: 'Ej.: Stranger Things…', pelicula: 'Ej.: Interestelar…',
};
const TYPE_DESC = {
  manhwa: 'Cómics coreanos', manga: 'Cómics japoneses', anime: 'Series animadas', serie: 'Temporadas y episodios', pelicula: 'Para ver de una',
};

// ---------- hoja: ¿Qué quieres agregar? ----------
export function openAddChooser() {
  const s = openSheet(`
    <h3 class="sheet-title center">¿Qué quieres agregar?</h3>
    <div class="add-grid">
      ${Object.entries(TYPES).map(([k, t], i) => `<button class="add-tile type-${k}" data-add="${k}" style="--i:${i}">
        <span class="at-emoji">${t.emoji}</span><b>${t.label}</b><small>${TYPE_DESC[k]}</small></button>`).join('')}
      <button class="add-tile link-tile" data-act="paste" style="--i:5"><span class="at-emoji">🔗</span><b>Pegar link</b><small>De un capítulo</small></button>
    </div>
    <a class="btn ghost block" href="#/importar" data-act="import">${ICONS.upload} Importar marcadores de Chrome</a>`, { cls: 'chooser' });
  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-add]');
    const a = e.target.closest('[data-act]');
    if (t) { vibrate(10); s.close(); whenSettled(() => openEditor(null, { prefill: { type: t.dataset.add, status: TRACK_ONLY.includes(t.dataset.add) ? 'pendiente' : 'viendo' } })); }
    else if (a?.dataset.act === 'paste') { s.close(); whenSettled(() => openPasteSheet()); }
    else if (a?.dataset.act === 'import') { e.preventDefault(); go('#/importar'); }
  });
}

// ---------- hoja: Editor de obra ----------
export function openEditor(work = null, { fromLink = null, prefill = null } = {}) {
  const isNew = !work;
  const w = work ? JSON.parse(JSON.stringify(work)) : newWork(prefill || {});
  let pendingLink = null;
  if (fromLink) {
    w.title = w.title || fromLink.title || '';
    pendingLink = fromLink;
    if (fromLink.platform !== 'web') {
      w.type = fromLink.platform === 'crunchyroll' ? 'anime' : 'serie';
      if (w.type === 'serie') { w.platform = fromLink.platform; pendingLink = null; } // las series solo guardan la plataforma
    }
    if (fromLink.chapter != null) {
      if (w.type === 'serie') w.progress.episode = fromLink.chapter; else w.progress.chapter = fromLink.chapter;
    }
  }

  const s = openSheet(`
    <div class="sheet-head"><h3 class="sheet-title">${isNew ? 'Agregar obra' : 'Editar obra'}</h3><button class="icon-btn sm" data-x aria-label="Cerrar">${ICONS.close}</button></div>
    <div class="type-picker" id="ed-type" role="radiogroup" aria-label="Tipo">
      ${Object.entries(TYPES).map(([k, t], i) => `<button class="type-tile type-${k} ${w.type === k ? 'on' : ''}" data-type="${k}" role="radio" aria-checked="${w.type === k}" style="--i:${i}"><span class="tt-emoji">${t.emoji}</span><span class="tt-label">${t.label}</span></button>`).join('')}
    </div>
    <label class="field"><span>Nombre</span>
      <div class="ac-wrap">
        <input id="ed-title" value="${esc(w.title)}" placeholder="${TYPE_HINTS[w.type]}" autocomplete="off" enterkeyhint="search">
        <span class="ac-spin" id="ac-spin" hidden></span>
      </div>
    </label>
    <div id="ac-results" class="ac-results"></div>
    <div id="ed-info"></div>

    <div class="field"><span>Estado</span>
      <div class="chips wrap" id="ed-status">
        ${Object.entries(STATUSES).map(([k, st]) => `<button class="chip ${w.status === k ? 'on' : ''}" data-status="${k}"><span class="sdot" style="--c:${st.color}"></span>${statusLabel(k, w.type)}</button>`).join('')}
      </div>
    </div>

    <div id="ed-progress"></div>

    <div class="field"><span>Portada</span>
      <div class="cover-edit">
        <div id="ed-cover-prev">${coverHTML(w, 'sm')}</div>
        <div class="cover-actions">
          <input id="ed-cover" type="url" placeholder="Link de imagen (https://…)" value="${w.cover && !w.cover.startsWith('data:') ? esc(w.cover) : ''}">
          <div class="row-btns sm">
            <label class="btn sm">${ICONS.upload} Galería<input type="file" accept="image/*" id="ed-file" hidden></label>
            <button class="btn sm ghost" id="ed-cover-del">Quitar</button>
          </div>
        </div>
      </div>
    </div>

    <div class="field" id="ed-plat-field"><span>Dónde la ves</span>
      <div class="chips wrap" id="ed-plat">${STREAMING.map((k) => `<button class="chip ${w.platform === k ? 'on' : ''}" data-plat="${k}"><span class="sdot" style="--c:${PLATFORMS[k].color}"></span>${esc(PLATFORMS[k].name)}</button>`).join('')}</div>
    </div>

    <div class="field" id="ed-links-field"><span>Links (dónde lo ${TYPES[w.type].reading ? 'lees' : 'ves'})</span>
      <div id="ed-links"></div>
      <div class="field-row"><input id="ed-newlink" type="url" inputmode="url" placeholder="Pega un link…"><button class="btn sm" id="ed-addlink">Añadir</button></div>
      <div id="ed-linkreport"></div>
      <label class="mini chap-url"><small>Página de todos los capítulos (opcional: la app la deduce sola; ponla solo si "Ver capítulos" abre una página equivocada)</small>
        <input id="ed-chapters" type="url" inputmode="url" placeholder="https://…/manga/nombre-de-la-obra/" value="${esc(w.chaptersUrl || '')}"></label>
    </div>

    <div class="field inline"><span>Calificación</span>
      <div class="stars" id="ed-stars">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= w.rating ? 'on' : ''}" data-star="${n}" aria-label="${n} estrellas">${ICONS.star}</button>`).join('')}</div>
      <button class="icon-btn sm ${w.favorite ? 'on-fav' : ''}" id="ed-fav" aria-label="Favorito">${ICONS.heart}</button>
    </div>

    <div class="row-btns sticky-actions">
      <button class="btn ghost" data-x>Cancelar</button>
      <button class="btn primary" id="ed-save">${isNew ? 'Guardar obra' : 'Guardar cambios'}</button>
    </div>
  `, { cls: 'tall' });
  const el = s.el;

  // --- tipo ---
  $('#ed-type', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    w.type = b.dataset.type;
    $$('#ed-type button', el).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    vibrate(8);
    titleInput.placeholder = TYPE_HINTS[w.type];
    $$('#ed-status .chip', el).forEach((c) => { c.lastChild.textContent = statusLabel(c.dataset.status, w.type); });
    drawProgress();
    drawKind();
    if (titleInput.value.trim().length >= 2) doSearch();
  });

  // series y películas: plataforma en vez de links
  function drawKind() {
    const track = TRACK_ONLY.includes(w.type);
    $('#ed-plat-field', el).hidden = !track;
    $('#ed-links-field', el).hidden = track;
  }
  drawKind();
  $('#ed-plat', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-plat]');
    if (!c) return;
    w.platform = w.platform === c.dataset.plat ? '' : c.dataset.plat;
    $$('#ed-plat .chip', el).forEach((x) => x.classList.toggle('on', x.dataset.plat === w.platform));
  });

  // --- estado ---
  $('#ed-status', el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-status]');
    if (!c) return;
    w.status = c.dataset.status;
    $$('#ed-status .chip', el).forEach((x) => x.classList.toggle('on', x === c));
  });

  // --- progreso ---
  function drawProgress() {
    const box = $('#ed-progress', el);
    if (w.type === 'pelicula') { box.innerHTML = ''; return; }
    if (w.type === 'serie') {
      box.innerHTML = `<div class="field"><span>Progreso</span><div class="grid2">
        <label class="mini"><small>Temporada</small><input type="number" min="1" inputmode="numeric" id="ed-season" value="${w.progress.season || 1}"></label>
        <label class="mini"><small>Episodio</small><input type="number" min="0" inputmode="numeric" id="ed-episode" value="${w.progress.episode || 0}"></label>
      </div></div>`;
    } else {
      box.innerHTML = `<div class="field"><span>Progreso</span><div class="grid2">
        <label class="mini"><small>${TYPES[w.type].unitLong[0].toUpperCase() + TYPES[w.type].unitLong.slice(1)} actual</small><input type="number" min="0" step="any" inputmode="decimal" id="ed-chapter" value="${w.progress.chapter || 0}"></label>
        <label class="mini"><small>Total (opcional)</small><input type="number" min="0" inputmode="numeric" id="ed-total" value="${w.total || ''}" placeholder="?"></label>
      </div></div>`;
    }
  }
  drawProgress();

  // --- autocompletar ---
  const titleInput = $('#ed-title', el);
  const acBox = $('#ac-results', el);
  let acToken = 0, lastResults = [];
  const doSearch = async () => {
    const q = titleInput.value.trim();
    if (q.length < 2) { acBox.innerHTML = ''; return; }
    if (!navigator.onLine) { acBox.innerHTML = `<div class="ac-empty">Sin conexión: escribe los datos a mano.</div>`; return; }
    const token = ++acToken;
    $('#ac-spin', el).hidden = false;
    try {
      const res = await searchInfo(q, w.type);
      if (token !== acToken) return;
      lastResults = res;
      const srcs = [...new Set(res.map((r) => r.source))];
      acBox.innerHTML = res.length ? res.slice(0, 8).map((r, i) => `
        <button class="ac-item" data-ac="${i}" style="--i:${i}">
          <span class="ac-cover">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>
          <span class="ac-text"><b>${esc(r.title)}</b><small>${esc([r.year, r.extra, r.pubStatus].filter(Boolean).join(' · '))}</small><small class="ac-gen">${esc(r.genres.slice(0, 3).join(', '))}</small></span>
        </button>`).join('') + `<div class="ac-attr">${srcs.map((x) => esc(ATTRIBUTION[x].text)).join(' · ')}</div>`
        : `<div class="ac-empty">Sin resultados. Puedes escribir los datos y poner la portada a mano.</div>`;
    } catch {
      if (token === acToken) acBox.innerHTML = `<div class="ac-empty">No se pudo buscar ahora. Puedes llenar los datos a mano.</div>`;
    } finally {
      if (token === acToken) $('#ac-spin', el).hidden = true;
    }
  };
  titleInput.addEventListener('input', debounce(doSearch, 450));
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  acBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ac]');
    if (!b) return;
    const r = lastResults[+b.dataset.ac];
    w.title = r.title;
    titleInput.value = r.title;
    if (r.cover) w.cover = r.cover;
    w.synopsis = r.synopsis || w.synopsis;
    w.genres = r.genres?.length ? r.genres : w.genres;
    w.pubStatus = r.pubStatus || w.pubStatus;
    if (r.total) w.total = r.total;
    w.year = r.year || w.year || null;
    w.seasons = null;
    w.aliases = [...new Set([...(w.aliases || []), ...(r.altTitles || []), ...(pendingLink?.title && pendingLink.title !== r.title ? [pendingLink.title] : [])])];
    w.source = { api: r.source, id: r.sourceId, url: r.sourceUrl };
    if (r.pubStatus === 'En publicación' && w.status === 'viendo' && TYPES[w.type].reading) { /* se deja que el usuario decida */ }
    acBox.innerHTML = '';
    $('#ed-cover', el).value = w.cover.startsWith('data:') ? '' : w.cover;
    refreshCover();
    drawProgress();
    $('#ed-info', el).innerHTML = `<div class="info-pill">${ICONS.sparkle} Datos de ${esc(ATTRIBUTION[r.source].name)}: portada, sinopsis${w.genres.length ? ', géneros' : ''}${w.pubStatus ? ' y estado' : ''}</div>`;
    vibrate(10);
  });

  // --- portada ---
  const refreshCover = () => { $('#ed-cover-prev', el).innerHTML = coverHTML(w, 'sm'); };
  $('#ed-cover', el).addEventListener('change', (e) => { w.cover = e.target.value.trim(); refreshCover(); });
  $('#ed-file', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { w.cover = await imageToDataURL(f); $('#ed-cover', el).value = ''; refreshCover(); }
    catch { toast('No se pudo leer la imagen.'); }
  });
  $('#ed-cover-del', el).onclick = () => { w.cover = ''; $('#ed-cover', el).value = ''; refreshCover(); };

  // --- links ---
  if (pendingLink) w.links = [linkFromParsed(pendingLink), ...(w.links || [])];
  const drawLinks = () => {
    $('#ed-links', el).innerHTML = (w.links || []).map((l) => `
      <div class="link-edit" data-lid="${l.id}">
        <select data-lplat aria-label="Plataforma">${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}" ${l.platform === k ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        <input value="${esc(l.url)}" data-lurl type="url" aria-label="Link">
        <button class="icon-btn xs" data-ldel aria-label="Quitar">${ICONS.close}</button>
      </div>`).join('');
  };
  drawLinks();
  $('#ed-links', el).addEventListener('change', (e) => {
    const row = e.target.closest('[data-lid]');
    const l = w.links.find((x) => x.id === row.dataset.lid);
    if (e.target.matches('[data-lplat]')) l.platform = e.target.value;
    if (e.target.matches('[data-lurl]')) {
      const p = parseLink(e.target.value, S.patterns);
      Object.assign(l, p ? { url: p.url, host: p.host, slug: p.slug || '', rule: p.rule } : { url: e.target.value });
    }
  });
  $('#ed-links', el).addEventListener('click', (e) => {
    if (!e.target.closest('[data-ldel]')) return;
    const row = e.target.closest('[data-lid]');
    w.links = w.links.filter((x) => x.id !== row.dataset.lid);
    drawLinks();
  });
  let newParsed = null;
  const linkReport = $('#ed-linkreport', el);
  const newLinkInput = $('#ed-newlink', el);
  const showNewReport = (p) => { newParsed = p; linkReport.innerHTML = p ? linkReportHTML(p) : ''; };
  newLinkInput.addEventListener('input', debounce(() => showNewReport(newLinkInput.value.trim() ? parseLink(newLinkInput.value, S.patterns) : null), 250));
  bindLinkReport(linkReport, () => newParsed, (p) => showNewReport(p));
  $('#ed-addlink', el).onclick = () => {
    const p = newParsed || parseLink(newLinkInput.value, S.patterns);
    if (!p) { toast('Ese link no es válido.'); return; }
    w.links = [...(w.links || []), linkFromParsed(p)];
    if (!titleInput.value.trim() && p.title) { titleInput.value = p.title; w.title = p.title; }
    if (p.chapter != null) {
      const chEl = $('#ed-chapter', el), epEl = $('#ed-episode', el);
      if (chEl && p.chapter > (+chEl.value || 0)) chEl.value = p.chapter;
      if (epEl && p.chapter > (+epEl.value || 0)) epEl.value = p.chapter;
    }
    newLinkInput.value = ''; showNewReport(null); drawLinks();
  };

  // --- calificación y favorito ---
  $('#ed-stars', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-star]');
    if (!b) return;
    const n = +b.dataset.star;
    w.rating = w.rating === n ? 0 : n;
    $$('#ed-stars .star', el).forEach((st, i) => st.classList.toggle('on', i < w.rating));
  });
  $('#ed-fav', el).onclick = (e) => { w.favorite = !w.favorite; e.currentTarget.classList.toggle('on-fav', w.favorite); };

  el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) s.close(); });

  // --- guardar ---
  $('#ed-save', el).onclick = async () => {
    w.title = titleInput.value.trim();
    if (!w.title) { titleInput.focus(); titleInput.classList.add('shake'); setTimeout(() => titleInput.classList.remove('shake'), 500); toast('Escribe el nombre de la obra.'); return; }
    const cv = $('#ed-cover', el).value.trim();
    if (cv) w.cover = cv;
    const num = (id) => { const x = $(id, el); return x && x.value !== '' ? parseFloat(x.value) : null; };
    if (w.type === 'serie') {
      const season = num('#ed-season'), ep = num('#ed-episode');
      if (season != null) w.progress.season = Math.max(1, Math.round(season));
      if (ep != null) {
        const prev = work?.progress?.episode || 0;
        w.progress.episode = Math.max(0, Math.round(ep));
        if (isNew) w.progress.watched = Math.max(w.progress.watched || 0, w.progress.episode);
        else w.progress.watched = Math.max(0, (w.progress.watched || 0) + (w.progress.episode - prev));
      }
    } else if (w.type !== 'pelicula') {
      const ch = num('#ed-chapter'), tot = num('#ed-total');
      if (ch != null) w.progress.chapter = Math.max(0, ch);
      w.total = tot && tot > 0 ? Math.round(tot) : null;
    }
    // link pendiente sin añadir
    if (newLinkInput.value.trim()) $('#ed-addlink', el).click();
    // evitar duplicados al crear
    if (isNew) {
      const dup = S.works.find((x) => x.type === w.type && x.title.toLowerCase() === w.title.toLowerCase());
      if (dup && !confirm(`Ya tienes "${dup.title}". ¿Crear otra igual?`)) return;
    }
    if (TRACK_ONLY.includes(w.type)) {
      if (!w.platform) w.platform = (w.links || []).find((l) => STREAMING.includes(l.platform))?.platform || '';
      w.links = [];
    } else if (STREAMING.includes(w.platform) && !(w.links || []).length) {
      w.platform = '';
    }
    const chap = $('#ed-chapters', el)?.value.trim() || '';
    w.chaptersUrl = /^https?:\/\//i.test(chap) ? chap : '';
    const saved = await saveWork(w);
    // temporadas de TVmaze para saber cuántos episodios tiene cada una
    if (saved.type === 'serie' && saved.source?.api === 'tvmaze' && !saved.seasons && navigator.onLine) {
      tvmazeSeasons(saved.source.id).then((seasons) => { if (seasons.length) { saved.seasons = seasons; saved.seasonsAt = Date.now(); saveWork(saved, { touch: false }); } }).catch(() => {});
    }
    s.close();
    vibrate(15);
    if (isNew) {
      confetti(innerWidth / 2, innerHeight * 0.4, 20);
      toast(`"${saved.title}" agregada`, { icon: '🏛️', action: 'Ver', onAction: () => go('#/obra/' + saved.id) });
      render();
    } else {
      toast('Cambios guardados', { icon: '✅' });
      render({ keepScroll: true });
    }
  };

  if (isNew && !w.title) setTimeout(() => titleInput.focus(), 350);
  else if (isNew && w.title) doSearch();
}
