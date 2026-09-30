// Bienvenida: se muestra la primera vez (o desde Perfil › Datos y privacidad).
import { state, commit } from './store.js';
import { esc } from './utils.js';
import { cell, timeField, selectField } from './components.js';
import { icon } from './icons.js';
import { haptic, confetti } from './fx.js';

let index = 0;
const SLIDES = 5;

function slides() {
  const s = state.settings;
  return `
    <section class="onb-slide">
      <div>
        <div class="onb-logo"><img src="icons/icon-512.png" alt=""></div>
        <h2>Bienvenido a Rumbo</h2>
        <p class="lead">Tu día, planeado desde la noche anterior. Menos ruido, más de lo que importa.</p>
      </div>
    </section>
    <section class="onb-slide">
      <div>
        <h2>¿Cómo te llamas?</h2>
        <p class="lead">Así Rumbo te saluda cada mañana.</p>
        <input class="onb-name" type="text" value="${esc(s.name)}" data-change="set-name" data-input="onb-name" placeholder="Tu nombre" maxlength="30" enterkeyhint="next" aria-label="Tu nombre">
      </div>
    </section>
    <section class="onb-slide">
      <div>
        <h2>Así funciona</h2>
        <div class="onb-feat">
          <div><span class="fi" style="--tint: var(--c-indigo)">${icon('moon-fill')}</span><span><b>Planea de noche</b>Un ritual de 3 minutos: cierras el día, reflexionas y dejas listo el siguiente.</span></div>
          <div><span class="fi" style="--tint: var(--c-green)">${icon('timer')}</span><span><b>Enfócate</b>Una tarea a la vez, con temporizador y anillos que se llenan.</span></div>
          <div><span class="fi" style="--tint: var(--c-blue)">${icon('drop-fill')}</span><span><b>Hidrátate</b>Registra tu agua con un toque y recibe avisos durante el día.</span></div>
          <div><span class="fi" style="--tint: var(--c-purple)">${icon('hourglass')}</span><span><b>Desconéctate</b>Instagram con límite y modo noche desde las 11 pm, con Tiempo en pantalla.</span></div>
        </div>
      </div>
    </section>
    <section class="onb-slide">
      <div>
        <h2>Tus horarios</h2>
        <p class="lead">Puedes cambiarlos cuando quieras en tu Perfil.</p>
        <div class="group icons">
          ${cell({ ic: 'moon-fill', tint: 'c-indigo', label: 'Planear mañana', control: timeField('set-time', s.planTime, 'data-key-set="planTime"') })}
          ${cell({ ic: 'bed', tint: 'c-purple', label: 'Modo noche', control: timeField('set-time', s.nightStart, 'data-key-set="nightStart"') })}
          ${cell({ ic: 'sun', tint: 'c-orange', label: 'Termina', control: timeField('set-time', s.nightEnd, 'data-key-set="nightEnd"') })}
          ${cell({ ic: 'drop-fill', tint: 'c-blue', label: 'Agua cada', control: selectField('set-water-every', [[60, '1 hora'], [90, '1 h 30'], [120, '2 horas'], [180, '3 horas']], s.waterEvery) })}
        </div>
      </div>
    </section>
    <section class="onb-slide">
      <div>
        <div class="onb-logo" style="background:linear-gradient(145deg,#34C759,#30B0C7);display:grid;place-items:center;color:#fff;font-size:64px">${icon('check')}</div>
        <h2>Todo listo${s.name ? `, ${esc(s.name)}` : ''}</h2>
        <p class="lead">Siguiente paso: instala Rumbo en tu pantalla de inicio y configura los bloqueos. En tu Perfil, en "Configura tu iPhone", te guío paso a paso.</p>
      </div>
    </section>`;
}

function update() {
  const el = document.getElementById('onboarding');
  el.querySelector('.onb-track').style.transform = `translateX(${-index * 100}%)`;
  el.querySelectorAll('.onb-dots i').forEach((d, i) => d.classList.toggle('on', i === index));
  el.querySelector('.onb-back').style.opacity = index ? '1' : '0';
  el.querySelector('.onb-back').style.pointerEvents = index ? 'auto' : 'none';
  el.querySelector('[data-action="onb-next"]').innerHTML = index === 0 ? 'Empezar' : index === SLIDES - 1 ? `${icon('sparkles')}Comenzar a usar Rumbo` : 'Continuar';
  el.querySelectorAll('.onb-slide').forEach((s, i) => s.setAttribute('aria-hidden', String(i !== index)));
  if (index === 1) setTimeout(() => el.querySelector('.onb-name')?.focus({ preventScroll: true }), 450);
  else document.activeElement?.blur?.();
}

export function openOnboarding() {
  index = 0;
  const el = document.getElementById('onboarding');
  el.innerHTML = `
    <button class="icon-btn onb-back" data-action="onb-back" aria-label="Atrás">${icon('chevron-left')}</button>
    <div class="onb-track">${slides()}</div>
    <div class="onb-foot">
      <div class="onb-dots">${Array.from({ length: SLIDES }, () => '<i></i>').join('')}</div>
      <button class="btn primary block" data-action="onb-next">Empezar</button>
    </div>`;
  el.className = 'onb';
  el.hidden = false;
  update();
}

export function onbNext() {
  haptic();
  if (index < SLIDES - 1) {
    index++;
    if (index === SLIDES - 1) {
      // Refresca el saludo con el nombre recién escrito.
      const last = document.querySelectorAll('#onboarding .onb-slide')[SLIDES - 1];
      const h = last.querySelector('h2');
      h.textContent = `Todo listo${state.settings.name ? `, ${state.settings.name}` : ''}`;
    }
    update();
    return;
  }
  state.onboarded = true;
  commit();
  const el = document.getElementById('onboarding');
  el.classList.add('out');
  confetti({ originY: 0.3 });
  haptic('success');
  setTimeout(() => { el.hidden = true; el.innerHTML = ''; el.className = 'onb'; }, 600);
}

export function onbBack() {
  if (index > 0) { index--; update(); }
}
