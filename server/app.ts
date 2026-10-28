/**
 * API-приложение (Express) без привязки к хостингу.
 *
 * Используется двумя входами:
 *   • server.ts    — обычный Node-сервер (VPS, Render, Railway, Termux, локально);
 *   • api/index.ts — serverless-функция для Vercel.
 *
 * Здесь только маршруты /api/*. Статика и Vite живут в server.ts,
 * потому что на serverless раздачей файлов занимается сама площадка.
 */
import express from 'express';
import { GoogleGenAI } from '@google/genai';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const yukinoBaseUrl = () =>
    (process.env.YUKINO_BASE_URL || 'https://api.yukino.my').replace(/\/$/, '');

  /* ---------------------------- Служебные ---------------------------- */

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  /**
   * Подсказка для UI: какие серверные провайдеры настроены.
   * Сами ключи наружу не отдаются — только булевы флаги.
   */
  app.get('/api/ai/status', (_req, res) => {
    const gemini = !!String(process.env.GEMINI_API_KEY || '').trim();
    const yukinoEnv = !!String(process.env.YUKINO_API_KEY || '').trim();
    res.json({
      gemini,
      yukinoEnv,
      provider: gemini ? 'gemini' : yukinoEnv ? 'yukino' : 'browser-key',
    });
  });

  /* ------------------------------ Gemini ----------------------------- */

  app.post('/api/gemini/generate', async (req, res) => {
    const { systemPrompt, userPrompt, temperature } = req.body || {};
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return res.status(503).json({ error: 'GEMINI_NOT_CONFIGURED' });
    }
    if (!userPrompt) {
      return res.status(400).json({ error: 'userPrompt is required' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt ? `[SYSTEM INSTRUCTIONS]:\n${systemPrompt}\n\n` : ''}${userPrompt}`,
              },
            ],
          },
        ],
        config: {
          temperature: typeof temperature === 'number' ? temperature : 0.85,
          responseMimeType: 'application/json',
        },
      });

      return res.json({ text: response.text || '' });
    } catch (err: any) {
      console.error('Gemini generate error:', err?.message || err);
      return res.status(502).json({ error: err?.message || 'Gemini API error' });
    }
  });

  app.post('/api/gemini/stream', async (req, res) => {
    const { systemPrompt, userPrompt, temperature } = req.body || {};
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return res.status(503).json({ error: 'GEMINI_NOT_CONFIGURED' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const ai = new GoogleGenAI({ apiKey });
      const stream = await ai.models.generateContentStream({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt ? `[SYSTEM INSTRUCTIONS]:\n${systemPrompt}\n\n` : ''}${userPrompt}`,
              },
            ],
          },
        ],
        config: { temperature: typeof temperature === 'number' ? temperature : 0.85 },
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err?.message || 'Streaming failed' })}\n\n`);
      res.end();
    }
  });

  /* ------------------------------ Yukino ----------------------------- */

  /**
   * Прокси к Yukino.
   *
   * Ключ НЕ хранится в коде и НЕ сохраняется на сервере: браузер присылает его
   * в заголовке `x-yukino-key` (пользователь вставляет ключ в интерфейсе),
   * сервер подставляет его в запрос и сразу забывает.
   * `YUKINO_API_KEY` из окружения — необязательная альтернатива.
   *
   * Прокси нужен именно потому, что Yukino не разрешает CORS-запросы
   * из браузера на чужом домене (см. README, раздел «Почему нужен сервер»).
   */
  app.post('/api/yukino/v1/chat/completions', async (req, res) => {
    const headerKey = String(req.get('x-yukino-key') || '').trim();
    const apiKey = headerKey || String(process.env.YUKINO_API_KEY || '').trim();

    if (!apiKey) {
      return res.status(401).json({
        error: 'YUKINO_KEY_REQUIRED',
        message: 'Ключ Yukino не задан. Вставьте его в лобби (раздел «API-ключ Yukino»).',
      });
    }

    try {
      const upstream = await fetch(`${yukinoBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body),
      });

      const body = await upstream.text();

      // HTML-заглушка провайдера (Cloudflare) — отдаём нормальную ошибку.
      if (body.trim().startsWith('<!doctype') || body.trim().startsWith('<html')) {
        return res.status(502).json({ error: 'Upstream returned HTML (provider unavailable)' });
      }

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      return res.status(upstream.status).send(body);
    } catch (err: any) {
      return res.status(502).json({ error: err?.message || 'Yukino proxy failure' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API route' });
  });

  return app;
}
