import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Carrito persistido en el teléfono: sobrevive cierres de la app y NO se
// pierde al registrarse o iniciar sesión — solo se limpia al completar un
// pedido o cuando el usuario lo vacía.
const useCarritoStore = create(
  persist(
    (set, get) => ({
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
    }),
    {
      name: 'vida_carrito',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCarritoStore;
