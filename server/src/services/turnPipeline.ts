import type { Character, RollContext, WorldBible, WorldState } from '../../../shared/types';
import { CO_OP_SINGLE_CAMERA_RULE, COMPANION_PARTY_CONTRACT, PLAYER_AUTHORSHIP_CONTRACT, SIGNATURE_REWARDS_CONTRACT } from './aiPromptContracts';
import { buildCompanionsPromptBlock } from './companionSystem';
import { parseJsonRecord } from './aiResponseParser';
import { EVERREALM_ART_BIBLE } from './everrealmArtPrompt';
import {
  buildCampaignContextBlock,
  buildCombatBlock,
  buildEndgameDirectiveBlock,
  buildLoreContextBlock,
  buildNpcQuestMapBlock,
  buildStatHints,
  characterGenderLine,
  type NarrationCampaignContext,
} from './narrationPromptBuilder';
import {
  asString,
  cleanSuggestedActions,
  parseNarrationResponse,
  type NarrationResult,
} from './narrationResponseParser';
import { CLASS_ABILITIES } from '../../../shared/classAbilities';
import { formatStoryThreadsBlock, rankStoryThreads } from './storyMemory';
import { analyzeActionRail } from './storyRails';
import { buildDndTableProfile, formatDndTableDirectives } from './dndTableSystem';
import { runDmQualityGate } from './dmQualityGate';
import { buildClueBankBlock } from './mysteryClueSystem';

// ── The turn pipeline ────────────────────────────────────────────────────────
// Instead of one monolithic call that must narrate, adjudicate, pace, track every
// thread, and serialize ~60 JSON fields at once, a turn runs as three focused
// passes:
//   1. DIRECTOR  — decides what should happen this beat (the 1-2 priorities, pacing,
//                  whether a roll is needed, who is spotlighted). Small in, small out.
//   2. NARRATOR  — writes ONLY the prose for that plan. No mechanics. Best prose lives here.
//   3. EXTRACTOR — reads the prose + plan and emits the structured state changes,
//                  reusing parseNarrationResponse so all existing cleaning/clamping applies.
// The engine (combat system, reducers, guardrails) consumes the result unchanged.
// Gated behind a flag so the existing single-call path stays the default.

// On by default — the pipeline is the product. Set TURN_PIPELINE=0 (or false/off)
// to fall back to the legacy single-call engine. Any pipeline error also falls
// back automatically (see narrationGenerationService), so this can't break play.
export function isTurnPipelineEnabled(): boolean {
  const flag = (process.env.TURN_PIPELINE || '').toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'off' && flag !== 'no';
}

export type ChatClient = {
  chat: { completions: { create(args: any): Promise<any> } };
};
type AiCallLogger = (fn: string, data: Record<string, unknown>) => void;

type ScenePurpose = NonNullable<NarrationResult['scenePurpose']>;
type PacingMode = NonNullable<NarrationResult['pacingMode']>;

export type BeatPlan = {
  priorities: string[];
  scenePurpose: ScenePurpose;
  pacingMode: PacingMode;
  needsRoll: boolean;
  rollStat?: RollContext['stat'];
  rollDc?: number;
  rollReason?: string;
  actingCharacterId?: string;
  combatActive: boolean;
  combatStarting: boolean;
  enemyHint?: string;
  isHighStakes: boolean;
  spotlightCharacterId?: string;
  threadToAdvance?: string;
  complication?: string;
  reason: string;
};

const VALID_PURPOSES: ScenePurpose[] = ['explore', 'gather_info', 'combat', 'social', 'travel', 'rest', 'climax'];
const VALID_PACING: PacingMode[] = ['exploration', 'tension', 'climax', 'resolution'];
const VALID_STATS: RollContext['stat'][] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Compact prose-voice rules — the essence of the monolith's DM voice, kept small so
// the narrator pass stays focused. The director and extractor enforce mechanics.
const NARRATOR_VOICE = `You are a world-class Dungeon Master writing the prose for ONE turn at a real table.
- Respond to the player's declared action first. Make the situation concretely change by the end: a fact revealed, a price paid, a door opened, an NPC commits, the party moves or learns something specific. Never end on pure anticipation ("secrets just within reach", "a turning point") — that is stalling.
- Vary your opening. Do NOT open on weather/sky/atmosphere. Open on action, dialogue, a reaction, or a sudden change.
- Mix sentence length. Cut adjective stacking and overwrought sensory description. One vivid detail beats five generic ones. Dialogue sounds like people talking, not speeches.
- Preserve agency: show pressure and consequence; never decide what the player says, feels, gestures, chooses, or does next beyond the submitted action.
- Reuse established NPCs, wounds, debts, and clues before inventing new ones. A returning known NPC shows they remember the party.
- NAME every NPC the moment they appear — never "the merchant", "a guard", "an old woman". Give a name that fits the region (e.g. "Varen, a grizzled trader"). Once named, stay consistent.
- In combat, every standing enemy ACTS: it attacks, corners, or wounds, and a hit costs something. When a character drops below ~30% HP, telegraph mortal danger clearly. Never narrate a wound you don't mean, and never wave away a real fight.
- Speak in second person when it reads naturally. Keep system text, JSON, and DC reasoning out of the prose.
${PLAYER_AUTHORSHIP_CONTRACT}
${COMPANION_PARTY_CONTRACT}`;

const COOP_NARRATOR_VOICE = `${NARRATOR_VOICE}
- CO-OP: Character 1 and Character 2 are TWO SEPARATE PEOPLE with different names, standing side by side in ONE shared scene. Refer to EACH BY NAME and act out EACH ONE's submitted action as their own. NEVER merge them into a single actor, never write one character performing the other's action, and never write phrases like "his other self" or "they both" to cover a move only one made. If Character 1 distracts and Character 2 flanks, show Character 1 distracting AND Character 2 flanking, each named.
- ONE shared scene, single camera: both occupy the same moment. NEVER write "Meanwhile" or split them into parallel threads. Give each character presence only through their submitted action or an unavoidable consequence. Do not invent body language, dialogue, emotions, agreement, or reactions to make them seem connected.
${CO_OP_SINGLE_CAMERA_RULE}`;

export function narrationLengthGuide(isCoop: boolean, pacingMode: PacingMode): string {
  if (isCoop) return pacingMode === 'climax' ? '120-190 words, urgent; no padding' : '80-150 words; ordinary dialogue may be shorter';
  if (pacingMode === 'climax') return '100-160 words, urgent';
  if (pacingMode === 'tension') return '70-120 words';
  return '60-110 words; ordinary dialogue may be shorter';
}

function leanSceneContext(worldState: WorldState): string {
  const cs = worldState.combatState;
  return [
    `Location: ${worldState.currentLocation || 'Unknown'}`,
    `Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}`,
    worldState.activeNPC ? `Active NPC (only this NPC speaks unless the scene changes): ${worldState.activeNPC}` : null,
    cs?.inCombat ? `In combat: ${cs.enemyName || 'enemies present'} (${cs.enemyCondition || 'unknown'})` : null,
    worldState.currentSceneSummary ? `Current situation: ${worldState.currentSceneSummary}` : null,
    buildCompanionsPromptBlock(worldState.companions) || null,
  ].filter(Boolean).join('\n');
}

function characterLine(c: Character, subLocation?: string): string {
  return `${c.name} — ${c.race} ${c.class} L${c.level}, HP ${c.hp}/${c.max_hp}${characterGenderLine(c)}${subLocation ? ` — currently inside ${subLocation}` : ''}
Stats: STR ${c.stats.str} DEX ${c.stats.dex} CON ${c.stats.con} INT ${c.stats.int} WIS ${c.stats.wis} CHA ${c.stats.cha} — ${buildStatHints(c.stats) || 'balanced'}
Backstory: ${c.backstory || 'unknown origins'}`;
}

function clampDc(value: unknown): number | undefined {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
  if (n === undefined) return undefined;
  return Math.max(8, Math.min(25, n));
}

function parseBeatPlan(raw: Record<string, unknown>, fallbackActingId?: string): BeatPlan {
  const purpose = asString(raw.scenePurpose) as ScenePurpose | undefined;
  const pacing = asString(raw.pacingMode) as PacingMode | undefined;
  const stat = asString(raw.rollStat)?.toLowerCase() as RollContext['stat'] | undefined;
  const priorities = Array.isArray(raw.priorities)
    ? raw.priorities.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 2)
    : [];
  const needsRoll = raw.needsRoll === true;
  return {
    priorities: priorities.length > 0 ? priorities : ['Respond to the action and change the situation concretely.'],
    scenePurpose: purpose && VALID_PURPOSES.includes(purpose) ? purpose : 'explore',
    pacingMode: pacing && VALID_PACING.includes(pacing) ? pacing : 'exploration',
    needsRoll,
    rollStat: stat && VALID_STATS.includes(stat) ? stat : undefined,
    rollDc: clampDc(raw.rollDc),
    rollReason: asString(raw.rollReason),
    actingCharacterId: asString(raw.actingCharacterId) || (needsRoll ? fallbackActingId : undefined),
    combatActive: raw.combatActive === true,
    combatStarting: raw.combatStarting === true,
    enemyHint: asString(raw.enemyHint),
    isHighStakes: raw.isHighStakes === true,
    spotlightCharacterId: asString(raw.spotlightCharacterId),
    threadToAdvance: asString(raw.threadToAdvance),
    complication: asString(raw.complication),
    reason: asString(raw.reason) || '',
  };
}

// ── Pass 1: Director ─────────────────────────────────────────────────────────
async function runDirectorPass(
  openai: ChatClient,
  log: AiCallLogger,
  args: {
    actionsBlock: string;
    charactersBlock: string;
    worldState: WorldState;
    worldBible: WorldBible;
    campaignContext?: NarrationCampaignContext | null;
    isCoop: boolean;
    fallbackActingId?: string;
    tableDirectives?: string;
  },
): Promise<BeatPlan> {
  const { worldState, worldBible, campaignContext } = args;
  const threads = rankStoryThreads(worldState, worldBible, { limit: 6, actionCount: worldState.actionCount });
  const threadsBlock = formatStoryThreadsBlock(threads);
  const sceneState = worldState.sceneState;
  const stall = sceneState && sceneState.stalledCount >= 2
    ? `STALL: ${sceneState.stalledCount} exchanges without advancement — this beat MUST introduce a complication or a decision.`
    : '';
  const escalation = (sceneState?.cluesThisScene ?? 0) >= 2
    ? 'CLUE-TO-CHOICE: enough lore has been handed out — this beat must force a choice, a roll, a complication, or a scene exit, not more exposition.'
    : '';

  const system = `You are the DIRECTOR of a D&D table — a higher planning system that decides what THIS beat is about before the narrator writes it. You do not write prose. You make one sharp plan.
PRIORITIZATION RULE: when a turn could do many things at once (combat + a thread payoff + a relationship shift), pick the ONE or TWO that matter most this beat and commit to landing them cleanly. Do not try to juggle everything — a focused beat beats a crowded one.
Respect pacing: advance or pay off an open thread rather than restating it; honor any DIRECTOR BEAT and act-roadmap pressure. Pacing may move NPCs, threats, clocks, and consequences, but it never authorizes you to move a hero, accept a hook for them, choose a route, or complete their next action.
WHEN TO CALL FOR A ROLL (set needsRoll true — these are NOT auto-successes, and failure must be possible):
- A physical feat against real resistance: forcing/lifting/bending/breaking/climbing/shoving/holding a door (str/dex).
- Extracting a name, secret, or guarded truth from a reluctant or evasive NPC (cha persuade/intimidate, or wis insight).
- Identifying hidden magic, recalling obscure lore, or reading runes when the answer is non-obvious (int/wis).
- Stealth, pickpocketing/theft (ALWAYS a dex roll), lockpicking, or any attack with an uncertain outcome.
- If several recent actions all just worked with no roll, the scene has no stakes — call for the roll when the outcome is uncertain AND failure would cost something. Do NOT roll for the trivial or purely expressive (looking at something in plain sight, walking somewhere safe, party conversation).
COMBAT GROUNDING: only set combatStarting true if an enemy is ALREADY established in the scene (named in recent history, the active NPC turning hostile, or a creature the narration has already placed here). A bare intent like "look for a fight", "find something to kill", or "go hunting trouble" with no enemy yet present MUST set combatStarting false — make the beat about discovering a sign, trail, witness, or lead that points toward a real encounter next. Do not conjure an enemy out of nowhere to satisfy the action.
${COMPANION_PARTY_CONTRACT}${args.isCoop ? `
CO-OP: there are TWO distinct player characters with different names and ids. BOTH submitted actions are mandatory — include one priority for EACH character's declared action. Do not add a reaction, gesture, quote, movement, or follow-up that the player did not submit. The focus rule does NOT let you drop, merge, or reassign either action; spotlightCharacterId and actingCharacterId must be a real character id from the actions below.` : ''}`;

  const user = `${args.charactersBlock}

WORLD: ${worldBible.era} | ${worldBible.magicSystem}
${leanSceneContext(worldState)}
${buildEndgameDirectiveBlock(worldState)}
${threadsBlock}
${buildCampaignContextBlock(campaignContext, worldBible, 1)}
${campaignContext?.railDirectives ? `\nENGINE RAILS FROM TURN PLANNER:\n${campaignContext.railDirectives}` : ''}
${campaignContext?.continuityDirectives ? `\nCONTINUITY DIRECTIVES:\n${campaignContext.continuityDirectives}` : ''}
${args.tableDirectives ? `\n${args.tableDirectives}` : ''}
${stall}
${escalation}

${args.actionsBlock}

Decide the beat. Respond with JSON:
{
  "priorities": ["the 1-2 things that MUST land this beat — be specific to the action and the open threads"],
  "scenePurpose": "explore|gather_info|combat|social|travel|rest|climax",
  "pacingMode": "exploration|tension|climax|resolution",
  "threadToAdvance": "the exact open-thread text this beat moves, or null",
  "complication": "if a stall/escalation forces one, the complication to introduce, else null",
  "needsRoll": boolean,            // true only if the outcome is uncertain AND failure costs something
  "rollStat": "str|dex|con|int|wis|cha|null",
  "rollDc": number | null,          // 8 easy … 25 near-impossible
  "rollReason": "what is being attempted, or null",
  "actingCharacterId": "${args.isCoop ? 'the character id making the roll, if needsRoll' : 'null'}",
  "combatActive": boolean,          // is the party already in or entering a real, grounded fight
  "combatStarting": boolean,        // does a NEW fight begin this beat (only if grounded by the scene)
  "enemyHint": "short enemy description if combat, else null",
  "isHighStakes": boolean,          // a named-antagonist meeting, betrayal/deal, major revelation, or moral fork
  "spotlightCharacterId": "${args.isCoop ? 'character id to spotlight this beat, balancing the party' : 'null'}",
  "reason": "one short sentence on why this is the right beat (not shown to players)"
}`;

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0].message.content || '{}';
  const plan = parseBeatPlan(parseJsonRecord(content), args.fallbackActingId);
  log('pipeline.director', { isCoop: args.isCoop, rawResponse: content, plan });
  return plan;
}

// ── Pass 2: Narrator ─────────────────────────────────────────────────────────
async function runNarratorPass(
  openai: ChatClient,
  log: AiCallLogger,
  args: {
    plan: BeatPlan;
    actionsBlock: string;
    charactersBlock: string;
    worldState: WorldState;
    worldBible: WorldBible;
    recentHistory: string[];
    isCoop: boolean;
    coopNames?: string[];
    tableDirectives?: string;
    campaignContext?: NarrationCampaignContext | null;
  },
): Promise<{ narration: string; sceneImagePrompt: string }> {
  const { plan, worldState, worldBible } = args;
  const rollDirective = plan.needsRoll
    ? `THIS BEAT ENDS ON A ROLL. Write a tense 50-80 word setup that builds to ${plan.rollReason || 'the attempt'} and STOP before the outcome. Do not resolve it.`
    : `Resolve the action this beat — land the priorities concretely.`;
  const combatDirective = plan.combatActive || plan.combatStarting
    ? `Combat is live. Every standing enemy acts and a hit must cost something; narrate wounds that the mechanics will then apply.`
    : '';
  const lengthGuide = narrationLengthGuide(args.isCoop, plan.pacingMode);

  const system = args.isCoop ? COOP_NARRATOR_VOICE : NARRATOR_VOICE;
  const user = `BEAT PLAN (write prose that lands exactly this — nothing more):
- Priorities this beat: ${plan.priorities.join(' | ')}
- Pacing: ${plan.pacingMode} | Scene purpose: ${plan.scenePurpose}
${plan.threadToAdvance ? `- Advance this thread (don't just restate it): ${plan.threadToAdvance}` : ''}
${plan.complication ? `- Introduce this complication: ${plan.complication}` : ''}
${plan.isHighStakes ? `- This is a HIGH-STAKES beat: build to the dilemma, keep it tight and tense, do not resolve it for the players.` : ''}
${rollDirective}
${combatDirective}

VISUAL STYLE for sceneImagePrompt: ${worldBible.artBible?.masterPrompt || EVERREALM_ART_BIBLE.masterPrompt}

${args.charactersBlock}

WORLD: ${worldBible.era} | ${worldBible.magicSystem}
${leanSceneContext(worldState)}
${buildLoreContextBlock(worldBible, worldState)}
${buildNpcQuestMapBlock(worldState, args.campaignContext)}
${args.tableDirectives ? `\n${args.tableDirectives}` : ''}
${args.campaignContext?.continuityDirectives ? `\nCONTINUITY DIRECTIVES:\n${args.campaignContext.continuityDirectives}` : ''}
${args.campaignContext?.memoryContext ? `\nCAMPAIGN MEMORY:\n${args.campaignContext.memoryContext}` : ''}

RECENT HISTORY:
${args.recentHistory.slice(-6).join('\n') || '(beginning)'}

${args.actionsBlock}
PLAYER AUTHORSHIP BOUNDARY: The only voluntary hero actions authorized for this response are exactly the submitted actions above. Resolve their immediate effects, then stop at the first new decision. Do not invent exact hero dialogue unless it was submitted verbatim.
${args.isCoop && args.coopNames?.length === 2 ? `\nHARD REQUIREMENT: ${args.coopNames[0]} AND ${args.coopNames[1]} are two different people. BOTH must appear by name and perform only their OWN submitted action in this one shared scene. Do NOT attribute ${args.coopNames[1]}'s action to ${args.coopNames[0]}, and do not invent a reaction or next move for either character.` : ''}

Write the prose (${lengthGuide}). Respond with JSON: {"narration": "the story text the players see", "sceneImagePrompt": "a brief vivid scene description for image generation"}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0].message.content || '{}';
  const parsed = parseJsonRecord(content);
  log('pipeline.narrator', { isCoop: args.isCoop, rawResponse: content });
  return {
    narration: asString(parsed.narration) || 'The world holds its breath...',
    sceneImagePrompt: asString(parsed.sceneImagePrompt) || '',
  };
}

// ── Pass 3: Extractor ────────────────────────────────────────────────────────
function abilitiesForExtractor(character: Character): string {
  const abilities = (character.abilities || []).filter(a => !a.currentCooldown || a.currentCooldown <= 0);
  if (abilities.length === 0) {
    const map = CLASS_ABILITIES[character.class] || {};
    const names = Object.values(map).map(a => a.name).slice(0, 2);
    return names.length ? `none active (class abilities to come: ${names.join(', ')})` : 'none';
  }
  return abilities.map(a => `${a.name}${a.mechanic ? ` (${a.mechanic})` : ''}`).join('; ');
}

function buildTableDirectivesForActions(
  entries: { character: Character; action: string }[],
  worldState: WorldState,
  worldBible: WorldBible,
): string {
  const rails = entries.map(entry => analyzeActionRail(entry.character, entry.action, worldState, worldBible));
  return formatDndTableDirectives(buildDndTableProfile({
    characters: entries.map(entry => entry.character),
    worldState,
    worldBible,
    rails,
    scenePurpose: worldState.sceneState?.purpose,
    pacingMode: worldState.sceneState?.pacingMode,
  }));
}

const SOLO_EXTRACTOR_SCHEMA = `{
  "worldStateChanges": "object | null — only fields that changed: npcMemory[], activeQuests[], currentLocation, discoveredLocations[], timeOfDay, weather, etc.",
  "activeNPC": "name of the NPC now in conversation, or null if none/left",
  "suggestedActions": ["3-4 concrete in-fiction next actions; [] if a roll is pending or high-stakes"],
  "hpChange": "number | null (negative = damage narrated, positive = healing)",
  "goldChange": "number | null",
  "loot": "[{id,name,description,quantity,type:weapon|armor|potion|misc|key,value,setName,setBonus}] | null — only if narrated",
  "statusEffectChanges": "{add:[{name,description,type:buff|debuff|neutral,duration}],remove:[name]} | null",
  "isCombat": "boolean", "isVictory": "boolean", "enemyName": "string|null",
  "combatEnemies": "[{name,archetype:beast|soldier|mage|boss|minion,maxHp,condition:healthy|wounded|critical,isDefeated,specialAbility}] | null",
  "enemyDefeated": "name|null", "isBossFight": "boolean", "bossPhaseAdvance": "boolean",
  "isDeath": "boolean", "deathDescription": "string|null",
  "isMerchant": "boolean", "shopItems": "[{id,name,description,type,price,quantity}] (4-8) | null",
  "isHighStakes": "boolean", "choiceCards": "[{title,description,consequenceHint}] (2-3) | null",
  "abilityUsed": "exact ability name if one was used, else null", "isRest": "boolean", "consumedItems": "[name]|null",
  "achievementUnlocked": "{title,description}|null", "companion": "{name,species,description,bondLevel,abilityHint}|null|undefined",
  "factionRepChange": "{faction,delta:-20..20}|null", "characterHistoryNote": "{type,description,impact}|null",
  "antagonistUpdate": "{name,newStep,lastAction,nowKnowsPlayers}|null", "proactiveEvent": "boolean",
  "newForeshadowing": "[{id,description,type:npc|rumor|object|event|place}]|null", "paidOffForeshadowing": "[id]|null",
  "resolvedFutureHooks": "[short exact phrase copied from an open thread]|null",
  "backstoryHookActivated": "characterId|null", "backstoryHookResolved": "characterId|null",
  "actGoalAchieved": "exact act-goal text|null", "advanceAct": "boolean",
  "sceneMomentum": "advancing|stalling|transitioning", "directorBeatExecuted": "boolean",
  "triggerFinalConfrontation": "boolean", "endgameResolved": "boolean",
  "awaitingRoll": "boolean", "rollContext": "{stat,dc,diceType:d20,description,successDescription,failDescription,critSuccessDescription,critFailDescription,isDramatic,modifier} | null",
  "companionChanges": "[{id,hpChange,xpGained,bondLevelChange,isDeath,deathDescription}] | null — id must match a COMPANIONS id given in context; only for companions who changed this beat",
  "companionRecruit": "{name,race,class} | null — a new ally who joined the party as a full companion this beat, if narrated",
  "companionDeparture": "{id,reason} | null — an existing companion (by id) who left the party without dying, if narrated",
  "revealedClueIds": "[exact ids from the MYSTERY CLUE BANK given in context that this beat concretely revealed] | null — never invent an id not listed there",
  "signatureItemEarned": "{characterId,questId} | null — only at a genuine earned narrative payoff for a seeded SIGNATURE ITEM QUEST given in context; use its exact id",
  "partyAssetGranted": "{kind:property|title|position,name,description,locationName,unlocksHint} | null — only for a real, major earned moment",
  "identityRevealed": "{npcName} | null — set ONLY if the narration just written actually revealed an ACTIVE HIDDEN IDENTITY's true nature this beat; never invent one the prose didn't narrate"
}`;

const COOP_EXTRACTOR_EXTRA = `,
  "character1Changes": "{hpChange,loot,statusEffectChanges,goldChange,isDeath,deathDescription,isRest,abilityUsed,consumedItems} | null — applies ONLY to Character 1",
  "character2Changes": "{...same shape...} | null — applies ONLY to Character 2",
  "character1SuggestedActions": ["3-4 ideas fitting Character 1's class/abilities; [] if roll pending/high-stakes"],
  "character2SuggestedActions": ["3-4 ideas fitting Character 2; [] if roll pending/high-stakes"],
  "comboBonus": "boolean — true if the two actions were coordinated and paid off",
  "actingCharacterId": "id of the roller if awaitingRoll"`;

async function runExtractorPass(
  openai: ChatClient,
  log: AiCallLogger,
  args: {
    plan: BeatPlan;
    narration: string;
    sceneImagePrompt: string;
    mechanicsBlock: string;
    worldState: WorldState;
    isCoop: boolean;
    actingCharacterId?: string;
    tableDirectives?: string;
  },
): Promise<Record<string, unknown>> {
  const { plan } = args;
  const rollLine = plan.needsRoll
    ? `The beat ENDS ON A ROLL: set awaitingRoll true with a complete rollContext (stat ${plan.rollStat || 'choose'}, dc ${plan.rollDc ?? 'choose 8-25'}). Set suggestedActions []. Do NOT set hpChange/loot/combat outcomes — nothing has resolved yet.`
    : `No pending roll: set awaitingRoll false. Apply only mechanics the prose actually narrated.`;
  const schema = SOLO_EXTRACTOR_SCHEMA.replace(/\n}$/, args.isCoop ? `${COOP_EXTRACTOR_EXTRA}\n}` : '\n}');

  const system = `You are the EXTRACTOR. You convert an ALREADY-WRITTEN narration into exact game-state changes. You do not rewrite the story. Rules:
- Mechanics must MATCH the prose: every wound/heal/coin/item/effect the narration describes gets applied; never invent changes the prose didn't narrate, and never narrate-then-skip.
- DAMAGE CALIBRATION (negative hpChange) scales to the target's MAX HP: a minion's hit ≈ 5-10% of max HP, a soldier/beast 10-20%, an elite/mage 15-25%, a boss 20-35%. A clean defensive round can be 0; a real hit must land.
- ENEMY PORTRAITS: enemyName and every combatEnemies[].name MUST contain a recognizable creature keyword so the portrait shows — e.g. goblin, bandit, cultist, assassin, skeleton, zombie, orc, ogre, troll, wolf, dire wolf, giant spider, dragon, wyvern, necromancer, demon, ghost, knight, mercenary. A prefix is fine ("Ancient Minotaur", "Pack of Gnolls"). Only invent a fully custom creature when nothing fits.
- Update npcMemory for any named NPC who appeared/spoke/changed disposition: name, disposition, notes (carry the old notes forward and append what changed — never overwrite), role (their archetype: merchant, guard, innkeeper, noble, healer, etc.), gender ("male"|"female"|"nonbinary" — always set it), relationshipScore (adjust +/-5 to 50 by impact), relationshipLabel, lastMet. Update activeQuests/currentLocation when they change.
- ${rollLine}
- WORLD REACTION: if violence, intimidation, humiliation, theft, rescue, betrayal, mercy, or a hard-won alliance happened, reflect it with meaningful npcMemory relationshipScore/relationshipLabel and factionRepChange when relevant. A defeated or cornered enemy should not remain near-neutral unless the narration explicitly shows mercy/reconciliation.
- SKILL CHALLENGE: if the table directives include an active skill challenge, extract incremental progress in worldStateChanges.sceneState.skillChallenge when the narration clearly records a success, failure, cost, or objective completion.
- ${args.isCoop ? 'Co-op: attribute HP/loot/death/ability per character via character1Changes/character2Changes; characterHistoryNote and antagonistUpdate stay top-level.' : 'Solo: use top-level hpChange/loot/etc.'}
- ${COMPANION_PARTY_CONTRACT}
- ${SIGNATURE_REWARDS_CONTRACT}`;

  const signatureQuests = (args.worldState.signatureItemQuests || []).filter(q => q.status !== 'earned');
  const signatureQuestsBlock = signatureQuests.length > 0
    ? `\nSIGNATURE ITEM QUESTS (only complete one at a genuine earned payoff):\n${signatureQuests.map(q => `- id ${q.id} [${q.characterName}, ${q.status}]: ${q.itemName} — ${q.questHook}`).join('\n')}`
    : '';
  const partyAssetsBlock = (args.worldState.partyAssets || []).length > 0
    ? `\nEXISTING PARTY ASSETS (reference these going forward — address the party by title, mention the property):\n${(args.worldState.partyAssets || []).map(a => `- [${a.kind}] ${a.name}: ${a.description}`).join('\n')}`
    : '';
  const hiddenIdentitiesBlock = (args.worldState.hiddenIdentities || []).filter(h => !h.isRevealed).length > 0
    ? `\nACTIVE HIDDEN IDENTITY (only set identityRevealed if the narration above actually revealed this): ${(args.worldState.hiddenIdentities || []).filter(h => !h.isRevealed).map(h => `${h.npcName} — reveal condition: ${h.revealCondition}`).join('; ')}`
    : '';

  const user = `BEAT PLAN: priorities=${plan.priorities.join(' | ')}; scenePurpose=${plan.scenePurpose}; pacing=${plan.pacingMode}; needsRoll=${plan.needsRoll}; combat=${plan.combatActive || plan.combatStarting}; highStakes=${plan.isHighStakes}${plan.threadToAdvance ? `; advanced thread="${plan.threadToAdvance}"` : ''}.
${buildCompanionsPromptBlock(args.worldState.companions)}${signatureQuestsBlock}${partyAssetsBlock}${hiddenIdentitiesBlock}

NARRATION JUST WRITTEN (extract state from THIS, do not change it):
"""
${args.narration}
"""

MECHANICAL CONTEXT (for exact numbers):
${args.mechanicsBlock}
${args.tableDirectives ? `\nTABLE DIRECTIVES:\n${args.tableDirectives}` : ''}
${buildClueBankBlock(args.worldState)}

Combat tracker state: ${args.worldState.combatState?.inCombat ? `round ${args.worldState.combatState.roundNumber}, enemies: ${(args.worldState.combatState.enemies || []).map(e => `${e.name}(${e.condition})`).join(', ') || args.worldState.combatState.enemyName}` : 'not in combat'}.

Respond with JSON matching this schema (omit/leave null anything that did not change):
${schema}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0].message.content || '{}';
  const parsed = parseJsonRecord(content);
  log('pipeline.extractor', { isCoop: args.isCoop, rawResponse: content });

  // Stitch the prose + plan-derived fields the extractor shouldn't override.
  parsed.narration = args.narration;
  parsed.sceneImagePrompt = args.sceneImagePrompt;
  parsed.pacingMode = plan.pacingMode;
  parsed.scenePurpose = plan.scenePurpose;
  if (plan.spotlightCharacterId) parsed.spotlightCharacterId = plan.spotlightCharacterId;
  if (plan.needsRoll) {
    parsed.awaitingRoll = true;
    // Guarantee a usable rollContext even if the extractor under-filled it.
    const rc = (parsed.rollContext as Record<string, unknown> | undefined) || {};
    parsed.rollContext = {
      stat: rc.stat || plan.rollStat || 'dex',
      dc: rc.dc || plan.rollDc || 13,
      diceType: 'd20',
      description: rc.description || plan.rollReason || 'an uncertain attempt',
      successDescription: rc.successDescription || 'It looks like it might work.',
      failDescription: rc.failDescription || 'It could go wrong.',
      critSuccessDescription: rc.critSuccessDescription,
      critFailDescription: rc.critFailDescription,
      isDramatic: rc.isDramatic === true,
      modifier: typeof rc.modifier === 'number' ? rc.modifier : 0,
    };
    if (args.isCoop && !parsed.actingCharacterId) parsed.actingCharacterId = args.actingCharacterId || plan.actingCharacterId;
  }
  return parsed;
}

// ── Orchestrators ────────────────────────────────────────────────────────────
export async function runSoloTurnPipeline(
  openai: ChatClient,
  log: AiCallLogger,
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null,
): Promise<NarrationResult> {
  const charactersBlock = `CHARACTER:\n${characterLine(character, worldState.characterSubLocations?.[character.id])}\nNotable inventory: ${character.inventory.slice(0, 6).map(i => i.name).join(', ') || 'nothing special'}\nAbilities: ${abilitiesForExtractor(character)}`;
  const actionsBlock = `═══ PLAYER ACTION ═══\n${character.name}: ${action}`;

  const tableDirectives = buildTableDirectivesForActions([{ character, action }], worldState, worldBible);

  const plan = await runDirectorPass(openai, log, {
    actionsBlock, charactersBlock, worldState, worldBible, campaignContext, isCoop: false, tableDirectives,
  });
  const draft = await runNarratorPass(openai, log, {
    plan, actionsBlock, charactersBlock, worldState, worldBible, recentHistory, isCoop: false, tableDirectives, campaignContext,
  });
  const quality = await runDmQualityGate(openai, log, {
    narration: draft.narration,
    sceneImagePrompt: draft.sceneImagePrompt,
    plan,
    actionsBlock,
    worldState,
    worldBible,
    recentHistory,
    isCoop: false,
    tableDirectives,
  });
  const mechanicsBlock = `${character.name}: HP ${character.hp}/${character.max_hp}, Gold ${character.gold}, Level ${character.level}. Inventory: ${character.inventory.slice(0, 8).map(i => i.name).join(', ') || 'none'}. Abilities: ${abilitiesForExtractor(character)}.${character.status_effects?.length ? ` Status: ${character.status_effects.map(e => e.name).join(', ')}.` : ''}`;
  const raw = await runExtractorPass(openai, log, {
    plan, narration: quality.narration, sceneImagePrompt: quality.sceneImagePrompt, mechanicsBlock, worldState, isCoop: false, tableDirectives,
  });
  return parseNarrationResponse(raw);
}

export type CoopPipelineResult = NarrationResult & {
  character1Changes?: NarrationResult['character1Changes'];
  character2Changes?: NarrationResult['character2Changes'];
  character1SuggestedActions?: string[];
  character2SuggestedActions?: string[];
};

export async function runCoopTurnPipeline(
  openai: ChatClient,
  log: AiCallLogger,
  actions: { character: Character; action: string }[],
  worldState: WorldState,
  worldBible: WorldBible,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null,
): Promise<CoopPipelineResult> {
  if (actions.length < 2) throw new Error('runCoopTurnPipeline requires exactly 2 actions');
  const [a1, a2] = actions;
  const c1 = a1.character;
  const c2 = a2.character;
  const tableDirectives = buildTableDirectivesForActions(actions, worldState, worldBible);

  const charactersBlock = `CHARACTER 1 (id: ${c1.id}):\n${characterLine(c1, worldState.characterSubLocations?.[c1.id])}\nInventory: ${c1.inventory.slice(0, 5).map(i => i.name).join(', ') || 'none'} | Abilities: ${abilitiesForExtractor(c1)}

CHARACTER 2 (id: ${c2.id}):\n${characterLine(c2, worldState.characterSubLocations?.[c2.id])}\nInventory: ${c2.inventory.slice(0, 5).map(i => i.name).join(', ') || 'none'} | Abilities: ${abilitiesForExtractor(c2)}`;
  const actionsBlock = `═══ PARTY ACTIONS ═══\nCHARACTER 1 (${c1.name}, id ${c1.id}): ${a1.action}\nCHARACTER 2 (${c2.name}, id ${c2.id}): ${a2.action}`;

  const plan = await runDirectorPass(openai, log, {
    actionsBlock, charactersBlock, worldState, worldBible, campaignContext, isCoop: true, fallbackActingId: c1.id, tableDirectives,
  });
  // Force the narrator's per-character priorities from the ACTUAL submitted actions.
  // gpt-4o tends to anchor both actions onto the spotlight character; deriving the
  // priorities here guarantees the narrator is told, structurally, that each named
  // character performs their own move — regardless of how the director summarized it.
  const narratorPlan: BeatPlan = {
    ...plan,
    priorities: [`${c1.name} — ${a1.action}`, `${c2.name} — ${a2.action}`],
  };
  const draft = await runNarratorPass(openai, log, {
    plan: narratorPlan, actionsBlock, charactersBlock, worldState, worldBible, recentHistory, isCoop: true, coopNames: [c1.name, c2.name], tableDirectives, campaignContext,
  });
  const quality = await runDmQualityGate(openai, log, {
    narration: draft.narration,
    sceneImagePrompt: draft.sceneImagePrompt,
    plan: narratorPlan,
    actionsBlock,
    worldState,
    worldBible,
    recentHistory,
    isCoop: true,
    coopNames: [c1.name, c2.name],
    tableDirectives,
  });
  const mech = (c: Character) => `${c.name} (id ${c.id}): HP ${c.hp}/${c.max_hp}, Gold ${c.gold}, L${c.level}. Inventory: ${c.inventory.slice(0, 8).map(i => i.name).join(', ') || 'none'}. Abilities: ${abilitiesForExtractor(c)}.${c.status_effects?.length ? ` Status: ${c.status_effects.map(e => e.name).join(', ')}.` : ''}`;
  const raw = await runExtractorPass(openai, log, {
    plan, narration: quality.narration, sceneImagePrompt: quality.sceneImagePrompt, mechanicsBlock: `${mech(c1)}\n${mech(c2)}`, worldState, isCoop: true, actingCharacterId: plan.actingCharacterId || c1.id, tableDirectives,
  });

  const base = parseNarrationResponse(raw);
  return {
    ...base,
    character1Changes: (raw.character1Changes as NarrationResult['character1Changes']) || undefined,
    character2Changes: (raw.character2Changes as NarrationResult['character2Changes']) || undefined,
    character1SuggestedActions: base.awaitingRoll || base.isHighStakes ? [] : cleanSuggestedActions(raw.character1SuggestedActions, base.suggestedActions),
    character2SuggestedActions: base.awaitingRoll || base.isHighStakes ? [] : cleanSuggestedActions(raw.character2SuggestedActions, base.suggestedActions),
    comboBonus: raw.comboBonus === true,
    actingCharacterId: base.awaitingRoll ? (asString(raw.actingCharacterId) || plan.actingCharacterId || c1.id) : undefined,
  };
}
