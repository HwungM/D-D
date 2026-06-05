import { supabaseAdmin } from './supabase';
import { generateNarration, generateRollOutcome, generateSceneSummary } from './openai';
import OpenAI from 'openai';
import type { Character, WorldState, WorldBible, DiceRollResult, ActionResult, StoryEvent, StatusEffect, ShopItem, CampaignJournalEntry, CharacterHistoryEntry, RollContext, CharacterOnlineStatus } from '../../../shared/types';
import { XP_THRESHOLDS, CLASS_BASE_HP } from '../../../shared/types';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import { getAbilityForLevel } from '../../../shared/classAbilities';

function mergeWorldStateChanges(current: WorldState, changes: Partial<WorldState>): WorldState {
  const merged = { ...current };

  // Per-character location — only update the specific character's entry
  if (changes.characterLocations) {
    merged.characterLocations = { ...current.characterLocations, ...changes.characterLocations };
  }

  // currentLocation: only update if provided (for the acting character)
  if (changes.currentLocation) merged.currentLocation = changes.currentLocation;

  // npcMemory: merge by name (upsert), preserving metCharacters from both sides
  if (changes.npcMemory) {
    const npcArray = Array.isArray(changes.npcMemory) ? changes.npcMemory : Object.values(changes.npcMemory);
    const existing = new Map((current.npcMemory || []).map(n => [n.name, n]));
    for (const npc of npcArray) {
      const prev = existing.get(npc.name);
      if (prev) {
        const metChars = Array.from(new Set([...(prev.metCharacters || []), ...(npc.metCharacters || [])]));
        existing.set(npc.name, { ...prev, ...npc, metCharacters: metChars });
      } else {
        existing.set(npc.name, npc);
      }
    }
    merged.npcMemory = Array.from(existing.values()).slice(-20); // keep last 20 NPCs
  }

  // activeQuests: merge by title (upsert)
  if (changes.activeQuests) {
    const questArray = Array.isArray(changes.activeQuests) ? changes.activeQuests : Object.values(changes.activeQuests);
    const existing = new Map((current.activeQuests || []).map(q => [q.title, q]));
    for (const q of questArray) existing.set(q.title, { ...existing.get(q.title), ...q, startedAt: existing.get(q.title)?.startedAt || new Date().toISOString() });
    merged.activeQuests = Array.from(existing.values());
  }

  // discoveredLocations: union
  if (changes.discoveredLocations) {
    merged.discoveredLocations = Array.from(new Set([...(current.discoveredLocations || []), ...changes.discoveredLocations]));
  }

  // factionStandings: merge (last write wins per faction)
  if (changes.factionStandings) {
    merged.factionStandings = { ...current.factionStandings, ...changes.factionStandings };
  }

  // sessionNotes: append new ones only
  if (changes.sessionNotes) {
    const notesArray = Array.isArray(changes.sessionNotes) ? changes.sessionNotes : Object.values(changes.sessionNotes);
    const existing = new Set(current.sessionNotes || []);
    const newNotes = notesArray.filter((n: string) => !existing.has(n));
    merged.sessionNotes = [...(current.sessionNotes || []), ...(newNotes as string[])];
  }

  // characterLastSeen: merge
  if (changes.characterLastSeen) {
    merged.characterLastSeen = { ...current.characterLastSeen, ...changes.characterLastSeen };
  }

  // Simple scalar fields
  for (const key of ['timeOfDay', 'weather', 'campaignJournal', 'antagonistProgress', 'characterHistory', 'combatState', 'currentSceneSummary', 'actionsSinceLastSummary'] as const) {
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
  },
  currentCharacter: Character,
  campaign: { id: string; world_state: WorldState; act?: number }
): Promise<{ updatedCharacter: Character; updatedWorldState: WorldState }> {
  const updates: Partial<Character> = {};
  let newWorldState = { ...campaign.world_state };

  // Apply world state changes (smart patch merge)
  if (actionResult.worldStateChanges) {
    newWorldState = mergeWorldStateChanges(newWorldState, actionResult.worldStateChanges as Partial<WorldState>);

    await supabaseAdmin
      .from('campaigns')
      .update({ world_state: newWorldState })
      .eq('id', campaign.id);
  }

  // Apply HP changes
  if (actionResult.hpChange !== undefined) {
    updates.hp = Math.max(0, Math.min(currentCharacter.max_hp, currentCharacter.hp + actionResult.hpChange));
  }

  // Apply gold changes
  if (actionResult.goldChange !== undefined) {
    updates.gold = Math.max(0, currentCharacter.gold + actionResult.goldChange);
  }

  // Apply loot to inventory
  if (actionResult.loot && actionResult.loot.length > 0) {
    const existingInventory = currentCharacter.inventory || [];
    const newItems = actionResult.loot.map(item => ({
      id: item.id || crypto.randomUUID(),
      name: item.name,
      description: item.description,
      quantity: item.quantity || 1,
      type: item.type as 'weapon' | 'armor' | 'potion' | 'misc' | 'key',
      value: item.value,
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
      // Grant level-up ability if milestone
      const newAbility = getAbilityForLevel(currentCharacter.class, levelCheck.newLevel);
      if (newAbility) {
        const existingAbilities = currentCharacter.abilities || [];
        const alreadyHas = existingAbilities.some(a => a.name === newAbility.name);
        if (!alreadyHas) {
          updates.abilities = [...existingAbilities, newAbility];
        }
      }
    }
  }

  // Apply status effects
  if (actionResult.statusEffectChanges) {
    let effects: StatusEffect[] = [...(currentCharacter.status_effects || [])];
    if (actionResult.statusEffectChanges.remove) {
      const toRemove = new Set(actionResult.statusEffectChanges.remove.map(n => n.toLowerCase()));
      effects = effects.filter(e => !toRemove.has(e.name.toLowerCase()));
    }
    if (actionResult.statusEffectChanges.add) {
      for (const e of actionResult.statusEffectChanges.add) {
        const existing = effects.findIndex(x => x.name.toLowerCase() === e.name.toLowerCase());
        const effect: StatusEffect = { name: e.name, description: e.description, type: e.type as StatusEffect['type'], duration: e.duration };
        if (existing >= 0) effects[existing] = effect;
        else effects.push(effect);
      }
    }
    updates.status_effects = effects;
  }

  // Add session note to world state
  if (actionResult.sessionNote) {
    let notes = [...(newWorldState.sessionNotes || []), actionResult.sessionNote];
    // Compress to journal entry when we have 8+ session notes
    if (notes.length >= 8) {
      try {
        const actNumber = campaign.act ?? 1;
        const sessionCount = (newWorldState.sessionCount ?? 0) + 1;
        const entry = await compressToJournalEntry(campaign.id, notes, actNumber, sessionCount);
        newWorldState.campaignJournal = [...(newWorldState.campaignJournal || []), entry];
        notes = []; // clear after compression
      } catch (e) {
        notes = notes.slice(-10); // fallback: keep last 10
      }
    }
    newWorldState.sessionNotes = notes;
    await supabaseAdmin.from('campaigns').update({ world_state: newWorldState }).eq('id', campaign.id);
  }

  // Log characterHistoryNote
  if (actionResult.characterHistoryNote) {
    const history = [...(newWorldState.characterHistory || []), {
      ...actionResult.characterHistoryNote,
      createdAt: new Date().toISOString(),
    }];
    newWorldState.characterHistory = history.slice(-50); // keep last 50
    await supabaseAdmin.from('campaigns').update({ world_state: newWorldState }).eq('id', campaign.id);
  }

  // Update antagonistProgress
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
    await supabaseAdmin.from('campaigns').update({ world_state: newWorldState }).eq('id', campaign.id);
  }

  // Apply death
  if (actionResult.isDeath) {
    updates.hp = 0;
    updates.is_alive = false;
    updates.death_note = actionResult.deathDescription || 'Fell in battle.';
    // Record in world state so successors and NPCs remember
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
    await supabaseAdmin.from('campaigns').update({ world_state: newWorldState }).eq('id', campaign.id);
  }

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
    .map((e: StoryEvent) => `[${e.event_type.toUpperCase()}] ${e.content.slice(0, 200)}`);
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

  // Increment session count on first action (rough proxy)
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

  const campaignContext = {
    journal: ws.campaignJournal || [],
    characterHistory: ws.characterHistory || [],
    antagonists: wb.antagonistRoster || (wb.primaryAntagonist ? [wb.primaryAntagonist] : []),
    centralConflict: wb.centralConflict || '',
    act: campaign.act || 1,
    sessionCount: ws.sessionCount || 1,
    otherCharacters: otherCharacters.length > 0 ? otherCharacters : undefined,
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
      // Combat just started
      combatState = { inCombat: true, enemyName: aiResponse.enemyName, enemyCondition: 'healthy', roundNumber: 1, playerActionsAttempted: [action] };
    } else {
      // Ongoing combat — increment round, log action, estimate condition from hp
      const hpPct = character.hp / character.max_hp;
      const enemyCondition = hpPct > 0.6 ? 'healthy' : hpPct > 0.25 ? 'wounded' : 'critical';
      combatState = { ...combatState, roundNumber: combatState.roundNumber + 1, enemyCondition, playerActionsAttempted: [...(combatState.playerActionsAttempted || []).slice(-8), action] };
    }
  } else if (aiResponse.isVictory || (!aiResponse.isCombat && combatState?.inCombat)) {
    combatState = null; // combat ended
  }

  // Scene summary — regenerate every 4 actions (cheap GPT-4o-mini call)
  const actionCount = (ws.actionsSinceLastSummary || 0) + 1;
  let currentSceneSummary = ws.currentSceneSummary;
  let actionsSinceLastSummary = actionCount;
  if (actionCount >= 4) {
    try {
      currentSceneSummary = await generateSceneSummary(recentHistory, ws.currentLocation || 'Unknown', character.name, combatState);
      actionsSinceLastSummary = 0;
    } catch { /* non-critical, keep old summary */ }
  }

  const worldStateChangesWithTracking: Partial<WorldState> = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> || {}),
    ...locationTracking,
    combatState,
    currentSceneSummary,
    actionsSinceLastSummary,
  };

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
      goldChange: aiResponse.goldChange,
      loot: aiResponse.loot,
      statusEffectChanges: aiResponse.statusEffectChanges,
      sessionNote: aiResponse.sessionNote,
      characterHistoryNote: aiResponse.characterHistoryNote as CharacterHistoryEntry | undefined,
      antagonistUpdate: aiResponse.antagonistUpdate,
    },
    character as Character,
    { id: campaignId, world_state: campaign.world_state as WorldState, act: campaign.act }
  );

  // Advance act if triggered
  if (aiResponse.advanceAct) {
    await supabaseAdmin.from('campaigns').update({ act: campaign.act + 1 }).eq('id', campaignId);
  }

  // Determine if a new ability was granted on level-up
  const newLevelAfter = updatedCharacter.level;
  const grantedAbility = newLevelAfter > prevLevel ? getAbilityForLevel(character.class, newLevelAfter) ?? undefined : undefined;

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
    content: `Rolled ${rollResult} (total ${rollTotal}) vs DC ${dc} — ${success ? 'SUCCESS' : 'FAILURE'}`,
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
  const openingContext = {
    journal: openingWs.campaignJournal || [],
    characterHistory: openingWs.characterHistory || [],
    antagonists: openingWb.antagonistRoster || (openingWb.primaryAntagonist ? [openingWb.primaryAntagonist] : []),
    centralConflict: openingWb.centralConflict || '',
    act: campaign.act || 1,
    sessionCount: openingWs.sessionCount || 1,
  };

  const fallenHeroes = openingWs.fallenHeroes || [];
  const openingAction = fallenHeroes.length > 0
    ? `SUCCESSOR_ENTRY: A new hero enters the world. The previous hero ${fallenHeroes[fallenHeroes.length - 1].name} (${fallenHeroes[fallenHeroes.length - 1].race} ${fallenHeroes[fallenHeroes.length - 1].class}, level ${fallenHeroes[fallenHeroes.length - 1].level}) fell — ${fallenHeroes[fallenHeroes.length - 1].cause}. The new hero is ${character.name}, ${character.race} ${character.class}. Acknowledge the fallen in a way that fits the world. NPCs who knew the previous hero may reference them.`
    : 'OPENING_SCENE';

  const aiResponse = await generateNarration(
    openingAction,
    openingWs,
    openingWb,
    character as Character,
    [],
    openingContext
  );

  // Save just the narration — no player action event for the opening
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
