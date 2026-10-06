// Vista "Hoy": anillos, agua, agenda con línea de "ahora" y tareas sin hora.
import { state, tasksFor, overdueTasks, ensureRoutines, waterFor, focusFor, waterSlots, planTarget } from '../store.js';
import { todayKey, fmtDateLong, greeting, nowMin, toMin, fromMin, fmtTime, fmtDur, esc, isStandalone, plural } from '../utils.js';
import { largeTitle, sectionHead, emptyState, taskRow, nowLine, rings, RING_COLORS } from '../components.js';
import { icon } from '../icons.js';
import { avatarHTML } from './profile.js';
import { missionPending, alarmFor, wakeKey, wakeTimeFor, nightMinutes } from '../sleep.js';
import { weeklyPending, weekLabel, lastWeek } from '../weekly.js';

const liters = ml => (ml / 1000).toLocaleString('es', { maximumFractionDigits: 2 });

function glassSVG(level) {
  const shape = 'M9 6 H65 L58.5 90 Q58 95 53 95 H21 Q16 95 15.5 90 Z';
  return `
    <svg class="glass" viewBox="0 0 74 100" aria-hidden="true">
      <defs>
        <clipPath id="glassClip"><path d="${shape}"/></clipPath>
        <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#64D2FF"/><stop offset="1" stop-color="#0A84FF"/>
        </linearGradient>
      </defs>
      <g clip-path="url(#glassClip)">
        <rect x="0" y="0" width="74" height="100" fill="var(--water-empty)"/>
        <g class="water-level" data-live data-level="${level.toFixed(3)}" style="transform: translateY(96px)">
          <path class="wave w2" d="M0 5 Q17.5 -1 35 5 T70 5 T105 5 T140 5 V120 H0 Z" fill="#64D2FF"/>
          <path class="wave" d="M0 7 Q17.5 1 35 7 T70 7 T105 7 T140 7 V120 H0 Z" fill="url(#waterGrad)"/>
        </g>
      </g>
      <path class="glass-outline" d="${shape}"/>
      <path class="glass-shine" d="M17 16 L21.5 80"/>
    </svg>`;
}

function nextWaterText() {
  const m = nowMin();
  const next = waterSlots().find(x => x > m);
  return next != null ? `Próximo aviso a las ${fmtTime(fromMin(next))}` : `Mañana desde las ${fmtTime(state.settings.waterStart)}`;
}

// Sueño: en la noche, "me voy a dormir"; antes de la alarma, la misión temprana;
// en la mañana, cuánto dormiste.
function sleepBanner(m) {
  const s = state.settings;
  const banner = (key, tint, ic, title, text, attrs) => `
    <button class="banner tappable-card" data-key="${key}" ${attrs} style="--tint: var(--${tint})">
      <span class="banner-ic">${icon(ic)}</span>
      <span class="banner-text"><b>${title}</b><p>${text}</p></span>
      <span class="cell-chev">${icon('chevron-right')}</span>
    </button>`;
  const p = missionPending();
  if (p && p.forced) return banner('b-sleep', 'c-orange', 'alarm', 'Tu misión te espera', `Resuélvela para ${p.backup ? 'apagar la alarma de respaldo' : 'empezar tu día'}.`, 'data-action="mission-open"');
  if (p) return banner('b-sleep', 'c-orange', 'alarm', '¿Ya despierto?', `Tu alarma es a las ${fmtTime(p.time)}. Haz la misión y la apago.`, 'data-action="mission-open"');
  const k = todayKey();
  const last = state.sleep.log[k];
  if (last && m < 12 * 60) {
    const mins = nightMinutes(last);
    return banner('b-sleep', 'c-indigo', 'bed', mins != null ? `Anoche dormiste ${fmtDur(mins)}` : 'Buenos días', mins != null ? (mins >= s.sleepGoal * 60 ? 'Cumpliste tu meta de sueño.' : `Tu meta es de ${s.sleepGoal} h.`) + ' Ver tu semana' : 'Ver tu sueño', 'data-action="go" data-tab="perfil/sueno"');
  }
  if (!s.alarm && state.sleep.bed?.key === k && !last && m < 12 * 60) {
    return banner('b-sleep', 'c-orange', 'sun-fill', '¿Ya te despertaste?', 'Toca para anotar tu hora de despertar.', 'data-action="sleep-wake"');
  }
  const evening = m >= 20 * 60 || m < 3 * 60;
  const wk = wakeKey();
  if (evening && state.sleep.bed?.key !== wk) {
    const a = alarmFor(wk);
    const text = !s.alarm ? 'Toca cuando te acuestes y anoto tu hora de dormir.'
      : a && !a.stale ? `Tu alarma suena a las ${fmtTime(a.time)}. Toca al acostarte.` : `Toca al acostarte y pongo tu alarma de las ${fmtTime(wakeTimeFor(wk))}.`;
    return banner('b-sleep', 'c-indigo', 'moon-fill', '¿Te vas a dormir?', text, 'data-action="sleep-bed"');
  }
  return '';
}

export function viewToday() {
  const k = todayKey();
  ensureRoutines(k);
  const s = state.settings;
  const list = tasksFor(k);
  const done = list.filter(t => t.done).length;
  const water = waterFor(k);
  const focus = focusFor(k);
  const overdue = overdueTasks();
  const timed = list.filter(t => t.time);
  const untimed = list.filter(t => !t.time);
  const m = nowMin();

  const out = [];
  const greet = greeting('');
  const titleHTML = s.name ? `${greet},<br><span class="lt-name">${esc(s.name)}</span>` : greet;
  out.push(largeTitle(titleHTML, fmtDateLong(k),
    `<button class="avatar-btn" data-action="go" data-tab="perfil" aria-label="Tu perfil">${avatarHTML()}</button>`));

  // Avisos contextuales.
  if (!isStandalone() && !state.hideInstall) {
    out.push(`
      <div class="banner" data-key="b-install" style="--tint: var(--c-blue)">
        <span class="banner-ic">${icon('iphone')}</span>
        <button class="banner-text" data-action="guide" data-guide="install" style="text-align:left">
          <b>Instala Rumbo en tu iPhone</b>
          <p>Safari → Compartir → Añadir a pantalla de inicio.</p>
        </button>
        <button class="banner-x" data-action="hide-install" aria-label="Ocultar">${icon('xmark')}</button>
      </div>`);
  }
  if (m >= toMin(s.planTime) && !state.planned[planTarget()]) {
    out.push(`
      <button class="banner tappable-card" data-key="b-plan" data-action="go" data-tab="plan" data-seg="manana" style="--tint: var(--c-indigo)">
        <span class="banner-ic">${icon('moon-fill')}</span>
        <span class="banner-text"><b>Es hora de planear mañana</b><p>Cierra el día y deja todo listo en 3 minutos.</p></span>
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`);
  }

  if (weeklyPending()) {
    out.push(`
      <button class="banner tappable-card" data-key="b-weekly" data-action="weekly-open" style="--tint: var(--c-purple)">
        <span class="banner-ic">${icon('calendar-check')}</span>
        <span class="banner-text"><b>Tu semana en Rumbo</b><p>Mira cómo te fue ${weekLabel(lastWeek())}.</p></span>
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`);
  }
  out.push(sleepBanner(m));

  // Anillos.
  const current = list.find(t => !t.done && t.time && toMin(t.time) <= m && m < toMin(t.time) + (t.duration || 30));
  const upcoming = list.find(t => !t.done && t.time && toMin(t.time) > m);
  let next;
  if (!list.length) next = '<span>Sin tareas</span><b>Empieza añadiendo una</b>';
  else if (done === list.length) next = '<span>¡Día completo!</span><b>Hiciste todo lo que planeaste 🎉</b>';
  else if (current) {
    // Cuenta regresiva del bloque actual (estilo Tiimo / Structured).
    const start = toMin(current.time), end = start + (current.duration || 30);
    next = `<span>Ahora · quedan ${fmtDur(Math.max(1, end - m))}</span><b>${esc(current.title)}</b><i class="next-bar"><i style="width:${Math.min(100, ((m - start) / (end - start)) * 100).toFixed(0)}%"></i></i>`;
  }
  else if (upcoming) next = `<span>Siguiente · ${toMin(upcoming.time) - m <= 180 ? `en ${fmtDur(toMin(upcoming.time) - m)}` : fmtTime(upcoming.time)}</span><b>${esc(upcoming.title)}</b>`;
  else next = `<span>Te quedan</span><b>${plural(list.length - done, 'tarea', 'tareas')}</b>`;

  const waterGoal = s.waterGoalMl;
  out.push(`
    <section class="card tappable-card" data-key="rings" data-action="go" data-tab="perfil/estadisticas" role="button" tabindex="0" aria-label="Ver estadísticas">
      <div class="rings-card">
        ${rings([
          { key: 'tasks', p: list.length ? done / list.length : 0, label: `Tareas ${done} de ${list.length}` },
          { key: 'water', p: water / waterGoal, label: `Agua ${liters(water)} de ${liters(waterGoal)} litros` },
          { key: 'focus', p: focus / s.focusGoal, label: `Enfoque ${focus} de ${s.focusGoal} minutos` },
        ], 132)}
        <div class="legend">
          <div class="lg"><i class="lg-dot" style="background:${RING_COLORS.tasks[0]}"></i><span class="lg-name">Tareas</span><span class="lg-val">${done}<small>/${list.length}</small></span></div>
          <div class="lg"><i class="lg-dot" style="background:${RING_COLORS.water[0]}"></i><span class="lg-name">Agua</span><span class="lg-val">${liters(water)}<small>/${liters(waterGoal)} L</small></span></div>
          <div class="lg"><i class="lg-dot" style="background:${RING_COLORS.focus[0]}"></i><span class="lg-name">Enfoque</span><span class="lg-val">${focus}<small>/${s.focusGoal} min</small></span></div>
        </div>
      </div>
      <div class="rings-foot">
        <div class="next">${next}</div>
        <button class="pill-btn" data-action="focus-open" style="--accent: var(--c-green); --accent-soft: color-mix(in srgb, var(--c-green) 15%, transparent)">${icon('timer')}Enfocarme</button>
      </div>
    </section>`);

  // Agua.
  const glass = Number(s.glassMl);
  const pct = Math.round((water / waterGoal) * 100);
  out.push(`
    <section class="card" data-key="water">
      ${water >= waterGoal ? `<span class="goal-badge">${icon('check')}Meta cumplida</span>` : ''}
      <div class="water-card">
        ${glassSVG(Math.min(1, water / waterGoal))}
        <div class="water-info">
          <div class="water-amount">${liters(water)}<small>L</small></div>
          <p class="water-sub">de ${liters(waterGoal)} L · ${pct}%</p>
          <div class="water-btns">
            <button class="water-btn solid" data-action="water-add" data-ml="${glass}">${icon('drop-fill')}${glass} ml</button>
            <button class="water-btn" data-action="water-add" data-ml="${glass * 2}">+${glass * 2}</button>
            <button class="water-btn water-undo" data-action="water-undo" aria-label="Deshacer último vaso"${water ? '' : ' disabled style="opacity:.4"'}>${icon('arrow-uturn')}</button>
          </div>
        </div>
      </div>
      <p class="card-foot">${icon('bell')}${nextWaterText()}</p>
    </section>`);

  // Atrasadas.
  if (overdue.length) {
    out.push(sectionHead('Atrasadas', `${overdue.length}`, 'overdue'));
    out.push(`<div class="list" data-key="l-overdue">${overdue.map(t => taskRow(t, {
      showDate: true, move: 'today', capsules: [{ label: 'A hoy', action: 'move', to: 'today', primary: true }],
    })).join('')}</div>`);
  }

  if (!list.length) {
    out.push(sectionHead('Tu día', '', 'day'));
    out.push(`<div class="list" data-key="l-empty">${emptyState({
      ic: 'sun-fill', tint: 'c-orange', title: 'Tu día está en blanco',
      text: 'Añade lo que quieres lograr hoy, o planéalo desde la pestaña Mañana.',
      button: `<button class="btn tinted sm" data-action="add" data-preset="today">${icon('plus')}Añadir tarea</button>`,
    })}</div>`);
    return out.join('');
  }

  // Agenda con línea de "ahora".
  if (timed.length) {
    const rows = [];
    let placed = false;
    for (const t of timed) {
      if (!placed && toMin(t.time) > m) { rows.push(nowLine(fmtTime(fromMin(m)))); placed = true; }
      rows.push(taskRow(t, { timeCol: true, move: 'tomorrow' }));
    }
    if (!placed) rows.push(nowLine(fmtTime(fromMin(m))));
    out.push(sectionHead('Agenda', `${timed.filter(t => t.done).length} de ${timed.length}`, 'agenda'));
    out.push(`<div class="list timeline" data-key="l-agenda">${rows.join('')}</div>`);
  }

  out.push(sectionHead(timed.length ? 'En cualquier momento' : 'Tu día', untimed.length ? `${untimed.filter(t => t.done).length} de ${untimed.length}` : '', 'anytime'));
  out.push(`
    <div class="list" data-key="l-anytime">
      ${untimed.map(t => taskRow(t, { move: 'tomorrow' })).join('')}
      <button class="add-row" data-action="add" data-preset="today">${icon('plus')}Añadir tarea</button>
    </div>`);

  return out.join('');
}
