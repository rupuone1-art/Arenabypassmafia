import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

/* ------------------------------------------------------------------ */
/* Конфигурация провайдеров (секреты читаются только здесь)            */
/* ------------------------------------------------------------------ */

// AI_PROVIDER: 'auto' (по умолчанию) | 'gemini' | 'yukino' | 'local'
const AI_PROVIDER = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const YUKINO_API_KEY = (process.env.YUKINO_API_KEY || '').trim();
const YUKINO_BASE_URL = (process.env.YUKINO_BASE_URL || 'https://api.yukino.my').replace(/\/$/, '');
const YUKINO_MODEL = (process.env.YUKINO_MODEL || 'yukino-free').trim();

const geminiEnabled =
  AI_PROVIDER !== 'local' && AI_PROVIDER !== 'yukino' && !!GEMINI_API_KEY;
const yukinoEnabled =
  AI_PROVIDER !== 'local' && AI_PROVIDER !== 'gemini' && !!YUKINO_API_KEY;

function activeProvider(): 'gemini' | 'yukino' | 'local' {
  if (geminiEnabled) return 'gemini';
  if (yukinoEnabled) return 'yukino';
  return 'local';
}

app.use(express.json({ limit: '10mb' }));

/* ------------------------------------------------------------------ */
/* Служебные маршруты                                                  */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: activeProvider(), uptime: process.uptime() });
});

/**
 * Клиент спрашивает у сервера, какие провайдеры реально настроены.
 * Ключи наружу не отдаются — только булевы флаги.
 */
app.get('/api/ai/status', (_req, res) => {
  res.json({
    provider: activeProvider(),
    gemini: geminiEnabled,
    yukino: yukinoEnabled,
    model: activeProvider() === 'gemini' ? GEMINI_MODEL : activeProvider() === 'yukino' ? YUKINO_MODEL : 'local-engine',
    forced: AI_PROVIDER !== 'auto',
  });
});

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */

// Server-side Gemini API route (non-streaming)
app.post('/api/gemini/generate', async (req, res) => {
  const { systemPrompt, userPrompt, temperature, json } = req.body || {};

  if (!geminiEnabled) {
    return res.status(503).json({ error: 'GEMINI_NOT_CONFIGURED' });
  }
  if (!userPrompt || typeof userPrompt !== 'string') {
    return res.status(400).json({ error: 'userPrompt is required' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
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
        ...(json === false ? {} : { responseMimeType: 'application/json' }),
      },
    });

    const text = response.text || '';
    return res.json({ text, model: GEMINI_MODEL, provider: 'gemini' });
  } catch (err: any) {
    console.error('Server Gemini generate error:', err?.message || err);
    return res.status(502).json({ error: err?.message || 'Server Gemini API error' });
  }
});

// Server-side Gemini API route (SSE streaming)
app.post('/api/gemini/stream', async (req, res) => {
  const { systemPrompt, userPrompt, temperature } = req.body || {};

  if (!geminiEnabled) {
    return res.status(503).json({ error: 'GEMINI_NOT_CONFIGURED' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const responseStream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
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

/* ------------------------------------------------------------------ */
/* Yukino (OpenAI-совместимый прокси)                                  */
/* ------------------------------------------------------------------ */

app.post('/api/yukino/v1/chat/completions', async (req, res) => {
  if (!yukinoEnabled) {
    return res.status(503).json({ error: 'YUKINO_NOT_CONFIGURED' });
  }

  try {
    const upstream = await fetch(`${YUKINO_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${YUKINO_API_KEY}`,
      },
      body: JSON.stringify({ model: YUKINO_MODEL, ...(req.body || {}) }),
    });

    const contentType = upstream.headers.get('content-type') || 'text/plain';
    res.setHeader('Content-Type', contentType);
    const body = await upstream.text();

    // Не отдаём клиенту HTML-страницы Cloudflare: это просто «провайдер недоступен».
    if (body.trim().startsWith('<!doctype') || body.trim().startsWith('<html')) {
      return res.status(502).json({ error: 'Upstream returned HTML (provider unavailable)' });
    }

    return res.status(upstream.status).send(body);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Yukino proxy failure' });
  }
});

/* ------------------------------------------------------------------ */
/* Статика / Vite                                                      */
/* ------------------------------------------------------------------ */

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
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
    `AI provider: ${activeProvider()} (gemini=${geminiEnabled ? 'on' : 'off'}, yukino=${
      yukinoEnabled ? 'on' : 'off'
    })`
  );
  if (activeProvider() === 'local') {
    console.log(
      'ℹ️  Внешние LLM не настроены — игра работает на встроенном локальном движке. ' +
        'Ключи задаются через GEMINI_API_KEY / YUKINO_API_KEY в .env'
    );
  }
});
