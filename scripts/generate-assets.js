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
  // Ten distinct narrator personas — one is assigned per campaign and stays consistent
  // throughout it (see pickNarratorPortrait in NarratorBox), rather than swapping portraits
  // by message-to-message mood (that made the same DM look like a different person each beat).
  { file: 'dm/dm-01.png', prompt: `${STYLE} An ancient human sage dungeon master, long silver beard, deep knowing eyes, star-dusted dark blue robes, seated at a shadowed table lit by a single candle, surrounded by towering stacks of ancient tomes. Portrait composition, waist up, calm and watchful expression.` },
  { file: 'dm/dm-02.png', prompt: `${STYLE} A mysterious hooded elf woman dungeon master, sharp angular features, long silver hair, faintly glowing rune-tattoos along her temples and hands, dark forest-green robes, candlelight catching one eye beneath her hood. Portrait composition, waist up, calm enigmatic expression.` },
  { file: 'dm/dm-03.png', prompt: `${STYLE} A grizzled one-eyed dwarven loremaster dungeon master, a thick braided grey beard with iron rings, an old battle-scar across the missing eye, hunched over a massive open tome, hammered-steel reading spectacles, warm hearth-light. Portrait composition, waist up, gruffly thoughtful expression.` },
  { file: 'dm/dm-04.png', prompt: `${STYLE} An enigmatic spectral narrator figure, its hood pulled low over a face that is an ever-shifting void scattered with tiny stars, wisps of cosmic mist trailing from its dark robes, faint constellations drifting across the fabric. Portrait composition, waist up, otherworldly and serene presence.` },
  { file: 'dm/dm-05.png', prompt: `${STYLE} A regal tiefling woman dungeon master, deep crimson skin, elegant curling black horns, glowing gold eyes with no pupils, draped in dark velvet and gold filigree, a knowing half-smile, candlelight glinting off jeweled rings. Portrait composition, waist up, composed and faintly amused expression.` },
  { file: 'dm/dm-06.png', prompt: `${STYLE} A wizened gnome chronicler dungeon master, wild white hair escaping a patched scholar's cap, tiny round glowing spectacles, perched on a tower of leaning books with an oversized quill in hand, ink-stained fingers. Portrait composition, waist up, bright inquisitive expression.` },
  { file: 'dm/dm-07.png', prompt: `${STYLE} A masked traveling storyteller dungeon master, a simple painted wooden mask with a serene carved smile, a patchwork motley cloak of mismatched fabrics and trinkets, holding up a single flickering candle that lights the whole frame. Portrait composition, waist up, theatrical storyteller's pose.` },
  { file: 'dm/dm-08.png', prompt: `${STYLE} A towering horned figure dungeon master wreathed in calm violet witch-flame, charcoal-dark skin, curling obsidian horns, surprisingly warm and courteous golden eyes, fine dark formal robes, fire licking harmlessly along his fingertips as he gestures in invitation. Portrait composition, waist up, unexpectedly gracious expression.` },
  { file: 'dm/dm-09.png', prompt: `${STYLE} A draconic sage dungeon master, shimmering bronze-green scaled skin, ancient knowing reptilian eyes, subtle horns swept back, wrapped in a scholar's layered robes and reading-shawl, a small hoard of glowing trinkets at the table's edge. Portrait composition, waist up, patient ageless expression.` },
  { file: 'dm/dm-10.png', prompt: `${STYLE} A weathered half-orc bard dungeon master, grey-green skin, small tusks, a battle-scarred but warm face, leaning casually on a carved lute-staff, a worn traveling cloak over patchwork armor, firelight flickering across an easy knowing grin. Portrait composition, waist up, warm and roguish expression.` },

  // Race Portraits — same shared scene/lighting (RACE_BACKGROUND) so the whole roster reads as one cast.
  // Skin tones are deliberately varied across the cast so the roster reads as
  // diverse on its own, without needing separate "light/dark" variant cards.
  { file: 'races/human.png', prompt: `${STYLE} A male human warrior with dark brown skin, a broad strong jaw with slight natural asymmetry, a wide flat nose with broad nostrils, weathered crow's-feet at deep-set dark brown eyes under a heavy brow, short natural black hair with grey at the temples, battered leather armor, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/elf.png', prompt: `${STYLE} A male elf with warm medium-brown skin, an extremely elongated narrow skull, dramatically high sharp cheekbones, a long straight nose, enormous upswept almond eyes of vivid violet, ears tapering to a very long exaggerated point, long angular jaw — distinctly non-human bone structure, fine forest-green garb, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/dwarf.png', prompt: `${STYLE} A male dwarf warrior with rich dark brown skin, a very wide broad skull, an extremely low heavy brow ridge, a very wide flat nose with broad nostrils, a square jaw nearly as wide as the skull, a magnificent thick braided dark beard wound with iron rings, deep-set dark eyes, hammered steel pauldrons, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/halfling.png', prompt: `${STYLE} A male halfling with warm medium-brown skin, a very round full skull with plump rounded cheeks, a small wide upturned nose, very large bright green eyes set wide apart, short tight-coiled black hair, prominent rounded ears slightly larger than human, small dimpled chin, patched traveling cloak, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/gnome.png', prompt: `${STYLE} A male gnome with warm olive-brown skin, an oversized domed forehead nearly twice the height of the lower face, enormous round amber eyes behind thick goggle lenses pushed up on his brow, a very small pointed chin, a large expressive bulbous nose, wild salt-and-pepper hair defying gravity, mechanical collar trinkets, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/half-orc.png', prompt: `${STYLE} A male half-orc with grey-green skin over dark brown undertones, a jutting underbite with two prominent upward-curving tusks, a very wide flat nose with broad flared nostrils, a heavy protruding brow ridge, wide-set amber eyes under thick brows, a powerful broad jaw, ritual scarring across brow and cheeks, iron-plated armor, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/tiefling.png', prompt: `${STYLE} A male tiefling with vivid deep crimson skin, two prominent smooth curving black horns rising from the forehead — unmistakably demonic not decorative, entirely solid gold irises with no pupil or white, angular cheekbones, a slightly too-wide jaw, subtly pointed teeth just visible, spaded tail tip at the shoulder, dark arcane robes, strong square male jaw. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },
  { file: 'races/dragonborn.png', prompt: `${STYLE} A male dragonborn with overlapping bronze-gold scales instead of skin, a fully reptilian head — no hair, a flat broad snout with visible nostrils, rigid bony brow ridges, amber slit-pupil eyes set wide on the skull, a long neck, horns swept back from the crown, ornate scaled armor, calm expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` },

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

  // ── NEW INTERIOR SCENES ────────────────────────────────────────────────────
  { file: 'scenes/blacksmith-forge.png', size: '1536x1024', prompt: `${SCENE_STYLE} The interior of an empty blacksmith forge, roaring furnace bathing everything in orange-red firelight, an anvil at center, hammers and tongs hanging on the wall, sparks frozen in the air, no smith present.` },

  { file: 'scenes/library-archives.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty grand library with soaring shelves of ancient tomes reaching the ceiling, rolling ladders on brass rails, dust motes drifting through shafts of amber candlelight, globes and arcane instruments on reading tables, utterly silent and unoccupied.` },

  { file: 'scenes/temple-interior.png', size: '1536x1024', prompt: `${SCENE_STYLE} The empty interior of a grand fantasy temple, soaring stone columns, coloured light streaming through stained-glass rose windows, a central altar with a burning eternal flame, incense smoke curling toward the vaulted ceiling, no worshippers present.` },

  { file: 'scenes/prison-cell.png', size: '1536x1024', prompt: `${SCENE_STYLE} A grim dungeon prison block, empty stone cells with iron bar doors, chains hanging from damp walls, a single torch flickering in the corridor, straw scattered on the floor, no prisoners, utterly silent.` },

  { file: 'scenes/feast-hall.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A grand medieval feast hall mid-banquet, long trestle tables set with food and drink, anonymous feasting nobles and servants in the background going about the celebration, torchlight and chandeliers, tapestries on the stone walls, no single figure singled out.` },

  { file: 'scenes/barracks.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty military barracks interior, rows of iron-frame bunks with rough blankets, equipment and armour hanging on pegs, a weapon rack along one wall, a single lantern swinging, no soldiers present.` },

  { file: 'scenes/alchemist-lab.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty alchemist's laboratory, bubbling retorts and coiled glass tubes on stone benches, shelves of labelled specimen jars and glowing vials, arcane diagrams on the walls, a smoky haze and strange coloured vapours, no one working.` },

  { file: 'scenes/thieves-den.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A dim underground thieves guild den, anonymous cloaked figures at a middle distance huddled over maps and dice games, low vaulted brick ceiling with hanging lanterns, a board covered in job-notices and wanted posters, no single figure singled out or facing the viewer.` },

  { file: 'scenes/apothecary.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A crowded herbalist apothecary shop interior, drying herbs hanging from the rafters, shelves crammed with potion bottles and ingredient jars, an anonymous shopkeeper at the back counter partially turned away, warm herb-scented candlelight, no one singled out facing the viewer.` },

  { file: 'scenes/gambling-den.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A smoky underground gambling den, anonymous gamblers around card and dice tables in the background, a haze of pipe-smoke, dim oil lamps over green cloth tables, no single figure singled out or facing the viewer.` },

  { file: 'scenes/arena.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} An ancient stone gladiatorial arena, sand floor ringed by tiered stone seats filled with anonymous cheering crowds in the background at a distance, twin iron gates at either end standing open, torches lighting the ring, no fighter on the sand.` },

  { file: 'scenes/magic-shop.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty enchanted curio shop, shelves overflowing with glowing artefacts and curiosities, arcane instruments spinning slowly on their own, a glass case of luminous gemstones, candles that burn in impossible colors, no shopkeeper visible.` },

  // ── NEW OUTDOOR SCENES ─────────────────────────────────────────────────────
  { file: 'scenes/coastal-cliffs-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} Empty coastal cliffs by day, sheer white rock faces dropping to churning teal ocean far below, seabirds wheeling overhead, waves crashing against rocks, bright sea wind, not a soul on the cliff path. This is the daytime counterpart to a night version of the exact same cliffs and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/coastal-cliffs-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty coastal cliffs at night, sheer rock faces silver in moonlight, dark churning ocean below, waves crashing, stars over open water, not a soul on the cliff path. This is the nighttime counterpart to a daytime version of the exact same cliffs and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/plains-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} Vast empty rolling grassland plains by day, golden and green grass swaying in wind under an enormous open sky, a single dirt road vanishing toward the horizon, a distant farmstead barely visible, no travelers present. This is the daytime counterpart to a night version of the exact same plains and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/plains-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same vast empty rolling grassland plains at night, silver grass rippling under a huge starfield, the Milky Way blazing overhead, a single dirt road stretching to the horizon, no travelers present. This is the nighttime counterpart to a daytime version of the exact same plains and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/jungle-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty dense jungle by day, impossibly tall trees forming a cathedral canopy, beams of brilliant light cutting through green shadow, enormous hanging vines, exotic flowers, the sound of unseen birds implied in the stillness, no travelers visible. This is the daytime counterpart to a night version of the exact same jungle and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/jungle-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty dense jungle at night, bioluminescent fungi glowing softly along the roots, moonlight barely penetrating the canopy, fireflies drifting, cool blue-green darkness, no travelers visible. This is the nighttime counterpart to a daytime version of the exact same jungle and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/volcanic-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty volcanic landscape by day, rivers of slow orange lava cutting through black obsidian rock, ash falling like grey snow, a smoldering volcano in the background, sulfurous steam venting from fissures, no travelers present. This is the daytime counterpart to a night version of the exact same volcanic landscape and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/volcanic-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty volcanic landscape at night, lava rivers glowing vivid orange against black rock, the volcano lit dramatically from within, ash clouds backlit by molten light, no travelers present. This is the nighttime counterpart to a daytime version of the exact same volcanic landscape and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/fey-forest-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty enchanted fey forest by day, impossibly vivid colors, luminous flowers, colossal mushrooms at impossible scale, a path of silver moss, hanging lanterns of trapped firelight between the branches, no travelers present. This is the daytime counterpart to a night version of the exact same fey forest and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/fey-forest-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty enchanted fey forest at night, softly glowing flowers, giant bioluminescent mushrooms, will-o'-the-wisps floating between dark roots, silver moonlight filtering through an impossible canopy, no travelers present. This is the nighttime counterpart to a daytime version of the exact same fey forest and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/underdark.png', size: '1536x1024', prompt: `${SCENE_STYLE} The empty Underdark, a vast underground cavern stretching into impenetrable darkness, massive glowing mushrooms in blues and purples, stalactites hanging from a ceiling lost in shadow, a subterranean lake reflecting faint bioluminescent light, utterly silent, no creatures visible.` },

  { file: 'scenes/farmland-day.png', size: '1536x1024', prompt: `${SCENE_STYLE_LIVED_IN} A peaceful farming village by day, thatched-roof cottages, plowed fields, a dirt lane with anonymous farmers tending crops and walking between buildings at a middle distance, a water mill by a stream, warm golden afternoon light, no single figure singled out. This is the daytime counterpart to a quieter evening version — keep the composition identical, changing only the light and activity level.` },
  { file: 'scenes/farmland-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same peaceful farming village at night, thatched-roof cottages with warm window-light, plowed fields in moonlight, a dirt lane, the water mill still, woodsmoke drifting up from chimneys, utterly quiet, no figures outside. This is the nighttime counterpart to a daytime version — keep the composition identical, changing only the light and activity level.` },

  { file: 'scenes/ruined-city-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty abandoned city by day, crumbling multi-story buildings with hollow windows, weeds and saplings growing through cobblestones, a collapsed plaza fountain, crows picking through rubble, sky visible through roofless halls, not a living soul. This is the daytime counterpart to a night version of the exact same ruined city and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/ruined-city-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty abandoned city at night, crumbling buildings silver in moonlight, hollow window-frames like dark eyes, weeds between cobblestones, starlight through roofless halls, an oppressive silence, not a living soul. This is the nighttime counterpart to a daytime version of the exact same ruined city and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/canyon-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty dramatic canyon by day, towering red-orange stone walls striated in layers, a winding dry riverbed at the bottom, a narrow bright sky above, dust and hawk feathers caught on thermals, no travelers present. This is the daytime counterpart to a night version of the exact same canyon and camera angle — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/canyon-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty canyon at night, towering stone walls darkened to deep rust, a strip of star-filled sky far above, moonlight catching the rock faces in cold blue light, no travelers present. This is the nighttime counterpart to a daytime version of the exact same canyon and camera angle — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/riverside-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty forested riverside by day, a wide river with a clear shallow ford, smooth river stones, overhanging willows and alder, dappled sunlight on the water, dragonflies skimming, no travelers crossing. This is the daytime counterpart to a night version — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/riverside-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty forested riverside at night, the river shimmering under moonlight, willows draped in silver, soft mist rising from the water, frogs and crickets implied in the stillness, no travelers crossing. This is the nighttime counterpart to a daytime version — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/watchtower-day.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty stone watchtower on a high hill by day, crenellated battlements, a signal fire pit at the top, vast landscape visible beyond — forest, road, distant mountains — wide blue sky, no guards present. This is the daytime counterpart to a night version — keep the composition identical, changing only the light and sky.` },
  { file: 'scenes/watchtower-night.png', size: '1536x1024', prompt: `${SCENE_STYLE} The same empty stone watchtower at night, the signal fire burning at the top casting orange light over the battlements, a vast dark landscape below, stars overhead, no guards present. This is the nighttime counterpart to a daytime version — keep the composition identical, changing only the light and sky.` },

  { file: 'scenes/ice-cave.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty glacial ice cave, walls and ceiling of blue-white translucent ice, pale cold light filtering through from above, breath-mist frozen in the air, icicles of impossible size, no explorers present.` },

  { file: 'scenes/flooded-ruins.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty partially flooded underground ruin, knee-deep dark water covering a mosaic floor, ancient columns rising above the waterline, light shimmering up through the still surface, submerged stone carvings visible below, no explorers present.` },

  { file: 'scenes/sky-realm.png', size: '1536x1024', prompt: `${SCENE_STYLE} An empty floating island in the clouds, green grass at the edge dropping off into endless blue sky, ancient stone ruins atop the island, the world far below visible through drifting cloud, no travelers present. Wide cinematic framing.` },

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
// Anti-default directive appended to every race portrait prompt.
// Fights the model's tendency toward European features and idealized beauty.
const RACE_DIVERSITY = 'Draw from the full spectrum of global human ethnic diversity — dark skin tones, broad noses, wide faces, natural hair textures. Not European by default. Not a model or hero archetype — a real person with natural imperfect features, asymmetry, lived-in face. NOT conventionally beautiful or idealized.';

const RACE_FLAVOR = {
  human: 'dark brown skin with warm undertones, a broad strong jaw with slight asymmetry, wide flat nose with broad nostrils, weathered crow feet at deep-set dark brown eyes under a heavy brow, short natural black hair with grey at the temples, battered leather armor — looks like someone who has actually lived',
  elf: 'warm medium-brown skin, an extremely elongated narrow skull, dramatically high sharp cheekbones, a long straight nose, enormous upswept almond eyes of vivid violet, ears that taper to a very long exaggerated point, angular jaw with almost no curve — distinctly non-human bone structure, fine forest-green garb',
  dwarf: 'rich dark brown ruddy skin, a very wide broad skull, an extremely low heavy brow ridge, a very wide flat nose with broad nostrils, a square jaw nearly as wide as the skull, deep-set dark eyes, a magnificent thick braided dark beard wound with iron rings, hammered steel pauldrons',
  halfling: 'warm medium-brown skin, a very round full skull with plump rounded cheeks, a small wide upturned nose, very large bright green eyes set wide apart, short tight-coiled black hair, prominent rounded ears slightly larger than human, small dimpled chin — genuine not cute-idealized',
  gnome: 'warm olive-brown skin, an oversized domed forehead nearly twice the height of the lower face, enormous round amber eyes behind thick goggle lenses pushed up on the brow, a very small pointed chin, a large expressive bulbous nose, wild salt-and-pepper hair defying gravity, mechanical collar trinkets',
  'half-orc': 'grey-green skin over dark brown undertones, a jutting underbite with two prominent upward-curving tusks, a very wide flat nose with broad flared nostrils, a heavy protruding brow ridge, wide-set amber eyes under thick brows, a powerful broad jaw, ritual scarring — powerful and real-looking not idealized',
  tiefling: 'vivid deep crimson skin, two prominent smooth curving black horns rising from the forehead — unmistakably demonic not decorative, entirely solid gold irises with no pupil or white visible, angular cheekbones, a slightly too-wide jaw, subtly pointed teeth just visible, a spaded tail tip at the shoulder edge, dark arcane robes — striking and inhuman not conventionally pretty',
  dragonborn: 'overlapping bronze-gold scales instead of skin, a fully reptilian head — no hair, a flat broad snout with visible nostrils, rigid bony brow ridges, amber slit-pupil eyes set wide on the skull, a long neck, horns swept back from the crown, ornate scaled armor',
  aasimar: 'deep warm brown skin that faintly radiates inner golden light — not glowing just slightly luminous, silver-white natural hair, irises that are a single solid sheet of white-gold with no pupil, the whites of the eyes also faintly lit, a face slightly too still and symmetrical — otherworldly not conventionally pretty, a halo-light at the hairline',
  warforged: 'no organic face — a constructed head of overlapping dark metal plates and carved pale wood, a fixed expressionless faceplate with two inset amber gemstone eyes glowing steadily, articulated jaw of hinged metal, arcane runes etched along the plating, no hair no skin no nose — purely mechanical',
  tabaxi: 'a fully feline head — broad flat cat skull, large forward-facing gold slit-pupil eyes, a flat wide nose, a short muzzle with whisker spots, rounded ears set high on the skull, dark-spotted tawny fur covering the entire face, no human facial features at all',
  'fire-genasi': 'dark brown-black skin as the base — the skin of someone from a hot climate — cracked at the cheekbones and brow with lines of deep orange magma-light beneath, no hair at all replaced by living flame rising from the scalp, eyebrows of flame, solid amber-orange eyes with no white, angular face with wide jaw and broad nose',
  'water-genasi': 'deep teal-brown skin with a subtle wet sheen — dark not pale, the blue is in the tone not the lightness, flowing deep blue-black hair moving as if permanently submerged, entirely solid turquoise eyes with no white or pupil, broad cheekbones, a wide nose, small fin-like structures at the temples like gill crests',
  'earth-genasi': 'dark grey-brown cracked stone skin, hairline fractures running across the forehead and cheeks revealing darker rock beneath, hair replaced by jutting jagged obsidian crystal shards growing from the scalp, eyes that are smooth polished amber gemstones with no pupil, a very broad flat nose, a heavy square jaw of stone',
  'air-genasi': 'medium-brown skin with a cool silver-grey undertone — not pale or white just slightly desaturated, silver-white natural hair perpetually floating in a constant wind, irises of pale silver-blue with no pupil, features slightly unfocused as if always mid-movement, wide nose, softly defined jaw',
  goliath: 'deep blue-grey stone-patterned skin with bold black tribal markings across forehead and cheeks, an extremely massive broad skull, a very wide flat nose, deep-set small pale eyes under a prominent brow shelf, a jaw wider than most humans shoulders, bald, the sheer scale making features seem compressed',
  firbolg: 'soft grey-lavender skin with deep earthy undertones, a very large round head with a broad flat bovine-like face, a very wide flat nose with large nostrils, large floppy rounded ears set low, small gentle pale blue eyes, a wide kind mouth — robes hung with herbs',
  changeling: 'perfectly smooth skin of an indeterminate warm beige-grey with no pores or blemishes, features slightly too symmetrical and slightly too undefined — a nose that is almost but not quite any specific shape, eyes of flat featureless silver-grey, cheekbones forgettable by design, the unsettling quality of a face your eye slides off of',
  kenku: 'a completely avian crow head — glossy black feathers, a sharp heavy curved black beak where the mouth and nose would be, round obsidian eyes set on the sides of the head, a sleek feathered neck, no mammalian facial features whatsoever, patchwork salvaged clothing',
  dhampir: 'deep olive-brown skin drained slightly grey — like a living person with the warmth pulled out, pronounced sharp cheekbones with slight hollows beneath, a strong broad nose, dark eyes with irises of deep red-black, slightly elongated upper canines just visible, dark natural hair, angular features with a corpse-like stillness',
  owlin: 'a complete owl head — dense tawny-brown facial disc of feathers in a flat heart shape, two enormous forward-facing golden eyes taking up most of the face, a small sharp hooked beak, no visible external ears, broad feathered shoulders, a short thick neck',
  lizardfolk: 'fully reptilian head — broad flat skull, a wide blunt-ended snout, amber vertical-slit-pupil eyes set on the upper sides of the skull, no visible lips just hard scale-edged mouth, overlapping dark green scales across the entire face, a pronounced dewlap at the throat, bone and carved-wood adornments',
  satyr: 'warm brown skin on the upper face, two curved ram horns rising from tight curly dark hair, a wide broad nose, a wide easy grin, mischievous dark brown eyes, the lower face slightly more muzzle-forward than human, goat legs visible at the bottom of frame',
  harengon: 'a rabbit head — long upright mobile ears, a small twitching round nose, very large warm brown eyes set slightly to the sides, soft dark-tawny fur covering the entire face, a small mouth, the alert compact posture of someone always listening',
  'yuan-ti': 'warm brown skin with deeply unsettling reptilian intrusions — faint overlapping scale patterns at the temples and along the jaw, slit-pupil golden eyes, a slightly too-wide jaw, a tongue subtly forked when the mouth opens, an aristocratic stillness that never blinks at the right time',
  triton: 'deep teal-blue skin — dark and saturated not pale and grey, small elegant fin-like crests at the temples, entirely solid deep oceanic blue eyes with no white, a broad wide nose, high cheekbones, hair like dark kelp tendrils, scaled shoulder armor',
  leonin: 'a fully lion head — broad powerful feline skull, a wide flat nose, a full proud dark golden mane framing the face, deep amber eyes with round pupils, prominent cheek structure, visible whisker spots on the broad muzzle, rich tawny fur, the bearing of ancient warrior royalty',
  minotaur: 'a complete bull head — broad bovine skull, two large spreading dark horns, a broad flat wet-looking black nose, deep dark brown bovine eyes set wide on the skull, short dark fur, large cupped ears to the sides, heavy muscled neck',
  bugbear: 'a massive shaggy head — dark matted brown-black fur, a very wide flat goblin-like nose, small deep-set yellow eyes under a very low heavy brow, large mobile pointed ears, a wide mouth, the overall shape more like a large bear-goblin hybrid',
  hobgoblin: 'dark reddish-brown skin, a broad flat wide nose, wide-set dark disciplined eyes under a pronounced brow ridge, prominent lower jaw with small lower tusks, slightly pointed ears, military bearing, functional armor with unit insignia — a face built for war not beauty',
  goblin: 'mottled green-grey skin, enormous round yellow eyes dominating the face set very wide apart, a huge wide frog-like mouth full of crooked teeth, a very wide flat nose, enormous bat-like ears that stick out sideways, a receding forehead, the whole face wider than it is tall',
  tortle: 'a turtle head — grey-green rough-textured skin, a broad blunt beak-like mouth replacing lips, round dark patient eyes set wide on a flat broad skull, a very wide flat nose structure, a thick wrinkled neck, the large domed shell behind the shoulders',
};

// Override hooks for races where male base reads too male-coded for female variant.
const RACE_FLAVOR_FEMALE = {
  dwarf: 'rich dark brown ruddy skin, a very wide broad skull, a heavy brow ridge, a very wide flat nose with broad nostrils, deep-set dark eyes, a square jaw, thick braided dark hair worked with iron rings, hammered steel pauldrons — strong and real-looking not pretty',
  goliath: 'deep blue-grey stone-patterned skin with bold black tribal markings, an extremely massive broad skull, a very wide flat nose, deep-set pale eyes under a prominent brow shelf, a jaw wider than most humans shoulders, powerful build',
  bugbear: 'a massive shaggy head, dark matted fur, small deep-set yellow eyes, large upright pointed ears, a wide flat nose, barely contained powerful frame',
  hobgoblin: 'dark reddish-brown skin, a broad flat wide nose, wide-set disciplined dark eyes, small lower tusks, slightly pointed ears, functional armor, controlled military posture',
  minotaur: 'a complete cow head — curved dark horns, broad flat wet black nose, deep dark bovine eyes set wide, short dark fur, large cupped ears, a strong neck, practical warrior gear',
  leonin: 'a fully lioness head — broad powerful feline skull, flat wide nose, short tawny fur with no mane, deep amber eyes, prominent muzzle structure',
};

// Multi-word race slugs that need special parsing
const MULTI_WORD_RACES = [
  'half-orc', 'fire-genasi', 'water-genasi', 'earth-genasi', 'air-genasi',
  'yuan-ti', 'will-o-wisp',
];

function raceVariantAsset(file) {
  const base = file.replace('races/', '').replace('.png', '');
  // Detect female suffix first
  const isWoman = base.endsWith('-f');
  const raceSlug = isWoman ? base.slice(0, -2) : base;
  // Look up display name
  const race = raceSlug;
  const genderDesc = isWoman ? 'a woman' : 'a man';
  const flavor = (isWoman && RACE_FLAVOR_FEMALE[race]) || RACE_FLAVOR[race] || 'striking, memorable fantasy features';
  return { file, prompt: `${STYLE} ${genderDesc.charAt(0).toUpperCase()}${genderDesc.slice(1)} of the ${race} people, with ${flavor}, a calm, composed, neutral expression. ${RACE_BACKGROUND} Head-and-shoulders, facing the viewer, character-select-screen framing. ${RACE_DIVERSITY}` };
}

// Male (base) + female variants per race so character creation always has both options.
// Core PHB male bases are hand-crafted in ASSETS above; only female variants needed here.
const RACE_VARIANT_FILES = [
  // Core PHB — female only (males already defined above with custom prompts)
  'races/dragonborn-f.png',
  'races/dwarf-f.png',
  'races/elf-f.png',
  'races/gnome-f.png',
  'races/half-orc-f.png',
  'races/halfling-f.png',
  'races/human-f.png',
  'races/tiefling-f.png',
  // Expanded races — male (base) + female variants
  'races/aasimar.png',           'races/aasimar-f.png',
  'races/warforged.png',         'races/warforged-f.png',
  'races/tabaxi.png',            'races/tabaxi-f.png',
  'races/fire-genasi.png',       'races/fire-genasi-f.png',
  'races/water-genasi.png',      'races/water-genasi-f.png',
  'races/earth-genasi.png',      'races/earth-genasi-f.png',
  'races/air-genasi.png',        'races/air-genasi-f.png',
  'races/goliath.png',           'races/goliath-f.png',
  'races/firbolg.png',           'races/firbolg-f.png',
  'races/changeling.png',        'races/changeling-f.png',
  'races/kenku.png',             'races/kenku-f.png',
  'races/dhampir.png',           'races/dhampir-f.png',
  'races/owlin.png',             'races/owlin-f.png',
  'races/lizardfolk.png',        'races/lizardfolk-f.png',
  'races/satyr.png',             'races/satyr-f.png',
  'races/harengon.png',          'races/harengon-f.png',
  'races/yuan-ti.png',           'races/yuan-ti-f.png',
  'races/triton.png',            'races/triton-f.png',
  'races/leonin.png',            'races/leonin-f.png',
  'races/minotaur.png',          'races/minotaur-f.png',
  'races/bugbear.png',           'races/bugbear-f.png',
  'races/hobgoblin.png',         'races/hobgoblin-f.png',
  'races/goblin.png',            'races/goblin-f.png',
  'races/tortle.png',            'races/tortle-f.png',
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
  // ── EXPANDED BESTIARY ──────────────────────────────────────────────────────
  basilisk: 'low-slung and heavy, eight powerful legs planted wide, a ridge of dorsal spines raised in threat display, two pairs of eyes glowing a sickly pale yellow, stone-grey scales, mouth slightly open to reveal blunt crushing teeth',
  beholder: 'floating at eye level with its massive central eye wide open and staring directly at the viewer, ten smaller eyestalks splayed outward like a crown, each glowing with a different color of magical energy, its maw bristling with teeth',
  bugbear: 'hunched and massive, nearly seven feet of matted shaggy dark fur, beady cunning orange eyes, a crude morningstar swung lazily over one shoulder, a predator\'s relaxed posture before a strike',
  chimera: 'rearing back with all three heads — lion, goat, and dragon — roaring simultaneously, lion claws raking the air, goat horns lowered to gore, the dragon head exhaling a tongue of flame, leathery wings snapping open for balance',
  cyclops: 'looming huge with its single enormous bloodshot eye narrowed in rage, a club the size of a tree trunk raised in both fists, crude hide armor straining over a massively muscled frame, tusks jutting from a thick lower jaw',
  'death-knight': 'standing absolutely still in full black plate, a two-handed blade ignited in cold black flame held vertically before him, a visor that frames two burning crimson eyes, the air around him visibly freezing',
  doppelganger: 'mid-transformation, one half of its body still featureless grey clay while the other half has resolved into someone else\'s face — an uncanny half-formed mirror, its expression utterly blank and unreadable',
  'earth-elemental': 'a hulking living mass of boulders and packed earth, vaguely humanoid, enormous stone fists dragging along the ground, moss and roots erupting from cracks in its body, two glowing amber eyes deep inside a craggy head',
  'fire-elemental': 'a pillar of roaring fire in a roughly humanoid shape, a face of screaming flame visible in its torso, arms of fire reaching outward, the ground around it scorched and glowing, intense heat visible in warped air',
  'frost-giant': 'towering, pale blue-grey skin, frost in a matted beard, a massive ice-hewn axe rested on one shoulder, exhaling a cloud of freezing breath, glacier-blue eyes narrowed against a blizzard it seems indifferent to',
  gargoyle: 'perched crouched on a stone ledge with wings partly spread, carved-stone grey skin cracked with age, talons gripping the edge, a snarling mouth of jagged fangs, glowing red pinpoint eyes — utterly still except for those eyes',
  gnoll: 'cackling mid-stride with a spotted hyena head, a ransacked flail raised high, mangy striped fur over a hyena-human body, shredded scavenged armor, frenzied with bloodlust',
  'gnoll-pack-lord': 'standing triumphant with bone trophies dangling from a decorated war-harness, a huge spiked flail in one hand, skull of a previous enemy adorning his pauldron, commanding the pack with an outstretched claw',
  'golem-iron': 'a towering humanoid figure of riveted iron plates, seams glowing faintly with bound magical energy, fists like anvils hanging at its sides, no face — just two amber rune-eyes set into a flat iron slab',
  'golem-stone': 'a massive humanoid of rough-hewn granite, enormous and slow, glowing carved runes across its chest, leaving cracked stone wherever it steps, staring straight ahead with ancient intent',
  'hell-hound': 'low and prowling, a pitch-black mastiff with molten-orange cracks in its hide, flame leaking from its jaws with every exhale, ember-red eyes, hackles raised, tail like a whip of fire',
  'hill-giant': 'an enormous lumbering giant clad in crude stitched hides and animal skins, wielding an uprooted tree as a club, dim and brutish expression, tangled matted hair, looming against a stormy sky',
  hydra: 'erupting from water with five serpentine heads on long necks all striking outward in different directions simultaneously, scales glistening, rows of teeth in each thrashing head, its body a coiled mass below the surface',
  kobold: 'small and wiry with rust-red scales, enormous eyes in the dark, clutching a spear almost as tall as itself, grinning with too many teeth, wearing absurd salvaged armor held together with twine',
  'kobold-shaman': 'tiny and hunched over a staff topped with bones, crackling green magical energy around its clawed hands, ritual face-paint, frenzied eyes reflecting its own wild magic, a puffed-up sense of enormous importance',
  lamia: 'reclining with the upper body of a beautiful woman and the lower body of a great cat, claws fully extended, a false smile that doesn\'t reach predator\'s eyes, draped in stolen desert silks and looted jewels',
  manticore: 'mid-air pounce, lion\'s body, leathery wings beating, a human-like face stretched into a killing grin full of rows of teeth, a scorpion tail arced overhead ready to volley spines',
  medusa: 'partially turning with a calculating half-smile, hair that writhes as a nest of living serpents, each snake-head hissing, stone-grey eyes with slit pupils that glow faintly — deliberately looking away to tease, not yet killing',
  minotaur: 'bellowing with its massive horned bull head thrown back, a double-headed axe in one fist, chest heaving, enormous hooves planted wide, a labyrinth corridor behind it, all muscle and fury',
  mummy: 'unwrapping as it advances, ancient bandages trailing, desiccated amber-brown skin visible beneath, hollow black eye sockets glowing deep amber, one arm raised with a curse gesture, the other trailing grave-wrappings along the floor',
  owlbear: 'rearing up on hind legs, the feathered owl-head letting out a bone-chilling screech, talons spread wide on both forelimbs, thick bear body, enormous — an apex predator annoyed',
  'pit-fiend': 'colossal horned devil standing with terrible authority, leathery wings half-spread, a barbed mace in each clawed hand, molten eyes, black-iron hide with lava cracks, radiating absolute power',
  revenant: 'advancing with one arm outstretched and burning eyes of cold blue fire, a face frozen in a death-mask expression of total unyielding purpose, burial clothes of quality now ruined, the air around it dropping to killing cold',
  specter: 'a barely-visible translucent human form, almost invisible except for two points of cold white light where eyes should be, one hand reaching — the touch of death — trailing through solid stone as if it weren\'t there',
  'stone-giant': 'sitting with enormous legs folded, idly tossing a boulder the size of a cart between two hands, weathered grey stone skin, calm and ancient eyes that suggest it has simply been here longer than everything else',
  treant: 'an ancient tree-giant rising to full height, bark-skin, root-legs, branch-arms spread wide, two amber resin eyes blazing with ancient forest fury, moss and birds nesting in its upper reaches, leaves shaking as it roars',
  wendigo: 'impossibly tall and emaciated, a great rack of antlers, hollow sunken eyes glowing pale blue, long clawed fingers, skin stretched over bone, exhaling a cloud of frozen air, radiating hunger and wrong',
  werewolf: 'mid-transformation — partially humanoid but growing, a half-emerged wolf snout, hands becoming claws, shoulders broadening, torn clothing, eyes fully wolfen and golden, caught between two shapes in the most dangerous moment',
  'will-o-wisp': 'a small floating ball of cold blue-white light with a thin veil of ghost-fire around it, drifting just above the ground in a misty marsh, casting no warmth, its tiny glow the only light in a dark wet place — beautiful and lethal',
  wraith: 'flowing out of a wall, entirely shadow except for two dim red eyes, a vaguely human shape of dark negative space, one hand outstretched, draining the light and warmth from the air around it',
  'yuan-ti': 'half-coiled, a scaled serpentine lower body below a sinuous human upper body, smooth cobra-hood flaring behind its head, a forked tongue tasting the air, faintly glowing slit-pupil eyes, holding a venom-soaked blade',
  // ── EXPANDED BESTIARY VOL. 2 ──────────────────────────────────────────────
  'orc-berserker': 'mid-charge with eyes completely rolled back in battle-frenzy, a massive two-handed axe swung recklessly wide, foaming at the tusked jaw, every muscle corded and beyond reason, absolute terrifying momentum',
  'skeleton-mage': 'floating several feet off the ground in tattered arcane robes, a skeletal hand aiming a crackling bolt of necrotic green energy, empty eye sockets blazing with cold green fire, long bony fingers trailing smoke',
  'zombie-giant': 'an enormous bloated animated corpse, hunched and dripping, arms hanging to the ground, a vast slack-jawed face with clouded eyes, leaving a trail of decay, slow but absolutely unstoppable',
  'vampire-thrall': 'pale and hollow-eyed, a lesser vampire servant in tattered finery, baring modest fangs in a hiss, beholden to a master but dangerous in a pack, moving with unnatural stillness between bursts of violent speed',
  'dire-wolf': 'a wolf the size of a horse, hackles raised like a ridge of spears, yellow eyes locked on the viewer, black-grey fur bristling, low powerful stance before a lunge — not a beast but a natural weapon',
  drow: 'a dark elf warrior, obsidian-dark skin, white hair cut brutally short, vivid red-violet eyes, light black chainmail, two hand crossbows held low and ready, utterly cold competence',
  'drow-priestess': 'a dark elf high priestess, white flowing hair, midnight-purple robes bearing a spider goddess symbol, arms raised invoking divine power that crackles black and violet, commanding and terrifying',
  drider: 'half dark-elf torso erupting from a monstrous spider body, multiple eyes blinking in the human face, crossbow in hand and forelegs raised, a scuttling horror of two natures merged wrong',
  rakshasa: 'a demon of noble bearing, a tiger head with backward-pointing hands, silk robes of impossible richness, a smiling expression of absolute predatory confidence, holding a jewelled blade as if it were a wine glass',
  'night-hag': 'ancient and dreadful, a crone with iron-grey skin, long iron teeth, long iron claws, clutching a heartstone that pulses, one eye a burning ember, walking through half-real dreamscape shadow',
  'sea-hag': 'a waterlogged horror with kelp-matted grey hair, barnacled pale skin, claws like fishhooks, eyes that can kill with a look, half-emerged from black water, surrounded by the smell of death and brine',
  'displacer-beast': 'a great black panther with two long tentacles erupting from its shoulders, one lashing forward in attack, existing slightly out-of-sync with the space it occupies, difficult to look at directly',
  bulette: 'bursting through the earth from below, a massive armored land-shark with a turreted head, slick blue-grey plate-like scales, a cavernous jaw full of crushing teeth, enormous clawed forelimbs pushing stone aside like paper',
  'purple-worm': 'a cross-section of something impossibly vast — a great ringed purple-black maw wide enough to swallow a cart, tooth rings within tooth rings, tunneling toward the viewer out of solid rock',
  remorhaz: 'a vast centipede-like arctic horror, blue-white chitinous plates, superheated spine-segments glowing orange-red, antennae wide, a heat-shimmer around it despite the snowfield it stands in',
  'carrion-crawler': 'a massive pale centipede-thing, a ring of paralysing tendrils surrounding a circular sucking maw, multifaceted black eyes, pale grub-white body, the slow confident advance of something that knows its victims can\'t move',
  'gibbering-mouther': 'a pulsing mass of translucent pale flesh covered in blinking mismatched eyes and snapping human-like mouths, all speaking and chewing simultaneously, pseudopods extending, sanity-destroying to perceive',
  'flesh-golem': 'a hulking horror stitched from mismatched parts, scars running everywhere, dead eyes that hold a spark of trapped pain, enormous hands, moving with jerky unstoppable violence, lightning-rod bolts at the neck crackling',
  'clay-golem': 'a massive humanoid form of thick grey-green clay, surface still wet and unfinished-looking, carved runes half-visible across its chest, moving with grinding slow unstoppable weight, leaving deep footprints',
  naga: 'a great serpent with a human face of cold beauty, a cobra hood flaring wide, luminous slit-pupil eyes, scales of deep jewel green and gold, floating in a temple chamber surrounded by coiling loops of vast body',
  marilith: 'a six-armed chaos demon with a massive snake body below a humanoid torso, all six arms holding different blades in different stances simultaneously, six weapons in constant motion, laughing with genuine delight at the chaos',
  balor: 'a towering winged demon of pure infernal fire, twenty feet of hatred and power, a whip of lightning in one hand and a flaming sword in the other, the air burning around it, the floor cracking under its weight',
  'chain-devil': 'a humanoid form wrapped and composed of dozens of animated chains that extend outward in all directions like a living web, a face of stretched screaming iron, the chains rattling with imprisoned souls',
  'bone-devil': 'tall and skeletal insectoid, a scorpion tail arching overhead with its stinger dripping, a face of pure malice on a skull-like head, great chitinous wings half-spread, emanating ice-cold cruelty',
  aboleth: 'an ancient mind from before gods, three glowing eyes on a vast fish-like body trailing tentacles, a slick surface that reeks of ancient sea, projecting psychic wrongness that fills the air with false memories',
  chuul: 'a vast crustacean nightmare, lobster-claws wide enough to bisect a man, a writhing mass of paralytic tentacles around its maw, stalked compound eyes scanning, barnacled purple-black shell, half-submerged',
  roper: 'what appears to be a stalagmite — until the eye at the top opens and six long adhesive strands shoot out toward the viewer, the base revealing a vertical fanged maw of concentric teeth pulling everything toward it',
  'intellect-devourer': 'a small horrid thing, a brain on four clawed legs, pulsing lobes, tiny but exuding an oppressive psychic miasma that makes the air feel thick and wrong, its claws digging into a surface with horrible patience',
  'phase-spider': 'a large spider caught mid-phase between planes, its body flickering between solid and translucent, appearing and vanishing in the same instant, leaving a faint afterimage wherever it was a moment ago',
  ettercap: 'a hunched spider-keeper humanoid, long pincer-like fingers, a cephalothorax fused into its back, web-shooting spinnerets, deep-set black eyes, surrounded by elaborate web-traps and silk-wrapped bundles',
  ankheg: 'bursting up through soil, a great insectoid horror with acid-spitting mandibles, segmented amber chitinous plate, six legs, clutching the earth with gripping foreclaws, acid burning everything it touches',
  'umber-hulk': 'a massive four-eyed burrowing beast, broad as it is tall, enormous mandibles, four eyes of different sizes producing a confusing impossible stare, huge clawed arms that tear through stone like soil',
  'rust-monster': 'a strange antennae-waving creature of rust-orange chitin, almost comedic in shape but utterly terrifying in context — its feathery antennae reaching toward metal armor and weapons with devastating corrosive contact',
  'gnoll-berserker': 'a gnoll in full blood-frenzy, spotted fur matted with the blood of enemies, a massive flail spinning in both hands, hyena-cackle expression stretched beyond all sanity, lost entirely to slaughter-joy',
  'kobold-trapper': 'a small kobold engineer surrounded by the hovering trigger-strings of its own elaborate trap network, blueprints clutched in its claws, proud and terrified in equal measure, the traps are genuinely clever',
  'vampire-bride': 'an elegant undead noblewoman, pale and beautiful and utterly wrong, in the dress she was buried in, dark eyes holding no reflection, fangs bared in a smile, one hand extended in invitation, the other holding something that drips',
  'fallen-angel': 'a once-celestial warrior with cracked golden armor, enormous broken wings shedding black feathers, a sword still blazing but with dark fire now, a face of grief and fury, stranded between what it was and what it has become',
  'dragon-turtle': 'a vast ancient turtle with a dragon head on a long neck, smoking nostrils, a shell the size of an island emerging from churning sea, steam venting from the water around it, serene and apocalyptic',
  'storm-giant': 'fifty feet of divine storm-bound warrior, steel-blue skin sparking with continuous lightning, hair a crackling cloud, wielding a greatsword that crackles with thunder, calm expression of weather-shaping power',
  'fire-giant': 'a vast giant with volcanic black skin and braided flame-red hair, wielding a great hammer of black iron with a glowing forge-hot head, surrounded by the heat shimmer of a blacksmith at impossible scale',
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
  // ── EXPANDED BESTIARY ──────────────────────────────────────────────────────
  'enemies/basilisk.png', 'enemies/beholder.png', 'enemies/bugbear.png', 'enemies/chimera.png',
  'enemies/cyclops.png', 'enemies/death-knight.png', 'enemies/doppelganger.png',
  'enemies/earth-elemental.png', 'enemies/fire-elemental.png', 'enemies/frost-giant.png',
  'enemies/gargoyle.png', 'enemies/gnoll.png', 'enemies/gnoll-pack-lord.png',
  'enemies/golem-iron.png', 'enemies/golem-stone.png',
  'enemies/hell-hound.png', 'enemies/hill-giant.png', 'enemies/hydra.png',
  'enemies/kobold.png', 'enemies/kobold-shaman.png',
  'enemies/lamia.png', 'enemies/manticore.png', 'enemies/medusa.png',
  'enemies/minotaur.png', 'enemies/mummy.png', 'enemies/owlbear.png',
  'enemies/pit-fiend.png', 'enemies/revenant.png', 'enemies/specter.png',
  'enemies/stone-giant.png', 'enemies/treant.png',
  'enemies/wendigo.png', 'enemies/werewolf.png',
  'enemies/will-o-wisp.png', 'enemies/wraith.png', 'enemies/yuan-ti.png',
  // ── EXPANDED BESTIARY VOL. 2 ──────────────────────────────────────────────
  'enemies/orc-berserker.png', 'enemies/skeleton-mage.png', 'enemies/zombie-giant.png',
  'enemies/vampire-thrall.png', 'enemies/dire-wolf.png',
  'enemies/drow.png', 'enemies/drow-priestess.png', 'enemies/drider.png',
  'enemies/rakshasa.png', 'enemies/night-hag.png', 'enemies/sea-hag.png',
  'enemies/displacer-beast.png', 'enemies/bulette.png', 'enemies/purple-worm.png',
  'enemies/remorhaz.png', 'enemies/carrion-crawler.png', 'enemies/gibbering-mouther.png',
  'enemies/flesh-golem.png', 'enemies/clay-golem.png', 'enemies/naga.png',
  'enemies/marilith.png', 'enemies/balor.png',
  'enemies/chain-devil.png', 'enemies/bone-devil.png',
  'enemies/aboleth.png', 'enemies/chuul.png', 'enemies/roper.png',
  'enemies/intellect-devourer.png', 'enemies/phase-spider.png', 'enemies/ettercap.png',
  'enemies/ankheg.png', 'enemies/umber-hulk.png', 'enemies/rust-monster.png',
  'enemies/gnoll-berserker.png', 'enemies/kobold-trapper.png',
  'enemies/vampire-bride.png', 'enemies/fallen-angel.png',
  'enemies/dragon-turtle.png', 'enemies/storm-giant.png', 'enemies/fire-giant.png',
];

// Stock NPC portrait library — 32 archetypes × 4-5 variants each (~160 total).
// Every variant is a different race/gender/build AND a different personality
// stance so no two NPCs of the same type look alike.
// Naming: npcs/{archetype}-{01..05}.png
// Matching in NPCCodex uses keyword detection + name-hash to pick a variant.

const NPC_PORTRAITS = [

  // ── MERCHANT ──────────────────────────────────────────────────────────────
  { file: 'npcs/merchant-01.png', prompt: `${STYLE} Portrait of a cheerful stout human male merchant, warm open smile, leaning forward eagerly, colourful layered travelling coat with many pockets, a bulging coin purse and well-worn ledger, rings on several fingers. Waist-up, warm candlelit market stall background.` },
  { file: 'npcs/merchant-02.png', prompt: `${STYLE} Portrait of a sharp-eyed human female merchant, dark complexion, natural hair pinned up practically, arms folded with a calculating half-smile, rich embroidered travelling clothes, a hidden coin scale on her belt. Waist-up, busy market background with hanging lanterns.` },
  { file: 'npcs/merchant-03.png', prompt: `${STYLE} Portrait of a weathered elderly dwarf male merchant, deep-set suspicious eyes, thick grey beard with a bronze bead, leaning back with arms crossed, practical road-worn clothes, a locked strongbox tucked under one arm. Waist-up, dusty trade road background.` },
  { file: 'npcs/merchant-04.png', prompt: `${STYLE} Portrait of a broad-shouldered middle-aged human male merchant, ruddy complexion, a thick blond beard going grey, confident no-nonsense expression, heavy fur-trimmed coat, a ledger under one arm and a money belt at his waist. Waist-up, busy northern market background.` },
  { file: 'npcs/merchant-05.png', prompt: `${STYLE} Portrait of a nervous young halfling male merchant, wide anxious eyes darting sideways, clutching a ledger tightly to his chest, a too-large hat perched on his head, modest practical clothes with ink stains. Waist-up, dim back-alley market background.` },

  // ── INNKEEPER ─────────────────────────────────────────────────────────────
  { file: 'npcs/innkeeper-01.png', prompt: `${STYLE} Portrait of a boisterous stout human male innkeeper, rosy cheeks, laugh lines, holding up a foaming tankard in welcome, flour-dusted thick apron over a rolled-sleeve shirt, warm firelit tavern background.` },
  { file: 'npcs/innkeeper-02.png', prompt: `${STYLE} Portrait of a tired but sharp half-orc female innkeeper, grey-green skin, strong jaw, a no-nonsense expression, wiping a tankard with a cloth, practical braid, a heavy key ring at her hip. Warm tavern background with hanging hops.` },
  { file: 'npcs/innkeeper-03.png', prompt: `${STYLE} Portrait of a cheerful gnome male innkeeper, wild curly red hair, enormously wide grin, standing on a stool behind his bar to reach counter height, colourful waistcoat and apron. Cosy candlelit tavern background.` },
  { file: 'npcs/innkeeper-04.png', prompt: `${STYLE} Portrait of a dignified elderly human female innkeeper, silver hair in a neat bun, watchful kind eyes, a subtle air of authority, fine but practical dress, holding a room key. Stone-walled respectable inn background.` },
  { file: 'npcs/innkeeper-05.png', prompt: `${STYLE} Portrait of a big warm human male innkeeper, broad-shouldered ex-soldier turned tavern owner, a friendly gap-toothed grin, thick arms, a stained apron, a one-ear-missing from an old fight he never explains, immediately likeable. Roaring fireplace tavern background.` },

  // ── GUARD ─────────────────────────────────────────────────────────────────
  { file: 'npcs/guard-01.png', prompt: `${STYLE} Portrait of a stoic human male city guard, dented iron helmet pushed back, chainmail, spear resting on his shoulder, watchful but not unkind expression. Stone gatehouse background.` },
  { file: 'npcs/guard-02.png', prompt: `${STYLE} Portrait of a disciplined dragonborn female guard, bronze scales, strong jaw, one hand resting on her sword hilt, formal tabard over chainmail, expression of cool authority. City wall background.` },
  { file: 'npcs/guard-03.png', prompt: `${STYLE} Portrait of a bored young elf male guard, long auburn hair under a half-worn helmet, leaning casually on his spear, clearly underestimated but sharper than he looks. Market square background.` },
  { file: 'npcs/guard-04.png', prompt: `${STYLE} Portrait of a grizzled half-orc female veteran guard, scarred face, heavy armour, a no-nonsense glare, crossed arms, clearly been in more fights than she can count. Barracks doorway background.` },
  { file: 'npcs/guard-05.png', prompt: `${STYLE} Portrait of a stocky middle-aged human female guard, short practical hair, a broken nose healed crooked, chainmail under a city tabard, hand on her hip, the expression of someone who has seen it all and is not impressed. Cobblestone gatehouse background.` },

  // ── NOBLE ─────────────────────────────────────────────────────────────────
  { file: 'npcs/noble-01.png', prompt: `${STYLE} Portrait of a haughty human male noble, fine embroidered doublet, swept-back dark hair, jewelled ring, expression politely disdainful and calculating. Richly draped manor interior background.` },
  { file: 'npcs/noble-02.png', prompt: `${STYLE} Portrait of an imperious high elf female noble, silver hair in an elaborate upswept style with a golden pin, silk gown with a jewelled clasp, looking slightly down her nose. Ornate candlelit hall background.` },
  { file: 'npcs/noble-03.png', prompt: `${STYLE} Portrait of a charming tiefling male noble, deep purple skin, elegant swept-back horns, a rakish smile, impeccably tailored dark coat with gold trim, one gloved hand raised in greeting. Velvet-curtained study background.` },
  { file: 'npcs/noble-04.png', prompt: `${STYLE} Portrait of a stiff middle-aged dwarf female noble, elaborately braided hair woven with gems, stout dignified posture, formal embroidered gown, a sceptre of office. Throne room background.` },
  { file: 'npcs/noble-05.png', prompt: `${STYLE} Portrait of a young aasimar male noble, pale golden skin, white hair, an expression of genuine compassion unusual in his station, fine robes, a holy symbol worn openly. Grand estate garden background.` },

  // ── SCHOLAR / MAGE ────────────────────────────────────────────────────────
  { file: 'npcs/scholar-01.png', prompt: `${STYLE} Portrait of an elderly gnome male scholar, enormous round spectacles, ink-stained fingers clutching a quill, wild white hair, surrounded by floating arcane notation cards, delighted curious expression. Candlelit library background.` },
  { file: 'npcs/scholar-02.png', prompt: `${STYLE} Portrait of a focused young human female scholar-mage, dark braids, glowing amber eyes from arcane study, complex formula glowing in the air beside her, practical ink-stained robes, an expression of intense concentration. Tower study background.` },
  { file: 'npcs/scholar-03.png', prompt: `${STYLE} Portrait of a haughty githzerai male scholar, angular grey skin, no hair, amber eyes, arms folded with intellectual disdain, wearing finely tailored scholar's robes with unusual geometric patterns. Astral-lit library background.` },
  { file: 'npcs/scholar-04.png', prompt: `${STYLE} Portrait of a nervous middle-aged human male academic, thinning hair, thick spectacles slightly askew, clutching an armload of scrolls that are threatening to fall, apologetic expression. Dusty archive background.` },
  { file: 'npcs/scholar-05.png', prompt: `${STYLE} Portrait of a wise ancient elf female arcane scholar, deeply lined face, patient warm eyes behind silver-rimmed glasses, silver hair, elegant but simple robes, a staff with a softly glowing crystal. Old tower window background.` },

  // ── HEALER ────────────────────────────────────────────────────────────────
  { file: 'npcs/healer-01.png', prompt: `${STYLE} Portrait of a gentle wood-elf female healer, soft features, warm green eyes, simple white-and-green robes, a herbal satchel at her side, hands folded, compassionate expression. Dappled forest light background.` },
  { file: 'npcs/healer-02.png', prompt: `${STYLE} Portrait of a calm human male healer, warm brown skin, close-cropped hair, gentle steady hands, serene meditative expression, pristine white robes with a sun emblem, a satchel of medicines. Temple interior background.` },
  { file: 'npcs/healer-03.png', prompt: `${STYLE} Portrait of a brisk no-nonsense dwarf female healer, rolled sleeves, apron covered in potion stains, efficient expression that says she's seen worse, a cluttered medicine kit. Infirmary background.` },
  { file: 'npcs/healer-04.png', prompt: `${STYLE} Portrait of a young halfling male field medic, bright hopeful eyes, slightly too-large healer's kit strapped to his back, bandages on his own hands, determined smile. Battlefield tent background.` },
  { file: 'npcs/healer-05.png', prompt: `${STYLE} Portrait of a stoic firbolg female healer, giant-kin height, soft grey-green skin, enormous gentle hands, braided white hair woven with herbs, earthy woven robes. Woodland clearing background.` },

  // ── PRIEST / RELIGIOUS ────────────────────────────────────────────────────
  { file: 'npcs/priest-01.png', prompt: `${STYLE} Portrait of a devout human male priest, tonsured hair, simple holy robes with a sun-cross symbol, calm open expression, hands folded in prayer. Candlelit chapel background.` },
  { file: 'npcs/priest-02.png', prompt: `${STYLE} Portrait of a fierce dragonborn female high priestess, red scales, gold ceremonial armour with holy symbols, a commanding presence, holding a burning censer. Grand temple interior background.` },
  { file: 'npcs/priest-03.png', prompt: `${STYLE} Portrait of a kindly elderly halfling female priestess, plump warm face, elaborate but homespun vestments, a twinkling smile, holding a carved holy idol. Small village shrine background.` },
  { file: 'npcs/priest-04.png', prompt: `${STYLE} Portrait of a conflicted young tiefling male priest, dark skin, small horns, wearing holy robes that seem to sit uneasily on him, a complex expression of faith wrestling with doubt. Cathedral background with stained glass.` },
  { file: 'npcs/priest-05.png', prompt: `${STYLE} Portrait of a serene middle-aged half-elf female priest, sun-kissed skin, gentle eyes, a travelling version of temple robes, a pilgrim's staff, expression of quiet certainty. Open road with distant shrine background.` },

  // ── BLACKSMITH / CRAFTSPERSON ─────────────────────────────────────────────
  { file: 'npcs/blacksmith-01.png', prompt: `${STYLE} Portrait of a muscular dwarf male blacksmith, soot-stained face, thick leather apron, hammer tucked in his belt, arms crossed, gruff but honest expression. Orange forge-glow background.` },
  { file: 'npcs/blacksmith-02.png', prompt: `${STYLE} Portrait of a powerfully built goliath female weaponsmith, grey-marbled skin, towering build, confident stance with a hammer resting on her shoulder, leather apron with tool pouches. Forge background with glowing coals.` },
  { file: 'npcs/blacksmith-03.png', prompt: `${STYLE} Portrait of a wiry half-orc male armorsmith, green skin, clever hands, a craftsman's pride in his expression, holding up a piece of work to inspect it, forge sparks in his wild dark hair. Smithy background.` },
  { file: 'npcs/blacksmith-04.png', prompt: `${STYLE} Portrait of a gnome female tinkerer-artificer, wild copper hair with goggles pushed up on her forehead, excited wide eyes, ink and soot on her nose, holding a complex mechanical device she just finished. Workshop background with gears and blueprints.` },
  { file: 'npcs/blacksmith-05.png', prompt: `${STYLE} Portrait of a stoic elderly human male master craftsman, deeply calloused hands, a lifetime of work in the lines of his face, simple practical clothes, an expression of quiet mastery. Woodworking shop background.` },

  // ── INFORMANT / SPY ───────────────────────────────────────────────────────
  { file: 'npcs/informant-01.png', prompt: `${STYLE} Portrait of a shady half-elf male informant, hood half-raised, eyes darting sideways, a sly knowing smirk, mismatched layered clothes hiding many pockets. Dark alley shadow background.` },
  { file: 'npcs/informant-02.png', prompt: `${STYLE} Portrait of a changeling female spy, pale skin with shifting grey eyes and almost-featureless face, deliberately bland expression that reveals nothing, plain traveller's clothes that draw no attention. Busy tavern background, blending in.` },
  { file: 'npcs/informant-03.png', prompt: `${STYLE} Portrait of a wiry young tabaxi male street informant, tawny spotted fur, one ear notched, bright darting eyes, a grin that knows too much, fingers drumming a coin on a table. Dim candlelit corner background.` },
  { file: 'npcs/informant-04.png', prompt: `${STYLE} Portrait of a charming human female spy, disarming warm smile that doesn't reach her sharp calculating eyes, fine but understated clothes, a concealed knife hilt barely visible. Upscale inn background.` },
  { file: 'npcs/informant-05.png', prompt: `${STYLE} Portrait of a paranoid elderly gnome male information broker, wild eyes constantly scanning over his spectacles, surrounded by notes and a locked chest, nervous hands, a complex filing system. Cluttered hidden backroom background.` },

  // ── ELDER / VILLAGE LEADER ────────────────────────────────────────────────
  { file: 'npcs/elder-01.png', prompt: `${STYLE} Portrait of a wise elderly human female village elder, deep wrinkles, silver hair in a loose bun, warm weathered eyes, simple practical clothes, a carved walking staff. Warm hearth-light background.` },
  { file: 'npcs/elder-02.png', prompt: `${STYLE} Portrait of a venerable dwarf male clan elder, long white beard with iron beads, a ceremonial axe resting beside him, deeply lined face radiating experience and authority. Stone hall with ancestral banners background.` },
  { file: 'npcs/elder-03.png', prompt: `${STYLE} Portrait of an ancient elf female matriarch, impossibly aged but regal, silver-white hair, eyes that have watched centuries pass, simple silver-thread robes, a quiet profound stillness. Ancient forest glade background.` },
  { file: 'npcs/elder-04.png', prompt: `${STYLE} Portrait of a stout jovial halfling male village elder, ruddy wrinkled face, laughing eyes, a pipe in hand, well-worn comfortable clothes, a leader loved rather than feared. Village green background.` },
  { file: 'npcs/elder-05.png', prompt: `${STYLE} Portrait of a weathered goliath female tribal chief, grey-marbled skin, age-whitened hair, a lifetime of survival in her stoic face, ceremonial tribal markings, fur and stone adornments. Mountain summit background.` },

  // ── CRIMINAL / CRIME BOSS ─────────────────────────────────────────────────
  { file: 'npcs/criminal-01.png', prompt: `${STYLE} Portrait of a dangerous tiefling female crime boss, deep red skin, sharp curved horns, cold calculating eyes, fine dark clothing, a concealed blade hilt visible, cool authority. Dark smoky interior background.` },
  { file: 'npcs/criminal-02.png', prompt: `${STYLE} Portrait of a charming but dangerous human male crime lord, silver-tongued smile, expensive ring on every finger, perfectly tailored coat, eyes that evaluate everything as a transaction. Luxurious underground den background.` },
  { file: 'npcs/criminal-03.png', prompt: `${STYLE} Portrait of a brutal half-orc female gang enforcer, green skin, a scar across her lips, not trying to look friendly at all, heavy dark coat, knuckledusters hanging from her belt. Back-alley background.` },
  { file: 'npcs/criminal-04.png', prompt: `${STYLE} Portrait of a slight pale human female assassin-thief, dark circles under sharp eyes, forgettable face that is exactly the point, shadow-coloured clothes, twin daggers at her hips. Rooftop night-time background.` },
  { file: 'npcs/criminal-05.png', prompt: `${STYLE} Portrait of a gleefully unhinged gnome male fence and con artist, wild grin, mismatched flashy clothes, rings from a dozen different sets, holding up a stolen gem to examine it. Cluttered warehouse background.` },

  // ── MYSTERIOUS STRANGER ───────────────────────────────────────────────────
  { file: 'npcs/mysterious-stranger-01.png', prompt: `${STYLE} Portrait of a cloaked figure of unknown race, deep hood casting the face in shadow with only two glinting eyes visible, an ornate clasp, an aura of hidden purpose. Misty background.` },
  { file: 'npcs/mysterious-stranger-02.png', prompt: `${STYLE} Portrait of a pale shadar-kai female stranger, ashen skin, silver tattoos, dark understated clothes, sitting very still in the corner with a cup she hasn't touched, watching everything. Dark tavern corner background.` },
  { file: 'npcs/mysterious-stranger-03.png', prompt: `${STYLE} Portrait of a tall masked tiefling male figure, ornate porcelain mask painted with a neutral expression, fine robes of ambiguous origin, a sealed scroll he shows no one. Fog-filled alley background.` },
  { file: 'npcs/mysterious-stranger-04.png', prompt: `${STYLE} Portrait of a young genderless aasimar with a distant unfocused gaze as if seeing something no one else can, simple pale robes, faint light at the edges of their silhouette, expression of calm inevitability. Empty road at dusk background.` },

  // ── BARD / PERFORMER ──────────────────────────────────────────────────────
  { file: 'npcs/bard-01.png', prompt: `${STYLE} Portrait of a flamboyant human male bard, extravagant plumed hat, a lute slung on his back, arms wide in mid-story, laughing eyes, colourful patchwork coat with every pocket full. Tavern stage background.` },
  { file: 'npcs/bard-02.png', prompt: `${STYLE} Portrait of a melancholy tiefling female bard, dark violet skin, elegant silver horns, playing a hauntingly beautiful fiddle with closed eyes, simple but stylish dark clothes. Candlelit street corner background.` },
  { file: 'npcs/bard-03.png', prompt: `${STYLE} Portrait of a gregarious halfling male street performer, juggling glowing orbs with a huge grin, colourful acrobat's costume, quick clever eyes. Busy marketplace background.` },
  { file: 'npcs/bard-04.png', prompt: `${STYLE} Portrait of a dignified elf female court bard, poised and elegant, a beautifully carved harp at her side, an expression of knowing refinement, fine court clothes. Grand hall background with chandeliers.` },
  { file: 'npcs/bard-05.png', prompt: `${STYLE} Portrait of a scarred half-orc male storyteller-bard, green skin, a missing tooth, but warm rumbling presence, a weathered drum, an expression of someone who has lived every tale he tells. Firelit campsite background.` },

  // ── RANGER / MONSTER HUNTER ───────────────────────────────────────────────
  { file: 'npcs/ranger-01.png', prompt: `${STYLE} Portrait of a lean weathered human female ranger, sun-darkened skin, practical woodsman clothes, a longbow across her back, calm alert eyes that miss nothing. Forest edge background.` },
  { file: 'npcs/ranger-02.png', prompt: `${STYLE} Portrait of a brooding half-elf male monster hunter, a collection of scars and trophies, worn practical armour with a beast-tooth necklace, crossbow on his back, quiet intensity. Dark forest background.` },
  { file: 'npcs/ranger-03.png', prompt: `${STYLE} Portrait of a wood-elf female wilderness scout, bark-patterned camouflage clothing, moss and leaves woven into her hair, crouching slightly, expression of absolute stillness. Ancient forest background.` },
  { file: 'npcs/ranger-04.png', prompt: `${STYLE} Portrait of a compact human male tracker, olive skin, dark hair tied back, quick observant eyes, practical worn leathers with a shortbow across his back, studying tracks with intense focus. Muddy forest trail background.` },
  { file: 'npcs/ranger-05.png', prompt: `${STYLE} Portrait of a cheerful gnome female beastmaster ranger, wild red hair, an alert hawk on her forearm, practical ranger kit, wide excited eyes. Open meadow background.` },

  // ── MERCENARY / SOLDIER ───────────────────────────────────────────────────
  { file: 'npcs/mercenary-01.png', prompt: `${STYLE} Portrait of a grizzled human male mercenary, battle-scarred face, mismatched armour repaired many times, a great sword strapped to his back, an expression of professional detachment. Dusty road background.` },
  { file: 'npcs/mercenary-02.png', prompt: `${STYLE} Portrait of a fierce half-orc female sell-sword, green skin, thick armour with company insignia, arms crossed with casual confidence, a smile that promises violence if the coin is right. Tavern background.` },
  { file: 'npcs/mercenary-03.png', prompt: `${STYLE} Portrait of a young human male soldier-for-hire, light brown skin, a soldier's bearing, decent but battered armour, a fresh scar he's still getting used to, an expression of someone who needs money more than glory. Camp background.` },
  { file: 'npcs/mercenary-04.png', prompt: `${STYLE} Portrait of a compact tiefling female mercenary captain, red skin, commanding eyes, a leadership sash over practical armour, one hand on her sword hilt. Military camp background.` },
  { file: 'npcs/mercenary-05.png', prompt: `${STYLE} Portrait of an elderly dwarf male veteran soldier, retired from campaigns, a medal-heavy coat, deep lines, hands that still remember how to fight, expression of weary pragmatism. Stone fortress background.` },

  // ── SAILOR / PIRATE ───────────────────────────────────────────────────────
  { file: 'npcs/sailor-01.png', prompt: `${STYLE} Portrait of a sun-weathered human male sailor, salt-bleached hair, a captain's coat open at the chest, a telescope tucked in his belt, squinting against imaginary sea glare. Ship deck background.` },
  { file: 'npcs/sailor-02.png', prompt: `${STYLE} Portrait of a bold tabaxi female pirate captain, orange-and-black striped fur, a tricorn hat askew, a wide grin, a cutlass at her hip, confident arms-wide swagger. Sea background with sails.` },
  { file: 'npcs/sailor-03.png', prompt: `${STYLE} Portrait of a lean experienced human male first mate, dark braided hair with a streak of grey, a navigator's chart rolled under one arm, a sextant at his belt, practical and confident. Harbour background.` },
  { file: 'npcs/sailor-04.png', prompt: `${STYLE} Portrait of a half-orc female smuggler captain, a scar across her chin, clever calculating eyes, a coat with many hidden pockets, an offer she's already planning. Moonlit dock background.` },
  { file: 'npcs/sailor-05.png', prompt: `${STYLE} Portrait of an elderly sea-elf male retired sailor, blue-green skin, barnacle-like skin textures, deeply nostalgic expression looking toward the sea, a carved driftwood pipe. Coastal cliff background at sunset.` },

  // ── ALCHEMIST / ARTIFICER ─────────────────────────────────────────────────
  { file: 'npcs/alchemist-01.png', prompt: `${STYLE} Portrait of an eccentric gnome female alchemist, wild purple-streaked hair, goggles around her neck, coloured stains on her coat, holding up a bubbling flask with delight. Cluttered laboratory background.` },
  { file: 'npcs/alchemist-02.png', prompt: `${STYLE} Portrait of a precise tiefling male artificer, blue skin, careful controlled movements, magnifying monocle, an expression of intense meticulous focus, mechanical arm augment. Workshop background with blueprints.` },
  { file: 'npcs/alchemist-03.png', prompt: `${STYLE} Portrait of a middle-aged human female potion maker, practical but stain-covered robes, a row of vials on a bandolier, an expression of experienced competence. Shop background with shelves of potions.` },
  { file: 'npcs/alchemist-04.png', prompt: `${STYLE} Portrait of a young dwarf male explosives alchemist, singed eyebrows, excited gleam in his eye, thick protective gloves, a bandolier of small bombs. Smoking workshop background.` },

  // ── BOUNTY HUNTER ─────────────────────────────────────────────────────────
  { file: 'npcs/bounty-hunter-01.png', prompt: `${STYLE} Portrait of a grim human male bounty hunter, weathered face, cold professional eyes, practical worn armour, manacles on his belt, a wanted poster folded in his coat. Dusty frontier background.` },
  { file: 'npcs/bounty-hunter-02.png', prompt: `${STYLE} Portrait of a calculating half-elf female tracker, twin hand crossbows at her hips, a wanted-poster scroll case, expression of professional certainty. Night-time city alley background.` },
  { file: 'npcs/bounty-hunter-03.png', prompt: `${STYLE} Portrait of a towering goliath male manhunter, grey skin, a massive chain coiled over his shoulder, minimal expression but enormous imposing presence. Empty crossroads background.` },
  { file: 'npcs/bounty-hunter-04.png', prompt: `${STYLE} Portrait of a kenku female bounty hunter, black feathers, bright intelligent eyes, copying a suspect's description into a notebook, practical working clothes. Tavern noticeboard background.` },

  // ── ORACLE / SEER ─────────────────────────────────────────────────────────
  { file: 'npcs/oracle-01.png', prompt: `${STYLE} Portrait of a blind elderly human female oracle, milky white eyes, silver hair, a serene knowing smile, layers of sheer scarves, incense smoke curling around her. Candle-lit tent background with star charts.` },
  { file: 'npcs/oracle-02.png', prompt: `${STYLE} Portrait of a young aasimar male prophet, golden skin, vacant visionary eyes seeing something beyond, simple white robes, faint light radiating from his hands. Ruined temple background at dawn.` },
  { file: 'npcs/oracle-03.png', prompt: `${STYLE} Portrait of a wild-haired gnome female fortune teller, enormous mismatched eyes, dozens of rings and bracelets, a crystal ball, an expression of manic certainty. Colourful caravan tent background.` },
  { file: 'npcs/oracle-04.png', prompt: `${STYLE} Portrait of a gaunt tiefling female seer, violet skin, a thousand-yard stare, dark robes covered in written prophecies, holding a broken mirror. Dark ritual chamber background.` },

  // ── CULTIST / DARK PRIEST ─────────────────────────────────────────────────
  { file: 'npcs/cultist-01.png', prompt: `${STYLE} Portrait of a hollow-eyed human male cultist, gaunt face, dark robes with a sinister symbol, an unsettling smile of absolute conviction, dark circles under his eyes. Shadow-draped basement background.` },
  { file: 'npcs/cultist-02.png', prompt: `${STYLE} Portrait of a charismatic tiefling female cult leader, crimson skin, silver-white hair, dark elaborate robes, an expression of terrifying serene certainty. Dark altar background with candles.` },
  { file: 'npcs/cultist-03.png', prompt: `${STYLE} Portrait of a frightened young human female cultist who clearly regrets her choices, hollow cheeks, branded symbol on her wrist, looking over her shoulder. Underground cavern background.` },
  { file: 'npcs/cultist-04.png', prompt: `${STYLE} Portrait of a heavily tattooed dwarf male fanatic, wild eyes, ritual scars, a weapon covered in runes, the expression of someone who would do anything for their god. Firelit cave background.` },

  // ── GLADIATOR / ARENA FIGHTER ─────────────────────────────────────────────
  { file: 'npcs/gladiator-01.png', prompt: `${STYLE} Portrait of a scarred human male gladiator, champion's physique, a carved name on his armour from victories, proud defiant eyes, minimal arena armour showing old scars. Arena sand background.` },
  { file: 'npcs/gladiator-02.png', prompt: `${STYLE} Portrait of a dragonborn female arena champion, red scales, heavy ceremonial armour with a champion's crest, arms crossed with absolute confidence. Roaring crowd background.` },
  { file: 'npcs/gladiator-03.png', prompt: `${STYLE} Portrait of a lean half-elf male arena duellist, light quick armour, twin short blades, a dancer's stance, a showman's grin, clearly enjoying the crowd. Torchlit underground arena background.` },
  { file: 'npcs/gladiator-04.png', prompt: `${STYLE} Portrait of a massive goliath female pit fighter, grey-marbled skin, minimal armour, enormous maul, expression of absolute calm before violence. Stone fighting pit background.` },

  // ── RETIRED ADVENTURER ────────────────────────────────────────────────────
  { file: 'npcs/retired-adventurer-01.png', prompt: `${STYLE} Portrait of a weathered human male retired adventurer, an old warrior gone to seed a little, tavern clothes that can't hide the scars, a magic sword he said he'd never use again still at his hip, nostalgic smile. Tavern corner background.` },
  { file: 'npcs/retired-adventurer-02.png', prompt: `${STYLE} Portrait of a dignified dwarf female retired paladin, white-streaked hair, old armour hung on a wall behind her, a holy symbol she still wears, expression of hard-won peace. Farmhouse background.` },
  { file: 'npcs/retired-adventurer-03.png', prompt: `${STYLE} Portrait of a one-handed elf male retired rogue, silver hair, a prosthetic hand of beautiful craftsmanship, sharp eyes that still see everything, a carefully neutral expression. Quiet library background.` },
  { file: 'npcs/retired-adventurer-04.png', prompt: `${STYLE} Portrait of a stout halfling female retired adventurer, grey-streaked hair, a trophy room's worth of stories in her eyes, comfortable inn-owner clothes, a wry smile. Inn that she owns background.` },
  { file: 'npcs/retired-adventurer-05.png', prompt: `${STYLE} Portrait of a scarred half-orc male retired barbarian, the wildness now channelled into a calm that is arguably more dangerous, simple working clothes, enormous arms, tending a forge. Smithy background.` },

  // ── WITCH / HEDGE MAGE ────────────────────────────────────────────────────
  { file: 'npcs/witch-01.png', prompt: `${STYLE} Portrait of a wild-haired human female hedge witch, earthy robes hung with dried herbs and charms, bright knowing eyes, a black cat on her shoulder, a gnarled staff. Forest cottage background.` },
  { file: 'npcs/witch-02.png', prompt: `${STYLE} Portrait of a green-tinged goblinoid female swamp witch, warty nose, cackling expression, robes hung with bones and feathers, a cauldron-stained apron. Misty bayou background.` },
  { file: 'npcs/witch-03.png', prompt: `${STYLE} Portrait of a young tiefling male hedge mage, violet skin, experimental and self-taught look, robes with mismatched magical patches, holding a homemade wand. Rural village background.` },
  { file: 'npcs/witch-04.png', prompt: `${STYLE} Portrait of an ancient gnome female herb-witch, impossibly wrinkled, eyes that glow faintly green, simple robes, a belt of potion vials, expression of absolute inscrutable wisdom. Ancient stone hut background.` },

  // ── PLAGUE DOCTOR / PHYSICIAN ─────────────────────────────────────────────
  { file: 'npcs/plague-doctor-01.png', prompt: `${STYLE} Portrait of a human male plague doctor, the full iconic beak mask pushed up, revealing a gaunt pragmatic face beneath, dark heavy coat, vials of medicines, expression of professional grimness. Infected city background.` },
  { file: 'npcs/plague-doctor-02.png', prompt: `${STYLE} Portrait of a calm elf female physician, pale skin, precise deliberate hands, clean white surgeon's coat over dark clothes, round spectacles, an expression of absolute clinical focus. Surgery room background.` },
  { file: 'npcs/plague-doctor-03.png', prompt: `${STYLE} Portrait of a bulky half-orc male field surgeon, green skin, a medic's red-cross band, large gentle hands, a practical satchel of tools, kind eyes in a rough face. Battlefield tent background.` },
  { file: 'npcs/plague-doctor-04.png', prompt: `${STYLE} Portrait of a gnome female alchemical physician, extremely elaborate goggles, a diagnostic device of her own invention, rapid curious eye movements, coat festooned with vials. Experimental clinic background.` },

  // ── DIPLOMAT / AMBASSADOR ─────────────────────────────────────────────────
  { file: 'npcs/diplomat-01.png', prompt: `${STYLE} Portrait of a composed human male ambassador, impeccably groomed, formal court dress with a foreign nation's sash, a sealed letter case, an expression of watchful charm. Grand embassy foyer background.` },
  { file: 'npcs/diplomat-02.png', prompt: `${STYLE} Portrait of an elegant high-elf female diplomat, long silver hair, formal robes of a foreign court, jewelled peace-seal ring, eyes that are always negotiating. Diplomatic hall background.` },
  { file: 'npcs/diplomat-03.png', prompt: `${STYLE} Portrait of a young tiefling male cultural envoy, clearly trying hard to seem unthreatening, formal clothes of two mixed cultures, a nervous but earnest expression, carrying gifts. Foreign court background.` },
  { file: 'npcs/diplomat-04.png', prompt: `${STYLE} Portrait of a stout middle-aged dwarf female trade delegate, no-nonsense expression, practical formal clothes with her clan insignia, a briefcase of trade documents, hard-bargaining eyes. Merchant hall background.` },

  // ── BEGGAR / STREET PERSON ────────────────────────────────────────────────
  { file: 'npcs/beggar-01.png', prompt: `${STYLE} Portrait of a gaunt human male street beggar, ragged layered clothes, a face that has seen better days, but sharp clever eyes that miss nothing, holding a battered cup. Cobblestone street background.` },
  { file: 'npcs/beggar-02.png', prompt: `${STYLE} Portrait of a young halfling female refugee, wide frightened eyes, dirty travel-worn clothes, a small bundle of everything she owns, brave expression despite everything. City gate background.` },
  { file: 'npcs/beggar-03.png', prompt: `${STYLE} Portrait of an elderly human female beggar, deeply lined face, white hair under a tattered cloth, ragged layered clothes, but dignified posture and eyes that have lived a whole other life before this. Alley background.` },
  { file: 'npcs/beggar-04.png', prompt: `${STYLE} Portrait of a gnome female street urchin turned street-smart teen, gap-toothed grin, pockets full of acquired items, quick darting eyes. Marketplace background.` },

  // ── FERRYMAN / GUIDE ──────────────────────────────────────────────────────
  { file: 'npcs/ferryman-01.png', prompt: `${STYLE} Portrait of a lean weathered human male ferryman, river-grey hair, patient quiet expression, a long pole, simple practical river clothes, comfortable in silence. Misty river background.` },
  { file: 'npcs/ferryman-02.png', prompt: `${STYLE} Portrait of a sun-worn human female river guide, deep brown skin, grey-streaked hair in a loose braid, a flat straw hat, utterly at ease on the water, holding a hand-carved paddle, expression of calm ancient wisdom. River background.` },
  { file: 'npcs/ferryman-03.png', prompt: `${STYLE} Portrait of a stout dwarf male mountain guide, carrying an enormous pack with ease, a detailed hand-drawn map folded in his belt, an expression of absolute confidence in the terrain. Mountain pass background.` },
  { file: 'npcs/ferryman-04.png', prompt: `${STYLE} Portrait of a mysterious grey-cloaked figure of ambiguous age, a skeletal-motif ferry pole, pale hands, a coin-collecting gesture, an expression that belongs on the border between worlds. Foggy underworld river background.` },

  // ── FARMER / RURAL FOLK ───────────────────────────────────────────────────
  { file: 'npcs/farmer-01.png', prompt: `${STYLE} Portrait of a sun-browned human female farmer, strong practical arms, simple worn work clothes, a weathered straw hat pushed back, honest eyes, a hoe in hand. Golden wheat field background.` },
  { file: 'npcs/farmer-02.png', prompt: `${STYLE} Portrait of a stout halfling male shepherd, rosy cheeks, a crook in hand, a sheepdog peeking into frame, comfortable simple clothes, cheerful open expression. Rolling hills background.` },
  { file: 'npcs/farmer-03.png', prompt: `${STYLE} Portrait of a strong weathered human male farmer, dark sun-bronzed skin, calloused hands, a wide-brimmed hat, simple homespun work clothes, a direct honest expression, pitchfork resting on his shoulder. Farmstead background.` },
  { file: 'npcs/farmer-04.png', prompt: `${STYLE} Portrait of a stout middle-aged human female farmer-wife, grey-streaked auburn hair tucked under a linen cap, flour on her apron, kind practical eyes, arms crossed with warm but firm energy. Country kitchen doorway background.` },

  // ── MONK / ASCETIC ────────────────────────────────────────────────────────
  { file: 'npcs/monk-01.png', prompt: `${STYLE} Portrait of a serene middle-aged human male temple monk, shaved head, simple grey robes, prayer beads, an expression of perfect calm that has been hard won. Temple courtyard background.` },
  { file: 'npcs/monk-02.png', prompt: `${STYLE} Portrait of a young elf female ascetic warrior-monk, training clothes, hands in a guard position but utterly relaxed, short hair, expression of focused peace. Mountain monastery background.` },
  { file: 'npcs/monk-03.png', prompt: `${STYLE} Portrait of a massive goliath male monk, shaved head, simple white robes that look incongruous on his frame, prayer beads in his enormous hand, gentle eyes. High-altitude monastery background.` },
  { file: 'npcs/monk-04.png', prompt: `${STYLE} Portrait of an eccentric elderly kenku male mystic, black feathers going white with age, bright eyes full of ancient humour, robes covered in calligraphy, a wooden staff. Ancient pagoda background.` },

  // ── INQUISITOR ────────────────────────────────────────────────────────────
  { file: 'npcs/inquisitor-01.png', prompt: `${STYLE} Portrait of a severe human female inquisitor, immaculate white and gold robes of religious authority, cold precise eyes, a truth-finding lens on a chain, expression of iron certainty. Cathedral background.` },
  { file: 'npcs/inquisitor-02.png', prompt: `${STYLE} Portrait of a brooding tiefling male inquisitor, the irony of his role not lost on him, formal dark inquisitor's coat, a holy symbol he carries with complex feelings, penetrating eyes. Interrogation chamber background.` },
  { file: 'npcs/inquisitor-03.png', prompt: `${STYLE} Portrait of a zealous young dwarf female templar-inquisitor, bright armour with holy symbols, absolute conviction in her face, a warhammer and a thick book of laws. City courthouse background.` },
  { file: 'npcs/inquisitor-04.png', prompt: `${STYLE} Portrait of a weary middle-aged elf male inquisitor who has seen too much, formal robes worn with exhaustion, eyes that have learned not to trust appearances, a resigned expression. Temple archives background.` },

  // ── EXPLORER / ARCHAEOLOGIST ──────────────────────────────────────────────
  { file: 'npcs/explorer-01.png', prompt: `${STYLE} Portrait of an enthusiastic young human female explorer, sun-bleached hair in a practical braid, travel-worn adventuring clothes, a wide-brimmed hat, a map case, bright excited eyes. Ancient ruin background.` },
  { file: 'npcs/explorer-02.png', prompt: `${STYLE} Portrait of a methodical dwarf male archaeologist, thick spectacles, a notebook perpetually open, brushing dust off an artefact with fierce care, practical field clothes. Excavation site background.` },
  { file: 'npcs/explorer-03.png', prompt: `${STYLE} Portrait of a bold tabaxi male cartographer, spotted fur, an enormous map spread before him, marking new routes with ink-stained paw, gleeful pioneering expression. Uncharted wilderness background.` },
  { file: 'npcs/explorer-04.png', prompt: `${STYLE} Portrait of a scarred gnome female ruins delver, wild curly hair, climbing gear and grappling hooks, a self-satisfied grin from her latest discovery, a stolen idol tucked under her arm. Underground ruins background.` },

  // ── KNIGHT ────────────────────────────────────────────────────────────────
  { file: 'npcs/knight-01.png', prompt: `${STYLE} Portrait of a noble human male knight, full polished plate armor, a closed visor pushed up revealing a weathered honorable face, a white-and-gold tabard, a kite shield resting on one arm. Stone castle courtyard background.` },
  { file: 'npcs/knight-02.png', prompt: `${STYLE} Portrait of a stoic dragonborn female knight, bronze scales, ceremonial full plate with draconic motifs, a longsword at her hip, an expression of absolute duty. Grand hall background.` },
  { file: 'npcs/knight-03.png', prompt: `${STYLE} Portrait of a young idealistic human male squire-knight, shining armor with a few dents from his first real battle, a battered but proud crest, nervous hopeful eyes. Training yard background.` },
  { file: 'npcs/knight-04.png', prompt: `${STYLE} Portrait of a battle-worn half-orc female knight, scarred plate armor, a missing pauldron replaced with salvaged chain, hard experienced eyes, a heavy broadsword across her back, the look of someone who has earned every rank the hard way. Castle gatehouse background.` },

  // ── COURT-MAGE ────────────────────────────────────────────────────────────
  { file: 'npcs/court-mage-01.png', prompt: `${STYLE} Portrait of a imperious tiefling male court archmage, deep purple skin, swept-back horns, rich dark robes embroidered with arcane glyphs, a staff topped with a prismatic crystal, an expression of total intellectual authority. Throne room background.` },
  { file: 'npcs/court-mage-02.png', prompt: `${STYLE} Portrait of a sharp-eyed elderly human female royal mage-advisor, silver hair pinned precisely, spectacles pushed down her nose, fine robes with a noble house crest, a floating familiar beside her shoulder. Candlelit study background.` },
  { file: 'npcs/court-mage-03.png', prompt: `${STYLE} Portrait of a young prodigy gnome male court enchanter, wild hair, enthusiastic expression at odds with his formal robes, arcane equations floating in the air around him, already several impressive titles despite his age. Grand library background.` },
  { file: 'npcs/court-mage-04.png', prompt: `${STYLE} Portrait of a calculating high elf female court diviner, pale silver hair, cold precise eyes, a knowing half-smile, slim elegant robes, a scrying mirror on the table beside her. Palace observatory background.` },

  // ── PIRATE-CAPTAIN ────────────────────────────────────────────────────────
  { file: 'npcs/pirate-captain-01.png', prompt: `${STYLE} Portrait of a swaggering human male pirate captain, dark sea-worn skin, gold hoop earrings, a battered wide-brimmed hat, a long coat covered in trophies of past conquests, a rapier and a pistol at his belt, a wolfish grin. Sea cliffs background.` },
  { file: 'npcs/pirate-captain-02.png', prompt: `${STYLE} Portrait of a fearsome half-orc female pirate captain, green-grey skin, heavy gold jewelry looted from a dozen ships, an eyepatch over one eye, a massive cutlass, a captain's coat, a look that says she has never lost a fight at sea. Ship deck background.` },
  { file: 'npcs/pirate-captain-03.png', prompt: `${STYLE} Portrait of a charming tiefling male corsair captain, small curved horns, a sleek tailored coat, a charming dangerous smile, rings on every finger, a reputation for never breaking his word — at least not literally. Harbor tavern background.` },
  { file: 'npcs/pirate-captain-04.png', prompt: `${STYLE} Portrait of a weathered female human buccaneer captain, wind-burned face, salt-and-pepper hair in long braids, a commanding presence, a sea chart in one hand and a sextant at her belt. Ship's quarterdeck background.` },

  // ── HERBALIST ─────────────────────────────────────────────────────────────
  { file: 'npcs/herbalist-01.png', prompt: `${STYLE} Portrait of a weathered elderly female wood-elf herbalist, bark-brown skin, white hair woven with dried flowers, gentle curious eyes, apron pockets stuffed with plant cuttings, a faint smell of earth and chamomile about her. Cottage doorway background.` },
  { file: 'npcs/herbalist-02.png', prompt: `${STYLE} Portrait of a calm young halfling male hedge-druid, bare feet, a crown of woven wildflowers, simple green robes stained with sap and berry juice, a staff of fresh-cut hazel, an easy smile. Forest clearing background.` },
  { file: 'npcs/herbalist-03.png', prompt: `${STYLE} Portrait of a practical firbolg female herbalist, tall and broad, grey-lavender skin, enormous gentle hands sorting through hanging bundles of herbs, an apothecary's careful expression. Herb-drying loft background.` },
  { file: 'npcs/herbalist-04.png', prompt: `${STYLE} Portrait of a gruff human male wilderness healer, sun-dark skin, a short beard going grey, dried-herb bundles hanging from his belt, a worn leather satchel, the no-nonsense look of a man who sets bones and asks no philosophical questions. Village outskirts background.` },

  // ── SHADOW-AGENT ──────────────────────────────────────────────────────────
  { file: 'npcs/shadow-agent-01.png', prompt: `${STYLE} Portrait of a lean human male guild assassin, pale calculating eyes, dark close-cut hair, a plain face that forgets itself the moment you look away, slim dark leather with hidden blade sheaths, perfectly still. Dim alley background.` },
  { file: 'npcs/shadow-agent-02.png', prompt: `${STYLE} Portrait of a razor-precise tiefling female spy, small curved horns, violet skin, cold professional eyes, elegant dark clothes that read as civilian but move like armor, a poisoner's ring on one finger. Shadowed doorway background.` },
  { file: 'npcs/shadow-agent-03.png', prompt: `${STYLE} Portrait of a changeling male information broker, pale features, silver eyes that give nothing away, perfectly neutral expression, plain respectable clothes, a network of contacts behind those empty eyes. Candlelit back room background.` },
  { file: 'npcs/shadow-agent-04.png', prompt: `${STYLE} Portrait of a middle-aged half-elf female spymaster, sharp tired eyes, greying hair pulled back practically, clothes that suggest a minor noble but carry no house insignia, the careful stillness of someone who listens more than they speak. Private study background.` },

  // ── FORTUNE-TELLER ────────────────────────────────────────────────────────
  { file: 'npcs/fortune-teller-01.png', prompt: `${STYLE} Portrait of an ancient human female fortune-teller, deeply lined face, bright knowing eyes that suggest she might actually see the future, wrapped in layers of patterned silk scarves, tarot cards fanned in one hand. Candlelit tent background with crystal ball.` },
  { file: 'npcs/fortune-teller-02.png', prompt: `${STYLE} Portrait of a theatrical young gnome male carnival mystic, enormous false mustache, deliberately dramatic robes covered in stars and moons, probably a complete charlatan but genuinely uncanny in his specific predictions. Fairground tent background.` },
  { file: 'npcs/fortune-teller-03.png', prompt: `${STYLE} Portrait of a genuine tiefling female seer, not theatrical at all — plain clothes, uncomfortable expression of someone who sees things they didn't ask to see, haunted eyes, a single candle burning on the table before her. Simple room background.` },
  { file: 'npcs/fortune-teller-04.png', prompt: `${STYLE} Portrait of an otherworldly aasimar female oracle, golden skin, white hair, luminous wide eyes that focus on something a few inches beyond the physical world, speaking words that are clearly not meant for the listener alone. Stone temple background.` },

  // ── ARENA-MASTER ──────────────────────────────────────────────────────────
  { file: 'npcs/arena-master-01.png', prompt: `${STYLE} Portrait of a ruthless human male arena master, stocky, shaved head, gold teeth, rings on every finger, a silk tunic that costs more than most guards earn in a year, the relaxed authority of a man who controls the outcome. Arena box seats background.` },
  { file: 'npcs/arena-master-02.png', prompt: `${STYLE} Portrait of a powerfully built half-orc female arena master, grey-green skin, a broken nose healed twice, elaborate braided hair pinned with trophies from past champions she outlasted, a ledger in one hand. Arena gate background.` },
  { file: 'npcs/arena-master-03.png', prompt: `${STYLE} Portrait of a smooth-talking tiefling male fight promoter, elegant horns, a showman's grin, expensive but flashy clothes, a contract always visible in his breast pocket, the ability to make anything sound exciting. Coliseum archway background.` },
  { file: 'npcs/arena-master-04.png', prompt: `${STYLE} Portrait of a scarred veteran dwarf female arena master, retired champion herself, old fighting scars she wears with pride, no-nonsense expression, iron-banded armor under a promoter's silk sash, respects courage and despises cowardice equally. Sand arena background.` },

  // ── WAR-VETERAN ───────────────────────────────────────────────────────────
  { file: 'npcs/war-veteran-01.png', prompt: `${STYLE} Portrait of a haunted human male war veteran, deep-lined face, a thousand-yard stare that occasionally returns to the present, a weathered regimental coat he still wears out of habit, one hand that has trouble keeping still. Tavern corner background.` },
  { file: 'npcs/war-veteran-02.png', prompt: `${STYLE} Portrait of a composed half-orc female war veteran, old campaign scars worn with quiet dignity, a retired commander's bearing, simple practical clothes, a sword she hasn't put down since the war ended. Village square background.` },
  { file: 'npcs/war-veteran-03.png', prompt: `${STYLE} Portrait of an ancient elven male war survivor, dark eyes that have seen civilizations rise and fall, quiet grief behind a controlled expression, still lean and dangerous despite his years, wearing old campaign medals only he still recognizes. Firelit inn background.` },
  { file: 'npcs/war-veteran-04.png', prompt: `${STYLE} Portrait of a young dwarf female veteran who aged early, solid reliable face with deep-set practical eyes, short hair, an arm that healed slightly wrong, a regimental tattoo, and the specific efficiency of movement of someone trained to kill at very close range. Guard post background.` },

  // ── TOWN-CRIER ────────────────────────────────────────────────────────────
  { file: 'npcs/town-crier-01.png', prompt: `${STYLE} Portrait of an enthusiastic human male town crier, bright-eyed, mid-announcement, bell in one hand and a proclamation scroll in the other, city livery tabard, naturally loud projecting expression. Market square background.` },
  { file: 'npcs/town-crier-02.png', prompt: `${STYLE} Portrait of a weary gnome female herald, far too many proclamation scrolls stuffed in her satchel, expression of someone who knows too much city news and finds none of it surprising anymore, official city livery. Gatehouse background.` },
  { file: 'npcs/town-crier-03.png', prompt: `${STYLE} Portrait of a dignified elderly halfling male town scribe-herald, an air of importance, impeccably maintained official robes, parchment and quill always ready, a man who takes civic duty very seriously. Town hall steps background.` },
  { file: 'npcs/town-crier-04.png', prompt: `${STYLE} Portrait of a sharp human female royal messenger, practical riding clothes, a sealed letter bearing a noble crest, dusty from hard travel, alert watchful eyes, clearly carrying something important. Inn stable background.` },

  // ── UNDERTAKER ────────────────────────────────────────────────────────────
  { file: 'npcs/undertaker-01.png', prompt: `${STYLE} Portrait of a pale gaunt human male mortician, black professional clothes, quiet composed expression, long careful fingers, the practiced patience of a man who deals in permanent conclusions, kind eyes despite the grim profession. Stone chapel background.` },
  { file: 'npcs/undertaker-02.png', prompt: `${STYLE} Portrait of a matter-of-fact dwarf female undertaker, stout practical build, dark working apron over respectable clothes, direct manner, the brisk efficiency of someone who has normalized what most people fear. Cemetery background.` },
  { file: 'npcs/undertaker-03.png', prompt: `${STYLE} Portrait of a thoughtful tiefling male grief counselor-mortician, soft expression that invites confession, dark but well-kept robes, a small holy symbol worn for the bereaved rather than for himself. Temple anteroom background.` },
  { file: 'npcs/undertaker-04.png', prompt: `${STYLE} Portrait of a serene elderly elf female death rite keeper, ancient formal burial vestments, the ageless calm of someone who has performed thousands of final rites, a quiet authority that transcends the morbid. Stone catacomb background.` },
];

// Archetype → how many variants exist (used by NPCCodex for hash-based selection)
const NPC_ARCHETYPE_COUNTS = {
  merchant: 5, innkeeper: 5, guard: 5, noble: 5, scholar: 5,
  healer: 5, priest: 5, blacksmith: 5, informant: 5, elder: 5,
  criminal: 5, 'mysterious-stranger': 4, bard: 5, ranger: 5,
  mercenary: 5, sailor: 5, alchemist: 4, 'bounty-hunter': 4,
  oracle: 4, cultist: 4, gladiator: 4, 'retired-adventurer': 5,
  witch: 4, 'plague-doctor': 4, diplomat: 4, beggar: 4,
  ferryman: 4, farmer: 4, monk: 4, inquisitor: 4, explorer: 4,
  // Expanded archetypes
  knight: 4, 'court-mage': 4, 'pirate-captain': 4, herbalist: 4,
  'shadow-agent': 4, 'fortune-teller': 4, 'arena-master': 4,
  'war-veteran': 4, 'town-crier': 4, undertaker: 4,
};

// ── ENEMY GENDER / ELITE VARIANTS ────────────────────────────────────────────
const ENEMY_VARIANT_FLAVOR = {
  'goblin-f': 'a wiry female goblin with cunning yellow eyes, wild dark hair, jagged teeth in a vicious grin, scraps of mismatched armour, clutching a crude curved blade',
  'goblin-elite': 'an elite goblin champion, taller than average, wearing stolen plate armour pieces welded together, a war trophy necklace, battle-scarred face radiating dangerous cunning',
  'skeleton-f': 'a female skeleton warrior, delicate but lethal bone frame strung with black sinew, faded feminine armour, glowing violet eye sockets, a graceful fighting stance',
  'zombie-f': 'a female zombie, pallid rotting skin, tattered dress, empty white eyes, shambling forward with outstretched decayed hands, dark fluid matting her hair',
  'orc-warrior-f': 'a fierce orcish female warrior, deep green skin, tusks filed to points, tribal war paint, heavy shoulders, wielding twin axes with practiced aggression',
  'bandit-f': 'a cunning female bandit, quick sharp eyes under a road-worn hood, mismatched armour with guild markings, twin daggers at her hips, a dangerous easy smile',
  'ghost-f': 'a female ghost, ethereal translucent figure of a woman in torn flowing robes, hollow sorrow in her spectral eyes, wisps of cold mist curling from her hands',
  'cultist-f': 'a female cultist true believer, hollow devotion in sunken eyes, dark ceremonial robes with a sinister brand on her wrist, arms raised in fervent supplication',
  'demon-f': 'a female demon, lithe and terrifying, obsidian horns curving back, dark scaled skin, burning amber eyes radiating malice, claws like blades',
  'gnoll-f': 'a female gnoll huntress, spotted hyena-like fur, lean and fast, laughing jaws showing rows of crushing teeth, a bone-tipped spear, manic battle-gleam in her eyes',
  'kobold-f': 'a female kobold trap-setter, small and quick, bright orange scales, oversized eyes glowing with clever malice, a tool belt stuffed with trip-wires and snares',
  'wight-f': 'a female wight, undead noblewoman, tattered finery hanging on a corpse-thin frame, black sunken eyes burning with cold hatred, withered hands that drain life at a touch',
  'wraith-f': 'a female wraith, a shadow of a woman barely visible within a column of freezing darkness, silver hair dissolving into smoke, a scream locked behind silent lips',
  'troll-f': 'a female troll, enormous and moss-covered, long stringy hair draped with river weeds, knuckles dragging the ground, regenerating wounds closing before your eyes, low rumbling growl',
  'ogre-f': 'a female ogre, massive and brutal, warty brown-grey skin, matted hair stuck with bones, wearing a makeshift pauldron of salvaged armour, a club the size of a door',
};

const ENEMY_VARIANT_FILES = [
  'enemies/goblin-f.png', 'enemies/goblin-elite.png', 'enemies/skeleton-f.png',
  'enemies/zombie-f.png', 'enemies/orc-warrior-f.png', 'enemies/bandit-f.png',
  'enemies/ghost-f.png', 'enemies/cultist-f.png', 'enemies/demon-f.png',
  'enemies/gnoll-f.png', 'enemies/kobold-f.png', 'enemies/wight-f.png',
  'enemies/wraith-f.png', 'enemies/troll-f.png', 'enemies/ogre-f.png',
];

function enemyVariantAsset(file) {
  const base = file.replace('enemies/', '').replace('.png', '');
  const flavor = ENEMY_VARIANT_FLAVOR[base] || 'a menacing variant creature, unique pose and expression';
  return { file, prompt: `${STYLE} Portrait of a menacing fantasy enemy: ${flavor}. Dramatic lighting, strong readable silhouette, full of threat and personality, fitting a painterly animated-fantasy bestiary. Waist-up composition, dark atmospheric background.` };
}

// ── VILLAIN PORTRAITS ─────────────────────────────────────────────────────────
// 25 pre-generated boss/villain archetypes for named antagonists.
// Client picks by name-hash so the same villain always gets the same portrait.
const VILLAIN_PORTRAIT_ASSETS = [
  { file: 'villains/ancient-lich.png', prompt: `${STYLE} Portrait of an Ancient Lich, supreme undead sorcerer, gaunt skeletal face with burning violet eye sockets, elaborate dark robes covered in necrotic runes, a staff crowned with a screaming skull, radiating dread and absolute power. Dramatic throne of bones background.` },
  { file: 'villains/blood-countess.png', prompt: `${STYLE} Portrait of a Blood Countess, ancient vampire noblewoman, pale perfect beauty with predatory crimson eyes, elaborate dark court dress of blood-red and black, a goblet of dark wine, expression of cold aristocratic cruelty. Dark palace hall with candelabras background.` },
  { file: 'villains/corrupted-priest.png', prompt: `${STYLE} Portrait of a Corrupted High Priest, once holy figure now fallen to darkness, torn ceremonial vestments covered in dark stains, holy symbols twisted into profane versions, eyes glowing with eldritch corruption, arms raised in dark invocation. Ruined cathedral background.` },
  { file: 'villains/cruel-noble.png', prompt: `${STYLE} Portrait of a Cruel Noble, a powerful lord of ruthless ambition, immaculate expensive clothes masking a cold tyrant, thin smile that never reaches his calculating eyes, rings of office on every finger, a hidden dagger in his sleeve. Opulent manor background.` },
  { file: 'villains/cult-prophet.png', prompt: `${STYLE} Portrait of a Cult Prophet, charismatic and deeply dangerous, fever-bright eyes burning with absolute conviction, elaborate cult vestments, arms raised in proclamation, a crowd of shadows behind him, the terrifying certainty of the truly devout. Dark cavern temple background.` },
  { file: 'villains/dark-sorceress.png', prompt: `${STYLE} Portrait of a Dark Sorceress, a powerful mage who has embraced forbidden magic, striking severe beauty, dark robes crackling with shadow-lightning, arcane sigils floating around her outstretched hand, cold contempt for all lesser beings. Stormy tower background.` },
  { file: 'villains/death-herald.png', prompt: `${STYLE} Portrait of a Death Herald, divine emissary of oblivion, spectral half-visible form, dark armour engraved with endings, a black scythe, empty eye sockets with a single cold blue flame in each, a calm that precedes annihilation. Battlefield of bones background.` },
  { file: 'villains/demon-lord.png', prompt: `${STYLE} Portrait of a Demon Lord, immense and ancient infernal power, massive curved horns, volcanic dark skin cracked with magma-light, eyes of hellfire, an armour of fused souls, absolute dominion in his posture. Abyssal throne room background.` },
  { file: 'villains/fallen-champion.png', prompt: `${STYLE} Portrait of a Fallen Champion, once the greatest hero of the realm, corrupted beyond recognition, cracked gleaming armour now dark with ichor, former noble face twisted with rage and grief, a legendary blade now burning with dark fire. Ruined battlefield background.` },
  { file: 'villains/forsaken-ranger.png', prompt: `${STYLE} Portrait of a Forsaken Ranger, a lone hunter who made a terrible pact, hollow haunted eyes, dark weathered travelling clothes, twin blades of unnatural darkness, moving with predatory silence, something feral where conscience used to be. Dark forest background.` },
  { file: 'villains/frost-witch.png', prompt: `${STYLE} Portrait of a Frost Witch, ancient and powerful winter sorceress, ice-blue skin, white hair frozen into jagged spikes, robes of woven snow and shadow, one hand raised conjuring a blizzard, cold cruelty in her crystalline eyes. Blizzard mountain pass background.` },
  { file: 'villains/iron-tyrant.png', prompt: `${STYLE} Portrait of an Iron Tyrant, ruthless warlord-king of an iron empire, massive black plate armour etched with the names of conquered nations, a crown of bent swords, an expression of absolute domination, fists clenched, no mercy in his face. War-ravaged throne room background.` },
  { file: 'villains/mad-alchemist.png', prompt: `${STYLE} Portrait of a Mad Alchemist, brilliant mind shattered by forbidden experiments, wild manic eyes behind cracked goggles, coat stained by a hundred dangerous reagents, a bubbling creation in one hand that should not exist, unstable brilliant insane. Ruinous laboratory background.` },
  { file: 'villains/masked-villain.png', prompt: `${STYLE} Portrait of a Masked Villain, identity hidden behind an ornate and unsettling mask, elegant dark clothing that reveals nothing, perfectly still in a way that feels predatory, a presence that commands absolute attention. Shadowed chamber background.` },
  { file: 'villains/merchant-of-doom.png', prompt: `${STYLE} Portrait of a Merchant of Doom, a smiling trader in cursed artefacts and damned souls, fine merchant clothes hiding terrible power, a ledger of contracts no one should have signed, a warm handshake that leaves a brand. Dark bazaar background.` },
  { file: 'villains/necromancer-queen.png', prompt: `${STYLE} Portrait of a Necromancer Queen, undead empress commanding legions of the dead, regal and terrible, white skin, dark robes of burial cloth and shadow, a crown of skulls, cold violet eyes, one skeletal hand raised in command. Crypt throne room background.` },
  { file: 'villains/pirate-lord.png', prompt: `${STYLE} Portrait of a Pirate Lord, feared master of the seas, weather-beaten and dangerous, a captain's coat heavy with trophies, a legendary blade at his hip, one eye replaced by a scrying stone, a grin that means someone is about to die. Ship deck in a storm background.` },
  { file: 'villains/plague-bearer-lord.png', prompt: `${STYLE} Portrait of a Plague Bearer Lord, avatar of pestilence, a once-human figure now vessel for divine rot, tattered dark robes, skin mottled with spreading corruption, empty eyes weeping black tears, an aura of sickness that precedes him. Diseased city background.` },
  { file: 'villains/serpent-queen.png', prompt: `${STYLE} Portrait of a Serpent Queen, yuan-ti or serpentine sorceress of terrible beauty, coiled lower body, human upper torso with scaled skin, cold reptilian eyes, elaborate jade and gold ceremonial dress, commanding presence of an ancient bloodline. Serpent temple background.` },
  { file: 'villains/shadow-master.png', prompt: `${STYLE} Portrait of a Shadow Master, supreme spymaster and assassin, a figure barely visible against the dark, a face that suggests rather than reveals, darkness bending toward them as if loyal, the sense of someone who controls everything from unseen places. Absolute darkness background with a single point of light.` },
  { file: 'villains/storm-tyrant.png', prompt: `${STYLE} Portrait of a Storm Tyrant, storm giant sorcerer-warlord, crackling with continuous lightning, sixty feet of divine arrogance, hair a storm cloud, eyes hurricane-grey, voice thunder itself. Storm-wracked mountain peak background.` },
  { file: 'villains/undead-warlord.png', prompt: `${STYLE} Portrait of an Undead Warlord, wight or death knight commanding undead armies, imposing dark armour crackling with necrotic energy, hollow glowing eyes, a broadsword that drains life, the cold strategic intelligence of a general who cannot be killed. Battlefield of risen dead background.` },
  { file: 'villains/void-herald.png', prompt: `${STYLE} Portrait of a Void Herald, emissary of an eldritch outer power, reality warping around its outline, a body that is mostly suggestion, eyes that contain the emptiness between stars, speaking in a voice that arrives before the mouth moves. Fractured reality background.` },
  { file: 'villains/war-tyrant.png', prompt: `${STYLE} Portrait of a War Tyrant, conquering warlord who has never lost, scarred and enormous, black armour covered in the sigils of defeated nations, a great axe, presence that makes lesser warriors' legs shake, a general who makes war look inevitable. Burning siege background.` },
  { file: 'villains/witch-queen.png', prompt: `${STYLE} Portrait of a Witch Queen, ancient matriarch of dark covens, terrible ageless beauty, elaborate dark robes woven with living shadows, a staff of twisted bone and moonstone, eyes that have cursed kingdoms, commanding absolute reverence from those who serve her. Dark forest throne background.` },
  { file: 'villains/vampire-lord.png', prompt: `${STYLE} Portrait of a Vampire Lord, ancient male vampire of terrifying aristocratic power, pale angular face of cold predatory beauty, swept-back dark hair, immaculate dark coat with crimson lining, fangs half-bared in a smile that promises nothing good, eyes burning red in the darkness. Gothic castle hall background.` },
  { file: 'villains/dark-elf-queen.png', prompt: `${STYLE} Portrait of a Dark Elf Queen, drow matriarch of absolute authority, jet-black skin, white hair in an elaborate ceremonial arrangement bound with spider-silk, deep violet eyes of merciless intelligence, dark ceremonial armour etched with spider motifs, a whip of living shadow in her hand. Underground palace background with bioluminescent fungi.` },
  { file: 'villains/beast-lord.png', prompt: `${STYLE} Portrait of a Beast Lord, werewolf alpha of monstrous size, half-transformed between man and wolf, enormous clawed hands, amber eyes burning with predatory cunning, shredded tribal furs, a pack-leader's authority in every line of his hunched powerful body. Dark forest at full moon background.` },
  { file: 'villains/infernal-duke.png', prompt: `${STYLE} Portrait of an Infernal Duke, a greater devil of bureaucratic evil, immaculate dark infernal formalwear that makes him look like a corrupted nobleman, small elegant horns, a charming smile of absolute insincerity, a contract case under one arm, the terrifying politeness of something that owns your soul already. Hellish courtroom background.` },
  { file: 'villains/dragon-herald.png', prompt: `${STYLE} Portrait of a Dragon Herald, fanatical champion of a dragon cult, human face half-transformed by draconic blessing — scaled jaw, slitted pupils, vestigial ridge of horns — elaborate cult armour with dragon-scale pauldrons, a devotion in his expression that borders on rapture. Dragon temple background.` },
  { file: 'villains/unseelie-queen.png', prompt: `${STYLE} Portrait of an Unseelie Queen, dark fey monarch of terrible alien beauty, razor-sharp features, silver-black hair braided with night-blooming flowers, diaphanous dark robes, eyes like twin moons, a smile that suggests cruelty is simply the natural order of things. Dark enchanted forest background with cold blue light.` },
  { file: 'villains/blood-mage.png', prompt: `${STYLE} Portrait of a Blood Mage, a sorcerer who bleeds for power, pale from deliberate blood loss, ritual cuts covering both forearms, crimson energy crackling between his fingers, hollow intense eyes locked in a state of painful ecstasy, dark robes soaked at the sleeves. Ritual chamber background with floating blood droplets.` },
  { file: 'villains/abyssal-champion.png', prompt: `${STYLE} Portrait of an Abyssal Champion, a mortal warrior fully claimed by the Abyss, massive demonic armour fused to corrupted flesh, a face half-human half-monster, eyes of burning void, wielding a great maul wreathed in purple-black demonic fire. Ruined battlefield strewn with summoning circles background.` },
  { file: 'villains/kraken-priest.png', prompt: `${STYLE} Portrait of a Kraken Priest, high priest of a deep sea elder god, waterlogged robes hung with coral and barnacles, pallid bloated skin, eyes filmed milky-white with divine revelation, tentacle motifs carved into ceremonial armour, arms raised in invocation of something vast and sunken. Storm-battered coastal ruin background.` },
  { file: 'villains/dark-paladin.png', prompt: `${STYLE} Portrait of a Dark Paladin, a holy warrior whose faith became something inverted and terrible, black plate armour still bearing the defaced symbols of a forgotten god, unholy radiance emanating from his gauntlets, expression of absolute righteousness twisted into something wrong. Corrupted cathedral background.` },
  { file: 'villains/gnoll-warlord.png', prompt: `${STYLE} Portrait of a Gnoll Warlord, a massive hyena-headed commander of ravaging war-bands, enormous scarred frame, heavy patchwork armour of looted pieces, a trophy necklace of enemy commanders, laughing jaws open in a battle cry, the frenzied confidence of a general who wins by sheer unstoppable violence. Burning village background.` },
  { file: 'villains/time-ravager.png', prompt: `${STYLE} Portrait of a Time Ravager, a chronomancer villain consumed by temporal paradox, a body that exists in multiple moments at once — young and ancient simultaneously, flickering at the edges, eyes that have seen every possible outcome, dark robes fractured with clockwork and hourglass motifs, holding a staff that bends light around it. Fractured timeline background with overlapping realities.` },
];

ASSETS.push(
  ...NPC_PORTRAITS,
  ...RACE_VARIANT_FILES.map(raceVariantAsset),
  ...ITEM_VARIANT_FILES.map(itemIconAsset),
  ...ENEMY_FILES.map(enemyPortraitAsset),
  ...ENEMY_VARIANT_FILES.map(enemyVariantAsset),
  ...VILLAIN_PORTRAIT_ASSETS,
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

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

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
