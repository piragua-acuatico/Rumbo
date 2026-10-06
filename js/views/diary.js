// Pestaña "Diario": la foto y el ánimo de cada día, el mosaico del mes,
// los recuerdos de "hace un año" y tu año en píxeles.
import { state, MOODS, editableDay } from '../store.js';
import { todayKey, parseKey, keyOf, fmtDateLong, relDate, esc, cap, plural } from '../utils.js';
import { largeTitle, sectionHead } from '../components.js';
import { icon } from '../icons.js';
import { ui } from '../ui.js';
import { openSheet } from '../sheet.js';
import { moodOf, moodPicker, MOOD_COLORS } from '../feelings.js';
import { photoURL, photoMissing } from '../photos.js';

const hasPhoto = k => !!state.journal[k]?.photo && !photoMissing(k);
const hasContent = j => !!(j && (j.mood || j.feel || j.note || j.photo));
const dfMonth = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' });
const MONTH_LETTERS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const daysIn = (y, m) => new Date(y, m, 0).getDate();   // m: 1-12

function thumbHTML(k, cls = '') {
  const src = photoURL(k, 'thumb');
  return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : `<span class="${cls} ph-wait"></span>`;
}

// "Hace un año" (o, si no hay, "hace un mes"): el recuerdo más lejano que tenga algo.
function memory(k) {
  const d = parseKey(k);
  const year = new Date(d); year.setFullYear(d.getFullYear() - 1);
  const month = new Date(d); month.setMonth(d.getMonth() - 1);
  for (const [when, label] of [[year, 'Hace un año'], [month, 'Hace un mes']]) {
    // Un 29 de febrero o un 31 no existe en todos los meses: entonces no hay recuerdo de ese día.
    if (when.getDate() !== d.getDate()) continue;
    const mk = keyOf(when);
    if (hasContent(state.journal[mk])) return { k: mk, label };
  }
  return null;
}

function todayCard(k) {
  const j = state.journal[k];
  const f = moodOf(j);
  const photo = hasPhoto(k) ? photoURL(k, 'full') : '';
  return `
    <section class="card day-card" data-key="d-today">
      ${photo
        ? `<button class="day-photo" data-action="day-open" data-date="${k}" aria-label="Ver el día"><img src="${photo}" alt="Foto de hoy"></button>`
        : hasPhoto(k)
          ? '<div class="day-photo ph-wait"></div>'
          : `<button class="day-photo add" data-action="photo-add" data-date="${k}">${icon('camera')}<b>Foto de hoy</b><span>Un momento que quieras recordar</span></button>`}
      <button class="day-body" data-action="day-open" data-date="${k}">
        <span class="diary-kicker">Hoy</span>
        ${f ? `<span class="day-feel"><span class="day-emoji">${f.emoji}</span>${f.word}</span>` : '<span class="day-feel muted">¿Cómo va tu día?</span>'}
        ${j?.note ? `<p class="day-note">${esc(j.note)}</p>` : `<p class="day-note muted">${f ? 'Toca para escribir algo de hoy.' : 'Esta noche, en el ritual, eliges tu ánimo y escribes qué te llevas.'}</p>`}
      </button>
    </section>`;
}

function memoryCard(m) {
  const j = state.journal[m.k];
  const f = moodOf(j);
  return `
    <button class="card memory-card tappable-card" data-key="d-memory" data-action="day-open" data-date="${m.k}">
      ${hasPhoto(m.k) ? thumbHTML(m.k, 'mem-thumb') : `<span class="mem-thumb mem-color" style="background:${f?.color || 'var(--fill)'}">${icon('book-fill')}</span>`}
      <span class="mem-body">
        <span class="diary-kicker">${m.label}</span>
        <b>${cap(fmtDateLong(m.k))}</b>
        <p>${j.note ? esc(j.note) : f ? f.word : 'Guardaste una foto'}</p>
      </span>
      <span class="cell-chev">${icon('chevron-right')}</span>
    </button>`;
}

function mosaic(today) {
  const ym = ui.diaryMonth || today.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7; // lunes primero
  const n = daysIn(y, m);
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="mz blank"></span>');
  for (let d = 1; d <= n; d++) {
    const k = `${ym}-${String(d).padStart(2, '0')}`;
    const j = state.journal[k];
    const f = moodOf(j);
    const future = k > today;
    const inner = hasPhoto(k) ? thumbHTML(k, 'mz-img') : '';
    cells.push(future || (!hasContent(j) && !editableDay(k))
      ? `<span class="mz${future ? ' fut' : ''}"><small>${d}</small></span>`
      : `<button class="mz${k === today ? ' today' : ''}${inner ? ' ph' : ''}" data-action="day-open" data-date="${k}" style="${f && !inner ? `background:${f.color}` : ''}" aria-label="${relDate(k)}">${inner}<small>${d}</small>${inner && f ? `<i style="background:${f.color}"></i>` : ''}</button>`);
  }
  const isNow = ym === today.slice(0, 7);
  return `
    <section class="card mosaic" data-key="d-mosaic">
      <div class="mz-head">
        <button class="mz-nav" data-action="diary-month" data-delta="-1" aria-label="Mes anterior">${icon('chevron-left')}</button>
        <b>${cap(dfMonth.format(new Date(y, m - 1, 1)))}</b>
        <button class="mz-nav" data-action="diary-month" data-delta="1" aria-label="Mes siguiente"${isNow ? ' disabled' : ''}>${icon('chevron-right')}</button>
      </div>
      <div class="mz-week">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div>
      <div class="mz-grid">${cells.join('')}</div>
    </section>`;
}

function yearPixels(today) {
  const y = Number(today.slice(0, 4));
  let count = 0;
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const n = daysIn(y, m);
    const px = [];
    for (let d = 1; d <= 31; d++) {
      if (d > n) { px.push('<i class="x"></i>'); continue; }
      const k = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const f = moodOf(state.journal[k]);
      if (f) count++;
      px.push(f ? `<i style="background:${f.color}"></i>` : `<i class="${k > today ? 'fut' : ''}"></i>`);
    }
    rows.push(`<div class="yp-row"><span>${MONTH_LETTERS[m - 1]}</span>${px.join('')}</div>`);
  }
  return `
    <section class="card year-px" data-key="d-year">
      <div class="yp-head"><b>${y} en píxeles</b><span>${plural(count, 'día', 'días')}</span></div>
      <div class="yp-grid" aria-label="Tu ánimo de cada día del año">${rows.join('')}</div>
      <div class="yp-legend">
        ${MOODS.map(m => `<span><i style="background:${MOOD_COLORS[m.v]}"></i>${m.e}</span>`).join('')}
      </div>
    </section>`;
}

export function viewDiary() {
  const k = todayKey();
  const out = [largeTitle('Diario', fmtDateLong(k))];

  // Recordatorio de copia: las fotos solo viven en este iPhone.
  const photos = Object.values(state.journal).filter(j => j.photo).length;
  const stale = !state.lastBackup || Date.now() - state.lastBackup > 14 * 864e5;
  if (photos >= 3 && stale) {
    out.push(`
      <button class="banner tappable-card" data-key="d-backup" data-action="go" data-tab="perfil/datos" style="--tint: var(--c-blue)">
        <span class="banner-ic">${icon('download')}</span>
        <span class="banner-text"><b>Respalda tus ${photos} fotos</b><p>${state.lastBackup ? 'Tu última copia tiene más de 2 semanas.' : 'Solo están en este iPhone. Guarda una copia en iCloud.'}</p></span>
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`);
  }

  out.push(todayCard(k));
  const mem = memory(k);
  if (mem) out.push(memoryCard(mem));
  out.push(sectionHead('Tu mes', '', 'h-month'));
  out.push(mosaic(k));
  out.push(sectionHead('Tu año', '', 'h-year'));
  out.push(yearPixels(k));

  const entries = Object.entries(state.journal)
    .filter(([d, j]) => d !== k && d < k && hasContent(j))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);
  if (entries.length) {
    out.push(sectionHead('Días recientes', '', 'h-days'));
    out.push(`<div class="list" data-key="d-list">${entries.map(([d, j]) => {
      const f = moodOf(j);
      return `
        <button class="diary-row" data-key="dr-${d}" data-action="day-open" data-date="${d}">
          ${hasPhoto(d) ? thumbHTML(d, 'dr-thumb') : `<span class="dr-thumb dr-color" style="background:${f?.color || 'var(--fill)'}"></span>`}
          <span class="diary-row-body">
            <b>${relDate(d)}${f ? ` · <span>${f.word}</span>` : ''}</b>
            ${j.note ? `<p>${esc(j.note)}</p>` : ''}
          </span>
        </button>`;
    }).join('')}</div>`);
  }
  return out.join('');
}

/* ---------- Detalle de un día (hoja) ---------- */
let dayKey = null;
export const currentDay = () => dayKey;

function renderDay() {
  const k = dayKey;
  const j = state.journal[k] || {};
  const full = hasPhoto(k) ? photoURL(k, 'full') : '';
  const photo = full ? `<img class="ds-photo" src="${full}" alt="Foto del día">` : hasPhoto(k) ? '<div class="ds-photo ph-wait"></div>' : '';
  if (!editableDay(k)) {
    const m = moodOf(j);
    return `
      <div class="day-sheet">
        ${photo}
        ${m ? `<p class="ds-mood"><span>${m.emoji}</span>${m.word}</p>` : ''}
        ${j.note ? `<p class="ds-note">${esc(j.note)}</p>` : ''}
        ${!photo && !m && !j.note ? '<p class="ds-empty">Este día no guardaste nada.</p>' : ''}
        <p class="ds-lock">${icon('lock')}Este día ya pasó: queda guardado tal como lo viviste.</p>
      </div>`;
  }
  return `
    <div class="day-sheet">
      ${photo
        ? `${photo}
           <div class="ds-photo-actions">
             <button class="capsule" data-action="photo-add" data-date="${k}">${icon('camera')}Cambiar</button>
             <button class="capsule danger" data-action="photo-remove" data-date="${k}">Quitar foto</button>
           </div>`
        : `<button class="day-photo add" data-action="photo-add" data-date="${k}">${icon('camera')}<b>Añadir una foto</b><span>De la galería o con la cámara</span></button>`}
      <h4 class="ds-h">¿Cómo estuvo tu día?</h4>
      ${moodPicker(k, j)}
      <h4 class="ds-h">Nota</h4>
      <textarea class="reflect" data-live data-input="day-note" data-date="${k}" rows="3" placeholder="Lo mejor del día, algo que aprendiste o que agradeces…">${esc(j.note || '')}</textarea>
      <p class="ds-lock">${icon('lock')}Puedes cambiarlo hasta que termine el día. Después queda como recuerdo.</p>
    </div>`;
}

export function openDay(k) {
  dayKey = k;
  openSheet({ key: 'day', title: () => cap(fmtDateLong(dayKey)), render: renderDay, auto: !editableDay(k), right: { action: 'sheet-close', icon: 'check', label: 'Listo' } });
}
