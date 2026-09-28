// Efectos: vibración, avisos tipo Dynamic Island, confeti y animaciones de salida.
import { esc, reducedMotion } from './utils.js';
import { icon } from './icons.js';

/* ---------- Háptica ----------
   Android: navigator.vibrate. iPhone (iOS 18+): alternar un <input switch>
   oculto produce la vibración ligera del sistema. */
let hapticLabel = null;
export function haptic(kind = 'light') {
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'success' ? [12, 60, 18] : kind === 'heavy' ? 22 : 10); return; }
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      hapticLabel.appendChild(input);
      document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
    if (kind === 'success') setTimeout(() => hapticLabel.click(), 110);
  } catch { /* sin háptica */ }
}

/* ---------- Avisos (Dynamic Island) ---------- */
const MAX_TOASTS = 2;
export function toast(title, { sub = '', icon: ic = 'check', tint = 'accent', action = null, duration } = {}) {
  const host = document.getElementById('toasts');
  while (host.children.length >= MAX_TOASTS) host.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'island';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="island-icon" style="--tint: var(--${tint})">${icon(ic)}</span>
    <span class="island-text"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
    ${action ? `<button class="island-btn">${esc(action.label)}</button>` : ''}`;
  const close = () => {
    if (el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 380);
  };
  let used = false;
  if (action) el.querySelector('.island-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (used) return;
    used = true;
    close();
    action.run();
  });
  el.addEventListener('click', close);
  host.appendChild(el);
  setTimeout(close, duration || (action ? 5500 : 2800));
  return close;
}

/* ---------- Confeti ---------- */
const CONFETTI_COLORS = ['#FF375F', '#FF9F0A', '#FFD60A', '#30D158', '#64D2FF', '#5E5CE6', '#BF5AF2'];
export function confetti({ count = 110, originY = 0.35 } = {}) {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const v = 7 + Math.random() * 9;
    return {
      x: W / 2 + (Math.random() - 0.5) * 60, y: H * originY,
      vx: Math.cos(a) * v * (0.6 + Math.random()), vy: Math.sin(a) * v,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      c: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1400) / 700);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.3)) + 1);
      ctx.restore();
    }
    if (t < 2100) requestAnimationFrame(frame); else canvas.remove();
  })(start);
}

/* ---------- Salida de filas ---------- */
export function animateOut(el, dir = 'up') {
  return new Promise(resolve => {
    if (!el || reducedMotion()) { resolve(); return; }
    const h = el.getBoundingClientRect().height;
    el.style.height = `${h}px`;
    el.style.overflow = 'hidden';
    el.classList.add('leaving', `leaving-${dir}`);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.height = '0px';
      el.style.marginTop = '0px';
      el.style.marginBottom = '0px';
    }));
    setTimeout(resolve, 330);
  });
}

/* ---------- Pulso sobre un elemento ---------- */
export function pop(el, cls = 'pop') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/* ---------- Campos de texto que crecen con el contenido ---------- */
export function autosize(target) {
  const list = target?.tagName === 'TEXTAREA' ? [target] : [...(target || document).querySelectorAll('textarea')];
  for (const el of list) {
    if (!el.isConnected || el.offsetParent === null) continue;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }
}
