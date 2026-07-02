import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, SceneInteractable, WorldState } from '../../../shared/types';
import { buildNpcInteractionContext, personalityForNpc, recordNpcConversation, topicSimilarity } from './npcSocialMemorySystem';

const character = { id: 'sunmi', name: 'Sun Mi' } as Character;
const scene: SceneInteractable[] = [{ kind: 'npc', name: 'Mara', hook: 'the innkeeper' }];

test('NPC personalities are deterministic and behavioral', () => {
  assert.deepEqual(personalityForNpc('Mara', 'innkeeper'), personalityForNpc('Mara', 'innkeeper'));
  assert.ok(personalityForNpc('Mara', 'innkeeper').patience > 0);
});

test('topic similarity detects repeated questions', () => {
  assert.ok(topicSimilarity('missing villager bog lights', 'bog missing villagers') >= 0.34);
  assert.equal(topicSimilarity('missing villager', 'ale prices'), 0);
});

test('the next player receives a shared repetition directive', () => {
  const first = recordNpcConversation({ currentLocation: 'Inn' }, character, scene, 'Ask Mara about the missing villager in the bog', 'Mara says she saw lights.')!;
  const worldState: WorldState = { currentLocation: 'Inn', npcMemory: first.npcMemory };
  const context = buildNpcInteractionContext(worldState, { id: 'tellini', name: 'Tellini' } as Character, scene, 'Ask Mara what she knows about the missing villager and bog');
  assert.match(context, /REPEATED TOPIC DETECTED/);
  assert.match(context, /Sun Mi/);
});
