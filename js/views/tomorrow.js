// Vista "Mañana": el ritual de la noche en 4 pasos.
import { state, tasksFor, inboxTasks, ensureRoutines, planningStreak, planTarget, closingDay, MOODS, catOf } from '../store.js';
import { fmtTime, fmtWeekday, parseKey, nowMin, toMin, esc, plural } from '../utils.js';
import { largeTitle, taskRow } from '../components.js';
import { icon } from '../icons.js';

function stepHead(n, ok, title, sub, right = '') {
  return `
    <div class="step-card-h">
      <span class="step-num">${ok ? icon('check') : n}</span>
      <div style="flex:1;min-width:0"><b>${title}</b><span>${sub}</span></div>
      ${right}
    </div>`;
}

export function viewTomorrow() {
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
  const timedN = plan.filter(t => t.time && !t.done).length;
  const ok = [undone.length === 0, !!journal.mood, plan.length > 0, timedN === 0 ? plan.length > 0 : !!state.exported[tk]];
  const planned = !!state.planned[tk];
  const dayName = fmtWeekday(tk);
  const dateNum = parseKey(tk).getDate();
  const late = nowMin() >= toMin(s.planTime);

  const out = [];
  out.push(largeTitle('Planea tu mañana', `Para el ${dayName} ${dateNum}`));

  const labels = ['Cerrar', 'Reflexión', 'Plan', 'Avisos'];
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
      ${stepHead(2, ok[1], '¿Cómo estuvo tu día?', journal.mood ? MOODS.find(m => m.v === journal.mood).l : 'Elige cómo te sentiste')}
      <div class="moods" role="radiogroup" aria-label="Ánimo">
        ${MOODS.map(m => `<button class="mood" data-action="mood" data-v="${m.v}" aria-pressed="${journal.mood === m.v}"><span>${m.e}</span>${m.l}</button>`).join('')}
      </div>
      <textarea class="reflect" data-live data-input="journal-note" rows="2" placeholder="Lo mejor de hoy, algo que aprendiste o que agradeces…">${esc(journal.note || '')}</textarea>
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

  // 4 · Avisos
  out.push(`
    <section class="card step-card${ok[3] ? ' ok' : ''}" data-key="st4">
      ${stepHead(4, ok[3], 'Que el iPhone te avise', timedN ? `${plural(timedN, 'tarea tiene', 'tareas tienen')} hora` : 'Ninguna tarea con hora')}
      ${timedN
        ? `<button class="btn ${state.exported[tk] ? 'tinted' : 'primary'} block" data-action="ics-day" data-date="${tk}">${icon('calendar')}${state.exported[tk] ? 'Enviar de nuevo al Calendario' : `Enviar ${plural(timedN, 'recordatorio', 'recordatorios')} al Calendario`}</button>
           <p class="group-foot" style="margin:10px 2px 0">Cada tarea con hora llega al Calendario con una alerta ${Number(s.leadMin) ? `${s.leadMin} min antes` : 'a la hora exacta'}, así el iPhone te avisa aunque Rumbo esté cerrada.</p>`
        : `<p class="done-note" style="color:var(--label-2)">${icon('bell')}Ponle hora a una tarea si quieres que el iPhone te avise.</p>`}
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
