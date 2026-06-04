import OpenAI from 'openai';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption } from '../../../shared/types';
import { CLASS_ABILITIES } from '../../../shared/classAbilities';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ART_STYLE_PREFIX =
  'Dark fantasy illustration style. Muted earth tones — deep browns, slate grays, forest greens, ember reds. ' +
  'High contrast lighting, single dramatic light source. Painterly texture, reminiscent of classic fantasy book cover art from the 1980s and 1990s. ' +
  'No cel shading, no anime influence, no bright saturated colors. Atmospheric, slightly grim. Highly detailed. ';

const DM_SYSTEM_PROMPT = `You are a master Dungeon Master running a dark fantasy tabletop RPG campaign.
Your style is immersive, morally complex, and gritty — inspired by classic fantasy like Gemmell, Abercrombie, and Cook.

TONE RULES:
- No easy redemption arcs. Actions have lasting consequences.
- NPCs have hidden motives. Trust is earned, not given.
- The world is indifferent to the heroes. Victories are pyrrhic, failures are instructive.
- Magic is rare, costly, and awe-inspiring — never trivial.
- Death is real. Combat is dangerous. Fear is appropriate.
- Vivid sensory details: smells, textures, sounds, temperatures.
- Speak in second person ("You see...", "Before you...").
- Keep narration to 150-250 words unless the moment demands more.

WORLD MEMORY RULES:
- NPCs are persistent. If you introduce a named NPC, they remember the character in future sessions.
- Update worldStateChanges.npcMemory when a named NPC is introduced or relationship changes.
- Update worldStateChanges.activeQuests when a quest begins, progresses, or resolves.
- Always update worldStateChanges.currentLocation when the party moves to a new place.
- worldStateChanges follows the same shape as the worldState object — only include fields that actually changed.

LOOT RULES:
- Only award loot when narratively earned: defeating enemies, looting bodies/containers, finding hidden caches, completing quests.
- 1-3 items max per loot event. Make items feel meaningful and setting-appropriate.
- Item types: weapon, armor, potion, misc, key
- goldChange: positive integer when earning gold, negative when spending. null if no gold change.
- hpChange: positive to heal, negative for damage taken. null if no HP change.

RESPONSE FORMAT: Always respond with valid JSON matching this schema:
{
  "narration": "string — the story text the player sees",
  "diceRequired": boolean,
  "diceType": "d4|d6|d8|d10|d12|d20|d100" | null,
  "diceDC": number | null,
  "diceDescription": "string describing what the roll determines" | null,
  "worldStateChanges": object | null,
  "suggestedActions": ["action1", "action2", "action3"],
  "sceneImagePrompt": "brief scene description for image generation",
  "isLevelUp": boolean,
  "isDeath": boolean,
  "deathDescription": "string" | null,
  "isCombat": boolean,
  "isVictory": boolean,
  "enemyName": "string | null",
  "loot": [{"id": "unique-id", "name": "item name", "description": "one sentence", "quantity": 1, "type": "weapon|armor|potion|misc|key", "value": 10}] | null,
  "goldChange": number | null,
  "hpChange": number | null
}`;

export async function generateNarration(
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[]
): Promise<{
  narration: string;
  diceRequired: boolean;
  diceType?: string;
  diceDC?: number;
  diceDescription?: string;
  worldStateChanges?: Partial<WorldState>;
  suggestedActions: string[];
  sceneImagePrompt: string;
  isLevelUp: boolean;
  isDeath: boolean;
  deathDescription?: string;
  isCombat: boolean;
  isVictory: boolean;
  enemyName?: string;
  loot?: { id: string; name: string; description: string; quantity: number; type: string; value?: number }[];
  goldChange?: number;
  hpChange?: number;
}> {
  // Build unusual race/class combo note
  const unusualCombos: Record<string, string[]> = {
    Barbarian: ['Gnome', 'Elf'],
    Wizard: ['Half-Orc', 'Dragonborn'],
    Paladin: ['Tiefling', 'Half-Orc'],
    Bard: ['Dwarf', 'Half-Orc'],
    Monk: ['Half-Orc', 'Dragonborn'],
  };
  const unusualNote = unusualCombos[character.class]?.includes(character.race)
    ? `\n⚠ UNUSUAL COMBO: ${character.race} ${character.class} — the DM may acknowledge this in-world with subtle reactions from NPCs.`
    : '';

  // Build abilities context
  const classAbilityMap = CLASS_ABILITIES[character.class] || {};
  const allAbilityNames = Object.values(classAbilityMap).map(a => a.name);
  const knownAbilities = character.abilities?.map(a => a.name) || [];
  const abilitiesContext = knownAbilities.length > 0
    ? `Known abilities: ${knownAbilities.join(', ')}`
    : `No special abilities yet (class abilities to come: ${allAbilityNames.slice(0, 2).join(', ')}, ...)`;

  // Build stat context
  const s = character.stats;
  const statHints = [
    s.str >= 15 ? `STR ${s.str} → can force doors, break obstacles, intimidate physically` : s.str <= 8 ? `STR ${s.str} → avoid purely physical brute-force options` : null,
    s.dex >= 15 ? `DEX ${s.dex} → can sneak, pick locks, acrobatics` : null,
    s.int >= 15 ? `INT ${s.int} → can recall lore, solve puzzles, identify magic` : s.int <= 8 ? `INT ${s.int} → avoid complex lore options in suggestedActions` : null,
    s.wis >= 15 ? `WIS ${s.wis} → perceptive, reads people well` : null,
    s.cha >= 15 ? `CHA ${s.cha} → can persuade, deceive, perform, intimidate socially` : s.cha <= 8 ? `CHA ${s.cha} → avoid diplomacy/charm options in suggestedActions` : null,
  ].filter(Boolean).join('; ');

  // Build NPC memory context
  const npcContext = worldState.npcMemory && worldState.npcMemory.length > 0
    ? `\nKNOWN NPCs (they remember the character):\n${worldState.npcMemory.slice(0, 6).map(n => `- ${n.name} [${n.disposition}]: ${n.notes}`).join('\n')}`
    : '';

  // Build quest context
  const questContext = worldState.activeQuests && worldState.activeQuests.length > 0
    ? `\nACTIVE QUESTS:\n${worldState.activeQuests.filter(q => q.status === 'active').map(q => `- ${q.title}: ${q.description}`).join('\n')}`
    : '';

  const worldContext = `
WORLD BIBLE SUMMARY:
- Era: ${worldBible.era}
- Magic: ${worldBible.magicSystem}
- Factions: ${worldBible.factions.map(f => f.name).join(', ')}
- Pantheon: ${worldBible.pantheon.map(g => g.name).join(', ')}
- Tone: ${worldBible.toneRules.slice(0, 2).join('; ')}

CURRENT WORLD STATE:
- Location: ${worldState.currentLocation || 'Unknown'}
- Time: ${worldState.timeOfDay || 'unknown'}
- Weather: ${worldState.weather || 'unclear'}
- Discovered locations: ${(worldState.discoveredLocations || []).slice(0, 5).join(', ') || 'none yet'}
${npcContext}${questContext}

CHARACTER: ${character.name} (${character.race} ${character.class}, Level ${character.level})${unusualNote}
HP: ${character.hp}/${character.max_hp}
Gold: ${character.gold}
Notable inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
${abilitiesContext}
STAT CONTEXT (factor into suggestedActions): ${statHints || 'balanced stats'}

RECENT EVENTS:
${recentHistory.slice(-8).join('\n')}

PLAYER ACTION: ${action}

IMPORTANT: If this action introduces or involves a named NPC, include their name, disposition, and a brief note in worldStateChanges.npcMemory. If a quest begins or progresses, include it in worldStateChanges.activeQuests. Always update worldState.currentLocation if the character moves.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: DM_SYSTEM_PROMPT },
      { role: 'user', content: worldContext },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);

  return {
    narration: parsed.narration || 'The world holds its breath...',
    diceRequired: parsed.diceRequired || false,
    diceType: parsed.diceType,
    diceDC: parsed.diceDC,
    diceDescription: parsed.diceDescription,
    worldStateChanges: parsed.worldStateChanges,
    suggestedActions: parsed.suggestedActions || [],
    sceneImagePrompt: parsed.sceneImagePrompt || '',
    isLevelUp: parsed.isLevelUp || false,
    isDeath: parsed.isDeath || false,
    deathDescription: parsed.deathDescription,
    isCombat: parsed.isCombat || false,
    isVictory: parsed.isVictory || false,
    enemyName: parsed.enemyName || undefined,
    loot: parsed.loot || undefined,
    goldChange: parsed.goldChange ?? undefined,
    hpChange: parsed.hpChange ?? undefined,
  };
}

export async function generateImage(description: string, cacheKey: string): Promise<string> {
  // Check cache first
  const { data: cached } = await supabaseAdmin
    .from('asset_cache')
    .select('url')
    .eq('cache_key', cacheKey)
    .single();

  if (cached?.url) return cached.url;

  const fullPrompt = ART_STYLE_PREFIX + description;

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  });

  const url = response.data[0]?.url;
  if (!url) throw new Error('No image URL returned from DALL-E');

  // Cache the result
  await supabaseAdmin.from('asset_cache').insert({
    cache_key: cacheKey,
    url,
    asset_type: 'scene',
  });

  return url;
}

export async function generateCharacterPortrait(
  name: string,
  race: string,
  characterClass: string,
  backstory?: string
): Promise<string> {
  const cacheKey = `portrait-${name}-${race}-${characterClass}`.toLowerCase().replace(/\s+/g, '-');

  const description = `Portrait of ${name}, a ${race} ${characterClass}. ${backstory ? backstory.slice(0, 100) : ''} Fantasy character portrait, face and shoulders, weathered and experienced.`;

  return generateImage(description, cacheKey);
}

export async function generateStorySeed(): Promise<StorySeedOption[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a master worldbuilder specializing in dark, gritty fantasy. Generate exactly 4 distinct campaign premises. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Generate 4 dark fantasy campaign seed options. Each should be distinct in tone and setting.
Return JSON array:
[{
  "id": "seed-1",
  "title": "Campaign title (3-5 words)",
  "premise": "2-3 sentence hook. Make it grim, intriguing, morally complex.",
  "tone": "e.g. 'Political intrigue and betrayal' or 'Cosmic horror and survival'",
  "startingLocation": "Name of starting city or location"
}]`,
      },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{"seeds":[]}';
  const parsed = JSON.parse(content);
  return parsed.seeds || parsed || [];
}

export async function generateWorldBible(storySeed: string): Promise<WorldBible> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a master worldbuilder. Create a detailed but consistent world bible for a dark fantasy RPG campaign. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Create a world bible for this campaign premise: "${storySeed}"

Return JSON matching exactly:
{
  "era": "Name of the age or era",
  "magicSystem": "2-3 sentence description of how magic works in this world",
  "geography": [
    {"name": "place name", "description": "2 sentence desc", "type": "city|region|dungeon|wilderness|landmark"}
  ],
  "pantheon": [
    {"name": "god name", "domain": "domain", "alignment": "alignment", "conflict": "their conflict with another deity"}
  ],
  "toneRules": ["rule 1", "rule 2", "rule 3", "rule 4"],
  "forbiddenLoreHooks": ["mystery 1", "mystery 2", "mystery 3", "mystery 4"],
  "factions": [
    {"name": "faction name", "publicFace": "what they claim to be", "secretAgenda": "what they actually want", "power": "weak|moderate|strong"}
  ]
}

Include 5-7 geography entries, 5-6 gods, exactly 4 tone rules, 3-4 forbidden lore hooks, exactly 3 factions.`,
      },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  return JSON.parse(content) as WorldBible;
}
