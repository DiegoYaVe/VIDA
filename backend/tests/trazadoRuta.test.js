import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarPuntos, decodificarPolilinea, proveedorRutas } from '../src/services/trazadoRuta.service.js';

test('trazado: valida y redondea los puntos', () => {
  assert.deepEqual(normalizarPuntos([[9.7457123, -63.18321], { lat: 9.75, lon: -63.17 }]), [[9.74571, -63.18321], [9.75, -63.17]]);
  assert.equal(normalizarPuntos([[9.7, -63.1]]), null);
  assert.equal(normalizarPuntos([[9.7, -63.1], [91, 0]]), null);
  assert.equal(normalizarPuntos([[9.7, -63.1], ['x', 0]]), null);
  assert.equal(normalizarPuntos(Array.from({ length: 13 }, () => [9.7, -63.1])), null);
});

test('trazado: decodifica la polilínea de Google', () => {
  // Ejemplo de la documentación del algoritmo
  assert.deepEqual(decodificarPolilinea('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('trazado: Google si hay llave; OSRM público solo fuera de producción', () => {
  assert.equal(proveedorRutas({ GOOGLE_ROUTES_API_KEY: 'k', NODE_ENV: 'production' }), 'google');
  assert.equal(proveedorRutas({ NODE_ENV: 'development' }), 'osrm');
  assert.equal(proveedorRutas({ NODE_ENV: 'production' }), null);
  assert.equal(proveedorRutas({ NODE_ENV: 'production', RUTAS_OSRM_URL: 'http://osrm' }), 'osrm');
});

test('trazado: pide a Google Routes con la llave del servidor y lee la respuesta', async () => {
  const { trazarRuta } = await import('../src/services/trazadoRuta.service.js');
  const antes = { fetch: globalThis.fetch, key: process.env.GOOGLE_ROUTES_API_KEY };
  let pedido;
  globalThis.fetch = async (url, opts) => {
    pedido = { url, opts, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ routes: [{ distanceMeters: 4145, duration: '540s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
      legs: [{ distanceMeters: 2326, duration: '300s' }, { distanceMeters: 1819, duration: '240s' }] }] }) };
  };
  process.env.GOOGLE_ROUTES_API_KEY = 'llave-servidor';
  try {
    const r = await trazarRuta([[9.11111, -63.1], [9.2, -63.2], [9.3, -63.3]]);
    assert.equal(pedido.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.equal(pedido.opts.headers['X-Goog-Api-Key'], 'llave-servidor');
    assert.match(pedido.opts.headers['X-Goog-FieldMask'], /routes\.polyline\.encodedPolyline/);
    assert.deepEqual(pedido.body.origin.location.latLng, { latitude: 9.11111, longitude: -63.1 });
    assert.equal(pedido.body.intermediates.length, 1);
    assert.equal(pedido.body.travelMode, 'DRIVE');
    assert.deepEqual(r, { fuente: 'google', coords: [[38.5, -120.2], [40.7, -120.95]], km: 4.145, min: 9, tramos: [{ km: 2.326, min: 5 }, { km: 1.819, min: 4 }] });
    // Error de Google → null (la app dibuja la línea recta) y no queda en caché
    globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'API not enabled' });
    assert.equal(await trazarRuta([[9.5, -63.5], [9.6, -63.6]]), null);
  } finally {
    globalThis.fetch = antes.fetch;
    if (antes.key === undefined) delete process.env.GOOGLE_ROUTES_API_KEY; else process.env.GOOGLE_ROUTES_API_KEY = antes.key;
  }
});
