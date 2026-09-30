// Pestaña "Plan": el ritual de la noche (Mañana) y la bandeja (Pendientes).
import { state, planTarget, inboxTasks } from '../store.js';
import { fmtWeekday, parseKey, nowMin, toMin, plural } from '../utils.js';
import { largeTitle, segmented } from '../components.js';
import { ui } from '../ui.js';
import { viewRitual } from './ritual.js';
import { viewInbox } from './inbox.js';

// De noche (o de madrugada) lo natural es el ritual; de día, la bandeja.
function defaultSeg() {
  const s = state.settings, m = nowMin();
  return m >= toMin(s.planTime) || m < toMin(s.nightEnd) ? 'manana' : 'pendientes';
}

export function viewPlan() {
  if (!ui.planSeg) ui.planSeg = defaultSeg();
  const tk = planTarget();
  const open = inboxTasks().filter(t => !t.done).length;
  const ritual = ui.planSeg === 'manana';
  const sub = ritual
    ? `Para el ${fmtWeekday(tk)} ${parseKey(tk).getDate()}`
    : (open ? plural(open, 'pendiente', 'pendientes') : 'Sin fecha asignada');

  return `
    ${largeTitle('Plan', sub)}
    <div class="plan-seg" data-key="plan-seg">
      ${segmented('plan-seg', [
        { value: 'manana', label: 'Mañana' },
        { value: 'pendientes', label: open ? `Pendientes · ${open}` : 'Pendientes' },
      ], ui.planSeg)}
    </div>
    <div class="plan-body" data-key="plan-body-${ui.planSeg}">${ritual ? viewRitual() : viewInbox()}</div>`;
}
