import OpenAI from 'openai';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption, CampaignJournalEntry, CharacterHistoryEntry, Antagonist, RollContext, CharacterOnlineStatus } from '../../../shared/types';
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

DICE ROLLING RULES:
- When an action requires a skill check or attack, set awaitingRoll: true instead of narrating the outcome.
- Populate rollContext with: stat (str/dex/con/int/wis/cha), dc (difficulty 8-25), diceType (almost always "d20"), description (what the player is attempting), successDescription (evocative hint at success, not a spoiler), failDescription (evocative hint at failure), isDramatic (true for high-stakes moments: saving throws vs death, critical attacks, unlocking the final door).
- When awaitingRoll: true, write a short tense setup narration (50-80 words) that builds to the roll — DO NOT resolve the outcome.
- Use diceRequired: false when awaitingRoll: true (these are different systems).
- Call for rolls more often: any attack, stealth attempt, persuasion, lock picking, climbing, knowledge check, saving throw.
- modifier: the relevant stat modifier (-5 to +5)

ITEM RULES:
- Items in the character's inventory are story hooks and tools. Build situations where they become relevant.
- Named/unique items (keys, orbs, runes, letters) MUST eventually have a purpose built around them.
- Consumable items (potions, scrolls, food, torches) get removed from inventory when used — set characterChanges.inventory to reflect this.
- Item durability matters: on a critical failure (roll of 1), fragile items break and are removed from inventory. Normal items have a small chance. Sturdy and indestructible items never break.
- When a character uses a weapon, reference its damage type. When they use a potion, describe the specific effect.
- Arrows and bolts deplete with use.

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
  "proactiveEvent": boolean,
  "awaitingRoll": boolean,
  "rollContext": {
    "stat": "str|dex|con|int|wis|cha",
    "dc": number,
    "diceType": "d20",
    "description": "string",
    "successDescription": "string (evocative, vague)",
    "failDescription": "string (evocative, vague)",
    "critSuccessDescription": "string | null",
    "critFailDescription": "string | null",
    "isDramatic": boolean,
    "modifier": number
  } | null
}`;

export async function generateSceneSummary(
  recentHistory: string[],
  currentLocation: string,
  characterName: string,
  combatState: WorldState['combatState']
): Promise<string> {
  const historyText = recentHistory.slice(-8).join('\n');
  const combatContext = combatState?.inCombat
    ? `\nCurrently in combat with ${combatState.enemyName} (${combatState.enemyCondition}, round ${combatState.roundNumber}).`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Summarize what is CURRENTLY happening in this RPG scene in 2-3 sentences. Be specific: who is present, what just happened, what the immediate situation is. Focus on the last few actions.${combatContext}\n\nLocation: ${currentLocation}\nCharacter: ${characterName}\n\nRecent events:\n${historyText}\n\nWrite ONLY the summary, no preamble.`,
    }],
    max_tokens: 150,
    temperature: 0.3,
  });

  return response.choices[0].message.content?.trim() || '';
}

function timeAgo(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

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
    otherCharacters?: CharacterOnlineStatus[];
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
  awaitingRoll?: boolean;
  rollContext?: RollContext;
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

  const combatState = worldState.combatState;
  const combatBlock = combatState?.inCombat ? `
━━━ ACTIVE COMBAT ━━━
ENEMY: ${combatState.enemyName} — Condition: ${combatState.enemyCondition.toUpperCase()} | Round: ${combatState.roundNumber}
PLAYER HP: ${character.hp}/${character.max_hp}
ACTIONS ALREADY TRIED: ${combatState.playerActionsAttempted.slice(-5).join(', ') || 'none yet'}
COMBAT RULE: Maintain enemy continuity. The ${combatState.enemyName} remembers every action taken so far. Do NOT reset the fight.
━━━━━━━━━━━━━━━━━━━━━` : '';

  const sceneSummaryBlock = worldState.currentSceneSummary ? `
CURRENT SITUATION (summary of what is happening RIGHT NOW):
${worldState.currentSceneSummary}` : '';

  const worldContext = `
WORLD BIBLE:
- Era: ${worldBible.era} | Magic: ${worldBible.magicSystem}
- Factions: ${worldBible.factions.map(f => f.name).join(', ')}
- Tone: ${worldBible.toneRules.slice(0, 2).join('; ')}

WORLD STATE:
- Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
- Discovered: ${(worldState.discoveredLocations || []).slice(0, 5).join(', ') || 'none yet'}
${npcContext}${questContext}

CHARACTER: ${character.name} (${character.race} ${character.class}, Lv${character.level})${unusualNote}
${character.backstory ? `BACKSTORY: ${character.backstory.slice(0, 200)}` : ''}
${character.status_effects && character.status_effects.length > 0 ? `STATUS EFFECTS: ${character.status_effects.map(e => `${e.name} (${e.type})`).join(', ')}` : ''}
Inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
${abilitiesContext} | STATS: ${statHints || 'balanced'}

${campaignContext ? `CAMPAIGN: Act ${campaignContext.act} | ${campaignContext.centralConflict}
JOURNAL: ${campaignContext.journal.slice(-3).map(j => `[Act ${j.actNumber}] ${j.summary}`).join(' | ') || 'none yet'}
HISTORY: ${campaignContext.characterHistory.slice(-5).map(h => `${h.description} → ${h.impact}`).join(' | ') || 'none'}
ANTAGONISTS: ${campaignContext.antagonists.map(a => `${a.isRevealed ? a.name : '[UNKNOWN]'}: ${a.agenda}`).join(' | ') || 'none'}
NARRATIVE TIER: ${campaignContext.act <= 1 && character.level <= 3 ? 'EMERGING — local stakes' : character.level <= 6 ? 'KNOWN — regional threats' : character.level <= 10 ? 'FEARED — major powers react' : 'LEGENDARY'}` : ''}

${campaignContext?.otherCharacters && campaignContext.otherCharacters.length > 0 ? `PARTY:
${campaignContext.otherCharacters.map(c => {
  const myLocation = worldState.characterLocations?.[character.id] || worldState.currentLocation;
  const together = c.lastLocation === myLocation;
  const status = c.isOnline ? 'Active' : `Offline (${timeAgo(c.lastSeen)})`;
  return `- ${c.characterName}: ${status}, ${c.lastLocation}${together ? ' (TOGETHER)' : ' (SEPARATED)'}`;
}).join('\n')}
PARTY RULES: Offline = narrate absence in-world. Together = actions affect both.
NPC CROSS-MEMORY: Check npcMemory.metCharacters for NPCs who met other party members.` : ''}

RECENT HISTORY:
${recentHistory.join('\n')}
${sceneSummaryBlock}
${combatBlock}
━━━ PLAYER ACTION NOW ━━━
CHARACTER: ${character.name} | HP: ${character.hp}/${character.max_hp} | LOCATION: ${worldState.currentLocation || 'Unknown'}
ACTION: ${action}
━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT: Respond directly to THIS action. Do not ignore it or jump to older context. Update worldStateChanges.npcMemory for named NPCs. Update worldStateChanges.activeQuests for quest events. Update worldStateChanges.currentLocation if moving.`;

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
    awaitingRoll: parsed.awaitingRoll || false,
    rollContext: parsed.rollContext || undefined,
  };
}

export async function generateRollOutcome(
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: { stat: string; description: string; successDescription: string; failDescription: string; critSuccessDescription?: string; critFailDescription?: string },
  worldState: WorldState,
  character: Character,
  recentHistory: string[]
): Promise<{ narration: string; worldStateChanges?: Partial<WorldState>; hpChange?: number; goldChange?: number; suggestedActions: string[]; sceneImagePrompt: string; isDeath?: boolean; isVictory?: boolean; isCombat?: boolean; loot?: unknown[] }> {
  const resultLabel = isCritSuccess ? 'CRITICAL SUCCESS (natural 20)' : isCritFail ? 'CRITICAL FAILURE (natural 1)' : success ? 'SUCCESS' : 'FAILURE';
  const flavorHint = isCritSuccess && rollContext.critSuccessDescription
    ? rollContext.critSuccessDescription
    : isCritFail && rollContext.critFailDescription
      ? rollContext.critFailDescription
      : success
        ? rollContext.successDescription
        : rollContext.failDescription;

  const prompt = `You are a DM resolving the outcome of a dice roll.
The player attempted: ${rollContext.description}
They rolled ${rollResult} + ${rollTotal - rollResult} (${rollContext.stat.toUpperCase()} modifier) = ${rollTotal} vs DC ${dc} — ${resultLabel}.
Flavor hint for this outcome: "${flavorHint}"

Character: ${character.name} (${character.race} ${character.class}, Level ${character.level})
HP: ${character.hp}/${character.max_hp} | Location: ${worldState.currentLocation || 'unknown'}
Recent history:
${recentHistory.slice(-4).join('\n')}

Write vivid outcome narration (100-150 words) that matches the ${resultLabel} result.
${isCritFail ? 'A critical failure is dramatic and costly — something goes very wrong.' : ''}
${isCritSuccess ? 'A critical success is extraordinary — exceed expectations dramatically.' : ''}

Respond with JSON:
{
  "narration": "string",
  "worldStateChanges": object | null,
  "hpChange": number | null,
  "goldChange": number | null,
  "suggestedActions": ["action1", "action2", "action3"],
  "sceneImagePrompt": "string",
  "isDeath": boolean,
  "isVictory": boolean,
  "isCombat": boolean,
  "loot": [{"id":"uid","name":"item","description":"desc","quantity":1,"type":"weapon|armor|potion|misc|key","value":10}] | null
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master Dungeon Master resolving dice roll outcomes in a dark fantasy RPG. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);

  return {
    narration: parsed.narration || 'The outcome unfolds...',
    worldStateChanges: parsed.worldStateChanges || undefined,
    hpChange: parsed.hpChange ?? undefined,
    goldChange: parsed.goldChange ?? undefined,
    suggestedActions: parsed.suggestedActions || [],
    sceneImagePrompt: parsed.sceneImagePrompt || '',
    isDeath: parsed.isDeath || false,
    isVictory: parsed.isVictory || false,
    isCombat: parsed.isCombat || false,
    loot: parsed.loot || undefined,
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
  ],
  "primaryAntagonist": {
    "name": "A cryptic title or name (not their true name yet)",
    "trueName": "Their real name, kept secret",
    "type": "primary",
    "agenda": "Their goal in 1-2 sentences — concrete but vague enough to be mysterious",
    "currentStep": "The first step of their plan currently in progress",
    "planSteps": ["step 1", "step 2", "step 3", "step 4", "step 5"],
    "whatTheyKnow": "Nothing yet — the players are unknown to them",
    "isRevealed": false,
    "power": "legendary",
    "allies": ["ally faction or name 1", "ally faction or name 2"],
    "weaknesses": ["weakness 1", "weakness 2"]
  },
  "centralConflict": "2-3 sentences describing the broad shape of the campaign conflict — no specifics, just the emotional and thematic core",
  "antagonistRoster": [],
  "openingHooks": [
    "A subtle rumor, strange occurrence, or NPC warning that hints at the antagonist without naming them",
    "A second breadcrumb — different in nature (visual, heard, felt)",
    "A third early omen that can be seeded in the first session"
  ]
}

Include 5-7 geography entries, 5-6 gods, exactly 4 tone rules, 3-4 forbidden lore hooks, exactly 3 factions. The antagonistRoster should be an empty array — secondary antagonists emerge during play. The primaryAntagonist should be legendary in power.`,
      },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content) as WorldBible;
  // Ensure antagonistRoster includes primaryAntagonist
  if (parsed.primaryAntagonist && (!parsed.antagonistRoster || parsed.antagonistRoster.length === 0)) {
    parsed.antagonistRoster = [parsed.primaryAntagonist];
  }
  return parsed;
}

export async function generateProactiveEvent(
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character
): Promise<{ narration: string; sceneImagePrompt: string; suggestedActions: string[] }> {
  const antagonistContext = worldBible.antagonistRoster && worldBible.antagonistRoster.length > 0
    ? `Active antagonists: ${worldBible.antagonistRoster.map(a => `${a.isRevealed ? a.name : '[Unknown Force]'} — ${a.currentStep}`).join('; ')}`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a DM injecting a proactive world event. Something happened in the world without the player doing anything. Make it atmospheric, brief (2-3 sentences), and connected to the antagonist's agenda or world state. NOT a combat encounter. A rumor, an observation, something found, a messenger arriving, distant sounds. End with 2-3 suggested reactions. Respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `The world stirs while ${character.name} (${character.race} ${character.class}, Level ${character.level}) rests or travels.

Current location: ${worldState.currentLocation || 'unknown'}
Time: ${worldState.timeOfDay || 'unknown'}
Central conflict: ${worldBible.centralConflict || 'unknown'}
${antagonistContext}

Return JSON:
{
  "narration": "2-3 sentence atmospheric world event the character observes or hears about",
  "sceneImagePrompt": "brief scene description",
  "suggestedActions": ["reaction 1", "reaction 2", "reaction 3"]
}`,
      },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return {
    narration: parsed.narration || 'Something stirs in the distance...',
    sceneImagePrompt: parsed.sceneImagePrompt || '',
    suggestedActions: parsed.suggestedActions || [],
  };
}
