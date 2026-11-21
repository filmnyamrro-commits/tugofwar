import { GoogleGenAI } from '@google/genai';

interface VercelRequest {
  method?: string;
  body?: unknown;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

const ALLOWED_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

const VOICE_STYLES: Record<string, string> = {
  Kore: 'Energetic, clear sports announcer cheering on a match point',
  Puck: 'Playful, bright, upbeat game-show host',
  Fenrir: 'Bold, excited stadium coach rallying the crowd',
  Charon: 'Deep, dramatic classic sports broadcaster',
  Zephyr: 'Warm, enthusiastic, encouraging cheerleader',
};

function parseGeminiError(err: unknown): {
  statusCode: number;
  code: string;
  message: string;
} {
  const raw =
    err instanceof Error ? err.message : 'Failed to generate AI notification sound.';
  let extracted = raw;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; status?: string; code?: number };
    };
    if (parsed?.error?.message) {
      extracted = parsed.error.message;
    }
  } catch {
    // Raw message is already plain text
  }

  if (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('429') ||
    extracted.toLowerCase().includes('quota')
  ) {
    return {
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'Gemini Cloud TTS quota reached for now. Using built-in browser voice automatically.',
    };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return {
      statusCode: 403,
      code: 'INVALID_API_KEY',
      message:
        'Gemini API key is invalid or lacks TTS permission. Using built-in browser voice.',
    };
  }
  return {
    statusCode: 500,
    code: 'TTS_ERROR',
    message: extracted,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    let rawBody: unknown = req.body ?? {};
    if (typeof req.body === 'string') {
      rawBody = JSON.parse(req.body || '{}');
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = JSON.parse(req.body.toString('utf8') || '{}');
    }
    const body = (rawBody ?? {}) as {
      text?: unknown;
      voiceName?: unknown;
      style?: unknown;
    };

    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    if (!rawText) {
      res
        .status(400)
        .json({ error: 'Notification text cannot be empty.', code: 'EMPTY_TEXT' });
      return;
    }
    const safeText = rawText.slice(0, 240);

    const requestedVoice =
      typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Kore';
    const safeVoice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
    const safeStyle =
      typeof body.style === 'string' && body.style.trim()
        ? body.style.trim().slice(0, 140)
        : VOICE_STYLES[safeVoice] || 'Energetic, exciting sports announcer';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        code: 'MISSING_API_KEY',
        error:
          'GEMINI_API_KEY is not configured in Vercel environment variables. Using built-in browser voice.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

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

    res.status(200).json({
      audioBase64: base64Audio,
      mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
      voiceName: safeVoice,
    });
  } catch (err: unknown) {
    const parsed = parseGeminiError(err);
    res.status(parsed.statusCode).json({ error: parsed.message, code: parsed.code });
  }
}
