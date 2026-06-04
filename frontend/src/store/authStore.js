// src/store/authStore.js
import { create } from 'zustand';
import api from '../services/api.js';

export const useAuthStore = create((set, get) => ({
  usuario:      null,
  pantallas:    [],
  accessToken:  null,
  refreshToken: null,
  loading:      false,
  error:        null,

  login: async (cve, pass) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/auth/login', { cve, pass });
      const { accessToken, refreshToken, usuario, pantallas } = res.data;

      // Access token solo en memoria
      set({ usuario, pantallas, accessToken, refreshToken, loading: false });

      // Refresh token en localStorage para persistir sesión
      localStorage.setItem('pos_refresh', refreshToken);

      // Configurar header global de axios
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al iniciar sesión';
      set({ error: msg, loading: false });
      return false;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {}
    localStorage.removeItem('pos_refresh');
    delete api.defaults.headers.common['Authorization'];
    set({ usuario: null, pantallas: [], accessToken: null, refreshToken: null });
  },

  refreshSession: async () => {
    const stored = localStorage.getItem('pos_refresh');
    if (!stored) return false;
    try {
      // 1. Obtener nuevo access token
      const res = await api.post('/auth/refresh', { refreshToken: stored });
      const { accessToken } = res.data;

      // 2. Aplicar token a axios INMEDIATAMENTE
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      set({ accessToken });

      // 3. Cargar datos del usuario y pantallas con el nuevo token
      const meRes = await api.get('/auth/me');
      set({ 
        usuario:   meRes.data.usuario,
        pantallas: meRes.data.pantallas,
      });

      return true;
    } catch {
      localStorage.removeItem('pos_refresh');
      delete api.defaults.headers.common['Authorization'];
      set({ usuario: null, accessToken: null, pantallas: [] });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
