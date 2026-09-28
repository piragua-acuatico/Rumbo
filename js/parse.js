// Entiende frases como "Gym mañana a las 7pm por 1h !" o "Llamar a mamá el viernes 3:30 #personal".
import { addDays, parseKey, pad, norm, cap } from './utils.js';

const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

export function parseQuick(text, base, categories = []) {
  // Se trabaja sobre una versión sin tildes y en minúsculas, con las mismas posiciones.
  let src = ` ${text.normalize('NFC')} `;
  const out = { title: text.trim(), date: undefined, time: null, duration: null, important: false, category: null };
  let found = false;

  const take = re => {
    const m = norm(src).match(re);
    if (!m) return null;
    const start = m.index, end = m.index + m[0].length;
    src = `${src.slice(0, start)} ${src.slice(end)}`;
    found = true;
    return m;
  };

  // Importante: "!" o la palabra "importante".
  if (take(/\s(!+|importante)(?=[\s,.;]|$)/)) out.important = true;

  // Categoría: #trabajo
  const tag = take(/\s#([a-z]+)(?=[\s,.;]|$)/);
  if (tag) {
    const c = categories.find(c => norm(c.name).startsWith(tag[1]) || c.id.startsWith(tag[1]));
    if (c) out.category = c.id;
  }

  // Hora con periodo: "7pm", "7:30 p.m.", "a las 7 de la tarde", "8 de la mañana".
  let m = take(/\s(?:a\s+las?\s+|a\s+la\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|de\s+la\s+(manana|tarde|noche)|del\s+mediodia)(?=[\s,.;]|$)/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const period = m[3];
    const pm = /^p/.test(period) || m[4] === 'tarde' || m[4] === 'noche' || /mediodia/.test(period);
    const am = /^a/.test(period) || m[4] === 'manana';
    if (pm && h < 12) h += 12;
    if ((am || m[4] === 'noche') && h === 12) h = 0;
    if (h < 24 && min < 60) out.time = `${pad(h)}:${pad(min)}`;
  }

  // "al mediodía"
  if (!out.time && take(/\s(?:al|a)\s+mediodia(?=[\s,.;]|$)/)) out.time = '12:00';

  // "a las 3", "a las 15:30" (sin periodo): 1–6 se asume tarde.
  if (!out.time) {
    m = take(/\s(?:a\s+las?|a\s+la)\s+(\d{1,2})(?:[:.](\d{2}))?(?=[\s,.;]|$)/);
    if (m) {
      let h = Number(m[1]);
      const min = Number(m[2] || 0);
      if (h >= 1 && h <= 6) h += 12;
      if (h < 24 && min < 60) out.time = `${pad(h)}:${pad(min)}`;
    }
  }

  // "15:30" suelto (24 h).
  if (!out.time) {
    m = take(/\s([01]?\d|2[0-3]):([0-5]\d)(?=[\s,.;]|$)/);
    if (m) out.time = `${pad(Number(m[1]))}:${m[2]}`;
  }

  // Duración: "por 2h", "durante 30 min", "1 hora", "45min".
  m = take(/\s(?:por|durante)?\s*(\d+(?:[.,]5)?)\s*(h|hr|hrs|hora|horas|min|mins|minutos)(?=[\s,.;]|$)/);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    out.duration = Math.round(/^m/.test(m[2]) ? n : n * 60);
  }

  // Fechas.
  if (take(/\s(pasado\s+manana)(?=[\s,.;]|$)/)) out.date = addDays(base, 2);
  else if (take(/\s(?:para\s+)?manana(?=[\s,.;]|$)/)) out.date = addDays(base, 1);
  else if (take(/\s(?:para\s+)?(hoy|esta\s+noche|esta\s+tarde)(?=[\s,.;]|$)/)) out.date = base;
  else {
    m = take(/\s(?:el\s+)?(?:proximo\s+|este\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?=[\s,.;]|$)/);
    if (m) {
      const target = WEEKDAYS[m[1]];
      const diff = ((target - parseKey(base).getDay()) + 7) % 7 || 7;
      out.date = addDays(base, diff);
    }
  }

  if (found) {
    let title = src.replace(/\s+/g, ' ').trim();
    title = title.replace(/\s+(a|el|para|de|la|las|en|por)$/i, '').replace(/[,;]\s*$/, '').trim();
    out.title = cap(title) || text.trim();
  }
  return out;
}
