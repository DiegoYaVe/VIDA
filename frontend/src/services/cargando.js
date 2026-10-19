// Indicador de carga automático para TODO el panel.
//
// Los usuarios no sabían si su clic "había entrado": muchas acciones llaman al
// API sin mostrar nada mientras esperan. En vez de agregar un estado de carga a
// cada botón, esto lo resuelve en un solo lugar:
//
//  1. Al hacer clic en un botón (o enviar un formulario) se abre una "sesión"
//     corta ligada a ese botón.
//  2. Las peticiones al API que arrancan durante esa sesión se le atribuyen: el
//     botón muestra un spinner (atributo data-cargando, estilos en index.css) y
//     no acepta más clics hasta que terminan (evita cobros o guardados dobles).
//  3. Mientras haya acciones del usuario o escrituras en curso, una barra fina
//     arriba de la pantalla indica que el sistema está trabajando.
//
// Las peticiones de fondo (heartbeat, sincronización, recargas automáticas) no
// se atribuyen a nadie; las de escritura pueden marcarse `silencioso: true` en
// su config de axios para no mostrar la barra.

const SELECTOR = 'button, [role="button"], a[href], input[type="submit"], input[type="button"]';
const VENTANA_MS = 800;  // tras el clic, cuánto esperar a que arranque la primera petición
const GRACIA_MS = 300;   // tras la última respuesta, por si la acción encadena otra petición

let actual = null;       // sesión que está recibiendo peticiones (la del último clic)
let visibles = 0;        // peticiones que encienden la barra superior

function marcar(el, si) {
  if (!el?.isConnected && si) return;
  if (si) { el.setAttribute('data-cargando', ''); el.setAttribute('aria-busy', 'true'); }
  else { el.removeAttribute('data-cargando'); el.removeAttribute('aria-busy'); }
}

function barra() {
  document.documentElement.classList.toggle('vida-cargando', visibles > 0);
}

function abrirSesion(el) {
  const s = { el, pendientes: 0, abierta: true, timer: null };
  actual = s;
  s.timer = setTimeout(() => cerrarVentana(s), VENTANA_MS);
}

function cerrarVentana(s) {
  s.abierta = false;
  if (actual === s) actual = null;
}

function inicio(s) {
  clearTimeout(s.timer);
  s.abierta = true;
  s.pendientes++;
  marcar(s.el, true);
}

function fin(s) {
  s.pendientes = Math.max(0, s.pendientes - 1);
  if (s.pendientes > 0) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (s.pendientes > 0) return;
    cerrarVentana(s);
    marcar(s.el, false);
  }, GRACIA_MS);
}

function bloquearSiCargando(e, el) {
  if (!el?.hasAttribute('data-cargando')) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  return true;
}

let instalado = false;

export function instalarCargando(api) {
  if (instalado || typeof document === 'undefined') return;
  instalado = true;

  // Fase de captura en document: corre antes que los manejadores de React.
  document.addEventListener('click', (e) => {
    const el = e.target?.closest?.(SELECTOR);
    if (!el || bloquearSiCargando(e, el)) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    abrirSesion(el);
  }, true);

  // Enter dentro de un formulario: el "clic" no existe, se usa el botón de envío.
  document.addEventListener('submit', (e) => {
    const el = e.submitter || e.target?.querySelector?.('button[type="submit"], button:not([type])');
    if (!el || bloquearSiCargando(e, el)) return;
    if (actual?.el !== el) abrirSesion(el);
  }, true);

  api.interceptors.request.use((config) => {
    // En un reintento (token renovado) la petición ya trae su sesión.
    const s = config._cargando || (actual?.abierta ? actual : null);
    if (s) { config._cargando = s; inicio(s); }
    const metodo = (config.method || 'get').toLowerCase();
    if (!config._visible && !config.silencioso && (s || metodo !== 'get')) {
      config._visible = true;
      visibles++; barra();
    }
    return config;
  });

  const terminar = (config) => {
    if (!config) return;
    if (config._cargando) fin(config._cargando);
    if (config._visible) { config._visible = false; visibles = Math.max(0, visibles - 1); barra(); }
  };

  api.interceptors.response.use(
    (res) => { terminar(res.config); return res; },
    (err) => { terminar(err.config); return Promise.reject(err); },
  );
}
