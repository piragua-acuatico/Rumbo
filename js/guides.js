// Guías paso a paso para configurar el iPhone.

export const GUIDES = {
  install: {
    title: 'Instalar Rumbo',
    ic: 'iphone',
    tint: 'c-blue',
    intro: 'Hazlo una sola vez. Rumbo quedará en tu pantalla de inicio y se abrirá como una app, a pantalla completa y sin internet.',
    steps: [
      ['Abre Rumbo en Safari', 'Tiene que ser <b>Safari</b>: es el único navegador del iPhone que instala apps web correctamente.'],
      ['Compartir → Añadir a pantalla de inicio', 'Toca el botón <b>Compartir</b> (el cuadrado con la flecha), baja y elige <b>Añadir a pantalla de inicio</b>. Déjala en tu pantalla principal, a la vista.'],
      ['Crea un calendario “Rumbo”', 'En la app <b>Calendario</b> → Calendarios → Añadir calendario → “Rumbo”. Al importar recordatorios elige ese calendario; si algún día quieres cambiarlos, borras ese calendario y listo.'],
      ['Instala los recordatorios fijos', 'En Ajustes → <b>Recordatorios fijos</b>. El iPhone te preguntará: elige <b>Añadir todo</b>. Son los avisos de agua, de planear mañana y del modo noche.'],
      ['Activa las notificaciones del Calendario', 'Ajustes del iPhone → Notificaciones → <b>Calendario</b> → Permitir notificaciones, con sonido y en pantalla bloqueada.'],
    ],
  },
  block: {
    title: 'Bloqueos con Tiempo en pantalla',
    ic: 'hourglass',
    tint: 'c-purple',
    intro: 'Una web no puede bloquear otras apps en iPhone. <b>Tiempo en pantalla</b> sí: es del propio sistema y es lo más difícil de saltarse. Sigue los pasos y ve marcándolos.',
    callout: 'Si pones el código tú mismo, el bloqueo es solo una sugerencia: cuando llegues al límite vas a escribirlo “solo por hoy”. Que lo ponga otra persona y no te lo diga.',
    steps: [
      ['Pide ayuda a alguien de confianza', 'Lo único que vuelve el bloqueo realmente “duro” es que <b>tú no sepas el código</b>. Pídele a alguien (familia, pareja, un amigo) que lo ponga en el paso 2.'],
      ['Activa el código de Tiempo en pantalla', 'Ajustes → Tiempo en pantalla → <b>Bloquear ajustes de Tiempo en pantalla</b>. Que la otra persona escriba el código.'],
      ['Límite de Instagram: 2 horas', 'Tiempo en pantalla → <b>Límites de apps</b> → Añadir límite → Redes sociales → <b>Instagram</b>. Pon <b>2 h</b>, todos los días.'],
      ['Suma instagram.com al mismo límite', 'En ese mismo límite, baja a <b>Sitios web</b> y añade <b>instagram.com</b>. Así las 2 h cuentan también si entras desde Safari.'],
      ['Bloquear al final del límite', 'Activa <b>Bloquear al final del límite</b>. Sin el código no hay “15 minutos más”.'],
      ['Modo noche: 11:00 pm a 6:00 am', 'Tiempo en pantalla → <b>Tiempo de inactividad</b> → Programado de <b>23:00 a 6:00</b>, todos los días. Activa <b>Bloquear en el tiempo de inactividad</b>.'],
      ['Deja solo lo esencial', 'Tiempo en pantalla → <b>Siempre permitido</b>: deja <b>Teléfono</b> (las alarmas del Reloj suenan igual). Si aparece <b>Rumbo</b>, agrégala. Quita todo lo demás.'],
      ['Cierra las salidas', 'Tiempo en pantalla → <b>Restricciones de contenido y privacidad</b> → actívalo y, en “Permitir cambios”, pon <b>No permitir</b> en <b>Cambios de código</b> y <b>Cambios de cuenta</b>. Con el código activo, la hora automática no se puede cambiar para engañar al bloqueo.'],
    ],
  },
};
