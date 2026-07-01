import type { WorldState } from '../../../shared/types';

// Scene-level threat-escalation tracker: while the party is hiding/fled from a
// live threat WITHIN the current scene (combatState.inCombat is false, but
// the encounter hasn't actually concluded), each subsequent micro-action has
// an increasing chance the threat finds them again. Deliberately gated by
// ACTION COUNT, not wall-clock time — see the module-level constants below —
// and resolved with plain code/dice math (Math.random by default, injectable
// for tests), never a per-check AI call. The AI only narrates the outcome
// this math already decided.

export type TensionMeter = NonNullable<WorldState['tensionMeter']>;

const BASE_FIND_CHANCE = 0.15;
const FIND_CHANCE_PER_ACTION = 0.12;
const MAX_FIND_CHANCE = 0.75;

// Odds curve: 15% chance of being found on the very next hidden action,
// climbing by 12 percentage points per additional hidden action, capped at
// 75% so staying hidden is never risk-free but also never a guaranteed catch.
// actionsHidden=1 -> 27%, 2 -> 39%, 3 -> 51%, 4 -> 63%, 5+ -> 75%.
export function tensionFindChance(actionsHidden: number): number {
  return Math.min(MAX_FIND_CHANCE, BASE_FIND_CHANCE + Math.max(0, actionsHidden) * FIND_CHANCE_PER_ACTION);
}

// Called the moment a hide/flee/negotiate micro-action succeeds and pauses an
// active encounter — snapshots the enemies so the fight can resume exactly
// where it left off if the party is found again.
export function beginTensionFromCombat(
  combatState: NonNullable<WorldState['combatState']>,
): TensionMeter {
  return {
    active: true,
    heat: 20,
    hunterName: combatState.enemyName,
    huntingEnemies: combatState.enemies,
    roundNumber: combatState.roundNumber,
    isBossFight: combatState.isBossFight,
    bossPhase: combatState.bossPhase,
    actionsHidden: 0,
  };
}

// One check per micro-action taken while tensionMeter.active is true.
// Deterministic given `random` — pass a fixed function in tests.
export function escalateTension(
  tensionMeter: TensionMeter,
  random: () => number = Math.random,
): { tensionMeter: TensionMeter; foundAgain: boolean } {
  const actionsHidden = (tensionMeter.actionsHidden || 0) + 1;
  const chance = tensionFindChance(actionsHidden);
  const foundAgain = random() < chance;
  const heat = Math.min(100, (tensionMeter.heat || 0) + 15);
  return {
    tensionMeter: { ...tensionMeter, actionsHidden, heat, active: !foundAgain },
    foundAgain,
  };
}

// Rebuilds combatState from a paused tensionMeter's snapshot when the threat
// finds the party again — the fight resumes, it doesn't restart from scratch.
export function resumeCombatFromTension(tensionMeter: TensionMeter): NonNullable<WorldState['combatState']> {
  const enemies = tensionMeter.huntingEnemies || [];
  const livingLead = enemies.find(enemy => !enemy.isDefeated);
  return {
    inCombat: true,
    enemyName: tensionMeter.hunterName || livingLead?.name || enemies[0]?.name || 'the threat',
    enemyCondition: livingLead?.condition || 'wounded',
    roundNumber: (tensionMeter.roundNumber || 1) + 1,
    playerActionsAttempted: [],
    enemies,
    isBossFight: tensionMeter.isBossFight,
    bossPhase: tensionMeter.bossPhase,
  };
}

export function clearTension(): null {
  return null;
}
