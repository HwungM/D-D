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
