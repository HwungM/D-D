const { default: OpenAI } = require('openai');
const fs = require('fs');
const https = require('https');
const path = require('path');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Matches EVERREALM_ART_BIBLE in server/src/services/openai.ts so these static
// fallback assets read as the same world as the AI-generated scenes/portraits
// instead of clashing with a different, older "dark fantasy" look. Modeled
// directly on "The Legend of Vox Machina" adult-animation aesthetic: bold
// graphic-novel character design over painterly realism.
const STYLE = 'Adult animated-fantasy character illustration in the vein of "The Legend of Vox Machina" — bold graphic-novel linework over painterly digital brushwork, exaggerated expressive faces with large emotive eyes and oversized readable expressions, strong stylized (not realistic) proportions, vivid saturated and theatrical skin/fur/scale colors that give every species its own striking color identity, thick confident outlines, dynamic personality-driven poses, richly textured hand-illustrated clothing and gear with visible wear, dramatic warm firelight contrasted with cool magical-blue accents. Not photorealistic, not video-game box-art realism, not soft painterly portraiture, not flat simple cartoon, not anime — character design should look like a frame pulled from a high-end adult animated fantasy series, full of life and personality.';

// A character-select screen needs ONE subject per portrait, facing forward,
// calm/neutral expression, on a plain backdrop — not a narrative scene with
// other people in it. Every race portrait shares this exact framing/backdrop
// so the roster reads as a clean, consistent lineup (think character-select
// grid, not illustrated storybook spreads).
const RACE_BACKGROUND = 'SOLO PORTRAIT ONLY — exactly one person, no other characters, no crowd, no companions in frame or background. Facing forward toward the viewer, calm neutral resting expression (not laughing, shouting, or reacting to anything). Plain simple backdrop: a softly blurred wash of warm amber candlelight fading into deep shadow, flat and uncluttered, identical lighting and backdrop treatment across every portrait in this set so they form a clean matching lineup.';

const ASSETS = [
  // DM Portraits
  { file: 'dm/dm-neutral.png', prompt: `${STYLE} A hooded dungeon master figure seated at a shadowed table, face partially illuminated by candlelight, expression neutral and watchful. Flowing dark robes, arcane symbols, ancient tomes surrounding them. Portrait composition, waist up.` },
  { file: 'dm/dm-amused.png', prompt: `${STYLE} A hooded dungeon master figure seated at a shadowed table, candlelight on their face, a slight knowing smirk. Dark robes, arcane symbols. Portrait composition, waist up.` },
  { file: 'dm/dm-serious.png', prompt: `${STYLE} A hooded dungeon master figure, face stern and grave in candlelight, eyes intense and focused. Dark robes, arcane symbols. Portrait composition, waist up.` },
  { file: 'dm/dm-menacing.png', prompt: `${STYLE} A hooded dungeon master figure, face shadowed, only glowing eyes visible, expression dangerous and cold. Dark robes, skull motifs. Portrait composition, waist up.` },
  { file: 'dm/dm-surprised.png', prompt: `${STYLE} A hooded dungeon master figure, eyebrows raised in genuine surprise, leaning forward into candlelight. Dark robes, arcane symbols. Portrait composition, waist up.` },
  { file: 'dm/dm-pleased.png', prompt: `${STYLE} A hooded dungeon master figure, a rare warm smile in candlelight, satisfied expression. Dark robes, arcane symbols. Portrait composition, waist up.` },

  // Race Portraits — same shared scene/lighting (RACE_BACKGROUND) so the whole roster reads as one cast.
  { file: 'races/human.png', prompt: `${STYLE} A noble human warrior with a strong jaw, weathered face, determined brown eyes, short dark hair with grey streaks, battered but well-kept leather armor, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/elf.png', prompt: `${STYLE} An elven figure with sharp angular features, long silver hair, striking violet eyes, pointed ears, elegant bone structure, fine forest-green garb, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/dwarf.png', prompt: `${STYLE} A dwarven warrior with a thick braided red beard full of iron rings, a broad face, deep-set grey eyes, hammered steel pauldrons, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/halfling.png', prompt: `${STYLE} A halfling with large curly auburn hair, bright green curious eyes, rosy cheeks, a small frame, a patched traveling cloak, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/gnome.png', prompt: `${STYLE} A gnome inventor with wild white hair sticking out at odd angles, enormous amber goggles pushed up on the forehead, bright inquisitive eyes, mechanical trinkets on the collar, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/half-orc.png', prompt: `${STYLE} A half-orc with vivid grey-green skin, small upward tusks, a powerful jaw, glowing amber eyes, a shaved head with ritual scars, iron-plated armor, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/tiefling.png', prompt: `${STYLE} A tiefling with vivid deep crimson skin, small curved black horns, glowing solid-gold eyes with no pupils, elegant sharp features, dark arcane robes, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/dragonborn.png', prompt: `${STYLE} A dragonborn with vivid scaled bronze-and-gold skin, glowing reptilian amber eyes, a regal angular face, subtle horns sweeping back, ornate scaled armor, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },

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

  // Item Icons
  { file: 'items/sword-common.png', prompt: `${STYLE} Item icon: a plain iron longsword, simple crossguard, worn leather grip, slightly pitted blade. Square icon, dark background.` },
  { file: 'items/sword-rare.png', prompt: `${STYLE} Item icon: an elegant silver longsword with a sapphire in the crossguard, runes etched along the blade, soft blue glow. Square icon, dark background.` },
  { file: 'items/sword-legendary.png', prompt: `${STYLE} Item icon: a legendary flaming greatsword, blade wreathed in fire, ornate gold hilt with a dragon motif, ancient runes glowing orange. Square icon, dark background.` },
  { file: 'items/staff-arcane.png', prompt: `${STYLE} Item icon: a gnarled wooden wizard staff topped with a crackling orb of purple arcane energy, carved sigils along the shaft. Square icon, dark background.` },
  { file: 'items/dagger.png', prompt: `${STYLE} Item icon: a slim assassin dagger, dark serrated blade, black wrapped handle, traces of poison on the tip. Square icon, dark background.` },
  { file: 'items/bow.png', prompt: `${STYLE} Item icon: an elegant recurve bow of dark yew wood, silver-tipped limbs, quiver of black-feathered arrows. Square icon, dark background.` },
  { file: 'items/axe.png', prompt: `${STYLE} Item icon: a brutal bearded battle-axe, notched blade, blood-stained, wrapped leather handle with iron studs. Square icon, dark background.` },
  { file: 'items/armor-leather.png', prompt: `${STYLE} Item icon: worn brown leather armor chest piece, reinforced with studs, battle-scarred. Square icon, dark background.` },
  { file: 'items/armor-plate.png', prompt: `${STYLE} Item icon: gleaming full plate armor chest piece, etched with battle honors, polished steel with deep scratches. Square icon, dark background.` },
  { file: 'items/shield.png', prompt: `${STYLE} Item icon: a battered kite shield, iron boss in center, faded family crest, sword cuts along the rim. Square icon, dark background.` },
  { file: 'items/potion-health.png', prompt: `${STYLE} Item icon: a small glass vial of glowing crimson liquid, corked with wax seal, warm inner light. Square icon, dark background.` },
  { file: 'items/potion-mana.png', prompt: `${STYLE} Item icon: a small glass vial of swirling cobalt blue liquid, silver stopper, faint arcane shimmer. Square icon, dark background.` },
  { file: 'items/scroll.png', prompt: `${STYLE} Item icon: a rolled parchment scroll tied with red ribbon, aged and yellowed, arcane glyphs on the exposed edge. Square icon, dark background.` },
  { file: 'items/gold-pouch.png', prompt: `${STYLE} Item icon: a leather coin pouch tied with cord, bulging with coins, a few gold coins spilling out. Square icon, dark background.` },
  { file: 'items/key.png', prompt: `${STYLE} Item icon: an ornate iron key with a skull-shaped bow, ancient and heavy, engraved symbols. Square icon, dark background.` },
  { file: 'items/tome.png', prompt: `${STYLE} Item icon: a heavy leather-bound spellbook, iron clasp, arcane symbol embossed on cover, gold-edged pages. Square icon, dark background.` },
  { file: 'items/ring.png', prompt: `${STYLE} Item icon: a gold ring with a glowing green gemstone, fine filigree work. Square icon, dark background.` },
  { file: 'items/amulet.png', prompt: `${STYLE} Item icon: a silver amulet on a chain, dark purple gemstone at center, strange carved symbols, faint otherworldly glow. Square icon, dark background.` },
  { file: 'items/boots.png', prompt: `${STYLE} Item icon: ranger soft leather boots, dark brown, silent-soled, mud-stained, reinforced toe and ankle. Square icon, dark background.` },
  { file: 'items/cloak.png', prompt: `${STYLE} Item icon: a deep forest-green hooded cloak, silver leaf clasp, edges slightly frayed, stained with travel. Square icon, dark background.` },
];

// The arrays above only cover the "base" assets the game shipped with first.
// Character creation and gameplay also reference gendered/skin-tone race
// variants, a much larger item-icon set, and a full enemy roster — none of
// which the original script knew how to (re)generate. Rather than hand-write
// ~150 more bespoke prompts, these are templated from their filenames so the
// whole asset set can be regenerated in one consistent pass in the new style.
const RACE_FLAVOR = {
  human: 'a strong jaw, weathered face, determined eyes, short hair, battered but well-kept leather armor',
  elf: 'sharp angular features, long flowing hair, piercing eyes, pointed ears, elegant bone structure, fine forest-green garb',
  dwarf: 'a thick braided beard with iron rings, a broad face, deep-set eyes, hammered steel pauldrons',
  halfling: 'large curly hair, bright curious eyes, rosy cheeks, a small frame, a patched traveling cloak',
  gnome: 'wild hair sticking out at angles, enormous goggles pushed up on the forehead, bright inquisitive eyes, mechanical trinkets on the collar',
  'half-orc': 'grey-green skin, small upward tusks, a powerful jaw, amber eyes, ritual scars, iron-plated armor',
  tiefling: 'deep crimson skin, small curved black horns, glowing gold eyes with no pupils, elegant features, dark arcane robes',
  dragonborn: 'scaled skin, reptilian amber eyes, a regal angular face, subtle horns sweeping back, ornate scaled armor',
};

function raceVariantAsset(file) {
  const base = file.replace('races/', '').replace('.png', '');
  const tokens = base.split('-');
  const race = tokens[0] === 'half' ? 'half-orc' : tokens[0];
  const rest = tokens[0] === 'half' ? tokens.slice(2) : tokens.slice(1);
  const genderDesc = rest.includes('f') ? 'a woman' : rest.includes('m') ? 'a man' : 'a figure';
  const toneDesc = rest.includes('black') ? ', with a deep dark complexion' : '';
  const flavor = RACE_FLAVOR[race] || 'striking, memorable fantasy features';
  return { file, prompt: `${STYLE} ${genderDesc.charAt(0).toUpperCase()}${genderDesc.slice(1)} of the ${race} people, with ${flavor}${toneDesc}, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` };
}

const RACE_VARIANT_FILES = [
  'races/dragonborn-f.png', 'races/dwarf-f-black.png', 'races/dwarf-f.png', 'races/dwarf-m-black.png',
  'races/elf-f-black.png', 'races/elf-f.png', 'races/elf-m-black.png',
  'races/gnome-f-black.png', 'races/gnome-f.png', 'races/gnome-m-black.png',
  'races/half-orc-f.png',
  'races/halfling-f-black.png', 'races/halfling-f.png', 'races/halfling-m-black.png',
  'races/human-f-black.png', 'races/human-f.png', 'races/human-m-black.png',
  'races/tiefling-f.png',
];

function humanizeSlug(base) {
  return base.split('-').join(' ');
}

function itemIconAsset(file) {
  const base = file.replace('items/', '').replace('.png', '');
  return { file, prompt: `${STYLE} Item icon: a richly detailed fantasy ${humanizeSlug(base)}, believable wear, materials, and craftsmanship, telling a small story at a glance. Square icon, dark background, dramatic rim lighting.` };
}

const ITEM_VARIANT_FILES = [
  'items/amulet-bone.png', 'items/amulet-enchanted.png', 'items/amulet-silver.png',
  'items/armor-breastplate.png', 'items/armor-chain.png', 'items/armor-dark-plate.png', 'items/armor-studded.png',
  'items/arrows-magic.png', 'items/arrows.png',
  'items/axe-battle.png', 'items/axe-great.png', 'items/axe-hand.png',
  'items/bolts.png',
  'items/boots-enchanted.png', 'items/boots-leather.png',
  'items/bow-enchanted.png', 'items/bow-long.png', 'items/bow-short.png',
  'items/cloak-common.png', 'items/cloak-elvish.png', 'items/cloak-shadow.png',
  'items/dagger-common.png', 'items/dagger-enchanted.png', 'items/dagger-poison.png',
  'items/drink-ale.png', 'items/drink-wine.png',
  'items/food-bread.png', 'items/food-meat.png',
  'items/gauntlets-iron.png', 'items/gem-currency.png', 'items/gloves-leather.png', 'items/gold-coin.png',
  'items/halberd.png',
  'items/helmet-horned.png', 'items/helmet-iron.png',
  'items/journal.png', 'items/mace.png',
  'items/potion-health-large.png', 'items/potion-health-medium.png', 'items/potion-health-small.png',
  'items/potion-invisibility.png', 'items/potion-mana-large.png', 'items/potion-mana-medium.png',
  'items/potion-mana-small.png', 'items/potion-poison.png', 'items/potion-speed.png', 'items/potion-strength.png',
  'items/quest-gem.png', 'items/quest-key.png', 'items/quest-letter.png', 'items/quest-orb.png', 'items/quest-rune.png',
  'items/ring-enchanted.png', 'items/ring-gold.png', 'items/ring-iron.png',
  'items/scroll-ancient.png', 'items/scroll-map.png', 'items/scroll-spell.png',
  'items/shield-enchanted.png', 'items/shield-iron.png', 'items/shield-wooden.png',
  'items/silver-coin.png', 'items/spear.png',
  'items/staff-elemental.png', 'items/staff-wooden.png',
  'items/sword-cursed.png', 'items/sword-enchanted.png', 'items/sword-iron.png', 'items/sword-silver.png', 'items/sword-steel.png',
  'items/tome-ancient.png',
  'items/tool-grapple.png', 'items/tool-lockpick.png', 'items/tool-rope.png', 'items/tool-torch.png',
  'items/treasure-chest.png',
  'items/wand-basic.png', 'items/wand-enchanted.png',
  'items/warhammer.png',
];

function enemyPortraitAsset(file) {
  const base = file.replace('enemies/', '').replace('.png', '');
  return { file, prompt: `${STYLE} Portrait of a menacing ${humanizeSlug(base)}, dynamic pose, dramatic lighting, strong readable silhouette, full of threat and personality, fitting a painterly animated-fantasy bestiary. Waist-up composition, dark atmospheric background.` };
}

const ENEMY_FILES = [
  'enemies/assassin.png', 'enemies/bandit-leader.png', 'enemies/bandit.png', 'enemies/cultist.png',
  'enemies/dark-knight.png', 'enemies/dark-wizard.png', 'enemies/demon.png',
  'enemies/dragon-ancient.png', 'enemies/dragon-young.png',
  'enemies/fallen-paladin.png', 'enemies/ghost.png', 'enemies/giant-rat.png', 'enemies/giant-spider.png',
  'enemies/goblin-shaman.png', 'enemies/goblin.png', 'enemies/harpy.png', 'enemies/imp.png',
  'enemies/lich.png', 'enemies/mind-flayer.png', 'enemies/necromancer.png', 'enemies/ogre.png',
  'enemies/orc-warchief.png', 'enemies/orc-warrior.png', 'enemies/sea-monster.png', 'enemies/shadow-demon.png',
  'enemies/skeleton-archer.png', 'enemies/skeleton.png', 'enemies/succubus.png', 'enemies/troll.png',
  'enemies/vampire.png', 'enemies/warlord.png', 'enemies/wight.png', 'enemies/wolf.png', 'enemies/wyvern.png',
  'enemies/zombie.png',
];

ASSETS.push(
  ...RACE_VARIANT_FILES.map(raceVariantAsset),
  ...ITEM_VARIANT_FILES.map(itemIconAsset),
  ...ENEMY_FILES.map(enemyPortraitAsset),
);

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
      model: 'gpt-image-2',
      prompt: asset.prompt,
      n: 1,
      size: '1024x1024',
      quality: 'low',
    });

    const image = response.data[0];
    if (image.b64_json) {
      fs.writeFileSync(outputPath, Buffer.from(image.b64_json, 'base64'));
    } else if (image.url) {
      await downloadImage(image.url, outputPath);
    } else {
      throw new Error('Response contained neither b64_json nor url');
    }
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
