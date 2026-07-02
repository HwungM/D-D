import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackstoryHook, CompanionCharacter, SignatureItemQuest, WorldBible, WorldState } from '../../../shared/types';
import {
  buildSignatureItemQuestPrompt,
  buildTemplateSignatureItemQuest,
  cleanPartyAssetGranted,
  cleanSignatureItemEarned,
  generateSignatureItemQuest,
  guardPartyAssetGranted,
  guardSignatureItemEarned,
  parseSignatureItemQuest,
  resolvePartyAssetGranted,
  resolveSignatureItemEarned,
} from './signatureRewardsService';

function worldBible(): WorldBible {
  return {
    era: 'Age of Tides',
    magicSystem: 'Names bend the sea.',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    primaryAntagonist: {
      name: 'The Bell Drowned',
      type: 'primary',
      agenda: 'wants the moon-crown',
      currentStep: 'corrupting the harbor bells',
      planSteps: [],
      whatTheyKnow: '',
      isRevealed: false,
      power: 'legendary',
    },
    centralConflict: 'The tide wants its throne back.',
    antagonistRoster: [],
    openingHooks: [],
  };
}

function hook(overrides: Partial<BackstoryHook> = {}): BackstoryHook {
  return {
    characterId: 'char-1',
    characterName: 'Vex',
    hook: "Vex's sister vanished into the drowned ruins of House Thal.",
    status: 'dormant',
    ...overrides,
  };
}

function quest(overrides: Partial<SignatureItemQuest> = {}): SignatureItemQuest {
  return {
    id: 'quest-1',
    characterId: 'char-1',
    characterName: 'Vex',
    itemName: "Whisperwind, the Hunter's Longbow",
    itemFlavor: 'A bow carved from her sister\'s favorite tree.',
    questHook: "Recover it from the ruins of House Thal.",
    status: 'seeded',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function companion(overrides: Partial<CompanionCharacter> = {}): CompanionCharacter {
  return {
    id: 'comp-1',
    name: 'Grog',
    race: 'Half-Orc',
    class: 'Barbarian',
    level: 3,
    xp: 0,
    hp: 30,
    max_hp: 30,
    stats: { str: 18, dex: 12, con: 16, int: 8, wis: 10, cha: 10 },
    abilities: [],
    inventory: [],
    bondLevel: 20,
    is_alive: true,
    recruitedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Seeding a signature item quest from a backstory hook ────────────────────

test('buildSignatureItemQuestPrompt names the character, hook, and campaign context', () => {
  const prompt = buildSignatureItemQuestPrompt(hook(), 'Elf', 'Ranger', worldBible());
  assert.match(prompt, /Vex, Elf Ranger/);
  assert.match(prompt, /drowned ruins of House Thal/);
  assert.match(prompt, /tide wants its throne back/);
});

test('parseSignatureItemQuest builds a seeded quest tied to the hook, with a safe fallback for bad JSON', () => {
  const good = parseSignatureItemQuest(
    '{"itemName":"Whisperwind","itemFlavor":"Her sister\'s bow.","itemType":"weapon","questHook":"Find it in the ruins."}',
    hook(),
  );
  assert.equal(good.characterId, 'char-1');
  assert.equal(good.characterName, 'Vex');
  assert.equal(good.itemName, 'Whisperwind');
  assert.equal(good.status, 'seeded');
  assert.ok(good.id);
  assert.ok(good.createdAt);

  const fallback = parseSignatureItemQuest('not json', hook());
  assert.equal(fallback.characterId, 'char-1');
  assert.equal(fallback.status, 'seeded');
  assert.match(fallback.questHook, /drowned ruins of House Thal/);
});

test('generateSignatureItemQuest calls gpt-4o-mini and parses the seeded quest', async () => {
  let seenModel = '';
  const openai = {
    chat: {
      completions: {
        create: async (args: { model: string; messages: { role: 'system' | 'user'; content: string }[] }) => {
          seenModel = args.model;
          return { choices: [{ message: { content: '{"itemName":"Whisperwind","itemFlavor":"Her sister\'s bow.","itemType":"weapon","questHook":"Find it in the ruins."}' } }] };
        },
      },
    },
  };

  const result = await generateSignatureItemQuest(openai, hook(), 'Elf', 'Ranger', worldBible());
  assert.equal(seenModel, 'gpt-4o-mini');
  assert.equal(result.itemName, 'Whisperwind');
  assert.equal(result.status, 'seeded');
});

test('buildTemplateSignatureItemQuest builds a deterministic quest without an AI call', () => {
  const result = buildTemplateSignatureItemQuest(hook(), 'Wizard');
  assert.equal(result.characterId, 'char-1');
  assert.match(result.itemName, /Grimoire/);
  assert.equal(result.status, 'seeded');
});

// ── Earning a signature item during play ─────────────────────────────────────

test('resolveSignatureItemEarned marks the quest earned and routes the item into the acting character\'s loot', () => {
  const worldState: WorldState = { signatureItemQuests: [quest()] };
  const result = resolveSignatureItemEarned(worldState, { characterId: 'char-1', questId: 'quest-1' }, 'char-1');

  assert.equal(result.signatureItemQuests?.[0].status, 'earned');
  assert.ok(result.signatureItemQuests?.[0].earnedItem);
  assert.equal(result.signatureItemQuests?.[0].earnedItem?.name, "Whisperwind, the Hunter's Longbow");
  assert.equal(result.extraLootForActingCharacter?.length, 1);
  assert.equal(result.extraLootForActingCharacter?.[0].name, "Whisperwind, the Hunter's Longbow");
  assert.equal(result.companions, undefined);
});

test('resolveSignatureItemEarned routes the item into a companion\'s inventory when they own the quest', () => {
  const worldState: WorldState = {
    signatureItemQuests: [quest({ characterId: 'comp-1', characterName: 'Grog' })],
    companions: [companion()],
  };
  const result = resolveSignatureItemEarned(worldState, { characterId: 'comp-1', questId: 'quest-1' }, 'char-1');

  assert.equal(result.signatureItemQuests?.[0].status, 'earned');
  assert.equal(result.companions?.[0].inventory.length, 1);
  assert.equal(result.companions?.[0].inventory[0].name, "Whisperwind, the Hunter's Longbow");
  assert.equal(result.extraLootForActingCharacter, undefined);
});

test('resolveSignatureItemEarned is a no-op when the quest is already earned or unknown', () => {
  const worldState: WorldState = { signatureItemQuests: [quest({ status: 'earned' })] };
  assert.deepEqual(resolveSignatureItemEarned(worldState, { characterId: 'char-1', questId: 'quest-1' }, 'char-1'), {});
  assert.deepEqual(resolveSignatureItemEarned(worldState, { characterId: 'char-1', questId: 'missing' }, 'char-1'), {});
  assert.deepEqual(resolveSignatureItemEarned(worldState, undefined, 'char-1'), {});
});

test('guardSignatureItemEarned blocks casual/early completion and honors a real earned moment', () => {
  const worldState: WorldState = { signatureItemQuests: [quest()] };
  const earned = { characterId: 'char-1', questId: 'quest-1' };

  // Too early in a fresh campaign — blocked even though it's high stakes.
  assert.equal(guardSignatureItemEarned(earned, worldState, { isHighStakes: true, actionCount: 2 }), undefined);
  // Not a high-stakes moment — blocked even later in the campaign.
  assert.equal(guardSignatureItemEarned(earned, worldState, { isHighStakes: false, actionCount: 40 }), undefined);
  // Quest already earned — blocked.
  const earnedWorldState: WorldState = { signatureItemQuests: [quest({ status: 'earned' })] };
  assert.equal(guardSignatureItemEarned(earned, earnedWorldState, { isHighStakes: true, actionCount: 40 }), undefined);
  // Unknown quest id — blocked.
  assert.equal(guardSignatureItemEarned({ characterId: 'char-1', questId: 'nope' }, worldState, { isHighStakes: true, actionCount: 40 }), undefined);
  // A genuine, earned, later-campaign moment — allowed through.
  assert.deepEqual(guardSignatureItemEarned(earned, worldState, { isHighStakes: true, actionCount: 40 }), earned);
});

// ── Party assets ──────────────────────────────────────────────────────────────

test('resolvePartyAssetGranted appends a new PartyAsset to WorldState.partyAssets', () => {
  const worldState: WorldState = { partyAssets: [] };
  const granted = { kind: 'property' as const, name: 'Greyhawk Keep', description: 'A fortress won from the dragon lord.', locationName: 'The Greylands' };
  const result = resolvePartyAssetGranted(worldState, granted, 'defeating the dragon lord');

  assert.equal(result?.length, 1);
  assert.equal(result?.[0].name, 'Greyhawk Keep');
  assert.equal(result?.[0].kind, 'property');
  assert.equal(result?.[0].grantedBy, 'defeating the dragon lord');
  assert.ok(result?.[0].id);
  assert.ok(result?.[0].grantedAt);
});

test('resolvePartyAssetGranted preserves existing assets and is a no-op without a grant', () => {
  const worldState: WorldState = { partyAssets: [{ id: 'a1', kind: 'title', name: 'Wardens of the Vale', description: '...', grantedAt: '2026-01-01', grantedBy: 'the vale council' }] };
  assert.equal(resolvePartyAssetGranted(worldState, undefined, 'anything'), undefined);

  const result = resolvePartyAssetGranted(worldState, { kind: 'position', name: 'Council Seat', description: 'A voice on the ruling council.' }, 'the treaty');
  assert.equal(result?.length, 2);
  assert.equal(result?.[0].name, 'Wardens of the Vale');
  assert.equal(result?.[1].name, 'Council Seat');
});

test('guardPartyAssetGranted blocks routine/early grants and honors a real major moment', () => {
  const granted = { kind: 'title' as const, name: 'Wardens of the Vale', description: 'Recognized protectors of the vale.' };

  assert.equal(guardPartyAssetGranted(granted, { isHighStakes: false, advanceAct: false, actionCount: 40 }), undefined);
  assert.equal(guardPartyAssetGranted(granted, { isHighStakes: true, advanceAct: false, actionCount: 2 }), undefined);
  assert.deepEqual(guardPartyAssetGranted(granted, { isHighStakes: true, advanceAct: false, actionCount: 40 }), granted);
  assert.deepEqual(guardPartyAssetGranted(granted, { isHighStakes: false, advanceAct: true, actionCount: 40 }), granted);
});

// ── Response cleaning (mirrors narrationResponseParser conventions) ─────────

test('cleanSignatureItemEarned only accepts a well-formed {characterId,questId} pair', () => {
  assert.deepEqual(cleanSignatureItemEarned({ characterId: 'c1', questId: 'q1' }), { characterId: 'c1', questId: 'q1' });
  assert.equal(cleanSignatureItemEarned({ characterId: 'c1' }), undefined);
  assert.equal(cleanSignatureItemEarned(null), undefined);
  assert.equal(cleanSignatureItemEarned('nope'), undefined);
});

test('cleanPartyAssetGranted validates kind/name/description and passes through optional fields', () => {
  const clean = cleanPartyAssetGranted({ kind: 'title', name: 'Wardens', description: 'Protectors.', locationName: 'The Vale', unlocksHint: 'Council access.' });
  assert.deepEqual(clean, { kind: 'title', name: 'Wardens', description: 'Protectors.', locationName: 'The Vale', unlocksHint: 'Council access.' });

  assert.equal(cleanPartyAssetGranted({ kind: 'castle', name: 'X', description: 'Y' }), undefined);
  assert.equal(cleanPartyAssetGranted({ kind: 'title', name: 'X' }), undefined);
  assert.equal(cleanPartyAssetGranted(undefined), undefined);
});
