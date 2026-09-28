// Vista "Pendientes": todo lo que aún no tiene día.
import { state, inboxTasks, byTime, CATEGORIES } from '../store.js';
import { plural, todayKey, addDays } from '../utils.js';
import { largeTitle, sectionHead, emptyState, taskRow } from '../components.js';
import { icon } from '../icons.js';
import { ui } from '../ui.js';

export function viewInbox() {
  const all = inboxTasks();
  const open = all.filter(t => !t.done);
  const closed = all.filter(t => t.done);
  const after = addDays(todayKey(), 1);
  const upcoming = state.tasks.filter(t => t.date && t.date > after && !t.done).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  const used = CATEGORIES.filter(c => open.some(t => t.category === c.id));
  if (ui.inboxFilter !== 'all' && !used.some(c => c.id === ui.inboxFilter)) ui.inboxFilter = 'all';
  const shown = ui.inboxFilter === 'all' ? open : open.filter(t => t.category === ui.inboxFilter);

  const out = [];
  out.push(largeTitle('Pendientes', open.length ? plural(open.length, 'por hacer', 'por hacer') : 'Sin fecha asignada'));

  if (!open.length && !closed.length && !upcoming.length) {
    out.push(`<div class="list" data-key="l-empty">${emptyState({
      ic: 'tray', tint: 'c-teal', title: 'Mente despejada',
      text: 'Anota aquí lo que tienes que hacer pero aún no tiene día. Al planear la noche, lo traes a mañana.',
      button: `<button class="btn tinted sm" data-action="add" data-preset="inbox">${icon('plus')}Anotar pendiente</button>`,
    })}</div>`);
    return out.join('');
  }

  if (used.length) {
    out.push(`
      <div class="chips" data-key="filters" style="margin-bottom:14px">
        <button class="chip" data-action="inbox-filter" data-cat="all" aria-pressed="${ui.inboxFilter === 'all'}">Todos</button>
        ${used.map(c => `<button class="chip cat" data-action="inbox-filter" data-cat="${c.id}" style="--chip-c: var(--c-${c.color})" aria-pressed="${ui.inboxFilter === c.id}"><i class="dot" style="background:var(--c-${c.color})"></i>${c.name}</button>`).join('')}
      </div>`);
  }

  out.push(`
    <div class="list" data-key="l-inbox">
      ${shown.map(t => taskRow(t, {
        move: 'today',
        capsules: [{ label: 'Hoy', action: 'move', to: 'today' }, { label: 'Mañana', action: 'move', to: 'tomorrow', primary: true }],
      })).join('')}
      <button class="add-row" data-action="add" data-preset="inbox">${icon('plus')}Anotar pendiente</button>
    </div>
    <p class="group-foot" data-key="inbox-tip" style="margin-top:10px">Desliza una tarea a la izquierda para moverla o borrarla, y a la derecha para completarla.</p>`);

  if (upcoming.length) {
    out.push(sectionHead('Próximos días', `${upcoming.length}`, 'upcoming'));
    out.push(`<div class="list" data-key="l-upcoming">${upcoming.map(t => taskRow(t, { showDate: true, move: 'inbox' })).join('')}</div>`);
  }

  if (closed.length) {
    out.push(sectionHead('Completados', `<button class="capsule" data-action="toggle-done-inbox">${ui.showDoneInbox ? 'Ocultar' : `Mostrar ${closed.length}`}</button>`, 'done'));
    if (ui.showDoneInbox) {
      out.push(`<div class="list" data-key="l-done">${closed.map(t => taskRow(t, { move: 'today' })).join('')}</div>`);
      out.push(`<div data-key="clear-done" style="margin-top:12px"><button class="btn danger block" data-action="clear-done-inbox">${icon('trash')}Borrar completados</button></div>`);
    }
  }
  return out.join('');
}
