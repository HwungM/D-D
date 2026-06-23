import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { processAction, getOpeningScene, getCoopOpeningScene, resolveRollAction, resolveCoopRollAction, processCoopAction, getStatModifier, compressToJournalEntry } from '../services/gameEngine';
import { generateEpilogue } from '../services/openai';
import type { WorldState, WorldBible, Character } from '../../../shared/types';
import { z } from 'zod';
import { aiRateLimit } from '../middleware/rateLimit';

const router = Router();
const COOP_TURN_TIMEOUT_MS = 5 * 60 * 1000;
const campaignLocks = new Map<string, Promise<void>>();

async function withCampaignLock<T>(campaignId: string, fn: () => Promise<T>): Promise<T> {
  const previous = campaignLocks.get(campaignId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const next = previous.catch(() => undefined).then(() => current);
  campaignLocks.set(campaignId, next);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (campaignLocks.get(campaignId) === next) campaignLocks.delete(campaignId);
  }
}

const actionSchema = z.object({
  characterId: z.string().uuid(),
  campaignId: z.string().uuid(),
  action: z.string().min(1).max(500),
  requestId: z.string().uuid().optional(),
});

router.post('/action', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = actionSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { characterId, campaignId, action, requestId } = parse.data;

  // Verify ownership and campaign pairing
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id, name, campaign_id, is_alive')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character || character.campaign_id !== campaignId) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }
  if (character.is_alive === false) {
    res.status(400).json({ error: 'This character can no longer act' });
    return;
  }

  try {
    const { data: activeCharacters } = await supabaseAdmin
      .from('characters')
      .select('id, user_id')
      .eq('campaign_id', campaignId)
      .eq('is_alive', true);
    const activePlayerCount = new Set((activeCharacters || []).map(c => c.user_id)).size;

    if (activePlayerCount > 1) {
      await withCampaignLock(campaignId, async () => {
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
      const pendingCreatedAt = ws.pendingTurn?.createdAt || ws.pendingTurn?.actions?.[0]?.submittedAt;
      const pendingStartedAt = pendingCreatedAt ? Date.parse(pendingCreatedAt) : NaN;
      const pendingIsStale = Number.isFinite(pendingStartedAt) && Date.now() - pendingStartedAt > COOP_TURN_TIMEOUT_MS;
      const activePendingTurn = pendingIsStale ? null : ws.pendingTurn;
      const roundId = activePendingTurn?.roundId || crypto.randomUUID();
      const pendingActions = activePendingTurn?.actions || [];
      const createdAt = activePendingTurn?.createdAt || new Date().toISOString();
      const expiresAt = new Date(Date.parse(createdAt) + COOP_TURN_TIMEOUT_MS).toISOString();

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

      if (newActions.length < activePlayerCount) {
        // Save pending, return waiting
        await supabaseAdmin.from('campaigns').update({
          world_state: { ...ws, pendingTurn: { actions: newActions, roundId, createdAt, expiresAt } }
        }).eq('id', campaignId);
        res.json({
          status: 'waiting',
          waitingFor: 'partner',
          roundId,
          submittedCount: newActions.length,
          neededCount: activePlayerCount,
          expiresAt,
        });
        return;
      }

      // All submitted — process together
      await supabaseAdmin.from('campaigns').update({
        world_state: { ...ws, pendingTurn: null }
      }).eq('id', campaignId);

      const result = await processCoopAction(campaignId, newActions);
      res.json({ status: 'complete', ...result });
      return;
      });
      return;
    }

    // Solo path: serialize turns and reserve a request id before the expensive
    // AI call. A network retry can no longer apply the same turn twice.
    await withCampaignLock(campaignId, async () => {
      if (requestId) {
        const { data: campaign } = await supabaseAdmin
          .from('campaigns')
          .select('world_state')
          .eq('id', campaignId)
          .single();
        const ws = (campaign?.world_state || {}) as WorldState;
        if ((ws.processedActionRequests || []).includes(requestId)) {
          res.status(409).json({ error: 'This action was already processed' });
          return;
        }
        const processedActionRequests = [...(ws.processedActionRequests || []), requestId].slice(-100);
        await supabaseAdmin
          .from('campaigns')
          .update({ world_state: { ...ws, processedActionRequests } })
          .eq('id', campaignId);
      }

      try {
        const result = await processAction(characterId, action, campaignId);
        res.json(result);
      } catch (error) {
        if (requestId) {
          const { data: campaign } = await supabaseAdmin
            .from('campaigns')
            .select('world_state')
            .eq('id', campaignId)
            .single();
          const ws = (campaign?.world_state || {}) as WorldState;
          await supabaseAdmin
            .from('campaigns')
            .update({ world_state: { ...ws, processedActionRequests: (ws.processedActionRequests || []).filter(id => id !== requestId) } })
            .eq('id', campaignId);
        }
        throw error;
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Game engine error';
    res.status(500).json({ error: message });
  }
});

const resolveRollSchema = z.object({
  characterId: z.string().uuid(),
  campaignId: z.string().uuid(),
});

const storedRollContextSchema = z.object({
  stat: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
  dc: z.number().int().min(1).max(30),
  diceType: z.string(),
  description: z.string(),
  successDescription: z.string(),
  failDescription: z.string(),
  critSuccessDescription: z.string().optional(),
  critFailDescription: z.string().optional(),
  isDramatic: z.boolean(),
  modifier: z.number().optional(),
});

router.post('/resolve-roll', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = resolveRollSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { characterId, campaignId } = parse.data;

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('user_id, campaign_id, stats')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character || character.campaign_id !== campaignId) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  try {
    await withCampaignLock(campaignId, async () => {
      const { data: campaignRow } = await supabaseAdmin
        .from('campaigns')
        .select('world_state')
        .eq('id', campaignId)
        .single();
      const pendingCoopRoll = (campaignRow?.world_state as WorldState | undefined)?.coopPendingRoll;

      if (pendingCoopRoll && pendingCoopRoll.actingCharacterId !== characterId) {
        res.status(409).json({ error: 'Your partner holds the dice for this turn. Wait for their roll.' });
        return;
      }

      let pendingEventId: string | null = null;
      let pendingMetadata: Record<string, unknown> | null = null;
      let storedRollContext: unknown = pendingCoopRoll?.rollContext;

      if (!pendingCoopRoll) {
        const { data: pendingEvent } = await supabaseAdmin
          .from('story_events')
          .select('id, metadata')
          .eq('campaign_id', campaignId)
          .eq('character_id', characterId)
          .eq('event_type', 'narration')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        pendingEventId = pendingEvent?.id || null;
        pendingMetadata = pendingEvent?.metadata as Record<string, unknown> | null;
        storedRollContext = pendingMetadata?.rollContext;

        if (!pendingEventId || pendingMetadata?.awaitingRoll !== true) {
          res.status(409).json({ error: 'No unresolved roll is pending for this character' });
          return;
        }
      }

      const contextParse = storedRollContextSchema.safeParse(storedRollContext);
      if (!contextParse.success) {
        res.status(409).json({ error: 'The pending roll challenge is invalid or incomplete' });
        return;
      }

      if (pendingEventId && pendingMetadata) {
        const claimedMetadata = { ...pendingMetadata, awaitingRoll: false, rollStatus: 'resolving' };
        const { data: claimedEvent } = await supabaseAdmin
          .from('story_events')
          .update({ metadata: claimedMetadata })
          .eq('id', pendingEventId)
          .contains('metadata', { awaitingRoll: true })
          .select('id')
          .single();

        if (!claimedEvent) {
          res.status(409).json({ error: 'This roll has already been resolved' });
          return;
        }
      }

      const rollContext = contextParse.data;
      try {
        const stats = character.stats as Record<string, number> | null;
        const statValue = typeof stats?.[rollContext.stat] === 'number' ? stats[rollContext.stat] : 10;
        const modifier = getStatModifier(statValue);
        const rollResult = Math.floor(Math.random() * 20) + 1;
        const rollTotal = rollResult + modifier;
        const dc = rollContext.dc;
        const success = rollTotal >= dc;
        const isCritSuccess = rollResult === 20;
        const isCritFail = rollResult === 1;
        const authoritativeContext = { ...rollContext, modifier };

        const result = pendingCoopRoll
          ? await resolveCoopRollAction(campaignId, characterId, rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, authoritativeContext)
          : await resolveRollAction(characterId, campaignId, rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, authoritativeContext);

        if (pendingEventId && pendingMetadata) {
          await supabaseAdmin
            .from('story_events')
            .update({
              metadata: {
                ...pendingMetadata,
                awaitingRoll: false,
                rollStatus: 'resolved',
                resolvedAt: new Date().toISOString(),
              },
            })
            .eq('id', pendingEventId);
        }

        res.json(result);
      } catch (error) {
        if (pendingEventId && pendingMetadata) {
          await supabaseAdmin
            .from('story_events')
            .update({ metadata: { ...pendingMetadata, awaitingRoll: true } })
            .eq('id', pendingEventId);
        }
        throw error;
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve roll';
    res.status(500).json({ error: message });
  }
});

router.post('/start', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
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
    // Co-op detection mirrors /action: more than one distinct living player means
    // the opening must be ONE shared single-camera scene, not a per-character solo
    // opening (which produced near-identical openings from the same world bible).
    const { data: activeCharacters } = await supabaseAdmin
      .from('characters')
      .select('id, user_id')
      .eq('campaign_id', campaignId)
      .eq('is_alive', true);
    const activePlayerCount = new Set((activeCharacters || []).map(c => c.user_id)).size;

    if (activePlayerCount > 1) {
      const result = await withCampaignLock(campaignId, () => getCoopOpeningScene(campaignId, characterId));
      res.json(result);
      return;
    }

    const result = await withCampaignLock(campaignId, () => getOpeningScene(characterId, campaignId));
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start game';
    res.status(500).json({ error: message });
  }
});

const sessionSchema = z.object({
  characterId: z.string().uuid(),
});

router.get('/session/:campaignId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId } = req.params;
  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('world_state')
    .eq('id', campaignId)
    .single();
  const ws = (campaign?.world_state || {}) as WorldState;
  res.json({ activeSession: ws.activeSession || null, lastSessionRecap: ws.lastSessionRecap || null });
});

router.post('/session/:campaignId/start', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId } = req.params;
  const parse = sessionSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { characterId } = parse.data;

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .single();
  if (!character) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  await withCampaignLock(campaignId, async () => {
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('world_state')
      .eq('id', campaignId)
      .single();
    const ws = (campaign?.world_state || {}) as WorldState;
    if (ws.activeSession) {
      res.json({ activeSession: ws.activeSession, resumed: true });
      return;
    }

    const sessionNumber = (ws.sessionCount || 0) + 1;
    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .insert({
        campaign_id: campaignId,
        character_id: characterId,
        session_number: sessionNumber,
        started_by: req.user!.id,
        status: 'active',
      })
      .select('id, created_at')
      .single();
    if (error || !session) {
      res.status(500).json({ error: 'Failed to begin session' });
      return;
    }

    const activeSession = {
      id: session.id,
      sessionNumber,
      startedAt: session.created_at,
      startedBy: req.user!.id,
    };
    await supabaseAdmin
      .from('campaigns')
      .update({ world_state: { ...ws, activeSession, sessionNotes: [] } })
      .eq('id', campaignId);
    res.status(201).json({ activeSession, resumed: false });
  });
});

router.post('/session/:campaignId/end', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId } = req.params;
  const parse = sessionSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }

  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  await withCampaignLock(campaignId, async () => {
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('world_state, act')
      .eq('id', campaignId)
      .single();
    const ws = (campaign?.world_state || {}) as WorldState;
    const active = ws.activeSession;
    if (!active) {
      res.status(409).json({ error: 'No active session to end' });
      return;
    }

    const { data: events } = await supabaseAdmin
      .from('story_events')
      .select('event_type, content, created_at')
      .eq('campaign_id', campaignId)
      .gte('created_at', active.startedAt)
      .order('created_at', { ascending: true })
      .limit(300);
    const eventNotes = (events || [])
      .filter(event => event.event_type === 'action' || event.event_type === 'narration')
      .map(event => `[${event.event_type}] ${String(event.content).slice(0, 500)}`);
    const notes = eventNotes.length > 0 ? eventNotes : (ws.sessionNotes || []);
    const recap = await compressToJournalEntry(
      campaignId,
      notes.length > 0 ? notes : ['The party gathered, took stock, and prepared for what comes next.'],
      campaign?.act || 1,
      active.sessionNumber,
    );

    const endedAt = new Date().toISOString();
    const { error: sessionError } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'completed',
        ended_at: endedAt,
        summary: recap.summary,
        journal_entry: recap.summary,
        key_decisions: recap.keyDecisions,
        major_npcs: recap.majorNPCsIntroduced,
        event_count: events?.length || 0,
      })
      .eq('id', active.id);
    if (sessionError) {
      res.status(500).json({ error: 'Failed to save session recap' });
      return;
    }

    const worldState = {
      ...ws,
      activeSession: null,
      lastSessionRecap: recap,
      sessionCount: active.sessionNumber,
      sessionNotes: [],
      campaignJournal: [...(ws.campaignJournal || []), recap].slice(-100),
    };
    await supabaseAdmin.from('campaigns').update({ world_state: worldState }).eq('id', campaignId);
    res.json({ recap, endedAt });
  });
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

  // Fetch the NEWEST events (descending + limit), then reverse so the response
  // stays oldest-first for the client. Ascending + limit returned the oldest N
  // rows, so any campaign longer than the limit reloaded into its opening scenes.
  let query = supabaseAdmin
    .from('story_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
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

  res.json({ events: (data || []).reverse() });
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

  // "Previously on..." recap when returning after a long break
  let recap: { summary: string; keyDecisions: string[]; sessionNumber: number; gapHours: number } | null = null;
  const ws = (campaign.world_state || {}) as WorldState;
  if (lastEvent?.created_at) {
    const gapHours = (Date.now() - new Date(lastEvent.created_at).getTime()) / (1000 * 60 * 60);
    if (gapHours >= 3) {
      const lastJournalEntry = (ws.campaignJournal || [])[((ws.campaignJournal || []).length || 1) - 1];
      if (lastJournalEntry) {
        recap = {
          summary: lastJournalEntry.summary,
          keyDecisions: lastJournalEntry.keyDecisions || [],
          sessionNumber: lastJournalEntry.sessionNumber,
          gapHours: Math.round(gapHours),
        };
      }
    }
  }

  res.json({
    lastEvent,
    worldState: campaign.world_state,
    character,
    recap,
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
    .select('user_id, campaign_id')
    .eq('id', characterId)
    .eq('user_id', req.user!.id)
    .single();

  if (!character) {
    res.status(403).json({ error: 'Character not found or not yours' });
    return;
  }

  const { data: testCampaign } = await supabaseAdmin
    .from('campaigns')
    .select('id')
    .eq('id', character.campaign_id)
    .eq('created_by', req.user!.id)
    .eq('campaign_type', 'testing')
    .single();

  if (!testCampaign) {
    res.status(403).json({ error: 'Dev actions are limited to testing campaigns you created' });
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

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('world_state')
    .eq('id', campaignId)
    .eq('created_by', req.user!.id)
    .eq('campaign_type', 'testing')
    .single();
  if (!campaign) {
    res.status(403).json({ error: 'Dev actions are limited to testing campaigns you created' });
    return;
  }

  const ws = campaign.world_state as Record<string, unknown>;
  ws.combatState = null;
  ws.currentSceneSummary = null;
  ws.actionsSinceLastSummary = 0;

  await supabaseAdmin.from('campaigns').update({ world_state: ws }).eq('id', campaignId);
  res.json({ success: true });
});

// DEV ONLY: patch world_state/act fields directly to fast-forward a testing campaign
// to a specific state (e.g. near endgame, large map, pending future hooks). The patch
// is merged into world_state and read by the normal game loop on the next action -
// no special-cased AI behavior is introduced.
router.post('/dev-patch/:campaignId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_ENDPOINTS) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { campaignId } = req.params;
  const { worldState, act } = req.body as { worldState?: Record<string, unknown>; act?: number };

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('world_state, campaign_type')
    .eq('id', campaignId)
    .eq('created_by', req.user!.id)
    .single();

  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
  if (campaign.campaign_type !== 'testing') { res.status(403).json({ error: 'Dev patches are only allowed on testing campaigns' }); return; }

  const updates: Record<string, unknown> = {};
  if (worldState) {
    updates.world_state = { ...(campaign.world_state as Record<string, unknown>), ...worldState };
  }
  if (typeof act === 'number' && act >= 1) {
    updates.act = act;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No patch fields provided' });
    return;
  }

  await supabaseAdmin.from('campaigns').update(updates).eq('id', campaignId);
  const { data: updated } = await supabaseAdmin.from('campaigns').select('world_state, act').eq('id', campaignId).single();
  res.json({ success: true, worldState: updated?.world_state, act: updated?.act });
});

router.post('/epilogue/:campaignId/:characterId', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
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
