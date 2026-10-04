# Servidor de avisos de Rumbo

Pequeño programa que vive en **Cloudflare Workers** (gratis) y envía las notificaciones a tu iPhone a la hora exacta, aunque Rumbo esté cerrada.

## Cómo funciona
1. La app (`js/push.js`) calcula tus avisos de los próximos 7 días: agua, tareas 5 min antes, planear, modo noche, buenos días, fin del enfoque, la misión del despertador (cada minuto desde la alarma) y, al final de la semana, un recordatorio de abrir Rumbo. El tipo de aviso es una etiqueta corta (`/^[a-z]{3,12}$/`), así que los tipos nuevos de la app no exigen volver a publicar el servidor.
2. Cifra cada aviso con una clave que **solo existe en tu iPhone** y le manda al servidor la hora y el texto cifrado.
3. Cada minuto, el servidor (`src/index.js`, función `sendDue`) busca los avisos que ya tocan y se los entrega a Apple.
4. Apple los hace llegar a tu iPhone, y el service worker de Rumbo (`sw.js`) los descifra y los muestra.

El servidor nunca ve el título de tus tareas: solo guarda texto cifrado.

## Archivos
| Archivo | Qué es |
|---|---|
| `wrangler.toml` | Configuración: nombre, cron de cada minuto, base de datos y variables públicas. |
| `schema.sql` | Las dos tablas de la base de datos: `subs` (tu iPhone) y `events` (avisos programados). |
| `src/index.js` | El servidor: las rutas `/subscribe`, `/schedule`, `/test` y `/unsubscribe`, más el envío de cada minuto. |
| `src/webpush.js` | El estándar Web Push: cifrado (RFC 8291) y firma VAPID (RFC 8292), sin librerías. |
| `test/webpush.test.mjs` | Prueba que el cifrado coincide byte a byte con el ejemplo oficial del RFC. |
| `test/servidor.local.mjs` | Prueba de punta a punta del servidor en tu computadora. |
| `.vapid-privada.json` | **Secreta.** La clave privada con la que tu servidor firma los avisos. No se sube a GitHub. |

## Comandos útiles (dentro de `server/`)
| Comando | Para qué |
|---|---|
| `npm install` | Instala `wrangler`, la herramienta de Cloudflare. Se hace una sola vez. |
| `npx wrangler login` | Conecta esta computadora con tu cuenta de Cloudflare. |
| `npx wrangler deploy` | Publica el servidor, o una versión nueva de él. |
| `npx wrangler tail` | Muestra en vivo lo que hace el servidor (útil para ver si los avisos salen). |
| `npx wrangler d1 execute rumbo-avisos --remote --command "SELECT kind, datetime(due/1000,'unixepoch') FROM events ORDER BY due LIMIT 20"` | Muestra los próximos avisos programados (horas en UTC). |
| `npm test` | Corre la prueba del cifrado. |
| `npx wrangler secret put PAIR_CODE` | Cambia el código de emparejamiento (luego vuelve a activar las notificaciones en el iPhone). |

## Seguridad
- **Código de emparejamiento** (secreto `PAIR_CODE`): sin él nadie puede registrar un dispositivo. Lo escribes una sola vez en el iPhone.
- Solo `https://piragua-acuatico.github.io` (y `localhost` para pruebas) puede hablar con el servidor desde un navegador.
- Solo envía a los servicios de push oficiales (Apple, Google, Mozilla, Microsoft).
- Máximo 5 dispositivos (al sumar uno nuevo se olvida el más antiguo), 400 avisos por dispositivo y 1 aviso de prueba cada 10 segundos.
- Un dispositivo que no se reporta en 30 días se borra solo.
- Cada aviso va cifrado con una clave que solo tiene tu iPhone, y lleva sellada su hora y su tipo: si alguien los cambiara, el iPhone no lo abriría.
- Si Apple falla, el aviso se reintenta hasta 2 veces, un minuto después.
- La clave privada vive como **secreto** de Cloudflare (`wrangler secret put`), nunca en el código. `GET /health` dice si las claves y el código están bien configurados.
