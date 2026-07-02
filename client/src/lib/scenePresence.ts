import type { WorldState } from '../../../shared/types'

function locationFor(worldState: WorldState | null | undefined, characterId: string): string | undefined {
  return worldState?.characterLocations?.[characterId] || worldState?.currentLocation
}

export function charactersShareScene(
  worldState: WorldState | null | undefined,
  focalCharacterId: string,
  otherCharacterId: string,
): boolean {
  if (!worldState) return false
  const focalLocation = locationFor(worldState, focalCharacterId)
  const otherLocation = locationFor(worldState, otherCharacterId)
  if (!focalLocation || focalLocation !== otherLocation) return false
  const focalSubLocation = worldState.characterSubLocations?.[focalCharacterId]
  const otherSubLocation = worldState.characterSubLocations?.[otherCharacterId]
  return (focalSubLocation || undefined) === (otherSubLocation || undefined)
}

export function companionNamesSharingScene(
  worldState: WorldState | null | undefined,
  focalCharacterId: string,
): string[] {
  if (!worldState || worldState.characterSubLocations?.[focalCharacterId]) return []
  return (worldState.companions || []).filter(companion => companion.is_alive).map(companion => companion.name)
}
