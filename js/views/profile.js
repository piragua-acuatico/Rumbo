// Pestaña "Perfil": tu tarjeta y las secciones de configuración, al estilo
// de la app Ajustes del iPhone. Cada sección abre su propia pantalla.
import { state, ACCENTS, waterSlots, planningStreak } from '../store.js';
import { esc, fmtTime, fromMin, toMin, daysText, fmtDur, plural } from '../utils.js';
import { largeTitle, subHeader, cell, segmented, toggleSwitch, stepper, timeField, selectField } from '../components.js';
import { icon } from '../icons.js';
import { GUIDES } from '../guides.js';
import { VERSION as APP_VERSION } from '../version.js';
import { viewStats } from './stats.js';
import { pushStatus, pushInfo, pushReady, hasPairCode } from '../push.js';

const THEME_LABEL = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };
const guideDone = id => GUIDES[id].steps.filter((_, i) => state.guide[`${id}.${i}`]).length;
const liters = ml => (ml / 1000).toLocaleString('es', { maximumFractionDigits: 2 });
const go = sub => `data-tab="perfil/${sub}"`;

export function avatarHTML(cls = 'avatar') {
  const { name } = state.settings;
  const photo = state.profile.photo;
  const initial = esc((name || 'R').trim().charAt(0).toUpperCase());
  return photo ? `<img class="${cls} has-photo" src="${esc(photo)}" alt="">` : `<span class="${cls}">${initial}</span>`;
}

/* =========================================================
   Pantalla principal
   ========================================================= */
export function viewProfile() {
  const s = state.settings;
  const since = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(state.profile.since));
  const done = state.tasks.filter(t => t.done).length;
  const planned = Object.keys(state.planned).length;
  const streak = planningStreak();
  const guides = guideDone('install') + guideDone('block');
  const guidesTotal = GUIDES.install.steps.length + GUIDES.block.steps.length;

  return `
    ${largeTitle('Tu perfil')}
    <section class="card profile-card" data-key="profile">
      <button class="avatar-wrap" data-action="profile-photo" aria-label="${state.profile.photo ? 'Cambiar o quitar tu foto' : 'Poner una foto de perfil'}">
        ${avatarHTML('avatar avatar-xl')}
        <span class="avatar-cam">${icon('camera')}</span>
      </button>
      <input class="profile-name" type="text" value="${esc(s.name)}" data-change="set-name" placeholder="Tu nombre" aria-label="Tu nombre" maxlength="30" enterkeyhint="done">
      <p class="profile-since">En Rumbo desde ${since}</p>
      <div class="profile-stats">
        <div><b>${streak}</b><span>${icon('flame-fill')}Racha</span></div>
        <div><b>${done}</b><span>${icon('check')}Tareas hechas</span></div>
        <div><b>${planned}</b><span>${icon('moon-fill')}Días planeados</span></div>
      </div>
      <input type="file" id="photoInput" accept="image/*" hidden data-change="profile-photo-file">
    </section>

    <h2 class="sec-h small" data-key="h-prog">Tu progreso</h2>
    <section class="group icons" data-key="g-prog">
      ${cell({ ic: 'chart', tint: 'c-pink', label: 'Estadísticas', sub: 'Racha, tareas, agua, enfoque y ánimo', action: 'go', attrs: go('estadisticas'), chevron: true })}
    </section>

    <h2 class="sec-h small" data-key="h-notify">Avisos</h2>
    <section class="group icons" data-key="g-notify">
      ${cell({ ic: 'bell', tint: 'c-red', label: 'Notificaciones', value: NOTIFY_LABEL[pushStatus()], action: 'go', attrs: go('notificaciones'), chevron: true })}
    </section>

    <h2 class="sec-h small" data-key="h-hab">Hábitos</h2>
    <section class="group icons" data-key="g-hab">
      ${cell({ ic: 'drop-fill', tint: 'c-blue', label: 'Agua', value: `${liters(s.waterGoalMl)} L`, action: 'go', attrs: go('agua'), chevron: true })}
      ${cell({ ic: 'timer', tint: 'c-green', label: 'Enfoque', value: `${s.focusGoal} min`, action: 'go', attrs: go('enfoque'), chevron: true })}
      ${cell({ ic: 'bed', tint: 'c-indigo', label: 'Sueño', value: fmtTime(s.wakeTime), action: 'go', attrs: go('sueno'), chevron: true })}
    </section>

    <h2 class="sec-h small" data-key="h-day">Tu día</h2>
    <section class="group icons" data-key="g-day">
      ${cell({ ic: 'moon-fill', tint: 'c-purple', label: 'Planificación', value: fmtTime(s.planTime), action: 'go', attrs: go('planificacion'), chevron: true })}
      ${cell({ ic: 'repeat', tint: 'c-teal', label: 'Rutinas', value: state.routines.length ? String(state.routines.length) : '', action: 'go', attrs: go('rutinas'), chevron: true })}
    </section>

    <h2 class="sec-h small" data-key="h-app">App</h2>
    <section class="group icons" data-key="g-app">
      ${cell({ ic: 'palette', tint: 'c-orange', label: 'Apariencia', value: THEME_LABEL[s.theme], action: 'go', attrs: go('apariencia'), chevron: true })}
      ${cell({ ic: 'iphone', tint: 'c-gray', label: 'Configura tu iPhone', value: `${guides}/${guidesTotal}`, action: 'go', attrs: go('iphone'), chevron: true })}
      ${cell({ ic: 'lock', tint: 'c-graphite', label: 'Datos y privacidad', action: 'go', attrs: go('datos'), chevron: true })}
    </section>
    <p class="group-foot" data-key="f-end" style="text-align:center;margin-top:18px">Rumbo ${APP_VERSION} · tus datos viven solo en este teléfono</p>`;
}

/* =========================================================
   Subpantallas
   ========================================================= */
const NOTIFY_LABEL = { on: 'Activadas', off: 'Desactivadas', denied: 'Bloqueadas', 'needs-install': 'Instala la app', unsupported: 'No disponibles', 'no-server': 'Muy pronto' };

function viewNotifications() {
  const s = state.settings;
  const st = pushStatus();
  const inf = pushInfo();
  const every = { 60: '1 hora', 90: '1 h 30 min', 120: '2 horas', 180: '3 horas' }[s.waterEvery];
  const nightWarn = fmtTime(fromMin(toMin(s.nightStart) - 15));
  const synced = inf.lastSync ? new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit' }).format(new Date(inf.lastSync)) : '';

  const hero = {
    on: `
      <section class="card notify-hero ok" data-key="n-hero">
        <span class="notify-ic">${icon('bell')}</span>
        <h2>Notificaciones activadas</h2>
        <p>${inf.count ? `${plural(inf.count, 'aviso programado', 'avisos programados')} para los próximos 7 días` : 'Preparando tus avisos…'}${synced ? ` · actualizado a las ${synced}` : ''}</p>
        <button class="btn tinted block" data-action="notify-test">${icon('sparkles')}Enviar un aviso de prueba</button>
      </section>`,
    off: `
      <section class="card notify-hero" data-key="n-hero">
        <span class="notify-ic">${icon('bell')}</span>
        <h2>${inf.lost ? 'Notificaciones desconectadas' : 'Que Rumbo te avise'}</h2>
        <p>${inf.lost
          ? 'El servidor dejó de reconocer este iPhone (pasa si Apple renueva el permiso o si no abres Rumbo en un mes). Vuelve a activarlas y listo.'
          : 'Agua, tus tareas 5 minutos antes, la hora de planear y más. Llegan aunque la app esté cerrada y el iPhone bloqueado.'}</p>
        ${hasPairCode() ? '' : `<input class="pair-input" id="pairCode" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="64" placeholder="Código de emparejamiento" aria-label="Código de emparejamiento" enterkeyhint="done">`}
        <button class="btn primary block" data-action="notify-enable"${pushReady() ? '' : ' disabled'}>${icon('bell')}${inf.lost ? 'Reactivar notificaciones' : 'Activar notificaciones'}</button>
      </section>`,
    denied: `
      <p class="callout" data-key="n-hero">${icon('bell')}<span><b>Las notificaciones están bloqueadas.</b> Para activarlas ve a <b>Ajustes del iPhone › Notificaciones › Rumbo</b> y enciende "Permitir notificaciones". Luego vuelve aquí.</span></p>`,
    'needs-install': `
      <p class="callout" data-key="n-hero">${icon('iphone')}<span><b>Primero instala Rumbo en tu pantalla de inicio.</b> El iPhone solo permite notificaciones a las apps instaladas. <button class="link-btn" data-action="guide" data-guide="install">Ver cómo</button></span></p>`,
    unsupported: `<p class="callout" data-key="n-hero">${icon('bell')}<span>Este navegador no permite notificaciones. Abre Rumbo desde el ícono en tu iPhone.</span></p>`,
    'no-server': `
      <section class="card soon-card" data-key="n-hero" style="--tint: var(--c-red)">
        <span class="soon-ic">${icon('bell')}</span>
        <div><b>Casi listo</b><p>Falta conectar el servidor de avisos. En cuanto esté, aquí aparecerá el botón para activarlos.</p></div>
      </section>`,
  }[st];

  const toggle = (k, ic, tint, label, sub) => cell({ ic, tint, label, sub, control: toggleSwitch('notify-toggle', s.notify[k], `data-k="${k}"`, label) });
  return `
    ${subHeader('Notificaciones', NOTIFY_LABEL[st])}
    ${hero}
    <h2 class="sec-h small" data-key="h-ntypes">Qué te avisamos</h2>
    <section class="group icons" data-key="g-ntypes">
      ${toggle('water', 'drop-fill', 'c-blue', 'Agua', `Cada ${every}, de ${fmtTime(s.waterStart)} a ${fmtTime(s.waterEnd)}`)}
      ${toggle('tasks', 'clock', 'c-red', 'Tareas', Number(s.leadMin) ? `${s.leadMin} min antes de cada tarea con hora` : 'A la hora de cada tarea')}
      ${toggle('plan', 'moon-fill', 'c-indigo', 'Planear mañana', `A las ${fmtTime(s.planTime)}, si aún no lo hiciste`)}
      ${toggle('night', 'bed', 'c-purple', 'Modo noche', `15 min antes, a las ${nightWarn}`)}
      ${toggle('morning', 'sun-fill', 'c-orange', 'Buenos días', `A tu hora de despertar, con el resumen del día`)}
      ${toggle('focus', 'timer', 'c-green', 'Fin del enfoque', 'Cuando termina una sesión')}
    </section>
    <p class="group-foot" data-key="f-notify">${icon('lock')} El título de tus tareas viaja <b>cifrado</b>: el servidor guarda un texto que no puede leer, y solo tu iPhone lo descifra al mostrar el aviso.</p>
    ${st === 'on' ? `<section class="group" data-key="g-noff">${cell({ label: 'Desactivar en este iPhone', action: 'notify-disable', danger: true })}</section>` : ''}`;
}
function viewWater() {
  const s = state.settings;
  return `
    ${subHeader('Agua', `Meta de ${liters(s.waterGoalMl)} litros al día`)}
    <section class="group icons" data-key="g-water">
      ${cell({ ic: 'drop-fill', tint: 'c-blue', label: 'Meta diaria', sub: `${liters(s.waterGoalMl)} litros`, control: stepper('set-water-goal') })}
      ${cell({ ic: 'drop', tint: 'c-cyan', label: 'Tamaño del vaso', control: selectField('set-glass', [[200, '200 ml'], [250, '250 ml'], [300, '300 ml'], [350, '350 ml'], [500, '500 ml']], s.glassMl) })}
    </section>
    <h2 class="sec-h small" data-key="h-wrem">Recordatorios</h2>
    <section class="group icons" data-key="g-wrem">
      ${cell({ ic: 'sunrise', tint: 'c-orange', label: 'Desde', control: timeField('set-time', s.waterStart, 'data-key-set="waterStart"') })}
      ${cell({ ic: 'moon', tint: 'c-indigo', label: 'Hasta', control: timeField('set-time', s.waterEnd, 'data-key-set="waterEnd"') })}
      ${cell({ ic: 'repeat', tint: 'c-teal', label: 'Cada', control: selectField('set-water-every', [[60, '1 hora'], [90, '1 h 30 min'], [120, '2 horas'], [180, '3 horas']], s.waterEvery) })}
    </section>
    <p class="group-foot" data-key="f-water">Recordatorios a las ${waterSlots().map(m => fmtTime(fromMin(m))).join(', ')}.</p>`;
}

function viewFocusSettings() {
  const s = state.settings;
  return `
    ${subHeader('Enfoque', `Meta de ${fmtDur(s.focusGoal)} al día`)}
    <section class="group icons" data-key="g-focus">
      ${cell({ ic: 'target', tint: 'c-green', label: 'Meta diaria', sub: fmtDur(s.focusGoal), control: stepper('set-focus-goal') })}
      <div class="cell-block">
        <div class="cell-cap">${icon('timer')}Duración de cada sesión</div>
        ${segmented('set-focus-default', [15, 25, 45, 60].map(v => ({ value: v, label: `${v} min` })), s.focusDefault)}
      </div>
    </section>
    <p class="group-foot" data-key="f-focus">Cada sesión de enfoque llena el anillo verde de Hoy.</p>`;
}

function viewSleep() {
  const s = state.settings;
  const sleepMin = (toMin(s.wakeTime) - toMin(s.nightStart) + 1440) % 1440;
  return `
    ${subHeader('Sueño', `Meta de ${s.sleepGoal} horas`)}
    <section class="group icons" data-key="g-sleep">
      ${cell({ ic: 'alarm', tint: 'c-orange', label: 'Hora de despertar', sub: 'Sugerida en el ritual', control: timeField('set-time', s.wakeTime, 'data-key-set="wakeTime"') })}
      ${cell({ ic: 'bed', tint: 'c-indigo', label: 'Meta de sueño', sub: `${s.sleepGoal.toLocaleString('es')} horas`, control: stepper('set-sleep-goal') })}
    </section>
    <p class="group-foot" data-key="f-sleep">Si te acuestas cuando empieza el modo noche (${fmtTime(s.nightStart)}), dormirías ${fmtDur(sleepMin)}.</p>
    <section class="card soon-card" data-key="sleep-soon" style="--tint: var(--c-indigo)">
      <span class="soon-ic">${icon('alarm')}</span>
      <div>
        <b>Muy pronto: despertador con misión</b>
        <p>Rumbo pondrá la alarma del reloj de tu iPhone y no te dejará volver a dormir hasta que resuelvas 5 operaciones. También registrará cuánto duermes.</p>
      </div>
    </section>
    <h2 class="sec-h small" data-key="h-alarm-test">Experimento</h2>
    <section class="group" data-key="g-alarm-test">
      ${cell({ label: 'Probar alarma con Atajos', sub: 'Pone una alarma del reloj en 2 minutos', action: 'alarm-test', chevron: true })}
    </section>
    <p class="group-foot" data-key="f-alarm-test">Necesita el atajo <b>Rumbo Alarma</b> en la app Atajos. Bloquea el iPhone y ponlo en silencio: la alarma debe sonar igual.</p>`;
}

function viewPlanning() {
  const s = state.settings;
  return `
    ${subHeader('Planificación', 'El ritual de la noche y el descanso')}
    <section class="group icons" data-key="g-plan">
      ${cell({ ic: 'moon-fill', tint: 'c-indigo', label: 'Planear mañana a las', control: timeField('set-time', s.planTime, 'data-key-set="planTime"') })}
      ${cell({ ic: 'bell', tint: 'c-red', label: 'Aviso antes de cada tarea', control: selectField('set-lead', [[0, 'A la hora'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']], s.leadMin) })}
    </section>
    <p class="group-foot" data-key="f-plan">Desde esa hora, la pestaña Plan te recuerda cerrar el día y preparar el siguiente.</p>
    <h2 class="sec-h small" data-key="h-night">Modo noche</h2>
    <section class="group icons" data-key="g-night">
      ${cell({ ic: 'bed', tint: 'c-indigo', label: 'Modo noche', control: toggleSwitch('set-night', s.nightMode, '', 'Modo noche') })}
      ${cell({ ic: 'moon', tint: 'c-purple', label: 'Empieza', control: timeField('set-time', s.nightStart, 'data-key-set="nightStart"') })}
      ${cell({ ic: 'sun', tint: 'c-orange', label: 'Termina', control: timeField('set-time', s.nightEnd, 'data-key-set="nightEnd"') })}
    </section>
    <p class="group-foot" data-key="f-night">En este horario Rumbo solo te muestra tu plan y un espacio para anotar lo que no quieras olvidar.</p>`;
}

function viewRoutines() {
  return `
    ${subHeader('Rutinas', state.routines.length ? plural(state.routines.length, 'rutina', 'rutinas') : 'Lo que se repite')}
    <section class="group icons" data-key="g-rout">
      ${state.routines.map(r => cell({
        ic: 'repeat', tint: 'c-teal', label: esc(r.title), sub: `${daysText(r.days)}${r.time ? ` · ${fmtTime(r.time)}` : ''}`,
        action: 'routine', attrs: `data-rid="${r.id}"`, chevron: true, key: `r-${r.id}`,
      })).join('')}
      ${cell({ ic: 'plus', tint: 'c-green', label: '<span style="color:var(--accent)">Nueva rutina</span>', action: 'routine', attrs: 'data-rid=""', key: 'r-new' })}
    </section>
    <p class="group-foot" data-key="f-rout">Lo que se repite (gym, clases, leer) aparece solo en los días que elijas. Si un día no la haces, no se acumula: vuelve a salir en su próximo día.</p>`;
}

function viewAppearance() {
  const s = state.settings;
  return `
    ${subHeader('Apariencia', THEME_LABEL[s.theme])}
    <section class="group" data-key="g-look">
      <div class="cell-block">${segmented('set-theme', [{ value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }], s.theme)}</div>
      <div class="cell-block">
        <div class="cell-cap">${icon('palette')}Color</div>
        <div class="swatches">
          ${ACCENTS.map(a => `<button class="swatch" data-action="set-accent" data-v="${a.id}" style="--sw: var(--c-${a.id})" aria-label="${a.name}" aria-pressed="${s.accent === a.id}">${icon('check')}</button>`).join('')}
        </div>
      </div>
    </section>
    <p class="group-foot" data-key="f-look">"Automático" sigue el modo claro u oscuro de tu iPhone.</p>`;
}

function viewIphone() {
  return `
    ${subHeader('Configura tu iPhone', 'Para que Rumbo funcione como una app')}
    <section class="group icons" data-key="g-iphone">
      ${cell({ ic: 'iphone', tint: 'c-blue', label: 'Instalar Rumbo', value: `${guideDone('install')}/${GUIDES.install.steps.length}`, action: 'guide', attrs: 'data-guide="install"', chevron: true })}
      ${cell({ ic: 'hourglass', tint: 'c-purple', label: 'Bloqueos', sub: 'Instagram 2 h y modo noche, con Tiempo en pantalla', value: `${guideDone('block')}/${GUIDES.block.steps.length}`, action: 'guide', attrs: 'data-guide="block"', chevron: true })}
    </section>
    <p class="group-foot" data-key="f-iphone">Una web no puede bloquear otras apps; Tiempo en pantalla sí, y es lo más difícil de saltarse.</p>`;
}

function viewData() {
  return `
    ${subHeader('Datos y privacidad', 'Todo vive en este teléfono')}
    <section class="group icons" data-key="g-data">
      ${cell({ ic: 'download', tint: 'c-blue', label: 'Crear copia de seguridad', action: 'export', chevron: true })}
      ${cell({ ic: 'upload', tint: 'c-green', label: 'Restaurar copia', action: 'import', chevron: true })}
      ${cell({ ic: 'sparkles', tint: 'c-yellow', label: 'Ver la bienvenida', action: 'onboarding', chevron: true })}
    </section>
    <p class="group-foot" data-key="f-data">Tus tareas, tu diario y tus registros no salen de tu iPhone. Guarda una copia en iCloud Drive una vez por semana: si borras la app, es la forma de recuperarlo todo.</p>
    <section class="group" data-key="g-reset">
      ${cell({ label: 'Borrar todos los datos', action: 'reset', danger: true })}
    </section>
    <input type="file" id="importFile" accept="application/json,.json" hidden data-key="import-file" data-change="import-file">
    <p class="group-foot" data-key="f-heart" style="text-align:center;margin-top:18px">Hecho con ${icon('heart')}</p>`;
}

// Subpantallas del perfil: ruta → [título en la barra, vista].
export const PROFILE_PAGES = {
  estadisticas: ['Estadísticas', viewStats],
  notificaciones: ['Notificaciones', viewNotifications],
  agua: ['Agua', viewWater],
  enfoque: ['Enfoque', viewFocusSettings],
  sueno: ['Sueño', viewSleep],
  planificacion: ['Planificación', viewPlanning],
  rutinas: ['Rutinas', viewRoutines],
  apariencia: ['Apariencia', viewAppearance],
  iphone: ['Configura tu iPhone', viewIphone],
  datos: ['Datos y privacidad', viewData],
};
