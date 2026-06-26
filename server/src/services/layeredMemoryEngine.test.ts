import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { buildLayeredMemoryChanges, buildMemoryPack, selectRelevantNpcMemories } from './layeredMemoryEngine';

function character(id: string, name: string): Character {
  return {
    id,
    user_id: `user-${id}`,
    campaign_id: 'camp-1',
    name,
    race: 'Human',
    class: 'Ranger',
    level: 3,
    xp: 0,
    hp: 20,
    max_hp: 20,
    stats: { str: 10, dex: 14, con: 12, int: 10, wis: 16, cha: 11 },
    abilities: [],
    inventory: [],
    gold: 0,
    reputation: {},
    is_alive: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const worldBible = {
  era: 'Age of Tests',
  magicSystem: 'Promises bind magic.',
  centralConflict: 'Trust is being weaponized.',
  geography: [],
  pantheon: [],
  toneRules: ['Warm mystery with honest consequences.'],
  forbiddenLoreHooks: [],
  factions: [],
  primaryAntagonist: {
    name: 'The Diplomat',
    type: 'primary',
    agenda: 'Buy every promise.',
    currentStep: 'Pressure the valley.',
    planSteps: ['begin', 'finish'],
    whatTheyKnow: 'Little.',
    isRevealed: false,
    power: 'major',
  },
  antagonistRoster: [],
  openingHooks: [],
  playerPreferences: {
    tone: 'Warm mystery',
    favoritePillars: ['Roleplay'],
    playerCount: 2,
    characterConcepts: [],
  },
} as WorldBible;

test('selectRelevantNpcMemories prioritizes active, local, and relationship-heavy NPCs', () => {
  const worldState: WorldState = {
    currentLocation: 'Verdant Valley',
    activeNPC: 'Jarvis',
    npcMemory: [
      { name: 'Jarvis', disposition: 'neutral', notes: 'Knows the diplomat has a courier pouch.', lastMet: 'Verdant Valley', interactionCount: 1 },
      { name: 'Bandit Rusk', disposition: 'hostile', notes: 'Was beaten and cornered by the party.', lastMet: 'Old Road', relationshipScore: -60, relationshipLabel: 'bitter rival' },
      { name: 'Distant Baker', disposition: 'friendly', notes: 'Sold bread once.', lastMet: 'Far Town' },
    ],
  };

  const relevant = selectRelevantNpcMemories(worldState, [character('c1', 'Foliza')], ['Ask Jarvis about the courier pouch']);

  assert.equal(relevant[0].name, 'Jarvis');
  assert.ok(relevant.some(npc => npc.name === 'Bandit Rusk'));
});

test('buildMemoryPack renders compact layered memory for the prompt', () => {
  const worldState: WorldState = {
    currentLocation: 'Verdant Valley',
    activeNPC: 'Jarvis',
    npcMemory: [{ name: 'Jarvis', disposition: 'neutral', notes: 'Recognized Foliza and Skirmy after their song.', lastMet: 'Verdant Valley', metCharacters: ['Foliza'] }],
    characterMemories: [{
      characterId: 'c1',
      characterName: 'Foliza',
      knownFacts: ['Jarvis fears the diplomat.'],
      personalStakes: ['Her songs are becoming contracts.'],
      relationships: [{ npcName: 'Jarvis', summary: 'Wary informant.', label: 'wary informant', lastUpdatedAt: 'then' }],
      lastUpdatedAt: 'then',
    }],
    dmMemory: {
      recurringMotifs: ['Songs as contracts'],
      tableToneNotes: ['Warm mystery'],
      unresolvedConsequences: ['Jarvis may be followed.'],
      runningJokes: [],
      promisesToHonor: ['Jarvis owes one answer.'],
      lastUpdatedAt: 'then',
    },
  };

  const pack = buildMemoryPack(worldState, worldBible, [character('c1', 'Foliza')], ['question Jarvis']);

  assert.match(pack.promptBlock, /NPC memory/);
  assert.match(pack.promptBlock, /Player character memory/);
  assert.match(pack.promptBlock, /DM campaign memory/);
  assert.match(pack.promptBlock, /Jarvis owes one answer/);
});

test('buildLayeredMemoryChanges records character facts, relationships, and DM consequences', () => {
  const foliza = character('c1', 'Foliza');
  const worldState: WorldState = {
    currentLocation: 'Verdant Valley',
    storyLedger: [{ id: 'promise-1', kind: 'promise', title: 'Jarvis debt', summary: 'Jarvis promised one honest answer.', status: 'open', urgency: 'medium', createdAt: 'then' }],
    backstoryHooks: [{ characterId: 'c1', characterName: 'Foliza', hook: 'Her songs bind old oaths.', status: 'active' }],
  };

  const changes = buildLayeredMemoryChanges({
    worldState,
    worldBible,
    characters: [foliza],
    actions: ['Foliza presses Jarvis about the diplomat'],
    narration: 'Jarvis lowers his cane and admits the diplomat bought three names before sunrise.',
    location: 'Verdant Valley',
    actionCount: 4,
    aiResponse: {
      activeNPC: 'Jarvis',
      isHighStakes: true,
      turnOutcome: {
        playerIntent: 'Press Jarvis for information.',
        concreteResult: 'Jarvis reveals the bought names.',
        informationRevealed: ['The diplomat bought three names before sunrise.'],
        situationChanged: true,
        unresolvedQuestion: null,
        whyNoRoll: 'Jarvis chose to speak after prior pressure.',
        whyRollNeeded: null,
      },
      worldStateChanges: {
        npcMemory: [{ name: 'Jarvis', disposition: 'neutral', notes: 'Revealed the diplomat bought names before sunrise.', metCharacters: ['Foliza'], relationshipScore: 10, relationshipLabel: 'nervous informant' }],
      },
    },
  });

  assert.equal(changes.characterMemories?.[0].characterName, 'Foliza');
  assert.match(changes.characterMemories?.[0].knownFacts[0] || '', /diplomat bought three names/);
  assert.equal(changes.characterMemories?.[0].relationships[0].npcName, 'Jarvis');
  assert.ok(changes.dmMemory?.promisesToHonor.some(promise => promise.includes('Jarvis promised')));
  assert.ok(changes.dmMemory?.unresolvedConsequences.some(item => item.includes('Jarvis debt')));
});
