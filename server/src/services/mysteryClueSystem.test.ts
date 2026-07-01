import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldBible, WorldState } from '../../../shared/types';
import { applyClueReveals, buildClueBankBlock, resolveMysteryClueChanges, seedMysteryClues } from './mysteryClueSystem';

function baseWorldBible(): WorldBible {
  return {
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    era: 'test era',
    magicSystem: 'test magic',
    primaryAntagonist: {
      name: 'The Hollow King',
      type: 'primary',
      agenda: 'consume the realm',
      currentStep: 'gathering power',
      planSteps: [],
      whatTheyKnow: '',
      isRevealed: false,
      power: 'major',
    },
    centralConflict: 'a kingdom under siege',
    antagonistRoster: [],
    openingHooks: [],
    mysteryLayer: {
      centralQuestion: 'Who is really behind the vanishings?',
      clues: ['A torn cloak found at the well', 'A ledger with an unfamiliar seal', 'A witness who saw a hooded figure'],
      redHerrings: ['The miller seems suspicious but is innocent'],
      revelation: 'The steward orchestrated it all',
    },
  };
}

test('seedMysteryClues seeds the bank from WorldBible.mysteryLayer, never inventing text', () => {
  const ws: WorldState = {};
  const wb = baseWorldBible();
  const seeded = seedMysteryClues(ws, wb);
  assert.ok(seeded);
  assert.equal(seeded!.length, 3);
  for (const clue of seeded!) {
    assert.equal(clue.status, 'undiscovered');
    assert.equal(clue.pointsToward, wb.mysteryLayer!.centralQuestion);
    assert.ok(wb.mysteryLayer!.clues.includes(clue.clue));
  }
});

test('seedMysteryClues is idempotent — does not duplicate or reseed an already-seeded bank', () => {
  const wb = baseWorldBible();
  const ws: WorldState = {};
  const first = seedMysteryClues(ws, wb);
  const seededWs: WorldState = { ...ws, mysteryClues: first };
  const second = seedMysteryClues(seededWs, wb);
  assert.equal(second, undefined);
});

test('seedMysteryClues returns undefined when there is no mystery layer', () => {
  const wb = baseWorldBible();
  delete wb.mysteryLayer;
  assert.equal(seedMysteryClues({}, wb), undefined);
});

test('buildClueBankBlock lists only undiscovered clues by id, and is empty once all are revealed', () => {
  const wb = baseWorldBible();
  const seeded = seedMysteryClues({}, wb)!;
  const block = buildClueBankBlock({ mysteryClues: seeded });
  assert.match(block, /MYSTERY CLUE BANK/);
  for (const clue of seeded) assert.match(block, new RegExp(clue.id));

  const allRevealed = seeded.map(c => ({ ...c, status: 'revealed' as const }));
  assert.equal(buildClueBankBlock({ mysteryClues: allRevealed }), '');
});

test('applyClueReveals only flips ids that exist and are still undiscovered — never invents new entries', () => {
  const wb = baseWorldBible();
  const bank = seedMysteryClues({}, wb)!;
  const targetId = bank[0].id;

  const updated = applyClueReveals(bank, [targetId, 'made-up-id-that-does-not-exist'], 'event-1');
  assert.ok(updated);
  assert.equal(updated!.length, bank.length); // no new entries created for the invented id
  const revealed = updated!.find(c => c.id === targetId)!;
  assert.equal(revealed.status, 'revealed');
  assert.equal(revealed.revealedAtEventId, 'event-1');
  // everything else stays untouched
  for (const clue of updated!.filter(c => c.id !== targetId)) {
    assert.equal(clue.status, 'undiscovered');
  }
});

test('applyClueReveals returns undefined when nothing actually changed (no ids, or already revealed)', () => {
  const wb = baseWorldBible();
  const bank = seedMysteryClues({}, wb)!;
  assert.equal(applyClueReveals(bank, undefined), undefined);
  assert.equal(applyClueReveals(bank, []), undefined);

  const alreadyRevealed = bank.map(c => ({ ...c, status: 'revealed' as const }));
  assert.equal(applyClueReveals(alreadyRevealed, [bank[0].id]), undefined);
});

test('resolveMysteryClueChanges: a macro-turn that reveals nothing leaves every clue undiscovered — missed clues are never retroactively granted', () => {
  const wb = baseWorldBible();
  const ws: WorldState = {};
  // Simulate an "Advance" turn where the AI extractor reported no reveals at all
  // (the player skipped whatever scene would have surfaced these clues).
  const result = resolveMysteryClueChanges(ws, wb, undefined);
  assert.ok(result); // still gets seeded the first time
  assert.ok(result!.every(c => c.status === 'undiscovered'));

  // Running it again with still no reveals must not change anything further.
  const secondWs: WorldState = { ...ws, mysteryClues: result };
  const second = resolveMysteryClueChanges(secondWs, wb, undefined);
  assert.equal(second, undefined);
  assert.ok((secondWs.mysteryClues || []).every(c => c.status === 'undiscovered'));
});

test('resolveMysteryClueChanges reveals exactly the reported ids and leaves the rest untouched', () => {
  const wb = baseWorldBible();
  const seeded = seedMysteryClues({}, wb)!;
  const ws: WorldState = { mysteryClues: seeded };
  const targetId = seeded[1].id;

  const result = resolveMysteryClueChanges(ws, wb, [targetId], 'evt-42');
  assert.ok(result);
  const revealedCount = result!.filter(c => c.status === 'revealed').length;
  assert.equal(revealedCount, 1);
  assert.equal(result!.find(c => c.id === targetId)!.revealedAtEventId, 'evt-42');
});
