// Trazado por las calles para los mapas. Lo calcula el backend (Google Routes
// en producción, OSRM en desarrollo): la llave de Google nunca viaja en la app.
// Sin respuesta, quien lo usa dibuja la línea recta.
import { useEffect, useRef, useState } from 'react';
import api from './api';

const ENDPOINT = '/delivery/repartidor/trazado';
const TTL_MS = 10 * 60 * 1000;
// Si solo se movió el punto en movimiento (repartidor) menos que esto, se
// reutiliza el trazado anterior en vez de pedir otro (cada pedido cuesta).
const METROS_REUSO = 100;

const cache = new Map(); // clave → { t, promesa }
const clave = (pts) => pts.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');

function metros(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// pts: [{ lat, lon }] → Promise<{ coords: [[lat, lon]], km, min, tramos } | null>
export function pedirTrazado(pts) {
  const validos = (pts || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (validos.length < 2) return Promise.resolve(null);
  const k = clave(validos);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.promesa;
  const promesa = api.post(ENDPOINT, { puntos: validos.map((p) => [p.lat, p.lon]) })
    .then((r) => (r.data?.coords?.length ? r.data : null))
    .catch(() => { cache.delete(k); return null; });
  cache.set(k, { t: Date.now(), promesa });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return promesa;
}

// Recorta el trazado para que empiece donde está ahora el punto móvil
function desde(res, pos) {
  let mejor = 0, dist = Infinity;
  res.coords.forEach(([lat, lon], i) => { const d = metros(pos, { lat, lon }); if (d < dist) { dist = d; mejor = i; } });
  return { ...res, coords: [[pos.lat, pos.lon], ...res.coords.slice(mejor + 1)] };
}

// Hook: trazado de pts. `movil` = índice del punto que se mueve (o -1).
export function useTrazado(pts, movil = -1) {
  const [res, setRes] = useState(null);
  const ultimo = useRef(null); // { pts, res }
  const validos = (pts || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const k = validos.length >= 2 ? clave(validos) : '';
  useEffect(() => {
    if (!k) { setRes(null); return undefined; }
    const u = ultimo.current;
    const casiIgual = u?.res && u.pts.length === validos.length && validos.every((p, i) =>
      (i === movil ? metros(p, u.pts[i]) < METROS_REUSO : clave([p]) === clave([u.pts[i]])));
    if (casiIgual) { setRes(movil === 0 ? desde(u.res, validos[0]) : u.res); return undefined; }
    let vivo = true;
    setRes(null);
    pedirTrazado(validos).then((r) => {
      if (!vivo) return;
      ultimo.current = { pts: validos, res: r };
      setRes(r);
    });
    return () => { vivo = false; };
  }, [k]);
  return res;
}
