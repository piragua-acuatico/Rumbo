// Sueño y despertador.
//
// Rumbo no hace sonar nada: le pide a la app Atajos que ponga la alarma del RELOJ del
// iPhone (suena bloqueado, en silencio y sin gastar batería). Al despertar, la misión
// de 5 operaciones apaga la alarma de respaldo y registra cuánto dormiste.
//
// Atajos que necesita (ver la guía "atajos"):
//   «Rumbo Alarma»  recibe una hora por línea, borra las alarmas "Rumbo" y crea las nuevas.
//   «Rumbo Apagar»  borra las alarmas "Rumbo".
import { state, commit, save, tasksFor } from './store.js';
import { todayKey, addDays, parseKey, toMin, fromMin, fmtTime, fmtDur, esc, plural } from './utils.js';
import { morph } from './morph.js';
import { icon } from './icons.js';
import { haptic, toast } from './fx.js';
import { syncPush } from './push.js';

const SHORTCUT_SET = 'Rumbo Alarma';
const SHORTCUT_OFF = 'Rumbo Apagar';
const EARLY = 60 * 60e3;     // la misión se puede hacer desde 1 h antes de la alarma
const LATE = 6 * 3600e3;     // pasadas 6 h, una alarma sin misión se da por vencida
const QUESTIONS = 5;

/* ---------- Horas ---------- */
export const at = (key, time) => { const d = parseKey(key); d.setMinutes(toMin(time)); return d.getTime(); };
export const wakeTimeFor = k => state.wakeFor[k] || state.settings.wakeTime;
// La "próxima mañana": hoy si tu hora de despertar de hoy aún no llega (y no hiciste la misión); si no, mañana.
export function wakeKey(now = Date.now()) {
  const t = todayKey();
  return at(t, wakeTimeFor(t)) > now && !state.sleep.log[t] ? t : addDays(t, 1);
}
// "Crear alarma" de Atajos no lleva fecha: suena la próxima vez que el reloj marque esa hora.
// Por eso solo se puede poner una alarma que caiga dentro de las próximas 24 horas.
export function alarmWindow(k, time = wakeTimeFor(k), now = Date.now()) {
  const ts = at(k, time);
  return { ok: ts > now && ts - now <= 24 * 3600e3, past: ts <= now, ts };
}
const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const backupTime = a => fromMin(toMin(a.time) + a.backup);

// ¿La alarma de ese día ya está puesta con esa hora?
export function alarmFor(k) {
  const a = state.sleep.alarm;
  return a && a.key === k ? { ...a, stale: a.time !== wakeTimeFor(k) } : null;
}

/* ---------- Atajos ---------- */
function runShortcut(name, text) {
  const input = text == null ? '' : `&input=text&text=${encodeURIComponent(text)}`;
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}${input}`;
}

// Debe llamarse desde un toque: así iOS deja abrir Atajos. Devuelve false si la hora no cae
// en las próximas 24 h (el Reloj la pondría en otro día).
export function setAlarm(k, time = wakeTimeFor(k)) {
  if (!alarmWindow(k, time).ok) return false;
  const backup = state.settings.alarmBackup;
  state.wakeFor[k] = time;
  state.sleep.alarm = { key: k, time, backup, setAt: Date.now() };
  commit();
  syncPush(true);
  runShortcut(SHORTCUT_SET, [time, ...(backup ? [backupTime(state.sleep.alarm)] : [])].join('\n'));
  return true;
}
export const alarmsOff = () => runShortcut(SHORTCUT_OFF);

// Prueba: una alarma en 2 minutos (y la de mañana, si ya estaba puesta, para no borrarla).
export function testAlarm() {
  const when = hhmm(Date.now() + 2 * 60e3);
  const a = state.sleep.alarm;
  const keep = a && at(a.key, a.time) > Date.now() ? [a.time, ...(a.backup ? [backupTime(a)] : [])] : [];
  runShortcut(SHORTCUT_SET, [when, ...keep].join('\n'));
  return when;
}

/* ---------- Acostarse ---------- */
export function goToBed() {
  const k = wakeKey();
  state.sleep.bed = { key: k, at: Date.now() };
  haptic('success');
  const a = alarmFor(k);
  if (state.settings.alarm && (!a || a.stale) && alarmWindow(k).ok) {
    toast('Que descanses', { sub: `Poniendo tu alarma de las ${fmtTime(wakeTimeFor(k))}…`, icon: 'moon-fill', tint: 'c-indigo' });
    setAlarm(k);
    return true;
  } else {
    commit();
    toast('Que descanses', { sub: a ? `Tu alarma suena a las ${fmtTime(a.time)}` : 'Guardé tu hora de dormir', icon: 'moon-fill', tint: 'c-indigo' });
    return false;
  }
}

// Sin alarma con misión: "ya me desperté" anota la mañana igual.
export function wakeUpNow() {
  const k = todayKey();
  logNight(k, Date.now(), 0, 0);
  commit();
  haptic('success');
}

function logNight(k, wake, errors, secs) {
  const bed = state.sleep.bed?.key === k ? state.sleep.bed.at : null;
  state.sleep.log[k] = { bed: bed && bed < wake && wake - bed < 20 * 3600e3 ? bed : null, wake, errors, secs };
  state.sleep.bed = null;
}

export const nightMinutes = n => (n?.bed ? Math.round((n.wake - n.bed) / 60e3) : null);

/* ---------- ¿Toca la misión? ---------- */
export function missionPending(now = Date.now()) {
  const a = state.sleep.alarm;
  if (!a || !state.settings.alarm || state.sleep.log[a.key]) return null;
  const ts = at(a.key, a.time);
  if (now < ts - EARLY || now > ts + LATE) return null;
  return { ...a, ts, forced: now >= ts };
}

// Limpieza: alarmas vencidas sin misión y "me voy a dormir" de noches pasadas.
function tidy(now = Date.now()) {
  let changed = false;
  const a = state.sleep.alarm;
  if (a && (now > at(a.key, a.time) + LATE || state.sleep.log[a.key])) { state.sleep.alarm = null; changed = true; }
  const b = state.sleep.bed;
  if (b && now - b.at > 20 * 3600e3) { state.sleep.bed = null; changed = true; }
  if (changed) save();
}

/* ---------- La misión ---------- */
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function problem(type) {
  switch (type) {
    case '+': { const a = rnd(24, 89), b = rnd(13, 79); return { type, q: `${a} + ${b}`, a: a + b }; }
    case '−': { const a = rnd(52, 99), b = rnd(14, a - 9); return { type, q: `${a} − ${b}`, a: a - b }; }
    case '×': { const a = rnd(6, 14), b = rnd(3, 9); return { type, q: `${a} × ${b}`, a: a * b }; }
    default: { const b = rnd(3, 9), r = rnd(4, 14); return { type: '÷', q: `${b * r} ÷ ${b}`, a: r }; }
  }
}
function newMission(key) {
  const kinds = ['+', '−', '×', '÷'];
  const types = [...kinds, kinds[rnd(0, 3)]].sort(() => Math.random() - 0.5);
  return { key, list: types.map(problem), i: 0, input: '', errors: 0, start: Date.now(), wrong: 0, done: null };
}

let mission = null;      // la misión en curso (solo en memoria: si cierras la app, empieza de nuevo)
let manual = false;      // abierta desde "¿Ya despierto?" antes de la alarma
let laterUntil = 0;      // "ahora no": se esconde 10 minutos

export function openMission() { manual = true; laterUntil = 0; render(); }

export function missionAction(name, el) {
  if (name === 'mission-later') {
    laterUntil = Date.now() + 10 * 60e3;
    manual = false;
    const p = missionPending();
    toast('Vuelve en 10 minutos', { sub: p?.backup ? `Tu alarma de respaldo (${fmtTime(backupTime(p))}) sigue puesta` : 'La misión te espera', icon: 'alarm', tint: 'c-orange' });
    render();
    return;
  }
  if (name === 'mission-off') { mission.done.off = true; haptic(); alarmsOff(); render(); return; }
  if (name === 'mission-close') {
    const left = mission?.done ? pendingAlarms(mission.done) : null;
    if (left) toast(left.main ? 'Tu alarma sigue puesta' : 'Tu alarma de respaldo sigue puesta', { sub: `Sonará a las ${fmtTime(hhmm(left.next))}`, icon: 'alarm', tint: 'c-orange', duration: 6000 });
    mission = null; manual = false;
    render();
    return;
  }
  if (!mission || mission.done) return;
  const k = el?.dataset.k;
  if (k === 'del') { mission.input = mission.input.slice(0, -1); haptic(); render(); return; }
  if (k !== 'ok') {
    if (mission.input.length < 4) mission.input += k;
    haptic();
    render();
    return;
  }
  if (!mission.input) return;
  const p = mission.list[mission.i];
  if (Number(mission.input) === p.a) {
    mission.i++;
    mission.input = '';
    haptic('success');
    if (mission.i >= QUESTIONS) complete(); else render();
  } else {
    // Error: otra operación del mismo tipo, y no cuenta.
    mission.errors++;
    mission.wrong++;
    mission.list[mission.i] = problem(p.type);
    mission.input = '';
    haptic('heavy');
    render();
  }
}

function complete() {
  const a = state.sleep.alarm;
  const wake = Date.now();
  logNight(mission.key, wake, mission.errors, Math.round((wake - mission.start) / 1000));
  state.sleep.alarm = null;
  commit();
  syncPush(true); // cancela los avisos de "resuelve tu misión"
  // Quita de la pantalla bloqueada los avisos de la alarma que ya llegaron.
  navigator.serviceWorker?.ready.then(r => r.getNotifications()).then(ns => ns.forEach(n => n.tag?.startsWith('alarma') && n.close())).catch(() => {});
  mission.done = {
    night: state.sleep.log[mission.key],
    mainTs: a ? at(a.key, a.time) : 0,
    backupTs: a?.backup ? at(a.key, a.time) + a.backup * 60e3 : 0,
    off: false,
  };
  render();
}

// Alarmas del Reloj que aún no han sonado después de la misión.
function pendingAlarms(d, now = Date.now()) {
  if (d.off) return null;
  const main = d.mainTs > now, backup = d.backupTs > now;
  return main || backup ? { main, next: main ? d.mainTs : d.backupTs } : null;
}

/* ---------- Pantalla ---------- */
function missionHTML(p) {
  const m = mission;
  const cur = m.list[m.i];
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return `
    <div class="mission-inner">
      <div class="mission-top">
        <span class="mission-tag">${icon('alarm')}${p.forced ? `Alarma de las ${fmtTime(p.time)}` : `Tu alarma: ${fmtTime(p.time)}`}</span>
        ${p.forced ? '<button class="mission-later" data-action="mission-later">Ahora no</button>' : '<button class="mission-later" data-action="mission-close">Cerrar</button>'}
      </div>
      <h1>${p.forced ? 'Buenos días' : '¿Ya despierto?'}</h1>
      <p class="mission-lead">Resuelve ${QUESTIONS} operaciones para ${p.backup ? 'apagar la alarma de respaldo' : 'empezar tu día'}.</p>
      <div class="mission-dots" aria-label="${m.i} de ${QUESTIONS}">${Array.from({ length: QUESTIONS }, (_, i) => `<i class="${i < m.i ? 'on' : i === m.i ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="mission-q${m.wrong ? ' wrong' : ''}" data-key="q-${m.i}-${m.wrong}" aria-live="polite">${cur.q.replace(/ ([+−×÷]) /, ' <span>$1</span> ')}</div>
      <div class="mission-a${m.input ? '' : ' empty'}">${m.input || '?'}</div>
      <div class="keypad">
        ${keys.map(k => `<button data-action="mission-key" data-k="${k}" class="${k === 'ok' ? 'ok' : k === 'del' ? 'del' : ''}" aria-label="${k === 'ok' ? 'Comprobar' : k === 'del' ? 'Borrar' : k}">${k === 'ok' ? icon('check') : k === 'del' ? icon('backspace') : k}</button>`).join('')}
      </div>
      ${m.errors ? `<p class="mission-err">${plural(m.errors, 'error', 'errores')} · cada error trae otra operación</p>` : ''}
    </div>`;
}

function doneHTML() {
  const d = mission.done;
  const alarmsLeft = pendingAlarms(d);
  const n = d.night;
  const mins = nightMinutes(n);
  const name = state.settings.name ? `, ${esc(state.settings.name)}` : '';
  const left = tasksFor(todayKey()).filter(t => !t.done);
  const first = left.find(t => t.time);
  const goal = state.settings.sleepGoal * 60;
  return `
    <div class="mission-inner done">
      <div class="mission-sun">${icon('sun-fill')}</div>
      <h1>¡Buenos días${name}!</h1>
      <p class="mission-sleep">${mins != null ? `Dormiste <b>${fmtDur(mins)}</b>` : `Te despertaste a las <b>${fmtTime(hhmm(n.wake))}</b>`}</p>
      ${mins != null ? `<p class="mission-lead">${mins >= goal ? 'Cumpliste tu meta de sueño 💪' : `Te faltaron ${fmtDur(goal - mins)} para tu meta`} · de <span class="nw">${fmtTime(hhmm(n.bed))}</span> a <span class="nw">${fmtTime(hhmm(n.wake))}</span></p>` : '<p class="mission-lead">Anoche no tocaste “Me voy a dormir”, así que no sé a qué hora te acostaste.</p>'}
      <div class="mission-day">
        ${icon('calendar-check')}
        <span>${left.length ? `Hoy tienes ${plural(left.length, 'tarea', 'tareas')}${first ? ` · la primera a las <span class="nw">${fmtTime(first.time)}</span>` : ''}` : 'Hoy no tienes tareas planeadas'}</span>
      </div>
      <div class="mission-actions">
        ${alarmsLeft ? `<button class="btn primary block" data-action="mission-off">${icon('alarm')}${alarmsLeft.main ? 'Apagar mis alarmas' : 'Apagar la alarma de respaldo'}</button>` : ''}
        <button class="btn ${alarmsLeft ? 'plain' : 'primary'} block" data-action="mission-close">Ver mi día</button>
      </div>
      <p class="mission-stats">Misión en ${fmtDur(Math.max(1, Math.round(n.secs / 60)))}${n.errors ? ` · ${plural(n.errors, 'error', 'errores')}` : ' · sin errores'}</p>
    </div>`;
}

export function render() {
  const el = document.getElementById('mission');
  if (!el) return;
  tidy();
  let html = '';
  if (mission?.done) {
    html = doneHTML();
  } else {
    const p = missionPending();
    if (p && ((p.forced && Date.now() > laterUntil) || manual)) {
      if (!mission || mission.key !== p.key) mission = newMission(p.key);
      html = missionHTML(p);
    } else if (mission && !p) {
      mission = null;
    }
  }
  if (!html) {
    if (!el.hidden) { el.hidden = true; el.innerHTML = ''; }
    return;
  }
  if (el.hidden) { el.innerHTML = html; el.hidden = false; }
  else morph(el, html);
}

export const missionVisible = () => !document.getElementById('mission')?.hidden;
