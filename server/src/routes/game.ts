import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { processAction, getOpeningScene, resolveRollAction, processCoopAction } from '../services/gameEngine';
import { generateEpilogue } from '../services/openai';
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

  // Verify ownership and campaign pairing
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id, name, campaign_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character || character.campaign_id !== campaignId) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  try {
    // Check if co-op campaign (more than 1 member)
    const { count: memberCount } = await supabaseAdmin
      .from('campaign_members')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    if (memberCount && memberCount > 1) {
      const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('world_state')
        .eq('id', campaignId)
        .single();

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }

      const ws = campaign.world_state as WorldState;
      const roundId = ws.pendingTurn?.roundId || crypto.randomUUID();
      const pendingActions = ws.pendingTurn?.actions || [];

      // Prevent double-submit
      if (pendingActions.some(a => a.characterId === characterId)) {
        res.status(409).json({ error: 'Already submitted for this round' });
        return;
      }

      const newActions = [...pendingActions, {
        characterId,
        userId: req.user!.id,
        action,
        characterName: (character as { name: string }).name,
        submittedAt: new Date().toISOString(),
      }];

      if (newActions.length < memberCount) {
        // Save pending, return waiting
        await supabaseAdmin.from('campaigns').update({
          world_state: { ...ws, pendingTurn: { actions: newActions, roundId } }
        }).eq('id', campaignId);
        res.json({ status: 'waiting', waitingFor: 'partner' });
        return;
      }

      // All submitted — process together
      await supabaseAdmin.from('campaigns').update({
        world_state: { ...ws, pendingTurn: null }
      }).eq('id', campaignId);

      const result = await processCoopAction(campaignId, newActions);
      res.json({ status: 'complete', ...result });
      return;
    }

    // Solo path
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
    .select('user_id, campaign_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character || character.campaign_id !== campaignId) {
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

  // Verify ownership and campaign pairing
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id, campaign_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character || character.campaign_id !== campaignId) {
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

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

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

  if (!campaign) {
    res.status(404).json({ error: 'Campaign or character not found' });
    return;
  }

  res.json({
    lastEvent,
    worldState: campaign.world_state,
    character,
  });
});

// DEV ONLY: instantly kill a character for testing the death flow
router.post('/dev-kill/:characterId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_ENDPOINTS) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { characterId } = req.params;

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

  const { data: char } = await supabaseAdmin.from('characters').select('name, class, race, level').eq('id', characterId).single();
  const { error } = await supabaseAdmin
    .from('characters')
    .update({ hp: 0, is_alive: false, death_note: 'Slain by mysterious forces during a dev test.' })
    .eq('id', characterId);

  if (error) {
    res.status(500).json({ error: 'Failed to kill character' });
    return;
  }

  // Record death in world state
  if (char) {
    const { data: charCampaign } = await supabaseAdmin.from('characters').select('campaign_id').eq('id', characterId).single();
    if (charCampaign) {
      const { data: camp } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', charCampaign.campaign_id).single();
      if (camp) {
        const ws = (camp.world_state || {}) as Record<string, unknown>;
        const fallen = Array.isArray(ws.fallenHeroes) ? ws.fallenHeroes : [];
        fallen.push({ name: char.name, race: char.race, class: char.class, level: char.level, cause: 'dev test', diedAt: new Date().toISOString() });
        ws.fallenHeroes = fallen;
        await supabaseAdmin.from('campaigns').update({ world_state: ws }).eq('id', charCampaign.campaign_id);
      }
    }
  }

  res.json({ success: true, message: 'Character has met their end.' });
});

// DEV ONLY: clear stuck combat state
router.post('/dev-clear-combat/:campaignId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_ENDPOINTS) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { campaignId } = req.params;

  const { data: campaign } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaignId).single();
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

  const ws = campaign.world_state as Record<string, unknown>;
  ws.combatState = null;
  ws.currentSceneSummary = null;
  ws.actionsSinceLastSummary = 0;

  await supabaseAdmin.from('campaigns').update({ world_state: ws }).eq('id', campaignId);
  res.json({ success: true });
});

router.post('/epilogue/:campaignId/:characterId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId, characterId } = req.params;
  const { victory } = req.body;

  const [{ data: campaign }, { data: character }] = await Promise.all([
    supabaseAdmin.from('campaigns').select('world_state, world_bible').eq('id', campaignId).single(),
    supabaseAdmin.from('characters').select('*').eq('id', characterId).eq('campaign_id', campaignId).eq('user_id', req.user!.id).single(),
  ]);

  if (!campaign || !character) {
    res.status(404).json({ error: 'Campaign or character not found' });
    return;
  }

  try {
    const epilogue = await generateEpilogue(
      campaign.world_state as WorldState,
      campaign.world_bible as WorldBible,
      character as Character,
      !!victory
    );
    res.json({ epilogue });
  } catch (err) {
    console.error('Epilogue generation failed:', err);
    res.status(500).json({ error: 'Failed to generate epilogue' });
  }
});

export default router;
