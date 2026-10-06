// CrossFit: catálogo de levantamientos y los cálculos (1RM, nivel, % de grasa), con sus fuentes.
// Los niveles vienen de un estudio científico; Rumbo no presenta nada como "oficial de CrossFit".

export const LB_PER_KG = 2.20462;
export const toKg = lb => lb / LB_PER_KG;
export const toLb = kg => kg * LB_PER_KG;

/* =========================================================
   Levantamientos
   kind: 'fuerza' (se puede estimar el 1RM) u 'olimpico' (solo cuentan los singles).
   meier: clave de la tabla del estudio (si el estudio midió ese levantamiento).
   ========================================================= */
export const LIFTS = [
  { id: 'deadlift', name: 'Deadlift', es: 'Peso muerto', kind: 'fuerza', meier: 'DL' },
  { id: 'backsquat', name: 'Back squat', es: 'Sentadilla trasera', kind: 'fuerza', meier: 'BS' },
  { id: 'frontsquat', name: 'Front squat', es: 'Sentadilla frontal', kind: 'fuerza' },
  { id: 'ohs', name: 'Overhead squat', es: 'Sentadilla con la barra arriba', kind: 'fuerza' },
  { id: 'bench', name: 'Bench press', es: 'Press de banca', kind: 'fuerza', meier: 'BP' },
  { id: 'press', name: 'Shoulder press', es: 'Press de hombros estricto', kind: 'fuerza', meier: 'SP' },
  { id: 'pushpress', name: 'Push press', es: 'Press con impulso de piernas', kind: 'fuerza' },
  { id: 'thruster', name: 'Thruster', es: 'Sentadilla frontal + press', kind: 'fuerza' },
  { id: 'snatch', name: 'Snatch', es: 'Arranque', kind: 'olimpico', meier: 'SN' },
  { id: 'powersnatch', name: 'Power snatch', es: 'Arranque sin sentadilla completa', kind: 'olimpico' },
  { id: 'clean', name: 'Clean', es: 'Cargada', kind: 'olimpico' },
  { id: 'powerclean', name: 'Power clean', es: 'Cargada sin sentadilla completa', kind: 'olimpico' },
  { id: 'cleanjerk', name: 'Clean & jerk', es: 'Dos tiempos', kind: 'olimpico', meier: 'CJ' },
  { id: 'jerk', name: 'Jerk', es: 'Split o push jerk', kind: 'olimpico' },
];
export const liftOf = id => LIFTS.find(l => l.id === id);

// Ideas para escribir un complex (se pueden escribir otros).
export const COMPLEX_IDEAS = [
  'Clean + Front squat + Jerk',
  'Power clean + Hang clean + Jerk',
  'Snatch + Overhead squat',
  'Power snatch + Hang snatch + Snatch',
  'Deadlift + Hang power clean + Power clean',
];

/* ---------- 1RM estimado ----------
   Epley (1985): peso × (1 + reps / 30). Los estudios muestran que solo es fiable con
   pocas repeticiones (Reynolds 2006: máximo 10; mejor 5 o menos), y no se usa en los
   levantamientos olímpicos: con más repeticiones la técnica se rompe (NSCA / HPRC). */
export const MAX_EST_REPS = 10;
export function oneRM(entry, lift) {
  if (entry.reps === 1) return { lb: entry.lb, est: false };
  if (lift.kind !== 'fuerza' || entry.reps > MAX_EST_REPS) return null;
  return { lb: Math.round(entry.lb * (1 + entry.reps / 30)), est: true };
}

// El mejor 1RM de un levantamiento: real si hay singles; si no, estimado (solo en fuerza).
export function bestOneRM(entries, lift) {
  let best = null;
  for (const e of entries) {
    const r = oneRM(e, lift);
    if (!r) continue;
    // Un single real gana a un estimado igual o algo mayor: lo levantado de verdad pesa más.
    if (!best || r.lb > best.lb || (r.lb === best.lb && !r.est)) best = { ...r, date: e.date, from: e };
  }
  return best;
}

/* ---------- Nivel frente a crossfitters ----------
   Meier N, Rabel S, Schmidt A. "Determination of a CrossFit® Benchmark Performance Profile".
   Sports (Basel) 2021;9(6):80. doi:10.3390/sports9060080 · licencia CC BY 4.0 · PMC8228530.
   162 atletas recreativos (66 hombres, 96 mujeres) de 11 boxes de EE. UU. y Alemania, 1RM autoinformado.
   Tabla 3: umbrales en kg para los percentiles 99, 90, 75, 50 y 20. Tabla 2: media y DE. */
const MEIER = {
  m: {
    DL: { p: [143, 170, 193, 218, 240], mean: 172.1, sd: 37.4 },
    BS: { p: [110, 148, 160, 184, 194], mean: 140.8, sd: 35.6 },
    BP: { p: [85, 105, 120, 130, 142], mean: 106.3, sd: 21.9 },
    SP: { p: [57, 68, 79, 86, 106], mean: 70.2, sd: 15.7 },
    SN: { p: [60, 70, 90, 100, 125], mean: 74.2, sd: 20.8 },
    CJ: { p: [75, 95, 115, 125, 134], mean: 95.8, sd: 25.8 },
  },
  f: {
    DL: { p: [98, 111, 130, 145, 170], mean: 114.4, sd: 22.5 },
    BS: { p: [75, 90, 107, 125, 134], mean: 92.6, sd: 20.2 },
    BP: { p: [44, 55, 64, 71, 88], mean: 54.3, sd: 13.0 },
    SP: { p: [35, 41, 48, 52, 57], mean: 42.8, sd: 10.8 },
    SN: { p: [37, 47, 55, 66, 77], mean: 48.2, sd: 12.1 },
    CJ: { p: [52, 62, 70, 84, 95], mean: 62.8, sd: 14.8 },
  },
};
const PCTS = [20, 50, 75, 90, 99];

// Función de distribución normal (aproximación de Abramowitz y Stegun 7.1.26).
function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Percentil (0–99) de un 1RM en kg. Entre los umbrales del estudio se interpola;
// por debajo del percentil 20 se usa la curva normal con su media y desviación.
export function crossfitPercentile(meierKey, sex, kg) {
  const d = MEIER[sex]?.[meierKey];
  if (!d) return null;
  const { p } = d;
  if (kg >= p[4]) return 99;
  if (kg < p[0]) return Math.max(1, Math.min(19, Math.round(normalCdf((kg - d.mean) / d.sd) * 100)));
  for (let i = 0; i < 4; i++) {
    if (kg < p[i + 1]) return Math.round(PCTS[i] + (PCTS[i + 1] - PCTS[i]) * (kg - p[i]) / (p[i + 1] - p[i]));
  }
  return 99;
}
// Para la barra: los umbrales en lb.
export const meierMarks = (meierKey, sex) => MEIER[sex]?.[meierKey]?.p.map((kg, i) => ({ pct: PCTS[i], lb: Math.round(toLb(kg)) })) || [];
export const MEIER_CITE = 'Meier, Rabel y Schmidt (2021), Sports 9(6):80 · 162 crossfitters recreativos, 1RM autoinformado';

/* =========================================================
   Cuerpo
   ========================================================= */
const log10 = Math.log10;

// Ejército/DoD de EE. UU. (2023), una sola medida: abdomen en el ombligo + peso.
// McClung et al., Int J Obes 2025 (PMC11999870); Taylor et al., Obes Sci Pract 2024.
export function fatDoD(sex, kg, waistCm) {
  if (!kg || !waistCm) return null;
  const lb = toLb(kg), inch = waistCm / 2.54;
  return sex === 'f' ? -9.15 - 0.015 * lb + 1.27 * inch : -26.97 - 0.12 * lb + 1.99 * inch;
}
// Marina de EE. UU. (Hodgdon y Beckett, 1984), en pulgadas. Hombres: cuello y abdomen; mujeres: cuello, cintura y cadera.
export function fatNavy(sex, heightCm, waistCm, neckCm, hipCm) {
  const h = heightCm / 2.54, w = waistCm / 2.54, n = neckCm / 2.54, hip = hipCm / 2.54;
  if (!h || !w || !n) return null;
  if (sex === 'f') return hip && w + hip - n > 0 ? 163.205 * log10(w + hip - n) - 97.684 * log10(h) - 78.387 : null;
  return w - n > 0 ? 86.010 * log10(w - n) - 70.041 * log10(h) + 36.76 : null;
}
// Masa grasa relativa (RFM), Woolcott y Bergman, Sci Rep 2018 (PMC6054651).
export const fatRFM = (sex, heightCm, waistCm) => (heightCm && waistCm ? (sex === 'f' ? 76 : 64) - 20 * (heightCm / waistCm) : null);

// Categorías del American Council on Exercise (ACE), % de grasa.
const ACE = { m: [[6, 'Grasa esencial'], [14, 'Atleta'], [18, 'Fitness'], [25, 'Promedio']], f: [[14, 'Grasa esencial'], [21, 'Atleta'], [25, 'Fitness'], [32, 'Promedio']] };
export const aceCategory = (sex, pct) => (pct == null ? null : (ACE[sex].find(([lim]) => pct < lim)?.[1] || 'Obesidad'));

// Cintura/altura (NICE, Reino Unido): 0,4–0,49 saludable; 0,5–0,59 riesgo aumentado; ≥0,6 riesgo alto.
export function whtr(heightCm, waistCm) {
  if (!heightCm || !waistCm) return null;
  const r = waistCm / heightCm;
  return { r, label: r >= 0.6 ? 'Riesgo alto' : r >= 0.5 ? 'Riesgo aumentado' : r >= 0.4 ? 'Saludable' : null };
}
// IMC (OMS): <18,5 bajo peso; 18,5–24,9 normal; ≥25 sobrepeso; ≥30 obesidad.
export function bmi(heightCm, kg) {
  if (!heightCm || !kg) return null;
  const v = kg / (heightCm / 100) ** 2;
  return { v, label: v < 18.5 ? 'Bajo peso' : v < 25 ? 'Normal' : v < 30 ? 'Sobrepeso' : 'Obesidad' };
}
export const clampFat = v => (v == null || !Number.isFinite(v) ? null : Math.max(2, Math.min(60, v)));
