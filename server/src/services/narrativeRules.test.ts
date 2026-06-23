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
  assert.equal(npc.relationshipScore, -15);
  assert.equal(relationshipLabel(npc.relationshipScore || 0), 'acquaintance');
  assert.match(npc.notes, /spared/i);
});

test('fight seeking is distinguished from a grounded encounter setup', () => {
  assert.equal(isFightSeekingAction('I look for a fight'), true);
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

test('acts cannot advance before minimum pacing or act-one introductions', () => {
  const bible = {
    playerPreferences: { campaignLength: 'medium' },
    dmRoadmap: { act1MustIntroduce: ['Captain Veyra', 'Ash Gate'] },
  } as unknown as WorldBible;
  const early = canAdvanceAct({ actionsInCurrentAct: 4 }, bible, 1);
  assert.equal(early.allowed, false);

  const missingIntroduction = canAdvanceAct({ actionsInCurrentAct: 12, npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: '' }] }, bible, 1);
  assert.equal(missingIntroduction.allowed, false);

  const ready = canAdvanceAct({
    actionsInCurrentAct: 12,
    npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: '' }],
    discoveredLocations: ['Ash Gate'],
  } as WorldState, bible, 1);
  assert.equal(ready.allowed, true);
});
