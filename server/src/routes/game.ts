import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { processAction, getOpeningScene, resolveRollAction } from '../services/gameEngine';
import { generateProactiveEvent } from '../services/openai';
import type { WorldState, WorldBible, Character } from '../../../shared/types';
import { z } from 'zod';

const router = Router();

const actionSchema = z.object({
  characterId: z.string().uuid(),
  campaignId: z.string().uuid(),
  action: z.string().min(1).max(500),
});

router.post('/action', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = actionSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { characterId, campaignId, action } = parse.data;

  // Verify ownership
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  try {
    const result = await processAction(characterId, action, campaignId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Game engine error';
    res.status(500).json({ error: message });
  }
});

const resolveRollSchema = z.object({
  characterId: z.string().uuid(),
  campaignId: z.string().uuid(),
  rollResult: z.number().int().min(1).max(20),
  rollTotal: z.number().int(),
  dc: z.number().int(),
  success: z.boolean(),
  isCritSuccess: z.boolean(),
  isCritFail: z.boolean(),
  rollContext: z.object({
    stat: z.string(),
    dc: z.number(),
    diceType: z.string(),
    description: z.string(),
    successDescription: z.string(),
    failDescription: z.string(),
    critSuccessDescription: z.string().optional(),
    critFailDescription: z.string().optional(),
    isDramatic: z.boolean(),
    modifier: z.number(),
  }),
});

router.post('/resolve-roll', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = resolveRollSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { characterId, campaignId, rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext } = parse.data;

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  try {
    const result = await resolveRollAction(characterId, campaignId, rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve roll';
    res.status(500).json({ error: message });
  }
});

router.post('/start', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { characterId, campaignId } = req.body;
  if (!characterId || !campaignId) {
    res.status(400).json({ error: 'characterId and campaignId required' });
    return;
  }

  // Verify ownership
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  try {
    const result = await getOpeningScene(characterId, campaignId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start game';
    res.status(500).json({ error: message });
  }
});

router.get('/history/:campaignId/:characterId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId, characterId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
  const partyMode = req.query.party === 'true';

  // Verify campaign membership
  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .single();

  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  let query = supabaseAdmin
    .from('story_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(limit);

  // In solo mode only return this character's events; in party mode return all
  if (!partyMode) {
    query = query.eq('character_id', characterId);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
    return;
  }

  res.json({ events: data || [] });
});

router.get('/scene/:campaignId/:characterId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId, characterId } = req.params;

  const { data: lastEvent } = await supabaseAdmin
    .from('story_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('world_state')
    .eq('id', campaignId)
    .single();

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .single();

  res.json({
    lastEvent,
    worldState: campaign?.world_state,
    character,
  });
});

router.get('/proactive/:campaignId/:characterId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId, characterId } = req.params;

  // Verify campaign membership
  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .single();

  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Check last story event time — only fire if last event was > 2 minutes ago
  const { data: lastEvent } = await supabaseAdmin
    .from('story_events')
    .select('created_at')
    .eq('campaign_id', campaignId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastEvent) {
    const elapsed = Date.now() - new Date(lastEvent.created_at).getTime();
    if (elapsed < 2 * 60 * 1000) {
      res.status(204).end();
      return;
    }
  }

  const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  const { data: character } = await supabaseAdmin.from('characters').select('*').eq('id', characterId).single();

  if (!campaign || !character) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const result = await generateProactiveEvent(
      campaign.world_state as WorldState,
      campaign.world_bible as WorldBible,
      character as Character
    );

    // Save to story_events
    await supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'narration',
      content: result.narration,
      metadata: { isProactiveEvent: true, suggestedActions: result.suggestedActions },
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate proactive event';
    res.status(500).json({ error: message });
  }
});

export default router;
