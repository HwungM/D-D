const { default: OpenAI } = require('openai');
const fs = require('fs');
const https = require('https');
const path = require('path');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const STYLE = 'Dark fantasy illustration. Muted earth tones, deep browns, slate grays, forest greens, ember reds. High contrast single dramatic light source. Painterly texture like classic 1980s fantasy book cover art. No cel shading, no anime, no bright colors. Atmospheric, gritty, highly detailed.';

const ASSETS = [
  // DM Portraits
  { file: 'dm/dm-neutral.png', prompt: `${STYLE} A hooded dungeon master figure seated at a shadowed table, face partially illuminated by candlelight, expression neutral and watchful. Flowing dark robes, arcane symbols, ancient tomes surrounding them. Portrait composition, waist up.` },
  { file: 'dm/dm-amused.png', prompt: `${STYLE} A hooded dungeon master figure seated at a shadowed table, candlelight on their face, a slight knowing smirk. Dark robes, arcane symbols. Portrait composition, waist up.` },
  { file: 'dm/dm-serious.png', prompt: `${STYLE} A hooded dungeon master figure, face stern and grave in candlelight, eyes intense and focused. Dark robes, arcane symbols. Portrait composition, waist up.` },
  { file: 'dm/dm-menacing.png', prompt: `${STYLE} A hooded dungeon master figure, face shadowed, only glowing eyes visible, expression dangerous and cold. Dark robes, skull motifs. Portrait composition, waist up.` },
  { file: 'dm/dm-surprised.png', prompt: `${STYLE} A hooded dungeon master figure, eyebrows raised in genuine surprise, leaning forward into candlelight. Dark robes, arcane symbols. Portrait composition, waist up.` },
  { file: 'dm/dm-pleased.png', prompt: `${STYLE} A hooded dungeon master figure, a rare warm smile in candlelight, satisfied expression. Dark robes, arcane symbols. Portrait composition, waist up.` },

  // Race Portraits
  { file: 'races/human.png', prompt: `${STYLE} Portrait of a noble human warrior, strong jaw, weathered face, determined brown eyes, short dark hair with grey streaks, wearing battered but well-kept leather armor. Dramatic side lighting. Shoulder-up portrait.` },
  { file: 'races/elf.png', prompt: `${STYLE} Portrait of an elven figure, sharp angular features, long silver hair, piercing violet eyes, pointed ears, elegant bone structure, wearing fine forest-green garb. Soft ethereal light. Shoulder-up portrait.` },
  { file: 'races/dwarf.png', prompt: `${STYLE} Portrait of a dwarven warrior, thick braided red beard with iron rings, broad face, deep-set grey eyes, wearing hammered steel pauldrons. Forge-lit from below. Shoulder-up portrait.` },
  { file: 'races/halfling.png', prompt: `${STYLE} Portrait of a halfling, large curly auburn hair, bright green curious eyes, rosy cheeks, small frame, wearing a patched traveling cloak. Warm tavern light. Shoulder-up portrait.` },
  { file: 'races/gnome.png', prompt: `${STYLE} Portrait of a gnome inventor, wild white hair sticking out at angles, enormous amber goggles pushed up on forehead, bright inquisitive eyes, mechanical components on collar. Workshop lighting. Shoulder-up portrait.` },
  { file: 'races/half-orc.png', prompt: `${STYLE} Portrait of a half-orc, grey-green skin, small upward tusks, powerful jaw, amber eyes, shaved head with ritual scars, wearing iron-plated armor. Harsh torchlight. Shoulder-up portrait.` },
  { file: 'races/tiefling.png', prompt: `${STYLE} Portrait of a tiefling, deep crimson skin, small curved black horns, glowing gold eyes with no pupils, elegant features, wearing dark arcane robes. Mysterious purple light. Shoulder-up portrait.` },
  { file: 'races/dragonborn.png', prompt: `${STYLE} Portrait of a dragonborn, scaled dark bronze skin, reptilian amber eyes, regal angular face, subtle horns sweeping back, wearing ornate scaled armor. Dramatic torchlight. Shoulder-up portrait.` },

  // Female Race Portraits
  { file: 'races/human-f.png', prompt: `${STYLE} Portrait of a noble human female warrior, strong determined face, weathered features, brown eyes, dark hair pulled back, wearing battered leather armor. Dramatic side lighting. Shoulder-up portrait.` },
  { file: 'races/elf-f.png', prompt: `${STYLE} Portrait of an elven female, sharp elegant features, long silver hair, piercing violet eyes, pointed ears, wearing fine forest-green garb. Soft ethereal light. Shoulder-up portrait.` },
  { file: 'races/dwarf-f.png', prompt: `${STYLE} Portrait of a dwarven female warrior, thick braided auburn hair with iron rings, broad strong face, deep-set grey eyes, wearing hammered steel pauldrons. Forge-lit from below. Shoulder-up portrait.` },
  { file: 'races/halfling-f.png', prompt: `${STYLE} Portrait of a halfling female, large tight curly auburn hair, bright green curious eyes, rosy cheeks, small frame, wearing a patched traveling cloak. Warm tavern light. Shoulder-up portrait.` },
  { file: 'races/gnome-f.png', prompt: `${STYLE} Portrait of a gnome female inventor, wild white curly hair, enormous amber goggles pushed up on forehead, bright inquisitive eyes, mechanical components on collar. Workshop lighting. Shoulder-up portrait.` },
  { file: 'races/half-orc-f.png', prompt: `${STYLE} Portrait of a half-orc female, grey-green skin, small upward tusks, strong jaw, amber eyes, shaved sides with ritual scars, wearing iron-plated armor. Harsh torchlight. Shoulder-up portrait.` },
  { file: 'races/tiefling-f.png', prompt: `${STYLE} Portrait of a tiefling female, deep crimson skin, small curved black horns, glowing gold eyes with no pupils, elegant features, wearing dark arcane robes. Mysterious purple light. Shoulder-up portrait.` },
  { file: 'races/dragonborn-f.png', prompt: `${STYLE} Portrait of a dragonborn female, scaled dark bronze skin, reptilian amber eyes, regal angular face, subtle horns sweeping back, wearing ornate scaled armor. Dramatic torchlight. Shoulder-up portrait.` },

  // Black Female Race Portraits
  { file: 'races/human-f-black.png', prompt: `${STYLE} Portrait of a noble Black human female warrior, deep brown skin, tight curly dark hair, strong determined face, dark eyes, wearing battered leather armor. Dramatic side lighting. Shoulder-up portrait.` },
  { file: 'races/elf-f-black.png', prompt: `${STYLE} Portrait of a Black elven female, deep brown skin, tight coily dark hair with silver accents, sharp elegant features, pointed ears, glowing violet eyes, wearing fine forest-green garb. Soft ethereal light. Shoulder-up portrait.` },
  { file: 'races/dwarf-f-black.png', prompt: `${STYLE} Portrait of a Black dwarven female warrior, deep brown skin, thick tight curly black hair braided with iron rings, strong broad face, deep-set eyes, wearing hammered steel pauldrons. Forge-lit from below. Shoulder-up portrait.` },
  { file: 'races/halfling-f-black.png', prompt: `${STYLE} Portrait of a Black halfling female, deep brown skin, large voluminous tight curly black hair, bright curious eyes, rosy cheeks, small frame, wearing a patched traveling cloak. Warm tavern light. Shoulder-up portrait.` },
  { file: 'races/gnome-f-black.png', prompt: `${STYLE} Portrait of a Black gnome female inventor, deep brown skin, wild tight curly black hair, enormous amber goggles pushed up on forehead, bright inquisitive eyes, mechanical components on collar. Workshop lighting. Shoulder-up portrait.` },

  // Black Male Race Portraits
  { file: 'races/human-m-black.png', prompt: `${STYLE} Portrait of a noble Black human male warrior, deep brown skin, short cropped dark hair, strong jaw, weathered determined face, dark eyes, wearing battered leather armor. Dramatic side lighting. Shoulder-up portrait.` },
  { file: 'races/elf-m-black.png', prompt: `${STYLE} Portrait of a Black elven male, deep brown skin, short cropped dark hair with silver accents, sharp angular features, pointed ears, glowing violet eyes, wearing fine forest-green garb. Soft ethereal light. Shoulder-up portrait.` },
  { file: 'races/dwarf-m-black.png', prompt: `${STYLE} Portrait of a Black dwarven male warrior, deep brown skin, thick braided black beard with iron rings, broad strong face, deep-set eyes, wearing hammered steel pauldrons. Forge-lit from below. Shoulder-up portrait.` },
  { file: 'races/halfling-m-black.png', prompt: `${STYLE} Portrait of a Black halfling male, deep brown skin, short tight curly black hair, bright curious eyes, rosy cheeks, small frame, wearing a patched traveling cloak. Warm tavern light. Shoulder-up portrait.` },
  { file: 'races/gnome-m-black.png', prompt: `${STYLE} Portrait of a Black gnome male inventor, deep brown skin, short tight curly black hair, enormous amber goggles pushed up on forehead, bright inquisitive eyes, mechanical components on collar. Workshop lighting. Shoulder-up portrait.` },

  // Class Icons
  { file: 'classes/fighter.png', prompt: `${STYLE} Icon illustration of a battle-worn sword and kite shield crossed, etched with campaign scars, steel with gold trim on worn leather backing. Square icon format, centered on dark stone texture.` },
  { file: 'classes/wizard.png', prompt: `${STYLE} Icon illustration of an ancient spellbook open to a glowing arcane rune, orbited by three floating motes of light, pages yellowed. Square icon format, centered on dark stone texture.` },
  { file: 'classes/rogue.png', prompt: `${STYLE} Icon illustration of a curved dagger with a shadow-black blade and ivory handle, a single drop of blood on the tip, a coin beneath it. Square icon format, centered on dark stone texture.` },
  { file: 'classes/cleric.png', prompt: `${STYLE} Icon illustration of a holy sun-cross reliquary, worn silver with a warm inner glow, hanging from a chain. Square icon format, centered on dark stone texture.` },
  { file: 'classes/ranger.png', prompt: `${STYLE} Icon illustration of a longbow with a notched arrow, wrapped in leather grip, a hawk feather fletching, pine branch behind it. Square icon format, centered on dark stone texture.` },
  { file: 'classes/paladin.png', prompt: `${STYLE} Icon illustration of a gleaming great-sword planted upright, a radiant holy light emanating from its hilt, ornate crossguard. Square icon format, centered on dark stone texture.` },
  { file: 'classes/barbarian.png', prompt: `${STYLE} Icon illustration of a massive battle-axe with a cracked blade, fur-wrapped handle, impact marks and dried blood. Square icon format, centered on dark stone texture.` },
  { file: 'classes/bard.png', prompt: `${STYLE} Icon illustration of a lute with a cracked soundboard, gold strings, a rolled parchment of music behind it. Square icon format, centered on dark stone texture.` },
  { file: 'classes/druid.png', prompt: `${STYLE} Icon illustration of a gnarled wooden staff wrapped with living vines and small white flowers, a crescent moon carved at its crown. Square icon format, centered on dark stone texture.` },
  { file: 'classes/monk.png', prompt: `${STYLE} Icon illustration of two open palms facing up, glowing with inner golden ki energy, simple cloth wrappings on the wrists. Square icon format, centered on dark stone texture.` },
  { file: 'classes/sorcerer.png', prompt: `${STYLE} Icon illustration of a hand with crackling purple lightning arcing from the fingertips, veins glowing beneath the skin. Square icon format, centered on dark stone texture.` },
  { file: 'classes/warlock.png', prompt: `${STYLE} Icon illustration of an eldritch eye floating above an open palm, pupil-less, with tentacle-like tendrils below it, ominous purple glow. Square icon format, centered on dark stone texture.` },

  // Scene Backgrounds
  { file: 'scenes/tavern.png', prompt: `${STYLE} Interior of a medieval fantasy tavern at night. Low ceiling with hanging lanterns, rough wooden tables, a roaring fireplace, shadows in the corners, patrons silhouetted. Wide landscape format, atmospheric.` },
  { file: 'scenes/dungeon-corridor.png', prompt: `${STYLE} A stone dungeon corridor stretching into darkness, torch sconces on the walls casting orange pools of light, damp stone floor, ancient carved reliefs on the walls. Wide landscape format.` },
  { file: 'scenes/dungeon-chamber.png', prompt: `${STYLE} A large underground dungeon chamber, cracked stone pillars, a glowing runic floor, bones and old equipment in corners, vaulted ceiling lost in shadow. Wide landscape format.` },
  { file: 'scenes/forest-road.png', prompt: `${STYLE} A dark forest road through ancient twisted trees, moonlight breaking through the canopy in shafts, mist at ground level, eerie quiet. Wide landscape format.` },
  { file: 'scenes/forest-clearing.png', prompt: `${STYLE} A moonlit forest clearing, ancient stone ruins partially reclaimed by moss and vines, fireflies, a still dark pond reflecting stars. Wide landscape format.` },
  { file: 'scenes/castle-gate.png', prompt: `${STYLE} The imposing gates of a dark stone castle at dusk, drawbridge lowered over a moat, torches lit on the battlements, ravens circling the towers. Wide landscape format.` },
  { file: 'scenes/throne-room.png', prompt: `${STYLE} A grand but oppressive throne room, high vaulted ceilings, banners hanging in shadow, a massive stone throne on a raised dais, cold blue light from narrow windows. Wide landscape format.` },
  { file: 'scenes/marketplace.png', prompt: `${STYLE} A bustling medieval fantasy marketplace at dawn, merchant stalls, cobblestone streets, half-timbered buildings, a fountain in the center, morning fog. Wide landscape format.` },
  { file: 'scenes/cave-entrance.png', prompt: `${STYLE} The mouth of a dark cave in a rocky hillside, ancient carvings around the entrance, bones of previous adventurers, torch light from within, ominous. Wide landscape format.` },
  { file: 'scenes/ancient-ruins.png', prompt: `${STYLE} Ancient crumbling stone ruins of a once-great civilization, massive fallen columns, jungle reclaiming the stonework, a central altar still standing, moonlight. Wide landscape format.` },
  { file: 'scenes/mountain-pass.png', prompt: `${STYLE} A treacherous mountain pass at dusk, narrow stone path along a sheer cliff, stormy sky, distant peaks. Wide landscape format.` },
  { file: 'scenes/harbor.png', prompt: `${STYLE} A dark fantasy harbor at night, fishing boats and a warship at weathered docks, lantern reflections in oily water, fog rolling in from the sea, a lighthouse in the distance. Wide landscape format.` },
  { file: 'scenes/crypt.png', prompt: `${STYLE} An ancient underground crypt, stone sarcophagi in alcoves, cobwebs, a single burning brazier, carved skull reliefs on the walls. Wide landscape format.` },
  { file: 'scenes/wizard-tower.png', prompt: `${STYLE} Interior of a wizard tower laboratory, shelves of glowing vials and ancient tomes, a celestial orrery turning slowly, arcane diagrams on the floor, night sky through a circular window. Wide landscape format.` },
  { file: 'scenes/battlefield.png', prompt: `${STYLE} The aftermath of a great battle on an open plain, broken weapons in muddy earth, ravens, smoke from distant fires, storm clouds rolling in, a single surviving banner. Wide landscape format.` },

  // Item Icons — Swords
  { file: 'items/sword-iron.png', prompt: `${STYLE} Item icon: a plain iron longsword, simple crossguard, worn leather grip, slightly pitted blade. Square icon, dark background.` },
  { file: 'items/sword-steel.png', prompt: `${STYLE} Item icon: a well-forged steel longsword, polished blade, ornate crossguard, leather-wrapped grip with gold wire. Square icon, dark background.` },
  { file: 'items/sword-silver.png', prompt: `${STYLE} Item icon: a silver longsword with a sapphire in the crossguard, runes etched along the blade, soft blue glow. Square icon, dark background.` },
  { file: 'items/sword-enchanted.png', prompt: `${STYLE} Item icon: an enchanted longsword crackling with purple arcane energy along the blade, glowing sigils on the crossguard. Square icon, dark background.` },
  { file: 'items/sword-cursed.png', prompt: `${STYLE} Item icon: a cursed black longsword, blade like obsidian, dark smoke drifting from the edge, ominous red runes. Square icon, dark background.` },
  { file: 'items/sword-legendary.png', prompt: `${STYLE} Item icon: a legendary greatsword wreathed in golden fire, ornate dragon-motif hilt, ancient glowing runes. Square icon, dark background.` },

  // Item Icons — Axes
  { file: 'items/axe-hand.png', prompt: `${STYLE} Item icon: a small hand axe, worn iron blade, short wooden handle wrapped in leather. Square icon, dark background.` },
  { file: 'items/axe-battle.png', prompt: `${STYLE} Item icon: a brutal bearded battle-axe, notched blood-stained blade, wrapped leather handle with iron studs. Square icon, dark background.` },
  { file: 'items/axe-great.png', prompt: `${STYLE} Item icon: a massive greataxe with a double-bladed head, thick iron construction, skull carved into the blade. Square icon, dark background.` },

  // Item Icons — Daggers
  { file: 'items/dagger-common.png', prompt: `${STYLE} Item icon: a simple iron dagger, short straight blade, basic wooden handle. Square icon, dark background.` },
  { file: 'items/dagger-poison.png', prompt: `${STYLE} Item icon: a slim assassin dagger, dark serrated blade, black wrapped handle, green poison glistening on the tip. Square icon, dark background.` },
  { file: 'items/dagger-enchanted.png', prompt: `${STYLE} Item icon: an elegant enchanted dagger, blade shimmering with frost, silver handle with a moonstone pommel. Square icon, dark background.` },

  // Item Icons — Bows
  { file: 'items/bow-short.png', prompt: `${STYLE} Item icon: a simple shortbow of pale wood, plain string, small and light. Square icon, dark background.` },
  { file: 'items/bow-long.png', prompt: `${STYLE} Item icon: an elegant longbow of dark yew wood, silver-tipped limbs, with a quiver of black-feathered arrows. Square icon, dark background.` },
  { file: 'items/bow-enchanted.png', prompt: `${STYLE} Item icon: an enchanted elven bow, glowing green runes along the limbs, arrows that shimmer with arcane light. Square icon, dark background.` },

  // Item Icons — Staves
  { file: 'items/staff-wooden.png', prompt: `${STYLE} Item icon: a simple gnarled wooden walking staff, worn smooth at the grip, iron-capped at the base. Square icon, dark background.` },
  { file: 'items/staff-arcane.png', prompt: `${STYLE} Item icon: a wizard staff topped with a crackling orb of purple arcane energy, carved sigils along the shaft. Square icon, dark background.` },
  { file: 'items/staff-elemental.png', prompt: `${STYLE} Item icon: an elemental staff with flames at the top, the shaft scorched black, embers drifting from it. Square icon, dark background.` },

  // Item Icons — Wands
  { file: 'items/wand-basic.png', prompt: `${STYLE} Item icon: a slender wand of pale wood, silver tip, faint magical shimmer. Square icon, dark background.` },
  { file: 'items/wand-enchanted.png', prompt: `${STYLE} Item icon: an ornate enchanted wand, dark wood with gold filigree, a pulsing gem at the tip. Square icon, dark background.` },

  // Item Icons — Maces & Hammers
  { file: 'items/mace.png', prompt: `${STYLE} Item icon: a heavy iron mace, flanged head with impact dents, leather-wrapped handle. Square icon, dark background.` },
  { file: 'items/warhammer.png', prompt: `${STYLE} Item icon: a massive warhammer, broad flat iron head, thick wooden handle bound in steel rings. Square icon, dark background.` },

  // Item Icons — Spears & Polearms
  { file: 'items/spear.png', prompt: `${STYLE} Item icon: a steel-tipped spear, long ash shaft, dried blood near the tip. Square icon, dark background.` },
  { file: 'items/halberd.png', prompt: `${STYLE} Item icon: a halberd with a broad axe blade and spike, ornate crossguard, long wooden pole. Square icon, dark background.` },

  // Item Icons — Shields
  { file: 'items/shield-wooden.png', prompt: `${STYLE} Item icon: a round wooden shield with an iron rim, painted crest faded from battle. Square icon, dark background.` },
  { file: 'items/shield-iron.png', prompt: `${STYLE} Item icon: a battered iron kite shield, iron boss in center, sword cuts along the rim. Square icon, dark background.` },
  { file: 'items/shield-enchanted.png', prompt: `${STYLE} Item icon: an enchanted shield glowing with a soft blue ward, runes etched around the rim, pristine despite battle. Square icon, dark background.` },

  // Item Icons — Light Armor
  { file: 'items/armor-leather.png', prompt: `${STYLE} Item icon: worn brown leather armor chest piece, reinforced with studs, battle-scarred. Square icon, dark background.` },
  { file: 'items/armor-studded.png', prompt: `${STYLE} Item icon: dark studded leather armor, iron rivets across the chest, tight fitting. Square icon, dark background.` },

  // Item Icons — Medium Armor
  { file: 'items/armor-chain.png', prompt: `${STYLE} Item icon: a chainmail hauberk, interlocked iron rings, heavy and worn. Square icon, dark background.` },
  { file: 'items/armor-breastplate.png', prompt: `${STYLE} Item icon: a steel breastplate, hammered smooth, engraved with a sun motif, battle-worn. Square icon, dark background.` },

  // Item Icons — Heavy Armor
  { file: 'items/armor-plate.png', prompt: `${STYLE} Item icon: gleaming full plate armor chest piece, etched with battle honors, polished steel with deep scratches. Square icon, dark background.` },
  { file: 'items/armor-dark-plate.png', prompt: `${STYLE} Item icon: dark black plate armor, spiked pauldrons, ominous red runes etched across the chest. Square icon, dark background.` },

  // Item Icons — Helmets
  { file: 'items/helmet-iron.png', prompt: `${STYLE} Item icon: a dented iron helmet, nasal guard, leather liner showing at the edges. Square icon, dark background.` },
  { file: 'items/helmet-horned.png', prompt: `${STYLE} Item icon: a dark steel horned helmet, two curved horns, intimidating visor. Square icon, dark background.` },

  // Item Icons — Gloves
  { file: 'items/gloves-leather.png', prompt: `${STYLE} Item icon: worn leather archer gloves, finger-cut, laced at the wrist. Square icon, dark background.` },
  { file: 'items/gauntlets-iron.png', prompt: `${STYLE} Item icon: heavy iron gauntlets, articulated fingers, knuckle plates, battle-worn. Square icon, dark background.` },

  // Item Icons — Boots
  { file: 'items/boots-leather.png', prompt: `${STYLE} Item icon: ranger soft leather boots, dark brown, mud-stained, reinforced toe and ankle. Square icon, dark background.` },
  { file: 'items/boots-enchanted.png', prompt: `${STYLE} Item icon: elegant enchanted boots, dark leather with glowing blue runes on the sole, feather-light. Square icon, dark background.` },

  // Item Icons — Cloaks
  { file: 'items/cloak-common.png', prompt: `${STYLE} Item icon: a worn brown travelling cloak, frayed edges, simple clasp. Square icon, dark background.` },
  { file: 'items/cloak-elvish.png', prompt: `${STYLE} Item icon: a deep forest-green elvish cloak, silver leaf clasp, shimmers slightly as if alive. Square icon, dark background.` },
  { file: 'items/cloak-shadow.png', prompt: `${STYLE} Item icon: a shadow cloak of pure black, edges dissolving into darkness, impossible to fully see. Square icon, dark background.` },

  // Item Icons — Rings
  { file: 'items/ring-iron.png', prompt: `${STYLE} Item icon: a plain iron ring, rough-forged, worn smooth. Square icon, dark background.` },
  { file: 'items/ring-gold.png', prompt: `${STYLE} Item icon: a gold ring with intricate filigree work, small ruby set in center. Square icon, dark background.` },
  { file: 'items/ring-enchanted.png', prompt: `${STYLE} Item icon: an enchanted ring glowing with green gemstone, strange carved symbols on the band. Square icon, dark background.` },

  // Item Icons — Amulets
  { file: 'items/amulet-bone.png', prompt: `${STYLE} Item icon: a bone amulet carved into a skull, leather cord, primitive and ominous. Square icon, dark background.` },
  { file: 'items/amulet-silver.png', prompt: `${STYLE} Item icon: a silver amulet on a fine chain, sun-cross design, holy symbol. Square icon, dark background.` },
  { file: 'items/amulet-enchanted.png', prompt: `${STYLE} Item icon: a dark enchanted amulet, purple gemstone at center, faint otherworldly glow, strange carved symbols. Square icon, dark background.` },

  // Item Icons — Potions
  { file: 'items/potion-health-small.png', prompt: `${STYLE} Item icon: a tiny glass vial of glowing crimson liquid, cork stopper, warm light within. Square icon, dark background.` },
  { file: 'items/potion-health-medium.png', prompt: `${STYLE} Item icon: a medium flask of glowing crimson liquid, wax seal, pulsing warm light. Square icon, dark background.` },
  { file: 'items/potion-health-large.png', prompt: `${STYLE} Item icon: a large bottle of intensely glowing crimson liquid, iron stopper, radiating heat. Square icon, dark background.` },
  { file: 'items/potion-mana-small.png', prompt: `${STYLE} Item icon: a tiny vial of swirling cobalt blue liquid, silver stopper, faint arcane shimmer. Square icon, dark background.` },
  { file: 'items/potion-mana-medium.png', prompt: `${STYLE} Item icon: a medium flask of glowing blue arcane liquid, swirling motes inside, silver cap. Square icon, dark background.` },
  { file: 'items/potion-mana-large.png', prompt: `${STYLE} Item icon: a large bottle of intensely glowing blue liquid, crackling with arcane energy inside. Square icon, dark background.` },
  { file: 'items/potion-poison.png', prompt: `${STYLE} Item icon: a dark vial of sickly green liquid, skull etched on the glass, bubbling faintly. Square icon, dark background.` },
  { file: 'items/potion-invisibility.png', prompt: `${STYLE} Item icon: a vial of completely clear liquid that seems to make what's behind it invisible, ethereal shimmer. Square icon, dark background.` },
  { file: 'items/potion-strength.png', prompt: `${STYLE} Item icon: a thick vial of deep red liquid, almost viscous, glowing with inner fire. Square icon, dark background.` },
  { file: 'items/potion-speed.png', prompt: `${STYLE} Item icon: a vial of golden liquid with lightning crackling inside, blurred motion effect around it. Square icon, dark background.` },

  // Item Icons — Scrolls
  { file: 'items/scroll-spell.png', prompt: `${STYLE} Item icon: a rolled parchment scroll tied with red ribbon, arcane glyphs on the exposed edge, faint glow. Square icon, dark background.` },
  { file: 'items/scroll-map.png', prompt: `${STYLE} Item icon: a rolled map scroll, worn edges, a red X visible on the exposed corner. Square icon, dark background.` },
  { file: 'items/scroll-ancient.png', prompt: `${STYLE} Item icon: an ancient scroll, crumbling edges, black ink symbols of an unknown language, tied with a black cord. Square icon, dark background.` },

  // Item Icons — Food & Drink
  { file: 'items/food-bread.png', prompt: `${STYLE} Item icon: a round dark bread loaf, crusty, sitting on a cloth. Square icon, dark background.` },
  { file: 'items/food-meat.png', prompt: `${STYLE} Item icon: a cooked leg of meat on a bone, charred from fire. Square icon, dark background.` },
  { file: 'items/drink-ale.png', prompt: `${STYLE} Item icon: a wooden tankard of dark ale, foam at the brim. Square icon, dark background.` },
  { file: 'items/drink-wine.png', prompt: `${STYLE} Item icon: a dark glass bottle of red wine, wax-sealed cork, dusty label. Square icon, dark background.` },

  // Item Icons — Tools
  { file: 'items/tool-rope.png', prompt: `${STYLE} Item icon: a coiled length of hemp rope, knotted at the end, well-worn. Square icon, dark background.` },
  { file: 'items/tool-torch.png', prompt: `${STYLE} Item icon: a wooden torch, wrapped in oiled cloth, burning with orange flame. Square icon, dark background.` },
  { file: 'items/tool-lockpick.png', prompt: `${STYLE} Item icon: a set of slim iron lockpicks in a leather roll, various sizes. Square icon, dark background.` },
  { file: 'items/tool-grapple.png', prompt: `${STYLE} Item icon: an iron grappling hook with three prongs, attached to a coiled rope. Square icon, dark background.` },

  // Item Icons — Quest Items
  { file: 'items/quest-key.png', prompt: `${STYLE} Item icon: an ornate iron key with a skull-shaped bow, ancient and heavy, engraved symbols. Square icon, dark background.` },
  { file: 'items/quest-orb.png', prompt: `${STYLE} Item icon: a mysterious glowing orb, swirling darkness inside, pulsing with purple light. Square icon, dark background.` },
  { file: 'items/quest-rune.png', prompt: `${STYLE} Item icon: an ancient stone rune tablet, glowing carvings, cracked at one corner. Square icon, dark background.` },
  { file: 'items/quest-letter.png', prompt: `${STYLE} Item icon: a sealed letter with a black wax seal bearing an unknown crest, slightly crumpled. Square icon, dark background.` },
  { file: 'items/quest-gem.png', prompt: `${STYLE} Item icon: a large uncut gemstone, deep blue, glowing faintly from within. Square icon, dark background.` },

  // Item Icons — Currency
  { file: 'items/gold-coin.png', prompt: `${STYLE} Item icon: a stack of gold coins, stamped with a crown, gleaming. Square icon, dark background.` },
  { file: 'items/silver-coin.png', prompt: `${STYLE} Item icon: a small pile of silver coins, worn smooth from use. Square icon, dark background.` },
  { file: 'items/gem-currency.png', prompt: `${STYLE} Item icon: a cut ruby gemstone, brilliant red, facets catching light. Square icon, dark background.` },
  { file: 'items/treasure-chest.png', prompt: `${STYLE} Item icon: a small wooden treasure chest, iron-banded, open slightly to reveal gold glinting inside. Square icon, dark background.` },

  // Item Icons — Books & Tomes
  { file: 'items/tome.png', prompt: `${STYLE} Item icon: a heavy leather-bound spellbook, iron clasp, arcane symbol embossed on cover, gold-edged pages. Square icon, dark background.` },
  { file: 'items/journal.png', prompt: `${STYLE} Item icon: a worn leather journal, strap clasp, pages bulging with loose notes and pressed items. Square icon, dark background.` },
  { file: 'items/tome-ancient.png', prompt: `${STYLE} Item icon: an ancient tome, cracked leather cover, unknown symbols burned into it, chained shut. Square icon, dark background.` },

  // Item Icons — Ammo
  { file: 'items/arrows.png', prompt: `${STYLE} Item icon: a bundle of arrows tied together, black feather fletching, iron tips. Square icon, dark background.` },
  { file: 'items/bolts.png', prompt: `${STYLE} Item icon: a bundle of crossbow bolts, shorter than arrows, tied in a quiver. Square icon, dark background.` },
  { file: 'items/arrows-magic.png', prompt: `${STYLE} Item icon: a single magic arrow glowing blue, runes along the shaft, crackling tip. Square icon, dark background.` },

  // Enemies — Humanoids
  { file: 'enemies/goblin.png', prompt: `${STYLE} Portrait of a goblin enemy, small green-skinned creature, beady yellow eyes, jagged teeth, wearing scraps of leather armor, clutching a rusty dagger. Menacing expression. Shoulder-up portrait, dark background.` },
  { file: 'enemies/goblin-shaman.png', prompt: `${STYLE} Portrait of a goblin shaman, green skin, glowing red eyes, bone piercings, tattered robes, holding a crude staff topped with a skull. Eerie torchlight. Shoulder-up portrait, dark background.` },
  { file: 'enemies/orc-warrior.png', prompt: `${STYLE} Portrait of an orc warrior, massive grey-green muscular figure, tusks, war paint, wearing spiked iron armor, axe over shoulder. Brutal and intimidating. Shoulder-up portrait, dark background.` },
  { file: 'enemies/orc-warchief.png', prompt: `${STYLE} Portrait of an orc warchief, enormous scarred green figure, huge curved horns on helmet, commanding presence, heavy black plate armor, eyes burning with fury. Shoulder-up portrait, dark background.` },
  { file: 'enemies/bandit.png', prompt: `${STYLE} Portrait of a human bandit, scarred face, hood pulled low, cold eyes, leather armor, a knife visible at the collar. Untrustworthy, dangerous. Shoulder-up portrait, dark background.` },
  { file: 'enemies/bandit-leader.png', prompt: `${STYLE} Portrait of a bandit leader, weathered human face with a deep scar across one eye, calculating cold gaze, studded leather armor, multiple weapons visible. Shoulder-up portrait, dark background.` },
  { file: 'enemies/cultist.png', prompt: `${STYLE} Portrait of a dark cultist, pale human face with black hollow eyes, dark robes with an ominous symbol on the chest, disturbing calm expression. Candlelit. Shoulder-up portrait, dark background.` },
  { file: 'enemies/dark-knight.png', prompt: `${STYLE} Portrait of a dark knight, full black plate armor with red trim, visor closed, ominous red glow from eye slits, imposing and silent. Shoulder-up portrait, dark background.` },
  { file: 'enemies/assassin.png', prompt: `${STYLE} Portrait of an assassin, face half-masked in shadow, one visible eye cold and calculating, dark fitted armor, daggers at the collar. Barely visible. Shoulder-up portrait, dark background.` },

  // Enemies — Undead
  { file: 'enemies/skeleton.png', prompt: `${STYLE} Portrait of an animated skeleton warrior, yellowed bones, empty dark eye sockets with faint orange glow, wearing rusted armor, clutching a sword. Shoulder-up portrait, dark background.` },
  { file: 'enemies/skeleton-archer.png', prompt: `${STYLE} Portrait of a skeleton archer, bare bones with a cracked skull, glowing eye sockets, tattered leather armor, a longbow in hand. Shoulder-up portrait, dark background.` },
  { file: 'enemies/zombie.png', prompt: `${STYLE} Portrait of a zombie, rotting grey flesh, milky dead eyes, torn clothing, dried blood, expressionless horrifying face. Shoulder-up portrait, dark background.` },
  { file: 'enemies/ghost.png', prompt: `${STYLE} Portrait of a ghost, translucent pale figure, anguished face, hollow eyes, wispy ethereal form, barely visible against the darkness. Shoulder-up portrait, dark background.` },
  { file: 'enemies/wight.png', prompt: `${STYLE} Portrait of a wight, gaunt undead figure with sunken black eyes, cracked grey skin, wearing ancient decayed armor, radiating cold dread. Shoulder-up portrait, dark background.` },
  { file: 'enemies/vampire.png', prompt: `${STYLE} Portrait of a vampire, aristocratic pale face, red glowing eyes, slicked dark hair, elegant dark clothing, fangs slightly visible in a cold smile. Shoulder-up portrait, dark background.` },
  { file: 'enemies/lich.png', prompt: `${STYLE} Portrait of a lich, skeletal face with glowing purple eye sockets, ancient decayed skin, ornate dark robes, an aura of death surrounding them. Shoulder-up portrait, dark background.` },

  // Enemies — Beasts
  { file: 'enemies/wolf.png', prompt: `${STYLE} Portrait of a dire wolf, massive grey wolf with yellow eyes, scarred muzzle, snarling to reveal huge teeth, dark fur standing on end. Shoulder-up portrait, dark background.` },
  { file: 'enemies/giant-spider.png', prompt: `${STYLE} Portrait of a giant spider, black hairy body, eight glowing red eyes, mandibles dripping venom, emerging from darkness. Shoulder-up portrait, dark background.` },
  { file: 'enemies/troll.png', prompt: `${STYLE} Portrait of a troll, enormous lumpy green creature, tiny red eyes, huge crooked nose, warty skin, claws raised, drooling. Shoulder-up portrait, dark background.` },
  { file: 'enemies/ogre.png', prompt: `${STYLE} Portrait of an ogre, massive brown brutish creature, small stupid eyes, club over shoulder, wearing animal hide, intimidating size. Shoulder-up portrait, dark background.` },
  { file: 'enemies/wyvern.png', prompt: `${STYLE} Portrait of a wyvern, dragon-like creature with two wings and a barbed tail, green-black scales, yellow slit eyes, snarling. Shoulder-up portrait, dark background.` },
  { file: 'enemies/giant-rat.png', prompt: `${STYLE} Portrait of a giant rat, huge diseased rodent, red beady eyes, yellow teeth, matted dirty fur, aggressive posture. Shoulder-up portrait, dark background.` },
  { file: 'enemies/harpy.png', prompt: `${STYLE} Portrait of a harpy, woman's face twisted in rage, bird wings, taloned feet, wild hair, screaming with fury. Shoulder-up portrait, dark background.` },

  // Enemies — Demons & Dark Creatures
  { file: 'enemies/imp.png', prompt: `${STYLE} Portrait of an imp, small red demonic creature, tiny curved horns, bat wings, glowing orange eyes, needle-like teeth, mischievous and dangerous. Shoulder-up portrait, dark background.` },
  { file: 'enemies/demon.png', prompt: `${STYLE} Portrait of a demon, large red muscular figure, curved black horns, burning orange eyes, black armor grown from its skin, radiating malice. Shoulder-up portrait, dark background.` },
  { file: 'enemies/shadow-demon.png', prompt: `${STYLE} Portrait of a shadow demon, a figure of pure darkness with glowing white eyes, vaguely humanoid, edges dissolving into shadow. Shoulder-up portrait, dark background.` },
  { file: 'enemies/succubus.png', prompt: `${STYLE} Portrait of a succubus, unnervingly beautiful pale figure with small horns and bat wings folded behind, glowing red eyes hiding malice behind a smile. Shoulder-up portrait, dark background.` },

  // Enemies — Dragons
  { file: 'enemies/dragon-young.png', prompt: `${STYLE} Portrait of a young dragon, red scales, fierce amber eyes, smoke rising from nostrils, sharp horns, dangerous but not yet fully grown. Shoulder-up portrait, dark background.` },
  { file: 'enemies/dragon-ancient.png', prompt: `${STYLE} Portrait of an ancient dragon, massive black-scaled head, glowing red eyes like furnaces, scars from centuries of battle, emanating overwhelming power. Shoulder-up portrait, dark background.` },

  // Enemies — Boss Villains
  { file: 'enemies/dark-wizard.png', prompt: `${STYLE} Portrait of a dark wizard, gaunt human face with sunken eyes glowing purple, long dark robes covered in arcane symbols, arcane energy crackling at his fingertips. Shoulder-up portrait, dark background.` },
  { file: 'enemies/warlord.png', prompt: `${STYLE} Portrait of a warlord, scarred battle-hardened human face, full plate armor, cold calculating eyes, a general who has never lost. Shoulder-up portrait, dark background.` },
  { file: 'enemies/necromancer.png', prompt: `${STYLE} Portrait of a necromancer, pale gaunt face, dead eyes with a faint purple glow, black robes with bone motifs, surrounded by wisps of dark energy. Shoulder-up portrait, dark background.` },
  { file: 'enemies/fallen-paladin.png', prompt: `${STYLE} Portrait of a fallen paladin, once-holy warrior now corrupted, cracked black armor with faded holy symbols, eyes glowing sickly green, expression of tortured rage. Shoulder-up portrait, dark background.` },
  { file: 'enemies/sea-monster.png', prompt: `${STYLE} Portrait of a sea monster, massive tentacled creature rising from dark water, enormous yellow eyes, barnacled skin, ancient and terrifying. Shoulder-up portrait, dark background.` },
  { file: 'enemies/mind-flayer.png', prompt: `${STYLE} Portrait of a mind flayer, alien humanoid with a purple octopus-like face, four tentacles where a mouth should be, pale skin, glowing white eyes, wearing dark robes. Deeply unsettling. Shoulder-up portrait, dark background.` },
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function generateAsset(asset, index, total) {
  const outputPath = path.join(__dirname, '../client/public/assets', asset.file);

  if (fs.existsSync(outputPath)) {
    console.log(`[${index}/${total}] SKIP: ${asset.file}`);
    return;
  }

  try {
    console.log(`[${index}/${total}] Generating: ${asset.file}`);
    const response = await client.images.generate({
      model: 'gpt-image-1',
      prompt: asset.prompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    });

    const b64 = response.data[0].b64_json;
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    console.log(`[${index}/${total}] ✓ ${asset.file}`);
    await new Promise(r => setTimeout(r, 800));
  } catch (err) {
    console.error(`[${index}/${total}] ✗ FAILED: ${asset.file} — ${err.message}`);
  }
}

async function main() {
  console.log(`Generating ${ASSETS.length} assets...\n`);
  for (let i = 0; i < ASSETS.length; i++) {
    await generateAsset(ASSETS[i], i + 1, ASSETS.length);
  }
  console.log('\nAll done!');
}

main();
