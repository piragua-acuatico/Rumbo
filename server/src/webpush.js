// Envío de Web Push estándar, sin librerías: firma VAPID (RFC 8292) y cifrado
// del contenido "aes128gcm" (RFC 8291 + RFC 8188), todo con WebCrypto.
// Funciona igual en Cloudflare Workers y en Node 20+ (para las pruebas).

const enc = new TextEncoder();

export const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/* ---------- Cifrado del contenido (lo que solo el teléfono puede abrir) ---------- */
// `fixed` solo lo usan las pruebas, para reproducir el ejemplo oficial del RFC 8291.
export async function encryptPayload(subscription, plaintext, fixed = {}) {
  const uaPublic = fromB64u(subscription.p256dh); // clave pública del teléfono (65 bytes)
  const authSecret = fromB64u(subscription.auth);  // secreto compartido (16 bytes)

  // Par de claves de un solo uso del servidor para este mensaje.
  const asKeys = fixed.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = fixed.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un solo registro: contenido + delimitador 0x02 ("último registro").
  const record = concat(enc.encode(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  // Encabezado: salt (16) | tamaño de registro (4) | largo de la clave (1) | clave pública del servidor (65)
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/* ---------- Firma VAPID (demuestra a Apple que el aviso viene de tu servidor) ---------- */
const jwtCache = new Map(); // audiencia → { jwt, exp }. Apple pide no renovarlo más de una vez por hora.

export async function vapidAuth(endpoint, { publicKey, privateJwk, subject }) {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const cached = jwtCache.get(aud);
  if (cached && cached.exp - now > 3600) return `vapid t=${cached.jwt}, k=${publicKey}`;

  const exp = now + 12 * 3600;
  const unsigned = `${b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${b64u(enc.encode(JSON.stringify({ aud, exp, sub: subject })))}`;
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  const jwt = `${unsigned}.${b64u(signature)}`;
  jwtCache.set(aud, { jwt, exp });
  return `vapid t=${jwt}, k=${publicKey}`;
}

/* ---------- Enviar ---------- */
export async function sendWebPush(subscription, plaintext, vapid, { ttl = 600, urgency = 'high', topic } = {}) {
  const body = await encryptPayload(subscription, plaintext);
  const headers = {
    Authorization: await vapidAuth(subscription.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(ttl),
    Urgency: urgency,
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
  return { status: res.status, ok: res.ok, gone: res.status === 404 || res.status === 410 };
}
