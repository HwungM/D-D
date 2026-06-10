// Each archetype maps to either a single fixed-lighting file, or a { day, night } pair.
// Underground/interior locations (dungeons, crypts, towers) don't shift with time of day.
type SceneEntry = string | { day: string; night: string }

const SCENE_MAP: [string[], SceneEntry][] = [
  // ── INTERIORS (fixed lighting) ─────────────────────────────────────────────
  [['tavern', 'inn', 'bar', 'ale', 'pub', 'drink', 'hearth', 'fireplace', 'common room', 'inn upstairs', 'upstairs corridor'], 'tavern'],
  [['sewer', 'gutter', 'drain', 'undercity', 'ratway'], 'sewer'],
  [['dungeon corridor', 'prison corridor', 'passage', 'tunnel', 'labyrinth', 'maze', 'cell block'], 'dungeon-corridor'],
  [['dungeon chamber', 'underground chamber', 'underground room', 'underground lair', 'pit', 'vault'], 'dungeon-chamber'],
  [['catacomb', 'crypt', 'tomb', 'mausoleum', 'necropolis', 'burial', 'ossuary'], 'catacombs'],
  [['corrupted throne', 'dark throne', 'defiled throne', 'tainted court', 'black thorns', 'ichor'], 'throne-room-corrupted'],
  [['throne room', 'throne', 'great hall', 'king\'s hall'], 'throne-room'],
  [['antechamber', 'waiting hall', 'petitioner', 'court waiting', 'royal corridor'], 'throne-antechamber'],
  [['war room', 'battle map', 'strategy table', 'command room', 'war table', 'tactical room'], 'war-room'],
  [['council chamber', 'council hall', 'advisory chamber', 'senate chamber', 'elder council'], 'council-chamber'],
  [['wizard tower interior', 'mage tower interior', 'arcane laboratory', 'arcane study', 'spell laboratory', 'scroll room', 'spire interior'], 'wizard-tower'],
  [['observatory', 'orrery', 'astronomy', 'star chart', 'celestial dome', 'telescope'], 'observatory'],
  [['treasury', 'vault', 'treasure room', 'gold room', 'coin vault', 'strongroom'], 'treasury'],
  [['torture chamber', 'rack', 'iron maiden', 'interrogation room', 'inquisition chamber'], 'torture-chamber'],
  [['portal chamber', 'dimensional gate', 'teleportation circle', 'planar gate', 'summoning portal', 'gate room'], 'portal-chamber'],
  [['underground temple', 'sunken temple', 'hidden temple', 'idol chamber', 'forbidden shrine', 'cult sanctum'], 'underground-temple'],
  [['mine', 'mine shaft', 'ore cart', 'mining tunnel', 'excavation', 'pit mine'], 'mine-shaft'],
  [['bell tower', 'belfry', 'church tower', 'campanile'], 'bell-tower'],
  [['dressing room', 'backstage', 'theatre', 'theater', 'stage', 'performers'], 'dressing-room'],
  [['royal chamber', 'bedchamber', 'royal bedroom', 'private chamber', 'royal quarters'], 'royal-bedchamber'],
  [['scriptorium', 'monastery study', 'copying room', 'manuscript room'], 'scriptorium'],
  [['cathedral ruin', 'ruined cathedral', 'collapsed church', 'ruined chapel'], 'cathedral-ruin'],
  [['colosseum underground', 'gladiator staging', 'arena cells', 'fighter cages', 'arena underground'], 'colosseum-underground'],
  [['thieves vault', 'thieves guild', 'thieves den', 'rogues den', 'underworld den', 'criminal hideout', 'guild hall'], 'thieves-vault'],
  [['shipwreck hold', 'sunken ship', 'flooded hold', 'wrecked hull', 'ship interior'], 'shipwreck-hold'],
  [['greenhouse', 'glasshouse', 'botanical', 'overgrown garden', 'plant room'], 'greenhouse'],
  [['clockwork', 'artificer workshop', 'workshop', 'inventor workshop', 'gear room', 'tinker workshop'], 'clockwork-workshop'],
  [['necromancer', 'necromancer sanctum', 'bone ritual', 'dark ritual', 'undead laboratory'], 'necromancer-sanctum'],
  [['private study', 'scholar study', 'private library', 'personal study', 'hidden study'], 'study-private'],
  [['blacksmith', 'forge', 'smithy', 'anvil', 'foundry'], 'blacksmith-forge'],
  [['library', 'archive', 'reading room', 'grand library'], 'library-archives'],
  [['temple interior', 'chapel', 'cathedral interior', 'sanctum', 'altar room', 'inner sanctum'], 'temple-interior'],
  [['prison', 'cell', 'dungeon cell', 'shackles', 'jail', 'captive room'], 'prison-cell'],
  [['feast hall', 'banquet', 'celebration hall', 'dining hall', 'grand feast'], 'feast-hall'],
  [['barracks', 'soldier quarters', 'garrison', 'bunk room'], 'barracks'],
  [['alchemist', 'alchemy lab', 'potion lab', 'experiment room', 'retort', 'reagent'], 'alchemist-lab'],
  [['apothecary', 'herbalist', 'herb shop', 'remedy shop'], 'apothecary'],
  [['gambling den', 'casino', 'dice hall', 'card den'], 'gambling-den'],
  [['arena', 'colosseum', 'gladiatorial', 'fighting pit'], 'arena'],
  [['magic shop', 'curio shop', 'enchanted shop', 'artefact shop', 'trinket shop'], 'magic-shop'],
  [['oracle', 'oracle cave', 'prophecy pool', 'vision cave', 'seer cave'], 'oracle-cave'],
  [['underdark', 'deep cavern', 'underground lake', 'glowing mushroom', 'bioluminescent cave', 'deep earth'], 'underdark'],
  [['underground city', 'drow city', 'subterranean city', 'cavern city', 'underground settlement'], 'underground-city-day'],
  [['underground river', 'subterranean river', 'cave river', 'dark river', 'underground waterway'], 'underground-river-day'],
  [['dwarven hall', 'dwarven city', 'dwarven forge', 'khaz', 'hold interior', 'deep hold'], 'dwarven-hall-day'],
  [['feywild court', 'fey court', 'faerie court', 'seelie court', 'unseelie court', 'wild hunt hall'], 'feywild-court'],
  [['ice cave', 'glacial cave', 'frozen cave', 'ice tunnel', 'ice grotto'], 'ice-cave'],
  [['flooded ruin', 'flooded chamber', 'flooded dungeon', 'submerged room'], 'flooded-ruins'],
  // ── OUTDOOR / NATURAL ─────────────────────────────────────────────────────
  [['standing stone', 'stone circle', 'monolith', 'ancient circle', 'henge', 'menhir'], { day: 'standing-stones-day', night: 'standing-stones-night' }],
  [['druid circle', 'druid grove', 'sacred grove', 'elder grove', 'ritual grove'], { day: 'druid-circle-day', night: 'druid-circle-night' }],
  [['forest shrine', 'woodland shrine', 'nature shrine', 'tree shrine', 'sacred tree'], { day: 'forest-shrine-day', night: 'forest-shrine-night' }],
  [['coastal village', 'fishing village', 'seaside village', 'coastal hamlet', 'fishing hamlet'], { day: 'coastal-village-day', night: 'coastal-village-night' }],
  [['haunted manor', 'abandoned manor', 'manor house', 'estate', 'cursed mansion', 'old manor'], { day: 'haunted-manor-day', night: 'haunted-manor-night' }],
  [['crossroads', 'four-way', 'road junction', 'signpost', 'gibbet', 'crossroad'], { day: 'crossroads-day', night: 'crossroads-night' }],
  [['lighthouse', 'light tower', 'sea beacon', 'coastal light'], { day: 'lighthouse-day', night: 'lighthouse-night' }],
  [['glacier field', 'ice plain', 'glacial plain', 'frozen plains', 'ice sheet'], { day: 'glacier-field-day', night: 'glacier-field-night' }],
  [['frozen tundra', 'permafrost', 'arctic plain', 'frozen steppe', 'ice tundra'], { day: 'frozen-tundra-day', night: 'frozen-tundra-night' }],
  [['tundra village', 'arctic village', 'ice village', 'frozen village', 'northern village'], { day: 'tundra-village-day', night: 'tundra-village-night' }],
  [['snowy village', 'mountain village', 'winter village', 'snow-covered village', 'highland village'], { day: 'snowy-village-day', night: 'snowy-village-night' }],
  [['moonlit lake', 'forest lake', 'lake', 'still water', 'pond', 'lakeside'], { day: 'mountain-lake-day', night: 'moonlit-lake-night' }],
  [['mountain lake', 'alpine lake', 'crystal lake', 'highland lake'], { day: 'mountain-lake-day', night: 'mountain-lake-night' }],
  [['windmill', 'mill', 'grain mill', 'water mill', 'millstone'], { day: 'windmill-day', night: 'windmill-night' }],
  [['cliffside monastery', 'mountain monastery', 'cliff monastery', 'hanging monastery', 'temple monastery'], { day: 'cliffside-monastery-day', night: 'cliffside-monastery-night' }],
  [['wizard tower exterior', 'mage tower exterior', 'spire exterior', 'arcane tower', 'sorcerer tower'], { day: 'wizard-tower-exterior-day', night: 'wizard-tower-exterior-night' }],
  [['dark cathedral', 'black cathedral', 'gothic cathedral', 'cathedral exterior', 'cathedral', 'unholy cathedral'], { day: 'dark-cathedral-day', night: 'dark-cathedral-night' }],
  [['elven city', 'elven forest city', 'arboreal city', 'high elf city', 'wood elf city', 'sylvan city'], { day: 'elven-city-day', night: 'elven-city-night' }],
  [['cursed forest', 'dead forest', 'blighted forest', 'dark wood', 'haunted wood', 'twisted forest'], { day: 'cursed-forest-day', night: 'cursed-forest-night' }],
  [['pirate cove', 'hidden cove', 'smuggler cove', 'pirate bay', 'hidden bay', 'outlaw cove'], { day: 'pirate-cove-day', night: 'pirate-cove-night' }],
  [['mountain fortress', 'cliffside fortress', 'mountain keep', 'high fortress', 'alpine fortress', 'mountain citadel'], { day: 'mountain-fortress-day', night: 'mountain-fortress-night' }],
  [['ancient library ruin', 'ruined library', 'library ruin', 'great library ruin'], { day: 'ancient-library-ruin-day', night: 'ancient-library-ruin-night' }],
  [['dockside alley', 'port alley', 'harbour alley', 'wharf alley', 'dock alley', 'back alley'], { day: 'dockside-alley-day', night: 'dockside-alley-night' }],
  [['market alley', 'covered market', 'spice alley', 'souk', 'bazaar alley', 'merchant alley'], { day: 'market-alley-day', night: 'market-alley-night' }],
  [['desert ruins', 'sand ruins', 'buried ruins', 'desert temple'], { day: 'desert-ruins-day', night: 'desert-ruins-night' }],
  [['vampire castle', 'dark castle', 'cursed castle', 'blood castle', 'count\'s castle'], { day: 'vampire-castle-day', night: 'vampire-castle-night' }],
  [['astral', 'astral plane', 'silver void', 'astral sea', 'outer plane'], 'astral-plane'],
  [['shadow realm', 'shadowfell', 'plane of shadow', 'dark mirror', 'shadow plane'], 'shadow-realm'],
  [['plane of fire', 'elemental fire', 'fire plane', 'inferno realm', 'efreeti realm'], 'elemental-plane-fire'],
  [['plane of water', 'elemental water', 'water plane', 'sea eternal', 'marid realm'], 'elemental-plane-water'],
  [['abyss', 'abyssal', 'demon plane', 'bottomless pit', 'abyssal layer', 'chaos realm'], 'abyss'],
  [['nine hells', 'baator', 'hell', 'infernal plane', 'devil plane', 'hellscape'], 'nine-hells'],
  [['celestial realm', 'heavens', 'divine plane', 'mount celestia', 'elysium', 'paradise realm'], 'celestial-realm'],
  [['sunken city', 'underwater city', 'drowned city', 'city beneath the sea', 'submerged city'], 'sunken-city'],
  [['swamp', 'bog', 'marsh', 'mire', 'mangrove', 'fen'], { day: 'swamp-day', night: 'swamp-night' }],
  [['desert', 'dune', 'sand', 'oasis', 'wasteland', 'arid'], { day: 'desert-day', night: 'desert-night' }],
  [['snow', 'blizzard', 'winter pass', 'frozen pass', 'icy mountain'], { day: 'snowy-pass-day', night: 'snowy-pass-night' }],
  [['tundra', 'frozen wastes', 'ice field', 'ice plain', 'frozen plain'], { day: 'frozen-tundra-day', night: 'frozen-tundra-night' }],
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
