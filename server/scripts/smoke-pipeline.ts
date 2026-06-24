/**
 * Pipeline smoke test — see real DM output before committing to a full session.
 *
 *   cd server
 *   OPENAI_API_KEY=sk-... npx tsx scripts/smoke-pipeline.ts
 *
 * Fires a few representative turns through the live director → narrator → extractor
 * pipeline and prints, for each: the director's plan, the narration, and the key
 * extracted mechanics. Nothing is saved — it only calls the model so you can judge
 * quality. Costs a few cents.
 */
import OpenAI from 'openai';
import type { Character, WorldBible, WorldState } from '../../shared/types';
import { runCoopTurnPipeline, runSoloTurnPipeline } from '../src/services/turnPipeline';

const openai = new OpenAI();

function logger(fn: string, data: Record<string, unknown>) {
  if (fn === 'pipeline.director') {
    const plan = data.plan as Record<string, unknown>;
    console.log('  · director plan:', JSON.stringify({
      priorities: plan.priorities, scenePurpose: plan.scenePurpose, pacingMode: plan.pacingMode,
      needsRoll: plan.needsRoll, rollStat: plan.rollStat, rollDc: plan.rollDc,
      combatStarting: plan.combatStarting, isHighStakes: plan.isHighStakes, spotlightCharacterId: plan.spotlightCharacterId,
    }));
  }
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'king-1', name: 'King', race: 'Human', class: 'Fighter', level: 3, xp: 0,
    hp: 28, max_hp: 30, gold: 40, stats: { str: 16, dex: 12, con: 14, int: 10, wis: 11, cha: 13 },
    abilities: [], inventory: [{ id: 'sword', name: 'Iron Sword', description: 'A worn blade.', quantity: 1, type: 'weapon', value: 15 }],
    status_effects: [], backstory: 'A sellsword hunting the brother who betrayed his company.', is_alive: true,
    ...overrides,
  } as unknown as Character;
}

const worldBible = {
  era: 'The Long Dusk', magicSystem: 'Magic is rare, costly, and feared in the borderlands.',
  factions: [{ name: 'The Ash Wardens' }], toneRules: ['Grounded frontier fantasy', 'Earned hope'],
  artBible: { masterPrompt: 'painterly western fantasy animation, expressive faces, cinematic light' },
  primaryAntagonist: { name: 'The Ashen Baron', agenda: 'unseal the drowned gate', isRevealed: false },
  centralConflict: 'Something is burning the roads and the wardens have gone quiet.',
} as unknown as WorldBible;

const worldState = {
  currentLocation: 'The Ash Gate', timeOfDay: 'dusk', weather: 'overcast', actionCount: 6,
  npcMemory: [{ name: 'Captain Veyra', disposition: 'neutral', notes: 'Gate captain, weary and proud. Met the party at the Ash Gate.', role: 'guard', gender: 'female' }],
  activeQuests: [{ title: 'Find what burned the road', description: 'Wardens want the cause of the ash road fires found.', status: 'active' }],
  foreshadowingLedger: [{ id: 'f1', description: 'The drowned bell tolls when no one rings it', type: 'object', introducedInAct: 1, payoffStatus: 'developing', createdAt: new Date().toISOString() }],
  backstoryHooks: [{ characterId: 'king-1', characterName: 'King', hook: 'His traitor brother now rides with the wardens', status: 'active' }],
} as unknown as WorldState;

async function soloTurn(label: string, action: string) {
  console.log(`\n━━━ SOLO: "${action}" (${label}) ━━━`);
  const r = await runSoloTurnPipeline(openai as never, logger, action, worldState, worldBible, character(), [
    '[NARRATION] Captain Veyra warned you the ash road has swallowed two patrols.',
  ]);
  console.log('  · narration:', r.narration);
  console.log('  · mechanics:', JSON.stringify({
    awaitingRoll: r.awaitingRoll, rollContext: r.rollContext && { stat: r.rollContext.stat, dc: r.rollContext.dc },
    isCombat: r.isCombat, enemyName: r.enemyName, combatEnemies: r.combatEnemies?.map(e => e.name),
    hpChange: r.hpChange, loot: r.loot?.map(l => l.name), activeNPC: r.activeNPC, isHighStakes: r.isHighStakes,
    suggestedActions: r.suggestedActions,
  }, null, 0));
}

async function coopTurn() {
  console.log(`\n━━━ CO-OP ━━━`);
  const sunMi = character({ id: 'sunmi-1', name: 'Sun Mi', race: 'Elf', class: 'Rogue', stats: { str: 9, dex: 17, con: 12, int: 13, wis: 12, cha: 14 } as Character['stats'] });
  const r = await runCoopTurnPipeline(openai as never, logger,
    [{ character: character(), action: 'square up to draw the bandit’s attention' }, { character: sunMi, action: 'slip around the wagons to flank' }],
    { ...worldState, currentLocation: 'A ruined tollhouse on the ash road' }, worldBible,
    ['[NARRATION] Boot tracks lead off the road to an overturned wagon; voices argue over stolen coin ahead.']);
  console.log('  · narration:', r.narration);
  console.log('  · mechanics:', JSON.stringify({
    isCombat: r.isCombat, enemyName: r.enemyName, comboBonus: r.comboBonus,
    char1: r.character1Changes, char2: r.character2Changes,
    char1Suggestions: r.character1SuggestedActions, char2Suggestions: r.character2SuggestedActions,
  }, null, 0));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Set OPENAI_API_KEY first: OPENAI_API_KEY=sk-... npx tsx scripts/smoke-pipeline.ts');
    process.exit(1);
  }
  await soloTurn('should NOT spawn a fight from nothing', 'go looking for a fight');
  await soloTurn('should call for a STR roll, not auto-succeed', 'try to force the rusted gate open');
  await soloTurn('should resolve a social beat and name the NPC', 'press Captain Veyra about who she saw on the road');
  await coopTurn();
  console.log('\n✓ smoke run complete — judge the narration, the rolls, the combat grounding, and that mechanics match the prose.');
}

main().catch(err => { console.error('smoke run failed:', err); process.exit(1); });
