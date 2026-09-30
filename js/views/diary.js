// Pestaña "Diario": tu ánimo y tus reflexiones de cada día.
// (La foto del día, el mosaico y los recuerdos llegan en la Fase 4.)
import { state, MOODS } from '../store.js';
import { todayKey, fmtDateLong, relDate, esc } from '../utils.js';
import { largeTitle, sectionHead, emptyState } from '../components.js';
import { icon } from '../icons.js';

const moodOf = v => MOODS.find(m => m.v === v);

export function viewDiary() {
  const k = todayKey();
  const today = state.journal[k] || {};
  const todayMood = moodOf(today.mood);
  const entries = Object.entries(state.journal)
    .filter(([d, j]) => d !== k && (j.mood || j.note))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);

  const out = [largeTitle('Diario', fmtDateLong(k))];

  out.push(todayMood || today.note
    ? `
      <section class="card diary-today" data-key="d-today-card">
        <p class="diary-kicker">Hoy</p>
        <div class="diary-mood">${todayMood ? `<span class="diary-emoji">${todayMood.e}</span><b>${todayMood.l}</b>` : ''}</div>
        ${today.note ? `<p class="diary-note">${esc(today.note)}</p>` : ''}
        <button class="pill-btn" data-action="go" data-tab="plan" data-seg="manana">${icon('moon-fill')}Editar en el ritual</button>
      </section>`
    : `
      <button class="banner tappable-card" data-key="d-today-empty" data-action="go" data-tab="plan" data-seg="manana" style="--tint: var(--c-indigo)">
        <span class="banner-ic">${icon('book-fill')}</span>
        <span class="banner-text"><b>¿Cómo va tu día?</b><p>Esta noche, en el ritual, cuentas cómo estuvo y qué te llevas.</p></span>
        <span class="cell-chev">${icon('chevron-right')}</span>
      </button>`);

  out.push(`
    <section class="card soon-card" data-key="d-soon" style="--tint: var(--c-orange)">
      <span class="soon-ic">${icon('camera')}</span>
      <div>
        <b>Muy pronto: la foto del día</b>
        <p>Una foto al final de cada día, el mosaico del mes y los recuerdos de "hace un año".</p>
      </div>
    </section>`);

  out.push(sectionHead('Tus días', entries.length ? `${entries.length}` : '', 'days'));
  if (!entries.length) {
    out.push(`<div class="list" data-key="d-empty">${emptyState({
      ic: 'book', tint: 'c-indigo', title: 'Tu diario empieza hoy',
      text: 'Cada noche, al cerrar el día, tu ánimo y tu reflexión quedan guardados aquí.',
      key: 'd-empty-state',
    })}</div>`);
  } else {
    out.push(`<div class="list" data-key="d-list">${entries.map(([d, j]) => {
      const m = moodOf(j.mood);
      return `
        <div class="diary-row" data-key="dr-${d}">
          <span class="diary-row-emoji">${m ? m.e : '·'}</span>
          <div class="diary-row-body">
            <b>${relDate(d)}${m ? ` · <span>${m.l}</span>` : ''}</b>
            ${j.note ? `<p>${esc(j.note)}</p>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`);
  }
  return out.join('');
}
