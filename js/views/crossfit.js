// Pestaña "CrossFit": tu entreno. (El módulo completo llega en la Fase 5.)
import { largeTitle, cell } from '../components.js';
import { icon } from '../icons.js';

const COMING = [
  { ic: 'star-fill', tint: 'c-orange', label: 'Tus récords (PR)', sub: 'Cada ejercicio con su historial y gráfico, en libras' },
  { ic: 'chart', tint: 'c-blue', label: 'Tu nivel por ejercicio', sub: 'De Principiante a Élite, comparado con gimnasio y con crossfitters' },
  { ic: 'timer', tint: 'c-green', label: 'Benchmarks', sub: 'Fran, Grace, Helen, Murph y más, con tus tiempos' },
  { ic: 'person', tint: 'c-purple', label: 'Composición corporal', sub: '% de grasa y medidas (peso en kg)' },
  { ic: 'camera', tint: 'c-pink', label: 'Foto de progreso', sub: 'Compara tu antes y después' },
];

export function viewCrossfit() {
  return `
    ${largeTitle('CrossFit', 'Tu entreno')}
    <section class="card cf-hero" data-key="cf-hero">
      <span class="cf-hero-ic">${icon('dumbbell')}</span>
      <h2>Tu entreno está en camino</h2>
      <p>Aquí vivirán tus levantamientos, tus benchmarks y tu cuerpo. Todo en tu teléfono.</p>
    </section>
    <h2 class="sec-h small" data-key="cf-h">Lo que viene</h2>
    <section class="group icons" data-key="cf-list">
      ${COMING.map(c => cell({ ...c, key: `cf-${c.ic}` })).join('')}
    </section>`;
}
