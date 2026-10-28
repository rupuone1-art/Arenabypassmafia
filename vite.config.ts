import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },

    server: {
      // Слушаем все интерфейсы: нужно для прокси/туннелей и live-preview.
      host: '0.0.0.0',
      // Разрешаем произвольный Host (preview-домены вида *.e2b.app, ngrok и т.п.).
      allowedHosts: true as true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Все /api/* обслуживает Express (server.ts) — прокси здесь не нужен.
    },
  };
});
