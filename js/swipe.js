// Deslizar filas: a la derecha completa, a la izquierda muestra Mover/Borrar.
import { haptic } from './fx.js';

const OPEN_X = -156;      // ancho de los dos botones
const COMPLETE_X = 96;    // umbral para completar
let open = null;          // fila con acciones abiertas
let g = null;             // gesto en curso
let suppressClick = false;

function setX(content, x, animate) {
  content.style.transition = animate ? '' : 'none';
  content.style.transform = x ? `translateX(${x}px)` : '';
}

export function closeOpenRow() {
  if (!open) return;
  const row = open;
  open = null;
  setX(row.querySelector('.row-content'), 0, true);
  setTimeout(() => row.classList.remove('sw-left', 'sw-right'), 420);
}

export function initSwipe(onComplete) {
  document.addEventListener('pointerdown', e => {
    const content = e.target.closest('[data-swipe]');
    if (open && (!content || content.closest('.row') !== open)) {
      if (!e.target.closest('.swipe-trail')) { closeOpenRow(); suppressClick = true; setTimeout(() => (suppressClick = false), 350); }
    }
    if (!content || e.button > 0) return;
    const row = content.closest('.row');
    g = { row, content, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: open === row ? OPEN_X : 0, dx: 0, mode: null, armed: false };
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (g.mode === 'v') { g = null; return; }
      try { g.content.setPointerCapture(g.id); } catch { /* ok */ }
    }
    let x = g.base + dx;
    if (x > 0) {
      g.row.classList.add('sw-right'); g.row.classList.remove('sw-left');
      x = x > COMPLETE_X ? COMPLETE_X + (x - COMPLETE_X) * 0.35 : x;
      const armed = x >= COMPLETE_X;
      if (armed !== g.armed) { g.armed = armed; g.row.classList.toggle('sw-armed', armed); if (armed) haptic(); }
    } else {
      g.row.classList.add('sw-left'); g.row.classList.remove('sw-right');
      if (x < OPEN_X) x = OPEN_X + (x - OPEN_X) * 0.3;
    }
    g.dx = x;
    setX(g.content, x, false);
  });

  const end = e => {
    if (!g || e.pointerId !== g.id) return;
    const { row, content, dx, mode, armed } = g;
    g = null;
    if (mode !== 'h') return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 60);
    row.classList.remove('sw-armed');
    if (dx > 0 && armed) {
      setX(content, 0, true);
      setTimeout(() => row.classList.remove('sw-right'), 380);
      if (open === row) open = null;
      onComplete(row.dataset.id);
      return;
    }
    if (dx < OPEN_X / 2) {
      if (open && open !== row) closeOpenRow();
      open = row;
      setX(content, OPEN_X, true);
      haptic();
    } else {
      if (open === row) open = null;
      setX(content, 0, true);
      setTimeout(() => { if (open !== row) row.classList.remove('sw-left', 'sw-right'); }, 420);
    }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  // Evita que el final de un deslizamiento cuente como toque.
  document.addEventListener('click', e => {
    if (suppressClick && !e.target.closest('.swipe-trail')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}
