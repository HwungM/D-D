// Each archetype maps to either a single fixed-lighting file, or a { day, night } pair.
// Underground/interior locations (dungeons, crypts, towers) don't shift with time of day.
type SceneEntry = string | { day: string; night: string }

const SCENE_MAP: [string[], SceneEntry][] = [
  // ── INTERIORS (fixed lighting) ─────────────────────────────────────────────
  [['tavern', 'inn', 'bar', 'ale', 'pub', 'drink', 'hearth', 'fireplace', 'common room'], 'tavern'],
  [['sewer', 'gutter', 'drain', 'undercity', 'ratway'], 'sewer'],
  [['dungeon corridor', 'prison corridor', 'passage', 'tunnel', 'labyrinth', 'maze', 'cell block'], 'dungeon-corridor'],
  [['dungeon chamber', 'underground chamber', 'underground room', 'underground lair', 'pit', 'vault'], 'dungeon-chamber'],
  [['crypt', 'tomb', 'mausoleum', 'necropolis', 'burial', 'catacomb'], 'crypt'],
  [['throne room', 'throne', 'royal court', 'great hall', 'king\'s hall', 'council chamber'], 'throne-room'],
  [['wizard tower', 'mage tower', 'arcane laboratory', 'arcane study', 'spire interior', 'spell laboratory', 'scroll room'], 'wizard-tower'],
  [['blacksmith', 'forge', 'smithy', 'anvil', 'foundry'], 'blacksmith-forge'],
  [['library', 'archive', 'scriptorium', 'reading room'], 'library-archives'],
  [['temple interior', 'chapel', 'cathedral interior', 'sanctum', 'altar room', 'inner sanctum'], 'temple-interior'],
  [['prison', 'cell', 'dungeon cell', 'shackles', 'jail', 'captive room'], 'prison-cell'],
  [['feast hall', 'banquet', 'celebration hall', 'dining hall', 'grand feast'], 'feast-hall'],
  [['barracks', 'soldier quarters', 'garrison', 'bunk room'], 'barracks'],
  [['alchemist', 'alchemy lab', 'potion lab', 'experiment room', 'retort', 'reagent'], 'alchemist-lab'],
  [['thieves guild', 'thieves den', 'rogues den', 'underworld den', 'criminal hideout', 'guild hall'], 'thieves-den'],
  [['apothecary', 'herbalist', 'herb shop', 'remedy shop'], 'apothecary'],
  [['gambling den', 'casino', 'dice hall', 'card den'], 'gambling-den'],
  [['arena', 'colosseum', 'gladiatorial', 'fighting pit'], 'arena'],
  [['magic shop', 'curio shop', 'enchanted shop', 'artefact shop', 'trinket shop'], 'magic-shop'],
  [['underdark', 'deep cavern', 'underground lake', 'glowing mushroom', 'bioluminescent cave', 'deep earth'], 'underdark'],
  [['ice cave', 'glacial cave', 'frozen cave', 'ice tunnel', 'ice grotto'], 'ice-cave'],
  [['flooded ruin', 'flooded chamber', 'flooded dungeon', 'underwater ruin', 'submerged room'], 'flooded-ruins'],
  // ── OUTDOOR / NATURAL ─────────────────────────────────────────────────────
  [['swamp', 'bog', 'marsh', 'mire', 'mangrove', 'fen'], { day: 'swamp-day', night: 'swamp-night' }],
  [['desert', 'dune', 'sand', 'oasis', 'wasteland', 'arid'], { day: 'desert-day', night: 'desert-night' }],
  [['snow', 'blizzard', 'tundra', 'winter pass', 'frozen pass', 'icy mountain'], { day: 'snowy-pass-day', night: 'snowy-pass-night' }],
  [['glacier', 'ice field', 'frozen lake', 'frozen wastes'], { day: 'snowy-pass-day', night: 'snowy-pass-night' }],
  [['graveyard', 'cemetery'], { day: 'graveyard-day', night: 'graveyard-night' }],
  [['camp', 'campsite', 'campfire', 'bedroll', 'rest stop', 'bivouac'], { day: 'campsite-day', night: 'campsite-night' }],
  [['bridge', 'chasm', 'ravine', 'gorge', 'span crossing'], { day: 'bridge-day', night: 'bridge-night' }],
  [['clearing', 'glade', 'forest meadow', 'open field'], { day: 'forest-clearing-day', night: 'forest-clearing-night' }],
  [['fey', 'faerie', 'enchanted forest', 'feywild', 'fairy wood', 'arcane wood', 'glowing forest'], { day: 'fey-forest-day', night: 'fey-forest-night' }],
  [['jungle', 'rainforest', 'tropical', 'dense canopy', 'vine jungle'], { day: 'jungle-day', night: 'jungle-night' }],
  [['forest', 'wood', 'tree', 'grove', 'thicket', 'forest road', 'wooded road'], { day: 'forest-road-day', night: 'forest-road-night' }],
  [['castle gate', 'fortress gate', 'keep gate', 'stronghold', 'citadel', 'castle wall', 'battlements'], { day: 'castle-gate-day', night: 'castle-gate-night' }],
  [['ruin', 'ancient temple', 'ancient shrine', 'crumbling stone', 'lost city ruin', 'fallen column', 'overgrown temple'], { day: 'ancient-ruins-day', night: 'ancient-ruins-night' }],
  [['ruined city', 'abandoned city', 'ghost town', 'devastated city', 'dead city'], { day: 'ruined-city-day', night: 'ruined-city-night' }],
  [['cave entrance', 'cavern mouth', 'grotto', 'burrow entrance', 'cave mouth'], 'cave-entrance'],
  [['mountain pass', 'alpine trail', 'cliff trail', 'ridge trail', 'highland trail', 'mountain summit'], { day: 'mountain-pass-day', night: 'mountain-pass-night' }],
  [['coastal cliff', 'sea cliff', 'shoreline cliff', 'cliffside', 'cliff coast'], { day: 'coastal-cliffs-day', night: 'coastal-cliffs-night' }],
  [['plains', 'grassland', 'prairie', 'steppe', 'open plain', 'rolling hills'], { day: 'plains-day', night: 'plains-night' }],
  [['volcano', 'lava', 'magma', 'obsidian', 'volcanic', 'ash field', 'caldera'], { day: 'volcanic-day', night: 'volcanic-night' }],
  [['farm', 'farmland', 'village', 'hamlet', 'crops', 'barn', 'pasture', 'cottage', 'homestead'], { day: 'farmland-day', night: 'farmland-night' }],
  [['canyon', 'mesa', 'badlands', 'red rock', 'gorge walls'], { day: 'canyon-day', night: 'canyon-night' }],
  [['river', 'ford', 'stream', 'brook', 'riverside', 'waterfall', 'riverbank'], { day: 'riverside-day', night: 'riverside-night' }],
  [['watchtower', 'lookout tower', 'guard tower', 'signal tower', 'beacon tower'], { day: 'watchtower-day', night: 'watchtower-night' }],
  [['floating island', 'sky island', 'sky realm', 'airship', 'cloud kingdom'], 'sky-realm'],
  [['ship', 'deck', 'sail', 'rigging', 'voyage', 'vessel', 'aboard'], { day: 'ship-deck-day', night: 'ship-deck-night' }],
  [['harbor', 'port', 'dock', 'pier', 'wharf', 'quay'], { day: 'harbor-day', night: 'harbor-night' }],
  [['sea', 'ocean', 'coast', 'beach', 'shore'], { day: 'harbor-day', night: 'harbor-night' }],
  [['market', 'bazaar', 'square', 'town square', 'city street', 'street market', 'merchant stall'], { day: 'marketplace-day', night: 'marketplace-night' }],
  [['town', 'city', 'settlement'], { day: 'marketplace-day', night: 'marketplace-night' }],
  [['battle', 'battlefield', 'siege', 'warcamp', 'front line', 'war field'], { day: 'battlefield-day', night: 'battlefield-night' }],
]

const FALLBACK_SCENE: SceneEntry = { day: 'marketplace-day', night: 'marketplace-night' }

const NIGHT_KEYWORDS = /\b(night|midnight|dusk|evening|twilight|nightfall|moon|after dark|late hour)\b/
const DAY_KEYWORDS = /\b(day|morning|dawn|noon|midday|afternoon|sunrise|daybreak)\b/

function isNightTime(timeOfDay?: string | null): boolean | null {
  if (!timeOfDay) return null
  const t = timeOfDay.toLowerCase()
  if (NIGHT_KEYWORDS.test(t)) return true
  if (DAY_KEYWORDS.test(t)) return false
  return null
}

export function matchSceneImage(text: string, timeOfDay?: string | null): string {
  const lower = (text || '').toLowerCase()
  const night = isNightTime(timeOfDay) ?? NIGHT_KEYWORDS.test(lower)
  for (const [keywords, entry] of SCENE_MAP) {
    if (keywords.some(k => lower.includes(k))) {
      if (typeof entry === 'string') return `/assets/scenes/${entry}.png`
      return `/assets/scenes/${night ? entry.night : entry.day}.png`
    }
  }
  // Always return something — use marketplace as the default populated town scene
  const fb = FALLBACK_SCENE as { day: string; night: string }
  return `/assets/scenes/${night ? fb.night : fb.day}.png`
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
