// Rumbo · buzón con Claude.
//
// Claude (desde el PC de Camilo) deja cambios de tareas para el iPhone, y el iPhone le deja
// un informe de cómo van sus tareas de Digiízate. Todo va CIFRADO de punta a punta con una
// llave compartida entre el iPhone y el PC (ECDH P-256): este servidor solo guarda y entrega
// paquetes que no puede leer.
//
// Enlace (una sola vez), con "compromiso" para que nadie en el medio (ni este servidor) pueda
// fabricar llaves a la medida para que el número de 6 dígitos coincida:
//   1. El iPhone pide un código (POST /link/start) y manda solo la HUELLA de su llave.
//   2. El PC canjea el código (POST /pc/claim): recibe su permiso (token) y esa huella.
//   3. El PC manda su llave pública (POST /pc/key).
//   4. El iPhone la recibe (/link/status) y recién entonces revela la suya (POST /link/reveal);
//      el PC comprueba que corresponde a la huella.
//   5. Ambos muestran un número de 6 dígitos calculado con las dos llaves; si coinciden, Camilo
//      confirma en el iPhone (POST /link/confirm). Hasta entonces no se aceptan envíos.
//
// El PC nunca conoce el id del iPhone (que es su credencial con este servidor): usa el id
// público del enlace ("lid") y su token, del que aquí solo se guarda el SHA-256.

const CODE_TTL = 10 * 60 * 1000;   // el código de enlace vence en 10 minutos
const MAX_MAIL = 30;               // paquetes esperando a que el iPhone los recoja
const MAX_MAIL_BODY = 120_000;     // caracteres por paquete cifrado
const MAX_REPORT = 250_000;        // caracteres del informe cifrado
const MAIL_TTL = 30 * 864e5;       // un paquete que nadie recoge en 30 días se borra
const NOTIFY_GAP = 60_000;         // como mucho un aviso "Claude actualizó tu agenda" por minuto
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L, para dictarlo sin errores
const RE_PUB = /^[A-Za-z0-9_-]{87}$/;  // llave pública P-256 sin comprimir (65 bytes) en base64url
const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const RE_COMMIT = /^[A-Za-z0-9_-]{43}$/; // SHA-256 en base64url

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const randomB64u = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha256hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Huella de la llave del iPhone: SHA-256("rumbo-buzon/1 compromiso" + llave).
async function commitOf(pub) {
  const tag = new TextEncoder().encode('rumbo-buzon/1 compromiso');
  const raw = fromB64u(pub);
  const all = new Uint8Array(tag.length + raw.length);
  all.set(tag);
  all.set(raw, tag.length);
  return b64u(await crypto.subtle.digest('SHA-256', all));
}
function newCode() {
  // Rechazo de los bytes altos para que todas las letras salgan con la misma probabilidad.
  let out = '';
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && out.length < 8) out += CODE_CHARS[b % CODE_CHARS.length];
    }
  }
  return out;
}
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

// Las tablas se crean solas la primera vez: publicar el servidor basta, sin comandos de base de datos.
let schemaReady = null;
export function ensureSchema(env) {
  return schemaReady ||= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS links (
      sub_id     TEXT PRIMARY KEY,
      lid        TEXT NOT NULL UNIQUE,
      app_commit TEXT NOT NULL,
      app_pub    TEXT,
      pc_pub     TEXT,
      code       TEXT,
      code_exp   INTEGER,
      token_hash TEXT,
      confirmed  INTEGER NOT NULL DEFAULT 0,
      report     TEXT,
      report_at  INTEGER,
      seen_at    INTEGER,
      notified   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mail (
      n          INTEGER PRIMARY KEY AUTOINCREMENT,
      sub_id     TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS mail_sub ON mail (sub_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS links_token ON links (token_hash)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS links_code ON links (code)'),
  ]).catch(err => { schemaReady = null; throw err; });
}

async function forgetLink(env, subId) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mail WHERE sub_id = ?1').bind(subId),
    env.DB.prepare('DELETE FROM links WHERE sub_id = ?1').bind(subId),
  ]);
}

/* ---------- Rutas del iPhone (ya pasaron el control de origen y traen un id válido) ---------- */
export async function handleApp(path, body, env, now, { json, cors, getSub }) {
  await ensureSchema(env);
  const id = String(body.id);

  if (path === '/link/start') {
    // Solo un iPhone registrado (con el código de emparejamiento) puede abrir un buzón.
    if (!await getSub(env, id)) return json({ error: 'no suscrito' }, 404, cors);
    const commit = String(body.commit || '');
    if (!RE_COMMIT.test(commit)) return json({ error: 'llave' }, 400, cors);
    const code = newCode(), exp = now + CODE_TTL;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM mail WHERE sub_id = ?1').bind(id),
      env.DB.prepare(`INSERT OR REPLACE INTO links (sub_id, lid, app_commit, app_pub, pc_pub, code, code_exp, token_hash, confirmed, created_at)
                      VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5, NULL, 0, ?6)`).bind(id, randomB64u(16), commit, code, exp, now),
    ]);
    return json({ ok: true, code, exp }, 200, cors);
  }

  const link = await env.DB.prepare('SELECT lid, app_commit, app_pub, pc_pub, code_exp, token_hash, confirmed FROM links WHERE sub_id = ?1').bind(id).first();

  if (path === '/link/status') {
    if (!link) return json({ state: 'none' }, 200, cors);
    if (!link.token_hash) return json({ state: link.code_exp > now ? 'waiting' : 'expired', exp: link.code_exp }, 200, cors);
    if (!link.pc_pub) return json({ state: 'claimed' }, 200, cors);
    const state = link.confirmed ? 'linked' : link.app_pub ? 'revealed' : 'keyed';
    return json({ state, lid: link.lid, pcPub: link.pc_pub }, 200, cors);
  }
  if (path === '/link/remove') {
    if (link) await forgetLink(env, id);
    return json({ ok: true }, 200, cors);
  }
  if (!link || !link.pc_pub) return json({ error: 'sin enlace' }, 404, cors);

  // El iPhone revela su llave solo después de tener la del PC; debe corresponder a la huella.
  if (path === '/link/reveal') {
    const pub = String(body.pub || '');
    if (!RE_PUB.test(pub) || await commitOf(pub) !== link.app_commit) return json({ error: 'llave' }, 400, cors);
    if (link.app_pub && link.app_pub !== pub) return json({ error: 'ya revelada' }, 409, cors);
    if (!link.app_pub) await env.DB.prepare('UPDATE links SET app_pub = ?2 WHERE sub_id = ?1').bind(id, pub).run();
    return json({ ok: true }, 200, cors);
  }
  if (!link.app_pub) return json({ error: 'sin enlace' }, 404, cors);

  if (path === '/link/confirm') {
    await env.DB.prepare('UPDATE links SET confirmed = 1 WHERE sub_id = ?1').bind(id).run();
    return json({ ok: true }, 200, cors);
  }
  if (path === '/mail/inbox') {
    const rows = (await env.DB.prepare('SELECT n, body, created_at FROM mail WHERE sub_id = ?1 ORDER BY n LIMIT 20').bind(id).all()).results;
    await env.DB.prepare('UPDATE links SET seen_at = ?2 WHERE sub_id = ?1').bind(id, now).run();
    return json({ ok: true, msgs: rows.map(r => ({ n: r.n, body: r.body, at: r.created_at })) }, 200, cors);
  }
  if (path === '/mail/ack') {
    const upto = Math.floor(Number(body.upto));
    if (!Number.isFinite(upto) || upto < 1) return json({ error: 'upto' }, 400, cors);
    await env.DB.prepare('DELETE FROM mail WHERE sub_id = ?1 AND n <= ?2').bind(id, upto).run();
    return json({ ok: true }, 200, cors);
  }
  if (path === '/mail/report') {
    if (typeof body.body !== 'string' || !body.body || body.body.length > MAX_REPORT) return json({ error: 'informe' }, 400, cors);
    await env.DB.prepare('UPDATE links SET report = ?2, report_at = ?3 WHERE sub_id = ?1').bind(id, body.body, now).run();
    return json({ ok: true }, 200, cors);
  }
  return json({ error: 'ruta' }, 404, cors);
}

/* ---------- Rutas del PC (sin navegador: no traen Origin; se identifican con su token) ---------- */
export async function handlePc(path, body, env, now, { json, getSub, push }) {
  await ensureSchema(env);

  // El PC canjea el código: recibe su permiso y la HUELLA de la llave del iPhone (todavía no la llave).
  if (path === '/pc/claim') {
    const code = normCode(body.code);
    if (code.length !== 8) return json({ error: 'datos' }, 400);
    const link = await env.DB.prepare('SELECT sub_id, lid, app_commit FROM links WHERE code = ?1 AND code_exp > ?2 AND token_hash IS NULL').bind(code, now).first();
    if (!link) return json({ error: 'código inválido o vencido' }, 404);
    const token = randomB64u(32);
    // "code = ?2" en el WHERE: si dos PCs canjean a la vez, solo uno se queda con el enlace.
    const r = await env.DB.prepare('UPDATE links SET token_hash = ?3, code = NULL, code_exp = NULL WHERE sub_id = ?1 AND code = ?2 AND token_hash IS NULL')
      .bind(link.sub_id, code, await sha256hex(token)).run();
    if (!r.meta?.changes) return json({ error: 'código inválido o vencido' }, 404);
    return json({ ok: true, lid: link.lid, commit: link.app_commit, token }, 200);
  }

  const token = String(body.token || '');
  if (!RE_TOKEN.test(token)) return json({ error: 'token' }, 401);
  const link = await env.DB.prepare('SELECT sub_id, lid, app_commit, app_pub, pc_pub, confirmed, report, report_at, seen_at, notified, created_at FROM links WHERE token_hash = ?1')
    .bind(await sha256hex(token)).first();
  if (!link) return json({ error: 'enlace no encontrado (¿se desenlazó desde el iPhone?)' }, 401);

  // El PC manda su llave (una sola vez), después de haber recibido la huella del iPhone.
  if (path === '/pc/key') {
    const pub = String(body.pub || '');
    if (!RE_PUB.test(pub)) return json({ error: 'llave' }, 400);
    if (link.pc_pub && link.pc_pub !== pub) return json({ error: 'este enlace ya tiene otra llave' }, 409);
    if (!link.pc_pub) await env.DB.prepare('UPDATE links SET pc_pub = ?2 WHERE sub_id = ?1 AND pc_pub IS NULL').bind(link.sub_id, pub).run();
    return json({ ok: true }, 200);
  }
  if (path === '/pc/send') {
    if (!link.confirmed) return json({ error: 'Camilo aún no confirmó el número de 6 dígitos en el iPhone' }, 409);
    if (typeof body.body !== 'string' || !body.body || body.body.length > MAX_MAIL_BODY) return json({ error: 'paquete' }, 400);
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM mail WHERE sub_id = ?1').bind(link.sub_id).first();
    if (n >= MAX_MAIL) return json({ error: `ya hay ${n} paquetes sin recoger: que Camilo abra Rumbo primero` }, 429);
    await env.DB.prepare('INSERT INTO mail (sub_id, body, created_at) VALUES (?1, ?2, ?3)').bind(link.sub_id, body.body, now).run();
    // Aviso al iPhone: sin contenido (el servidor no sabe qué cambió); el iPhone muestra un texto fijo.
    let notified = false;
    if (now - (link.notified || 0) > NOTIFY_GAP) {
      const sub = await getSub(env, link.sub_id);
      if (sub) {
        await env.DB.prepare('UPDATE links SET notified = ?2 WHERE sub_id = ?1').bind(link.sub_id, now).run();
        try { notified = !!(await push(env, sub, 'claude', '', now, 6 * 3600)).ok; } catch (err) { console.log('aviso claude falló', String(err)); }
      }
    }
    return json({ ok: true, pending: n + 1, notified }, 200);
  }
  if (path === '/pc/read') {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM mail WHERE sub_id = ?1').bind(link.sub_id).first();
    return json({
      ok: true, lid: link.lid, commit: link.app_commit, appPub: link.app_pub || null, confirmed: !!link.confirmed,
      report: link.report || null, reportAt: link.report_at || null, seenAt: link.seen_at || null, pending: n, linkedAt: link.created_at,
    }, 200);
  }
  if (path === '/pc/remove') {
    await forgetLink(env, link.sub_id);
    return json({ ok: true }, 200);
  }
  return json({ error: 'ruta' }, 404);
}

// Limpieza (desde el cron): códigos que nadie canjeó, enlaces que nunca se confirmaron y paquetes viejos.
export async function cleanBuzon(env, now) {
  await ensureSchema(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links WHERE confirmed = 0 AND created_at < ?1').bind(now - 864e5),
    env.DB.prepare('DELETE FROM mail WHERE created_at < ?1').bind(now - MAIL_TTL),
  ]);
}
