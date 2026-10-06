// Estado de la app, persistencia y operaciones sobre los datos.
import { todayKey, addDays, parseKey, uid, toMin, nowMin, inRange } from './utils.js';

const STORAGE_KEY = 'rumbo.v1';

export const CATEGORIES = [
  { id: 'personal', name: 'Personal', color: 'blue' },
  { id: 'trabajo', name: 'Trabajo', color: 'orange' },
  { id: 'estudio', name: 'Estudio', color: 'purple' },
  { id: 'salud', name: 'Salud', color: 'green' },
  { id: 'hogar', name: 'Hogar', color: 'pink' },
];
export const catOf = id => CATEGORIES.find(c => c.id === id) || null;

export const ACCENTS = [
  { id: 'indigo', name: 'Índigo' }, { id: 'blue', name: 'Azul' }, { id: 'teal', name: 'Turquesa' },
  { id: 'green', name: 'Verde' }, { id: 'orange', name: 'Naranja' }, { id: 'pink', name: 'Rosa' },
  { id: 'purple', name: 'Morado' }, { id: 'graphite', name: 'Grafito' },
];

export const MOODS = [
  { v: 1, e: '😞', l: 'Difícil' }, { v: 2, e: '😕', l: 'Regular' }, { v: 3, e: '😐', l: 'Normal' },
  { v: 4, e: '🙂', l: 'Bien' }, { v: 5, e: '😄', l: 'Genial' },
];

export const DEFAULT_SETTINGS = {
  name: 'Camilo',
  theme: 'auto',
  accent: 'indigo',
  waterGoalMl: 2000,
  glassMl: 250,
  waterStart: '08:00',
  waterEnd: '21:00',
  waterEvery: 120,
  focusGoal: 60,
  focusDefault: 25,
  focusStrict: false, // modo árbol: crece un árbol mientras te enfocas; si sales de Rumbo, avisos con su progreso
  nightMode: true,
  nightStart: '23:00',
  nightEnd: '06:00',
  planTime: '21:30',
  leadMin: 5,
  wakeTime: '07:00',
  sleepGoal: 8,
  alarm: true,        // Rumbo pone la alarma del reloj (con Atajos) y pide la misión al despertar
  alarmBackup: 10,    // minutos hasta la alarma de respaldo (0 = sin respaldo)
  // Qué avisos se envían como notificación.
  notify: { water: true, tasks: true, plan: true, night: true, morning: true, focus: true, weekly: true },
};

function fresh() {
  return {
    version: 2,
    onboarded: false,
    tasks: [],        // {id,title,date|null,time|null,duration|null,important,done,doneAt,notes,category,subtasks,routineId,createdAt}
    routines: [],     // {id,title,time|null,duration|null,days:[0..6],category}
    routineSkips: {}, // "routineId|fecha": true
    water: {},        // fecha: ml
    focusLog: {},     // fecha: minutos
    journal: {},      // fecha: {mood (1-5), feel {e, p} energía × agrado, note, photo (cuándo se guardó la foto)}
    lastBackup: null, // cuándo se hizo la última copia de seguridad
    achievements: null, // logro → cuándo se desbloqueó (null = aún no se revisaron los datos viejos)
    trees: { grown: 0, dead: 0 }, // sesiones de enfoque en modo árbol
    totals: { tasks: 0, focus: 0, waterDays: 0 }, // acumulados para los logros (no se borran al limpiar datos viejos)
    weeklySeen: null,   // lunes de la última semana cuyo resumen ya viste
    cf: { profile: { sex: null, heightCm: null }, weekGoal: 4, lifts: [], complexes: [], sessions: [], body: [] },
    // CrossFit: lifts {id, lift, date, lb, reps, note} · complexes {id, name, date, lb, note}
    //           sessions {id, date, wod, result, rpe 1-10, note} · body {id, date, kg, waist, neck, hip, photo}
    planned: {},      // fecha planeada: timestamp de cuando se cerró el ritual
    wakeFor: {},      // fecha: hora de despertar elegida en el ritual
    guide: {},
    hideInstall: false,
    focus: null,      // {taskId,title,total,endsAt,remaining,running,finished}
    sleep: { alarm: null, bed: null, log: {}, ok: false },
    // alarm: {key, time, backup, setAt} · bed: {key, at} · log: fecha de despertar → {bed, wake, errors, secs}
    // ok: ya confirmaste una vez que el atajo pone la alarma (desde ahí Rumbo te la exige al cerrar el día)
    profile: { photo: null, since: Date.now() },
    settings: { ...DEFAULT_SETTINGS, notify: { ...DEFAULT_SETTINGS.notify } },
  };
}

/* ---------- Validación: todo lo que se carga o se restaura pasa por aquí ---------- */
const RE_ID = /^[a-z0-9]{1,40}$/i;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
const id = v => (typeof v === 'string' && RE_ID.test(v) ? v : uid());
const date = v => (typeof v === 'string' && RE_DATE.test(v) && !isNaN(parseKey(v)) ? v : null);
const time = v => (typeof v === 'string' && RE_TIME.test(v) ? v : null);
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const dur = v => (v == null || v === '' ? null : num(v, 5, 24 * 60, null));
const cat = v => (CATEGORIES.some(c => c.id === v) ? v : null);
const byDate = (bag, fn) => Object.fromEntries(Object.entries(obj(bag)).filter(([k]) => date(k)).map(([k, v]) => [k, fn(v)]).filter(([, v]) => v != null));

function cleanTask(t) {
  t = obj(t);
  const d = date(t.date);
  return {
    id: id(t.id), title: str(t.title, 300) || 'Tarea', date: d, time: d ? time(t.time) : null, duration: dur(t.duration),
    important: !!t.important, done: !!t.done, doneAt: Number(t.doneAt) || null, notes: str(t.notes, 5000),
    category: cat(t.category), createdAt: Number(t.createdAt) || Date.now(),
    subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).slice(0, 100).map(x => ({ id: id(obj(x).id), title: str(obj(x).title, 300), done: !!obj(x).done })),
    routineId: typeof t.routineId === 'string' && RE_ID.test(t.routineId) ? t.routineId : null,
  };
}
function cleanRoutine(r) {
  r = obj(r);
  const days = (Array.isArray(r.days) ? r.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  return { id: id(r.id), title: str(r.title, 300) || 'Rutina', time: time(r.time), duration: dur(r.duration), days: [...new Set(days)].sort(), category: cat(r.category) };
}
function cleanSettings(x) {
  x = obj(x);
  const d = DEFAULT_SETTINGS;
  const t = k => time(x[k]) || d[k];
  return {
    name: str(x.name ?? d.name, 30),
    theme: ['auto', 'light', 'dark'].includes(x.theme) ? x.theme : d.theme,
    accent: ACCENTS.some(a => a.id === x.accent) ? x.accent : d.accent,
    waterGoalMl: num(x.waterGoalMl, 500, 6000, d.waterGoalMl),
    glassMl: [200, 250, 300, 350, 500].includes(Number(x.glassMl)) ? Number(x.glassMl) : d.glassMl,
    waterStart: t('waterStart'), waterEnd: t('waterEnd'),
    waterEvery: [60, 90, 120, 180].includes(Number(x.waterEvery)) ? Number(x.waterEvery) : d.waterEvery,
    focusGoal: num(x.focusGoal, 15, 480, d.focusGoal),
    focusDefault: [15, 25, 45, 60].includes(Number(x.focusDefault)) ? Number(x.focusDefault) : d.focusDefault,
    focusStrict: !!x.focusStrict,
    nightMode: x.nightMode === undefined ? d.nightMode : !!x.nightMode,
    nightStart: t('nightStart'), nightEnd: t('nightEnd'), planTime: t('planTime'),
    leadMin: [0, 5, 10, 15, 30].includes(Number(x.leadMin)) ? Number(x.leadMin) : d.leadMin,
    wakeTime: t('wakeTime'),
    sleepGoal: num(x.sleepGoal, 5, 11, d.sleepGoal),
    alarm: x.alarm === undefined ? d.alarm : !!x.alarm,
    alarmBackup: [0, 5, 10, 15].includes(Number(x.alarmBackup)) ? Number(x.alarmBackup) : d.alarmBackup,
    notify: Object.fromEntries(Object.keys(d.notify).map(k => [k, obj(x.notify)[k] === undefined ? d.notify[k] : !!obj(x.notify)[k]])),
  };
}
// Foto de perfil: una miniatura JPEG pequeña (se genera en el teléfono).
function cleanProfile(p, tasks) {
  p = obj(p);
  const photo = typeof p.photo === 'string' && p.photo.length < 300000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.photo) ? p.photo : null;
  const oldest = tasks.reduce((min, t) => Math.min(min, t.createdAt || Infinity), Infinity);
  const since = num(p.since, 0, Date.now(), Number.isFinite(oldest) ? Math.min(oldest, Date.now()) : Date.now());
  return { photo, since };
}
function cleanFocus(f) {
  if (!f || typeof f !== 'object') return null;
  const total = num(f.total, 60, 6 * 3600, null);
  if (!total) return null;
  return {
    taskId: typeof f.taskId === 'string' && RE_ID.test(f.taskId) ? f.taskId : null, title: str(f.title, 300), total,
    remaining: num(f.remaining, 0, total, total), running: !!f.running && Number.isFinite(Number(f.endsAt)),
    endsAt: Number(f.endsAt) || null, finished: !!f.finished,
    strict: !!f.strict,
    // Las sesiones que quedaron "secas" en la 2.7.0 se dan por terminadas (el árbol ya no se seca).
    ...(f.dead ? { finished: true, running: false, endsAt: null } : {}),
  };
}

// Sueño: la alarma pendiente, la hora en que te acostaste y el registro de noches.
const ts = v => { const n = Number(v); return Number.isFinite(n) && n > 1e12 && n < Date.now() + 2 * 864e5 ? n : null; };
function cleanSleep(x) {
  x = obj(x);
  const a = obj(x.alarm), b = obj(x.bed);
  return {
    alarm: date(a.key) && time(a.time) ? { key: a.key, time: a.time, backup: [0, 5, 10, 15].includes(Number(a.backup)) ? Number(a.backup) : 0, setAt: ts(a.setAt) || Date.now() } : null,
    bed: date(b.key) && ts(b.at) ? { key: b.key, at: ts(b.at) } : null,
    log: byDate(x.log, n => {
      n = obj(n);
      const wake = ts(n.wake);
      if (!wake) return null;
      const bed = ts(n.bed);
      return { bed: bed && bed < wake && wake - bed < 20 * 3600e3 ? bed : null, wake, errors: num(n.errors, 0, 999, 0), secs: num(n.secs, 0, 86400, 0) };
    }),
    ok: !!x.ok,
  };
}

// Un día del diario: ánimo (energía × agrado, y la carita vieja de 1 a 5), nota y marca de foto.
const lvl = v => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null);
function cleanJournal(j) {
  j = obj(j);
  const e = lvl(obj(j.feel).e), p = lvl(obj(j.feel).p);
  const feel = e && p ? { e, p } : null;
  return {
    mood: feel ? p : (MOODS.some(m => m.v === j.mood) ? j.mood : null),
    feel,
    note: str(j.note, 2000),
    photo: ts(j.photo),
  };
}

// CrossFit: cada registro se valida (pesos en lb, peso corporal en kg, medidas en cm).
const LIFT_IDS = ['deadlift', 'backsquat', 'frontsquat', 'ohs', 'bench', 'press', 'pushpress', 'thruster', 'snatch', 'powersnatch', 'clean', 'powerclean', 'cleanjerk', 'jerk'];
const half = (v, min, max) => { const n = Math.round(Number(v) * 2) / 2; return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const list = (v, fn, max = 5000) => (Array.isArray(v) ? v : []).slice(0, max).map(fn).filter(Boolean);
// Los resultados de benchmarks de la 2.6.0 pasan a ser entrenos (la sección se reemplazó).
function fromBenchmark(e) {
  e = obj(e);
  const name = typeof e.wod === 'string' ? e.wod.charAt(0).toUpperCase() + e.wod.slice(1) : '';
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : null);
  const result = n(e.secs) ? `${Math.floor(e.secs / 60)}:${String(e.secs % 60).padStart(2, '0')}`
    : n(e.rounds) != null ? `${e.rounds} rondas${n(e.reps) ? ` + ${e.reps}` : ''}` : n(e.reps) != null ? `${e.reps} reps` : '';
  if (!result) return null; // un resultado dañado no se convierte
  return { id: e.id, date: e.date, wod: name, result: result ? `${result}${e.rx ? ' · Rx' : ' · Scaled'}` : '', rpe: null, note: '' };
}
function cleanCF(x) {
  x = obj(x);
  const p = obj(x.profile);
  return {
    profile: { sex: ['m', 'f'].includes(p.sex) ? p.sex : null, heightCm: half(p.heightCm, 120, 230) },
    lifts: list(x.lifts, e => {
      e = obj(e);
      const lb = half(e.lb, 1, 1500), reps = Number.isInteger(Number(e.reps)) && e.reps >= 1 && e.reps <= 50 ? Number(e.reps) : null;
      return LIFT_IDS.includes(e.lift) && date(e.date) && lb && reps ? { id: id(e.id), lift: e.lift, date: e.date, lb, reps, note: str(e.note, 300) } : null;
    }),
    complexes: list(x.complexes, e => {
      e = obj(e);
      const lb = half(e.lb, 1, 1500), name = str(e.name, 120).trim();
      return name && date(e.date) && lb ? { id: id(e.id), name, date: e.date, lb, note: str(e.note, 300) } : null;
    }),
    weekGoal: Number.isInteger(Number(x.weekGoal)) && x.weekGoal >= 1 && x.weekGoal <= 7 ? Number(x.weekGoal) : 4,
    sessions: list([...(Array.isArray(x.sessions) ? x.sessions : []), ...(Array.isArray(x.wods) ? x.wods.map(fromBenchmark) : [])], e => {
      e = obj(e);
      const wod = str(e.wod, 1500).trim();
      if (!date(e.date) || !wod) return null;
      const rpe = Number(e.rpe);
      return { id: id(e.id), date: e.date, wod, result: str(e.result, 120).trim(), rpe: Number.isInteger(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null, note: str(e.note, 500) };
    }),
    body: list(x.body, e => {
      e = obj(e);
      if (!date(e.date)) return null;
      const out = { id: id(e.id), date: e.date, kg: half(e.kg, 25, 300), waist: half(e.waist, 40, 250), neck: half(e.neck, 20, 70), hip: half(e.hip, 50, 250), photo: ts(e.photo) };
      return out.kg || out.waist || out.photo ? out : null;
    }, 3000),
  };
}

function migrate(data) {
  data = obj(data);
  const v1 = !data.version || data.version < 2;
  const settings = obj(data.settings);
  const s = fresh();
  // v1 guardaba vasos; v2 guarda mililitros.
  const glass = Number(settings.glassMl) || 250;
  if (v1 && settings.waterGoal) settings.waterGoalMl = Number(settings.waterGoal) * glass;
  s.settings = cleanSettings(settings);
  s.onboarded = v1 ? (Array.isArray(data.tasks) && data.tasks.length > 0) : !!data.onboarded;
  s.tasks = (Array.isArray(data.tasks) ? data.tasks : []).map(cleanTask);
  s.routines = (Array.isArray(data.routines) ? data.routines : []).map(cleanRoutine);
  s.routineSkips = Object.fromEntries(Object.keys(obj(data.routineSkips)).filter(k => /^[a-z0-9]+\|\d{4}-\d{2}-\d{2}$/i.test(k)).map(k => [k, true]));
  s.water = byDate(data.water, v => num(v1 ? v * glass : v, 0, 20000, null));
  s.focusLog = byDate(data.focusLog, v => num(v, 0, 1440, null));
  s.journal = byDate(data.journal, cleanJournal);
  s.planned = byDate(data.planned, v => Number(v) || Date.now());
  s.wakeFor = byDate(data.wakeFor, v => time(v));
  s.guide = Object.fromEntries(Object.entries(obj(data.guide)).filter(([k]) => /^[a-z]+\.\d+$/.test(k)).map(([k, v]) => [k, !!v]));
  // Hasta la 2.1 la guía de instalación tenía pasos del Calendario (del 3 en adelante):
  // se descartan para que no marquen como hechos los pasos nuevos.
  if ('exported' in data) for (const k of ['install.2', 'install.3', 'install.4']) delete s.guide[k];
  s.hideInstall = !!data.hideInstall;
  s.focus = cleanFocus(data.focus);
  s.profile = cleanProfile(data.profile, s.tasks);
  s.sleep = cleanSleep(data.sleep);
  s.lastBackup = ts(data.lastBackup);
  s.achievements = data.achievements && typeof data.achievements === 'object'
    ? Object.fromEntries(Object.entries(obj(data.achievements)).filter(([k]) => /^[a-z0-9-]{2,30}$/.test(k)).map(([k, v]) => [k, v === 1 ? 1 : ts(v) || Date.now()]))
    : null;
  // Acumulados: si la copia no los trae (versiones viejas), se calculan con lo que hay.
  const tot = obj(data.totals);
  s.totals = 'tasks' in tot
    ? { tasks: num(tot.tasks, 0, 1e7, 0), focus: num(tot.focus, 0, 1e8, 0), waterDays: num(tot.waterDays, 0, 1e6, 0) }
    : { tasks: s.tasks.filter(t => t.done).length, focus: Object.values(s.focusLog).reduce((a, m) => a + m, 0), waterDays: Object.values(s.water).filter(ml => ml >= s.settings.waterGoalMl).length };
  s.trees = { grown: num(obj(data.trees).grown, 0, 1e6, 0), dead: num(obj(data.trees).dead, 0, 1e6, 0) };
  s.weeklySeen = date(data.weeklySeen);
  s.cf = cleanCF(data.cf);
  return s;
}

export let loadProblem = false;
function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return fresh(); }
  if (!raw) return fresh();
  try {
    return migrate(JSON.parse(raw));
  } catch {
    // No perder nada: se guarda una copia de lo que no se pudo leer.
    try { localStorage.setItem(`${STORAGE_KEY}.danado-${Date.now()}`, raw); } catch { /* sin espacio */ }
    loadProblem = true;
    return fresh();
  }
}

export let state = load();

/* ---------- Suscripción: cualquier cambio → guardar y redibujar ---------- */

const listeners = new Set();
let queued = false;
export const subscribe = fn => listeners.add(fn);

export function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function commit() {
  save();
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; listeners.forEach(fn => fn()); });
}

export function replaceState(next) {
  state = migrate(next);
  commit();
}
export function resetState() {
  state = fresh();
  commit();
}

export function prune() {
  const limit = addDays(todayKey(), -90);
  state.tasks = state.tasks.filter(t => !(t.done && t.date && t.date < limit));
  // "planned" no se limpia: la racha puede pasar de 180 días.
  for (const bag of [state.water, state.focusLog, state.wakeFor]) {
    for (const k of Object.keys(bag)) if (k < addDays(todayKey(), -180)) delete bag[k];
  }
  for (const k of Object.keys(state.sleep.log)) if (k < addDays(todayKey(), -400)) delete state.sleep.log[k];
  for (const k of Object.keys(state.routineSkips)) if (k.split('|')[1] < limit) delete state.routineSkips[k];
  save();
}


/* ---------- Tareas ---------- */

export function byTime(a, b) {
  if (a.time && b.time) return a.time.localeCompare(b.time) || (a.createdAt - b.createdAt);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.createdAt - b.createdAt;
}
export const getTask = id => state.tasks.find(t => t.id === id);
export const tasksFor = k => state.tasks.filter(t => t.date === k).sort(byTime);
// Las copias de rutinas de días pasados no se arrastran: el hábito vuelve a salir solo.
export const overdueTasks = () => {
  const k = todayKey();
  return state.tasks.filter(t => t.date && t.date < k && !t.done && !t.routineId).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
};
export const inboxTasks = () => state.tasks.filter(t => !t.date).sort((a, b) => (b.important - a.important) || (a.createdAt - b.createdAt));

export function addTask(data) {
  const t = {
    id: uid(), title: String(data.title || '').trim(), date: data.date || null, time: data.date ? (data.time || null) : null,
    duration: data.duration ? Number(data.duration) : null, important: !!data.important, done: false, doneAt: null,
    notes: data.notes || '', category: data.category || null, subtasks: [], routineId: null, createdAt: Date.now(),
  };
  state.tasks.push(t);
  commit();
  return t;
}

// Cambia la fecha. Si es una rutina y el destino ya tiene su copia, esta se descarta
// (devuelve false) para no duplicar el hábito ese día.
export function setTaskDate(t, date) {
  date = date || null;
  if (t.routineId && t.date && t.date !== date) state.routineSkips[`${t.routineId}|${t.date}`] = true;
  if (t.routineId && date && state.tasks.some(x => x !== t && x.routineId === t.routineId && x.date === date)) {
    const i = state.tasks.indexOf(t);
    if (i >= 0) state.tasks.splice(i, 1);
    return false;
  }
  t.date = date;
  if (!date) t.time = null;
  return true;
}

export function toggleTask(t) {
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  state.totals.tasks = Math.max(0, state.totals.tasks + (t.done ? 1 : -1));
  commit();
  return t.done;
}

// Devuelve una función para deshacer (que solo actúa una vez), o null si la tarea ya no estaba.
export function deleteTask(t) {
  const index = state.tasks.indexOf(t);
  if (index < 0) return null;
  if (t.routineId && t.date) state.routineSkips[`${t.routineId}|${t.date}`] = true;
  state.tasks.splice(index, 1);
  commit();
  let undone = false;
  return () => {
    if (undone || state.tasks.includes(t)) return;
    undone = true;
    state.tasks.splice(Math.min(index, state.tasks.length), 0, t);
    if (t.routineId && t.date) delete state.routineSkips[`${t.routineId}|${t.date}`];
    commit();
  };
}

export function ensureRoutines(k) {
  if (k < todayKey()) return;
  const wd = parseKey(k).getDay();
  let changed = false;
  for (const r of state.routines) {
    if (!r.days.includes(wd) || state.routineSkips[`${r.id}|${k}`]) continue;
    if (state.tasks.some(t => t.routineId === r.id && t.date === k)) continue;
    state.tasks.push({
      id: uid(), title: r.title, date: k, time: r.time || null, duration: r.duration || null, important: false,
      done: false, doneAt: null, notes: '', category: r.category || null, subtasks: [], routineId: r.id, createdAt: Date.now(),
    });
    changed = true;
  }
  if (changed) save();
}

export function isCurrent(t) {
  if (!t.time || t.done || t.date !== todayKey()) return false;
  const s = toMin(t.time);
  return inRange(nowMin(), s, s + (t.duration || 30));
}

/* ---------- Día a planear ----------
   De día, "mañana" es el día siguiente. Pasada la medianoche y hasta que
   termina el modo noche (6 am), el día que se está planeando es hoy. */
export function planTarget() {
  const t = todayKey();
  return nowMin() < toMin(state.settings.nightEnd) ? t : addDays(t, 1);
}
export const closingDay = () => addDays(planTarget(), -1);
// Un día del diario solo se puede editar ese mismo día (o en el ritual de esa noche, aunque ya sea
// pasada la medianoche). Después queda como recuerdo: la foto, el ánimo y la nota no cambian.
export const editableDay = k => k === todayKey() || k === closingDay();

/* ---------- Agua / enfoque ---------- */

export const waterFor = k => state.water[k] || 0;
export function addWater(ml) {
  const k = todayKey();
  const before = waterFor(k);
  state.water[k] = Math.max(0, before + ml);
  const goal = state.settings.waterGoalMl;
  if (before < goal && state.water[k] >= goal) state.totals.waterDays++;
  else if (before >= goal && state.water[k] < goal) state.totals.waterDays = Math.max(0, state.totals.waterDays - 1);
  commit();
  return { before, after: state.water[k] };
}
export function waterSlots() {
  const s = state.settings;
  const out = [];
  const every = Math.max(30, Number(s.waterEvery) || 120);
  for (let m = toMin(s.waterStart); m <= toMin(s.waterEnd); m += every) out.push(m);
  return out;
}
export const focusFor = k => state.focusLog[k] || 0;
export function logFocus(minutes, day = todayKey()) {
  if (minutes < 1) return;
  state.focusLog[day] = (state.focusLog[day] || 0) + Math.round(minutes);
  state.totals.focus += Math.round(minutes);
}

/* ---------- Racha ---------- */

// Días seguidos planeando (cerrando el día la noche anterior). Es una racha "humana": un día libre
// cada 7 días no la rompe (el comodín); dos días seguidos sin planear, sí.
export function planningStreakInfo() {
  const t = planTarget();
  let k = state.planned[t] ? t : addDays(t, -1);
  let n = 0, lastFree = null, newestFree = null;
  const gap = (a, b) => Math.round(Math.abs(parseKey(a) - parseKey(b)) / 864e5);
  for (let i = 0; i < 4000; i++) {
    if (state.planned[k]) { n++; k = addDays(k, -1); continue; }
    const prev = addDays(k, -1);
    if (state.planned[prev] && (lastFree === null || gap(lastFree, k) >= 7)) { lastFree = k; newestFree ||= k; k = prev; continue; }
    break;
  }
  if (!n) return { n: 0, freeUsed: null, freeAvailable: true };
  // ¿Ya usaste el comodín en los últimos 7 días?
  const recent = newestFree && gap(newestFree, t) < 7 ? newestFree : null;
  return { n, freeUsed: recent, freeAvailable: !recent };
}
export const planningStreak = () => planningStreakInfo().n;
