// Fotos del diario: se guardan en IndexedDB (no caben en localStorage), solo en este teléfono.
// Cada día tiene una foto grande (lado mayor de 1600 px) y, en otro almacén, una miniatura
// cuadrada de 360 px (para que el mosaico no tenga que leer las fotos grandes).
// En el estado solo queda una marca (journal[fecha].photo = cuándo se guardó).

import { crc32 } from './zip.js';

const DB = 'rumbo-fotos';
const FULL = 1600, THUMB = 360;

let dbp = null;
function db() {
  return dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('photos'); // fecha → { full: Blob, size, crc, w, h, at }
      req.result.createObjectStore('thumbs'); // fecha → Blob
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
}
// Una transacción sobre uno o los dos almacenes; termina cuando IndexedDB confirma.
async function tx(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const r = fn(...[].concat(stores).map(s => t.objectStore(s)));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('abort'));
  });
}

/* ---------- Procesar la imagen ---------- */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}
// Dibuja en un lienzo, lo pasa a JPEG y libera el lienzo enseguida
// (iOS limita la memoria total de los lienzos: sin liberarlos, a las decenas de fotos fallan).
function drawJpeg(w, h, q, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  paint(g);
  return new Promise((resolve, reject) => c.toBlob(b => {
    c.width = c.height = 0;
    b ? resolve(b) : reject(new Error('jpeg'));
  }, 'image/jpeg', q));
}

// original: bytes JPEG tal cual (al restaurar una copia); si ya tienen el tamaño correcto, no se recomprimen.
async function encode(img, original = null) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, FULL / Math.max(w, h));
  const bw = Math.round(w * s), bh = Math.round(h * s);
  const keep = original && s === 1;
  const full = keep ? new Blob([original], { type: 'image/jpeg' }) : await drawJpeg(bw, bh, 0.8, g => g.drawImage(img, 0, 0, bw, bh));
  const side = Math.min(w, h);
  const thumb = await drawJpeg(THUMB, THUMB, 0.75, g => g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, THUMB, THUMB));
  // El CRC se calcula una sola vez aquí: así la copia de seguridad no tiene que leer las fotos a memoria.
  const crc = crc32(keep ? original : new Uint8Array(await full.arrayBuffer()));
  return { rec: { full, size: full.size, crc, w: bw, h: bh, at: Date.now() }, thumb };
}
const put = (k, { rec, thumb }) => tx(['photos', 'thumbs'], 'readwrite', (p, t) => { p.put(rec, k); t.put(thumb, k); });

// Pide que iOS no borre el almacenamiento de Rumbo si el iPhone se queda sin espacio.
let persisted = false;
function persist() {
  if (persisted) return;
  persisted = true;
  navigator.storage?.persist?.().catch(() => {});
}

export async function savePhoto(k, file) {
  const enc = await encode(await loadImage(file));
  await put(k, enc);
  forget(k);
  persist();
  return enc.rec.at;
}
export async function deletePhoto(k) {
  await tx(['photos', 'thumbs'], 'readwrite', (p, t) => { p.delete(k); t.delete(k); });
  forget(k);
}
export async function clearPhotos() {
  await tx(['photos', 'thumbs'], 'readwrite', (p, t) => { p.clear(); t.clear(); });
  resetCache();
}
export const photoKeys = () => tx('photos', 'readonly', s => s.getAllKeys()).then(keys => keys.filter(k => typeof k === 'string'));
export const getPhoto = k => tx('photos', 'readonly', s => s.get(k));

/* ---------- Para mostrarlas: URLs en memoria, cargadas bajo demanda ---------- */
const MAX_URLS = 160;         // se liberan las más viejas para no llenar la memoria del iPhone
const urls = new Map();       // "fecha|thumb" → blob: URL ('' si no existe)
const loading = new Map();    // "fecha|size" → número de carga (para descartar cargas viejas)
let gen = 0;
let onReady = () => {};
let readyTimer = null;
export function onPhotosReady(fn) { onReady = fn; }

function drop(key) {
  if (urls.get(key)) URL.revokeObjectURL(urls.get(key));
  urls.delete(key);
  loading.delete(key);
}
function forget(k) { drop(`${k}|thumb`); drop(`${k}|full`); }
function resetCache() {
  for (const key of [...urls.keys()]) drop(key);
  loading.clear();
  gen++;
  onReady();
}

// Devuelve la URL si ya está cargada; si no, la carga y avisa para volver a dibujar.
export function photoURL(k, size = 'thumb') {
  const key = `${k}|${size}`;
  if (urls.has(key)) {
    const u = urls.get(key);
    urls.delete(key); urls.set(key, u); // la más usada pasa al final
    return u;
  }
  if (!loading.has(key)) {
    const mine = gen;
    loading.set(key, mine);
    const read = size === 'thumb' ? tx('thumbs', 'readonly', s => s.get(k)) : getPhoto(k).then(r => r?.full);
    read.then(blob => {
      if (gen !== mine || loading.get(key) !== mine) return; // llegó tarde: la foto cambió mientras tanto
      urls.set(key, blob instanceof Blob ? URL.createObjectURL(blob) : '');
      while (urls.size > MAX_URLS) drop(urls.keys().next().value);
    }).catch(() => urls.set(key, '')).finally(() => {
      if (loading.get(key) === mine) loading.delete(key);
      clearTimeout(readyTimer);
      readyTimer = setTimeout(() => onReady(), 30);
    });
  }
  return '';
}
export const photoMissing = (k, size = 'thumb') => urls.get(`${k}|${size}`) === '';

/* ---------- Copias de seguridad ---------- */
// Solo los datos para el ZIP (las fotos van como Blob: no se cargan todas a memoria).
export async function exportPhotos() {
  const out = [];
  for (const k of await photoKeys()) {
    const rec = await getPhoto(k);
    if (rec?.full instanceof Blob) out.push({ k, blob: rec.full, crc: rec.crc, size: rec.size });
  }
  return out;
}
// Restaura las fotos de una copia: escribe cada una (las miniaturas se regeneran) y solo
// al final borra las que la copia no trae. Devuelve cuántas se restauraron.
export async function importPhotos(entries) {
  let n = 0;
  const keep = new Set();
  gen++;
  for (const { k, data } of entries) {
    keep.add(k);
    try {
      await put(k, await encode(await loadImage(new Blob([data], { type: 'image/jpeg' })), data));
      n++;
    } catch { /* foto dañada: se salta y se avisa al final */ }
  }
  for (const k of await photoKeys()) if (!keep.has(k)) await deletePhoto(k);
  resetCache();
  persist();
  return n;
}
