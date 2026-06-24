import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackstoryHook, WorldState } from '../../../shared/types';
import { activateBackstoryHooksForAct } from './actAdvancementState';

type TimedBackstoryHook = BackstoryHook & { seedTiming: string };

test('activateBackstoryHooksForAct resets act counter and activates matching dormant hooks', () => {
  const worldState: WorldState = {
    actionsInCurrentAct: 12,
    backstoryHooks: [
      { characterId: 'mira', characterName: 'Mira', hook: 'The bell returns.', status: 'dormant', seedTiming: 'act2' } as TimedBackstoryHook,
      { characterId: 'sun', characterName: 'Sun Mi', hook: 'The map burns.', status: 'dormant', seedTiming: 'act3' } as TimedBackstoryHook,
      { characterId: 'roe', characterName: 'Roe', hook: 'Already moving.', status: 'active', seedTiming: 'act2' } as TimedBackstoryHook,
    ],
  };

  const { worldStateUpdates, hooksChanged } = activateBackstoryHooksForAct(worldState, 2);

  assert.equal(hooksChanged, true);
  assert.equal(worldStateUpdates.actionsInCurrentAct, 0);
  assert.equal(worldStateUpdates.backstoryHooks?.[0].status, 'active');
  assert.equal(worldStateUpdates.backstoryHooks?.[1].status, 'dormant');
  assert.equal(worldStateUpdates.backstoryHooks?.[2].status, 'active');
});

test('activateBackstoryHooksForAct only resets the counter when no hook matches', () => {
  const worldState: WorldState = {
    actionsInCurrentAct: 8,
    backstoryHooks: [
      { characterId: 'mira', characterName: 'Mira', hook: 'Later.', status: 'dormant', seedTiming: 'act3' } as TimedBackstoryHook,
    ],
  };

  const { worldStateUpdates, hooksChanged } = activateBackstoryHooksForAct(worldState, 2);

  assert.equal(hooksChanged, false);
  assert.deepEqual(worldStateUpdates, { actionsInCurrentAct: 0 });
});
