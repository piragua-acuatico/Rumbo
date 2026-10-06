// Logros: hitos que se desbloquean solos con lo que haces en Rumbo.
// Al desbloquear uno hay confeti (es de los pocos momentos que lo merecen).
import { state, save, planningStreak, MOODS } from './store.js';

// Acumulados (no bajan cuando Rumbo limpia los datos de hace meses).
const doneTasks = () => state.totals.tasks;
const waterDays = () => state.totals.waterDays;
const focusHours = () => state.totals.focus / 60;
const diaryPhotos = () => Object.values(state.journal).filter(j => j.photo).length;
const moodDays = () => Object.values(state.journal).filter(j => MOODS.some(m => m.v === j.mood)).length;
const sleepGoalNights = () => Object.values(state.sleep.log).filter(n => n.bed && (n.wake - n.bed) / 36e5 >= state.settings.sleepGoal).length;
const missions = () => Object.values(state.sleep.log).filter(n => n.secs > 0).length;
const sessions = () => state.cf.sessions.length;
const fullDays = () => {
  const byDay = {};
  for (const t of state.tasks) if (t.date) (byDay[t.date] ||= []).push(t);
  return Object.values(byDay).filter(l => l.length >= 2 && l.every(t => t.done)).length;
};
const weekGoalHit = () => {
  const weeks = {};
  for (const s of state.cf.sessions) {
    const d = new Date(`${s.date}T12:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    (weeks[d.toDateString()] ||= new Set()).add(s.date);
  }
  return Object.values(weeks).some(set => set.size >= state.cf.weekGoal) ? 1 : 0;
};

// [id, ícono, color, título, descripción, valor actual, meta]
export const ACHIEVEMENTS = [
  ['plan-1', 'moon-fill', 'c-indigo', 'Primera noche', 'Cierra el día y planea el siguiente', () => Object.keys(state.planned).length, 1],
  ['streak-7', 'flame-fill', 'c-orange', 'Una semana', '7 días seguidos planeando', planningStreak, 7],
  ['streak-30', 'flame-fill', 'c-red', 'Un mes', '30 días seguidos planeando', planningStreak, 30],
  ['tasks-100', 'check', 'c-green', 'Cien hechas', 'Completa 100 tareas', doneTasks, 100],
  ['full-day', 'sparkles', 'c-yellow', 'Día redondo', 'Termina todas las tareas de un día', fullDays, 1],
  ['water-7', 'drop-fill', 'c-blue', 'Bien hidratado', '7 días cumpliendo tu meta de agua', waterDays, 7],
  ['focus-10', 'timer', 'c-green', 'Diez horas de foco', '10 horas en modo enfoque', focusHours, 10],
  ['trees-10', 'leaf', 'c-green', 'Un bosque', '10 árboles crecidos en modo árbol', () => state.trees.grown, 10],
  ['diary-7', 'book-fill', 'c-purple', 'Te escuchas', '7 días eligiendo tu ánimo', moodDays, 7],
  ['photos-30', 'camera', 'c-pink', 'Un mes en fotos', '30 fotos del día', diaryPhotos, 30],
  ['mission-1', 'alarm', 'c-orange', 'Despierto', 'Resuelve tu primera misión del despertador', missions, 1],
  ['sleep-7', 'bed', 'c-indigo', 'Bien dormido', '7 noches cumpliendo tu meta de sueño', sleepGoalNights, 7],
  ['cf-10', 'dumbbell', 'c-orange', 'Diez entrenos', 'Registra 10 entrenos', sessions, 10],
  ['cf-50', 'dumbbell', 'c-red', 'Cincuenta entrenos', 'Registra 50 entrenos', sessions, 50],
  ['cf-week', 'star-fill', 'c-yellow', 'Semana completa', 'Cumple tu meta semanal de entrenos', weekGoalHit, 1],
  ['cf-pr', 'star-fill', 'c-orange', 'Primer récord', 'Registra tu primer levantamiento', () => state.cf.lifts.length, 1],
].map(([id, ic, tint, title, desc, value, goal]) => ({ id, ic, tint, title, desc, value, goal }));

export const progressOf = a => Math.min(a.goal, Math.floor(a.value() * 10) / 10);
export const unlocked = () => state.achievements || {};

// Revisa los logros. La primera vez (al actualizar Rumbo) desbloquea en silencio lo que ya habías logrado.
export function checkAchievements() {
  const first = !state.achievements;
  const got = state.achievements || {};
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (got[a.id]) continue;
    let v = 0;
    try { v = a.value(); } catch { /* dato incompleto */ }
    // Los que ya tenías al actualizar Rumbo se guardan con un 1: no sabemos cuándo los lograste.
    if (v >= a.goal) { got[a.id] = first ? 1 : Date.now(); if (!first) fresh.push(a); }
  }
  if (first || fresh.length) { state.achievements = got; save(); }
  return fresh;
}
