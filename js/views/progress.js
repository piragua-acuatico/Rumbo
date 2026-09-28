// Vista "Progreso": racha, resumen y gráficos de los últimos días.
import { state, planningStreak, MOODS } from '../store.js';
import { todayKey, addDays, dayLetter, parseKey, fmtDateLong, fmtDur, plural, esc, relDate } from '../utils.js';
import { largeTitle, segmented, sectionHead } from '../components.js';
import { icon } from '../icons.js';
import { ui } from '../ui.js';

const liters = ml => (ml / 1000).toLocaleString('es', { maximumFractionDigits: 1 });

function days(n) {
  const t = todayKey();
  return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1));
}

const PLOT = 118; // alto del área de barras (140 − 22 de etiquetas)

function barChart(id, keys, values, { color, goal = null, fmt = v => v, labelEvery = 1 }) {
  const max = Math.max(1, goal || 0, ...values) * 1.12;
  const t = todayKey();
  const bars = keys.map((k, i) => {
    const v = values[i];
    const sel = ui.selBar === `${id}|${k}`;
    const showLbl = keys.length <= 7 || i % labelEvery === 0 || k === t;
    const lbl = keys.length <= 7 ? dayLetter(k) : String(parseKey(k).getDate());
    return `
      <button class="bar${k === t ? ' today' : ''}${sel ? ' sel' : ''}${v ? '' : ' zero'}" data-action="bar" data-sel="${id}|${k}"
        aria-label="${fmtDateLong(k)}: ${fmt(v)}">
        <i data-live data-h="${(v / max).toFixed(4)}" style="height:100%;transform:scaleY(0)"></i>
        ${showLbl ? `<span>${lbl}</span>` : ''}
        <b style="bottom:${((v / max) * PLOT + 6).toFixed(1)}px">${fmt(v)}</b>
      </button>`;
  }).join('');
  const goalLine = goal ? `<div class="goal-line" style="bottom:${(22 + (goal / max) * PLOT).toFixed(1)}px"><span>Meta</span></div>` : '';
  return `<div class="bars${keys.length > 7 ? ' dense' : ''}" style="--bar-c:${color}">${goalLine}${bars}</div>`;
}

export function viewProgress() {
  const s = state.settings;
  const n = ui.range;
  const keys = days(n);
  const t = todayKey();

  const doneVals = keys.map(k => state.tasks.filter(x => x.date === k && x.done).length);
  const totalVals = keys.map(k => state.tasks.filter(x => x.date === k).length);
  const waterVals = keys.map(k => state.water[k] || 0);
  const focusVals = keys.map(k => state.focusLog[k] || 0);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const doneSum = sum(doneVals), totalSum = sum(totalVals);
  const rate = totalSum ? Math.round((doneSum / totalSum) * 100) : 0;
  const waterDays = waterVals.filter(v => v >= s.waterGoalMl).length;
  const activeWater = waterVals.filter(v => v > 0);
  const waterAvg = activeWater.length ? sum(activeWater) / activeWater.length : 0;
  const focusSum = sum(focusVals);
  const streak = planningStreak();

  const out = [];
  out.push(largeTitle('Progreso', n === 7 ? 'Últimos 7 días' : 'Últimos 30 días'));
  out.push(`<div data-key="range" style="margin-bottom:14px">${segmented('range', [{ value: 7, label: 'Semana' }, { value: 30, label: 'Mes' }], n)}</div>`);

  // Racha
  const week = days(7);
  out.push(`
    <section class="card streak-card" data-key="streak">
      <div class="streak-top">
        <span class="streak-flame">🔥</span>
        <div>
          <div class="streak-num">${streak}<small>${streak === 1 ? 'día' : 'días'}</small></div>
          <p class="streak-lbl">${streak ? 'seguidos planeando la noche anterior' : 'Planea esta noche para empezar tu racha'}</p>
        </div>
      </div>
      <div class="week-dots">
        ${week.map(k => `<div class="wd${state.planned[k] ? ' on' : ''}${k === t ? ' today' : ''}"><i>${state.planned[k] ? icon('check') : ''}</i>${dayLetter(k)}</div>`).join('')}
      </div>
    </section>`);

  // Resumen
  out.push(`
    <div class="stats" data-key="stats">
      <div class="stat" style="--tint: var(--c-pink)"><p class="stat-h">${icon('check')}Tareas hechas</p><p class="stat-v">${doneSum}</p><p class="stat-s">de ${totalSum} planeadas</p></div>
      <div class="stat" style="--tint: var(--c-orange)"><p class="stat-h">${icon('target')}Cumplimiento</p><p class="stat-v">${rate}<small>%</small></p><p class="stat-s">${rate >= 80 ? '¡Excelente ritmo!' : rate >= 50 ? 'Vas bien' : totalSum ? 'Planea menos, cumple más' : 'Sin datos aún'}</p></div>
      <div class="stat" style="--tint: var(--c-blue)"><p class="stat-h">${icon('drop')}Agua</p><p class="stat-v">${waterDays}<small>/${n} días</small></p><p class="stat-s">con la meta cumplida</p></div>
      <div class="stat" style="--tint: var(--c-green)"><p class="stat-h">${icon('timer')}Enfoque</p><p class="stat-v">${focusSum >= 60 ? (focusSum / 60).toLocaleString('es', { maximumFractionDigits: 1 }) : focusSum}<small>${focusSum >= 60 ? 'h' : 'min'}</small></p><p class="stat-s">en total</p></div>
    </div>`);

  const every = n > 7 ? 5 : 1;
  out.push(`
    <section class="card chart-card" data-key="c-tasks">
      <p class="card-title" style="color:var(--c-pink)">${icon('checklist')}<span style="color:var(--label)">Tareas completadas</span></p>
      <p class="chart-sum"><b>${(doneSum / n).toLocaleString('es', { maximumFractionDigits: 1 })}</b>por día en promedio</p>
      ${barChart('tasks', keys, doneVals, { color: 'var(--c-pink)', fmt: v => plural(v, 'tarea', 'tareas'), labelEvery: every })}
    </section>
    <section class="card chart-card" data-key="c-water">
      <p class="card-title" style="color:var(--c-blue)">${icon('drop')}<span style="color:var(--label)">Agua</span></p>
      <p class="chart-sum"><b>${liters(waterAvg)} L</b>promedio en los días que registraste</p>
      ${barChart('water', keys, waterVals, { color: 'var(--c-blue)', goal: s.waterGoalMl, fmt: v => `${liters(v)} L`, labelEvery: every })}
    </section>
    <section class="card chart-card" data-key="c-focus">
      <p class="card-title" style="color:var(--c-green)">${icon('timer')}<span style="color:var(--label)">Enfoque</span></p>
      <p class="chart-sum"><b>${fmtDur(focusSum)}</b>en total</p>
      ${barChart('focus', keys, focusVals, { color: 'var(--c-green)', goal: s.focusGoal, fmt: v => `${v} min`, labelEvery: every })}
    </section>`);

  // Ánimo
  out.push(sectionHead('Ánimo', 'Últimos 7 días', 'mood'));
  out.push(`
    <section class="card" data-key="c-mood">
      <div class="mood-row">
        ${week.map(k => {
          const m = MOODS.find(x => x.v === state.journal[k]?.mood);
          return `<div>${m ? `<span title="${m.l}">${m.e}</span>` : '<span class="none"></span>'}${dayLetter(k)}</div>`;
        }).join('')}
      </div>
    </section>`);

  const notes = Object.entries(state.journal).filter(([, j]) => j.note).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4);
  if (notes.length) {
    out.push(sectionHead('Reflexiones', '', 'notes'));
    out.push(`
      <section class="card" data-key="c-notes" style="padding-top:8px">
        ${notes.map(([k, j]) => `<div class="reflection"><small>${relDate(k)} ${MOODS.find(x => x.v === j.mood)?.e || ''}</small><p>${esc(j.note)}</p></div>`).join('')}
      </section>`);
  }
  return out.join('');
}
