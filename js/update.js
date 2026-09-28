// Actualización automática: cuando se publica una versión nueva, el iPhone la
// descarga sola y la app se recarga en un momento que no interrumpa.
import { toast } from './fx.js';
import { sheetOpen } from './sheet.js';

const FLAG = 'rumbo.updated';

// El usuario está escribiendo o tiene algo abierto: mejor no recargar de golpe.
function busy() {
  const a = document.activeElement;
  const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  const overlay = ['focus', 'onboarding'].some(id => !document.getElementById(id)?.hidden);
  return typing || sheetOpen() || overlay;
}

function reload() {
  try { sessionStorage.setItem(FLAG, '1'); } catch { /* sin almacenamiento */ }
  location.reload();
}

export function initUpdates() {
  // Aviso después de recargar con la versión nueva.
  try {
    if (sessionStorage.getItem(FLAG)) {
      sessionStorage.removeItem(FLAG);
      setTimeout(() => toast('Rumbo se actualizó', { sub: 'Ya tienes la última versión', icon: 'sparkles', tint: 'c-purple' }), 600);
    }
  } catch { /* sin almacenamiento */ }

  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  // Si ya había una versión controlando la página, un cambio de controlador = versión nueva.
  const hadController = !!navigator.serviceWorker.controller;
  let pending = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return;
    pending = true;
    if (!busy()) { reload(); return; }
    toast('Hay una versión nueva de Rumbo', {
      icon: 'sparkles', tint: 'c-purple', duration: 12000,
      action: { label: 'Actualizar', run: reload },
    });
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    // Buscar versión nueva al volver a la app y cada 30 minutos mientras está abierta.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}
