import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-login.jpeg', 'logo-sidebar.png'],
      manifest: {
        name: 'POS Venezuela',
        short_name: 'VenezPOS',
        description: 'Punto de venta con soporte offline',
        theme_color: '#1A6A9A',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo-sidebar.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo-sidebar.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Assets estáticos (JS/CSS/imágenes): CacheFirst — la app carga sin red
        globPatterns: ['**/*.{js,css,html,png,jpeg,jpg,svg,ico}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // API: NetworkFirst solo para GETs de catálogo — los POST nunca se
        // cachean (la cola offline de IndexedDB maneja las escrituras)
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    }
  }
})
