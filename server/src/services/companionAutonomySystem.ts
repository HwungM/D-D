import type { CompanionCharacter, CompanionLocationState, InventoryItem, WorldState } from '../../../shared/types';

export const COMPANION_ACTIVITY_CHANCE = 0.38;
export const COMPANION_ACTIVITY_MIN_SPACING = 2;

export type CompanionActivityKind = 'move' | 'explore' | 'clue' | 'item' | 'trouble';

export interface CompanionActivity {
  companionId: string;
  companionName: string;
  kind: CompanionActivityKind;
  text: string;
  location: string;
  subLocation?: string;
}

function livingCompanions(worldState: WorldState): CompanionCharacter[] {
  return (worldState.companions || []).filter(companion => companion.is_alive);
}

function actionsSinceLastActivity(worldState: WorldState): number {
  const actions = worldState.freeRoam?.actions || [];
  const lastAt = Object.values(worldState.companionLocations || {})
    .map(location => location.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!lastAt) return actions.length;
  return actions.filter(action => action.createdAt > lastAt).length;
}

export function shouldTriggerCompanionActivity(worldState: WorldState, random: () => number = Math.random): boolean {
  if (livingCompanions(worldState).length === 0) return false;
  if (actionsSinceLastActivity(worldState) < COMPANION_ACTIVITY_MIN_SPACING) return false;
  return random() < COMPANION_ACTIVITY_CHANCE;
}

function currentPosition(worldState: WorldState, companion: CompanionCharacter): CompanionLocationState {
  return worldState.companionLocations?.[companion.id] || {
    location: worldState.currentLocation || 'the surrounding area',
    updatedAt: companion.lastSeenAt || companion.recruitedAt,
  };
}

function locationNode(worldState: WorldState, name: string) {
  return worldState.locationGraph?.nodes?.find(node => node.name === name);
}

function movementTarget(worldState: WorldState, position: CompanionLocationState, random: () => number): { location: string; subLocation?: string } | undefined {
  if (position.subLocation) return { location: position.location };
  const node = locationNode(worldState, position.location);
  const targets = ([
    ...(node?.subLocations || []).map(sub => ({ location: position.location, subLocation: sub.name })),
    ...(node?.connectedTo || []).map(location => ({ location })),
  ] as Array<{ location: string; subLocation?: string }>).filter(target => target.location !== position.location || !!target.subLocation);
  return targets.length > 0 ? targets[Math.floor(random() * targets.length)] : undefined;
}

function foundItem(companion: CompanionCharacter, location: string): InventoryItem {
  return {
    id: `companion-find-${companion.id}-${Date.now()}`,
    name: `Curio from ${location}`,
    description: `${companion.name} found this while exploring independently.`,
    quantity: 1,
    type: 'misc',
    value: 5,
  };
}

export function createCompanionActivity(
  worldState: WorldState,
  random: () => number = Math.random,
): { activity: CompanionActivity; worldState: WorldState } | undefined {
  const roster = livingCompanions(worldState);
  if (roster.length === 0) return undefined;
  const companion = roster[Math.floor(random() * roster.length)];
  const position = currentPosition(worldState, companion);
  const now = new Date().toISOString();
  const roll = random();
  let kind: CompanionActivityKind = 'explore';
  let text = '';
  let nextPosition: CompanionLocationState = { ...position, updatedAt: now };
  let companions = worldState.companions || [];
  let mysteryClues = worldState.mysteryClues;

  const target = movementTarget(worldState, position, random);
  if (roll < 0.32 && target) {
    kind = 'move';
    nextPosition = { ...target, activity: 'Exploring independently', updatedAt: now };
    const destination = target.subLocation || target.location;
    text = `${companion.name} leaves to investigate ${destination} on their own.`;
  } else if (roll < 0.64) {
    const node = locationNode(worldState, position.location);
    const sub = node?.subLocations?.find(candidate => candidate.name === position.subLocation);
    const detail = sub?.objectsOfInterest?.[0] || node?.questHooks?.[0] || 'the surrounding area';
    kind = 'explore';
    nextPosition.activity = `Investigating ${detail}`;
    text = `${companion.name} searches ${position.subLocation || position.location} independently, taking a closer look at ${detail}.`;
  } else if (roll < 0.78) {
    const clue = mysteryClues?.find(candidate => candidate.status === 'undiscovered');
    if (clue) {
      kind = 'clue';
      mysteryClues = mysteryClues!.map(candidate => candidate.id === clue.id ? { ...candidate, status: 'revealed' as const } : candidate);
      nextPosition.activity = 'Following a new lead';
      text = `${companion.name} uncovers a clue while searching ${position.subLocation || position.location}: ${clue.clue}`;
    } else {
      nextPosition.activity = 'Scouting for leads';
      text = `${companion.name} scouts ${position.subLocation || position.location} for leads and marks a few places worth revisiting.`;
    }
  } else if (roll < 0.9) {
    kind = 'item';
    const item = foundItem(companion, position.subLocation || position.location);
    companions = companions.map(entry => entry.id === companion.id ? { ...entry, inventory: [...entry.inventory, item] } : entry);
    nextPosition.activity = `Found ${item.name}`;
    text = `${companion.name} finds ${item.name} while exploring ${position.subLocation || position.location} and adds it to their pack.`;
  } else {
    kind = 'trouble';
    const damage = companion.hp > 1 ? 1 : 0;
    companions = companions.map(entry => entry.id === companion.id ? { ...entry, hp: Math.max(1, entry.hp - damage) } : entry);
    nextPosition.activity = 'Ran into trouble';
    text = damage
      ? `${companion.name} gets into trouble while exploring ${position.subLocation || position.location} and returns scraped up, losing 1 HP.`
      : `${companion.name} narrowly avoids trouble while exploring ${position.subLocation || position.location}.`;
  }

  return {
    activity: {
      companionId: companion.id,
      companionName: companion.name,
      kind,
      text,
      location: nextPosition.location,
      subLocation: nextPosition.subLocation,
    },
    worldState: {
      ...worldState,
      companions,
      mysteryClues,
      companionLocations: { ...(worldState.companionLocations || {}), [companion.id]: nextPosition },
    },
  };
}
