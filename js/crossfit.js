// CrossFit: catálogo de levantamientos y benchmarks, y los cálculos (1RM, nivel, % de grasa).
// Todo con su fuente. Rumbo no presenta nada como "oficial de CrossFit": las cargas y los
// workouts son los publicados en crossfit.com; los niveles, los de un estudio científico.

export const LB_PER_KG = 2.20462;
export const toKg = lb => lb / LB_PER_KG;
export const toLb = kg => kg * LB_PER_KG;

/* =========================================================
   Levantamientos
   kind: 'fuerza' (se puede estimar el 1RM) u 'olimpico' (solo cuentan los singles).
   meier: clave de la tabla del estudio (si el estudio midió ese levantamiento).
   ========================================================= */
export const LIFTS = [
  { id: 'deadlift', name: 'Peso muerto', en: 'Deadlift', kind: 'fuerza', meier: 'DL' },
  { id: 'backsquat', name: 'Sentadilla trasera', en: 'Back squat', kind: 'fuerza', meier: 'BS' },
  { id: 'frontsquat', name: 'Sentadilla frontal', en: 'Front squat', kind: 'fuerza' },
  { id: 'ohs', name: 'Sentadilla overhead', en: 'Overhead squat', kind: 'fuerza' },
  { id: 'bench', name: 'Press de banca', en: 'Bench press', kind: 'fuerza', meier: 'BP' },
  { id: 'press', name: 'Press de hombros', en: 'Shoulder press (estricto)', kind: 'fuerza', meier: 'SP' },
  { id: 'pushpress', name: 'Push press', en: 'Push press', kind: 'fuerza' },
  { id: 'thruster', name: 'Thruster', en: 'Thruster', kind: 'fuerza' },
  { id: 'snatch', name: 'Arranque', en: 'Snatch', kind: 'olimpico', meier: 'SN' },
  { id: 'powersnatch', name: 'Power snatch', en: 'Power snatch', kind: 'olimpico' },
  { id: 'clean', name: 'Cargada', en: 'Clean', kind: 'olimpico' },
  { id: 'powerclean', name: 'Power clean', en: 'Power clean', kind: 'olimpico' },
  { id: 'cleanjerk', name: 'Clean & jerk', en: 'Dos tiempos', kind: 'olimpico', meier: 'CJ' },
  { id: 'jerk', name: 'Jerk', en: 'Split / push jerk', kind: 'olimpico' },
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
   Benchmarks (crossfit.com/benchmark/<nombre>): estructura y cargas Rx hombre / mujer.
   score: 'time' (por tiempo, menos es mejor), 'amrap' (rondas + reps), 'reps' (total), 'rounds' (rondas, máx. 30).
   ========================================================= */
export const WODS = [
  { id: 'fran', name: 'Fran', score: 'time', lines: ['21-15-9 repeticiones, por tiempo:', 'Thrusters · 95 / 65 lb', 'Pull-ups (dominadas)'],
    tiers: [[180, 'Élite'], [300, 'Rx'], [600, 'Intermedio'], [720, 'Principiante']], meier: { m: [310.4, 134.3], f: [361.8, 112.7] } },
  { id: 'grace', name: 'Grace', score: 'time', lines: ['30 repeticiones, por tiempo:', 'Clean and jerk · 135 / 95 lb'], meier: { m: [233.3, 101.2], f: [250.6, 171.2] } },
  { id: 'helen', name: 'Helen', score: 'time', lines: ['3 rondas, por tiempo:', 'Correr 400 m', '21 kettlebell swings · 53 / 35 lb (1,5 / 1 pood)', '12 pull-ups'], meier: { m: [611.2, 127.1], f: [698.8, 186.1] } },
  { id: 'diane', name: 'Diane', score: 'time', lines: ['21-15-9 repeticiones, por tiempo:', 'Peso muerto · 225 / 155 lb', 'Handstand push-ups (flexiones de pino)'] },
  { id: 'elizabeth', name: 'Elizabeth', score: 'time', lines: ['21-15-9 repeticiones, por tiempo:', 'Cargadas (cleans) · 135 / 95 lb', 'Ring dips (fondos en anillas)'] },
  { id: 'isabel', name: 'Isabel', score: 'time', lines: ['30 repeticiones, por tiempo:', 'Arranque (snatch) · 135 / 95 lb'] },
  { id: 'jackie', name: 'Jackie', score: 'time', lines: ['Por tiempo:', 'Remo 1000 m', '50 thrusters · 45 / 35 lb', '30 pull-ups'] },
  { id: 'karen', name: 'Karen', score: 'time', lines: ['150 wall-ball shots, por tiempo', 'Balón de 20 lb a 10 ft / 14 lb a 9 ft'] },
  { id: 'nancy', name: 'Nancy', score: 'time', lines: ['5 rondas, por tiempo:', 'Correr 400 m', '15 sentadillas overhead · 95 / 65 lb'] },
  { id: 'annie', name: 'Annie', score: 'time', lines: ['50-40-30-20-10 repeticiones, por tiempo:', 'Double-unders (dobles)', 'Sit-ups (abdominales)'] },
  { id: 'angie', name: 'Angie', score: 'time', lines: ['Por tiempo:', '100 pull-ups', '100 push-ups (flexiones)', '100 sit-ups', '100 air squats (sentadillas)'] },
  { id: 'barbara', name: 'Barbara', score: 'time', lines: ['5 rondas, por tiempo (3 min de descanso entre rondas):', '20 pull-ups', '30 push-ups', '40 sit-ups', '50 air squats'] },
  { id: 'chelsea', name: 'Chelsea', score: 'rounds', lines: ['Cada minuto durante 30 minutos (EMOM):', '5 pull-ups', '10 push-ups', '15 air squats', 'Resultado: rondas completas (máximo 30)'] },
  { id: 'cindy', name: 'Cindy', score: 'amrap', lines: ['Todas las rondas posibles en 20 minutos (AMRAP):', '5 pull-ups', '10 push-ups', '15 air squats'] },
  { id: 'mary', name: 'Mary', score: 'amrap', lines: ['Todas las rondas posibles en 20 minutos (AMRAP):', '5 handstand push-ups', '10 pistols (alternando piernas)', '15 pull-ups'] },
  { id: 'nicole', name: 'Nicole', score: 'reps', lines: ['20 minutos (AMRAP):', 'Correr 400 m', 'Máximo de pull-ups', 'Resultado: total de pull-ups'] },
  { id: 'eva', name: 'Eva', score: 'time', lines: ['5 rondas, por tiempo:', 'Correr 800 m', '30 kettlebell swings · 2 / 1,5 pood (32 / 24 kg)', '30 pull-ups'] },
  { id: 'kelly', name: 'Kelly', score: 'time', lines: ['5 rondas, por tiempo:', 'Correr 400 m', '30 box jumps · cajón de 24 / 20 in', '30 wall-ball shots · 20 / 14 lb'] },
  { id: 'linda', name: 'Linda', score: 'time', lines: ['10-9-8-7-6-5-4-3-2-1 repeticiones, por tiempo:', 'Peso muerto · 1,5 × tu peso', 'Press de banca · tu peso', 'Squat clean · 0,75 × tu peso'] },
  { id: 'lynne', name: 'Lynne', score: 'reps', lines: ['5 rondas, máximo de repeticiones (sin reloj):', 'Press de banca · tu peso', 'Pull-ups', 'Resultado: total de repeticiones'] },
  { id: 'amanda', name: 'Amanda', score: 'time', lines: ['9-7-5 repeticiones, por tiempo:', 'Muscle-ups', 'Arranque (snatch) · 135 / 95 lb'] },
  // Héroes
  { id: 'murph', name: 'Murph', hero: true, score: 'time', lines: ['Por tiempo, con chaleco de 20 / 14 lb:', 'Correr 1 milla', '100 pull-ups', '200 push-ups', '300 air squats', 'Correr 1 milla', 'Las dominadas, flexiones y sentadillas se reparten como quieras'] },
  { id: 'dt', name: 'DT', hero: true, score: 'time', lines: ['5 rondas, por tiempo, con una barra de 155 / 105 lb:', '12 pesos muertos', '9 hang power cleans', '6 push jerks'] },
  { id: 'jt', name: 'JT', hero: true, score: 'time', lines: ['21-15-9 repeticiones, por tiempo:', 'Handstand push-ups', 'Ring dips', 'Push-ups'] },
  { id: 'michael', name: 'Michael', hero: true, score: 'time', lines: ['3 rondas, por tiempo:', 'Correr 800 m', '50 back extensions (hiperextensiones)', '50 sit-ups'] },
  { id: 'badger', name: 'Badger', hero: true, score: 'time', lines: ['3 rondas, por tiempo:', '30 squat cleans · 95 / 65 lb', '30 pull-ups', 'Correr 800 m'] },
];
export const wodOf = id => WODS.find(w => w.id === id);
export const wodURL = w => `https://www.crossfit.com/benchmark/${w.id}`;

// Valor comparable de un resultado: más alto = mejor (el tiempo va en negativo).
export function scoreValue(w, s) {
  if (w.score === 'time') return -s.secs;
  if (w.score === 'amrap') return s.rounds * 1000 + s.reps;
  if (w.score === 'rounds') return s.rounds;
  return s.reps;
}
export function fmtScore(w, s) {
  if (w.score === 'time') return `${Math.floor(s.secs / 60)}:${String(s.secs % 60).padStart(2, '0')}`;
  if (w.score === 'amrap') return `${s.rounds} rondas${s.reps ? ` + ${s.reps}` : ''}`;
  if (w.score === 'rounds') return `${s.rounds} rondas`;
  return `${s.reps} reps`;
}
// Nivel oficial de Fran (crossfit.com/benchmark/fran): Élite <3 min, Rx <5, Intermedio <10, Principiante <12.
export function wodTier(w, s) {
  if (!w.tiers || w.score !== 'time') return null;
  return w.tiers.find(([secs]) => s.secs < secs)?.[1] || null;
}
// Fran, Grace y Helen: comparación con los tiempos del estudio de Meier (media y DE, curva normal).
export function wodPercentile(w, sex, secs) {
  const d = w.meier?.[sex];
  if (!d) return null;
  return Math.max(1, Math.min(99, Math.round((1 - normalCdf((secs - d[0]) / d[1])) * 100)));
}

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
