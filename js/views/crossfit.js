// Pestaña "CrossFit": levantamientos (PR, 1RM y nivel), complex, entrenos y cuerpo.
// Pesos de barra en libras, peso corporal en kg y medidas en cm.
import { state, commit } from '../store.js';
import { todayKey, addDays, parseKey, relDate, esc, plural, cap, fmtDateLong } from '../utils.js';
import { largeTitle, sectionHead, emptyState, segmented, stepper } from '../components.js';
import { icon } from '../icons.js';
import { ui } from '../ui.js';
import { openSheet, closeSheet, refreshSheet, alertDialog } from '../sheet.js';
import { haptic, toast } from '../fx.js';
import { savePhoto, deletePhoto, photoURL, photoMissing } from '../photos.js';
import {
  LIFTS, liftOf, COMPLEX_IDEAS, oneRM, bestOneRM, MAX_EST_REPS, crossfitPercentile, meierMarks, MEIER_CITE, toKg,
  fatDoD, fatNavy, fatRFM, aceCategory, whtr, bmi, clampFat,
} from '../crossfit.js';

const cf = () => state.cf;
const sex = () => cf().profile.sex;
const num = v => Number(v).toLocaleString('es', { maximumFractionDigits: 1 });
const lbs = v => `${num(v)} lb`;
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const bodyKey = date => `cuerpo-${date}`;

/* =========================================================
   Gráfico de línea simple (SVG): puntos { date, v }.
   ========================================================= */
function lineChart(points, { unit = '', color = 'var(--accent)', key = 'chart' } = {}) {
  if (points.length < 2) return '';
  const W = 320, H = 110, P = 8;
  const t = points.map(p => new Date(`${p.date}T12:00`).getTime());
  const v = points.map(p => p.v);
  const [t0, t1] = [Math.min(...t), Math.max(...t)];
  let [v0, v1] = [Math.min(...v), Math.max(...v)];
  if (v0 === v1) { v0 -= 1; v1 += 1; }
  const x = i => P + (t1 === t0 ? (W - 2 * P) / 2 : ((t[i] - t0) / (t1 - t0)) * (W - 2 * P));
  const y = i => H - P - ((v[i] - v0) / (v1 - v0)) * (H - 2 * P);
  const path = points.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(i).toFixed(1)}`).join(' ');
  return `
    <div class="cf-chart" data-key="${key}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <path d="${path} L${x(points.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z" fill="${color}" opacity=".12"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        ${points.map((_, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(i).toFixed(1)}" r="3.5" fill="${color}"/>`).join('')}
      </svg>
      <div class="cf-chart-axis"><span>${relDate(points[0].date)}</span><span>máx. ${num(Math.max(...v))}${unit}</span><span>${relDate(points[points.length - 1].date)}</span></div>
    </div>`;
}

/* =========================================================
   Tus datos (sexo y estatura): los necesitan las comparaciones y las fórmulas.
   ========================================================= */
function profileCard() {
  const p = cf().profile;
  return `
    <section class="card cf-setup" data-key="cf-setup">
      <span class="cf-setup-ic">${icon('person')}</span>
      <h3>Dos datos para empezar</h3>
      <p>Las comparaciones con otros atletas y las fórmulas de % de grasa son distintas para hombres y mujeres, y algunas usan tu estatura.</p>
      ${segmented('cf-sex', [{ value: 'm', label: 'Hombre' }, { value: 'f', label: 'Mujer' }], p.sex || '')}
      <label class="cf-height">Estatura <input class="pill-input" type="text" inputmode="decimal" placeholder="cm" value="${p.heightCm ?? ''}" data-change="cf-height" aria-label="Estatura en centímetros"> cm</label>
    </section>`;
}

/* =========================================================
   Levantamientos
   ========================================================= */
const entriesOf = liftId => cf().lifts.filter(e => e.lift === liftId).sort((a, b) => b.date.localeCompare(a.date));

function levelText(pct, est) {
  if (est) return `Con tu 1RM estimado, levantarías más que el ~${pct} % de los crossfitters del estudio`;
  return pct >= 99 ? 'Levantas más que el 99 % de los crossfitters del estudio' : `Levantas más que el ${pct} % de los crossfitters del estudio`;
}

function liftsView() {
  const used = LIFTS.filter(l => cf().lifts.some(e => e.lift === l.id))
    .map(l => ({ l, list: entriesOf(l.id) }))
    .sort((a, b) => b.list[0].date.localeCompare(a.list[0].date));
  const out = [`
    <div class="cf-actions" data-key="cf-lift-actions">
      <button class="btn primary" data-action="cf-lift-new">${icon('plus')}Levantamiento</button>
      <button class="btn tinted" data-action="cf-complex-new">${icon('plus')}Complex</button>
    </div>`];
  out.push(sectionHead('Tus récords', used.length ? `${used.length}` : '', 'cf-h-prs'));
  if (!used.length) {
    out.push(`<div class="list" data-key="cf-lifts-empty">${emptyState({ ic: 'dumbbell', tint: 'c-orange', title: 'Tu primer récord', text: 'Registra un levantamiento con su peso y repeticiones. Rumbo guarda tu historial, tu mejor marca y tu 1RM.', key: 'cf-le' })}</div>`);
  } else {
    out.push(`<div class="list" data-key="cf-lifts">${used.map(({ l, list }) => {
      const best = bestOneRM(list, l);
      const pct = best && l.meier && sex() ? crossfitPercentile(l.meier, sex(), toKg(best.lb)) : null;
      const top = list.reduce((a, e) => (e.lb > a.lb ? e : a), list[0]);
      return `
        <button class="cf-row" data-key="cfl-${l.id}" data-action="cf-lift-open" data-lift="${l.id}">
          <span class="cf-row-main"><b>${l.name}</b><small>${pct != null ? `Más que el ${best.est ? '~' : ''}${pct} % de los crossfitters` : `${l.en} · ${plural(list.length, 'registro', 'registros')}`}</small></span>
          <span class="cf-row-val">${best
            ? `<b>${lbs(best.lb)}</b><small>${best.est ? '1RM est.' : '1RM'}</small>`
            : `<b>${lbs(top.lb)}</b><small>× ${top.reps} reps</small>`}</span>
          <span class="cell-chev">${icon('chevron-right')}</span>
        </button>`;
    }).join('')}</div>`);
  }
  const groups = {};
  for (const c of cf().complexes) (groups[c.name.toLowerCase()] ||= []).push(c);
  const complexes = Object.values(groups).map(list => list.sort((a, b) => b.lb - a.lb || b.date.localeCompare(a.date)));
  if (complexes.length) {
    out.push(sectionHead('Complex', '', 'cf-h-cx'));
    out.push(`<div class="list" data-key="cf-cx">${complexes.map(list => `
      <button class="cf-row" data-key="cfc-${esc(list[0].name.toLowerCase())}" data-action="cf-complex-open" data-name="${esc(list[0].name)}">
        <span class="cf-row-main"><b>${esc(list[0].name)}</b><small>${plural(list.length, 'registro', 'registros')} · el más pesado ${relDate(list[0].date).toLowerCase()}</small></span>
        <span class="cf-row-val"><b>${lbs(list[0].lb)}</b><small>mejor carga</small></span>
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`).join('')}</div>`);
  }
  out.push(`<p class="group-foot" data-key="cf-lift-foot">${icon('info')} El 1RM estimado usa la fórmula de Epley y solo se calcula con ${MAX_EST_REPS} repeticiones o menos; en los levantamientos olímpicos y en los complex solo cuenta lo que levantaste de verdad. El nivel compara tu 1RM con ${MEIER_CITE}.</p>`);
  return out.join('');
}

/* ---------- Registrar un levantamiento ---------- */
const liftDraft = { lift: 'deadlift', date: '', lb: '', reps: '1', note: '' };
function renderLiftLog() {
  const d = liftDraft;
  const l = liftOf(d.lift);
  const r = oneRM({ lb: pos(d.lb), reps: Number(d.reps) }, l);
  return `
    <div class="group cf-form">
      <label class="cell"><span class="cell-label">Ejercicio</span>
        <span class="pill-select"><select data-change="cf-field" data-f="lift">${LIFTS.map(x => `<option value="${x.id}"${x.id === d.lift ? ' selected' : ''}>${x.name}</option>`).join('')}</select>${icon('chevron-down')}</span>
      </label>
      <label class="cell"><span class="cell-label">Peso</span><input class="pill-input num-input" type="text" inputmode="decimal" placeholder="0" value="${esc(d.lb)}" data-input="cf-field" data-f="lb" aria-label="Peso en libras"><span class="unit">lb</span></label>
      <label class="cell"><span class="cell-label">Repeticiones</span><input class="pill-input num-input" type="number" inputmode="numeric" step="1" min="1" max="50" value="${esc(d.reps)}" data-input="cf-field" data-f="reps" aria-label="Repeticiones"></label>
      <label class="cell"><span class="cell-label">Fecha</span><input class="pill-input" type="date" max="${todayKey()}" value="${d.date}" data-change="cf-field" data-f="date" aria-label="Fecha"></label>
    </div>
    <p class="cf-hint">${!pos(d.lb) ? `${l.en}${l.kind === 'olimpico' ? ' · levantamiento olímpico: cuenta el single' : ''}`
      : r ? (r.est ? `1RM estimado: <b>${lbs(r.lb)}</b>` : `Es un 1RM: <b>${lbs(r.lb)}</b>`)
        : l.kind === 'olimpico' ? 'En los olímpicos no se estima el 1RM: se guarda tal cual.' : `Con más de ${MAX_EST_REPS} repeticiones el 1RM no se estima (la fórmula deja de ser confiable).`}</p>
    <textarea class="reflect" rows="1" data-live data-input="cf-field" data-f="note" placeholder="Nota (opcional): cinturón, sensación, técnica…">${esc(d.note)}</textarea>`;
}
export function openLiftLog(liftId) {
  Object.assign(liftDraft, { lift: liftId || liftDraft.lift || 'deadlift', date: todayKey(), lb: '', reps: '1', note: '' });
  openSheet({
    key: 'cf-lift-log', title: 'Registrar levantamiento', render: renderLiftLog,
    right: () => ({ action: 'cf-lift-save', icon: 'check', label: 'Guardar', disabled: !(pos(liftDraft.lb) && Number(liftDraft.reps) >= 1) }),
    onOpen: sheet => setTimeout(() => sheet.querySelector('[data-f="lb"]')?.focus(), 380),
  });
}

/* ---------- Detalle de un levantamiento ---------- */
let liftOpen = null;
function levelBar(l, best) {
  if (!l.meier || !best) return '';
  if (!sex()) return '<p class="cf-hint">Elige si eres hombre o mujer arriba para ver tu nivel.</p>';
  const pct = crossfitPercentile(l.meier, sex(), toKg(best.lb));
  const marks = meierMarks(l.meier, sex());
  return `
    <div class="cf-level">
      <p class="cf-level-t"><b>${levelText(pct, best.est)}</b></p>
      <div class="cf-bar"><i style="width:${pct}%"></i><span class="you" style="left:${pct}%"></span>
        ${marks.map(m => `<span class="mk" style="left:${m.pct}%"><small>${m.lb}</small></span>`).join('')}
      </div>
      <p class="cf-level-cite">Marcas: percentiles 20, 50, 75, 90 y 99 en lb (${sex() === 'f' ? 'mujeres' : 'hombres'}). ${MEIER_CITE}.</p>
    </div>`;
}
function renderLift() {
  const l = liftOf(liftOpen);
  const list = entriesOf(l.id);
  const best = bestOneRM(list, l);
  const byDay = {};
  for (const e of list) { const r = oneRM(e, l); if (r && (!byDay[e.date] || r.lb > byDay[e.date])) byDay[e.date] = r.lb; }
  const points = Object.entries(byDay).sort().map(([date, v]) => ({ date, v }));
  return `
    <div class="cf-detail">
      <p class="cf-en">${l.en}${l.kind === 'olimpico' ? ' · olímpico' : ''}</p>
      ${best ? `<div class="cf-big"><b>${lbs(best.lb)}</b><span>${best.est ? `1RM estimado (de ${lbs(best.from.lb)} × ${best.from.reps})` : '1RM'} · ${relDate(best.date).toLowerCase()}</span></div>` : '<p class="cf-hint">Aún no hay un 1RM: registra un single (o, en fuerza, una serie de 10 o menos).</p>'}
      ${levelBar(l, best)}
      ${lineChart(points, { unit: ' lb', key: 'lift-chart' })}
      <button class="btn tinted block" data-action="cf-lift-new" data-lift="${l.id}">${icon('plus')}Registrar ${l.name.toLowerCase()}</button>
      <h4 class="ds-h">Historial</h4>
      <div class="group">${list.map(e => {
        const r = oneRM(e, l);
        return `<div class="cell cf-hist" data-key="h-${e.id}">
          <span class="cell-label">${lbs(e.lb)} × ${e.reps}<small>${relDate(e.date)}${r?.est ? ` · 1RM est. ${lbs(r.lb)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</small></span>
          <button class="icon-btn" data-action="cf-lift-delete" data-id="${e.id}" aria-label="Borrar registro">${icon('trash')}</button>
        </div>`;
      }).join('')}</div>
    </div>`;
}
export function openLift(id) {
  liftOpen = id;
  openSheet({ key: 'cf-lift', title: () => liftOf(liftOpen).name, render: renderLift, alive: () => entriesOf(liftOpen).length > 0 });
}

/* ---------- Complex ---------- */
const cxDraft = { name: '', date: '', lb: '', note: '' };
function renderComplexLog() {
  const d = cxDraft;
  return `
    <div class="title-edit" style="--cat: var(--c-orange)">
      <span class="cell-ic" style="--tint: var(--c-orange);margin-top:1px">${icon('dumbbell')}</span>
      <textarea rows="1" data-live data-input="cf-cx-field" data-f="name" placeholder="Ej: Clean + Front squat + Jerk" aria-label="Movimientos del complex">${esc(d.name)}</textarea>
    </div>
    <div class="chips cf-ideas">${COMPLEX_IDEAS.map(x => `<button class="chip" data-action="cf-cx-idea" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="group cf-form">
      <label class="cell"><span class="cell-label">Carga más pesada</span><input class="pill-input num-input" type="text" inputmode="decimal" placeholder="0" value="${esc(d.lb)}" data-input="cf-cx-field" data-f="lb" aria-label="Peso en libras"><span class="unit">lb</span></label>
      <label class="cell"><span class="cell-label">Fecha</span><input class="pill-input" type="date" max="${todayKey()}" value="${d.date}" data-change="cf-cx-field" data-f="date" aria-label="Fecha"></label>
    </div>
    <p class="cf-hint">Un complex son varios movimientos seguidos en una misma serie. Se anota la carga más pesada con la que completaste todo el complex; no es un 1RM.</p>`;
}
export function openComplexLog(name = '') {
  Object.assign(cxDraft, { name, date: todayKey(), lb: '', note: '' });
  openSheet({ key: 'cf-cx-log', title: 'Registrar complex', render: renderComplexLog, right: () => ({ action: 'cf-cx-save', icon: 'check', label: 'Guardar', disabled: !cxDraft.name.trim() || !pos(cxDraft.lb) }) });
}
let cxOpen = '';
function renderComplex() {
  const list = cf().complexes.filter(c => c.name.toLowerCase() === cxOpen.toLowerCase()).sort((a, b) => b.date.localeCompare(a.date));
  const points = list.slice().reverse().map(c => ({ date: c.date, v: c.lb }));
  return `
    <div class="cf-detail">
      ${list.length ? `<div class="cf-big"><b>${lbs(Math.max(...list.map(c => c.lb)))}</b><span>tu mejor carga</span></div>` : ''}
      ${lineChart(points, { unit: ' lb', key: 'cx-chart' })}
      <button class="btn tinted block" data-action="cf-complex-new" data-name="${esc(cxOpen)}">${icon('plus')}Registrar de nuevo</button>
      <h4 class="ds-h">Historial</h4>
      <div class="group">${list.map(c => `<div class="cell cf-hist" data-key="h-${c.id}">
        <span class="cell-label">${lbs(c.lb)}<small>${relDate(c.date)}</small></span>
        <button class="icon-btn" data-action="cf-cx-delete" data-id="${c.id}" aria-label="Borrar registro">${icon('trash')}</button>
      </div>`).join('')}</div>
    </div>`;
}
export function openComplex(name) {
  cxOpen = name;
  openSheet({ key: 'cf-cx', title: () => cxOpen, render: renderComplex, alive: () => cf().complexes.some(c => c.name.toLowerCase() === cxOpen.toLowerCase()) });
}

/* =========================================================
   Entrenos: tu diario del box (el WOD del día, tu resultado y qué tan duro fue).
   Semanas de lunes a domingo; la meta semanal y la racha de semanas cumpliéndola.
   ========================================================= */
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Esfuerzo percibido de la sesión (escala de 1 a 10, como el RPE de sesión de Foster, 2001).
const RPE_LABEL = { 1: 'Muy fácil', 2: 'Fácil', 3: 'Moderado', 4: 'Algo duro', 5: 'Duro', 6: 'Duro', 7: 'Muy duro', 8: 'Muy duro', 9: 'Casi al máximo', 10: 'Al máximo' };
const weekStart = k => addDays(k, -((parseKey(k).getDay() + 6) % 7));
const sessionsSorted = () => cf().sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const daysTrained = (from, to) => new Set(cf().sessions.filter(s => s.date >= from && s.date <= to).map(s => s.date)).size;

// Semanas seguidas cumpliendo la meta (la semana en curso cuenta solo si ya la cumpliste).
function weekStreak() {
  const goal = cf().weekGoal;
  let w = weekStart(todayKey());
  let n = 0;
  if (daysTrained(w, addDays(w, 6)) >= goal) n++;
  for (;;) {
    w = addDays(w, -7);
    if (daysTrained(w, addDays(w, 6)) < goal) break;
    n++;
    if (n > 520) break;
  }
  return n;
}

function sessionsView() {
  const goal = cf().weekGoal;
  const t = todayKey(), ws = weekStart(t);
  const done = new Set(cf().sessions.filter(s => s.date >= ws && s.date <= addDays(ws, 6)).map(s => s.date));
  const streak = weekStreak();
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
  const counts = weeks.map(w => daysTrained(w, addDays(w, 6)));
  const top = Math.max(goal, ...counts, 1);
  const list = sessionsSorted();
  return `
    <section class="card cf-week" data-key="cf-week">
      <div class="cf-week-head">
        <div><span>Esta semana</span><b>${done.size}<small> de ${goal} entrenos</small></b></div>
        <div class="cf-goal"><span>Meta</span>${stepper('cf-goal')}</div>
      </div>
      <div class="cf-days">${WEEKDAYS.map((l, i) => {
        const k = addDays(ws, i);
        return `<span class="${done.has(k) ? 'on' : ''}${k === t ? ' today' : ''}${k > t ? ' fut' : ''}"><i>${done.has(k) ? icon('check') : ''}</i>${l}</span>`;
      }).join('')}</div>
      <p class="cf-streak">${streak ? `🔥 ${plural(streak, 'semana seguida', 'semanas seguidas')} cumpliendo tu meta` : done.size >= goal ? '¡Meta de la semana cumplida!' : `Te ${goal - done.size === 1 ? 'falta 1 entreno' : `faltan ${goal - done.size} entrenos`} para tu meta de la semana`}</p>
      <div class="cf-weeks" style="--g:${(goal / top).toFixed(3)}" aria-label="Entrenos de las últimas 8 semanas">
        <em class="goal-line"></em>
        ${counts.map((c, i) => `<div class="${c >= goal ? 'ok' : ''}${i === 7 ? ' cur' : ''}"><i style="height:${(c / top * 100).toFixed(1)}%"></i><span>${c}</span></div>`).join('')}
      </div>
    </section>
    <div class="cf-actions" data-key="cf-ses-actions"><button class="btn primary" data-action="cf-ses-new">${icon('plus')}Registrar entreno</button></div>
    ${sectionHead('Tus entrenos', list.length ? `${list.length}` : '', 'cf-h-ses')}
    ${list.length ? `<div class="list" data-key="cf-ses-list">${list.slice(0, 60).map(s => `
      <button class="cf-row cf-ses" data-key="cfs-${s.id}" data-action="cf-ses-open" data-id="${s.id}">
        <span class="cf-row-main"><b>${esc(s.wod.split('\n')[0])}</b><small>${cap(relDate(s.date))}${s.result ? ` · ${esc(s.result)}` : ''}</small></span>
        ${s.rpe ? `<span class="rpe rpe-${Math.ceil(s.rpe / 2)}" title="${RPE_LABEL[s.rpe]}">${s.rpe}</span>` : ''}
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`).join('')}</div>`
      : `<div class="list" data-key="cf-ses-empty">${emptyState({ ic: 'dumbbell', tint: 'c-orange', title: 'Tu primer entreno', text: 'Escribe el WOD del día como está en la pizarra, tu resultado y qué tan duro fue. Así ves cuántos días entrenas y tu racha.', key: 'cf-se' })}</div>`}
    <p class="group-foot" data-key="cf-ses-foot">${icon('info')} El esfuerzo es del 1 (muy fácil) al 10 (al máximo): es la escala de esfuerzo percibido de la sesión (RPE) que usan los entrenadores para medir qué tan dura fue.</p>`;
}

const sesDraft = { id: '', date: '', wod: '', result: '', rpe: null, note: '' };
function renderSession() {
  const d = sesDraft;
  return `
    <div class="group cf-form">
      <label class="cell"><span class="cell-label">Fecha</span><input class="pill-input" type="date" max="${todayKey()}" value="${d.date}" data-change="cf-ses-field" data-f="date" aria-label="Fecha"></label>
    </div>
    <h4 class="ds-h">El WOD</h4>
    <textarea class="reflect cf-wod-text" rows="4" data-live data-input="cf-ses-field" data-f="wod" placeholder="Como está en la pizarra. Ej:&#10;AMRAP 15 min&#10;10 burpees&#10;15 wall balls 20 lb">${esc(d.wod)}</textarea>
    <h4 class="ds-h">Tu resultado</h4>
    <input class="cf-result" type="text" value="${esc(d.result)}" data-input="cf-ses-field" data-f="result" maxlength="120" placeholder="Ej: 6 rondas + 4 · 12:30 · 185 lb · Rx" aria-label="Tu resultado">
    <h4 class="ds-h">¿Qué tan duro fue?${d.rpe ? ` <span class="rpe-word">${d.rpe} · ${RPE_LABEL[d.rpe]}</span>` : ''}</h4>
    <div class="rpe-pick" role="radiogroup" aria-label="Esfuerzo del 1 al 10">${Array.from({ length: 10 }, (_, i) => i + 1).map(v => `<button type="button" class="rpe rpe-${Math.ceil(v / 2)}${d.rpe === v ? ' on' : ''}" data-action="cf-ses-rpe" data-v="${v}" role="radio" aria-checked="${d.rpe === v}" aria-label="${v}: ${RPE_LABEL[v]}">${v}</button>`).join('')}</div>
    <textarea class="reflect" rows="2" data-live data-input="cf-ses-field" data-f="note" placeholder="Nota (opcional): cómo te sentiste, qué escalaste, qué mejorar…">${esc(d.note)}</textarea>
    ${d.id ? `<button class="btn danger block" data-action="cf-ses-delete" style="margin-top:14px">${icon('trash')}Borrar este entreno</button>` : ''}`;
}
export function openSession(id) {
  const s = cf().sessions.find(x => x.id === id);
  Object.assign(sesDraft, s ? { ...s } : { id: '', date: todayKey(), wod: '', result: '', rpe: null, note: '' });
  openSheet({
    key: 'cf-ses', title: s ? 'Entreno' : 'Registrar entreno', render: renderSession,
    right: () => ({ action: 'cf-ses-save', icon: 'check', label: 'Guardar', disabled: !sesDraft.wod.trim() }),
    onOpen: sheet => { if (!s) setTimeout(() => sheet.querySelector('.cf-wod-text')?.focus(), 380); },
  });
}

/* =========================================================
   Cuerpo
   ========================================================= */
const bodySorted = () => cf().body.slice().sort((a, b) => a.date.localeCompare(b.date));
// % de grasa principal (Ejército de EE. UU., una medida) y las otras dos como segunda opinión.
export function fatOf(e) {
  const p = cf().profile;
  if (!p.sex) return null;
  return {
    main: clampFat(fatDoD(p.sex, e.kg, e.waist)),
    navy: clampFat(fatNavy(p.sex, p.heightCm, e.waist, e.neck, e.hip)),
    rfm: clampFat(fatRFM(p.sex, p.heightCm, e.waist)),
  };
}
const lastWith = (list, f) => [...list].reverse().find(e => e[f] != null);

function bodyView() {
  const list = bodySorted();
  const p = cf().profile;
  const out = [`<div class="cf-actions" data-key="cf-body-actions"><button class="btn primary" data-action="cf-body-new">${icon('plus')}Registrar medidas</button></div>`];
  if (!list.length) {
    out.push(`<div class="list" data-key="cf-body-empty">${emptyState({ ic: 'person', tint: 'c-purple', title: 'Tu punto de partida', text: 'Anota tu peso y tu cintura (en el ombligo). Con eso Rumbo calcula tu % de grasa; con una foto ves tu antes y después.', key: 'cf-be' })}</div>`);
  } else {
    const wE = lastWith(list, 'kg'), aE = lastWith(list, 'waist');
    const firstKg = list.find(e => e.kg != null);
    const both = [...list].reverse().find(e => e.kg != null && e.waist != null);
    const latest = { kg: wE?.kg, waist: aE?.waist };
    const fat = both ? fatOf(both) : null;
    const cat = fat?.main != null ? aceCategory(p.sex, fat.main) : null;
    const ratio = whtr(p.heightCm, latest.waist), imc = bmi(p.heightCm, latest.kg);
    const diff = wE && firstKg && wE !== firstKg ? wE.kg - firstKg.kg : null;
    out.push(`
      <section class="card cf-body-card" data-key="cf-body-sum">
        <div class="cf-stats">
          <div><span>Peso</span><b>${latest.kg != null ? `${num(latest.kg)}<small> kg</small>` : '—'}</b>${diff ? `<em class="${diff < 0 ? 'down' : 'up'}">${diff > 0 ? '+' : ''}${num(diff)} kg desde ${relDate(firstKg.date).toLowerCase()}</em>` : ''}</div>
          <div><span>% de grasa</span><b>${fat?.main != null ? `${num(fat.main)}<small> %</small>` : '—'}</b>${cat ? `<em>${cat}${both.date !== wE.date ? ` · ${relDate(both.date).toLowerCase()}` : ''}</em>` : !p.sex ? '<em>Falta elegir hombre o mujer</em>' : '<em>Falta peso y cintura del mismo día</em>'}</div>
        </div>
        ${fat && (fat.navy != null || fat.rfm != null) ? `<p class="cf-second">Segunda opinión: ${[fat.navy != null ? `Marina ${num(fat.navy)} %` : '', fat.rfm != null ? `RFM ${num(fat.rfm)} %` : ''].filter(Boolean).join(' · ')}</p>` : ''}
        <div class="cf-mini">
          ${ratio ? `<span><b>${ratio.r.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> cintura / estatura${ratio.label ? ` · ${ratio.label}` : ''}</span>` : ''}
          ${imc ? `<span><b>${num(imc.v)}</b> IMC · ${imc.label}</span>` : ''}
        </div>
      </section>`);
    const kgPts = list.filter(e => e.kg != null).map(e => ({ date: e.date, v: e.kg }));
    const fatPts = list.map(e => ({ date: e.date, v: fatOf(e)?.main })).filter(x => x.v != null);
    if (kgPts.length >= 2) out.push(sectionHead('Peso', '', 'cf-h-kg'), `<section class="card" data-key="cf-kg-card">${lineChart(kgPts, { unit: ' kg', color: 'var(--c-blue)', key: 'kg-chart' })}</section>`);
    if (fatPts.length >= 2) out.push(sectionHead('% de grasa', '', 'cf-h-fat'), `<section class="card" data-key="cf-fat-card">${lineChart(fatPts, { unit: ' %', color: 'var(--c-orange)', key: 'fat-chart' })}</section>`);

    const photos = list.filter(e => e.photo && !photoMissing(bodyKey(e.date), 'thumb'));
    if (photos.length) {
      const a = photos[0], b = photos[photos.length - 1];
      const img = e => { const src = photoURL(bodyKey(e.date), 'full'); return src ? `<img src="${src}" alt="">` : '<span class="ph-wait"></span>'; };
      out.push(sectionHead('Tu progreso', '', 'cf-h-ph'), `
        <section class="card cf-compare" data-key="cf-compare">
          ${photos.length > 1 ? `<figure>${img(a)}<figcaption>Antes · ${relDate(a.date)}</figcaption></figure>` : ''}
          <figure>${img(b)}<figcaption>${photos.length > 1 ? 'Ahora' : 'Tu primera foto'} · ${relDate(b.date)}</figcaption></figure>
        </section>`);
    }
    out.push(sectionHead('Historial', '', 'cf-h-bh'));
    out.push(`<div class="list" data-key="cf-body-list">${list.slice().reverse().map(e => {
      const f = fatOf(e)?.main;
      return `<button class="cf-row" data-key="cfb-${e.id}" data-action="cf-body-open" data-id="${e.id}">
        <span class="cf-row-main"><b>${cap(relDate(e.date))}</b><small>${[e.waist ? `cintura ${num(e.waist)} cm` : '', e.photo ? 'con foto' : ''].filter(Boolean).join(' · ') || 'solo peso'}</small></span>
        <span class="cf-row-val">${e.kg != null ? `<b>${num(e.kg)} kg</b>` : ''}${f != null ? `<small>${num(f)} % grasa</small>` : ''}</span>
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`;
    }).join('')}</div>`);
  }
  out.push(`
    <p class="group-foot" data-key="cf-body-foot">${icon('info')} % de grasa: fórmula del Ejército de EE. UU. (2023), con tu peso y la cintura medida en el ombligo; es la más precisa de las de cinta métrica, con un error típico de ±3 a 4 puntos frente a un escáner DXA. Segunda opinión: fórmula de la Marina (Hodgdon y Beckett; necesita cuello${p.sex === 'f' ? ' y cadera' : ''}) y RFM (Woolcott y Bergman, 2018); ojo: ${p.sex === 'f' ? 'la de la Marina para mujeres mide la cintura en su parte más estrecha y ' : ''}RFM la mide sobre el hueso de la cadera, así que con la del ombligo son una aproximación. Categorías del American Council on Exercise, cintura/estatura según NICE e IMC según la OMS.</p>
    <p class="group-foot" data-key="cf-profile-foot">Tus datos: ${p.sex === 'f' ? 'mujer' : p.sex === 'm' ? 'hombre' : 'sin elegir'} · ${p.heightCm ? `${num(p.heightCm)} cm` : 'sin estatura'} · <button class="link-btn" data-action="cf-profile-edit">Cambiar</button></p>`);
  return out.join('');
}

const bodyDraft = { id: '', date: '', kg: '', waist: '', neck: '', hip: '' };
function loadBodyDraft(date) {
  const e = cf().body.find(x => x.date === date);
  Object.assign(bodyDraft, { id: e?.id || '', date, kg: e?.kg ?? '', waist: e?.waist ?? '', neck: e?.neck ?? '', hip: e?.hip ?? '' });
}
function renderBody() {
  const d = bodyDraft;
  const e = cf().body.find(x => x.date === d.date);
  const src = e?.photo ? photoURL(bodyKey(d.date), 'thumb') : '';
  const field = (f, label, unit, sub = '') => `<label class="cell"><span class="cell-label">${label}${sub ? `<small>${sub}</small>` : ''}</span><input class="pill-input num-input" type="text" inputmode="decimal" placeholder="0" value="${esc(d[f])}" data-input="cf-body-field" data-f="${f}" aria-label="${label}"><span class="unit">${unit}</span></label>`;
  return `
    <div class="group cf-form">
      <label class="cell"><span class="cell-label">Fecha</span><input class="pill-input" type="date" max="${todayKey()}" value="${d.date}" data-change="cf-body-date" aria-label="Fecha"></label>
      ${field('kg', 'Peso', 'kg')}
      ${field('waist', 'Cintura', 'cm', 'En el ombligo, al final de exhalar')}
      ${field('neck', 'Cuello', 'cm', 'Opcional · justo debajo de la nuez')}
      ${sex() === 'f' ? field('hip', 'Cadera', 'cm', 'Opcional · en la parte más ancha') : ''}
    </div>
    <p class="cf-hint">Mide con la cinta pegada a la piel, sin apretar, y de pie. Lo mejor es medirte siempre a la misma hora (por ejemplo, en ayunas).</p>
    <button class="photo-row${e?.photo ? '' : ' add'}" data-action="cf-body-photo" data-date="${d.date}">
      ${e?.photo ? (src ? `<img src="${src}" alt="">` : '<span class="ph-wait"></span>') : `<span class="pr-ic">${icon('camera')}</span>`}
      <span><b>${e?.photo ? 'Cambiar foto de progreso' : 'Foto de progreso'}</b><small>De frente, con buena luz y siempre en el mismo lugar</small></span>
    </button>
    ${d.id ? `<button class="btn danger block" data-action="cf-body-delete" style="margin-top:14px">${icon('trash')}Borrar este registro</button>` : ''}`;
}
export function openBody(id) {
  const e = cf().body.find(x => x.id === id);
  loadBodyDraft(e?.date || todayKey());
  openSheet({
    key: 'cf-body', title: () => cap(fmtDateLong(bodyDraft.date)), render: renderBody,
    right: () => ({ action: 'cf-body-save', icon: 'check', label: 'Guardar', disabled: !(pos(bodyDraft.kg) || pos(bodyDraft.waist)) }),
  });
}

/* =========================================================
   La pestaña
   ========================================================= */
export function viewCrossfit() {
  const p = cf().profile;
  const seg = ui.cfSeg || 'lifts';
  return `
    ${largeTitle('CrossFit', 'Tu entreno')}
    ${!p.sex || !p.heightCm || ui.cfProfile ? profileCard() : ''}
    <div class="cf-seg" data-key="cf-seg">${segmented('cf-seg', [{ value: 'lifts', label: 'Levantamientos' }, { value: 'entrenos', label: 'Entrenos' }, { value: 'body', label: 'Cuerpo' }], seg)}</div>
    ${seg === 'entrenos' ? sessionsView() : seg === 'body' ? bodyView() : liftsView()}`;
}

/* =========================================================
   Acciones
   ========================================================= */
function upsertBody(date, patch) {
  let e = cf().body.find(x => x.date === date);
  if (!e) { e = { id: newId(), date, kg: null, waist: null, neck: null, hip: null, photo: null }; cf().body.push(e); }
  Object.assign(e, patch);
  return e;
}
// El teclado decimal del iPhone en español escribe "82,5": se acepta coma o punto.
const parse = v => { const n = Number(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const pos = v => (parse(v) > 0 ? Math.round(parse(v) * 2) / 2 : null);
// Los mismos rangos que valida store.js: lo que no cabe se avisa al guardar, no se pierde después.
const RANGES = { lb: [1, 1500, 'lb'], kg: [25, 300, 'kg'], waist: [40, 250, 'cm'], neck: [20, 70, 'cm'], hip: [50, 250, 'cm'] };
const inRange = (f, v) => v == null || (v >= RANGES[f][0] && v <= RANGES[f][1]);
function outOfRange(fields) {
  const bad = Object.entries(fields).find(([f, v]) => !inRange(f, v));
  if (!bad) return false;
  const [f] = bad;
  toast('Revisa ese número', { sub: `Debe estar entre ${RANGES[f][0]} y ${RANGES[f][1]} ${RANGES[f][2]}`, icon: 'xmark', tint: 'c-red' });
  return true;
}

export async function cfAction(name, el) {
  const d = el?.dataset || {};
  switch (name) {
    case 'cf-seg': ui.cfSeg = d.value; haptic(); commit(); return;
    case 'cf-sex': cf().profile.sex = d.value; if (cf().profile.heightCm) ui.cfProfile = false; haptic(); commit(); return;
    case 'change:cf-height': {
      const v = pos(el.value);
      if (!(v >= 120 && v <= 230)) { toast('Revisa tu estatura', { sub: 'En centímetros, entre 120 y 230 (por ejemplo, 178)', icon: 'xmark', tint: 'c-red' }); commit(); return; }
      cf().profile.heightCm = v;
      if (cf().profile.sex) ui.cfProfile = false;
      commit();
      return;
    }
    case 'cf-profile-edit': ui.cfProfile = true; commit(); scrollTo({ top: 0, behavior: 'smooth' }); return;

    case 'cf-lift-new': if (d.lift) closeSheet(true); openLiftLog(d.lift); return;
    case 'cf-lift-open': haptic(); openLift(d.lift); return;
    case 'input:cf-field': case 'change:cf-field': liftDraft[d.f] = el.value; if (d.f !== 'note') refreshSheet(); return;
    case 'cf-lift-save': {
      const lb = pos(liftDraft.lb), reps = Math.floor(Number(liftDraft.reps));
      if (!lb || !(reps >= 1 && reps <= 50) || outOfRange({ lb })) return;
      const l = liftOf(liftDraft.lift);
      const before = bestOneRM(entriesOf(l.id), l);
      cf().lifts.push({ id: newId(), lift: l.id, date: liftDraft.date || todayKey(), lb, reps, note: liftDraft.note.trim().slice(0, 300) });
      const after = bestOneRM(entriesOf(l.id), l);
      commit();
      closeSheet();
      const pr = after && (!before || after.lb > before.lb);
      haptic('success');
      toast(pr ? '¡Nuevo récord!' : 'Guardado', { sub: `${l.name}: ${lbs(lb)} × ${reps}${pr ? ` · 1RM ${after.est ? 'est. ' : ''}${lbs(after.lb)}` : ''}`, icon: pr ? 'star-fill' : 'check', tint: pr ? 'c-orange' : 'c-green' });
      return;
    }
    case 'cf-lift-delete': {
      const i = await alertDialog({ title: '¿Borrar este registro?', actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Borrar', style: 'destructive' }] });
      if (i !== 1) return;
      cf().lifts = cf().lifts.filter(e => e.id !== d.id);
      commit();
      return;
    }

    case 'cf-complex-new': if (d.name) closeSheet(true); openComplexLog(d.name || ''); return;
    case 'cf-complex-open': haptic(); openComplex(d.name); return;
    case 'cf-cx-idea': {
      cxDraft.name = d.v;
      const t = document.querySelector('.sheet textarea[data-f="name"]');
      if (t) { t.value = d.v; t.blur(); }
      refreshSheet();
      return;
    }
    case 'input:cf-cx-field': case 'change:cf-cx-field': cxDraft[d.f] = d.f === 'name' ? el.value.replace(/\n/g, ' ') : el.value; refreshSheet(); return;
    case 'cf-cx-save': {
      const lb = pos(cxDraft.lb), nm = cxDraft.name.trim().slice(0, 120);
      if (!lb || !nm || outOfRange({ lb })) return;
      const prev = cf().complexes.filter(c => c.name.toLowerCase() === nm.toLowerCase()).reduce((m, c) => Math.max(m, c.lb), 0);
      cf().complexes.push({ id: newId(), name: nm, date: cxDraft.date || todayKey(), lb, note: '' });
      commit();
      closeSheet();
      haptic('success');
      toast(prev && lb > prev ? '¡Nuevo récord!' : 'Guardado', { sub: `${nm}: ${lbs(lb)}`, icon: prev && lb > prev ? 'star-fill' : 'check', tint: prev && lb > prev ? 'c-orange' : 'c-green' });
      return;
    }
    case 'cf-cx-delete': {
      const i = await alertDialog({ title: '¿Borrar este registro?', actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Borrar', style: 'destructive' }] });
      if (i !== 1) return;
      cf().complexes = cf().complexes.filter(c => c.id !== d.id);
      commit();
      return;
    }

    case 'cf-goal': cf().weekGoal = Math.max(1, Math.min(7, cf().weekGoal + Number(d.delta))); haptic(); commit(); return;
    case 'cf-ses-new': openSession(null); return;
    case 'cf-ses-open': haptic(); openSession(d.id); return;
    case 'input:cf-ses-field': case 'change:cf-ses-field': sesDraft[d.f] = el.value; if (d.f === 'date') refreshSheet(); else if (d.f === 'wod') refreshSheet(); return;
    case 'cf-ses-rpe': sesDraft.rpe = sesDraft.rpe === Number(d.v) ? null : Number(d.v); haptic(); refreshSheet(); return;
    case 'cf-ses-save': {
      const wod = sesDraft.wod.trim().slice(0, 1500);
      if (!wod) return;
      const data = { date: sesDraft.date || todayKey(), wod, result: sesDraft.result.trim().slice(0, 120), rpe: sesDraft.rpe, note: sesDraft.note.trim().slice(0, 500) };
      const old = cf().sessions.find(x => x.id === sesDraft.id);
      if (old) Object.assign(old, data);
      else cf().sessions.push({ id: newId(), ...data });
      const ws = weekStart(todayKey());
      const before = old ? null : daysTrained(ws, addDays(ws, 6));
      commit();
      closeSheet();
      haptic('success');
      const now = daysTrained(ws, addDays(ws, 6)), goal = cf().weekGoal;
      toast(!old && before < goal && now >= goal ? '¡Meta de la semana cumplida!' : old ? 'Entreno actualizado' : 'Entreno guardado',
        { sub: old ? '' : `${now} de ${goal} esta semana`, icon: !old && before < goal && now >= goal ? 'star-fill' : 'check', tint: !old && before < goal && now >= goal ? 'c-orange' : 'c-green' });
      return;
    }
    case 'cf-ses-delete': {
      const i = await alertDialog({ title: '¿Borrar este entreno?', actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Borrar', style: 'destructive' }] });
      if (i !== 1) return;
      cf().sessions = cf().sessions.filter(x => x.id !== sesDraft.id);
      commit();
      closeSheet();
      return;
    }

    case 'cf-body-new': openBody(null); return;
    case 'cf-body-open': haptic(); openBody(d.id); return;
    case 'change:cf-body-date': if (el.value) { loadBodyDraft(el.value); refreshSheet(); } return;
    case 'input:cf-body-field': bodyDraft[d.f] = el.value; refreshSheet(); return;
    case 'cf-body-save': {
      const patch = { kg: pos(bodyDraft.kg), waist: pos(bodyDraft.waist), neck: pos(bodyDraft.neck), hip: pos(bodyDraft.hip) };
      if ((!patch.kg && !patch.waist) || outOfRange(patch)) return;
      upsertBody(bodyDraft.date, patch);
      commit();
      closeSheet();
      haptic('success');
      const f = fatOf(patch)?.main;
      toast('Medidas guardadas', { sub: [patch.kg ? `${num(patch.kg)} kg` : '', f != null ? `${num(f)} % de grasa` : ''].filter(Boolean).join(' · '), icon: 'check', tint: 'c-green' });
      return;
    }
    case 'cf-body-delete': {
      const i = await alertDialog({ title: '¿Borrar este registro?', message: 'Se borran las medidas y la foto de ese día.', actions: [{ label: 'Cancelar', style: 'cancel' }, { label: 'Borrar', style: 'destructive' }] });
      if (i !== 1) return;
      const e = cf().body.find(x => x.id === bodyDraft.id);
      if (e?.photo) { try { await deletePhoto(bodyKey(e.date)); } catch { toast('No se pudo borrar la foto', { icon: 'xmark', tint: 'c-red' }); return; } }
      cf().body = cf().body.filter(x => x.id !== bodyDraft.id);
      commit();
      closeSheet();
      return;
    }
    case 'cf-body-photo': {
      const input = document.getElementById('bodyPhoto');
      input.dataset.date = d.date;
      input.click();
      return;
    }
    case 'change:body-photo-file': {
      const file = el.files?.[0], date = el.dataset.date;
      el.value = '';
      if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
      try {
        const at = await savePhoto(bodyKey(date), file);
        upsertBody(date, { photo: at });
        commit();
        haptic('success');
        toast('Foto de progreso guardada', { icon: 'camera', tint: 'c-green' });
      } catch {
        toast('No se pudo guardar la foto', { sub: 'Prueba con otra, o libera espacio en el iPhone', icon: 'xmark', tint: 'c-red' });
      }
    }
  }
}
export const CF_ACTIONS = [
  'cf-seg', 'cf-sex', 'change:cf-height', 'cf-profile-edit',
  'cf-lift-new', 'cf-lift-open', 'input:cf-field', 'change:cf-field', 'cf-lift-save', 'cf-lift-delete',
  'cf-complex-new', 'cf-complex-open', 'cf-cx-idea', 'input:cf-cx-field', 'change:cf-cx-field', 'cf-cx-save', 'cf-cx-delete',
  'cf-goal', 'cf-ses-new', 'cf-ses-open', 'input:cf-ses-field', 'change:cf-ses-field', 'cf-ses-rpe', 'cf-ses-save', 'cf-ses-delete',
  'cf-body-new', 'cf-body-open', 'change:cf-body-date', 'input:cf-body-field', 'cf-body-save', 'cf-body-delete', 'cf-body-photo', 'change:body-photo-file',
];
