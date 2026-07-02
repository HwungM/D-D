import type { SceneInteractable, WorldState } from '../../../shared/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// Campaigns created before scene/sub-location scoping stored several fields in
// older shapes. Normalize API snapshots at the client boundary so a five-second
// co-op poll can never replace a working render with legacy JSON that a panel
// tries to `.map`, `.filter`, or `.slice`.
export function normalizeWorldStateForClient(value: unknown, characterId: string): WorldState {
  const source = isRecord(value) ? value : {}
  const normalized: Record<string, unknown> = { ...source }
  delete normalized.weather

  const rawInteractables = source.sceneInteractables
  if (Array.isArray(rawInteractables)) {
    normalized.sceneInteractables = { [characterId]: rawInteractables as SceneInteractable[] }
  } else if (isRecord(rawInteractables)) {
    normalized.sceneInteractables = Object.fromEntries(
      Object.entries(rawInteractables).filter((entry): entry is [string, SceneInteractable[]] => Array.isArray(entry[1]))
    )
  } else {
    normalized.sceneInteractables = {}
  }

  normalized.characterSubLocations = isRecord(source.characterSubLocations)
    ? Object.fromEntries(Object.entries(source.characterSubLocations).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}

  const arrayFields = [
    'activeQuests', 'discoveredLocations', 'npcMemory', 'keyNPCs',
    'sessionNotes', 'foreshadowingLedger', 'backstoryHooks', 'engineAudit',
    'mysteryClues', 'characterMemories', 'fallenHeroes', 'unlockedAchievements',
    'knownRecipes', 'companions', 'partyAssets', 'signatureItemQuests',
    'recentWorldEvents', 'storyLedger', 'campaignJournal', 'characterHistory',
  ]
  for (const field of arrayFields) {
    if (source[field] !== undefined && !Array.isArray(source[field])) normalized[field] = []
  }

  if (isRecord(source.locationGraph)) {
    const graph = source.locationGraph
    normalized.locationGraph = {
      ...graph,
      nodes: Array.isArray(graph.nodes)
        ? graph.nodes.filter(isRecord).map(node => ({
            ...node,
            ...(node.subLocations !== undefined && !Array.isArray(node.subLocations) ? { subLocations: [] } : {}),
          }))
        : [],
      nearby: Array.isArray(graph.nearby) ? graph.nearby : [],
    }
  }

  if (isRecord(source.pendingTurn) && !Array.isArray(source.pendingTurn.actions)) {
    normalized.pendingTurn = { ...source.pendingTurn, actions: [] }
  }

  return normalized as unknown as WorldState
}
