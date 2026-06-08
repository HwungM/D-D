import OpenAI from 'openai';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption, CampaignJournalEntry, CharacterHistoryEntry, Antagonist, RollContext, CharacterOnlineStatus, NpcMemory, CombatEnemy } from '../../../shared/types';
import { CLASS_ABILITIES } from '../../../shared/classAbilities';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EVERREALM_ART_BIBLE = {
  styleName: 'Everrealm Painterly Western Fantasy Animation',
  masterPrompt:
    'Hand-painted western fantasy animation style, anime-aware but not anime, sharp expressive faces, angular facial structure, varied body types and silhouettes, exaggerated fantasy species features, rugged adventuring clothing and armor, painterly linework, cinematic warm-and-cool lighting, dramatic expressions, strong personality in every face, animated-film detail, rich fantasy atmosphere, storybook adventure energy, not photorealistic, not grimdark by default.',
  characterStyle: [
    'Sharp expressive faces with readable emotion and angular structure.',
    'Anime-aware eyes and acting, but western RPG fantasy proportions and design language.',
    'Varied silhouettes, species traits, body types, scars, gear, posture, and personality.',
    'Rugged adventuring clothes and armor that feel lived-in, repaired, and story-worn.',
  ],
  environmentStyle: [
    'Painterly fantasy animation backgrounds with strong shape language and cinematic composition.',
    'Locations can be cozy, eerie, heroic, whimsical, bleak, romantic, strange, or sacred depending on the scene.',
    'Avoid defaulting every cave, forest, castle, tavern, or ruin into the same dark-fantasy palette.',
  ],
  lighting: [
    'Warm candlelight, tavern glow, firelight, sunrise, and lamplight should contrast with cool moonlight, stormlight, water, steel, shadow, and magic.',
    'Use glowing magic accents as story focal points, not random decoration.',
    'Keep silhouettes readable even in tense or dark scenes.',
  ],
  toneRules: [
    'The visual style stays consistent while the local genre tone changes by region, faction, scene, and player choice.',
    'Dark scenes are allowed, but darkness is not the baseline.',
    'Wonder, humor, danger, beauty, horror, and heroism can sit side by side in the same world.',
  ],
  avoid: [
    'photorealism',
    'generic dark fantasy concept art',
    'flat cartoon',
    'full anime style',
    'same-face characters',
    'muddy unreadable darkness',
    'empty atmospheric shots with no story focus',
  ],
  scenePromptRules: [
    'Mention the current location, subject, emotional beat, lighting, and visible story objects.',
    'If characters are visible, keep their species, silhouette, clothing, and emotional expression consistent.',
    'Frame scenes as moments from an animated fantasy film, not static item catalog art.',
  ],
};

const ART_STYLE_PREFIX = `${EVERREALM_ART_BIBLE.masterPrompt} `;

type CampaignLength = 'one_shot' | 'short' | 'medium' | 'long' | 'open_ended';

const CAMPAIGN_LENGTH_GUIDANCE: Record<CampaignLength, string> = {
  one_shot: 'One-shot: compress the whole adventure into one focused arc with an immediate hook, a visible antagonist or threat, 3-6 major scenes, fast clues, and a satisfying ending. Avoid slow-burn mysteries unless they are sequel hooks.',
  short: 'Short adventure: aim for a compact 2-3 act story over a few sessions. Reveal information quickly, keep travel purposeful, and make every faction/NPC serve the main arc.',
  medium: 'Medium campaign: pace as a full campaign arc with room for travel, twists, downtime, character growth, and recurring NPCs. Use this as the balanced default.',
  long: 'Long campaign: build for 30-60+ sessions with slow-burn mysteries, recurring rivals, faction turns, evolving locations, downtime, personal arcs, and delayed payoffs that still move forward each session.',
  open_ended: 'Open-ended saga: create a living world with modular arcs and no forced final ending. Resolve local arcs cleanly, then open new fronts until the players choose to pursue an endgame.',
};

const CAMPAIGN_LENGTH_LABELS: Record<CampaignLength, string> = {
  one_shot: 'One-Shot',
  short: 'Short Adventure',
  medium: 'Medium Campaign',
  long: 'Long Campaign',
  open_ended: 'Open-Ended Saga',
};

function getCampaignLength(value?: string): CampaignLength {
  if (value === 'one_shot' || value === 'short' || value === 'medium' || value === 'long' || value === 'open_ended') {
    return value;
  }
  return 'medium';
}

function getCampaignPacingThresholds(length: CampaignLength): { mature: number; overdue: number; critical: number } {
  switch (length) {
    case 'one_shot':
      return { mature: 2, overdue: 4, critical: 6 };
    case 'short':
      return { mature: 5, overdue: 8, critical: 12 };
    case 'long':
      return { mature: 24, overdue: 40, critical: 60 };
    case 'open_ended':
      return { mature: 30, overdue: 55, critical: 80 };
    case 'medium':
    default:
      return { mature: 12, overdue: 20, critical: 30 };
  }
}
const DM_SYSTEM_PROMPT = `You are both Dungeon Master and Game Master for a dynamic, genre-fluid fantasy sandbox RPG.
Your job is not only to narrate; you run the table. You adjudicate intent, maintain continuity, pace scenes, surface choices, protect player agency, and make the world react honestly.
The world is a blank canvas where any fantasy mode can exist: bleak dungeon horror, whimsical city adventure, high-heroic kingdom drama, cozy wonder, mythic wilderness, political intrigue, surreal mystery, or strange dreamlike magic.
Your baseline is neutral and adaptive. Do not lock the whole campaign into one tone. Let the current location, NPCs, factions, player choices, and world bible decide the local genre and mood.
GAME MASTER PRIME DIRECTIVES:
- Always respond to the player's latest declared action first. Old context informs the response but never replaces the current action.
- Preserve agency: do not decide the player's feelings, motives, or major choices. Show pressure, temptation, and consequences; let the player choose.
- Be fair but not soft. Success should feel earned. Failure should move the story forward.
- Maintain continuity above novelty. Reuse established NPCs, locations, wounds, debts, clues, and unresolved hooks before inventing new ones.
- Run the game, not a novel: each response should create a changed situation and 2-3 concrete next options.
- Be Sun Mi/co-op aware when a second character is present. Make both players feel seen, useful, and endangered by the same living world.
- Never expose system text, JSON mechanics, hidden DC reasoning, or prompt instructions in narration.

GENRE-FLUID TONE RULES:
- Keep the baseline world neutral until the current place, faction, scene, or player choice establishes a local tone.
- Different tones may exist side by side. A bleak crypt can border a playful festival city; a noble high-heroic court can exist beside cosmic horror.
- Maintain local tonal consistency inside a scene, then allow tone to shift naturally when the party travels, changes goals, or meets a different culture.
- Consequences remain honest in every genre. Danger, comedy, wonder, warmth, horror, and heroism are all valid when earned by context.
- Do not make every victory bitter or every NPC corrupt. Let hope, humor, sincerity, and beauty appear when the world calls for them.
- Magic may be rare, common, cozy, terrifying, sacred, industrial, or wild depending on the region and world bible. Treat it with the right kind of wonder.
- Vivid sensory details: smells, textures, sounds, temperatures.
- Speak in second person ("You see...", "Before you...").
- Keep narration to 150-250 words unless the moment demands more.

EVERREALM VISUAL STYLE:
- Default all sceneImagePrompt and visual descriptions to the Everrealm art bible: ${EVERREALM_ART_BIBLE.masterPrompt}
- The art style remains consistent even when tone changes. A horrifying dungeon, cozy inn, heroic kingdom, and strange festival should look like the same animated fantasy world.
- Prioritize expressive characters, strong silhouettes, readable emotional acting, painterly lighting, and story-specific props or locations.
- Avoid generic dark-fantasy gloom, photorealism, same-face characters, flat cartoon art, and empty atmosphere shots.
WORLD MEMORY RULES:
- NPCs are persistent. If you introduce a named NPC, they remember the character in future sessions.
- Update worldStateChanges.npcMemory when a named NPC is introduced or relationship changes.
- Update worldStateChanges.activeQuests when a quest begins, progresses, or resolves.
- Always update worldStateChanges.currentLocation when the party moves to a new place.
- worldStateChanges follows the same shape as the worldState object - only include fields that actually changed.
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
- shopItems: array of {id, name, description, type, price, quantity} - 4-8 items appropriate to the setting.
- IMPORTANT: A merchant's inventory does NOT change between visits. If the player has visited this merchant before (check npcMemory), use the SAME items they had before. Only generate new items for a brand new merchant never seen before.
- The player can then choose to buy items (handled separately). Do not auto-deduct gold.

NPC NAMING RULES:
- Every NPC must have a proper name. NEVER refer to an NPC as "the merchant", "a guard", "an old woman", "the innkeeper", or any unnamed generic. Give them a name immediately upon introduction (e.g. "Varen, a grizzled merchant", "Sister Ileth, the gate guard").
- Names should fit the current region, culture, and genre tone. A whimsical market, heroic kingdom, haunted borderland, and surreal sky-city should not all sound the same.
- Once named, always use that name consistently.

NPC CONVERSATION TRACKING:
- When the character begins talking to a specific NPC, set worldStateChanges.activeNPC to that NPC's name.
- When the character leaves a conversation (walks away, changes scene), set worldStateChanges.activeNPC to null.
- ALWAYS check the ACTIVE NPC field before writing dialogue. If activeNPC is "Father Garrick", the character is talking to Father Garrick - not anyone else.
- Never write dialogue attributed to an NPC who is not present in the current scene.

ACT PROGRESSION RULES:
- When the act climax event occurs (the one listed in DM ROADMAP), set advanceAct: true.
- The DM ROADMAP shows exactly what the act climax is. Execute it. Don't invent a different climax.
- When advancing act, write a dramatic conclusive narration that wraps the chapter - a "things will never be the same" moment.
- If DM ROADMAP shows Ã¢Å¡Â  ACT OVERDUE or Ã°Å¸â€Â´ CRITICAL, you MUST trigger the climax this turn. Do not stall.

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

HIGH STAKES DETECTION - MANDATORY TRIGGERS:
You MUST set isHighStakes: true and generate choiceCards in these situations - no exceptions:
1. The character meets a named antagonist or their direct agent for the first time
2. An NPC the character has a relationship with is in danger or makes a request that costs something
3. The character discovers a major secret or revelation that changes what they thought was true
4. The character is offered a deal, alliance, or betrayal opportunity with real consequences
5. The character faces a situation where violence and non-violence are both viable but lead to very different outcomes
6. Any moment where the character must choose between personal gain and doing the right thing
7. A backstory element from the character's past directly confronts them

When isHighStakes: true:
- Generate exactly 2-3 choiceCards. Each has: title (3-5 words, action-oriented), description (1 sentence, what this choice means), consequenceHint (vague, ominous or hopeful - NOT a spoiler)
- Keep narration tight and tense - build to the choice, don't resolve it
- The choice cards replace the suggestedActions array - set suggestedActions to []
- DO NOT set isHighStakes for routine combat, minor decisions, or exploration without moral weight

FREQUENCY: High stakes moments should appear roughly every 6-10 actions in a normal session. If it has been more than 10 actions since the last high stakes moment, look for an opportunity to create one naturally.

OPTIONAL SUGGESTION RULES:
- Normal play is freeform. The player is expected to type their own action, so suggestedActions are optional nudges, not the primary interface.
- Return 3-4 concrete, meaningfully different ideas. Each should be a player-facing command, usually 3-10 words.
- Avoid generic options like "continue", "look around", "ask about it", or "move forward" unless the action names a specific target, method, or risk.
- Mix approaches when the scene supports it: direct, subtle, social, investigative, protective, reckless, magical, class-aware, or party-aware.
- At least one suggestion should push the scene forward. At least one can invite curiosity or caution. At least one should use a concrete current-scene element: a visible feature, NPC, item, threat, clue, exit, sound, weather condition, or magical effect.
- When inventory, status effects, or available abilities are relevant, include one suggestion that names the useful item, effect, or ability. Do not invent items or abilities.
- In combat, suggestions must reference a target, tactic, cover, terrain, ally, ability, or escape route. Never offer vague combat ideas.
- In co-op scenes, include at least one idea that explicitly uses teamwork, covers an ally, follows up on an ally's move, or splits roles.
- Suggestions should help a stuck player think, but they should never make the scene feel like a visual novel.

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
- combat: ends on victory, escape, or death - do not drag it out past resolution.
- climax scenes: every exchange must escalate. No filler. No repetition.

PACING MODES - match your narration style to the current mode:
- exploration: patient, sensory-rich, 150-250 words, rewards curiosity
- tension: shorter punchy sentences, 100-150 words, each beat escalates something
- climax: urgent, visceral, 80-120 words, every action has weight
- resolution: slower, emotional, 150-200 words, let the moment breathe

MOMENTUM RULE - the most important rule:
If the scene has stalled (player is circling, nothing is changing), you MUST introduce a complication THIS turn.
Someone arrives. Something breaks. A sound from outside. The NPC reveals something unexpected. The situation changes.
NEVER let a scene stay static for more than 3 exchanges. Forward motion is your job.

SCENE EXIT SIGNALS: When a scene's purpose is complete, write a natural narrative door - a time-skip cue, a sensory shift, a clear opening toward the next beat. Example: "The innkeeper has told you everything he knows. The road north grows darker by the hour." Don't end mid-scene without offering a direction.

In your JSON response, always include:
- "sceneMomentum": "advancing" | "stalling" | "transitioning" - your honest assessment of whether this exchange moved the story
- "pacingMode": "exploration" | "tension" | "climax" | "resolution" - what mode you used for this response
- "scenePurpose": "explore" | "gather_info" | "combat" | "social" | "travel" | "rest" | "climax" - what this scene is currently about

PROACTIVE WORLD EVENTS:
- Sometimes (not always, use judgment), set proactiveEvent: true and include a worldEvent in the narration preamble - something the WORLD did, not the player. The antagonist advanced their plan. A faction moved. A rumor reached town. Something changed without the player causing it.

MULTI-ENEMY COMBAT RULES:
- When starting combat with multiple enemies, set combatEnemies: [{name, archetype, maxHp, condition, specialAbility}] for each enemy.
- archetype: "beast" (savage, fearless), "soldier" (tactical, coordinated), "mage" (ranged, vulnerable melee), "boss" (legendary, multi-phase), "minion" (numerous, fragile)
- Each round, return combatEnemies[] reflecting current state. When an enemy falls, set their isDefeated: true AND set enemyDefeated to their name.
- Each archetype fights differently: soldiers shield each other, mages hang back, minions rush in waves, beasts go for killing blows.
- Boss fights: set isBossFight: true on combat start. When boss condition reaches "critical", set bossPhaseAdvance: true and describe a dramatic transformation - the boss gets more dangerous, not less.
- Suggest actions that are class-appropriate and reference available abilities.

DICE ROLLING RULES:
- When an action requires a skill check or attack, set awaitingRoll: true instead of narrating the outcome.
- Populate rollContext with: stat (str/dex/con/int/wis/cha), dc (difficulty 8-25), diceType (almost always "d20"), description (what the player is attempting), successDescription (evocative hint at success, not a spoiler), failDescription (evocative hint at failure), isDramatic (true for high-stakes moments: saving throws vs death, critical attacks, unlocking the final door).
- When awaitingRoll: true, write a short tense setup narration (50-80 words) that builds to the roll - DO NOT resolve the outcome.
- When awaitingRoll is true, diceRequired must be false and suggestedActions must be []. The roll modal is the next player interaction.
- Call for rolls more often: any attack, stealth attempt, persuasion, lock picking, climbing, knowledge check, saving throw.
- modifier: include the current visible stat modifier as a display hint only. The server recalculates the true modifier from saved character stats before resolving the roll.
- DC CALIBRATION: Easy tasks DC 8-10, moderate DC 12-14, hard DC 16-18, very hard DC 20-22, near-impossible DC 24-25. Think about what PARTIAL SUCCESS looks like for every roll you set - what happens when the player beats the DC by only 1-2? That partial success state is as important as the clean success.

DEGREES OF SUCCESS (used by the roll outcome narrator):
- Nat 1 (critical failure): Something goes dramatically wrong beyond just failing - a new complication, a broken item, an enemy emboldened, a secret exposed.
- Miss by 4+ (clear failure): Direct consequence, no ambiguity. The door stays locked, the guard is suspicious, the ledge crumbles. Something closes off.
- Miss by 1-3 (near miss): "Almost" - a minor setback or complication, not the full failure consequence. You slip but catch yourself. The lie almost holds. Partial information, partial progress.
- Beat DC by 1-3 (partial success): You do it, but with a cost or complication attached. The door opens but you make noise. You persuade them but they want something in return. You land the hit but expose yourself.
- Beat DC by 4+ (clean success): Exactly what you attempted, cleanly executed. No asterisks.
- Nat 20 (critical success): You exceed expectations dramatically - a bonus effect beyond the task itself. The enemy is not just hit but off-balance. The persuasion doesn't just succeed, they become an ally. The lock opens and you spot the trap behind it.

ITEM RULES:
- Items in the character's inventory are story hooks and tools. Build situations where they become relevant.
- Named/unique items (keys, orbs, runes, letters) MUST eventually have a purpose built around them.
- Consumable items (potions, scrolls, food, torches) get removed from inventory when used - set characterChanges.inventory to reflect this.
- Item durability matters: on a critical failure (roll of 1), fragile items break and are removed from inventory. Normal items have a small chance. Sturdy and indestructible items never break.
- When a character uses a weapon, reference its damage type. When they use a potion, describe the specific effect.
- Arrows and bolts deplete with use.

ABILITY SYSTEM RULES:
- CHARACTER ABILITIES are listed in the world context with their exact mechanical effects.
- Use available abilities proactively when it makes narrative sense - don't wait for the player to ask.
- When you use an ability, set "abilityUsed" to the exact ability name so the cooldown is tracked.
- NEVER use an ability marked [ON COOLDOWN]. It is not available.
- Apply the mechanic description exactly - set the appropriate hpChange, statusEffectChanges, etc. If the ability lists an "ENGINE ROLL FOR THIS TURN", you MUST use those exact pre-rolled numbers when computing hpChange - do not estimate, average, or invent your own dice results.
- When the character rests (sleeps, takes a short rest, camps), set "isRest": true to reset cooldowns.

ENDGAME RULES:
- When endgamePhase is "approaching": the villain's plan is nearly complete. Start converging all plotlines. Urgency increases. Begin weaving backstory hooks toward their payoff. Set pacing to "tension" or "climax". Suggest actions that drive toward the final confrontation.
- When endgamePhase is "confrontation": THIS IS THE FINAL BATTLE. No escape. Every action has ultimate weight. Make the villain feel overwhelming but beatable. After the player wins (isVictory: true), set "endgameResolved": true.
- When the story naturally builds to the final confrontation (villain is revealed, final location reached, all threads converging), set "triggerFinalConfrontation": true.

BACKSTORY INTEGRATION:
- The character's backstory is their history before the campaign. It is true and established.
- NPCs from the character's past can appear. Enemies they made before. People they loved. Places they fled.
- The backstory should surface organically - not all at once, but in moments: a face in a crowd, a name on a wanted poster, a reaction from an NPC who recognizes them.
- When the backstory mentions a specific person, place, or event - those are seeds. Plant them. Pay them off.
- The character's motivation in the backstory should inform how NPCs approach them and what temptations the DM creates.
- Never summarize the backstory back to the player. Show it through the world's reaction to them.

SPOTLIGHT RULES (co-op only):
- Track which character has had more "hero moments" - scenes built around their abilities, backstory, or choices.
- If one character has had 3+ consecutive moments where they drove the story, build the next scene around the OTHER character.
- A spotlight moment means: this character's specific backstory, ability, or personal choice was what mattered here.
- Set spotlightCharacterId in response to the characterId you're spotlighting this turn (only when intentional).

MYSTERY LAYER RULES:
- The campaign has a CENTRAL MYSTERY defined in the world bible. Players should feel like investigators.
- Drop ONE mystery clue every 3-4 actions. Never more than one per action. Never drop the answer directly.
- Each clue should raise new questions even as it answers small ones.
- Red herrings should feel meaningful when discovered but lead to dead ends.
- When the revelation is ready (Act 3), build to it - the players should feel "of course" not "what?"

FAILURE RULES:
- Failure is a story accelerant, not a punishment. Never let failure just hurt and stop.
- When a check fails: something ELSE happens. The door didn't open - but the guard heard the noise. The persuasion failed - but the NPC revealed something in their anger.
- On critical failure: something changes dramatically. A new threat emerges. A secret is exposed. The situation escalates.
- The question after failure is never "nothing happened" - it's "what happened INSTEAD."

SAFE HAVEN RULES:
- The campaign has a safe haven. Reference it. NPCs there know the characters by name.
- When characters rest or need a quiet moment, scenes at the safe haven are where relationships develop naturally.
- The safe haven's key NPC should have a running personality - familiar, slightly odd, genuinely fond of the characters.
- If the safe haven is ever threatened, players will feel it personally.

TONAL CONTRAST RULES:
- After 2+ consecutive tense/climax/combat scenes, you MUST inject a moment of lighter tone.
- This can be: an absurd NPC, a plan going comically wrong, an unexpected moment of warmth, dark humor.
- Tonal contrast is powerful: wonder feels brighter beside danger, dread lands harder beside warmth, and humor can make the world feel alive.
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
- In your response, "scenePurpose" should vary across sessions - not just "combat" over and over.

DIRECTOR BEAT:
- If PENDING DIRECTOR BEAT is set in the context, you MUST execute that beat this turn or next turn.
- This is a campaign health directive from a higher system. It overrides your local scene preferences.
- After executing it, set "directorBeatExecuted": true in your response.

RACE & CLASS AWARENESS:
Every character's race and class should influence how the world treats them and what narrative opportunities arise. Apply these consistently - not as constant reminders, but as the background texture of NPC reactions and scene framing.

RACES - NPC reactions and narrative hooks:
- Human: NPCs treat humans as the default, for better and worse. Factions recruit them aggressively. Ambition is respected and also exploited. Lean into political intrigue, alliances of convenience, and the tension between short lifespans and long-term legacies.
- Elf: Other races react with a mixture of reverence and unease - they know an elf has seen things they haven't. Lean into ancient lore hooks: ruins that predate the current civilization, names the elf recognizes from history, old grudges still alive in elven memory. The elf's emotional restraint reads as coldness to some, wisdom to others.
- Dwarf: Dwarves command respect from hard-working folk and suspicion from those who deal in deception. Lean into clan honor, old debts, and underground threats. A dwarf's word is binding - NPCs know this and test it. Grudges from generations past surface at inconvenient moments.
- Halfling: The world underestimates halflings consistently. This is a gift and an irritant. Common folk trust halflings instinctively; nobles dismiss them until it is too late. Lean into moments of pleasant surprise - the halfling who talked their way past the gate, found the hidden passage, or survived by being precisely the kind of threat nobody planned for.
- Gnome: Gnomes attract curiosity from scholars and paranoia from the superstitious. Their arcane sensitivity means they notice magical details others miss - treat this as a narrative advantage. Their eccentricity occasionally gets them into trouble with those who mistake enthusiasm for madness.
- Half-Orc: The world reacts to a Half-Orc's physical presence first and personality second. Guards are wary. Bullies step back. Hardened soldiers take note. Lean into the tension between reputation and reality - moments where the Half-Orc's choice to show mercy or restraint lands harder because nobody expected it. Their toughness is respected by those who earn it.
- Tiefling: Default NPC disposition is wary to hostile until trust is explicitly earned. Priests may refuse service. Children may point or whisper. Lean into social friction as dramatic fuel - offer the Tiefling moments to reclaim their dignity, shut down bigotry with precision, or weaponize others' fear of them. Their infernal heritage occasionally draws attention from dark powers that see it as a calling card.
- Dragonborn: Dragonborn command attention by walking into a room. Dragon-affiliated cults, ancient orders, and tribal warriors treat them with heightened interest. Their heritage opens doors in places connected to draconic history - and marks them as targets for those who collect draconic trophies. Honor challenges are issued to Dragonborn first. Their defeats are witnessed. Their victories are remembered.

CLASSES - narrative moments to spotlight and opportunities to create:
- Fighter: Spotlight tactical decision-making and battlefield control. Issue formal challenges and duels. Enemies coordinate to bring them down - Fighters are identified as the greatest physical threat. Honor-focused factions respect their martial dedication. Off-combat moments: old war contacts, veterans who recognize their technique, commanders who want to recruit them.
- Wizard: Seed arcane puzzles, hidden glyphs, and magical anomalies that reward their knowledge. Sages seek them out for consultation. Enemy mages treat them as priority targets. Lean into the tension between academic understanding of magic and its terrifying reality in the field. Ancient tomes are plot hooks. Magical catastrophes have history they can read.
- Rogue: Always narrate stealth opportunities - even if the player doesn't take them, the option should feel present. In social situations, describe what a sharp eye catches: the nervous tic, the hidden blade, the inconsistency in the story. When Sneak Attack fires, describe the exact moment of vulnerability exploited - make it feel earned. Crime networks and black markets are more accessible. NPCs who have secrets watch a Rogue very carefully.
- Cleric: Divine resonance: occasionally have their god acknowledge their service - a warmth in a holy symbol, a prayer answered with uncanny timing, a moment that feels touched. NPCs in spiritual distress are drawn to them. Undead and dark powers react to their divine presence. Lean into tests of faith - moments where their god seems absent, or where following their divine mandate costs something real. Other clergy are potential allies or rivals.
- Ranger: The natural world is alive and communicative for a Ranger. Animals behave differently - birds fall silent when something dangerous is near, and the Ranger notices. Tracks, scents, signs of passage that others miss are highlighted in narration. Wilderness threats feel navigable rather than fatal. Quarry cannot hide long. In cities, the Ranger's discomfort is a texture - too many smells, too many people, exits always noted.
- Paladin: Create moral dilemmas with no clean answer and make them land directly on the Paladin's oath. Their oath matters - when tempted to break it, make the temptation feel genuinely compelling, not cartoonish. Divine moments: occasionally have their god acknowledge their service when they uphold the oath at personal cost. Conversely, when they compromise their principles, let the silence speak. Undead and fiends react to their divine aura. Former enemies sometimes come to them for absolution.
- Barbarian: Violence respects violence. Tribal warriors issue challenges. Mercenary captains want to recruit or test them. Rage should feel like a narrative event - describe its onset and its aftermath. Lean into the primal vs. civilized tension: Barbarians in formal social settings, Barbarians choosing restraint. Their sheer endurance becomes a story element - enemies learn quickly that putting them down requires something extraordinary.
- Bard: Reward social creativity generously. The right words change the outcome of scenes - let the Bard feel this. NPCs remember them by name. Rumors they've spread come back to them. Performances leave traces in the world. Lean into information gathering as a class fantasy - a Bard who works a tavern right knows everything by morning. Their inspiration creates actual narrative moments for the characters who receive it.
- Druid: The natural world is not backdrop - it is a character. Corruption of nature is personal to a Druid. Spirits and ancient presences react to their presence in sacred places. Lean into transformation as a narrative tool beyond combat - a Druid can listen to a river, speak to a raven, feel the wrongness in poisoned soil. Civilization vs. nature tension is their permanent texture. Their magic feels older and stranger than other spellcasters'.
- Monk: Their stillness in chaos reads as unnerving. Enemies who expect panic find calm. Spiritual challenges and tests of will arrive more frequently - their discipline is a magnet for such trials. Lean into precision over power: a Monk's victories often come from seeing the moment and taking it, not from overwhelming force. Their self-sufficiency means they notice when they're being relied upon. Monasteries, martial orders, and those who respect discipline treat them with specific recognition.
- Sorcerer: Magic reacts to them in ways it doesn't react to Wizards - ambient arcane phenomena, wild resonances, other magic-users sensing their bloodline. Lean into the cost-that-wasn't-chosen: their power is extraordinary and not entirely under control. Other spellcasters are fascinated, envious, or frightened. Ancient bloodlines open old doors and attract old attention. When their magic goes sideways, it goes sideways dramatically.
- Warlock: The patron is a presence in the story. Their influence is felt in the margin - a whispered suggestion, a dream that feels directed, a moment when the power surges because the patron approved. Lean into the price of the deal: demands arrive at inconvenient times, and the Warlock must decide how much to comply. NPCs who are spiritually sensitive sense something wrong about them. Former allies of the patron may recognize the mark and have opinions. The deal's full terms were never spelled out - discover them as you go.

CO-OP NARRATION RULES (only applies when two characters act simultaneously):
- Both characters are present in the same scene. Address each by name.
- Weave their actions together - one's action creates opportunity or complication for the other.
- Make them feel like a team. Their combined effort should be more interesting than either alone.
- Apply mechanical changes independently: use character1Changes for Character 1, character2Changes for Character 2.
- Write as if you are a DM running a real table with two players side by side.
- Narration length: 200-300 words to give both characters adequate presence.

RESPONSE FORMAT: Always respond with valid JSON matching this schema:
{
  "narration": "string - the story text the player sees",
  "diceRequired": false,
  "diceType": null,
  "diceDC": null,
  "diceDescription": null,
  "worldStateChanges": object | null,
  "suggestedActions": ["3-4 optional action ideas; use [] if awaitingRoll or isHighStakes"],
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
  "sessionNote": "string - one sentence summary of what happened, added to DM notes" | null,
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
  "backstoryHookResolved": "characterId if one of their ACTIVE backstory hooks reached its narrative payoff this turn" | null,
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

// Finds dice notation (e.g. "1d6", "2d8") inside an ability's mechanic text and
// rolls it with the engine's RNG, so the AI applies an exact, fairly-rolled
// number instead of guessing an "average" damage/healing value each time.
function preRollAbilityDice(mechanic: string): string | null {
  const diceRegex = /(\d*)d(\d+)/gi;
  const matches = [...mechanic.matchAll(diceRegex)];
  if (matches.length === 0) return null;
  const seen = new Set<string>();
  const rolls: string[] = [];
  for (const match of matches) {
    const notation = match[0].toLowerCase();
    if (seen.has(notation)) continue;
    seen.add(notation);
    const count = Math.min(match[1] ? parseInt(match[1], 10) : 1, 20);
    const sides = Math.min(parseInt(match[2], 10), 100);
    if (!Number.isFinite(count) || !Number.isFinite(sides) || count < 1 || sides < 2) continue;
    const individual = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = individual.reduce((a, b) => a + b, 0);
    rolls.push(`${notation} = ${individual.length > 1 ? `${individual.join('+')} = ` : ''}${total}`);
  }
  return rolls.length > 0 ? rolls.join(', ') : null;
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
  backstoryHookResolved?: string;
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
  character1Changes?: { hpChange?: number; loot?: NarrationResult['loot']; statusEffectChanges?: NarrationResult['statusEffectChanges'] };
  character2Changes?: { hpChange?: number; loot?: NarrationResult['loot']; statusEffectChanges?: NarrationResult['statusEffectChanges'] };
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
    ? `\nÃ¢Å¡Â  UNUSUAL COMBO: ${character.race} ${character.class} - the DM may acknowledge this in-world with subtle reactions from NPCs.`
    : '';

  // Build abilities block - include mechanic so AI enforces actual numbers.
  // Dice notation in the mechanic (e.g. "1d6", "2d8") is pre-rolled by the engine
  // here rather than left for the AI to estimate, so damage/healing numbers are
  // deterministic and fair instead of "AI vibes" each time an ability is used.
  const knownAbilities = character.abilities || [];
  let abilitiesBlock = '';
  if (knownAbilities.length > 0) {
    const available = knownAbilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0);
    const onCooldown = knownAbilities.filter(a => a.currentCooldown && a.currentCooldown > 0);
    const renderAbility = (a: typeof available[number]) => {
      const rolled = a.mechanic ? preRollAbilityDice(a.mechanic) : null;
      return `- ${a.name}: ${a.description}${a.mechanic ? `\n  MECHANIC: ${a.mechanic}` : ''}${rolled ? `\n  ENGINE ROLL FOR THIS TURN (use these exact numbers, do not invent your own): ${rolled}` : ''}`;
    };
    abilitiesBlock = `
Ã¢â€ÂÃ¢â€ÂÃ¢â€Â CHARACTER ABILITIES Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
AVAILABLE (apply mechanic exactly when used):
${available.length > 0 ? available.map(renderAbility).join('\n') : '(none available)'}
ON COOLDOWN (cannot use):
${onCooldown.length > 0 ? onCooldown.map(a => `- ${a.name} [ON COOLDOWN]`).join('\n') : '(none on cooldown)'}
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;
  } else {
    const classAbilityMap = CLASS_ABILITIES[character.class] || {};
    const allAbilityNames = Object.values(classAbilityMap).map(a => a.name);
    abilitiesBlock = `No special abilities yet (class abilities to come: ${allAbilityNames.slice(0, 2).join(', ')}, ...)`;
  }

  // Build stat context
  const s = character.stats;
  const statHints = [
    s.str >= 15 ? `STR ${s.str} Ã¢â€ â€™ can force doors, break obstacles, intimidate physically` : s.str <= 8 ? `STR ${s.str} Ã¢â€ â€™ avoid purely physical brute-force options` : null,
    s.dex >= 15 ? `DEX ${s.dex} Ã¢â€ â€™ can sneak, pick locks, acrobatics` : null,
    s.int >= 15 ? `INT ${s.int} Ã¢â€ â€™ can recall lore, solve puzzles, identify magic` : s.int <= 8 ? `INT ${s.int} Ã¢â€ â€™ avoid complex lore options in suggestedActions` : null,
    s.wis >= 15 ? `WIS ${s.wis} Ã¢â€ â€™ perceptive, reads people well` : null,
    s.cha >= 15 ? `CHA ${s.cha} Ã¢â€ â€™ can persuade, deceive, perform, intimidate socially` : s.cha <= 8 ? `CHA ${s.cha} Ã¢â€ â€™ avoid diplomacy/charm options in suggestedActions` : null,
  ].filter(Boolean).join('; ');

  // Build NPC memory context - key NPCs always shown, then rolling recent NPCs
  const keyNPCs = campaignContext?.keyNPCs || [];
  const keyNpcNames = new Set(keyNPCs.map(n => n.name));
  const rollingNPCs = (worldState.npcMemory || []).filter(n => !keyNpcNames.has(n.name));

  const keyNpcContext = keyNPCs.length > 0
    ? `\nÃ¢â€ÂÃ¢â€ÂÃ¢â€Â KEY NPCs (important - always remember these) Ã¢â€ÂÃ¢â€ÂÃ¢â€Â\n${keyNPCs.map(n => `- ${n.name} [${n.disposition}] Ã¢Ëœâ€¦: ${n.notes}`).join('\n')}`
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
          `  ${e.isDefeated ? 'Ã¢Å“- DEFEATED' : 'Ã¢â€“Â¶'} ${e.name} [${e.archetype.toUpperCase()}] - ${e.condition.toUpperCase()}${e.specialAbility ? ` | ${e.specialAbility}` : ''}`
        ).join('\n')
      : `  ${combatState.enemyName} - ${combatState.enemyCondition.toUpperCase()}`;
    const bossLine = combatState.isBossFight
      ? `\nBOSS FIGHT - Phase ${combatState.bossPhase || 1}. When boss reaches critical, advance to next phase (set bossPhaseAdvance: true). Each phase changes the boss's tactics and appearance dramatically.`
      : '';
    combatBlock = `
Ã¢â€ÂÃ¢â€ÂÃ¢â€Â ACTIVE COMBAT Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
Round: ${combatState.roundNumber} | Player HP: ${character.hp}/${character.max_hp}
ENEMIES:
${enemyLines}${bossLine}
ACTIONS ALREADY TRIED: ${combatState.playerActionsAttempted.slice(-5).join(', ') || 'none yet'}
RULES: Maintain enemy continuity - they remember every action. When an enemy is defeated, set enemyDefeated to their name. Set combatEnemies[] in every response to reflect current state.
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;
  }

  const sceneSummaryBlock = worldState.currentSceneSummary ? `
CURRENT SITUATION (summary of what is happening RIGHT NOW):
${worldState.currentSceneSummary}` : '';

  const locationGraph = worldState.locationGraph;
  const currentMapNode = locationGraph?.nodes?.find(node => node.name === (locationGraph.currentLocation || worldState.currentLocation));
  const knownLocationCount = worldState.discoveredLocations?.length || locationGraph?.nodes?.length || 0;
  const worldSizeGuidance = knownLocationCount >= 70
    ? `The world map is now large (${knownLocationCount} known places). Stop inventing new locations unless the story truly demands it — instead deepen, revisit, and complicate the places that already exist (new NPCs, quests, or twists at known locations).`
    : knownLocationCount >= 35
      ? `The world map is filling out (${knownLocationCount} known places). Lean toward sending the party back to places they've already been rather than introducing new ones — only add a new location when it's genuinely earned by the story.`
      : '';
  const mapContextBlock = locationGraph ? `
LOCATION MAP:
- Current location: ${locationGraph.currentLocation || worldState.currentLocation || 'unknown'}
- Nearby roads: ${locationGraph.nearby?.join(', ') || 'none mapped yet'}
- Current markers: ${[
    currentMapNode?.npcsPresent?.length ? `NPCs: ${currentMapNode.npcsPresent.join(', ')}` : null,
    currentMapNode?.questHooks?.length ? `Quests: ${currentMapNode.questHooks.join(', ')}` : null,
    currentMapNode?.connectedTo?.length ? `Paths: ${currentMapNode.connectedTo.join(', ')}` : null,
  ].filter(Boolean).join(' | ') || 'none'}
- Known regions: ${locationGraph.regions?.slice(0, 5).map(region => `${region.name} (${region.locations.slice(0, 4).join(', ')})`).join(' | ') || 'none'}
Use nearby mapped places when travel, investigation, or pursuit is relevant. If a new named place is discovered, moved to, or becomes important, include it in worldStateChanges.discoveredLocations and set worldStateChanges.currentLocation when the party actually changes location.${worldSizeGuidance ? `\n${worldSizeGuidance}` : ''}` : '';

  const visibleSceneInputs = [
    worldState.currentLocation ? `location: ${worldState.currentLocation}` : null,
    worldState.timeOfDay ? `time: ${worldState.timeOfDay}` : null,
    worldState.weather ? `weather: ${worldState.weather}` : null,
    worldState.activeNPC ? `active NPC: ${worldState.activeNPC}` : null,
    combatState?.inCombat ? `combat: ${combatState.enemyName || 'active enemy'} (${combatState.enemyCondition || 'unknown condition'})` : null,
    worldState.currentSceneSummary ? `scene summary: ${worldState.currentSceneSummary}` : null,
  ].filter(Boolean).join(' | ');
  const availableSuggestionTools = [
    character.inventory.length > 0 ? `inventory: ${character.inventory.slice(0, 6).map(i => i.name).join(', ')}` : null,
    knownAbilities.length > 0 ? `abilities: ${knownAbilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0).slice(0, 5).map(a => a.name).join(', ') || 'none available'}` : null,
    character.status_effects && character.status_effects.length > 0 ? `status effects: ${character.status_effects.map(e => `${e.name} (${e.type})`).join(', ')}` : null,
    statHints ? `stat strengths/limits: ${statHints}` : null,
  ].filter(Boolean).join(' | ');
  const suggestionContextBlock = `
SUGGESTION INPUTS:
- Current scene anchors: ${visibleSceneInputs || 'use the immediate narration and recent history'}
- Character tools: ${availableSuggestionTools || 'no special tools currently relevant'}
- Optional suggestions must feel grounded in these inputs. If you cannot justify an idea from the scene, character, party, or known world state, do not offer it.`;

  const sceneState = worldState.sceneState;
  const forceComplication = campaignContext?.forceComplication;
  const autoPackingMode = sceneState?.pacingMode || (
    combatState?.inCombat ? 'climax' :
    (campaignContext?.act ?? 1) >= 3 ? 'tension' :
    'exploration'
  );
  const pacingBlock = `
Ã¢â€ÂÃ¢â€ÂÃ¢â€Â PACING DIRECTIVE Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
Scene purpose: ${sceneState?.purpose || 'explore'} | Exchanges in scene: ${sceneState?.exchangeCount ?? 0} | Pacing mode: ${autoPackingMode.toUpperCase()}${sceneState && sceneState.stalledCount >= 2 ? `
Ã¢Å¡Â  STALL DETECTED (${sceneState.stalledCount} consecutive exchanges without story advancement)${forceComplication ? '\nÃ°Å¸â€Â´ FORCE COMPLICATION THIS TURN - something must change RIGHT NOW. Introduce an interruption, revelation, or threat. Do not let the scene continue as-is.' : ' - consider introducing a complication.'}` : ''}
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;

  // Endgame block
  const endgamePhase = worldState.endgamePhase;
  let endgameBlock = '';
  if (endgamePhase && endgamePhase !== 'none') {
    if (endgamePhase === 'approaching') {
      endgameBlock = `\nÃ¢â€ÂÃ¢â€ÂÃ¢â€Â ENDGAME PHASE: APPROACHING Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
The villain's plan is nearly complete. All plotlines must converge NOW. Urgency is maximal.
Weave backstory hooks toward their payoff. Set pacingMode to "tension" or "climax".
Every suggested action should drive toward the final confrontation.
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;
    } else if (endgamePhase === 'confrontation') {
      endgameBlock = `\nÃ¢â€ÂÃ¢â€ÂÃ¢â€Â ENDGAME PHASE: CONFRONTATION Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
THIS IS THE FINAL BATTLE. No escape. No retreat. Every action carries ultimate weight.
Make the villain feel overwhelming but beatable. The fate of everything hangs here.
After the player achieves victory (isVictory: true), set "endgameResolved": true.
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;
    }
  }

  const worldContext = `
WORLD BIBLE:
- Era: ${worldBible.era} | Magic: ${worldBible.magicSystem}
- Factions: ${worldBible.factions.map(f => f.name).join(', ')}
- Tone: ${worldBible.toneRules.slice(0, 2).join('; ')}
- Visual style: ${worldBible.artBible?.masterPrompt || EVERREALM_ART_BIBLE.masterPrompt}
${worldBible.mysteryLayer ? `
Ã¢â€ÂÃ¢â€ÂÃ¢â€Â THE CENTRAL MYSTERY Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
Question players are investigating: ${worldBible.mysteryLayer.centralQuestion}
Clues (drop ONE per 3-4 actions, in order):
${worldBible.mysteryLayer.clues.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
Red herrings (feel real, lead nowhere):
${worldBible.mysteryLayer.redHerrings.map(r => `  - ${r}`).join('\n')}
Revelation (DO NOT reveal directly - build to it in Act 3): ${worldBible.mysteryLayer.revelation}
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â` : ''}
${worldBible.safeHaven ? `SAFE HAVEN: ${worldBible.safeHaven.name} - ${worldBible.safeHaven.flavor}. Kept by ${worldBible.safeHaven.keyNPC}.` : ''}
${worldBible.toneBreaks && worldBible.toneBreaks.length > 0 ? `TONAL CONTRAST MOMENTS: ${worldBible.toneBreaks.join(' | ')}` : ''}

WORLD STATE:
- Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
- Discovered: ${(worldState.discoveredLocations || []).slice(0, 5).join(', ') || 'none yet'}
- ACTIVE NPC: ${worldState.activeNPC || 'none - character is not in conversation with anyone specific'}
- Actions since last high-stakes moment: ${worldState.actionCount ? (worldState.actionCount - (worldState.lastHighStakesAction || 0)) : 'unknown'}
${keyNpcContext}${npcContext}${questContext}
${mapContextBlock}

CHARACTER: ${character.name} | HP: ${character.hp}/${character.max_hp} | LOCATION: ${worldState.currentLocation || 'Unknown'}
CLASS: ${character.class} | RACE: ${character.race} | LEVEL: ${character.level}${unusualNote}
Gold: ${character.gold}
BACKSTORY: ${character.backstory || 'Unknown origins'}
${character.status_effects && character.status_effects.length > 0 ? `ACTIVE STATUS EFFECTS: ${character.status_effects.map(e => `${e.name} (${e.type})`).join(', ')} - these affect what the character can do.` : ''}
Notable inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
STAT CONTEXT (factor into suggestedActions): ${statHints || 'balanced stats'}
${abilitiesBlock}
${suggestionContextBlock}
${endgameBlock}

${campaignContext ? `CAMPAIGN: Act ${campaignContext.act} | ${campaignContext.centralConflict}
JOURNAL: ${campaignContext.journal.slice(-3).map(j => `[Act ${j.actNumber}] ${j.summary}`).join(' | ') || 'none yet'}
HISTORY: ${campaignContext.characterHistory.slice(-5).map(h => `${h.description} Ã¢â€ â€™ ${h.impact}`).join(' | ') || 'none'}
ANTAGONISTS: ${campaignContext.antagonists.map(a => `${a.isRevealed ? a.name : '[UNKNOWN]'}: ${a.agenda}`).join(' | ') || 'none'}
NARRATIVE TIER: ${campaignContext.act <= 1 && character.level <= 3 ? 'EMERGING - local stakes' : character.level <= 6 ? 'KNOWN - regional threats' : character.level <= 10 ? 'FEARED - major powers react' : 'LEGENDARY'}` : ''}

RECENT HISTORY:
${recentHistory.slice(-8).join('\n')}

${campaignContext?.roadmap ? (() => {
  const actNum = campaignContext.act;
  const goals = actNum === 1 ? campaignContext.roadmap.act1Goals : actNum === 2 ? campaignContext.roadmap.act2Goals : campaignContext.roadmap.act3ConvergenceThreads;
  const climaxEvent = actNum === 1 ? campaignContext.roadmap.act1ClimaxEvent : actNum === 2 ? campaignContext.roadmap.act2ClimaxEvent : campaignContext.roadmap.act3ClimaxEvent;
  const actionsInAct = campaignContext.actionsInCurrentAct || 0;
  const campaignLength = getCampaignLength(worldBible.playerPreferences?.campaignLength);
  const pacing = getCampaignPacingThresholds(campaignLength);
  const lengthGuidance = CAMPAIGN_LENGTH_GUIDANCE[campaignLength];

  // Must-introduce status for act 1
  const mustIntro = actNum === 1 && campaignContext.roadmap.act1MustIntroduce?.length
    ? `MUST INTRODUCE before act 1 ends:\n${campaignContext.roadmap.act1MustIntroduce.map(item => {
        const appeared = campaignContext.mustIntroduceStatus?.[item] ?? false;
        return `  ${appeared ? '[Ã¢Å“â€œ appeared]' : '[Ã¢Å“- NOT YET]'} ${item}`;
      }).join('\n')}\n`
    : '';

  // Escalating urgency based on actions in current act
  let urgency = '';
  if (actionsInAct >= pacing.critical) {
    urgency = `\nCRITICAL ACT OVERRUN: Act ${actNum} has run ${actionsInAct} actions for a ${CAMPAIGN_LENGTH_LABELS[campaignLength]}. The act climax must happen THIS turn or the next. Do not delay. Execute: "${climaxEvent}" NOW.`;
  } else if (actionsInAct >= pacing.overdue) {
    urgency = `\nACT OVERDUE: ${actionsInAct} actions in Act ${actNum} for a ${CAMPAIGN_LENGTH_LABELS[campaignLength]}. Begin converging all threads toward: "${climaxEvent}" within the next 3 actions.`;
  } else if (actionsInAct >= pacing.mature) {
    urgency = `\nACT MATURING: Act ${actNum} has run ${actionsInAct} actions. Start steering toward the climax: "${climaxEvent}". Unresolved goals and hooks should begin paying off.`;
  }
  const endgameRule = campaignLength === 'open_ended'
    ? '\nOpen-ended pacing: do not force finality. Resolve the current local arc cleanly, then open new fronts unless endgamePhase calls for a final confrontation.'
    : campaignLength === 'one_shot'
      ? '\nOne-shot pacing: compress scenes, pay off hooks fast, and avoid dangling mysteries except a deliberate sequel hook.'
      : '';

  return `Ã¢â€ÂÃ¢â€ÂÃ¢â€Â DM ROADMAP Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
Campaign length: ${CAMPAIGN_LENGTH_LABELS[campaignLength]}. ${lengthGuidance}
Act pacing thresholds: mature at ${pacing.mature} actions, overdue at ${pacing.overdue}, critical at ${pacing.critical}.${endgameRule}
Act ${actNum} goals (steer the story toward these):
${goals.map(g => `  ${(campaignContext.actGoalsAchieved || []).includes(g) ? '[Ã¢Å“â€œ DONE]' : '[ ]'} ${g}`).join('\n')}
${mustIntro}Act ${actNum} climax (this MUST happen before act ends): ${climaxEvent}${actNum === 2 && campaignContext.roadmap.act2VillainEscalation ? `\nAct 2 villain escalation (make this real): ${campaignContext.roadmap.act2VillainEscalation}` : ''}${urgency}
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;
})() : ''}

${campaignContext?.foreshadowingLedger && campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').length > 0 ? `Ã¢â€ÂÃ¢â€ÂÃ¢â€Â FORESHADOWING LEDGER Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
PLANTED - pay these off when dramatically right:
${campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').slice(0, 8).map(f => `  [${f.type.toUpperCase()}] ${f.description}`).join('\n')}
When you introduce something new that should echo later, include it in newForeshadowing[].
When you pay off a planted item, include its id in paidOffForeshadowing[].
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â` : ''}

${campaignContext?.backstoryHooks && campaignContext.backstoryHooks.filter(h => h.status !== 'resolved').length > 0 ? (() => {
  const actNum = campaignContext.act;
  const actionsInAct = campaignContext.actionsInCurrentAct || 0;
  const dormant = campaignContext.backstoryHooks!.filter(h => h.status === 'dormant');
  const active = campaignContext.backstoryHooks!.filter(h => h.status === 'active');
  const activeUrgency = active.length > 0 && actionsInAct >= 8
    ? `\nÃ°Å¸Å½Â¯ ACTIVE hooks MUST be developed this act - they've been seeded, now escalate them toward payoff.`
    : '';
  const dormantUrgency = dormant.length > 0 && actionsInAct >= 15
    ? `\nÃ¢Å¡Â  DORMANT hooks are overdue - seed at least one of them into the story NOW.`
    : '';
  return `Ã¢â€ÂÃ¢â€ÂÃ¢â€Â BACKSTORY HOOKS Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
${active.length > 0 ? `ACTIVE (seeded - escalate toward payoff):\n${active.map(h => `  Ã¢â€“Â¶ [${h.characterName}] ${h.hook}`).join('\n')}\n` : ''}${dormant.length > 0 ? `DORMANT (not yet introduced - seed these):\n${dormant.map(h => `  Ã¢-â€¹ [${h.characterName}] ${h.hook}`).join('\n')}\n` : ''}Dormant = not yet seeded. Set backstoryHookActivated to characterId when seeding one. When an ACTIVE hook reaches its narrative payoff (resolved, paid off, laid to rest), set backstoryHookResolved to that characterId so the thread can close.${activeUrgency}${dormantUrgency}
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â`;
})() : ''}

${campaignContext?.futureHooks && campaignContext.futureHooks.length > 0 ? `
FUTURE HOOKS TO HONOR (past choices with pending repercussions - bring these back):
${campaignContext.futureHooks.slice(-5).map(h => `- ${h.description}`).join('\n')}` : ''}

${campaignContext?.pendingDirectorBeat ? `
Ã¢â€ÂÃ¢â€ÂÃ¢â€Â PENDING DIRECTOR BEAT Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
URGENCY: ${campaignContext.pendingDirectorBeat.urgency.toUpperCase()}
MANDATORY BEAT: ${campaignContext.pendingDirectorBeat.beat}
You MUST execute this beat this turn or next turn. Set directorBeatExecuted:true when done.
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â` : ''}

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
Ã¢â€ÂÃ¢â€ÂÃ¢â€Â PLAYER ACTION NOW Ã¢â€ÂÃ¢â€ÂÃ¢â€Â
CHARACTER: ${character.name} | HP: ${character.hp}/${character.max_hp} | LOCATION: ${worldState.currentLocation || 'Unknown'}
ACTION: ${action}
Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â

IMPORTANT: Respond directly to THIS action. Do not ignore it or jump to older context. If any named NPC appears, speaks, is referenced as a contact, gives information, changes disposition, or becomes the active conversation partner, update worldStateChanges.npcMemory with that NPC's name, disposition, notes, lastMet, metCharacters, and interactionCount. Update worldStateChanges.activeQuests for quest events. Update worldStateChanges.currentLocation if moving.

QUALITY BAR BEFORE YOU ANSWER:
- Does the narration change the situation in a concrete way?
- Did you preserve player agency and avoid deciding what the player feels?
- Are suggestedActions specific verbs the player could actually choose next?
- If awaitingRoll is true, did you stop before the outcome and avoid suggestedActions?
- Did you update memory/state only for things that actually changed?`;

  return [
    { role: 'system', content: DM_SYSTEM_PROMPT },
    { role: 'user', content: worldContext },
  ];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const num = asNumber(value);
  if (num === undefined) return undefined;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function cleanStringArray(value: unknown, limit = 3): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= 140 && !item.startsWith('{') && !item.startsWith('['))
    .slice(0, limit);
}

function cleanSuggestedActions(value: unknown, fallback: string[] = []): string[] {
  const actions = cleanStringArray(value, 4);
  return actions.length > 0 ? actions : fallback;
}

function cleanLoot(value: unknown): NarrationResult['loot'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const validTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const items = value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => !!item)
    .map(item => {
      const name = asString(item.name);
      if (!name) return null;
      const type = asString(item.type);
      return {
        id: asString(item.id) || crypto.randomUUID(),
        name,
        description: asString(item.description) || '',
        quantity: clampNumber(item.quantity, 1, 99) || 1,
        type: validTypes.has(type || '') ? type! : 'misc',
        value: clampNumber(item.value, 0, 10000),
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
    .slice(0, 3);
  return items.length > 0 ? items as NarrationResult['loot'] : undefined;
}

function cleanShopItems(value: unknown): NarrationResult['shopItems'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const validTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const items = value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => !!item)
    .map(item => {
      const name = asString(item.name);
      if (!name) return null;
      const type = asString(item.type);
      return {
        id: asString(item.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name,
        description: asString(item.description) || '',
        type: validTypes.has(type || '') ? type! : 'misc',
        price: clampNumber(item.price, 0, 100000) || 0,
        quantity: clampNumber(item.quantity, 1, 99) || 1,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
    .slice(0, 8);
  return items.length > 0 ? items as NarrationResult['shopItems'] : undefined;
}

function cleanStatusEffectChanges(value: unknown): NarrationResult['statusEffectChanges'] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const validTypes = new Set(['buff', 'debuff', 'neutral']);
  const add = Array.isArray(record.add)
    ? record.add.map(asRecord).filter((effect): effect is Record<string, unknown> => !!effect).map(effect => {
        const name = asString(effect.name);
        if (!name) return null;
        const type = asString(effect.type);
        return {
          name,
          description: asString(effect.description) || '',
          type: validTypes.has(type || '') ? type! : 'neutral',
          duration: clampNumber(effect.duration, 1, 99),
        };
      }).filter((effect): effect is NonNullable<typeof effect> => !!effect).slice(0, 5)
    : undefined;
  const remove = cleanStringArray(record.remove, 8);
  if ((!add || add.length === 0) && remove.length === 0) return undefined;
  return { add: add && add.length > 0 ? add : undefined, remove: remove.length > 0 ? remove : undefined };
}

function cleanChoiceCards(value: unknown): NarrationResult['choiceCards'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cards = value
    .map(asRecord)
    .filter((card): card is Record<string, unknown> => !!card)
    .map(card => {
      const title = asString(card.title);
      const description = asString(card.description);
      if (!title || !description) return null;
      return {
        title: title.slice(0, 80),
        description: description.slice(0, 180),
        consequenceHint: (asString(card.consequenceHint) || 'The consequences will echo.').slice(0, 160),
      };
    })
    .filter((card): card is NonNullable<typeof card> => !!card)
    .slice(0, 3);
  return cards.length >= 2 ? cards : undefined;
}

function cleanRollContext(value: unknown): RollContext | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const stat = asString(record.stat)?.toLowerCase();
  if (!stat || !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(stat)) return undefined;
  const dc = clampNumber(record.dc, 8, 25);
  const description = asString(record.description);
  const successDescription = asString(record.successDescription);
  const failDescription = asString(record.failDescription);
  if (!dc || !description || !successDescription || !failDescription) return undefined;
  return {
    stat,
    dc,
    diceType: 'd20',
    description,
    successDescription,
    failDescription,
    critSuccessDescription: asString(record.critSuccessDescription),
    critFailDescription: asString(record.critFailDescription),
    isDramatic: asBoolean(record.isDramatic),
    modifier: clampNumber(record.modifier, -5, 5) || 0,
  };
}

function cleanForeshadowing(value: unknown): NarrationResult['newForeshadowing'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const validTypes = new Set(['npc', 'rumor', 'object', 'event', 'place']);
  const entries = value
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => !!entry)
    .map(entry => {
      const description = asString(entry.description);
      if (!description) return null;
      const type = asString(entry.type);
      return {
        id: asString(entry.id) || crypto.randomUUID(),
        description,
        type: validTypes.has(type || '') ? type! : 'event',
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
    .slice(0, 3);
  return entries.length > 0 ? entries : undefined;
}

function parseNarrationResponse(parsed: Record<string, unknown>): NarrationResult {
  const rollContext = cleanRollContext(parsed.rollContext);
  const awaitingRoll = asBoolean(parsed.awaitingRoll) && !!rollContext;
  const choiceCards = cleanChoiceCards(parsed.choiceCards);
  const isHighStakes = asBoolean(parsed.isHighStakes) && !!choiceCards;
  const fallbackActions = awaitingRoll || isHighStakes
    ? []
    : ['Study the immediate danger', 'Press someone for answers', 'Use the terrain', 'Take a cautious route'];

  return {
    narration: asString(parsed.narration) || 'The world holds its breath...',
    diceRequired: awaitingRoll ? false : asBoolean(parsed.diceRequired),
    diceType: awaitingRoll ? undefined : asString(parsed.diceType),
    diceDC: awaitingRoll ? undefined : clampNumber(parsed.diceDC, 5, 30),
    diceDescription: awaitingRoll ? undefined : asString(parsed.diceDescription),
    worldStateChanges: asRecord(parsed.worldStateChanges) as Partial<WorldState> | undefined,
    suggestedActions: isHighStakes ? [] : cleanSuggestedActions(parsed.suggestedActions, fallbackActions),
    sceneImagePrompt: asString(parsed.sceneImagePrompt) || '',
    isLevelUp: asBoolean(parsed.isLevelUp),
    isDeath: asBoolean(parsed.isDeath),
    deathDescription: asString(parsed.deathDescription),
    isCombat: asBoolean(parsed.isCombat),
    isVictory: asBoolean(parsed.isVictory),
    enemyName: asString(parsed.enemyName),
    loot: cleanLoot(parsed.loot),
    goldChange: clampNumber(parsed.goldChange, -10000, 10000),
    hpChange: clampNumber(parsed.hpChange, -1000, 1000),
    isMerchant: asBoolean(parsed.isMerchant),
    shopItems: cleanShopItems(parsed.shopItems),
    activeNPC: parsed.activeNPC === null ? null : asString(parsed.activeNPC),
    advanceAct: asBoolean(parsed.advanceAct),
    statusEffectChanges: cleanStatusEffectChanges(parsed.statusEffectChanges),
    sessionNote: asString(parsed.sessionNote),
    isHighStakes,
    choiceCards,
    characterHistoryNote: asRecord(parsed.characterHistoryNote) as NarrationResult['characterHistoryNote'] | undefined,
    antagonistUpdate: asRecord(parsed.antagonistUpdate) as NarrationResult['antagonistUpdate'] | undefined,
    proactiveEvent: asBoolean(parsed.proactiveEvent),
    awaitingRoll,
    rollContext: awaitingRoll ? rollContext : undefined,
    sceneMomentum: ['advancing', 'stalling', 'transitioning'].includes(asString(parsed.sceneMomentum) || '') ? parsed.sceneMomentum as NarrationResult['sceneMomentum'] : 'advancing',
    pacingMode: ['exploration', 'tension', 'climax', 'resolution'].includes(asString(parsed.pacingMode) || '') ? parsed.pacingMode as NarrationResult['pacingMode'] : 'exploration',
    scenePurpose: ['explore', 'gather_info', 'combat', 'social', 'travel', 'rest', 'climax'].includes(asString(parsed.scenePurpose) || '') ? parsed.scenePurpose as NarrationResult['scenePurpose'] : 'explore',
    newForeshadowing: cleanForeshadowing(parsed.newForeshadowing),
    paidOffForeshadowing: cleanStringArray(parsed.paidOffForeshadowing, 5),
    backstoryHookActivated: asString(parsed.backstoryHookActivated),
    backstoryHookResolved: asString(parsed.backstoryHookResolved),
    actGoalAchieved: asString(parsed.actGoalAchieved),
    abilityUsed: asString(parsed.abilityUsed),
    isRest: asBoolean(parsed.isRest),
    triggerFinalConfrontation: asBoolean(parsed.triggerFinalConfrontation),
    endgameResolved: asBoolean(parsed.endgameResolved),
    consumedItems: cleanStringArray(parsed.consumedItems, 5),
    combatEnemies: Array.isArray(parsed.combatEnemies) ? parsed.combatEnemies as CombatEnemy[] : undefined,
    enemyDefeated: asString(parsed.enemyDefeated),
    isBossFight: asBoolean(parsed.isBossFight),
    bossPhaseAdvance: asBoolean(parsed.bossPhaseAdvance),
    directorBeatExecuted: asBoolean(parsed.directorBeatExecuted),
    spotlightCharacterId: asString(parsed.spotlightCharacterId),
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

export async function generateCoopNarration(
  actions: { character: Character; action: string }[],
  worldState: WorldState,
  worldBible: WorldBible,
  recentHistory: string[]
): Promise<NarrationResult & { character1Changes?: NarrationResult['character1Changes']; character2Changes?: NarrationResult['character2Changes'] }> {
  if (actions.length < 2) throw new Error('generateCoopNarration requires exactly 2 actions');

  const [a1, a2] = actions;
  const c1 = a1.character;
  const c2 = a2.character;

  function charBlock(c: Character, label: string): string {
    const s = c.stats;
    const abilities = (c.abilities || []).filter(a => !a.currentCooldown || a.currentCooldown <= 0);
    return `${label}: ${c.name} (${c.race} ${c.class}, Level ${c.level})
HP: ${c.hp}/${c.max_hp} | Gold: ${c.gold}
Stats: STR ${s.str} DEX ${s.dex} CON ${s.con} INT ${s.int} WIS ${s.wis} CHA ${s.cha}
BACKSTORY: ${c.backstory || 'Unknown origins'}
${c.status_effects && c.status_effects.length > 0 ? `Status Effects: ${c.status_effects.map(e => e.name).join(', ')}` : ''}
Abilities available: ${abilities.length > 0 ? abilities.map(a => `${a.name}${a.mechanic ? ` (${a.mechanic})` : ''}`).join('; ') : 'none'}
Notable inventory: ${c.inventory.slice(0, 4).map(i => i.name).join(', ') || 'nothing special'}`;
  }

  const spotlightBalance = worldState.spotlightBalance || {}
  const char1Spotlights = spotlightBalance[c1.id] || 0
  const char2Spotlights = spotlightBalance[c2.id] || 0
  const spotlightDiff = char1Spotlights - char2Spotlights

  const spotlightDirective = spotlightDiff > 2
    ? `SPOTLIGHT NOTE: ${c1.name} has had significantly more spotlight moments (${char1Spotlights} vs ${char2Spotlights}). This scene should lean toward ${c2.name}'s action being the one that drives the outcome. Make their contribution feel more decisive.`
    : spotlightDiff < -2
    ? `SPOTLIGHT NOTE: ${c2.name} has had significantly more spotlight moments (${char2Spotlights} vs ${char1Spotlights}). This scene should lean toward ${c1.name}'s action being the one that drives the outcome. Make their contribution feel more decisive.`
    : ''

  const worldContext = `WORLD: ${worldBible.era} | ${worldBible.magicSystem}
Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
Central conflict: ${worldBible.centralConflict || ''}
Visual style: ${worldBible.artBible?.masterPrompt || EVERREALM_ART_BIBLE.masterPrompt}
${worldState.combatState?.inCombat ? `IN COMBAT: ${worldState.combatState.enemyName} (${worldState.combatState.enemyCondition}) - Round ${worldState.combatState.roundNumber}` : ''}
${worldState.activeQuests && worldState.activeQuests.filter(q => q.status === 'active').length > 0 ? `Active quests: ${worldState.activeQuests.filter(q => q.status === 'active').map(q => q.title).join(', ')}` : ''}

${charBlock(c1, 'CHARACTER 1')}

${charBlock(c2, 'CHARACTER 2')}

RECENT HISTORY:
${recentHistory.slice(-6).join('\n')}

CHARACTER 1 (${c1.name}) ACTION: ${a1.action}
CHARACTER 2 (${c2.name}) ACTION: ${a2.action}
${spotlightDirective ? `\n${spotlightDirective}` : ''}
Write ONE unified narration (200-300 words) weaving both actions together. Apply the CO-OP NARRATION RULES.

OPTIONAL SUGGESTIONS:
- suggestedActions are optional nudges, not required choices.
- Return 3-4 ideas grounded in this exact scene, location, party state, active quest, inventory, abilities, and both submitted actions.
- Include at least one teamwork idea that uses both characters or lets one cover/follow up on the other.
- If combat is active, every idea must name a target, tactic, terrain feature, ally, or escape route.
- Do not offer generic ideas like "continue", "look around", or "move forward".

Respond with JSON:
{
  "narration": "string - unified narration addressing both characters",
  "worldStateChanges": object | null,
  "suggestedActions": ["3-4 optional action ideas; use [] if awaitingRoll or isHighStakes"],
  "sceneImagePrompt": "string",
  "isLevelUp": false,
  "isDeath": false,
  "isCombat": boolean,
  "isVictory": boolean,
  "enemyName": "string | null",
  "advanceAct": false,
  "isHighStakes": false,
  "choiceCards": null,
  "sceneMomentum": "advancing" | "stalling" | "transitioning",
  "pacingMode": "exploration" | "tension" | "climax" | "resolution",
  "scenePurpose": "explore" | "gather_info" | "combat" | "social" | "travel" | "rest" | "climax",
  "combatEnemies": null,
  "sessionNote": "string | null",
  "character1Changes": {
    "hpChange": number | null,
    "loot": [{"id": "uid", "name": "string", "description": "string", "quantity": 1, "type": "weapon|armor|potion|misc|key", "value": 10}] | null,
    "statusEffectChanges": {"add": [], "remove": []} | null
  },
  "character2Changes": {
    "hpChange": number | null,
    "loot": [{"id": "uid", "name": "string", "description": "string", "quantity": 1, "type": "weapon|armor|potion|misc|key", "value": 10}] | null,
    "statusEffectChanges": {"add": [], "remove": []} | null
  }
}`;

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
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(content); } catch { /* use empty defaults */ }

  const base = parseNarrationResponse(parsed);

  return {
    ...base,
    character1Changes: (parsed.character1Changes as NarrationResult['character1Changes']) || undefined,
    character2Changes: (parsed.character2Changes as NarrationResult['character2Changes']) || undefined,
  };
}

function getDegreeOfSuccess(
  rollTotal: number,
  dc: number,
  isCritSuccess: boolean,
  isCritFail: boolean
): { label: string; degree: 'crit_fail' | 'clear_fail' | 'near_miss' | 'partial_success' | 'clean_success' | 'crit_success'; margin: number } {
  if (isCritSuccess) return { label: 'CRITICAL SUCCESS (natural 20)', degree: 'crit_success', margin: rollTotal - dc };
  if (isCritFail) return { label: 'CRITICAL FAILURE (natural 1)', degree: 'crit_fail', margin: rollTotal - dc };
  const margin = rollTotal - dc;
  if (margin >= 4) return { label: `CLEAN SUCCESS (beat DC by ${margin})`, degree: 'clean_success', margin };
  if (margin >= 1) return { label: `PARTIAL SUCCESS (beat DC by only ${margin})`, degree: 'partial_success', margin };
  if (margin >= -3) return { label: `NEAR MISS (missed DC by ${Math.abs(margin)})`, degree: 'near_miss', margin };
  return { label: `CLEAR FAILURE (missed DC by ${Math.abs(margin)})`, degree: 'clear_fail', margin };
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
  const { label: resultLabel, degree } = getDegreeOfSuccess(rollTotal, dc, isCritSuccess, isCritFail);

  const flavorHint = isCritSuccess && rollContext.critSuccessDescription
    ? rollContext.critSuccessDescription
    : isCritFail && rollContext.critFailDescription
      ? rollContext.critFailDescription
      : success
        ? rollContext.successDescription
        : rollContext.failDescription;

  const degreeGuidance: Record<string, string> = {
    crit_fail: 'CRITICAL FAILURE: Something goes dramatically wrong beyond just failing. A new complication emerges - a weapon drops, a secret is exposed, an enemy is emboldened, the situation escalates into something worse.',
    clear_fail: 'CLEAR FAILURE: Direct consequence, no ambiguity. A door closed, a suspicion confirmed, a resource spent for nothing. Don\'t soften it - but also have something happen AS a result of failing, not just absence of success.',
    near_miss: 'NEAR MISS: "Almost" - the player nearly had it. A minor setback or complication, not the full failure consequence. They slip but catch themselves. The lie almost holds. Partial information, partial progress. The story continues - just slightly worse.',
    partial_success: 'PARTIAL SUCCESS: They do it, but with a cost or complication. The door opens but they made noise. The persuasion works but the NPC wants something in return. The attack lands but leaves them exposed. Yes, AND something costs them.',
    clean_success: 'CLEAN SUCCESS: Exactly what was attempted, cleanly executed. No asterisks, no complications. A moment of competence. Let it feel good.',
    crit_success: 'CRITICAL SUCCESS: Exceed expectations dramatically. The task is accomplished AND something extra happens - an enemy is off-balance, a new opportunity appears, an ally is inspired, a bonus is earned. This is a highlight moment.',
  };

  const prompt = `You are a DM resolving the outcome of a dice roll.
The player attempted: ${rollContext.description}
They rolled ${rollResult} + ${rollTotal - rollResult} (${rollContext.stat.toUpperCase()} modifier) = ${rollTotal} vs DC ${dc} - ${resultLabel}.
Flavor hint for this outcome: "${flavorHint}"

DEGREE OF SUCCESS DIRECTIVE:
${degreeGuidance[degree]}

Character: ${character.name} (${character.race} ${character.class}, Level ${character.level})
HP: ${character.hp}/${character.max_hp} | Location: ${worldState.currentLocation || 'unknown'}
Inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
Available abilities: ${(character.abilities || []).filter(a => !a.currentCooldown || a.currentCooldown <= 0).slice(0, 5).map(a => a.name).join(', ') || 'none'}
Scene state: ${worldState.currentSceneSummary || 'use recent history and the roll outcome'}
Recent history:
${recentHistory.slice(-4).join('\n')}

Write vivid outcome narration (100-150 words) that precisely matches the ${resultLabel} degree.
The near miss and partial success cases are the most narratively rich - use them to keep the story moving with texture rather than just pass/fail.
Suggested actions should be 3-4 optional ideas grounded in the changed situation after the roll. Include a concrete scene feature, NPC, item, ability, ally, threat, clue, or exit when relevant. Avoid generic ideas.

Respond with JSON:
{
  "narration": "string",
  "worldStateChanges": object | null,
  "hpChange": number | null,
  "goldChange": number | null,
  "suggestedActions": ["3-4 optional action ideas after this roll outcome"],
  "sceneImagePrompt": "string",
  "isDeath": boolean,
  "isVictory": boolean,
  "isCombat": boolean,
  "loot": [{"id":"uid","name":"item","description":"desc","quantity":1,"type":"weapon|armor|potion|misc|key","value":10}] | null
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master Dungeon Master resolving dice roll outcomes in a dynamic, genre-fluid fantasy sandbox RPG. Match the outcome tone to the current scene and world bible. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(content); } catch { /* use empty defaults */ }

  return {
    narration: asString(parsed.narration) || 'The outcome unfolds...',
    worldStateChanges: asRecord(parsed.worldStateChanges) as Partial<WorldState> | undefined,
    hpChange: clampNumber(parsed.hpChange, -1000, 1000),
    goldChange: clampNumber(parsed.goldChange, -10000, 10000),
    suggestedActions: cleanSuggestedActions(parsed.suggestedActions, ['Check what changed', 'Use a nearby advantage', 'Follow up fast', 'Regroup before acting']),
    sceneImagePrompt: asString(parsed.sceneImagePrompt) || '',
    isDeath: asBoolean(parsed.isDeath),
    isVictory: asBoolean(parsed.isVictory),
    isCombat: asBoolean(parsed.isCombat),
    loot: cleanLoot(parsed.loot) as unknown[] | undefined,
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
    model: 'gpt-image-1',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
  });

  const image = response.data?.[0];
  let imageBuffer: Buffer;
  if (image?.b64_json) {
    imageBuffer = Buffer.from(image.b64_json, 'base64');
  } else if (image?.url) {
    const fetched = await fetch(image.url);
    if (!fetched.ok) throw new Error('Failed to download generated image');
    imageBuffer = Buffer.from(await fetched.arrayBuffer());
  } else {
    throw new Error('No image data returned from image generation');
  }

  // Re-host in Supabase Storage so we have a stable, permanent public URL.
  const url = await rehostImageBuffer(imageBuffer, cacheKey) || `data:image/png;base64,${imageBuffer.toString('base64')}`;

  // Cache the result
  await supabaseAdmin.from('asset_cache').insert({
    cache_key: cacheKey,
    url,
    asset_type: 'scene',
  });

  return url;
}

async function rehostImageBuffer(buffer: Buffer, cacheKey: string): Promise<string | null> {
  try {
    const path = `${cacheKey}.png`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('generated-art')
      .upload(path, buffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error('Failed to rehost generated image:', uploadError.message);
      return null;
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('generated-art').getPublicUrl(path);
    return publicUrlData?.publicUrl || null;
  } catch (err) {
    console.error('Failed to rehost generated image:', err);
    return null;
  }
}

export async function generateCharacterPortrait(
  name: string,
  race: string,
  characterClass: string,
  backstory?: string
): Promise<string> {
  const cacheKey = `portrait-${name}-${race}-${characterClass}`.toLowerCase().replace(/\s+/g, '-');

  const description = `Portrait of ${name}, a ${race} ${characterClass}. ${backstory ? backstory.slice(0, 100) : ''} Expressive Everrealm character portrait, face and shoulders, sharp facial structure, readable emotion, rugged adventuring details, painterly animated-film finish.`;

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
Be specific - name people, places, grudges, losses, secrets.

Return JSON:
{
  "hooks": [
    {
      "hook": "Specific 1-2 sentence hook that ties backstory to the main conflict. E.g: 'Elarion's murdered mentor was killed by agents of the Shadow Court - the same faction now serving the primary antagonist.'",
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
  return (parsed.hooks || [])
    .map(asRecord)
    .filter((hook): hook is Record<string, unknown> => !!hook && !!asString(hook.hook))
    .map(hook => ({
      characterId,
      characterName,
      hook: asString(hook.hook)!,
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
      content: 'You are a DM narrating what the villain did while the hero was away. Write in second person. Be atmospheric and ominous. 2-4 sentences max. The players did NOT cause this - the world moved without them. Respond with valid JSON only.',
    }, {
      role: 'user',
      content: `The villain has made a move while the hero was away.

Antagonist: ${antagonist?.isRevealed ? antagonist.name : '[Unknown Force]'}
Current plan step: ${currentStep}
Act: ${actNumber}
${actNumber === 2 && roadmap ? `Act 2 escalation: ${roadmap.act2VillainEscalation}` : ''}
World state: ${worldState.currentLocation || 'unknown location'}, ${worldState.timeOfDay || 'unknown time'}
Central conflict: ${worldBible.centralConflict}

Write a short atmospheric narration of what the villain did - something the hero discovers or hears about when they return. It should feel ominous and advance the threat. Do NOT name the villain if isRevealed is false.

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
        content: 'You are a master worldbuilder specializing in dynamic, genre-fluid fantasy sandboxes. Generate exactly 4 distinct campaign premises across different fantasy modes. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: `Generate 4 genre-fluid fantasy sandbox campaign seed options. Each should be distinct in tone, setting, stakes, and texture. Do not make every premise grim; include a range such as whimsical wonder, heroic adventure, eerie mystery, political intrigue, mythic exploration, cozy danger, or bleak dungeon horror when appropriate.
Return JSON array:
[{
  "id": "seed-1",
  "title": "Campaign title (3-5 words)",
  "premise": "2-3 sentence hook. Make it vivid, playable, emotionally clear, and open-ended. Let the chosen genre mode define whether it feels wondrous, eerie, heroic, funny, intimate, political, or frightening.",
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
  playerPreferences?: {
    playMode?: 'solo' | 'collaborative';
    partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now';
    campaignLength?: CampaignLength;
    tone?: string;
    artStyle?: string;
    favoritePillars?: string[];
    playerCount?: number;
    targetPlayerCount?: number;
    waitForParty?: boolean;
    characterConcepts?: string[];
  }
): Promise<WorldBible> {
  const campaignLength = getCampaignLength(playerPreferences?.campaignLength);
  const campaignLengthLine = playerPreferences?.campaignLength
    ? `- Campaign length: ${CAMPAIGN_LENGTH_LABELS[campaignLength]}. ${CAMPAIGN_LENGTH_GUIDANCE[campaignLength]}`
    : '';

  const prefContext = playerPreferences ? `
PLAYER PREFERENCES (use these to tailor the campaign):
${playerPreferences.playMode ? `- Human play mode: ${playerPreferences.playMode}. Solo means one human player; collaborative means real human party members may join.` : ''}
${playerPreferences.partyIntent ? `- Party setup intent: ${playerPreferences.partyIntent}. If collaborative, prepare shared spotlight moments and invite-friendly hooks. If solo_ai_companions, leave room for AI companions but do not assume they already exist.` : ''}
${campaignLengthLine}
${playerPreferences.tone ? `- Desired tone: ${playerPreferences.tone} - let this calibrate the toneRules and overall feel.` : ''}
${playerPreferences.artStyle ? `- Visual art style: ${playerPreferences.artStyle}. Keep this as the campaign's art bible foundation.` : ''}
${playerPreferences.favoritePillars?.length ? `- What they love most: ${playerPreferences.favoritePillars.join(', ')} - weight spotlightDesign.encounterCurve and suggested encounters toward these.` : ''}
${playerPreferences.playerCount ? `- Party size: ${playerPreferences.playerCount} players - scale the safeHaven, spotlightDesign.sharedMoments, and encounter difficulty accordingly.` : ''}
${playerPreferences.targetPlayerCount && playerPreferences.targetPlayerCount !== playerPreferences.playerCount ? `- Target party size after invites: ${playerPreferences.targetPlayerCount}. Start playable now, but design the campaign so new companions can join naturally.` : ''}
${typeof playerPreferences.waitForParty === 'boolean' ? `- Wait-for-party preference: ${playerPreferences.waitForParty ? 'the host expects to gather the party before starting' : 'the host may start now and invite others later'}.` : ''}
${playerPreferences.characterConcepts?.length ? `- Character concepts and backstories: ${playerPreferences.characterConcepts.join('; ')} - These character concepts and backstories are CANON. Build NPCs, factions, and opening hooks that directly reference what these characters care about, fear, or are running from. At least one faction or NPC in the world should have a direct tie to one of these character backstories. Use these to make campaignBrief.motivation personal, personalMotivation of the lieutenant feel relevant, and shape backstory hooks.` : ''}
` : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a master adventure designer creating a FULL CAMPAIGN DESIGN - not just a world setting. This is a complete adventure package: mystery, antagonists, emotional hooks, tonal contrast, safe haven, player spotlights, and a DM roadmap. Every field must be specific to THIS premise, not generic. Make it memorable. Respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `Design a complete dynamic, genre-fluid fantasy sandbox campaign for this premise: "${storySeed}"
${prefContext}
Return JSON matching this exact schema. Every field must be substantive and specific to the premise - no placeholder text:

{
  "era": "Name of the age - something evocative, not a generic age name",
  "magicSystem": "2-3 sentences on how magic works - its cost, rarity, and what makes it distinctive to this world",
  "geography": [
    {"name": "place name", "description": "2 sentences - what it looks and feels like", "type": "city|region|dungeon|wilderness|landmark"}
  ],
  "pantheon": [
    {"name": "god name", "domain": "domain", "alignment": "alignment", "conflict": "their specific conflict with another deity or mortal power"}
  ],
  "toneRules": [
    "rule 1 - specific to this premise, not generic fantasy",
    "rule 2",
    "rule 3",
    "rule 4"
  ],
  "artBible": {
    "styleName": "Everrealm Painterly Western Fantasy Animation",
    "masterPrompt": "${EVERREALM_ART_BIBLE.masterPrompt}",
    "characterStyle": [
      "Sharp expressive faces with readable emotion and angular structure.",
      "Anime-aware eyes and acting, but western RPG fantasy proportions and design language.",
      "Varied silhouettes, species traits, body types, scars, gear, posture, and personality.",
      "Rugged adventuring clothes and armor that feel lived-in, repaired, and story-worn."
    ],
    "environmentStyle": [
      "Painterly fantasy animation backgrounds with strong shape language and cinematic composition.",
      "Locations can be cozy, eerie, heroic, whimsical, bleak, romantic, strange, or sacred depending on the scene.",
      "Avoid defaulting every cave, forest, castle, tavern, or ruin into the same dark-fantasy palette."
    ],
    "lighting": [
      "Warm candlelight, tavern glow, firelight, sunrise, and lamplight should contrast with cool moonlight, stormlight, water, steel, shadow, and magic.",
      "Use glowing magic accents as story focal points, not random decoration.",
      "Keep silhouettes readable even in tense or dark scenes."
    ],
    "toneRules": [
      "The visual style stays consistent while the local genre tone changes by region, faction, scene, and player choice.",
      "Dark scenes are allowed, but darkness is not the baseline.",
      "Wonder, humor, danger, beauty, horror, and heroism can sit side by side in the same world."
    ],
    "avoid": [
      "photorealism",
      "generic dark fantasy concept art",
      "flat cartoon",
      "full anime style",
      "same-face characters",
      "muddy unreadable darkness",
      "empty atmospheric shots with no story focus"
    ],
    "scenePromptRules": [
      "Mention the current location, subject, emotional beat, lighting, and visible story objects.",
      "If characters are visible, keep their species, silhouette, clothing, and emotional expression consistent.",
      "Frame scenes as moments from an animated fantasy film, not static item catalog art."
    ]
  },
  "forbiddenLoreHooks": ["mystery 1 - something strange, hidden, sacred, dangerous, or forgotten about this world's history", "mystery 2", "mystery 3", "mystery 4"],
  "factions": [
    {"name": "faction name", "publicFace": "what they claim to be - their public reputation", "secretAgenda": "what they actually want - specific and surprising", "power": "weak|moderate|strong"}
  ],
  "primaryAntagonist": {
    "name": "A cryptic title or name (not their true name yet)",
    "trueName": "Their real name - kept secret until Act 3",
    "type": "primary",
    "agenda": "Their goal in 1-2 sentences - concrete and specific, vague enough to remain mysterious",
    "currentStep": "The specific step of their plan currently underway - what they are doing RIGHT NOW",
    "planSteps": ["step 1", "step 2", "step 3", "step 4", "step 5 - the completion of their goal"],
    "whatTheyKnow": "Nothing yet - the players are unknown to them",
    "isRevealed": false,
    "power": "legendary",
    "allies": ["ally faction or specific named person 1", "ally faction or specific named person 2"],
    "weaknesses": ["specific weakness 1 - something the players could discover and use", "specific weakness 2"]
  },
  "lieutenant": {
    "name": "Their name - someone the players will meet before knowing they're the villain's lieutenant",
    "trueName": "Same as name (lieutenants are not secret in the same way)",
    "type": "secondary",
    "agenda": "Their stated or apparent goal - what they seem to be pursuing",
    "currentStep": "What they are actively doing right now in the story",
    "planSteps": ["step 1", "step 2", "step 3"],
    "whatTheyKnow": "What they know about the primary antagonist's plan",
    "isRevealed": false,
    "power": "major",
    "allies": ["their personal allies, separate from the primary antagonist's"],
    "weaknesses": ["their specific vulnerability"],
    "tieToVillain": "1 sentence - how they are connected to the primary antagonist and why they serve",
    "firstAppearanceHint": "What the players first notice about this person before realizing they're the lieutenant - describe a scene or interaction",
    "personalMotivation": "What THEY want, independent of the villain - they're not just a lackey, they have their own goal the villain is helping them achieve"
  },
  "centralConflict": "2-3 sentences - the emotional and thematic core of the campaign. Not plot specifics. What does this campaign ultimately ask of the players?",
  "antagonistRoster": [],
  "openingHooks": [
    "A subtle hint that can be seeded in session 1 - specific, not generic",
    "A second breadcrumb - different in nature (visual, heard, felt, smelled)",
    "A third early omen - something that seems innocuous but is deeply significant"
  ],
  "plotTwist": "The mid-campaign revelation that reframes everything the players thought they knew. Should make them say 'oh god, of course.' Not a random surprise - something that was always true but hidden.",
  "mysteryLayer": {
    "centralQuestion": "The one question that drives all investigation - specific enough to pursue, mysterious enough to sustain a campaign",
    "clues": [
      "clue 1 - earliest, most subtle. Something players could easily overlook",
      "clue 2 - slightly more concrete, but still ambiguous",
      "clue 3 - raises more questions than it answers",
      "clue 4 - starts pointing at the truth in an uncomfortable direction",
      "clue 5 - confirms part of the answer but opens a worse question",
      "clue 6 - the final piece before revelation. Should make the revelation feel inevitable"
    ],
    "redHerrings": [
      "false trail 1 - plausible, misleading, has its own internal logic",
      "false trail 2 - points at the wrong person or cause convincingly"
    ],
    "revelation": "The full truth behind the central question - what actually happened/is happening. Be specific."
  },
  "safeHaven": {
    "name": "Name of the home base - evocative, fits the world",
    "description": "2 sentences - what it looks, sounds, smells like. It should feel lived-in and slightly imperfect.",
    "keyNPC": "Name and one sentence about the person who runs/protects it - warm, slightly odd, genuinely fond of the characters",
    "flavor": "One specific sensory detail that players will associate with safety - the smell of something always cooking, a particular lamp, a sound that means they're home"
  },
  "toneBreaks": [
    "A specific NPC who is genuinely funny or absurd in a tonally different part of the world - describe them in one sentence with their name",
    "A recurring comic situation or running joke built into the world - specific to this premise",
    "A moment of unexpected tonal contrast - warmth inside danger, danger inside beauty, comedy inside tension, or awe after fear. Describe the scenario",
    "An encounter that is lighter in difficulty and tone, designed to let players breathe - describe it"
  ],
  "futureHookSeeds": [
    "IF players choose to [specific action X in this world], then [future consequence Y - be specific about what changes]",
    "IF [specific NPC name from this campaign] survives/is spared, they will [specific future role]",
    "The [specific object/location/secret from Act 1] will [become critical in Act 3 because of this specific reason]",
    "If the players ignore [specific faction from this campaign], [that faction] will [specific retaliation action]",
    "The [specific choice the players will face in Act 2] will [shape the Act 3 resolution in this specific way]",
    "A recurring small NPC (name them) who, if players are kind to them, turns out to [have this crucial role later]"
  ],
  "campaignBrief": {
    "hook": "2 sentences. Clear objective + immediate emotional pull. No mystery yet - just: what do they need to do and why should they care RIGHT NOW.",
    "objective": "Exactly what the characters need to accomplish - concrete and actionable. Start with a verb.",
    "motivation": "Why would any character care about this personally? Make it visceral. If character concepts were provided, appeal to them directly.",
    "whereToStart": "Exactly where to go and who to talk to first. Give a name. Give a reason why that person specifically.",
    "worldStakes": "What happens to the world - specifically - if they fail. Make it visceral and concrete.",
    "characterStakes": "What the characters personally lose if they fail. More intimate than world stakes.",
    "mysteryHint": "Pose the central mystery as a question the players will want to answer. Intriguing, not spoiling."
  },
  "spotlightDesign": {
    "sharedMoments": [
      "A scenario that REQUIRES two characters to cooperate - one creates the opening, the other executes. Describe the specific situation.",
      "A moment where the characters must choose between individual goals and party loyalty - what is the specific dilemma?",
      "A scene designed to create an inside joke or shared reference - something absurd that only works in this world"
    ],
    "encounterCurve": "Describe the encounter difficulty curve for this campaign: Easy Ã¢â€ â€™ Medium Ã¢â€ â€™ Easy Ã¢â€ â€™ Hard Ã¢â€ â€™ Medium Ã¢â€ â€™ Hard Ã¢â€ â€™ DEADLY (boss). For each difficulty tier, describe what it represents in THIS campaign's specific context."
  },
  "dmRoadmap": {
    "act1Goals": [
      "Specific goal 1 for Act 1 - tailored to this premise",
      "Specific goal 2 for Act 1",
      "Specific goal 3 for Act 1",
      "Specific goal 4 for Act 1"
    ],
    "act1MustIntroduce": ["name of a key NPC specific to this campaign", "name of a key location", "name of a faction contact"],
    "act1ClimaxEvent": "The specific event that ends Act 1 - a revelation, a loss, a crossing of the point of no return. Specific to this premise.",
    "act2Goals": [
      "Specific goal 1 for Act 2",
      "Specific goal 2 for Act 2",
      "Specific goal 3 for Act 2",
      "Specific goal 4 for Act 2"
    ],
    "act2VillainEscalation": "The specific action the villain takes in Act 2 - something visible, terrible, personal to the players",
    "act2ClimaxEvent": "The darkest moment - the low point where players question whether victory is possible. Specific.",
    "act3ConvergenceThreads": [
      "Thread 1 converging - specific NPC or plot element from Act 1 that returns",
      "Thread 2 converging - how the central mystery connects to the final confrontation",
      "Thread 3 converging - how a choice the players made in Act 2 shapes the ending"
    ],
    "act3ClimaxEvent": "The final confrontation - describe its shape, location, and what makes it climactic. Specific.",
    "act3ResolutionOptions": [
      "Victory option: specific to this campaign's themes",
      "Pyrrhic victory option: the immediate threat ends but something irreversible has changed",
      "Tragic victory option: they save what matters most but lose something personal"
    ]
  }
}

Requirements:
- The dmRoadmap MUST match the requested campaign length. One-shot = immediate threat and compressed payoffs. Short = compact 2-3 act arc. Medium = balanced full campaign. Long = slow-burn saga with recurring payoffs and durable factions. Open-ended = modular arcs with no forced final ending until players pursue one.
- 5-7 geography entries (varied: city, dungeon, wilderness, landmark, region)
- 5-6 gods in pantheon with genuine theological conflicts
- Exactly 4 tone rules - specific to THIS premise, not boilerplate fantasy
- Include the Everrealm artBible exactly as the visual foundation, then tailor scenePromptRules only if this premise needs specific recurring visual motifs.
- 3-4 forbidden lore hooks
- Exactly 3 factions with genuinely surprising secret agendas
- The lieutenant must feel like a real person with their own goals, not just a henchman
- The mystery layer clues must form a coherent trail - each one building on the last
- The safeHaven must feel warm and specific - a place players will want to return to
- The plotTwist must be earned - something that was always true but cleverly hidden
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

  if (!parsed.toneRules || parsed.toneRules.length === 0) parsed.toneRules = ['The world begins neutral and the current place sets the tone.', 'Different regions can follow different fantasy rules.', 'Consequences remain honest without forcing bitterness.', 'Wonder, danger, humor, horror, and heroism all appear when context earns them.'];
  parsed.artBible = {
    ...EVERREALM_ART_BIBLE,
    ...(parsed.artBible || {}),
  };
  if (!parsed.openingHooks || parsed.openingHooks.length === 0) parsed.openingHooks = ['Something stirs in the shadows.', 'An old warning resurfaces.', 'A stranger arrives with dire news.'];
  if (!parsed.geography || parsed.geography.length === 0) parsed.geography = [{ name: 'The Starting Town', description: 'A small settlement at the edge of the wilderness.', type: 'city' }];
  if (!parsed.factions || parsed.factions.length === 0) parsed.factions = [];
  if (!parsed.pantheon || parsed.pantheon.length === 0) parsed.pantheon = [];
  parsed.playerPreferences = {
    ...(parsed.playerPreferences || {}),
    ...(playerPreferences || {}),
    campaignLength,
    tone: playerPreferences?.tone || parsed.playerPreferences?.tone || 'Anything Goes',
    favoritePillars: playerPreferences?.favoritePillars || parsed.playerPreferences?.favoritePillars || ['All of it equally'],
    playerCount: playerPreferences?.playerCount || parsed.playerPreferences?.playerCount || 1,
    characterConcepts: playerPreferences?.characterConcepts || parsed.playerPreferences?.characterConcepts || [],
  };

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
          content: `You are a Story Director evaluating campaign health for a genre-fluid fantasy RPG. Given campaign state, determine if a specific intervention is needed in the next 1-2 player actions to keep the story on track. Be specific - name NPCs, name scenes, name mechanics. Return JSON only.`,
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
          content: `You are analyzing a D&D session moment to extract future hooks - things that COULD have repercussions later if remembered. Extract 0-2 items only. Only flag genuinely notable moments, not mundane actions. Return JSON only.`,
        },
        {
          role: 'user',
          content: `Character: ${characterName}
Current location: ${worldState.currentLocation || 'unknown'}
Player action: "${action}"
What happened: "${narration.slice(0, 500)}"

Extract 0-2 future hooks from this moment. These are things that could matter later:
- An NPC was threatened/wronged/helped - they might remember
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
    ? `Active antagonists: ${worldBible.antagonistRoster.map(a => `${a.isRevealed ? a.name : '[Unknown Force]'} - ${a.currentStep}`).join('; ')}`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a DM injecting a proactive world event. Something happened in the world without the player doing anything. Make it atmospheric, brief (2-3 sentences), and connected to the antagonist's agenda or world state. NOT a combat encounter. A rumor, an observation, something found, a messenger arriving, distant sounds. End with 3-4 optional action ideas. Respond with valid JSON only.`,
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
  "suggestedActions": ["specific reaction 1", "specific reaction 2", "specific reaction 3", "specific reaction 4"]
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

  const prompt = `You are the narrator writing the final epilogue of a genre-fluid fantasy campaign. The age has ended.

CHARACTER: ${character.name}, ${character.race} ${character.class}, Level ${character.level}
OUTCOME: ${victory ? 'VICTORY - the central threat was resolved' : 'DEFEAT - the central threat prevailed'}

CAMPAIGN JOURNAL (what happened):
${journal.slice(-5).map(j => `[Act ${j.actNumber}] ${j.summary}`).join('\n') || 'A hero changed the shape of a living world.'}

FALLEN HEROES who came before:
${fallenHeroes.map(h => `- ${h.name} (${h.race} ${h.class}, Lv${h.level}): ${h.cause}`).join('\n') || 'None fell before this hero.'}

KEY NPCs encountered:
${npcMemory.slice(-10).map(n => `- ${n.name} [${n.disposition}]: ${n.notes}`).join('\n') || 'Many faces, many names.'}

FACTION STANDINGS:
${Object.entries(factionStandings).map(([f, v]) => `- ${f}: ${v > 0 ? 'Allied' : v < 0 ? 'Hostile' : 'Neutral'} (${v})`).join('\n') || 'The factions shifted like tides.'}

WORLD: ${worldBible.era} | ${worldBible.centralConflict}
PRIMARY ANTAGONIST: ${worldBible.primaryAntagonist?.name || 'The final threat'} - ${worldBible.primaryAntagonist?.agenda || 'sought to reshape the world'}

Write a rich 400-600 word epilogue in the style of the final page of a genre-fluid fantasy novel. Include:
1. What happened to the world after the conflict ended
2. The fate of 2-3 key NPCs the hero knew
3. The villain's ultimate fate (death, imprisonment, escape, transformation, redemption, exile, or an unresolved return)
4. The character's legacy - what songs will be sung, what statues built, or what they chose to do next
5. How the world changed because of their specific choices
6. A bittersweet final note - the ending should honor the campaign's tone. Hope can be clean, victory can cost something, defeat can leave a spark, and comedy can resolve warmly when earned

Write in second person ("You...") for an immersive final address to the player. Tone: earned, final, and matched to the campaign's actual genre. It may be triumphant, bittersweet, strange, warm, mournful, wondrous, or ominous depending on what happened.

Return plain text only. No JSON. No formatting markers.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master narrator writing the final epilogue of a genre-fluid fantasy campaign. Write beautifully. This is the last thing the player will read. Make it matter.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 800,
  });

  return response.choices[0].message.content?.trim() || 'The age ends. The stories live on.';
}
