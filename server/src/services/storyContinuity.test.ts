import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import type { NarrationResult } from './narrationResponseParser';
import type { ActionRail } from './storyRails';
import { applyContinuityRepairs, buildContinuityDirective } from './storyContinuity';

const gol = {
  id: 'gol',
  name: 'Gol',
  gender: 'male',
  race: 'Goliath',
  class: 'Warlock',
} as Character;

const rail = {
  characterId: 'gol',
  characterName: 'Gol',
  action: 'ask Ryliss for information',
  intent: 'social',
} as unknown as ActionRail;

const worldState = {
  currentLocation: 'Whimsical Knick-Knack Shop',
  npcMemory: [{
    name: 'Ryliss',
    disposition: 'friendly',
    notes: 'Nervous male gnome shopkeeper.',
    role: 'merchant',
    gender: 'male',
  }],
} as WorldState;

test('continuity directive includes recurring NPC identity canon', () => {
  const directive = buildContinuityDirective([gol], [rail], worldState, {
    campaignBrief: { whereToStart: 'Whimsical Knick-Knack Shop' },
  } as unknown as WorldBible);

  assert.match(directive, /Ryliss: male \(he\/him\/his\)/);
  assert.match(directive, /NPC gender, pronouns, role, personality, knowledge/);
});

test('continuity repair fixes an unambiguous recurring NPC pronoun slip', () => {
  const response = {
    narration: 'Ryliss adjusts her frayed cap. The hidden clockwork ticks beneath the rug.',
  } as NarrationResult;

  applyContinuityRepairs(response, [gol], [rail], worldState);

  assert.equal(response.narration, 'Ryliss adjusts his frayed cap. The hidden clockwork ticks beneath the rug.');
});
