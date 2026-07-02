import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LocationNode } from '../../../shared/types';
import {
  buildFallbackSubLocations,
  generateSubLocationsFromService,
  locationWantsSubLocations,
  matchSubLocationNavigation,
  resolveExplicitSubLocationNavigation,
  textAttemptsSubLocationNavigation,
  needsSubLocationGeneration,
} from './subLocationSystem';

function makeNode(overrides: Partial<LocationNode> = {}): LocationNode {
  return {
    name: 'Kellhaven',
    region: 'The Salt Coast',
    type: 'city',
    visits: 1,
    connectedTo: [],
    npcsPresent: [],
    questHooks: [],
    partyHere: [],
    tags: [],
    ...overrides,
  };
}

test('locationWantsSubLocations is true for city/region/landmark, false otherwise', () => {
  assert.equal(locationWantsSubLocations(makeNode({ type: 'city' })), true);
  assert.equal(locationWantsSubLocations(makeNode({ type: 'region' })), true);
  assert.equal(locationWantsSubLocations(makeNode({ type: 'landmark' })), true);
  assert.equal(locationWantsSubLocations(makeNode({ type: 'dungeon' })), false);
  assert.equal(locationWantsSubLocations(makeNode({ type: 'wilderness' })), false);
  assert.equal(locationWantsSubLocations(makeNode({ type: 'unknown' })), false);
  assert.equal(locationWantsSubLocations(undefined), false);
});

test('needsSubLocationGeneration is true only for an eligible node with no sub-locations yet', () => {
  assert.equal(needsSubLocationGeneration(makeNode({ type: 'city' })), true);
  assert.equal(needsSubLocationGeneration(makeNode({ type: 'dungeon' })), false);
  const alreadyGenerated = makeNode({
    type: 'city',
    subLocations: [{ id: '1', name: 'The Tavern', parentLocationName: 'Kellhaven', description: 'x', npcsPresent: [], objectsOfInterest: [], type: 'tavern' }],
  });
  assert.equal(needsSubLocationGeneration(alreadyGenerated), false);
});

test('buildFallbackSubLocations returns 3-6 grounded sub-locations without an AI call', () => {
  const node = makeNode();
  const subs = buildFallbackSubLocations(node);
  assert.ok(subs.length >= 3 && subs.length <= 6);
  for (const sub of subs) {
    assert.equal(sub.parentLocationName, 'Kellhaven');
    assert.ok(sub.name.length > 0);
    assert.ok(sub.description.length > 0);
  }
});

test('generateSubLocationsFromService parses a well-formed AI response into SubLocations', async () => {
  const fakeOpenai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                subLocations: [
                  { name: 'The Rusty Anchor Tavern', description: 'A dockside tavern.', npcsPresent: ['a gruff barkeep'], objectsOfInterest: ['a warped bar'], type: 'tavern' },
                  { name: 'Kellhaven Smithy', description: 'Sparks fly here.', npcsPresent: ['a blacksmith'], objectsOfInterest: ['an anvil'], type: 'shop' },
                  { name: 'Town Hall', description: 'Seat of local power.', npcsPresent: [], objectsOfInterest: ['a council table'], type: 'civic' },
                ],
              }),
            },
          }],
        }),
      },
    },
  };
  const node = makeNode();
  const subs = await generateSubLocationsFromService(fakeOpenai, () => {}, node, {} as any);
  assert.equal(subs.length, 3);
  assert.equal(subs[0].name, 'The Rusty Anchor Tavern');
  assert.equal(subs[0].parentLocationName, 'Kellhaven');
  assert.equal(subs[1].type, 'shop');
});

test('generateSubLocationsFromService falls back to templates when the AI call throws', async () => {
  const brokenOpenai = {
    chat: { completions: { create: async () => { throw new Error('rate limited'); } } },
  };
  const node = makeNode();
  const subs = await generateSubLocationsFromService(brokenOpenai, () => {}, node, {} as any);
  assert.ok(subs.length >= 3);
});

test('generateSubLocationsFromService falls back to templates when the AI response is malformed/too small', async () => {
  const badOpenai = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: JSON.stringify({ subLocations: [{ description: 'no name' }] }) } }] }),
      },
    },
  };
  const node = makeNode();
  const subs = await generateSubLocationsFromService(badOpenai, () => {}, node, {} as any);
  assert.ok(subs.length >= 3);
});

test('matchSubLocationNavigation recognizes entering a sub-location by name', () => {
  const node = makeNode({ subLocations: buildFallbackSubLocations(makeNode()) });
  const tavernName = node.subLocations![0].name;
  const match = matchSubLocationNavigation(`head into ${tavernName}`, node, undefined);
  assert.ok(match);
  assert.equal(match!.kind, 'enter');
  if (match!.kind === 'enter') assert.equal(match.subLocation.name, tavernName);
});

test('matchSubLocationNavigation recognizes leaving back to the parent location', () => {
  const node = makeNode({ subLocations: buildFallbackSubLocations(makeNode()) });
  const tavernName = node.subLocations![0].name;
  const match = matchSubLocationNavigation('leave the tavern and head out', node, tavernName);
  assert.ok(match);
  assert.equal(match!.kind, 'leave');
});

test('matchSubLocationNavigation returns undefined for an ordinary action that mentions no sub-location', () => {
  const node = makeNode({ subLocations: buildFallbackSubLocations(makeNode()) });
  const match = matchSubLocationNavigation('ask the bartender about the missing shipment', node, undefined);
  assert.equal(match, undefined);
});

test('matchSubLocationNavigation returns undefined when the node has no sub-locations yet', () => {
  const node = makeNode();
  const match = matchSubLocationNavigation('head into the tavern', node, undefined);
  assert.equal(match, undefined);
});

test('explicit navigation resolves by stable sub-location id', () => {
  const node = makeNode({ subLocations: buildFallbackSubLocations(makeNode()) });
  const target = node.subLocations![1];
  const match = resolveExplicitSubLocationNavigation({ kind: 'enter', subLocationId: target.id }, node, undefined);
  assert.equal(match?.kind, 'enter');
  if (match?.kind === 'enter') assert.equal(match.subLocation.id, target.id);
});

test('typed movement is detected but does not itself authorize navigation', () => {
  const node = makeNode({ subLocations: buildFallbackSubLocations(makeNode()) });
  const target = node.subLocations![0];
  assert.equal(textAttemptsSubLocationNavigation(`I want to go to ${target.name}`, node, undefined), true);
  assert.equal(textAttemptsSubLocationNavigation('ask the librarian about the old map', node, undefined), false);
});
