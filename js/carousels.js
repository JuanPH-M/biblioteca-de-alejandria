import { reducedMotion } from './ui.js';

// El desplazamiento táctil sigue siendo nativo; el ratón y el teclado lo complementan.
export function enhanceCarousels(root) {
  root.querySelectorAll('.carousel').forEach((row) => {
    if (row.dataset.enhanced) return;
    row.dataset.enhanced = '1';
    row.tabIndex = 0;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-roledescription', 'carrusel');
    row.setAttribute('aria-label', row.closest('section')?.querySelector('h2')?.textContent || 'Continuar');
    const frame = document.createElement('div');
    frame.className = 'carousel-frame';
    row.before(frame);
    frame.append(row);
    const step = (direction) => row.scrollBy({ left: direction * Math.max(128, row.clientWidth * .7), behavior: reducedMotion() ? 'instant' : 'smooth' });
    const buttons = [-1, 1].map((direction) => {
      const button = document.createElement('button');
      button.className = `carousel-arrow ${direction < 0 ? 'prev' : 'next'}`;
      button.setAttribute('aria-label', direction < 0 ? 'Anterior' : 'Siguiente');
      button.textContent = direction < 0 ? '‹' : '›';
      button.addEventListener('click', () => step(direction));
      frame.append(button);
      return button;
    });
    const update = () => {
      buttons[0].disabled = row.scrollLeft <= 2;
      buttons[1].disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
      frame.classList.toggle('has-prev', !buttons[0].disabled);
      frame.classList.toggle('has-next', !buttons[1].disabled);
    };
    let pending = false;
    row.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; update(); });
    }, { passive: true });
    // ResizeObserver queda asociado solo al DOM de esta vista.
    const resize = new ResizeObserver(() => { if (row.isConnected) update(); else resize.disconnect(); });
    resize.observe(row);
    row.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') row.scrollTo({ left: e.key === 'Home' ? 0 : row.scrollWidth, behavior: reducedMotion() ? 'instant' : 'smooth' });
      else step(e.key === 'ArrowLeft' ? -1 : 1);
    });
    row.addEventListener('wheel', (e) => {
      if (!e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || row.scrollWidth <= row.clientWidth) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? row.clientWidth : 1);
    }, { passive: false });
    let drag = null, suppressClick = false;
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button')) return;
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, left: row.scrollLeft, moved: false };
    });
    row.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!(e.buttons & 1)) { end(); return; }
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        row.setPointerCapture(e.pointerId);
        row.classList.add('dragging');
      }
      e.preventDefault();
      row.scrollLeft = drag.left - dx;
    });
    const end = () => {
      if (!drag) return;
      suppressClick = drag.moved;
      const id = drag.id;
      drag = null;
      if (row.hasPointerCapture(id)) row.releasePointerCapture(id);
      row.classList.remove('dragging');
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    row.addEventListener('lostpointercapture', end);
    row.addEventListener('pointerleave', () => { if (!drag?.moved) drag = null; });
    row.addEventListener('dragstart', (e) => e.preventDefault());
    row.addEventListener('click', (e) => {
      if (!suppressClick) return;
      e.preventDefault(); e.stopImmediatePropagation(); suppressClick = false;
    }, true);

    // Alternativa a view-timeline sin lecturas de geometría por fotograma.
    let observer;
    if (!CSS.supports('animation-timeline: view(inline)')) {
      row.classList.add('carousel-fallback');
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) entry.target.classList.toggle('is-visible', entry.intersectionRatio >= .85);
      }, { root: row, threshold: [0, .85, 1] });
      row.querySelectorAll('.c-item').forEach((item) => observer.observe(item));
    }
    const cleanup = new MutationObserver(() => {
      if (row.isConnected) return;
      observer?.disconnect(); resize.disconnect(); cleanup.disconnect();
    });
    cleanup.observe(root, { childList: true });
    update();
  });
}
