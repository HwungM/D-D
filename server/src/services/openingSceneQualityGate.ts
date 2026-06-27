import type { Character, WorldBible } from '../../../shared/types';
import type { NarrationResult } from './narrationResponseParser';
import { cleanSuggestedActions } from './narrationResponseParser';

export type OpeningQualityIssue = {
  code: string;
  severity: 'warn' | 'fail';
  message: string;
};

export type OpeningQualityResult<T extends NarrationResult> = T & {
  openingQualityIssues?: OpeningQualityIssue[];
  openingQualityRepaired?: boolean;
};

function issue(code: string, message: string, severity: 'warn' | 'fail' = 'fail'): OpeningQualityIssue {
  return { code, severity, message };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesName(text: string, name: string): boolean {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fallbackOpeningActions(worldBible: WorldBible, characters: Character[], isCoop: boolean): string[] {
  const start = worldBible.campaignBrief?.whereToStart || worldBible.geography?.[0]?.name || 'the starting place';
  const hook = worldBible.openingHooks?.[0] || worldBible.campaignBrief?.objective || 'the first strange sign';
  const names = characters.map(c => c.name).join(' and ');
  if (isCoop) {
    return [
      `${names} compare what they notice first`,
      `Ask someone at ${start} about the strange sign`,
      `Choose who takes the lead with ${hook}`,
      'Look for who is watching both of you',
    ];
  }
  return [
    `Ask someone at ${start} about the first clue`,
    `Follow up on ${hook}`,
    'Notice who reacts to your arrival',
    'Choose a cautious or bold first move',
  ];
}

function sanitizeOpeningActions(actions: string[] | undefined, worldBible: WorldBible, characters: Character[], isCoop: boolean): string[] {
  return cleanSuggestedActions(actions || [], fallbackOpeningActions(worldBible, characters, isCoop))
    .filter(action => !/^(continue|look around|move forward|wait|see what happens)$/i.test(action.trim()))
    .slice(0, 4);
}

export function assessOpeningSceneQuality(args: {
  result: NarrationResult & { character1SuggestedActions?: string[]; character2SuggestedActions?: string[] };
  worldBible: WorldBible;
  characters: Character[];
  isCoop: boolean;
}): OpeningQualityIssue[] {
  const narration = args.result.narration || '';
  const issues: OpeningQualityIssue[] = [];
  if (wordCount(narration) < (args.isCoop ? 90 : 70)) {
    issues.push(issue('opening_too_thin', 'The opening scene is too thin to establish place, pressure, character presence, and first choice.', 'warn'));
  }

  const missing = args.characters.filter(character => !includesName(narration, character.name));
  if (missing.length > 0) {
    issues.push(issue('opening_character_missing', `The opening dropped character(s): ${missing.map(c => c.name).join(', ')}.`));
  }

  if (args.isCoop && /\b(meanwhile|elsewhere|across town|in another part|separate(?:ly)?|far from)\b/i.test(narration)) {
    issues.push(issue('split_camera_opening', 'The co-op opening appears to split the party instead of starting in one shared scene.'));
  }

  for (const character of args.characters) {
    const name = escapeRegExp(character.name);
    const authoredBehavior = new RegExp(`\\b${name}\\b[^.!?]{0,80}\\b(?:says?|asks?|replies|nods?|smiles?|grins?|laughs?|agrees?|decides?|reaches?|touches?|follows?|sets? off|heads? (?:toward|for|to))\\b`, 'i');
    if (authoredBehavior.test(narration)) {
      issues.push(issue('opening_player_authorship', `The opening performs dialogue, emotion, gesture, or a voluntary action for ${character.name} before the player has acted.`));
    }
  }

  if (/\b(weeks pass|days pass|after a long journey|eventually|the next act|final confrontation)\b/i.test(narration)) {
    issues.push(issue('opening_rushes_time', 'The opening fast-forwards instead of playing the first table moment.'));
  }

  const concreteStart = args.worldBible.campaignBrief?.whereToStart || args.worldBible.geography?.[0]?.name;
  if (concreteStart && !narration.toLowerCase().includes(concreteStart.toLowerCase().split(/[—,-]/)[0].trim().slice(0, 18))) {
    issues.push(issue('opening_place_unclear', 'The opening may not anchor the starting place clearly.', 'warn'));
  }

  const actions = [
    ...(args.result.suggestedActions || []),
    ...(args.result.character1SuggestedActions || []),
    ...(args.result.character2SuggestedActions || []),
  ];
  if (sanitizeOpeningActions(actions, args.worldBible, args.characters, args.isCoop).length < 3) {
    issues.push(issue('opening_weak_suggestions', 'The opening suggestions are too generic for a strong first choice.', 'warn'));
  }

  return issues;
}

export function applyOpeningSceneQualityGate<T extends NarrationResult & { character1SuggestedActions?: string[]; character2SuggestedActions?: string[] }>(args: {
  result: T;
  worldBible: WorldBible;
  characters: Character[];
  isCoop: boolean;
}): OpeningQualityResult<T> {
  const issues = assessOpeningSceneQuality(args);
  const result = { ...args.result } as OpeningQualityResult<T>;
  let repaired = false;

  const missing = args.characters.filter(character => !includesName(result.narration, character.name));
  if (missing.length > 0) {
    const missingNames = missing.map(c => c.name).join(' and ');
    result.narration = `${result.narration.trim()}\n\n${missingNames} ${missing.length === 1 ? 'is' : 'are'} present in this same moment too, close enough for the next choice to belong to the whole table.`;
    repaired = true;
  }

  const sharedFallback = fallbackOpeningActions(args.worldBible, args.characters, args.isCoop);
  result.suggestedActions = sanitizeOpeningActions(result.suggestedActions, args.worldBible, args.characters, args.isCoop);
  if (result.suggestedActions.length < 3) {
    result.suggestedActions = sharedFallback;
    repaired = true;
  }
  if (args.isCoop) {
    result.character1SuggestedActions = sanitizeOpeningActions(result.character1SuggestedActions || result.suggestedActions, args.worldBible, args.characters, true);
    result.character2SuggestedActions = sanitizeOpeningActions(result.character2SuggestedActions || result.suggestedActions, args.worldBible, args.characters, true);
  }

  result.openingQualityIssues = issues;
  result.openingQualityRepaired = repaired;
  return result;
}
