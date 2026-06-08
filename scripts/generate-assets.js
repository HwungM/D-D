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
const STYLE = 'Adult animated-fantasy character illustration in the vein of "The Legend of Vox Machina" — bold graphic-novel linework over painterly digital brushwork, exaggerated expressive faces with large emotive eyes and oversized readable expressions, strong stylized (not realistic) proportions, vivid saturated and theatrical skin/fur/scale colors that give every species its own striking color identity, thick confident outlines, dynamic personality-driven poses, richly textured hand-illustrated clothing and gear with visible wear, dramatic warm firelight contrasted with cool magical-blue accents. Not photorealistic, not video-game box-art realism, not soft painterly portraiture, not flat simple cartoon, not anime, not 3D-rendered, not CGI, not a video-game character model — strictly 2D hand-drawn/illustrated, like a single frame pulled from a high-end adult animated fantasy series, full of life and personality, with every character drawn in the exact same consistent illustration technique.';

// Scene backgrounds are reused as generic location backdrops across every
// campaign and party — they must NOT depict specific characters or story
// moments (that would look like someone else's adventure intruding on yours).
// Same painterly-animated visual language as STYLE (lighting, palette,
// linework), but the location/atmosphere itself is the subject, not people.
const SCENE_STYLE = 'Empty environment establishing-shot illustration in the same painterly adult-animated-fantasy visual language as "The Legend of Vox Machina" — bold graphic-novel linework over painterly digital brushwork, vivid theatrical color palette, dramatic warm firelight contrasted with cool magical-blue or moonlit accents, rich atmospheric depth and mood. NO PEOPLE — completely free of characters, figures, silhouettes, adventurers, monsters, or any living subjects; the location and atmosphere are the entire subject. Not photorealistic, not 3D-rendered, not CGI — strictly 2D hand-illustrated environment art, wide cinematic landscape framing.';

// For public, lived-in locations (taverns, markets) it reads wrong for them to be deserted —
// these allow generic background life, but never a posed "hero" subject who'd clash with the party.
const SCENE_STYLE_LIVED_IN = 'Lived-in environment establishing-shot illustration in the same painterly adult-animated-fantasy visual language as "The Legend of Vox Machina" — bold graphic-novel linework over painterly digital brushwork, vivid theatrical color palette, dramatic lighting and rich atmospheric depth. Populated with anonymous background figures going about ordinary business — patrons, merchants, travelers, guards — shown at a middle distance or from behind, faces turned away or unclear, none posed or centered like a hero or protagonist; the location and its everyday atmosphere are the subject, not any individual person. Not photorealistic, not 3D-rendered, not CGI — strictly 2D hand-illustrated environment art, wide cinematic landscape framing.';

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
  // Skin tones are deliberately varied across the cast so the roster reads as
  // diverse on its own, without needing separate "light/dark" variant cards.
  { file: 'races/human.png', prompt: `${STYLE} A noble human warrior with deep brown skin, a strong jaw, weathered face, determined dark eyes, short black hair with grey at the temples, battered but well-kept leather armor, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/elf.png', prompt: `${STYLE} An elven figure with warm olive-tan skin, sharp angular features, long silver hair, striking violet eyes, pointed ears, elegant bone structure, fine forest-green garb, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/dwarf.png', prompt: `${STYLE} A dwarven warrior with ruddy tan skin, a thick braided red beard full of iron rings, a broad face, deep-set grey eyes, hammered steel pauldrons, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing, flat 2D illustrated linework — not a 3D render, not CGI, not a video-game character model.` },
  { file: 'races/halfling.png', prompt: `${STYLE} A halfling man with warm brown skin, short curly black hair, bright green curious eyes, a round friendly face, a small frame, a patched traveling cloak, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
  { file: 'races/gnome.png', prompt: `${STYLE} A gnome inventor with light olive skin, wild white hair sticking out at odd angles, enormous amber goggles pushed up on the forehead, bright inquisitive eyes, mechanical trinkets on the collar, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` },
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

  // Scene Backgrounds — wide 1536x1024 landscape framing. Underground/interior locations are
  // single fixed-lighting shots; outdoor or sky-exposed locations get matching day/night pairs
  // so the game can later swap between them. Public, lived-in places use SCENE_STYLE_LIVED_IN
  // with generic background figures instead of being deserted — everything else stays empty.
  { file: 'scenes/tavern.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} Interior of a medieval fantasy tavern at night, modestly busy with anonymous patrons: low ceiling with hanging lanterns, rough wooden tables and benches with travelers eating and drinking, a roaring fireplace, a barkeep wiping down the counter, warm hazy light and curling pipe-smoke, no single figure singled out or facing the viewer.` },
  { file: 'scenes/dungeon-corridor.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty stone dungeon corridor stretching into darkness, torch sconces on the walls casting orange pools of light, a damp stone floor, ancient carved reliefs on the walls, no one in sight.` },
  { file: 'scenes/dungeon-chamber.png', size: '1536x1024', prompt: `${SCENE_STYLE} A large, empty underground dungeon chamber, cracked stone pillars, a glowing runic floor, scattered bones and old equipment in the corners, a vaulted ceiling lost in shadow, no creatures present.` },

  { file: 'scenes/forest-road-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty dark-fantasy forest road through ancient twisted trees by day, dappled sunlight breaking through the canopy in golden shafts, dust motes drifting, dew glistening on the undergrowth, not a soul on the path. This is the daytime counterpart to a night version of the exact same road, trees, and camera angle — keep the composition and framing identical, changing only the light and sky.` },
  { file: 'scenes/forest-road-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty dark forest road through ancient twisted trees at night, pale moonlight breaking through the canopy in cool silver shafts, mist pooling at ground level, eerie quiet, not a soul on the path. This is the nighttime counterpart to a daytime version of the exact same road, trees, and camera angle — keep the composition and framing identical, changing only the light and sky.` },

  { file: 'scenes/forest-clearing-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty forest clearing by day, ancient stone ruins partially reclaimed by moss and vines, butterflies drifting through warm sunbeams, a still pond reflecting the bright sky, no one present. This is the daytime counterpart to a night version of the exact same clearing and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/forest-clearing-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty moonlit forest clearing at night, ancient stone ruins partially reclaimed by moss and vines, fireflies drifting, the still dark pond reflecting the stars, no one present. This is the nighttime counterpart to a daytime version of the exact same clearing and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/castle-gate-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} The imposing gates of a dark stone castle by day under an overcast sky, empty of any figures: drawbridge lowered over a moat, banners hanging limp on the battlements, distant crows overhead, no guards or travelers in view. This is the daytime counterpart to a dusk version of the exact same gate and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/castle-gate-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same imposing gates of a dark stone castle at dusk, empty of any figures: drawbridge lowered over the moat, torches lit on the battlements, ravens circling the towers against a darkening violet sky, no guards or travelers in view. This is the dusk/night counterpart to a daytime version of the exact same gate and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/throne-room.png', size: '1536x1024', prompt: `${SCENE_STYLE} A grand but oppressive throne room, completely empty: high vaulted ceilings, banners hanging in shadow, a massive stone throne standing vacant on a raised dais, cold blue light slanting through narrow windows.` },

  { file: 'scenes/marketplace-day.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A bustling medieval fantasy marketplace by day: merchant stalls draped in colorful awnings, cobblestone streets filled with anonymous shoppers and traders going about their business, half-timbered buildings, a stone fountain at the center, warm midday sun, no single figure singled out or facing the viewer. This is the daytime counterpart to a quieter night version of the exact same square and camera angle — keep the composition and architecture identical, changing only the light, sky, and crowd density.` },
  { file: 'scenes/marketplace-night.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} The same medieval fantasy marketplace square at night, much quieter: shuttered merchant stalls, a few lantern-lit vendors and late travelers passing through, cobblestone streets, half-timbered buildings, the stone fountain glowing faintly under starlight and hanging lanterns, no single figure singled out or facing the viewer. This is the nighttime counterpart to a busy daytime version of the exact same square and camera angle — keep the composition and architecture identical, changing only the light, sky, and crowd density.` },

  { file: 'scenes/cave-entrance.png', size: '1536x1024', prompt: `${SCENE_STYLE} The empty mouth of a dark cave in a rocky hillside, ancient carvings around the entrance, old bones scattered at the threshold, torchlight glowing faintly from within, ominous and still, no creatures visible.` },

  { file: 'scenes/ancient-ruins-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} Empty ancient crumbling stone ruins of a once-great civilization by day, massive fallen columns, jungle reclaiming the stonework in bright dappled sunlight, a central altar standing alone, no explorers or creatures present. This is the daytime counterpart to a night version of the exact same ruins and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/ancient-ruins-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty ancient crumbling stone ruins at night, massive fallen columns, jungle reclaiming the stonework, a central altar standing alone under bright moonlight, no explorers or creatures present. This is the nighttime counterpart to a daytime version of the exact same ruins and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/mountain-pass-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty treacherous mountain pass by day, a narrow stone path along a sheer cliff, bright cold sunlight breaking through scattered clouds, distant snow-capped peaks, no travelers on the trail. This is the daytime counterpart to a dusk version of the exact same pass and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/mountain-pass-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty treacherous mountain pass at dusk, a narrow stone path along a sheer cliff, a stormy violet sky, distant snow-capped peaks catching the last light, no travelers on the trail. This is the dusk/night counterpart to a daytime version of the exact same pass and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/harbor-day.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A fantasy harbor by day, lightly active: fishing boats and a warship moored at weathered docks, anonymous dockhands and sailors at a middle distance going about their work, gulls overhead, sun glinting off the water, a distant lighthouse. This is the daytime counterpart to a deserted night version of the exact same harbor and camera angle — keep the composition and architecture identical, changing only the light, sky, and activity level.` },
  { file: 'scenes/harbor-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same dark fantasy harbor at night, deserted: fishing boats and a warship moored at weathered docks, lantern reflections rippling in oily water, fog rolling in from the sea, the distant lighthouse beaming, not a soul on the docks. This is the nighttime counterpart to an active daytime version of the exact same harbor and camera angle — keep the composition and architecture identical, changing only the light, sky, and activity level.` },

  { file: 'scenes/battlefield-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} The aftermath of a great battle on an open plain by day, now empty of the living: broken weapons half-buried in muddy earth, ravens picking at the wreckage from a distance, smoke rising from far-off fires under a grim grey sky, a single tattered banner standing in the mud. This is the daytime counterpart to a stormier night version of the exact same battlefield and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/battlefield-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same aftermath of a great battle on an open plain at night, now empty of the living: broken weapons half-buried in muddy earth, distant fires glowing like embers under a stormy moonlit sky, a single tattered banner standing in the mud, ravens silhouetted against the clouds. This is the nighttime counterpart to a daytime version of the exact same battlefield and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/crypt.png', size: '1536x1024', prompt: `${SCENE_STYLE} An ancient underground crypt, empty and silent: stone sarcophagi resting in alcoves, cobwebs draped over carvings, a single burning brazier, skull reliefs carved into the walls, no figures present.` },
  { file: 'scenes/wizard-tower.png', size: '1536x1024', prompt: `${SCENE_STYLE} The interior of a wizard's tower laboratory, unoccupied: shelves lined with glowing vials and ancient tomes, a celestial orrery turning slowly on its own, arcane diagrams etched into the floor, a night sky visible through a circular window.` },

  { file: 'scenes/snowy-pass-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty snow-choked mountain pass by day, jagged icy cliffs, wind-blown drifts burying a narrow trail, pale winter sun behind thin clouds, frozen breath-mist hanging in the air, no travelers in sight. This is the daytime counterpart to a night version of the exact same pass and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/snowy-pass-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty snow-choked mountain pass at night, jagged icy cliffs glowing pale blue under a sky thick with stars and the aurora, wind-blown drifts burying the narrow trail, no travelers in sight. This is the nighttime counterpart to a daytime version of the exact same pass and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/swamp-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty murky swamp by day, twisted mangrove roots rising from still green-brown water, hanging moss, shafts of grey daylight filtering through a misty canopy, dragonflies skimming the surface, no one wading through. This is the daytime counterpart to a night version of the exact same swamp and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/swamp-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty murky swamp at night, twisted mangrove roots rising from still black water, hanging moss, will-o'-the-wisps glowing sickly green over the water, a thick low fog, no one wading through. This is the nighttime counterpart to a daytime version of the exact same swamp and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/desert-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty desert of towering sand dunes by day, blazing sun overhead, heat shimmer rising off the sand, the bleached bones of some great beast half-buried near a lone weathered rock formation, no travelers in sight. This is the daytime counterpart to a night version of the exact same dunes and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/desert-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty desert of towering sand dunes at night, a vast star-filled sky, cold blue moonlight raking across rippled sand, the same lone weathered rock formation casting a long shadow, no travelers in sight. This is the nighttime counterpart to a daytime version of the exact same dunes and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/graveyard-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty old graveyard under open sky by day, rows of weathered tombstones and leaning iron-fenced plots, bare gnarled trees, overcast grey light, crows perched on headstones, no mourners or figures present. This is the daytime counterpart to a night version of the exact same graveyard and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/graveyard-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty old graveyard under open sky at night, rows of weathered tombstones and leaning iron-fenced plots, bare gnarled trees silhouetted against a full moon, drifting fog pooling between the graves, no mourners or figures present. This is the nighttime counterpart to a daytime version of the exact same graveyard and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/campsite-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty wilderness campsite by day, abandoned mid-rest: a low campfire smoldering to grey ash, bedrolls laid out around it, packs and waterskins left leaning on a fallen log, tents pitched at the treeline, bright midday sunlight filtering through the forest canopy, no one currently there. This is the daytime counterpart to a dusk version of the exact same campsite and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/campsite-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty wilderness campsite at dusk, abandoned mid-rest: a low campfire crackling down to embers, bedrolls laid out around it, packs and waterskins left leaning on a fallen log, tents pitched at the treeline, a forest backdrop fading into blue twilight, no one currently there. This is the dusk/night counterpart to a daytime version of the exact same campsite and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/ship-deck-day.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} The open deck of a fantasy sailing ship by day, lightly crewed: taut rigging and billowing sails against a bright sky, anonymous sailors at a middle distance coiling rope and working the rigging, sea spray catching the sun, the open ocean stretching to the horizon, no single figure singled out or facing the viewer. This is the daytime counterpart to a quieter night version of the exact same deck and camera angle — keep the composition and rigging identical, changing only the light, sky, and activity level.` },
  { file: 'scenes/ship-deck-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same open deck of a fantasy sailing ship at night, deserted at the helm: taut rigging and furled sails silhouetted against a star-strewn sky, a lantern swaying gently near the wheel, moonlight rippling on the dark ocean stretching to the horizon, not a soul on deck. This is the nighttime counterpart to a lightly-crewed daytime version of the exact same deck and camera angle — keep the composition and rigging identical, changing only the light, sky, and activity level.` },

  { file: 'scenes/sewer.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty stone sewer tunnel beneath a city, ankle-deep murky water reflecting faint light from a grate far above, slick mossy brick walls, chains and rusted gratings, dripping echoes, no creatures in sight.` },

  { file: 'scenes/bridge-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty ancient stone bridge spanning a deep misty chasm by day, weathered statues lining the railings, bright daylight breaking through drifting clouds below, a waterfall thundering somewhere in the depths, no travelers crossing. This is the daytime counterpart to a night version of the exact same bridge and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/bridge-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty ancient stone bridge spanning a deep misty chasm at night, weathered statues lining the railings, moonlight cutting through drifting fog below, a waterfall glinting silver somewhere in the depths, no travelers crossing. This is the nighttime counterpart to a daytime version of the exact same bridge and camera angle — keep the composition identical, changing only the light and sky.` },

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
// Skin tones are baked in here too (matching the spirit of the base portraits)
// so the female variants read as part of the same diverse cast.
const RACE_FLAVOR = {
  human: 'deep brown skin, a strong jaw, weathered face, determined eyes, dark hair, battered but well-kept leather armor',
  elf: 'warm olive-tan skin, sharp angular features, long flowing hair, piercing eyes, pointed ears, elegant bone structure, fine forest-green garb',
  dwarf: 'ruddy tan skin, a thick braided beard with iron rings, a broad face, deep-set eyes, hammered steel pauldrons',
  halfling: 'warm brown skin, curly hair, bright curious eyes, rosy cheeks, a small frame, a patched traveling cloak',
  gnome: 'light olive skin, wild hair sticking out at angles, enormous goggles pushed up on the forehead, bright inquisitive eyes, mechanical trinkets on the collar',
  'half-orc': 'grey-green skin, small upward tusks, a powerful jaw, amber eyes, ritual scars, iron-plated armor',
  tiefling: 'deep crimson skin, small curved black horns, glowing gold eyes with no pupils, elegant features, dark arcane robes',
  dragonborn: 'scaled skin, reptilian amber eyes, a regal angular face, subtle horns sweeping back, ornate scaled armor',
};

// Override hooks for races whose base RACE_FLAVOR reads as male-coded (e.g. a beard) —
// without this, "a woman of the dwarf people, with a thick braided beard..." reads as a man.
const RACE_FLAVOR_FEMALE = {
  dwarf: 'ruddy tan skin, thick braided hair worked with iron rings, a strong handsome face, deep-set eyes, hammered steel pauldrons',
};


function raceVariantAsset(file) {
  const base = file.replace('races/', '').replace('.png', '');
  const tokens = base.split('-');
  const race = tokens[0] === 'half' ? 'half-orc' : tokens[0];
  const rest = tokens[0] === 'half' ? tokens.slice(2) : tokens.slice(1);
  const genderDesc = rest.includes('f') ? 'a woman' : rest.includes('m') ? 'a man' : 'a figure';
  const toneDesc = rest.includes('black') ? ', with a deep dark complexion' : '';
  const isWoman = rest.includes('f');
  const flavor = (isWoman && RACE_FLAVOR_FEMALE[race]) || RACE_FLAVOR[race] || 'striking, memorable fantasy features';
  return { file, prompt: `${STYLE} ${genderDesc.charAt(0).toUpperCase()}${genderDesc.slice(1)} of the ${race} people, with ${flavor}${toneDesc}, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing.` };
}

// Just the female portrait per race now — the "light/dark" variant cards are
// gone (see getPortraits in CharacterCreate.tsx); diversity is baked directly
// into each race's illustrated look instead.
const RACE_VARIANT_FILES = [
  'races/dragonborn-f.png',
  'races/dwarf-f.png',
  'races/elf-f.png',
  'races/gnome-f.png',
  'races/half-orc-f.png',
  'races/halfling-f.png',
  'races/human-f.png',
  'races/tiefling-f.png',
];

function humanizeSlug(base) {
  return base.split('-').join(' ');
}

// Overrides for items whose generic templated description would otherwise converge with a
// "fancier" sibling item (e.g. "staff wooden" defaulted toward the same glowing-crystal look
// as "staff elemental" / "staff arcane" — a plain mundane staff needs to explicitly NOT have one).
const ITEM_FLAVOR = {
  'staff-wooden': 'a plain gnarled wooden traveler\'s walking staff, worn smooth by years of use, no gemstone, no magical glow, no crystal — entirely mundane, just simple carved wood and a leather wrist-strap',
  'staff-arcane': 'an ornate wizard\'s staff carved with glowing arcane sigils, topped with a crackling orb of magical energy held in a metal claw-mount — unmistakably enchanted',
  'staff-elemental': 'a twisted elemental staff with a raw glowing crystal fused directly into its crown, wisps of elemental energy (fire, frost, or lightning) curling from the stone — unmistakably magical',
};

function itemIconAsset(file) {
  const base = file.replace('items/', '').replace('.png', '');
  const flavor = ITEM_FLAVOR[base];
  const subject = flavor ? flavor : `a richly detailed fantasy ${humanizeSlug(base)}, believable wear, materials, and craftsmanship`;
  return { file, prompt: `${STYLE} Item icon: ${subject}, telling a small story at a glance. Square icon, dark background, dramatic rim lighting.` };
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

// Distinct pose/expression/gear per enemy — without this, every "menacing ___, dynamic pose"
// portrait converges on the same raised-clawed-hand gesture and near-identical silhouettes
// (the bandit and bandit-leader were nearly indistinguishable).
const ENEMY_FLAVOR = {
  assassin: 'crouched low and coiled to strike, twin curved daggers held low and reversed, a hooded face with only narrowed eyes visible, utterly still and watchful',
  'bandit-leader': 'standing with arrogant confidence, a notched cutlass resting on one shoulder, a scarred smirking face, decorated with looted jewelry and a tattered fine-cloth cloak over patchwork leathers',
  bandit: 'mid-lunge with a rusty short-sword raised overhead, a desperate snarling face, ragged mismatched leathers and a crude improvised shield',
  cultist: 'kneeling in mid-chant with both arms spread wide in ritual offering, eyes rolled back in fervor, a branded forehead, dark ceremonial robes marked with crude sigils',
  'dark-knight': 'standing in heavy battle-stance with a massive two-handed blade planted point-down before him, faceless horned helm, cracked black plate armor wreathed in cold mist',
  'dark-wizard': 'mid-incantation with a gnarled staff thrust forward, swirling runes of dark energy spiraling around the staff-head, a gaunt sneering face lit from below by violet light',
  demon: 'roaring with both clawed arms thrown wide, massive curling horns, leathery wings half-unfurled, cracked obsidian-like hide glowing with internal magma veins',
  'dragon-ancient': 'rearing back with jaws wide and throat glowing before a breath attack, immense ridged horns and ancient battle-scarred scales, wings filling the frame',
  'dragon-young': 'perched alert on broken stone with wings half-spread and head low, sleek smooth scales, sharp curious predatory eyes, smoke curling from its nostrils',
  'fallen-paladin': 'standing solemn and upright with a corrupted holy blade reversed and driven into the ground before him, a cracked halo of sickly light over a grim weathered face, tarnished sacred armor',
  ghost: 'drifting sideways through the air with one translucent hand reaching slowly toward the viewer, a sorrowful hollow-eyed face, tattered spectral robes dissolving into mist',
  'giant-rat': 'hunched low on all fours mid-skitter, yellowed oversized incisors bared, mangy patchy fur, beady red eyes catching the light',
  'giant-spider': 'rearing up on its hind legs with forelegs raised, rows of glinting eyes, dripping fangs, coarse bristled body looming large',
  'goblin-shaman': 'hunched over a crude bone totem staff, one hand cupping a flickering ball of crackling green energy, warpaint-streaked face twisted in a cackling grin, festooned with charms and trophies',
  goblin: 'darting forward low to the ground with a jagged little blade held in a reverse grip, a wide gap-toothed grin, scrappy mismatched scavenged armor',
  harpy: 'banking sharply mid-flight with talons extended toward the viewer, wild matted hair, cruel piercing eyes, feathered wings catching firelight',
  imp: 'perched casually on a ledge with a barbed tail flicking, a sly knowing smirk, small leathery wings folded, idly inspecting its claws',
  lich: 'floating motionless with arms folded, an ornate crown atop a bare skull, a phylactery glowing at its chest, tattered regal robes hanging from a skeletal frame, utterly cold and composed',
  'mind-flayer': 'standing perfectly still with four tentacles drifting slowly around an elongated head, glowing violet eyes, an ornate high-collared robe, an aura of unsettling calm intelligence',
  necromancer: 'standing amid rising skeletal hands clawing up from the ground around him, a thin gaunt face lit by sickly green witch-light cupped in one palm, dark tattered funeral-style robes',
  ogre: 'mid-swing with a massive crude club gripped in both hands, a dull brutish snarling face, lopsided tusks, patchwork hide armor straining over a hulking frame',
  'orc-warchief': 'planting a massive battle-standard into the ground with one hand while the other rests on an axe at his belt, a heavily scarred commanding face, ornate trophy-laden armor',
  'orc-warrior': 'charging forward with a notched battle-axe raised high in both hands, tusked snarling face, crude spiked plate armor',
  'sea-monster': 'erupting from churning water with multiple barbed tentacles thrashing, a cavernous tooth-lined maw, bioluminescent markings glowing along its hide',
  'shadow-demon': 'half-formed and rippling at the edges, reaching with a single elongating clawed arm, a featureless smoke-wreathed face with two burning pinpoint eyes, the rest of its form dissolving into living darkness',
  'skeleton-archer': 'kneeling and drawing back a longbow with an arrow nocked and aimed at the viewer, hollow eye sockets fixed in concentration, weathered leather scraps over bare bone',
  skeleton: 'shambling forward with a chipped short-sword dragging at its side, jaw hanging slack, bits of rusted armor rattling loosely on bare bone',
  succubus: 'reclining with effortless poise against a throne of bone, one taloned hand idly trailing along the armrest, a knowing half-lidded smile, dramatic curling horns and folded wings',
  troll: 'caught mid-stride dragging a massive uprooted tree trunk as a club, a slack drooling underbite, warty mottled green-grey hide, regenerating wounds visibly knitting shut',
  vampire: 'standing with theatrical poise and a hand extended in mock invitation, an elegant cruel smile baring long fangs, an opulent high-collared cape, pale aristocratic features',
  warlord: 'standing with one boot on a fallen banner, a heavy warhammer slung casually across the shoulders, a hard battle-worn face crossed with old scars, ornate war-trophy armor',
  wight: 'standing rigid with both arms slowly raising in command, frost-pale dead eyes glowing faint blue, tattered burial shrouds over ancient corroded armor, a chill mist pooling at its feet',
  wolf: 'low and stalking with hackles raised and teeth bared in a silent snarl, sharp intelligent eyes locked on the viewer, matted fur bristling',
  wyvern: 'landing hard with wings flared wide for balance, a barbed tail curling high and ready to strike, a long sinuous neck and narrow predatory head',
  zombie: 'lurching forward with both arms outstretched and slack, a vacant rotted face, exposed bone and tattered grave-clothes, moving with dead-eyed momentum',
};

function enemyPortraitAsset(file) {
  const base = file.replace('enemies/', '').replace('.png', '');
  const flavor = ENEMY_FLAVOR[base] || 'a unique dynamic pose and expression that sets it apart from other creatures in the bestiary';
  return { file, prompt: `${STYLE} Portrait of a menacing ${humanizeSlug(base)}: ${flavor}. Dramatic lighting, strong readable silhouette, full of threat and personality, fitting a painterly animated-fantasy bestiary, every creature posed and gestured distinctly from the rest of the roster. Waist-up composition, dark atmospheric background.` };
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
      size: asset.size || '1024x1024',
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
