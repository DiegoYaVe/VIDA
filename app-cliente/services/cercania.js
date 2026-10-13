// Tienda más cercana: ubicación del teléfono (si el cliente da permiso) y
// distancia en línea recta a cada tienda. Sin permiso, todo sigue igual
// (orden alfabético y la primera tienda por defecto).
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

let cache = null; // { t, pos }
const VIGENCIA_MS = 5 * 60 * 1000;

// pedir: mostrar el diálogo de permiso si aún no lo dio. pedirUnaVez: igual,
// pero solo la primera vez (el inicio no insiste en cada apertura).
export async function obtenerUbicacion({ pedir = false, pedirUnaVez = false } = {}) {
  if (cache && Date.now() - cache.t < VIGENCIA_MS) return cache.pos;
  try {
    let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' && pedirUnaVez && !pedir) {
      pedir = !(await AsyncStorage.getItem('vida_gps_pedido').catch(() => null));
      if (pedir) AsyncStorage.setItem('vida_gps_pedido', '1').catch(() => {});
    }
    if (status !== 'granted' && pedir && canAskAgain !== false) ({ status } = await Location.requestForegroundPermissionsAsync());
    if (status !== 'granted') return null;
    // Si el GPS tarda, no se frena la pantalla: a los 4 s se sigue sin ubicación
    const p = (await Location.getLastKnownPositionAsync({ maxAge: VIGENCIA_MS }).catch(() => null))
      || (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((r) => setTimeout(() => r(null), 4000)),
      ]));
    if (!p?.coords) return null;
    cache = { t: Date.now(), pos: { lat: p.coords.latitude, lon: p.coords.longitude } };
    return cache.pos;
  } catch { return null; }
}

export function kmEntre(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Tiendas con DistanciaKm (null si la tienda no tiene coordenadas), las más
// cercanas primero; sin ubicación, el orden original.
export function ordenarPorCercania(tiendas, pos) {
  if (!pos) return tiendas;
  const conDist = tiendas.map((t) => {
    const lat = parseFloat(t.Latitud), lon = parseFloat(t.Longitud);
    return { ...t, DistanciaKm: Number.isFinite(lat) && Number.isFinite(lon) ? kmEntre(pos, { lat, lon }) : null };
  });
  return conDist.sort((a, b) => (a.DistanciaKm ?? Infinity) - (b.DistanciaKm ?? Infinity));
}

export const textoDistancia = (km) => (km == null ? null : km < 1 ? `a ${Math.round(km * 1000 / 50) * 50} m` : `a ${km.toLocaleString('es-VE', { maximumFractionDigits: 1 })} km`);
