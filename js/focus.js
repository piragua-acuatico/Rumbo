// Modo enfoque: temporizador a pantalla completa + indicador flotante.
import { state, commit, save, getTask, logFocus, toggleTask } from './store.js';
import { esc, fmtClock, keyOf } from './utils.js';
import { morph } from './morph.js';
import { icon } from './icons.js';
import { haptic, confetti, toast } from './fx.js';
import { scheduleSync } from './push.js';

let visible = false;
let lastSecond = -1;
const PRESETS = [15, 25, 45, 60];
const R = 130, C = 2 * Math.PI * R;

const f = () => state.focus;
function remaining() {
  const x = f();
  if (!x) return 0;
  return x.running ? Math.max(0, (x.endsAt - Date.now()) / 1000) : x.remaining;
}

export function openFocus(taskId = null) {
  const cur = f();
  if (!cur || cur.finished || (taskId && cur.taskId !== taskId && !cur.running && cur.remaining === cur.total)) {
    const t = taskId ? getTask(taskId) : null;
    const total = Number(state.settings.focusDefault) * 60;
    state.focus = { taskId: t?.id || null, title: t?.title || '', total, remaining: total, running: false, endsAt: null, finished: false };
    save();
  }
  visible = true;
  render();
}

export function minimizeFocus() {
  const el = document.getElementById('focus');
  el.classList.add('out');
  setTimeout(() => { visible = false; el.classList.remove('out'); render(); }, 380);
}

function start() {
  const x = f();
  x.endsAt = Date.now() + x.remaining * 1000;
  x.running = true;
  haptic('heavy');
  save();
  scheduleSync(); // programa el aviso de "terminó tu sesión"
  render();
}
function pause() {
  const x = f();
  x.remaining = remaining();
  x.running = false;
  x.endsAt = null;
  haptic();
  save();
  scheduleSync(); // en pausa no hay fin que avisar
  render();
}
function addFive() {
  const x = f();
  if (x.running) x.endsAt += 300000; else x.remaining += 300;
  x.total += 300;
  haptic();
  save();
  scheduleSync(); // el fin se movió 5 minutos
  render();
}
function setPreset(min) {
  const x = f();
  x.total = x.remaining = min * 60;
  haptic();
  save();
  render();
}
function finish() {
  const x = f();
  const endedAt = x.endsAt || Date.now();
  // Los minutos cuentan para el día en que terminó la sesión.
  logFocus(x.total / 60, keyOf(new Date(endedAt)));
  // Si terminó hace horas (la app estuvo cerrada), se cierra sin celebrar.
  if (Date.now() - endedAt > 3 * 3600 * 1000) {
    state.focus = null;
    commit();
    render();
    return;
  }
  x.running = false;
  x.remaining = 0;
  x.finished = true;
  x.endsAt = null;
  commit();
  haptic('success');
  confetti({ originY: 0.45 });
  visible = true;
  render();
  toast('¡Sesión completa!', { sub: `${Math.round(x.total / 60)} min de enfoque`, icon: 'timer', tint: 'c-green' });
}
function stop() {
  const x = f();
  if (x && !x.finished) {
    const elapsed = (x.total - remaining()) / 60;
    if (elapsed >= 1) {
      logFocus(elapsed, keyOf(new Date()));
      toast('Sesión guardada', { sub: `${Math.round(elapsed)} min de enfoque`, icon: 'timer', tint: 'c-green' });
    }
  }
  state.focus = null;
  commit();
  const el = document.getElementById('focus');
  el.classList.add('out');
  setTimeout(() => { visible = false; el.classList.remove('out'); render(); }, 380);
}

export function focusAction(name, el) {
  switch (name) {
    case 'focus-start': start(); break;
    case 'focus-pause': pause(); break;
    case 'focus-plus': addFive(); break;
    case 'focus-preset': setPreset(Number(el.dataset.min)); break;
    case 'focus-min': minimizeFocus(); break;
    case 'focus-stop': stop(); break;
    case 'focus-again': state.focus.finished = true; openFocus(state.focus.taskId); break;
    case 'focus-done-task': {
      const t = getTask(f()?.taskId);
      if (t && !t.done) toggleTask(t);
      stop();
      break;
    }
  }
}

function overlayHTML() {
  const x = f();
  const rem = remaining();
  const fresh = !x.running && !x.finished && x.remaining === x.total;
  const task = x.taskId ? getTask(x.taskId) : null;
  const title = task?.title || x.title;

  if (x.finished) {
    return `
      <div class="focus-top"><span></span><button data-action="focus-stop">Cerrar</button></div>
      <div class="focus-main">
        <div class="focus-done-ic">${icon('check')}</div>
        <p class="focus-lbl">Sesión completa</p>
        <p class="focus-task">${Math.round(x.total / 60)} minutos de enfoque${title ? `<br><span style="opacity:.6;font-size:17px">${esc(title)}</span>` : ''}</p>
        <div style="display:grid;gap:10px;width:100%;max-width:340px">
          ${task && !task.done ? `<button class="btn primary block" data-action="focus-done-task">${icon('check')}Marcar la tarea como hecha</button>` : ''}
          <button class="btn block" data-action="focus-again">${icon('repeat')}Otra sesión</button>
        </div>
      </div>`;
  }

  return `
    <div class="focus-top">
      <button data-action="focus-min" aria-label="Minimizar">${icon('chevron-down')}Minimizar</button>
      <button data-action="focus-stop">${fresh ? 'Cancelar' : 'Terminar'}</button>
    </div>
    <div class="focus-main">
      <p class="focus-lbl">${x.running ? 'Enfocado' : fresh ? 'Enfoque' : 'En pausa'}</p>
      <p class="focus-task">${title ? esc(title) : 'Sesión libre'}</p>
      <div class="focus-ring">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <defs><linearGradient id="focusGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30D158"/><stop offset="1" stop-color="#B4F05C"/></linearGradient></defs>
          <circle class="track" cx="150" cy="150" r="${R}"/>
          <circle class="prog" cx="150" cy="150" r="${R}" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${(C * (1 - rem / x.total)).toFixed(1)}"/>
        </svg>
        <div class="focus-time"><b>${fmtClock(rem)}</b><span>de ${Math.round(x.total / 60)} min</span></div>
      </div>
      ${fresh ? `<div class="focus-presets">${PRESETS.map(m => `<button data-action="focus-preset" data-min="${m}" aria-pressed="${x.total === m * 60}">${m}<small>min</small></button>`).join('')}</div>` : ''}
      <div class="focus-controls">
        ${fresh ? '' : `<button class="small" data-action="focus-plus" aria-label="Sumar 5 minutos">+5</button>`}
        <button class="big" data-action="${x.running ? 'focus-pause' : 'focus-start'}" aria-label="${x.running ? 'Pausar' : 'Empezar'}">${icon(x.running ? 'pause' : 'play')}</button>
        ${fresh ? '' : `<button class="small" data-action="focus-stop" aria-label="Terminar">${icon('xmark')}</button>`}
      </div>
      <p class="focus-tip">${x.running ? 'Tip: activa el modo Concentración del iPhone y deja Rumbo abierta para que te avise al terminar.' : 'Elige cuánto tiempo y dale play. Una cosa a la vez.'}</p>
    </div>`;
}

function pillHTML() {
  const x = f();
  const rem = remaining();
  const c = 2 * Math.PI * 13;
  return `
    <svg class="fp-ring" viewBox="0 0 32 32" aria-hidden="true" style="transform:rotate(-90deg)">
      <circle cx="16" cy="16" r="13" stroke="rgba(48,209,88,.25)"/>
      <circle cx="16" cy="16" r="13" stroke="#30D158" stroke-linecap="round" style="stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - rem / x.total)).toFixed(1)};transition:stroke-dashoffset 1s linear"/>
    </svg>
    <b>${fmtClock(rem)}</b>
    <span>${x.running ? '' : 'En pausa · '}${esc(getTask(x.taskId)?.title || x.title || 'Enfoque')}</span>`;
}

export function render() {
  const el = document.getElementById('focus');
  const pill = document.getElementById('focusPill');
  const x = f();
  if (x && x.running && remaining() <= 0) { finish(); return; }
  if (x && visible) {
    if (el.hidden) { el.innerHTML = overlayHTML(); el.hidden = false; }
    else morph(el, overlayHTML());
  } else if (!el.hidden) {
    el.hidden = true;
    el.innerHTML = '';
  }
  const showPill = x && !visible && !x.finished;
  if (showPill) {
    if (pill.hidden) { pill.innerHTML = pillHTML(); pill.hidden = false; }
    else morph(pill, pillHTML());
  } else if (!pill.hidden) {
    pill.hidden = true;
  }
}

export const focusVisible = () => visible;

setInterval(() => {
  const x = f();
  if (!x || !x.running) return;
  const s = Math.ceil(remaining());
  if (s !== lastSecond) { lastSecond = s; render(); }
}, 250);
