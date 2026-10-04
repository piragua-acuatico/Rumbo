// Rumbo · servidor de avisos (Cloudflare Worker).
//
// Qué hace:
//  1. La app le manda la suscripción push del iPhone y la lista de avisos de los
//     próximos días (hora + contenido CIFRADO que este servidor no puede leer).
//  2. Cada minuto (cron) busca los avisos que ya toca y los envía a Apple.
//
// Seguridad: para registrar un dispositivo hace falta el código de emparejamiento
// (secreto PAIR_CODE). Después, cada dispositivo se identifica con su id aleatorio.
//
// Rutas: POST /subscribe · POST /schedule · POST /test · POST /unsubscribe · GET /health
import { sendWebPush, fromB64u, b64u } from './webpush.js';

const MAX_SUBS = 5;            // es una app personal: pocos dispositivos
const MAX_EVENTS = 400;        // por dispositivo
const MAX_PAYLOAD = 3000;      // caracteres del contenido cifrado
const MAX_BODY = 1_500_000;    // bytes por petición
const HORIZON = 8 * 864e5;     // no se aceptan avisos a más de 8 días
const LATE = 60 * 60 * 1000;   // un aviso con más de 1 h de retraso ya no se envía
const STALE = 30 * 864e5;      // un dispositivo que no se reporta en 30 días se olvida
const BATCH = 20;              // avisos por minuto (límite de subpeticiones del plan gratis)
const RE_ID = /^[A-Za-z0-9_-]{32,64}$/;
// Tipo de aviso: una etiqueta corta (agua, tarea, alarma…). Solo minúsculas, para que sea seguro guardarla y
// para que las fases nuevas de la app no necesiten volver a publicar el servidor.
const RE_KIND = /^[a-z]{3,12}$/;
// Solo se envía a los servicios de push conocidos (Apple, Google, Mozilla, Microsoft).
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

const json = (data, status, cors) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });

function corsFor(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

function validEndpoint(url, env) {
  try {
    const u = new URL(url);
    if (env.ALLOW_ANY_ENDPOINT === '1') return true; // solo para pruebas locales
    return u.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(u.hostname));
  } catch { return false; }
}

// Comparación en tiempo constante (no revela cuántas letras del código acertaste).
function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// ¿Están bien configuradas las claves? La privada debe corresponder a la pública.
let vapidCache = null;
function vapidFrom(env) {
  if (vapidCache) return vapidCache;
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY);
  const pub = fromB64u(env.VAPID_PUBLIC_KEY || '');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || pub.length !== 65 ||
      jwk.x !== b64u(pub.slice(1, 33)) || jwk.y !== b64u(pub.slice(33, 65))) {
    throw new Error('las claves VAPID no coinciden');
  }
  vapidCache = { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: jwk, subject: env.VAPID_SUBJECT };
  return vapidCache;
}
function configProblem(env) {
  try { vapidFrom(env); } catch (err) { return `vapid: ${err.message}`; }
  if (!env.PAIR_CODE || String(env.PAIR_CODE).length < 6) return 'falta el código de emparejamiento (PAIR_CODE)';
  return null;
}

async function getSub(env, id) {
  return env.DB.prepare('SELECT id, endpoint, p256dh, auth, last_test FROM subs WHERE id = ?1').bind(id).first();
}

async function forgetSub(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE sub_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM subs WHERE id = ?1').bind(id),
  ]);
}

async function push(env, sub, kind, payload, due, ttl) {
  const msg = JSON.stringify({ k: kind, e: payload, d: due });
  const result = await sendWebPush(sub, msg, vapidFrom(env), { ttl, topic: kind === 'agua' ? 'agua' : undefined });
  if (result.gone) await forgetSub(env, sub.id); // Apple dice que esa suscripción ya no existe
  return result;
}

// INSERT de varias filas a la vez (D1 admite hasta 100 parámetros por sentencia).
function insertEvents(env, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 20) {   // 20 filas × 5 columnas = 100 parámetros
    const chunk = rows.slice(i, i + 20);
    const sql = `INSERT INTO events (sub_id, due, kind, payload, tries) VALUES ${chunk.map((_, j) => `(?${j * 5 + 1}, ?${j * 5 + 2}, ?${j * 5 + 3}, ?${j * 5 + 4}, ?${j * 5 + 5})`).join(', ')}`;
    out.push(env.DB.prepare(sql).bind(...chunk.flatMap(r => [r.sub_id, r.due, r.kind, r.payload, r.tries || 0])));
  }
  return out;
}

/* ---------- Rutas ---------- */
async function handle(req, env, cors) {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname === '/health') {
    const problem = configProblem(env);
    return json(problem ? { ok: false, error: problem } : { ok: true }, problem ? 500 : 200, cors);
  }
  if (req.method !== 'POST') return json({ error: 'método' }, 405, cors);
  if (Number(req.headers.get('Content-Length') || 0) > MAX_BODY) return json({ error: 'demasiado grande' }, 413, cors);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'json' }, 400, cors); }
  const id = String(body?.id || '');
  if (!RE_ID.test(id)) return json({ error: 'id' }, 400, cors);
  const now = Date.now();

  if (url.pathname === '/subscribe') {
    if (!env.PAIR_CODE || !sameSecret(body.pair || '', env.PAIR_CODE)) return json({ error: 'código' }, 403, cors);
    const s = body.subscription || {};
    const keys = s.keys || {};
    if (!validEndpoint(s.endpoint, env) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
      return json({ error: 'suscripción' }, 400, cors);
    }
    const stmts = [env.DB.prepare(
      `INSERT INTO subs (id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5`,
    ).bind(id, s.endpoint, keys.p256dh, keys.auth, now)];
    // Con el código correcto nunca se bloquea: si ya hay 5 dispositivos, se olvida el más antiguo.
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs WHERE id != ?1').bind(id).first();
    if (n >= MAX_SUBS) {
      const old = await env.DB.prepare('SELECT id FROM subs WHERE id != ?1 ORDER BY updated_at LIMIT ?2').bind(id, n - MAX_SUBS + 1).all();
      for (const o of old.results) await forgetSub(env, o.id);
    }
    await env.DB.batch(stmts);
    return json({ ok: true }, 200, cors);
  }

  const sub = await getSub(env, id);
  if (!sub) return json({ error: 'no suscrito' }, 404, cors);

  if (url.pathname === '/schedule') {
    const events = Array.isArray(body.events) ? body.events : null;
    if (!events || events.length > MAX_EVENTS) return json({ error: 'eventos' }, 400, cors);
    const rows = [];
    for (const e of events) {
      const due = Math.round(Number(e?.due));
      // Solo avisos futuros: los que ya tocaban siguen en la base y el cron los envía.
      if (!Number.isFinite(due) || due <= now || due > now + HORIZON) continue;
      if (typeof e.kind !== 'string' || !RE_KIND.test(e.kind) || typeof e.payload !== 'string' || e.payload.length > MAX_PAYLOAD) continue;
      rows.push({ sub_id: id, due, kind: e.kind, payload: e.payload });
    }
    // Se reemplazan los avisos futuros de este dispositivo por la lista nueva.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM events WHERE sub_id = ?1 AND due > ?2').bind(id, now),
      env.DB.prepare('UPDATE subs SET updated_at = ?2 WHERE id = ?1').bind(id, now),
      ...insertEvents(env, rows),
    ]);
    return json({ ok: true, scheduled: rows.length }, 200, cors);
  }

  if (url.pathname === '/test') {
    if (typeof body.payload !== 'string' || body.payload.length > MAX_PAYLOAD) return json({ error: 'payload' }, 400, cors);
    if (now - (sub.last_test || 0) < 10_000) return json({ error: 'espera unos segundos' }, 429, cors);
    await env.DB.prepare('UPDATE subs SET last_test = ?2, updated_at = ?2 WHERE id = ?1').bind(id, now).run();
    const result = await push(env, sub, 'prueba', body.payload, 0, 60);
    if (result.gone) return json({ error: 'gone' }, 410, cors);
    return json({ ok: result.ok, status: result.status }, result.ok ? 200 : 502, cors);
  }

  if (url.pathname === '/unsubscribe') {
    await forgetSub(env, id);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: 'ruta' }, 404, cors);
}

/* ---------- Cada minuto: enviar lo que toca ---------- */
export async function sendDue(env, now = Date.now()) {
  // Sin claves válidas no se toca nada: los avisos esperan a que se arregle la configuración.
  if (configProblem(env)) { console.log('configuración incompleta:', configProblem(env)); return 0; }

  // Reclamar los avisos de este minuto de forma atómica: si dos crons se cruzan, cada aviso sale una sola vez.
  const claimed = (await env.DB.prepare(
    `DELETE FROM events WHERE id IN (
       SELECT id FROM events WHERE due <= ?1 AND due > ?2 ORDER BY due LIMIT ${BATCH}
     ) RETURNING id, sub_id, due, kind, payload, tries`,
  ).bind(now, now - LATE).all()).results;

  let sent = 0;
  const retry = [];
  if (claimed.length) {
    const ids = [...new Set(claimed.map(e => e.sub_id))];
    const subs = (await env.DB.prepare(`SELECT id, endpoint, p256dh, auth FROM subs WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...ids).all()).results;
    const byId = new Map(subs.map(s => [s.id, s]));
    for (const ev of claimed) {
      const sub = byId.get(ev.sub_id);
      if (!sub) continue;
      try {
        const r = await push(env, sub, ev.kind, ev.payload, ev.due, ev.kind === 'agua' ? 1800 : 600);
        if (r.ok) sent++;
        else if (!r.gone && (r.status === 429 || r.status >= 500) && ev.tries < 2) retry.push({ ...ev, due: now + 60_000, tries: ev.tries + 1 });
        else console.log('push rechazado', ev.kind, r.status);
      } catch (err) {
        if (ev.tries < 2) retry.push({ ...ev, due: now + 60_000, tries: ev.tries + 1 });
        console.log('push falló', ev.kind, String(err));
      }
    }
  }
  // Limpieza: reintentos, avisos que se quedaron atrás y dispositivos abandonados.
  await env.DB.batch([
    ...insertEvents(env, retry),
    env.DB.prepare('DELETE FROM events WHERE due <= ?1').bind(now - LATE),
    env.DB.prepare('DELETE FROM events WHERE sub_id IN (SELECT id FROM subs WHERE updated_at < ?1)').bind(now - STALE),
    env.DB.prepare('DELETE FROM subs WHERE updated_at < ?1').bind(now - STALE),
  ]);
  return sent;
}

export default {
  async fetch(req, env) {
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (!cors && new URL(req.url).pathname !== '/health') return json({ error: 'origen no permitido' }, 403, {});
    try {
      return await handle(req, env, cors || {});
    } catch (err) {
      console.log('error', String(err));
      return json({ error: 'servidor' }, 500, cors || {});
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDue(env));
  },
};
