import assert from 'node:assert/strict';
import test from 'node:test';
import type { HiddenIdentity, NpcMemory, WorldBible, WorldState } from '../../../shared/types';
import {
  cleanIdentityRevealed,
  detectHiddenIdentityIntroduction,
  guardIdentityRevealed,
  resolveIdentityRevealed,
} from './hiddenIdentitySystem';

function worldBible(overrides: Partial<WorldBible> = {}): WorldBible {
  return {
    era: 'Age of Tides',
    magicSystem: 'Names bend the sea.',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    primaryAntagonist: {
      name: 'Vezrantha',
      type: 'primary',
      agenda: 'Burn the valley to reclaim her hoard.',
      currentStep: 'Wearing the face of a trusted general.',
      planSteps: [],
      whatTheyKnow: '',
      isRevealed: false,
      power: 'legendary',
    },
    centralConflict: 'The land trusts the wrong protector.',
    antagonistRoster: [],
    openingHooks: [],
    plannedBetrayal: {
      npcRole: 'a general/officer who aids the party from early on',
      trueIdentity: 'secretly Vezrantha, the dragon terrorizing the region, in disguise',
      setupHint: 'Introduce her as a battle-scarred general who fights beside the party.',
    },
    ...overrides,
  };
}

function npc(overrides: Partial<NpcMemory> = {}): NpcMemory {
  return {
    name: 'General Korath',
    disposition: 'friendly',
    notes: 'A grizzled general who has fought beside the party twice.',
    role: 'general',
    ...overrides,
  };
}

// ── Seeding → live conversion ────────────────────────────────────────────────

test('detectHiddenIdentityIntroduction creates a HiddenIdentity when a new NPC matches plannedBetrayal.npcRole', () => {
  const worldState: WorldState = {};
  const identity = detectHiddenIdentityIntroduction(worldState, worldBible(), [npc()]);

  assert.ok(identity);
  assert.equal(identity?.npcName, 'General Korath');
  assert.equal(identity?.trueIdentity, 'secretly Vezrantha, the dragon terrorizing the region, in disguise');
  assert.equal(identity?.isRevealed, false);
  assert.ok(identity?.id);
  assert.ok(identity?.createdAt);
  assert.match(identity?.revealCondition || '', /General Korath/);
});

test('detectHiddenIdentityIntroduction ignores NPCs that do not plausibly match the planned role', () => {
  const worldState: WorldState = {};
  const identity = detectHiddenIdentityIntroduction(worldState, worldBible(), [
    npc({ name: 'Merla the Baker', role: 'merchant', notes: 'Sells bread near the square.' }),
  ]);
  assert.equal(identity, undefined);
});

test('detectHiddenIdentityIntroduction is a no-op without a plannedBetrayal or with no new NPCs', () => {
  assert.equal(detectHiddenIdentityIntroduction({}, worldBible({ plannedBetrayal: undefined }), [npc()]), undefined);
  assert.equal(detectHiddenIdentityIntroduction({}, worldBible(), []), undefined);
});

test('detectHiddenIdentityIntroduction never creates a second hidden identity while one is already tracked', () => {
  const existing: HiddenIdentity = {
    id: 'hi-1',
    npcName: 'General Korath',
    trueIdentity: 'secretly Vezrantha',
    revealCondition: 'later',
    isRevealed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const worldState: WorldState = { hiddenIdentities: [existing] };
  const identity = detectHiddenIdentityIntroduction(worldState, worldBible(), [npc({ name: 'Another General', role: 'general' })]);
  assert.equal(identity, undefined);
});

// ── Guarding a reveal ─────────────────────────────────────────────────────────

function activeIdentity(overrides: Partial<HiddenIdentity> = {}): HiddenIdentity {
  return {
    id: 'hi-1',
    npcName: 'General Korath',
    trueIdentity: 'secretly Vezrantha, the dragon terrorizing the region, in disguise',
    revealCondition: 'Reveal once trust is built and the mystery clues point to her.',
    isRevealed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('guardIdentityRevealed blocks a premature reveal (too early, not high stakes, or unknown NPC)', () => {
  const worldState: WorldState = { hiddenIdentities: [activeIdentity()] };
  const revealed = { npcName: 'General Korath' };

  // Too early, even though high stakes.
  assert.equal(guardIdentityRevealed(revealed, worldState, { isHighStakes: true, actionCount: 3 }), undefined);
  // Not high stakes, even though late.
  assert.equal(guardIdentityRevealed(revealed, worldState, { isHighStakes: false, actionCount: 40 }), undefined);
  // Unknown NPC name.
  assert.equal(guardIdentityRevealed({ npcName: 'Nobody' }, worldState, { isHighStakes: true, actionCount: 40 }), undefined);
  // Already revealed — blocked.
  const revealedWorldState: WorldState = { hiddenIdentities: [activeIdentity({ isRevealed: true })] };
  assert.equal(guardIdentityRevealed(revealed, revealedWorldState, { isHighStakes: true, actionCount: 40 }), undefined);
});

test('guardIdentityRevealed allows a genuine late, high-stakes reveal', () => {
  const worldState: WorldState = { hiddenIdentities: [activeIdentity()] };
  const revealed = { npcName: 'General Korath' };
  assert.deepEqual(guardIdentityRevealed(revealed, worldState, { isHighStakes: true, actionCount: 40 }), revealed);
});

test('guardIdentityRevealed allows an earlier reveal when a mystery clue already points at the NPC', () => {
  const worldState: WorldState = {
    hiddenIdentities: [activeIdentity()],
    mysteryClues: [{ id: 'c1', status: 'revealed', clue: 'A dragon-scale was found under the general\'s cloak.', pointsToward: 'General Korath', possibleSources: [] }],
  };
  const revealed = { npcName: 'General Korath' };
  assert.deepEqual(guardIdentityRevealed(revealed, worldState, { isHighStakes: true, actionCount: 5 }), revealed);
});

// ── Resolving a guarded reveal ────────────────────────────────────────────────

test('resolveIdentityRevealed marks the identity revealed and pushes a high-urgency story ledger entry', () => {
  const worldState: WorldState = { hiddenIdentities: [activeIdentity()], storyLedger: [] };
  const result = resolveIdentityRevealed(worldState, { npcName: 'General Korath' });

  assert.equal(result.hiddenIdentities?.[0].isRevealed, true);
  assert.ok(result.hiddenIdentities?.[0].revealedAt);
  assert.equal(result.storyLedger?.length, 1);
  assert.equal(result.storyLedger?.[0].urgency, 'high');
  assert.equal(result.storyLedger?.[0].status, 'pressing');
  assert.equal(result.storyLedger?.[0].anchorNpc, 'General Korath');
  assert.match(result.storyLedger?.[0].summary || '', /Vezrantha/);
});

test('resolveIdentityRevealed is a no-op without a revealed signal or an unknown/already-revealed NPC', () => {
  const worldState: WorldState = { hiddenIdentities: [activeIdentity()] };
  assert.deepEqual(resolveIdentityRevealed(worldState, undefined), {});
  assert.deepEqual(resolveIdentityRevealed(worldState, { npcName: 'Nobody' }), {});
  const revealedWorldState: WorldState = { hiddenIdentities: [activeIdentity({ isRevealed: true })] };
  assert.deepEqual(resolveIdentityRevealed(revealedWorldState, { npcName: 'General Korath' }), {});
});

// ── Response cleaning ─────────────────────────────────────────────────────────

test('cleanIdentityRevealed only accepts a well-formed {npcName}', () => {
  assert.deepEqual(cleanIdentityRevealed({ npcName: 'General Korath' }), { npcName: 'General Korath' });
  assert.equal(cleanIdentityRevealed({}), undefined);
  assert.equal(cleanIdentityRevealed(null), undefined);
  assert.equal(cleanIdentityRevealed('nope'), undefined);
});
