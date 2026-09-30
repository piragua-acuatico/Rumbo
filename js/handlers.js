// Todas las acciones de la interfaz.
import {
  state, commit, save, getTask, tasksFor, toggleTask, deleteTask, setTaskDate, addTask, addWater,
  ensureRoutines, replaceState, resetState, planningStreak, planTarget, closingDay, DEFAULT_SETTINGS,
} from './store.js';
import { todayKey, addDays, uid, plural, clamp, nowMin, toMin } from './utils.js';
import { on } from './actions.js';
import { ui } from './ui.js';
import { haptic, toast, confetti, animateOut, pop } from './fx.js';
import { closeSheet, refreshSheet, alertDialog, sheetKey } from './sheet.js';
import {
  openAdd, submitAdd, draft, effectiveDraft, openTask, currentDetail, setDetailWhen,
  openRoutine, routineDraft, openGuide, openFileSheet, getPendingFile, dateOf,
} from './sheets.js';
import { closeOpenRow } from './swipe.js';
import { openFocus, focusAction } from './focus.js';
import { openOnboarding, onbNext, onbBack } from './onboarding.js';
import { nightPlanDate, isNightTime } from './night.js';
import { GUIDES } from './guides.js';

const taskOf = el => getTask(el.closest('[data-id]')?.dataset.id);
const rowOf = el => el.closest('.row');
const MOVED = { today: 'Movida a hoy', tomorrow: 'Movida a mañana', plan: 'Movida a mañana', inbox: 'Guardada en Pendientes' };
const busy = new WeakSet(); // tareas con una animación de mover/borrar en curso

export function registerHandlers({ go, back, render, applyTheme }) {
  /* ---------- Navegación ---------- */
  on('go', el => go(el.dataset.tab, { seg: el.dataset.seg }));
  on('back', () => back());
  on('plan-seg', el => { ui.planSeg = el.dataset.value; haptic(); render(); });
  on('sheet-close', () => closeSheet());

  /* ---------- Tareas ---------- */
  on('toggle', el => {
    const t = taskOf(el);
    if (t && !busy.has(t)) completeTask(t, el);
  });
  on('open', el => { const t = taskOf(el); if (t && !busy.has(t)) openTask(t.id); });

  on('move', async el => {
    const t = taskOf(el);
    if (!t || busy.has(t)) return;
    busy.add(t);
    const to = el.dataset.to;
    const prev = { date: t.date, time: t.time };
    closeOpenRow();
    haptic();
    await animateOut(rowOf(el), to === 'inbox' ? 'left' : 'right');
    busy.delete(t);
    if (!state.tasks.includes(t)) return;
    const kept = setTaskDate(t, dateOf(to));
    commit();
    let used = false;
    toast(kept ? MOVED[to] : 'Ese día ya tiene esta rutina', {
      icon: to === 'inbox' ? 'tray' : 'arrow-right',
      action: { label: 'Deshacer', run: () => {
        if (used) return;
        used = true;
        if (!state.tasks.includes(t)) state.tasks.push(t);
        t.date = prev.date; t.time = prev.time;
        commit();
      } },
    });
  });

  on('delete', async el => {
    const t = taskOf(el);
    if (!t || busy.has(t)) return;
    busy.add(t);
    closeOpenRow();
    haptic('heavy');
    await animateOut(rowOf(el), 'left');
    busy.delete(t);
    const undo = deleteTask(t);
    if (undo) toast('Tarea eliminada', { icon: 'trash', tint: 'c-red', action: { label: 'Deshacer', run: undo } });
  });

  on('pull', el => {
    const t = getTask(el.dataset.id);
    if (!t) return;
    haptic();
    setTaskDate(t, planTarget());
    commit();
  });

  /* ---------- Nueva tarea ---------- */
  on('add', el => {
    const inPlan = ui.tab === 'plan' ? (ui.planSeg === 'pendientes' ? 'inbox' : 'plan') : null;
    const preset = el.dataset.preset || inPlan || 'today';
    haptic();
    openAdd(preset);
  });
  on('add-submit', () => {
    const t = submitAdd();
    if (!t) return;
    haptic('success');
    const box = document.querySelector('.sheet .compose');
    if (box) { box.value = ''; box.focus(); }
  });
  on('add-when', el => { draft.when = el.dataset.value; draft.manual.when = true; haptic(); refreshSheet(); });
  on('add-clear-time', () => { draft.time = ''; draft.manual.time = true; refreshSheet(); });
  on('add-dur', el => { draft.duration = el.dataset.v ? Number(el.dataset.v) : null; draft.manual.duration = true; refreshSheet(); });
  on('add-cat', el => { draft.category = el.dataset.v || null; draft.manual.category = true; refreshSheet(); });
  on('add-imp', () => { draft.important = !effectiveDraft().important; draft.manual.important = true; haptic(); refreshSheet(); });
  on('change:add-time', el => { draft.time = el.value; draft.manual.time = true; refreshSheet(); });
  on('input:add-text', el => { draft.text = el.value; refreshSheet(); });

  /* ---------- Detalle ---------- */
  const withDetail = fn => (el, ev) => { const t = currentDetail(); if (t) { fn(t, el, ev); commit(); } };
  on('detail-toggle', () => { const t = currentDetail(); if (t) completeTask(t, null); });
  on('task-when', el => { haptic(); setDetailWhen(el.dataset.value); });
  on('change:task-date', withDetail((t, el) => { if (el.value) setTaskDate(t, el.value); }));
  on('change:task-time', withDetail((t, el) => { t.time = el.value || null; }));
  on('task-clear-time', withDetail(t => { t.time = null; }));
  on('task-dur', withDetail((t, el) => { t.duration = el.dataset.v ? Number(el.dataset.v) : null; }));
  on('task-cat', withDetail((t, el) => { t.category = el.dataset.v || null; }));
  on('task-imp', withDetail(t => { t.important = !t.important; haptic(); }));
  on('input:task-title', withDetail((t, el) => { if (el.value.trim()) t.title = el.value.replace(/\n/g, ' '); }));
  on('input:task-notes', withDetail((t, el) => { t.notes = el.value; }));
  on('sub-toggle', withDetail((t, el) => {
    const s = t.subtasks.find(x => x.id === el.closest('[data-sid]').dataset.sid);
    if (s) { s.done = !s.done; haptic(s.done ? 'success' : 'light'); }
  }));
  on('sub-del', withDetail((t, el) => {
    const id = el.closest('[data-sid]').dataset.sid;
    t.subtasks = t.subtasks.filter(x => x.id !== id);
  }));
  on('input:sub-title', withDetail((t, el) => {
    const s = t.subtasks.find(x => x.id === el.closest('[data-sid]').dataset.sid);
    if (s) s.title = el.value;
  }));
  on('enter:sub-add', el => {
    const t = currentDetail();
    const title = el.value.trim();
    if (!t || !title) return;
    t.subtasks.push({ id: uid(), title, done: false });
    el.value = '';
    haptic();
    commit();
  });
  on('detail-delete', () => {
    const t = currentDetail();
    if (!t || sheetKey() !== 'task') return;
    closeSheet();
    setTimeout(() => {
      const undo = deleteTask(t);
      if (!undo) return;
      haptic('heavy');
      toast('Tarea eliminada', { icon: 'trash', tint: 'c-red', action: { label: 'Deshacer', run: undo } });
    }, 250);
  });
  on('focus-task', () => {
    const t = currentDetail();
    closeSheet();
    if (t) setTimeout(() => openFocus(t.id), 300);
  });

  /* ---------- Rutinas ---------- */
  on('routine', el => openRoutine(el.dataset.rid || null));
  on('input:routine-title', el => { routineDraft.title = el.value.replace(/\n/g, ' '); refreshSheet(); });
  on('routine-day', el => {
    const d = Number(el.dataset.d);
    routineDraft.days = routineDraft.days.includes(d) ? routineDraft.days.filter(x => x !== d) : [...routineDraft.days, d];
    haptic();
    refreshSheet();
  });
  on('routine-preset', el => {
    routineDraft.days = { all: [0, 1, 2, 3, 4, 5, 6], week: [1, 2, 3, 4, 5], weekend: [0, 6] }[el.dataset.p];
    haptic();
    refreshSheet();
  });
  on('change:routine-time', el => { routineDraft.time = el.value; refreshSheet(); });
  on('routine-clear-time', () => { routineDraft.time = ''; refreshSheet(); });
  on('routine-dur', el => { routineDraft.duration = el.dataset.v ? Number(el.dataset.v) : null; refreshSheet(); });
  on('routine-cat', el => { routineDraft.category = el.dataset.v || null; refreshSheet(); });
  on('routine-save', () => {
    const d = routineDraft;
    if (sheetKey() !== 'routine' || !d.title.trim() || !d.days.length) return;
    const data = { title: d.title.trim(), time: d.time || null, duration: d.duration, days: [...d.days].sort(), category: d.category };
    const k = todayKey();
    let r = state.routines.find(x => x.id === d.id);
    if (r) {
      Object.assign(r, data);
      // Rehace solo las copias futuras intactas; las que moviste o editaste se respetan.
      state.tasks = state.tasks.filter(x => !(x.routineId === r.id && !x.done && x.date >= k && !x.notes && !x.subtasks.length));
    } else {
      r = { id: uid(), ...data };
      state.routines.push(r);
      d.id = r.id;
      // Si hoy ya pasó su hora (o ya es de noche), empieza desde el próximo día.
      const m = nowMin();
      const late = r.time ? toMin(r.time) <= m : (m >= toMin(state.settings.planTime) || isNightTime());
      if (late) state.routineSkips[`${r.id}|${k}`] = true;
    }
    ensureRoutines(k);
    ensureRoutines(addDays(k, 1));
    commit();
    closeSheet();
    haptic('success');
    toast('Rutina guardada', { icon: 'repeat', tint: 'c-teal' });
  });
  on('routine-delete', async () => {
    const i = await alertDialog({
      title: '¿Eliminar esta rutina?', message: 'Se quitará de los próximos días. Lo que ya hiciste se conserva.',
      actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Eliminar', style: 'destructive' }],
    });
    if (i !== 1) return;
    const id = routineDraft.id;
    const k = todayKey();
    state.routines = state.routines.filter(r => r.id !== id);
    state.tasks = state.tasks.filter(x => !(x.routineId === id && !x.done && x.date >= k));
    commit();
    closeSheet();
  });

  /* ---------- Guías ---------- */
  on('guide', el => openGuide(el.dataset.guide));
  on('guide-step', el => {
    const key = el.dataset.step;
    state.guide[key] = !state.guide[key];
    haptic(state.guide[key] ? 'success' : 'light');
    commit();
    const id = key.split('.')[0];
    if (state.guide[key] && GUIDES[id].steps.every((_, i) => state.guide[`${id}.${i}`])) confetti();
  });

  /* ---------- Archivos (copia de seguridad) ---------- */
  on('file-open', () => {
    const p = getPendingFile();
    if (!p) return;
    const url = URL.createObjectURL(p.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = p.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    p.onOpenFile?.();
    haptic('success');
  });
  on('file-share', async () => {
    const p = getPendingFile();
    if (!p) return;
    try {
      await navigator.share({ files: [p.file], title: p.file.name });
      p.onOpenFile?.();
    } catch (err) {
      if (err.name !== 'AbortError') toast('No se pudo compartir', { sub: err.message, icon: 'xmark', tint: 'c-red' });
    }
  });
  on('export', () => {
    const data = JSON.stringify({ app: 'rumbo', exportedAt: new Date().toISOString(), state }, null, 2);
    openFileSheet({
      filename: `rumbo-respaldo-${todayKey()}.json`, text: data, type: 'application/json',
      title: 'Copia de seguridad', message: 'Guárdala en Archivos o en iCloud Drive. Con ella recuperas todo si cambias de teléfono.',
    });
  });
  on('import', () => document.getElementById('importFile')?.click());
  on('change:import-file', el => {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.app !== 'rumbo' || !data.state || !Array.isArray(data.state.tasks)) throw new Error('formato');
        const i = await alertDialog({
          title: '¿Restaurar esta copia?', message: 'Reemplaza todo lo que tienes ahora en Rumbo.',
          actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Restaurar', style: 'default' }],
        });
        if (i !== 1) return;
        replaceState({ ...data.state, onboarded: true });
        applyTheme();
        toast('Datos restaurados', { icon: 'check', tint: 'c-green' });
      } catch {
        toast('Archivo no válido', { sub: 'No parece una copia de Rumbo', icon: 'xmark', tint: 'c-red' });
      }
    };
    reader.readAsText(file);
  });
  on('reset', async () => {
    const i = await alertDialog({
      title: '¿Borrar todo?', message: 'Se eliminarán tus tareas, rutinas, registros y ajustes. No se puede deshacer.',
      actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Borrar', style: 'destructive' }],
    });
    if (i !== 1) return;
    resetState();
    applyTheme();
    go('hoy');
    openOnboarding();
  });
  on('onboarding', () => openOnboarding());
  on('onb-next', () => onbNext());
  on('onb-back', () => onbBack());

  /* ---------- Agua ---------- */
  on('water-add', el => {
    const ml = Number(el.dataset.ml);
    const { before, after } = addWater(ml);
    ui.waterHistory.push(ml);
    haptic();
    const goal = state.settings.waterGoalMl;
    requestAnimationFrame(() => pop(document.querySelector('.water-amount')));
    if (before < goal && after >= goal) {
      setTimeout(() => { confetti({ originY: 0.4 }); haptic('success'); }, 500);
      toast('¡Meta de agua cumplida!', { sub: `${(after / 1000).toLocaleString('es')} L hoy`, icon: 'drop-fill', tint: 'c-blue' });
    }
  });
  on('water-undo', () => {
    const ml = ui.waterHistory.pop() || Number(state.settings.glassMl);
    addWater(-ml);
    haptic();
  });

  /* ---------- Ritual de la noche ---------- */
  on('mood', el => {
    const k = closingDay();
    state.journal[k] = { ...(state.journal[k] || {}), mood: Number(el.dataset.v) };
    haptic();
    commit();
  });
  on('input:journal-note', el => {
    const k = closingDay();
    state.journal[k] = { ...(state.journal[k] || {}), note: el.value };
    save();
  });
  on('finish-day', async () => {
    const tk = planTarget();
    if (!tasksFor(tk).length) {
      const i = await alertDialog({
        title: 'Mañana está vacío', message: 'Añade al menos lo más importante antes de cerrar el día.',
        actions: [{ label: 'Añadir tareas', style: 'default' }, { label: 'Terminar igual' }, { label: 'Cancelar', style: 'cancel' }],
      });
      if (i === 0) { openAdd('plan'); return; }
      if (i !== 1) return;
    }
    state.planned[tk] = Date.now();
    commit();
    haptic('success');
    confetti({ originY: 0.3 });
    const streak = planningStreak();
    toast('Mañana está listo', { sub: streak > 1 ? `🔥 ${streak} días seguidos` : 'Ahora, a descansar', icon: 'moon-fill', tint: 'c-indigo' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  on('unfinish-day', () => { delete state.planned[planTarget()]; commit(); });

  /* ---------- Pendientes / Progreso ---------- */
  on('inbox-filter', el => { ui.inboxFilter = el.dataset.cat; haptic(); render(); });
  on('toggle-done-inbox', () => { ui.showDoneInbox = !ui.showDoneInbox; render(); });
  on('clear-done-inbox', () => {
    const removed = state.tasks.filter(x => x.done && !x.date);
    if (!removed.length) return;
    state.tasks = state.tasks.filter(x => !(x.done && !x.date));
    commit();
    toast(`${plural(removed.length, 'tarea borrada', 'tareas borradas')}`, { icon: 'trash', tint: 'c-red', action: { label: 'Deshacer', run: () => {
      state.tasks.push(...removed.filter(x => !state.tasks.includes(x)));
      commit();
    } } });
  });
  on('range', el => { ui.range = Number(el.dataset.value); ui.selBar = null; haptic(); render(); });
  on('bar', el => { ui.selBar = ui.selBar === el.dataset.sel ? null : el.dataset.sel; haptic(); render(); });

  /* ---------- Perfil y configuración ---------- */
  const setS = (key, value) => { state.settings[key] = value; commit(); };
  on('change:set-name', el => setS('name', el.value.trim()));
  on('input:onb-name', el => { state.settings.name = el.value.trim(); save(); });
  on('set-theme', el => { haptic(); setS('theme', el.dataset.value); applyTheme(); });
  on('set-accent', el => { haptic(); setS('accent', el.dataset.v); applyTheme(); });
  on('set-water-goal', el => { haptic(); setS('waterGoalMl', clamp(state.settings.waterGoalMl + Number(el.dataset.delta) * 250, 500, 6000)); });
  on('change:set-glass', el => setS('glassMl', Number(el.value)));
  on('change:set-water-every', el => setS('waterEvery', Number(el.value)));
  on('change:set-time', el => setS(el.dataset.keySet, el.value || DEFAULT_SETTINGS[el.dataset.keySet]));
  on('set-sleep-goal', el => { haptic(); setS('sleepGoal', clamp(state.settings.sleepGoal + Number(el.dataset.delta) * 0.5, 5, 11)); });
  on('change:wake-for', el => { if (el.value) { state.wakeFor[el.dataset.date] = el.value; commit(); } });
  on('wake-confirm', el => {
    const input = el.closest('.wake-row')?.querySelector('input');
    state.wakeFor[el.dataset.date] = input?.value || state.settings.wakeTime;
    haptic('success');
    commit();
  });

  /* ---------- Foto de perfil ---------- */
  on('profile-photo', async () => {
    if (state.profile.photo) {
      const i = await alertDialog({
        title: 'Foto de perfil', actions: [{ label: 'Cambiar foto', style: 'default' }, { label: 'Quitar foto', style: 'destructive' }, { label: 'Cancelar', style: 'cancel' }],
      });
      if (i === 1) { state.profile.photo = null; commit(); return; }
      if (i !== 0) return;
    }
    document.getElementById('photoInput')?.click();
  });
  on('change:profile-photo-file', async el => {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const prev = state.profile.photo;
      state.profile.photo = await squareThumb(file, 320);
      // Si no cabe en el almacenamiento, no se deja a medias: se vuelve a la foto anterior.
      if (!save()) {
        state.profile.photo = prev;
        toast('No hay espacio para la foto', { sub: 'Libera espacio en el iPhone e inténtalo de nuevo', icon: 'xmark', tint: 'c-red' });
        return;
      }
      commit();
      haptic('success');
    } catch {
      toast('No se pudo usar esa foto', { sub: 'Prueba con otra imagen', icon: 'xmark', tint: 'c-red' });
    }
  });
  on('set-focus-goal', el => { haptic(); setS('focusGoal', clamp(state.settings.focusGoal + Number(el.dataset.delta) * 15, 15, 480)); });
  on('set-focus-default', el => { haptic(); setS('focusDefault', Number(el.dataset.value)); });
  on('change:set-lead', el => setS('leadMin', Number(el.value)));
  on('set-night', () => { haptic(); setS('nightMode', !state.settings.nightMode); });
  on('hide-install', () => { state.hideInstall = true; commit(); });

  /* ---------- Enfoque ---------- */
  on('focus-open', () => { haptic(); openFocus(null); });
  on('focus-pill', () => openFocus());
  for (const a of ['focus-start', 'focus-pause', 'focus-plus', 'focus-preset', 'focus-min', 'focus-stop', 'focus-again', 'focus-done-task']) {
    on(a, el => focusAction(a, el));
  }

  /* ---------- Modo noche ---------- */
  on('night-edit', () => {
    ui.nightBypassUntil = Date.now() + 5 * 60 * 1000;
    if (nightPlanDate() === todayKey()) go('hoy'); else go('plan', { seg: 'manana' });
    toast('Tienes 5 minutos', { sub: 'Ajusta lo necesario y a descansar', icon: 'clock', tint: 'c-indigo' });
  });
  on('submit:night-add', form => {
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    addTask({ title, date: nightPlanDate() });
    input.value = '';
    haptic('success');
    toast('Anotado', { sub: 'Ahora sí, a descansar', icon: 'check', tint: 'c-indigo' });
  });
}

/* Completar con animación, háptica y celebración. */
export function completeTask(t, el) {
  const done = toggleTask(t);
  haptic(done ? 'success' : 'light');
  if (done && t.date === todayKey()) {
    const list = tasksFor(todayKey());
    if (list.length > 1 && list.every(x => x.done)) {
      setTimeout(() => {
        confetti();
        toast('¡Día completo!', { sub: 'Hiciste todo lo que planeaste', icon: 'sparkles', tint: 'c-orange' });
      }, 350);
    }
  }
  if (sheetKey() === 'task') refreshSheet();
}

/* Recorta una imagen al cuadrado del centro y la reduce (JPEG), para la foto de perfil. */
function squareThumb(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}
