import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

const VOICE_STYLES: Record<string, string> = {
  Kore: 'Energetic, clear sports announcer cheering on a match point',
  Puck: 'Playful, bright, upbeat game-show host',
  Fenrir: 'Bold, excited stadium coach rallying the crowd',
  Charon: 'Deep, dramatic classic sports broadcaster',
  Zephyr: 'Warm, enthusiastic, encouraging cheerleader',
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        text?: unknown;
        voiceName?: unknown;
        style?: unknown;
      };

      const rawText = typeof body.text === 'string' ? body.text.trim() : '';
      if (!rawText) {
        res.status(400).json({ error: 'Notification text cannot be empty.' });
        return;
      }
      const safeText = rawText.slice(0, 240);

      const requestedVoice = typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Kore';
      const safeVoice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
      const safeStyle =
        typeof body.style === 'string' && body.style.trim()
          ? body.style.trim().slice(0, 140)
          : VOICE_STYLES[safeVoice] || 'Energetic, exciting sports announcer';

      const ai = getGeminiClient();
      if (!ai) {
        res.status(500).json({
          code: 'MISSING_API_KEY',
          error:
            'GEMINI_API_KEY is missing. Using built-in browser voice automatically.',
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: safeText,
                speechMetadata: {
                  style: safeStyle,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((p) => Boolean(p.inlineData?.data));
      const base64Audio = audioPart?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({
          code: 'EMPTY_AUDIO',
          error: 'AI voice service did not return audio data. Using built-in browser voice.',
        });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
        voiceName: safeVoice,
      });
    } catch (err: unknown) {
      const raw =
        err instanceof Error ? err.message : 'Failed to generate AI notification sound.';
      let extracted = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } };
        if (parsed?.error?.message) extracted = parsed.error.message;
      } catch {
        // Ignore parse error
      }
      const isQuota =
        raw.includes('RESOURCE_EXHAUSTED') ||
        raw.includes('429') ||
        extracted.toLowerCase().includes('quota');
      const isAuth =
        raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED');
      const statusCode = isAuth ? 403 : isQuota ? 429 : 500;
      const code = isAuth
        ? 'INVALID_API_KEY'
        : isQuota
        ? 'QUOTA_EXCEEDED'
        : 'TTS_ERROR';
      const friendly = isQuota
        ? 'Gemini Cloud TTS quota reached for now. Using built-in browser voice automatically.'
        : isAuth
        ? 'Gemini API key is invalid or lacks TTS permission. Using built-in browser voice.'
        : extracted;
      res.status(statusCode).json({ error: friendly, code });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TUGofWAR server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
