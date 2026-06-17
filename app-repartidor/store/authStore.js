import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ID_BRANCH, ID_CUENTA } from '../constants/config';

const useAuthStore = create(
  persist(
    (set) => ({
      repartidor: null,
      token: null,
      idBranch: ID_BRANCH,
      idCuenta: ID_CUENTA,

      login: (data) =>
        set({
          repartidor: data.repartidor,
          token: data.token,
          idBranch: data.idBranch ?? ID_BRANCH,
          idCuenta: data.idCuenta ?? ID_CUENTA,
        }),

      logout: () =>
        set({
          repartidor: null,
          token: null,
          idBranch: ID_BRANCH,
          idCuenta: ID_CUENTA,
        }),

      setRepartidor: (repartidor) => set({ repartidor }),
    }),
    {
      name: 'vida_repartidor_auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAuthStore;
