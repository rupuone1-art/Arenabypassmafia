import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Для GitHub Pages (подкаталог /<repo>/) передаётся BASE_PATH, локально — корень.
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // Доступ извне (preview-домены, туннели, телефон в той же сети).
      host: '0.0.0.0',
      allowedHosts: true as true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/yukino': {
          target: 'https://api.yukino.my',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/yukino/, ''),
          secure: false,
        },
      },
    },
  };
});
