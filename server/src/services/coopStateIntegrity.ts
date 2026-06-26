import type { EngineAuditCheck, RollContext, WorldState } from '../../../shared/types';

type CoopPendingRoll = NonNullable<WorldState['coopPendingRoll']>;
type PendingRoll = NonNullable<CoopPendingRoll['pendingRolls']>[number];

export interface CoopIntegrityReport {
  checks: EngineAuditCheck[];
  changed: boolean;
}

function check(label: string, status: EngineAuditCheck['status'], detail: string): EngineAuditCheck {
  return { label, status, detail };
}

function isExpired(value: string | undefined, nowMs: number): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < nowMs;
}

function validRollContext(value: unknown): value is RollContext {
  const rc = value as Partial<RollContext> | undefined;
  return !!rc
    && ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(String(rc.stat))
    && typeof rc.dc === 'number'
    && typeof rc.diceType === 'string'
    && typeof rc.description === 'string'
    && typeof rc.successDescription === 'string'
    && typeof rc.failDescription === 'string'
    && typeof rc.isDramatic === 'boolean';
}

function fallbackPendingRoll(pending: CoopPendingRoll): PendingRoll | undefined {
  const action = pending.actions.find(a => a.characterId === pending.actingCharacterId) || pending.actions[0];
  if (!action || !validRollContext(pending.rollContext)) return undefined;
  return {
    characterId: action.characterId,
    characterName: action.characterName,
    rollContext: pending.rollContext,
  };
}

function normalizePendingRolls(pending: CoopPendingRoll): { pending?: CoopPendingRoll; checks: EngineAuditCheck[]; changed: boolean } {
  const checks: EngineAuditCheck[] = [];
  const actionIds = new Set(pending.actions.map(action => action.characterId));
  if (pending.actions.length === 0) {
    return { checks: [check('coop roll integrity', 'blocked', 'Cleared co-op pending roll with no stored player actions.')], changed: true };
  }
  if (!validRollContext(pending.rollContext)) {
    return { checks: [check('coop roll integrity', 'blocked', 'Cleared co-op pending roll with invalid active roll context.')], changed: true };
  }

  const rawRolls = pending.pendingRolls?.length ? pending.pendingRolls : [fallbackPendingRoll(pending)].filter((r): r is PendingRoll => !!r);
  const seen = new Set<string>();
  const normalized = rawRolls
    .filter(roll => actionIds.has(roll.characterId) && validRollContext(roll.rollContext))
    .filter(roll => {
      if (seen.has(roll.characterId)) return false;
      seen.add(roll.characterId);
      return true;
    });

  if (normalized.length === 0) {
    return { checks: [check('coop roll integrity', 'blocked', 'Cleared co-op pending roll with no valid queued rolls.')], changed: true };
  }

  const unresolved = normalized.filter(roll => !roll.resolved);
  if (unresolved.length === 0) {
    return { checks: [check('coop roll integrity', 'warn', 'Cleared stale co-op pending roll because every queued roll was already resolved.')], changed: true };
  }

  const active = unresolved.find(roll => roll.characterId === pending.actingCharacterId) || unresolved[0];
  const nextPending: CoopPendingRoll = {
    ...pending,
    actingCharacterId: active.characterId,
    rollContext: active.rollContext,
    pendingRolls: normalized,
  };
  const changed = active.characterId !== pending.actingCharacterId
    || active.rollContext !== pending.rollContext
    || normalized.length !== (pending.pendingRolls?.length || 0)
    || normalized.some((roll, index) => pending.pendingRolls?.[index]?.characterId !== roll.characterId);
  checks.push(check(
    'coop roll integrity',
    'pass',
    `Co-op roll queue healthy: ${unresolved.length} unresolved, ${normalized.length - unresolved.length} resolved; ${active.characterName} holds the dice.`,
  ));
  return { pending: nextPending, checks, changed };
}

export function repairWorldStateForGameplay(worldState: WorldState, now = new Date()): { worldState: WorldState; report: CoopIntegrityReport } {
  let next: WorldState = { ...worldState };
  let changed = false;
  const checks: EngineAuditCheck[] = [];
  const nowMs = now.getTime();

  if (next.pendingTurn) {
    const expired = isExpired(next.pendingTurn.expiresAt, nowMs);
    const hasActions = next.pendingTurn.actions.length > 0;
    if (expired || !hasActions) {
      checks.push(check('pending turn preflight', 'warn', expired ? 'Cleared expired co-op pending action round.' : 'Cleared empty co-op pending action round.'));
      next = { ...next, pendingTurn: null };
      changed = true;
    } else {
      checks.push(check('pending turn preflight', 'pass', `${next.pendingTurn.actions.length} co-op action(s) locked in for round ${next.pendingTurn.roundId}.`));
    }
  }

  if (next.coopPendingRoll) {
    const normalized = normalizePendingRolls(next.coopPendingRoll);
    checks.push(...normalized.checks);
    if (normalized.pending) {
      next = { ...next, coopPendingRoll: normalized.pending };
    } else {
      next = { ...next, coopPendingRoll: null };
    }
    if (normalized.changed) changed = true;
  }

  const coopRoll = next.coopPendingRoll;
  const pendingTurn = next.pendingTurn;
  const debug = {
    updatedAt: now.toISOString(),
    checks: checks.slice(-8),
    coopRoll: {
      active: !!coopRoll,
      actingCharacterId: coopRoll?.actingCharacterId,
      unresolvedCount: coopRoll?.pendingRolls?.filter(roll => !roll.resolved).length || 0,
      resolvedCount: coopRoll?.pendingRolls?.filter(roll => roll.resolved).length || 0,
      expectedRollers: coopRoll?.pendingRolls?.filter(roll => !roll.resolved).map(roll => roll.characterName) || [],
    },
    pendingTurn: {
      active: !!pendingTurn,
      submittedCount: pendingTurn?.actions.length || 0,
      expiresAt: pendingTurn?.expiresAt,
    },
  };

  next = { ...next, engineDebug: debug };
  return { worldState: next, report: { checks, changed } };
}

export function assertCanResolveCoopRoll(worldState: WorldState, characterId: string): { pending: CoopPendingRoll; currentRoll: PendingRoll; unresolved: PendingRoll[] } {
  const pending = worldState.coopPendingRoll;
  if (!pending) throw new Error('No pending co-op roll for this character');
  const unresolved = (pending.pendingRolls?.length ? pending.pendingRolls : [fallbackPendingRoll(pending)].filter((r): r is PendingRoll => !!r))
    .filter(roll => !roll.resolved);
  if (unresolved.length === 0) throw new Error('No unresolved co-op rolls remain');
  if (pending.actingCharacterId !== characterId) throw new Error('Your partner holds the dice for this turn. Wait for their roll.');
  const currentRoll = unresolved.find(roll => roll.characterId === characterId);
  if (!currentRoll) throw new Error('No unresolved roll is pending for this character');
  return { pending, currentRoll, unresolved };
}
