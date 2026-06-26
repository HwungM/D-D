import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { evaluateExperienceFrame, evaluateExperienceSequence, formatExperienceEvalReport } from './experienceEvalSystem';

function character(id: string, name: string): Pick<Character, 'id' | 'name'> {
  return { id, name };
}

const bible = {
  centralConflict: 'Trust is being weaponized.',
  toneRules: ['Warm mystery with honest danger.'],
  playerPreferences: {
    tone: 'Warm mystery',
    favoritePillars: ['Roleplay', 'Mystery'],
    playerCount: 2,
    characterConcepts: [],
  },
} as unknown as WorldBible;

test('experience eval catches co-op, pacing, suggestion, and memory failures', () => {
  const report = evaluateExperienceFrame({
    label: 'bad co-op beat',
    narration: 'Foliza talks to Jarvis. Meanwhile, elsewhere, the campaign leaps to Act II after days pass.',
    isCoop: true,
    characters: [character('foliza', 'Foliza'), character('skirmy', 'Skirmy')],
    suggestedActions: ['Continue', 'Look around'],
    worldBible: bible,
    worldStateAfter: { npcMemory: [] },
    expectedNpcMemoryNames: ['Jarvis'],
    expectedCharacterMemoryIds: ['foliza'],
    expectDmMemory: true,
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some(issue => issue.code === 'coop_character_missing'));
  assert.ok(report.issues.some(issue => issue.code === 'split_camera'));
  assert.ok(report.issues.some(issue => issue.code === 'rushed_pacing'));
  assert.ok(report.issues.some(issue => issue.code === 'npc_memory_missing'));
  assert.ok(report.issues.some(issue => issue.code === 'character_memory_missing'));
  assert.ok(report.issues.some(issue => issue.code === 'dm_memory_missing'));
});

test('experience eval catches roll outcomes that ignore a roller or contradict dice', () => {
  const report = evaluateExperienceFrame({
    label: 'bad roll outcome',
    narration: 'Foliza succeeds and cleanly gets exactly what she wanted from Jarvis.',
    rollOutcome: {
      success: false,
      expectedRollerNames: ['Foliza', 'Skirmy'],
    },
    suggestedActions: ['Ask Jarvis what frightened him', 'Watch the crowd for the courier', 'Have Skirmy follow the glance'],
  });

  assert.equal(report.ready, false);
  assert.ok(report.issues.some(issue => issue.code === 'roll_failure_contradicted'));
  assert.ok(report.issues.some(issue => issue.code === 'roll_actor_missing' && issue.message.includes('Skirmy')));
});

test('experience eval passes a healthy co-op memory beat', () => {
  const worldStateBefore: WorldState = {
    currentLocation: 'Verdant Valley',
    npcMemory: [{ name: 'Jarvis', disposition: 'neutral', notes: 'Wary old informant.', relationshipScore: 0 }],
  };
  const worldStateAfter: WorldState = {
    currentLocation: 'Verdant Valley',
    npcMemory: [{ name: 'Jarvis', disposition: 'friendly', notes: 'Trusted Foliza and Skirmy enough to reveal the diplomat bought names before sunrise.', relationshipScore: 25, relationshipLabel: 'nervous ally', metCharacters: ['Foliza', 'Skirmy'] }],
    characterMemories: [
      { characterId: 'foliza', characterName: 'Foliza', knownFacts: ['The diplomat bought names before sunrise.'], personalStakes: ['Her songs may become contracts.'], relationships: [{ npcName: 'Jarvis', summary: 'Nervous ally.', label: 'nervous ally', score: 25, lastUpdatedAt: 'now' }], lastUpdatedAt: 'now' },
      { characterId: 'skirmy', characterName: 'Skirmy', knownFacts: ['Jarvis watched the courier pouch.'], personalStakes: [], relationships: [{ npcName: 'Jarvis', summary: 'Nervous ally.', label: 'nervous ally', score: 25, lastUpdatedAt: 'now' }], lastUpdatedAt: 'now' },
    ],
    dmMemory: {
      recurringMotifs: ['songs as contracts'],
      tableToneNotes: ['warm mystery'],
      unresolvedConsequences: ['Jarvis may be followed by the diplomat’s courier.'],
      runningJokes: [],
      promisesToHonor: ['Jarvis owes one more honest answer.'],
      lastUpdatedAt: 'now',
    },
  };

  const report = evaluateExperienceFrame({
    label: 'good co-op memory beat',
    narration: 'Foliza lets the final note linger while Skirmy watches Jarvis flinch toward the courier pouch. Jarvis lowers his cane and, softly enough that only they hear, admits the diplomat bought three names before sunrise. The crowd still thinks it witnessed a song; Foliza and Skirmy now know it was also a confession, and Jarvis knows they noticed his fear. A child laughs at the wrong moment, breaking the tension just enough for Jarvis to point them toward the courier without making it look like betrayal. The valley keeps singing around them, warm and bright, while the danger finally has a handle.',
    isCoop: true,
    characters: [character('foliza', 'Foliza'), character('skirmy', 'Skirmy')],
    suggestedActions: ['Ask Jarvis whose names were bought', 'Have Skirmy shadow the courier pouch', 'Let Foliza keep the crowd distracted'],
    worldBible: bible,
    worldStateBefore,
    worldStateAfter,
    expectedNpcMemoryNames: ['Jarvis'],
    expectedCharacterMemoryIds: ['foliza', 'skirmy'],
    expectConsequenceMemory: true,
    expectDmMemory: true,
  });

  assert.equal(report.ready, true);
  assert.equal(report.issues.length, 0);
});

test('experience sequence aggregates reports and renders a useful failure summary', () => {
  const report = evaluateExperienceSequence([
    {
      label: 'opening',
      narration: 'Foliza and Skirmy arrive at Verdant Valley together as Jarvis raises one finger for silence. The market smells of rain and fried scallions, but the hush is not weather; everyone is watching the diplomat’s sealed courier pouch pass from hand to hand. Foliza recognizes the rhythm of a buying song. Skirmy notices Jarvis pretending not to look.',
      isCoop: true,
      characters: [character('foliza', 'Foliza'), character('skirmy', 'Skirmy')],
      suggestedActions: ['Ask Jarvis why the pouch matters', 'Have Skirmy follow the courier', 'Let Foliza test the buying song'],
    },
    {
      label: 'bad follow-up',
      narration: 'The act ends and the final confrontation begins.',
      suggestedActions: ['Continue'],
      expectNoActRush: true,
    },
  ]);

  assert.equal(report.ready, false);
  assert.ok(report.issues.some(issue => issue.message.includes('[bad follow-up]')));
  assert.match(formatExperienceEvalReport(report), /NOT READY/);
});
