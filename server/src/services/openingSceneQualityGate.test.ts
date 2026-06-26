import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible } from '../../../shared/types';
import { applyOpeningSceneQualityGate, assessOpeningSceneQuality } from './openingSceneQualityGate';

function character(id: string, name: string): Character {
  return {
    id,
    user_id: `user-${id}`,
    campaign_id: 'camp-1',
    name,
    race: 'Human',
    class: 'Bard',
    level: 1,
    xp: 0,
    hp: 10,
    max_hp: 10,
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 14 },
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
  era: 'Age of Green Songs',
  magicSystem: 'Songs wake old roads.',
  centralConflict: 'Promises are being bought and sold.',
  geography: [{ name: 'Verdant Valley', description: 'A valley of mossy terraces and bright market tents.', type: 'region' }],
  pantheon: [],
  toneRules: ['Warm mystery with danger underneath.'],
  forbiddenLoreHooks: [],
  factions: [],
  primaryAntagonist: {
    name: 'The Diplomat',
    type: 'primary',
    agenda: 'Buy the valley one promise at a time.',
    currentStep: 'Send messengers through the crowd.',
    planSteps: ['Begin', 'Finish'],
    whatTheyKnow: 'Not much.',
    isRevealed: false,
    power: 'major',
  },
  antagonistRoster: [],
  openingHooks: ['Jarvis recognizes an old diplomatic seal in the crowd.'],
  campaignBrief: {
    hook: 'A performance draws the wrong attention.',
    objective: 'Find why the diplomat is buying songs.',
    motivation: 'The valley’s music is personal.',
    whereToStart: 'Verdant Valley market',
    worldStakes: 'The valley loses its voice.',
    characterStakes: 'The heroes lose people who know their names.',
    mysteryHint: 'Why are songs becoming contracts?',
  },
} as WorldBible;

test('assessOpeningSceneQuality catches split-camera co-op openings that drop a player', () => {
  const issues = assessOpeningSceneQuality({
    result: {
      narration: 'Foliza stands in Verdant Valley market. Meanwhile, elsewhere, trouble gathers.',
      diceRequired: false,
      suggestedActions: ['Continue'],
      sceneImagePrompt: '',
      isLevelUp: false,
      isDeath: false,
      isCombat: false,
      isVictory: false,
    },
    worldBible,
    characters: [character('c1', 'Foliza'), character('c2', 'Skirmy')],
    isCoop: true,
  });

  assert.ok(issues.some(issue => issue.code === 'opening_character_missing'));
  assert.ok(issues.some(issue => issue.code === 'split_camera_opening'));
});

test('applyOpeningSceneQualityGate repairs missing presence and weak suggestions', () => {
  const result = applyOpeningSceneQualityGate({
    result: {
      narration: 'Foliza arrives in Verdant Valley market as the first song begins.',
      diceRequired: false,
      suggestedActions: ['Continue'],
      sceneImagePrompt: '',
      isLevelUp: false,
      isDeath: false,
      isCombat: false,
      isVictory: false,
      character1SuggestedActions: ['Continue'],
      character2SuggestedActions: [],
    },
    worldBible,
    characters: [character('c1', 'Foliza'), character('c2', 'Skirmy')],
    isCoop: true,
  });

  assert.match(result.narration, /Skirmy/);
  assert.equal(result.openingQualityRepaired, true);
  assert.ok(result.suggestedActions.length >= 3);
  assert.ok(result.character2SuggestedActions?.length && result.character2SuggestedActions.length >= 3);
});
