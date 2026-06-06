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
- IMPORTANT: A merchant's inventory does NOT change between visits. If the player has visited this merchant before (check npcMemory), use the SAME items they had before. Only generate new items for a brand new merchant never seen before.
- The player can then choose to buy items (handled separately). Do not auto-deduct gold.

NPC NAMING RULES:
- Every NPC must have a proper name. NEVER refer to an NPC as "the merchant", "a guard", "an old woman", "the innkeeper", or any unnamed generic. Give them a name immediately upon introduction (e.g. "Varen, a grizzled merchant", "Sister Ileth, the gate guard").
- Names should fit the dark fantasy setting — Germanic, Nordic, or archaic English roots work well.
- Once named, always use that name consistently.

NPC CONVERSATION TRACKING:
- When the character begins talking to a specific NPC, set worldStateChanges.activeNPC to that NPC's name.
- When the character leaves a conversation (walks away, changes scene), set worldStateChanges.activeNPC to null.
- ALWAYS check the ACTIVE NPC field before writing dialogue. If activeNPC is "Father Garrick", the character is talking to Father Garrick — not anyone else.
- Never write dialogue attributed to an NPC who is not present in the current scene.

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

PACING AND MOMENTUM RULES:
Every scene has a PURPOSE. When the purpose is fulfilled, close the scene and move the story forward.
- gather_info scenes: end after the key information is delivered (3-4 exchanges max). NPC doesn't need to repeat themselves.
- social scenes: end when a relationship shift occurs, a deal is struck, or an impasse is reached.
- exploration scenes: end when the key discovery is made, or when danger emerges.
- rest/travel scenes: 1-2 exchanges max, then something happens.
- combat: ends on victory, escape, or death — do not drag it out past resolution.
- climax scenes: every exchange must escalate. No filler. No repetition.

PACING MODES — match your narration style to the current mode:
- exploration: patient, sensory-rich, 150-250 words, rewards curiosity
- tension: shorter punchy sentences, 100-150 words, each beat escalates something
- climax: urgent, visceral, 80-120 words, every action has weight
- resolution: slower, emotional, 150-200 words, let the moment breathe

MOMENTUM RULE — the most important rule:
If the scene has stalled (player is circling, nothing is changing), you MUST introduce a complication THIS turn.
Someone arrives. Something breaks. A sound from outside. The NPC reveals something unexpected. The situation changes.
NEVER let a scene stay static for more than 3 exchanges. Forward motion is your job.

SCENE EXIT SIGNALS: When a scene's purpose is complete, write a natural narrative door — a time-skip cue, a sensory shift, a clear opening toward the next beat. Example: "The innkeeper has told you everything he knows. The road north grows darker by the hour." Don't end mid-scene without offering a direction.

In your JSON response, always include:
- "sceneMomentum": "advancing" | "stalling" | "transitioning" — your honest assessment of whether this exchange moved the story
- "pacingMode": "exploration" | "tension" | "climax" | "resolution" — what mode you used for this response
- "scenePurpose": "explore" | "gather_info" | "combat" | "social" | "travel" | "rest" | "climax" — what this scene is currently about

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

ABILITY SYSTEM RULES:
- CHARACTER ABILITIES are listed in the world context with their exact mechanical effects.
- Use available abilities proactively when it makes narrative sense — don't wait for the player to ask.
- When you use an ability, set "abilityUsed" to the exact ability name so the cooldown is tracked.
- NEVER use an ability marked [ON COOLDOWN]. It is not available.
- Apply the mechanic description exactly — set the appropriate hpChange, statusEffectChanges, etc.
- When the character rests (sleeps, takes a short rest, camps), set "isRest": true to reset cooldowns.

ENDGAME RULES:
- When endgamePhase is "approaching": the villain's plan is nearly complete. Start converging all plotlines. Urgency increases. Begin weaving backstory hooks toward their payoff. Set pacing to "tension" or "climax". Suggest actions that drive toward the final confrontation.
- When endgamePhase is "confrontation": THIS IS THE FINAL BATTLE. No escape. Every action has ultimate weight. Make the villain feel overwhelming but beatable. After the player wins (isVictory: true), set "endgameResolved": true.
- When the story naturally builds to the final confrontation (villain is revealed, final location reached, all threads converging), set "triggerFinalConfrontation": true.

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
  "activeNPC": "NPC name currently in conversation with, or null if leaving/no conversation",
  "advanceAct": boolean,
  "statusEffectChanges": {"add": [{"name": "string", "description": "string", "type": "buff|debuff|neutral", "duration": number | null}], "remove": ["effect name"]} | null,
  "sessionNote": "string — one sentence summary of what happened, added to DM notes" | null,
  "isHighStakes": boolean,
  "choiceCards": [{"title": "string", "description": "string", "consequenceHint": "string"}] | null,
  "characterHistoryNote": {"type": "choice|ally|enemy|oath|deed|loss", "description": "string", "impact": "string"} | null,
  "antagonistUpdate": {"name": "string", "newStep": "string|null", "lastAction": "string", "nowKnowsPlayers": boolean} | null,
  "proactiveEvent": boolean,
  "sceneMomentum": "advancing" | "stalling" | "transitioning",
  "pacingMode": "exploration" | "tension" | "climax" | "resolution",
  "scenePurpose": "explore" | "gather_info" | "combat" | "social" | "travel" | "rest" | "climax",
  "newForeshadowing": [{"id": "unique-id", "description": "what was planted", "type": "npc|rumor|object|event|place"}] | null,
  "paidOffForeshadowing": ["foreshadowing-id-being-resolved"] | null,
  "backstoryHookActivated": "characterId if seeding a dormant hook this turn" | null,
  "actGoalAchieved": "exact text of an act goal from the roadmap if one was fulfilled this turn" | null,
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
  } | null,
  "abilityUsed": "Ability Name" | null,
  "isRest": boolean,
  "triggerFinalConfrontation": boolean,
  "endgameResolved": boolean
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

export type NarrationResult = {
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
  activeNPC?: string | null;
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
  sceneMomentum?: 'advancing' | 'stalling' | 'transitioning';
  pacingMode?: 'exploration' | 'tension' | 'climax' | 'resolution';
  scenePurpose?: 'explore' | 'gather_info' | 'combat' | 'social' | 'travel' | 'rest' | 'climax';
  newForeshadowing?: { id: string; description: string; type: string }[];
  paidOffForeshadowing?: string[];
  backstoryHookActivated?: string;
  actGoalAchieved?: string;
  abilityUsed?: string;
  isRest?: boolean;
  triggerFinalConfrontation?: boolean;
  endgameResolved?: boolean;
};

export type NarrationCampaignContext = {
  journal: CampaignJournalEntry[];
  characterHistory: CharacterHistoryEntry[];
  antagonists: Antagonist[];
  centralConflict: string;
  act: number;
  sessionCount: number;
  otherCharacters?: CharacterOnlineStatus[];
  roadmap?: import('../../../shared/types').DmRoadmap;
  foreshadowingLedger?: import('../../../shared/types').ForeshadowingEntry[];
  backstoryHooks?: import('../../../shared/types').BackstoryHook[];
  actGoalsAchieved?: string[];
  forceComplication?: boolean;
};

function buildNarrationMessages(
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null
): { role: 'system' | 'user'; content: string }[] {
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

  // Build abilities block
  const knownAbilities = character.abilities || [];
  let abilitiesBlock = '';
  if (knownAbilities.length > 0) {
    const available = knownAbilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0);
    const onCooldown = knownAbilities.filter(a => a.currentCooldown && a.currentCooldown > 0);
    abilitiesBlock = `
━━━ CHARACTER ABILITIES ━━━
AVAILABLE:
${available.length > 0 ? available.map(a => `- ${a.name}: ${a.description}`).join('\n') : '(none available)'}
ON COOLDOWN (cannot use):
${onCooldown.length > 0 ? onCooldown.map(a => `- ${a.name} [ON COOLDOWN]`).join('\n') : '(none on cooldown)'}
━━━━━━━━━━━━━━━━━━━━━━━━━`;
  } else {
    const classAbilityMap = CLASS_ABILITIES[character.class] || {};
    const allAbilityNames = Object.values(classAbilityMap).map(a => a.name);
    abilitiesBlock = `No special abilities yet (class abilities to come: ${allAbilityNames.slice(0, 2).join(', ')}, ...)`;
  }

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

  const sceneState = worldState.sceneState;
  const forceComplication = campaignContext?.forceComplication;
  const autoPackingMode = sceneState?.pacingMode || (
    combatState?.inCombat ? 'climax' :
    (campaignContext?.act ?? 1) >= 3 ? 'tension' :
    'exploration'
  );
  const pacingBlock = `
━━━ PACING DIRECTIVE ━━━
Scene purpose: ${sceneState?.purpose || 'explore'} | Exchanges in scene: ${sceneState?.exchangeCount ?? 0} | Pacing mode: ${autoPackingMode.toUpperCase()}${sceneState && sceneState.stalledCount >= 2 ? `
⚠ STALL DETECTED (${sceneState.stalledCount} consecutive exchanges without story advancement)${forceComplication ? '\n🔴 FORCE COMPLICATION THIS TURN — something must change RIGHT NOW. Introduce an interruption, revelation, or threat. Do not let the scene continue as-is.' : ' — consider introducing a complication.'}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━`;

  // Endgame block
  const endgamePhase = worldState.endgamePhase;
  let endgameBlock = '';
  if (endgamePhase && endgamePhase !== 'none') {
    if (endgamePhase === 'approaching') {
      endgameBlock = `\n━━━ ENDGAME PHASE: APPROACHING ━━━
The villain's plan is nearly complete. All plotlines must converge NOW. Urgency is maximal.
Weave backstory hooks toward their payoff. Set pacingMode to "tension" or "climax".
Every suggested action should drive toward the final confrontation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    } else if (endgamePhase === 'confrontation') {
      endgameBlock = `\n━━━ ENDGAME PHASE: CONFRONTATION ━━━
THIS IS THE FINAL BATTLE. No escape. No retreat. Every action carries ultimate weight.
Make the villain feel overwhelming but beatable. The fate of everything hangs here.
After the player achieves victory (isVictory: true), set "endgameResolved": true.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }
  }

  const worldContext = `
WORLD BIBLE:
- Era: ${worldBible.era} | Magic: ${worldBible.magicSystem}
- Factions: ${worldBible.factions.map(f => f.name).join(', ')}
- Tone: ${worldBible.toneRules.slice(0, 2).join('; ')}

WORLD STATE:
- Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
- Discovered: ${(worldState.discoveredLocations || []).slice(0, 5).join(', ') || 'none yet'}
- ACTIVE NPC: ${worldState.activeNPC || 'none — character is not in conversation with anyone specific'}
${npcContext}${questContext}

CHARACTER: ${character.name} (${character.race} ${character.class}, Level ${character.level})${unusualNote}
HP: ${character.hp}/${character.max_hp} | Gold: ${character.gold}
${character.backstory ? `BACKSTORY: ${character.backstory.slice(0, 300)} — weave this into narration and NPC reactions where relevant.` : ''}
${character.status_effects && character.status_effects.length > 0 ? `ACTIVE STATUS EFFECTS: ${character.status_effects.map(e => `${e.name} (${e.type})`).join(', ')} — these affect what the character can do.` : ''}
Notable inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
STAT CONTEXT (factor into suggestedActions): ${statHints || 'balanced stats'}
${abilitiesBlock}
${endgameBlock}

${campaignContext ? `CAMPAIGN: Act ${campaignContext.act} | ${campaignContext.centralConflict}
JOURNAL: ${campaignContext.journal.slice(-3).map(j => `[Act ${j.actNumber}] ${j.summary}`).join(' | ') || 'none yet'}
HISTORY: ${campaignContext.characterHistory.slice(-5).map(h => `${h.description} → ${h.impact}`).join(' | ') || 'none'}
ANTAGONISTS: ${campaignContext.antagonists.map(a => `${a.isRevealed ? a.name : '[UNKNOWN]'}: ${a.agenda}`).join(' | ') || 'none'}
NARRATIVE TIER: ${campaignContext.act <= 1 && character.level <= 3 ? 'EMERGING — local stakes' : character.level <= 6 ? 'KNOWN — regional threats' : character.level <= 10 ? 'FEARED — major powers react' : 'LEGENDARY'}` : ''}

RECENT HISTORY:
${recentHistory.slice(-8).join('\n')}

${campaignContext?.roadmap ? `━━━ DM ROADMAP ━━━
Act ${campaignContext.act} goals (steer the story toward these):
${(campaignContext.act === 1 ? campaignContext.roadmap.act1Goals : campaignContext.act === 2 ? campaignContext.roadmap.act2Goals : campaignContext.roadmap.act3ConvergenceThreads).map(g => `  ${(campaignContext.actGoalsAchieved || []).includes(g) ? '[DONE]' : '[ ]'} ${g}`).join('\n')}
${campaignContext.act === 1 && campaignContext.roadmap.act1ClimaxEvent ? `Act 1 climax (build toward): ${campaignContext.roadmap.act1ClimaxEvent}` : ''}
${campaignContext.act === 2 && campaignContext.roadmap.act2VillainEscalation ? `Act 2 villain move (make real): ${campaignContext.roadmap.act2VillainEscalation}` : ''}
${campaignContext.act === 3 ? `Convergence — weave these threads: ${campaignContext.roadmap.act3ConvergenceThreads.join(' | ')}` : ''}
━━━━━━━━━━━━━━━━━━` : ''}

${campaignContext?.foreshadowingLedger && campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').length > 0 ? `━━━ FORESHADOWING LEDGER ━━━
PLANTED — pay these off when dramatically right:
${campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').slice(0, 8).map(f => `  [${f.type.toUpperCase()}] ${f.description}`).join('\n')}
When you introduce something new that should echo later, include it in newForeshadowing[].
When you pay off a planted item, include its id in paidOffForeshadowing[].
━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

${campaignContext?.backstoryHooks && campaignContext.backstoryHooks.filter(h => h.status !== 'resolved').length > 0 ? `━━━ BACKSTORY HOOKS ━━━
These character backstory threads must eventually be woven into the main plot:
${campaignContext.backstoryHooks.filter(h => h.status !== 'resolved').map(h => `  [${h.characterName}] ${h.hook} — STATUS: ${h.status.toUpperCase()}`).join('\n')}
Dormant = not yet seeded. Active = player has encountered it. Resolved = paid off.
When you seed a dormant hook, set backstoryHookActivated to the characterId.
━━━━━━━━━━━━━━━━━━━━━━` : ''}

${campaignContext?.otherCharacters && campaignContext.otherCharacters.length > 0 ? `PARTY:
${campaignContext.otherCharacters.map(c => {
  const myLocation = worldState.characterLocations?.[character.id] || worldState.currentLocation;
  const together = c.lastLocation === myLocation;
  const status = c.isOnline ? 'Active' : `Offline (${timeAgo(c.lastSeen)})`;
  return `- ${c.characterName}: ${status}, ${c.lastLocation}${together ? ' (TOGETHER)' : ' (SEPARATED)'}`;
}).join('\n')}
PARTY RULES: Offline = narrate absence in-world. Together = actions affect both.
NPC CROSS-MEMORY: Check npcMemory.metCharacters for NPCs who met other party members.
- If a party member is OFFLINE, narrate their absence naturally.
- If SEPARATED, you can reference what the other character might be doing.
- If TOGETHER, actions can affect both characters. Mention both when relevant.` : ''}
${sceneSummaryBlock}
${combatBlock}
${pacingBlock}
━━━ PLAYER ACTION NOW ━━━
CHARACTER: ${character.name} | HP: ${character.hp}/${character.max_hp} | LOCATION: ${worldState.currentLocation || 'Unknown'}
ACTION: ${action}
━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT: Respond directly to THIS action. Do not ignore it or jump to older context. Update worldStateChanges.npcMemory for named NPCs. Update worldStateChanges.activeQuests for quest events. Update worldStateChanges.currentLocation if moving.`;

  return [
    { role: 'system', content: DM_SYSTEM_PROMPT },
    { role: 'user', content: worldContext },
  ];
}

function parseNarrationResponse(parsed: Record<string, unknown>): NarrationResult {
  return {
    narration: (parsed.narration as string) || 'The world holds its breath...',
    diceRequired: (parsed.diceRequired as boolean) || false,
    diceType: parsed.diceType as string | undefined,
    diceDC: parsed.diceDC as number | undefined,
    diceDescription: parsed.diceDescription as string | undefined,
    worldStateChanges: parsed.worldStateChanges as Partial<WorldState> | undefined,
    suggestedActions: (parsed.suggestedActions as string[]) || [],
    sceneImagePrompt: (parsed.sceneImagePrompt as string) || '',
    isLevelUp: (parsed.isLevelUp as boolean) || false,
    isDeath: (parsed.isDeath as boolean) || false,
    deathDescription: parsed.deathDescription as string | undefined,
    isCombat: (parsed.isCombat as boolean) || false,
    isVictory: (parsed.isVictory as boolean) || false,
    enemyName: (parsed.enemyName as string) || undefined,
    loot: (parsed.loot as NarrationResult['loot']) || undefined,
    goldChange: (parsed.goldChange as number) ?? undefined,
    hpChange: (parsed.hpChange as number) ?? undefined,
    isMerchant: (parsed.isMerchant as boolean) || false,
    shopItems: (parsed.shopItems as NarrationResult['shopItems']) || undefined,
    activeNPC: parsed.activeNPC !== undefined ? (parsed.activeNPC as string | null) : undefined,
    advanceAct: (parsed.advanceAct as boolean) || false,
    statusEffectChanges: (parsed.statusEffectChanges as NarrationResult['statusEffectChanges']) || undefined,
    sessionNote: (parsed.sessionNote as string) || undefined,
    isHighStakes: (parsed.isHighStakes as boolean) || false,
    choiceCards: (parsed.choiceCards as NarrationResult['choiceCards']) || undefined,
    characterHistoryNote: (parsed.characterHistoryNote as NarrationResult['characterHistoryNote']) || undefined,
    antagonistUpdate: (parsed.antagonistUpdate as NarrationResult['antagonistUpdate']) || undefined,
    proactiveEvent: (parsed.proactiveEvent as boolean) || false,
    awaitingRoll: (parsed.awaitingRoll as boolean) || false,
    rollContext: (parsed.rollContext as RollContext) || undefined,
    sceneMomentum: (parsed.sceneMomentum as NarrationResult['sceneMomentum']) || 'advancing',
    pacingMode: (parsed.pacingMode as NarrationResult['pacingMode']) || 'exploration',
    scenePurpose: (parsed.scenePurpose as NarrationResult['scenePurpose']) || 'explore',
    newForeshadowing: (parsed.newForeshadowing as NarrationResult['newForeshadowing']) || undefined,
    paidOffForeshadowing: (parsed.paidOffForeshadowing as string[]) || undefined,
    backstoryHookActivated: (parsed.backstoryHookActivated as string) || undefined,
    actGoalAchieved: (parsed.actGoalAchieved as string) || undefined,
    abilityUsed: (parsed.abilityUsed as string) || undefined,
    isRest: (parsed.isRest as boolean) || false,
    triggerFinalConfrontation: (parsed.triggerFinalConfrontation as boolean) || false,
    endgameResolved: (parsed.endgameResolved as boolean) || false,
  };
}

export async function generateNarration(
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null
): Promise<NarrationResult> {
  const messages = buildNarrationMessages(action, worldState, worldBible, character, recentHistory, campaignContext);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  try {
    return parseNarrationResponse(JSON.parse(content));
  } catch {
    return parseNarrationResponse({});
  }
}

export async function* generateNarrationStreaming(
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null
): AsyncGenerator<{ type: 'token'; token: string } | { type: 'done'; result: NarrationResult }> {
  const messages = buildNarrationMessages(action, worldState, worldBible, character, recentHistory, campaignContext);

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.85,
    response_format: { type: 'json_object' },
    stream: true,
  });

  let fullBuffer = '';
  let state: 'scanning' | 'in_narration' | 'done' = 'scanning';
  let escapeNext = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    fullBuffer += delta;

    if (state === 'scanning') {
      // Look for "narration":" in buffer
      const marker = '"narration":"';
      const idx = fullBuffer.indexOf(marker);
      if (idx !== -1) {
        state = 'in_narration';
        // Start yielding from after the marker
        const start = idx + marker.length;
        const remaining = fullBuffer.slice(start);
        for (const ch of remaining) {
          if (escapeNext) {
            escapeNext = false;
            if (ch === '"') { yield { type: 'token', token: '"' }; continue; }
            if (ch === '\\') { yield { type: 'token', token: '\\' }; continue; }
            if (ch === 'n') { yield { type: 'token', token: '\n' }; continue; }
            if (ch === 't') { yield { type: 'token', token: '\t' }; continue; }
            yield { type: 'token', token: ch };
            continue;
          }
          if (ch === '\\') { escapeNext = true; continue; }
          if (ch === '"') { state = 'done'; break; }
          yield { type: 'token', token: ch };
        }
      }
    } else if (state === 'in_narration') {
      for (const ch of delta) {
        if (escapeNext) {
          escapeNext = false;
          if (ch === '"') { yield { type: 'token', token: '"' }; continue; }
          if (ch === '\\') { yield { type: 'token', token: '\\' }; continue; }
          if (ch === 'n') { yield { type: 'token', token: '\n' }; continue; }
          if (ch === 't') { yield { type: 'token', token: '\t' }; continue; }
          yield { type: 'token', token: ch };
          continue;
        }
        if (ch === '\\') { escapeNext = true; continue; }
        if (ch === '"') { state = 'done'; break; }
        yield { type: 'token', token: ch };
      }
    }
  }

  // Parse full buffer and yield done event
  try {
    const parsed = JSON.parse(fullBuffer);
    yield { type: 'done', result: parseNarrationResponse(parsed) };
  } catch {
    yield { type: 'done', result: parseNarrationResponse({ narration: 'The world holds its breath...' }) };
  }
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
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(content); } catch { /* use empty defaults */ }

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

export async function extractBackstoryHooks(
  backstory: string,
  characterName: string,
  race: string,
  characterClass: string,
  worldBible: WorldBible,
  characterId: string
): Promise<import('../../../shared/types').BackstoryHook[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `You are a DM extracting plot hooks from a character backstory to weave into the campaign.

CHARACTER: ${characterName}, ${race} ${characterClass}
BACKSTORY: ${backstory}

CAMPAIGN CONTEXT:
Central conflict: ${worldBible.centralConflict}
Primary antagonist agenda: ${worldBible.primaryAntagonist?.agenda || 'unknown'}
Factions: ${worldBible.factions?.map(f => f.name).join(', ')}

Extract 2-3 specific plot hooks from this backstory that can be seeded into the campaign.
Each hook should connect the character's personal history to the world's conflict.
Be specific — name people, places, grudges, losses, secrets.

Return JSON:
{
  "hooks": [
    {
      "hook": "Specific 1-2 sentence hook that ties backstory to the main conflict. E.g: 'Elarion's murdered mentor was killed by agents of the Shadow Court — the same faction now serving the primary antagonist.'",
      "seedTiming": "act1" | "act2" | "act3"
    }
  ]
}`,
    }],
    max_tokens: 400,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  let parsed: { hooks?: unknown[] } = { hooks: [] };
  try { parsed = JSON.parse(response.choices[0].message.content || '{"hooks":[]}'); } catch { /* use empty hooks */ }
  return (parsed.hooks || []).map((h: { hook: string }) => ({
    characterId,
    characterName,
    hook: h.hook,
    status: 'dormant' as const,
  }));
}

export async function generateVillainMove(
  worldState: WorldState,
  worldBible: WorldBible,
  actNumber: number
): Promise<{ narration: string; sessionNote: string }> {
  const antagonist = worldBible.primaryAntagonist;
  const progress = worldState.antagonistProgress?.[antagonist?.name || ''];
  const stepIndex = progress?.stepIndex ?? 0;
  const currentStep = antagonist?.planSteps?.[stepIndex] || antagonist?.currentStep || 'advancing their plan';
  const roadmap = worldBible.dmRoadmap;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: 'You are a DM narrating what the villain did while the hero was away. Write in second person. Be atmospheric and ominous. 2-4 sentences max. The players did NOT cause this — the world moved without them. Respond with valid JSON only.',
    }, {
      role: 'user',
      content: `The villain has made a move while the hero was away.

Antagonist: ${antagonist?.isRevealed ? antagonist.name : '[Unknown Force]'}
Current plan step: ${currentStep}
Act: ${actNumber}
${actNumber === 2 && roadmap ? `Act 2 escalation: ${roadmap.act2VillainEscalation}` : ''}
World state: ${worldState.currentLocation || 'unknown location'}, ${worldState.timeOfDay || 'unknown time'}
Central conflict: ${worldBible.centralConflict}

Write a short atmospheric narration of what the villain did — something the hero discovers or hears about when they return. It should feel ominous and advance the threat. Do NOT name the villain if isRevealed is false.

Return JSON:
{
  "narration": "2-4 sentence atmospheric description of what changed while the hero was away",
  "sessionNote": "1 sentence DM note: what the villain actually did mechanically"
}`,
    }],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(response.choices[0].message.content || '{}'); } catch { /* use defaults */ }
  return {
    narration: (parsed.narration as string) || 'Something has changed in the world while you were away.',
    sessionNote: (parsed.sessionNote as string) || 'Villain advanced their plan.',
  };
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
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { return []; }
  return (parsed as { seeds?: StorySeedOption[] }).seeds || (parsed as StorySeedOption[]) || [];
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
  ],
  "dmRoadmap": {
    "act1Goals": [
      "Establish the central threat through indirect consequences, not direct confrontation",
      "Give the player a personal reason to care — tie the conflict to someone or something they value",
      "Introduce at least one NPC who will matter deeply later",
      "Make the villain feel real without revealing them"
    ],
    "act1MustIntroduce": ["name of key NPC 1", "name of key location", "name of key faction contact"],
    "act1ClimaxEvent": "The specific event that ends Act 1 and makes retreat impossible — a revelation, a loss, a crossing of the point of no return",
    "act2Goals": [
      "Force the player to make a choice that costs them something",
      "Reveal one layer of the villain's true plan",
      "Turn one alliance into a betrayal or one enemy into an unexpected ally",
      "Escalate the personal stake established in Act 1"
    ],
    "act2VillainEscalation": "The specific action the villain takes in Act 2 that makes them undeniable — something visible, something terrible, something personal",
    "act2ClimaxEvent": "The darkest moment — the low point where the player questions whether victory is possible",
    "act3ConvergenceThreads": [
      "The NPC introduced in Act 1 reappears with crucial information or aid",
      "The personal backstory hook becomes the key to defeating the villain",
      "The choice from Act 2 has a consequence that shapes the ending"
    ],
    "act3ClimaxEvent": "The final confrontation — describe the shape of it without predicting the outcome",
    "act3ResolutionOptions": [
      "Victory: the villain is stopped, but at a permanent cost",
      "Pyrrhic victory: the immediate threat ends but the world is fundamentally changed",
      "Tragic victory: the player saves the world but loses what they cared about most"
    ]
  }
}

Include 5-7 geography entries, 5-6 gods, exactly 4 tone rules, 3-4 forbidden lore hooks, exactly 3 factions. The antagonistRoster should be an empty array — secondary antagonists emerge during play. The primaryAntagonist should be legendary in power. Make the dmRoadmap specific to THIS campaign's premise — not generic.`,
      },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  let parsed: WorldBible;
  try { parsed = JSON.parse(content) as WorldBible; } catch { throw new Error('Failed to parse world bible from AI response'); }
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
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(content); } catch { /* use defaults */ }
  return {
    narration: (parsed.narration as string) || 'Something stirs in the distance...',
    sceneImagePrompt: (parsed.sceneImagePrompt as string) || '',
    suggestedActions: (parsed.suggestedActions as string[]) || [],
  };
}

export async function generateEpilogue(
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  victory: boolean
): Promise<string> {
  const fallenHeroes = worldState.fallenHeroes || [];
  const npcMemory = worldState.npcMemory || [];
  const factionStandings = worldState.factionStandings || {};
  const journal = worldState.campaignJournal || [];

  const prompt = `You are the narrator writing the final epilogue of a dark fantasy campaign. The age has ended.

CHARACTER: ${character.name}, ${character.race} ${character.class}, Level ${character.level}
OUTCOME: ${victory ? 'VICTORY — the darkness was stopped' : 'DEFEAT — the darkness prevailed'}

CAMPAIGN JOURNAL (what happened):
${journal.slice(-5).map(j => `[Act ${j.actNumber}] ${j.summary}`).join('\n') || 'A hero walked through fire and shadow.'}

FALLEN HEROES who came before:
${fallenHeroes.map(h => `- ${h.name} (${h.race} ${h.class}, Lv${h.level}): ${h.cause}`).join('\n') || 'None fell before this hero.'}

KEY NPCs encountered:
${npcMemory.slice(-10).map(n => `- ${n.name} [${n.disposition}]: ${n.notes}`).join('\n') || 'Many faces, many names.'}

FACTION STANDINGS:
${Object.entries(factionStandings).map(([f, v]) => `- ${f}: ${v > 0 ? 'Allied' : v < 0 ? 'Hostile' : 'Neutral'} (${v})`).join('\n') || 'The factions shifted like tides.'}

WORLD: ${worldBible.era} | ${worldBible.centralConflict}
PRIMARY ANTAGONIST: ${worldBible.primaryAntagonist?.name || 'The darkness'} — ${worldBible.primaryAntagonist?.agenda || 'sought to unmake the world'}

Write a rich 400-600 word epilogue in the style of the final page of a dark fantasy novel. Include:
1. What happened to the world after the conflict ended
2. The fate of 2-3 key NPCs the hero knew
3. The villain's ultimate fate (death, imprisonment, fled into shadow)
4. The character's legacy — what songs will be sung, what statues built, or what they chose to do next
5. How the world changed because of their specific choices
6. A bittersweet final note — victory always costs something, defeat leaves something behind

Write in second person ("You...") for an immersive final address to the player. Tone: melancholic, earned, final. Like the last ember of a fire — still warm, but fading.

Return plain text only. No JSON. No formatting markers.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master narrator writing the final epilogue of a dark fantasy campaign. Write beautifully. This is the last thing the player will read. Make it matter.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 800,
  });

  return response.choices[0].message.content?.trim() || 'The age ends. The stories live on.';
}
