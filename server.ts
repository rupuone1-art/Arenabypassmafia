/**
 * Обычный Node-сервер: API + раздача фронтенда.
 *
 *   npm run dev   — Vite middleware (hot reload)
 *   npm run build && npm start — статика из dist/
 *
 * Тот же API используется на serverless (см. api/index.ts для Vercel).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT) || 3000;
const app = createApp();

if (process.env.NODE_ENV === 'production') {
  // Отдаём собранный фронтенд.
  const express = (await import('express')).default;
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // Vite middleware: сборка на лету и HMR.
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: true as any,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
  console.log(
    `AI providers: gemini=${process.env.GEMINI_API_KEY ? 'on' : 'off'}, ` +
      `yukinoEnv=${process.env.YUKINO_API_KEY ? 'on' : 'off'} ` +
      `(ключ Yukino также можно вставить в интерфейсе)`
  );
});
