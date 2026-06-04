import OpenAI from 'openai';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption, CampaignJournalEntry, CharacterHistoryEntry, Antagonist } from '../../../shared/types';
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

STATUS EFFECTS RULES:
- Status effects represent ongoing conditions: Poisoned, Blessed, Cursed, Burning, Stunned, Inspired, etc.
- Add effects when narratively appropriate (entering a cursed place, drinking a potion, blessed by a priest).
- Remove effects when they expire or are cured.
- statusEffectChanges.add: array of {name, description, type: "buff"|"debuff"|"neutral", duration} (duration in turns, null = indefinite)
- statusEffectChanges.remove: array of effect names to remove

SHOP/MERCHANT RULES:
- When the character encounters a merchant, trader, or shop, set isMerchant: true and populate shopItems.
- shopItems: array of {id, name, description, type, price, quantity} — 4-8 items appropriate to the setting.
- The player can then choose to buy items (handled separately). Do not auto-deduct gold.

ACT PROGRESSION RULES:
- When a major story milestone is reached (a major villain defeated, a crucial revelation, a catastrophic loss), set advanceAct: true.
- This signals a chapter transition — use it sparingly, only for truly pivotal moments.
- When advancing act, write a more dramatic, conclusive narration that wraps the current chapter.

NARRATIVE TIER RULES (based on character level):
- Level 1-3 (EMERGING): Local threats only. NPCs don't know the character yet. Stakes are personal.
- Level 4-6 (KNOWN): Regional threats. Faction scouts notice the party. Antagonists hear rumors.
- Level 7-10 (FEARED): Major factions react to the party. Antagonists take personal interest. The party shapes events.
- Level 11+ (LEGENDARY): The party IS the news. Former enemies negotiate. New threats emerge because of their power.

ANTAGONIST AWARENESS RULES:
- If an antagonist's isRevealed is false, NEVER name them directly. Drop hints, use their pawns, create dread.
- If isRevealed is true, they can appear, send agents, react to the party's actions.
- Always advance the current antagonist step subtly in background events when narratively appropriate.
- Set antagonistUpdate in response when antagonist situation changes.

HIGH STAKES DETECTION:
- Set isHighStakes: true when the moment is a major pivot: moral dilemma with no right answer, irreversible act, betrayal, major sacrifice, meeting a primary antagonist agent for the first time.
- When isHighStakes: true, generate choiceCards (2-3 options). Each has title (3-5 words), description (1 sentence, evocative), consequenceHint (vague, ominous, not a spoiler).
- When isHighStakes: true, keep narration shorter and more tense. Build to the choice.

CHARACTER HISTORY RULES:
- Set characterHistoryNote when the player makes a significant choice that should echo forward: sparing/killing someone important, making an oath, gaining a powerful enemy, doing something morally significant.

CAMPAIGN JOURNAL AWARENESS:
- You have access to the full campaign journal. Reference past events naturally. NPCs remember. The world has changed.
- If the journal mentions the player burned a village, villagers in new areas have heard. If they saved a lord, his allies are warmer.

PROACTIVE WORLD EVENTS:
- Sometimes (not always, use judgment), set proactiveEvent: true and include a worldEvent in the narration preamble — something the WORLD did, not the player. The antagonist advanced their plan. A faction moved. A rumor reached town. Something changed without the player causing it.

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
  "hpChange": number | null,
  "isMerchant": boolean,
  "shopItems": [{"id": "item-id", "name": "item name", "description": "one sentence", "type": "weapon|armor|potion|misc|key", "price": 10, "quantity": 1}] | null,
  "advanceAct": boolean,
  "statusEffectChanges": {"add": [{"name": "string", "description": "string", "type": "buff|debuff|neutral", "duration": number | null}], "remove": ["effect name"]} | null,
  "sessionNote": "string — one sentence summary of what happened, added to DM notes" | null,
  "isHighStakes": boolean,
  "choiceCards": [{"title": "string", "description": "string", "consequenceHint": "string"}] | null,
  "characterHistoryNote": {"type": "choice|ally|enemy|oath|deed|loss", "description": "string", "impact": "string"} | null,
  "antagonistUpdate": {"name": "string", "newStep": "string|null", "lastAction": "string", "nowKnowsPlayers": boolean} | null,
  "proactiveEvent": boolean
}`;

export async function generateNarration(
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[],
  campaignContext?: {
    journal: CampaignJournalEntry[];
    characterHistory: CharacterHistoryEntry[];
    antagonists: Antagonist[];
    centralConflict: string;
    act: number;
    sessionCount: number;
  } | null
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
  isMerchant?: boolean;
  shopItems?: { id: string; name: string; description: string; type: string; price: number; quantity: number }[];
  advanceAct?: boolean;
  statusEffectChanges?: { add?: { name: string; description: string; type: string; duration?: number }[]; remove?: string[] };
  sessionNote?: string;
  isHighStakes?: boolean;
  choiceCards?: { title: string; description: string; consequenceHint: string }[];
  characterHistoryNote?: { type: string; description: string; impact: string };
  antagonistUpdate?: { name: string; newStep?: string; lastAction?: string; nowKnowsPlayers?: boolean };
  proactiveEvent?: boolean;
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
HP: ${character.hp}/${character.max_hp} | Gold: ${character.gold}
${character.backstory ? `BACKSTORY: ${character.backstory.slice(0, 300)} — weave this into narration and NPC reactions where relevant.` : ''}
${character.status_effects && character.status_effects.length > 0 ? `ACTIVE STATUS EFFECTS: ${character.status_effects.map(e => `${e.name} (${e.type})`).join(', ')} — these affect what the character can do.` : ''}
Notable inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
${abilitiesContext}
STAT CONTEXT (factor into suggestedActions): ${statHints || 'balanced stats'}

RECENT EVENTS:
${recentHistory.slice(-8).join('\n')}

PLAYER ACTION: ${action}

IMPORTANT: If this action introduces or involves a named NPC, include their name, disposition, and a brief note in worldStateChanges.npcMemory. If a quest begins or progresses, include it in worldStateChanges.activeQuests. Always update worldState.currentLocation if the character moves.${campaignContext ? `

CAMPAIGN CONTEXT:
Central Conflict: ${campaignContext.centralConflict}
Act: ${campaignContext.act} | Session: ${campaignContext.sessionCount}

CAMPAIGN JOURNAL (story so far):
${campaignContext.journal.slice(-5).map(j => `[Act ${j.actNumber}, Session ${j.sessionNumber}] ${j.summary}. Key decisions: ${j.keyDecisions.join('; ')}`).join('\n') || 'No journal entries yet.'}

CHARACTER HISTORY (decisions that echo forward):
${campaignContext.characterHistory.slice(-10).map(h => `- [${h.type.toUpperCase()}] ${h.description} → ${h.impact}`).join('\n') || 'No significant history yet.'}

ACTIVE ANTAGONISTS:
${campaignContext.antagonists.map(a => `- ${a.isRevealed ? a.name : '[UNKNOWN FORCE]'} (${a.power}, ${a.type}): ${a.agenda}. Currently: ${a.currentStep}. Knows about players: ${a.whatTheyKnow}`).join('\n') || 'No antagonists defined yet.'}

NARRATIVE TIER: ${campaignContext.act <= 1 && character.level <= 3 ? 'EMERGING — local stakes, unknown heroes' : character.level <= 6 ? 'KNOWN — regional threats, factions noticing' : character.level <= 10 ? 'FEARED — major powers react, antagonists engage' : 'LEGENDARY — world-shaping, former enemies bow'}` : ''}`;

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
    isMerchant: parsed.isMerchant || false,
    shopItems: parsed.shopItems || undefined,
    advanceAct: parsed.advanceAct || false,
    statusEffectChanges: parsed.statusEffectChanges || undefined,
    sessionNote: parsed.sessionNote || undefined,
    isHighStakes: parsed.isHighStakes || false,
    choiceCards: parsed.choiceCards || undefined,
    characterHistoryNote: parsed.characterHistoryNote || undefined,
    antagonistUpdate: parsed.antagonistUpdate || undefined,
    proactiveEvent: parsed.proactiveEvent || false,
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
