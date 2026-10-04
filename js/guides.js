// Guías paso a paso para configurar el iPhone.

export const GUIDES = {
  install: {
    title: 'Instalar Rumbo',
    ic: 'iphone',
    tint: 'c-blue',
    intro: 'Hazlo una sola vez. Rumbo quedará en tu pantalla de inicio y se abrirá como una app, a pantalla completa, incluso sin internet.',
    steps: [
      ['Abre Rumbo en Safari', 'Tiene que ser <b>Safari</b>: es el único navegador del iPhone que instala apps web correctamente.'],
      ['Compartir → Añadir a pantalla de inicio', 'Toca el botón <b>Compartir</b> (el cuadrado con la flecha), baja y elige <b>Añadir a pantalla de inicio</b>. Déjala en tu pantalla principal, a la vista.'],
      ['Ábrela siempre desde el ícono', 'La app instalada y Safari guardan tus datos <b>por separado</b>: si anotas algo en Safari, no aparece en el ícono. Usa siempre el ícono de Rumbo.'],
    ],
  },
  atajos: {
    title: 'Alarma con Atajos',
    ic: 'shortcuts',
    tint: 'c-pink',
    intro: 'Rumbo usa la app <b>Atajos</b> para poner la alarma en el <b>Reloj</b> de tu iPhone: así suena bloqueado, en silencio y sin gastar batería. Se configura una sola vez.',
    callout: 'Los nombres tienen que ser exactos: <b>Rumbo Alarma</b> y <b>Rumbo Apagar</b>.',
    steps: [
      ['Crea «Rumbo Apagar»', 'En Atajos toca <b>+</b> y ponle de nombre <b>Rumbo Apagar</b>. Agrega <b>Buscar alarmas</b>, toca <b>Añadir filtro</b> y deja: <b>Etiqueta</b> · <b>es</b> · <b>Rumbo</b>. Después agrega <b>Eliminar alarmas</b>.'],
      ['Al inicio de «Rumbo Alarma»', 'Abre <b>Rumbo Alarma</b>. Arriba de todo agrega <b>Ejecutar atajo</b> y elige <b>Rumbo Apagar</b>. Debajo agrega <b>Dividir texto</b>: en el texto elige <b>Entrada del atajo</b> y sepáralo por <b>Saltos de línea</b>.'],
      ['Una alarma por cada hora', 'Agrega <b>Repetir con cada</b> (sobre el <b>Texto dividido</b>) y arrastra tu <b>Crear alarma</b> adentro. En la hora elige <b>Elemento de repetición</b> y en <b>Etiqueta</b> escribe <b>Rumbo</b>.'],
      ['Pruébalo', 'Vuelve a Rumbo y toca <b>Probar alarma</b>. Si el iPhone pide permiso para el Reloj, elige <b>Permitir siempre</b>. No hace falta borrar la alarma de prueba: la próxima vez que Rumbo ponga tu alarma, la quita.'],
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
