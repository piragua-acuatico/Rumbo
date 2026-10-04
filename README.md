# Rumbo

App web instalable (PWA) para organizar el día desde la noche anterior. Está pensada para iPhone, con diseño al estilo iOS.

## Qué hace
Cinco pestañas: **Hoy · Plan · Diario · CrossFit · Perfil**.

- **Hoy:** anillos de progreso (tareas, agua y enfoque), agenda con la línea de "ahora", tareas sin hora, atrasadas y registro de agua con un vaso animado. En la noche ofrece "Me voy a dormir"; en la mañana, cuánto dormiste.
- **Plan**, con dos vistas:
  - **Mañana:** el ritual de la noche en 4 pasos: cerrar el día, ánimo y reflexión, plan con tus 3 importantes y **despertador** (pone la alarma del iPhone). Al final, "Terminar el día" suma a tu racha.
  - **Pendientes:** la bandeja de lo que aún no tiene día (con filtros por categoría) y las tareas de los próximos días.
- **Diario:** tu ánimo y tus reflexiones de cada día. La foto del día llega en la Fase 4.
- **CrossFit:** vista previa. El módulo completo llega en la Fase 5.
- **Perfil:** tu tarjeta (foto, nombre, racha) y las secciones, cada una con su pantalla:
  - Estadísticas, Notificaciones, Agua, Enfoque y Sueño.
  - Planificación y modo noche, y Rutinas.
  - Apariencia, Configura tu iPhone (instalación y bloqueos con Tiempo en pantalla) y Datos y privacidad.
- **Notificaciones reales** (agua, tareas, planear, modo noche, buenos días, fin del enfoque, misión del despertador), aunque la app esté cerrada. Las envía un servidor propio en Cloudflare (carpeta `server/`, con su propio README) y viajan cifradas: el servidor no puede leerlas.
- **Despertador con misión:** Rumbo pone la alarma en el **Reloj** del iPhone usando la app **Atajos** (suena bloqueado, en silencio y sin gastar batería), más una alarma de respaldo. Al despertar, 5 operaciones apagan el respaldo y Rumbo anota cuánto dormiste. Guía en Perfil › Sueño.
- **Enfoque:** temporizador a pantalla completa, con un indicador flotante cuando lo minimizas.
- **Modo noche (11 pm – 6 am):** pantalla de descanso con tu plan, un campo para anotar algo rápido y "Me voy a dormir".
- **Escritura natural:** "Gym mañana 7pm por 1h #salud !" detecta el día, la hora, la duración, la categoría y si es importante.
- **Gestos:**
  - Desliza una tarea a la derecha para completarla, y a la izquierda para moverla o borrarla (se puede deshacer).
  - En las subpantallas, desliza desde el borde izquierdo para volver.

## Lo que no puede hacer una web en iPhone
- **Bloquear otras apps.** Eso lo hace *Tiempo en pantalla*; la guía está en Perfil › Configura tu iPhone.
- **Sonar como alarma con la app cerrada.** Por eso Rumbo le pide a *Atajos* que ponga la alarma del Reloj.

## Probar en la PC
```bash
node tools/serve.cjs
```
- App: http://localhost:5173
- Demo con datos de ejemplo (solo funciona en localhost): http://localhost:5173/tools/demo.html?tab=hoy&theme=dark
  - `tab` acepta `hoy`, `plan`, `diario`, `crossfit`, `perfil` o una subpantalla como `perfil/agua`.
  - Con `planned=0` se ve el ritual sin terminar.
  - Con `alarm=-1` la alarma "sonó" hace un minuto y aparece la misión; con `alarm=30` suena en 30 minutos.

## Publicar una actualización
```bash
node tools/publicar.cjs "qué cambió"
```
El comando:
1. Revisa que el código no tenga errores de sintaxis.
2. Abre la app en un Chrome real, sin ventana, y recorre todas las pestañas, subpantallas y hojas (`tools/probar.cjs`). Si algo falla, no publica.
3. Sube la versión en `js/version.js` y `sw.js`.
4. Regenera la lista de archivos que se guardan para usar sin internet.
5. Guarda el cambio y lo sube a GitHub.

GitHub Pages lo publica en 1 o 2 minutos. La próxima vez que abras Rumbo en el iPhone, se actualiza sola y avisa "Rumbo se actualizó". Si estás escribiendo o tienes algo abierto, no te interrumpe: aparece un botón **Actualizar**. Tus datos no se tocan.

## Estructura
- `index.html` y `css/app.css`: estructura y estilos.
- `js/app.js`: arranque, navegación (pestañas, subpantallas y transiciones), render y eventos.
- `js/handlers.js`: todas las acciones.
- `js/store.js`: datos (localStorage), con validación al cargar y al restaurar.
- `js/ui.js`: rutas y estado de la pantalla.
- `js/morph.js`: actualiza el DOM sin cortar las animaciones.
- `js/views/`: `today`, `plan` (usa `ritual` e `inbox`), `diary`, `crossfit`, `profile` (sus subpantallas y `stats`).
- `js/sheets.js` y `js/sheet.js`: hojas modales.
- `js/push.js` y `js/config.js`: notificaciones (suscripción, avisos cifrados y conexión con el servidor).
- `js/sleep.js`: despertador con Atajos, "me voy a dormir", la misión y el registro de sueño.
- `js/focus.js`, `js/night.js`, `js/onboarding.js`, `js/swipe.js`, `js/parse.js`, `js/update.js` y `js/version.js`.
- `sw.js`: funcionamiento sin conexión y notificaciones. Su lista de archivos la regenera `publicar`.
- `server/`: el servidor de avisos (Cloudflare Workers + D1).
- `tools/`: servidor local, demo, prueba en navegador, publicación y generador de íconos.

Tus datos se guardan solo en el teléfono. Al servidor solo llegan los avisos, cifrados.
