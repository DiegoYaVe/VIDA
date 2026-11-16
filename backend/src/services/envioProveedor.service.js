// src/services/envioProveedor.service.js
// Conexión genérica con la API de un proveedor (tarea 24): VIDA le hace un
// POST JSON a la URL que el proveedor dio, con el folio de VIDA, el código de
// retiro y los productos. Nunca va nada de la tienda. Así se "enchufa"
// cualquier proveedor sin programar uno por uno; el que no tiene API usa el
// Portal de proveedores.
//
// Devuelve un texto corto para guardar en el paquete ("OK 200", "Error 500…").
// Nunca lanza: si el proveedor no responde, el pedido sigue en su portal.
export async function enviarPedidoApi(url, payload, log = null, timeoutMs = 8000) {
  let destino;
  try {
    destino = new URL(url);
    if (!['https:', 'http:'].includes(destino.protocol)) return 'Error: la URL de la API debe ser http o https';
  } catch {
    return 'Error: la URL de la API no es válida';
  }
  try {
    const res = await fetch(destino, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'VIDA-Reabasto/1' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const cuerpo = (await res.text().catch(() => '')).slice(0, 200);
    return `${res.ok ? 'OK' : 'Error'} ${res.status}${cuerpo ? ` · ${cuerpo}` : ''}`;
  } catch (err) {
    log?.warn?.({ err: err.message, url: destino.origin }, 'No se pudo enviar el pedido a la API del proveedor');
    return `Error: ${err.name === 'TimeoutError' ? 'el proveedor no respondió a tiempo' : err.message}`;
  }
}
