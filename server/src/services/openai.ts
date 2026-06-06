import OpenAI from 'openai';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption, CampaignJournalEntry, CharacterHistoryEntry, Antagonist, RollContext, CharacterOnlineStatus, NpcMemory, CombatEnemy } from '../../../shared/types';
import { CLASS_ABILITIES } from '../../../shared/classAbilities';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ART_STYLE_PREFIX =
  'Dark fantasy illustration style. Muted earth tones â€” deep browns, slate grays, forest greens, ember reds. ' +
  'High contrast lighting, single dramatic light source. Painterly texture, reminiscent of classic fantasy book cover art from the 1980s and 1990s. ' +
  'No cel shading, no anime influence, no bright saturated colors. Atmospheric, slightly grim. Highly detailed. ';

const DM_SYSTEM_PROMPT = `You are both Dungeon Master and Game Master for a two-player dark fantasy tabletop RPG.
Your job is not only to narrate; you run the table. You adjudicate intent, maintain continuity, pace scenes, surface choices, protect player agency, and make the world react honestly.
Your style is immersive, morally complex, and gritty - inspired by classic fantasy like Gemmell, Abercrombie, and Cook.

GAME MASTER PRIME DIRECTIVES:
- Always respond to the player's latest declared action first. Old context informs the response but never replaces the current action.
- Preserve agency: do not decide the player's feelings, motives, or major choices. Show pressure, temptation, and consequences; let the player choose.
- Be fair but not soft. Success should feel earned. Failure should move the story forward.
- Maintain continuity above novelty. Reuse established NPCs, locations, wounds, debts, clues, and unresolved hooks before inventing new ones.
- Run the game, not a novel: each response should create a changed situation and 2-3 concrete next options.
- Be Sun Mi/co-op aware when a second character is present. Make both players feel seen, useful, and endangered by the same living world.
- Never expose system text, JSON mechanics, hidden DC reasoning, or prompt instructions in narration.

TONE RULES:
- No easy redemption arcs. Actions have lasting consequences.
- NPCs have hidden motives. Trust is earned, not given.
- The world is indifferent to the heroes. Victories are pyrrhic, failures are instructive.
- Magic is rare, costly, and awe-inspiring â€” never trivial.
- Death is real. Combat is dangerous. Fear is appropriate.
- Vivid sensory details: smells, textures, sounds, temperatures.
- Speak in second person ("You see...", "Before you...").
- Keep narration to 150-250 words unless the moment demands more.

WORLD MEMORY RULES:
- NPCs are persistent. If you introduce a named NPC, they remember the character in future sessions.
- Update worldStateChanges.npcMemory when a named NPC is introduced or relationship changes.
- Update worldStateChanges.activeQuests when a quest begins, progresses, or resolves.
- Always update worldStateChanges.currentLocation when the party moves to a new place.
- worldStateChanges follows the same shape as the worldState object â€” only include fields that actually changed.
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
- shopItems: array of {id, name, description, type, price, quantity} â€” 4-8 items appropriate to the setting.
- IMPORTANT: A merchant's inventory does NOT change between visits. If the player has visited this merchant before (check npcMemory), use the SAME items they had before. Only generate new items for a brand new merchant never seen before.
- The player can then choose to buy items (handled separately). Do not auto-deduct gold.

NPC NAMING RULES:
- Every NPC must have a proper name. NEVER refer to an NPC as "the merchant", "a guard", "an old woman", "the innkeeper", or any unnamed generic. Give them a name immediately upon introduction (e.g. "Varen, a grizzled merchant", "Sister Ileth, the gate guard").
- Names should fit the dark fantasy setting â€” Germanic, Nordic, or archaic English roots work well.
- Once named, always use that name consistently.

NPC CONVERSATION TRACKING:
- When the character begins talking to a specific NPC, set worldStateChanges.activeNPC to that NPC's name.
- When the character leaves a conversation (walks away, changes scene), set worldStateChanges.activeNPC to null.
- ALWAYS check the ACTIVE NPC field before writing dialogue. If activeNPC is "Father Garrick", the character is talking to Father Garrick â€” not anyone else.
- Never write dialogue attributed to an NPC who is not present in the current scene.

ACT PROGRESSION RULES:
- When the act climax event occurs (the one listed in DM ROADMAP), set advanceAct: true.
- The DM ROADMAP shows exactly what the act climax is. Execute it. Don't invent a different climax.
- When advancing act, write a dramatic conclusive narration that wraps the chapter â€” a "things will never be the same" moment.
- If DM ROADMAP shows âš  ACT OVERDUE or ðŸ”´ CRITICAL, you MUST trigger the climax this turn. Do not stall.

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

HIGH STAKES DETECTION â€” MANDATORY TRIGGERS:
You MUST set isHighStakes: true and generate choiceCards in these situations â€” no exceptions:
1. The character meets a named antagonist or their direct agent for the first time
2. An NPC the character has a relationship with is in danger or makes a request that costs something
3. The character discovers a major secret or revelation that changes what they thought was true
4. The character is offered a deal, alliance, or betrayal opportunity with real consequences
5. The character faces a situation where violence and non-violence are both viable but lead to very different outcomes
6. Any moment where the character must choose between personal gain and doing the right thing
7. A backstory element from the character's past directly confronts them

When isHighStakes: true:
- Generate exactly 2-3 choiceCards. Each has: title (3-5 words, action-oriented), description (1 sentence, what this choice means), consequenceHint (vague, ominous or hopeful â€” NOT a spoiler)
- Keep narration tight and tense â€” build to the choice, don't resolve it
- The choice cards replace the suggestedActions array â€” set suggestedActions to []
- DO NOT set isHighStakes for routine combat, minor decisions, or exploration without moral weight

FREQUENCY: High stakes moments should appear roughly every 6-10 actions in a normal session. If it has been more than 10 actions since the last high stakes moment, look for an opportunity to create one naturally.

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
- combat: ends on victory, escape, or death â€” do not drag it out past resolution.
- climax scenes: every exchange must escalate. No filler. No repetition.

PACING MODES â€” match your narration style to the current mode:
- exploration: patient, sensory-rich, 150-250 words, rewards curiosity
- tension: shorter punchy sentences, 100-150 words, each beat escalates something
- climax: urgent, visceral, 80-120 words, every action has weight
- resolution: slower, emotional, 150-200 words, let the moment breathe

MOMENTUM RULE â€” the most important rule:
If the scene has stalled (player is circling, nothing is changing), you MUST introduce a complication THIS turn.
Someone arrives. Something breaks. A sound from outside. The NPC reveals something unexpected. The situation changes.
NEVER let a scene stay static for more than 3 exchanges. Forward motion is your job.

SCENE EXIT SIGNALS: When a scene's purpose is complete, write a natural narrative door â€” a time-skip cue, a sensory shift, a clear opening toward the next beat. Example: "The innkeeper has told you everything he knows. The road north grows darker by the hour." Don't end mid-scene without offering a direction.

In your JSON response, always include:
- "sceneMomentum": "advancing" | "stalling" | "transitioning" â€” your honest assessment of whether this exchange moved the story
- "pacingMode": "exploration" | "tension" | "climax" | "resolution" â€” what mode you used for this response
- "scenePurpose": "explore" | "gather_info" | "combat" | "social" | "travel" | "rest" | "climax" â€” what this scene is currently about

PROACTIVE WORLD EVENTS:
- Sometimes (not always, use judgment), set proactiveEvent: true and include a worldEvent in the narration preamble â€” something the WORLD did, not the player. The antagonist advanced their plan. A faction moved. A rumor reached town. Something changed without the player causing it.

MULTI-ENEMY COMBAT RULES:
- When starting combat with multiple enemies, set combatEnemies: [{name, archetype, maxHp, condition, specialAbility}] for each enemy.
- archetype: "beast" (savage, fearless), "soldier" (tactical, coordinated), "mage" (ranged, vulnerable melee), "boss" (legendary, multi-phase), "minion" (numerous, fragile)
- Each round, return combatEnemies[] reflecting current state. When an enemy falls, set their isDefeated: true AND set enemyDefeated to their name.
- Each archetype fights differently: soldiers shield each other, mages hang back, minions rush in waves, beasts go for killing blows.
- Boss fights: set isBossFight: true on combat start. When boss condition reaches "critical", set bossPhaseAdvance: true and describe a dramatic transformation â€” the boss gets more dangerous, not less.
- Suggest actions that are class-appropriate and reference available abilities.

DICE ROLLING RULES:
- When an action requires a skill check or attack, set awaitingRoll: true instead of narrating the outcome.
- Populate rollContext with: stat (str/dex/con/int/wis/cha), dc (difficulty 8-25), diceType (almost always "d20"), description (what the player is attempting), successDescription (evocative hint at success, not a spoiler), failDescription (evocative hint at failure), isDramatic (true for high-stakes moments: saving throws vs death, critical attacks, unlocking the final door).
- When awaitingRoll: true, write a short tense setup narration (50-80 words) that builds to the roll â€” DO NOT resolve the outcome.
- When awaitingRoll is true, diceRequired must be false and suggestedActions must be []. The roll modal is the next player interaction.
- Call for rolls more often: any attack, stealth attempt, persuasion, lock picking, climbing, knowledge check, saving throw.
- modifier: include the current visible stat modifier as a display hint only. The server recalculates the true modifier from saved character stats before resolving the roll.
- DC CALIBRATION: Easy tasks DC 8-10, moderate DC 12-14, hard DC 16-18, very hard DC 20-22, near-impossible DC 24-25. Think about what PARTIAL SUCCESS looks like for every roll you set â€” what happens when the player beats the DC by only 1-2? That partial success state is as important as the clean success.

DEGREES OF SUCCESS (used by the roll outcome narrator):
- Nat 1 (critical failure): Something goes dramatically wrong beyond just failing â€” a new complication, a broken item, an enemy emboldened, a secret exposed.
- Miss by 4+ (clear failure): Direct consequence, no ambiguity. The door stays locked, the guard is suspicious, the ledge crumbles. Something closes off.
- Miss by 1-3 (near miss): "Almost" â€” a minor setback or complication, not the full failure consequence. You slip but catch yourself. The lie almost holds. Partial information, partial progress.
- Beat DC by 1-3 (partial success): You do it, but with a cost or complication attached. The door opens but you make noise. You persuade them but they want something in return. You land the hit but expose yourself.
- Beat DC by 4+ (clean success): Exactly what you attempted, cleanly executed. No asterisks.
- Nat 20 (critical success): You exceed expectations dramatically â€” a bonus effect beyond the task itself. The enemy is not just hit but off-balance. The persuasion doesn't just succeed, they become an ally. The lock opens and you spot the trap behind it.

ITEM RULES:
- Items in the character's inventory are story hooks and tools. Build situations where they become relevant.
- Named/unique items (keys, orbs, runes, letters) MUST eventually have a purpose built around them.
- Consumable items (potions, scrolls, food, torches) get removed from inventory when used â€” set characterChanges.inventory to reflect this.
- Item durability matters: on a critical failure (roll of 1), fragile items break and are removed from inventory. Normal items have a small chance. Sturdy and indestructible items never break.
- When a character uses a weapon, reference its damage type. When they use a potion, describe the specific effect.
- Arrows and bolts deplete with use.

ABILITY SYSTEM RULES:
- CHARACTER ABILITIES are listed in the world context with their exact mechanical effects.
- Use available abilities proactively when it makes narrative sense â€” don't wait for the player to ask.
- When you use an ability, set "abilityUsed" to the exact ability name so the cooldown is tracked.
- NEVER use an ability marked [ON COOLDOWN]. It is not available.
- Apply the mechanic description exactly â€” set the appropriate hpChange, statusEffectChanges, etc.
- When the character rests (sleeps, takes a short rest, camps), set "isRest": true to reset cooldowns.

ENDGAME RULES:
- When endgamePhase is "approaching": the villain's plan is nearly complete. Start converging all plotlines. Urgency increases. Begin weaving backstory hooks toward their payoff. Set pacing to "tension" or "climax". Suggest actions that drive toward the final confrontation.
- When endgamePhase is "confrontation": THIS IS THE FINAL BATTLE. No escape. Every action has ultimate weight. Make the villain feel overwhelming but beatable. After the player wins (isVictory: true), set "endgameResolved": true.
- When the story naturally builds to the final confrontation (villain is revealed, final location reached, all threads converging), set "triggerFinalConfrontation": true.

BACKSTORY INTEGRATION:
- The character's backstory is their history before the campaign. It is true and established.
- NPCs from the character's past can appear. Enemies they made before. People they loved. Places they fled.
- The backstory should surface organically â€” not all at once, but in moments: a face in a crowd, a name on a wanted poster, a reaction from an NPC who recognizes them.
- When the backstory mentions a specific person, place, or event â€” those are seeds. Plant them. Pay them off.
- The character's motivation in the backstory should inform how NPCs approach them and what temptations the DM creates.
- Never summarize the backstory back to the player. Show it through the world's reaction to them.

SPOTLIGHT RULES (co-op only):
- Track which character has had more "hero moments" â€” scenes built around their abilities, backstory, or choices.
- If one character has had 3+ consecutive moments where they drove the story, build the next scene around the OTHER character.
- A spotlight moment means: this character's specific backstory, ability, or personal choice was what mattered here.
- Set spotlightCharacterId in response to the characterId you're spotlighting this turn (only when intentional).

MYSTERY LAYER RULES:
- The campaign has a CENTRAL MYSTERY defined in the world bible. Players should feel like investigators.
- Drop ONE mystery clue every 3-4 actions. Never more than one per action. Never drop the answer directly.
- Each clue should raise new questions even as it answers small ones.
- Red herrings should feel meaningful when discovered but lead to dead ends.
- When the revelation is ready (Act 3), build to it â€” the players should feel "of course" not "what?"

FAILURE RULES:
- Failure is a story accelerant, not a punishment. Never let failure just hurt and stop.
- When a check fails: something ELSE happens. The door didn't open â€” but the guard heard the noise. The persuasion failed â€” but the NPC revealed something in their anger.
- On critical failure: something changes dramatically. A new threat emerges. A secret is exposed. The situation escalates.
- The question after failure is never "nothing happened" â€” it's "what happened INSTEAD."

SAFE HAVEN RULES:
- The campaign has a safe haven. Reference it. NPCs there know the characters by name.
- When characters rest or need a quiet moment, scenes at the safe haven are where relationships develop naturally.
- The safe haven's key NPC should have a running personality â€” familiar, slightly odd, genuinely fond of the characters.
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
- In your response, "scenePurpose" should vary across sessions â€” not just "combat" over and over.

DIRECTOR BEAT:
- If PENDING DIRECTOR BEAT is set in the context, you MUST execute that beat this turn or next turn.
- This is a campaign health directive from a higher system. It overrides your local scene preferences.
- After executing it, set "directorBeatExecuted": true in your response.

RACE & CLASS AWARENESS:
Every character's race and class should influence how the world treats them and what narrative opportunities arise. Apply these consistently â€” not as constant reminders, but as the background texture of NPC reactions and scene framing.

RACES â€” NPC reactions and narrative hooks:
- Human: NPCs treat humans as the default, for better and worse. Factions recruit them aggressively. Ambition is respected and also exploited. Lean into political intrigue, alliances of convenience, and the tension between short lifespans and long-term legacies.
- Elf: Other races react with a mixture of reverence and unease â€” they know an elf has seen things they haven't. Lean into ancient lore hooks: ruins that predate the current civilization, names the elf recognizes from history, old grudges still alive in elven memory. The elf's emotional restraint reads as coldness to some, wisdom to others.
- Dwarf: Dwarves command respect from hard-working folk and suspicion from those who deal in deception. Lean into clan honor, old debts, and underground threats. A dwarf's word is binding â€” NPCs know this and test it. Grudges from generations past surface at inconvenient moments.
- Halfling: The world underestimates halflings consistently. This is a gift and an irritant. Common folk trust halflings instinctively; nobles dismiss them until it is too late. Lean into moments of pleasant surprise â€” the halfling who talked their way past the gate, found the hidden passage, or survived by being precisely the kind of threat nobody planned for.
- Gnome: Gnomes attract curiosity from scholars and paranoia from the superstitious. Their arcane sensitivity means they notice magical details others miss â€” treat this as a narrative advantage. Their eccentricity occasionally gets them into trouble with those who mistake enthusiasm for madness.
- Half-Orc: The world reacts to a Half-Orc's physical presence first and personality second. Guards are wary. Bullies step back. Hardened soldiers take note. Lean into the tension between reputation and reality â€” moments where the Half-Orc's choice to show mercy or restraint lands harder because nobody expected it. Their toughness is respected by those who earn it.
- Tiefling: Default NPC disposition is wary to hostile until trust is explicitly earned. Priests may refuse service. Children may point or whisper. Lean into social friction as dramatic fuel â€” offer the Tiefling moments to reclaim their dignity, shut down bigotry with precision, or weaponize others' fear of them. Their infernal heritage occasionally draws attention from dark powers that see it as a calling card.
- Dragonborn: Dragonborn command attention by walking into a room. Dragon-affiliated cults, ancient orders, and tribal warriors treat them with heightened interest. Their heritage opens doors in places connected to draconic history â€” and marks them as targets for those who collect draconic trophies. Honor challenges are issued to Dragonborn first. Their defeats are witnessed. Their victories are remembered.

CLASSES â€” narrative moments to spotlight and opportunities to create:
- Fighter: Spotlight tactical decision-making and battlefield control. Issue formal challenges and duels. Enemies coordinate to bring them down â€” Fighters are identified as the greatest physical threat. Honor-focused factions respect their martial dedication. Off-combat moments: old war contacts, veterans who recognize their technique, commanders who want to recruit them.
- Wizard: Seed arcane puzzles, hidden glyphs, and magical anomalies that reward their knowledge. Sages seek them out for consultation. Enemy mages treat them as priority targets. Lean into the tension between academic understanding of magic and its terrifying reality in the field. Ancient tomes are plot hooks. Magical catastrophes have history they can read.
- Rogue: Always narrate stealth opportunities â€” even if the player doesn't take them, the option should feel present. In social situations, describe what a sharp eye catches: the nervous tic, the hidden blade, the inconsistency in the story. When Sneak Attack fires, describe the exact moment of vulnerability exploited â€” make it feel earned. Crime networks and black markets are more accessible. NPCs who have secrets watch a Rogue very carefully.
- Cleric: Divine resonance: occasionally have their god acknowledge their service â€” a warmth in a holy symbol, a prayer answered with uncanny timing, a moment that feels touched. NPCs in spiritual distress are drawn to them. Undead and dark powers react to their divine presence. Lean into tests of faith â€” moments where their god seems absent, or where following their divine mandate costs something real. Other clergy are potential allies or rivals.
- Ranger: The natural world is alive and communicative for a Ranger. Animals behave differently â€” birds fall silent when something dangerous is near, and the Ranger notices. Tracks, scents, signs of passage that others miss are highlighted in narration. Wilderness threats feel navigable rather than fatal. Quarry cannot hide long. In cities, the Ranger's discomfort is a texture â€” too many smells, too many people, exits always noted.
- Paladin: Create moral dilemmas with no clean answer and make them land directly on the Paladin's oath. Their oath matters â€” when tempted to break it, make the temptation feel genuinely compelling, not cartoonish. Divine moments: occasionally have their god acknowledge their service when they uphold the oath at personal cost. Conversely, when they compromise their principles, let the silence speak. Undead and fiends react to their divine aura. Former enemies sometimes come to them for absolution.
- Barbarian: Violence respects violence. Tribal warriors issue challenges. Mercenary captains want to recruit or test them. Rage should feel like a narrative event â€” describe its onset and its aftermath. Lean into the primal vs. civilized tension: Barbarians in formal social settings, Barbarians choosing restraint. Their sheer endurance becomes a story element â€” enemies learn quickly that putting them down requires something extraordinary.
- Bard: Reward social creativity generously. The right words change the outcome of scenes â€” let the Bard feel this. NPCs remember them by name. Rumors they've spread come back to them. Performances leave traces in the world. Lean into information gathering as a class fantasy â€” a Bard who works a tavern right knows everything by morning. Their inspiration creates actual narrative moments for the characters who receive it.
- Druid: The natural world is not backdrop â€” it is a character. Corruption of nature is personal to a Druid. Spirits and ancient presences react to their presence in sacred places. Lean into transformation as a narrative tool beyond combat â€” a Druid can listen to a river, speak to a raven, feel the wrongness in poisoned soil. Civilization vs. nature tension is their permanent texture. Their magic feels older and stranger than other spellcasters'.
- Monk: Their stillness in chaos reads as unnerving. Enemies who expect panic find calm. Spiritual challenges and tests of will arrive more frequently â€” their discipline is a magnet for such trials. Lean into precision over power: a Monk's victories often come from seeing the moment and taking it, not from overwhelming force. Their self-sufficiency means they notice when they're being relied upon. Monasteries, martial orders, and those who respect discipline treat them with specific recognition.
- Sorcerer: Magic reacts to them in ways it doesn't react to Wizards â€” ambient arcane phenomena, wild resonances, other magic-users sensing their bloodline. Lean into the cost-that-wasn't-chosen: their power is extraordinary and not entirely under control. Other spellcasters are fascinated, envious, or frightened. Ancient bloodlines open old doors and attract old attention. When their magic goes sideways, it goes sideways dramatically.
- Warlock: The patron is a presence in the story. Their influence is felt in the margin â€” a whispered suggestion, a dream that feels directed, a moment when the power surges because the patron approved. Lean into the price of the deal: demands arrive at inconvenient times, and the Warlock must decide how much to comply. NPCs who are spiritually sensitive sense something wrong about them. Former allies of the patron may recognize the mark and have opinions. The deal's full terms were never spelled out â€” discover them as you go.

CO-OP NARRATION RULES (only applies when two characters act simultaneously):
- Both characters are present in the same scene. Address each by name.
- Weave their actions together â€” one's action creates opportunity or complication for the other.
- Make them feel like a team. Their combined effort should be more interesting than either alone.
- Apply mechanical changes independently: use character1Changes for Character 1, character2Changes for Character 2.
- Write as if you are a DM running a real table with two players side by side.
- Narration length: 200-300 words to give both characters adequate presence.

RESPONSE FORMAT: Always respond with valid JSON matching this schema:
{
  "narration": "string â€” the story text the player sees",
  "diceRequired": false,
  "diceType": null,
  "diceDC": null,
  "diceDescription": null,
  "worldStateChanges": object | null,
  "suggestedActions": ["2-3 concrete player actions; use [] if awaitingRoll or isHighStakes"],
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
  "sessionNote": "string â€” one sentence summary of what happened, added to DM notes" | null,
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
    ? `\nâš  UNUSUAL COMBO: ${character.race} ${character.class} â€” the DM may acknowledge this in-world with subtle reactions from NPCs.`
    : '';

  // Build abilities block â€” include mechanic so AI enforces actual numbers
  const knownAbilities = character.abilities || [];
  let abilitiesBlock = '';
  if (knownAbilities.length > 0) {
    const available = knownAbilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0);
    const onCooldown = knownAbilities.filter(a => a.currentCooldown && a.currentCooldown > 0);
    abilitiesBlock = `
â”â”â” CHARACTER ABILITIES â”â”â”
AVAILABLE (apply mechanic exactly when used):
${available.length > 0 ? available.map(a => `- ${a.name}: ${a.description}${a.mechanic ? `\n  MECHANIC: ${a.mechanic}` : ''}`).join('\n') : '(none available)'}
ON COOLDOWN (cannot use):
${onCooldown.length > 0 ? onCooldown.map(a => `- ${a.name} [ON COOLDOWN]`).join('\n') : '(none on cooldown)'}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
  } else {
    const classAbilityMap = CLASS_ABILITIES[character.class] || {};
    const allAbilityNames = Object.values(classAbilityMap).map(a => a.name);
    abilitiesBlock = `No special abilities yet (class abilities to come: ${allAbilityNames.slice(0, 2).join(', ')}, ...)`;
  }

  // Build stat context
  const s = character.stats;
  const statHints = [
    s.str >= 15 ? `STR ${s.str} â†’ can force doors, break obstacles, intimidate physically` : s.str <= 8 ? `STR ${s.str} â†’ avoid purely physical brute-force options` : null,
    s.dex >= 15 ? `DEX ${s.dex} â†’ can sneak, pick locks, acrobatics` : null,
    s.int >= 15 ? `INT ${s.int} â†’ can recall lore, solve puzzles, identify magic` : s.int <= 8 ? `INT ${s.int} â†’ avoid complex lore options in suggestedActions` : null,
    s.wis >= 15 ? `WIS ${s.wis} â†’ perceptive, reads people well` : null,
    s.cha >= 15 ? `CHA ${s.cha} â†’ can persuade, deceive, perform, intimidate socially` : s.cha <= 8 ? `CHA ${s.cha} â†’ avoid diplomacy/charm options in suggestedActions` : null,
  ].filter(Boolean).join('; ');

  // Build NPC memory context â€” key NPCs always shown, then rolling recent NPCs
  const keyNPCs = campaignContext?.keyNPCs || [];
  const keyNpcNames = new Set(keyNPCs.map(n => n.name));
  const rollingNPCs = (worldState.npcMemory || []).filter(n => !keyNpcNames.has(n.name));

  const keyNpcContext = keyNPCs.length > 0
    ? `\nâ”â”â” KEY NPCs (important â€” always remember these) â”â”â”\n${keyNPCs.map(n => `- ${n.name} [${n.disposition}] â˜…: ${n.notes}`).join('\n')}`
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
          `  ${e.isDefeated ? 'âœ— DEFEATED' : 'â–¶'} ${e.name} [${e.archetype.toUpperCase()}] â€” ${e.condition.toUpperCase()}${e.specialAbility ? ` | ${e.specialAbility}` : ''}`
        ).join('\n')
      : `  ${combatState.enemyName} â€” ${combatState.enemyCondition.toUpperCase()}`;
    const bossLine = combatState.isBossFight
      ? `\nBOSS FIGHT â€” Phase ${combatState.bossPhase || 1}. When boss reaches critical, advance to next phase (set bossPhaseAdvance: true). Each phase changes the boss's tactics and appearance dramatically.`
      : '';
    combatBlock = `
â”â”â” ACTIVE COMBAT â”â”â”
Round: ${combatState.roundNumber} | Player HP: ${character.hp}/${character.max_hp}
ENEMIES:
${enemyLines}${bossLine}
ACTIONS ALREADY TRIED: ${combatState.playerActionsAttempted.slice(-5).join(', ') || 'none yet'}
RULES: Maintain enemy continuity â€” they remember every action. When an enemy is defeated, set enemyDefeated to their name. Set combatEnemies[] in every response to reflect current state.
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
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
â”â”â” PACING DIRECTIVE â”â”â”
Scene purpose: ${sceneState?.purpose || 'explore'} | Exchanges in scene: ${sceneState?.exchangeCount ?? 0} | Pacing mode: ${autoPackingMode.toUpperCase()}${sceneState && sceneState.stalledCount >= 2 ? `
âš  STALL DETECTED (${sceneState.stalledCount} consecutive exchanges without story advancement)${forceComplication ? '\nðŸ”´ FORCE COMPLICATION THIS TURN â€” something must change RIGHT NOW. Introduce an interruption, revelation, or threat. Do not let the scene continue as-is.' : ' â€” consider introducing a complication.'}` : ''}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;

  // Endgame block
  const endgamePhase = worldState.endgamePhase;
  let endgameBlock = '';
  if (endgamePhase && endgamePhase !== 'none') {
    if (endgamePhase === 'approaching') {
      endgameBlock = `\nâ”â”â” ENDGAME PHASE: APPROACHING â”â”â”
The villain's plan is nearly complete. All plotlines must converge NOW. Urgency is maximal.
Weave backstory hooks toward their payoff. Set pacingMode to "tension" or "climax".
Every suggested action should drive toward the final confrontation.
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
    } else if (endgamePhase === 'confrontation') {
      endgameBlock = `\nâ”â”â” ENDGAME PHASE: CONFRONTATION â”â”â”
THIS IS THE FINAL BATTLE. No escape. No retreat. Every action carries ultimate weight.
Make the villain feel overwhelming but beatable. The fate of everything hangs here.
After the player achieves victory (isVictory: true), set "endgameResolved": true.
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
    }
  }

  const worldContext = `
WORLD BIBLE:
- Era: ${worldBible.era} | Magic: ${worldBible.magicSystem}
- Factions: ${worldBible.factions.map(f => f.name).join(', ')}
- Tone: ${worldBible.toneRules.slice(0, 2).join('; ')}
${worldBible.mysteryLayer ? `
â”â”â” THE CENTRAL MYSTERY â”â”â”
Question players are investigating: ${worldBible.mysteryLayer.centralQuestion}
Clues (drop ONE per 3-4 actions, in order):
${worldBible.mysteryLayer.clues.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
Red herrings (feel real, lead nowhere):
${worldBible.mysteryLayer.redHerrings.map(r => `  - ${r}`).join('\n')}
Revelation (DO NOT reveal directly â€” build to it in Act 3): ${worldBible.mysteryLayer.revelation}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”` : ''}
${worldBible.safeHaven ? `SAFE HAVEN: ${worldBible.safeHaven.name} â€” ${worldBible.safeHaven.flavor}. Kept by ${worldBible.safeHaven.keyNPC}.` : ''}
${worldBible.toneBreaks && worldBible.toneBreaks.length > 0 ? `TONAL CONTRAST MOMENTS: ${worldBible.toneBreaks.join(' | ')}` : ''}

WORLD STATE:
- Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
- Discovered: ${(worldState.discoveredLocations || []).slice(0, 5).join(', ') || 'none yet'}
- ACTIVE NPC: ${worldState.activeNPC || 'none â€” character is not in conversation with anyone specific'}
- Actions since last high-stakes moment: ${worldState.actionCount ? (worldState.actionCount - (worldState.lastHighStakesAction || 0)) : 'unknown'}
${keyNpcContext}${npcContext}${questContext}

CHARACTER: ${character.name} | HP: ${character.hp}/${character.max_hp} | LOCATION: ${worldState.currentLocation || 'Unknown'}
CLASS: ${character.class} | RACE: ${character.race} | LEVEL: ${character.level}${unusualNote}
Gold: ${character.gold}
BACKSTORY: ${character.backstory || 'Unknown origins'}
${character.status_effects && character.status_effects.length > 0 ? `ACTIVE STATUS EFFECTS: ${character.status_effects.map(e => `${e.name} (${e.type})`).join(', ')} â€” these affect what the character can do.` : ''}
Notable inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
STAT CONTEXT (factor into suggestedActions): ${statHints || 'balanced stats'}
${abilitiesBlock}
${endgameBlock}

${campaignContext ? `CAMPAIGN: Act ${campaignContext.act} | ${campaignContext.centralConflict}
JOURNAL: ${campaignContext.journal.slice(-3).map(j => `[Act ${j.actNumber}] ${j.summary}`).join(' | ') || 'none yet'}
HISTORY: ${campaignContext.characterHistory.slice(-5).map(h => `${h.description} â†’ ${h.impact}`).join(' | ') || 'none'}
ANTAGONISTS: ${campaignContext.antagonists.map(a => `${a.isRevealed ? a.name : '[UNKNOWN]'}: ${a.agenda}`).join(' | ') || 'none'}
NARRATIVE TIER: ${campaignContext.act <= 1 && character.level <= 3 ? 'EMERGING â€” local stakes' : character.level <= 6 ? 'KNOWN â€” regional threats' : character.level <= 10 ? 'FEARED â€” major powers react' : 'LEGENDARY'}` : ''}

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
        return `  ${appeared ? '[âœ“ appeared]' : '[âœ— NOT YET]'} ${item}`;
      }).join('\n')}\n`
    : '';

  // Escalating urgency based on actions in current act
  let urgency = '';
  if (actionsInAct >= 30) {
    urgency = `\nðŸ”´ CRITICAL ACT OVERRUN: Act ${actNum} has run ${actionsInAct} actions â€” FAR too long. The act climax must happen THIS turn or the next. Do not delay. Execute: "${climaxEvent}" NOW.`;
  } else if (actionsInAct >= 20) {
    urgency = `\nâš  ACT OVERDUE: ${actionsInAct} actions in Act ${actNum} â€” the climax is overdue. Begin converging all threads toward: "${climaxEvent}" within the next 3 actions.`;
  } else if (actionsInAct >= 12) {
    urgency = `\nðŸ“ Act ${actNum} is mature (${actionsInAct} actions). Start steering toward the climax: "${climaxEvent}". Unresolved goals and hooks must begin paying off.`;
  }

  return `â”â”â” DM ROADMAP â”â”â”
Act ${actNum} goals (steer the story toward these):
${goals.map(g => `  ${(campaignContext.actGoalsAchieved || []).includes(g) ? '[âœ“ DONE]' : '[ ]'} ${g}`).join('\n')}
${mustIntro}Act ${actNum} climax (this MUST happen before act ends): ${climaxEvent}${actNum === 2 && campaignContext.roadmap.act2VillainEscalation ? `\nAct 2 villain escalation (make this real): ${campaignContext.roadmap.act2VillainEscalation}` : ''}${urgency}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
})() : ''}

${campaignContext?.foreshadowingLedger && campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').length > 0 ? `â”â”â” FORESHADOWING LEDGER â”â”â”
PLANTED â€” pay these off when dramatically right:
${campaignContext.foreshadowingLedger.filter(f => f.payoffStatus !== 'paid_off').slice(0, 8).map(f => `  [${f.type.toUpperCase()}] ${f.description}`).join('\n')}
When you introduce something new that should echo later, include it in newForeshadowing[].
When you pay off a planted item, include its id in paidOffForeshadowing[].
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”` : ''}

${campaignContext?.backstoryHooks && campaignContext.backstoryHooks.filter(h => h.status !== 'resolved').length > 0 ? (() => {
  const actNum = campaignContext.act;
  const actionsInAct = campaignContext.actionsInCurrentAct || 0;
  const dormant = campaignContext.backstoryHooks!.filter(h => h.status === 'dormant');
  const active = campaignContext.backstoryHooks!.filter(h => h.status === 'active');
  const activeUrgency = active.length > 0 && actionsInAct >= 8
    ? `\nðŸŽ¯ ACTIVE hooks MUST be developed this act â€” they've been seeded, now escalate them toward payoff.`
    : '';
  const dormantUrgency = dormant.length > 0 && actionsInAct >= 15
    ? `\nâš  DORMANT hooks are overdue â€” seed at least one of them into the story NOW.`
    : '';
  return `â”â”â” BACKSTORY HOOKS â”â”â”
${active.length > 0 ? `ACTIVE (seeded â€” escalate toward payoff):\n${active.map(h => `  â–¶ [${h.characterName}] ${h.hook}`).join('\n')}\n` : ''}${dormant.length > 0 ? `DORMANT (not yet introduced â€” seed these):\n${dormant.map(h => `  â—‹ [${h.characterName}] ${h.hook}`).join('\n')}\n` : ''}Dormant = not yet seeded. Set backstoryHookActivated to characterId when seeding one.${activeUrgency}${dormantUrgency}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
})() : ''}

${campaignContext?.futureHooks && campaignContext.futureHooks.length > 0 ? `
FUTURE HOOKS TO HONOR (past choices with pending repercussions â€” bring these back):
${campaignContext.futureHooks.slice(-5).map(h => `- ${h.description}`).join('\n')}` : ''}

${campaignContext?.pendingDirectorBeat ? `
â”â”â” PENDING DIRECTOR BEAT â”â”â”
URGENCY: ${campaignContext.pendingDirectorBeat.urgency.toUpperCase()}
MANDATORY BEAT: ${campaignContext.pendingDirectorBeat.beat}
You MUST execute this beat this turn or next turn. Set directorBeatExecuted:true when done.
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”` : ''}

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
â”â”â” PLAYER ACTION NOW â”â”â”
CHARACTER: ${character.name} | HP: ${character.hp}/${character.max_hp} | LOCATION: ${worldState.currentLocation || 'Unknown'}
ACTION: ${action}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

IMPORTANT: Respond directly to THIS action. Do not ignore it or jump to older context. Update worldStateChanges.npcMemory for named NPCs. Update worldStateChanges.activeQuests for quest events. Update worldStateChanges.currentLocation if moving.

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
  const actions = cleanStringArray(value, 3);
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
    : ['Look closer', 'Speak carefully', 'Move forward'];

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
${worldState.combatState?.inCombat ? `IN COMBAT: ${worldState.combatState.enemyName} (${worldState.combatState.enemyCondition}) â€” Round ${worldState.combatState.roundNumber}` : ''}
${worldState.activeQuests && worldState.activeQuests.filter(q => q.status === 'active').length > 0 ? `Active quests: ${worldState.activeQuests.filter(q => q.status === 'active').map(q => q.title).join(', ')}` : ''}

${charBlock(c1, 'CHARACTER 1')}

${charBlock(c2, 'CHARACTER 2')}

RECENT HISTORY:
${recentHistory.slice(-6).join('\n')}

CHARACTER 1 (${c1.name}) ACTION: ${a1.action}
CHARACTER 2 (${c2.name}) ACTION: ${a2.action}
${spotlightDirective ? `\n${spotlightDirective}` : ''}
Write ONE unified narration (200-300 words) weaving both actions together. Apply the CO-OP NARRATION RULES.

Respond with JSON:
{
  "narration": "string â€” unified narration addressing both characters",
  "worldStateChanges": object | null,
  "suggestedActions": ["2-3 concrete player actions; use [] if awaitingRoll or isHighStakes"],
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
    crit_fail: 'CRITICAL FAILURE: Something goes dramatically wrong beyond just failing. A new complication emerges â€” a weapon drops, a secret is exposed, an enemy is emboldened, the situation escalates into something worse.',
    clear_fail: 'CLEAR FAILURE: Direct consequence, no ambiguity. A door closed, a suspicion confirmed, a resource spent for nothing. Don\'t soften it â€” but also have something happen AS a result of failing, not just absence of success.',
    near_miss: 'NEAR MISS: "Almost" â€” the player nearly had it. A minor setback or complication, not the full failure consequence. They slip but catch themselves. The lie almost holds. Partial information, partial progress. The story continues â€” just slightly worse.',
    partial_success: 'PARTIAL SUCCESS: They do it, but with a cost or complication. The door opens but they made noise. The persuasion works but the NPC wants something in return. The attack lands but leaves them exposed. Yes, AND something costs them.',
    clean_success: 'CLEAN SUCCESS: Exactly what was attempted, cleanly executed. No asterisks, no complications. A moment of competence. Let it feel good.',
    crit_success: 'CRITICAL SUCCESS: Exceed expectations dramatically. The task is accomplished AND something extra happens â€” an enemy is off-balance, a new opportunity appears, an ally is inspired, a bonus is earned. This is a highlight moment.',
  };

  const prompt = `You are a DM resolving the outcome of a dice roll.
The player attempted: ${rollContext.description}
They rolled ${rollResult} + ${rollTotal - rollResult} (${rollContext.stat.toUpperCase()} modifier) = ${rollTotal} vs DC ${dc} â€” ${resultLabel}.
Flavor hint for this outcome: "${flavorHint}"

DEGREE OF SUCCESS DIRECTIVE:
${degreeGuidance[degree]}

Character: ${character.name} (${character.race} ${character.class}, Level ${character.level})
HP: ${character.hp}/${character.max_hp} | Location: ${worldState.currentLocation || 'unknown'}
Recent history:
${recentHistory.slice(-4).join('\n')}

Write vivid outcome narration (100-150 words) that precisely matches the ${resultLabel} degree.
The near miss and partial success cases are the most narratively rich â€” use them to keep the story moving with texture rather than just pass/fail.

Respond with JSON:
{
  "narration": "string",
  "worldStateChanges": object | null,
  "hpChange": number | null,
  "goldChange": number | null,
  "suggestedActions": ["2-3 concrete next actions after this roll outcome"],
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
    narration: asString(parsed.narration) || 'The outcome unfolds...',
    worldStateChanges: asRecord(parsed.worldStateChanges) as Partial<WorldState> | undefined,
    hpChange: clampNumber(parsed.hpChange, -1000, 1000),
    goldChange: clampNumber(parsed.goldChange, -10000, 10000),
    suggestedActions: cleanSuggestedActions(parsed.suggestedActions, ['Take stock', 'Press forward', 'Change tactics']),
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
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  });

  const url = response.data?.[0]?.url;
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
Be specific â€” name people, places, grudges, losses, secrets.

Return JSON:
{
  "hooks": [
    {
      "hook": "Specific 1-2 sentence hook that ties backstory to the main conflict. E.g: 'Elarion's murdered mentor was killed by agents of the Shadow Court â€” the same faction now serving the primary antagonist.'",
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
      content: 'You are a DM narrating what the villain did while the hero was away. Write in second person. Be atmospheric and ominous. 2-4 sentences max. The players did NOT cause this â€” the world moved without them. Respond with valid JSON only.',
    }, {
      role: 'user',
      content: `The villain has made a move while the hero was away.

Antagonist: ${antagonist?.isRevealed ? antagonist.name : '[Unknown Force]'}
Current plan step: ${currentStep}
Act: ${actNumber}
${actNumber === 2 && roadmap ? `Act 2 escalation: ${roadmap.act2VillainEscalation}` : ''}
World state: ${worldState.currentLocation || 'unknown location'}, ${worldState.timeOfDay || 'unknown time'}
Central conflict: ${worldBible.centralConflict}

Write a short atmospheric narration of what the villain did â€” something the hero discovers or hears about when they return. It should feel ominous and advance the threat. Do NOT name the villain if isRevealed is false.

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
  playerPreferences?: {
    playMode?: 'solo' | 'collaborative';
    partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now';
    tone?: string;
    favoritePillars?: string[];
    playerCount?: number;
    targetPlayerCount?: number;
    waitForParty?: boolean;
    characterConcepts?: string[];
  }
): Promise<WorldBible> {
  const prefContext = playerPreferences ? `
PLAYER PREFERENCES (use these to tailor the campaign):
${playerPreferences.playMode ? `- Human play mode: ${playerPreferences.playMode}. Solo means one human player; collaborative means real human party members may join.` : ''}
${playerPreferences.partyIntent ? `- Party setup intent: ${playerPreferences.partyIntent}. If collaborative, prepare shared spotlight moments and invite-friendly hooks. If solo_ai_companions, leave room for AI companions but do not assume they already exist.` : ''}
${playerPreferences.tone ? `- Desired tone: ${playerPreferences.tone} â€” let this calibrate the toneRules and overall feel.` : ''}
${playerPreferences.favoritePillars?.length ? `- What they love most: ${playerPreferences.favoritePillars.join(', ')} â€” weight spotlightDesign.encounterCurve and suggested encounters toward these.` : ''}
${playerPreferences.playerCount ? `- Party size: ${playerPreferences.playerCount} players â€” scale the safeHaven, spotlightDesign.sharedMoments, and encounter difficulty accordingly.` : ''}
${playerPreferences.targetPlayerCount && playerPreferences.targetPlayerCount !== playerPreferences.playerCount ? `- Target party size after invites: ${playerPreferences.targetPlayerCount}. Start playable now, but design the campaign so new companions can join naturally.` : ''}
${typeof playerPreferences.waitForParty === 'boolean' ? `- Wait-for-party preference: ${playerPreferences.waitForParty ? 'the host expects to gather the party before starting' : 'the host may start now and invite others later'}.` : ''}
${playerPreferences.characterConcepts?.length ? `- Character concepts and backstories: ${playerPreferences.characterConcepts.join('; ')} â€” These character concepts and backstories are CANON. Build NPCs, factions, and opening hooks that directly reference what these characters care about, fear, or are running from. At least one faction or NPC in the world should have a direct tie to one of these character backstories. Use these to make campaignBrief.motivation personal, personalMotivation of the lieutenant feel relevant, and shape backstory hooks.` : ''}
` : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a master adventure designer creating a FULL CAMPAIGN DESIGN â€” not just a world setting. This is a complete adventure package: mystery, antagonists, emotional hooks, tonal contrast, safe haven, player spotlights, and a DM roadmap. Every field must be specific to THIS premise, not generic. Make it memorable. Respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `Design a complete dark fantasy campaign for this premise: "${storySeed}"
${prefContext}
Return JSON matching this exact schema. Every field must be substantive and specific to the premise â€” no placeholder text:

{
  "era": "Name of the age â€” something evocative, not just 'The Dark Age'",
  "magicSystem": "2-3 sentences on how magic works â€” its cost, rarity, and what makes it distinctive to this world",
  "geography": [
    {"name": "place name", "description": "2 sentences â€” what it looks and feels like", "type": "city|region|dungeon|wilderness|landmark"}
  ],
  "pantheon": [
    {"name": "god name", "domain": "domain", "alignment": "alignment", "conflict": "their specific conflict with another deity or mortal power"}
  ],
  "toneRules": [
    "rule 1 â€” specific to this premise, not generic dark fantasy",
    "rule 2",
    "rule 3",
    "rule 4"
  ],
  "forbiddenLoreHooks": ["mystery 1 â€” something disturbing about this world's history", "mystery 2", "mystery 3", "mystery 4"],
  "factions": [
    {"name": "faction name", "publicFace": "what they claim to be â€” their public reputation", "secretAgenda": "what they actually want â€” specific and surprising", "power": "weak|moderate|strong"}
  ],
  "primaryAntagonist": {
    "name": "A cryptic title or name (not their true name yet)",
    "trueName": "Their real name â€” kept secret until Act 3",
    "type": "primary",
    "agenda": "Their goal in 1-2 sentences â€” concrete and specific, vague enough to remain mysterious",
    "currentStep": "The specific step of their plan currently underway â€” what they are doing RIGHT NOW",
    "planSteps": ["step 1", "step 2", "step 3", "step 4", "step 5 â€” the completion of their goal"],
    "whatTheyKnow": "Nothing yet â€” the players are unknown to them",
    "isRevealed": false,
    "power": "legendary",
    "allies": ["ally faction or specific named person 1", "ally faction or specific named person 2"],
    "weaknesses": ["specific weakness 1 â€” something the players could discover and use", "specific weakness 2"]
  },
  "lieutenant": {
    "name": "Their name â€” someone the players will meet before knowing they're the villain's lieutenant",
    "trueName": "Same as name (lieutenants are not secret in the same way)",
    "type": "secondary",
    "agenda": "Their stated or apparent goal â€” what they seem to be pursuing",
    "currentStep": "What they are actively doing right now in the story",
    "planSteps": ["step 1", "step 2", "step 3"],
    "whatTheyKnow": "What they know about the primary antagonist's plan",
    "isRevealed": false,
    "power": "major",
    "allies": ["their personal allies, separate from the primary antagonist's"],
    "weaknesses": ["their specific vulnerability"],
    "tieToVillain": "1 sentence â€” how they are connected to the primary antagonist and why they serve",
    "firstAppearanceHint": "What the players first notice about this person before realizing they're the lieutenant â€” describe a scene or interaction",
    "personalMotivation": "What THEY want, independent of the villain â€” they're not just a lackey, they have their own goal the villain is helping them achieve"
  },
  "centralConflict": "2-3 sentences â€” the emotional and thematic core of the campaign. Not plot specifics. What does this campaign ultimately ask of the players?",
  "antagonistRoster": [],
  "openingHooks": [
    "A subtle hint that can be seeded in session 1 â€” specific, not generic",
    "A second breadcrumb â€” different in nature (visual, heard, felt, smelled)",
    "A third early omen â€” something that seems innocuous but is deeply significant"
  ],
  "plotTwist": "The mid-campaign revelation that reframes everything the players thought they knew. Should make them say 'oh god, of course.' Not a random surprise â€” something that was always true but hidden.",
  "mysteryLayer": {
    "centralQuestion": "The one question that drives all investigation â€” specific enough to pursue, mysterious enough to sustain a campaign",
    "clues": [
      "clue 1 â€” earliest, most subtle. Something players could easily overlook",
      "clue 2 â€” slightly more concrete, but still ambiguous",
      "clue 3 â€” raises more questions than it answers",
      "clue 4 â€” starts pointing at the truth in an uncomfortable direction",
      "clue 5 â€” confirms part of the answer but opens a worse question",
      "clue 6 â€” the final piece before revelation. Should make the revelation feel inevitable"
    ],
    "redHerrings": [
      "false trail 1 â€” plausible, misleading, has its own internal logic",
      "false trail 2 â€” points at the wrong person or cause convincingly"
    ],
    "revelation": "The full truth behind the central question â€” what actually happened/is happening. Be specific."
  },
  "safeHaven": {
    "name": "Name of the home base â€” evocative, fits the world",
    "description": "2 sentences â€” what it looks, sounds, smells like. It should feel lived-in and slightly imperfect.",
    "keyNPC": "Name and one sentence about the person who runs/protects it â€” warm, slightly odd, genuinely fond of the characters",
    "flavor": "One specific sensory detail that players will associate with safety â€” the smell of something always cooking, a particular lamp, a sound that means they're home"
  },
  "toneBreaks": [
    "A specific NPC who is genuinely funny or absurd in an otherwise grim world â€” describe them in one sentence with their name",
    "A recurring comic situation or running joke built into the world â€” specific to this premise",
    "A moment of unexpected warmth or beauty in the dark â€” describe the scenario",
    "An encounter that is lighter in difficulty and tone, designed to let players breathe â€” describe it"
  ],
  "futureHookSeeds": [
    "IF players choose to [specific action X in this world], then [future consequence Y â€” be specific about what changes]",
    "IF [specific NPC name from this campaign] survives/is spared, they will [specific future role]",
    "The [specific object/location/secret from Act 1] will [become critical in Act 3 because of this specific reason]",
    "If the players ignore [specific faction from this campaign], [that faction] will [specific retaliation action]",
    "The [specific choice the players will face in Act 2] will [shape the Act 3 resolution in this specific way]",
    "A recurring small NPC (name them) who, if players are kind to them, turns out to [have this crucial role later]"
  ],
  "campaignBrief": {
    "hook": "2 sentences. Clear objective + immediate emotional pull. No mystery yet â€” just: what do they need to do and why should they care RIGHT NOW.",
    "objective": "Exactly what the characters need to accomplish â€” concrete and actionable. Start with a verb.",
    "motivation": "Why would any character care about this personally? Make it visceral. If character concepts were provided, appeal to them directly.",
    "whereToStart": "Exactly where to go and who to talk to first. Give a name. Give a reason why that person specifically.",
    "worldStakes": "What happens to the world â€” specifically â€” if they fail. Make it visceral and concrete.",
    "characterStakes": "What the characters personally lose if they fail. More intimate than world stakes.",
    "mysteryHint": "Pose the central mystery as a question the players will want to answer. Intriguing, not spoiling."
  },
  "spotlightDesign": {
    "sharedMoments": [
      "A scenario that REQUIRES two characters to cooperate â€” one creates the opening, the other executes. Describe the specific situation.",
      "A moment where the characters must choose between individual goals and party loyalty â€” what is the specific dilemma?",
      "A scene designed to create an inside joke or shared reference â€” something absurd that only works in this world"
    ],
    "encounterCurve": "Describe the encounter difficulty curve for this campaign: Easy â†’ Medium â†’ Easy â†’ Hard â†’ Medium â†’ Hard â†’ DEADLY (boss). For each difficulty tier, describe what it represents in THIS campaign's specific context."
  },
  "dmRoadmap": {
    "act1Goals": [
      "Specific goal 1 for Act 1 â€” tailored to this premise",
      "Specific goal 2 for Act 1",
      "Specific goal 3 for Act 1",
      "Specific goal 4 for Act 1"
    ],
    "act1MustIntroduce": ["name of a key NPC specific to this campaign", "name of a key location", "name of a faction contact"],
    "act1ClimaxEvent": "The specific event that ends Act 1 â€” a revelation, a loss, a crossing of the point of no return. Specific to this premise.",
    "act2Goals": [
      "Specific goal 1 for Act 2",
      "Specific goal 2 for Act 2",
      "Specific goal 3 for Act 2",
      "Specific goal 4 for Act 2"
    ],
    "act2VillainEscalation": "The specific action the villain takes in Act 2 â€” something visible, terrible, personal to the players",
    "act2ClimaxEvent": "The darkest moment â€” the low point where players question whether victory is possible. Specific.",
    "act3ConvergenceThreads": [
      "Thread 1 converging â€” specific NPC or plot element from Act 1 that returns",
      "Thread 2 converging â€” how the central mystery connects to the final confrontation",
      "Thread 3 converging â€” how a choice the players made in Act 2 shapes the ending"
    ],
    "act3ClimaxEvent": "The final confrontation â€” describe its shape, location, and what makes it climactic. Specific.",
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
- Exactly 4 tone rules â€” specific to THIS premise, not boilerplate dark fantasy
- 3-4 forbidden lore hooks
- Exactly 3 factions with genuinely surprising secret agendas
- The lieutenant must feel like a real person with their own goals, not just a henchman
- The mystery layer clues must form a coherent trail â€” each one building on the last
- The safeHaven must feel warm and specific â€” a place players will want to return to
- The plotTwist must be earned â€” something that was always true but cleverly hidden
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
          content: `You are a Story Director evaluating campaign health for a dark fantasy RPG. Given campaign state, determine if a specific intervention is needed in the next 1-2 player actions to keep the story on track. Be specific â€” name NPCs, name scenes, name mechanics. Return JSON only.`,
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
          content: `You are analyzing a D&D session moment to extract future hooks â€” things that COULD have repercussions later if remembered. Extract 0-2 items only. Only flag genuinely notable moments, not mundane actions. Return JSON only.`,
        },
        {
          role: 'user',
          content: `Character: ${characterName}
Current location: ${worldState.currentLocation || 'unknown'}
Player action: "${action}"
What happened: "${narration.slice(0, 500)}"

Extract 0-2 future hooks from this moment. These are things that could matter later:
- An NPC was threatened/wronged/helped â€” they might remember
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
    ? `Active antagonists: ${worldBible.antagonistRoster.map(a => `${a.isRevealed ? a.name : '[Unknown Force]'} â€” ${a.currentStep}`).join('; ')}`
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
OUTCOME: ${victory ? 'VICTORY â€” the darkness was stopped' : 'DEFEAT â€” the darkness prevailed'}

CAMPAIGN JOURNAL (what happened):
${journal.slice(-5).map(j => `[Act ${j.actNumber}] ${j.summary}`).join('\n') || 'A hero walked through fire and shadow.'}

FALLEN HEROES who came before:
${fallenHeroes.map(h => `- ${h.name} (${h.race} ${h.class}, Lv${h.level}): ${h.cause}`).join('\n') || 'None fell before this hero.'}

KEY NPCs encountered:
${npcMemory.slice(-10).map(n => `- ${n.name} [${n.disposition}]: ${n.notes}`).join('\n') || 'Many faces, many names.'}

FACTION STANDINGS:
${Object.entries(factionStandings).map(([f, v]) => `- ${f}: ${v > 0 ? 'Allied' : v < 0 ? 'Hostile' : 'Neutral'} (${v})`).join('\n') || 'The factions shifted like tides.'}

WORLD: ${worldBible.era} | ${worldBible.centralConflict}
PRIMARY ANTAGONIST: ${worldBible.primaryAntagonist?.name || 'The darkness'} â€” ${worldBible.primaryAntagonist?.agenda || 'sought to unmake the world'}

Write a rich 400-600 word epilogue in the style of the final page of a dark fantasy novel. Include:
1. What happened to the world after the conflict ended
2. The fate of 2-3 key NPCs the hero knew
3. The villain's ultimate fate (death, imprisonment, fled into shadow)
4. The character's legacy â€” what songs will be sung, what statues built, or what they chose to do next
5. How the world changed because of their specific choices
6. A bittersweet final note â€” victory always costs something, defeat leaves something behind

Write in second person ("You...") for an immersive final address to the player. Tone: melancholic, earned, final. Like the last ember of a fire â€” still warm, but fading.

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
