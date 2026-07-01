import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible, WorldState } from '../../../shared/types';
import { canAdvanceAct } from './actPacingSystem';
import { combatantMemoryPatch, relationshipLabel } from './npcMemorySystem';
import {
  hasGroundedEncounterSetup,
  groundedFightSearchNarration,
  isFightSeekingAction,
} from './narrativeRules';

test('all named humanoid combatants receive separate hostile memory entries', () => {
  const patch = combatantMemoryPatch(
    [
      { name: 'Rusk', archetype: 'soldier', maxHp: 12, currentHp: 0, condition: 'critical', isDefeated: true },
      { name: 'Mara', archetype: 'soldier', maxHp: 12, currentHp: 3, condition: 'critical' },
    ],
    [],
    {
      playerNames: ['King', 'Sun Mi'],
      location: 'Old Road',
      newEncounter: true,
      defeatedNames: ['Rusk'],
      pursuedOrCornered: true,
    },
  );
  assert.equal(patch.length, 2);
  assert.deepEqual(patch.map(npc => npc.name), ['Rusk', 'Mara']);
  assert.ok(patch.every(npc => npc.disposition === 'hostile'));
  assert.ok(patch.every(npc => (npc.relationshipScore || 0) <= -60));
  assert.ok(patch.every(npc => npc.relationshipLabel === 'bitter rival' || npc.relationshipLabel === 'sworn enemy'));
});

test('mercy tempers but does not erase the consequence of violence', () => {
  const [npc] = combatantMemoryPatch(
    [{ name: 'Mara', archetype: 'soldier', maxHp: 12, currentHp: 2, condition: 'critical' }],
    [],
    { playerNames: ['King'], newEncounter: true, sparedOrAcceptedSurrender: true },
  );
  assert.equal(npc.relationshipScore, -35);
  assert.notEqual(relationshipLabel(npc.relationshipScore || 0), 'acquaintance');
  assert.match(npc.notes, /spared/i);
});

test('fight seeking is distinguished from a grounded encounter setup', () => {
  assert.equal(isFightSeekingAction('I look for a fight'), true);
  assert.equal(isFightSeekingAction('I want to start a fight'), true);
  assert.equal(hasGroundedEncounterSetup('Two bandits suddenly appear.'), false);
  assert.equal(hasGroundedEncounterSetup('You follow boot tracks from an overturned wagon to a bandit camp.'), true);
  assert.match(groundedFightSearchNarration('Old Road'), /no enemy is in reach yet/i);
});

test('ordinary combat rounds do not repeatedly worsen the same relationship', () => {
  const [npc] = combatantMemoryPatch(
    [{ name: 'Mara', archetype: 'soldier', maxHp: 12, currentHp: 8, condition: 'wounded' }],
    [{ name: 'Mara', disposition: 'hostile', notes: 'Fought King.', relationshipScore: -35 }],
    { playerNames: ['King'] },
  );
  assert.equal(npc.relationshipScore, -35);
});

// Every campaign is now one continuous, open-ended, multi-arc saga (no more
// length tiers), so pacing minimums always use the fixed open-ended numbers:
// role 1 (setup) = 24, role 2 (escalation) = 32, role 3 (climax) = 16.
test('acts cannot advance before minimum pacing or act-one introductions', () => {
  const bible = {
    dmRoadmap: { act1MustIntroduce: ['Captain Veyra', 'Ash Gate'], act1Goals: ['Accept the ash road charge'] },
  } as unknown as WorldBible;
  const early = canAdvanceAct({ actionsInCurrentAct: 4 }, bible, 1);
  assert.equal(early.allowed, false);

  const missingIntroduction = canAdvanceAct({ actionsInCurrentAct: 24, npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: '' }] }, bible, 1);
  assert.equal(missingIntroduction.allowed, false);

  const ready = canAdvanceAct({
    actionsInCurrentAct: 24,
    npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: '' }],
    discoveredLocations: ['Ash Gate'],
    activeQuests: [{ title: 'Accept the ash road charge', description: 'Find what burned the road.', status: 'active' }],
    actGoalsAchieved: ['Accept the ash road charge'],
  } as WorldState, bible, 1);
  assert.equal(ready.allowed, true);
});

test('act one cannot advance without a central hook even after introductions', () => {
  const bible = {
    dmRoadmap: { act1MustIntroduce: ['Captain Veyra', 'Ash Gate'] },
  } as unknown as WorldBible;

  const noHook = canAdvanceAct({
    actionsInCurrentAct: 24,
    npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: '' }],
    discoveredLocations: ['Ash Gate'],
  } as WorldState, bible, 1);

  assert.equal(noHook.allowed, false);
  assert.match(noHook.reason || '', /central hook/i);
});

test('act two requires roadmap progress and a high stakes beat before advancing', () => {
  const bible = {
    dmRoadmap: {
      act2Goals: ['Expose the smuggler route', 'Force the baron into the open', 'Recover the drowned bell'],
    },
  } as unknown as WorldBible;

  const tooThin = canAdvanceAct({
    actionsInCurrentAct: 32,
    actGoalsAchieved: ['Expose the smuggler route'],
    lastHighStakesAction: 18,
  } as WorldState, bible, 2);
  assert.equal(tooThin.allowed, false);
  assert.match(tooThin.reason || '', /roadmap goal/i);

  const noReversal = canAdvanceAct({
    actionsInCurrentAct: 32,
    actGoalsAchieved: ['Expose the smuggler route', 'Force the baron into the open'],
  } as WorldState, bible, 2);
  assert.equal(noReversal.allowed, false);
  assert.match(noReversal.reason || '', /high-stakes/i);

  const ready = canAdvanceAct({
    actionsInCurrentAct: 32,
    actGoalsAchieved: ['Expose the smuggler route', 'Force the baron into the open'],
    lastHighStakesAction: 19,
  } as WorldState, bible, 2);
  assert.equal(ready.allowed, true);
});

test('act three requires convergence, confrontation, and recorded resolution before ending', () => {
  const bible = {
    dmRoadmap: {
      act3ConvergenceThreads: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    },
  } as unknown as WorldBible;

  const unresolvedThreads = canAdvanceAct({
    actionsInCurrentAct: 16,
    actGoalsAchieved: ['Break the drowned bell'],
    endgamePhase: 'none',
    completedEvents: ['The drowned bell was destroyed in the harbor.'],
  } as WorldState, bible, 3);
  assert.equal(unresolvedThreads.allowed, false);
  assert.match(unresolvedThreads.reason || '', /roadmap goal|convergence/i);

  const noConfrontation = canAdvanceAct({
    actionsInCurrentAct: 16,
    actGoalsAchieved: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    endgamePhase: 'approaching',
    completedEvents: ['The Ash Gate was sealed and Captain Veyra was redeemed.'],
  } as WorldState, bible, 3);
  assert.equal(noConfrontation.allowed, false);
  assert.match(noConfrontation.reason || '', /final confrontation|campaign finale/i);

  const noResolution = canAdvanceAct({
    actionsInCurrentAct: 16,
    actGoalsAchieved: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    endgamePhase: 'none',
    completedEvents: ['The Ash Gate stands quiet.'],
  } as WorldState, bible, 3);
  assert.equal(noResolution.allowed, false);
  assert.match(noResolution.reason || '', /arc resolution/i);

  const ready = canAdvanceAct({
    actionsInCurrentAct: 16,
    actGoalsAchieved: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    endgamePhase: 'none',
    completedEvents: ['The drowned bell was destroyed, Captain Veyra was redeemed, and the Ash Gate was sealed in victory.'],
  } as WorldState, bible, 3);
  assert.equal(ready.allowed, true);
});

test('campaigns can continue after a local climax into a fresh setup arc', () => {
  const bible = {
    dmRoadmap: {
      act1Goals: ['Take the Moonlit Road'],
      act2Goals: ['Expose the Hollow Duke', 'Choose a faction ally'],
      act3ConvergenceThreads: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    },
  } as unknown as WorldBible;

  const localClimaxResolved = canAdvanceAct({
    actionsInCurrentAct: 16,
    actGoalsAchieved: ['Break the drowned bell', 'Redeem Captain Veyra', 'Seal the Ash Gate'],
    endgamePhase: 'none',
    completedEvents: ['The drowned bell was destroyed, Captain Veyra was redeemed, and the Ash Gate was sealed in victory.'],
  } as WorldState, bible, 3);
  assert.equal(localClimaxResolved.allowed, true);

  const actFourNeedsNewHook = canAdvanceAct({
    actionsInCurrentAct: 24,
    actGoalsAchieved: [],
    activeQuests: [],
    futureHooks: [],
  } as WorldState, bible, 4);
  assert.equal(actFourNeedsNewHook.allowed, false);
  assert.match(actFourNeedsNewHook.reason || '', /Arc 2 setup/i);

  const actFourReady = canAdvanceAct({
    actionsInCurrentAct: 24,
    activeQuests: [{ title: 'Follow the silver comet', description: 'Find where the sealed gate points next.', status: 'active' }],
    actGoalsAchieved: ['Take the Moonlit Road'],
    futureHooks: [{ id: 'hook-1', description: 'The sealed gate points to a city under moonlight.', source: 'test', createdAt: 'now', resolved: false }],
  } as WorldState, bible, 4);
  assert.equal(actFourReady.allowed, true);
});
