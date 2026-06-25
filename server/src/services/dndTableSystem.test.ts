import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { analyzeActionRail } from './storyRails';
import { buildDndTableProfile, formatDndTableDirectives, maybeBuildSkillChallenge } from './dndTableSystem';
import { planSoloTurn } from './gameDirector';

function makeCharacter(id: string, name: string, extras: Partial<Character> = {}): Character {
  return {
    id,
    user_id: `u-${id}`,
    campaign_id: 'camp',
    name,
    race: 'Lizardfolk',
    class: 'Bard',
    level: 3,
    xp: 0,
    hp: 20,
    max_hp: 24,
    stats: { str: 10, dex: 14, con: 12, int: 11, wis: 13, cha: 16 },
    abilities: [],
    inventory: [],
    gold: 10,
    backstory: 'A court performer exiled after exposing a noble lie.',
    reputation: {},
    is_alive: true,
    created_at: 'now',
    updated_at: 'now',
    ...extras,
  };
}

const worldBible: WorldBible = {
  era: 'The Long Dusk',
  magicSystem: 'Old vows have teeth.',
  centralConflict: 'A false diplomat is unmaking border treaties.',
  geography: [],
  pantheon: [],
  toneRules: [],
  forbiddenLoreHooks: [],
  factions: [],
  openingHooks: [],
  primaryAntagonist: {
    name: 'The Velvet Envoy',
    type: 'primary',
    agenda: 'Turn every local leader against the party before the truth reaches court.',
    currentStep: 'Plant forged correspondence.',
    planSteps: [],
    whatTheyKnow: 'The party is asking questions.',
    isRevealed: true,
    power: 'major',
  },
  antagonistRoster: [],
};

test('table profile classifies independent co-op checks as separate rolls', () => {
  const c1 = makeCharacter('c1', 'Foliza');
  const c2 = makeCharacter('c2', 'Skirmy', { race: 'Yuan-Ti', class: 'Ranger', stats: { str: 12, dex: 16, con: 12, int: 12, wis: 15, cha: 10 } });
  const worldState: WorldState = { currentLocation: 'Verdant Valley' };
  const rails = [
    analyzeActionRail(c1, 'persuade Jarvis to reveal the diplomat secret', worldState, worldBible),
    analyzeActionRail(c2, 'search the crowd for the diplomat spy', worldState, worldBible),
  ];

  const profile = buildDndTableProfile({ characters: [c1, c2], worldState, worldBible, rails });
  const directives = formatDndTableDirectives(profile);

  assert.equal(profile.rollMode, 'separate');
  assert.match(directives, /Queue\/resolve all required rolls/i);
  assert.match(directives, /never accept the first roll and discard the second/i);
});

test('table profile treats help as one assisted check, not two duplicated rolls', () => {
  const c1 = makeCharacter('c1', 'Foliza');
  const c2 = makeCharacter('c2', 'Skirmy');
  const worldState: WorldState = { currentLocation: 'Old Mill' };
  const rails = [
    analyzeActionRail(c1, 'persuade the miller to admit what he saw', worldState, worldBible),
    analyzeActionRail(c2, 'help Foliza by backing up her story', worldState, worldBible),
  ];

  const profile = buildDndTableProfile({ characters: [c1, c2], worldState, worldBible, rails });

  assert.equal(profile.rollMode, 'assisted');
  assert.match(profile.rollDirective, /one primary check/i);
  assert.match(profile.rollDirective, /helper/i);
});

test('identity and world reaction directives include backstory, npc memory, and faction pressure', () => {
  const character = makeCharacter('c1', 'Foliza', { reputation: { 'Verdant Watch': -35 } });
  const worldState: WorldState = {
    currentLocation: 'Verdant Valley',
    factionStandings: { 'Verdant Watch': -40 },
    npcMemory: [{
      name: 'Jarvis',
      disposition: 'hostile',
      notes: 'Cornered after hiding the diplomat route.',
      relationshipScore: -45,
      relationshipLabel: 'angry informant',
    }],
    backstoryHooks: [{ characterId: 'c1', characterName: 'Foliza', hook: 'The noble lie follows her into every court.', status: 'active' }],
  };

  const profile = buildDndTableProfile({ characters: [character], worldState, worldBible, rails: [] });
  const directives = formatDndTableDirectives(profile);

  assert.match(directives, /court performer exiled/i);
  assert.match(directives, /The noble lie/i);
  assert.match(directives, /Verdant Watch/i);
  assert.match(directives, /Jarvis/i);
  assert.match(directives, /should not remain nearly neutral/i);
});

test('skill challenge starts for repeated pressured investigation scenes', () => {
  const character = makeCharacter('c1', 'Foliza');
  const worldState: WorldState = {
    currentLocation: 'Verdant Valley',
    sceneState: { purpose: 'gather_info', exchangeCount: 3, stalledCount: 1, pacingMode: 'tension', cluesThisScene: 1 },
  };
  const rails = [analyzeActionRail(character, 'search for clues about the diplomat', worldState, worldBible)];

  const challenge = maybeBuildSkillChallenge(rails, worldState, {
    purpose: 'gather_info',
    objective: 'Expose the diplomat route',
    stakes: 'Jarvis flees if the party loses the crowd.',
  });

  assert.ok(challenge);
  assert.equal(challenge.objective, 'Expose the diplomat route');
  assert.deepEqual(challenge.participantIds, ['c1']);
  assert.equal(challenge.targetSuccesses, 2);
});

test('game director guardrails include the D&D table system block', () => {
  const character = makeCharacter('c1', 'Foliza');
  const worldState: WorldState = { currentLocation: 'Verdant Valley' };
  const plan = planSoloTurn(character, 'persuade Jarvis to reveal the diplomat secret', worldState, worldBible);

  assert.match(plan.guardrails, /D&D TABLE SYSTEMS/);
  assert.match(plan.guardrails, /ROLL ADJUDICATION/);
  assert.match(plan.guardrails, /CHARACTER IDENTITY/);
  assert.match(plan.guardrails, /WORLD REACTION/);
});
