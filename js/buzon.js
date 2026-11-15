// Buzón con Claude: Claude (desde el PC de Camilo) pone, cambia o borra tareas, y Rumbo le
// devuelve un informe de cómo van las tareas de Digiízate (para la revisión de los viernes).
//
// Privacidad: todo viaja cifrado de punta a punta con una llave compartida entre este iPhone y
// el PC (ECDH P-256 → HKDF → AES-GCM, una llave por dirección). El servidor solo guarda paquetes
// que no puede leer. El mismo protocolo está en tools/buzon.cjs.
//
// Enlace con "compromiso" (como ZRTP): el iPhone primero manda solo la huella de su llave; el PC
// recibe esa huella y recién entonces manda su llave; al final el iPhone revela la suya. Así nadie
// en el medio (ni el servidor) puede fabricar llaves a la medida para que el número de 6 dígitos
// coincida: cuando tendría que elegirlas, todavía no conoce las que necesitaría igualar.
//
// Límites: Claude solo toca las tareas que él creó (llevan "cid") o las de Digiízate que tú
// creaste ("r:<id>"). Si ya la hiciste, la cambiaste o la borraste tú, no la toca (salvo que le
// pidas forzar). Cada lote se puede deshacer durante 24 horas, sin pisar lo que tocaste después.
import { state, commit, getTask, byTime, CATEGORIES } from './store.js';
import { todayKey, addDays, uid } from './utils.js';
import { PUSH } from './config.js';
import { pushInfo } from './push.js';
import { VERSION } from './version.js';

const LS = 'rumbo.claude';
const PROTO = 'rumbo-buzon/1';
const UNDO_MS = 864e5;
const MAX_UNDO = 500;
const MAX_REPORT = 240000;   // el servidor acepta hasta 250 000 caracteres
const RE_PUB = /^[A-Za-z0-9_-]{87}$/;
export const RE_CID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const RE_RID = /^r:[a-z0-9]{1,40}$/i;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const te = new TextEncoder(), td = new TextDecoder();

/* ---------- Estado local (no va en las copias de seguridad) ---------- */
function info() {
  try {
    const v = JSON.parse(localStorage.getItem(LS));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function setInfo(patch) {
  const next = { ...info(), ...patch };
  try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* sin espacio */ }
  return next;
}
const arr = v => (Array.isArray(v) ? v : []);
export const claudeInfo = () => info();
export const claudeStage = () => info().stage || 'none';
export const canUndo = last => !!last && !last.undone && arr(last.undo).length > 0 && Date.now() - (last.firstAt || last.at) < UNDO_MS;

/* ---------- Cifrado ---------- */
// En trozos: en el iPhone, String.fromCharCode(...bytes) falla con más de ~65 000 bytes.
const b64u = bytes => {
  const u = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const join = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
const EC = { name: 'ECDH', namedCurve: 'P-256' };

async function newKeys() {
  const kp = await crypto.subtle.generateKey(EC, true, ['deriveBits']);
  return { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
}
// Huella de la llave del iPhone (el "compromiso" que se manda antes de revelarla).
const commitOf = async pub => b64u(await crypto.subtle.digest('SHA-256', join(te.encode(`${PROTO} compromiso`), fromB64u(pub))));
// dir: "pc>app" (lo que manda Claude) o "app>pc" (el informe).
async function boxKey(inf, dir, usage) {
  const priv = await crypto.subtle.importKey('jwk', inf.priv, EC, false, ['deriveBits']);
  const other = await crypto.subtle.importKey('raw', fromB64u(inf.pcPub), EC, false, []);
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: other }, priv, 256);
  const salt = await crypto.subtle.digest('SHA-256', join(fromB64u(inf.pub), fromB64u(inf.pcPub)));
  const hk = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(`${PROTO} ${dir}`) }, hk, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
// La dirección y el enlace van sellados: un paquete no se puede reenviar en otra dirección ni a otro enlace.
async function seal(key, obj, dir, lid) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`${PROTO}|${dir}|${lid}`) }, key, te.encode(JSON.stringify(obj)));
  return `${b64u(iv)}.${b64u(ct)}`;
}
async function unseal(key, box, dir, lid) {
  const [iv, ct] = String(box).split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: te.encode(`${PROTO}|${dir}|${lid}`) }, key, fromB64u(ct));
  return JSON.parse(td.decode(plain));
}
// Número de seguridad: lo calculan el iPhone y el PC con las dos llaves públicas. Si coincide, no hubo nadie en el medio.
export async function safetyNumber(appPub, pcPub) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', join(te.encode(`${PROTO} numero`), fromB64u(appPub), fromB64u(pcPub))));
  const n = (d[0] * 2 ** 24 + d[1] * 2 ** 16 + d[2] * 2 ** 8 + d[3]) % 1e6;
  const s = String(n).padStart(6, '0');
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}
async function digest(text) {
  return b64u(await crypto.subtle.digest('SHA-256', te.encode(text)));
}

/* ---------- Servidor ---------- */
async function api(path, body) {
  const json = JSON.stringify(body);
  const keepalive = document.visibilityState === 'hidden' && json.length < 60000;
  const res = await fetch(PUSH.server.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive });
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  return { ok: res.ok, status: res.status, data };
}
const deviceId = () => pushInfo().id;

/* ---------- Avisos a la interfaz ---------- */
let notify = () => {};
export function initBuzon(fn) {
  notify = fn;
  if (claudeStage() === 'waiting') watch();
  // Con Rumbo abierta, cada 2 minutos se revisa si Claude dejó algo.
  setInterval(() => syncClaude(), 120e3);
}

/* ---------- Enlazar ---------- */
export async function startLink() {
  const id = deviceId();
  if (!id) throw new Error('sin-avisos');
  const keys = await newKeys();
  const r = await api('/link/start', { id, commit: await commitOf(keys.pub) });
  if (!r.ok) throw new Error(r.data.error === 'ruta' ? 'servidor-viejo' : r.data.error === 'no suscrito' ? 'sin-avisos' : 'red');
  setInfo({ stage: 'waiting', priv: keys.priv, pub: keys.pub, code: r.data.code, exp: r.data.exp, lid: null, pcPub: null, safety: null, reportHash: null, seq: 0 });
  watch();
}

// Mientras se espera a Claude, cada 3 segundos se pregunta cómo va. El servidor decide si el código
// venció (no el reloj del iPhone): si Claude lo canjeó a tiempo, sigue valiendo aunque vuelvas tarde.
let pollTimer = null;
function watch() {
  clearTimeout(pollTimer);
  const step = async () => {
    const inf = info();
    if (inf.stage !== 'waiting') return;
    // Sin respuesta del servidor durante mucho rato: se abandona.
    if (Date.now() > (inf.exp || 0) + 3600e3) { setInfo({ stage: 'none', code: null }); notify('expired'); return; }
    if (document.visibilityState === 'visible') {
      try {
        const r = await api('/link/status', { id: deviceId() });
        const now = info();
        if (now.stage !== 'waiting' || now.pub !== inf.pub) return; // se canceló o se empezó otro enlace
        const st = r.ok ? r.data.state : null;
        if ((st === 'keyed' || st === 'revealed') && RE_PUB.test(r.data.pcPub || '')) {
          // Ya tenemos la llave del PC: recién ahora se revela la nuestra.
          const rv = await api('/link/reveal', { id: deviceId(), pub: inf.pub });
          if (rv.ok && info().pub === inf.pub) {
            setInfo({ stage: 'verify', lid: r.data.lid, pcPub: r.data.pcPub, code: null, safety: await safetyNumber(inf.pub, r.data.pcPub) });
            notify('claimed');
            return;
          }
        }
        if (st === 'none' || st === 'expired') { setInfo({ stage: 'none', code: null }); notify('expired'); return; }
        if (st === 'claimed' && !inf.claimedSeen) { setInfo({ claimedSeen: true }); notify('render'); }
      } catch { /* sin internet: se reintenta */ }
    }
    pollTimer = setTimeout(step, 3000);
  };
  pollTimer = setTimeout(step, 1500);
}

export async function confirmLink() {
  const r = await api('/link/confirm', { id: deviceId() });
  if (!r.ok) throw new Error(r.status === 404 ? 'sin-enlace' : 'red');
  setInfo({ stage: 'linked', linkedAt: Date.now(), lastCheck: 0, reportHash: null });
  syncClaude(true);
}

// Desenlazar: el PC pierde el permiso al instante (el servidor borra el enlace y lo que esperaba).
export async function unlink() {
  clearTimeout(pollTimer);
  const id = deviceId();
  let ok = true;
  if (id) ok = (await api('/link/remove', { id }).catch(() => ({ ok: false }))).ok;
  setInfo({ stage: 'none', priv: null, pub: null, pcPub: null, lid: null, code: null, exp: null, safety: null, reportHash: null, last: null, claimedSeen: false });
  return ok;
}

/* ---------- Recoger lo que dejó Claude ---------- */
let syncing = null;
export const isSyncing = () => !!syncing;
export function syncClaude(force = false) {
  const inf = info();
  if (inf.stage !== 'linked' || !deviceId()) return Promise.resolve(null);
  // Datos del enlace incompletos (versión vieja o borrados): no se puede descifrar nada; hay que volver a enlazar.
  if (!inf.priv || !RE_PUB.test(inf.pub || '') || !RE_PUB.test(inf.pcPub || '') || !inf.lid) {
    setInfo({ stage: 'none', last: null });
    notify('lost');
    return Promise.resolve(null);
  }
  if (!force && (document.visibilityState !== 'visible' || Date.now() - (inf.lastCheck || 0) < 30e3)) return Promise.resolve(null);
  if (syncing) return syncing;
  syncing = (async () => {
    setInfo({ lastCheck: Date.now() });
    let got = null;
    for (let round = 0; round < 5; round++) { // de a 20 paquetes
      const r = await api('/mail/inbox', { id: deviceId() });
      if (r.status === 404 && r.data.error === 'sin enlace') { setInfo({ stage: 'none', last: null }); notify('lost'); return null; }
      if (!r.ok) break;
      const msgs = arr(r.data.msgs);
      if (!msgs.length) break;
      got = (await applyMessages(msgs)) || got;
      await api('/mail/ack', { id: deviceId(), upto: Math.max(...msgs.map(m => Number(m.n) || 0)) });
      if (msgs.length < 20) break;
    }
    await sendReport().catch(err => console.warn('buzón: informe', err));
    return got;
  })().catch(err => { console.warn('buzón', err); return null; }).finally(() => { syncing = null; });
  return syncing;
}

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clone = t => JSON.parse(JSON.stringify(t));
// Cómo dejó Claude la tarea la última vez ("csig"): si hoy es distinta, la cambiaste tú.
const fieldsOf = t => [t.title, t.date, t.time, t.duration, t.category, !!t.important, t.notes || ''];
const FIELD_NAMES = ['titulo', 'fecha', 'hora', 'duracion', 'categoria', 'importante', 'notas'];
const sigOf = t => JSON.stringify(fieldsOf(t));
const editedByYou = t => !!(t.csig && sigOf(t) !== t.csig);
// Cómo quedó la tarea justo después del cambio de Claude (con subtareas y si está hecha):
// "Deshacer" no toca las que tocaste tú después.
const mark = t => `${sigOf(t)}|${t.done ? 1 : 0}|${JSON.stringify(t.subtasks || [])}`;

// Tareas que Claude puso alguna vez: si una ya no está y Claude no la borró, la quitaste tú.
const knownSet = () => new Set(arr(info().known));

function target(id) {
  if (RE_RID.test(id)) {
    const t = getTask(id.slice(2));
    return t && !t.routineId && (t.category === 'digiizate' || t.cid) ? t : null;
  }
  return state.tasks.find(t => t.cid === id) || null;
}

// Campos que trae una operación "poner" (solo los que vienen; lo demás queda como está).
function readFields(op) {
  const out = {};
  if ('titulo' in op) {
    const v = typeof op.titulo === 'string' ? op.titulo.trim().slice(0, 300) : '';
    if (!v) return { error: 'título vacío' };
    out.title = v;
  }
  if ('fecha' in op) {
    if (op.fecha !== null && !(typeof op.fecha === 'string' && RE_DATE.test(op.fecha) && !isNaN(new Date(`${op.fecha}T12:00`)))) return { error: 'fecha inválida' };
    out.date = op.fecha;
  }
  if ('hora' in op) {
    if (op.hora !== null && !(typeof op.hora === 'string' && RE_TIME.test(op.hora))) return { error: 'hora inválida' };
    out.time = op.hora;
  }
  if ('duracion' in op) {
    const n = Number(op.duracion);
    if (op.duracion !== null && !(Number.isInteger(n) && n >= 5 && n <= 1440)) return { error: 'duración inválida' };
    out.duration = op.duracion === null ? null : n;
  }
  if ('importante' in op) out.important = !!op.importante;
  if ('categoria' in op) {
    if (op.categoria !== null && !CATEGORIES.some(c => c.id === op.categoria)) return { error: 'categoría inválida' };
    out.category = op.categoria;
  }
  if ('notas' in op) {
    if (op.notas !== null && typeof op.notas !== 'string') return { error: 'notas inválidas' };
    out.notes = (op.notas || '').slice(0, 5000);
  }
  return out;
}
function patch(t, f) {
  if ('title' in f) t.title = f.title;
  if ('date' in f) t.date = f.date;
  if ('time' in f) t.time = f.time;
  if (!t.date) t.time = null;
  if ('duration' in f) t.duration = f.duration;
  if ('important' in f) t.important = f.important;
  if ('category' in f) t.category = f.category;
  if ('notes' in f) t.notes = f.notes;
  return t;
}

function applyOp(op, res, group) {
  op = obj(op);
  const id = String(op.id || '');
  if (!RE_CID.test(id) && !RE_RID.test(id)) return 'id inválido';
  const t = target(id);
  const item = (k, x) => group.items.push({ k, title: x.title, date: x.date, time: x.time });

  if (op.op === 'borrar') {
    if (!t) return null; // ya no estaba: no hay nada que hacer
    if (t.done && !op.forzar) return 'ya está hecha';
    if (editedByYou(t) && !op.forzar) return 'la cambió Camilo';
    const index = state.tasks.indexOf(t);
    group.undo.push({ rid: t.id, before: clone(t), index, after: null });
    state.tasks.splice(index, 1);
    if (t.cid) group.forget.add(t.cid);
    res.borradas++;
    item('borrada', t);
    return null;
  }
  if (op.op !== 'poner') return 'operación desconocida';
  const f = readFields(op);
  if (f.error) return f.error;

  if (!t) {
    if (RE_RID.test(id)) return 'no existe o no es de Digiízate';
    if (group.known.has(id) && !op.forzar) return 'la quitó Camilo';
    if (!f.title) return 'falta el título';
    const date = f.date ?? null;
    const nt = {
      id: uid(), title: f.title, date, time: date ? f.time ?? null : null, duration: f.duration ?? null,
      important: !!f.important, done: false, doneAt: null, notes: f.notes ?? '',
      category: f.category === undefined ? 'digiizate' : f.category, subtasks: [], routineId: null, createdAt: Date.now(), cid: id,
    };
    nt.csig = sigOf(nt);
    state.tasks.push(nt);
    group.undo.push({ rid: nt.id, before: null, after: mark(nt) });
    res.agregadas++;
    item('agregada', nt);
    return null;
  }

  // Una tarea tuya de Digiízate no se puede sacar de Digiízate (saldría del alcance de Claude).
  if (!t.cid && 'category' in f && f.category !== 'digiizate') return 'no se puede sacar de Digiízate';
  // Si Claude pide justo lo que ya tiene (por ejemplo, adopta tu cambio), solo se anota.
  if (sigOf(patch(clone(t), f)) === sigOf(t)) {
    if (t.csig !== sigOf(t)) { t.csig = sigOf(t); group.dirty = true; }
    return null;
  }
  if (t.done && !op.forzar) return 'ya está hecha';
  if (editedByYou(t) && !op.forzar) return 'la cambió Camilo';
  const before = clone(t);
  patch(t, f);
  t.csig = sigOf(t);
  group.undo.push({ rid: t.id, before, after: mark(t) });
  if (t.date !== before.date) { res.movidas++; item('movida', t); } else { res.cambiadas++; item('cambiada', t); }
  return null;
}

async function applyMessages(msgs) {
  const inf = info();
  const key = await boxKey(inf, 'pc>app', 'decrypt');
  const applied = new Set(arr(inf.applied));
  let seq = Number(inf.seq) || 0;
  const newLog = [];
  const group = {
    items: [], undo: [], lotes: [], nota: '', counts: { agregadas: 0, cambiadas: 0, movidas: 0, borradas: 0 }, saltadas: 0,
    known: knownSet(), forget: new Set(), dirty: false,
  };
  for (const m of msgs) {
    let msg;
    try { msg = await unseal(key, m.body, 'pc>app', inf.lid); } catch {
      newLog.push({ lote: `paquete-${m.n}`, aplicado: Date.now(), error: 'no se pudo descifrar' });
      continue;
    }
    msg = obj(msg);
    const lote = typeof msg.lote === 'string' ? msg.lote.slice(0, 40) : '';
    // Cada paquete trae un número que solo sube: uno repetido o atrasado (aunque el servidor lo
    // reenvíe o cambie el orden) no se aplica.
    const n = Number(msg.seq);
    if (msg.v !== 1 || !lote || applied.has(lote) || !Number.isFinite(n) || n <= seq) {
      newLog.push({ lote: lote || `paquete-${m.n}`, aplicado: Date.now(), error: 'repetido o fuera de orden' });
      continue;
    }
    seq = n;
    applied.add(lote);
    const res = { lote, aplicado: Date.now(), nota: typeof msg.nota === 'string' ? msg.nota.slice(0, 200) : '', agregadas: 0, cambiadas: 0, movidas: 0, borradas: 0, saltadas: [] };
    for (const op of arr(msg.ops).slice(0, 300)) {
      const why = applyOp(op, res, group);
      if (!why) continue;
      res.saltadas.push({ id: String(obj(op).id || '').slice(0, 80), motivo: why });
      const t = target(String(obj(op).id || ''));
      group.items.push({ k: 'saltada', title: t?.title || String(obj(op).titulo || obj(op).id || '').slice(0, 300), date: t?.date ?? null, time: t?.time ?? null, why });
    }
    for (const k of Object.keys(group.counts)) group.counts[k] += res[k];
    group.saltadas += res.saltadas.length;
    if (res.saltadas.length > 50) { res.saltadasTotal = res.saltadas.length; res.saltadas = res.saltadas.slice(0, 50); }
    group.lotes.push(lote);
    if (res.nota) group.nota = res.nota;
    newLog.push(res);
  }
  if (group.undo.length || group.dirty) commit();

  // Se vuelve a leer: mientras se descifraba pudiste tocar Deshacer o cerrar la tarjeta.
  const cur = info();
  const known = new Set([...arr(cur.known).filter(c => !group.forget.has(c)), ...state.tasks.filter(t => t.cid).map(t => t.cid)]);
  const base = {
    applied: [...new Set([...arr(cur.applied), ...applied])].slice(-200),
    seq: Math.max(seq, Number(cur.seq) || 0),
    log: [...arr(cur.log), ...newLog].slice(-20),
    known: [...known].slice(-2000),
  };
  if (!group.lotes.length) { setInfo(base); return null; }
  // Si la tarjeta anterior sigue abierta (y es de las últimas 24 h), se suman y "Deshacer" deshace ambas.
  const p = cur.last;
  const prev = p && !p.closed && !p.undone && Date.now() - (p.firstAt || p.at) < UNDO_MS ? p : null;
  let last = prev ? {
    ...prev, at: Date.now(), nota: group.nota || prev.nota,
    counts: Object.fromEntries(Object.keys(group.counts).map(k => [k, (prev.counts?.[k] || 0) + group.counts[k]])),
    saltadas: (prev.saltadas || 0) + group.saltadas,
    items: [...arr(prev.items), ...group.items].slice(-80),
    undo: [...arr(prev.undo), ...group.undo], lotes: [...arr(prev.lotes), ...group.lotes],
  } : { at: Date.now(), firstAt: Date.now(), nota: group.nota, counts: group.counts, saltadas: group.saltadas, items: group.items.slice(-80), undo: group.undo, lotes: group.lotes, closed: false, undone: false };
  // Un lote enorme no se guarda para deshacer (ocuparía el espacio de tus datos).
  if (last.undo.length > MAX_UNDO) last = { ...last, undo: [], tooBig: true };
  setInfo({ ...base, last });
  notify('applied', last);
  return last;
}

/* ---------- Deshacer / cerrar la tarjeta ---------- */
// Devuelve cuántas tareas se deshicieron y cuántas se respetaron porque las tocaste después
// (las hiciste, las moviste, las editaste o les cambiaste subtareas): lo tuyo manda.
export function undoLast() {
  const inf = info();
  const last = inf.last;
  if (!canUndo(last)) return null;
  let undone = 0, kept = 0;
  for (const u of [...last.undo].reverse()) {
    const i = state.tasks.findIndex(t => t.id === u.rid);
    const now = i >= 0 ? state.tasks[i] : null;
    // Se borró: se devuelve, salvo que ya exista otra vez. Se creó o cambió: solo si sigue como la dejó Claude.
    if (u.after == null ? !!now : !now || mark(now) !== u.after) { kept++; continue; }
    if (!u.before) state.tasks.splice(i, 1);
    else if (now) state.tasks[i] = u.before;
    else state.tasks.splice(Math.min(u.index ?? state.tasks.length, state.tasks.length), 0, u.before);
    undone++;
  }
  commit();
  const lotes = new Set(arr(last.lotes));
  const log = arr(inf.log).map(l => (lotes.has(l.lote) ? { ...l, deshecho: Date.now(), ...(kept ? { respetadas: kept } : {}) } : l));
  setInfo({ last: { ...last, undone: true, closed: true, undo: [] }, log, reportHash: null });
  scheduleReport();
  return { undone, kept };
}
export function dismissLast() {
  const last = info().last;
  if (last) setInfo({ last: { ...last, closed: true } });
}

/* ---------- Informe para Claude ---------- */
function buildReport() {
  const from = addDays(todayKey(), -60);
  const tareas = state.tasks
    .filter(t => (t.cid || (t.category === 'digiizate' && !t.routineId)) && (!t.date || t.date >= from))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || byTime(a, b))
    .slice(-400)
    .map(t => {
      const out = {
        id: t.cid || `r:${t.id}`, titulo: t.title, fecha: t.date, hora: t.time, duracion: t.duration, categoria: t.category,
        importante: t.important, hecha: t.done, hechaEl: t.doneAt ? new Date(t.doneAt).toISOString() : null,
        notas: (t.notes || '').slice(0, 1000), deClaude: !!t.cid,
      };
      if (editedByYou(t)) {
        let was = [];
        try { was = JSON.parse(t.csig); } catch { /* firma vieja */ }
        const now = fieldsOf(t);
        out.cambiadoPorCamilo = FIELD_NAMES.filter((_, i) => JSON.stringify(was[i]) !== JSON.stringify(now[i]));
      }
      return out;
    });
  const present = new Set(state.tasks.filter(t => t.cid).map(t => t.cid));
  const quitadas = arr(info().known).filter(c => !present.has(c)).slice(-100);
  return { v: 1, hoy: todayKey(), app: VERSION, tareas, quitadasPorCamilo: quitadas, lotes: arr(info().log).slice(-10) };
}

async function sendReport(force = false) {
  const inf = info();
  if (inf.stage !== 'linked' || !deviceId()) return;
  const report = buildReport();
  const hash = await digest(JSON.stringify(report));
  // Sin cambios y enviado hace menos de 12 horas: no hace falta.
  if (!force && hash === inf.reportHash && Date.now() - (inf.lastReport || 0) < 12 * 3600e3) return;
  const key = await boxKey(inf, 'app>pc', 'encrypt');
  let body = await seal(key, { ...report, at: Date.now() }, 'app>pc', inf.lid);
  // Si no cabe, se quitan las tareas más viejas (van primero) hasta que quepa: lo que viene es lo que importa.
  for (let n = report.tareas.length; body.length > MAX_REPORT && n > 0;) {
    n = Math.floor(n / 2);
    body = await seal(key, { ...report, tareas: n ? report.tareas.slice(-n) : [], recortado: true, at: Date.now() }, 'app>pc', inf.lid);
  }
  const r = await api('/mail/report', { id: deviceId(), body });
  setInfo(r.ok ? { reportHash: hash, lastReport: Date.now(), reportError: null } : { reportError: r.status });
}

// Cada cambio en tus datos: unos segundos después se revisa si el informe cambió.
let reportTimer = null;
export function scheduleReport() {
  if (claudeStage() !== 'linked') return;
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => sendReport().catch(() => {}), 5000);
}
