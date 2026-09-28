// Piezas de interfaz reutilizables. Devuelven HTML.
import { esc, fmtTime, fmtDur, fromMin, toMin, relDate, timeParts, todayKey } from './utils.js';
import { catOf, isCurrent } from './store.js';
import { icon } from './icons.js';

/* ---------- Encabezado grande ---------- */
export function largeTitle(title, sub = '', trailing = '') {
  return `
    <header class="lt" data-key="lt">
      <div class="lt-text">
        ${sub ? `<p class="lt-sub">${sub}</p>` : ''}
        <h1 class="lt-title">${title}</h1>
      </div>
      ${trailing}
    </header>`;
}

export function sectionHead(title, right = '', key = '') {
  return `<h2 class="sec-h"${key ? ` data-key="sh-${key}"` : ''}><span>${title}</span>${right ? `<span class="sec-r">${right}</span>` : ''}</h2>`;
}

export function emptyState({ ic, tint = 'accent', title, text, button = '', key = 'empty' }) {
  return `
    <div class="empty" data-key="${key}">
      <span class="empty-ic" style="--tint: var(--${tint})">${icon(ic)}</span>
      <b>${title}</b>
      <p>${text}</p>
      ${button}
    </div>`;
}

/* ---------- Fila de tarea ---------- */
const MOVE_LABEL = { today: 'Hoy', tomorrow: 'Mañana', inbox: 'Luego' };

export function taskRow(t, { timeCol = false, showDate = false, move = 'tomorrow', capsules = [] } = {}) {
  const cat = catOf(t.category);
  const color = cat ? `var(--c-${cat.color})` : 'var(--accent)';
  const now = isCurrent(t);
  const meta = [];
  if (t.time && !timeCol) {
    const endT = t.duration ? ` – ${fmtTime(fromMin(toMin(t.time) + t.duration))}` : '';
    meta.push(`<span class="m">${icon('clock')}${fmtTime(t.time)}${endT}</span>`);
  } else if (t.duration) {
    meta.push(`<span class="m">${icon('timer')}${fmtDur(t.duration)}</span>`);
  }
  if (showDate && t.date) meta.push(`<span class="m${t.date < todayKey() ? ' m-late' : ''}">${icon('calendar')}${relDate(t.date)}</span>`);
  if (cat) meta.push(`<span class="m"><i class="dot" style="background:${color}"></i>${cat.name}</span>`);
  if (t.subtasks?.length) meta.push(`<span class="m">${icon('checklist')}${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>`);
  if (t.routineId) meta.push(`<span class="m">${icon('repeat')}</span>`);
  if (t.notes) meta.push(`<span class="m">${icon('note')}</span>`);

  let tcol = '';
  if (timeCol) {
    if (t.time) {
      const { hm, ap } = timeParts(t.time);
      tcol = `<div class="tcol"><b>${hm}</b><span>${ap}</span></div>`;
    } else {
      tcol = '<div class="tcol"></div>';
    }
  }
  const caps = capsules.map(c => `<button class="capsule${c.primary ? ' primary' : ''}" data-action="${c.action}"${c.to ? ` data-to="${c.to}"` : ''}>${c.label}</button>`).join('');

  return `
    <div class="row task${t.done ? ' done' : ''}${now ? ' now' : ''}${t.important ? ' imp' : ''}" data-key="t-${t.id}" data-id="${t.id}" data-keep-class="sw-left sw-right sw-armed" style="--cat:${color}">
      <div class="swipe-bg swipe-lead" aria-hidden="true">${icon(t.done ? 'arrow-uturn' : 'check')}</div>
      <div class="swipe-bg swipe-trail">
        ${move ? `<button class="sw-btn sw-move" data-action="move" data-to="${move}" tabindex="-1">${icon('arrow-right')}<span>${MOVE_LABEL[move]}</span></button>` : ''}
        <button class="sw-btn sw-del" data-action="delete" tabindex="-1">${icon('trash')}<span>Borrar</span></button>
      </div>
      <div class="row-content${caps ? ' has-caps' : ''}" data-swipe data-live>
        ${tcol}
        <button class="check" data-action="toggle" role="checkbox" aria-checked="${t.done}" aria-label="${t.done ? 'Marcar como pendiente' : 'Completar'}: ${esc(t.title)}">
          <svg viewBox="0 0 28 28" aria-hidden="true"><circle class="ck-ring" cx="14" cy="14" r="11.5"/><circle class="ck-fill" cx="14" cy="14" r="11.5"/><path class="ck-mark" d="M9 14.4l3.3 3.3L19.2 10.6"/></svg>
        </button>
        <button class="task-main" data-action="open">
          <span class="task-title">${now ? '<span class="now-pill"><i></i>Ahora</span>' : ''}<span class="tt">${esc(t.title)}</span></span>
          ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
        </button>
        ${t.important ? `<span class="imp-star" aria-label="Importante">${icon('star-fill')}</span>` : ''}
        ${caps ? `<div class="caps">${caps}</div>` : ''}
      </div>
    </div>`;
}

export function nowLine(label) {
  return `<div class="now-line" data-key="now-line" aria-hidden="true"><span>${label}</span><i></i></div>`;
}

/* ---------- Anillos de actividad ---------- */
export const RING_COLORS = {
  tasks: ['#FF2D55', '#FF7AA2'],
  water: ['#0A84FF', '#64D2FF'],
  focus: ['#30D158', '#B4F05C'],
};

export function rings(items, size = 148) {
  const stroke = 16, gap = 3;
  let r = size / 2 - stroke / 2;
  const defs = [];
  const circles = items.map(it => {
    const [a, b] = RING_COLORS[it.key];
    defs.push(`<linearGradient id="rg-${it.key}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
    const c = 2 * Math.PI * r;
    const html = `
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${a}" stroke-width="${stroke}"/>
      <circle class="ring-prog" data-live data-ring="${Math.min(1, it.p).toFixed(4)}" data-c="${c.toFixed(2)}"
        cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="url(#rg-${it.key})" stroke-width="${stroke}"
        style="stroke-dasharray:${c.toFixed(2)};stroke-dashoffset:${c.toFixed(2)};opacity:0"/>`;
    r -= stroke + gap;
    return html;
  });
  return `
    <svg class="rings" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${items.map(i => i.label).join(', ')}">
      <defs>${defs.join('')}</defs>
      <g transform="rotate(-90 ${size / 2} ${size / 2})">${circles.join('')}</g>
    </svg>`;
}

/* ---------- Controles ---------- */
export function segmented(action, options, value, extra = '') {
  const i = options.findIndex(o => String(o.value) === String(value));
  return `
    <div class="seg${i < 0 ? ' seg-none' : ''}" role="radiogroup" style="--n:${options.length};--i:${Math.max(0, i)}" ${extra}>
      <span class="seg-thumb" aria-hidden="true"></span>
      ${options.map(o => `<button type="button" role="radio" aria-checked="${String(o.value) === String(value)}" data-action="${action}" data-value="${o.value}">${o.label}</button>`).join('')}
    </div>`;
}

export function toggleSwitch(action, on, attrs = '', label = '') {
  return `<button type="button" class="switch" role="switch" aria-checked="${!!on}" data-action="${action}" ${attrs}${label ? ` aria-label="${label}"` : ''}><span class="knob"></span></button>`;
}

export function stepper(action, attrs = '') {
  return `
    <div class="stepper">
      <button type="button" data-action="${action}" data-delta="-1" ${attrs} aria-label="Menos">${icon('minus')}</button>
      <i></i>
      <button type="button" data-action="${action}" data-delta="1" ${attrs} aria-label="Más">${icon('plus')}</button>
    </div>`;
}

/* ---------- Celdas estilo Ajustes ---------- */
export function cell({ ic, tint = 'accent', label, value = '', sub = '', action = '', attrs = '', chevron = false, control = '', danger = false, key = '' }) {
  const tag = action ? 'button' : 'div';
  return `
    <${tag} class="cell${danger ? ' danger' : ''}${action ? ' tappable' : ''}"${action ? ` type="button" data-action="${action}"` : ''} ${attrs}${key ? ` data-key="${key}"` : ''}>
      ${ic ? `<span class="cell-ic" style="--tint: var(--${tint})">${icon(ic)}</span>` : ''}
      <span class="cell-label">${label}${sub ? `<small>${sub}</small>` : ''}</span>
      ${value ? `<span class="cell-value">${value}</span>` : ''}
      ${control}
      ${chevron ? `<span class="cell-chev">${icon('chevron-right')}</span>` : ''}
    </${tag}>`;
}

export function timeField(action, value, attrs = '') {
  return `<input class="pill-input" type="time" value="${value || ''}" data-change="${action}" ${attrs}>`;
}

export function selectField(action, options, value, attrs = '') {
  return `
    <label class="pill-select">
      <select data-change="${action}" ${attrs}>
        ${options.map(([v, l]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      ${icon('chevron-down')}
    </label>`;
}
