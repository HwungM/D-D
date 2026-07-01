import type { Character, CompanionChangeEntry, CompanionCharacter, RollContext, WorldState } from '../../../shared/types';
import { degreeOfSuccess, resolveEnemyCounterattackDamage, resolvePlayerCombatRoll } from './rulesEngine';
import { beginTensionFromCombat } from './tensionSystem';

// Orchestrates ONE combat micro-action roll against live combatState/rulesEngine
// mechanics — the real-consequence counterpart to the flavor-only free-roam
// micro-action path. No AI call here: the dice were already rolled by the
// existing resolve-roll flow, and every consequence below is deterministic
// game logic (reusing rulesEngine.ts's dice/degree math and CombatEnemy
// bookkeeping), not a model's invention.

export type MicroCombatIntent = 'attack' | 'defend' | 'flee' | 'hide' | 'negotiate';

export type MicroCombatOutcome = {
  combatState: WorldState['combatState'];
  tensionMeter?: WorldState['tensionMeter'];
  characterHpChange: number;
  companionChanges?: Record<string, CompanionChangeEntry>;
  companionAssistName?: string;
  defeatedEnemies: string[];
  victory: boolean;
  // true when a hide/flee/negotiate attempt succeeded and combat paused
  // (not fully resolved — the threat may still find the party again).
  paused: boolean;
  spoilsGold?: number;
};

const ESCAPE_INTENTS = new Set<MicroCombatIntent>(['flee', 'hide', 'negotiate']);

export function resolveMicroActionCombatRoll(args: {
  intent: MicroCombatIntent;
  character: Pick<Character, 'class' | 'stats' | 'level' | 'max_hp'>;
  combatState: NonNullable<WorldState['combatState']>;
  rollContext: RollContext;
  roll: number;
  total: number;
  dc: number;
  companions?: CompanionCharacter[];
  random?: () => number;
}): MicroCombatOutcome {
  const random = args.random || Math.random;
  const degree = degreeOfSuccess(args.roll, args.total, args.dc);
  const livingCompanions = (args.companions || []).filter(companion => companion.is_alive);

  if (ESCAPE_INTENTS.has(args.intent)) {
    const succeeded = degree !== 'critical_failure' && degree !== 'clear_failure' && degree !== 'near_miss';
    if (succeeded) {
      return {
        combatState: null,
        tensionMeter: beginTensionFromCombat(args.combatState),
        characterHpChange: 0,
        defeatedEnemies: [],
        victory: false,
        paused: true,
      };
    }

    // Failed attempt to disengage — exposed, the threat gets a free hit.
    const counter = resolveEnemyCounterattackDamage(args.combatState, args.character, random);
    const hitsCompanion = livingCompanions.length > 0 && random() < 0.4;
    return {
      combatState: { ...args.combatState, roundNumber: args.combatState.roundNumber + 1 },
      characterHpChange: counter && !hitsCompanion ? -counter.damage : 0,
      companionChanges: counter && hitsCompanion
        ? { [livingCompanions[0].id]: { hpChange: -counter.damage } }
        : undefined,
      defeatedEnemies: [],
      victory: false,
      paused: false,
    };
  }

  // "attack" and "defend" both roll against the enemy — defend still swings
  // (bracing/parrying while fighting back) but halves incoming retaliation.
  const resolution = resolvePlayerCombatRoll(
    args.character,
    args.combatState,
    args.rollContext,
    args.roll,
    args.total,
    args.dc,
    random,
    true, // forceAttack — intent is already classified, skip the free-text regex gate
  );

  if (!resolution) {
    return { combatState: args.combatState, characterHpChange: 0, defeatedEnemies: [], victory: false, paused: false };
  }

  const isDefend = args.intent === 'defend';
  const noCounter = degree === 'clean_success' || degree === 'critical_success';
  const halvedCounter = degree === 'partial_success' || isDefend;

  let characterHpChange = 0;
  let companionChanges: Record<string, CompanionChangeEntry> | undefined;

  if (!resolution.victory && !noCounter) {
    const counter = resolveEnemyCounterattackDamage(resolution.combatState ?? args.combatState, args.character, random);
    if (counter) {
      const damage = halvedCounter ? Math.max(1, Math.round(counter.damage * 0.5)) : counter.damage;
      const hitsCompanion = livingCompanions.length > 0 && random() < 0.4;
      if (hitsCompanion) {
        companionChanges = { [livingCompanions[0].id]: { hpChange: -damage } };
      } else {
        characterHpChange = -damage;
      }
    }
  }

  let companionAssistName: string | undefined;
  if (!isDefend && livingCompanions.length > 0 && resolution.damage > 0 && random() < 0.3) {
    const assistant = livingCompanions[0];
    companionAssistName = assistant.name;
    companionChanges = {
      ...companionChanges,
      [assistant.id]: { ...(companionChanges?.[assistant.id] || {}), xpGained: (companionChanges?.[assistant.id]?.xpGained || 0) + 4 },
    };
  }

  if (resolution.victory && livingCompanions.length > 0) {
    companionChanges = { ...companionChanges };
    for (const companion of livingCompanions) {
      companionChanges[companion.id] = {
        ...(companionChanges[companion.id] || {}),
        xpGained: (companionChanges[companion.id]?.xpGained || 0) + 8,
      };
    }
  }

  return {
    combatState: resolution.combatState,
    characterHpChange,
    companionChanges,
    companionAssistName,
    defeatedEnemies: resolution.defeated && resolution.target ? [resolution.target] : [],
    victory: resolution.victory,
    paused: false,
    spoilsGold: resolution.victory ? 10 + args.character.level * 5 : undefined,
  };
}
