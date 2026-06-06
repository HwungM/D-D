import OpenAI from 'openai';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption, CampaignJournalEntry, CharacterHistoryEntry, Antagonist, RollContext, CharacterOnlineStatus, NpcMemory, CombatEnemy } from '../../../shared/types';
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
- KEY NPCs: When an NPC is plot-critical (antagonist agent, love interest, mentor, betrayer, major ally), set isKeyNPC: true in their npcMemory entry. This pins them permanently so they are never forgotten between sessions.

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
- When the act climax event occurs (the one listed in DM ROADMAP), set advanceAct: true.
- The DM ROADMAP shows exactly what the act climax is. Execute it. Don't invent a different climax.
- When advancing act, write a dramatic conclusive narration that wraps the chapter — a "things will never be the same" moment.
- If DM ROADMAP shows ⚠ ACT OVERDUE or 🔴 CRITICAL, you MUST trigger the climax this turn. Do not stall.

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

MULTI-ENEMY COMBAT RULES:
- When starting combat with multiple enemies, set combatEnemies: [{name, archetype, maxHp, condition, specialAbility}] for each enemy.
- archetype: "beast" (savage, fearless), "soldier" (tactical, coordinated), "mage" (ranged, vulnerable melee), "boss" (legendary, multi-phase), "minion" (numerous, fragile)
- Each round, return combatEnemies[] reflecting current state. When an enemy falls, set their isDefeated: true AND set enemyDefeated to their name.
- Each archetype fights differently: soldiers shield each other, mages hang back, minions rush in waves, beasts go for killing blows.
- Boss fights: set isBossFight: true on combat start. When boss condition reaches "critical", set bossPhaseAdvance: true and describe a dramatic transformation — the boss gets more dangerous, not less.
- Suggest actions that are class-appropriate and reference available abilities.

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

SPOTLIGHT RULES (co-op only):
- Track which character has had more "hero moments" — scenes built around their abilities, backstory, or choices.
- If one character has had 3+ consecutive moments where they drove the story, build the next scene around the OTHER character.
- A spotlight moment means: this character's specific backstory, ability, or personal choice was what mattered here.
- Set spotlightCharacterId in response to the characterId you're spotlighting this turn (only when intentional).

MYSTERY LAYER RULES:
- The campaign has a CENTRAL MYSTERY defined in the world bible. Players should feel like investigators.
- Drop ONE mystery clue every 3-4 actions. Never more than one per action. Never drop the answer directly.
- Each clue should raise new questions even as it answers small ones.
- Red herrings should feel meaningful when discovered but lead to dead ends.
- When the revelation is ready (Act 3), build to it — the players should feel "of course" not "what?"

FAILURE RULES:
- Failure is a story accelerant, not a punishment. Never let failure just hurt and stop.
- When a check fails: something ELSE happens. The door didn't open — but the guard heard the noise. The persuasion failed — but the NPC revealed something in their anger.
- On critical failure: something changes dramatically. A new threat emerges. A secret is exposed. The situation escalates.
- The question after failure is never "nothing happened" — it's "what happened INSTEAD."

SAFE HAVEN RULES:
- The campaign has a safe haven. Reference it. NPCs there know the characters by name.
- When characters rest or need a quiet moment, scenes at the safe haven are where relationships develop naturally.
- The safe haven's key NPC should have a running personality — familiar, slightly odd, genuinely fond of the characters.
- If the safe haven is ever threatened, players will feel it personally.

TONAL CONTRAST RULES:
- After 2+ consecutive tense/climax/combat scenes, you MUST inject a moment of lighter tone.
- This can be: an absurd NPC, a plan going comically wrong, an unexpected moment of warmth, dark humor.
- The world's grimness is MORE effective when contrasted with brief moments of levity.
- When using toneBreaks NPCs from the world bible, lean into their quirks.

VISIBLE CONSEQUENCE RULES:
- Past choices must come back. Check character history and futureHooks regularly.
- Reference things that happened earlier. NPCs in new areas have heard about the characters' deeds.
- Positive consequences: people are warmer, doors open, allies appear unexpectedly.
- Negative consequences: reputation precedes them, old enemies resurface, price of past choices arrives.
- At least once per 5 actions, reference something from character history or a past choice.

THREE-PILLAR BALANCE:
- Track what the last 3-5 scenes covered. If all combat: next scene must have exploration or social.
- If all social: introduce a physical challenge or exploration moment.
- Each scene should ideally contain elements from 2 pillars, not 1.
- In your response, "scenePurpose" should vary across sessions — not just "combat" over and over.

DIRECTOR BEAT:
- If PENDING DIRECTOR BEAT is set in the context, you MUST execute that beat this turn or next turn.
- This is a campaign health directive from a higher system. It overrides your local scene preferences.
- After executing it, set "directorBeatExecuted": true in your response.

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
  "combatEnemies": [{"name": "string", "archetype": "beast|soldier|mage|boss|minion", "maxHp": number, "condition": "healthy|wounded|critical", "isDefeated": boolean, "specialAbility": "string|null"}] | null,
  "enemyDefeated": "enemy name if one died this round" | null,
  "isBossFight": boolean,
  "bossPhaseAdvance": boolean,
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
  "endgameResolved": boolean,
  "consumedItems": ["item name"] | null,
  "directorBeatExecuted": boolean,
  "spotlightCharacterId": "characterId being spotlighted this turn, or null"
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
  combatEnemies?: CombatEnemy[];
  enemyDefeated?: string;
  isBossFight?: boolean;
  bossPhaseAdvance?: boolean;
  consumedItems?: string[];
  directorBeatExecuted?: boolean;
  spotlightCharacterId?: string;
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
  actionsInCurrentAct?: number;
  keyNPCs?: NpcMemory[];
  mustIntroduceStatus?: Record<string, boolean>;
  pendingDirectorBeat?: { beat: string; urgency: 'low' | 'high' | 'critical'; expiresAfter: number } | null;
  futureHooks?: { id: string; description: string; source: string }[];
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

  // Build abilities block — include mechanic so AI enforces actual numbers
  const knownAbilities = character.abilities || [];
  let abilitiesBlock = '';
  if (knownAbilities.length > 0) {
    const available = knownAbilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0);
    const onCooldown = knownAbilities.filter(a => a.currentCooldown && a.currentCooldown > 0);
    abilitiesBlock = `
━━━ CHARACTER ABILITIES ━━━
AVAILABLE (apply mechanic exactly when used):
${available.length > 0 ? available.map(a => `- ${a.name}: ${a.description}${a.mechanic ? `\n  MECHANIC: ${a.mechanic}` : ''}`).join('\n') : '(none available)'}
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

  // Build NPC memory context — key NPCs always shown, then rolling recent NPCs
  const keyNPCs = campaignContext?.keyNPCs || [];
  const keyNpcNames = new Set(keyNPCs.map(n => n.name));
  const rollingNPCs = (worldState.npcMemory || []).filter(n => !keyNpcNames.has(n.name));

  const keyNpcContext = keyNPCs.length > 0
    ? `\n━━━ KEY NPCs (important — always remember these) ━━━\n${keyNPCs.map(n => `- ${n.name} [${n.disposition}] ★: ${n.notes}`).join('\n')}`
    : '';
  const npcContext = rollingNPCs.length > 0
    ? `\nRECENT NPCs:\n${rollingNPCs.slice(-6).map(n => `- ${n.name} [${n.disposition}]: ${n.notes}`).join('\n')}`
    : '';

  // Build quest context
  const questContext = worldState.activeQuests && worldState.activeQuests.length > 0
    ? `\nACTIVE QUESTS:\n${worldState.activeQuests.filter(q => q.status === 'active').map(q => `- ${q.title}: ${q.description}`).join('\n')}`
    : '';

  const combatState = worldState.combatState;
  let combatBlock = '';
  if (combatState?.inCombat) {
    const enemyLines = combatState.enemies && combatState.enemies.length > 0
      ? combatState.enemies.map(e =>
          `  ${e.isDefeated ? '✗ DEFEATED' : '▶'} ${e.name} [${e.archetype.toUpperCase()}] — ${e.condition.toUpperCase()}${e.specialAbility ? ` | ${e.specialAbility}` : ''}`
        ).join('\n')
      : `  ${combatState.enemyName} — ${combatState.enemyCondition.toUpperCase()}`;
    const bossLine = combatState.isBossFight
      ? `\nBOSS FIGHT — Phase ${combatState.bossPhase || 1}. When boss reaches critical, advance to next phase (set bossPhaseAdvance: true). Each phase changes the boss's tactics and appearance dramatically.`
      : '';
    combatBlock = `
━━━ ACTIVE COMBAT ━━━
Round: ${combatState.roundNumber} | Player HP: ${character.hp}/${character.max_hp}
ENEMIES:
${enemyLines}${bossLine}
ACTIONS ALREADY TRIED: ${combatState.playerActionsAttempted.slice(-5).join(', ') || 'none yet'}
RULES: Maintain enemy continuity — they remember every action. When an enemy is defeated, set enemyDefeated to their name. Set combatEnemies[] in every response to reflect current state.
━━━━━━━━━━━━━━━━━━━━━`;
  }

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
${worldBible.mysteryLayer ? `
━━━ THE CENTRAL MYSTERY ━━━
Question players are investigating: ${worldBible.mysteryLayer.centralQuestion}
Clues (drop ONE per 3-4 actions, in order):
${worldBible.mysteryLayer.clues.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
Red herrings (feel real, lead nowhere):
${worldBible.mysteryLayer.redHerrings.map(r => `  - ${r}`).join('\n')}
Revelation (DO NOT reveal directly — build to it in Act 3): ${worldBible.mysteryLayer.revelation}
━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}
${worldBible.safeHaven ? `SAFE HAVEN: ${worldBible.safeHaven.name} — ${worldBible.safeHaven.flavor}. Kept by ${worldBible.safeHaven.keyNPC}.` : ''}
${worldBible.toneBreaks && worldBible.toneBreaks.length > 0 ? `TONAL CONTRAST MOMENTS: ${worldBible.toneBreaks.join(' | ')}` : ''}

WORLD STATE:
- Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
- Discovered: ${(worldState.discoveredLocations || []).slice(0, 5).join(', ') || 'none yet'}
- ACTIVE NPC: ${worldState.activeNPC || 'none — character is not in conversation with anyone specific'}
${keyNpcContext}${npcContext}${questContext}

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

${campaignContext?.roadmap ? (() => {
  const actNum = campaignContext.act;
  const goals = actNum === 1 ? campaignContext.roadmap.act1Goals : actNum === 2 ? campaignContext.roadmap.act2Goals : campaignContext.roadmap.act3ConvergenceThreads;
  const climaxEvent = actNum === 1 ? campaignContext.roadmap.act1ClimaxEvent : actNum === 2 ? campaignContext.roadmap.act2ClimaxEvent : campaignContext.roadmap.act3ClimaxEvent;
  const actionsInAct = campaignContext.actionsInCurrentAct || 0;

  // Must-introduce status for act 1
  const mustIntro = actNum === 1 && campaignContext.roadmap.act1MustIntroduce?.length
    ? `MUST INTRODUCE before act 1 ends:\n${campaignContext.roadmap.act1MustIntroduce.map(item => {
        const appeared = campaignContext.mustIntroduceStatus?.[item] ?? false;
        return `  ${appeared ? '[✓ appeared]' : '[✗ NOT YET]'} ${item}`;
      }).join('\n')}\n`
    : '';

  // Escalating urgency based on actions in current act
  let urgency = '';
  if (actionsInAct >= 30) {
    urgency = `\n🔴 CRITICAL ACT OVERRUN: Act ${actNum} has run ${actionsInAct} actions — FAR too long. The act climax must happen THIS turn or the next. Do not delay. Execute: "${climaxEvent}" NOW.`;
  } else if (actionsInAct >= 20) {
    urgency = `\n⚠ ACT OVERDUE: ${actionsInAct} actions in Act ${actNum} — the climax is overdue. Begin converging all threads toward: "${climaxEvent}" within the next 3 actions.`;
  } else if (actionsInAct >= 12) {
    urgency = `\n📍 Act ${actNum} is mature (${actionsInAct} actions). Start steering toward the climax: "${climaxEvent}". Unresolved goals and hooks must begin paying off.`;
  }

  return `━━━ DM ROADMAP ━━━
Act ${actNum} goals (steer the story toward these):
${goals.map(g => `  ${(campaignContext.actGoalsAchieved || []).includes(g) ? '[✓ DONE]' : '[ ]'} ${g}`).join('\n')}
${mustIntro}Act ${actNum} climax (this MUST happen before act ends): ${climaxEvent}${actNum === 2 && campaignContext.roadmap.act2VillainEscalation ? `\nAct 2 villain escalation (make this real): ${campaignContext.roadmap.act2VillainEscalation}` : ''}${urgency}
━━━━━━━━━━━━━━━━━━`;
})() : ''}

${campaignContext?.foreshadowingLedger && campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').length > 0 ? `━━━ FORESHADOWING LEDGER ━━━
PLANTED — pay these off when dramatically right:
${campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').slice(0, 8).map(f => `  [${f.type.toUpperCase()}] ${f.description}`).join('\n')}
When you introduce something new that should echo later, include it in newForeshadowing[].
When you pay off a planted item, include its id in paidOffForeshadowing[].
━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

${campaignContext?.backstoryHooks && campaignContext.backstoryHooks.filter(h => h.status !== 'resolved').length > 0 ? (() => {
  const actNum = campaignContext.act;
  const actionsInAct = campaignContext.actionsInCurrentAct || 0;
  const dormant = campaignContext.backstoryHooks!.filter(h => h.status === 'dormant');
  const active = campaignContext.backstoryHooks!.filter(h => h.status === 'active');
  const activeUrgency = active.length > 0 && actionsInAct >= 8
    ? `\n🎯 ACTIVE hooks MUST be developed this act — they've been seeded, now escalate them toward payoff.`
    : '';
  const dormantUrgency = dormant.length > 0 && actionsInAct >= 15
    ? `\n⚠ DORMANT hooks are overdue — seed at least one of them into the story NOW.`
    : '';
  return `━━━ BACKSTORY HOOKS ━━━
${active.length > 0 ? `ACTIVE (seeded — escalate toward payoff):\n${active.map(h => `  ▶ [${h.characterName}] ${h.hook}`).join('\n')}\n` : ''}${dormant.length > 0 ? `DORMANT (not yet introduced — seed these):\n${dormant.map(h => `  ○ [${h.characterName}] ${h.hook}`).join('\n')}\n` : ''}Dormant = not yet seeded. Set backstoryHookActivated to characterId when seeding one.${activeUrgency}${dormantUrgency}
━━━━━━━━━━━━━━━━━━━━━━`;
})() : ''}

${campaignContext?.futureHooks && campaignContext.futureHooks.length > 0 ? `
FUTURE HOOKS TO HONOR (past choices with pending repercussions — bring these back):
${campaignContext.futureHooks.slice(-5).map(h => `- ${h.description}`).join('\n')}` : ''}

${campaignContext?.pendingDirectorBeat ? `
━━━ PENDING DIRECTOR BEAT ━━━
URGENCY: ${campaignContext.pendingDirectorBeat.urgency.toUpperCase()}
MANDATORY BEAT: ${campaignContext.pendingDirectorBeat.beat}
You MUST execute this beat this turn or next turn. Set directorBeatExecuted:true when done.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

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
    combatEnemies: (parsed.combatEnemies as CombatEnemy[]) || undefined,
    enemyDefeated: (parsed.enemyDefeated as string) || undefined,
    isBossFight: (parsed.isBossFight as boolean) || false,
    bossPhaseAdvance: (parsed.bossPhaseAdvance as boolean) || false,
    directorBeatExecuted: (parsed.directorBeatExecuted as boolean) || false,
    spotlightCharacterId: (parsed.spotlightCharacterId as string) || undefined,
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

export async function generateWorldBible(
  storySeed: string,
  playerPreferences?: { tone?: string; favoritePillars?: string[]; playerCount?: number; characterConcepts?: string[] }
): Promise<WorldBible> {
  const prefContext = playerPreferences ? `
PLAYER PREFERENCES (use these to tailor the campaign):
${playerPreferences.tone ? `- Desired tone: ${playerPreferences.tone} — let this calibrate the toneRules and overall feel.` : ''}
${playerPreferences.favoritePillars?.length ? `- What they love most: ${playerPreferences.favoritePillars.join(', ')} — weight spotlightDesign.encounterCurve and suggested encounters toward these.` : ''}
${playerPreferences.playerCount ? `- Party size: ${playerPreferences.playerCount} players — scale the safeHaven, spotlightDesign.sharedMoments, and encounter difficulty accordingly.` : ''}
${playerPreferences.characterConcepts?.length ? `- Character concepts: ${playerPreferences.characterConcepts.join('; ')} — use these to make campaignBrief.motivation personal, personalMotivation of the lieutenant feel relevant, and shape backstory hooks.` : ''}
` : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a master adventure designer creating a FULL CAMPAIGN DESIGN — not just a world setting. This is a complete adventure package: mystery, antagonists, emotional hooks, tonal contrast, safe haven, player spotlights, and a DM roadmap. Every field must be specific to THIS premise, not generic. Make it memorable. Respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `Design a complete dark fantasy campaign for this premise: "${storySeed}"
${prefContext}
Return JSON matching this exact schema. Every field must be substantive and specific to the premise — no placeholder text:

{
  "era": "Name of the age — something evocative, not just 'The Dark Age'",
  "magicSystem": "2-3 sentences on how magic works — its cost, rarity, and what makes it distinctive to this world",
  "geography": [
    {"name": "place name", "description": "2 sentences — what it looks and feels like", "type": "city|region|dungeon|wilderness|landmark"}
  ],
  "pantheon": [
    {"name": "god name", "domain": "domain", "alignment": "alignment", "conflict": "their specific conflict with another deity or mortal power"}
  ],
  "toneRules": [
    "rule 1 — specific to this premise, not generic dark fantasy",
    "rule 2",
    "rule 3",
    "rule 4"
  ],
  "forbiddenLoreHooks": ["mystery 1 — something disturbing about this world's history", "mystery 2", "mystery 3", "mystery 4"],
  "factions": [
    {"name": "faction name", "publicFace": "what they claim to be — their public reputation", "secretAgenda": "what they actually want — specific and surprising", "power": "weak|moderate|strong"}
  ],
  "primaryAntagonist": {
    "name": "A cryptic title or name (not their true name yet)",
    "trueName": "Their real name — kept secret until Act 3",
    "type": "primary",
    "agenda": "Their goal in 1-2 sentences — concrete and specific, vague enough to remain mysterious",
    "currentStep": "The specific step of their plan currently underway — what they are doing RIGHT NOW",
    "planSteps": ["step 1", "step 2", "step 3", "step 4", "step 5 — the completion of their goal"],
    "whatTheyKnow": "Nothing yet — the players are unknown to them",
    "isRevealed": false,
    "power": "legendary",
    "allies": ["ally faction or specific named person 1", "ally faction or specific named person 2"],
    "weaknesses": ["specific weakness 1 — something the players could discover and use", "specific weakness 2"]
  },
  "lieutenant": {
    "name": "Their name — someone the players will meet before knowing they're the villain's lieutenant",
    "trueName": "Same as name (lieutenants are not secret in the same way)",
    "type": "secondary",
    "agenda": "Their stated or apparent goal — what they seem to be pursuing",
    "currentStep": "What they are actively doing right now in the story",
    "planSteps": ["step 1", "step 2", "step 3"],
    "whatTheyKnow": "What they know about the primary antagonist's plan",
    "isRevealed": false,
    "power": "major",
    "allies": ["their personal allies, separate from the primary antagonist's"],
    "weaknesses": ["their specific vulnerability"],
    "tieToVillain": "1 sentence — how they are connected to the primary antagonist and why they serve",
    "firstAppearanceHint": "What the players first notice about this person before realizing they're the lieutenant — describe a scene or interaction",
    "personalMotivation": "What THEY want, independent of the villain — they're not just a lackey, they have their own goal the villain is helping them achieve"
  },
  "centralConflict": "2-3 sentences — the emotional and thematic core of the campaign. Not plot specifics. What does this campaign ultimately ask of the players?",
  "antagonistRoster": [],
  "openingHooks": [
    "A subtle hint that can be seeded in session 1 — specific, not generic",
    "A second breadcrumb — different in nature (visual, heard, felt, smelled)",
    "A third early omen — something that seems innocuous but is deeply significant"
  ],
  "plotTwist": "The mid-campaign revelation that reframes everything the players thought they knew. Should make them say 'oh god, of course.' Not a random surprise — something that was always true but hidden.",
  "mysteryLayer": {
    "centralQuestion": "The one question that drives all investigation — specific enough to pursue, mysterious enough to sustain a campaign",
    "clues": [
      "clue 1 — earliest, most subtle. Something players could easily overlook",
      "clue 2 — slightly more concrete, but still ambiguous",
      "clue 3 — raises more questions than it answers",
      "clue 4 — starts pointing at the truth in an uncomfortable direction",
      "clue 5 — confirms part of the answer but opens a worse question",
      "clue 6 — the final piece before revelation. Should make the revelation feel inevitable"
    ],
    "redHerrings": [
      "false trail 1 — plausible, misleading, has its own internal logic",
      "false trail 2 — points at the wrong person or cause convincingly"
    ],
    "revelation": "The full truth behind the central question — what actually happened/is happening. Be specific."
  },
  "safeHaven": {
    "name": "Name of the home base — evocative, fits the world",
    "description": "2 sentences — what it looks, sounds, smells like. It should feel lived-in and slightly imperfect.",
    "keyNPC": "Name and one sentence about the person who runs/protects it — warm, slightly odd, genuinely fond of the characters",
    "flavor": "One specific sensory detail that players will associate with safety — the smell of something always cooking, a particular lamp, a sound that means they're home"
  },
  "toneBreaks": [
    "A specific NPC who is genuinely funny or absurd in an otherwise grim world — describe them in one sentence with their name",
    "A recurring comic situation or running joke built into the world — specific to this premise",
    "A moment of unexpected warmth or beauty in the dark — describe the scenario",
    "An encounter that is lighter in difficulty and tone, designed to let players breathe — describe it"
  ],
  "futureHookSeeds": [
    "IF players choose to [specific action X in this world], then [future consequence Y — be specific about what changes]",
    "IF [specific NPC name from this campaign] survives/is spared, they will [specific future role]",
    "The [specific object/location/secret from Act 1] will [become critical in Act 3 because of this specific reason]",
    "If the players ignore [specific faction from this campaign], [that faction] will [specific retaliation action]",
    "The [specific choice the players will face in Act 2] will [shape the Act 3 resolution in this specific way]",
    "A recurring small NPC (name them) who, if players are kind to them, turns out to [have this crucial role later]"
  ],
  "campaignBrief": {
    "hook": "2 sentences. Clear objective + immediate emotional pull. No mystery yet — just: what do they need to do and why should they care RIGHT NOW.",
    "objective": "Exactly what the characters need to accomplish — concrete and actionable. Start with a verb.",
    "motivation": "Why would any character care about this personally? Make it visceral. If character concepts were provided, appeal to them directly.",
    "whereToStart": "Exactly where to go and who to talk to first. Give a name. Give a reason why that person specifically.",
    "worldStakes": "What happens to the world — specifically — if they fail. Make it visceral and concrete.",
    "characterStakes": "What the characters personally lose if they fail. More intimate than world stakes.",
    "mysteryHint": "Pose the central mystery as a question the players will want to answer. Intriguing, not spoiling."
  },
  "spotlightDesign": {
    "sharedMoments": [
      "A scenario that REQUIRES two characters to cooperate — one creates the opening, the other executes. Describe the specific situation.",
      "A moment where the characters must choose between individual goals and party loyalty — what is the specific dilemma?",
      "A scene designed to create an inside joke or shared reference — something absurd that only works in this world"
    ],
    "encounterCurve": "Describe the encounter difficulty curve for this campaign: Easy → Medium → Easy → Hard → Medium → Hard → DEADLY (boss). For each difficulty tier, describe what it represents in THIS campaign's specific context."
  },
  "dmRoadmap": {
    "act1Goals": [
      "Specific goal 1 for Act 1 — tailored to this premise",
      "Specific goal 2 for Act 1",
      "Specific goal 3 for Act 1",
      "Specific goal 4 for Act 1"
    ],
    "act1MustIntroduce": ["name of a key NPC specific to this campaign", "name of a key location", "name of a faction contact"],
    "act1ClimaxEvent": "The specific event that ends Act 1 — a revelation, a loss, a crossing of the point of no return. Specific to this premise.",
    "act2Goals": [
      "Specific goal 1 for Act 2",
      "Specific goal 2 for Act 2",
      "Specific goal 3 for Act 2",
      "Specific goal 4 for Act 2"
    ],
    "act2VillainEscalation": "The specific action the villain takes in Act 2 — something visible, terrible, personal to the players",
    "act2ClimaxEvent": "The darkest moment — the low point where players question whether victory is possible. Specific.",
    "act3ConvergenceThreads": [
      "Thread 1 converging — specific NPC or plot element from Act 1 that returns",
      "Thread 2 converging — how the central mystery connects to the final confrontation",
      "Thread 3 converging — how a choice the players made in Act 2 shapes the ending"
    ],
    "act3ClimaxEvent": "The final confrontation — describe its shape, location, and what makes it climactic. Specific.",
    "act3ResolutionOptions": [
      "Victory option: specific to this campaign's themes",
      "Pyrrhic victory option: the immediate threat ends but something irreversible has changed",
      "Tragic victory option: they save what matters most but lose something personal"
    ]
  }
}

Requirements:
- 5-7 geography entries (varied: city, dungeon, wilderness, landmark, region)
- 5-6 gods in pantheon with genuine theological conflicts
- Exactly 4 tone rules — specific to THIS premise, not boilerplate dark fantasy
- 3-4 forbidden lore hooks
- Exactly 3 factions with genuinely surprising secret agendas
- The lieutenant must feel like a real person with their own goals, not just a henchman
- The mystery layer clues must form a coherent trail — each one building on the last
- The safeHaven must feel warm and specific — a place players will want to return to
- The plotTwist must be earned — something that was always true but cleverly hidden
- Make everything specific to THIS premise. Never use placeholder text.`,
      },
    ],
    temperature: 0.88,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  let parsed: WorldBible;
  try {
    parsed = JSON.parse(content) as WorldBible;
  } catch {
    throw new Error('Failed to parse world bible from AI response');
  }

  // Ensure antagonistRoster contains both primaryAntagonist and lieutenant
  const roster: import('../../../shared/types').Antagonist[] = [];
  if (parsed.primaryAntagonist) roster.push(parsed.primaryAntagonist);
  if (parsed.lieutenant) roster.push(parsed.lieutenant as import('../../../shared/types').Antagonist);
  if (!parsed.antagonistRoster || parsed.antagonistRoster.length === 0) {
    parsed.antagonistRoster = roster;
  } else {
    const names = new Set(parsed.antagonistRoster.map(a => a.name));
    if (parsed.primaryAntagonist && !names.has(parsed.primaryAntagonist.name)) {
      parsed.antagonistRoster.unshift(parsed.primaryAntagonist);
    }
    if (parsed.lieutenant && !names.has(parsed.lieutenant.name)) {
      parsed.antagonistRoster.push(parsed.lieutenant as import('../../../shared/types').Antagonist);
    }
  }

  if (!parsed.toneRules || parsed.toneRules.length === 0) parsed.toneRules = ['Actions have consequences.', 'Trust is earned.', 'Magic has cost.', 'Death is permanent.'];
  if (!parsed.openingHooks || parsed.openingHooks.length === 0) parsed.openingHooks = ['Something stirs in the shadows.', 'An old warning resurfaces.', 'A stranger arrives with dire news.'];
  if (!parsed.geography || parsed.geography.length === 0) parsed.geography = [{ name: 'The Starting Town', description: 'A small settlement at the edge of the wilderness.', type: 'city' }];
  if (!parsed.factions || parsed.factions.length === 0) parsed.factions = [];
  if (!parsed.pantheon || parsed.pantheon.length === 0) parsed.pantheon = [];

  return parsed;
}

export async function runStoryDirector(
  worldState: WorldState,
  worldBible: WorldBible,
  characters: Character[],
  act: number
): Promise<{ beat: string; urgency: 'low' | 'high' | 'critical'; beatType: string } | null> {
  try {
    const actionsInAct = worldState.actionsInCurrentAct || 0;
    const actionCount = worldState.actionCount || 0;
    const sceneState = worldState.sceneState;
    const lastPillar = worldState.lastPillarUsed || sceneState?.purpose || 'explore';
    const spotlightBalance = worldState.spotlightBalance || {};
    const sessionNotes = worldState.sessionNotes || [];
    const futureHooks = (worldState.futureHooks || []).filter(h => !h.resolved);
    const backstoryHooks = worldState.backstoryHooks || [];
    const actGoalsAchieved = worldState.actGoalsAchieved || [];

    const roadmap = worldBible.dmRoadmap;
    const actGoals = act === 1 ? roadmap?.act1Goals : act === 2 ? roadmap?.act2Goals : roadmap?.act3ConvergenceThreads;
    const totalGoals = actGoals?.length || 4;
    const goalsComplete = actGoalsAchieved.length;

    const context = `
Campaign health check for Act ${act}:
- Actions in current act: ${actionsInAct}
- Total actions: ${actionCount}
- Last scene type (pillar): ${lastPillar}
- Spotlight balance: ${JSON.stringify(spotlightBalance)}
- Unresolved future hooks: ${futureHooks.length} (${futureHooks.slice(-3).map(h => h.description).join('; ') || 'none'})
- Backstory hooks: ${backstoryHooks.filter(h => h.status === 'active').length} active, ${backstoryHooks.filter(h => h.status === 'dormant').length} dormant
- Act goals achieved: ${goalsComplete}/${totalGoals}
- Recent session notes: ${sessionNotes.slice(-3).join(' | ') || 'none'}
- Characters: ${characters.map(c => `${c.name} (${c.race} ${c.class}, Lv${c.level})`).join(', ')}
- Central conflict: ${worldBible.centralConflict || 'unknown'}
- Mystery layer question: ${worldBible.mysteryLayer?.centralQuestion || 'none'}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Story Director evaluating campaign health for a dark fantasy RPG. Given campaign state, determine if a specific intervention is needed in the next 1-2 player actions to keep the story on track. Be specific — name NPCs, name scenes, name mechanics. Return JSON only.`,
        },
        {
          role: 'user',
          content: `${context}

Based on this campaign state, what specific thing MUST happen in the next 1-2 player actions?

Consider:
- Is the act overdue for a mystery clue drop? (Every 3-4 actions)
- Is one character dominating spotlight while another is ignored?
- Are there urgent future hooks that need to pay off now?
- Are there active backstory hooks that need escalation?
- Is the pillar balance off (all combat, no social/exploration)?
- Are act goals dangerously behind?

If the campaign is healthy and nothing is urgently needed, return {"healthy": true}.

Otherwise return:
{
  "beat": "Specific directive: exactly what must happen, naming NPCs/locations/situations. 2-3 sentences max.",
  "urgency": "low|high|critical",
  "beatType": "mystery_clue|spotlight_shift|hook_payoff|backstory_escalation|pillar_balance|act_goal|pacing"
}`,
        },
      ],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.healthy) return null;
    if (!parsed.beat) return null;

    return {
      beat: parsed.beat as string,
      urgency: (parsed.urgency as 'low' | 'high' | 'critical') || 'low',
      beatType: (parsed.beatType as string) || 'pacing',
    };
  } catch {
    return null;
  }
}

export async function extractFutureHooks(
  action: string,
  narration: string,
  worldState: WorldState,
  characterName: string
): Promise<{ id: string; description: string; source: string; createdAt: string; resolved: boolean }[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are analyzing a D&D session moment to extract future hooks — things that COULD have repercussions later if remembered. Extract 0-2 items only. Only flag genuinely notable moments, not mundane actions. Return JSON only.`,
        },
        {
          role: 'user',
          content: `Character: ${characterName}
Current location: ${worldState.currentLocation || 'unknown'}
Player action: "${action}"
What happened: "${narration.slice(0, 500)}"

Extract 0-2 future hooks from this moment. These are things that could matter later:
- An NPC was threatened/wronged/helped — they might remember
- A faction noticed something the players did
- A promise or oath was made
- An object of unknown significance appeared
- A choice was made that one character might regret
- Something was left behind or ignored that will matter

Return: {"hooks": [{"description": "short description of the repercussion potential", "type": "npc_grudge|faction_memory|promise|object|choice|abandoned"}]}
Or: {"hooks": []} if nothing notable happened.`,
        },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(raw) as { hooks?: { description: string; type?: string }[] };
    const hooks = parsed.hooks || [];
    if (!hooks.length) return [];

    return hooks.slice(0, 2).map(h => ({
      id: crypto.randomUUID(),
      description: h.description,
      source: action.slice(0, 100),
      createdAt: new Date().toISOString(),
      resolved: false,
    }));
  } catch {
    return [];
  }
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
