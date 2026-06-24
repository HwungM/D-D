import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBible, WorldState } from '../../../shared/types';
import {
  appendAchievement,
  appendRecipe,
  applyFactionRepChange,
  buildActiveNpcChange,
  buildAutoNpcMemory,
  buildBackstoryHookChanges,
  buildEngineAuditEntry,
  buildForeshadowingAndFutureHookChanges,
  buildLocationTracking,
  buildSceneStateUpdate,
  buildShopInventoryChange,
  buildSpotlightBalanceUpdate,
  resolveConsumedItems,
  resolveEndgamePhase,
} from './turnStateHelpers';

test('append helpers dedupe achievements and recipes while faction rep clamps', () => {
  const achievements = appendAchievement([{ title: 'First Blood', description: 'Won a fight.', characterName: 'Mira', unlockedAt: 'then' }], { title: 'First Blood', description: 'Again.' }, 'Mira');
  assert.equal(achievements.length, 1);

  const recipes = appendRecipe([{ id: 'tea', name: 'Moon Tea', description: 'Warm.', resultItem: { name: 'Tea', description: '', type: 'potion' }, materials: [{ name: 'Leaf', quantity: 1 }] }], { id: 'tea-2', name: 'Moon Tea', description: 'Duplicate.', resultItem: { name: 'Tea', description: '', type: 'potion' }, materials: [{ name: 'Leaf', quantity: 1 }] });
  assert.equal(recipes.length, 1);

  assert.equal(applyFactionRepChange({ Guild: 95 }, { faction: 'Guild', delta: 20 }).Guild, 100);
  assert.equal(applyFactionRepChange({ Guild: -95 }, { faction: 'Guild', delta: -20 }).Guild, -100);
});

test('resolveConsumedItems prefers explicit valid names and can infer narrated use', () => {
  const character = { inventory: [{ name: 'Red Potion', type: 'potion' }, { name: 'Iron Key', type: 'key' }] };

  assert.deepEqual(resolveConsumedItems(character, ['Red Potion', 'Missing'], 'unused'), ['Red Potion']);
  assert.deepEqual(resolveConsumedItems(character, undefined, 'Mira drinks the Red Potion before the door opens.'), ['Red Potion']);
  assert.deepEqual(resolveConsumedItems(character, undefined, 'Mira turns the Iron Key.'), []);
});

test('turn thread helpers update foreshadowing, future hooks, and backstory hooks', () => {
  const worldState: WorldState = {
    foreshadowingLedger: [{ id: 'bell', description: 'A bell with no clapper.', type: 'object', introducedInAct: 1, payoffStatus: 'planted', createdAt: 'then' }],
    futureHooks: [{ id: 'hook-1', description: 'The drowned bell rings under the harbor', source: 'test', createdAt: 'then', resolved: false }],
    backstoryHooks: [{ characterId: 'char-1', characterName: 'Mira', hook: 'Her sister vanished.', status: 'dormant' }],
  };

  const { ledgerChanges, futureHooksChanges } = buildForeshadowingAndFutureHookChanges({
    newForeshadowing: [{ id: 'shadow', description: 'A shadow points north.', type: 'event' }],
    paidOffForeshadowing: ['bell'],
    resolvedFutureHooks: ['drowned bell rings'],
  }, worldState, 2);

  assert.equal(ledgerChanges.length, 2);
  assert.equal(ledgerChanges[0].introducedInAct, 2);
  assert.equal(ledgerChanges[1].payoffStatus, 'paid_off');
  assert.equal(futureHooksChanges?.[0].resolved, true);

  const hookChanges = buildBackstoryHookChanges({ backstoryHookActivated: 'char-1' }, worldState.backstoryHooks);
  assert.equal(hookChanges[0].status, 'active');
});

test('scene, active NPC, shop, location, and endgame helpers normalize turn state', () => {
  const scene = buildSceneStateUpdate(
    { purpose: 'explore', exchangeCount: 2, stalledCount: 1, pacingMode: 'tension', cluesThisScene: 1 },
    { sceneMomentum: 'transitioning', scenePurpose: 'social', pacingMode: 'resolution', turnOutcome: { playerIntent: '', concreteResult: '', informationRevealed: ['name', 'place'], situationChanged: true, unresolvedQuestion: null, whyNoRoll: null, whyRollNeeded: null } },
  );
  assert.deepEqual(scene, { purpose: 'social', exchangeCount: 0, stalledCount: 0, pacingMode: 'resolution', cluesThisScene: 2 });

  assert.deepEqual(buildActiveNpcChange({ currentLocation: 'Inn' }, { activeNPC: 'Mira' }, 'Road'), { activeNPC: null });
  assert.deepEqual(buildAutoNpcMemory({}, {}, 'Captain Roe', ['Mira', 'Sun Mi'], 'Docks')[0].metCharacters, ['Mira', 'Sun Mi']);

  const { shopInventoryChange, shopItems } = buildShopInventoryChange({}, {
    isMerchant: true,
    shopItems: [{ id: '', name: 'Bent Dagger', description: '', type: 'weird', price: -4, quantity: 0 }],
  }, 'Market');
  assert.equal(shopItems?.[0].type, 'misc');
  assert.equal(shopItems?.[0].price, 1);
  assert.equal(shopInventoryChange.shopInventory?.Market[0].name, 'Bent Dagger');

  const tracking = buildLocationTracking({ characterLastSeen: { old: 'then' } }, ['char-1', 'char-2'], 'Market');
  assert.equal(tracking.characterLocations?.['char-1'], 'Market');
  assert.equal(Object.keys(tracking.characterLastSeen || {}).length, 3);
});

test('resolveEndgamePhase respects explicit AI triggers and antagonist progress', () => {
  const worldBible: WorldBible = {
    era: 'Age',
    magicSystem: 'Magic',
    geography: [],
    pantheon: [],
    toneRules: [],
    forbiddenLoreHooks: [],
    factions: [],
    centralConflict: 'Conflict',
    antagonistRoster: [],
    openingHooks: [],
    primaryAntagonist: {
      name: 'Warden',
      trueName: 'Warden',
      type: 'primary',
      agenda: 'Win',
      currentStep: 'final step',
      planSteps: ['a', 'b'],
      whatTheyKnow: '',
      isRevealed: true,
      power: 'major',
    },
  };

  assert.equal(resolveEndgamePhase('none', { triggerFinalConfrontation: true }, {}, worldBible, 1, 10), 'confrontation');
  assert.equal(resolveEndgamePhase('confrontation', { endgameResolved: true }, {}, worldBible, 1, 10), 'none');
  assert.equal(resolveEndgamePhase('none', {}, { antagonistProgress: { Warden: { stepIndex: 1, lastAction: 'moved', knowsPlayers: true } } }, worldBible, 8, 10), 'approaching');
});

test('buildSpotlightBalanceUpdate uses model spotlight or falls back to less spotlighted player', () => {
  const modelChoice = buildSpotlightBalanceUpdate({ char1: 3, char2: 0 }, ['char1', 'char2'], 'char1');
  assert.equal(modelChoice.spotlightCharacterId, 'char1');
  assert.equal(modelChoice.spotlightBalance.char1, 4);

  const fallback = buildSpotlightBalanceUpdate({ char1: 4, char2: 1 }, ['char1', 'char2'], null);
  assert.equal(fallback.spotlightCharacterId, 'char2');
  assert.equal(fallback.spotlightBalance.char2, 2);
});

test('buildEngineAuditEntry records grounded combat, NPC memory, and co-op spotlight checks', () => {
  const entry = buildEngineAuditEntry({
    worldState: { actGoalsAchieved: ['Find the burned map'] },
    act: 2,
    actors: ['King', 'Sun Mi'],
    actions: ['King: look for a fight', 'Sun Mi: watches the alley'],
    actionCount: 12,
    location: 'Grey Dock',
    scenePurpose: 'gather_info',
    pacingMode: 'tension',
    ungroundedFightBlocked: true,
    combatCompletenessFilled: true,
    combatantsTracked: 2,
    npcMemoryUpdates: 2,
    actGoalsAdded: ['Expose the smuggler route'],
    highStakes: false,
    spotlightCharacterId: 'sun-mi',
    directorBeatPending: true,
    actAdvance: { proposed: true, allowed: false, reason: 'Act 2 needs a real high-stakes reversal.' },
  });

  assert.equal(entry.act, 2);
  assert.equal(entry.stateDigest.combatantsTracked, 2);
  assert.equal(entry.stateDigest.npcMemoryUpdates, 2);
  assert.equal(entry.stateDigest.actGoalsCompleted, 2);
  assert.ok(entry.checks.some(check => check.label === 'Grounded encounter' && check.status === 'blocked'));
  assert.ok(entry.checks.some(check => check.label === 'Act 2 escalation readiness' && check.status === 'warn'));
  assert.ok(entry.checks.some(check => check.label === 'Act advancement' && check.status === 'blocked' && check.detail.includes('high-stakes')));
  assert.ok(entry.checks.some(check => check.label === 'Co-op spotlight'));
  assert.equal(entry.stateDigest.advanceActProposed, true);
  assert.equal(entry.stateDigest.advanceActAllowed, false);
});
