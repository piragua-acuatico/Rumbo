// Notificaciones reales: suscripción push, cálculo de avisos y envío al servidor.
//
// Privacidad: cada aviso (título y texto) se cifra aquí con una clave AES que
// solo existe en este teléfono (IndexedDB). El servidor guarda y reenvía texto
// cifrado que no puede leer; el service worker lo descifra al mostrarlo.
import { state, tasksFor, waterSlots } from './store.js';
import { todayKey, addDays, parseKey, toMin, fromMin, fmtTime, plural, isStandalone } from './utils.js';
import { PUSH } from './config.js';
import { weekStats, hasData } from './weekly.js';

const LS = 'rumbo.push';
const HORIZON_DAYS = 7;   // si no abres Rumbo en una semana, los avisos se detienen (y te lo avisa)
const KEY_DB = 'rumbo-push';

/* ---------- Estado local del dispositivo (no va en las copias de seguridad) ---------- */
function info() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
function setInfo(patch) {
  const next = { ...info(), ...patch };
  try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* sin espacio */ }
  return next;
}

let swReg = null;
let lastBadge = -1;   // último número puesto en el ícono
const ready = 'serviceWorker' in navigator ? navigator.serviceWorker.ready.then(r => { swReg = r; }).catch(() => {}) : Promise.resolve();
// El botón "Activar" espera a esto: si el permiso se pide tras otra espera, iOS lo ignora.
export const pushReady = () => !!swReg;
export const whenPushReady = () => ready;

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));

/* ---------- ¿Se puede? ---------- */
export function pushStatus() {
  if (!PUSH.server) return 'no-server';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return ios && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (ios && !isStandalone()) return 'needs-install';
  if (Notification.permission === 'denied') return 'denied';
  return info().enabled ? 'on' : 'off';
}
export const pushInfo = () => info();

/* ---------- Clave de cifrado (IndexedDB, compartida con el service worker) ---------- */
let dbp = null;
function idb() {
  return dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('keys').objectStore('keys').get(k);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
// La clave se guarda como 32 bytes y no como CryptoKey: en el iPhone, el service worker
// no puede leer objetos CryptoKey de IndexedDB (error de WebKit) y no podría abrir los avisos.
let keyp = null;
function aesKey() {
  return keyp ||= (async () => {
    let raw = await idbGet('raw');
    if (!(raw instanceof Uint8Array) || raw.length !== 32) {
      raw = crypto.getRandomValues(new Uint8Array(32));
      await idbPut('raw', raw);
      await idbPut('aes', undefined); // la clave vieja (CryptoKey) ya no se usa
    }
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  })().catch(err => { keyp = null; throw err; });
}
// La hora y el tipo van como "datos asociados": si el servidor los cambiara, el iPhone no abriría el aviso.
async function seal(key, msg, due, kind) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${due}|${kind}`);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, new TextEncoder().encode(JSON.stringify(msg)));
  return `${b64u(iv)}.${b64u(ct)}`;
}

/* ---------- Hablar con el servidor ---------- */
async function api(path, body) {
  const res = await fetch(PUSH.server.replace(/\/$/, '') + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res;
}

async function register(sub, pair) {
  const id = info().id || b64u(crypto.getRandomValues(new Uint8Array(32)));
  const res = await api('/subscribe', { id, pair, subscription: sub.toJSON() });
  if (res.status === 403) { setInfo({ pair: null }); throw new Error('código'); }
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  setInfo({ id, pair, enabled: true, lost: false, lastHash: null });
  lastBadge = -1;
}

// ¿Ya se emparejó este iPhone alguna vez? Entonces no hace falta volver a escribir el código.
export const hasPairCode = () => !!info().pair;

// Debe llamarse directo desde el toque del usuario: iOS exige un gesto para pedir permiso.
// Un doble toque reutiliza la misma activación en curso.
let enabling = null;
export function enablePush(pair) {
  if (enabling) return enabling;
  enabling = (async () => {
    const reg = swReg || await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(PUSH.publicKey) });
    await aesKey();
    await register(sub, String(pair || info().pair || '').trim());
    await syncPush(true);
  })().finally(() => { enabling = null; });
  return enabling;
}

export async function disablePush() {
  const { id } = info();
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch { /* ya no estaba */ }
  if (id) await api('/unsubscribe', { id }).catch(() => {});
  setInfo({ enabled: false, lost: false, lastHash: null, count: 0 });
  lastBadge = -1;
  try { navigator.clearAppBadge?.()?.catch(() => {}); } catch { /* sin badge */ }
}

export async function testPush() {
  const send = async () => api('/test', {
    id: info().id,
    payload: await seal(await aesKey(), { t: '🔔 ¡Funciona!', b: 'Así te llegarán los avisos de Rumbo, aunque la app esté cerrada.', u: './#hoy', g: 'prueba' }, 0, 'prueba'),
  });
  const start = Date.now();
  let res = await send();
  if ((res.status === 404 || res.status === 410) && await recover()) res = await send();
  if (!res.ok) return { ok: false };
  // El service worker anota si un aviso llegó pero no pudo abrirlo; se revisa unos segundos después.
  await new Promise(r => setTimeout(r, 6000));
  const diag = await idbGet('diag').catch(() => null);
  return { ok: true, opened: !(diag && diag.at >= start), error: diag?.error };
}

/* ---------- Qué avisos tocan en los próximos días ---------- */
const at = (k, minutes) => { const d = parseKey(k); d.setMinutes(minutes); return d.getTime(); };

// Las tareas de un día, incluidas las de rutinas que todavía no se crearon
// (se calculan sin crearlas: crear tareas una semana adelante llenaría tu lista).
function dayTasks(k) {
  const list = tasksFor(k);
  const wd = parseKey(k).getDay();
  for (const r of state.routines) {
    if (!r.days.includes(wd) || state.routineSkips[`${r.id}|${k}`] || list.some(t => t.routineId === r.id)) continue;
    list.push({ id: `r${r.id}-${k}`, title: r.title, time: r.time || null, important: false, done: false, routineId: r.id });
  }
  return list;
}

export function buildEvents(now = Date.now()) {
  const s = state.settings;
  const n = s.notify;
  const t0 = todayKey();
  const out = [];
  const add = (due, kind, t, b, g) => { if (due > now) out.push({ due, kind, msg: { t, b, u: './#hoy', g } }); };

  // Despertador: desde la hora de la alarma, un aviso por minuto hasta que hagas la misión
  // (al hacerla, la alarma se borra y la siguiente sincronización los cancela).
  const al = state.sleep.alarm;
  const alarmDay = s.alarm && al && !state.sleep.log[al.key] ? al.key : null;
  if (alarmDay) {
    const start = at(al.key, toMin(al.time));
    const backupAt = al.backup ? fmtTime(fromMin(toMin(al.time) + al.backup)) : '';
    for (let i = 0; i <= (al.backup || 5) + 5; i++) {
      add(start + i * 60e3, 'alarma', i ? '🧮 Tu misión te espera' : '⏰ ¡Buenos días! Resuelve tu misión',
        al.backup ? `5 operaciones y apagas la alarma de respaldo de las ${backupAt}` : '5 operaciones y empiezas tu día', `alarma-${i}`);
    }
  }

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const k = addDays(t0, i);
    if (n.water) for (const m of waterSlots()) add(at(k, m), 'agua', '💧 Hora de tomar agua', 'Un vaso y sigues.', 'agua');
    if (n.tasks) {
      const lead = Number(s.leadMin) || 0;
      for (const t of dayTasks(k)) {
        if (t.done || !t.time) continue;
        add(at(k, toMin(t.time) - lead), 'tarea', `⏰ ${t.title}`, lead ? `Empieza en ${lead} min · ${fmtTime(t.time)}` : `Es ahora · ${fmtTime(t.time)}`, `t-${t.id}`);
      }
    }
    if (n.plan && !state.planned[addDays(k, 1)]) add(at(k, toMin(s.planTime)), 'planear', '🌙 Hora de planear mañana', 'Cierra el día y deja listo el siguiente en 3 minutos.', 'planear');
    if (n.night && s.nightMode) add(at(k, toMin(s.nightStart) - 15), 'noche', '😴 En 15 min empieza el modo noche', 'Deja el celular cargando lejos de la cama.', 'noche');
    if (n.morning && k !== alarmDay) { // con alarma, el aviso de la misión hace de buenos días
      const pending = dayTasks(k).filter(t => !t.done).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      const imp = pending.filter(t => t.important).length;
      const first = pending.find(t => t.time);
      const body = pending.length
        ? [plural(pending.length, 'tarea', 'tareas'), imp ? plural(imp, 'importante', 'importantes') : '', first ? `empiezas a las ${fmtTime(first.time)}` : ''].filter(Boolean).join(' · ')
        : 'Hoy no tienes nada planeado. Abre Rumbo y arma tu día.';
      add(at(k, toMin(state.wakeFor[k] || s.wakeTime)), 'manana', '☀️ Buenos días', body, 'manana');
    }
  }
  // Resumen semanal: el próximo lunes a las 9:00.
  if (n.weekly) {
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const k = addDays(t0, i);
      if (parseKey(k).getDay() !== 1) continue;
      const prev = addDays(k, -7);
      if (state.weeklySeen !== prev && hasData(weekStats(prev))) add(at(k, 9 * 60), 'resumen', '📊 Tu semana en Rumbo', 'Mira cómo te fue la semana pasada.', 'resumen');
      break;
    }
  }
  // Si no abres Rumbo en casi una semana, este último aviso te lo recuerda (cada sincronización lo vuelve a correr).
  add(at(addDays(t0, HORIZON_DAYS - 1), 12 * 60), 'recordar', '📲 Abre Rumbo un momento', 'Así sigues recibiendo tus avisos la próxima semana.', 'recordar');
  const f = state.focus;
  if (n.focus && f?.running && f.endsAt) {
    add(f.endsAt, 'enfoque', '⏱ Terminó tu sesión de enfoque', `${Math.round(f.total / 60)} min${f.title ? ` · ${f.title}` : ''}. ¡Bien hecho!`, 'enfoque');
  }
  return out.sort((a, b) => a.due - b.due).slice(0, 300);
}

/* ---------- Enviar el horario al servidor ---------- */
let syncing = null;
let dirty = false;
export async function syncPush(force = false) {
  if (pushStatus() !== 'on') return;
  // Si llega un cambio mientras otra sincronización está en curso, se repite al terminar.
  if (syncing) { dirty = true; return syncing; }
  dirty = false;
  syncing = (async () => {
    const events = buildEvents();
    // "k2": versión de la clave. Al cambiarla, todos los avisos se vuelven a sellar con la clave nueva.
    const hash = `k2${JSON.stringify(events.map(e => [e.due, e.kind, e.msg.t, e.msg.b]))}`;
    const inf = info();
    // Sin cambios y sincronizado hace menos de 6 h: no hace falta molestar al servidor.
    if (!force && inf.lastHash === hash && Date.now() - (inf.lastSync || 0) < 6 * 3600e3) return;
    const key = await aesKey();
    const sealed = await Promise.all(events.map(async e => ({ due: e.due, kind: e.kind, payload: await seal(key, e.msg, e.due, e.kind) })));
    let res = await api('/schedule', { id: inf.id, events: sealed });
    if (res.status === 404 && await recover()) res = await api('/schedule', { id: info().id, events: sealed });
    if (res.ok) setInfo({ lastHash: hash, lastSync: Date.now(), count: sealed.length });
  })().catch(() => { /* sin internet: se reintenta en la próxima sincronización */ }).finally(() => {
    syncing = null;
    if (dirty) syncPush(true);
  });
  return syncing;
}

// El servidor olvidó este iPhone (Apple dio la suscripción por muerta, o pasó un mes sin usarla).
// Se pide una suscripción NUEVA (la vieja puede estar muerta), como mucho una vez al día;
// si no se puede, queda "desconectado" y la pantalla ofrece reactivar.
async function recover() {
  const inf = info();
  if (!inf.pair || Date.now() - (inf.recoveredAt || 0) < 864e5) { setInfo({ enabled: false, lost: true }); return false; }
  setInfo({ recoveredAt: Date.now() });
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(PUSH.publicKey) });
    await register(sub, inf.pair);
    return true;
  } catch {
    setInfo({ enabled: false, lost: true });
    return false;
  }
}

let timer = null;
export function scheduleSync() {
  if (pushStatus() !== 'on') return;
  clearTimeout(timer);
  timer = setTimeout(() => syncPush(), 2500);
}

// Número en el ícono: tareas de hoy que faltan (iOS lo permite con notificaciones activas).
export function updateBadge() {
  if (pushStatus() !== 'on' || !navigator.setAppBadge) return;
  const n = tasksFor(todayKey()).filter(t => !t.done).length;
  if (n === lastBadge) return;
  lastBadge = n;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

