import { describe, expect, it } from 'vitest'
import { normalizeWorldStateForClient } from './worldStateCompat'

describe('normalizeWorldStateForClient', () => {
  it('migrates a legacy flat interactables array into the current character slot', () => {
    const normalized = normalizeWorldStateForClient({
      currentLocation: 'Evermire',
      sceneInteractables: [{ kind: 'npc', name: 'Mira', hook: 'librarian' }],
    }, 'char-1')
    expect(normalized.sceneInteractables?.['char-1']).toHaveLength(1)
  })

  it('drops malformed per-character and collection values instead of crashing renderers', () => {
    const normalized = normalizeWorldStateForClient({
      sceneInteractables: { 'char-1': { stale: true }, 'char-2': [{ kind: 'object', name: 'book', hook: 'old' }] },
      companions: { stale: true },
      activeQuests: null,
      characterSubLocations: ['The Tavern'],
      pendingTurn: { actions: { stale: true } },
      locationGraph: { nodes: { stale: true }, nearby: null },
    }, 'char-1')
    expect(normalized.sceneInteractables?.['char-1']).toBeUndefined()
    expect(normalized.sceneInteractables?.['char-2']).toHaveLength(1)
    expect(normalized.companions).toEqual([])
    expect(normalized.activeQuests).toEqual([])
    expect(normalized.characterSubLocations).toEqual({})
    expect(normalized.pendingTurn?.actions).toEqual([])
    expect(normalized.locationGraph?.nodes).toEqual([])
  })
})
