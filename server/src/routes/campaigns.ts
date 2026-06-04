import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { generateStorySeed, generateWorldBible } from '../services/openai';
import { z } from 'zod';

const router = Router();

router.get('/seeds', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const seeds = await generateStorySeed();
    res.json({ seeds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate story seeds' });
  }
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  storySeed: z.string().min(1),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { name, storySeed } = parse.data;

  try {
    const worldBible = await generateWorldBible(storySeed);

    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name,
        story_seed: storySeed,
        world_state: {
          currentLocation: worldBible.geography[0]?.name || 'Unknown',
          timeOfDay: 'day',
          weather: 'overcast',
          activeQuests: [],
          completedEvents: [],
          factionStandings: {},
          discoveredLocations: [],
          globalFlags: {},
        },
        world_bible: worldBible,
        act: 1,
      })
      .select()
      .single();

    if (error || !campaign) {
      res.status(500).json({ error: 'Failed to create campaign' });
      return;
    }

    // Add creator as member
    await supabaseAdmin.from('campaign_members').insert({
      campaign_id: campaign.id,
      user_id: req.user!.id,
    });

    res.status(201).json({ campaign });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate world' });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id, campaigns(*)')
    .eq('user_id', req.user!.id);

  if (error) {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
    return;
  }

  const campaigns = data?.map((m: { campaigns: unknown }) => m.campaigns).filter(Boolean) || [];
  res.json({ campaigns });
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', id)
    .eq('user_id', req.user!.id)
    .single();

  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  res.json({ campaign });
});

router.post('/:id/join', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', id)
    .eq('user_id', req.user!.id)
    .single();

  if (existing) {
    res.status(409).json({ error: 'Already a member' });
    return;
  }

  const { error } = await supabaseAdmin.from('campaign_members').insert({
    campaign_id: id,
    user_id: req.user!.id,
  });

  if (error) {
    res.status(500).json({ error: 'Failed to join campaign' });
    return;
  }

  res.json({ message: 'Joined campaign' });
});

export default router;
