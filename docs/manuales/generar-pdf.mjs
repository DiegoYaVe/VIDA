// Genera los PDF de los manuales con Chrome (o Edge) sin ventana.
// Uso, desde la raíz del repo:  node docs/manuales/generar-pdf.mjs
// Salida: frontend/public/manuales/<nombre>.pdf (se publica con el panel).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = resolve(aqui, '../../frontend/public/manuales');
const MANUALES = ['manual-plus-estrella'];

const navegador = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && existsSync(p));
if (!navegador) throw new Error('No encontré Chrome ni Edge (o define la variable CHROME)');

mkdirSync(salida, { recursive: true });
for (const nombre of MANUALES) {
  const pdf = join(salida, `${nombre}.pdf`);
  execFileSync(navegador, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    '--virtual-time-budget=8000',          // deja cargar la tipografía
    `--print-to-pdf=${pdf}`,
    pathToFileURL(join(aqui, `${nombre}.html`)).href,
  ], { stdio: 'inherit' });
  console.log('PDF listo:', pdf);
}
