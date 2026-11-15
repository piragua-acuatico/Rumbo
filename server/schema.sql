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

-- Buzón con Claude (src/buzon.js). El Worker crea estas tablas solo; aquí quedan como referencia.
-- links: un enlace iPhone ↔ PC por dispositivo. mail: paquetes CIFRADOS que dejó Claude.
CREATE TABLE IF NOT EXISTS links (
  sub_id     TEXT PRIMARY KEY,      -- el iPhone (su id nunca se le da al PC)
  lid        TEXT NOT NULL UNIQUE,  -- id público del enlace
  app_commit TEXT NOT NULL,         -- huella de la llave del iPhone (se manda antes que la llave)
  app_pub    TEXT,                  -- llave pública del iPhone (se revela al final)
  pc_pub     TEXT,                  -- llave pública del PC
  code       TEXT,                  -- código de enlace mientras espera al PC
  code_exp   INTEGER,
  token_hash TEXT,                  -- SHA-256 del permiso del PC
  confirmed  INTEGER NOT NULL DEFAULT 0, -- Camilo comparó el número de 6 dígitos
  report     TEXT,                  -- último informe CIFRADO del iPhone
  report_at  INTEGER,
  seen_at    INTEGER,               -- última vez que el iPhone revisó el buzón
  notified   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mail (
  n          INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id     TEXT NOT NULL,
  body       TEXT NOT NULL,         -- paquete cifrado
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mail_sub ON mail (sub_id);
CREATE INDEX IF NOT EXISTS links_token ON links (token_hash);
CREATE INDEX IF NOT EXISTS links_code ON links (code);
