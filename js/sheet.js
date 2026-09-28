// Hojas modales estilo iOS (se cierran arrastrando) y alertas.
import { morph } from './morph.js';
import { icon } from './icons.js';
import { esc } from './utils.js';
import { haptic, autosize } from './fx.js';

let current = null;

function headHTML(opts) {
  const right = opts.right ? (typeof opts.right === 'function' ? opts.right() : opts.right) : null;
  return `
    <button class="sh-btn" data-action="sheet-close" aria-label="Cerrar">${icon('xmark')}</button>
    <h2>${esc(typeof opts.title === 'function' ? opts.title() : opts.title || '')}</h2>
    ${right
      ? `<button class="sh-btn done" data-action="${right.action}" aria-label="${right.label || 'Listo'}"${right.disabled ? ' disabled' : ''}>${icon(right.icon || 'check')}</button>`
      : '<span></span>'}`;
}

export function openSheet(opts) {
  if (current) closeSheet(true);
  const host = document.getElementById('sheetHost');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-action="sheet-close"></div>
    <section class="sheet${opts.auto ? ' auto' : ''}" role="dialog" aria-modal="true" aria-label="${esc(typeof opts.title === 'function' ? opts.title() : opts.title || '')}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-head"></div>
      <div class="sheet-body"></div>
    </section>`;
  host.appendChild(wrap);
  current = { ...opts, wrap, sheet: wrap.querySelector('.sheet') };
  refreshSheet();

  const app = document.getElementById('app');
  app.style.transformOrigin = `50% ${scrollY + innerHeight / 2}px`;
  document.documentElement.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  enableDrag(current);
  opts.onOpen?.(current.sheet);
  return current;
}

export function refreshSheet() {
  if (!current) return;
  if (current.alive && !current.alive()) { closeSheet(); return; }
  morph(current.sheet.querySelector('.sheet-head'), headHTML(current));
  morph(current.sheet.querySelector('.sheet-body'), current.render());
  autosize(current.sheet);
}

export function closeSheet(instant = false) {
  if (!current) return;
  const { wrap, onClose } = current;
  current = null;
  document.documentElement.classList.remove('sheet-open');
  if (instant) wrap.remove();
  else {
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 520);
  }
  onClose?.();
}

export const sheetOpen = () => !!current;
export const sheetKey = () => current?.key;

function enableDrag(ctx) {
  const { sheet, wrap } = ctx;
  const handle = [sheet.querySelector('.sheet-head'), sheet.querySelector('.sheet-grip')];
  const backdrop = wrap.querySelector('.sheet-backdrop');
  let startY = 0, dy = 0, t0 = 0, dragging = false, id = null;

  const down = e => {
    if (e.target.closest('button')) return;
    dragging = true; id = e.pointerId; startY = e.clientY; dy = 0; t0 = performance.now();
    sheet.classList.add('dragging');
    e.currentTarget.setPointerCapture(id);
  };
  const move = e => {
    if (!dragging || e.pointerId !== id) return;
    dy = e.clientY - startY;
    const y = dy > 0 ? dy : dy * 0.15;
    sheet.style.transform = `translateY(${y}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / 500));
  };
  const up = e => {
    if (!dragging || e.pointerId !== id) return;
    dragging = false;
    sheet.classList.remove('dragging');
    const v = dy / Math.max(1, performance.now() - t0);
    sheet.style.transform = '';
    backdrop.style.opacity = '';
    if (dy > 140 || (dy > 40 && v > 0.55)) { haptic(); closeSheet(); }
  };
  for (const h of handle) {
    h.addEventListener('pointerdown', down);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  }
}

/* ---------- Alertas ---------- */
export function alertDialog({ title, message = '', actions = [{ label: 'OK', style: 'default' }] }) {
  return new Promise(resolve => {
    const host = document.getElementById('alertHost');
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    wrap.innerHTML = `
      <div class="alert-backdrop"></div>
      <div class="alert" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="alert-body"><h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}</div>
        <div class="alert-actions${actions.length === 2 ? ' two' : ''}">
          ${actions.map((a, i) => `<button class="${a.style || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
        </div>
      </div>`;
    host.appendChild(wrap);
    const done = i => {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 200);
      resolve(i);
    };
    wrap.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); done(Number(b.dataset.i)); }));
    wrap.querySelector('.alert-backdrop').addEventListener('click', () => {
      const cancel = actions.findIndex(a => a.style === 'cancel');
      if (cancel >= 0) done(cancel);
    });
    const cancel = actions.findIndex(a => a.style === 'cancel');
    wrap.querySelector(`[data-i="${cancel >= 0 ? cancel : actions.length - 1}"]`)?.focus({ preventScroll: true, focusVisible: false });
  });
}
