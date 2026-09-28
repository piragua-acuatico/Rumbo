// Genera archivos de calendario (.ics) con alertas para que el iPhone avise
// aunque Rumbo esté cerrada.
import { state, tasksFor, waterSlots } from './store.js';
import { addDays, fromMin, toMin, todayKey } from './utils.js';

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const local = (k, t) => `${k.replace(/-/g, '')}T${t.replace(':', '')}00`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function fold(line) {
  // Máximo 75 octetos por línea (RFC 5545), sin partir caracteres.
  const bytes = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function end(date, start, minutes) {
  const total = toMin(start) + minutes;
  return { end: fromMin(total), endDate: total >= 1440 ? addDays(date, 1) : date };
}

export function buildICS(events) {
  const now = stamp();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumbo//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Rumbo'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@rumbo.app`, `DTSTAMP:${now}`,
      `DTSTART:${local(e.date, e.start)}`, `DTEND:${local(e.endDate, e.end)}`, `SUMMARY:${esc(e.title)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`,
      `TRIGGER:${e.lead ? `-PT${e.lead}M` : 'PT0S'}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function timedTasks(k) {
  return tasksFor(k).filter(t => t.time && !t.done);
}

export function icsForDay(k) {
  const lead = Number(state.settings.leadMin) || 0;
  return buildICS(timedTasks(k).map(t => ({
    uid: `task-${t.id}`, date: k, start: t.time, ...end(k, t.time, t.duration || 30),
    title: `${t.important ? '★ ' : ''}${t.title}`,
    notes: [t.notes, ...(t.subtasks || []).map(s => `• ${s.title}`)].filter(Boolean).join('\n'),
    lead,
  })));
}

export function icsFixed() {
  const s = state.settings;
  const k = todayKey();
  const daily = { rrule: 'FREQ=DAILY', lead: 0, date: k };
  const events = waterSlots().map(m => ({
    ...daily, uid: `agua-${m}`, start: fromMin(m), ...end(k, fromMin(m), 5),
    title: '💧 Toma agua', notes: 'Registra el vaso en Rumbo.',
  }));
  events.push({
    ...daily, uid: 'planear', start: s.planTime, ...end(k, s.planTime, 15),
    title: '🌙 Planea tu mañana en Rumbo', notes: 'Cierra el día, elige tus 3 importantes y pon hora a lo que tenga horario.',
  });
  const warn = fromMin(toMin(s.nightStart) - 15);
  events.push({
    ...daily, uid: 'aviso-noche', start: warn, ...end(k, warn, 15),
    title: '⏰ En 15 min empieza el modo noche', notes: 'Deja el celular cargando lejos de la cama.',
  });
  return buildICS(events);
}
