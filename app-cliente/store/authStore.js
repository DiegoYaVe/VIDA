import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ID_BRANCH, ID_CUENTA } from '../constants/config';

const useAuthStore = create(
  persist(
    (set) => ({
      cliente: null,
      token: null,
      idBranch: ID_BRANCH,
      idCuenta: ID_CUENTA,

      login: (data) =>
        set({
          cliente: data.cliente,
          token: data.token,
          idBranch: data.idBranch ?? ID_BRANCH,
          idCuenta: data.idCuenta ?? ID_CUENTA,
        }),

      logout: () =>
        set({
          cliente: null,
          token: null,
          idBranch: ID_BRANCH,
          idCuenta: ID_CUENTA,
        }),

      setCliente: (cliente) => set({ cliente }),

      // A dónde regresar después de iniciar sesión (ej. el carrito)
      postLoginRedirect: null,
      setPostLoginRedirect: (ruta) => set({ postLoginRedirect: ruta }),
    }),
    {
      name: 'vida_auth',
      storage: createJSONStorage(() => AsyncStorage),
      // La sesión (cliente + token) persiste en el teléfono — como Facebook:
      // inicias sesión una vez y queda iniciada hasta que cierres sesión
      partialize: (s) => ({ cliente: s.cliente, token: s.token, idBranch: s.idBranch, idCuenta: s.idCuenta }),
    }
  )
);

export default useAuthStore;
