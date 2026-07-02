import type { Character, InventoryItem, NonCombatContestType, RollContext, SceneInteractable, WorldBible, WorldState } from '../../../shared/types';
import { COMPANION_PARTY_CONTRACT, GROUNDED_ENCOUNTER_CONTRACT, PLAYER_AUTHORSHIP_CONTRACT, WORLD_AGENCY_CONTRACT } from './aiPromptContracts';
import { asString, cleanRollContext } from './narrationResponseParser';
import { parseJsonRecord } from './aiResponseParser';
import { buildCompanionsPromptBlock } from './companionSystem';
import { buildClueBankBlock } from './mysteryClueSystem';
import { formatSceneInteractablesBlock } from './sceneInteractableSystem';
import type { ContestSeed } from './microActionContest';

export type ChatClient = {
  chat: { completions: { create(args: any): Promise<any> } };
};
type AiCallLogger = (fn: string, data: Record<string, unknown>) => void;

export type MicroCombatIntent = 'attack' | 'defend' | 'flee' | 'hide' | 'negotiate';

// Non-combat structured contest (heist/gambling/social con/chase) intent,
// classified only while WorldState.sceneState.skillChallenge is active (and
// combat is not) — see CONTEST_MICRO_ACTION_SYSTEM_PROMPT below.
export type MicroContestIntent = 'attempt' | 'abandon';

export type MicroActionResult = {
  reaction: string;
  awaitingRoll: boolean;
  rollContext?: RollContext;
  npcDispositionNudge?: { name: string; delta: number; note?: string };
  discoveredObject?: string;
  revealedClueIds: string[];
  minorLoot?: InventoryItem[];
  minorHpChange?: number;
  minorGoldChange?: number;
  // Set only when this micro-action was classified while WorldState.combatState
  // was active — see COMBAT_MICRO_ACTION_SYSTEM_PROMPT below. Combat
  // micro-actions ALWAYS carry a rollContext and awaitingRoll:true; real HP/
  // enemy consequences are applied by microActionCombat.ts once the roll
  // resolves, not by this fast-path call.
  combatIntent?: MicroCombatIntent;
  targetEnemy?: string;
  // Set only when this micro-action was classified while an existing
  // sceneState.skillChallenge was active (and combat was not) — see
  // CONTEST_MICRO_ACTION_SYSTEM_PROMPT below. "attempt" ALWAYS carries a
  // rollContext/awaitingRoll:true; real successes/failures bookkeeping is
  // applied by microActionContest.ts once the roll resolves. "abandon"
  // resolves immediately with no roll.
  contestIntent?: MicroContestIntent;
  // Populated only when NO contest/combat was active yet and this action is
  // recognized as the grounded opening move of a brand-new structured
  // contest — always paired with awaitingRoll:true; the resolved roll becomes
  // the contest's first success/failure. See microActionContest.ts. A
  // code-side grounding check (isContestGrounded) still gates whether this is
  // actually honored — this field alone is not enough to start a contest.
  startContest?: ContestSeed;
};

// The free-roam fast path: a single lightweight gpt-4o-mini call that reacts to
// one small in-scene action. Deliberately NOT the turn pipeline — no director/
// narrator/extractor passes, no quality gates, no act-advancement math. It may
// only touch minor/flavor state (a tiny hp/gold nudge, a small gift, an NPC
// disposition nudge, a discovered object, or a clue-bank reveal) and — if the
// action is genuinely risky — hand back a rollContext using the exact same
// shape/cleaning the macro-turn pipeline uses, rather than reinventing dice.
const MICRO_ACTION_SYSTEM_PROMPT = `You are reacting to ONE small free-roam action a player takes while lingering in a scene between story beats — checking in with someone present, glancing at an object, asking a quick question, browsing a stall. This is NOT a full turn: it must stay fast, small, and grounded in what is ACTUALLY present in the scene right now.

RULES:
- React only to what is listed as present (NPCs/objects/exits). Do not invent a new NPC, a new location, or a new threat out of nowhere.
- Keep the reaction SHORT: 1-3 sentences, in-fiction, second person.
- Most micro-actions resolve immediately with no roll and no mechanical change beyond maybe a tiny, clearly flavorful one (a few gold, 1-3 hp, a small trinket). Do NOT grant meaningful loot, XP, or damage — that stays reserved for the full Advance turn.
- Only set awaitingRoll true when the action is CLEARLY risky (attempting theft, a physical feat against real resistance, extracting a guarded secret) — reuse the same rollContext shape (stat/dc/diceType/description/successDescription/failDescription/isDramatic/modifier) the main engine uses. Do not resolve a risky outcome without a roll.
- Never start combat from a micro-action, even if the player goes looking for trouble — that always requires the full Advance turn to ground properly.
- If (and ONLY if) this action is clearly the opening move of a genuinely multi-step contest with real stakes AGAINST something/someone already present in the scene — a heist through a guarded space, a high-stakes gambling match, an extended social con/stand-off, a chase — set startContest with objective/contestType/stakesDescription/onSuccessHint/onFailureHint, and treat this as the FIRST roll of that contest (awaitingRoll must be true with a real rollContext). Do NOT invent a contest from nothing: objective/stakesDescription must reference an NPC or object already listed as present. A single ordinary risky action (picking one lock, one persuasion attempt) is NOT a contest — only set startContest when the fiction clearly implies an extended multi-step struggle that will take several more attempts to resolve.
- If this action concretely reveals one of the MYSTERY CLUE BANK entries given in context, list its exact id in revealedClueIds — never invent a new clue.
- If a specific NPC's feelings shift because of this small interaction, you may set npcDispositionNudge with a SMALL delta (-10 to 10).
- If the player notices something new worth remembering (an object, a detail, a hint), set discoveredObject to a short phrase.
${GROUNDED_ENCOUNTER_CONTRACT}
${PLAYER_AUTHORSHIP_CONTRACT}
${WORLD_AGENCY_CONTRACT}
${COMPANION_PARTY_CONTRACT}

Respond with JSON only:
{
  "reaction": "1-3 sentences, in-fiction, second person",
  "awaitingRoll": boolean,
  "rollContext": {"stat":"str|dex|con|int|wis|cha","dc":number,"diceType":"d20","description":"string","successDescription":"string","failDescription":"string","critSuccessDescription":"string|null","critFailDescription":"string|null","isDramatic":boolean,"modifier":number} | null,
  "npcDispositionNudge": {"name": "exact NPC name from the scene", "delta": number, "note": "string"} | null,
  "discoveredObject": "string | null",
  "revealedClueIds": ["exact ids from the MYSTERY CLUE BANK"] | null,
  "minorLoot": [{"id":"uid","name":"string","description":"string","quantity":1,"type":"weapon|armor|potion|misc|key","value":number}] | null,
  "minorHpChange": number | null,
  "minorGoldChange": number | null,
  "startContest": {"objective":"string","contestType":"heist|social|gambling|chase|other","stakesDescription":"string","onSuccessHint":"string","onFailureHint":"string"} | null
}`;

// The non-combat contest fast path: used whenever WorldState.sceneState.
// skillChallenge is already active and combat is not. Structurally identical
// in spirit to the combat-aware prompt above — it never resolves who wins,
// only classifies the attempt and authors a rollContext (or recognizes the
// player is bailing out). Real successes/failures bookkeeping happens
// deterministically in microActionContest.ts once the dice come back.
const CONTEST_MICRO_ACTION_SYSTEM_PROMPT = `You are reacting to ONE action a player takes during an ACTIVE STRUCTURED CONTEST — a heist, a gambling match, an extended social maneuver/con, or a chase already underway. Every meaningful attempt during this contest flows through here and gets resolved with a real dice roll, not summarized into a later turn.

RULES:
- Classify the action into exactly one contestIntent: "attempt" (a real effort toward the contest's objective — sneaking past a guard, playing a hand, spinning a lie, gaining ground in a chase) or "abandon" (the player explicitly backs out of or walks away from the contest).
- An "attempt" ALWAYS requires a roll — awaitingRoll must be true and rollContext must be filled in. Set a DC that reflects real difficulty (typically 11-16).
- An "abandon" NEVER requires a roll — awaitingRoll must be false.
- Keep the reaction SHORT (1-2 sentences) and describe only the ATTEMPT (or the moment of backing out), not its outcome — whether it lands is decided by the roll, not by you.
- Never resolve who wins or loses the contest yourself, never grant rewards yourself — the engine does that once the roll resolves.
${GROUNDED_ENCOUNTER_CONTRACT}
${PLAYER_AUTHORSHIP_CONTRACT}

Respond with JSON only:
{
  "reaction": "1-2 sentences describing only the attempt (or the moment of backing out), not its outcome",
  "contestIntent": "attempt|abandon",
  "awaitingRoll": boolean,
  "rollContext": {"stat":"str|dex|con|int|wis|cha","dc":number,"diceType":"d20","description":"string","successDescription":"string","failDescription":"string","critSuccessDescription":"string|null","critFailDescription":"string|null","isDramatic":true,"modifier":0} | null
}`;

// The combat-aware fast path: used whenever WorldState.combatState.inCombat
// is true. Unlike the free-roam prompt above, this one is explicitly allowed
// (in fact required) to trigger real stakes — but it never resolves the
// outcome itself. It only classifies the action's intent and authors a
// rollContext; the actual HP/enemy-condition math happens deterministically
// in microActionCombat.ts once the dice (via the existing resolve-roll flow)
// come back, exactly like any other roll-gated micro-action.
const COMBAT_MICRO_ACTION_SYSTEM_PROMPT = `You are reacting to ONE combat action a player takes while ACTIVE COMBAT is underway. This is the fast per-action combat layer: every attack, block, hide, flee, or negotiation attempt during a live fight flows through here and gets resolved with a real dice roll, not summarized into a later turn.

RULES:
- Classify the action into exactly one combatIntent: "attack" (strike/cast/shoot at an enemy), "defend" (brace, block, or protect an ally without a clean strike of your own), "flee" (break away and run), "hide" (duck out of sight without necessarily leaving the area), or "negotiate" (attempt to talk the enemy down or offer terms).
- A combat action ALWAYS requires a roll — awaitingRoll must be true and rollContext must be filled in. Set a DC that reflects real difficulty (typically 11-16); a desperate escape or finishing blow on a badly wounded boss can go higher.
- If the action targets a specific enemy from the ACTIVE COMBAT list, name it exactly in targetEnemy; otherwise null.
- Keep the reaction SHORT (1-2 sentences) and describe only the ATTEMPT, not its outcome — whether it lands is decided by the roll, not by you.
- Never invent a new enemy, never resolve who wins the fight, never grant loot or clear the encounter yourself — the engine does that once the roll resolves.
${GROUNDED_ENCOUNTER_CONTRACT}
${PLAYER_AUTHORSHIP_CONTRACT}

Respond with JSON only:
{
  "reaction": "1-2 sentences describing only the attempt, not its outcome",
  "combatIntent": "attack|defend|flee|hide|negotiate",
  "targetEnemy": "exact enemy name from ACTIVE COMBAT, or null",
  "awaitingRoll": true,
  "rollContext": {"stat":"str|dex|con|int|wis|cha","dc":number,"diceType":"d20","description":"string","successDescription":"string","failDescription":"string","critSuccessDescription":"string|null","critFailDescription":"string|null","isDramatic":true,"modifier":0}
}`;

function buildCombatStateBlock(combatState: WorldState['combatState']): string {
  if (!combatState?.inCombat) return '';
  const enemies = combatState.enemies || [];
  const list = enemies.length > 0
    ? enemies.map(enemy => `${enemy.name} (${enemy.isDefeated ? 'defeated' : enemy.condition})`).join(', ')
    : `${combatState.enemyName} (${combatState.enemyCondition})`;
  return `ACTIVE COMBAT — round ${combatState.roundNumber}. Enemies: ${list}.\n`;
}

function buildContestStateBlock(skillChallenge: NonNullable<WorldState['sceneState']>['skillChallenge']): string {
  if (!skillChallenge) return '';
  const stakes = skillChallenge.stakesDescription || skillChallenge.stakes;
  return `ACTIVE CONTEST (${skillChallenge.contestType || 'contest'}) — ${skillChallenge.objective}. Progress: ${skillChallenge.successes}/${skillChallenge.targetSuccesses} successes, ${skillChallenge.failures}/${skillChallenge.maxFailures} failures. Stakes: ${stakes}.\n`;
}

const COMBAT_INTENTS = new Set<MicroCombatIntent>(['attack', 'defend', 'flee', 'hide', 'negotiate']);

function cleanCombatIntent(value: unknown): MicroCombatIntent | undefined {
  const lowered = asString(value)?.toLowerCase();
  return lowered && COMBAT_INTENTS.has(lowered as MicroCombatIntent) ? (lowered as MicroCombatIntent) : undefined;
}

const CONTEST_INTENTS = new Set<MicroContestIntent>(['attempt', 'abandon']);

function cleanContestIntent(value: unknown): MicroContestIntent | undefined {
  const lowered = asString(value)?.toLowerCase();
  return lowered && CONTEST_INTENTS.has(lowered as MicroContestIntent) ? (lowered as MicroContestIntent) : undefined;
}

const CONTEST_TYPES = new Set<NonCombatContestType>(['heist', 'social', 'gambling', 'chase', 'other']);

function cleanContestType(value: unknown): NonCombatContestType | undefined {
  const lowered = asString(value)?.toLowerCase();
  return lowered && CONTEST_TYPES.has(lowered as NonCombatContestType) ? (lowered as NonCombatContestType) : undefined;
}

function cleanStartContest(value: unknown): ContestSeed | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const objective = asString(record.objective);
  if (!objective) return undefined;
  return {
    objective,
    contestType: cleanContestType(record.contestType) || 'other',
    stakesDescription: asString(record.stakesDescription) || '',
    onSuccessHint: asString(record.onSuccessHint) || '',
    onFailureHint: asString(record.onFailureHint) || '',
  };
}

// Guarantees a combat micro-action always has a rollContext to resolve
// against, even if the model's response was malformed — a combat action must
// never silently fall through to the no-roll flavor path.
function fallbackCombatRollContext(intent: MicroCombatIntent, action: string): RollContext {
  const byIntent: Record<MicroCombatIntent, { stat: RollContext['stat']; dc: number }> = {
    attack: { stat: 'str', dc: 13 },
    defend: { stat: 'con', dc: 12 },
    flee: { stat: 'dex', dc: 14 },
    hide: { stat: 'dex', dc: 14 },
    negotiate: { stat: 'cha', dc: 15 },
  };
  const base = byIntent[intent];
  return {
    stat: base.stat,
    dc: base.dc,
    diceType: 'd20',
    description: action || `attempt to ${intent}`,
    successDescription: 'It works.',
    failDescription: "It doesn't.",
    isDramatic: true,
    modifier: 0,
  };
}

// Guarantees a contest attempt always has a rollContext to resolve against,
// even if the model's response was malformed — mirrors
// fallbackCombatRollContext's belt-and-suspenders role for the combat path.
function fallbackContestRollContext(action: string): RollContext {
  return {
    stat: 'wis',
    dc: 13,
    diceType: 'd20',
    description: action || 'press the attempt',
    successDescription: 'It works.',
    failDescription: "It doesn't.",
    isDramatic: true,
    modifier: 0,
  };
}

function characterSummary(character: Character): string {
  return `${character.name} — ${character.race} ${character.class} L${character.level}, HP ${character.hp}/${character.max_hp}`;
}

function clampMinor(value: unknown, min: number, max: number): number | undefined {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
  if (num === undefined) return undefined;
  return Math.max(min, Math.min(max, num));
}

function cleanMinorLoot(value: unknown): InventoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const validTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const items = value
    .map(item => (item && typeof item === 'object' ? item as Record<string, unknown> : undefined))
    .filter((item): item is Record<string, unknown> => !!item)
    .map(item => {
      const name = asString(item.name);
      if (!name) return undefined;
      const type = asString(item.type);
      const cleaned: InventoryItem = {
        id: asString(item.id) || crypto.randomUUID(),
        name,
        description: asString(item.description) || '',
        quantity: 1,
        type: validTypes.has(type || '') ? (type as InventoryItem['type']) : 'misc',
        value: clampMinor(item.value, 0, 25),
      };
      return cleaned;
    })
    .filter((item): item is InventoryItem => !!item)
    .slice(0, 1); // micro-actions grant at most one small item
  return items.length > 0 ? items : undefined;
}

function cleanDispositionNudge(value: unknown): MicroActionResult['npcDispositionNudge'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const name = asString(record.name);
  if (!name) return undefined;
  const delta = clampMinor(record.delta, -10, 10);
  if (!delta) return undefined;
  return { name, delta, note: asString(record.note) };
}

export function parseMicroActionResponse(parsed: Record<string, unknown>): MicroActionResult {
  const combatIntent = cleanCombatIntent(parsed.combatIntent);
  // Combat and contest classification are mutually exclusive per call (the
  // system prompt swapped in already guarantees at most one is active), but
  // guard defensively anyway: combat always wins if both somehow appear.
  const contestIntent = combatIntent ? undefined : cleanContestIntent(parsed.contestIntent);
  const reaction = asString(parsed.reaction) || 'Nothing changes for now.';
  const rawRollContext = cleanRollContext(parsed.rollContext);
  // A brand-new contest can only be proposed from the free-roam path (no
  // combat/contest intent already classified this call).
  const rawStartContest = (combatIntent || contestIntent) ? undefined : cleanStartContest(parsed.startContest);

  let rollContext = rawRollContext;
  let awaitingRoll: boolean;
  if (combatIntent) {
    // A combat micro-action always needs a roll — force it even if the
    // model's response was malformed or forgot to set awaitingRoll, using a
    // sane fallback rollContext so the encounter can never silently stall.
    rollContext = rawRollContext || fallbackCombatRollContext(combatIntent, reaction);
    awaitingRoll = true;
  } else if (contestIntent === 'attempt') {
    rollContext = rawRollContext || fallbackContestRollContext(reaction);
    awaitingRoll = true;
  } else if (contestIntent === 'abandon') {
    awaitingRoll = false;
  } else if (rawStartContest) {
    // A newly-recognized contest can only start alongside its own first real
    // roll — a startContest with no accompanying roll is dropped rather than
    // leaving a half-started state.
    awaitingRoll = parsed.awaitingRoll === true && !!rawRollContext;
  } else {
    awaitingRoll = parsed.awaitingRoll === true && !!rollContext;
  }

  const revealedClueIds = Array.isArray(parsed.revealedClueIds)
    ? parsed.revealedClueIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 3)
    : [];
  return {
    reaction,
    awaitingRoll,
    rollContext: awaitingRoll ? rollContext : undefined,
    combatIntent,
    targetEnemy: combatIntent ? asString(parsed.targetEnemy) : undefined,
    contestIntent,
    startContest: awaitingRoll && rawStartContest ? rawStartContest : undefined,
    // A roll is pending — don't also apply flavor consequences until it resolves.
    npcDispositionNudge: awaitingRoll ? undefined : cleanDispositionNudge(parsed.npcDispositionNudge),
    discoveredObject: awaitingRoll ? undefined : asString(parsed.discoveredObject),
    revealedClueIds: awaitingRoll ? [] : revealedClueIds,
    minorLoot: awaitingRoll ? undefined : cleanMinorLoot(parsed.minorLoot),
    minorHpChange: awaitingRoll ? undefined : clampMinor(parsed.minorHpChange, -5, 5),
    minorGoldChange: awaitingRoll ? undefined : clampMinor(parsed.minorGoldChange, -10, 25),
  };
}

export async function runMicroAction(
  openai: ChatClient,
  log: AiCallLogger,
  args: {
    action: string;
    character: Character;
    worldState: WorldState;
    worldBible: WorldBible;
    sceneInteractables: SceneInteractable[];
    recentFreeRoam?: { action: string; reaction: string }[];
  },
): Promise<MicroActionResult> {
  const { action, character, worldState, worldBible, sceneInteractables } = args;
  const currentSubLocation = worldState.characterSubLocations?.[character.id];
  const inCombat = !!worldState.combatState?.inCombat;
  // Combat always takes priority (it has its own dedicated prompt/plumbing).
  // A contest can only be the active fast-path system when no combat is live.
  const activeContest = !inCombat ? worldState.sceneState?.skillChallenge : undefined;
  const systemPrompt = inCombat
    ? COMBAT_MICRO_ACTION_SYSTEM_PROMPT
    : activeContest
    ? CONTEST_MICRO_ACTION_SYSTEM_PROMPT
    : MICRO_ACTION_SYSTEM_PROMPT;
  const user = `${buildCombatStateBlock(worldState.combatState)}${buildContestStateBlock(activeContest)}SCENE: ${worldState.currentLocation || 'unknown location'}${currentSubLocation ? ` — inside ${currentSubLocation}` : ''} | ${worldState.timeOfDay || 'unknown time'}, ${worldState.weather || 'unclear weather'}
${formatSceneInteractablesBlock(sceneInteractables)}
${buildCompanionsPromptBlock(worldState.companions)}
${buildClueBankBlock(worldState)}

CHARACTER: ${characterSummary(character)}

${args.recentFreeRoam && args.recentFreeRoam.length > 0 ? `RECENT FREE-ROAM (this scene, since the last full turn):
${args.recentFreeRoam.slice(-5).map(entry => `- ${entry.action} → ${entry.reaction}`).join('\n')}` : '(no free-roam actions yet this scene)'}

MICRO-ACTION: ${action}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: user },
    ],
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0].message.content || '{}';
  const parsed = parseJsonRecord(content);
  log('microAction', { characterId: character.id, action, rawResponse: content, worldBibleEra: worldBible.era, inCombat, hasActiveContest: !!activeContest });
  const result = parseMicroActionResponse(parsed);
  // Belt-and-suspenders: even if the model somehow didn't classify an intent
  // while combat is active, force one rather than letting a live fight fall
  // through to the flavor-only free-roam path.
  if (inCombat && !result.combatIntent) {
    const forcedIntent: MicroCombatIntent = 'attack';
    return {
      ...result,
      combatIntent: forcedIntent,
      awaitingRoll: true,
      rollContext: result.rollContext || fallbackCombatRollContext(forcedIntent, action),
    };
  }
  // Same belt-and-suspenders guarantee for an active contest: never let it
  // silently stall because the model forgot to classify an intent.
  if (activeContest && !inCombat && !result.contestIntent) {
    return {
      ...result,
      contestIntent: 'attempt',
      awaitingRoll: true,
      rollContext: result.rollContext || fallbackContestRollContext(action),
    };
  }
  return result;
}

// Templates the outcome of a resolved micro-action roll without a second AI
// call — the rollContext's own success/fail/crit text (authored by the first
// call) already carries the flavor, matching the convention used elsewhere
// (see gameDirector.buildAwaitingRollNarration) for turning a resolved roll
// into narration cheaply.
export function narrateMicroActionRollOutcome(
  rollContext: RollContext,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
): string {
  if (isCritSuccess && rollContext.critSuccessDescription) return rollContext.critSuccessDescription;
  if (isCritFail && rollContext.critFailDescription) return rollContext.critFailDescription;
  return success ? rollContext.successDescription : rollContext.failDescription;
}
