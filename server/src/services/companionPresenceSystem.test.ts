import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanionCharacter, WorldState } from '../../../shared/types';
import {
  COMPANION_PRESENCE_MIN_SPACING,
  buildCompanionPresenceBeat,
  companionsPresentWithCharacter,
  pickPresentCompanion,
  shouldFireCompanionPresence,
  weaveCompanionPresenceIntoReaction,
} from './companionPresenceSystem';

function makeCompanion(overrides: Partial<CompanionCharacter> = {}): CompanionCharacter {
  return {
    id: 'comp-1',
    name: 'Faelan',
    race: 'Elf',
    class: 'Ranger',
    level: 3,
    xp: 0,
    hp: 20,
    max_hp: 20,
    stats: { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 8 },
    abilities: [],
    inventory: [],
    bondLevel: 10,
    is_alive: true,
    recruitedAt: new Date().toISOString(),
    ...overrides,
  };
}

function freeRoamWithActions(count: number): WorldState['freeRoam'] {
  const now = Date.now();
  return {
    startedAt: new Date(now - count * 1000).toISOString(),
    location: 'Ash Gate',
    actions: Array.from({ length: count }, (_, i) => ({
      action: `action ${i}`,
      reaction: `reaction ${i}`,
      createdAt: new Date(now - (count - i) * 1000).toISOString(),
    })),
  };
}

test('companionsPresentWithCharacter returns living companions when the character has no sub-location split', () => {
  const ws: WorldState = { companions: [makeCompanion()] };
  const present = companionsPresentWithCharacter(ws, 'char-1');
  assert.equal(present.length, 1);
  assert.equal(present[0].name, 'Faelan');
});

test('companionsPresentWithCharacter excludes dead companions', () => {
  const ws: WorldState = { companions: [makeCompanion({ is_alive: false })] };
  assert.deepEqual(companionsPresentWithCharacter(ws, 'char-1'), []);
});

test('companionsPresentWithCharacter treats a character split into their own sub-location as companion-less — companions stay with the shared scene', () => {
  const ws: WorldState = {
    companions: [makeCompanion()],
    characterSubLocations: { 'char-1': 'A Private Back Room' },
  };
  assert.deepEqual(companionsPresentWithCharacter(ws, 'char-1'), []);
  // A co-op partner who did NOT split off still has the companion present.
  const wsWithPartner: WorldState = {
    companions: [makeCompanion()],
    characterSubLocations: { 'char-1': 'A Private Back Room' },
  };
  assert.equal(companionsPresentWithCharacter(wsWithPartner, 'char-2').length, 1);
});

test('shouldFireCompanionPresence never fires with no companion present', () => {
  const ws: WorldState = { freeRoam: freeRoamWithActions(20) };
  assert.equal(shouldFireCompanionPresence(ws, 'char-1', () => 0), false);
});

test('shouldFireCompanionPresence never fires while every companion is dead', () => {
  const ws: WorldState = { companions: [makeCompanion({ is_alive: false })], freeRoam: freeRoamWithActions(20) };
  assert.equal(shouldFireCompanionPresence(ws, 'char-1', () => 0), false);
});

test('shouldFireCompanionPresence respects the minimum-spacing cooldown', () => {
  const companions = [makeCompanion()];
  const tooSoon: WorldState = { companions, freeRoam: freeRoamWithActions(COMPANION_PRESENCE_MIN_SPACING - 1) };
  assert.equal(shouldFireCompanionPresence(tooSoon, 'char-1', () => 0), false);

  const eligible: WorldState = { companions, freeRoam: freeRoamWithActions(COMPANION_PRESENCE_MIN_SPACING) };
  assert.equal(shouldFireCompanionPresence(eligible, 'char-1', () => 0), true);
});

test('shouldFireCompanionPresence respects the roll against COMPANION_PRESENCE_CHANCE once eligible', () => {
  const companions = [makeCompanion()];
  const eligible: WorldState = { companions, freeRoam: freeRoamWithActions(COMPANION_PRESENCE_MIN_SPACING) };
  assert.equal(shouldFireCompanionPresence(eligible, 'char-1', () => 0.001), true);
  assert.equal(shouldFireCompanionPresence(eligible, 'char-1', () => 0.99), false);
});

test('shouldFireCompanionPresence counts spacing from the companion\'s own lastSeenAt, not scene start', () => {
  const freeRoam = freeRoamWithActions(20);
  // The companion was last featured right after the 18th free-roam action —
  // only 2 actions since, under the spacing floor.
  const companions = [makeCompanion({ lastSeenAt: freeRoam!.actions[17].createdAt })];
  const ws: WorldState = { companions, freeRoam };
  assert.equal(shouldFireCompanionPresence(ws, 'char-1', () => 0), false);
});

test('pickPresentCompanion features exactly one companion, never piling multiple into a single beat', () => {
  const companions = [makeCompanion({ id: 'a', name: 'Faelan' }), makeCompanion({ id: 'b', name: 'Dobbin' })];
  const picked = pickPresentCompanion(companions, () => 0.99);
  assert.ok(picked);
  assert.equal(picked!.id, 'b');
  assert.equal(pickPresentCompanion([], () => 0), undefined);
});

test('buildCompanionPresenceBeat returns a non-empty in-character line', () => {
  const beat = buildCompanionPresenceBeat(makeCompanion(), () => 0);
  assert.ok(beat.length > 0);
});

test('buildCompanionPresenceBeat can proactively engage something actually present', () => {
  const beat = buildCompanionPresenceBeat(makeCompanion(), () => 0, [
    { kind: 'npc', name: 'Mira', hook: 'a librarian guarding the archive' },
  ]);
  assert.match(beat, /Mira/);
  assert.match(beat, /says/);
});

test('weaveCompanionPresenceIntoReaction leads with the companion\'s name and reads distinctly from an ambient world event aside', () => {
  const woven = weaveCompanionPresenceIntoReaction('The merchant nods and takes your coin.', makeCompanion({ name: 'Faelan' }), 'hums a tune under their breath');
  assert.ok(woven.startsWith('The merchant nods and takes your coin.'));
  assert.match(woven, /\(Faelan hums a tune under their breath\.\)/);
  assert.ok(!woven.includes('Meanwhile:'));
});
