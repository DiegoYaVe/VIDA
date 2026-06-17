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
    }),
    {
      name: 'vida_auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAuthStore;
