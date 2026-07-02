import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../shared/types'
import { charactersShareScene, companionNamesSharingScene } from './scenePresence'

const base = {
  currentLocation: 'Evermire Village',
  characterLocations: { tellini: 'Evermire Village', sunmi: 'Evermire Village' },
  companions: [{ id: 'garrow', name: 'Garrow', is_alive: true }, { id: 'ithel', name: 'Ithel', is_alive: true }],
} as unknown as WorldState

describe('live scene presence', () => {
  it('keeps co-op players together only while their sublocations match', () => {
    expect(charactersShareScene(base, 'tellini', 'sunmi')).toBe(true)
    expect(charactersShareScene({ ...base, characterSubLocations: { sunmi: 'Town Hall' } }, 'tellini', 'sunmi')).toBe(false)
    expect(charactersShareScene({ ...base, characterSubLocations: { tellini: 'Town Hall', sunmi: 'Town Hall' } }, 'tellini', 'sunmi')).toBe(true)
  })

  it('shows living AI companions in the shared area and removes them inside a private sublocation', () => {
    expect(companionNamesSharingScene(base, 'tellini')).toEqual(['Garrow', 'Ithel'])
    expect(companionNamesSharingScene({ ...base, characterSubLocations: { tellini: 'Town Hall' } }, 'tellini')).toEqual([])
  })

  it('updates presence when an autonomous companion leaves for another location', () => {
    const moved = { ...base, companionLocations: { garrow: { location: 'Library', updatedAt: new Date().toISOString() } } }
    expect(companionNamesSharingScene(moved, 'tellini')).toEqual(['Ithel'])
  })
})
