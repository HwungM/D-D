import type { ActionResult, Character, RollContext, WorldBible, WorldState } from '../../../shared/types';
import { getAbilityForLevel } from '../../../shared/classAbilities';
import { applyConsequences, getRecentHistory } from './campaignTurnPersistence';
import { generateRollOutcome } from './openai';
import {
  calculateActionXp,
  degreeOfSuccess,
  resolvePlayerCombatRoll,
} from './rulesEngine';
import { supabaseAdmin } from './supabase';

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

  const xpGained = calculateActionXp(
    (character as Character).level,
    degreeOfSuccess(rollResult, rollTotal, dc),
    { combat: !!(campaign.world_state as WorldState).combatState?.inCombat, dramatic: rollContext.isDramatic },
  );
  const combatRoll = resolvePlayerCombatRoll(
    character as Character,
    (campaign.world_state as WorldState).combatState,
    rollContext,
    rollResult,
    rollTotal,
    dc,
  );
  const worldStateChanges = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> | undefined),
    ...(combatRoll ? { combatState: combatRoll.combatState } : {}),
  };

  const { updatedCharacter, updatedWorldState } = await applyConsequences(
    characterId,
    {
      worldStateChanges,
      isDeath: aiResponse.isDeath,
      xpGained,
      hpChange: aiResponse.isDeath ? -(character as Character).max_hp : aiResponse.hpChange,
      goldChange: aiResponse.goldChange,
      loot: aiResponse.loot as { id: string; name: string; description: string; quantity: number; type: string; value?: number }[] | undefined,
    },
    character as Character,
    { id: campaignId, world_state: campaign.world_state as WorldState, act: campaign.act, world_bible: campaign.world_bible as WorldBible }
  );

  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'dice_roll',
    content: `Rolled ${rollResult} (total ${rollTotal}) vs DC ${dc} — ${success ? 'SUCCESS' : 'FAILURE'}`,
    metadata: { rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext, combatDamage: combatRoll?.damage || 0, combatTarget: combatRoll?.target },
  });
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: { suggestedActions: aiResponse.suggestedActions, fromRoll: true, sceneImagePrompt: aiResponse.sceneImagePrompt || null },
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
    worldStateChanges: updatedWorldState,
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
    isVictory: combatRoll?.victory || aiResponse.isVictory,
    isCombat: combatRoll ? !combatRoll.victory : aiResponse.isCombat,
    combatDamage: combatRoll?.target ? { target: combatRoll.target, amount: combatRoll.damage, defeated: combatRoll.defeated } : undefined,
    loot: aiResponse.loot as ActionResult['loot'],
    isLevelUp: false,
  };
}

export async function resolveCoopRollAction(
  campaignId: string,
  characterId: string,
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: RollContext
): Promise<ActionResult> {
  const { data: campaign, error: campError } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
  if (campError || !campaign) throw new Error('Campaign not found');

  const ws = campaign.world_state as WorldState;
  const pending = ws.coopPendingRoll;
  if (!pending || pending.actingCharacterId !== characterId) throw new Error('No pending co-op roll for this character');

  const partnerAction = pending.actions.find(pa => pa.characterId !== characterId);
  if (!partnerAction) throw new Error('Co-op partner action not found');

  // Resolve the roll for the acting character via the standard roll-outcome flow
  const result = await resolveRollAction(characterId, campaignId, rollResult, rollTotal, dc, success, isCritSuccess, isCritFail, rollContext);

  // Reward the partner with the same XP for the joint turn and clear the pending roll
  const { data: partnerChar, error: partnerError } = await supabaseAdmin.from('characters').select('*').eq('id', partnerAction.characterId).single();
  if (partnerError || !partnerChar) throw new Error('Co-op partner character not found');

  const { data: refreshedCampaign } = await supabaseAdmin.from('campaigns').select('world_state').eq('id', campaignId).single();
  const wsAfterRoll = (refreshedCampaign?.world_state || result.worldStateChanges || ws) as WorldState;

  const xpGained = calculateActionXp(
    (partnerChar as Character).level,
    degreeOfSuccess(rollResult, rollTotal, dc),
    { combat: !!ws.combatState?.inCombat, dramatic: rollContext.isDramatic, coop: true },
  );
  // worldStateChanges (not the passed-in snapshot) is what actually persists:
  // applyConsequences re-fetches the latest world state before writing, so the
  // pending roll must be cleared via the merge path or it lives in the DB forever.
  const { updatedCharacter: updatedPartner, updatedWorldState } = await applyConsequences(
    partnerAction.characterId,
    { xpGained, worldStateChanges: { coopPendingRoll: null } },
    partnerChar as Character,
    { id: campaignId, world_state: { ...wsAfterRoll, coopPendingRoll: null }, act: campaign.act, world_bible: campaign.world_bible as WorldBible }
  );

  const partnerLeveledUp = updatedPartner.level > (partnerChar as Character).level;
  const partnerAbility = partnerLeveledUp ? getAbilityForLevel((partnerChar as Character).class, updatedPartner.level) ?? null : null;

  // Mirror the roll narration into the partner's feed, carrying enough metadata
  // for their client to show the same turn effects the roller sees.
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: partnerAction.characterId,
    event_type: 'narration',
    content: result.narration,
    metadata: {
      coopRound: true,
      fromRoll: true,
      suggestedActions: result.suggestedActions,
      sceneImagePrompt: result.sceneImagePrompt || null,
      isCombat: result.isCombat ?? false,
      isVictory: result.isVictory ?? false,
      enemyName: result.enemyName ?? null,
      personal: {
        isLevelUp: partnerLeveledUp,
        level: updatedPartner.level,
        maxHp: updatedPartner.max_hp,
        newAbility: partnerAbility,
      },
    },
  });

  return {
    ...result,
    worldStateChanges: updatedWorldState,
    character2Changes: {
      hp: updatedPartner.hp,
      max_hp: updatedPartner.max_hp,
      gold: updatedPartner.gold,
      inventory: updatedPartner.inventory,
    },
  };
}
