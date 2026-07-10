import { create } from 'zustand';

// Estado global de turno/pedidos — se comparte entre todas las pestañas.
// Multi-pedido: el repartidor puede llevar varios pedidos a la vez;
// rutaParadas es la secuencia optimizada de paradas que manda el backend.
const usePedidoStore = create((set) => ({
  disponible: false,
  pedidosActivos: [],
  rutaParadas: [],
  nuevoPedido: null,

  setDisponible:      (v) => set({ disponible: v }),
  setPedidosActivos:  (p) => set({ pedidosActivos: p }),
  setRutaParadas:     (r) => set({ rutaParadas: r }),
  setNuevoPedido:     (p) => set({ nuevoPedido: p }),

  actualizarPedido: (idPedido, cambios) => set((s) => ({
    pedidosActivos: s.pedidosActivos.map((p) =>
      String(p.idPedido) === String(idPedido) ? { ...p, ...cambios } : p),
  })),
  quitarPedido: (idPedido) => set((s) => ({
    pedidosActivos: s.pedidosActivos.filter((p) => String(p.idPedido) !== String(idPedido)),
  })),
}));

export default usePedidoStore;
