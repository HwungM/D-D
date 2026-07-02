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
  if (!worldState) return []
  const focalLocation = locationFor(worldState, focalCharacterId)
  const focalSubLocation = worldState.characterSubLocations?.[focalCharacterId]
  return (worldState.companions || []).filter(companion => {
    if (!companion.is_alive) return false
    const position = worldState.companionLocations?.[companion.id]
    return (position?.location || worldState.currentLocation) === focalLocation
      && (position?.subLocation || undefined) === (focalSubLocation || undefined)
  }).map(companion => companion.name)
}
