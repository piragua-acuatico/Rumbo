// Utilidades de fechas, horas y texto.

export const pad = n => String(n).padStart(2, '0');
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
export const todayKey = () => keyOf(new Date());
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = m => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const inRange = (m, start, end) => start <= end ? (m >= start && m < end) : (m >= start || m < end);
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function timeParts(t) {
  let [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return { hm: `${h}:${pad(m)}`, ap };
}
export function fmtTime(t) {
  const { hm, ap } = timeParts(t);
  return `${hm} ${ap}`;
}
export function fmtDur(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function fmtLiters(ml) {
  if (ml < 1000) return `${ml} ml`;
  return `${(ml / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} L`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${pad(m)}:${pad(s)}`;
}

const dfLong = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
const dfWeekday = new Intl.DateTimeFormat('es', { weekday: 'long' });
const dfShort = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
export const fmtDateLong = k => cap(dfLong.format(parseKey(k)));
export const fmtWeekday = k => dfWeekday.format(parseKey(k));
export const fmtShort = k => dfShort.format(parseKey(k)).replace('.', '');

export function relDate(k) {
  const t = todayKey();
  if (k === t) return 'Hoy';
  if (k === addDays(t, 1)) return 'Mañana';
  if (k === addDays(t, -1)) return 'Ayer';
  const diff = Math.round((parseKey(k) - parseKey(t)) / 86400000);
  if (diff > 1 && diff < 7) return cap(fmtWeekday(k));
  return cap(fmtShort(k));
}

// Lunes → domingo; d = getDay()
export const WEEK = [
  { d: 1, s: 'L', n: 'Lunes' }, { d: 2, s: 'M', n: 'Martes' }, { d: 3, s: 'X', n: 'Miércoles' },
  { d: 4, s: 'J', n: 'Jueves' }, { d: 5, s: 'V', n: 'Viernes' }, { d: 6, s: 'S', n: 'Sábado' }, { d: 0, s: 'D', n: 'Domingo' },
];
export const dayLetter = k => WEEK.find(w => w.d === parseKey(k).getDay()).s;

export function daysText(days) {
  if (days.length === 7) return 'Todos los días';
  const set = [...days].sort().join();
  if (set === '1,2,3,4,5') return 'Entre semana';
  if (set === '0,6') return 'Fines de semana';
  return WEEK.filter(w => days.includes(w.d)).map(w => w.n.slice(0, 3)).join(', ');
}

export function greeting(name) {
  const h = new Date().getHours();
  const n = name ? `, ${name}` : '';
  if (h < 5) return `Buenas noches${n}`;
  if (h < 12) return `Buenos días${n}`;
  if (h < 19) return `Buenas tardes${n}`;
  return `Buenas noches${n}`;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// El contenido se desplaza dentro de #scroll (la página en sí no se mueve).
export const scroller = () => document.getElementById('scroll');
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
