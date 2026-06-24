import assert from 'node:assert/strict';
import test from 'node:test';
import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { runCoopTurnPipeline, runSoloTurnPipeline, type ChatClient } from './turnPipeline';

// A fake chat client that routes each pass to a canned response by sniffing the
// system prompt, so the 3-pass plumbing can be tested without a real model.
function fakeClient(responses: { director: object; narrator: object; extractor: object }): { client: ChatClient; calls: string[] } {
  const calls: string[] = [];
  const client: ChatClient = {
    chat: {
      completions: {
        async create(args: { messages: { role: string; content: string }[] }) {
          const system = args.messages.find(m => m.role === 'system')?.content || '';
          let payload: object;
          if (system.includes('DIRECTOR')) { calls.push('director'); payload = responses.director; }
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
  assert.deepEqual(calls, ['director', 'narrator', 'extractor']);
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
  assert.deepEqual(calls, ['director', 'narrator', 'extractor']);
  assert.equal(result.isCombat, true);
  assert.equal(result.comboBonus, true);
  assert.equal(result.character1Changes?.hpChange, -2);
  assert.equal(result.character2Changes?.loot?.[0].name, 'Bandit Coin');
  assert.ok(result.character1SuggestedActions?.[0].includes('sword'));
  assert.equal(result.spotlightCharacterId, 'c2');
});
