// Rumbo — arranque, render y eventos globales.
import { state, subscribe, prune, getTask, tasksFor, waterSlots, planTarget, loadProblem } from './store.js';
import { todayKey, nowMin, toMin, fmtTime } from './utils.js';
import { morph } from './morph.js';
import { run } from './actions.js';
import { ui } from './ui.js';
import { icon } from './icons.js';
import { toast, autosize } from './fx.js';
import { refreshSheet, closeSheet, sheetOpen } from './sheet.js';
import { initSwipe } from './swipe.js';
import { registerHandlers, completeTask } from './handlers.js';
import { renderNight, isNight } from './night.js';
import { render as renderFocus } from './focus.js';
import { openOnboarding } from './onboarding.js';
import { initUpdates } from './update.js';
import { viewToday } from './views/today.js';
import { viewTomorrow } from './views/tomorrow.js';
import { viewInbox } from './views/inbox.js';
import { viewProgress } from './views/progress.js';
import { viewSettings } from './views/settings.js';

const $ = s => document.querySelector(s);
const VIEWS = { hoy: viewToday, manana: viewTomorrow, pendientes: viewInbox, progreso: viewProgress, ajustes: viewSettings };
const TITLES = { hoy: 'Hoy', manana: 'Mañana', pendientes: 'Pendientes', progreso: 'Progreso', ajustes: 'Ajustes' };
const TAB_ICONS = {
  hoy: ['sun', 'sun-fill'], manana: ['moon', 'moon-fill'], pendientes: ['tray', 'tray'],
  progreso: ['chart', 'chart-fill'], ajustes: ['gear', 'gear-fill'],
};

/* ---------- Tema ---------- */
function applyTheme() {
  const s = state.settings;
  const root = document.documentElement;
  if (s.theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = s.theme;
  root.dataset.accent = s.accent;
}

/* ---------- Barra de pestañas ---------- */
function buildTabbar() {
  $('#tabs').innerHTML = `<span class="tab-ind" aria-hidden="true"></span>${ui.tabs.map(t => `
    <button data-action="go" data-tab="${t}" aria-label="${TITLES[t]}">
      <span class="off-i">${icon(TAB_ICONS[t][0])}</span><span class="on-i">${icon(TAB_ICONS[t][1])}</span>
      ${TITLES[t]}
    </button>`).join('')}`;
  $('#fab').innerHTML = icon('plus');
}

function updateTabbar() {
  const tabs = $('#tabs');
  tabs.style.setProperty('--ti', ui.tabs.indexOf(ui.tab));
  tabs.querySelectorAll('[data-tab]').forEach(b => {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  // Punto rojo en "Mañana" cuando ya es hora de planear.
  const needsPlan = nowMin() >= toMin(state.settings.planTime) && !state.planned[planTarget()];
  const btn = tabs.querySelector('[data-tab="manana"]');
  const badge = btn.querySelector('.tab-badge');
  if (needsPlan && !badge) btn.insertAdjacentHTML('beforeend', '<span class="tab-badge dot" aria-label="Pendiente de planear"></span>');
  if (!needsPlan && badge) badge.remove();
}

/* ---------- Animaciones controladas por JS (anillos, agua, barras) ---------- */
const liveDone = new WeakMap();
function syncLive(root) {
  const apply = (el, value, fn, delay = 0) => {
    const prev = liveDone.get(el);
    if (prev === value) return;
    liveDone.set(el, value);
    if (prev === undefined) {
      getComputedStyle(el).transform;
      setTimeout(() => requestAnimationFrame(() => fn(el)), delay);
    } else fn(el);
  };
  root.querySelectorAll('[data-ring]').forEach((el, i) => {
    const p = Number(el.dataset.ring), c = Number(el.dataset.c);
    apply(el, el.dataset.ring, e => {
      e.style.opacity = p > 0.001 ? '1' : '0';
      e.style.strokeDashoffset = String(c * (1 - p));
    }, 120 + i * 90);
  });
  root.querySelectorAll('[data-level]').forEach(el => {
    const lv = Number(el.dataset.level);
    apply(el, el.dataset.level, e => { e.style.transform = `translateY(${96 - lv * 92}px)`; }, 150);
  });
  root.querySelectorAll('[data-h]').forEach((el, i) => {
    const h = Number(el.dataset.h);
    apply(el, el.dataset.h, e => { e.style.transform = `scaleY(${Math.max(h, 0)})`; }, 80 + (i % 31) * 22);
  });
}

/* ---------- Render ---------- */
let lastTab = null;
function render() {
  const view = $('#view');
  const html = VIEWS[ui.tab]();
  if (lastTab !== ui.tab) {
    view.innerHTML = html;
    view.classList.remove('view-enter');
    void view.offsetWidth;
    view.classList.add('view-enter');
    lastTab = ui.tab;
  } else {
    morph(view, html);
  }
  syncLive(view);
  autosize(view);
  $('#navTitle').textContent = TITLES[ui.tab];
  updateTabbar();
  renderNight();
  renderFocus();
  refreshSheet();
}

function go(tab) {
  if (!VIEWS[tab]) return;
  if (tab === ui.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  ui.scroll[ui.tab] = scrollY;
  ui.tab = tab;
  history.replaceState(null, '', `#${tab}`);
  render();
  window.scrollTo(0, ui.scroll[tab] || 0);
  onScroll();
}

function onScroll() {
  document.body.classList.toggle('scrolled', scrollY > 52);
}

/* ---------- Avisos con la app abierta ---------- */
const fired = new Set(JSON.parse(sessionStorage.getItem('rumbo.fired') || '[]'));
function fire(key) {
  if (fired.has(key)) return false;
  fired.add(key);
  sessionStorage.setItem('rumbo.fired', JSON.stringify([...fired].slice(-300)));
  return true;
}

let lastMinute = -1, lastDay = todayKey(), lastNight = null;
function tick() {
  const k = todayKey(), m = nowMin();
  const night = isNight();
  if (m !== lastMinute || k !== lastDay || night !== lastNight) {
    lastMinute = m; lastDay = k; lastNight = night;
    render();
  }
  if (night || !state.onboarded) return;
  const lead = Number(state.settings.leadMin) || 0;
  for (const t of tasksFor(k)) {
    if (t.done || !t.time) continue;
    const start = toMin(t.time);
    if (m >= start - lead && m <= start + 1 && fire(`task|${t.id}|${k}`)) {
      const left = start - m;
      toast(t.title, { sub: left > 0 ? `Empieza en ${left} min · ${fmtTime(t.time)}` : 'Es ahora', icon: 'bell', tint: 'accent', duration: 7000 });
    }
  }
  for (const slot of waterSlots()) {
    if (m >= slot && m <= slot + 2 && fire(`water|${k}|${slot}`)) {
      toast('Hora de tomar agua', { sub: 'Un vaso y sigues', icon: 'drop-fill', tint: 'c-blue', duration: 8000,
        action: { label: `+${state.settings.glassMl} ml`, run: () => run('water-add', { dataset: { ml: state.settings.glassMl } }) } });
    }
  }
}

/* ---------- Resumen de la mañana (una vez al día) ---------- */
function morningBrief() {
  const k = todayKey(), m = nowMin();
  if (!state.onboarded || isNight() || m >= 12 * 60 || m < toMin(state.settings.nightEnd)) return;
  try {
    if (localStorage.getItem('rumbo.brief') === k) return;
    localStorage.setItem('rumbo.brief', k);
  } catch { return; }
  const list = tasksFor(k).filter(t => !t.done);
  if (!list.length) return;
  const imp = list.filter(t => t.important).length;
  const first = list.find(t => t.time);
  const parts = [`${list.length} ${list.length === 1 ? 'tarea' : 'tareas'}`];
  if (imp) parts.push(`${imp} ${imp === 1 ? 'importante' : 'importantes'}`);
  if (first) parts.push(`empiezas a las ${fmtTime(first.time)}`);
  setTimeout(() => toast(state.planned[k] ? 'Tu día ya está planeado' : 'Así se ve tu día', { sub: parts.join(' · '), icon: 'sun-fill', tint: 'c-orange', duration: 6000 }), 900);
}

/* ---------- Eventos globales ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  run(el.dataset.action, el, e);
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Escape') {
    if (sheetOpen()) closeSheet();
    return;
  }
  if (el.getAttribute?.('role') === 'button' && (e.key === 'Enter' || e.key === ' ') && el.dataset.action) {
    e.preventDefault();
    run(el.dataset.action, el, e);
    return;
  }
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  if (el.dataset?.enter) {
    e.preventDefault();
    const name = el.dataset.enter;
    if (!run(name, el, e)) run(`enter:${name}`, el, e);
  } else if (el.tagName === 'TEXTAREA' && ['task-title', 'routine-title'].includes(el.dataset.input)) {
    e.preventDefault();
    el.blur();
  } else if (el.tagName === 'INPUT' && el.dataset.change) {
    el.blur();
  }
});
document.addEventListener('input', e => {
  if (e.target.tagName === 'TEXTAREA') autosize(e.target);
  const name = e.target.dataset?.input;
  if (name) run(`input:${name}`, e.target, e);
});
document.addEventListener('change', e => {
  const name = e.target.dataset?.change;
  if (name) run(`change:${name}`, e.target, e);
});
document.addEventListener('submit', e => {
  const name = e.target.dataset?.form;
  if (!name) return;
  e.preventDefault();
  run(`submit:${name}`, e.target, e);
});
addEventListener('scroll', onScroll, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); tick(); morningBrief(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

/* ---------- Arranque ---------- */
prune();
applyTheme();
registerHandlers({ go, render, applyTheme });
initSwipe(id => { const t = getTask(id); if (t) completeTask(t, null); });
subscribe(render);
buildTabbar();
render();
if (!state.onboarded) openOnboarding(); else morningBrief();
if (loadProblem) toast('No se pudieron leer tus datos', { sub: 'Guardé una copia; restaura un respaldo desde Ajustes', icon: 'xmark', tint: 'c-red', duration: 9000 });
setInterval(tick, 10000);
setTimeout(tick, 1200);

initUpdates();
