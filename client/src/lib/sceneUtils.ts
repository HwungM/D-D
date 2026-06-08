// Each archetype maps to either a single fixed-lighting file, or a { day, night } pair.
// Underground/interior locations (dungeons, crypts, towers) don't shift with time of day.
type SceneEntry = string | { day: string; night: string }

const SCENE_MAP: [string[], SceneEntry][] = [
  [['tavern', 'inn', 'bar', 'ale', 'pub', 'drink', 'hearth', 'fireplace'], 'tavern'],
  [['sewer', 'gutter', 'drain', 'undercity'], 'sewer'],
  [['dungeon', 'corridor', 'passage', 'tunnel', 'hall', 'cell', 'prison', 'labyrinth', 'maze'], 'dungeon-corridor'],
  [['chamber', 'room', 'lair', 'vault', 'pit', 'arena', 'underground'], 'dungeon-chamber'],
  [['swamp', 'bog', 'marsh', 'mire', 'mangrove', 'fen'], { day: 'swamp-day', night: 'swamp-night' }],
  [['desert', 'dune', 'sand', 'oasis', 'wasteland', 'arid'], { day: 'desert-day', night: 'desert-night' }],
  [['snow', 'blizzard', 'frozen', 'glacier', 'ice', 'tundra', 'winter'], { day: 'snowy-pass-day', night: 'snowy-pass-night' }],
  [['graveyard', 'cemetery'], { day: 'graveyard-day', night: 'graveyard-night' }],
  [['crypt', 'tomb', 'mausoleum', 'necropolis', 'burial', 'undead', 'bone'], 'crypt'],
  [['camp', 'campsite', 'campfire', 'bedroll', 'rest stop'], 'campsite'],
  [['bridge', 'chasm', 'ravine', 'gorge', 'span'], { day: 'bridge-day', night: 'bridge-night' }],
  [['clearing', 'meadow', 'glade', 'open field', 'grass'], { day: 'forest-clearing-day', night: 'forest-clearing-night' }],
  [['forest', 'wood', 'tree', 'grove', 'thicket', 'path through', 'road'], { day: 'forest-road-day', night: 'forest-road-night' }],
  [['castle', 'gate', 'fortress', 'stronghold', 'citadel', 'keep', 'wall', 'tower gate'], { day: 'castle-gate-day', night: 'castle-gate-night' }],
  [['throne', 'king', 'queen', 'court', 'royal', 'palace', 'great hall', 'council'], 'throne-room'],
  [['ruin', 'ancient', 'temple', 'shrine', 'crumble', 'stone pillar', 'broken column', 'lost city'], { day: 'ancient-ruins-day', night: 'ancient-ruins-night' }],
  [['cave', 'cavern', 'grotto', 'burrow', 'hollow', 'entrance'], 'cave-entrance'],
  [['mountain', 'pass', 'peak', 'cliff', 'ridge', 'highland', 'summit', 'trail', 'alpine'], { day: 'mountain-pass-day', night: 'mountain-pass-night' }],
  [['ship', 'deck', 'sail', 'rigging', 'voyage', 'vessel'], { day: 'ship-deck-day', night: 'ship-deck-night' }],
  [['harbor', 'port', 'dock', 'sea', 'ocean', 'coast', 'beach', 'pier', 'water'], { day: 'harbor-day', night: 'harbor-night' }],
  [['market', 'bazaar', 'square', 'town', 'city', 'village', 'street', 'crowd', 'shop', 'merchant'], { day: 'marketplace-day', night: 'marketplace-night' }],
  [['battle', 'battlefield', 'war', 'siege', 'army', 'skirmish', 'warcamp', 'front line'], { day: 'battlefield-day', night: 'battlefield-night' }],
  [['tower', 'wizard', 'mage', 'arcane', 'spire', 'laboratory', 'study', 'library', 'scroll'], 'wizard-tower'],
]

const NIGHT_KEYWORDS = /\b(night|midnight|dusk|evening|twilight|nightfall|moon|after dark|late hour)\b/
const DAY_KEYWORDS = /\b(day|morning|dawn|noon|midday|afternoon|sunrise|daybreak)\b/

function isNightTime(timeOfDay?: string | null): boolean | null {
  if (!timeOfDay) return null
  const t = timeOfDay.toLowerCase()
  if (NIGHT_KEYWORDS.test(t)) return true
  if (DAY_KEYWORDS.test(t)) return false
  return null
}

export function matchSceneImage(text: string, timeOfDay?: string | null): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  for (const [keywords, entry] of SCENE_MAP) {
    if (keywords.some(k => lower.includes(k))) {
      if (typeof entry === 'string') return `/assets/scenes/${entry}.png`
      const night = isNightTime(timeOfDay) ?? NIGHT_KEYWORDS.test(lower)
      return `/assets/scenes/${night ? entry.night : entry.day}.png`
    }
  }
  return null
}

export function inferMood(text: string): 'neutral' | 'amused' | 'serious' | 'menacing' | 'surprised' | 'pleased' {
  const t = text.toLowerCase()
  if (/\b(laugh|chuckle|grin|jest|wit|humor|smirk|teas|jok|amused)\b/.test(t)) return 'amused'
  if (/\b(triumph|victory|succeed|bravely|honor|glory|heroic|proud|well done|impressed)\b/.test(t)) return 'pleased'
  if (/\b(sudden|burst|startl|shock|gasp|interrupt|unexpected|abrupt)\b/.test(t)) return 'surprised'
  if (/\b(growl|snarl|menac|dread|doom|ominous|shadow|darkness falls|tremble|fear)\b/.test(t)) return 'menacing'
  if (/\b(combat|attack|fight|battle|strike|blood|clash|defend|parry|wound|danger)\b/.test(t)) return 'serious'
  return 'neutral'
}
