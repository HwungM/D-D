import { supabaseAdmin } from './supabase';
import { generateNarration } from './openai';
import type { Character, WorldState, WorldBible, DiceRollResult, ActionResult, StoryEvent } from '../../../shared/types';
import { XP_THRESHOLDS, CLASS_BASE_HP } from '../../../shared/types';

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
    diceResult?: DiceRollResult;
    diceDC?: number;
  },
  currentCharacter: Character,
  campaign: { id: string; world_state: WorldState }
): Promise<{ updatedCharacter: Character; updatedWorldState: WorldState }> {
  const updates: Partial<Character> = {};
  let newWorldState = { ...campaign.world_state };

  // Apply world state changes
  if (actionResult.worldStateChanges) {
    newWorldState = { ...newWorldState, ...actionResult.worldStateChanges };
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

  // Apply XP and check level up
  if (actionResult.xpGained && actionResult.xpGained > 0) {
    updates.xp = currentCharacter.xp + actionResult.xpGained;
    const levelCheck = checkLevelUp({ ...currentCharacter, xp: updates.xp });
    if (levelCheck.leveledUp && levelCheck.newLevel) {
      updates.level = levelCheck.newLevel;
      updates.max_hp = currentCharacter.max_hp + (levelCheck.hpGain ?? 0);
      updates.hp = Math.min(currentCharacter.hp + (levelCheck.hpGain ?? 0), updates.max_hp);
    }
  }

  // Apply death
  if (actionResult.isDeath) {
    updates.hp = 0;
    updates.is_alive = false;
    updates.death_note = actionResult.deathDescription || 'Fell in battle.';
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

export async function getRecentHistory(campaignId: string, characterId: string, limit = 10): Promise<string[]> {
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

  // Generate narration via GPT-4o
  const aiResponse = await generateNarration(
    action,
    campaign.world_state as WorldState,
    campaign.world_bible as WorldBible,
    character as Character,
    recentHistory
  );

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

  // Apply consequences
  const { updatedCharacter, updatedWorldState } = await applyConsequences(
    characterId,
    {
      worldStateChanges: aiResponse.worldStateChanges as Partial<WorldState>,
      isLevelUp: aiResponse.isLevelUp,
      isDeath: aiResponse.isDeath,
      deathDescription: aiResponse.deathDescription,
      xpGained,
      hpChange: aiResponse.isDeath ? -character.max_hp : undefined,
    },
    character as Character,
    { id: campaignId, world_state: campaign.world_state as WorldState }
  );

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
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    isLevelUp: aiResponse.isLevelUp,
    isDeath: aiResponse.isDeath,
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

  const aiResponse = await generateNarration(
    'OPENING_SCENE',
    campaign.world_state as WorldState,
    campaign.world_bible as WorldBible,
    character as Character,
    []
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
