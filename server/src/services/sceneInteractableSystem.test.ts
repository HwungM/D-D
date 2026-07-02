import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldState } from '../../../shared/types';
import { buildSceneInteractables, formatSceneInteractablesBlock, getOrBuildSceneInteractablesForCharacter, withSceneInteractablesForCharacter } from './sceneInteractableSystem';

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

function baseNodeWithSubLocations() {
  return {
    name: 'Kellhaven',
    region: 'The Salt Coast',
    type: 'city' as const,
    visits: 3,
    connectedTo: ['The Docks'],
    npcsPresent: ['Brannic the Innkeeper'],
    questHooks: [],
    partyHere: [],
    tags: ['a busy market square'],
    subLocations: [
      { id: '1', name: 'The Rusty Anchor Tavern', parentLocationName: 'Kellhaven', description: 'A tavern.', npcsPresent: ['Old Tomas'], objectsOfInterest: ['a worn bar'], type: 'tavern' as const },
      { id: '2', name: 'Kellhaven Smithy', parentLocationName: 'Kellhaven', description: 'A smithy.', npcsPresent: ['Greta the Smith'], objectsOfInterest: ['a glowing forge'], type: 'shop' as const },
    ],
  };
}

test('buildSceneInteractables scopes to the character\'s current sub-location when set', () => {
  const ws: WorldState = {
    currentLocation: 'Kellhaven',
    locationGraph: {
      currentLocation: 'Kellhaven',
      nodes: [baseNodeWithSubLocations()],
      regions: [],
      nearby: [],
      updatedAt: new Date().toISOString(),
    },
    characterSubLocations: { 'char-1': 'The Rusty Anchor Tavern' },
  };

  const interactables = buildSceneInteractables(ws, 'char-1');
  const npcNames = interactables.filter(i => i.kind === 'npc').map(i => i.name);
  // Only the tavern's own NPC — NOT the top-level node's npcsPresent (Brannic).
  assert.ok(npcNames.includes('Old Tomas'));
  assert.ok(!npcNames.includes('Brannic the Innkeeper'));
  assert.ok(!npcNames.includes('Greta the Smith'));

  const objects = interactables.filter(i => i.kind === 'object').map(i => i.name);
  assert.ok(objects.includes('a worn bar'));

  const exits = interactables.filter(i => i.kind === 'exit');
  assert.ok(exits.some(e => e.hook.includes('leave to Kellhaven')));
  assert.ok(exits.some(e => e.name === 'Kellhaven Smithy'));
});

test('buildSceneInteractables with no characterId (or no sub-location set) behaves exactly as before — top-level scoping', () => {
  const ws: WorldState = {
    currentLocation: 'Kellhaven',
    locationGraph: {
      currentLocation: 'Kellhaven',
      nodes: [baseNodeWithSubLocations()],
      regions: [],
      nearby: [],
      updatedAt: new Date().toISOString(),
    },
  };

  const withoutCharacterId = buildSceneInteractables(ws);
  const npcNames = withoutCharacterId.filter(i => i.kind === 'npc').map(i => i.name);
  assert.ok(npcNames.includes('Brannic the Innkeeper'));

  // Sub-locations are offered as enterable exits from the top level too.
  const exits = withoutCharacterId.filter(i => i.kind === 'exit').map(i => i.name);
  assert.ok(exits.includes('The Rusty Anchor Tavern'));
  assert.ok(exits.includes('Kellhaven Smithy'));

  // A character with no characterSubLocations entry sees the same thing.
  const withCharacterIdButNoSubLocation = buildSceneInteractables(ws, 'char-2');
  assert.deepEqual(withCharacterIdButNoSubLocation, withoutCharacterId);
});

test('two characters at the same top-level location but different sub-locations get genuinely different interactable sets', () => {
  const ws: WorldState = {
    currentLocation: 'Kellhaven',
    locationGraph: {
      currentLocation: 'Kellhaven',
      nodes: [baseNodeWithSubLocations()],
      regions: [],
      nearby: [],
      updatedAt: new Date().toISOString(),
    },
    characterSubLocations: {
      'char-1': 'The Rusty Anchor Tavern',
      'char-2': 'Kellhaven Smithy',
    },
  };

  const char1View = buildSceneInteractables(ws, 'char-1');
  const char2View = buildSceneInteractables(ws, 'char-2');
  const char1Npcs = char1View.filter(i => i.kind === 'npc').map(i => i.name);
  const char2Npcs = char2View.filter(i => i.kind === 'npc').map(i => i.name);
  assert.ok(char1Npcs.includes('Old Tomas'));
  assert.ok(char2Npcs.includes('Greta the Smith'));
  assert.ok(!char1Npcs.includes('Greta the Smith'));
  assert.ok(!char2Npcs.includes('Old Tomas'));
});

// Regression test for the live co-op bug: Tellini (char-1), off alone in a
// sub-location, saw their action-panel chips change when Sun Mi (char-2) —
// in a completely different sub-location — took her own micro-action. Root
// cause was WorldState.sceneInteractables being a single flat array any
// character's turn could overwrite; the fix keys it per-character, mirroring
// characterSubLocations. This proves that invariant holds through the exact
// merge helper the micro-action route uses.
test('withSceneInteractablesForCharacter updates one character\'s slot without ever touching another character\'s stored entry — the co-op cross-contamination regression', () => {
  const baseWs: WorldState = {
    currentLocation: 'Kellhaven',
    locationGraph: {
      currentLocation: 'Kellhaven',
      nodes: [baseNodeWithSubLocations()],
      regions: [],
      nearby: [],
      updatedAt: new Date().toISOString(),
    },
    characterSubLocations: {
      'char-1': 'The Rusty Anchor Tavern',
      'char-2': 'Kellhaven Smithy',
    },
  };

  // Tellini (char-1) takes a micro-action in the tavern; her scoped
  // interactables get computed and written into the shared per-character map.
  const char1Interactables = buildSceneInteractables(baseWs, 'char-1');
  const afterChar1: WorldState = {
    ...baseWs,
    sceneInteractables: withSceneInteractablesForCharacter(baseWs, 'char-1', char1Interactables),
  };

  // Sun Mi (char-2), in the smithy, then takes her own micro-action.
  const char2Interactables = buildSceneInteractables(afterChar1, 'char-2');
  const afterChar2: WorldState = {
    ...afterChar1,
    sceneInteractables: withSceneInteractablesForCharacter(afterChar1, 'char-2', char2Interactables),
  };

  // Tellini's own stored slot must be exactly what it was before — Sun Mi's
  // action never touched it.
  assert.deepEqual(afterChar2.sceneInteractables!['char-1'], char1Interactables);
  assert.deepEqual(afterChar2.sceneInteractables!['char-2'], char2Interactables);

  // And the two views are genuinely different (tavern chips vs. smithy chips),
  // not one shared array silently picked up by both.
  const char1Npcs = afterChar2.sceneInteractables!['char-1'].filter(i => i.kind === 'npc').map(i => i.name);
  const char2Npcs = afterChar2.sceneInteractables!['char-2'].filter(i => i.kind === 'npc').map(i => i.name);
  assert.ok(char1Npcs.includes('Old Tomas'));
  assert.ok(char2Npcs.includes('Greta the Smith'));
  assert.ok(!char1Npcs.includes('Greta the Smith'));
  assert.ok(!char2Npcs.includes('Old Tomas'));
});

test('getOrBuildSceneInteractablesForCharacter self-heals a missing per-character entry instead of leaking another character\'s stale data', () => {
  const ws: WorldState = {
    currentLocation: 'Kellhaven',
    locationGraph: {
      currentLocation: 'Kellhaven',
      nodes: [baseNodeWithSubLocations()],
      regions: [],
      nearby: [],
      updatedAt: new Date().toISOString(),
    },
    characterSubLocations: { 'char-1': 'The Rusty Anchor Tavern' },
    sceneInteractables: { 'char-1': [{ kind: 'npc', name: 'Old Tomas', hook: 'the tavern keeper' }] },
  };

  // char-2 has never been scoped before — it must be freshly computed from
  // its own (top-level, no sub-location) context, not char-1's stored array.
  const result = getOrBuildSceneInteractablesForCharacter(ws, 'char-2');
  assert.ok(!result.some(i => i.name === 'Old Tomas' && i.kind === 'npc' && result === ws.sceneInteractables!['char-1']));
  assert.notEqual(result, ws.sceneInteractables!['char-1']);
  const npcNames = result.filter(i => i.kind === 'npc').map(i => i.name);
  assert.ok(npcNames.includes('Brannic the Innkeeper')); // top-level NPC, not the tavern's

  // An existing entry is reused as-is rather than recomputed.
  const existing = getOrBuildSceneInteractablesForCharacter(ws, 'char-1');
  assert.equal(existing, ws.sceneInteractables!['char-1']);
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
