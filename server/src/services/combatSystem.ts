import type { CombatEnemy, WorldState } from '../../../shared/types';

export type CombatAiSignals = {
  isCombat?: boolean;
  enemyName?: string;
  combatEnemies?: CombatEnemy[];
  enemyDefeated?: string;
  isVictory?: boolean;
  isBossFight?: boolean;
  bossPhaseAdvance?: boolean;
};

export function newlyDefeatedCombatants(
  previous: CombatEnemy[] | undefined,
  current: CombatEnemy[] | undefined,
  explicitlyDefeated?: string,
): string[] {
  const previousByName = new Map((previous || []).map(enemy => [enemy.name.toLowerCase(), enemy]));
  const names = new Set<string>();
  if (explicitlyDefeated) names.add(explicitlyDefeated);
  for (const enemy of current || []) {
    const prior = previousByName.get(enemy.name.toLowerCase());
    if ((enemy.isDefeated || enemy.currentHp === 0) && !(prior?.isDefeated || prior?.currentHp === 0)) {
      names.add(enemy.name);
    }
  }
  return Array.from(names);
}

// Advance the combat tracker from one turn to the next. The engine owns the
// canonical combat state; model output is only a set of signals.
export function advanceCombatState(
  prev: NonNullable<WorldState['combatState']> | null,
  ai: CombatAiSignals,
  newActions: string[],
): { combatState: NonNullable<WorldState['combatState']> | null; forcedVictory: boolean } {
  if (ai.isCombat && ai.enemyName && !prev?.inCombat) {
    const initialEnemies: CombatEnemy[] = ai.combatEnemies && ai.combatEnemies.length > 0
      ? ai.combatEnemies
      : [{ name: ai.enemyName, archetype: 'soldier', maxHp: 30, condition: 'healthy' }];
    const normalizedEnemies = initialEnemies.map(enemy => ({
      ...enemy,
      maxHp: Math.max(1, Math.min(500, Math.round(enemy.maxHp || 1))),
      currentHp: Math.max(1, Math.min(500, Math.round(enemy.currentHp ?? enemy.maxHp ?? 1))),
      armorClass: enemy.armorClass ?? (
        enemy.archetype === 'boss' ? 17
          : enemy.archetype === 'soldier' ? 15
            : enemy.archetype === 'mage' ? 12
              : enemy.archetype === 'minion' ? 11
                : 13
      ),
    }));
    return {
      combatState: {
        inCombat: true,
        enemyName: normalizedEnemies.find(e => !e.isDefeated)?.name || normalizedEnemies[0]?.name || ai.enemyName,
        enemyCondition: 'healthy',
        roundNumber: 1,
        playerActionsAttempted: newActions,
        enemies: normalizedEnemies,
        isBossFight: ai.isBossFight || false,
        bossPhase: ai.isBossFight ? 1 : undefined,
      },
      forcedVictory: false,
    };
  }

  if (ai.isCombat && ai.enemyName && prev?.inCombat) {
    const rounds = prev.roundNumber + 1;
    const roundCondition: 'healthy' | 'wounded' | 'critical' = rounds <= 2 ? 'healthy' : rounds <= 5 ? 'wounded' : 'critical';

    let enemies = prev.enemies || [];
    if (ai.combatEnemies && ai.combatEnemies.length > 0) {
      enemies = ai.combatEnemies.map(enemy => {
        const prior = prev.enemies?.find(candidate => candidate.name.toLowerCase() === enemy.name.toLowerCase());
        const maxHp = Math.max(1, Math.min(500, Math.round(enemy.maxHp || prior?.maxHp || 1)));
        const currentHp = Math.max(0, Math.min(maxHp, Math.round(enemy.currentHp ?? prior?.currentHp ?? maxHp)));
        const hpRatio = currentHp / maxHp;
        return {
          ...enemy,
          maxHp,
          currentHp,
          condition: currentHp === 0 || hpRatio <= 0.25 ? 'critical' as const : hpRatio <= 0.6 ? 'wounded' as const : 'healthy' as const,
          isDefeated: enemy.isDefeated || currentHp === 0,
          armorClass: enemy.armorClass ?? prior?.armorClass,
        };
      });
    } else if (ai.enemyDefeated) {
      enemies = enemies.map(e => e.name === ai.enemyDefeated ? { ...e, currentHp: 0, isDefeated: true, condition: 'critical' as const } : e);
    } else {
      enemies = enemies.map(e => e.name === prev.enemyName ? { ...e, condition: roundCondition } : e);
    }

    const living = enemies.filter(e => !e.isDefeated);
    const allDefeated = enemies.length > 0 && living.length === 0;
    if (ai.isVictory || allDefeated) {
      return { combatState: null, forcedVictory: allDefeated && !ai.isVictory };
    }

    return {
      combatState: {
        ...prev,
        enemyName: living[0]?.name || prev.enemyName,
        enemyCondition: living[0]?.condition || roundCondition,
        roundNumber: rounds,
        enemies,
        playerActionsAttempted: [...(prev.playerActionsAttempted || []).slice(-8), ...newActions],
        bossPhase: ai.bossPhaseAdvance ? (prev.bossPhase || 1) + 1 : prev.bossPhase,
      },
      forcedVictory: false,
    };
  }

  if (ai.isVictory || prev?.inCombat) {
    return { combatState: null, forcedVictory: false };
  }
  return { combatState: prev, forcedVictory: false };
}
