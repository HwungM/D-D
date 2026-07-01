import type { ActionResult, Character, CharacterHistoryEntry, CharacterOnlineStatus, DiceRollResult, NpcMemory, ShopItem, WorldBible, WorldState } from '../../../shared/types';
import { getAbilityForLevel } from '../../../shared/classAbilities';
import { canAdvanceAct } from './actPacingSystem';
import { ensureCombatEncounterCompleteness, preventUngroundedFight } from './aiContractValidator';
import {
  advanceActIfAllowed,
  applyConsequences,
  getRecentHistory,
  queueFutureHookExtraction,
} from './campaignTurnPersistence';
import {
  getStatModifier as getStatModifierFromSystem,
  rollDice as rollDiceFromSystem,
} from './characterProgressionSystem';
import { advanceCombatState as advanceCombatStateFromSystem, newlyDefeatedCombatants } from './combatSystem';
import { applyCompanionChanges, departCompanion, guardCompanionDeaths, recruitCompanion } from './companionSystem';
import { buildAwaitingRollNarration, enforceTurnPlanNarration, planSoloTurn } from './gameDirector';
import { buildLayeredMemoryChanges, buildMemoryPack } from './layeredMemoryEngine';
import { resolveMysteryClueChanges } from './mysteryClueSystem';
import { actionSignals, combatantMemoryPatch } from './npcMemorySystem';
import { buildSceneInteractables } from './sceneInteractableSystem';
import { generateNarration, generateSceneSummary, generateVillainMove, runStoryDirector } from './openai';
import {
  calculateActionXp,
  calculateNarrativeXp,
  degreeOfSuccess,
} from './rulesEngine';
import { applyContinuityRepairs, buildContinuityDirective, buildContinuityPatch } from './storyContinuity';
import { supabaseAdmin } from './supabase';
import {
  appendAchievement,
  appendRecipe,
  applyFactionRepChange,
  buildActiveNpcChange,
  buildAutoNpcMemory,
  buildBackstoryHookChanges,
  buildEngineAuditEntry,
  buildForeshadowingAndFutureHookChanges,
  buildLocationTracking,
  buildSceneStateUpdate,
  buildShopInventoryChange,
  resolveConsumedItems,
  resolveEndgamePhase,
} from './turnStateHelpers';
import {
  campaignTargetActions as campaignTargetActionsFromSystem,
  mergeWorldStateChanges as mergeWorldStateChangesFromSystem,
} from './worldStateSystem';

// Safe array coercion — (value || []) only guards against null/undefined, but the AI
// occasionally returns {} for a field that should be an array, which is truthy and
// causes .map() to crash. This helper handles that case cleanly.
function toArr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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
  const turnPlan = planSoloTurn(character as Character, action, ws, wb);
  const continuityDirectives = buildContinuityDirective([character as Character], turnPlan.rails, ws, wb);

  // Session count is incremented in getOpeningScene — just initialize if missing here
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
    const allNpcNamesLower = toArr<NpcMemory>(ws.npcMemory).map(n => n.name.toLowerCase());
    const allLocationsLower = toArr<string>(ws.discoveredLocations).map(l => l.toLowerCase());
    for (const item of mustIntroduce) {
      const itemLower = item.toLowerCase();
      mustIntroduceStatus[item] =
        allNpcNamesLower.some(n => itemLower.includes(n) || n.includes(itemLower.split(' ')[0])) ||
        allLocationsLower.some(l => itemLower.includes(l) || l.includes(itemLower.split(' ')[0]));
    }
  }

  const memoryPack = buildMemoryPack(ws, wb, [character as Character], [action]);
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
    forceEscalation: (currentSceneState?.cluesThisScene ?? 0) >= 2,
    actionsInCurrentAct: ws.actionsInCurrentAct || 0,
    keyNPCs: ws.keyNPCs,
    mustIntroduceStatus: mustIntroduce.length > 0 ? mustIntroduceStatus : undefined,
    pendingDirectorBeat: ws.pendingDirectorBeat || null,
    futureHooks: (ws.futureHooks || []).filter(h => !h.resolved).slice(-10),
    railDirectives: turnPlan.guardrails,
    continuityDirectives,
    memoryContext: memoryPack.promptBlock || undefined,
  };

  if (turnPlan.awaitingRoll) {
    const statKey = turnPlan.awaitingRoll.rollContext.stat.toLowerCase() as keyof Character['stats'];
    const statValue = typeof (character as Character).stats?.[statKey] === 'number' ? (character as Character).stats[statKey] : 10;
    const rollContext = {
      ...turnPlan.awaitingRoll.rollContext,
      modifier: getStatModifierFromSystem(statValue),
    };
    const narration = buildAwaitingRollNarration({ ...turnPlan, awaitingRoll: { ...turnPlan.awaitingRoll, rollContext } });

    await supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'action',
      content: action,
      metadata: { enginePlanned: true },
    });
    await supabaseAdmin.from('story_events').insert({
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'narration',
      content: narration,
      metadata: { awaitingRoll: true, rollContext, enginePlan: turnPlan.sceneFrame },
    });

    return {
      narration,
      awaitingRoll: true,
      rollContext,
      suggestedActions: [],
      isDeath: false,
      isLevelUp: false,
    };
  }

  // Generate narration via GPT-4o
  const aiResponse = await generateNarration(
    action,
    turnPlan.worldStateForNarration,
    wb,
    character as Character,
    recentHistory,
    campaignContext
  );
  enforceTurnPlanNarration(aiResponse, turnPlan);
  applyContinuityRepairs(aiResponse, [character as Character], turnPlan.rails, ws);
  const ungroundedFightBlocked = preventUngroundedFight(aiResponse, [action], ws.currentLocation, !!ws.combatState?.inCombat);
  const combatCompletenessFilled = ensureCombatEncounterCompleteness(aiResponse);

  // Explicit rest detection — override AI if player clearly stated rest intent (but not negations)
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

    if (aiResponse.worldStateChanges) {
      const wsWithChanges = mergeWorldStateChangesFromSystem(ws, aiResponse.worldStateChanges);
      await supabaseAdmin.from('campaigns').update({ world_state: wsWithChanges }).eq('id', campaignId);
    }

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

    const modifier = getStatModifierFromSystem(character.stats[statKey as keyof typeof character.stats] as number);
    diceResult = rollDiceFromSystem(sides, modifier);
    diceResult.description = aiResponse.diceDescription;
    success = diceResult.total >= (aiResponse.diceDC ?? 12);
  }

  // Calculate XP for meaningful actions
  const xpGained = diceResult
    ? calculateActionXp(character.level, degreeOfSuccess(diceResult.rolls[0] || 1, diceResult.total, aiResponse.diceDC ?? 12), {
        combat: !!aiResponse.isCombat,
        dramatic: !!aiResponse.isHighStakes,
      })
    : calculateNarrativeXp(character.level, { combat: !!aiResponse.isCombat });

  // Always track per-character location and last seen
  const newLocation = turnPlan.worldStatePatch.currentLocation || (aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.currentLocation || ws.currentLocation;
  const locationTracking = buildLocationTracking(ws, [characterId], newLocation);

  // Update combat state
  const { combatState, forcedVictory } = advanceCombatStateFromSystem(ws.combatState ?? null, aiResponse, [action]);

  // Companion party members: apply HP/XP/bond changes, gate death behind an
  // earned high-stakes/combat/critical-failure moment, then handle organic
  // recruitment or departure. Mirrors the PC consequence flow but stays
  // self-contained since companions aren't tracked in the characters table.
  const companionCriticalFailure = !!diceResult && diceResult.rolls[0] === 1;
  const { changes: guardedCompanionChanges } = guardCompanionDeaths(aiResponse.companionChanges, {
    inCombat: !!combatState?.inCombat,
    isHighStakes: !!aiResponse.isHighStakes,
    isCriticalFailure: companionCriticalFailure,
  });
  const companionHpXp = applyCompanionChanges(ws.companions, guardedCompanionChanges);
  const companionRecruitResult = recruitCompanion(companionHpXp.companions, aiResponse.companionRecruit, character.level);
  const companionDepartResult = departCompanion(companionRecruitResult.companions, aiResponse.companionDeparture);
  const finalCompanions = companionDepartResult.companions;

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

  const { ledgerChanges, futureHooksChanges } = buildForeshadowingAndFutureHookChanges(aiResponse, ws, campaign.act || 1);

  // Clue bank: seed from WorldBible.mysteryLayer the first time it's needed,
  // then flip any ids this beat's narration concretely revealed to 'revealed'.
  // Never grants a clue the AI didn't earn/report — untouched clues simply
  // stay 'undiscovered', which is how a skipped scene "costs, not blocks".
  const mysteryClueChanges = resolveMysteryClueChanges(ws, wb, aiResponse.revealedClueIds);

  const hookChanges = buildBackstoryHookChanges(aiResponse, ws.backstoryHooks);

  // Track act goal achievements
  const goalChanges: string[] = [];
  if (aiResponse.actGoalAchieved) goalChanges.push(aiResponse.actGoalAchieved);

  // Update scene state pacing tracker
  const newSceneState = buildSceneStateUpdate(ws.sceneState, aiResponse);

  const activeNPCChange = buildActiveNpcChange(ws, aiResponse, newLocation);
  const autoNpcMemory = buildAutoNpcMemory(
    ws,
    aiResponse.worldStateChanges as Partial<WorldState> | undefined,
    activeNPCChange.activeNPC,
    [character.name],
    newLocation,
  );
  const combatSignals = actionSignals([action]);
  const newCombatEncounter = !ws.combatState?.inCombat && !!combatState?.inCombat;
  const combatantEnemies = combatState?.enemies || aiResponse.combatEnemies || ws.combatState?.enemies;
  const defeatedNames = newlyDefeatedCombatants(ws.combatState?.enemies, combatantEnemies, aiResponse.enemyDefeated);
  const shouldUpdateCombatantMemory = newCombatEncounter
    || defeatedNames.length > 0
    || combatSignals.pursuedOrCornered
    || combatSignals.sparedOrAcceptedSurrender
    || combatSignals.rescued;
  const combatantNpcMemory = shouldUpdateCombatantMemory
    ? combatantMemoryPatch(combatantEnemies, ws.npcMemory, {
        location: newLocation || ws.currentLocation,
        playerNames: [character.name],
        newEncounter: newCombatEncounter,
        defeatedNames,
        ...combatSignals,
      })
    : [];

  // Track total action count for villain move timing
  const newActionCount = (ws.actionCount || 0) + 1;
  const newActionsInCurrentAct = (ws.actionsInCurrentAct || 0) + 1;
  const actAdvancePreview = aiResponse.advanceAct
    ? canAdvanceAct({
        ...ws,
        actionsInCurrentAct: newActionsInCurrentAct,
        actGoalsAchieved: Array.from(new Set([...(ws.actGoalsAchieved || []), ...goalChanges])),
        lastHighStakesAction: aiResponse.isHighStakes ? newActionCount : ws.lastHighStakesAction,
        npcMemory: [
          ...(ws.npcMemory || []),
          ...toArr<NpcMemory>((aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory),
          ...autoNpcMemory,
          ...combatantNpcMemory,
        ],
      }, wb, campaign.act || 1)
    : undefined;

  const engineAuditEntry = buildEngineAuditEntry({
    worldState: ws,
    act: campaign.act || 1,
    actors: [character.name],
    actions: [action],
    actionCount: newActionCount,
    location: newLocation || ws.currentLocation,
    scenePurpose: newSceneState?.purpose,
    pacingMode: newSceneState?.pacingMode,
    ungroundedFightBlocked,
    combatCompletenessFilled,
    combatantsTracked: combatState?.enemies?.length || 0,
    npcMemoryUpdates: toArr<NpcMemory>((aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory).length + autoNpcMemory.length + combatantNpcMemory.length,
    actGoalsAdded: goalChanges,
    highStakes: !!aiResponse.isHighStakes || !!ws.lastHighStakesAction,
    directorBeatPending: !!ws.pendingDirectorBeat,
    actAdvance: aiResponse.advanceAct
      ? { proposed: true, allowed: !!actAdvancePreview?.allowed, reason: actAdvancePreview?.reason }
      : undefined,
  });

  const { shopInventoryChange, shopItems } = buildShopInventoryChange(
    ws,
    aiResponse,
    (aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.currentLocation || ws.currentLocation || 'unknown',
  );
  if (shopItems) aiResponse.shopItems = shopItems;

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
      // Prepend villain move to the narration field isn't clean here — we'll save it as a session note
    } catch { /* non-critical */ }
  }

  const endgamePhase = resolveEndgamePhase(
    ws.endgamePhase,
    aiResponse,
    ws,
    wb,
    newActionCount,
    campaignTargetActionsFromSystem(wb),
  );
  const layeredMemoryChanges = buildLayeredMemoryChanges({
    worldState: ws,
    worldBible: wb,
    characters: [character as Character],
    actions: [action],
    narration: aiResponse.narration,
    aiResponse,
    location: newLocation,
    actionCount: newActionCount,
  });

  const worldStateChangesWithTracking: Partial<WorldState> = {
    ...(aiResponse.worldStateChanges as Partial<WorldState> || {}),
    ...turnPlan.worldStatePatch,
    ...layeredMemoryChanges,
    ...(autoNpcMemory.length > 0 || combatantNpcMemory.length > 0
      ? {
          npcMemory: [
            ...toArr<NpcMemory>((aiResponse.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory),
            ...autoNpcMemory,
            ...combatantNpcMemory,
          ],
        }
      : {}),
    ...locationTracking,
    ...buildContinuityPatch([character as Character], turnPlan.rails, ws, aiResponse, newActionCount, newLocation),
    ...activeNPCChange,
    ...shopInventoryChange,
    combatState,
    companions: finalCompanions,
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
    ...(futureHooksChanges ? { futureHooks: futureHooksChanges } : {}),
    ...(hookChanges.length > 0 ? { backstoryHooks: hookChanges } : {}),
    ...(goalChanges.length > 0 ? { actGoalsAchieved: goalChanges } : {}),
    ...(mysteryClueChanges ? { mysteryClues: mysteryClueChanges } : {}),
    engineAudit: [engineAuditEntry],
    ...(aiResponse.isHighStakes ? { lastHighStakesAction: newActionCount } : {}),
    pendingDirectorBeat: aiResponse.directorBeatExecuted
      ? null
      : (ws.pendingDirectorBeat && newActionCount <= ws.pendingDirectorBeat.expiresAfter
          ? ws.pendingDirectorBeat
          : null),
    ...(aiResponse.achievementUnlocked
      ? { unlockedAchievements: appendAchievement(ws.unlockedAchievements, aiResponse.achievementUnlocked, (character as Character).name) }
      : {}),
    ...(aiResponse.newRecipe
      ? { knownRecipes: appendRecipe(ws.knownRecipes, aiResponse.newRecipe) }
      : {}),
    ...(aiResponse.companion !== undefined
      ? { companion: aiResponse.companion }
      : {}),
    ...(aiResponse.factionRepChange
      ? { factionStandings: applyFactionRepChange(ws.factionStandings, aiResponse.factionRepChange) }
      : {}),
  };

  // Consumed items: prefer AI's explicit list, fall back to narration regex
  const consumedItems = resolveConsumedItems(character, aiResponse.consumedItems, aiResponse.narration);

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
      // Skip AI goldChange for merchant interactions — the shop UI handles gold client-side to avoid double-deduction
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
    { id: campaignId, world_state: campaign.world_state as WorldState, act: campaign.act, world_bible: wb }
  );

  const didAdvanceAct = await advanceActIfAllowed(campaignId, aiResponse.advanceAct, updatedWorldState, wb, campaign.act || 1);

  // Determine if a new ability was granted on level-up
  const newLevelAfter = updatedCharacter.level;
  const grantedAbility = newLevelAfter > prevLevel ? getAbilityForLevel(character.class, newLevelAfter) ?? undefined : undefined;

  queueFutureHookExtraction({
    shouldRun: newActionCount % 3 === 0,
    actionSummary: action,
    narration: aiResponse.narration,
    worldState: updatedWorldState,
    actorName: (character as Character).name,
    campaignId,
  });

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
      sceneImagePrompt: aiResponse.sceneImagePrompt || null,
      engineAudit: engineAuditEntry,
    },
  });

  return {
    narration: aiResponse.narration,
    diceRoll: diceResult,
    worldStateChanges: updatedWorldState,
    characterChanges: {
      hp: updatedCharacter.hp,
      max_hp: updatedCharacter.max_hp,
      xp: updatedCharacter.xp,
      level: updatedCharacter.level,
      gold: updatedCharacter.gold,
      inventory: updatedCharacter.inventory,
      status_effects: updatedCharacter.status_effects,
    },
    sceneImagePrompt: aiResponse.sceneImagePrompt,
    suggestedActions: aiResponse.suggestedActions,
    // Drive the level-up celebration off the real XP system, not the AI's guess
    isLevelUp: newLevelAfter > prevLevel,
    isDeath: aiResponse.isDeath,
    isCombat: !!aiResponse.isCombat && combatState != null,
    isVictory: !!aiResponse.isVictory || forcedVictory,
    enemyName: aiResponse.enemyName,
    newAbility: grantedAbility,
    loot: aiResponse.loot as ActionResult['loot'],
    shopItems: aiResponse.shopItems as ShopItem[] | undefined,
    isMerchant: aiResponse.isMerchant,
    advanceAct: didAdvanceAct,
    statusEffectChanges: aiResponse.statusEffectChanges as ActionResult['statusEffectChanges'],
    isHighStakes: aiResponse.isHighStakes,
    choiceCards: aiResponse.choiceCards,
    characterHistoryNote: aiResponse.characterHistoryNote as ActionResult['characterHistoryNote'],
    antagonistUpdate: aiResponse.antagonistUpdate,
    achievementUnlocked: aiResponse.achievementUnlocked,
    companionChanges: Object.keys(companionHpXp.appliedChanges).length > 0 ? companionHpXp.appliedChanges : undefined,
    newCompanion: companionRecruitResult.recruited,
    companionDeparted: companionDepartResult.departed,
  };
}
