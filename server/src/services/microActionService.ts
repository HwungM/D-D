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
  const rollContext = cleanRollContext(parsed.rollContext);
  const awaitingRoll = parsed.awaitingRoll === true && !!rollContext;
  const revealedClueIds = Array.isArray(parsed.revealedClueIds)
    ? parsed.revealedClueIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 3)
    : [];
  return {
    reaction: asString(parsed.reaction) || 'Nothing changes for now.',
    awaitingRoll,
    rollContext: awaitingRoll ? rollContext : undefined,
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
  const user = `SCENE: ${worldState.currentLocation || 'unknown location'} | ${worldState.timeOfDay || 'unknown time'}, ${worldState.weather || 'unclear weather'}
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
      { role: 'system' as const, content: MICRO_ACTION_SYSTEM_PROMPT },
      { role: 'user' as const, content: user },
    ],
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0].message.content || '{}';
  const parsed = parseJsonRecord(content);
  log('microAction', { characterId: character.id, action, rawResponse: content, worldBibleEra: worldBible.era });
  return parseMicroActionResponse(parsed);
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
