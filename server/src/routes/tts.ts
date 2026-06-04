import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import OpenAI from 'openai';
import { z } from 'zod';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ttsSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = ttsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { text, voice } = parse.data;

  try {
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice || 'onyx',
      input: text,
    });

    res.set('Content-Type', 'audio/mpeg');
    res.set('Transfer-Encoding', 'chunked');
    // Stream directly — client starts receiving audio immediately
    const stream = mp3.body as unknown as NodeJS.ReadableStream;
    stream.pipe(res);
    stream.on('error', () => res.end());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS generation failed';
    res.status(500).json({ error: message });
  }
});

export default router;
