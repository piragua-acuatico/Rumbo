-- Base de datos del servidor de avisos de Rumbo (Cloudflare D1).
-- subs:   cada iPhone suscrito a notificaciones.
-- events: avisos programados. "payload" va CIFRADO: el servidor no puede leerlo.

CREATE TABLE IF NOT EXISTS subs (
  id         TEXT PRIMARY KEY,   -- identificador aleatorio del dispositivo
  endpoint   TEXT NOT NULL,      -- dirección de Apple a la que se envía el aviso
  p256dh     TEXT NOT NULL,      -- clave pública del iPhone (para cifrar)
  auth       TEXT NOT NULL,      -- secreto compartido con el iPhone
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,   -- última vez que el iPhone habló con el servidor
  last_test  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id  TEXT NOT NULL,
  due     INTEGER NOT NULL,      -- cuándo enviarlo (milisegundos desde 1970, UTC)
  kind    TEXT NOT NULL,         -- tipo: agua, tarea, planear, noche, manana, enfoque
  payload TEXT NOT NULL,         -- contenido cifrado
  tries   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS events_due ON events (due);
CREATE INDEX IF NOT EXISTS events_sub ON events (sub_id);
