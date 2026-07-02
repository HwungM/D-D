import type { CompanionCharacter, SceneInteractable, WorldState } from '../../../shared/types';

// Companion ambient presence (BitLife-style "the party member you're not
// directly talking to is still here, doing something") — mirrors
// ambientWorldEventSystem.ts's shape on purpose: deterministic code-side
// odds (never an AI decision), an injectable `random` for deterministic
// tests, and a short aside woven into the same resolved micro-action
// reaction. See server/src/routes/game.ts's micro-action route for where
// this is invoked, alongside (not replacing) shouldFireAmbientEvent — both
// checks live on the same fully-resolved, no-roll/no-combat/no-contest
// flavor path.
//
// Why a DIFFERENT tuning than ambient world events: ambient events are rare
// background texture (the world, not the party). Companions are core party
// members who currently go completely silent outside of combat/contests —
// the ask here is specifically to make them read as present at a moderate,
// noticeably-more-common-than-world-events cadence, without turning every
// micro-action into a companion monologue. Tune these two constants to
// adjust cadence — nothing else in this module should need touching:
//   - AMBIENT_EVENT_CHANCE is 4% with an 8-action floor (rare, ~1 in 25-30
//     eligible actions in practice).
//   - COMPANION_PRESENCE_CHANCE is 18% with only a 3-action floor, so a
//     present companion surfaces roughly every 5-9 free-roam actions on
//     average — noticeably present without narrating over the player.
export const COMPANION_PRESENCE_CHANCE = 0.18; // 18% chance per eligible micro-action
export const COMPANION_PRESENCE_MIN_SPACING = 3; // minimum micro-actions between companion beats

// How many free-roam actions have elapsed since the most recent companion
// presence beat. Reuses CompanionCharacter.lastSeenAt (already an existing,
// otherwise-unused-for-logic field — see companionSystem.ts) as the spacing
// anchor instead of adding new WorldState surface area, and naturally resets
// whenever a macro-turn clears freeRoam, exactly like the ambient event
// spacing it mirrors.
function actionsSinceLastCompanionBeat(worldState: WorldState, lastBeatAt: string | undefined): number {
  const freeRoamActions = worldState.freeRoam?.actions || [];
  if (!lastBeatAt) return freeRoamActions.length;
  return freeRoamActions.filter(entry => entry.createdAt > lastBeatAt).length;
}

// A companion counts as "present" with a character only when that character
// hasn't split off alone into their own sub-location — companions stay with
// the shared/main scene rather than following one co-op partner into a
// private nook, mirroring the exact characterSubLocations check that scopes
// WorldState.sceneInteractables per-character (see sceneInteractableSystem.ts
// and the Part A co-op cross-contamination fix). In solo play there's no
// split to worry about, so this is simply "any living companion."
export function companionsPresentWithCharacter(worldState: WorldState, characterId: string): CompanionCharacter[] {
  if (worldState.characterSubLocations?.[characterId]) return [];
  return (worldState.companions || []).filter(c => c.is_alive);
}

function mostRecentBeatAt(companions: CompanionCharacter[]): string | undefined {
  return companions.reduce<string | undefined>((latest, c) => {
    if (!c.lastSeenAt) return latest;
    return !latest || c.lastSeenAt > latest ? c.lastSeenAt : latest;
  }, undefined);
}

// Code-driven odds check for whether a companion presence beat should fire on
// THIS micro-action. Deterministic given `random` — pass a fixed function in
// tests. Callers are responsible for only invoking this on the same
// fully-resolved, non-combat/non-contest flavor path ambient events use.
export function shouldFireCompanionPresence(
  worldState: WorldState,
  characterId: string,
  random: () => number = Math.random,
): boolean {
  const present = companionsPresentWithCharacter(worldState, characterId);
  if (present.length === 0) return false;
  if (actionsSinceLastCompanionBeat(worldState, mostRecentBeatAt(present)) < COMPANION_PRESENCE_MIN_SPACING) return false;
  return random() < COMPANION_PRESENCE_CHANCE;
}

// If multiple companions are present, only ever feature one per beat — no
// piling on.
export function pickPresentCompanion(
  companions: CompanionCharacter[],
  random: () => number = Math.random,
): CompanionCharacter | undefined {
  if (companions.length === 0) return undefined;
  return companions[Math.floor(random() * companions.length)];
}

// Small, in-character texture beats — noticing/muttering/doing something —
// never mechanical, never plot-bearing. Deliberately short (one clause) so
// the woven aside stays a beat, not a scene.
const GENERIC_BEATS = [
  'says, "We should decide what matters here before the trail goes cold"',
  'moves a few paces ahead to check the immediate path, then reports back',
  'hums a half-remembered tune under their breath',
  'says, "Someone here knows more than they are volunteering"',
  'checks the immediate surroundings for anything the group may have overlooked',
  'offers a quiet theory about what the party has seen so far',
  'asks, "What are we missing?" and starts looking for a practical answer',
];

const CLASS_BEATS: Partial<Record<string, string[]>> = {
  Fighter: [
    'runs a whetstone along their blade, more habit than need',
    "sizes up the room's exits like they can't help it",
  ],
  Wizard: [
    'traces a small idle rune in the air, then seems to catch themselves',
    'flips through a dog-eared spellbook without really reading it',
  ],
  Rogue: [
    'is quietly counting the exits',
    "palms something small and shiny before you can quite see what it was",
  ],
  Cleric: [
    'murmurs a short, private prayer',
    'touches their holy symbol without seeming to notice they are doing it',
  ],
  Ranger: [
    'is reading tracks or signs only they can see',
    'goes very still, listening to something past the edge of hearing',
  ],
  Paladin: [
    "stands a little straighter, like they're being watched by someone they want to impress",
    'checks that their oath-sworn gear is squared away',
  ],
  Barbarian: [
    'flexes a fist slowly, working out old tension',
    'eyes a heavy piece of furniture like they are wondering if they could lift it',
  ],
  Bard: [
    'plucks a few idle notes, then stops before it becomes a full song',
    'is composing a line about the day so far, muttering it to get the meter right',
  ],
  Druid: [
    'crouches to look at a weed pushing up through the stone',
    "holds a small animal's attention for a moment, then it's gone",
  ],
  Monk: [
    'breathes in a slow, deliberate four-count',
    'shifts through a stance so casually you almost miss it',
  ],
  Sorcerer: [
    'sparks flicker faintly at their fingertips before they shake them out',
    "seems distracted by a feeling they can't quite place",
  ],
  Warlock: [
    "goes quiet in a way that isn't quite natural, like they're listening to something else",
    'their eyes flash an unnatural color for half a second',
  ],
};

const RACE_BEATS: Partial<Record<string, string[]>> = {
  Human: ['looks a little wistful for a moment, then shakes it off'],
  Elf: ["their ears flick toward a sound you didn't notice"],
  Dwarf: ['grumbles something about the local craftsmanship, admiring or not'],
  Halfling: ['has already pocketed something small and shiny'],
  Gnome: ['is fiddling with some small mechanism pulled from a pocket'],
  'Half-Orc': ['cracks their neck, restless with the stillness'],
  Tiefling: ["their tail flicks once, betraying more nerves than their face does"],
  Dragonborn: ['nostrils flare slightly, testing the air'],
  Aasimar: ['a faint warmth seems to follow their gaze'],
  Goliath: ['rolls a shoulder, too big for the room and aware of it'],
  Tabaxi: ['ears swivel, tracking something small and fast nearby'],
};

const BOND_HIGH_THRESHOLD = 40;
const BOND_LOW_THRESHOLD = -20;
const BOND_HIGH_BEATS = [
  'shoots you a warm, easy look, glad to be here',
  'falls into step near you without seeming to think about it',
];
const BOND_LOW_BEATS = [
  'keeps their distance, arms crossed',
  'seems to be biting back a comment',
];

function beatPoolFor(companion: CompanionCharacter): string[] {
  const pool = [...GENERIC_BEATS, ...(CLASS_BEATS[companion.class] || []), ...(RACE_BEATS[companion.race] || [])];
  if (companion.bondLevel >= BOND_HIGH_THRESHOLD) pool.push(...BOND_HIGH_BEATS);
  else if (companion.bondLevel <= BOND_LOW_THRESHOLD) pool.push(...BOND_LOW_BEATS);
  return pool;
}

export function buildCompanionPresenceBeat(
  companion: CompanionCharacter,
  random: () => number = Math.random,
  interactables: SceneInteractable[] = [],
): string {
  const grounded = interactables.filter(item => item.kind === 'npc' || item.kind === 'object');
  if (grounded.length > 0 && random() < 0.5) {
    const target = grounded[Math.floor(random() * grounded.length)];
    return target.kind === 'npc'
      ? `steps toward ${target.name} and says, "You look like you have something to add"`
      : `examines ${target.name} and says, "This may be worth a closer look"`;
  }
  const pool = beatPoolFor(companion);
  return pool[Math.floor(random() * pool.length)];
}

// Folds a companion presence beat into an existing micro-action reaction as
// a brief aside — NOT a parallel response channel, NOT a new narrated turn.
// Leads with the companion's name (unlike ambient's "(Meanwhile: ...)") so
// the two aside types read as clearly distinct at a glance.
export function weaveCompanionPresenceIntoReaction(reaction: string, companion: CompanionCharacter, beat: string): string {
  return `${reaction.trim()} (${companion.name} ${beat}.)`;
}
