// Contenido de las hojas: nueva tarea, detalle, rutina, guías y archivos.
import { state, CATEGORIES, catOf, addTask, getTask, commit, setTaskDate, planTarget } from './store.js';
import { todayKey, addDays, esc, fmtTime, relDate, fmtDur, WEEK, fmtDateLong } from './utils.js';
import { segmented, toggleSwitch } from './components.js';
import { parseQuick } from './parse.js';
import { icon } from './icons.js';
import { openSheet, refreshSheet } from './sheet.js';
import { GUIDES } from './guides.js';

const DURATIONS = [[null, 'Sin'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h']];
const CHECK_SVG = '<svg viewBox="0 0 28 28" aria-hidden="true"><circle class="ck-ring" cx="14" cy="14" r="11.5"/><circle class="ck-fill" cx="14" cy="14" r="11.5"/><path class="ck-mark" d="M9 14.4l3.3 3.3L19.2 10.6"/></svg>';

const whenOf = date => {
  const k = todayKey();
  if (!date) return 'inbox';
  if (date === k) return 'today';
  if (date === addDays(k, 1)) return 'tomorrow';
  return 'other';
};
export const dateOf = (when, fallback) => {
  const k = todayKey();
  return { today: k, tomorrow: addDays(k, 1), plan: planTarget(), inbox: null }[when] ?? fallback ?? null;
};

function durationChips(action, value) {
  return `<div class="chips">${DURATIONS.map(([v, l]) => `<button class="chip" data-action="${action}" data-v="${v ?? ''}" aria-pressed="${(value ?? null) === v}">${l}</button>`).join('')}</div>`;
}
function categoryChips(action, value) {
  return `<div class="chips">
    <button class="chip" data-action="${action}" data-v="" aria-pressed="${!value}">Ninguna</button>
    ${CATEGORIES.map(c => `<button class="chip cat" data-action="${action}" data-v="${c.id}" style="--chip-c: var(--c-${c.color})" aria-pressed="${value === c.id}"><i class="dot" style="background:var(--c-${c.color})"></i>${c.name}</button>`).join('')}
  </div>`;
}

/* =========================================================
   Nueva tarea
   ========================================================= */
export const draft = { text: '', when: 'today', dateKey: null, time: '', duration: null, category: null, important: false, manual: {}, added: [] };

export function effectiveDraft() {
  const p = parseQuick(draft.text, todayKey(), CATEGORIES);
  const m = draft.manual;
  let when = draft.when, dateKey = draft.dateKey;
  if (!m.when && p.date !== undefined) { when = whenOf(p.date); dateKey = p.date; }
  return {
    title: p.title,
    when,
    date: when === 'other' ? dateKey : dateOf(when),
    time: when === 'inbox' ? '' : (m.time ? draft.time : (p.time || draft.time)),
    duration: m.duration ? draft.duration : (p.duration ?? draft.duration),
    category: m.category ? draft.category : (p.category ?? draft.category),
    important: m.important ? draft.important : (p.important || draft.important),
    parsed: p,
  };
}

function renderAdd() {
  const e = effectiveDraft();
  const p = e.parsed;
  const chips = [];
  if (!draft.manual.when && p.date !== undefined) chips.push(`<span class="parse-chip" data-key="pc-d">${icon('calendar')}${relDate(p.date)}</span>`);
  if (!draft.manual.time && p.time) chips.push(`<span class="parse-chip" data-key="pc-t">${icon('clock')}${fmtTime(p.time)}</span>`);
  if (!draft.manual.duration && p.duration) chips.push(`<span class="parse-chip" data-key="pc-u">${icon('timer')}${fmtDur(p.duration)}</span>`);
  if (!draft.manual.category && p.category) chips.push(`<span class="parse-chip" data-key="pc-c">${icon('tag')}${catOf(p.category).name}</span>`);
  if (!draft.manual.important && p.important) chips.push(`<span class="parse-chip" data-key="pc-i">${icon('star-fill')}Importante</span>`);
  const whenOpts = [{ value: 'today', label: 'Hoy' }, { value: 'tomorrow', label: 'Mañana' }, { value: 'inbox', label: 'Pendientes' }];

  return `
    <textarea class="compose" rows="1" data-live data-input="add-text" data-enter="add-submit" placeholder="¿Qué vas a hacer?" enterkeyhint="done" aria-label="Nueva tarea">${esc(draft.text)}</textarea>
    <div class="parse-chips">${chips.join('')}</div>
    ${chips.length && e.title.trim() && e.title.trim() !== draft.text.trim() ? `<p class="parse-title" data-key="pt">Se guardará como <b>${esc(e.title)}</b></p>` : ''}
    <div class="group icons" style="margin-top:12px">
      <div class="cell-block">
        <div class="cell-cap">${icon('calendar')}Cuándo${e.when === 'other' ? ` · <b style="color:var(--label)">${fmtDateLong(e.date)}</b>` : ''}</div>
        ${segmented('add-when', whenOpts, e.when)}
      </div>
      ${e.when !== 'inbox' ? `
      <div class="cell" data-key="add-time">
        <span class="cell-ic" style="--tint: var(--c-red)">${icon('clock')}</span>
        <span class="cell-label">Hora</span>
        ${e.time ? `<button class="icon-btn" data-action="add-clear-time" aria-label="Quitar hora" style="width:30px;height:30px;font-size:14px">${icon('xmark')}</button>` : ''}
        <input class="pill-input" type="time" value="${e.time}" data-change="add-time" aria-label="Hora">
      </div>` : ''}
      <div class="cell-block">
        <div class="cell-cap">${icon('timer')}Duración</div>
        ${durationChips('add-dur', e.duration)}
      </div>
      <div class="cell-block">
        <div class="cell-cap">${icon('tag')}Categoría</div>
        ${categoryChips('add-cat', e.category)}
      </div>
      <div class="cell">
        <span class="cell-ic" style="--tint: var(--c-orange)">${icon('star-fill')}</span>
        <span class="cell-label">Importante<small>Una de tus 3 prioridades del día</small></span>
        ${toggleSwitch('add-imp', e.important, '', 'Importante')}
      </div>
    </div>
    <p class="hint">${icon('sparkles')}<span>Escribe natural: <b>“Gym mañana 7pm !”</b>. Rumbo entiende el día, la hora, la duración (“por 1h”), la categoría (#trabajo) y “!” para importante.</span></p>
    <button class="btn primary block" data-action="add-submit"${e.title.trim() ? '' : ' disabled'}>${icon('plus')}Añadir tarea</button>
    ${draft.added.length ? `<div class="added-list">${draft.added.map((t, i) => `<span data-key="ad-${i}">${icon('check')}${esc(t)}</span>`).join('')}</div>` : ''}
  `;
}

export function openAdd(preset = 'today') {
  if (preset === 'plan') preset = planTarget() === todayKey() ? 'today' : 'tomorrow';
  Object.assign(draft, { text: '', when: preset, dateKey: null, time: '', duration: null, category: null, important: false, manual: {}, added: [] });
  openSheet({
    key: 'add',
    title: 'Nueva tarea',
    auto: false,
    render: renderAdd,
    right: () => ({ action: 'add-submit', icon: 'check', label: 'Añadir', disabled: !effectiveDraft().title.trim() }),
    onOpen: sheet => setTimeout(() => sheet.querySelector('.compose')?.focus(), 380),
  });
}

export function submitAdd() {
  const e = effectiveDraft();
  if (!e.title.trim()) return null;
  const t = addTask({ title: e.title, date: e.date, time: e.time || null, duration: e.duration, category: e.category, important: e.important });
  draft.added.push(e.title);
  Object.assign(draft, { text: '', time: '', duration: null, category: null, important: false, manual: draft.manual.when ? { when: true } : {} });
  refreshSheet();
  return t;
}

/* =========================================================
   Detalle de tarea (edición en vivo)
   ========================================================= */
let detailId = null;
export const currentDetail = () => getTask(detailId);

function renderDetail() {
  const t = getTask(detailId);
  if (!t) return '';
  const c = catOf(t.category);
  const when = whenOf(t.date);
  return `
    <div class="title-edit${t.done ? ' done' : ''}" style="--cat:${c ? `var(--c-${c.color})` : 'var(--accent)'}">
      <button class="check" data-action="detail-toggle" role="checkbox" aria-checked="${t.done}" aria-label="Completar">${CHECK_SVG}</button>
      <textarea rows="1" data-live data-input="task-title" aria-label="Título">${esc(t.title)}</textarea>
    </div>
    <div class="group icons">
      <div class="cell-block">
        <div class="cell-cap">${icon('calendar')}Cuándo</div>
        ${segmented('task-when', [{ value: 'today', label: 'Hoy' }, { value: 'tomorrow', label: 'Mañana' }, { value: 'inbox', label: 'Luego' }, { value: 'other', label: 'Fecha' }], when)}
        ${when === 'other' ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><span>${fmtDateLong(t.date)}</span><input class="pill-input" type="date" value="${t.date}" data-change="task-date" aria-label="Fecha"></div>` : ''}
      </div>
      ${t.date ? `
      <div class="cell" data-key="d-time">
        <span class="cell-ic" style="--tint: var(--c-red)">${icon('clock')}</span>
        <span class="cell-label">Hora</span>
        ${t.time ? `<button class="icon-btn" data-action="task-clear-time" aria-label="Quitar hora" style="width:30px;height:30px;font-size:14px">${icon('xmark')}</button>` : ''}
        <input class="pill-input" type="time" value="${t.time || ''}" data-change="task-time" aria-label="Hora">
      </div>` : ''}
      <div class="cell-block"><div class="cell-cap">${icon('timer')}Duración</div>${durationChips('task-dur', t.duration)}</div>
      <div class="cell-block"><div class="cell-cap">${icon('tag')}Categoría</div>${categoryChips('task-cat', t.category)}</div>
      <div class="cell">
        <span class="cell-ic" style="--tint: var(--c-orange)">${icon('star-fill')}</span>
        <span class="cell-label">Importante</span>
        ${toggleSwitch('task-imp', t.important, '', 'Importante')}
      </div>
    </div>

    <h3 class="sec-h small">Subtareas${t.subtasks.length ? ` · ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}` : ''}</h3>
    <div class="group">
      ${t.subtasks.map(s => `
        <div class="sub-row${s.done ? ' done' : ''}" data-key="s-${s.id}" data-sid="${s.id}">
          <button class="check" data-action="sub-toggle" role="checkbox" aria-checked="${s.done}" aria-label="Completar subtarea">${CHECK_SVG}</button>
          <input type="text" value="${esc(s.title)}" data-input="sub-title" aria-label="Subtarea">
          <button class="x" data-action="sub-del" aria-label="Eliminar subtarea">${icon('xmark')}</button>
        </div>`).join('')}
      <div class="sub-add" data-key="sub-add">${icon('plus')}<input type="text" placeholder="Añadir paso" data-enter="sub-add" enterkeyhint="done" aria-label="Nueva subtarea"></div>
    </div>

    <h3 class="sec-h small">Notas</h3>
    <textarea class="notes-area" data-live data-input="task-notes" placeholder="Detalles, links, direcciones…" aria-label="Notas">${esc(t.notes)}</textarea>

    <div style="display:grid;gap:10px;margin-top:22px">
      ${!t.done ? `<button class="btn tinted block" data-action="focus-task" style="--accent: var(--c-green); --accent-soft: color-mix(in srgb, var(--c-green) 14%, transparent)">${icon('timer')}Enfocarme en esta tarea</button>` : ''}
      <button class="btn danger block" data-action="detail-delete">${icon('trash')}Eliminar tarea</button>
    </div>
    <p class="meta-foot">Creada ${relDate(localKey(t.createdAt)).toLowerCase()}${t.routineId ? ' · parte de una rutina' : ''}</p>
  `;
}
const localKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function openTask(id) {
  detailId = id;
  openSheet({
    key: 'task',
    title: () => { const t = getTask(detailId); return t ? (t.date ? relDate(t.date) : 'Pendiente') : ''; },
    render: renderDetail,
    alive: () => !!getTask(detailId),
    right: { action: 'sheet-close', icon: 'check', label: 'Listo' },
  });
}

export function setDetailWhen(when) {
  const t = currentDetail();
  if (!t) return;
  if (when === 'other') setTaskDate(t, t.date && whenOf(t.date) === 'other' ? t.date : addDays(todayKey(), 2));
  else setTaskDate(t, dateOf(when));
  commit();
}

/* =========================================================
   Rutina
   ========================================================= */
export const routineDraft = { id: '', title: '', time: '', duration: null, days: [1, 2, 3, 4, 5], category: null };

function renderRoutine() {
  const r = routineDraft;
  return `
    <div class="title-edit" style="--cat: var(--c-teal)">
      <span class="cell-ic" style="--tint: var(--c-teal);margin-top:1px">${icon('repeat')}</span>
      <textarea rows="1" data-live data-input="routine-title" placeholder="Ej: Gym, Leer 20 min, Clase de inglés" aria-label="Nombre de la rutina">${esc(r.title)}</textarea>
    </div>
    <div class="group icons">
      <div class="cell-block">
        <div class="cell-cap">${icon('calendar')}Se repite</div>
        <div class="chips" style="justify-content:space-between">
          ${WEEK.map(w => `<button class="chip day-chip" data-action="routine-day" data-d="${w.d}" aria-pressed="${r.days.includes(w.d)}" aria-label="${w.n}">${w.s}</button>`).join('')}
        </div>
        <div class="chips" style="margin-top:10px">
          <button class="chip" data-action="routine-preset" data-p="all">Todos los días</button>
          <button class="chip" data-action="routine-preset" data-p="week">Entre semana</button>
          <button class="chip" data-action="routine-preset" data-p="weekend">Fines de semana</button>
        </div>
      </div>
      <div class="cell">
        <span class="cell-ic" style="--tint: var(--c-red)">${icon('clock')}</span>
        <span class="cell-label">Hora</span>
        ${r.time ? `<button class="icon-btn" data-action="routine-clear-time" aria-label="Quitar hora" style="width:30px;height:30px;font-size:14px">${icon('xmark')}</button>` : ''}
        <input class="pill-input" type="time" value="${r.time || ''}" data-change="routine-time" aria-label="Hora">
      </div>
      <div class="cell-block"><div class="cell-cap">${icon('timer')}Duración</div>${durationChips('routine-dur', r.duration)}</div>
      <div class="cell-block"><div class="cell-cap">${icon('tag')}Categoría</div>${categoryChips('routine-cat', r.category)}</div>
    </div>
    ${r.id ? `<button class="btn danger block" data-action="routine-delete" style="margin-top:10px">${icon('trash')}Eliminar rutina</button>` : ''}
  `;
}

export function openRoutine(id) {
  const r = state.routines.find(x => x.id === id);
  Object.assign(routineDraft, r ? { ...r, time: r.time || '', days: [...r.days] } : { id: '', title: '', time: '', duration: null, days: [1, 2, 3, 4, 5], category: null });
  openSheet({
    key: 'routine',
    title: r ? 'Editar rutina' : 'Nueva rutina',
    render: renderRoutine,
    right: () => ({ action: 'routine-save', icon: 'check', label: 'Guardar', disabled: !routineDraft.title.trim() || !routineDraft.days.length }),
    onOpen: sheet => { if (!r) setTimeout(() => sheet.querySelector('textarea')?.focus(), 380); },
  });
}

/* =========================================================
   Guías
   ========================================================= */
let guideId = 'install';
function renderGuide() {
  const g = GUIDES[guideId];
  const done = g.steps.filter((_, i) => state.guide[`${guideId}.${i}`]).length;
  return `
    <div class="guide-hero" style="--tint: var(--${g.tint})">
      <div class="big-ic">${icon(g.ic)}</div>
      <h3>${g.title}</h3>
      <p>${g.intro}</p>
      <div class="progress-bar"><i style="width:${(done / g.steps.length) * 100}%"></i></div>
    </div>
    ${g.callout ? `<p class="callout">${icon('hand')}<span>${g.callout}</span></p>` : ''}
    <div class="group">
      ${g.steps.map(([t, d], i) => {
        const on = !!state.guide[`${guideId}.${i}`];
        return `<button class="step${on ? ' done' : ''}" data-action="guide-step" data-step="${guideId}.${i}" role="checkbox" aria-checked="${on}">
          <span class="check" aria-hidden="true">${CHECK_SVG}</span>
          <span><b>${i + 1}. ${t}</b><span class="d">${d}</span></span>
        </button>`;
      }).join('')}
    </div>
    ${done === g.steps.length ? `<p class="hint" style="justify-content:center;color:var(--c-green);font-weight:600">${icon('check')}¡Todo listo!</p>` : ''}
  `;
}
export function openGuide(id) {
  guideId = id;
  openSheet({ key: 'guide', title: '', render: renderGuide, right: { action: 'sheet-close', icon: 'check', label: 'Listo' } });
}

/* =========================================================
   Archivos (copia de seguridad)
   ========================================================= */
let pendingFile = null;
export const getPendingFile = () => pendingFile;

export function openFileSheet({ filename, text, type, title, message, steps, onOpenFile }) {
  pendingFile = { file: new File([text], filename, { type }), onOpenFile };
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [pendingFile.file] }));
  openSheet({
    key: 'file',
    title: '',
    auto: true,
    render: () => `
      <div class="file-hero">
        <div class="guide-hero" style="--tint: var(--c-blue);padding:0 0 12px"><div class="big-ic">${icon('download')}</div></div>
        <h3>${title}</h3>
        <p>${message}</p>
      </div>
      ${steps ? `<ol class="steps-mini">${steps.map(x => `<li><span>${x}</span></li>`).join('')}</ol>` : ''}
      <div style="display:grid;gap:10px">
        ${canShare ? `<button class="btn primary block" data-action="file-share">${icon('share')}Guardar en Archivos o iCloud…</button>` : ''}
        <button class="btn ${canShare ? 'tinted' : 'primary'} block" data-action="file-open">${icon('download')}Descargar archivo</button>
      </div>`,
  });
}

