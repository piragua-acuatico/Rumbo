# Rumbo

App web instalable (PWA) para organizar el día desde la noche anterior. Está pensada para iPhone, con diseño al estilo iOS.

## Qué hace
Cinco pestañas: **Hoy · Plan · Diario · CrossFit · Perfil**.

- **Hoy:** anillos de progreso (tareas, agua y enfoque), agenda con la línea de "ahora", tareas sin hora, atrasadas y registro de agua con un vaso animado. En la noche ofrece "Me voy a dormir"; en la mañana, cuánto dormiste.
- **Plan**, con dos vistas:
  - **Mañana:** el ritual de la noche en 4 pasos: cerrar el día, ánimo, nota y foto del día, plan con tus 3 importantes y **despertador** (pone la alarma del iPhone). Al final, "Terminar el día" suma a tu racha.
  - **Pendientes:** la bandeja de lo que aún no tiene día (con filtros por categoría) y las tareas de los próximos días.
- **Diario:** la foto y el ánimo de cada día (cuadrícula de energía × agrado, con 25 emociones), tu nota, el mosaico del mes, "hace un año" y tu año en píxeles. Las fotos se guardan comprimidas en el teléfono (IndexedDB).
- **CrossFit:** levantamientos en lb con historial, PR, 1RM (real o estimado con Epley, nunca en olímpicos) y tu nivel frente a 162 crossfitters (Meier y otros, 2021, CC BY); complex; Entrenos (tu diario del box: el WOD, tu resultado y el esfuerzo del 1 al 10, con meta semanal y racha de semanas); y Cuerpo: peso en kg, medidas en cm, % de grasa (Ejército de EE. UU. 2023, con Marina y RFM como segunda opinión, categorías ACE), cintura/estatura, IMC y fotos de progreso. Las fuentes están en `js/crossfit.js`.
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
  - Con `cf=1` carga un historial de CrossFit.
  - Con `photos=1` carga fotos de ejemplo en el diario.
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
- `js/photos.js`, `js/zip.js` y `js/feelings.js`: fotos del diario (IndexedDB), copias .zip con fotos y la cuadrícula de ánimo.
- `js/crossfit.js`: catálogo de levantamientos y benchmarks, y los cálculos (1RM, nivel, % de grasa), con sus fuentes.
- `js/sleep.js`: despertador con Atajos, "me voy a dormir", la misión y el registro de sueño.
- `js/focus.js`, `js/night.js`, `js/onboarding.js`, `js/swipe.js`, `js/parse.js`, `js/update.js` y `js/version.js`.
- `sw.js`: funcionamiento sin conexión y notificaciones. Su lista de archivos la regenera `publicar`.
- `server/`: el servidor de avisos (Cloudflare Workers + D1).
- `tools/`: servidor local, demo, prueba en navegador, publicación y generador de íconos.

Tus datos y tus fotos se guardan solo en el teléfono. Al servidor solo llegan los avisos, cifrados. La copia de seguridad (Perfil › Datos) es un .json o, si tienes fotos, un .zip con todo.
