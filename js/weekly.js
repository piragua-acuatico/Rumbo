// Resumen semanal: cómo te fue la semana pasada (lunes a domingo), comparada con la anterior,
// y una imagen para compartir.
import { state, commit, MOODS } from './store.js';
import { todayKey, addDays, parseKey, fmtDur, plural } from './utils.js';
import { icon } from './icons.js';
import { openSheet, refreshSheet } from './sheet.js';
import { haptic } from './fx.js';

export const weekStart = k => addDays(k, -((parseKey(k).getDay() + 6) % 7));
export const lastWeek = () => addDays(weekStart(todayKey()), -7);
const dfDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const dfWeekday = new Intl.DateTimeFormat('es', { weekday: 'long' });
export const weekLabel = ws => `del ${dfDay.format(parseKey(ws)).replace('.', '')} al ${dfDay.format(parseKey(addDays(ws, 6))).replace('.', '')}`;

export function weekStats(ws) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const inWeek = k => k >= ws && k <= days[6];
  const tasks = state.tasks.filter(t => t.date && inWeek(t.date));
  const done = tasks.filter(t => t.done).length;
  const doneBy = days.map(k => tasks.filter(t => t.date === k && t.done).length);
  const best = Math.max(...doneBy);
  const nights = days.map(k => state.sleep.log[k]).filter(n => n?.bed).map(n => (n.wake - n.bed) / 60e3);
  const moods = days.map(k => state.journal[k]?.mood).filter(Boolean);
  const mood = moods.length ? MOODS[Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) - 1] : null;
  return {
    tasks: tasks.length, done, rate: tasks.length ? Math.round((done / tasks.length) * 100) : null,
    planned: days.filter(k => state.planned[k]).length,
    waterDays: days.filter(k => (state.water[k] || 0) >= state.settings.waterGoalMl).length,
    focus: Math.round(days.reduce((a, k) => a + (state.focusLog[k] || 0), 0)),
    sleep: nights.length ? Math.round(nights.reduce((a, b) => a + b, 0) / nights.length) : null,
    trainings: new Set(state.cf.sessions.filter(s => inWeek(s.date)).map(s => s.date)).size,
    photos: days.filter(k => state.journal[k]?.photo).length,
    mood,
    bestDay: best > 0 ? days[doneBy.indexOf(best)] : null, bestDone: best,
  };
}
export const hasData = w => w.tasks || w.focus || w.trainings || w.waterDays || w.sleep || w.mood || w.photos;

// ¿Mostrar la tarjeta del resumen en Hoy? Durante la semana, hasta que lo abras.
export const weeklyPending = () => state.weeklySeen !== lastWeek() && hasData(weekStats(lastWeek()));

function delta(now, before, unit = '', fmt = v => v) {
  if (now == null || before == null || now === before) return '';
  const up = now > before;
  return `<em class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmt(Math.abs(now - before))}${unit}</em>`;
}

function renderWeekly() {
  const ws = lastWeek();
  const w = weekStats(ws), p = weekStats(addDays(ws, -7));
  const tile = (ic, tint, label, value, sub = '', d = '') => `
    <div class="wk-tile" style="--tint: var(--${tint})"><span class="wk-ic">${icon(ic)}</span><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}${d}</div>`;
  return `
    <div class="wk">
      <p class="wk-range">${weekLabel(ws)}</p>
      <div class="wk-grid">
        ${tile('check', 'c-pink', 'Tareas', w.rate != null ? `${w.rate} %` : '—', w.tasks ? `${w.done} de ${w.tasks}` : 'sin tareas', delta(w.rate, p.rate, ' pts'))}
        ${tile('moon-fill', 'c-indigo', 'Noches planeadas', `${w.planned}/7`, '', delta(w.planned, p.planned))}
        ${tile('timer', 'c-green', 'Enfoque', fmtDur(w.focus), '', delta(w.focus, p.focus, '', fmtDur))}
        ${tile('bed', 'c-purple', 'Sueño promedio', w.sleep != null ? fmtDur(w.sleep) : '—', w.sleep != null ? `meta ${state.settings.sleepGoal} h` : 'sin registro', delta(w.sleep, p.sleep, '', fmtDur))}
        ${tile('drop-fill', 'c-blue', 'Días con agua', `${w.waterDays}/7`, 'cumpliendo la meta', delta(w.waterDays, p.waterDays))}
        ${tile('dumbbell', 'c-orange', 'Entrenos', `${w.trainings}`, `meta ${state.cf.weekGoal}`, delta(w.trainings, p.trainings))}
      </div>
      ${w.mood || w.bestDay || w.photos ? `<div class="wk-notes">
        ${w.mood ? `<p><span>${w.mood.e}</span>Tu ánimo de la semana: <b>${w.mood.l}</b></p>` : ''}
        ${w.bestDay ? `<p><span>⭐</span>Tu mejor día: <b>${dfWeekday.format(parseKey(w.bestDay))}</b> (${plural(w.bestDone, 'tarea hecha', 'tareas hechas')})</p>` : ''}
        ${w.photos ? `<p><span>📸</span>${plural(w.photos, 'foto', 'fotos')} en tu diario</p>` : ''}
      </div>` : ''}
      ${preview ? `<img class="wk-img" src="${preview}" alt="Tu semana en Rumbo"><p class="wk-foot">Mantén presionada la imagen para guardarla o compartirla.</p>`
        : `<button class="btn primary block" data-action="weekly-share">${icon('share')}Compartir como imagen</button>`}
      <p class="wk-foot">Las flechas comparan con la semana anterior.</p>
    </div>`;
}

let ready = null;     // la imagen ya preparada (para compartir directo desde el toque)
let preview = '';     // si no se puede compartir, la imagen se muestra en la hoja
export function openWeekly() {
  if (state.weeklySeen !== lastWeek()) { state.weeklySeen = lastWeek(); commit(); }
  preview = '';
  ready = null;
  makeImage().then(file => { ready = file; }).catch(() => {});
  openSheet({ key: 'weekly', title: 'Tu semana', render: renderWeekly });
}

/* ---------- Imagen para compartir (1080 × 1350) ---------- */
async function makeImage() {
  const ws = lastWeek(), w = weekStats(ws);
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1080, 1350);
  bg.addColorStop(0, '#5856D6'); bg.addColorStop(1, '#AF52DE');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  const font = (size, weight = 700) => `${weight} ${size}px -apple-system, "SF Pro Rounded", system-ui, sans-serif`;
  g.fillStyle = '#fff';
  g.font = font(44, 600); g.globalAlpha = 0.8; g.fillText('Mi semana en Rumbo', 90, 150);
  g.globalAlpha = 1; g.font = font(64, 800); g.fillText(weekLabel(ws).replace(/^del /, ''), 90, 235);
  const items = [
    ['Tareas hechas', w.rate != null ? `${w.rate} %` : '—'],
    ['Noches planeadas', `${w.planned}/7`],
    ['Enfoque', fmtDur(w.focus)],
    ['Sueño promedio', w.sleep != null ? fmtDur(w.sleep) : '—'],
    ['Días con agua', `${w.waterDays}/7`],
    ['Entrenos', `${w.trainings}`],
  ];
  items.forEach(([label, value], i) => {
    const x = 90 + (i % 2) * 470, y = 340 + Math.floor(i / 2) * 290;
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.roundRect(x - 30, y - 20, 430, 250, 44); g.fill();
    g.fillStyle = '#fff'; g.globalAlpha = 0.75; g.font = font(36, 600); g.fillText(label, x, y + 50);
    g.globalAlpha = 1; g.font = font(96, 800); g.fillText(value, x, y + 170);
  });
  g.globalAlpha = 0.75; g.font = font(34, 600);
  if (w.mood) g.fillText(`Ánimo de la semana: ${w.mood.l}`, 90, 1270);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  return new File([blob], `rumbo-semana-${ws}.png`, { type: 'image/png' });
}
// Comparte la imagen ya preparada: así el menú de compartir sale directo del toque (iOS lo exige).
// Si no se puede, la imagen aparece en la hoja para guardarla con un toque largo.
export async function shareWeekly() {
  haptic();
  const file = ready || await makeImage();
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Mi semana en Rumbo' }); return file; }
  } catch (err) { if (err.name === 'AbortError') return file; }
  preview = URL.createObjectURL(file);
  refreshSheet();
  return file;
}
