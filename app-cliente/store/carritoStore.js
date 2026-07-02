import { create } from 'zustand';

const useCarritoStore = create((set, get) => ({
  items: [],
  idPuntoVenta: null,
  nombreSucursal: '',

  agregarItem: (producto) => {
    const { items } = get();
    const idx = items.findIndex((i) => i.idProducto === producto.idProducto);
    if (idx >= 0) {
      const updated = [...items];
      updated[idx] = { ...updated[idx], Cantidad: updated[idx].Cantidad + 1 };
      set({ items: updated });
    } else {
      set({ items: [...items, { ...producto, Cantidad: 1 }] });
    }
  },

  quitarItem: (idProducto) => {
    const { items } = get();
    const idx = items.findIndex((i) => i.idProducto === idProducto);
    if (idx < 0) return;
    const updated = [...items];
    if (updated[idx].Cantidad <= 1) {
      updated.splice(idx, 1);
    } else {
      updated[idx] = { ...updated[idx], Cantidad: updated[idx].Cantidad - 1 };
    }
    set({ items: updated });
  },

  limpiarCarrito: () => set({ items: [], idPuntoVenta: null, nombreSucursal: '' }),

  setSucursal: (idPuntoVenta, nombre) =>
    set({ idPuntoVenta, nombreSucursal: nombre }),
}));

export default useCarritoStore;
