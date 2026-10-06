// Ánimo del día: las 5 caritas (de difícil a genial) y sus colores para el mosaico y el año en píxeles.
import { MOODS } from './store.js';

export const MOOD_COLORS = { 1: '#FF453A', 2: '#FF9F0A', 3: '#FFCC00', 4: '#9BD43A', 5: '#34C759' };

// El ánimo de un día ({ v, emoji, word, color }) o null. Los días que se guardaron con la
// cuadrícula de la 2.5.0 ya tienen su carita equivalente en "mood".
export function moodOf(j) {
  const m = j && MOODS.find(x => x.v === j.mood);
  return m ? { v: m.v, emoji: m.e, word: m.l, color: MOOD_COLORS[m.v] } : null;
}

// Para elegir (ritual y día de hoy).
export function moodPicker(k, j) {
  return `
    <div class="moods" role="radiogroup" aria-label="Ánimo">
      ${MOODS.map(m => `<button class="mood" data-action="mood" data-v="${m.v}" data-date="${k}" role="radio" aria-pressed="${j?.mood === m.v}"><span>${m.e}</span>${m.l}</button>`).join('')}
    </div>`;
}
