// Plan › Mañana: el ritual de la noche en 4 pasos.
import { state, tasksFor, inboxTasks, ensureRoutines, planningStreak, planTarget, closingDay, catOf } from '../store.js';
import { fmtTime, fmtWeekday, fmtDur, nowMin, toMin, esc, plural } from '../utils.js';
import { taskRow } from '../components.js';
import { icon } from '../icons.js';
import { alarmFor, alarmWindow } from '../sleep.js';
import { feelOf, feelPad } from '../feelings.js';
import { photoURL, photoMissing } from '../photos.js';

// La foto del día dentro del paso 2: una miniatura para cambiarla, o el botón para añadirla.
function photoRow(k) {
  const has = !!state.journal[k]?.photo && !photoMissing(k);
  const src = has ? photoURL(k, 'thumb') : '';
  return has
    ? `<button class="photo-row" data-action="day-open" data-date="${k}">${src ? `<img src="${src}" alt="">` : '<span class="ph-wait"></span>'}<span><b>Foto del día</b><small>Toca para verla o cambiarla</small></span></button>`
    : `<button class="photo-row add" data-action="photo-add" data-date="${k}"><span class="pr-ic">${icon('camera')}</span><span><b>Añadir la foto del día</b><small>Un momento que quieras recordar</small></span></button>`;
}

function stepHead(n, ok, title, sub, right = '') {
  return `
    <div class="step-card-h">
      <span class="step-num">${ok ? icon('check') : n}</span>
      <div style="flex:1;min-width:0"><b>${title}</b><span>${sub}</span></div>
      ${right}
    </div>`;
}

export function viewRitual() {
  // k = el día que se cierra; tk = el día que se planea (respeta la medianoche).
  const tk = planTarget();
  const k = closingDay();
  ensureRoutines(tk);
  const s = state.settings;
  const undone = state.tasks
    .filter(t => t.date && t.date <= k && !t.done && !(t.routineId && t.date < k))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
  const journal = state.journal[k] || {};
  const plan = tasksFor(tk);
  const imp = plan.filter(t => t.important).length;
  const inbox = inboxTasks().filter(t => !t.done);
  const wake = state.wakeFor[tk];
  // Con alarma activada (y el atajo ya probado), el paso 4 queda listo cuando la alarma está puesta con esa hora.
  const alarmOk = !s.alarm || !state.sleep.ok || (alarmFor(tk) && !alarmFor(tk).stale);
  const ok = [undone.length === 0, !!journal.mood, plan.length > 0, !!wake && alarmOk];
  const planned = !!state.planned[tk];
  const dayName = fmtWeekday(tk);
  const late = nowMin() >= toMin(s.planTime);

  const out = [];
  const labels = ['Cerrar', 'Reflexión', 'Plan', 'Despertar'];
  out.push(`
    <div data-key="ritual-top">
      <div class="ritual-steps">${labels.map((l, i) => `<div class="rs${ok[i] ? ' ok' : ''}"><i></i>${l}</div>`).join('')}</div>
    </div>`);

  if (planned) {
    const streak = planningStreak();
    out.push(`
      <section class="card finish" data-key="finish">
        <div class="moon-big">${icon('moon-fill')}</div>
        <h3>Mañana está listo</h3>
        <p>${plural(plan.length, 'tarea', 'tareas')}${imp ? ` · ${plural(imp, 'importante', 'importantes')}` : ''}. Ya puedes desconectarte y descansar.</p>
        ${streak ? `<span class="streak-chip">${icon('flame-fill')}${plural(streak, 'día seguido', 'días seguidos')}</span>` : ''}
      </section>`);
  } else if (!late) {
    out.push(`<p class="group-foot" data-key="when-hint" style="margin:-6px 4px 14px">Lo ideal es hacerlo a las <b>${fmtTime(s.planTime)}</b>, antes del modo noche (${fmtTime(s.nightStart)}).</p>`);
  }

  // 1 · Cerrar el día
  out.push(`
    <section class="card step-card${ok[0] ? ' ok' : ''}" data-key="st1">
      ${stepHead(1, ok[0], 'Cierra el día', undone.length ? `${plural(undone.length, 'tarea queda', 'tareas quedan')} sin terminar` : 'Nada pendiente de hoy')}
      ${undone.length
        ? `<div class="list flush">${undone.map(t => taskRow(t, {
            showDate: t.date !== k, move: 'inbox',
            capsules: [{ label: 'A mañana', action: 'move', to: 'plan', primary: true }, { label: 'Luego', action: 'move', to: 'inbox' }],
          })).join('')}</div>`
        : `<p class="done-note">${icon('check')}Todo cerrado. ¡Bien hecho!</p>`}
    </section>`);

  // 2 · Reflexión
  out.push(`
    <section class="card step-card${ok[1] ? ' ok' : ''}" data-key="st2">
      ${stepHead(2, ok[1], '¿Cómo estuvo tu día?', feelOf(journal)?.word || 'Elige cómo te sentiste')}
      ${feelPad(k, journal)}
      <textarea class="reflect" data-live data-input="journal-note" rows="2" placeholder="Lo mejor de hoy, algo que aprendiste o que agradeces…">${esc(journal.note || '')}</textarea>
      ${photoRow(k)}
    </section>`);

  // 3 · Plan
  const meter = `<span class="imp-meter" aria-label="${imp} de 3 importantes">${[0, 1, 2].map(i => icon('star-fill', i < imp ? '' : 'off')).join('')}</span>`;
  out.push(`
    <section class="card step-card${ok[2] ? ' ok' : ''}" data-key="st3">
      ${stepHead(3, ok[2], `Plan del ${dayName}`, plan.length ? `${plural(plan.length, 'tarea', 'tareas')} · elige 3 importantes` : 'Añade lo que harás mañana', meter)}
      <div class="list flush timeline-lite">
        ${plan.map(t => taskRow(t, { timeCol: plan.some(x => x.time), move: 'inbox' })).join('')}
        <button class="add-row" data-action="add" data-preset="plan">${icon('plus')}Añadir a mañana</button>
      </div>
      ${imp > 3 ? `<p class="callout" style="margin:14px 0 0">${icon('star-fill')}<span>Tienes ${imp} importantes. Si todo es importante, nada lo es: quédate con las 3 que de verdad mueven tu día.</span></p>` : ''}
      ${inbox.length ? `
        <p class="cell-cap" style="margin:16px 0 10px;font-size:13px;color:var(--label-2);display:flex;gap:6px;align-items:center">${icon('tray')}Trae de pendientes</p>
        <div class="chips">${inbox.slice(0, 12).map(t => {
          const c = catOf(t.category);
          return `<button class="chip" data-action="pull" data-id="${t.id}" data-key="pull-${t.id}">${c ? `<i class="dot" style="background:var(--c-${c.color})"></i>` : icon('plus')}${esc(t.title)}</button>`;
        }).join('')}</div>` : ''}
    </section>`);

  // 4 · Despertador
  const wakeShown = wake || s.wakeTime;
  const alarm = alarmFor(tk);
  const sleepMin = (toMin(wakeShown) - toMin(s.nightStart) + 1440) % 1440;
  out.push(`
    <section class="card step-card${ok[3] ? ' ok' : ''}" data-key="st4">
      ${stepHead(4, ok[3], 'Despertador', wake ? `Te levantas a las ${fmtTime(wake)}` : '¿A qué hora te levantas?')}
      <div class="wake-row">
        <span class="wake-ic">${icon('alarm')}</span>
        <input class="pill-input wake-input" type="time" value="${wakeShown}" data-change="wake-for" data-date="${tk}" aria-label="Hora de despertar">
        ${!s.alarm
          ? (wake ? '' : `<button class="capsule primary" data-action="wake-confirm" data-date="${tk}">Listo</button>`)
          : alarm && !alarm.stale
            ? `<span class="alarm-ok">${icon('check')}Alarma puesta</span>`
            : alarmWindow(tk, wakeShown).ok
              ? `<button class="capsule primary" data-action="alarm-set" data-date="${tk}">${alarm ? 'Actualizar alarma' : 'Poner alarma'}</button>`
              : (wake ? '' : `<button class="capsule primary" data-action="wake-confirm" data-date="${tk}">Listo</button>`)}
      </div>
      <p class="group-foot" style="margin:12px 2px 0">Si te acuestas a las ${fmtTime(s.nightStart)}, dormirías <b>${fmtDur(sleepMin)}</b> (tu meta es de ${s.sleepGoal} h).${s.alarm
        ? (!alarm && !alarmWindow(tk, wakeShown).ok && !alarmWindow(tk, wakeShown).past
          ? ` Podrás poner la alarma después de las ${fmtTime(wakeShown)} de hoy: el Reloj del iPhone solo la programa para las próximas 24 horas.`
          : ` ${alarm && !alarm.stale ? 'Rumbo puso la alarma en el Reloj de tu iPhone' : 'Rumbo pone la alarma en el Reloj de tu iPhone'}${s.alarmBackup ? `, con una de respaldo ${s.alarmBackup} min después` : ''}: al despertar, la misión la apaga.`)
        : ''}</p>
    </section>`);

  if (!planned) {
    out.push(`
      <div data-key="finish-btn" style="margin-top:6px">
        <button class="btn primary block" data-action="finish-day" style="min-height:56px;font-size:18px">${icon('moon-fill')}Terminar el día</button>
      </div>`);
  } else {
    out.push(`<div data-key="finish-btn" style="margin-top:6px"><button class="btn plain block" data-action="unfinish-day">Reabrir la planificación</button></div>`);
  }
  return out.join('');
}
