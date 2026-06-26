import assert from 'node:assert/strict';
import test from 'node:test';
import type { RollContext, WorldState } from '../../../shared/types';
import { assertCanResolveCoopRoll, repairWorldStateForGameplay } from './coopStateIntegrity';

const rollContext: RollContext = {
  stat: 'cha',
  dc: 15,
  diceType: 'd20',
  description: 'persuade Jarvis',
  successDescription: 'Jarvis reveals the lead.',
  failDescription: 'Jarvis clams up with a cost.',
  isDramatic: false,
  modifier: 0,
};

const now = new Date('2026-06-26T12:00:00.000Z');

test('preflight clears expired pending co-op action rounds', () => {
  const ws: WorldState = {
    pendingTurn: {
      roundId: 'round-1',
      createdAt: '2026-06-26T11:00:00.000Z',
      expiresAt: '2026-06-26T11:05:00.000Z',
      actions: [{ characterId: 'c1', userId: 'u1', characterName: 'Foliza', action: 'wait', submittedAt: '2026-06-26T11:00:00.000Z' }],
    },
  };

  const repaired = repairWorldStateForGameplay(ws, now);

  assert.equal(repaired.worldState.pendingTurn, null);
  assert.equal(repaired.report.changed, true);
  assert.ok(repaired.worldState.engineDebug?.checks.some(check => check.detail.includes('expired')));
});

test('preflight advances acting character to first unresolved queued roll', () => {
  const ws: WorldState = {
    coopPendingRoll: {
      actingCharacterId: 'c1',
      rollContext,
      setupNarration: 'Both actions hang on the dice.',
      actions: [
        { characterId: 'c1', userId: 'u1', characterName: 'Foliza', action: 'persuade Jarvis', submittedAt: now.toISOString() },
        { characterId: 'c2', userId: 'u2', characterName: 'Skirmy', action: 'watch the crowd', submittedAt: now.toISOString() },
      ],
      pendingRolls: [
        { characterId: 'c1', characterName: 'Foliza', rollContext, resolved: true, rollResult: 14, rollTotal: 17, dc: 15, success: true },
        { characterId: 'c2', characterName: 'Skirmy', rollContext: { ...rollContext, stat: 'wis', description: 'watch the crowd' } },
      ],
    },
  };

  const repaired = repairWorldStateForGameplay(ws, now);

  assert.equal(repaired.worldState.coopPendingRoll?.actingCharacterId, 'c2');
  assert.equal(repaired.worldState.coopPendingRoll?.rollContext.stat, 'wis');
  assert.equal(repaired.worldState.engineDebug?.coopRoll?.unresolvedCount, 1);
});

test('preflight clears all-resolved stale co-op roll queues', () => {
  const ws: WorldState = {
    coopPendingRoll: {
      actingCharacterId: 'c1',
      rollContext,
      actions: [{ characterId: 'c1', userId: 'u1', characterName: 'Foliza', action: 'persuade Jarvis', submittedAt: now.toISOString() }],
      pendingRolls: [{ characterId: 'c1', characterName: 'Foliza', rollContext, resolved: true, rollResult: 12, rollTotal: 15, dc: 15, success: true }],
    },
  };

  const repaired = repairWorldStateForGameplay(ws, now);

  assert.equal(repaired.worldState.coopPendingRoll, null);
  assert.ok(repaired.worldState.engineDebug?.checks.some(check => check.detail.includes('already resolved')));
});

test('assertCanResolveCoopRoll blocks partner and allows current roller', () => {
  const ws: WorldState = {
    coopPendingRoll: {
      actingCharacterId: 'c2',
      rollContext,
      actions: [
        { characterId: 'c1', userId: 'u1', characterName: 'Foliza', action: 'persuade Jarvis', submittedAt: now.toISOString() },
        { characterId: 'c2', userId: 'u2', characterName: 'Skirmy', action: 'watch the crowd', submittedAt: now.toISOString() },
      ],
      pendingRolls: [
        { characterId: 'c1', characterName: 'Foliza', rollContext, resolved: true, rollResult: 11, rollTotal: 14, dc: 15, success: false },
        { characterId: 'c2', characterName: 'Skirmy', rollContext },
      ],
    },
  };

  assert.throws(() => assertCanResolveCoopRoll(ws, 'c1'), /partner holds the dice/i);
  const allowed = assertCanResolveCoopRoll(ws, 'c2');
  assert.equal(allowed.currentRoll.characterName, 'Skirmy');
  assert.equal(allowed.unresolved.length, 1);
});
