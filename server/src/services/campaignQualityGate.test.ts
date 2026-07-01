import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible } from '../../../shared/types';
import { auditWorldBibleQuality, repairWorldBibleQuality } from './campaignQualityGate';

function thinWorldBible(): WorldBible {
  return {
    era: '',
    magicSystem: '',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    primaryAntagonist: undefined as unknown as WorldBible['primaryAntagonist'],
    centralConflict: '',
    antagonistRoster: [],
    openingHooks: [],
  };
}

test('auditWorldBibleQuality flags missing playable campaign scaffolding', () => {
  const issues = auditWorldBibleQuality(thinWorldBible(), {
    playMode: 'collaborative',
    favoritePillars: ['Mystery', 'Roleplay'],
    playerCount: 2,
  });

  assert.ok(issues.some(issue => issue.code === 'thin_opening_hooks'));
  assert.ok(issues.some(issue => issue.code === 'weak_campaign_brief'));
  assert.ok(issues.some(issue => issue.code === 'mystery_without_clue_ladder'));
  assert.ok(issues.some(issue => issue.code === 'coop_without_shared_spotlights'));
});

test('repairWorldBibleQuality adds the missing campaign DNA needed before play', () => {
  const repaired = repairWorldBibleQuality(thinWorldBible(), {
    playMode: 'collaborative',
    tone: 'Warm mystery',
    favoritePillars: ['Mystery', 'Exploration'],
    playerCount: 2,
    characterConcepts: ['A ranger hunted by an old oath'],
  });

  assert.ok(repaired.primaryAntagonist.name);
  assert.ok(repaired.geography.length >= 3);
  assert.ok(repaired.factions.length >= 2);
  assert.equal(repaired.openingHooks.length, 3);
  assert.ok((repaired.mysteryLayer?.clues.length || 0) >= 4);
  assert.ok((repaired.spotlightDesign?.sharedMoments.length || 0) >= 2);
  assert.ok(repaired.futureHookSeeds?.length && repaired.futureHookSeeds.length >= 4);
  assert.ok(repaired.dmRoadmap?.act1Goals.length && repaired.dmRoadmap.act1Goals.length >= 3);
});
