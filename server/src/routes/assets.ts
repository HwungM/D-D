import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateImage } from '../services/openai';
import { supabaseAdmin } from '../services/supabase';
import { z } from 'zod';
import { aiRateLimit } from '../middleware/rateLimit';

const router = Router();

const generateSchema = z.object({
  description: z.string().min(1).max(500),
  cacheKey: z.string().min(1).max(200),
  assetType: z.enum(['scene', 'portrait', 'item', 'npc', 'enemy']).default('scene'),
});

router.post('/generate', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = generateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { description, cacheKey } = parse.data;

  try {
    const url = await generateImage(description, cacheKey);
    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    res.status(500).json({ error: message });
  }
});

router.get('/cached/:cacheKey', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { cacheKey } = req.params;

  const { data, error } = await supabaseAdmin
    .from('asset_cache')
    .select('url, asset_type, created_at')
    .eq('cache_key', cacheKey)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  res.json(data);
});

export default router;
