// Utilidades de interfaz: escape, toasts, hojas modales, animaciones.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function vibrate(ms = 10) {
  try { if (!reducedMotion()) navigator.vibrate?.(ms); } catch { /* sin vibración */ }
}

// Color estable a partir de un texto (para portadas genéricas e iniciales)
export function hueOf(str = '') {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export function initials(name = '') {
  const w = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

export function coverHTML(work, cls = '') {
  const h = hueOf(work.title);
  const ph = `<div class="cover-ph" style="--h:${h}"><span>${esc(initials(work.title))}</span></div>`;
  if (!work.cover) return `<div class="cover ${cls}">${ph}</div>`;
  return `<div class="cover ${cls}">${ph}<img src="${esc(work.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()"></div>`;
}

// ---------- toasts ----------
export function toast(msg, { action, onAction, timeout = 3500, icon = '' } = {}) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon ? `<span class="toast-ic">${icon}</span>` : ''}<span class="toast-msg">${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action)}</button>` : ''}`;
  host.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.querySelector('.toast-btn')?.addEventListener('click', () => { onAction?.(); close(); });
  setTimeout(close, action ? Math.max(timeout, 6000) : timeout);
  return close;
}

// ---------- hojas modales (bottom sheets) ----------
let sheetStack = [];
let ignorePops = 0;
export function openSheet(html, { onClose, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="sheet-grip" aria-hidden="true"></div><div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  void wrap.offsetHeight; // fuerza el estilo inicial para que la transición se vea
  wrap.classList.add('open');
  let closed = false, pushed = false;
  const api = {
    el: wrap.querySelector('.sheet-body'),
    get open() { return !closed; },
    close(fromPop = false) {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      sheetStack = sheetStack.filter((s) => s !== api);
      if (!sheetStack.length) document.body.classList.remove('no-scroll');
      setTimeout(() => wrap.remove(), 320);
      onClose?.();
      if (!fromPop && pushed) { ignorePops++; history.back(); }
    },
  };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => api.close());
  // arrastrar la barrita hacia abajo para cerrar
  const sheet = wrap.querySelector('.sheet');
  const grip = wrap.querySelector('.sheet-grip');
  let y0 = null, dy = 0;
  grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; sheet.style.transition = 'none'; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
  const end = () => { sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 90) api.close(); y0 = null; dy = 0; };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  sheetStack.push(api);
  whenSettled(() => { if (!closed) { history.pushState({ sheet: true }, ''); pushed = true; } });
  return api;
}
// Ejecuta fn cuando terminen los "atrás" pendientes del historial (evita carreras al navegar)
let settleQueue = [];
export function whenSettled(fn) {
  if (ignorePops > 0) settleQueue.push(fn); else fn();
}
function flushSettled() {
  while (ignorePops === 0 && settleQueue.length) settleQueue.shift()();
}
// El botón "atrás" de Android cierra la hoja abierta en vez de salir
window.addEventListener('popstate', () => {
  if (ignorePops) { ignorePops--; flushSettled(); return; }
  const top = sheetStack[sheetStack.length - 1];
  if (top) top.close(true);
});
export const sheetsOpen = () => sheetStack.length > 0;
export function closeAllSheets() { [...sheetStack].reverse().forEach((s) => s.close()); }

export function confirmDialog(title, text, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(`<h3 class="sheet-title">${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="row-btns"><button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`,
    { onClose: () => { if (!done) resolve(false); } });
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      done = true; resolve(b.dataset.r === '1'); s.close();
    });
  });
}

// ---------- animaciones ----------
export function bump(el) {
  if (!el || reducedMotion()) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// Número que "salta": el valor viejo sale hacia arriba y el nuevo entra desde abajo
export function rollNumber(el, value, dir = 1) {
  if (!el) return;
  const old = el.textContent;
  if (reducedMotion() || old === String(value)) { el.textContent = value; return; }
  el.innerHTML = `<span class="roll"><span class="roll-old ${dir > 0 ? 'up' : 'down'}">${esc(old)}</span><span class="roll-new ${dir > 0 ? 'up' : 'down'}">${esc(value)}</span></span>`;
  setTimeout(() => { el.textContent = value; }, 420);
  bump(el);
}

export function floatText(anchor, text = '+1') {
  if (!anchor || reducedMotion()) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = r.left + r.width / 2 + 'px';
  el.style.top = r.top + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

export function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 28) {
  if (reducedMotion()) return;
  const colors = ['#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#60a5fa'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 140;
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 60}px;--r:${Math.random() * 720 - 360}deg`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }
}

// Onda al tocar botones y chips
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.btn, .chip, .icon-btn, .cbtn, .fab, .plat-tile, .paste-btn, .qa-btn, .next-pick, .seg button, .tcard, .add-tile, .lg-chip, .fb-tile, .add-big');
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2.2;
  const rip = document.createElement('span');
  rip.className = 'ripple';
  rip.setAttribute('aria-hidden', 'true');
  rip.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  el.prepend(rip);
  setTimeout(() => rip.remove(), 650);
}, { passive: true });

// Mantener presionado (o clic derecho) sobre un elemento
export function onLongPress(root, selector, cb) {
  let timer = 0, start = null, fired = false;
  const fire = (el) => { if (fired) return; fired = true; vibrate(25); el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 300); cb(el); };
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(selector);
    fired = false;
    if (!el || e.button > 0) return;
    start = [e.clientX, e.clientY];
    el.classList.add('holding');
    timer = setTimeout(() => { el.classList.remove('holding'); fire(el); }, 480);
  });
  const cancel = () => { clearTimeout(timer); start = null; $$('.holding').forEach((x) => x.classList.remove('holding')); };
  root.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) cancel(); }, { passive: true });
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('scroll', cancel, { passive: true, capture: true });
  root.addEventListener('contextmenu', (e) => { const el = e.target.closest(selector); if (!el) return; e.preventDefault(); cancel(); fire(el); });
  // evita que el toque largo abra la obra al soltar
  root.addEventListener('click', (e) => { if (fired && e.target.closest(selector)) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
}

// Inclinación 3D al tocar/mover el puntero
export function tilt(el, max = 12) {
  // solo con mouse: en el celular el toque deformaba la portada
  if (!el || reducedMotion() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * max}deg) rotateX(${-y * max}deg) scale(1.02)`;
    el.style.setProperty('--gx', (x + 0.5) * 100 + '%');
    el.style.setProperty('--gy', (y + 0.5) * 100 + '%');
  };
  const reset = () => { el.style.transform = ''; };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', reset);
  el.addEventListener('pointerup', reset);
  el.addEventListener('pointercancel', reset);
}

export function relTime(ts) {
  if (!ts) return 'nunca';
  const d = Date.now() - ts, day = 864e5;
  if (d < 60e3) return 'hace un momento';
  if (d < 3600e3) return `hace ${Math.round(d / 60e3)} min`;
  if (d < day) return `hace ${Math.round(d / 3600e3)} h`;
  const days = Math.floor(d / day);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months < 12 ? `hace ${months} ${months === 1 ? 'mes' : 'meses'}` : `hace ${Math.floor(months / 12)} año(s)`;
}

export function readFile(file, as = 'text') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    as === 'dataURL' ? r.readAsDataURL(file) : r.readAsText(file);
  });
}

// Reduce una imagen de la galería para guardarla en el teléfono sin ocupar mucho
export async function imageToDataURL(file, maxW = 480, type = 'image/jpeg') {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxW / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(type, 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  tv: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  ball: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5 7 18.5M8 10 3.5 8.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24"><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.7M19 12.5a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5M12 20h.01"/></svg>',
};
