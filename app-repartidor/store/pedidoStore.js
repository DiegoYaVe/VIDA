import { create } from 'zustand';

// Estado global de turno/pedido — se comparte entre todas las pestañas
const usePedidoStore = create((set) => ({
  disponible: false,
  pedidoActivo: null,
  nuevoPedido: null,
  setDisponible:   (v) => set({ disponible: v }),
  setPedidoActivo: (p) => set({ pedidoActivo: p }),
  setNuevoPedido:  (p) => set({ nuevoPedido: p }),
}));

export default usePedidoStore;
