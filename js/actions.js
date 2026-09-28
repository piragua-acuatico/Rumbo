// Registro central de acciones: cualquier elemento con data-action="nombre"
// ejecuta el manejador registrado con on('nombre', fn).

const handlers = new Map();

export function on(name, fn) {
  handlers.set(name, fn);
}

export function run(name, el, event) {
  const fn = handlers.get(name);
  if (fn) fn(el, event);
  return !!fn;
}
