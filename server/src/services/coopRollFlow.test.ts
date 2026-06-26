import assert from 'node:assert/strict';
import test from 'node:test';
import type { RollContext, WorldBible, WorldState } from '../../../shared/types';
import { assertCanResolveCoopRoll, repairWorldStateForGameplay } from './coopStateIntegrity';
import { applyCoopRollToQueue, buildNextCoopPendingRoll } from './coopRollFlow';
import { evaluateExperienceFrame } from './experienceEvalSystem';

function rollContext(overrides: Partial<RollContext> = {}): RollContext {
  return {
    stat: 'cha',
    dc: 15,
    diceType: 'd20',
    description: 'Foliza performs while Skirmy reads Jarvis for tells',
    successDescription: 'Jarvis reveals the useful truth behind the diplomat.',
    failDescription: 'Jarvis stays guarded and the crowd turns suspicious.',
    critSuccessDescription: 'Jarvis gives more than intended and exposes a new lead.',
    critFailDescription: 'The performance backfires and marks the party.',
    isDramatic: true,
    modifier: 0,
    ...overrides,
  };
}

const bible = {
  centralConflict: 'Trust is being weaponized by the diplomat.',
  toneRules: ['Warm mystery with honest danger.'],
  playerPreferences: {
    tone: 'Warm mystery',
    favoritePillars: ['Roleplay', 'Mystery'],
    playerCount: 2,
    characterConcepts: [],
  },
} as unknown as WorldBible;

test('co-op E2E roll gauntlet waits after first account roll and resolves after second', () => {
  const folizaRoll = rollContext({
    stat: 'cha',
    description: 'Foliza performs to draw Jarvis into speaking',
  });
  const skirmyRoll = rollContext({
    stat: 'wis',
    description: 'Skirmy watches Jarvis for tells about the courier pouch',
  });
  let worldState: WorldState = {
    currentLocation: 'Verdant Valley',
    currentSceneSummary: 'Foliza and Skirmy are performing for Jarvis while the crowd gathers.',
    coopPendingRoll: {
      actingCharacterId: 'foliza',
      rollContext: folizaRoll,
      setupNarration: 'Foliza begins the song while Skirmy watches Jarvis. The shared moment waits on the dice.',
      sceneImagePrompt: 'Two adventurers performing in a green valley market',
      actions: [
        { characterId: 'foliza', userId: 'u1', characterName: 'Foliza', action: 'I perform to draw Jarvis into revealing what he knows', submittedAt: '2026-06-26T00:00:00.000Z' },
        { characterId: 'skirmy', userId: 'u2', characterName: 'Skirmy', action: 'I watch Jarvis for tells and track his glance', submittedAt: '2026-06-26T00:00:01.000Z' },
      ],
      pendingRolls: [
        { characterId: 'foliza', characterName: 'Foliza', rollContext: folizaRoll },
        { characterId: 'skirmy', characterName: 'Skirmy', rollContext: skirmyRoll },
      ],
    },
  };

  const preflight = repairWorldStateForGameplay(worldState);
  assert.equal(preflight.report.changed, false);
  assert.deepEqual(preflight.worldState.engineDebug?.coopRoll?.expectedRollers, ['Foliza', 'Skirmy']);
  worldState = preflight.worldState;

  assert.throws(() => assertCanResolveCoopRoll(worldState, 'skirmy'), /partner holds the dice/i);
  assert.equal(assertCanResolveCoopRoll(worldState, 'foliza').currentRoll.characterName, 'Foliza');

  const firstTransition = applyCoopRollToQueue(worldState.coopPendingRoll!, 'foliza', {
    rollResult: 17,
    rollTotal: 21,
    dc: 15,
    success: true,
    isCritSuccess: false,
    isCritFail: false,
  });
  const nextPending = buildNextCoopPendingRoll(worldState.coopPendingRoll!, firstTransition);
  assert.ok(nextPending);
  worldState = { ...worldState, coopPendingRoll: nextPending };

  assert.equal(firstTransition.remainingCount, 1);
  assert.equal(worldState.coopPendingRoll?.actingCharacterId, 'skirmy');
  assert.equal(worldState.coopPendingRoll?.pendingRolls?.find(roll => roll.characterId === 'foliza')?.resolved, true);
  assert.equal(worldState.coopPendingRoll?.pendingRolls?.find(roll => roll.characterId === 'skirmy')?.resolved, undefined);
  assert.throws(() => assertCanResolveCoopRoll(worldState, 'foliza'), /partner holds the dice/i);
  assert.equal(assertCanResolveCoopRoll(worldState, 'skirmy').currentRoll.characterName, 'Skirmy');

  const waitingFrame = evaluateExperienceFrame({
    label: 'first co-op roll locked',
    narration: "Foliza's roll is locked in. Waiting for Skirmy's roll to resolve the shared moment.",
    awaitingRoll: true,
    isCoop: true,
    characters: [{ id: 'foliza', name: 'Foliza' }, { id: 'skirmy', name: 'Skirmy' }],
    worldStateAfter: worldState,
  });
  assert.equal(waitingFrame.ready, true, waitingFrame.issues.map(issue => issue.message).join('\n'));

  const secondTransition = applyCoopRollToQueue(worldState.coopPendingRoll!, 'skirmy', {
    rollResult: 13,
    rollTotal: 17,
    dc: 15,
    success: true,
    isCritSuccess: false,
    isCritFail: false,
  });
  assert.equal(secondTransition.remainingCount, 0);
  assert.equal(secondTransition.resolvedRolls.length, 2);
  assert.equal(buildNextCoopPendingRoll(worldState.coopPendingRoll!, secondTransition), null);

  const finalWorldState: WorldState = {
    ...worldState,
    coopPendingRoll: null,
    npcMemory: [
      {
        name: 'Jarvis',
        disposition: 'friendly',
        notes: 'Foliza and Skirmy convinced him to reveal the diplomat watches the courier pouch.',
        relationshipScore: 25,
        relationshipLabel: 'nervous ally',
        metCharacters: ['Foliza', 'Skirmy'],
        lastMet: 'Verdant Valley',
      },
      {
        name: 'Courier Pouch Guard',
        disposition: 'hostile',
        notes: 'Noticed Skirmy reading the courier route and now suspects the party.',
        relationshipScore: -35,
        relationshipLabel: 'suspicious rival',
        metCharacters: ['Skirmy'],
        lastMet: 'Verdant Valley',
      },
    ],
    characterMemories: [
      {
        characterId: 'foliza',
        characterName: 'Foliza',
        knownFacts: ['Jarvis revealed the diplomat watches the courier pouch.'],
        personalStakes: ['Her performance can expose guarded truths without breaking the warm tone.'],
        relationships: [{ npcName: 'Jarvis', summary: 'Nervous ally after the performance.', label: 'nervous ally', score: 25, lastUpdatedAt: 'now' }],
        lastUpdatedAt: 'now',
      },
      {
        characterId: 'skirmy',
        characterName: 'Skirmy',
        knownFacts: ['The courier pouch guard noticed Skirmy watching the route.'],
        personalStakes: ['His careful observation can create useful danger.'],
        relationships: [{ npcName: 'Courier Pouch Guard', summary: 'Suspicious rival.', label: 'suspicious rival', score: -35, lastUpdatedAt: 'now' }],
        lastUpdatedAt: 'now',
      },
    ],
    dmMemory: {
      recurringMotifs: ['songs revealing contracts'],
      tableToneNotes: ['warm mystery with honest danger'],
      unresolvedConsequences: ['The courier pouch guard suspects Skirmy.'],
      runningJokes: [],
      promisesToHonor: ['Jarvis owes one more answer if protected.'],
      lastUpdatedAt: 'now',
    },
  };

  const finalReadiness = evaluateExperienceFrame({
    label: 'second co-op roll resolves shared moment',
    narration: 'Foliza carries the melody high enough that the market leans in, and Skirmy catches Jarvis staring at the courier pouch just before the old man looks away. Together, their pressure works: Jarvis does not confess loudly, but he murmurs that the diplomat bought three names and that the guard beside the pouch knows the route. The success gives them a lead, though the guard has noticed Skirmy noticing him.',
    isCoop: true,
    characters: [{ id: 'foliza', name: 'Foliza' }, { id: 'skirmy', name: 'Skirmy' }],
    rollOutcome: {
      success: true,
      expectedRollerNames: ['Foliza', 'Skirmy'],
    },
    suggestedActions: ['Ask Jarvis whose names were bought', 'Have Skirmy tail the pouch guard', 'Let Foliza keep the market distracted'],
    worldBible: bible,
    worldStateBefore: worldState,
    worldStateAfter: finalWorldState,
    expectedNpcMemoryNames: ['Jarvis', 'Courier Pouch Guard'],
    expectedCharacterMemoryIds: ['foliza', 'skirmy'],
    expectDmMemory: true,
    expectConsequenceMemory: true,
  });
  assert.equal(finalReadiness.ready, true, finalReadiness.issues.map(issue => `${issue.code}: ${issue.message}`).join('\n'));
  assert.equal(finalWorldState.coopPendingRoll, null);
});
