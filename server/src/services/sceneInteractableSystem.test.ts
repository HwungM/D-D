import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { buildSceneInteractables, formatSceneInteractablesBlock } from './sceneInteractableSystem';

test('buildSceneInteractables reuses locationGraph/npcMemory/activeNPC rather than a parallel system', () => {
  const ws: WorldState = {
    currentLocation: 'The Gilded Tankard',
    activeNPC: 'Brannic the Innkeeper',
    locationGraph: {
      currentLocation: 'The Gilded Tankard',
      nodes: [
        {
          name: 'The Gilded Tankard',
          region: 'Port Vessa',
          visits: 3,
          connectedTo: ['The Docks', 'Market Row'],
          npcsPresent: ['Brannic the Innkeeper', 'Sera the Bard'],
          questHooks: ['a locked chest behind the bar'],
          partyHere: [],
          tags: ['smells of ale and woodsmoke'],
        },
      ],
      regions: [],
      nearby: ['The Docks'],
      updatedAt: new Date().toISOString(),
    },
    npcMemory: [
      { name: 'Brannic the Innkeeper', disposition: 'friendly', notes: 'Owes the party a favor.', role: 'innkeeper' },
    ],
  };

  const interactables = buildSceneInteractables(ws);
  const npcNames = interactables.filter(i => i.kind === 'npc').map(i => i.name);
  assert.ok(npcNames.includes('Brannic the Innkeeper'));
  assert.ok(npcNames.includes('Sera the Bard'));

  const brannic = interactables.find(i => i.name === 'Brannic the Innkeeper')!;
  assert.match(brannic.hook, /innkeeper/);
  assert.match(brannic.hook, /favor/);

  const exits = interactables.filter(i => i.kind === 'exit').map(i => i.name);
  assert.ok(exits.includes('The Docks'));
  assert.ok(exits.includes('Market Row'));

  const objects = interactables.filter(i => i.kind === 'object');
  assert.ok(objects.some(o => o.hook.includes('locked chest')));
});

test('buildSceneInteractables never throws on an empty/minimal world state', () => {
  assert.doesNotThrow(() => buildSceneInteractables({}));
  const result = buildSceneInteractables({});
  assert.deepEqual(result, []);
});

test('formatSceneInteractablesBlock renders a readable block and a safe fallback when empty', () => {
  const block = formatSceneInteractablesBlock([
    { kind: 'npc', name: 'Sera the Bard', hook: 'knows a rumor about the missing shipment' },
    { kind: 'exit', name: 'The Docks', hook: 'travel to The Docks' },
  ]);
  assert.match(block, /Sera the Bard/);
  assert.match(block, /The Docks/);

  const fallback = formatSceneInteractablesBlock(undefined);
  assert.match(fallback, /Nothing specific/);
});
