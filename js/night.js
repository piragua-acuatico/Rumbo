// Modo noche: pantalla de descanso entre nightStart y nightEnd.
import { state, tasksFor, ensureRoutines } from './store.js';
import { todayKey, addDays, nowMin, toMin, inRange, timeParts, fmtTime, fmtDur, esc, fmtWeekday } from './utils.js';
import { morph } from './morph.js';
import { icon } from './icons.js';
import { ui } from './ui.js';

let stars = '';
function buildStars() {
  if (stars) return stars;
  const out = [];
  for (let i = 0; i < 55; i++) {
    const size = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1.4;
    out.push(`<i style="left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.pow(Math.random(), 1.6) * 55).toFixed(2)}%;width:${size}px;height:${size}px;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(2.5 + Math.random() * 3).toFixed(2)}s;opacity:${(0.3 + Math.random() * 0.6).toFixed(2)}"></i>`);
  }
  stars = `<div class="stars" data-morph-skip>${out.join('')}</div>`;
  return stars;
}

export function isNightTime() {
  const s = state.settings;
  return !!s.nightMode && inRange(nowMin(), toMin(s.nightStart), toMin(s.nightEnd));
}
export function isNight() {
  return state.onboarded && isNightTime() && Date.now() > ui.nightBypassUntil;
}
export function nightPlanDate() {
  const s = state.settings;
  const start = toMin(s.nightStart), end = toMin(s.nightEnd);
  return start > end && nowMin() >= start ? addDays(todayKey(), 1) : todayKey();
}

export function renderNight() {
  const el = document.getElementById('night');
  if (!isNight()) {
    if (!el.hidden) { el.hidden = true; el.innerHTML = ''; }
    return;
  }
  const s = state.settings;
  const pk = nightPlanDate();
  ensureRoutines(pk);
  const plan = tasksFor(pk).filter(t => !t.done);
  const isTomorrow = pk !== todayKey();
  const { hm, ap } = timeParts(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);
  const sleepMin = (toMin(s.nightEnd) - nowMin() + 1440) % 1440;
  const planned = !!state.planned[pk];
  const name = s.name ? `, ${esc(s.name)}` : '';

  const html = `
    ${buildStars()}
    <div class="night-inner">
      <div class="night-moon" aria-hidden="true"></div>
      <div class="night-clock" aria-label="Son las ${hm} ${ap}">${hm}<small>${ap}</small></div>
      <h1>Buenas noches${name}</h1>
      <p class="lead">${planned || plan.length
        ? 'Tu día ya está pensado. No tienes que resolver nada más hoy: suelta el celular y descansa.'
        : 'Aún no hay plan. Anota lo esencial aquí abajo y a dormir; mañana lo ordenas.'}</p>
      <span class="sleep-chip">${icon('bed')}Si te duermes ya: ${fmtDur(sleepMin)} de descanso</span>
      <div class="night-card">
        <h4>${isTomorrow ? `Tu ${fmtWeekday(pk)}` : 'Tu día'}</h4>
        ${plan.length
          ? plan.slice(0, 7).map(t => `<div class="n-item" data-key="n-${t.id}"><span class="n-time">${t.time ? fmtTime(t.time) : '—'}</span><span style="flex:1">${esc(t.title)}</span>${t.important ? icon('star-fill') : ''}</div>`).join('')
            + (plan.length > 7 ? `<p class="n-empty">y ${plan.length - 7} más…</p>` : '')
          : '<p class="n-empty">Todavía sin tareas.</p>'}
      </div>
      <form data-form="night-add" autocomplete="off">
        <input type="text" name="title" placeholder="¿Algo que no quieres olvidar?" enterkeyhint="done" aria-label="Anotar para mañana">
        <button aria-label="Guardar">${icon('plus')}</button>
      </form>
      <button class="btn block" data-action="night-edit">${icon('clock')}${planned ? 'Ajustar el plan' : 'Planear ahora'} (5 min)</button>
      <small class="foot">Modo noche hasta las ${fmtTime(s.nightEnd)}</small>
    </div>`;
  if (el.hidden) { el.innerHTML = html; el.hidden = false; }
  else morph(el, html);
}
