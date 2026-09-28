// Estado de la interfaz (no se guarda): pestaña, filtros, selección, etc.
const TABS = ['hoy', 'manana', 'pendientes', 'progreso', 'ajustes'];
const initial = location.hash.slice(1);

export const ui = {
  tabs: TABS,
  tab: TABS.includes(initial) ? initial : 'hoy',
  range: 7,
  selBar: null,
  inboxFilter: 'all',
  showDoneInbox: false,
  nightBypassUntil: 0,
  waterHistory: [],
  scroll: {},
};
