// Memoria en proceso del despacho escalonado: por pedido, a quién ya se le
// ofreció y el último radio usado. Vive en su propio módulo (y no dentro de
// dispatch.service.js) porque el controller de delivery necesita olvidar un
// pedido al liberarlo, y dispatch.service ya importa del controller: tenerlo
// acá evita el import circular.
//
// Si el backend se reinicia solo se re-notifica una vez — sin consecuencias.
const memoria = new Map(); // idPedido → { radio, notificados:Set<string> }

export function recordarPedido(idPedido) {
  return memoria.get(String(idPedido)) ?? { radio: 0, notificados: new Set() };
}

export function guardarPedido(idPedido, mem) {
  memoria.set(String(idPedido), mem);
}

// Olvida lo ya notificado de un pedido. Se llama al liberarlo: si no, la
// memoria conserva el radio previo y a todos los notificados, y como el radio
// se calcula desde FechaAlta (ya suele estar en el máximo) la condición
// radio > mem.radio no se cumple y nadie recibe el push de la re-oferta.
export function olvidarPedido(idPedido) {
  memoria.delete(String(idPedido));
}

// Limpia los pedidos que ya no están en búsqueda
export function purgarSalvo(idsActivos) {
  for (const key of memoria.keys()) {
    if (!idsActivos.has(key)) memoria.delete(key);
  }
}
