const SCENE_MAP: [string[], string][] = [
  [['tavern', 'inn', 'bar', 'ale', 'pub', 'drink', 'hearth', 'fireplace'], 'tavern'],
  [['dungeon', 'corridor', 'passage', 'tunnel', 'hall', 'cell', 'prison', 'labyrinth', 'maze'], 'dungeon-corridor'],
  [['chamber', 'room', 'lair', 'vault', 'pit', 'arena', 'underground'], 'dungeon-chamber'],
  [['clearing', 'meadow', 'glade', 'open field', 'grass'], 'forest-clearing'],
  [['forest', 'wood', 'tree', 'grove', 'thicket', 'path through', 'road'], 'forest-road'],
  [['castle', 'gate', 'fortress', 'stronghold', 'citadel', 'keep', 'wall', 'tower gate'], 'castle-gate'],
  [['throne', 'king', 'queen', 'court', 'royal', 'palace', 'great hall', 'council'], 'throne-room'],
  [['ruin', 'ancient', 'temple', 'shrine', 'crumble', 'stone pillar', 'broken column', 'lost city'], 'ancient-ruins'],
  [['cave', 'cavern', 'grotto', 'burrow', 'hollow', 'entrance'], 'cave-entrance'],
  [['crypt', 'tomb', 'grave', 'mausoleum', 'necropolis', 'cemetery', 'burial', 'undead', 'bone'], 'crypt'],
  [['mountain', 'pass', 'peak', 'cliff', 'ridge', 'highland', 'summit', 'trail', 'alpine'], 'mountain-pass'],
  [['harbor', 'port', 'dock', 'ship', 'sea', 'ocean', 'coast', 'beach', 'pier', 'vessel', 'water'], 'harbor'],
  [['market', 'bazaar', 'square', 'town', 'city', 'village', 'street', 'crowd', 'shop', 'merchant'], 'marketplace'],
  [['battle', 'battlefield', 'war', 'siege', 'army', 'skirmish', 'warcamp', 'front line'], 'battlefield'],
  [['tower', 'wizard', 'mage', 'arcane', 'spire', 'laboratory', 'study', 'library', 'scroll'], 'wizard-tower'],
]

export function matchSceneImage(text: string): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  for (const [keywords, file] of SCENE_MAP) {
    if (keywords.some(k => lower.includes(k))) {
      return `/assets/scenes/${file}.png`
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
