import type { ActiveQuest, BackstoryHook, CharacterMemory, ForeshadowingEntry, LocationNode, NpcMemory, StoryLedgerEntry, WorldBible, WorldState } from '../../../shared/types';
import { actRoleFor, arcNumberFor } from './actPacingSystem';

function toArr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isNpcMemory(value: unknown): value is NpcMemory {
  return isRecord(value) && typeof value.name === 'string' && typeof value.notes === 'string';
}

function npcMemoryKey(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

function npcMemoryEntries(list: unknown): [string, NpcMemory][] {
  return toArr<NpcMemory>(list)
    .map((npc): [string, NpcMemory] => [npcMemoryKey(npc.name), npc])
    .filter((entry): entry is [string, NpcMemory] => entry[0].length > 0);
}

function isActiveQuest(value: unknown): value is ActiveQuest {
  return isRecord(value) && typeof value.title === 'string' && typeof value.description === 'string';
}

function isCharacterMemory(value: unknown): value is CharacterMemory {
  return isRecord(value) && typeof value.characterId === 'string' && typeof value.characterName === 'string';
}

function uniqueBoundedStrings(values: unknown[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result.slice(-limit);
}

// Every campaign is a continuous, open-ended, multi-arc saga now (no more
// length tiers), so the target always uses the old "open_ended" number.
export function campaignTargetActions(_worldBible?: WorldBible): number {
  return 75;
}

function getActLabel(_worldBible: WorldBible | undefined, act: number): string {
  const role = actRoleFor(act);
  const arc = arcNumberFor(act);
  const prefix = arc > 1 ? `Arc ${arc}: ` : '';
  if (role === 1) return `${prefix}The Call`;
  if (role === 2) return `${prefix}The Trial`;
  return `${prefix}The Climax`;
}

function normalizeLocationName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function inferRegionForLocation(location: string, worldBible?: WorldBible): string {
  const geo = worldBible?.geography?.find(entry => entry.name.toLowerCase() === location.toLowerCase());
  if (geo?.type === 'region') return geo.name;
  const region = worldBible?.geography?.find(entry =>
    entry.type === 'region' && location.toLowerCase().includes(entry.name.toLowerCase())
  );
  return region?.name || 'Known Realm';
}

export function buildLocationGraphSnapshot(worldState: WorldState, worldBible: WorldBible | undefined): WorldState['locationGraph'] {
  const now = new Date().toISOString();
  const currentLocation = normalizeLocationName(worldState.currentLocation);
  const geography = worldBible?.geography || [];
  const names = new Set<string>();

  for (const entry of geography) names.add(entry.name);
  for (const loc of worldState.discoveredLocations || []) {
    const name = normalizeLocationName(loc);
    if (name) names.add(name);
  }
  for (const loc of Object.values(worldState.characterLocations || {})) {
    const name = normalizeLocationName(loc);
    if (name) names.add(name);
  }
  if (currentLocation) names.add(currentLocation);

  const questHooksByLocation = new Map<string, string[]>();
  for (const quest of worldState.activeQuests || []) {
    if (quest.status !== 'active') continue;
    for (const location of names) {
      if (quest.description.toLowerCase().includes(location.toLowerCase()) || quest.title.toLowerCase().includes(location.toLowerCase())) {
        questHooksByLocation.set(location, [...(questHooksByLocation.get(location) || []), quest.title]);
      }
    }
  }

  const npcsByLocation = new Map<string, string[]>();
  for (const npc of [...(worldState.npcMemory || []), ...(worldState.keyNPCs || [])]) {
    const lastMet = normalizeLocationName(npc.lastMet);
    if (!lastMet) continue;
    npcsByLocation.set(lastMet, Array.from(new Set([...(npcsByLocation.get(lastMet) || []), npc.name])));
    names.add(lastMet);
  }
  if (worldState.activeNPC && currentLocation) {
    npcsByLocation.set(currentLocation, Array.from(new Set([...(npcsByLocation.get(currentLocation) || []), worldState.activeNPC])));
  }

  const partyByLocation = new Map<string, string[]>();
  for (const [characterId, location] of Object.entries(worldState.characterLocations || {})) {
    const name = normalizeLocationName(location);
    if (!name) continue;
    partyByLocation.set(name, [...(partyByLocation.get(name) || []), characterId]);
  }

  const existingNodes = new Map(toArr<LocationNode>(worldState.locationGraph?.nodes).map(node => [node.name.toLowerCase(), node]));
  const sortedNames = Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const nodes = sortedNames.map(name => {
    const previous = existingNodes.get(name.toLowerCase());
    const geo = geography.find(entry => entry.name.toLowerCase() === name.toLowerCase());
    const region = inferRegionForLocation(name, worldBible);
    const isCurrent = currentLocation.toLowerCase() === name.toLowerCase();
    const wasCurrent = (previous?.tags || []).includes('current');
    const existingConnections = previous?.connectedTo || [];
    const connectedTo = Array.from(new Set([
      ...existingConnections,
      ...(currentLocation && name !== currentLocation && (isCurrent || existingConnections.includes(currentLocation)) ? [currentLocation] : []),
    ])).slice(0, 8);

    return {
      name,
      region,
      description: geo?.description || previous?.description,
      type: geo?.type || previous?.type || 'unknown',
      discoveredAt: previous?.discoveredAt || now,
      lastVisitedAt: isCurrent ? now : previous?.lastVisitedAt,
      visits: (previous?.visits || 0) + (isCurrent && !wasCurrent ? 1 : 0),
      connectedTo,
      npcsPresent: npcsByLocation.get(name) || [],
      questHooks: questHooksByLocation.get(name) || [],
      partyHere: partyByLocation.get(name) || (isCurrent ? ['current'] : []),
      tags: Array.from(new Set([
        ...(previous?.tags || []).filter(tag => tag !== 'current'),
        ...(geo?.type ? [geo.type] : []),
        ...(isCurrent ? ['current'] : []),
        ...((questHooksByLocation.get(name) || []).length ? ['quest'] : []),
        ...((npcsByLocation.get(name) || []).length ? ['npc'] : []),
      ])).slice(0, 8),
    };
  });

  const regionMap = new Map<string, string[]>();
  for (const node of nodes) {
    regionMap.set(node.region, [...(regionMap.get(node.region) || []), node.name]);
  }
  const regions = Array.from(regionMap.entries()).map(([name, locations]) => ({ name, locations }));
  const nearby = currentLocation
    ? Array.from(new Set([
      ...(nodes.find(node => node.name === currentLocation)?.connectedTo || []),
      ...nodes.filter(node => node.region === inferRegionForLocation(currentLocation, worldBible) && node.name !== currentLocation).map(node => node.name),
    ])).slice(0, 6)
    : nodes.slice(0, 6).map(node => node.name);

  return {
    currentLocation: currentLocation || undefined,
    nodes,
    regions,
    nearby,
    updatedAt: now,
  };
}

export function buildCampaignSpineSnapshot(worldState: WorldState, worldBible: WorldBible | undefined, act = 1): WorldState['campaignSpine'] {
  const targetActions = campaignTargetActions(worldBible);
  const actionsInArc = Math.max(0, worldState.actionsInCurrentAct || 0);
  const progress = Math.max(0, Math.min(100, Math.round((actionsInArc / targetActions) * 100)));
  const pressure = worldState.endgamePhase === 'confrontation'
    ? 'climax'
    : worldState.combatState?.inCombat || worldState.pendingDirectorBeat?.urgency === 'critical'
      ? 'dangerous'
      : progress >= 65 || worldState.pendingDirectorBeat?.urgency === 'high'
        ? 'rising'
        : 'low';

  const latestJournal = (worldState.campaignJournal || []).slice(-1)[0];
  const latestNote = (worldState.sessionNotes || []).slice(-1)[0];
  const lastRecap = worldState.currentSceneSummary || latestJournal?.summary || latestNote || 'The campaign is still finding its first lasting shape.';

  const openThreads = [
    ...(worldState.activeQuests || [])
      .filter(quest => quest.status === 'active')
      .map(quest => `Quest: ${quest.title}`),
    ...(worldState.futureHooks || [])
      .filter(hook => !hook.resolved)
      .slice(-4)
      .map(hook => `Future hook: ${hook.description}`),
    ...(worldState.backstoryHooks || [])
      .filter(hook => hook.status !== 'resolved')
      .slice(-3)
      .map(hook => `Backstory: ${hook.characterName} - ${hook.hook}`),
    ...(worldState.foreshadowingLedger || [])
      .filter(entry => entry.payoffStatus !== 'paid_off')
      .slice(-3)
      .map(entry => `Foreshadowing: ${entry.description}`),
    ...(worldBible?.primaryAntagonist?.isRevealed
      ? [`Antagonist: ${worldBible.primaryAntagonist.name} wants ${worldBible.primaryAntagonist.agenda}`]
      : []),
  ]
    .filter((thread, index, all) => all.indexOf(thread) === index)
    .slice(0, 8);

  const relationshipMap = new Map<string, NpcMemory>();
  for (const npc of [...(worldState.npcMemory || []), ...(worldState.keyNPCs || [])]) {
    relationshipMap.set(npc.name, { ...relationshipMap.get(npc.name), ...npc });
  }
  const keyRelationships = Array.from(relationshipMap.values())
    .sort((a, b) => Number(!!b.isKeyNPC) - Number(!!a.isKeyNPC) || (b.interactionCount || 0) - (a.interactionCount || 0))
    .slice(0, 6)
    .map(npc => ({
      name: npc.name,
      disposition: npc.disposition || 'unknown',
      note: npc.notes || 'Known to the campaign.',
    }));

  const nextPressure = worldState.pendingDirectorBeat?.beat
    || (openThreads[0] ? `Follow up on ${openThreads[0].replace(/^(Quest|Future hook|Backstory|Foreshadowing|Antagonist): /, '')}` : 'Let the next player choice define the pressure.');

  return {
    currentArc: {
      act,
      label: getActLabel(worldBible, act),
      progress,
      pressure,
    },
    lastRecap,
    openThreads,
    keyRelationships,
    nextPressure,
    updatedAt: new Date().toISOString(),
  };
}

export function mergeWorldStateChanges(current: WorldState, changes: Partial<WorldState>): WorldState {
  const merged = { ...current };

  if (changes.characterLocations) {
    merged.characterLocations = { ...current.characterLocations, ...changes.characterLocations };
  }
  if (changes.characterSubLocations) {
    merged.characterSubLocations = { ...current.characterSubLocations, ...changes.characterSubLocations };
  }
  if (changes.currentLocation) merged.currentLocation = changes.currentLocation;

  if (changes.npcMemory) {
    const npcArray = (Array.isArray(changes.npcMemory) ? changes.npcMemory : Object.values(changes.npcMemory)).filter(isNpcMemory);
    const existing = new Map<string, NpcMemory>(npcMemoryEntries(current.npcMemory));
    const keyNpcMap = new Map<string, NpcMemory>(npcMemoryEntries(current.keyNPCs));

    for (const npc of npcArray) {
      const npcKey = npcMemoryKey(npc.name);
      if (!npcKey) continue;
      const replacesKey = npc.replacesName && npcMemoryKey(npc.replacesName) !== npcKey ? npcMemoryKey(npc.replacesName) : '';
      const placeholder = replacesKey ? existing.get(replacesKey) : undefined;
      if (placeholder && replacesKey) {
        existing.delete(replacesKey);
        keyNpcMap.delete(replacesKey);
      }
      const prev = existing.get(npcKey) || placeholder;
      const metChars = Array.from(new Set([...(prev?.metCharacters || []), ...(npc.metCharacters || [])]));
      const interactionCount = (prev?.interactionCount || 0) + 1;
      const { replacesName: _replacesName, ...npcRest } = npc;
      const mergedNpc = { ...prev, ...npcRest, metCharacters: metChars, interactionCount };
      existing.set(npcKey, mergedNpc);

      if ((interactionCount >= 3 || npc.isKeyNPC) && !keyNpcMap.has(npcKey)) {
        keyNpcMap.set(npcKey, { ...mergedNpc, isKeyNPC: true });
      } else if (keyNpcMap.has(npcKey)) {
        keyNpcMap.set(npcKey, { ...keyNpcMap.get(npcKey)!, ...npc, metCharacters: metChars, interactionCount });
      }
    }

    merged.npcMemory = Array.from(existing.values()).slice(-20);
    merged.keyNPCs = Array.from(keyNpcMap.values()).slice(-8);
  }

  if (changes.activeQuests) {
    const questArray = (Array.isArray(changes.activeQuests) ? changes.activeQuests : Object.values(changes.activeQuests)).filter(isActiveQuest);
    const existing = new Map(toArr<ActiveQuest>(current.activeQuests).map(q => [q.title, q]));
    for (const q of questArray) existing.set(q.title, { ...existing.get(q.title), ...q, startedAt: existing.get(q.title)?.startedAt || new Date().toISOString() });
    merged.activeQuests = Array.from(existing.values());
  }

  if (changes.discoveredLocations) {
    const all = Array.from(new Set([...(current.discoveredLocations || []), ...toArr<string>(changes.discoveredLocations)]));
    if (all.length <= 100) {
      merged.discoveredLocations = all;
    } else {
      const nodeByName = new Map(toArr<LocationNode>(current.locationGraph?.nodes).map(node => [node.name.toLowerCase(), node]));
      const scored = all.map((name, index) => {
        const node = nodeByName.get(name.toLowerCase());
        const visits = node?.visits || 0;
        const lastVisited = node?.lastVisitedAt ? Date.parse(node.lastVisitedAt) || 0 : 0;
        const recencyBonus = index;
        return { name, score: visits * 1000 + (lastVisited > 0 ? 1 : 0) * 500 + recencyBonus };
      });
      scored.sort((a, b) => b.score - a.score);
      merged.discoveredLocations = scored.slice(0, 100).map(entry => entry.name);
    }
  }

  if (changes.factionStandings) merged.factionStandings = { ...current.factionStandings, ...changes.factionStandings };
  if (changes.sessionNotes) {
    const notesArray = Array.isArray(changes.sessionNotes) ? asStringArray(changes.sessionNotes) : asStringArray(Object.values(changes.sessionNotes));
    const existing = new Set(current.sessionNotes || []);
    merged.sessionNotes = [...(current.sessionNotes || []), ...notesArray.filter(n => !existing.has(n))];
  }
  if (changes.characterLastSeen) merged.characterLastSeen = { ...current.characterLastSeen, ...changes.characterLastSeen };

  if (changes.foreshadowingLedger) {
    const existing = new Map(toArr<ForeshadowingEntry>(current.foreshadowingLedger).map(f => [f.id, f]));
    for (const entry of toArr<ForeshadowingEntry>(changes.foreshadowingLedger)) existing.set(entry.id, { ...existing.get(entry.id), ...entry });
    merged.foreshadowingLedger = Array.from(existing.values()).slice(-50);
  }

  if (changes.backstoryHooks) {
    const existing = new Map(toArr<BackstoryHook>(current.backstoryHooks).map(h => [`${h.characterId}:${h.hook}`, h]));
    for (const hook of toArr<BackstoryHook>(changes.backstoryHooks)) existing.set(`${hook.characterId}:${hook.hook}`, { ...existing.get(`${hook.characterId}:${hook.hook}`), ...hook });
    const all = Array.from(existing.values());
    merged.backstoryHooks = [...all.filter(h => h.status !== 'resolved'), ...all.filter(h => h.status === 'resolved').slice(-15)];
  }

  if (changes.actGoalsAchieved) {
    merged.actGoalsAchieved = Array.from(new Set([...(current.actGoalsAchieved || []), ...toArr<string>(changes.actGoalsAchieved)]));
  }

  if (changes.storyLedger) {
    const existing = new Map(toArr<StoryLedgerEntry>(current.storyLedger).map(entry => [entry.id, entry]));
    for (const entry of toArr<StoryLedgerEntry>(changes.storyLedger)) existing.set(entry.id, { ...existing.get(entry.id), ...entry });
    const all = Array.from(existing.values());
    merged.storyLedger = [...all.filter(entry => entry.status !== 'resolved').slice(-30), ...all.filter(entry => entry.status === 'resolved').slice(-20)];
  }

  if (changes.characterMemories) {
    const existing = new Map(toArr<CharacterMemory>(current.characterMemories).map(memory => [memory.characterId, memory]));
    for (const memory of toArr<CharacterMemory>(changes.characterMemories).filter(isCharacterMemory)) {
      const prev = existing.get(memory.characterId);
      const relationships = new Map((prev?.relationships || []).map(rel => [rel.npcName.toLowerCase(), rel]));
      for (const rel of memory.relationships || []) relationships.set(rel.npcName.toLowerCase(), { ...relationships.get(rel.npcName.toLowerCase()), ...rel });
      existing.set(memory.characterId, {
        ...prev,
        ...memory,
        knownFacts: uniqueBoundedStrings([...(prev?.knownFacts || []), ...(memory.knownFacts || [])], 14),
        personalStakes: uniqueBoundedStrings([...(prev?.personalStakes || []), ...(memory.personalStakes || [])], 10),
        privateNotes: uniqueBoundedStrings([...(prev?.privateNotes || []), ...(memory.privateNotes || [])], 8),
        relationships: Array.from(relationships.values()).slice(-12),
      });
    }
    merged.characterMemories = Array.from(existing.values()).slice(-6);
  }

  if (changes.dmMemory) {
    const prev = current.dmMemory;
    merged.dmMemory = {
      ...prev,
      ...changes.dmMemory,
      recurringMotifs: uniqueBoundedStrings([...(prev?.recurringMotifs || []), ...(changes.dmMemory.recurringMotifs || [])], 10),
      tableToneNotes: uniqueBoundedStrings([...(prev?.tableToneNotes || []), ...(changes.dmMemory.tableToneNotes || [])], 8),
      unresolvedConsequences: uniqueBoundedStrings([...(prev?.unresolvedConsequences || []), ...(changes.dmMemory.unresolvedConsequences || [])], 12),
      runningJokes: uniqueBoundedStrings([...(prev?.runningJokes || []), ...(changes.dmMemory.runningJokes || [])], 8),
      promisesToHonor: uniqueBoundedStrings([...(prev?.promisesToHonor || []), ...(changes.dmMemory.promisesToHonor || [])], 10),
      lastUpdatedAt: changes.dmMemory.lastUpdatedAt || prev?.lastUpdatedAt || new Date().toISOString(),
    };
  }

  if (changes.engineAudit) {
    const existing = new Map(toArr<NonNullable<WorldState['engineAudit']>[number]>(current.engineAudit).map(entry => [entry.id, entry]));
    for (const entry of toArr<NonNullable<WorldState['engineAudit']>[number]>(changes.engineAudit)) existing.set(entry.id, { ...existing.get(entry.id), ...entry });
    merged.engineAudit = Array.from(existing.values())
      .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0))
      .slice(-30);
  }

  if (changes.mysteryClues) {
    const existing = new Map((current.mysteryClues || []).map(c => [c.id, c]));
    for (const clue of changes.mysteryClues) existing.set(clue.id, { ...existing.get(clue.id), ...clue });
    merged.mysteryClues = Array.from(existing.values()).slice(-50);
  }

  if (changes.shopInventory) merged.shopInventory = { ...(current.shopInventory || {}), ...changes.shopInventory };
  if (changes.activeNPC !== undefined) merged.activeNPC = changes.activeNPC;

  for (const key of ['timeOfDay', 'campaignJournal', 'campaignSpine', 'locationGraph', 'antagonistProgress', 'characterHistory', 'combatState', 'currentSceneSummary', 'actionsSinceLastSummary', 'sceneState', 'villainMoveCount', 'endgamePhase', 'actionCount', 'actionsInCurrentAct', 'keyNPCs', 'unlockedAchievements', 'knownRecipes', 'spotlightBalance', 'lastPillarUsed', 'lastHighStakesAction', 'pendingDirectorBeat', 'pendingTurn', 'coopPendingRoll', 'engineDebug', 'companion', 'companions', 'companionLocations', 'pendingMacroEvent', 'recentPlayerActions'] as const) {
    if (changes[key] !== undefined) (merged as Record<string, unknown>)[key] = changes[key];
  }

  return merged;
}
