// Buzón con Claude — el lado del PC.
// Claude lo usa para poner, cambiar o borrar tareas en el Rumbo de Camilo y para leer cómo van.
// Todo va cifrado de punta a punta con el iPhone (mismo protocolo que js/buzon.js).
//
//   node tools/buzon.cjs enlazar ABCD-EFGH     enlaza este PC con el iPhone (código de Perfil › Claude)
//   node tools/buzon.cjs enviar cambios.json   manda tareas (ver "formato")
//   node tools/buzon.cjs probar cambios.json   revisa el archivo sin mandar nada
//   node tools/buzon.cjs leer [--json]         el informe del iPhone: tareas de Digiízate y lotes aplicados
//   node tools/buzon.cjs estado                si está enlazado, paquetes sin recoger, número de seguridad
//   node tools/buzon.cjs desenlazar            borra el enlace (en el servidor y en este PC)
//   node tools/buzon.cjs formato               explica el formato del archivo
//
// La llave de este PC vive FUERA del repositorio, en %APPDATA%\Rumbo\buzon-llave.json
// (o ~/.rumbo/buzon-llave.json). Nunca la muestres ni la copies al repo: con ella se pueden tocar
// las tareas de Digiízate de Camilo. Variables para pruebas: RUMBO_LLAVE (ruta) y RUMBO_SERVIDOR.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { webcrypto: crypto } = require('crypto');

const SERVER = (process.env.RUMBO_SERVIDOR || 'https://rumbo-avisos.rumbo.workers.dev').replace(/\/$/, '');
const KEY_FILE = process.env.RUMBO_LLAVE || (process.platform === 'win32' && process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Rumbo', 'buzon-llave.json')
  : path.join(os.homedir(), '.rumbo', 'buzon-llave.json'));
const PROTO = 'rumbo-buzon/1';
const RE_CID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const RE_RID = /^r:[a-z0-9]{1,40}$/i;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ['personal', 'trabajo', 'estudio', 'salud', 'hogar', 'digiizate'];
const te = new TextEncoder(), td = new TextDecoder();

const fail = msg => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const b64u = bytes => Buffer.from(new Uint8Array(bytes)).toString('base64url');
const fromB64u = s => new Uint8Array(Buffer.from(String(s), 'base64url'));
const join = (...parts) => new Uint8Array(Buffer.concat(parts.map(p => Buffer.from(p))));
const EC = { name: 'ECDH', namedCurve: 'P-256' };

/* ---------- Cifrado (igual que js/buzon.js, con los papeles al revés) ---------- */
async function boxKey(k, dir, usage) {
  const priv = await crypto.subtle.importKey('jwk', k.priv, EC, false, ['deriveBits']);
  const other = await crypto.subtle.importKey('raw', fromB64u(k.appPub), EC, false, []);
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: other }, priv, 256);
  const salt = await crypto.subtle.digest('SHA-256', join(fromB64u(k.appPub), fromB64u(k.pub)));
  const hk = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(`${PROTO} ${dir}`) }, hk, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function seal(key, obj, dir, lid) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`${PROTO}|${dir}|${lid}`) }, key, te.encode(JSON.stringify(obj)));
  return `${b64u(iv)}.${b64u(ct)}`;
}
async function unseal(key, box, dir, lid) {
  const [iv, ct] = String(box).split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: te.encode(`${PROTO}|${dir}|${lid}`) }, key, fromB64u(ct));
  return JSON.parse(td.decode(plain));
}
async function safetyNumber(appPub, pcPub) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', join(te.encode(`${PROTO} numero`), fromB64u(appPub), fromB64u(pcPub))));
  const s = String((d[0] * 2 ** 24 + d[1] * 2 ** 16 + d[2] * 2 ** 8 + d[3]) % 1e6).padStart(6, '0');
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}

/* ---------- Llave y servidor ---------- */
function loadKey() {
  if (!fs.existsSync(KEY_FILE)) fail('Este PC no está enlazado. Pídele a Camilo el código (Rumbo › Perfil › Claude › Enlazar) y corre:\n  node tools/buzon.cjs enlazar ABCD-EFGH');
  try { return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')); } catch { fail(`No pude leer la llave (${KEY_FILE}).`); }
}
function saveKey(k) {
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify(k, null, 2), { mode: 0o600 });
}
async function api(route, body) {
  let res;
  try {
    res = await fetch(SERVER + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) { fail(`No pude conectar con el servidor (${SERVER}): ${err.cause?.code || err.message}`); }
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 403 && data.error === 'origen no permitido') fail('El servidor todavía no tiene el buzón: falta publicarlo (npx wrangler deploy en server/).');
  if (res.status === 404 && data.error === 'ruta') fail('El servidor todavía no tiene el buzón: falta publicarlo (npx wrangler deploy en server/).');
  return { ok: res.ok, status: res.status, data };
}

/* ---------- Fechas para mostrar ---------- */
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const localKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayText = k => { const d = new Date(`${k}T12:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const hourText = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const agoText = ms => {
  if (!ms) return 'nunca';
  const min = Math.round((Date.now() - ms) / 60000);
  const when = new Date(ms);
  const abs = `${dayText(localKey(when))}, ${hourText(`${when.getHours()}:${when.getMinutes()}`)}`;
  if (min < 1) return `hace un momento (${abs})`;
  if (min < 60) return `hace ${min} min (${abs})`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h (${abs})`;
  return `hace ${Math.round(min / 1440)} días (${abs})`;
};

/* ---------- Archivo de cambios → operaciones ---------- */
const FORMAT = `
Formato del archivo (JSON, UTF-8):

{
  "nota": "Visitas de la semana del 17 de noviembre",          (opcional, sale en el iPhone)
  "tareas": [                                                  (poner: crea o actualiza)
    {
      "id": "digi-visita-esquina-17nov",   nombre fijo: minúsculas, números y guiones (2 a 64).
                                           El mismo id actualiza la misma tarea: nunca duplica.
                                           Para una tarea de Digiízate que creó Camilo, usa
                                           el id que sale en "leer" (empieza con "r:").
      "titulo": "Visita tienda La Esquina", obligatorio al crear; máx. 300 caracteres
      "fecha": "2026-11-17",               AAAA-MM-DD, o null para Pendientes (sin fecha)
      "hora": "08:30",                     24 h HH:MM, o null (sin hora)
      "duracion": 60,                      minutos (5 a 1440), o null
      "importante": true,                  opcional
      "categoria": "digiizate",            por defecto digiizate al crear. Otras: ${CATEGORIES.join(', ')}, o null
      "notas": "Llevar volantes",          opcional, máx. 5000 caracteres
      "forzar": false                      true = cambiarla aunque Camilo ya la hizo o la cambió (solo si él lo pide)
    }
  ],
  "borrar": ["digi-visita-vieja", { "id": "digi-otra", "forzar": true }]
}

Al actualizar, solo cambian los campos que vengan; lo demás queda como está.
Rumbo NO toca una tarea si Camilo ya la marcó como hecha o si la cambió él (sale en "leer"
como cambiadoPorCamilo), salvo con "forzar". Los avisos de Digiízate llegan a la hora y 1 h antes.
Se aplica cuando Camilo abre Rumbo (le llega un aviso). Puede deshacerlo durante 24 horas.`;

function validTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
function validDate(v) {
  if (!RE_DATE.test(v)) return false;
  const d = new Date(`${v}T12:00`);
  return !isNaN(d) && localKey(d) === v;
}

function buildOps(file) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (err) { fail(`No pude leer ${file} como JSON: ${err.message}`); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('El archivo debe ser un objeto JSON con "tareas" y/o "borrar".');
  const errors = [], warnings = [], ops = [], seen = new Set(), untitled = [];
  const today = localKey();
  const known = new Set(['id', 'titulo', 'fecha', 'hora', 'duracion', 'importante', 'categoria', 'notas', 'forzar']);
  const checkId = (id, where) => {
    if (typeof id !== 'string' || !(RE_CID.test(id) || RE_RID.test(id))) { errors.push(`${where}: id inválido (${JSON.stringify(id)}). Usa minúsculas, números y guiones.`); return false; }
    if (seen.has(id)) { errors.push(`${where}: el id "${id}" está repetido.`); return false; }
    seen.add(id);
    return true;
  };
  for (const k of Object.keys(doc)) if (!['nota', 'tareas', 'borrar'].includes(k)) errors.push(`Campo desconocido en el archivo: "${k}".`);
  if (doc.nota != null && typeof doc.nota !== 'string') errors.push('"nota" debe ser texto.');
  const tareas = doc.tareas ?? [];
  const borrar = doc.borrar ?? [];
  if (!Array.isArray(tareas)) errors.push('"tareas" debe ser una lista.');
  if (!Array.isArray(borrar)) errors.push('"borrar" debe ser una lista.');

  (Array.isArray(tareas) ? tareas : []).forEach((t, i) => {
    const where = `tareas[${i}]${t && typeof t.titulo === 'string' ? ` («${t.titulo.slice(0, 40)}»)` : ''}`;
    if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(`${where}: debe ser un objeto.`); return; }
    if (!checkId(t.id, where)) return;
    for (const k of Object.keys(t)) if (!known.has(k)) errors.push(`${where}: campo desconocido "${k}".`);
    const op = { op: 'poner', id: t.id };
    if ('titulo' in t) {
      if (typeof t.titulo !== 'string' || !t.titulo.trim()) errors.push(`${where}: "titulo" vacío.`);
      else if (t.titulo.trim().length > 300) errors.push(`${where}: "titulo" pasa de 300 caracteres.`);
      else op.titulo = t.titulo.trim();
    } else if (!RE_RID.test(t.id)) untitled.push(t.id);
    if ('fecha' in t) {
      if (t.fecha !== null && !(typeof t.fecha === 'string' && validDate(t.fecha))) errors.push(`${where}: "fecha" debe ser AAAA-MM-DD (o null).`);
      else {
        op.fecha = t.fecha;
        if (t.fecha && t.fecha < today) warnings.push(`${where}: la fecha ${t.fecha} ya pasó (saldrá como atrasada).`);
      }
    }
    if ('hora' in t) {
      const h = t.hora === null ? null : typeof t.hora === 'string' ? validTime(t.hora) : undefined;
      if (h === undefined || (t.hora !== null && !h)) errors.push(`${where}: "hora" debe ser HH:MM en 24 h, como "08:30" o "15:00" (o null).`);
      else op.hora = h;
      if (h && t.fecha === null) warnings.push(`${where}: tiene hora pero no fecha; la hora se ignora.`);
    }
    if ('duracion' in t) {
      if (t.duracion !== null && !(Number.isInteger(t.duracion) && t.duracion >= 5 && t.duracion <= 1440)) errors.push(`${where}: "duracion" debe ser minutos enteros entre 5 y 1440 (o null).`);
      else op.duracion = t.duracion;
    }
    if ('importante' in t) {
      if (typeof t.importante !== 'boolean') errors.push(`${where}: "importante" debe ser true o false.`);
      else op.importante = t.importante;
    }
    if ('categoria' in t) {
      if (t.categoria !== null && !CATEGORIES.includes(t.categoria)) errors.push(`${where}: "categoria" debe ser una de: ${CATEGORIES.join(', ')} (o null).`);
      else op.categoria = t.categoria;
    }
    if ('notas' in t) {
      if (t.notas !== null && typeof t.notas !== 'string') errors.push(`${where}: "notas" debe ser texto.`);
      else if ((t.notas || '').length > 5000) errors.push(`${where}: "notas" pasa de 5000 caracteres.`);
      else op.notas = t.notas;
    }
    if ('forzar' in t) {
      if (typeof t.forzar !== 'boolean') errors.push(`${where}: "forzar" debe ser true o false.`);
      else if (t.forzar) op.forzar = true;
    }
    ops.push(op);
  });
  (Array.isArray(borrar) ? borrar : []).forEach((b, i) => {
    const where = `borrar[${i}]`;
    const id = typeof b === 'string' ? b : b?.id;
    if (!checkId(id, where)) return;
    if (b && typeof b === 'object' && Object.keys(b).some(k => !['id', 'forzar'].includes(k))) errors.push(`${where}: solo admite "id" y "forzar".`);
    ops.push({ op: 'borrar', id, ...(b && typeof b === 'object' && b.forzar === true ? { forzar: true } : {}) });
  });
  if (untitled.length) warnings.push(`Sin "titulo" (solo actualizan; si la tarea no existe, el iPhone la salta): ${untitled.join(', ')}`);
  if (!ops.length && !errors.length) errors.push('El archivo no trae tareas ni nada que borrar.');
  if (ops.length > 300) errors.push(`Son ${ops.length} operaciones; el máximo por envío es 300.`);
  return { ops, errors, warnings, nota: typeof doc.nota === 'string' ? doc.nota.slice(0, 200) : '' };
}

function showCheck({ ops, errors, warnings }) {
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (errors.length) {
    console.error(`\n✖ El archivo tiene ${errors.length === 1 ? 'un error' : `${errors.length} errores`} (no se mandó nada):`);
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  const poner = ops.filter(o => o.op === 'poner').length, borrar = ops.length - poner;
  return [poner ? `${poner} para poner` : '', borrar ? `${borrar} para borrar` : ''].filter(Boolean).join(' y ');
}

/* ---------- Comandos ---------- */
async function enlazar(code, force) {
  if (!code) fail('Falta el código. Ejemplo: node tools/buzon.cjs enlazar ABCD-EFGH');
  if (fs.existsSync(KEY_FILE) && !force) fail(`Este PC ya está enlazado (${KEY_FILE}).\nPara enlazar de nuevo: node tools/buzon.cjs desenlazar   (o añade --forzar)`);
  // 1) Canjear el código: el servidor da el permiso y la HUELLA de la llave del iPhone (no la llave).
  const r = await api('/pc/claim', { code });
  if (!r.ok) fail(r.status === 404 ? 'Código inválido o vencido (dura 10 minutos). Pídele a Camilo uno nuevo.' : `El servidor respondió ${r.status}: ${r.data.error || ''}`);
  // 2) Recién con la huella guardada se crea y se manda la llave de este PC.
  const kp = await crypto.subtle.generateKey(EC, true, ['deriveBits']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const k = { server: SERVER, lid: r.data.lid, token: r.data.token, commit: r.data.commit, appPub: null, pub, priv: await crypto.subtle.exportKey('jwk', kp.privateKey), linkedAt: Date.now(), seq: 0 };
  saveKey(k);
  const kr = await api('/pc/key', { token: k.token, pub });
  if (!kr.ok) fail(`El servidor no aceptó la llave (${kr.status}: ${kr.data.error || ''}).`);
  // 3) Esperar a que el iPhone revele su llave (lo hace solo, si Rumbo está abierta en Perfil › Claude).
  console.log('\nCódigo aceptado. Esperando a que el iPhone revele su llave (deja Rumbo abierta)…');
  for (let i = 0; i < 90 && !k.appPub; i++) {
    await new Promise(res => setTimeout(res, 2000));
    await completeLink(k, true);
  }
  console.log(`✔ Enlazado. Llave guardada en ${KEY_FILE} (fuera del repositorio).`);
  if (!k.appPub) {
    console.log('\nEl iPhone todavía no responde. Cuando Camilo abra Rumbo, corre: node tools/buzon.cjs estado (ahí sale el número).\n');
    return;
  }
  console.log(`\n   Número de seguridad:  ${await safetyNumber(k.appPub, k.pub)}\n`);
  console.log('Dile a Camilo que lo compare con el de su iPhone y toque «Sí, coincide».');
  console.log('Hasta que confirme, el servidor no acepta envíos.\n');
}

// Trae la llave del iPhone si ya la reveló, y comprueba que corresponde a la huella recibida al canjear.
async function completeLink(k, quiet = false) {
  if (k.appPub) return true;
  const r = await api('/pc/read', { token: k.token });
  if (r.status === 401) fail('El enlace ya no existe (¿Camilo desenlazó o canceló?). Corre "desenlazar" y enlaza de nuevo.');
  const appPub = r.ok ? r.data.appPub : null;
  if (!appPub) { if (!quiet) fail('El iPhone todavía no revela su llave: que Camilo abra Rumbo › Perfil › Claude.'); return false; }
  const commit = b64u(await crypto.subtle.digest('SHA-256', join(te.encode(`${PROTO} compromiso`), fromB64u(appPub))));
  if (commit !== k.commit) fail('¡ALERTA! La llave del iPhone no corresponde a su huella: alguien pudo meterse en el medio. No uses este enlace: corre "desenlazar" y avísale a Camilo.');
  k.appPub = appPub;
  saveKey(k);
  return true;
}

async function enviar(file, onlyCheck) {
  if (!file) fail('Falta el archivo. Ejemplo: node tools/buzon.cjs enviar cambios.json');
  const built = buildOps(file);
  const what = showCheck(built);
  // Tamaño aproximado del paquete cifrado (base64 suma un tercio).
  const approx = Math.ceil(Buffer.byteLength(JSON.stringify({ v: 1, lote: 'x'.repeat(12), seq: Date.now(), at: Date.now(), nota: built.nota, ops: built.ops })) * 4 / 3) + 60;
  if (approx > 118000) fail(`El envío es demasiado grande (~${approx} caracteres cifrados; el máximo es 120 000). Pártelo en dos archivos.`);
  if (onlyCheck) { console.log(`\n✔ El archivo está bien: ${what}. (No se mandó nada.)\n`); return; }
  const k = loadKey();
  await completeLink(k);
  const lote = b64u(crypto.getRandomValues(new Uint8Array(9)));
  // Número que solo sube: el iPhone descarta paquetes repetidos o que lleguen fuera de orden.
  const seq = Math.max(Date.now(), (Number(k.seq) || 0) + 1);
  const body = await seal(await boxKey(k, 'pc>app', 'encrypt'), { v: 1, lote, seq, at: Date.now(), nota: built.nota, ops: built.ops }, 'pc>app', k.lid);
  k.seq = seq;
  saveKey(k);
  const r = await api('/pc/send', { token: k.token, body });
  if (!r.ok) fail(r.status === 401 ? 'El enlace ya no existe (¿Camilo desenlazó desde el iPhone?). Hay que enlazar de nuevo.' : `No se mandó: ${r.data.error || `error ${r.status}`}`);
  console.log(`\n✔ Enviado (lote ${lote}): ${what}.`);
  console.log(r.data.notified ? '  A Camilo le llegó el aviso «Claude actualizó tu agenda».' : '  (Sin aviso al iPhone esta vez: ya se mandó uno hace menos de un minuto, o las notificaciones no están activas.)');
  console.log(`  Se aplica cuando abra Rumbo. Paquetes esperando: ${r.data.pending}. Revisa después con: node tools/buzon.cjs leer\n`);
}

async function leer(asJson) {
  const k = loadKey();
  await completeLink(k);
  const r = await api('/pc/read', { token: k.token });
  if (!r.ok) fail(r.status === 401 ? 'El enlace ya no existe (¿Camilo desenlazó desde el iPhone?). Hay que enlazar de nuevo.' : `Error ${r.status}: ${r.data.error || ''}`);
  const d = r.data;
  if (!d.report) {
    console.log(`\nTodavía no hay informe. ${d.confirmed ? 'Llega la próxima vez que Camilo abra Rumbo.' : 'Camilo aún no confirma el número de 6 dígitos.'}\n`);
    return;
  }
  let rep;
  try { rep = await unseal(await boxKey(k, 'app>pc', 'decrypt'), d.report, 'app>pc', k.lid); } catch { fail('No pude descifrar el informe (¿se enlazó otro PC después?).'); }
  if (asJson) { console.log(JSON.stringify({ ...rep, servidor: { informe: d.reportAt, revisoBuzon: d.seenAt, paquetesSinRecoger: d.pending } }, null, 2)); return; }

  console.log(`\nInforme del iPhone · ${agoText(rep.at)} · Rumbo ${rep.app || '?'}`);
  console.log(`El iPhone revisó el buzón ${agoText(d.seenAt)}. Paquetes sin recoger: ${d.pending}.`);
  const tareas = Array.isArray(rep.tareas) ? rep.tareas : [];
  const hechas = tareas.filter(t => t.hecha).length;
  console.log(`\nTareas (${tareas.length}, ${hechas} hechas):`);
  const today = localKey();
  let lastDay = null;
  for (const t of tareas) {
    const day = t.fecha || 'sin fecha';
    if (day !== lastDay) { console.log(`  ${t.fecha ? `${dayText(t.fecha)}${t.fecha === today ? ' (hoy)' : ''}` : 'Pendientes (sin fecha)'}`); lastDay = day; }
    const flags = [t.importante ? '★' : '', t.fecha && t.fecha < today && !t.hecha ? 'ATRASADA' : '', t.cambiadoPorCamilo ? `cambiada por Camilo: ${t.cambiadoPorCamilo.join(', ')}` : '', t.deClaude ? '' : 'creada por Camilo'].filter(Boolean).join(' · ');
    console.log(`    ${t.hecha ? '✅' : '⬜'} ${t.hora ? hourText(t.hora).padEnd(10) : ''.padEnd(10)} ${t.titulo}  [${t.id}]${flags ? `  ${flags}` : ''}`);
  }
  if (rep.recortado) console.log('  (El informe se recortó para caber: faltan las tareas más viejas.)');
  const quitadas = Array.isArray(rep.quitadasPorCamilo) ? rep.quitadasPorCamilo : [];
  if (quitadas.length) console.log(`\nQuitadas por Camilo (no se vuelven a crear salvo con "forzar"): ${quitadas.join(', ')}`);
  const lotes = Array.isArray(rep.lotes) ? rep.lotes : [];
  if (lotes.length) {
    console.log('\nÚltimos lotes aplicados:');
    for (const l of lotes.slice().reverse()) {
      if (l.error) { console.log(`  ✖ ${l.lote}: ${l.error}`); continue; }
      const c = [l.agregadas && `+${l.agregadas}`, l.movidas && `${l.movidas} movidas`, l.cambiadas && `${l.cambiadas} cambiadas`, l.borradas && `${l.borradas} borradas`].filter(Boolean).join(', ') || 'sin cambios';
      console.log(`  ${l.deshecho ? `↩ DESHECHO${l.respetadas ? ` (salvo ${l.respetadas} que Camilo ya había tocado)` : ''} · ` : ''}${agoText(l.aplicado)} · ${l.nota ? `«${l.nota}» · ` : ''}${c}`);
      for (const s of l.saltadas || []) console.log(`      saltada ${s.id}: ${s.motivo}`);
      if (l.saltadasTotal) console.log(`      … ${l.saltadasTotal} saltadas en total`);
    }
  }
  console.log('');
}

async function estado() {
  console.log(`\nServidor: ${SERVER}\nLlave: ${KEY_FILE}`);
  if (!fs.existsSync(KEY_FILE)) { console.log('Estado: no enlazado.\n'); return; }
  const k = loadKey();
  const r = await api('/pc/read', { token: k.token });
  if (r.status === 401) { console.log('Estado: el enlace ya no existe en el servidor (¿Camilo desenlazó?). Corre "desenlazar" y enlaza de nuevo.\n'); return; }
  if (!r.ok) fail(`Error ${r.status}: ${r.data.error || ''}`);
  const revealed = await completeLink(k, true);
  console.log(`Estado: ${r.data.confirmed ? 'enlazado y confirmado ✔' : revealed ? 'esperando que Camilo confirme el número en el iPhone' : 'esperando que el iPhone revele su llave (Rumbo abierta en Perfil › Claude)'}`);
  if (revealed) console.log(`Número de seguridad: ${await safetyNumber(k.appPub, k.pub)}`);
  console.log(`Enlazado ${agoText(k.linkedAt)}. El iPhone revisó el buzón ${agoText(r.data.seenAt)}. Último informe: ${agoText(r.data.reportAt)}.`);
  console.log(`Paquetes sin recoger: ${r.data.pending}.\n`);
}

async function desenlazar() {
  if (!fs.existsSync(KEY_FILE)) { console.log('\nEste PC no estaba enlazado.\n'); return; }
  const k = loadKey();
  const r = await api('/pc/remove', { token: k.token });
  fs.rmSync(KEY_FILE);
  console.log(`\n✔ Desenlazado${r.ok ? '' : ' en este PC (en el servidor ya no existía)'}. Se borró la llave.\n`);
}

(async () => {
  const [cmd, arg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
  if (typeof fetch !== 'function') fail('Hace falta Node 18 o más nuevo.');
  switch (cmd) {
    case 'enlazar': return enlazar(arg, flags.includes('--forzar'));
    case 'enviar': return enviar(arg, false);
    case 'probar': return enviar(arg, true);
    case 'leer': return leer(flags.includes('--json'));
    case 'estado': return estado();
    case 'desenlazar': return desenlazar();
    case 'formato': console.log(FORMAT); return;
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 16).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
})().catch(err => fail(err.stack || String(err)));
