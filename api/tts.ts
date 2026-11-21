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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const rawBody =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const body = rawBody as {
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
        error:
          'GEMINI_API_KEY is missing. Please configure it in your environment secrets.',
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
        error: 'AI voice service did not return audio data. Please try again.',
      });
      return;
    }

    res.status(200).json({
      audioBase64: base64Audio,
      mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
      voiceName: safeVoice,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate AI notification sound.';
    const statusCode =
      message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')
        ? 403
        : message.includes('RESOURCE_EXHAUSTED')
        ? 429
        : 500;
    res.status(statusCode).json({ error: message });
  }
}
