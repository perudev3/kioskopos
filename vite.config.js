import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
    
      manifest: {
        name: 'KioPOS',
        short_name: 'KioPOS',
        description: 'Sistema de ventas y control de comercios como Tiendas y Kioskos',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/logo-sin-fondo.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/logo-sin-fondo.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
