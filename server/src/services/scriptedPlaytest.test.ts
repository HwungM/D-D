import assert from 'node:assert/strict';
import test from 'node:test';
import type { CombatEnemy, NpcMemory, WorldBible, WorldState } from '../../../shared/types';
import { canAdvanceAct } from './actPacingSystem';
import { ensureCombatEncounterCompleteness, preventUngroundedFight } from './aiContractValidator';
import { advanceCombatState, newlyDefeatedCombatants } from './combatSystem';
import { actionSignals, combatantMemoryPatch } from './npcMemorySystem';
import { buildEngineAuditEntry, buildSpotlightBalanceUpdate } from './turnStateHelpers';
import { mergeWorldStateChanges } from './worldStateSystem';

function rivals(worldState: WorldState): NpcMemory[] {
  return (worldState.npcMemory || []).filter(npc => npc.disposition === 'hostile' || (npc.relationshipScore || 0) < 0);
}

test('scripted final playtest covers combat grounding, People Sheet memory, lifecycle gates, and co-op spotlight', () => {
  const bible = {
    playerPreferences: { campaignLength: 'medium' },
    dmRoadmap: {
      act1MustIntroduce: ['Captain Veyra', 'Ash Gate'],
      act1Goals: ['Accept the ash road charge'],
      act2Goals: ['Expose the smuggler route', 'Force the baron into the open', 'Recover the drowned bell'],
      act3ConvergenceThreads: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    },
  } as unknown as WorldBible;

  let worldState: WorldState = {
    currentLocation: 'Old Road',
    actionsInCurrentAct: 12,
    actionCount: 1,
    npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: 'Met at the Ash Gate.' }],
    discoveredLocations: ['Ash Gate'],
  };

  const phantomFight = {
    narration: 'Two bandits suddenly appear and draw knives.',
    isCombat: true,
    enemyName: 'Rusk',
    combatEnemies: [{ name: 'Rusk', archetype: 'soldier' as const, maxHp: 12, condition: 'healthy' as const }],
    hpChange: -4,
    worldStateChanges: {
      activeNPC: 'Rusk',
      npcMemory: [{ name: 'Rusk', disposition: 'hostile' as const, notes: 'Appeared from nowhere.' }],
    },
  };
  const blocked = preventUngroundedFight(phantomFight, ['look for a fight'], worldState.currentLocation, false);
  assert.equal(blocked, true);
  assert.equal(phantomFight.isCombat, false);
  assert.equal(phantomFight.worldStateChanges.activeNPC, null);
  assert.deepEqual(phantomFight.worldStateChanges.npcMemory, []);

  const blockedAudit = buildEngineAuditEntry({
    worldState,
    act: 1,
    actors: ['King'],
    actions: ['look for a fight'],
    actionCount: 2,
    location: worldState.currentLocation,
    scenePurpose: 'gather_info',
    pacingMode: 'tension',
    ungroundedFightBlocked: blocked,
  });
  assert.ok(blockedAudit.checks.some(check => check.label === 'Grounded encounter' && check.status === 'blocked'));

  const groundedFight = {
    narration: 'Following boot tracks from an overturned wagon, you find two bandits counting stolen coin beside a ruined tollhouse.',
    isCombat: true,
    enemyName: 'bandits',
    combatEnemies: [{ name: 'Rusk', archetype: 'soldier' as const, maxHp: 12, condition: 'healthy' as const }],
  };
  assert.equal(preventUngroundedFight(groundedFight, ['follow the boot tracks'], worldState.currentLocation, false), false);
  assert.equal(ensureCombatEncounterCompleteness(groundedFight), true);
  const startedCombat = advanceCombatState(null, groundedFight, ['follow the boot tracks']);
  assert.equal(startedCombat.combatState?.enemies?.length, 2);

  const firstMemory = combatantMemoryPatch(startedCombat.combatState?.enemies, worldState.npcMemory, {
    playerNames: ['King', 'Sun Mi'],
    location: worldState.currentLocation,
    newEncounter: true,
  });
  worldState = mergeWorldStateChanges(worldState, {
    combatState: startedCombat.combatState,
    npcMemory: firstMemory,
    engineAudit: [buildEngineAuditEntry({
      worldState,
      act: 1,
      actors: ['King', 'Sun Mi'],
      actions: ['follow the boot tracks'],
      actionCount: 3,
      location: worldState.currentLocation,
      scenePurpose: 'combat',
      pacingMode: 'tension',
      combatCompletenessFilled: true,
      combatantsTracked: startedCombat.combatState?.enemies?.length || 0,
      npcMemoryUpdates: firstMemory.length,
    })],
  });
  assert.equal(worldState.combatState?.enemies?.length, 2);
  assert.equal(rivals(worldState).length, 2);

  const defeatedEnemies: CombatEnemy[] = (worldState.combatState?.enemies || []).map(enemy => ({
    ...enemy,
    currentHp: 0,
    condition: 'critical',
    isDefeated: true,
  }));
  const victory = advanceCombatState(worldState.combatState ?? null, {
    isCombat: true,
    enemyName: 'Rusk',
    combatEnemies: defeatedEnemies,
  }, ['corner them but accept surrender']);
  const defeatedNames = newlyDefeatedCombatants(worldState.combatState?.enemies, defeatedEnemies);
  const surrenderSignals = actionSignals(['corner them but accept surrender']);
  const consequenceMemory = combatantMemoryPatch(defeatedEnemies, worldState.npcMemory, {
    playerNames: ['King', 'Sun Mi'],
    location: worldState.currentLocation,
    defeatedNames,
    ...surrenderSignals,
  });
  worldState = mergeWorldStateChanges(worldState, {
    combatState: victory.combatState,
    npcMemory: consequenceMemory,
  });
  assert.equal(victory.forcedVictory, true);
  assert.equal(worldState.combatState, null);
  assert.equal(rivals(worldState).length, 2);
  assert.ok(rivals(worldState).every(npc => npc.relationshipLabel !== 'acquaintance'));
  assert.ok(rivals(worldState).every(npc => (npc.relationshipScore || 0) <= -35));

  const actOneBlocked = canAdvanceAct(worldState, bible, 1);
  assert.equal(actOneBlocked.allowed, false);
  assert.match(actOneBlocked.reason || '', /central hook|roadmap goal/i);

  worldState = mergeWorldStateChanges(worldState, {
    activeQuests: [{ title: 'Accept the ash road charge', description: 'Find what burned the road.', status: 'active' }],
    actGoalsAchieved: ['Accept the ash road charge'],
  });
  assert.equal(canAdvanceAct(worldState, bible, 1).allowed, true);

  const actTwoThin: WorldState = {
    ...worldState,
    actionsInCurrentAct: 20,
    actGoalsAchieved: ['Expose the smuggler route'],
    lastHighStakesAction: 18,
  };
  assert.equal(canAdvanceAct(actTwoThin, bible, 2).allowed, false);

  const actTwoReady: WorldState = {
    ...worldState,
    actionsInCurrentAct: 20,
    actGoalsAchieved: ['Expose the smuggler route', 'Force the baron into the open'],
    lastHighStakesAction: 19,
  };
  assert.equal(canAdvanceAct(actTwoReady, bible, 2).allowed, true);

  const actThreeNotResolved: WorldState = {
    ...worldState,
    actionsInCurrentAct: 8,
    actGoalsAchieved: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    endgamePhase: 'approaching',
  };
  assert.equal(canAdvanceAct(actThreeNotResolved, bible, 3).allowed, false);

  const actThreeReady: WorldState = {
    ...worldState,
    actionsInCurrentAct: 8,
    actGoalsAchieved: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    endgamePhase: 'none',
    completedEvents: ['The drowned bell was destroyed, Captain Veyra was redeemed, and the Ash Gate was sealed in victory.'],
  };
  assert.equal(canAdvanceAct(actThreeReady, bible, 3).allowed, true);

  const spotlight = buildSpotlightBalanceUpdate({ king: 5, sunMi: 1 }, ['king', 'sunMi'], null);
  assert.equal(spotlight.spotlightCharacterId, 'sunMi');
  assert.equal(spotlight.spotlightBalance.sunMi, 2);
});
