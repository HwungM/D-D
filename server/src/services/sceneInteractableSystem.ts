import type { SceneInteractable, WorldState } from '../../../shared/types';

// Builds the "what's in this room" model reused by the free-roam micro-action
// layer. Deliberately reuses data the engine already tracks (LocationGraph's
// current node, npcMemory/keyNPCs, activeNPC) instead of a parallel NPC/location
// system — this is just a lightweight view over that data, regenerated whenever
// the location or scene context changes.
//
// When characterId is given and that character has an entry in
// WorldState.characterSubLocations pointing at one of the current node's
// SubLocations, the interactables are scoped to THAT sub-location instead of
// the whole top-level location — NPCs/objects reflect the sub-location's own
// npcsPresent/objectsOfInterest, and exits become "leave to <parent>" plus the
// other sub-locations reachable from here. A character with no sub-location
// entry (or a node with no generated sub-locations) behaves exactly as before.
export function buildSceneInteractables(worldState: WorldState, characterId?: string): SceneInteractable[] {
  const location = worldState.locationGraph?.currentLocation || worldState.currentLocation;
  const node = worldState.locationGraph?.nodes?.find(n => n.name === location);
  const interactables: SceneInteractable[] = [];

  const currentSubLocationName = characterId ? worldState.characterSubLocations?.[characterId] : undefined;
  const currentSubLocation = currentSubLocationName
    ? node?.subLocations?.find(s => s.name === currentSubLocationName)
    : undefined;

  const npcMemoryByName = new Map((worldState.npcMemory || []).map(n => [n.name, n]));
  const keyByName = new Map((worldState.keyNPCs || []).map(n => [n.name, n]));
  const seenNpcs = new Set<string>();
  const presentNames = currentSubLocation
    ? [
        ...(worldState.activeNPC ? [worldState.activeNPC] : []),
        ...(currentSubLocation.npcsPresent || []),
      ]
    : [
        ...(worldState.activeNPC ? [worldState.activeNPC] : []),
        ...(node?.npcsPresent || []),
        ...(node?.partyHere || []).filter(() => false), // partyHere tracks players, not NPCs — excluded on purpose
      ];
  for (const name of presentNames) {
    if (!name || seenNpcs.has(name)) continue;
    seenNpcs.add(name);
    const memory = npcMemoryByName.get(name) || keyByName.get(name);
    const hook = memory
      ? `${memory.role ? `${memory.role} — ` : ''}${(memory.notes || 'someone the party has met before').slice(0, 100)}`
      : 'someone worth talking to';
    interactables.push({ kind: 'npc', name, hook });
  }

  if (currentSubLocation) {
    for (const object of (currentSubLocation.objectsOfInterest || []).slice(0, 5)) {
      interactables.push({ kind: 'object', name: object, hook: 'a notable feature of this spot' });
    }
  } else {
    for (const tag of (node?.tags || []).slice(0, 4)) {
      interactables.push({ kind: 'object', name: tag, hook: 'a notable feature of this place' });
    }
    for (const questHook of (node?.questHooks || []).slice(0, 3)) {
      const shortName = questHook.split(' ').slice(0, 5).join(' ');
      interactables.push({ kind: 'object', name: shortName, hook: questHook });
    }
  }

  if (currentSubLocation) {
    // Exits from inside a sub-location: back out to the parent location, plus
    // sideways moves to the other sub-locations of this same place.
    interactables.push({ kind: 'exit', name: `${location} (leave)`, hook: `leave to ${location}` });
    for (const other of (node?.subLocations || [])) {
      if (other.name === currentSubLocation.name) continue;
      interactables.push({ kind: 'exit', name: other.name, hook: `head into ${other.name}` });
    }
  } else {
    // At the top level: ordinary location-to-location exits, plus (when this
    // node has generated sub-locations) entering one of them as an exit-like
    // option.
    const exits = Array.from(new Set([
      ...(node?.connectedTo || []),
      ...(worldState.locationGraph?.nearby || []),
    ])).filter(name => name !== location).slice(0, 5);
    for (const exit of exits) {
      interactables.push({ kind: 'exit', name: exit, hook: `travel to ${exit}` });
    }
    for (const sub of (node?.subLocations || []).slice(0, 6)) {
      interactables.push({ kind: 'exit', name: sub.name, hook: `head into ${sub.name}` });
    }
  }

  return interactables.slice(0, 16);
}

export function formatSceneInteractablesBlock(interactables: SceneInteractable[] | undefined): string {
  if (!interactables || interactables.length === 0) return 'Nothing specific is flagged as present — use judgment from recent narration/history for who/what is here.';
  const npcs = interactables.filter(i => i.kind === 'npc');
  const objects = interactables.filter(i => i.kind === 'object');
  const exits = interactables.filter(i => i.kind === 'exit');
  return [
    npcs.length ? `NPCs present: ${npcs.map(n => `${n.name} (${n.hook})`).join('; ')}` : null,
    objects.length ? `Notable objects/features: ${objects.map(o => `${o.name} (${o.hook})`).join('; ')}` : null,
    exits.length ? `Exits: ${exits.map(e => e.name).join(', ')}` : null,
  ].filter(Boolean).join('\n');
}
