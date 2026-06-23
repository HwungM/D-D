import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible, WorldState } from '../../../shared/types';
import { buildCampaignSpineSnapshot, buildLocationGraphSnapshot, mergeWorldStateChanges } from './worldStateSystem';

test('world state reducer merges NPC memory and promotes recurring key NPCs', () => {
  const current: WorldState = {
    npcMemory: [{ name: 'Mysterious Stranger', disposition: 'neutral', notes: 'Met once.', interactionCount: 1 }],
  };
  const merged = mergeWorldStateChanges(current, {
    npcMemory: [
      {
        name: 'Veyra',
        replacesName: 'Mysterious Stranger',
        disposition: 'friendly',
        notes: 'Revealed herself as Veyra.',
        metCharacters: ['King'],
        isKeyNPC: true,
      },
    ],
  });

  assert.equal(merged.npcMemory?.some(npc => npc.name === 'Mysterious Stranger'), false);
  assert.equal(merged.npcMemory?.[0].name, 'Veyra');
  assert.equal(merged.npcMemory?.[0].interactionCount, 2);
  assert.equal(merged.keyNPCs?.[0].name, 'Veyra');
});

test('world state reducer merges quests, notes, and discovered locations without duplicates', () => {
  const merged = mergeWorldStateChanges(
    {
      discoveredLocations: ['Ash Gate'],
      sessionNotes: ['Met Veyra'],
      activeQuests: [{ title: 'Main Thread', description: 'Find Ash Gate', status: 'active', startedAt: 'old' }],
    },
    {
      discoveredLocations: ['Ash Gate', 'Old Road'],
      sessionNotes: ['Met Veyra', 'Found tracks'],
      activeQuests: [{ title: 'Main Thread', description: 'Find the hidden gate', status: 'active' }],
    },
  );

  assert.deepEqual(merged.discoveredLocations, ['Ash Gate', 'Old Road']);
  assert.deepEqual(merged.sessionNotes, ['Met Veyra', 'Found tracks']);
  assert.equal(merged.activeQuests?.[0].description, 'Find the hidden gate');
  assert.equal(merged.activeQuests?.[0].startedAt, 'old');
});

test('location graph and campaign spine snapshots expose playable campaign state', () => {
  const worldState: WorldState = {
    currentLocation: 'Ash Gate',
    discoveredLocations: ['Ash Gate', 'Old Road'],
    characterLocations: { c1: 'Ash Gate' },
    activeNPC: 'Veyra',
    npcMemory: [{ name: 'Veyra', disposition: 'friendly', notes: 'Guide at the gate.', lastMet: 'Ash Gate', interactionCount: 3, isKeyNPC: true }],
    activeQuests: [{ title: 'Find the Gate', description: 'Find Ash Gate before dusk.', status: 'active' }],
    actionsInCurrentAct: 7,
  };
  const bible = {
    playerPreferences: { campaignLength: 'short' },
    geography: [
      { name: 'Ash Gate', type: 'landmark', description: 'A scorched arch.' },
      { name: 'Old Road', type: 'wilderness', description: 'A broken road.' },
    ],
  } as unknown as WorldBible;

  const graph = buildLocationGraphSnapshot(worldState, bible);
  const spine = buildCampaignSpineSnapshot(worldState, bible, 1);

  assert.equal(graph?.currentLocation, 'Ash Gate');
  assert.ok(graph?.nodes.find(node => node.name === 'Ash Gate')?.tags.includes('current'));
  assert.ok(graph?.nodes.find(node => node.name === 'Ash Gate')?.npcsPresent.includes('Veyra'));
  assert.equal(spine?.currentArc.label, 'The Call');
  assert.equal(spine?.currentArc.progress, 39);
  assert.ok(spine?.openThreads.includes('Quest: Find the Gate'));
});
