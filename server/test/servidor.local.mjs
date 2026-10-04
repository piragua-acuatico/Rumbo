// Prueba de punta a punta del servidor, en tu computadora.
// 1) En otra terminal:  npx wrangler dev --test-scheduled --port 8787
//    (.dev.vars debe tener VAPID_PRIVATE_KEY, PAIR_CODE y ALLOW_ANY_ENDPOINT=1)
// 2) Luego:             node test/servidor.local.mjs
// Este script hace de "iPhone" (se suscribe y programa avisos) y de "Apple"
// (recibe el aviso, lo descifra y comprueba que llegó completo).
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { b64u, fromB64u } from '../src/webpush.js';

const API = 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5173';
const PAIR = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^PAIR_CODE=(.*)$/m) || [])[1]?.trim();
let fails = 0;
const ok = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const te = new TextEncoder();
const newId = () => b64u(crypto.getRandomValues(new Uint8Array(32)));

/* --- El "iPhone": claves de la suscripción --- */
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = b64u(await crypto.subtle.exportKey('raw', ua.publicKey));
const auth = b64u(crypto.getRandomValues(new Uint8Array(16)));
const id = newId();

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function decrypt(body) {
  const salt = body.slice(0, 16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(fromB64u(auth), ecdh, new Uint8Array([...te.encode('WebPush: info\0'), ...fromB64u(p256dh), ...asPublic]), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
  return new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)));
}

/* --- "Apple": recibe los avisos --- */
const received = [];
let reply = 201;
const apple = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    received.push({ headers: req.headers, text: await decrypt(new Uint8Array(Buffer.concat(chunks))).catch(e => `ERROR ${e}`) });
    res.writeHead(reply).end();
  });
}).listen(9999);
const endpoint = `http://127.0.0.1:9999/push/${id}`;
const subscription = { endpoint, keys: { p256dh, auth } };

const api = (path, body, origin = ORIGIN) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
const cron = () => fetch(`${API}/__scheduled?cron=*+*+*+*+*`);
const kinds = () => received.map(r => JSON.parse(r.text).k);
const sql = query => {
  const file = `${process.env.LOCALAPPDATA || '.'}/rumbo-test-q.sql`;
  fs.writeFileSync(file, query);
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'rumbo-avisos', '--local', '--json', '--file', JSON.stringify(file)], { cwd: new URL('..', import.meta.url), encoding: 'utf8', shell: true });
  return JSON.parse(out)[0].results;
};

try {
  ok('.dev.vars tiene un código de emparejamiento', !!PAIR);
  ok('salud: GET /health responde (claves VAPID correctas y código configurado)', (await fetch(`${API}/health`)).ok);
  ok('seguridad: un origen desconocido es rechazado', (await api('/subscribe', { id }, 'https://otro-sitio.com')).status === 403);
  ok('seguridad: un id inválido es rechazado', (await api('/subscribe', { id: 'corto' })).status === 400);
  ok('seguridad: sin código de emparejamiento no se puede suscribir', (await api('/subscribe', { id, subscription })).status === 403);
  ok('seguridad: con un código equivocado tampoco', (await api('/subscribe', { id, pair: `${PAIR}x`, subscription })).status === 403);
  ok('programar sin suscribirse: 404', (await api('/schedule', { id, events: [] })).status === 404);

  ok('suscribirse con el código', (await api('/subscribe', { id, pair: PAIR, subscription })).ok);

  let now = Date.now();
  const sched = await api('/schedule', { id, events: [
    { due: now + 1500, kind: 'tarea', payload: 'IV.CIFRADO-TAREA' },
    { due: now + 1800, kind: 'agua', payload: 'IV.CIFRADO-AGUA' },
    { due: now + 3600_000, kind: 'planear', payload: 'IV.FUTURO' },
    { due: now - 5000, kind: 'tarea', payload: 'PASADO' },             // descartado: ya pasó
    { due: now + 9 * 864e5, kind: 'tarea', payload: 'LEJANO' },        // descartado: más de 8 días
    { due: now + 5000, kind: 'Raro<b>', payload: 'X' },               // descartado: tipo con caracteres no permitidos
  ] });
  ok('programar: acepta 3 de 6 (descarta el pasado, el lejano y el de tipo raro)', (await sched.json()).scheduled === 3);

  await sleep(2200);
  // Reprogramar con una lista vacía NO borra lo que ya tocaba enviar (solo lo futuro).
  await api('/schedule', { id, events: [] });
  await cron(); await sleep(1500);
  ok('cron: envió los 2 avisos que ya tocaban, aunque se reprogramó justo antes', received.length === 2);
  const texts = received.map(r => JSON.parse(r.text));
  ok('contenido: llega cifrado y completo {k, e, d}', texts.some(t => t.k === 'tarea' && t.e === 'IV.CIFRADO-TAREA' && t.d > 0) && texts.some(t => t.k === 'agua' && t.e === 'IV.CIFRADO-AGUA'));
  ok('encabezados: VAPID, aes128gcm, TTL y Urgency', received.every(r => /^vapid t=.+, k=.+/.test(r.headers.authorization) && r.headers['content-encoding'] === 'aes128gcm' && r.headers.ttl && r.headers.urgency === 'high'));
  ok('reprogramar: el aviso futuro (planear) se reemplazó', sql(`SELECT COUNT(*) AS n FROM events WHERE sub_id = '${id}'`)[0].n === 0);

  received.length = 0;
  await cron(); await sleep(1200);
  ok('cron otra vez: no repite avisos ya enviados', received.length === 0);

  const t = await api('/test', { id, payload: 'IV.PRUEBA' });
  await sleep(500);
  ok('aviso de prueba: llega al instante', t.ok && kinds().includes('prueba'));
  ok('aviso de prueba: un segundo seguido es frenado (429)', (await api('/test', { id, payload: 'IV.PRUEBA' })).status === 429);

  // Si Apple falla (500), el aviso se reintenta un minuto después.
  now = Date.now();
  await api('/schedule', { id, events: [{ due: now + 1000, kind: 'noche', payload: 'IV.NOCHE' }] });
  await sleep(1500);
  reply = 500; received.length = 0;
  await cron(); await sleep(1500);
  const again = sql(`SELECT kind, tries, due FROM events WHERE sub_id = '${id}'`);
  ok('error 500 de Apple: el aviso queda para reintentar en 1 minuto', received.length === 1 && again.length === 1 && again[0].tries === 1 && again[0].due > Date.now());
  reply = 201;

  // Una semana llena: 400 avisos (el máximo) se guardan todos.
  const many = Array.from({ length: 400 }, (_, i) => ({ due: Date.now() + 60_000 + i * 60_000, kind: 'agua', payload: `IV.${i}` }));
  const big = await api('/schedule', { id, events: many });
  ok('programar 400 avisos de una vez (el máximo)', big.ok && (await big.json()).scheduled === 400);
  ok('programar 401 avisos: rechazado', (await api('/schedule', { id, events: [...many, many[0]] })).status === 400);

  // Tope de dispositivos: al registrar el sexto, se olvida el más antiguo (nunca bloquea al dueño).
  const others = [];
  for (let i = 0; i < 5; i++) { const o = newId(); others.push(o); await api('/subscribe', { id: o, pair: PAIR, subscription: { endpoint: `http://127.0.0.1:9999/push/${o}`, keys: { p256dh, auth } } }); await sleep(20); }
  const left = sql(`SELECT id FROM subs`).map(r => r.id);
  ok('tope de 5 dispositivos: se olvidó el más antiguo y entraron los nuevos', left.length === 5 && !left.includes(id) && others.every(o => left.includes(o)));
  for (const o of others) await api('/unsubscribe', { id: o });

  // Si Apple responde 410 (suscripción vencida), el servidor la olvida y la app se entera.
  await api('/subscribe', { id, pair: PAIR, subscription });
  reply = 410;
  await sleep(10_000); // el aviso de prueba tiene un límite de uno cada 10 segundos
  ok('410 de Apple: /test responde "gone"', (await api('/test', { id, payload: 'IV.X' })).status === 410);
  ok('410 de Apple: el servidor borró la suscripción', (await api('/schedule', { id, events: [] })).status === 404);
} catch (err) {
  console.log('ERROR', err);
  fails++;
} finally {
  apple.close();
}
console.log(fails ? `\n✖ ${fails} prueba(s) fallaron` : '\n✔ El servidor funciona de punta a punta');
process.exit(fails ? 1 : 0);
