import type { BackstoryHook, EngineAuditCheck, EngineAuditEntry, ForeshadowingEntry, NpcMemory, Recipe, ShopItem, WorldBible, WorldState } from '../../../shared/types';
import { actRoleFor, arcNumberFor } from './actPacingSystem';
import type { NarrationResult } from './narrationResponseParser';

export function appendAchievement(
  existing: WorldState['unlockedAchievements'] | undefined,
  achievement: { title: string; description: string },
  characterName: string,
): NonNullable<WorldState['unlockedAchievements']> {
  const list = existing || [];
  if (list.some(a => a.title === achievement.title)) return list;
  return [...list, { title: achievement.title, description: achievement.description, characterName, unlockedAt: new Date().toISOString() }];
}

export function appendRecipe(existing: Recipe[] | undefined, recipe: Recipe): Recipe[] {
  const list = existing || [];
  if (list.some(r => r.name === recipe.name)) return list;
  return [...list, recipe];
}

export function applyFactionRepChange(
  existing: Record<string, number> | undefined,
  change: { faction: string; delta: number },
): Record<string, number> {
  const current = existing?.[change.faction] || 0;
  return { ...existing, [change.faction]: Math.max(-100, Math.min(100, current + change.delta)) };
}

// Resolve which inventory items were consumed: prefer AI's explicit list, fall back to narration regex.
export function resolveConsumedItems(
  character: { inventory?: { name: string; type: string }[] },
  explicit: string[] | undefined,
  narration: string | undefined,
): string[] {
  if (explicit && explicit.length > 0) {
    return explicit.filter((name: string) =>
      (character.inventory || []).some((i: { name: string }) => i.name.toLowerCase() === name.toLowerCase())
    );
  }
  const consumed: string[] = [];
  if (!narration) return consumed;
  const consumableNames = (character.inventory || [])
    .filter((i: { type: string }) => i.type === 'potion' || i.type === 'misc')
    .map((i: { name: string }) => i.name);
  for (const itemName of consumableNames) {
    const escaped = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const usePattern = new RegExp(`\\b(drink|drinks|drank|use|uses|used|consume|consumes|consumed|quaff|quaffs|quaffed)\\b.{0,30}\\b${escaped}\\b`, 'i');
    const gonePattern = new RegExp(`\\b${escaped}\\b.{0,30}\\b(is consumed|is used|disappears|shatters|crumbles|is gone)\\b`, 'i');
    if (usePattern.test(narration) || gonePattern.test(narration)) {
      consumed.push(itemName);
    }
  }
  return consumed;
}

export function buildForeshadowingAndFutureHookChanges(
  aiResponse: Pick<NarrationResult, 'newForeshadowing' | 'paidOffForeshadowing' | 'resolvedFutureHooks'>,
  worldState: WorldState,
  act: number,
): { ledgerChanges: ForeshadowingEntry[]; futureHooksChanges?: WorldState['futureHooks'] } {
  const ledgerChanges: ForeshadowingEntry[] = [];
  if (aiResponse.newForeshadowing) {
    for (const f of aiResponse.newForeshadowing) {
      ledgerChanges.push({
        id: f.id || crypto.randomUUID(),
        description: f.description,
        type: f.type as ForeshadowingEntry['type'],
        introducedInAct: act,
        payoffStatus: 'planted',
        createdAt: new Date().toISOString(),
      });
    }
  }
  if (aiResponse.paidOffForeshadowing) {
    const existing = worldState.foreshadowingLedger || [];
    for (const id of aiResponse.paidOffForeshadowing) {
      const entry = existing.find(f => f.id === id);
      if (entry) ledgerChanges.push({ ...entry, payoffStatus: 'paid_off', payoffDescription: 'Resolved in story' });
    }
  }

  let futureHooksChanges: WorldState['futureHooks'] | undefined;
  if (aiResponse.resolvedFutureHooks && aiResponse.resolvedFutureHooks.length > 0) {
    const phrases = aiResponse.resolvedFutureHooks.map(p => p.toLowerCase().trim()).filter(p => p.length >= 3);
    const existing = worldState.futureHooks || [];
    if (phrases.length > 0 && existing.some(h => !h.resolved && phrases.some(p => h.description.toLowerCase().includes(p)))) {
      futureHooksChanges = existing.map(h => (!h.resolved && phrases.some(p => h.description.toLowerCase().includes(p))) ? { ...h, resolved: true } : h);
    }
  }

  return { ledgerChanges, futureHooksChanges };
}

export function buildBackstoryHookChanges(
  aiResponse: Pick<NarrationResult, 'backstoryHookActivated' | 'backstoryHookResolved'>,
  hooks: BackstoryHook[] | undefined,
): BackstoryHook[] {
  const hookChanges: BackstoryHook[] = [];
  if (aiResponse.backstoryHookActivated) {
    const dormant = (hooks || []).find(h => h.characterId === aiResponse.backstoryHookActivated && h.status === 'dormant');
    if (dormant) hookChanges.push({ ...dormant, status: 'active', seededAt: new Date().toISOString() });
  }
  if (aiResponse.backstoryHookResolved) {
    const active = (hooks || []).find(h => h.characterId === aiResponse.backstoryHookResolved && h.status === 'active');
    if (active) hookChanges.push({ ...active, status: 'resolved' });
  }
  return hookChanges;
}

export function buildSceneStateUpdate(
  previous: WorldState['sceneState'],
  aiResponse: Pick<NarrationResult, 'sceneMomentum' | 'scenePurpose' | 'pacingMode' | 'turnOutcome'>,
): WorldState['sceneState'] {
  const aiMomentum = aiResponse.sceneMomentum || 'advancing';
  const isTransitioning = aiMomentum === 'transitioning';
  const cluesThisTurn = Math.min(aiResponse.turnOutcome?.informationRevealed?.length ?? 0, 3);
  return isTransitioning
    ? {
        purpose: aiResponse.scenePurpose || 'explore',
        exchangeCount: 0,
        stalledCount: 0,
        pacingMode: aiResponse.pacingMode || 'exploration',
        cluesThisScene: cluesThisTurn,
      }
    : {
        purpose: aiResponse.scenePurpose || previous?.purpose || 'explore',
        exchangeCount: (previous?.exchangeCount ?? 0) + 1,
        stalledCount: aiMomentum === 'stalling' ? (previous?.stalledCount ?? 0) + 1 : 0,
        pacingMode: aiResponse.pacingMode || previous?.pacingMode || 'exploration',
        cluesThisScene: (previous?.cluesThisScene ?? 0) + cluesThisTurn,
      };
}

export function buildActiveNpcChange(
  worldState: WorldState,
  aiResponse: Pick<NarrationResult, 'activeNPC'>,
  newLocation: string | undefined,
): Partial<WorldState> {
  const locationChanged = newLocation && worldState.currentLocation && newLocation !== worldState.currentLocation;
  if (locationChanged) return { activeNPC: null };
  if (aiResponse.activeNPC !== undefined) return { activeNPC: aiResponse.activeNPC };
  return {};
}

export function buildAutoNpcMemory(
  worldState: WorldState,
  aiWorldStateChanges: Partial<WorldState> | undefined,
  activeNPC: unknown,
  characterNames: string[],
  newLocation?: string,
): NpcMemory[] {
  const activeNpcName = typeof activeNPC === 'string' ? activeNPC.trim() : '';
  const existingNpcNames = new Set([
    ...(worldState.npcMemory || []).map(npc => npc.name.toLowerCase()),
    ...((Array.isArray(aiWorldStateChanges?.npcMemory) ? aiWorldStateChanges?.npcMemory : []) || []).map(npc => npc.name.toLowerCase()),
  ]);

  return activeNpcName && !existingNpcNames.has(activeNpcName.toLowerCase())
    ? [{
        name: activeNpcName,
        disposition: 'unknown',
        notes: `Met ${characterNames.join(' and ')} near ${newLocation || worldState.currentLocation || 'the current scene'}.`,
        lastMet: newLocation || worldState.currentLocation,
        metCharacters: characterNames,
        interactionCount: 1,
      }]
    : [];
}

export function buildShopInventoryChange(
  worldState: WorldState,
  aiResponse: Pick<NarrationResult, 'isMerchant' | 'shopItems'>,
  location: string | undefined,
): { shopInventoryChange: Partial<WorldState>; shopItems?: ShopItem[] } {
  const shopInventoryChange: Partial<WorldState> = {};
  if (!aiResponse.isMerchant || !aiResponse.shopItems || aiResponse.shopItems.length === 0) {
    return { shopInventoryChange };
  }

  const validItemTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const shopItems = aiResponse.shopItems
    .filter(item => item.name && typeof item.name === 'string')
    .map(item => ({
      id: item.id || crypto.randomUUID(),
      name: item.name,
      description: item.description || '',
      type: (validItemTypes.has(item.type) ? item.type : 'misc') as ShopItem['type'],
      price: typeof item.price === 'number' && !isNaN(item.price) ? Math.max(1, Math.round(item.price)) : 10,
      quantity: typeof item.quantity === 'number' && !isNaN(item.quantity) ? Math.max(1, Math.round(item.quantity)) : 1,
    }));

  const inventoryLocation = location || 'unknown';
  const existingInventory = worldState.shopInventory?.[inventoryLocation];
  const actionsSinceHere = worldState.actionsSinceLastSummary || 0;
  if (existingInventory && actionsSinceHere < 6) {
    return { shopInventoryChange, shopItems: existingInventory };
  }

  const existingShop = worldState.shopInventory || {};
  const keys = Object.keys(existingShop);
  const pruned = keys.length >= 20
    ? Object.fromEntries(keys.slice(-19).map(k => [k, existingShop[k]]))
    : existingShop;
  shopInventoryChange.shopInventory = { ...pruned, [inventoryLocation]: shopItems };
  return { shopInventoryChange, shopItems };
}

export function resolveEndgamePhase(
  currentPhase: WorldState['endgamePhase'],
  aiResponse: Pick<NarrationResult, 'triggerFinalConfrontation' | 'endgameResolved'>,
  worldState: WorldState,
  worldBible: WorldBible,
  newActionCount: number,
  targetActions: number,
): WorldState['endgamePhase'] {
  if (aiResponse.triggerFinalConfrontation) return 'confrontation';
  if (aiResponse.endgameResolved) return 'none';
  if (currentPhase && currentPhase !== 'none') return currentPhase;

  const primaryAntagonist = worldBible.primaryAntagonist;
  if (!primaryAntagonist) return currentPhase;
  const progress = (worldState.antagonistProgress || {})[primaryAntagonist.name];
  const totalSteps = primaryAntagonist.planSteps?.length || 5;
  if (progress && progress.stepIndex >= totalSteps - 1 && newActionCount >= targetActions * 0.5) {
    return 'approaching';
  }
  return currentPhase;
}

export function buildLocationTracking(
  worldState: WorldState,
  characterIds: string[],
  newLocation: string | undefined,
): Pick<WorldState, 'characterLocations' | 'characterLastSeen'> {
  const now = new Date().toISOString();
  return {
    characterLocations: {
      ...(worldState.characterLocations || {}),
      ...Object.fromEntries(characterIds.map(id => [id, newLocation || 'Unknown'])),
    },
    characterLastSeen: {
      ...(worldState.characterLastSeen || {}),
      ...Object.fromEntries(characterIds.map(id => [id, now])),
    },
  };
}

export function buildSpotlightBalanceUpdate(
  existing: WorldState['spotlightBalance'] | undefined,
  characterIds: [string, string],
  modelSpotlightCharacterId?: string | null,
): { spotlightBalance: NonNullable<WorldState['spotlightBalance']>; spotlightCharacterId: string } {
  const spotlightBalance = { ...(existing || {}) };
  const spotlightCharacterId = modelSpotlightCharacterId && characterIds.includes(modelSpotlightCharacterId)
    ? modelSpotlightCharacterId
    : ((spotlightBalance[characterIds[0]] || 0) <= (spotlightBalance[characterIds[1]] || 0) ? characterIds[0] : characterIds[1]);
  spotlightBalance[spotlightCharacterId] = (spotlightBalance[spotlightCharacterId] || 0) + 1;
  return { spotlightBalance, spotlightCharacterId };
}

export function buildEngineAuditEntry(options: {
  worldState: WorldState;
  act: number;
  actors: string[];
  actions: string[];
  actionCount: number;
  location?: string;
  scenePurpose?: NonNullable<WorldState['sceneState']>['purpose'];
  pacingMode?: NonNullable<WorldState['sceneState']>['pacingMode'];
  ungroundedFightBlocked?: boolean;
  combatCompletenessFilled?: boolean;
  combatantsTracked?: number;
  npcMemoryUpdates?: number;
  actGoalsAdded?: string[];
  highStakes?: boolean;
  spotlightCharacterId?: string;
  directorBeatPending?: boolean;
  actAdvance?: { proposed: boolean; allowed: boolean; reason?: string };
}): EngineAuditEntry {
  const checks: EngineAuditCheck[] = [];
  const combatantsTracked = Math.max(0, options.combatantsTracked || 0);
  const npcMemoryUpdates = Math.max(0, options.npcMemoryUpdates || 0);
  const actGoalsCompleted = Math.max(0, (options.worldState.actGoalsAchieved || []).length + (options.actGoalsAdded || []).length);
  const role = actRoleFor(options.act);
  const arc = arcNumberFor(options.act);

  checks.push(options.ungroundedFightBlocked
    ? { label: 'Grounded encounter', status: 'blocked', detail: 'Blocked an ungrounded fight spawn and converted it into investigation pressure.' }
    : { label: 'Grounded encounter', status: 'pass', detail: 'No ungrounded fight spawn was detected this turn.' });

  if (combatantsTracked > 0) {
    checks.push({
      label: 'Combatants tracked',
      status: options.combatCompletenessFilled ? 'warn' : 'pass',
      detail: options.combatCompletenessFilled
        ? `Filled missing combatant records; ${combatantsTracked} enemies are now tracked.`
        : `${combatantsTracked} enemies are tracked in combat state.`,
    });
  } else {
    checks.push({ label: 'Combatants tracked', status: 'info', detail: 'No active combatants after this turn.' });
  }

  checks.push(npcMemoryUpdates > 0
    ? { label: 'People Sheet updates', status: 'pass', detail: `${npcMemoryUpdates} NPC memory update${npcMemoryUpdates === 1 ? '' : 's'} queued.` }
    : { label: 'People Sheet updates', status: 'info', detail: 'No NPC memory updates were needed this turn.' });

  if (role === 1) {
    checks.push({
      label: `Act ${options.act} setup readiness`,
      status: actGoalsCompleted > 0 || npcMemoryUpdates > 0 ? 'pass' : 'warn',
      detail: actGoalsCompleted > 0
        ? `Arc ${arc} setup has ${actGoalsCompleted} roadmap goal${actGoalsCompleted === 1 ? '' : 's'} completed.`
        : `Arc ${arc} setup still needs a concrete hook, NPC, location, or roadmap beat before it should advance.`,
    });
  }

  if (role === 2) {
    checks.push({
      label: `Act ${options.act} escalation readiness`,
      status: options.highStakes && actGoalsCompleted >= 2 ? 'pass' : 'warn',
      detail: options.highStakes
        ? `Arc ${arc} escalation has high-stakes pressure; ${actGoalsCompleted} roadmap goal${actGoalsCompleted === 1 ? '' : 's'} completed.`
        : `Arc ${arc} escalation still needs high-stakes pressure before it should advance; ${actGoalsCompleted} roadmap goal${actGoalsCompleted === 1 ? '' : 's'} completed.`,
    });
  }

  if (role === 3) {
    checks.push({
      label: `Act ${options.act} climax readiness`,
      status: options.actAdvance?.allowed ? 'pass' : 'warn',
      detail: options.actAdvance?.allowed
        ? `Arc ${arc} climax has enough convergence and resolution evidence to advance.`
        : `Arc ${arc} climax should not advance until convergence threads and a concrete resolution are recorded.`,
    });
  }

  if (options.actAdvance?.proposed) {
    checks.push({
      label: 'Act advancement',
      status: options.actAdvance.allowed ? 'pass' : 'blocked',
      detail: options.actAdvance.allowed
        ? `Act ${options.act} is eligible to advance.`
        : `Act ${options.act} advance was blocked: ${options.actAdvance.reason || 'pacing requirements were not met'}`,
    });
  }

  if (options.spotlightCharacterId) {
    checks.push({
      label: 'Co-op spotlight',
      status: 'pass',
      detail: `Spotlight credited to ${options.spotlightCharacterId}.`,
    });
  }

  if (options.directorBeatPending) {
    checks.push({
      label: 'Director pressure',
      status: 'warn',
      detail: 'A story-director beat is pending and should be paid off soon.',
    });
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    actionCount: options.actionCount,
    act: options.act,
    actors: options.actors,
    actionSummary: options.actions.map(action => action.trim()).filter(Boolean).join(' | ').slice(0, 240),
    location: options.location,
    scenePurpose: options.scenePurpose,
    pacingMode: options.pacingMode,
    checks,
    stateDigest: {
      combatantsTracked,
      npcMemoryUpdates,
      actGoalsCompleted,
      highStakes: !!options.highStakes,
      spotlightCharacterId: options.spotlightCharacterId,
      advanceActProposed: options.actAdvance?.proposed,
      advanceActAllowed: options.actAdvance?.allowed,
    },
  };
}
