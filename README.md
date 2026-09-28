# Rumbo

App web instalable (PWA) para organizar el día desde la noche anterior. Está pensada para iPhone, con diseño al estilo iOS.

## Qué hace
- **Hoy:** anillos de progreso (tareas, agua y enfoque), agenda con la línea de "ahora", tareas sin hora, atrasadas y registro de agua con un vaso animado.
- **Mañana:** ritual de la noche en 4 pasos: cerrar el día, reflexión y ánimo, plan con tus 3 importantes, y recordatorios al Calendario. Al final, "Terminar el día" suma a tu racha.
- **Pendientes:** bandeja de lo que aún no tiene día (con filtros por categoría) y las tareas de los próximos días.
- **Progreso:** racha de planificación, resumen y gráficos de 7 o 30 días, ánimo y reflexiones.
- **Ajustes:** tema, color de acento, agua, enfoque, horarios, modo noche, rutinas, copia de seguridad y guías del iPhone (instalación y bloqueos con Tiempo en pantalla).
- **Enfoque:** temporizador a pantalla completa, con indicador flotante cuando lo minimizas.
- **Modo noche (11 pm – 6 am):** pantalla de descanso con tu plan y un campo para anotar algo rápido.
- **Escritura natural:** "Gym mañana 7pm por 1h #salud !" detecta el día, la hora, la duración, la categoría y si es importante.
- **Gestos:** desliza una tarea a la derecha para completarla y a la izquierda para moverla o borrarla (con opción de deshacer).

## Lo que no puede hacer una web en iPhone
- **Bloquear otras apps.** Eso lo hace *Tiempo en pantalla*; la guía está en Ajustes.
- **Avisar por su cuenta con la app cerrada.** Los avisos se envían al Calendario del iPhone con archivos `.ics`.

## Probar en la PC
```bash
node tools/serve.cjs
```
- App: http://localhost:5173
- Demo con datos de ejemplo (solo funciona en localhost): http://localhost:5173/tools/demo.html?tab=hoy&theme=dark

## Publicar una actualización
```bash
node tools/publicar.cjs "qué cambió"
```
El comando:
1. Revisa que el código no tenga errores de sintaxis.
2. Abre la app en un Chrome real, sin ventana, y recorre todas las pestañas y hojas (`tools/probar.cjs`). Si algo falla, no publica.
3. Sube la versión en `js/version.js` y `sw.js`.
4. Regenera la lista de archivos que se guardan para usar sin internet.
5. Guarda el cambio y lo sube a GitHub.

GitHub Pages lo publica en 1 o 2 minutos. La próxima vez que abras Rumbo en el iPhone, se actualiza solo y avisa "Rumbo se actualizó". Si estás escribiendo o tienes algo abierto, no te interrumpe: aparece un botón **Actualizar**. Tus datos no se tocan.

## Estructura
- `index.html`, `css/app.css`: estructura y estilos.
- `js/app.js`: arranque, render y eventos. `js/handlers.js`: todas las acciones.
- `js/store.js`: datos (localStorage). `js/morph.js`: actualiza el DOM sin cortar las animaciones.
- `js/views/*`: las cinco pestañas. `js/sheets.js` y `js/sheet.js`: hojas modales.
- `js/focus.js`, `js/night.js`, `js/onboarding.js`, `js/swipe.js`, `js/parse.js`, `js/ics.js`.
- `sw.js`: funcionamiento sin conexión. **Sube `CACHE` en cada publicación.**
- `tools/`: servidor local, demo y generador de íconos. No hace falta publicar esta carpeta.

Los datos se guardan solo en el teléfono.
