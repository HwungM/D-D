import { supabaseAdmin } from './supabase';
import { generateNarration, generateRollOutcome, generateSceneSummary, generateVillainMove, runStoryDirector, extractFutureHooks, generateCoopNarration } from './openai';
import OpenAI from 'openai';
import type { Character, WorldState, WorldBible, DiceRollResult, ActionResult, StoryEvent, StatusEffect, ShopItem, CampaignJournalEntry, CharacterHistoryEntry, RollContext, CharacterOnlineStatus, NpcMemory, ActiveQuest } from '../../../shared/types';
import { XP_THRESHOLDS, CLASS_BASE_HP } from '../../../shared/types';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import { getAbilityForLevel } from '../../../shared/classAbilities';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isNpcMemory(value: unknown): value is NpcMemory {
  return isRecord(value) && typeof value.name === 'string' && typeof value.notes === 'string';
}

function isActiveQuest(value: unknown): value is ActiveQuest {
  return isRecord(value) && typeof value.title === 'string' && typeof value.description === 'string';
}

function mergeWorldStateChanges(current: WorldState, changes: Partial<WorldState>): WorldState {
  const merged = { ...current };

  // Per-character location â€” only update the specific character's entry
  if (changes.characterLocations) {
    merged.characterLocations = { ...current.characterLocations, ...changes.characterLocations };
  }

  // currentLocation: only update if provided (for the acting character)
  if (changes.currentLocation) merged.currentLocation = changes.currentLocation;

  // npcMemory: merge by name (upsert), preserving metCharacters + interactionCount from both sides
  if (changes.npcMemory) {
    const npcArray = (Array.isArray(changes.npcMemory) ? changes.npcMemory : Object.values(changes.npcMemory)).filter(isNpcMemory);
    const existing = new Map((current.npcMemory || []).map(n => [n.name, n]));
    const keyNpcMap = new Map((current.keyNPCs || []).map(n => [n.name, n]));

    for (const npc of npcArray) {
      const prev = existing.get(npc.name);
      const metChars = Array.from(new Set([...(prev?.metCharacters || []), ...(npc.metCharacters || [])]));
      const interactionCount = (prev?.interactionCount || 0) + 1;
      const merged_npc = { ...prev, ...npc, metCharacters: metChars, interactionCount };
      existing.set(npc.name, merged_npc);

      // Promote to keyNPCs when interaction count reaches 3 or AI explicitly flags them
      if ((interactionCount >= 3 || npc.isKeyNPC) && !keyNpcMap.has(npc.name)) {
        keyNpcMap.set(npc.name, { ...merged_npc, isKeyNPC: true });
      } else if (keyNpcMap.has(npc.name)) {
        keyNpcMap.set(npc.name, { ...keyNpcMap.get(npc.name)!, ...npc, metCharacters: metChars, interactionCount });
      }
    }

    merged.npcMemory = Array.from(existing.values()).slice(-20); // rolling 20 NPCs
    // keyNPCs: never pruned, capped at 8 (oldest promoted out when full, they're still in npcMemory)
    const keyList = Array.from(keyNpcMap.values());
    merged.keyNPCs = keyList.slice(-8);
  }

  // activeQuests: merge by title (upsert)
  if (changes.activeQuests) {
    const questArray = (Array.isArray(changes.activeQuests) ? changes.activeQuests : Object.values(changes.activeQuests)).filter(isActiveQuest);
    const existing = new Map((current.activeQuests || []).map(q => [q.title, q]));
    for (const q of questArray) existing.set(q.title, { ...existing.get(q.title), ...q, startedAt: existing.get(q.title)?.startedAt || new Date().toISOString() });
    merged.activeQuests = Array.from(existing.values());
  }

  // discoveredLocations: union, capped at 100
  if (changes.discoveredLocations) {
    const all = Array.from(new Set([...(current.discoveredLocations || []), ...changes.discoveredLocations]));
    merged.discoveredLocations = all.slice(-100);
  }

  // factionStandings: merge (last write wins per faction)
  if (changes.factionStandings) {
    merged.factionStandings = { ...current.factionStandings, ...changes.factionStandings };
  }

  // sessionNotes: append new ones only
  if (changes.sessionNotes) {
    const notesArray = Array.isArray(changes.sessionNotes) ? asStringArray(changes.sessionNotes) : asStringArray(Object.values(changes.sessionNotes));
    const existing = new Set(current.sessionNotes || []);
    const newNotes = notesArray.filter(n => !existing.has(n));
    merged.sessionNotes = [...(current.sessionNotes || []), ...newNotes];
  }

  // characterLastSeen: merge
  if (changes.characterLastSeen) {
    merged.characterLastSeen = { ...current.characterLastSeen, ...changes.characterLastSeen };
  }

  // foreshadowingLedger: merge by id (upsert)
  if (changes.foreshadowingLedger) {
    const existing = new Map((current.foreshadowingLedger || []).map(f => [f.id, f]));
    for (const entry of changes.foreshadowingLedger) existing.set(entry.id, { ...existing.get(entry.id), ...entry });
    merged.foreshadowingLedger = Array.from(existing.values()).slice(-50);
  }

  // backstoryHooks: merge by characterId+hook (upsert by hook text)
  if (changes.backstoryHooks) {
    const existing = new Map((current.backstoryHooks || []).map(h => [`${h.characterId}:${h.hook}`, h]));
    for (const hook of changes.backstoryHooks) existing.set(`${hook.characterId}:${hook.hook}`, { ...existing.get(`${hook.characterId}:${hook.hook}`), ...hook });
    merged.backstoryHooks = Array.from(existing.values());
  }

  // actGoalsAchieved: union
  if (changes.actGoalsAchieved) {
    merged.actGoalsAchieved = Array.from(new Set([...(current.actGoalsAchieved || []), ...changes.actGoalsAchieved]));
  }

  // shopInventory: merge by location key
  if (changes.shopInventory) {
    merged.shopInventory = { ...(current.shopInventory || {}), ...changes.shopInventory };
  }

  // activeNPC: direct set
  if (changes.activeNPC !== undefined) merged.activeNPC = changes.activeNPC;

  // Simple scalar fields
  for (const key of ['timeOfDay', 'weather', 'campaignJournal', 'antagonistProgress', 'characterHistory', 'combatState', 'currentSceneSummary', 'actionsSinceLastSummary', 'sceneState', 'villainMoveCount', 'endgamePhase', 'actionCount', 'actionsInCurrentAct', 'keyNPCs'] as const) {
    if (changes[key] !== undefined) (merged as Record<string, unknown>)[key] = changes[key];
  }

  return merged;
}

export function rollDice(sides: number, modifier: number = 0, count: number = 1): DiceRollResult {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  const rawTotal = rolls.reduce((a, b) => a + b, 0);
  return {
    sides,
    rolls,
    modifier,
    total: Math.max(1, rawTotal + modifier),
  };
}

export function getStatModifier(statValue: number): number {
  return Math.floor((statValue - 10) / 2);
}

export function checkLevelUp(character: Character): { leveledUp: boolean; newLevel?: number; hpGain?: number } {
  const currentLevelThreshold = XP_THRESHOLDS[character.level] ?? Infinity;
  if (character.xp >= currentLevelThreshold && character.level < 20) {
    const newLevel = character.level + 1;
    const baseHp = CLASS_BASE_HP[character.class as keyof typeof CLASS_BASE_HP] ?? 8;
    const hpGain = Math.floor(baseHp / 2) + 1 + getStatModifier(character.stats.con);
    return { leveledUp: true, newLevel, hpGain: Math.max(1, hpGain) };
  }
  return { leveledUp: false };
}

export async function compressToJournalEntry(
  _campaignId: string,
  sessionNotes: string[],
  actNumber: number,
  sessionCount: number
): Promise<CampaignJournalEntry> {
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a campaign journal scribe. Compress session notes into a brief journal entry. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Compress these session notes into a journal entry. Extract key decisions and notable NPCs introduced.

Session notes:
${sessionNotes.join('\n')}

Return JSON:
{
  "summary": "2-3 sentence summary of the session",
  "keyDecisions": ["decision 1", "decision 2"],
  "majorNPCsIntroduced": ["npc name 1", "npc name 2"]
}`,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return {
    actNumber,
    sessionNumber: sessionCount,
    summary: parsed.summary || 'Session events recorded.',
    keyDecisions: parsed.keyDecisions || [],
    majorNPCsIntroduced: parsed.majorNPCsIntroduced || [],
    createdAt: new Date().toISOString(),
  };
}

export async function applyConsequences(
  characterId: string,
  actionResult: {
    worldStateChanges?: Partial<WorldState>;
    isLevelUp?: boolean;
    isDeath?: boolean;
    deathDescription?: string;
    xpGained?: number;
    hpChange?: number;
    goldChange?: number;
    loot?: { id: string; name: string; description: string; quantity: number; type: string; value?: number }[];
    diceResult?: DiceRollResult;
    diceDC?: number;
    statusEffectChanges?: { add?: { name: string; description: string; type: string; duration?: number }[]; remove?: string[] };
    sessionNote?: string;
    characterHistoryNote?: CharacterHistoryEntry;
    antagonistUpdate?: { name: string; newStep?: string; lastAction?: string; nowKnowsPlayers?: boolean };
    isRest?: boolean;
    abilityUsed?: string;
    consumedItems?: string[];
  },
  currentCharacter: Character,
  campaign: { id: string; world_state: WorldState; act?: number }
): Promise<{ updatedCharacter: Character; updatedWorldState: WorldState }> {
  const validItemTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const updates: Partial<Character> = {};

  // Re-fetch latest world state right before writing to minimize race window in co-op
  const { data: freshCampaign } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaign.id).single();
  const latestWorldState = (freshCampaign?.world_state as WorldState) || campaign.world_state;
  let newWorldState = { ...latestWorldState };

  // Apply world state changes (smart patch merge)
  if (actionResult.worldStateChanges) {
    newWorldState = mergeWorldStateChanges(newWorldState, actionResult.worldStateChanges as Partial<WorldState>);
  }

  // Apply HP changes
  if (actionResult.hpChange !== undefined && !isNaN(actionResult.hpChange)) {
    updates.hp = Math.max(0, Math.min(currentCharacter.max_hp, currentCharacter.hp + actionResult.hpChange));
  }

  // Apply gold changes â€” validate to prevent NaN/runaway values from AI
  if (actionResult.goldChange !== undefined && !isNaN(actionResult.goldChange)) {
    const clampedChange = Math.max(-10000, Math.min(10000, Math.round(actionResult.goldChange)));
    updates.gold = Math.max(0, currentCharacter.gold + clampedChange);
  }

  // Apply loot to inventory
  if (actionResult.loot && actionResult.loot.length > 0) {
    const existingInventory = currentCharacter.inventory || [];
    const newItems = actionResult.loot
      .filter(item => item.name && typeof item.name === 'string')
      .map(item => ({
        id: item.id || crypto.randomUUID(),
        name: item.name,
        description: item.description || '',
        quantity: Math.max(1, Math.round(item.quantity || 1)),
        type: (validItemTypes.has(item.type) ? item.type : 'misc') as 'weapon' | 'armor' | 'potion' | 'misc' | 'key',
        value: typeof item.value === 'number' && !isNaN(item.value) ? item.value : undefined,
      }));
    // Stack items with same name
    const merged = [...existingInventory];
    for (const newItem of newItems) {
      const existing = merged.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());
      if (existing) {
        existing.quantity += newItem.quantity;
      } else {
        merged.push(newItem);
      }
    }
    updates.inventory = merged;
  }

  // Apply XP and check level up
  if (actionResult.xpGained && actionResult.xpGained > 0) {
    updates.xp = currentCharacter.xp + actionResult.xpGained;
    const levelCheck = checkLevelUp({ ...currentCharacter, xp: updates.xp });
    if (levelCheck.leveledUp && levelCheck.newLevel) {
      updates.level = levelCheck.newLevel;
      updates.max_hp = currentCharacter.max_hp + (levelCheck.hpGain ?? 0);
      updates.hp = Math.min(currentCharacter.hp + (levelCheck.hpGain ?? 0), updates.max_hp);
      const newAbility = getAbilityForLevel(currentCharacter.class, levelCheck.newLevel);
      if (newAbility) {
        const existingAbilities = currentCharacter.abilities || [];
        const alreadyHas = existingAbilities.some(a => a.name === newAbility.name);
        if (!alreadyHas) updates.abilities = [...existingAbilities, newAbility];
      }
    }
  }

  // Apply status effects + decrement durations on every action
  {
    let effects: StatusEffect[] = [...(currentCharacter.status_effects || [])];
    effects = effects
      .map(e => e.duration != null ? { ...e, duration: e.duration - 1 } : e)
      .filter(e => e.duration == null || e.duration > 0);

    if (actionResult.statusEffectChanges) {
      if (actionResult.statusEffectChanges.remove) {
        const toRemove = new Set(actionResult.statusEffectChanges.remove.map(n => n.toLowerCase()));
        effects = effects.filter(e => !toRemove.has(e.name.toLowerCase()));
      }
      if (actionResult.statusEffectChanges.add) {
        for (const e of actionResult.statusEffectChanges.add) {
          if (!e.name || typeof e.name !== 'string') continue;
          const validEffectTypes = new Set(['buff', 'debuff', 'neutral']);
          const effectType = validEffectTypes.has(e.type) ? e.type : 'neutral';
          const existing = effects.findIndex(x => x.name.toLowerCase() === e.name.toLowerCase());
          const effect: StatusEffect = { name: e.name, description: e.description || '', type: effectType as StatusEffect['type'], duration: e.duration };
          if (existing >= 0) effects[existing] = effect;
          else effects.push(effect);
        }
      }
    }
    updates.status_effects = effects;
  }

  // Decrement ability cooldowns each action; reset all on rest
  {
    const abilities = currentCharacter.abilities || [];
    if (abilities.length > 0) {
      const updated = abilities.map(a => {
        if (actionResult.isRest) return { ...a, currentCooldown: 0 };
        if (actionResult.abilityUsed && a.name === actionResult.abilityUsed && a.cooldown) return { ...a, currentCooldown: a.cooldown };
        if (a.currentCooldown && a.currentCooldown > 0) return { ...a, currentCooldown: a.currentCooldown - 1 };
        return a;
      });
      if (JSON.stringify(updated) !== JSON.stringify(abilities)) updates.abilities = updated;
    }
  }

  // Remove consumed items from inventory when AI narrates their use
  if (actionResult.consumedItems && actionResult.consumedItems.length > 0) {
    const consumed = new Set(actionResult.consumedItems.map(c => c.toLowerCase()));
    const inv = updates.inventory ?? currentCharacter.inventory ?? [];
    updates.inventory = inv
      .map(item => consumed.has(item.name.toLowerCase()) ? { ...item, quantity: item.quantity - 1 } : item)
      .filter(item => item.quantity > 0);
  }

  // Accumulate all world state mutations before writing once
  if (actionResult.sessionNote) {
    let notes = [...(newWorldState.sessionNotes || []), actionResult.sessionNote].slice(-50);
    if (notes.length >= 8) {
      try {
        const actNumber = campaign.act ?? 1;
        const sessionCount = (newWorldState.sessionCount ?? 0) + 1;
        const entry = await compressToJournalEntry(campaign.id, notes, actNumber, sessionCount);
        newWorldState.campaignJournal = [...(newWorldState.campaignJournal || []), entry];
        notes = [];
      } catch {
        notes = notes.slice(-10);
      }
    }
    newWorldState.sessionNotes = notes;
  }

  if (actionResult.characterHistoryNote) {
    const history = [...(newWorldState.characterHistory || []), {
      ...actionResult.characterHistoryNote,
      createdAt: new Date().toISOString(),
    }];
    newWorldState.characterHistory = history.slice(-50);
  }

  if (actionResult.antagonistUpdate) {
    const au = actionResult.antagonistUpdate;
    const progress = { ...(newWorldState.antagonistProgress || {}) };
    const existing = progress[au.name] || { stepIndex: 0, lastAction: '', knowsPlayers: false };
    progress[au.name] = {
      stepIndex: au.newStep ? existing.stepIndex + 1 : existing.stepIndex,
      lastAction: au.lastAction || existing.lastAction,
      knowsPlayers: au.nowKnowsPlayers ?? existing.knowsPlayers,
    };
    newWorldState.antagonistProgress = progress;
  }

  if (actionResult.isDeath) {
    updates.hp = 0;
    updates.is_alive = false;
    updates.death_note = actionResult.deathDescription || 'Fell in battle.';
    const fallen = Array.isArray(newWorldState.fallenHeroes) ? newWorldState.fallenHeroes : [];
    fallen.push({
      name: currentCharacter.name,
      race: currentCharacter.race,
      class: currentCharacter.class,
      level: currentCharacter.level,
      cause: actionResult.deathDescription || 'Fell in battle.',
      diedAt: new Date().toISOString(),
      location: newWorldState.currentLocation || 'Unknown',
    });
    newWorldState.fallenHeroes = fallen;
  }

  // Single atomic world state write â€” eliminates co-op race conditions
  await supabaseAdmin.from('campaigns').update({ world_state: newWorldState }).eq('id', campaign.id);

  // Persist character updates
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('characters').update(updates).eq('id', characterId);
  }

  return {
    updatedCharacter: { ...currentCharacter, ...updates },
    updatedWorldState: newWorldState,
  };
}

export async function getRecentHistory(campaignId: string, characterId: string, limit = 20): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('story_events')
    .select('event_type, content, created_at')
    .eq('campaign_id', campaignId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data
    .reverse()
    .map(e => `[${e.event_type.toUpperCase()}] ${e.content.slice(0, 200)}`);
}

export async function processAction(
  characterId: string,
  action: string,
  campaignId: string
): Promise<ActionResult> {
  // Fetch character
  const { data: character, error: charError } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .single();

  if (charError || !character) throw new Error('Character not found');
  if (!character.is_alive) throw new Error('Your character has perished. Their story is over.');

  // Fetch campaign
  const { data: campaign, error: campError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campError || !campaign) throw new Error('Campaign not found');

  const recentHistory = await getRecentHistory(campaignId, characterId);

  // Build campaign context for narrative enrichment
  const ws = campaign.world_state as WorldState;
  const wb = campaign.world_bible as WorldBible;

  // Session count is incremented in getOpeningScene â€” just initialize if missing here
  if (!ws.sessionCount) {
    ws.sessionCount = 1;
    await supabaseAdmin.from('campaigns').update({ world_state: ws }).eq('id', campaignId);
  }

  // Fetch party members for co-op context
  const { data: partyMembersData } = await supabaseAdmin
    .from('campaign_members')
    .select('user_id')
    .eq('campaign_id', campaignId);

  const otherCharacters: CharacterOnlineStatus[] = [];
  for (const member of partyMembersData || []) {
    // Find this user's character in this campaign
    const { data: otherChar } = await supabaseAdmin
      .from('characters')
      .select('id, name, is_alive')
      .eq('campaign_id', campaignId)
      .eq('user_id', member.user_id)
      .neq('id', characterId)
      .single();
    if (!otherChar) continue;

    const lastSeen = ws.characterLastSeen?.[otherChar.id];
    const isOnline = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) < 15 * 60 * 1000 : false;
    const lastLocation = ws.characterLocations?.[otherChar.id] || ws.currentLocation || 'Unknown';

    otherCharacters.push({
      characterId: otherChar.id,
      characterName: otherChar.name,
      isOnline,
      lastSeen: lastSeen || new Date().toISOString(),
      lastLocation,
    });
  }

  // Compute force-complication flag before calling AI
  const currentSceneState = ws.sceneState;
  const forceComplication = (currentSceneState?.stalledCount ?? 0) >= 3;

  // Compute which act1MustIntroduce items have actually appeared in the world
  const currentAct = campaign.act || 1;
  const roadmap = wb.dmRoadmap;
  const mustIntroduce = currentAct === 1 ? (roadmap?.act1MustIntroduce || []) : [];
  const mustIntroduceStatus: Record<string, boolean> = {};
  if (mustIntroduce.length > 0) {
    const allNpcNamesLower = (ws.npcMemory || []).map(n => n.name.toLowerCase());
    const allLocationsLower = (ws.discoveredLocations || []).map(l => l.toLowerCase());
    for (const item of mustIntroduce) {
      const itemLower = item.toLowerCase();
      mustIntroduceStatus[item] =
        allNpcNamesLower.some(n => itemLower.includes(n) || n.includes(itemLower.split(' ')[0])) ||
        allLocationsLower.some(l => itemLower.includes(l) || l.includes(itemLower.split(' ')[0]));
    }
  }

  const campaignContext = {
    journal: ws.campaignJournal || [],
    characterHistory: ws.characterHistory || [],
    antagonists: wb.antagonistRoster || (wb.primaryAntagonist ? [wb.primaryAntagonist] : []),
    centralConflict: wb.centralConflict || '',
    act: currentAct,
    sessionCount: ws.sessionCount || 1,
    otherCharacters: otherCharacters.length > 0 ? otherCharacters : undefined,
    roadmap,
    foreshadowingLedger: ws.foreshadowingLedger,
    backstoryHooks: ws.backstoryHooks,
    actGoalsAchieved: ws.actGoalsAchieved,
    forceComplication,
    actionsInCurrentAct: ws.actionsInCurrentAct || 0,
    keyNPCs: ws.keyNPCs,
    mustIntroduceStatus: mustIntroduce.length > 0 ? mustIntroduceStatus : undefined,
    pendingDirectorBeat: ws.pendingDirectorBeat || null,
    futureHooks: (ws.futureHooks || []).filter(h => !h.resolved).slice(-10),
  };

  // Generate narration via GPT-4o
  const aiResponse = await generateNarration(
    action,
    ws,
    wb,
    character as Character,
    recentHistory,
    campaignContext
  );

  // Explicit rest detection â€” override AI if player clearly stated rest intent (but not negations)
  const isNegatedRest = /\b(not|don'?t|won'?t|can'?t|no|never|stop|avoid|refuse)\b.{0,20}\b(rest|sleep|camp|recover)\b/i.test(action);
  const isExplicitRest = !isNegatedRest && /\b(rest|sleep|camp|make camp|short rest|long rest|take a rest|take a break|set up camp|meditate|recover)\b/i.test(action);
  if (isExplicitRest) aiResponse.isRest = true;

  // If AI wants player to roll, return early with setup narration + rollContext
  if (aiResponse.awaitingRoll && aiResponse.rollContext) {
    // Save the setup narration event
    await supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'action',
      content: action,
      metadata: {},
    });
    await supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'narration',
      content: aiResponse.narration,
      metadata: { awaitingRoll: true, rollContext: aiResponse.rollContext },
    });

    return {
      narration: aiResponse.narration,
      awaitingRoll: true,
      rollContext: aiResponse.rollContext,
      suggestedActions: aiResponse.suggestedActions,
      sceneImagePrompt: aiResponse.sceneImagePrompt,
      isDeath: false,
      isLevelUp: false,
    };
  }

  // Handle dice roll if required
  let diceResult: DiceRollResult | undefined;
  let success = true;

  if (aiResponse.diceRequired && aiResponse.diceType) {
    const sides = parseInt(aiResponse.diceType.replace('d', ''), 10) || 20;
    const statKey = action.toLowerCase().includes('sneak') || action.toLowerCase().includes('hide') ? 'dex'
      : action.toLowerCase().includes('know') || action.toLowerCase().includes('lore') ? 'int'
      : action.toLowerCase().includes('persuad') || action.toLowerCase().includes('charm') ? 'cha'
      : action.toLowerCase().includes('percei') || action.toLowerCase().includes('notice') ? 'wis'
      : action.toLowerCase().includes('lift') || action.toLowerCase().includes('attack') ? 'str'
      : 'dex';

    const modifier = getStatModifier(character.stats[statKey as keyof typeof character.stats] as number);
    diceResult = rollDice(sides, modifier);
    diceResult.description = aiResponse.diceDescription;
    success = diceResult.total >= (aiResponse.diceDC ?? 12);
  }

  // Calculate XP for meaningful actions
  const xpGained = success ? Math.floor(Math.random() * 20) + 10 : 5;

  // Always track per-character location and last seen
  const newLocation = (aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.currentLocation || ws.currentLocation;
  const locationTracking: Partial<WorldState> = {
    characterLocations: {
      ...(ws.characterLocations || {}),
      [characterId]: newLocation || 'Unknown',
    },
    characterLastSeen: {
      ...(ws.characterLastSeen || {}),
      [characterId]: new Date().toISOString(),
    },
  };

  // Update combat state
  let combatState = ws.combatState ?? null;
  if (aiResponse.isCombat && aiResponse.enemyName) {
    if (!combatState?.inCombat) {
      // Combat just started â€” build initial enemy list; sync legacy enemyName from enemies[0] if provided
      const initialEnemies: import('../../../shared/types').CombatEnemy[] = aiResponse.combatEnemies
        ? aiResponse.combatEnemies
        : [{ name: aiResponse.enemyName, archetype: 'soldier', maxHp: 30, condition: 'healthy' }];
      const primaryName = initialEnemies[0]?.name || aiResponse.enemyName;
      combatState = {
        inCombat: true,
        enemyName: primaryName,
        enemyCondition: 'healthy',
        roundNumber: 1,
        playerActionsAttempted: [action],
        enemies: initialEnemies,
        isBossFight: aiResponse.isBossFight || false,
        bossPhase: aiResponse.isBossFight ? 1 : undefined,
      };
    } else {
      const rounds = combatState.roundNumber + 1;
      const totalDamageDealt = (combatState as unknown as Record<string, number>).totalDamageDealt || 0;
      const newDamage = aiResponse.hpChange && aiResponse.hpChange < 0 ? Math.abs(aiResponse.hpChange) : 0;
      const cumulativeDamage = totalDamageDealt + newDamage;
      const enemyCondition: 'healthy' | 'wounded' | 'critical' = cumulativeDamage >= 30
        ? 'critical' : cumulativeDamage >= 15
        ? 'wounded' : rounds <= 3
        ? 'healthy' : rounds <= 6
        ? 'wounded' : 'critical';

      // Update enemy list if AI provided updated state
      let enemies = combatState.enemies || [];
      if (aiResponse.combatEnemies && aiResponse.combatEnemies.length > 0) {
        enemies = aiResponse.combatEnemies;
        // Sync legacy enemyName to first living enemy (backward compat)
        const firstLiving = enemies.find(e => !e.isDefeated);
        if (firstLiving) (combatState as Record<string, unknown>).enemyName = firstLiving.name;
      } else if (aiResponse.enemyDefeated) {
        enemies = enemies.map(e => e.name === aiResponse.enemyDefeated ? { ...e, isDefeated: true, condition: 'critical' as const } : e);
      } else {
        // Auto-degrade primary enemy condition
        enemies = enemies.map(e => e.name === combatState!.enemyName ? { ...e, condition: enemyCondition } : e);
      }

      const activeCombatState = combatState!;
      combatState = {
        ...activeCombatState,
        roundNumber: rounds,
        enemyCondition,
        enemies,
        playerActionsAttempted: [...(activeCombatState.playerActionsAttempted || []).slice(-8), action],
        totalDamageDealt: cumulativeDamage,
        bossPhase: aiResponse.bossPhaseAdvance ? (activeCombatState.bossPhase || 1) + 1 : activeCombatState.bossPhase,
      } as NonNullable<WorldState['combatState']> & { totalDamageDealt?: number };
    }
  } else if (aiResponse.isVictory || (!aiResponse.isCombat && combatState?.inCombat)) {
    combatState = null; // combat ended
  }

  // Scene summary â€” regenerate every 4 actions (cheap GPT-4o-mini call)
  const actionCount = (ws.actionsSinceLastSummary || 0) + 1;
  let currentSceneSummary = ws.currentSceneSummary;
  let actionsSinceLastSummary = actionCount;
  if (actionCount >= 4) {
    try {
      currentSceneSummary = await generateSceneSummary(recentHistory, ws.currentLocation || 'Unknown', character.name, combatState);
      actionsSinceLastSummary = 0;
    } catch { /* non-critical, keep old summary */ }
  }

  // Update foreshadowing ledger from AI response
  const ledgerChanges: import('../../../shared/types').ForeshadowingEntry[] = [];
  if (aiResponse.newForeshadowing) {
    for (const f of aiResponse.newForeshadowing) {
      ledgerChanges.push({
        id: f.id || crypto.randomUUID(),
        description: f.description,
        type: f.type as import('../../../shared/types').ForeshadowingEntry['type'],
        introducedInAct: campaign.act || 1,
        payoffStatus: 'planted',
        createdAt: new Date().toISOString(),
      });
    }
  }
  if (aiResponse.paidOffForeshadowing) {
    const existing = ws.foreshadowingLedger || [];
    for (const id of aiResponse.paidOffForeshadowing) {
      const entry = existing.find(f => f.id === id);
      if (entry) ledgerChanges.push({ ...entry, payoffStatus: 'paid_off', payoffDescription: 'Resolved in story' });
    }
  }

  // Update backstory hooks
  const hookChanges: import('../../../shared/types').BackstoryHook[] = [];
  if (aiResponse.backstoryHookActivated) {
    const hooks = ws.backstoryHooks || [];
    const dormant = hooks.find(h => h.characterId === aiResponse.backstoryHookActivated && h.status === 'dormant');
    if (dormant) hookChanges.push({ ...dormant, status: 'active', seededAt: new Date().toISOString() });
  }

  // Track act goal achievements
  const goalChanges: string[] = [];
  if (aiResponse.actGoalAchieved) goalChanges.push(aiResponse.actGoalAchieved);

  // Update scene state pacing tracker
  const prevSceneState = ws.sceneState;
  const aiMomentum = aiResponse.sceneMomentum || 'advancing';
  const isTransitioning = aiMomentum === 'transitioning';
  const newSceneState: WorldState['sceneState'] = isTransitioning
    ? {
        purpose: aiResponse.scenePurpose || 'explore',
        exchangeCount: 0,
        stalledCount: 0,
        pacingMode: aiResponse.pacingMode || 'exploration',
      }
    : {
        purpose: aiResponse.scenePurpose || prevSceneState?.purpose || 'explore',
        exchangeCount: (prevSceneState?.exchangeCount ?? 0) + 1,
        stalledCount: aiMomentum === 'stalling' ? (prevSceneState?.stalledCount ?? 0) + 1 : 0,
        pacingMode: aiResponse.pacingMode || prevSceneState?.pacingMode || 'exploration',
      };

  // Track active NPC from AI response â€” auto-clear on location change
  const activeNPCChange: Partial<WorldState> = {};
  const locationChanged = newLocation && ws.currentLocation && newLocation !== ws.currentLocation;
  if (locationChanged) {
    activeNPCChange.activeNPC = null; // leaving a location always ends the conversation
  } else if (aiResponse.activeNPC !== undefined) {
    activeNPCChange.activeNPC = aiResponse.activeNPC;
  }

  // If the model sets activeNPC but forgets npcMemory, still save a lightweight character card.
  const activeNpcName = typeof activeNPCChange.activeNPC === 'string' ? activeNPCChange.activeNPC.trim() : '';
  const existingNpcNames = new Set([
    ...(ws.npcMemory || []).map(npc => npc.name.toLowerCase()),
    ...(((aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory || []).map(npc => npc.name.toLowerCase())),
  ]);
  const autoNpcMemory: NpcMemory[] = activeNpcName && !existingNpcNames.has(activeNpcName.toLowerCase())
    ? [{
        name: activeNpcName,
        disposition: 'unknown',
        notes: `Met ${character.name} near ${newLocation || ws.currentLocation || 'the current scene'}.`,
        lastMet: newLocation || ws.currentLocation,
        metCharacters: [character.name],
        interactionCount: 1,
      }]
    : [];

  // Persist shop inventory per location â€” same visit shows same items, but resets after leaving and doing 5+ things elsewhere
  const shopInventoryChange: Partial<WorldState> = {};
  if (aiResponse.isMerchant && aiResponse.shopItems && aiResponse.shopItems.length > 0) {
    const validItemTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
    // Validate and sanitize shop items to prevent undefined fields crashing the UI
    aiResponse.shopItems = aiResponse.shopItems
      .filter(item => item.name && typeof item.name === 'string')
      .map(item => ({
        id: item.id || crypto.randomUUID(),
        name: item.name,
        description: item.description || '',
        type: (validItemTypes.has(item.type) ? item.type : 'misc') as ShopItem['type'],
        price: typeof item.price === 'number' && !isNaN(item.price) ? Math.max(1, Math.round(item.price)) : 10,
        quantity: typeof item.quantity === 'number' && !isNaN(item.quantity) ? Math.max(1, Math.round(item.quantity)) : 1,
      }));

    const location = (aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.currentLocation || ws.currentLocation || 'unknown';
    const existingInventory = ws.shopInventory?.[location];
    const actionsSinceHere = ws.actionsSinceLastSummary || 0;
    if (existingInventory && actionsSinceHere < 6) {
      aiResponse.shopItems = existingInventory;
    } else {
      // Prune old shop inventories â€” keep at most 20 locations to avoid JSONB bloat
      const existingShop = ws.shopInventory || {};
      const keys = Object.keys(existingShop);
      const pruned = keys.length >= 20
        ? Object.fromEntries(keys.slice(-19).map(k => [k, existingShop[k]]))
        : existingShop;
      shopInventoryChange.shopInventory = { ...pruned, [location]: aiResponse.shopItems as ShopItem[] };
    }
  }

  // Track total action count for villain move timing
  const newActionCount = (ws.actionCount || 0) + 1;

  // Run Story Director every 5 actions to evaluate campaign health
  if (newActionCount % 5 === 0) {
    try {
      const directorBeat = await runStoryDirector(ws, wb, [character as Character], currentAct);
      if (directorBeat) {
        ws.pendingDirectorBeat = {
          beat: directorBeat.beat,
          urgency: directorBeat.urgency,
          expiresAfter: newActionCount + 2,
        };
      }
    } catch { /* non-critical */ }
  }

  // Trigger villain move every 10 actions (in-session, not just on session start)
  let villainMoveNote: string | undefined;
  if (newActionCount % 10 === 0 && wb.primaryAntagonist) {
    try {
      const move = await generateVillainMove(ws, wb, campaign.act || 1);
      villainMoveNote = move.sessionNote;
      // Prepend villain move to the narration field isn't clean here â€” we'll save it as a session note
    } catch { /* non-critical */ }
  }

  // Handle endgame phase triggers from AI
  let endgamePhase = ws.endgamePhase;
  if ((aiResponse as unknown as Record<string, unknown>).triggerFinalConfrontation) {
    endgamePhase = 'confrontation';
  } else if ((aiResponse as unknown as Record<string, unknown>).endgameResolved) {
    endgamePhase = 'none';
  } else if (!endgamePhase || endgamePhase === 'none') {
    // Auto-escalate to approaching when villain plan is near completion
    const antagonistProgress = ws.antagonistProgress || {};
    const primaryAntagonist = wb.primaryAntagonist;
    if (primaryAntagonist) {
      const progress = antagonistProgress[primaryAntagonist.name];
      const totalSteps = primaryAntagonist.planSteps?.length || 5;
      if (progress && progress.stepIndex >= totalSteps - 1) {
        endgamePhase = 'approaching';
      }
    }
  }

  const newActionsInCurrentAct = (ws.actionsInCurrentAct || 0) + 1;

  const worldStateChangesWithTracking: Partial<WorldState> = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> || {}),
    ...(autoNpcMemory.length > 0
      ? { npcMemory: [...(((aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory) || []), ...autoNpcMemory] }
      : {}),
    ...locationTracking,
    ...activeNPCChange,
    ...shopInventoryChange,
    combatState,
    currentSceneSummary,
    actionsSinceLastSummary,
    sceneState: newSceneState,
    actionCount: newActionCount,
    actionsInCurrentAct: newActionsInCurrentAct,
    lastPillarUsed: aiResponse.scenePurpose
      ? [...(ws.lastPillarUsed || []), aiResponse.scenePurpose].slice(-5)
      : ws.lastPillarUsed,
    ...(endgamePhase !== ws.endgamePhase ? { endgamePhase } : {}),
    ...(ledgerChanges.length > 0 ? { foreshadowingLedger: ledgerChanges } : {}),
    ...(hookChanges.length > 0 ? { backstoryHooks: hookChanges } : {}),
    ...(goalChanges.length > 0 ? { actGoalsAchieved: goalChanges } : {}),
    ...(aiResponse.isHighStakes ? { lastHighStakesAction: newActionCount } : {}),
    pendingDirectorBeat: aiResponse.directorBeatExecuted
      ? null
      : (ws.pendingDirectorBeat && newActionCount <= ws.pendingDirectorBeat.expiresAfter
          ? ws.pendingDirectorBeat
          : null),
  };

  // Consumed items: prefer AI's explicit list, fall back to narration regex
  let consumedItems: string[] = [];
  if (aiResponse.consumedItems && aiResponse.consumedItems.length > 0) {
    // AI explicitly named what was consumed â€” most reliable
    consumedItems = aiResponse.consumedItems.filter((name: string) =>
      (character.inventory || []).some((i: { name: string }) => i.name.toLowerCase() === name.toLowerCase())
    );
  } else if (aiResponse.narration) {
    // Fallback: scan narration for consumption verbs
    const consumableNames = (character.inventory || [])
      .filter((i: { type: string }) => i.type === 'potion' || i.type === 'misc')
      .map((i: { name: string }) => i.name);
    for (const itemName of consumableNames) {
      const escaped = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const usePattern = new RegExp(`\\b(drink|drinks|drank|use|uses|used|consume|consumes|consumed|quaff|quaffs|quaffed)\\b.{0,30}\\b${escaped}\\b`, 'i');
      const gonePattern = new RegExp(`\\b${escaped}\\b.{0,30}\\b(is consumed|is used|disappears|shatters|crumbles|is gone)\\b`, 'i');
      if (usePattern.test(aiResponse.narration) || gonePattern.test(aiResponse.narration)) {
        consumedItems.push(itemName);
      }
    }
  }

  // Apply consequences
  const prevLevel = (character as Character).level;
  const { updatedCharacter, updatedWorldState } = await applyConsequences(
    characterId,
    {
      worldStateChanges: worldStateChangesWithTracking,
      isLevelUp: aiResponse.isLevelUp,
      isDeath: aiResponse.isDeath,
      deathDescription: aiResponse.deathDescription,
      xpGained,
      hpChange: aiResponse.isDeath ? -character.max_hp : aiResponse.hpChange,
      // Skip AI goldChange for merchant interactions â€” the shop UI handles gold client-side to avoid double-deduction
      goldChange: aiResponse.isMerchant ? undefined : aiResponse.goldChange,
      loot: aiResponse.loot,
      statusEffectChanges: aiResponse.statusEffectChanges,
      sessionNote: villainMoveNote ? (aiResponse.sessionNote ? `${aiResponse.sessionNote} | ${villainMoveNote}` : villainMoveNote) : aiResponse.sessionNote,
      characterHistoryNote: aiResponse.characterHistoryNote as CharacterHistoryEntry | undefined,
      antagonistUpdate: aiResponse.antagonistUpdate,
      isRest: aiResponse.isRest,
      abilityUsed: aiResponse.abilityUsed,
      consumedItems: consumedItems.length > 0 ? consumedItems : undefined,
    },
    character as Character,
    { id: campaignId, world_state: campaign.world_state as WorldState, act: campaign.act }
  );

  // Advance act if triggered
  if (aiResponse.advanceAct) {
    const newAct = (campaign.act || 1) + 1;
    await supabaseAdmin.from('campaigns').update({ act: newAct }).eq('id', campaignId);

    // Reset actionsInCurrentAct counter and activate backstory hooks for the new act
    const { data: freshCamp } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaignId).single();
    if (freshCamp) {
      const postActWs = (freshCamp.world_state as WorldState) || {};
      const hooks = postActWs.backstoryHooks || [];
      const actLabel = newAct === 2 ? 'act2' : newAct === 3 ? 'act3' : 'act1';
      let hooksChanged = false;
      const updatedHooks = hooks.map(h => {
        if (h.status === 'dormant' && (h as unknown as Record<string, string>).seedTiming === actLabel) {
          hooksChanged = true;
          return { ...h, status: 'active' as const, seededAt: new Date().toISOString() };
        }
        return h;
      });
      const wsUpdates: Partial<WorldState> = { actionsInCurrentAct: 0 };
      if (hooksChanged) wsUpdates.backstoryHooks = updatedHooks;
      await supabaseAdmin.from('campaigns').update({ world_state: { ...postActWs, ...wsUpdates } }).eq('id', campaignId);
    }
  }

  // Determine if a new ability was granted on level-up
  const newLevelAfter = updatedCharacter.level;
  const grantedAbility = newLevelAfter > prevLevel ? getAbilityForLevel(character.class, newLevelAfter) ?? undefined : undefined;

  // Extract future hooks from what just happened (fire-and-forget, non-blocking)
  if (newActionCount % 3 === 0) {
    extractFutureHooks(action, aiResponse.narration, updatedWorldState, (character as Character).name)
      .then(hooks => {
        if (hooks.length > 0) {
          const existing = updatedWorldState.futureHooks || [];
          const merged = [...existing, ...hooks].slice(-30);
          supabaseAdmin.from('campaigns').update({
            world_state: { ...updatedWorldState, futureHooks: merged }
          }).eq('id', campaignId).then(() => {}, () => {});
        }
      })
      .catch(() => {});
  }

  // Log player action and DM narration as separate events
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'action',
    content: action,
    metadata: { diceResult, success },
  });
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: {
      action,
      diceResult,
      success,
      xpGained,
      suggestedActions: aiResponse.suggestedActions,
    },
  });

  return {
    narration: aiResponse.narration,
    diceRoll: diceResult,
    worldStateChanges: aiResponse.worldStateChanges as Partial<WorldState>,
    characterChanges: {
      hp: updatedCharacter.hp,
      xp: updatedCharacter.xp,
      level: updatedCharacter.level,
      gold: updatedCharacter.gold,
      inventory: updatedCharacter.inventory,
      status_effects: updatedCharacter.status_effects,
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isLevelUp: aiResponse.isLevelUp,
    isDeath: aiResponse.isDeath,
    isCombat: aiResponse.isCombat,
    isVictory: aiResponse.isVictory,
    enemyName: aiResponse.enemyName,
    newAbility: grantedAbility,
    loot: aiResponse.loot as ActionResult['loot'],
    shopItems: aiResponse.shopItems as ShopItem[] | undefined,
    isMerchant: aiResponse.isMerchant,
    advanceAct: aiResponse.advanceAct,
    statusEffectChanges: aiResponse.statusEffectChanges as ActionResult['statusEffectChanges'],
    isHighStakes: aiResponse.isHighStakes,
    choiceCards: aiResponse.choiceCards,
    characterHistoryNote: aiResponse.characterHistoryNote as ActionResult['characterHistoryNote'],
    antagonistUpdate: aiResponse.antagonistUpdate,
  };
}

export async function resolveRollAction(
  characterId: string,
  campaignId: string,
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: RollContext
): Promise<ActionResult> {
  const { data: character, error: charError } = await supabaseAdmin.from('characters').select('*').eq('id', characterId).single();
  if (charError || !character) throw new Error('Character not found');

  const { data: campaign, error: campError } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const recentHistory = await getRecentHistory(campaignId, characterId);

  const aiResponse = await generateRollOutcome(
    rollResult,
    rollTotal,
    dc,
    success,
    isCritSuccess,
    isCritFail,
    rollContext,
    campaign.world_state as WorldState,
    character as Character,
    recentHistory
  );

  const xpGained = success ? Math.floor(Math.random() * 20) + 10 : 5;

  const { updatedCharacter } = await applyConsequences(
    characterId,
    {
      worldStateChanges: aiResponse.worldStateChanges as Partial<WorldState>,
      isDeath: aiResponse.isDeath,
      xpGained,
      hpChange: aiResponse.isDeath ? -(character as Character).max_hp : aiResponse.hpChange,
      goldChange: aiResponse.goldChange,
      loot: aiResponse.loot as { id: string; name: string; description: string; quantity: number; type: string; value?: number }[] | undefined,
    },
    character as Character,
    { id: campaignId, world_state: campaign.world_state as WorldState, act: campaign.act }
  );

  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'dice_roll',
    content: `Rolled ${rollResult} (total ${rollTotal}) vs DC ${dc} â€” ${success ? 'SUCCESS' : 'FAILURE'}`,
    metadata: { rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext },
  });
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: { suggestedActions: aiResponse.suggestedActions, fromRoll: true },
  });

  return {
    narration: aiResponse.narration,
    diceRoll: {
      sides: 20,
      rolls: [rollResult],
      modifier: rollTotal - rollResult,
      total: rollTotal,
      description: `${rollContext.stat.toUpperCase()} check vs DC ${dc}`,
    },
    worldStateChanges: aiResponse.worldStateChanges as Partial<WorldState>,
    characterChanges: {
      hp: updatedCharacter.hp,
      xp: updatedCharacter.xp,
      level: updatedCharacter.level,
      gold: updatedCharacter.gold,
      inventory: updatedCharacter.inventory,
      status_effects: updatedCharacter.status_effects,
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isDeath: aiResponse.isDeath,
    isVictory: aiResponse.isVictory,
    isCombat: aiResponse.isCombat,
    loot: aiResponse.loot as ActionResult['loot'],
    isLevelUp: false,
  };
}

export async function getOpeningScene(
  characterId: string,
  campaignId: string
): Promise<ActionResult> {
  const { data: character } = await supabaseAdmin.from('characters').select('*').eq('id', characterId).single();
  if (!character) throw new Error('Character not found');
  const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (!campaign) throw new Error('Campaign not found');

  const openingWs = campaign.world_state as WorldState;
  const openingWb = campaign.world_bible as WorldBible;

  // Increment session count each time a player enters the game
  const newSessionCount = (openingWs.sessionCount ?? 0) + 1;
  openingWs.sessionCount = newSessionCount;
  await supabaseAdmin.from('campaigns').update({ world_state: openingWs }).eq('id', campaignId);

  // Check if the villain should make a proactive move â€” every 3 sessions or on first return
  const villainMoveCount = openingWs.villainMoveCount ?? 0;
  const sessionCount = newSessionCount;
  const villainMoveDue = sessionCount > 0 && (sessionCount % 3 === 0 || villainMoveCount === 0) && sessionCount > villainMoveCount * 3;
  let villainMovePreamble = '';
  if (villainMoveDue && openingWb.primaryAntagonist) {
    try {
      const move = await generateVillainMove(openingWs, openingWb, campaign.act || 1);
      villainMovePreamble = `\n\nWHILE YOU WERE AWAY:\n${move.narration}`;
      // Save the villain move to world state
      const updatedWs = {
        ...openingWs,
        villainMoveCount: villainMoveCount + 1,
        sessionNotes: [...(openingWs.sessionNotes || []), move.sessionNote],
      };
      await supabaseAdmin.from('campaigns').update({ world_state: updatedWs }).eq('id', campaignId);
      Object.assign(openingWs, updatedWs);
    } catch { /* non-critical */ }
  }

  const openingContext = {
    journal: openingWs.campaignJournal || [],
    characterHistory: openingWs.characterHistory || [],
    antagonists: openingWb.antagonistRoster || (openingWb.primaryAntagonist ? [openingWb.primaryAntagonist] : []),
    centralConflict: openingWb.centralConflict || '',
    act: campaign.act || 1,
    sessionCount: openingWs.sessionCount || 1,
    roadmap: openingWb.dmRoadmap,
    foreshadowingLedger: openingWs.foreshadowingLedger,
    backstoryHooks: openingWs.backstoryHooks,
    actGoalsAchieved: openingWs.actGoalsAchieved,
  };

  const fallenHeroes = openingWs.fallenHeroes || [];
  const openingAction = fallenHeroes.length > 0
    ? `SUCCESSOR_ENTRY: A new hero enters the world. The previous hero ${fallenHeroes[fallenHeroes.length - 1].name} (${fallenHeroes[fallenHeroes.length - 1].race} ${fallenHeroes[fallenHeroes.length - 1].class}, level ${fallenHeroes[fallenHeroes.length - 1].level}) fell â€” ${fallenHeroes[fallenHeroes.length - 1].cause}. The new hero is ${character.name}, ${character.race} ${character.class}. Acknowledge the fallen in a way that fits the world. NPCs who knew the previous hero may reference them.${villainMovePreamble}`
    : `OPENING_SCENE${villainMovePreamble}`;

  const aiResponse = await generateNarration(
    openingAction,
    openingWs,
    openingWb,
    character as Character,
    [],
    openingContext
  );

  // Save just the narration â€” no player action event for the opening
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: { suggestedActions: aiResponse.suggestedActions, isOpening: true },
  });

  return {
    narration: aiResponse.narration,
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isDeath: false,
    isLevelUp: false,
  };
}

export async function processCoopAction(
  campaignId: string,
  pendingActions: { characterId: string; userId: string; action: string; characterName: string }[]
): Promise<ActionResult & { character2Changes?: { hp?: number; gold?: number; inventory?: unknown } }> {
  // Load both characters
  const charResults = await Promise.all(
    pendingActions.map(pa =>
      supabaseAdmin.from('characters').select('*').eq('id', pa.characterId).single()
    )
  );

  const characters = charResults.map((r, i) => {
    if (r.error || !r.data) throw new Error(`Character not found: ${pendingActions[i].characterId}`);
    return r.data as Character;
  });

  // Load campaign
  const { data: campaign, error: campError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const ws = campaign.world_state as WorldState;
  const wb = campaign.world_bible as WorldBible;

  // Get recent history (use first character as reference)
  const recentHistory = await getRecentHistory(campaignId, pendingActions[0].characterId);

  // Call generateCoopNarration
  const aiResponse = await generateCoopNarration(
    pendingActions.map((pa, i) => ({ character: characters[i], action: pa.action })),
    ws,
    wb,
    recentHistory
  );

  const xpGained = Math.floor(Math.random() * 20) + 10;

  // Build world state changes (tracking both characters)
  const newActionCount = (ws.actionCount || 0) + 1;
  const newActionsInCurrentAct = (ws.actionsInCurrentAct || 0) + 1;

  // Update spotlight balance
  const currentBalance = { ...(ws.spotlightBalance || {}) };
  if (aiResponse.spotlightCharacterId) {
    currentBalance[aiResponse.spotlightCharacterId] = (currentBalance[aiResponse.spotlightCharacterId] || 0) + 1;
  }

  const worldStateChangesWithTracking: Partial<WorldState> = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> || {}),
    actionCount: newActionCount,
    actionsInCurrentAct: newActionsInCurrentAct,
    characterLastSeen: {
      ...(ws.characterLastSeen || {}),
      ...Object.fromEntries(pendingActions.map(pa => [pa.characterId, new Date().toISOString()])),
    },
    pendingTurn: null,
    spotlightBalance: currentBalance,
  };

  // Apply consequences to Character 1
  const char1Result = await applyConsequences(
    pendingActions[0].characterId,
    {
      worldStateChanges: worldStateChangesWithTracking,
      xpGained,
      hpChange: aiResponse.character1Changes?.hpChange ?? aiResponse.hpChange,
      loot: aiResponse.character1Changes?.loot ?? undefined,
      statusEffectChanges: aiResponse.character1Changes?.statusEffectChanges ?? undefined,
      sessionNote: aiResponse.sessionNote,
    },
    characters[0],
    { id: campaignId, world_state: ws, act: campaign.act }
  );

  // Apply consequences to Character 2 (world state already updated â€” applyConsequences re-fetches)
  const char2Result = await applyConsequences(
    pendingActions[1].characterId,
    {
      xpGained,
      hpChange: aiResponse.character2Changes?.hpChange ?? undefined,
      loot: aiResponse.character2Changes?.loot ?? undefined,
      statusEffectChanges: aiResponse.character2Changes?.statusEffectChanges ?? undefined,
    },
    characters[1],
    { id: campaignId, world_state: char1Result.updatedWorldState, act: campaign.act }
  );

  // Save story events for both characters
  await Promise.all([
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[0].characterId,
      event_type: 'action',
      content: pendingActions[0].action,
      metadata: { coopRound: true },
    }),
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[1].characterId,
      event_type: 'action',
      content: pendingActions[1].action,
      metadata: { coopRound: true },
    }),
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[0].characterId,
      event_type: 'narration',
      content: aiResponse.narration,
      metadata: { coopRound: true, suggestedActions: aiResponse.suggestedActions },
    }),
    supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: pendingActions[1].characterId,
      event_type: 'narration',
      content: aiResponse.narration,
      metadata: { coopRound: true, suggestedActions: aiResponse.suggestedActions },
    }),
  ]);

  const updatedChar1 = char1Result.updatedCharacter;
  const updatedChar2 = char2Result.updatedCharacter;

  return {
    narration: aiResponse.narration,
    worldStateChanges: aiResponse.worldStateChanges as Partial<WorldState>,
    characterChanges: {
      hp: updatedChar1.hp,
      xp: updatedChar1.xp,
      level: updatedChar1.level,
      gold: updatedChar1.gold,
      inventory: updatedChar1.inventory,
      status_effects: updatedChar1.status_effects,
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isLevelUp: false,
    isDeath: false,
    isCombat: aiResponse.isCombat,
    isVictory: aiResponse.isVictory,
    enemyName: aiResponse.enemyName,
    loot: (aiResponse.character1Changes?.loot || aiResponse.loot) as ActionResult['loot'],
    isHighStakes: aiResponse.isHighStakes,
    choiceCards: aiResponse.choiceCards,
    character2Changes: {
      hp: updatedChar2.hp,
      gold: updatedChar2.gold,
      inventory: updatedChar2.inventory,
    },
  };
}
