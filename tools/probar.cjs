// Prueba de humo: abre Rumbo en un Chrome real (sin ventana), recorre todas las
// pestañas y las hojas principales, y falla si aparece cualquier error.
//
//   node tools/probar.cjs
//
// La usa tools/publicar.cjs antes de publicar. Devuelve código 0 si todo está bien.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const PORT = 5199;
const DEBUG_PORT = 9399;
const BASE = `http://localhost:${PORT}`;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!CHROME) {
    console.log('⚠ No encontré Chrome ni Edge: se omite la prueba en navegador.');
    return true;
  }
  if (typeof WebSocket === 'undefined') {
    console.log('⚠ Esta versión de Node no trae WebSocket: se omite la prueba en navegador.');
    return true;
  }
  // Perfil temporal fuera de rutas cortas tipo CAMILO~1 (rompen la caché de Chrome).
  const profile = path.join(process.env.LOCALAPPDATA || os.tmpdir(), `rumbo-prueba-${Date.now()}`);
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), String(PORT)], { stdio: 'ignore' });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });

  const problems = [];
  let ws;
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) {
      await sleep(250);
      try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find(t => t.type === 'page'); } catch { /* aún no */ }
    }
    if (!target) throw new Error('Chrome no respondió');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', fail); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') problems.push(`Excepción: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`Consola: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
    });
    const send = (method, params = {}) => new Promise(ok => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) problems.push(`Prueba: ${r.result.exceptionDetails.exception?.description}`);
      return r.result?.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');

    // Datos de ejemplo (demo.html los carga) y luego la app directa.
    await send('Page.navigate', { url: `${BASE}/tools/demo.html?tab=hoy&theme=light&planned=0` });
    await sleep(1500);
    await send('Page.navigate', { url: `${BASE}/index.html#hoy` });
    await sleep(1500);

    const check = async label => {
      const r = await js(`(() => ({
        view: document.getElementById('view').children.length,
        error: !!document.querySelector('[data-key="view-error"]'),
      }))()`);
      if (!r || !r.view) problems.push(`${label}: la pantalla quedó vacía`);
      if (r && r.error) problems.push(`${label}: la pantalla mostró el aviso de error`);
    };
    const click = async (sel, wait = 450) => {
      const ok = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
      if (!ok) problems.push(`No encontré ${sel}`);
      await sleep(wait);
    };

    for (const tab of ['hoy', 'manana', 'pendientes', 'progreso', 'ajustes']) {
      await click(`#tabs [data-tab="${tab}"]`);
      await check(`Pestaña ${tab}`);
    }
    // Hojas y pantallas especiales.
    await click('#tabs [data-tab="hoy"]');
    await click('#fab', 600);
    await js(`(() => { const b = document.querySelector('.sheet .compose'); b.value = 'Prueba mañana 7pm por 1h #salud !'; b.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await click('.sheet [data-action="add-submit"].btn');
    await click('.sheet [data-action="sheet-close"]', 700);
    await click('#view .row .task-main', 700);
    await click('.sheet [data-action="sheet-close"]', 700);
    await click('[data-action="focus-open"]', 600);
    await click('.focus-top [data-action="focus-stop"]', 600);
    await click('#tabs [data-tab="ajustes"]');
    await click('[data-guide="block"]', 600);
    await click('.sheet [data-action="sheet-close"]', 700);
    await click('[data-action="routine"][data-rid=""]', 600);
    await click('.sheet [data-action="sheet-close"]', 700);
    await click('[data-action="ics-fixed"]', 600);
    await click('.sheet [data-action="sheet-close"]', 700);
    await click('#tabs [data-tab="progreso"]');
    await click('[data-action="range"][data-value="30"]');
    await check('Progreso (mes)');
  } catch (err) {
    problems.push(`La prueba no pudo correr: ${err.message}`);
  } finally {
    try { ws?.close(); } catch { /* nada */ }
    chrome.kill();
    server.kill();
    await sleep(600);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome aún cerrando */ }
  }

  if (problems.length) {
    console.error('\n✖ La prueba en navegador encontró problemas:');
    for (const p of [...new Set(problems)]) console.error(`  • ${p}`);
    return false;
  }
  console.log('✔ Prueba en navegador: todas las pestañas y hojas funcionan.');
  return true;
}

if (require.main === module) main().then(ok => process.exit(ok ? 0 : 1));
module.exports = { probar: main };
