import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const YUKINO_BASE_URL = (process.env.YUKINO_BASE_URL || 'https://api.yukino.my').replace(/\/$/, '');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Server-side Gemini API route (Non-streaming)
app.post('/api/gemini/generate', async (req, res) => {
  const { systemPrompt, userPrompt, temperature } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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

    const text = response.text || '';
    return res.json({ text });
  } catch (err: any) {
    console.error('Server Gemini generate error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Server Gemini API error' });
  }
});

// Server-side Gemini API route (SSE Streaming)
app.post('/api/gemini/stream', async (req, res) => {
  const { systemPrompt, userPrompt, temperature } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
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
      },
    });

    for await (const chunk of responseStream) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message || 'Streaming failed' })}\n\n`);
    res.end();
  }
});

/**
 * Прокси к Yukino.
 *
 * Ключ НЕ хранится в коде и НЕ сохраняется на сервере: браузер присылает его
 * в заголовке `x-yukino-key` (пользователь вставляет ключ в интерфейсе),
 * сервер подставляет его в запрос и сразу забывает.
 * `YUKINO_API_KEY` из окружения — необязательная альтернатива для серверных деплоев.
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
    const yukinoRes = await fetch(`${YUKINO_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const contentType = yukinoRes.headers.get('content-type') || 'text/plain';
    res.setHeader('Content-Type', contentType);
    const body = await yukinoRes.text();

    // HTML-заглушка провайдера — отдаём нормальную ошибку, а не страницу.
    if (body.trim().startsWith('<!doctype') || body.trim().startsWith('<html')) {
      return res.status(502).json({ error: 'Upstream returned HTML (provider unavailable)' });
    }

    return res.status(yukinoRes.status).send(body);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Yukino proxy failure' });
  }
});

// Какие провайдеры настроены: подсказка для UI (ключи наружу не отдаём).
app.get('/api/ai/status', (_req, res) => {
  res.json({
    gemini: !!String(process.env.GEMINI_API_KEY || '').trim(),
    yukinoEnv: !!String(process.env.YUKINO_API_KEY || '').trim(),
  });
});

// Vite middleware in dev or static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
