// Prueba del buzón con Claude en el servidor local (seguridad y flujo completo con el script del PC).
// 1) En otra terminal:  npx wrangler dev --test-scheduled --port 8787
// 2) Luego:             node test/buzon.local.mjs
// Hace de "iPhone" (con el mismo protocolo que js/buzon.js) y usa tools/buzon.cjs como el PC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API = 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5173';
const PAIR = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^PAIR_CODE=(.*)$/m) || [])[1]?.trim();
const SCRIPT = fileURLToPath(new URL('../../tools/buzon.cjs', import.meta.url));
const KEY = path.join(os.tmpdir(), `rumbo-buzon-prueba-${Date.now()}.json`);
let fails = 0;
const ok = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) fails++; };
const te = new TextEncoder(), td = new TextDecoder();
const b64u = b => Buffer.from(new Uint8Array(b)).toString('base64url');
const fromB64u = s => new Uint8Array(Buffer.from(s, 'base64url'));
const join = (...p) => new Uint8Array(Buffer.concat(p.map(x => Buffer.from(x))));
const EC = { name: 'ECDH', namedCurve: 'P-256' };
const PROTO = 'rumbo-buzon/1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const app = (p, body, origin = ORIGIN) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
const pc = (p, body, headers = {}) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const script = (...args) => {
  try { return { ok: true, out: execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, RUMBO_SERVIDOR: API, RUMBO_LLAVE: KEY }, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: `${e.stdout}${e.stderr}` }; }
};
async function boxKey(priv, appPub, pcPub, dir, usage) {
  const other = await crypto.subtle.importKey('raw', fromB64u(pcPub), EC, false, []);
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: other }, priv, 256);
  const salt = await crypto.subtle.digest('SHA-256', join(fromB64u(appPub), fromB64u(pcPub)));
  const hk = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(`${PROTO} ${dir}`) }, hk, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function safety(appPub, pcPub) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', join(te.encode(`${PROTO} numero`), fromB64u(appPub), fromB64u(pcPub))));
  const s = String((d[0] * 2 ** 24 + d[1] * 2 ** 16 + d[2] * 2 ** 8 + d[3]) % 1e6).padStart(6, '0');
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}

try {
  const id = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const kp = await crypto.subtle.generateKey(EC, true, ['deriveBits']);
  const appPub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));

  const commit = b64u(await crypto.subtle.digest('SHA-256', join(te.encode(`${PROTO} compromiso`), fromB64u(appPub))));

  ok('enlazar sin estar suscrito: 404', (await app('/link/start', { id, commit })).status === 404);
  const sub = { endpoint: `http://127.0.0.1:9/push/${id}`, keys: { p256dh: appPub, auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
  ok('suscribirse', (await app('/subscribe', { id, pair: PAIR, subscription: sub })).ok);
  ok('huella inválida: 400', (await app('/link/start', { id, commit: 'corta' })).status === 400);
  const start = await (await app('/link/start', { id, commit })).json();
  ok('el iPhone recibe un código de 8 letras', /^[A-Z2-9]{8}$/.test(start.code || ''));
  ok('estado: esperando al PC', (await (await app('/link/status', { id })).json()).state === 'waiting');

  ok('PC desde una página web ajena: rechazado', (await pc('/pc/claim', { code: start.code }, { Origin: 'https://otro-sitio.com' })).status === 403);
  ok('PC con código equivocado: 404', (await pc('/pc/claim', { code: 'AAAAAAAA' })).status === 404);
  ok('PC sin token válido: 401', (await pc('/pc/read', { token: 'x'.repeat(43) })).status === 401);
  ok('el iPhone no puede leer el buzón antes de enlazar', (await app('/mail/inbox', { id })).status === 404);

  // El PC (el script) canjea el código, con guion y en minúsculas. Corre en paralelo: espera a que el iPhone revele su llave.
  const child = spawn(process.execPath, [SCRIPT, 'enlazar', `${start.code.slice(0, 4).toLowerCase()}-${start.code.slice(4)}`], { env: { ...process.env, RUMBO_SERVIDOR: API, RUMBO_LLAVE: KEY } });
  let linkedOut = '';
  child.stdout.on('data', d => { linkedOut += d; });
  child.stderr.on('data', d => { linkedOut += d; });
  const childDone = new Promise(res => child.on('close', code => res(code)));
  let st = {};
  for (let i = 0; i < 40 && st.state !== 'keyed'; i++) { await sleep(250); st = await (await app('/link/status', { id })).json(); }
  const key0 = JSON.parse(fs.readFileSync(KEY, 'utf8'));
  ok('el PC recibió la HUELLA del iPhone, no su llave', key0.commit === commit && !key0.appPub && !JSON.stringify(key0).includes(appPub));
  ok('estado: el PC mandó su llave y el iPhone la recibe', st.state === 'keyed' && st.pcPub === key0.pub && st.lid === key0.lid);
  ok('el código ya no sirve una segunda vez', (await pc('/pc/claim', { code: start.code })).status === 404);
  const other = b64u(await crypto.subtle.exportKey('raw', (await crypto.subtle.generateKey(EC, true, ['deriveBits'])).publicKey));
  ok('una llave que no corresponde a la huella se rechaza', (await app('/link/reveal', { id, pub: other })).status === 400);
  ok('el PC no puede cambiar su llave después', (await pc('/pc/key', { token: key0.token, pub: other })).status === 409);
  ok('el iPhone revela su llave', (await app('/link/reveal', { id, pub: appPub })).ok);
  ok('script: termina de enlazar', (await childDone) === 0 && /Número de seguridad:\s+\d{3} \d{3}/.test(linkedOut));
  const key = JSON.parse(fs.readFileSync(KEY, 'utf8'));
  const number = await safety(appPub, st.pcPub);
  ok('el número de seguridad del iPhone es el mismo que muestra el PC', linkedOut.includes(number));
  ok('la llave del PC no incluye el id del iPhone', !JSON.stringify(key).includes(id));

  const file = path.join(os.tmpdir(), `rumbo-buzon-cambios-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ nota: 'Prueba', tareas: [{ id: 'digi-prueba-1', titulo: 'Visita de prueba', fecha: '2030-01-15', hora: '8:30', duracion: 60, importante: true }], borrar: ['digi-vieja'] }));
  ok('script: no envía antes de que Camilo confirme (409)', !script('enviar', file).ok);
  ok('el iPhone confirma', (await app('/link/confirm', { id })).ok);
  const bad = path.join(os.tmpdir(), `rumbo-buzon-malo-${Date.now()}.json`);
  fs.writeFileSync(bad, JSON.stringify({ tareas: [{ id: 'Mal Id', titulo: 'x' }, { id: 'digi-a', fecha: '2026-02-30' }, { id: 'digi-b', hora: '25:00' }, { id: 'digi-c', categoria: 'otra', extra: 1 }] }));
  const badOut = script('enviar', bad);
  ok('script: un archivo con errores no se manda y dice cuáles', !badOut.ok && /id inválido/.test(badOut.out) && /fecha/.test(badOut.out) && /hora/.test(badOut.out) && /categoria/.test(badOut.out) && /desconocido "extra"/.test(badOut.out));
  ok('script: probar no manda nada', script('probar', file).ok && (await (await pc('/pc/read', { token: key.token })).json()).pending === 0);
  ok('script: envía tras la confirmación', script('enviar', file).ok);

  // El iPhone recoge y descifra.
  const inbox = await (await app('/mail/inbox', { id })).json();
  ok('el iPhone recibe 1 paquete', inbox.msgs?.length === 1);
  const raw = inbox.msgs[0].body;
  ok('el servidor guarda el paquete cifrado (sin el título a la vista)', !raw.includes('Visita') && !raw.includes('digi-prueba'));
  const [iv, ct] = raw.split('.');
  const kIn = await boxKey(kp.privateKey, appPub, key.pub, 'pc>app', 'decrypt');
  const msg = JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: te.encode(`${PROTO}|pc>app|${key.lid}`) }, kIn, fromB64u(ct))));
  ok('contenido: operaciones correctas (hora normalizada a 08:30)', msg.v === 1 && msg.lote && msg.ops.length === 2 && msg.ops[0].hora === '08:30' && msg.ops[1].op === 'borrar');
  ok('cada paquete lleva un número que solo sube', Number.isFinite(msg.seq) && msg.seq === JSON.parse(fs.readFileSync(KEY, 'utf8')).seq);
  let tampered = false;
  try { await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: te.encode(`${PROTO}|app>pc|${key.lid}`) }, kIn, fromB64u(ct)); } catch { tampered = true; }
  ok('un paquete no se puede reusar en la otra dirección', tampered);
  await app('/mail/ack', { id, upto: inbox.msgs[0].n });
  ok('tras recogerlo, el buzón queda vacío', (await (await app('/mail/inbox', { id })).json()).msgs.length === 0);

  // El iPhone deja su informe y el PC lo lee.
  const kOut = await boxKey(kp.privateKey, appPub, key.pub, 'app>pc', 'encrypt');
  const riv = crypto.getRandomValues(new Uint8Array(12));
  const report = { v: 1, at: Date.now(), hoy: '2030-01-14', app: 'prueba', tareas: [{ id: 'digi-prueba-1', titulo: 'Visita de prueba', fecha: '2030-01-15', hora: '08:30', hecha: true, deClaude: true }], lotes: [{ lote: msg.lote, aplicado: Date.now(), agregadas: 1, cambiadas: 0, movidas: 0, borradas: 0, saltadas: [] }] };
  const rct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: riv, additionalData: te.encode(`${PROTO}|app>pc|${key.lid}`) }, kOut, te.encode(JSON.stringify(report)));
  ok('el iPhone sube el informe', (await app('/mail/report', { id, body: `${b64u(riv)}.${b64u(rct)}` })).ok);
  const read = script('leer');
  ok('script: lee el informe descifrado', read.ok && /✅/.test(read.out) && /Visita de prueba/.test(read.out) && /\+1/.test(read.out));
  ok('script: leer --json', JSON.parse(script('leer', '--json').out).tareas[0].hecha === true);
  ok('script: estado', /enlazado y confirmado/.test(script('estado').out));

  // Tope de paquetes y desenlace.
  ok('el iPhone desenlaza', (await app('/link/remove', { id })).ok);
  ok('script: tras desenlazar, el token ya no sirve', !script('enviar', file).ok && (await pc('/pc/read', { token: key.token })).status === 401);
  ok('script: desenlazar borra la llave local', script('desenlazar').ok && !fs.existsSync(KEY));
  await app('/unsubscribe', { id });
  fs.rmSync(file); fs.rmSync(bad);
} catch (err) {
  console.log('ERROR', err);
  fails++;
} finally {
  if (fs.existsSync(KEY)) fs.rmSync(KEY);
}
console.log(fails ? `\n✖ ${fails} prueba(s) fallaron` : '\n✔ El buzón funciona de punta a punta en el servidor');
process.exit(fails ? 1 : 0);
