import type { Character, InventoryItem, RollContext, SceneInteractable, WorldBible, WorldState } from '../../../shared/types';
import { GROUNDED_ENCOUNTER_CONTRACT, PLAYER_AUTHORSHIP_CONTRACT } from './aiPromptContracts';
import { asString, cleanRollContext } from './narrationResponseParser';
import { parseJsonRecord } from './aiResponseParser';
import { buildCompanionsPromptBlock } from './companionSystem';
import { buildClueBankBlock } from './mysteryClueSystem';
import { formatSceneInteractablesBlock } from './sceneInteractableSystem';

export type ChatClient = {
  chat: { completions: { create(args: any): Promise<any> } };
};
type AiCallLogger = (fn: string, data: Record<string, unknown>) => void;

export type MicroCombatIntent = 'attack' | 'defend' | 'flee' | 'hide' | 'negotiate';

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
- If this action concretely reveals one of the MYSTERY CLUE BANK entries given in context, list its exact id in revealedClueIds — never invent a new clue.
- If a specific NPC's feelings shift because of this small interaction, you may set npcDispositionNudge with a SMALL delta (-10 to 10).
- If the player notices something new worth remembering (an object, a detail, a hint), set discoveredObject to a short phrase.
${GROUNDED_ENCOUNTER_CONTRACT}
${PLAYER_AUTHORSHIP_CONTRACT}

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
  "minorGoldChange": number | null
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

const COMBAT_INTENTS = new Set<MicroCombatIntent>(['attack', 'defend', 'flee', 'hide', 'negotiate']);

function cleanCombatIntent(value: unknown): MicroCombatIntent | undefined {
  const lowered = asString(value)?.toLowerCase();
  return lowered && COMBAT_INTENTS.has(lowered as MicroCombatIntent) ? (lowered as MicroCombatIntent) : undefined;
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
  const reaction = asString(parsed.reaction) || 'Nothing changes for now.';
  const rawRollContext = cleanRollContext(parsed.rollContext);
  // A combat micro-action always needs a roll — force it even if the model's
  // response was malformed or forgot to set awaitingRoll, using a sane
  // fallback rollContext so the encounter can never silently stall.
  const rollContext = combatIntent ? (rawRollContext || fallbackCombatRollContext(combatIntent, reaction)) : rawRollContext;
  const awaitingRoll = combatIntent ? true : (parsed.awaitingRoll === true && !!rollContext);
  const revealedClueIds = Array.isArray(parsed.revealedClueIds)
    ? parsed.revealedClueIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 3)
    : [];
  return {
    reaction,
    awaitingRoll,
    rollContext: awaitingRoll ? rollContext : undefined,
    combatIntent,
    targetEnemy: combatIntent ? asString(parsed.targetEnemy) : undefined,
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
  const inCombat = !!worldState.combatState?.inCombat;
  const user = `${buildCombatStateBlock(worldState.combatState)}SCENE: ${worldState.currentLocation || 'unknown location'} | ${worldState.timeOfDay || 'unknown time'}, ${worldState.weather || 'unclear weather'}
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
      { role: 'system' as const, content: inCombat ? COMBAT_MICRO_ACTION_SYSTEM_PROMPT : MICRO_ACTION_SYSTEM_PROMPT },
      { role: 'user' as const, content: user },
    ],
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0].message.content || '{}';
  const parsed = parseJsonRecord(content);
  log('microAction', { characterId: character.id, action, rawResponse: content, worldBibleEra: worldBible.era, inCombat });
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
