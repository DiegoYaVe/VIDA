// Trazado de rutas por las calles para los mapas de las apps (repartidor y
// cliente): geometría, distancia y tiempo total y por tramo.
//
// Proveedor:
//   - GOOGLE_ROUTES_API_KEY definido → Google Routes API (producción). La
//     llave vive solo en el servidor; las apps nunca la ven.
//   - Si no, RUTAS_OSRM_URL (un OSRM propio) o, fuera de producción, el
//     servidor público de demostración de OSRM (solo desarrollo: tiene
//     límites de uso y no garantiza servicio).
//   - Sin proveedor o si falla: null, y la app dibuja la línea recta.
//
// Las respuestas se guardan en memoria unos minutos: el mismo trayecto lo
// piden el mapa y las métricas de la oferta, y varios clientes a la vez.

const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const OSRM_DEMO = 'https://router.project-osrm.org';
const MAX_PUNTOS = 12;
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 2000;
const TIMEOUT_MS = 6000;

const cache = new Map(); // clave → { t, promesa }

// [[lat, lon], ...] válido, redondeado a 5 decimales (~1 m)
export function normalizarPuntos(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2 || puntos.length > MAX_PUNTOS) return null;
  const r = [];
  for (const p of puntos) {
    const lat = Number(Array.isArray(p) ? p[0] : p?.lat), lon = Number(Array.isArray(p) ? p[1] : p?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    r.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
  }
  return r;
}

// Algoritmo de polilínea codificada de Google → [[lat, lon], ...]
export function decodificarPolilinea(txt) {
  const r = [];
  let i = 0, lat = 0, lon = 0;
  while (i < txt.length) {
    for (const eje of [0, 1]) {
      let res = 0, shift = 0, b;
      do { b = txt.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (eje === 0) lat += d; else lon += d;
    }
    r.push([lat / 1e5, lon / 1e5]);
  }
  return r;
}

const seg = (s) => Number(String(s || '0').replace('s', '')) || 0;
const tramo = (metros, segundos) => ({ km: Math.round(metros) / 1000, min: Math.max(1, Math.round(segundos / 60)) });

async function google(pts, llave) {
  const ll = ([latitude, longitude]) => ({ location: { latLng: { latitude, longitude } } });
  const res = await fetch(GOOGLE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': llave,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration',
    },
    body: JSON.stringify({
      origin: ll(pts[0]),
      destination: ll(pts[pts.length - 1]),
      intermediates: pts.slice(1, -1).map(ll),
      travelMode: 'DRIVE',
      routingPreference: process.env.GOOGLE_ROUTES_TRAFICO === '1' ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
      languageCode: 'es',
      units: 'METRIC',
    }),
  });
  if (!res.ok) throw new Error(`Google Routes ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const ruta = (await res.json()).routes?.[0];
  if (!ruta?.polyline?.encodedPolyline) return null;
  return {
    fuente: 'google',
    coords: decodificarPolilinea(ruta.polyline.encodedPolyline),
    ...tramo(ruta.distanceMeters || 0, seg(ruta.duration)),
    tramos: (ruta.legs || []).map((l) => tramo(l.distanceMeters || 0, seg(l.duration))),
  };
}

async function osrm(pts, base) {
  const coords = pts.map(([lat, lon]) => `${lon},${lat}`).join(';');
  const res = await fetch(`${base.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=false`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const ruta = (await res.json()).routes?.[0];
  if (!ruta) return null;
  return {
    fuente: 'osrm',
    coords: ruta.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    ...tramo(ruta.distance, ruta.duration),
    tramos: ruta.legs.map((l) => tramo(l.distance, l.duration)),
  };
}

export function proveedorRutas(env = process.env) {
  if (env.GOOGLE_ROUTES_API_KEY) return 'google';
  if (env.RUTAS_OSRM_URL || env.NODE_ENV !== 'production') return 'osrm';
  return null;
}

// puntos ya normalizados → { fuente, coords, km, min, tramos } | null
export async function trazarRuta(pts, log) {
  const proveedor = proveedorRutas();
  if (!proveedor) return null;
  const clave = pts.map((p) => p.join(',')).join(';');
  const hit = cache.get(clave);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.promesa;
  const promesa = (proveedor === 'google'
    ? google(pts, process.env.GOOGLE_ROUTES_API_KEY)
    : osrm(pts, process.env.RUTAS_OSRM_URL || OSRM_DEMO)
  ).catch((e) => { log?.warn?.({ err: e.message }, 'trazado de ruta no disponible'); cache.delete(clave); return null; });
  cache.set(clave, { t: Date.now(), promesa });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return promesa;
}

// POST /delivery/{cliente|repartidor}/trazado  { puntos: [[lat, lon], ...] }
export async function trazadoHandler(request, reply) {
  const pts = normalizarPuntos(request.body?.puntos);
  if (!pts) return reply.code(400).send({ error: `Envía entre 2 y ${MAX_PUNTOS} puntos válidos` });
  const ruta = await trazarRuta(pts, request.log);
  return reply.send(ruta || { fuente: null, coords: null });
}
