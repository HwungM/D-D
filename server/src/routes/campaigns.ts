import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { generateStorySeed, generateWorldBible } from '../services/openai';
import { z } from 'zod';
import type { LocationGraph, PartyComposition, WorldBible, WorldState } from '../../../shared/types';
import { aiRateLimit } from '../middleware/rateLimit';
import { generateStartingCompanions } from '../services/companionGenerationService';

const router = Router();

router.get('/seeds', requireAuth, aiRateLimit, async (_req: AuthRequest, res: Response): Promise<void> => {
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
  campaignType: z.enum(['adventure', 'testing']).optional().default('adventure'),
});

function initialLocationGraph(worldBible: WorldBible): LocationGraph {
  const now = new Date().toISOString();
  const currentLocation = worldBible.geography[0]?.name || 'Unknown';
  const nodes = worldBible.geography.map((entry, index) => {
    const current = entry.name === currentLocation;
    const nearby = worldBible.geography
      .filter((candidate, candidateIndex) => candidate.name !== entry.name && Math.abs(candidateIndex - index) <= 2)
      .map(candidate => candidate.name)
      .slice(0, 4);
    return {
      name: entry.name,
      region: entry.type === 'region' ? entry.name : worldBible.geography.find(candidate => candidate.type === 'region')?.name || 'Known Realm',
      description: entry.description,
      type: entry.type,
      discoveredAt: now,
      lastVisitedAt: current ? now : undefined,
      visits: current ? 1 : 0,
      connectedTo: nearby,
      npcsPresent: [],
      questHooks: [],
      partyHere: current ? ['current'] : [],
      tags: current ? [entry.type, 'current'] : [entry.type],
    };
  });
  const regionMap = new Map<string, string[]>();
  for (const node of nodes) regionMap.set(node.region, [...(regionMap.get(node.region) || []), node.name]);
  return {
    currentLocation,
    nodes,
    regions: Array.from(regionMap.entries()).map(([name, locations]) => ({ name, locations })),
    nearby: nodes.find(node => node.name === currentLocation)?.connectedTo || [],
    updatedAt: now,
  };
}

router.post('/', requireAuth, aiRateLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { name, storySeed, campaignType } = parse.data;
  const playerPreferences = req.body.playerPreferences as
    | {
        playMode?: 'solo' | 'collaborative';
        partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now';
        tone?: string;
        artStyle?: string;
        favoritePillars?: string[];
        playerCount?: number;
        targetPlayerCount?: number;
        waitForParty?: boolean;
        characterConcepts?: string[];
        partyComposition?: PartyComposition;
      }
    | undefined;

  try {
    const worldBible = await generateWorldBible(storySeed, playerPreferences);
    const openingLocation = worldBible.geography[0]?.name || 'Unknown';
    const locationGraph = initialLocationGraph(worldBible);
    const companions = generateStartingCompanions(worldBible, playerPreferences?.partyComposition);
    const initialWorldState: WorldState = {
      currentLocation: openingLocation,
      timeOfDay: 'day',
      activeQuests: [],
      completedEvents: [],
      factionStandings: {},
      discoveredLocations: [openingLocation],
      locationGraph,
      globalFlags: {},
      ...(companions.length > 0 ? { companions } : {}),
      ...(companions.length > 0 ? {
        companionLocations: Object.fromEntries(companions.map(companion => [companion.id, {
          location: openingLocation,
          activity: 'Staying with the party',
          updatedAt: new Date().toISOString(),
        }]))
      } : {}),
    };

    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name,
        story_seed: storySeed,
        created_by: req.user!.id,
        world_state: initialWorldState,
        world_bible: worldBible,
        act: 1,
        campaign_type: campaignType,
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

  const seen = new Set<string>()
  const campaigns = (data?.map((m: { campaigns: unknown }) => m.campaigns).filter(Boolean) || [])
    .filter((c: unknown) => {
      const id = (c as { id: string }).id
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
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

// The party_invites table comes from migration 002, which not every deployment
// has applied. When it's unavailable, fall back to using the campaign id itself
// as the invite code - the accept/preview routes below understand both forms.
function fallbackInvite(campaignId: string, invitedBy: string) {
  return {
    campaign_id: campaignId,
    invited_by: invitedBy,
    invite_code: campaignId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    fallback: true,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Create an invite link for a campaign
router.post('/:id/invite', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  // Verify membership
  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', id)
    .eq('user_id', req.user!.id)
    .single();

  if (!membership) {
    res.status(403).json({ error: 'Not a campaign member' });
    return;
  }

  // Reuse an existing unexpired invite for this campaign instead of minting a new one each time
  const { data: existingInvite } = await supabaseAdmin
    .from('party_invites')
    .select()
    .eq('campaign_id', id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingInvite) {
    res.json({ invite: existingInvite });
    return;
  }

  // Generate unique invite code
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  const { data: invite, error } = await supabaseAdmin
    .from('party_invites')
    .insert({
      campaign_id: id,
      invited_by: req.user!.id,
      invite_code: inviteCode,
    })
    .select()
    .single();

  if (error || !invite) {
    // Table missing or insert failed - hand out the always-valid fallback code
    res.json({ invite: fallbackInvite(id, req.user!.id) });
    return;
  }

  res.json({ invite });
});

// Accept invite by code
router.post('/invite/:code/accept', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { code } = req.params;

  let { data: invite } = await supabaseAdmin
    .from('party_invites')
    .select('*')
    .eq('invite_code', code)
    .maybeSingle();

  // Fallback: the code may be a campaign id (issued when party_invites is unavailable)
  if (!invite && UUID_RE.test(code)) {
    const { data: campaignById } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('id', code)
      .maybeSingle();
    if (campaignById) {
      invite = fallbackInvite(campaignById.id, req.user!.id);
    }
  }

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  if (new Date(invite.expires_at) < new Date()) {
    res.status(410).json({ error: 'Invite has expired' });
    return;
  }

  // Check already a member
  const { data: existing } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', invite.campaign_id)
    .eq('user_id', req.user!.id)
    .single();

  if (!existing) {
    await supabaseAdmin.from('campaign_members').insert({
      campaign_id: invite.campaign_id,
      user_id: req.user!.id,
    });
  }

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', invite.campaign_id)
    .single();

  res.json({ campaign });
});

// Get invite info (preview before accepting)
router.get('/invite/:code', async (req, res: Response): Promise<void> => {
  const { code } = req.params;

  const { data: invite } = await supabaseAdmin
    .from('party_invites')
    .select('*, campaigns(name, story_seed), profiles(username)')
    .eq('invite_code', code)
    .maybeSingle();

  if (invite) {
    res.json({ invite });
    return;
  }

  // Fallback: treat a campaign id as its own invite code
  if (UUID_RE.test(code)) {
    const { data: campaignById } = await supabaseAdmin
      .from('campaigns')
      .select('id, name, story_seed, created_by')
      .eq('id', code)
      .maybeSingle();
    if (campaignById) {
      const { data: hostProfile } = campaignById.created_by
        ? await supabaseAdmin.from('profiles').select('username').eq('id', campaignById.created_by).maybeSingle()
        : { data: null };
      res.json({
        invite: {
          ...fallbackInvite(campaignById.id, campaignById.created_by || ''),
          campaigns: { name: campaignById.name, story_seed: campaignById.story_seed },
          profiles: { username: hostProfile?.username || 'A party host' },
        },
      });
      return;
    }
  }

  res.status(404).json({ error: 'Invite not found' });
});

// Get party members for a campaign
router.get('/:id/party', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
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

  const { data: members } = await supabaseAdmin
    .from('campaign_members')
    .select('user_id, profiles(username)')
    .eq('campaign_id', id);

  if (!members) {
    res.json({ members: [] });
    return;
  }

  // Get active character for each member
  const partyData = await Promise.all(
    members.map(async (m: { user_id: string; profiles: { username: string }[] | { username: string } | null }) => {
      const { data: chars } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('campaign_id', id)
        .eq('user_id', m.user_id)
        .eq('is_alive', true)
        .order('created_at', { ascending: false })
        .limit(1);

      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        userId: m.user_id,
        username: profile?.username || 'Unknown',
        character: chars?.[0] || null,
      };
    })
  );

  res.json({ members: partyData });
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  // Verify ownership — check created_by, fall back to membership for old campaigns
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  // If created_by is set, only the creator can delete. If null (old record), any member can delete.
  if (campaign.created_by && campaign.created_by !== req.user!.id) {
    res.status(403).json({ error: 'Only the campaign creator can delete it' });
    return;
  }

  if (!campaign.created_by) {
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
  }

  const cleanupTables = ['story_events', 'sessions', 'npcs', 'party_invites', 'characters', 'campaign_members'] as const;
  for (const table of cleanupTables) {
    const { error } = await supabaseAdmin.from(table).delete().eq('campaign_id', id);
    if (error) {
      res.status(500).json({ error: `Failed to delete campaign data from ${table}` });
      return;
    }
  }

  const { error: deleteError } = await supabaseAdmin.from('campaigns').delete().eq('id', id);

  if (deleteError) {
    res.status(500).json({ error: 'Failed to delete campaign completely' });
    return;
  }

  res.json({ success: true });
});

export default router;
