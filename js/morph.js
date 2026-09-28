// Actualiza el DOM existente para que coincida con un HTML nuevo, sin reemplazarlo.
// Así las transiciones CSS se ven, los campos no pierden el foco y las filas
// nuevas (y solo ellas) animan su entrada.
//  - data-key: identifica elementos entre renders (filas de tareas, etc.).
//  - data-live: el atributo style lo controla JS (animaciones); no se toca.

const keyOf = n => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

export function morph(target, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(target, tpl.content);
}

function morphChildren(parent, next) {
  const newKids = [...next.childNodes];
  const keyed = new Map();
  for (const n of parent.childNodes) { const k = keyOf(n); if (k) keyed.set(k, n); }

  newKids.forEach((nn, i) => {
    const cur = parent.childNodes[i] || null;
    const k = keyOf(nn);
    let match = null;
    if (k) {
      match = keyed.get(k) || null;
      if (match) keyed.delete(k);
    } else if (cur && !keyOf(cur) && cur.nodeType === nn.nodeType && cur.nodeName === nn.nodeName) {
      match = cur;
    }
    if (match) {
      if (match !== cur) parent.insertBefore(match, cur);
      morphNode(match, nn);
    } else {
      parent.insertBefore(nn, cur);
    }
  });
  while (parent.childNodes.length > newKids.length) parent.lastChild.remove();
}

function morphNode(el, nn) {
  if (el.nodeType !== 1) {
    if (el.nodeValue !== nn.nodeValue) el.nodeValue = nn.nodeValue;
    return;
  }
  // Un elemento que está animando su salida no se toca: está por desaparecer.
  if (el.classList.contains('leaving')) return;
  const live = el.hasAttribute('data-live');
  // data-keep-class: clases que pone JS (p. ej. el estado de un gesto) y que deben sobrevivir.
  const keep = (nn.getAttribute('data-keep-class') || '').split(' ').filter(c => c && el.classList.contains(c));
  for (const { name } of [...el.attributes]) {
    if (live && name === 'style') continue;
    if (!nn.hasAttribute(name)) el.removeAttribute(name);
  }
  for (const { name, value } of [...nn.attributes]) {
    if (live && name === 'style') continue;
    const v = name === 'class' && keep.length ? `${value} ${keep.join(' ')}` : value;
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }
  const tag = el.nodeName;
  if (tag === 'INPUT') {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = nn.hasAttribute('checked');
    // Solo los campos con value en el HTML son "controlados"; los demás conservan lo escrito.
    else if (document.activeElement !== el && nn.hasAttribute('value')) {
      const v = nn.getAttribute('value');
      if (el.value !== v) el.value = v;
    }
    return;
  }
  if (tag === 'TEXTAREA') {
    if (document.activeElement !== el && el.value !== nn.textContent) el.value = nn.textContent;
    return;
  }
  if (tag === 'SELECT') {
    morphChildren(el, nn);
    const sel = [...nn.options].find(o => o.hasAttribute('selected'));
    if (sel && el.value !== sel.value) el.value = sel.value;
    return;
  }
  if (el.hasAttribute('data-morph-skip')) return;
  morphChildren(el, nn);
}
