export interface ItemProperty {
  damageRoll?: string;
  damageType?: string;
  acBonus?: number;
  effect?: string;
  consumable?: boolean;
  durability?: 'indestructible' | 'sturdy' | 'normal' | 'fragile';
  breakChance?: number;
  chargesMax?: number;
  weight?: 'light' | 'medium' | 'heavy';
  rarity?: 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
  tags?: string[];
}

export const ITEM_PROPERTIES: Record<string, ItemProperty> = {
  // WEAPONS
  'sword': { damageRoll: '1d8', damageType: 'slashing', durability: 'normal', breakChance: 5, weight: 'medium', rarity: 'common', tags: ['one-handed'] },
  'longsword': { damageRoll: '1d8', damageType: 'slashing', durability: 'normal', breakChance: 5, weight: 'medium', rarity: 'common', tags: ['one-handed', 'versatile'] },
  'sword-iron': { damageRoll: '1d8', damageType: 'slashing', durability: 'normal', breakChance: 8, weight: 'medium', rarity: 'common' },
  'sword-steel': { damageRoll: '1d8', damageType: 'slashing', durability: 'sturdy', breakChance: 3, weight: 'medium', rarity: 'common' },
  'sword-silver': { damageRoll: '1d8', damageType: 'slashing', effect: 'Deals double damage to undead and lycanthropes', durability: 'normal', breakChance: 6, weight: 'medium', rarity: 'uncommon', tags: ['silver'] },
  'sword-enchanted': { damageRoll: '1d8+2', damageType: 'slashing', effect: 'Glows faintly near evil. +2 to attack rolls', durability: 'sturdy', weight: 'medium', rarity: 'rare', tags: ['magical', '+2'] },
  'sword-rare': { damageRoll: '1d10', damageType: 'slashing', effect: 'Blade holds an edge that never dulls', durability: 'sturdy', weight: 'medium', rarity: 'rare', tags: ['magical'] },
  'sword-legendary': { damageRoll: '2d6+3', damageType: 'slashing', effect: 'Ancient blade — enemies must save DC 14 or be frightened on hit', durability: 'indestructible', weight: 'medium', rarity: 'legendary', tags: ['magical', 'legendary'] },
  'sword-cursed': { damageRoll: '1d10', damageType: 'slashing', effect: 'Cannot be dropped willingly. +3 damage but -2 to all saving throws', durability: 'sturdy', weight: 'medium', rarity: 'cursed', tags: ['cursed', 'magical'] },
  'dagger': { damageRoll: '1d4', damageType: 'piercing', durability: 'normal', breakChance: 10, weight: 'light', rarity: 'common', tags: ['finesse', 'thrown'] },
  'dagger-common': { damageRoll: '1d4', damageType: 'piercing', durability: 'normal', breakChance: 10, weight: 'light', rarity: 'common', tags: ['finesse', 'thrown'] },
  'dagger-enchanted': { damageRoll: '1d4+1', damageType: 'piercing', effect: '+1 to attacks. Returns to hand when thrown', durability: 'sturdy', weight: 'light', rarity: 'rare', tags: ['finesse', 'thrown', 'magical', '+1'] },
  'dagger-poison': { damageRoll: '1d4', damageType: 'piercing', effect: 'Blade coated in poison. Target must save DC 12 or take 1d6 poison damage', durability: 'normal', breakChance: 8, weight: 'light', rarity: 'uncommon', tags: ['finesse', 'poison'] },
  'axe': { damageRoll: '1d8', damageType: 'slashing', durability: 'sturdy', breakChance: 4, weight: 'medium', rarity: 'common', tags: ['thrown'] },
  'axe-hand': { damageRoll: '1d6', damageType: 'slashing', durability: 'normal', breakChance: 5, weight: 'light', rarity: 'common', tags: ['thrown'] },
  'axe-battle': { damageRoll: '1d8', damageType: 'slashing', durability: 'sturdy', breakChance: 3, weight: 'medium', rarity: 'common', tags: ['versatile'] },
  'axe-great': { damageRoll: '1d12', damageType: 'slashing', durability: 'sturdy', breakChance: 4, weight: 'heavy', rarity: 'common', tags: ['two-handed', 'heavy'] },
  'warhammer': { damageRoll: '1d8', damageType: 'bludgeoning', durability: 'sturdy', breakChance: 2, weight: 'medium', rarity: 'common', tags: ['versatile'] },
  'halberd': { damageRoll: '1d10', damageType: 'slashing', durability: 'normal', breakChance: 6, weight: 'heavy', rarity: 'common', tags: ['two-handed', 'reach'] },
  'mace': { damageRoll: '1d6', damageType: 'bludgeoning', durability: 'sturdy', breakChance: 3, weight: 'medium', rarity: 'common' },
  'spear': { damageRoll: '1d6', damageType: 'piercing', durability: 'normal', breakChance: 12, weight: 'medium', rarity: 'common', tags: ['thrown', 'versatile', 'reach'] },
  'bow': { damageRoll: '1d6', damageType: 'piercing', durability: 'fragile', breakChance: 15, weight: 'light', rarity: 'common', tags: ['two-handed', 'ranged', 'ammunition'] },
  'bow-short': { damageRoll: '1d6', damageType: 'piercing', durability: 'fragile', breakChance: 15, weight: 'light', rarity: 'common', tags: ['ranged', 'ammunition'] },
  'bow-long': { damageRoll: '1d8', damageType: 'piercing', durability: 'fragile', breakChance: 12, weight: 'medium', rarity: 'common', tags: ['two-handed', 'ranged', 'heavy', 'ammunition'] },
  'bow-enchanted': { damageRoll: '1d8+1', damageType: 'piercing', effect: 'Arrows never miss by more than an inch. +1 to attack rolls', durability: 'normal', weight: 'medium', rarity: 'rare', tags: ['ranged', 'magical', '+1'] },
  'staff-wooden': { damageRoll: '1d6', damageType: 'bludgeoning', durability: 'fragile', breakChance: 18, weight: 'medium', rarity: 'common', tags: ['two-handed', 'versatile'] },
  'staff-arcane': { damageRoll: '1d6', damageType: 'bludgeoning', effect: 'Grants +1 to spell attack rolls and spell save DC. Has 5 charges for minor spells', chargesMax: 5, durability: 'normal', weight: 'medium', rarity: 'uncommon', tags: ['magical', 'arcane focus'] },
  'staff-elemental': { damageRoll: '1d6+1d6', damageType: 'bludgeoning+elemental', effect: 'Crackles with elemental energy. On hit, deal extra 1d6 of random element (fire/cold/lightning)', durability: 'normal', weight: 'medium', rarity: 'rare', tags: ['magical', 'arcane focus'] },
  'wand-basic': { damageRoll: '1d4', damageType: 'force', effect: '3 charges. Each charge fires a magic missile (1d4+1 force damage, never misses)', chargesMax: 3, consumable: false, durability: 'fragile', weight: 'light', rarity: 'uncommon', tags: ['magical', 'arcane focus'] },
  'wand-enchanted': { damageRoll: '2d6', damageType: 'force', effect: '7 charges. Can cast fireball (3 charges), lightning bolt (3 charges), or magic missile (1 charge)', chargesMax: 7, durability: 'normal', weight: 'light', rarity: 'rare', tags: ['magical'] },

  // ARMOR
  'armor-leather': { acBonus: 2, effect: 'AC 11 + DEX modifier', durability: 'fragile', breakChance: 12, weight: 'light', rarity: 'common', tags: ['light armor'] },
  'armor-studded': { acBonus: 3, effect: 'AC 12 + DEX modifier', durability: 'normal', breakChance: 8, weight: 'light', rarity: 'common', tags: ['light armor'] },
  'armor-chain': { acBonus: 4, effect: 'AC 16. Disadvantage on stealth checks', durability: 'sturdy', breakChance: 4, weight: 'heavy', rarity: 'common', tags: ['medium armor', 'noisy'] },
  'armor-breastplate': { acBonus: 4, effect: 'AC 14 + DEX mod (max 2)', durability: 'sturdy', breakChance: 3, weight: 'medium', rarity: 'common', tags: ['medium armor'] },
  'armor-plate': { acBonus: 6, effect: 'AC 18. Disadvantage on stealth. Requires STR 15+', durability: 'indestructible', weight: 'heavy', rarity: 'uncommon', tags: ['heavy armor', 'noisy'] },
  'armor-dark-plate': { acBonus: 6, effect: 'AC 18. No stealth disadvantage. Appears to absorb light', durability: 'indestructible', weight: 'heavy', rarity: 'rare', tags: ['heavy armor', 'magical'] },

  // SHIELDS
  'shield': { acBonus: 2, durability: 'normal', breakChance: 8, weight: 'medium', rarity: 'common', tags: ['shield'] },
  'shield-wooden': { acBonus: 2, durability: 'fragile', breakChance: 18, weight: 'light', rarity: 'common', tags: ['shield'] },
  'shield-iron': { acBonus: 2, durability: 'sturdy', breakChance: 5, weight: 'heavy', rarity: 'common', tags: ['shield'] },
  'shield-enchanted': { acBonus: 3, effect: '+3 AC. Once per day, can negate one projectile attack entirely', durability: 'indestructible', weight: 'medium', rarity: 'rare', tags: ['shield', 'magical'] },

  // POTIONS (consumable)
  'potion-health': { effect: 'Restore 2d4+2 HP', consumable: true, weight: 'light', rarity: 'common', tags: ['healing'] },
  'potion-health-small': { effect: 'Restore 1d4+1 HP', consumable: true, weight: 'light', rarity: 'common', tags: ['healing'] },
  'potion-health-medium': { effect: 'Restore 2d4+4 HP', consumable: true, weight: 'light', rarity: 'uncommon', tags: ['healing'] },
  'potion-health-large': { effect: 'Restore 4d4+8 HP (Superior Healing)', consumable: true, weight: 'light', rarity: 'rare', tags: ['healing'] },
  'potion-mana': { effect: 'Restore one expended spell slot of 3rd level or lower', consumable: true, weight: 'light', rarity: 'uncommon', tags: ['magical'] },
  'potion-mana-small': { effect: 'Restore one expended cantrip or 1st level slot', consumable: true, weight: 'light', rarity: 'common', tags: ['magical'] },
  'potion-mana-medium': { effect: 'Restore one expended spell slot of 4th level or lower', consumable: true, weight: 'light', rarity: 'rare', tags: ['magical'] },
  'potion-mana-large': { effect: 'Restore all expended spell slots of 5th level or lower', consumable: true, weight: 'light', rarity: 'rare', tags: ['magical'] },
  'potion-invisibility': { effect: 'Grants invisibility for 1 hour or until you attack/cast', consumable: true, weight: 'light', rarity: 'rare', tags: ['magical', 'stealth'] },
  'potion-speed': { effect: 'Double movement speed, +2 AC, advantage on DEX saves for 1 minute', consumable: true, weight: 'light', rarity: 'uncommon', tags: ['magical', 'haste'] },
  'potion-strength': { effect: 'STR becomes 21 for 1 hour', consumable: true, weight: 'light', rarity: 'rare', tags: ['magical', 'strength'] },
  'potion-poison': { effect: 'A poison — dealing damage is its purpose. Applied to a blade or slipped into a drink. 2d4 poison damage, save DC 11 or poisoned for 1 hour', consumable: true, weight: 'light', rarity: 'uncommon', tags: ['poison', 'dangerous'] },

  // ACCESSORIES
  'cloak': { effect: 'Keeps you warm and dry. Minor protection from weather', durability: 'fragile', weight: 'light', rarity: 'common' },
  'cloak-common': { effect: 'Keeps you warm. No mechanical bonus', durability: 'fragile', breakChance: 20, weight: 'light', rarity: 'common' },
  'cloak-elvish': { effect: 'Advantage on stealth checks in forests and natural terrain', durability: 'normal', weight: 'light', rarity: 'uncommon', tags: ['magical', 'stealth'] },
  'cloak-shadow': { effect: 'Advantage on all stealth checks. You appear to step through shadows', durability: 'normal', weight: 'light', rarity: 'rare', tags: ['magical', 'stealth'] },
  'boots': { effect: 'Standard footwear', durability: 'fragile', breakChance: 15, weight: 'light', rarity: 'common' },
  'boots-leather': { effect: 'Soft soled — no noise penalty in quiet areas', durability: 'normal', breakChance: 10, weight: 'light', rarity: 'common' },
  'boots-enchanted': { effect: 'Advantage on DEX (Acrobatics) checks. Can walk silently on any surface', durability: 'sturdy', weight: 'light', rarity: 'rare', tags: ['magical'] },
  'ring': { effect: 'A ring of unknown provenance. May have hidden magic', durability: 'indestructible', weight: 'light', rarity: 'common' },
  'ring-iron': { effect: 'A plain iron ring. No magical properties', durability: 'indestructible', weight: 'light', rarity: 'common' },
  'ring-gold': { effect: 'Valuable but mundane. Worth 25-50 gold', durability: 'indestructible', weight: 'light', rarity: 'common' },
  'ring-enchanted': { effect: '+1 to all saving throws. Faint magical aura', durability: 'indestructible', weight: 'light', rarity: 'rare', tags: ['magical', '+1'] },
  'amulet': { effect: 'An amulet of unknown purpose', durability: 'sturdy', weight: 'light', rarity: 'common' },
  'amulet-silver': { effect: 'Silver amulet. Wards against minor curses and evil spirits', durability: 'sturdy', weight: 'light', rarity: 'uncommon', tags: ['silver', 'protection'] },
  'amulet-bone': { effect: "Made from something's bone. Has a faint necrotic aura. Unsettling to the living", durability: 'fragile', weight: 'light', rarity: 'uncommon', tags: ['necrotic', 'dark'] },
  'amulet-enchanted': { effect: '+2 to death saving throws. When you drop to 0 HP, you stabilize automatically once per day', durability: 'sturdy', weight: 'light', rarity: 'rare', tags: ['magical', 'protection'] },
  'helmet-iron': { acBonus: 1, effect: '+1 AC. Reduces critical hit damage by half once per combat', durability: 'sturdy', breakChance: 5, weight: 'medium', rarity: 'common', tags: ['heavy armor'] },
  'helmet-horned': { acBonus: 1, effect: '+1 AC. Intimidating — advantage on Intimidation checks', durability: 'sturdy', breakChance: 5, weight: 'medium', rarity: 'uncommon', tags: ['imposing'] },
  'gauntlets-iron': { acBonus: 1, effect: '+1 AC. Unarmed strikes deal 1d4 bludgeoning damage', durability: 'sturdy', weight: 'medium', rarity: 'common' },
  'gloves-leather': { effect: "Grip enhancement — advantage on Sleight of Hand and Thieves' Tools checks", durability: 'fragile', breakChance: 15, weight: 'light', rarity: 'common' },

  // TOOLS & MISC
  'scroll': { effect: 'A written scroll — could be a spell, a map, or a message', consumable: true, weight: 'light', rarity: 'uncommon' },
  'scroll-spell': { effect: 'Contains a single spell. Reading it casts the spell without using a spell slot', consumable: true, weight: 'light', rarity: 'uncommon', tags: ['magical', 'spell'] },
  'scroll-ancient': { effect: 'Ancient script — requires Arcana DC 15 to decipher. Contains forgotten knowledge', consumable: false, weight: 'light', rarity: 'rare', tags: ['lore'] },
  'scroll-map': { effect: 'A map to somewhere significant. Study it to learn about a region or location', consumable: false, weight: 'light', rarity: 'uncommon', tags: ['navigation'] },
  'tome': { effect: 'A book of knowledge', consumable: false, weight: 'medium', rarity: 'uncommon', tags: ['lore'] },
  'tome-ancient': { effect: 'An ancient tome in a dead language. 8 hours of study grants advantage on one knowledge check permanently', consumable: false, weight: 'heavy', rarity: 'rare', tags: ['lore', 'magical'] },
  'journal': { effect: "Someone's personal journal. May contain secrets, codes, or confessions", consumable: false, weight: 'light', rarity: 'common', tags: ['lore'] },
  'tool-torch': { effect: '1 hour burn. 20ft bright light, 20ft dim. Improvised weapon (1d4 fire)', consumable: true, durability: 'fragile', weight: 'light', rarity: 'common', tags: ['light'] },
  'tool-rope': { effect: '50ft of hempen rope. DC 17 to break. Used for climbing, binding, and many utility purposes', consumable: false, durability: 'normal', weight: 'medium', rarity: 'common' },
  'tool-lockpick': { effect: 'Required for picking locks. Chance to break on a roll of 1-3', consumable: false, durability: 'fragile', breakChance: 20, weight: 'light', rarity: 'common', tags: ['thieves tools'] },
  'tool-grapple': { effect: 'Grappling hook. Attach rope to reach high places. DC 12 Athletics to use successfully', consumable: false, durability: 'sturdy', weight: 'medium', rarity: 'common' },
  'arrows': { effect: '20 arrows. Required for bows. Recoverable after combat (roughly half)', consumable: true, durability: 'fragile', weight: 'light', rarity: 'common', tags: ['ammunition'] },
  'arrows-magic': { effect: '10 magical arrows. +1 to attack and damage. Glow faintly. Not recoverable', consumable: true, weight: 'light', rarity: 'rare', tags: ['ammunition', 'magical', '+1'] },
  'bolts': { effect: '20 crossbow bolts. Required for crossbows', consumable: true, durability: 'fragile', weight: 'light', rarity: 'common', tags: ['ammunition'] },
  'food-bread': { effect: 'One day of rations. Prevents the Exhaustion effect from starvation', consumable: true, weight: 'light', rarity: 'common' },
  'food-meat': { effect: 'Cooked meat ration. Heals 1 HP when consumed during a short rest', consumable: true, weight: 'light', rarity: 'common', tags: ['healing'] },
  'drink-ale': { effect: 'A flagon of ale. Temporary +1 to Charisma but -1 to Perception for 1 hour', consumable: true, weight: 'light', rarity: 'common' },
  'drink-wine': { effect: 'A bottle of wine. Social lubricant — NPCs are 10% more receptive to persuasion', consumable: true, weight: 'light', rarity: 'common' },
  'key': { effect: 'Opens a specific lock. Study it to guess what kind of door it belongs to', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'common', tags: ['key'] },
  'quest-key': { effect: 'A key of significance. This opens something important', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'rare', tags: ['key', 'quest'] },
  'quest-letter': { effect: 'A letter with significant information or orders. Who sent it?', consumable: false, weight: 'light', rarity: 'uncommon', tags: ['lore', 'quest'] },
  'quest-rune': { effect: 'A carved rune-stone. Pulses with faint magic. Its purpose is unknown', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'rare', tags: ['magical', 'quest'] },
  'quest-orb': { effect: 'An orb that hums with contained energy. Powerful but unpredictable', consumable: false, durability: 'sturdy', weight: 'medium', rarity: 'legendary', tags: ['magical', 'quest'] },
  'quest-gem': { effect: 'A gem that seems to pulse with an inner light. More than just a jewel', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'rare', tags: ['magical', 'quest'] },
  'gem-currency': { effect: 'A valuable gemstone worth 50-500 gold depending on quality', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'uncommon' },
  'gold-coin': { effect: 'Currency of the realm', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'common' },
  'gold-pouch': { effect: 'A pouch of gold coins', consumable: false, durability: 'fragile', weight: 'light', rarity: 'common' },
  'silver-coin': { effect: 'Silver currency, also effective against certain supernatural creatures when forged into weapons', consumable: false, durability: 'indestructible', weight: 'light', rarity: 'common' },
  'treasure-chest': { effect: 'A locked chest of unknown contents. Requires lockpick or key to open', consumable: false, durability: 'sturdy', weight: 'heavy', rarity: 'uncommon' },
}

export function getItemProperties(itemName: string): ItemProperty | null {
  const name = itemName.toLowerCase().trim()
  if (ITEM_PROPERTIES[name]) return ITEM_PROPERTIES[name]
  const keys = Object.keys(ITEM_PROPERTIES)
  const match = keys.find(k => name.includes(k) || k.includes(name.split(' ')[0]))
  return match ? ITEM_PROPERTIES[match] : null
}

export function getRarityColor(rarity: string): string {
  const colors: Record<string, string> = {
    common: 'rgba(180,160,120,0.7)',
    uncommon: 'rgba(100,180,100,0.8)',
    rare: 'rgba(80,130,220,0.8)',
    legendary: 'rgba(200,146,42,0.9)',
    cursed: 'rgba(180,50,180,0.8)',
    unknown: 'rgba(160,160,160,0.6)',
  }
  return colors[rarity] || colors.common
}

export function getRarityLabel(rarity: string): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1)
}
