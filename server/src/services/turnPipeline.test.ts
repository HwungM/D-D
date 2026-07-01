import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { narrationLengthGuide, runCoopTurnPipeline, runSoloTurnPipeline, type ChatClient } from './turnPipeline';

// A fake chat client that routes each pass to a canned response by sniffing the
// system prompt, so the pipeline plumbing can be tested without a real model.
function fakeClient(responses: { director: object; narrator: object; quality?: object; extractor: object }): { client: ChatClient; calls: string[] } {
  const calls: string[] = [];
  const client: ChatClient = {
    chat: {
      completions: {
        async create(args: { messages: { role: string; content: string }[] }) {
          const system = args.messages.find(m => m.role === 'system')?.content || '';
          let payload: object;
          if (system.includes('DIRECTOR')) { calls.push('director'); payload = responses.director; }
          else if (system.includes('DM QUALITY CRITIC')) { calls.push('quality'); payload = responses.quality || { pass: true, issues: [], rationale: 'good', revisedNarration: null, revisedSceneImagePrompt: null }; }
          else if (system.includes('EXTRACTOR')) { calls.push('extractor'); payload = responses.extractor; }
          else { calls.push('narrator'); payload = responses.narrator; }
          return { choices: [{ message: { content: JSON.stringify(payload) } }] };
        },
      },
    },
  };
  return { client, calls };
}

const log = () => {};

function makeCharacter(id: string, name: string): Character {
  return {
    id, name, race: 'Human', class: 'Fighter', level: 3, hp: 24, max_hp: 30, gold: 50,
    xp: 0, stats: { str: 15, dex: 12, con: 14, int: 10, wis: 11, cha: 9 },
    inventory: [{ name: 'Iron Sword', quantity: 1 } as never], abilities: [], status_effects: [],
    backstory: 'A wandering sellsword.', is_alive: true,
  } as unknown as Character;
}

const worldState: WorldState = { currentLocation: 'Ash Gate', actionCount: 5 } as WorldState;
const worldBible: WorldBible = { era: 'The Long Dusk', magicSystem: 'Rare and costly.', artBible: { masterPrompt: 'painterly' } } as unknown as WorldBible;

test('solo pipeline runs director→narrator→extractor and produces a drop-in NarrationResult', async () => {
  const { client, calls } = fakeClient({
    director: { priorities: ['Resolve the door'], scenePurpose: 'explore', pacingMode: 'exploration', needsRoll: false, combatActive: false, isHighStakes: false, reason: 'simple' },
    narrator: { narration: 'You shoulder the door open and step into the cold hall.', sceneImagePrompt: 'a cold stone hall' },
    extractor: { hpChange: null, activeNPC: null, suggestedActions: ['Search the hall', 'Listen at the far door'], isCombat: false },
  });

  const result = await runSoloTurnPipeline(client, log, 'open the door', worldState, worldBible, makeCharacter('c1', 'King'), []);
  assert.deepEqual(calls, ['director', 'narrator', 'quality', 'extractor']);
  assert.equal(result.narration, 'You shoulder the door open and step into the cold hall.');
  assert.equal(result.sceneImagePrompt, 'a cold stone hall');
  assert.equal(result.scenePurpose, 'explore');
  assert.equal(result.awaitingRoll, false);
  assert.ok(result.suggestedActions.includes('Search the hall'));
});

test('solo pipeline stitches a complete rollContext when the director calls for a roll', async () => {
  const { client } = fakeClient({
    director: { priorities: ['Force the rusted gate'], scenePurpose: 'explore', pacingMode: 'tension', needsRoll: true, rollStat: 'str', rollDc: 15, rollReason: 'force the gate', combatActive: false, isHighStakes: false, reason: 'uncertain feat' },
    narrator: { narration: 'You set your shoulder to the rusted gate. It groans, resisting.', sceneImagePrompt: 'a rusted gate' },
    extractor: { awaitingRoll: true, rollContext: { stat: 'str', dc: 15 }, suggestedActions: [] },
  });

  const result = await runSoloTurnPipeline(client, log, 'force the gate', worldState, worldBible, makeCharacter('c1', 'King'), []);
  assert.equal(result.awaitingRoll, true);
  assert.equal(result.rollContext?.stat, 'str');
  assert.equal(result.rollContext?.dc, 15);
  // Roll pending ⇒ no suggested actions surfaced.
  assert.deepEqual(result.suggestedActions, []);
});

test('coop pipeline attributes per-character changes and combo bonus', async () => {
  const { client, calls } = fakeClient({
    director: { priorities: ['Pincer the bandit'], scenePurpose: 'combat', pacingMode: 'climax', needsRoll: false, combatActive: true, combatStarting: false, isHighStakes: false, spotlightCharacterId: 'c2', reason: 'coordinated' },
    narrator: { narration: 'King draws the bandit’s eye while Sun Mi slips behind and strikes.', sceneImagePrompt: 'a dim alley fight' },
    extractor: {
      isCombat: true, enemyName: 'Rusk', combatEnemies: [{ name: 'Rusk', archetype: 'soldier', maxHp: 12, condition: 'wounded' }],
      comboBonus: true,
      character1Changes: { hpChange: -2 },
      character2Changes: { hpChange: null, loot: [{ name: 'Bandit Coin', description: 'lifted in the chaos', quantity: 1, type: 'misc', value: 5 }] },
      character1SuggestedActions: ['Press the attack with your sword'],
      character2SuggestedActions: ['Fade back into the shadows'],
    },
  });

  const result = await runCoopTurnPipeline(
    client, log,
    [{ character: makeCharacter('c1', 'King'), action: 'draw its attention' }, { character: makeCharacter('c2', 'Sun Mi'), action: 'strike from behind' }],
    { ...worldState }, worldBible, [],
  );
  assert.deepEqual(calls, ['director', 'narrator', 'quality', 'extractor']);
  assert.equal(result.isCombat, true);
  assert.equal(result.comboBonus, true);
  assert.equal(result.character1Changes?.hpChange, -2);
  assert.equal(result.character2Changes?.loot?.[0].name, 'Bandit Coin');
  assert.ok(result.character1SuggestedActions?.[0].includes('sword'));
  assert.equal(result.spotlightCharacterId, 'c2');
});

test('quality gate revised narration is what extractor and final result receive', async () => {
  const { client, calls } = fakeClient({
    director: { priorities: ['Question Varric'], scenePurpose: 'social', pacingMode: 'tension', needsRoll: false, combatActive: false, isHighStakes: false, reason: 'conversation' },
    narrator: { narration: 'Together, they proceed to have a meaningful conversation about the situation.', sceneImagePrompt: 'generic conversation' },
    quality: {
      pass: false,
      issues: ['stiff summary'],
      rationale: 'Too summary-like.',
      revisedNarration: 'Varric stops polishing the cup when King asks for the name. He slides a folded note across the scarred table: the envoy signed it Adrian.',
      revisedSceneImagePrompt: 'a tense tavern table conversation',
    },
    extractor: { hpChange: null, activeNPC: 'Varric', suggestedActions: ['Press Varric for the name'], isCombat: false },
  });

  const result = await runSoloTurnPipeline(client, log, 'ask Varric for the name', worldState, worldBible, makeCharacter('c1', 'King'), []);
  assert.deepEqual(calls, ['director', 'narrator', 'quality', 'extractor']);
  assert.equal(result.narration, 'Varric stops polishing the cup when King asks for the name. He slides a folded note across the scarred table: the envoy signed it Adrian.');
  assert.equal(result.sceneImagePrompt, 'a tense tavern table conversation');
});

test('table narration length guidance keeps ordinary exchanges concise', () => {
  assert.match(narrationLengthGuide(true, 'exploration'), /80-150/);
  assert.match(narrationLengthGuide(false, 'exploration'), /60-110/);
  assert.match(narrationLengthGuide(true, 'climax'), /120-190/);
});

test('solo pipeline includes living companions in the director/narrator/extractor prompt context and round-trips companion changes', async () => {
  // The quality gate is a separate narration-review critic that doesn't need
  // companion party state, so only director/narrator/extractor prompts are
  // asserted on.
  const relevantUserPrompts: string[] = [];
  const client: ChatClient = {
    chat: {
      completions: {
        async create(args: { messages: { role: string; content: string }[] }) {
          const system = args.messages.find(m => m.role === 'system')?.content || '';
          const user = args.messages.find(m => m.role === 'user')?.content || '';
          if (system.includes('DIRECTOR')) {
            relevantUserPrompts.push(user);
            return { choices: [{ message: { content: JSON.stringify({ priorities: ['Fight the wolf'], scenePurpose: 'combat', pacingMode: 'climax', needsRoll: false, combatActive: true, isHighStakes: false, reason: 'combat' }) } }] };
          }
          if (system.includes('DM QUALITY CRITIC')) {
            return { choices: [{ message: { content: JSON.stringify({ pass: true, issues: [], rationale: 'good', revisedNarration: null, revisedSceneImagePrompt: null }) } }] };
          }
          if (system.includes('EXTRACTOR')) {
            relevantUserPrompts.push(user);
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    isCombat: true,
                    companionChanges: [{ id: 'comp-1', hpChange: -4, xpGained: 10, bondLevelChange: 5 }],
                  }),
                },
              }],
            };
          }
          relevantUserPrompts.push(user);
          return { choices: [{ message: { content: JSON.stringify({ narration: 'Brynn the companion takes a bite from the wolf and grits her teeth.', sceneImagePrompt: 'a wolf fight' }) } }] };
        },
      },
    },
  };

  const worldStateWithCompanion: WorldState = {
    ...worldState,
    companions: [{
      id: 'comp-1', name: 'Brynn', race: 'Dwarf', class: 'Fighter', level: 2, xp: 0,
      hp: 20, max_hp: 20, stats: { str: 14, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
      abilities: [], inventory: [], bondLevel: 20, is_alive: true, recruitedAt: new Date().toISOString(),
    }],
  } as WorldState;

  const result = await runSoloTurnPipeline(client, log, 'fight the wolf', worldStateWithCompanion, worldBible, makeCharacter('c1', 'King'), []);

  // Every prompt pass should have seen the companion's id and name so the AI
  // can voice them and key companionChanges back to the right party member.
  assert.ok(relevantUserPrompts.length === 3, `expected 3 captured prompts, got ${relevantUserPrompts.length}`);
  assert.ok(relevantUserPrompts.every(prompt => prompt.includes('comp-1') && prompt.includes('Brynn')), 'companion id/name missing from a prompt pass');
  assert.equal(result.companionChanges?.['comp-1'].hpChange, -4);
  assert.equal(result.companionChanges?.['comp-1'].xpGained, 10);
  assert.equal(result.companionChanges?.['comp-1'].bondLevelChange, 5);
});
