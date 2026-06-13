import type { Character, CharacterStats, RollContext, WorldBible, WorldState } from '../../../shared/types';

type StatKey = keyof CharacterStats;

export interface RailRollDirective {
  characterId: string;
  characterName: string;
  stat: StatKey;
  dc: number;
  reason: string;
  dramatic: boolean;
}

export interface ResolvedRailRoll extends RailRollDirective {
  rollResult: number;
  modifier: number;
  rollTotal: number;
  success: boolean;
  isCritSuccess: boolean;
  isCritFail: boolean;
}

export interface ActionRail {
  characterId: string;
  characterName: string;
  action: string;
  pronouns: string;
  intent: string;
  targetLocation?: string;
  mustTransition: boolean;
  roll?: RailRollDirective;
  directives: string[];
}

function titleCaseLocation(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(the|a|an)\s+/i, '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function characterPronouns(character: Character): string {
  if (character.gender === 'male') return 'he/him';
  if (character.gender === 'female') return 'she/her';
  return 'they/them';
}

function knownLocations(worldState: WorldState, worldBible: WorldBible): string[] {
  return [
    ...(worldBible.geography || []).map(g => g.name),
    worldBible.safeHaven?.name,
    ...(worldState.discoveredLocations || []),
    ...(worldState.locationGraph?.nodes || []).map(n => n.name),
    worldState.currentLocation,
  ].filter((x): x is string => !!x);
}

function extractTargetLocation(action: string, worldState: WorldState, worldBible: WorldBible): string | undefined {
  const normalized = action.toLowerCase();
  for (const loc of knownLocations(worldState, worldBible)) {
    if (loc && normalized.includes(loc.toLowerCase())) return loc;
  }

  const patterns = [
    /\bmeet\b.+?\bat\s+(?:the\s+)?([a-z][a-z'\-\s]{2,60})/i,
    /\b(?:go|head|travel|walk|run|return|move)\s+to\s+(?:the\s+)?([a-z][a-z'\-\s]{2,60})/i,
    /\bfollow\b.+?\bto\s+(?:the\s+)?([a-z][a-z'\-\s]{2,60})/i,
    /\benter\s+(?:the\s+)?([a-z][a-z'\-\s]{2,60})/i,
  ];

  for (const pattern of patterns) {
    const match = action.match(pattern);
    if (!match?.[1]) continue;
    const location = match[1]
      .replace(/\b(tonight|now|quietly|carefully|together|alone|please|immediately)\b.*$/i, '')
      .replace(/[.,!?].*$/, '')
      .trim();
    if (location.length >= 3) return titleCaseLocation(location);
  }

  return undefined;
}

function classifyAction(action: string): { intent: string; roll?: Omit<RailRollDirective, 'characterId' | 'characterName'> } {
  const a = action.toLowerCase();

  if (/\b(rest|sleep|short rest|long rest|recover|take a break|hit die)\b/.test(a)) {
    return { intent: 'rest' };
  }
  if (/\b(shakedown|intimidate|threaten|press .*answers|force .*answer|demand answers)\b/.test(a)) {
    return { intent: 'intimidation', roll: { stat: 'cha', dc: 14, reason: 'intimidate or pressure an NPC for answers', dramatic: false } };
  }
  if (/\b(persuade|convince|rally|influence|charm|negotiate|appeal)\b/.test(a)) {
    return { intent: 'persuasion', roll: { stat: 'cha', dc: 13, reason: 'sway someone through force of personality', dramatic: false } };
  }
  if (/\b(magic|aura|arcane|detect|sense|feel|identify)\b/.test(a)) {
    return { intent: 'sense magic', roll: { stat: 'wis', dc: 13, reason: 'read the magical nature of the scene', dramatic: false } };
  }
  if (/\b(sneak|hide|discreet|stealth|shadow|follow)\b/.test(a)) {
    return { intent: 'stealth', roll: { stat: 'dex', dc: 13, reason: 'move or observe without being noticed', dramatic: false } };
  }
  if (/\b(search|investigate|inspect|look for clues|study|examine)\b/.test(a)) {
    return { intent: 'investigation', roll: { stat: 'int', dc: 13, reason: 'find or interpret clues', dramatic: false } };
  }
  if (/\b(attack|strike|shoot|stab|slash|cast .* at|fight)\b/.test(a)) {
    return { intent: 'attack', roll: { stat: 'str', dc: 14, reason: 'resolve an attack or direct hostile move', dramatic: true } };
  }
  if (/\b(use the terrain|use terrain|climb|jump|force|break)\b/.test(a)) {
    return { intent: 'physical approach', roll: { stat: 'str', dc: 12, reason: 'turn the environment into an advantage', dramatic: false } };
  }

  return { intent: 'free action' };
}

export function analyzeActionRail(character: Character, action: string, worldState: WorldState, worldBible: WorldBible): ActionRail {
  const targetLocation = extractTargetLocation(action, worldState, worldBible);
  const classified = classifyAction(action);
  const roll = classified.roll
    ? { characterId: character.id, characterName: character.name, ...classified.roll }
    : undefined;
  const pronouns = characterPronouns(character);
  const directives = [
    `${character.name} uses ${pronouns} pronouns. Never use other pronouns for this character.`,
    `Respond to this exact action: "${action}". Do not substitute a different agenda.`,
  ];

  if (targetLocation) directives.push(`The player explicitly chose to go to ${targetLocation}. The scene must transition there now; do not keep them in the previous location.`);
  if (roll) directives.push(`This action requires a ${roll.stat.toUpperCase()} d20 check vs DC ${roll.dc}: ${roll.reason}.`);

  return {
    characterId: character.id,
    characterName: character.name,
    action,
    pronouns,
    intent: classified.intent,
    targetLocation,
    mustTransition: !!targetLocation,
    roll,
    directives,
  };
}

export function rollRailDirective(roll: RailRollDirective, character: Character): ResolvedRailRoll {
  const statValue = character.stats[roll.stat] ?? 10;
  const modifier = Math.floor((statValue - 10) / 2);
  const rollResult = Math.floor(Math.random() * 20) + 1;
  const rollTotal = rollResult + modifier;
  return {
    ...roll,
    rollResult,
    modifier,
    rollTotal,
    success: rollTotal >= roll.dc,
    isCritSuccess: rollResult === 20,
    isCritFail: rollResult === 1,
  };
}

export function railToRollContext(rail: ActionRail): RollContext | undefined {
  if (!rail.roll) return undefined;
  return {
    stat: rail.roll.stat,
    dc: rail.roll.dc,
    diceType: 'd20',
    description: rail.roll.reason,
    successDescription: `${rail.characterName}'s approach finds purchase.`,
    failDescription: `${rail.characterName}'s approach creates a complication instead of stopping the story.`,
    critSuccessDescription: 'The moment opens wider than expected.',
    critFailDescription: 'The situation turns sharply against the party.',
    isDramatic: rail.roll.dramatic,
    modifier: 0,
  };
}

export function buildRailWorldStatePatch(rails: ActionRail[], worldState: WorldState): Partial<WorldState> {
  const targetLocation = [...rails].reverse().find(r => r.targetLocation)?.targetLocation;
  const patch: Partial<WorldState> = {
    characterLastSeen: {
      ...(worldState.characterLastSeen || {}),
      ...Object.fromEntries(rails.map(r => [r.characterId, new Date().toISOString()])),
    },
  };

  if (targetLocation) {
    patch.currentLocation = targetLocation;
    patch.activeNPC = null;
    patch.discoveredLocations = Array.from(new Set([...(worldState.discoveredLocations || []), targetLocation]));
    patch.characterLocations = {
      ...(worldState.characterLocations || {}),
      ...Object.fromEntries(rails.map(r => [r.characterId, targetLocation])),
    };
    patch.sceneState = {
      purpose: 'travel',
      exchangeCount: 0,
      stalledCount: 0,
      pacingMode: 'exploration',
      cluesThisScene: 0,
    };
  }

  return patch;
}

export function formatRailBlock(rails: ActionRail[], rolls: ResolvedRailRoll[] = []): string {
  const rollLines = rolls.length
    ? `\nAUTHORITATIVE ROLLS ALREADY MADE:\n${rolls.map(r => `- ${r.characterName}: d20 ${r.rollResult} ${r.modifier >= 0 ? '+' : ''}${r.modifier} = ${r.rollTotal} vs DC ${r.dc} (${r.success ? 'success' : 'failure'}) for ${r.reason}`).join('\n')}`
    : '';

  return `STORY RAILS - HARD CONSTRAINTS:
${rails.flatMap(r => r.directives.map(d => `- ${d}`)).join('\n')}
- Do not repeat already-delivered vague clues. If the players ask again, either reveal a concrete new detail, call for a roll, or move the scene.
- If a rail says the location changed, open the narration at that new location and update worldStateChanges.currentLocation accordingly.
- If authoritative rolls are provided, narrate the consequences of those rolls. Do not ask for another roll for the same action.${rollLines}`;
}
