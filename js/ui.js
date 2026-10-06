// Estado de la interfaz (no se guarda): pestaña, subpantalla, filtros, etc.
export const TABS = ['hoy', 'plan', 'diario', 'crossfit', 'perfil'];

// Direcciones de versiones anteriores → dónde viven ahora.
const LEGACY = {
  manana: { tab: 'plan', planSeg: 'manana' },
  pendientes: { tab: 'plan', planSeg: 'pendientes' },
  progreso: { tab: 'perfil', sub: 'estadisticas' },
  ajustes: { tab: 'perfil' },
};

// "#perfil/agua" → { tab: 'perfil', sub: 'agua' }
export function parseRoute(hash) {
  const [tab, sub] = String(hash || '').replace(/^#/, '').split('/');
  if (LEGACY[tab]) return { sub: null, planSeg: null, ...LEGACY[tab] };
  if (!TABS.includes(tab)) return { tab: 'hoy', sub: null, planSeg: null };
  // Solo el Perfil tiene subpantallas.
  return { tab, sub: tab === 'perfil' ? sub || null : null, planSeg: null };
}

const start = parseRoute(location.hash);

export const ui = {
  tabs: TABS,
  tab: start.tab,
  sub: start.sub,
  // Dentro de "Plan": el ritual de la noche o la bandeja de pendientes.
  planSeg: start.planSeg,
  // Pestaña desde la que se entró a una subpantalla del Perfil (para volver ahí).
  from: null,
  range: 7,
  selBar: null,
  inboxFilter: 'all',
  showDoneInbox: false,
  nightBypassUntil: 0,
  waterHistory: [],
  scroll: {},
  // Diario: mes que muestra el mosaico ("2026-10"); null = el mes actual.
  diaryMonth: null,
};
