// Ánimo en dos ejes: energía (1 baja → 5 alta) × agrado (1 desagradable → 5 agradable).
// Es el "medidor de ánimo" de la psicología (Yale): nombrar la emoción ayuda a entenderla.
// Las palabras son sustantivos para no asumir el género de quien escribe.
import { MOODS } from './store.js';

// Filas: energía de 5 (arriba) a 1 (abajo). Columnas: agrado de 1 a 5.
const WORDS = [
  ['Furia', 'Pánico', 'Sorpresa', 'Emoción', 'Euforia'],
  ['Frustración', 'Estrés', 'Expectativa', 'Motivación', 'Entusiasmo'],
  ['Molestia', 'Preocupación', 'Normal', 'Alegría', 'Orgullo'],
  ['Desánimo', 'Cansancio', 'Calma', 'Satisfacción', 'Gratitud'],
  ['Tristeza', 'Agotamiento', 'Aburrimiento', 'Descanso', 'Paz'],
];
export const feelWord = (e, p) => WORDS[5 - e]?.[p - 1] || '';

// Color: cada cuadrante es una familia (rojo tenso, amarillo con energía, azul bajo, verde en calma);
// la cruz del medio usa el tono entre dos familias, y lo cercano al centro es más suave.
export const FEEL_COLORS = {
  red: [255, 69, 58], yellow: [255, 196, 0], blue: [10, 132, 255], green: [52, 199, 89],
  orange: [255, 149, 0], purple: [175, 82, 222], teal: [48, 176, 199], lime: [150, 200, 40], gray: [142, 142, 147],
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function family(e, p) {
  const C = FEEL_COLORS;
  if (e > 3) return p < 3 ? C.red : p > 3 ? C.yellow : C.orange;
  if (e < 3) return p < 3 ? C.blue : p > 3 ? C.green : C.teal;
  return p < 3 ? C.purple : p > 3 ? C.lime : C.gray;
}
export const rgb = c => `rgb(${c.map(Math.round).join(', ')})`;
export function feelColor(e, p) {
  const near = Math.max(Math.abs(e - 3), Math.abs(p - 3)) === 1; // anillo cercano al centro
  return rgb(near ? mix(family(e, p), [255, 255, 255], 0.3) : family(e, p));
}

// El ánimo de un día: el nuevo (energía × agrado) o, en días viejos, la carita de 1 a 5.
export function feelOf(j) {
  if (!j) return null;
  if (j.feel) return { ...j.feel, word: feelWord(j.feel.e, j.feel.p), color: feelColor(j.feel.e, j.feel.p) };
  const m = MOODS.find(x => x.v === j.mood);
  return m ? { e: 3, p: m.v, word: m.l, emoji: m.e, color: feelColor(3, m.v) } : null;
}

// La cuadrícula para elegir (ritual y detalle del día).
export function feelPad(k, j) {
  const cur = j?.feel;
  const f = feelOf(j);
  const cells = [];
  for (let e = 5; e >= 1; e--) {
    for (let p = 1; p <= 5; p++) {
      const on = cur && cur.e === e && cur.p === p;
      cells.push(`<button type="button" class="fc${on ? ' on' : ''}" style="--c:${feelColor(e, p)}" data-action="feel" data-e="${e}" data-p="${p}" data-date="${k}" role="radio" aria-checked="${!!on}" aria-label="${feelWord(e, p)}"></button>`);
    }
  }
  return `
    <div class="feel-pad">
      <span class="fp-y">Más energía</span>
      <div class="feel-grid" role="radiogroup" aria-label="¿Cómo te sentiste?">${cells.join('')}</div>
      <span class="fp-y">Menos energía</span>
      <div class="fp-x"><span>Desagradable</span><span>Agradable</span></div>
    </div>
    <p class="feel-word">${f ? `<i style="background:${f.color}"></i><b>${f.word}</b>` : 'Toca el cuadro que más se parece a tu día'}</p>`;
}
