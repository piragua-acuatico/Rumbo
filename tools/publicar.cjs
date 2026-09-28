// Publica Rumbo: revisa el código, sube la versión y lo envía a GitHub.
// GitHub Pages lo publica en ~1 minuto y el iPhone se actualiza solo al abrir la app.
//
//   node tools/publicar.cjs "qué cambió"
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const rel = p => path.join(root, p);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = msg => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

// 0. Antes de tocar nada: ¿hay repositorio y está conectado a GitHub?
try { git('rev-parse', '--is-inside-work-tree'); } catch { fail('Esta carpeta todavía no es un repositorio de git.'); }
let remote = '';
try { remote = git('remote', 'get-url', 'origin'); } catch { fail('Falta conectar el repositorio de GitHub (git remote add origin …).'); }

// 1. Todo el JavaScript debe compilar antes de publicar.
const jsFiles = [
  ...fs.readdirSync(rel('js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
  ...fs.readdirSync(rel('js/views')).filter(f => f.endsWith('.js')).map(f => `js/views/${f}`),
];
for (const f of [...jsFiles, 'sw.js']) {
  try { execFileSync(process.execPath, ['--check', rel(f)], { stdio: 'pipe' }); }
  catch (e) { fail(`Error de sintaxis en ${f}:\n${e.stderr}`); }
}

// 1b. Prueba en un navegador real: si alguna pantalla falla, no se publica.
try { execFileSync(process.execPath, [path.join(__dirname, 'probar.cjs')], { cwd: root, stdio: 'inherit' }); }
catch { fail('No se publicó porque la prueba en navegador encontró problemas.'); }

// 2. Nueva versión (sube el último número: 2.1.0 → 2.1.1).
const versionFile = fs.readFileSync(rel('js/version.js'), 'utf8');
const current = versionFile.match(/VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!current) fail('No encontré la versión en js/version.js');
const next = `${current[1]}.${current[2]}.${Number(current[3]) + 1}`;
fs.writeFileSync(rel('js/version.js'), versionFile.replace(current[0], `VERSION = '${next}'`));

// 3. Lista de archivos que el service worker guarda para funcionar sin internet.
const assets = ['./', './index.html', './css/app.css', './manifest.webmanifest',
  ...jsFiles.map(f => `./${f}`),
  ...fs.readdirSync(rel('icons')).filter(f => f.endsWith('.png')).map(f => `./icons/${f}`)];
let sw = fs.readFileSync(rel('sw.js'), 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${next}';`);
sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${assets.map(a => `  '${a}',`).join('\n')}\n];`);
fs.writeFileSync(rel('sw.js'), sw);

// 4. Guardar y enviar a GitHub.
const message = process.argv.slice(2).join(' ').trim() || 'Actualización';
git('add', '-A');
try { git('commit', '-m', `Rumbo ${next}: ${message}`); }
catch { console.log('No había cambios nuevos para guardar.'); }
try {
  execFileSync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: root, stdio: 'inherit' });
} catch { fail('No se pudo subir a GitHub. Revisa tu conexión o tu inicio de sesión.'); }

const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
console.log(`\n✔ Rumbo ${next} publicado.`);
if (m) console.log(`  En 1 o 2 minutos estará en https://${m[1].toLowerCase()}.github.io/${m[2]}/`);
console.log('  El iPhone la descargará la próxima vez que abras Rumbo.\n');
