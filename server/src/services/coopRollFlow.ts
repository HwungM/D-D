import type { WorldState } from '../../../shared/types';

type CoopPendingRoll = NonNullable<WorldState['coopPendingRoll']>;
export type CoopPendingRollEntry = NonNullable<CoopPendingRoll['pendingRolls']>[number];

export type CoopRollLockInput = {
  rollResult: number;
  rollTotal: number;
  dc: number;
  success: boolean;
  isCritSuccess: boolean;
  isCritFail: boolean;
};

export type CoopRollQueueTransition = {
  currentRoll: CoopPendingRollEntry;
  pendingRolls: CoopPendingRollEntry[];
  resolvedRolls: CoopPendingRollEntry[];
  nextRoll?: CoopPendingRollEntry;
  remainingCount: number;
};

export function queuedRollsForPendingRoll(pending: CoopPendingRoll, fallbackCharacterId: string): CoopPendingRollEntry[] {
  return pending.pendingRolls?.length
    ? pending.pendingRolls
    : [{
        characterId: fallbackCharacterId,
        characterName: pending.actions.find(action => action.characterId === fallbackCharacterId)?.characterName || 'Player',
        rollContext: pending.rollContext,
      }];
}

export function applyCoopRollToQueue(
  pending: CoopPendingRoll,
  characterId: string,
  result: CoopRollLockInput,
): CoopRollQueueTransition {
  const queuedRolls = queuedRollsForPendingRoll(pending, characterId);
  const currentRoll = queuedRolls.find(roll => roll.characterId === characterId && !roll.resolved);
  if (!currentRoll) throw new Error('No queued co-op roll for this character');

  const pendingRolls = queuedRolls.map(roll => roll.characterId === characterId
    ? {
        ...roll,
        resolved: true,
        rollResult: result.rollResult,
        rollTotal: result.rollTotal,
        dc: result.dc,
        success: result.success,
        isCritSuccess: result.isCritSuccess,
        isCritFail: result.isCritFail,
      }
    : roll);
  const nextRoll = pendingRolls.find(roll => !roll.resolved);
  const resolvedRolls = pendingRolls.filter(roll => roll.resolved);

  return {
    currentRoll,
    pendingRolls,
    resolvedRolls,
    nextRoll,
    remainingCount: pendingRolls.length - resolvedRolls.length,
  };
}

export function buildNextCoopPendingRoll(
  pending: CoopPendingRoll,
  transition: CoopRollQueueTransition,
): CoopPendingRoll | null {
  if (!transition.nextRoll) return null;
  return {
    ...pending,
    actingCharacterId: transition.nextRoll.characterId,
    rollContext: transition.nextRoll.rollContext,
    pendingRolls: transition.pendingRolls,
  };
}
