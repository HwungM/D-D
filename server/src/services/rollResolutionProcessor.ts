import type { ActionResult, Character, RollContext, WorldBible, WorldState } from '../../../shared/types';
import { getAbilityForLevel } from '../../../shared/classAbilities';
import { applyConsequences, getRecentHistory } from './campaignTurnPersistence';
import { generateCoopRollOutcome, generateRollOutcome } from './openai';
import {
  calculateActionXp,
  degreeOfSuccess,
  resolvePlayerCombatRoll,
} from './rulesEngine';
import { supabaseAdmin } from './supabase';
import { assertCanResolveCoopRoll, repairWorldStateForGameplay } from './coopStateIntegrity';
import { applyCoopRollToQueue, buildNextCoopPendingRoll } from './coopRollFlow';

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

  const repaired = repairWorldStateForGameplay(campaign.world_state as WorldState);
  const ws = repaired.worldState;
  if (repaired.report.changed) {
    await supabaseAdmin.from('campaigns').update({ world_state: ws }).eq('id', campaignId);
  }
  const { pending } = assertCanResolveCoopRoll(ws, characterId);

  const transition = applyCoopRollToQueue(pending, characterId, {
    rollResult,
    rollTotal,
    dc,
    success,
    isCritSuccess,
    isCritFail,
  });
  const currentQueuedRoll = transition.currentRoll;
  const updatedQueuedRolls = transition.pendingRolls;
  const nextRoll = transition.nextRoll;

  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'dice_roll',
    content: `Rolled ${rollResult} (total ${rollTotal}) vs DC ${dc} — ${success ? 'SUCCESS' : 'FAILURE'}`,
    metadata: {
      coopRound: true,
      rollResult,
      rollTotal,
      dc,
      success,
      isCritSuccess,
      isCritFail,
      rollContext,
      actingCharacterId: characterId,
      pendingRollsRemaining: transition.remainingCount,
    },
  });

  if (nextRoll) {
    const nextPendingRoll = buildNextCoopPendingRoll(pending, transition)!;
    const nextState = {
      ...ws,
      coopPendingRoll: nextPendingRoll,
    };
    await supabaseAdmin.from('campaigns').update({ world_state: nextState }).eq('id', campaignId);
    await supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: nextRoll.characterId,
      event_type: 'narration',
      content: pending.setupNarration || `The shared attempt hangs on ${nextRoll.characterName}'s roll.`,
      metadata: {
        coopRound: true,
        awaitingRoll: true,
        rollContext: nextRoll.rollContext,
        actingCharacterId: nextRoll.characterId,
        sceneImagePrompt: pending.sceneImagePrompt || null,
      },
    });

    return {
      narration: `${currentQueuedRoll.characterName}'s roll is locked in. Waiting for ${nextRoll.characterName}'s roll to resolve the shared moment.`,
      awaitingRoll: true,
      actingCharacterId: nextRoll.characterId,
      rollContext: nextRoll.rollContext,
      worldStateChanges: nextState,
      suggestedActions: [],
      sceneImagePrompt: pending.sceneImagePrompt || undefined,
      diceRoll: {
        sides: 20,
        rolls: [rollResult],
        modifier: rollTotal - rollResult,
        total: rollTotal,
        description: `${rollContext.stat.toUpperCase()} check vs DC ${dc}`,
      },
    };
  }

  const actingAction = pending.actions.find(pa => pa.characterId === characterId);
  const partnerAction = pending.actions.find(pa => pa.characterId !== characterId);
  if (!actingAction) throw new Error('Co-op rolling character action not found');
  if (!partnerAction) throw new Error('Co-op partner action not found');

  const { data: actingChar, error: actingError } = await supabaseAdmin.from('characters').select('*').eq('id', characterId).single();
  if (actingError || !actingChar) throw new Error('Co-op rolling character not found');

  const { data: partnerChar, error: partnerError } = await supabaseAdmin.from('characters').select('*').eq('id', partnerAction.characterId).single();
  if (partnerError || !partnerChar) throw new Error('Co-op partner character not found');

  const [actingHistory, partnerHistory] = await Promise.all([
    getRecentHistory(campaignId, characterId, 10),
    getRecentHistory(campaignId, partnerAction.characterId, 10),
  ]);
  const recentHistory = Array.from(new Set([
    ...actingHistory,
    ...partnerHistory,
    ...pending.actions.map(action => `[ACTION] ${action.characterName}: ${action.action}`),
  ])).slice(-16);

  const aiResponse = await generateCoopRollOutcome(
    rollResult,
    rollTotal,
    dc,
    success,
    isCritSuccess,
    isCritFail,
    rollContext,
    ws,
    campaign.world_bible as WorldBible,
    actingChar as Character,
    partnerChar as Character,
    pending.actions.map(action => ({
      characterId: action.characterId,
      characterName: action.characterName,
      action: action.action,
    })),
    recentHistory,
    updatedQueuedRolls
      .filter(roll => roll.resolved && typeof roll.rollResult === 'number' && typeof roll.rollTotal === 'number' && typeof roll.dc === 'number')
      .map(roll => ({
        characterId: roll.characterId,
        characterName: roll.characterName,
        stat: roll.rollContext.stat,
        description: roll.rollContext.description,
        rollResult: roll.rollResult!,
        rollTotal: roll.rollTotal!,
        dc: roll.dc!,
        success: roll.success === true,
        isCritSuccess: roll.isCritSuccess,
        isCritFail: roll.isCritFail,
      })),
  );

  const actingXp = calculateActionXp(
    (actingChar as Character).level,
    degreeOfSuccess(rollResult, rollTotal, dc),
    { combat: !!ws.combatState?.inCombat, dramatic: rollContext.isDramatic, coop: true },
  );
  const combatRoll = resolvePlayerCombatRoll(
    actingChar as Character,
    ws.combatState,
    rollContext,
    rollResult,
    rollTotal,
    dc,
  );
  const worldStateChanges = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> | undefined),
    ...(combatRoll ? { combatState: combatRoll.combatState } : {}),
    coopPendingRoll: null,
  };

  const { updatedCharacter, updatedWorldState: wsAfterActingRoll } = await applyConsequences(
    characterId,
    {
      worldStateChanges,
      isDeath: aiResponse.isDeath,
      xpGained: actingXp,
      hpChange: aiResponse.isDeath ? -(actingChar as Character).max_hp : aiResponse.hpChange,
      goldChange: aiResponse.goldChange,
      loot: aiResponse.loot as { id: string; name: string; description: string; quantity: number; type: string; value?: number }[] | undefined,
    },
    actingChar as Character,
    { id: campaignId, world_state: ws, act: campaign.act, world_bible: campaign.world_bible as WorldBible }
  );

  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: {
      coopRound: true,
      fromRoll: true,
      suggestedActions: aiResponse.suggestedActions,
      sceneImagePrompt: aiResponse.sceneImagePrompt || null,
      isCombat: combatRoll ? !combatRoll.victory : aiResponse.isCombat ?? false,
      isVictory: combatRoll?.victory || aiResponse.isVictory || false,
      enemyName: combatRoll?.target || null,
    },
  });

  const xpGained = calculateActionXp(
    (partnerChar as Character).level,
    degreeOfSuccess(rollResult, rollTotal, dc),
    { combat: !!ws.combatState?.inCombat, dramatic: rollContext.isDramatic, coop: true },
  );
  const { updatedCharacter: updatedPartner, updatedWorldState } = await applyConsequences(
    partnerAction.characterId,
    { xpGained },
    partnerChar as Character,
    { id: campaignId, world_state: wsAfterActingRoll, act: campaign.act, world_bible: campaign.world_bible as WorldBible }
  );

  const partnerLeveledUp = updatedPartner.level > (partnerChar as Character).level;
  const partnerAbility = partnerLeveledUp ? getAbilityForLevel((partnerChar as Character).class, updatedPartner.level) ?? null : null;

  // Mirror the roll narration into the partner's feed, carrying enough metadata
  // for their client to show the same turn effects the roller sees.
  await supabaseAdmin.from('story_events').insert({
    campaign_id: campaignId,
    character_id: partnerAction.characterId,
    event_type: 'narration',
    content: aiResponse.narration,
    metadata: {
      coopRound: true,
      fromRoll: true,
      suggestedActions: aiResponse.suggestedActions,
      sceneImagePrompt: aiResponse.sceneImagePrompt || null,
      isCombat: combatRoll ? !combatRoll.victory : aiResponse.isCombat ?? false,
      isVictory: combatRoll?.victory || aiResponse.isVictory || false,
      enemyName: combatRoll?.target || null,
      personal: {
        isLevelUp: partnerLeveledUp,
        level: updatedPartner.level,
        maxHp: updatedPartner.max_hp,
        newAbility: partnerAbility,
      },
    },
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
    character2Id: partnerAction.characterId,
    character2Changes: {
      hp: updatedPartner.hp,
      max_hp: updatedPartner.max_hp,
      gold: updatedPartner.gold,
      inventory: updatedPartner.inventory,
    },
  };
}
