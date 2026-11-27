// Capturas de pantalla para los manuales, con círculos numerados encima de
// lo que el empresario tiene que picar o mirar.
//
// Usa el panel en modo desarrollo con DATOS INVENTADOS (no toca el API ni la
// base: las llamadas se responden dentro del navegador).
//   1. cd frontend && npm run dev          (panel en http://localhost:5173)
//   2. node docs/manuales/capturas.mjs     (desde la raíz del repo)
//   3. node docs/manuales/generar-pdf.mjs
// Salida: docs/manuales/capturas/*.jpg
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.PANEL || 'http://localhost:5173';
const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(aqui, 'capturas');
mkdirSync(salida, { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));

const navegador = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => p && existsSync(p));
if (!navegador) throw new Error('No encontré Chrome ni Edge');

const perfil = mkdtempSync(join(tmpdir(), 'vida-capturas-'));
const PUERTO = 9333;
const chrome = spawn(navegador, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
  '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

try {
  // ── Conexión DevTools ──
  let pagina;
  for (let i = 0; i < 40 && !pagina; i++) {
    try { pagina = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
    catch { await espera(250); }
  }
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let sec = 0; const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++sec; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const tamano = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  async function capturar(nombre, clip) {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, captureBeyondViewport: false,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(join(salida, `${nombre}.jpg`), Buffer.from(r.data, 'base64'));
    console.log('captura:', nombre);
  }

  await tamano(1280, 800);
  await send('Page.navigate', { url: `${BASE}/login` });
  await espera(3500);

  // ── Datos de ejemplo y sesión de un empresario (ADMIN de su tienda) ──
  await js(`(async () => {
    try { localStorage.setItem('vida_sidebar_colapsada', '0'); } catch {}
    const api = (await import('/src/services/api.js')).default;
    const { useAuthStore } = await import('/src/store/authStore.js');
    const meses = [202606,202607,202608,202609,202610,202611].map((p,i)=>({Periodo:p,Ventas:[40,52,47,61,58,41][i],
      VentasUSD:[820,1040,905,1310,1180,742.5][i],MetaUSD:1200,UnidadesPlus:[30,41,35,55,62,38][i],VentasPlusUSD:[150,210,180,290,330,196][i]}));
    const datos = { idPuntoVenta: 23, meses, MetaMensualUSD:1200,
      mesActual:{...meses[5],Dia:18,DiasMes:30,AvancePct:61.9,ProyeccionUSD:1237.5,PctVentasPlus:26.4},
      masVendidosMes:[{idProducto:1,Nombre:'Agua mineral 5 L',Unidades:31,EsPlus:true},{idProducto:2,Nombre:'Harina de maíz 1 kg',Unidades:28,EsPlus:false},{idProducto:5,Nombre:'Café molido 250 g',Unidades:19,EsPlus:true},{idProducto:3,Nombre:'Arroz blanco 1 kg',Unidades:17,EsPlus:false},{idProducto:6,Nombre:'Aceite vegetal 1 L',Unidades:12,EsPlus:false}],
      masVendidosMesAnterior:[{idProducto:2,Nombre:'Harina de maíz 1 kg',Unidades:44,EsPlus:false},{idProducto:1,Nombre:'Agua mineral 5 L',Unidades:39,EsPlus:true},{idProducto:3,Nombre:'Arroz blanco 1 kg',Unidades:30,EsPlus:false},{idProducto:5,Nombre:'Café molido 250 g',Unidades:22,EsPlus:true},{idProducto:4,Nombre:'Detergente en polvo 1 kg',Unidades:15,EsPlus:true}],
      estrellas:[{idProducto:5,Nombre:'Café molido 250 g',UnidadesMes:19,UnidadesMesAnterior:22}],
      plus:[{idProducto:1,Nombre:'Agua mineral 5 L',UnidadesMes:31,UnidadesMesAnterior:39},{idProducto:5,Nombre:'Café molido 250 g',UnidadesMes:19,UnidadesMesAnterior:22},{idProducto:4,Nombre:'Detergente en polvo 1 kg',UnidadesMes:9,UnidadesMesAnterior:15}],
      plusPropios:true, puedeEditar:false };
    const productos = [
      {idProducto:5,Nombre:'Café molido 250 g',SKU:'CAF-250',UnidadMedida:'PZA',PrecioUSD:3.8,StockDisponible:24,EsEstrella:true,EsProductoPlus:true},
      {idProducto:1,Nombre:'Agua mineral 5 L',SKU:'AGU-5L',UnidadMedida:'PZA',PrecioUSD:2.5,StockDisponible:40,EsEstrella:false,EsProductoPlus:true},
      {idProducto:4,Nombre:'Detergente en polvo 1 kg',SKU:'DET-1K',UnidadMedida:'PZA',PrecioUSD:4.2,StockDisponible:18,EsEstrella:false,EsProductoPlus:true},
      {idProducto:2,Nombre:'Harina de maíz 1 kg',SKU:'HAR-1K',UnidadMedida:'PZA',PrecioUSD:1.6,StockDisponible:60,EsEstrella:false,EsProductoPlus:false},
      {idProducto:3,Nombre:'Arroz blanco 1 kg',SKU:'ARR-1K',UnidadMedida:'PZA',PrecioUSD:1.4,StockDisponible:52,EsEstrella:false,EsProductoPlus:false},
      {idProducto:6,Nombre:'Aceite vegetal 1 L',SKU:'ACE-1L',UnidadMedida:'PZA',PrecioUSD:3.1,StockDisponible:20,EsEstrella:false,EsProductoPlus:false},
    ];
    api.defaults.adapter = async (config) => {
      const u = config.url; const ok = data => ({ data, status: 200, statusText: 'OK', headers: {}, config });
      if (u === '/reportes/filtros') return ok({ sucursales: [{ idPuntoVenta: 23, NombrePuntoVenta: 'Bodega Ejemplo' }], paises: [], estados: [] });
      if (u === '/arranque') return ok(datos);
      if (u === '/sucursales/puntos-venta') return ok([{ idPuntoVenta: 23, NomComercial: 'Bodega Ejemplo' }]);
      if (u === '/caja/turno-activo') return ok({ turno: { idTurno: 1 } });
      if (u === '/inventario/productos') return ok({ data: productos, total: productos.length });
      return Promise.reject(Object.assign(new Error('sin datos de ejemplo'), { config, response: { status: 404, data: {} } }));
    };
    const pantallas = [
      ['1','Dashboard','/dashboard','LayoutDashboard'], ['12','Tienda','/pos','ShoppingBag'], ['13','Historial de Ventas','/ventas','Receipt'],
      ['5','Inventarios','/inventarios','Warehouse'], ['10','Reportes y Estadísticas','/reportes','BarChart2'],
      ['14','Cierre de Caja','/caja','Wallet'], ['17','Academia VIDA','/academia','GraduationCap'],
    ].map(([idPantalla, Nombre, Link, Icono]) => ({ idPantalla, Nombre, Link, Icono }));
    useAuthStore.setState({ usuario: { TipoUsuario: 'ADMIN', Nombre: 'Empresario', Apellidos: 'Ejemplo', idPuntoVenta: 23, NomComercial: 'Bodega Ejemplo' },
      pantallas, accessToken: 'ejemplo' });

    // Marcas: aro rojo + número, encima de la página
    window.__m = {
      el(texto, sel = '*') {
        const c = [...document.querySelectorAll(sel)].filter(e => (e.innerText ?? e.textContent ?? '').trim().startsWith(texto));
        c.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
        if (!c[0]) throw new Error('No encontré: ' + texto);
        return c[0];
      },
      ir(ruta) { history.pushState({}, '', ruta); dispatchEvent(new PopStateEvent('popstate')); },
      limpiar() { document.querySelectorAll('.__marca').forEach(e => e.remove()); },
      marcar(el, n, { pad = 6, lado = 'izq', redondo = false } = {}) {
        const r = el.getBoundingClientRect();
        const aro = document.createElement('div'); aro.className = '__marca';
        Object.assign(aro.style, { position: 'fixed', zIndex: 99999, pointerEvents: 'none', left: (r.left - pad) + 'px', top: (r.top - pad) + 'px',
          width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px', border: '3px solid #E5484D',
          borderRadius: redondo ? '999px' : '12px', boxShadow: '0 0 0 2px rgba(255,255,255,.85), 0 0 0 6px rgba(229,72,77,.18)' });
        const num = document.createElement('div'); num.className = '__marca'; num.textContent = n;
        const der = lado.includes('der'), abajo = lado.includes('abajo');
        const x = Math.max(2, der ? r.right + pad - 4 : r.left - pad - 22);
        const y = abajo ? r.bottom + pad - 13 : r.top - pad - 13;
        Object.assign(num.style, { position: 'fixed', zIndex: 100000, pointerEvents: 'none', left: x + 'px', top: y + 'px',
          width: '26px', height: '26px', borderRadius: '50%', background: '#E5484D', color: '#fff', font: '800 14px Nunito, Segoe UI, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.25)' });
        document.body.append(aro, num);
      },
      caja(el, pad = 20) { const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: r.width + pad * 2, height: r.height + pad * 2 }; },
      union(a, b, pad = 20) { const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
        const x = Math.min(r1.left, r2.left) - pad, y = Math.min(r1.top, r2.top) - pad;
        return { x: Math.max(0, x), y: Math.max(0, y), width: Math.max(r1.right, r2.right) + pad - x, height: Math.max(r1.bottom, r2.bottom) + pad - y }; },
    };
    window.__m.ir('/reportes');
  })()`);
  await espera(1500);

  // ── 1. Cómo llegar: menú → Reportes → Arranque del mes ──
  console.log('barra de pestañas:', await js(`(async () => {
    const tab = __m.el('Arranque del mes', 'button'); tab.click();
    document.querySelectorAll('*').forEach(e => { if (e.scrollLeft) e.scrollLeft = 0; });
    let barra = tab.parentElement;
    while (barra && !(barra.scrollWidth > barra.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(barra).overflowX))) barra = barra.parentElement;
    if (barra) { const a = tab.getBoundingClientRect(), b = barra.getBoundingClientRect(); barra.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2); }
    return barra ? barra.className : 'sin barra desplazable';
  })()`));
  await espera(2000);
  await js(`(() => { __m.limpiar();
    __m.marcar(document.querySelector('nav a[href="/reportes"]'), 1, { lado: 'der' });
    __m.marcar(__m.el('Arranque del mes', 'button'), 2);
    __m.marcar(__m.el('Manual PLUS y Estrella', 'a'), 3, { lado: 'izq' });
  })()`);
  await capturar('01-llegar-arranque');

  // Página alta: todo el cuadro cabe sin desplazarse
  await tamano(1280, 2300);
  await espera(2500);

  // ── 2. Resumen del mes ──
  const clipResumen = await js(`(() => { __m.limpiar();
    const card = __m.el('Arranque de', 'h3').closest('.rounded-2xl');
    const dato = t => __m.el(t, 'p').parentElement;
    __m.marcar(dato('Vendido este mes'), 1); __m.marcar(dato('Proyección al cierre'), 2);
    __m.marcar(dato('Unidades PLUS'), 3); __m.marcar(dato('Venta en PLUS'), 4);
    __m.marcar(card.querySelector('[role="img"]').parentElement, 5, { pad: 8 });
    return __m.caja(card, 28);
  })()`);
  await capturar('02-resumen-mes', clipResumen);

  // ── 3. Gráficas de 6 meses ──
  const clipGraficas = await js(`(() => { __m.limpiar();
    const g1 = __m.el('Ventas por mes (USD)', 'h4').parentElement, g2 = __m.el('Unidades PLUS vendidas por mes', 'h4').parentElement;
    const barras1 = g1.querySelectorAll('.recharts-bar-rectangle'), barras2 = g2.querySelectorAll('.recharts-bar-rectangle');
    __m.marcar([...g1.querySelectorAll('text')].find(t => t.textContent === 'Meta'), 1, { pad: 6, lado: 'der' });
    __m.marcar(barras1[barras1.length - 1], 2, { pad: 6, lado: 'der' });
    __m.marcar(barras2[barras2.length - 1], 3, { pad: 6, lado: 'der' });
    return __m.union(g1, g2, 16);
  })()`);
  await capturar('03-graficas', clipGraficas);

  // ── 4. Producto estrella, PLUS y lo más vendido ──
  const clipEstrella = await js(`(() => { __m.limpiar();
    const est = __m.el('Producto estrella', 'h4').parentElement;
    const plus = __m.el('Productos PLUS', 'h4').parentElement, top = __m.el('Lo que más se vende', 'h4').parentElement;
    __m.marcar(est.querySelector('.rounded-xl'), 1);
    __m.marcar(plus.querySelector('table'), 2);
    __m.marcar(__m.el('PLUS', 'span'), 3, { pad: 5, lado: 'der', redondo: true });
    return __m.union(est, top, 28);
  })()`);
  await capturar('04-estrella-plus', clipEstrella);

  // ── 5. La caja: etiquetas ★ ESTRELLA y PLUS ──
  await tamano(1280, 800);
  await js(`(() => { __m.limpiar(); __m.ir('/pos'); })()`);
  await espera(2500);
  await js(`(() => { __m.limpiar(); document.activeElement?.blur?.();
    __m.marcar(document.querySelector('nav a[href="/pos"]'), 1, { lado: 'der' });
    __m.marcar(__m.el('★ ESTRELLA', 'span'), 2, { pad: 5, lado: 'abajo-izq', redondo: true });
    __m.marcar(__m.el('PLUS', 'span'), 3, { pad: 5, lado: 'abajo-der', redondo: true });
  })()`);
  await capturar('05-caja-etiquetas');

  ws.close();
} finally {
  chrome.kill();
  await espera(500);
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome a veces tarda en soltarlo */ }
}
