import type { Character, WorldState } from '../../../shared/types';

type PresentCharacter = Pick<Character, 'id' | 'name'>;

export type PresenceBlock = {
  absentName: string;
  message: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sceneKey(worldState: WorldState, characterId: string): string {
  return worldState.characterSubLocations?.[characterId]?.trim().toLowerCase() || '__shared__';
}

function actionActuallyInvolves(action: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  if (!new RegExp(`\\b${escaped}\\b`, 'i').test(action)) return false;

  // Talking ABOUT an absent person is valid. Trying to act with/on/through
  // them is not. These exemptions keep ordinary questions such as "ask the
  // librarian about Sun Mi" playable while still blocking "give Sun Mi the
  // book" or "have Sun Mi help me".
  const passiveReference = new RegExp(`\\b(?:about|remember|recall|mention|describe|where is|what happened to|think(?:ing)? (?:of|about))\\s+${escaped}\\b`, 'i');
  return !passiveReference.test(action);
}

export function validateNamedParticipantsPresent(
  action: string,
  actingCharacter: PresentCharacter,
  campaignCharacters: PresentCharacter[],
  worldState: WorldState,
): PresenceBlock | undefined {
  const actorScene = sceneKey(worldState, actingCharacter.id);

  for (const other of campaignCharacters) {
    if (other.id === actingCharacter.id || !actionActuallyInvolves(action, other.name)) continue;
    if (sceneKey(worldState, other.id) !== actorScene) {
      const where = worldState.characterSubLocations?.[other.id];
      return {
        absentName: other.name,
        message: `${other.name} is not with you right now${where ? `; they are at ${where}` : ''}. You cannot make them act, help, receive something, or respond from here. Regroup first, or do something that does not require them.`,
      };
    }
  }

  for (const companion of worldState.companions || []) {
    if (!companion.is_alive || !actionActuallyInvolves(action, companion.name)) continue;
    // Companions remain with the shared scene when a player enters a personal
    // sub-location. This mirrors companionsPresentWithCharacter().
    if (actorScene !== '__shared__') {
      return {
        absentName: companion.name,
        message: `${companion.name} is not with you in this part of the location. Regroup with the party before involving them in the action.`,
      };
    }
  }

  return undefined;
}
