// Pruebas del cifrado y la firma de Web Push:  npm test   (dentro de server/)
import { encryptPayload, vapidAuth, b64u, fromB64u } from '../src/webpush.js';

let fails = 0;
const ok = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) fails++; };
const dec = new TextDecoder();

// Convierte un par (privada "d" + pública sin comprimir) en claves WebCrypto ECDH.
async function ecdhPair(dB64, pubB64) {
  const pub = fromB64u(pubB64);
  const jwk = { kty: 'EC', crv: 'P-256', d: dB64, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// Descifra como lo haría el iPhone (implementación independiente del lado receptor).
async function decrypt(body, uaKeys, uaPublicB64, authB64) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const te = new TextEncoder();
  const keyInfo = new Uint8Array([...te.encode('WebPush: info\0'), ...fromB64u(uaPublicB64), ...asPublic]);
  const ikm = await hkdf(fromB64u(authB64), ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;          // relleno
  return { text: dec.decode(plain.slice(0, end)), delimiter: plain[end] };
}

// 1. Ejemplo oficial del RFC 8291 (sección 5): mismos datos → exactamente los mismos bytes.
{
  const RFC = {
    plaintext: 'When I grow up, I want to be a watermelon',
    asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  };
  const asKeys = await ecdhPair(RFC.asPrivate, RFC.asPublic);
  const body = await encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, RFC.plaintext, { asKeys, salt: fromB64u(RFC.salt) });
  ok('RFC 8291: el mensaje cifrado coincide byte a byte con el ejemplo oficial', b64u(body) === RFC.body);
}

// 2. Ida y vuelta con claves nuevas: lo que cifra el servidor, el teléfono lo descifra.
{
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = b64u(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const msg = JSON.stringify({ k: 'tarea', e: 'iv.cifrado' }) + ' ¡ñ 💧';
  const body = await encryptPayload({ p256dh: uaPublic, auth }, msg);
  const out = await decrypt(body, ua, uaPublic, auth);
  ok('ida y vuelta: el teléfono recupera el mismo texto (con tildes y emoji)', out.text === msg);
  ok('ida y vuelta: delimitador de último registro (0x02)', out.delimiter === 2);
  ok('encabezado: tamaño de registro 4096 y clave de 65 bytes', new DataView(body.buffer).getUint32(16) === 4096 && body[20] === 65);
  const body2 = await encryptPayload({ p256dh: uaPublic, auth }, msg);
  ok('cada envío usa claves y sal nuevas (dos cifrados distintos)', b64u(body) !== b64u(body2));
}

// 3. Firma VAPID: un JWT ES256 válido, verificable con la clave pública.
{
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64u(await crypto.subtle.exportKey('raw', k.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  const header = await vapidAuth('https://web.push.apple.com/QGuQyavXutnMHDy7/abc', { publicKey, privateJwk, subject: 'https://piragua-acuatico.github.io/Rumbo/' });
  const [, jwt, key] = header.match(/^vapid t=([^,]+), k=(.+)$/) || [];
  ok('VAPID: formato "vapid t=…, k=…"', !!jwt && key === publicKey);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(dec.decode(fromB64u(c)));
  ok('VAPID: aud es el origen del servicio de Apple', claims.aud === 'https://web.push.apple.com');
  const now = Date.now() / 1000;
  ok('VAPID: vence en 12 h (Apple exige menos de 24 h)', claims.exp > now + 11 * 3600 && claims.exp <= now + 12 * 3600 + 5);
  ok('VAPID: sub es la URL de la app', claims.sub === 'https://piragua-acuatico.github.io/Rumbo/');
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.publicKey, fromB64u(s), new TextEncoder().encode(`${h}.${c}`));
  ok('VAPID: la firma es válida', valid);
}

console.log(fails ? `\n✖ ${fails} prueba(s) fallaron` : '\n✔ Cifrado y firma correctos');
process.exit(fails ? 1 : 0);
