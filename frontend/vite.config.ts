import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // MapLibre GL (CR-6 map view) pushes the main chunk past the 2 MiB default.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Aniston VMS',
        short_name: 'Aniston VMS',
        description: 'Aniston VMS — CCTV Video Monitoring System',
        theme_color: '#0073ea',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@aniston-vms/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
      // Dev media proxy — same-origin /media/* → local MediaMTX (HLS 8888,
      // WebRTC 8889). Production uses nginx with auth_request (frontend/nginx.conf);
      // this dev shortcut does not enforce the media token.
      '/media/hls': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/media\/hls/, ''),
      },
      '/media/webrtc': {
        target: 'http://localhost:8889',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/media\/webrtc/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
