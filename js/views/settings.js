// Vista "Ajustes": estilo de la app Ajustes de iOS.
import { state, ACCENTS, waterSlots } from '../store.js';
import { esc, fmtTime, fromMin, daysText, fmtDur } from '../utils.js';
import { largeTitle, cell, segmented, toggleSwitch, stepper, timeField, selectField } from '../components.js';
import { icon } from '../icons.js';
import { GUIDES } from '../guides.js';
import { VERSION as APP_VERSION } from '../version.js';

export function viewSettings() {
  const s = state.settings;
  const initial = (s.name || 'R').trim().charAt(0).toUpperCase();
  const guideCount = id => GUIDES[id].steps.filter((_, i) => state.guide[`${id}.${i}`]).length;
  const out = [];
  out.push(largeTitle('Ajustes'));

  out.push(`
    <section class="group profile" data-key="profile">
      <span class="avatar">${esc(initial)}</span>
      <input type="text" value="${esc(s.name)}" data-change="set-name" placeholder="Tu nombre" aria-label="Tu nombre" maxlength="30" enterkeyhint="done">
      <p>Rumbo ${APP_VERSION} · tus datos viven solo en este teléfono</p>
    </section>`);

  out.push(`<h2 class="sec-h small" data-key="h-iphone">Configura tu iPhone</h2>
    <section class="group icons" data-key="g-iphone">
      ${cell({ ic: 'iphone', tint: 'c-blue', label: 'Instalar Rumbo', value: `${guideCount('install')}/${GUIDES.install.steps.length}`, action: 'guide', attrs: 'data-guide="install"', chevron: true })}
      ${cell({ ic: 'hourglass', tint: 'c-purple', label: 'Bloqueos', sub: 'Instagram 2 h y modo noche, con Tiempo en pantalla', value: `${guideCount('block')}/${GUIDES.block.steps.length}`, action: 'guide', attrs: 'data-guide="block"', chevron: true })}
      ${cell({ ic: 'bell', tint: 'c-red', label: 'Recordatorios fijos', sub: 'Agua, planear mañana y aviso de modo noche', action: 'ics-fixed', chevron: true })}
    </section>
    <p class="group-foot" data-key="f-iphone">Una web no puede bloquear otras apps ni avisar con la app cerrada. Estas guías dejan al iPhone haciendo ese trabajo.</p>`);

  out.push(`<h2 class="sec-h small" data-key="h-look">Apariencia</h2>
    <section class="group" data-key="g-look">
      <div class="cell-block">${segmented('set-theme', [{ value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }], s.theme)}</div>
      <div class="cell-block">
        <div class="cell-cap">${icon('palette')}Color</div>
        <div class="swatches">
          ${ACCENTS.map(a => `<button class="swatch" data-action="set-accent" data-v="${a.id}" style="--sw: var(--c-${a.id === 'graphite' ? 'graphite' : a.id})" aria-label="${a.name}" aria-pressed="${s.accent === a.id}">${icon('check')}</button>`).join('')}
        </div>
      </div>
    </section>`);

  out.push(`<h2 class="sec-h small" data-key="h-water">Agua</h2>
    <section class="group icons" data-key="g-water">
      ${cell({ ic: 'drop-fill', tint: 'c-blue', label: 'Meta diaria', sub: `${(s.waterGoalMl / 1000).toLocaleString('es')} litros`, control: stepper('set-water-goal') })}
      ${cell({ ic: 'drop', tint: 'c-cyan', label: 'Tamaño del vaso', control: selectField('set-glass', [[200, '200 ml'], [250, '250 ml'], [300, '300 ml'], [350, '350 ml'], [500, '500 ml']], s.glassMl) })}
      ${cell({ ic: 'sunrise', tint: 'c-orange', label: 'Desde', control: timeField('set-time', s.waterStart, 'data-key-set="waterStart"') })}
      ${cell({ ic: 'moon', tint: 'c-indigo', label: 'Hasta', control: timeField('set-time', s.waterEnd, 'data-key-set="waterEnd"') })}
      ${cell({ ic: 'repeat', tint: 'c-teal', label: 'Recordar cada', control: selectField('set-water-every', [[60, '1 hora'], [90, '1 h 30 min'], [120, '2 horas'], [180, '3 horas']], s.waterEvery) })}
    </section>
    <p class="group-foot" data-key="f-water">Avisos a las ${waterSlots().map(m => fmtTime(fromMin(m))).join(', ')}.</p>`);

  out.push(`<h2 class="sec-h small" data-key="h-focus">Enfoque</h2>
    <section class="group icons" data-key="g-focus">
      ${cell({ ic: 'target', tint: 'c-green', label: 'Meta diaria', sub: fmtDur(s.focusGoal), control: stepper('set-focus-goal') })}
      <div class="cell-block">
        <div class="cell-cap">${icon('timer')}Duración de cada sesión</div>
        ${segmented('set-focus-default', [15, 25, 45, 60].map(v => ({ value: v, label: `${v} min` })), s.focusDefault)}
      </div>
    </section>`);

  out.push(`<h2 class="sec-h small" data-key="h-rem">Planificación</h2>
    <section class="group icons" data-key="g-rem">
      ${cell({ ic: 'moon-fill', tint: 'c-indigo', label: 'Planear mañana', control: timeField('set-time', s.planTime, 'data-key-set="planTime"') })}
      ${cell({ ic: 'bell', tint: 'c-red', label: 'Aviso de cada tarea', control: selectField('set-lead', [[0, 'A la hora'], [5, '5 min antes'], [10, '10 min antes'], [15, '15 min antes'], [30, '30 min antes']], s.leadMin) })}
    </section>`);

  out.push(`<h2 class="sec-h small" data-key="h-night">Modo noche</h2>
    <section class="group icons" data-key="g-night">
      ${cell({ ic: 'bed', tint: 'c-indigo', label: 'Modo noche', control: toggleSwitch('set-night', s.nightMode, '', 'Modo noche') })}
      ${cell({ ic: 'moon', tint: 'c-purple', label: 'Empieza', control: timeField('set-time', s.nightStart, 'data-key-set="nightStart"') })}
      ${cell({ ic: 'sun', tint: 'c-orange', label: 'Termina', control: timeField('set-time', s.nightEnd, 'data-key-set="nightEnd"') })}
    </section>
    <p class="group-foot" data-key="f-night">En este horario Rumbo solo te muestra tu plan y un espacio para anotar lo que no quieras olvidar.</p>`);

  out.push(`<h2 class="sec-h small" data-key="h-rout">Rutinas</h2>
    <section class="group icons" data-key="g-rout">
      ${state.routines.map(r => cell({
        ic: 'repeat', tint: 'c-teal', label: esc(r.title), sub: `${daysText(r.days)}${r.time ? ` · ${fmtTime(r.time)}` : ''}`,
        action: 'routine', attrs: `data-rid="${r.id}"`, chevron: true, key: `r-${r.id}`,
      })).join('')}
      ${cell({ ic: 'plus', tint: 'c-green', label: '<span style="color:var(--accent)">Nueva rutina</span>', action: 'routine', attrs: 'data-rid=""', key: 'r-new' })}
    </section>
    <p class="group-foot" data-key="f-rout">Lo que se repite (gym, clases, leer) aparece solo en los días que elijas.</p>`);

  out.push(`<h2 class="sec-h small" data-key="h-data">Tus datos</h2>
    <section class="group icons" data-key="g-data">
      ${cell({ ic: 'download', tint: 'c-gray', label: 'Crear copia de seguridad', action: 'export', chevron: true })}
      ${cell({ ic: 'upload', tint: 'c-gray', label: 'Restaurar copia', action: 'import', chevron: true })}
      ${cell({ ic: 'sparkles', tint: 'c-yellow', label: 'Ver la bienvenida', action: 'onboarding', chevron: true })}
    </section>
    <section class="group" data-key="g-reset">
      ${cell({ label: 'Borrar todos los datos', action: 'reset', danger: true })}
    </section>
    <input type="file" id="importFile" accept="application/json,.json" hidden data-key="import-file" data-change="import-file">
    <p class="group-foot" data-key="f-end" style="text-align:center;margin-top:18px">Hecho para Camilo con ${icon('heart')}</p>`);
  return out.join('');
}
