// Rumbo — arranque, navegación, render y eventos globales.
import { state, subscribe, prune, getTask, tasksFor, waterSlots, planTarget, loadProblem } from './store.js';
import { todayKey, nowMin, toMin, fmtTime, esc, reducedMotion } from './utils.js';
import { morph } from './morph.js';
import { run } from './actions.js';
import { ui, parseRoute } from './ui.js';
import { icon } from './icons.js';
import { emptyState } from './components.js';
import { toast, autosize, confetti } from './fx.js';
import { refreshSheet, closeSheet, sheetOpen } from './sheet.js';
import { initSwipe } from './swipe.js';
import { registerHandlers, completeTask } from './handlers.js';
import { renderNight, isNight } from './night.js';
import { render as renderFocus } from './focus.js';
import { render as renderMission } from './sleep.js';
import { onPhotosReady } from './photos.js';
import { checkAchievements } from './achievements.js';
import { openOnboarding } from './onboarding.js';
import { initUpdates } from './update.js';
import { scheduleSync, syncPush, pushStatus, updateBadge, whenPushReady } from './push.js';
import { viewToday } from './views/today.js';
import { viewPlan } from './views/plan.js';
import { viewDiary } from './views/diary.js';
import { viewCrossfit } from './views/crossfit.js';
import { viewProfile, PROFILE_PAGES } from './views/profile.js';

const $ = s => document.querySelector(s);
const VIEWS = { hoy: viewToday, plan: viewPlan, diario: viewDiary, crossfit: viewCrossfit, perfil: viewProfile };
const TITLES = { hoy: 'Hoy', plan: 'Plan', diario: 'Diario', crossfit: 'CrossFit', perfil: 'Perfil' };
const TAB_ICONS = {
  hoy: ['sun', 'sun-fill'], plan: ['calendar-check', 'calendar-check-fill'], diario: ['book', 'book-fill'],
  crossfit: ['dumbbell', 'dumbbell-fill'], perfil: ['person', 'person-fill'],
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
  // Punto rojo en "Plan" cuando ya es hora de planear.
  const needsPlan = nowMin() >= toMin(state.settings.planTime) && !state.planned[planTarget()];
  const btn = tabs.querySelector('[data-tab="plan"]');
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
const routeKey = () => `${ui.tab}/${ui.sub || ''}`;
const page = () => (ui.tab === 'perfil' && ui.sub && PROFILE_PAGES[ui.sub]) || null;

let lastRoute = null;
let enterAnim = 'view-enter';
function render() {
  if (ui.sub && !page()) ui.sub = null;
  const view = $('#view');
  let html;
  try {
    html = page() ? page()[1]() : VIEWS[ui.tab]();
  } catch (err) {
    // Si una pantalla falla, se muestra un aviso en lugar de quedar en blanco.
    console.error(err);
    html = `<div class="list" data-key="view-error" style="margin-top:24px">${emptyState({
      ic: 'xmark', tint: 'c-red', title: 'Esta pantalla tuvo un problema',
      text: `Tus datos están a salvo. Prueba otra pestaña o vuelve a abrir Rumbo. (${esc(err.message)})`,
      key: 'view-error-empty',
    })}</div>`;
  }
  if (lastRoute !== routeKey()) {
    view.innerHTML = html;
    view.classList.remove('view-enter', 'view-push', 'view-pop');
    void view.offsetWidth;
    if (enterAnim) view.classList.add(enterAnim);
    lastRoute = routeKey();
  } else {
    morph(view, html);
  }
  syncLive(view);
  autosize(view);
  $('#navTitle').textContent = page() ? page()[0] : TITLES[ui.tab];
  $('#navBack').hidden = !ui.sub;
  $('#navBack').lastChild.textContent = TITLES[ui.from] || 'Perfil';
  updateTabbar();
  renderNight();
  renderFocus();
  renderMission();
  refreshSheet();
  updateBadge();
}

/* ---------- Navegación ----------
   go('perfil/agua') entra a una subpantalla (desliza desde la derecha),
   back() vuelve (desliza hacia la derecha) y cambiar de pestaña hace un fundido. */
let navSeq = 0;
function navigate(next, dir) {
  ui.scroll[routeKey()] = scrollY;
  // Una subpantalla que no existe (o fuera del Perfil) lleva a la raíz de la pestaña.
  const tab = next.tab || ui.tab;
  if (next.sub && !(tab === 'perfil' && PROFILE_PAGES[next.sub])) next.sub = null;
  const seq = ++navSeq;
  const update = () => {
    Object.assign(ui, next);
    history.replaceState(null, '', `#${ui.tab}${ui.sub ? `/${ui.sub}` : ''}`);
    render();
    window.scrollTo(0, dir === 'push' ? 0 : ui.scroll[routeKey()] || 0);
    onScroll();
  };
  const root = document.documentElement;
  // Con View Transitions (Safari 18+) la pantalla vieja y la nueva se deslizan juntas.
  if (dir !== 'tab' && document.startViewTransition && !reducedMotion()) {
    enterAnim = null;
    root.classList.add(`nav-${dir}`);
    const t = document.startViewTransition(update);
    // Si otra navegación empezó mientras tanto, esa limpia lo suyo.
    t.finished.finally(() => {
      if (seq !== navSeq) return;
      root.classList.remove('nav-push', 'nav-pop');
      enterAnim = 'view-enter';
    });
  } else {
    root.classList.remove('nav-push', 'nav-pop');
    enterAnim = dir === 'tab' ? 'view-enter' : `view-${dir}`;
    update();
    enterAnim = 'view-enter';
  }
}

function go(target, { seg } = {}) {
  const r = parseRoute(target);
  if (seg) r.planSeg = seg;
  const sameTab = r.tab === ui.tab;
  if (sameTab && r.sub === ui.sub) {
    if (r.planSeg && r.planSeg !== ui.planSeg) { ui.planSeg = r.planSeg; render(); }
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const next = { tab: r.tab, sub: r.sub };
  // Al entrar al Plan desde otra pestaña se vuelve a sugerir según la hora (ritual de noche, pendientes de día).
  if (r.planSeg) next.planSeg = r.planSeg;
  else if (r.tab === 'plan' && !sameTab) next.planSeg = null;
  // Tocar la pestaña activa estando en una subpantalla vuelve al inicio de la sección.
  const dir = r.sub && (!sameTab || !ui.sub) ? 'push' : sameTab && !r.sub ? 'pop' : 'tab';
  // Si se entra a una subpantalla desde otra pestaña, "volver" regresa a esa pestaña.
  next.from = dir === 'push' && !sameTab ? ui.tab : r.sub ? ui.from : null;
  navigate(next, dir);
}

function back() {
  if (!ui.sub) return;
  if (ui.from) navigate({ tab: ui.from, sub: null, from: null }, 'pop');
  else navigate({ sub: null }, 'pop');
}

function onScroll() {
  document.body.classList.toggle('scrolled', scrollY > 52);
}

// Deslizar desde el borde izquierdo para volver, como en iOS.
let edge = null;
const overlayOpen = () => sheetOpen() || !!$('.alert-wrap') || ['focus', 'night', 'mission', 'onboarding'].some(id => !$(`#${id}`).hidden);
document.addEventListener('pointerdown', e => {
  const onPage = e.target.closest?.('#view, .navbar');
  edge = ui.sub && e.clientX < 24 && onPage && !overlayOpen() ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
}, { passive: true });
document.addEventListener('pointermove', e => {
  if (!edge || e.pointerId !== edge.id) return;
  const dx = e.clientX - edge.x, dy = Math.abs(e.clientY - edge.y);
  if (dy > 50) edge = null;
  else if (dx > 70) { edge = null; back(); }
}, { passive: true });
document.addEventListener('pointerup', () => { edge = null; }, { passive: true });


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
  // Con notificaciones reales activas, los avisos llegan por el iPhone: no se duplican aquí.
  if (night || !state.onboarded || pushStatus() === 'on') return;
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); tick(); morningBrief(); syncPush(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

/* ---------- Arranque ---------- */
prune();
applyTheme();
registerHandlers({ go, back, render, applyTheme });
initSwipe(id => { const t = getTask(id); if (t) completeTask(t, null); });
subscribe(render);
subscribe(scheduleSync);
// Logros: se revisan un momento después de cada cambio; al desbloquear uno, confeti (un hito).
let achTimer = null;
subscribe(() => {
  clearTimeout(achTimer);
  achTimer = setTimeout(() => {
    const fresh = checkAchievements();
    if (!fresh.length) return;
    confetti({ originY: 0.35 });
    fresh.forEach((a, i) => setTimeout(() => toast(`Logro: ${a.title}`, { sub: a.desc, icon: 'trophy', tint: 'c-yellow', duration: 6000 }), i * 1200));
    render();
  }, 700);
});
checkAchievements(); // la primera vez marca en silencio lo que ya habías logrado
buildTabbar();
render();
if (!state.onboarded) openOnboarding(); else morningBrief();
if (loadProblem) toast('No se pudieron leer tus datos', { sub: 'Guardé una copia; restaura un respaldo desde tu Perfil', icon: 'xmark', tint: 'c-red', duration: 9000 });
setInterval(tick, 10000);
setTimeout(tick, 1200);

initUpdates();
syncPush();
whenPushReady().then(render); // habilita el botón "Activar notificaciones"
onPhotosReady(render);        // las fotos del diario se cargan aparte y redibujan al llegar
