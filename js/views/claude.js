// Perfil › Claude: enlazar el buzón, ver lo último que hizo Claude y desenlazar.
// También la tarjeta de Hoy: "Claude actualizó tu agenda", con Deshacer.
import { claudeInfo, canUndo } from '../buzon.js';
import { pushInfo } from '../push.js';
import { subHeader, cell } from '../components.js';
import { icon } from '../icons.js';
import { esc, plural, fmtTime, relDate, todayKey, keyOf } from '../utils.js';

const listText = parts => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0] || '');

// "Agregó 8 tareas y movió 1"
export function summaryText(last) {
  const c = last?.counts || {};
  const parts = [];
  if (c.agregadas) parts.push(`agregó ${plural(c.agregadas, 'tarea', 'tareas')}`);
  if (c.movidas) parts.push(`movió ${c.movidas}`);
  if (c.cambiadas) parts.push(`cambió ${c.cambiadas}`);
  if (c.borradas) parts.push(`borró ${c.borradas}`);
  let text = parts.length ? listText(parts) : 'no cambió nada';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (last?.saltadas) text += ` · ${plural(last.saltadas, 'tarea', 'tareas')} sin tocar (mira por qué)`;
  return text;
}

const hourOf = ms => {
  const d = new Date(ms);
  const day = keyOf(d);
  return `${day === todayKey() ? 'hoy' : relDate(day).toLowerCase()}, ${fmtTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}`;
};

export function claudeBanner() {
  const last = claudeInfo().last;
  if (claudeInfo().stage !== 'linked' || !last || last.closed) return '';
  return `
    <div class="banner" data-key="b-claude" style="--tint: var(--c-orange)">
      <span class="banner-ic">${icon('sparkles')}</span>
      <button class="banner-text" data-action="go" data-tab="perfil/claude" style="text-align:left">
        <b>Claude actualizó tu agenda</b>
        <p>${esc(summaryText(last))}</p>
      </button>
      ${canUndo(last) ? '<button class="banner-undo" data-action="claude-undo">Deshacer</button>' : ''}
      <button class="banner-x" data-action="claude-dismiss" aria-label="Cerrar">${icon('xmark')}</button>
    </div>`;
}

const KIND = {
  agregada: ['plus', 'c-green', 'Agregó'],
  movida: ['calendar', 'c-blue', 'Movió'],
  cambiada: ['note', 'c-orange', 'Cambió'],
  borrada: ['trash', 'c-red', 'Borró'],
  saltada: ['lock', 'c-gray', 'No tocó'],
};
const whenText = x => (x.date ? `${relDate(x.date)}${x.time ? ` · ${fmtTime(x.time)}` : ''}` : 'Sin fecha (Pendientes)');

const LIMITS = `${icon('lock')} Claude solo toca las tareas que él crea y las de <b>Digiízate</b>. Si una ya la hiciste o la cambiaste tú, no la toca. Todo viaja <b>cifrado</b>: el servidor guarda paquetes que no puede leer.`;

export function viewClaude() {
  const inf = claudeInfo();
  const stage = inf.stage || 'none';

  if (stage === 'waiting') {
    const code = String(inf.code || '');
    return `
      ${subHeader('Claude', 'Enlazando…')}
      <section class="card notify-hero claude-hero" data-key="c-hero">
        <span class="notify-ic">${icon('sparkles')}</span>
        <h2>Pásale este código a Claude</h2>
        <div class="link-code" aria-label="Código ${esc(code.split('').join(' '))}">${esc(code.slice(0, 4))}-${esc(code.slice(4))}</div>
        <p>Escríbeselo en el chat. Vence a las ${fmtTime(`${String(new Date(inf.exp).getHours()).padStart(2, '0')}:${String(new Date(inf.exp).getMinutes()).padStart(2, '0')}`)}.<br><span class="waiting-dot"></span>${inf.claimedSeen ? 'Claude recibió el código, conectando…' : 'Esperando a Claude…'}</p>
        <button class="btn primary block" data-action="claude-copy">${icon('share')}Copiar código</button>
        <button class="btn plain block" data-action="claude-cancel" style="margin-top:8px">Cancelar</button>
      </section>
      <p class="group-foot" data-key="f-claude">${LIMITS}</p>`;
  }

  if (stage === 'verify') {
    return `
      ${subHeader('Claude', 'Falta un paso')}
      <section class="card notify-hero claude-hero" data-key="c-hero">
        <span class="notify-ic">${icon('lock')}</span>
        <h2>¿Es el mismo número?</h2>
        <div class="link-code safety">${esc(inf.safety || '')}</div>
        <p>Claude te mostró un número de 6 dígitos en el chat. Si es exactamente este, toca <b>Coincide</b>. Así sabes que nadie se metió en el medio.</p>
        <button class="btn primary block" data-action="claude-confirm">${icon('check')}Sí, coincide</button>
        <button class="btn plain block" data-action="claude-reject" style="margin-top:8px">No coincide</button>
      </section>`;
  }

  if (stage === 'linked') {
    const last = inf.last;
    const seen = inf.lastCheck ? `Revisó el buzón ${hourOf(inf.lastCheck)}` : 'Aún no revisa el buzón';
    const items = (last?.items || []).slice().reverse();
    return `
      ${subHeader('Claude', 'Enlazado')}
      <section class="card notify-hero ok claude-hero" data-key="c-hero">
        <span class="notify-ic">${icon('sparkles')}</span>
        <h2>Enlazado con Claude</h2>
        <p>Claude puede poner y actualizar tus tareas de Digiízate, y ve cómo vas para la revisión de los viernes.<br><small>${seen}${inf.lastReport ? ` · informe enviado ${hourOf(inf.lastReport)}` : ''}</small></p>
        <button class="btn tinted block" data-action="claude-sync">${icon('repeat')}Revisar ahora</button>
      </section>
      ${last ? `
        <h2 class="sec-h small" data-key="h-clast">Lo último · ${hourOf(last.at)}</h2>
        <section class="group icons" data-key="g-clast">
          ${cell({ ic: 'sparkles', tint: 'c-orange', label: last.undone ? 'Deshiciste estos cambios' : esc(summaryText(last).replace(' (mira por qué)', '')), sub: last.nota ? esc(last.nota) : '', key: 'cl-sum' })}
          ${items.map((x, i) => {
            const [ic, tint, verb] = KIND[x.k] || KIND.cambiada;
            return cell({ ic, tint, label: `${verb}: ${esc(x.title)}`, sub: esc(x.why ? `${whenText(x)} · ${x.why}` : whenText(x)), key: `cl-${i}` });
          }).join('')}
          ${canUndo(last) ? cell({ ic: 'arrow-uturn', tint: 'c-red', label: '<span style="color:var(--c-red)">Deshacer estos cambios</span>', action: 'claude-undo', key: 'cl-undo' }) : ''}
        </section>` : ''}
      <p class="group-foot" data-key="f-claude">${LIMITS}</p>
      <section class="group" data-key="g-cunlink">${cell({ label: 'Desenlazar', action: 'claude-unlink', danger: true })}</section>`;
  }

  // Hace falta que este iPhone ya esté registrado en el servidor (al activar las notificaciones).
  const ready = !!pushInfo().id;
  return `
    ${subHeader('Claude', 'Tu asistente')}
    <section class="card notify-hero claude-hero" data-key="c-hero">
      <span class="notify-ic">${icon('sparkles')}</span>
      <h2>Claude, tu asistente</h2>
      <p>Desde el computador, Claude puede poner y actualizar tus tareas de Digiízate (visitas, trámites), y ver cómo vas para la revisión de los viernes. Sin copiar nada.</p>
      <button class="btn primary block" data-action="claude-link"${ready ? '' : ' disabled'}>${icon('link')}Enlazar con Claude</button>
    </section>
    ${ready ? '' : `<p class="callout" data-key="c-need">${icon('bell')}<span><b>Primero activa las notificaciones.</b> El buzón usa el mismo servidor. <button class="link-btn" data-action="go" data-tab="perfil/notificaciones">Activarlas</button></span></p>`}
    <p class="group-foot" data-key="f-claude">${LIMITS} Cada cambio se puede deshacer durante 24 horas, y puedes desenlazar cuando quieras.</p>`;
}
