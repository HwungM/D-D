import type { Character, WorldBible, WorldState } from '../../../shared/types';
import { STYLE_ANTI_REPETITION } from './aiPromptContracts';
import { parseJsonRecord } from './aiResponseParser';
import { characterGenderLine } from './narrationPromptBuilder';
import { runRollOutcomeQualityGate } from './rollOutcomeQualityGate';

type ChatClient = {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: { role: 'system' | 'user'; content: string }[];
        temperature: number;
        response_format: { type: 'json_object' };
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
};

export type RollDegree =
  | 'crit_fail'
  | 'clear_fail'
  | 'near_miss'
  | 'partial_success'
  | 'clean_success'
  | 'crit_success';

export type RollOutcomeContext = {
  stat: string;
  description: string;
  successDescription: string;
  failDescription: string;
  critSuccessDescription?: string;
  critFailDescription?: string;
};

export type RollOutcomeResult = {
  narration: string;
  worldStateChanges?: Partial<WorldState>;
  hpChange?: number;
  goldChange?: number;
  suggestedActions: string[];
  sceneImagePrompt: string;
  isDeath?: boolean;
  isVictory?: boolean;
  isCombat?: boolean;
  loot?: unknown[];
};

type RollOutcomeLog = (fn: string, data: Record<string, unknown>) => void;

type RollOutcomeArgs = {
  rollResult: number;
  rollTotal: number;
  dc: number;
  success: boolean;
  isCritSuccess: boolean;
  isCritFail: boolean;
  rollContext: RollOutcomeContext;
  worldState: WorldState;
  character: Character;
  recentHistory: string[];
  openai: ChatClient;
  logAiCall?: RollOutcomeLog;
};

type CoopRollOutcomeArgs = Omit<RollOutcomeArgs, 'character' | 'recentHistory'> & {
  actingCharacter: Character;
  partnerCharacter: Character;
  actions: { characterId: string; characterName: string; action: string }[];
  worldBible: WorldBible;
  recentHistory: string[];
  rolls?: {
    characterId: string;
    characterName: string;
    stat: string;
    description: string;
    rollResult: number;
    rollTotal: number;
    dc: number;
    success: boolean;
    isCritSuccess?: boolean;
    isCritFail?: boolean;
  }[];
};

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

function cleanLoot(value: unknown): unknown[] | undefined {
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
        setName: asString(item.setName),
        setBonus: asString(item.setBonus),
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
    .slice(0, 3);

  return items.length > 0 ? items : undefined;
}

export function getDegreeOfSuccess(
  rollTotal: number,
  dc: number,
  isCritSuccess: boolean,
  isCritFail: boolean,
): { label: string; degree: RollDegree; margin: number } {
  if (isCritSuccess) return { label: 'CRITICAL SUCCESS (natural 20)', degree: 'crit_success', margin: rollTotal - dc };
  if (isCritFail) return { label: 'CRITICAL FAILURE (natural 1)', degree: 'crit_fail', margin: rollTotal - dc };
  const margin = rollTotal - dc;
  if (margin >= 4) return { label: `CLEAN SUCCESS (beat DC by ${margin})`, degree: 'clean_success', margin };
  if (margin >= 1) return { label: `PARTIAL SUCCESS (beat DC by only ${margin})`, degree: 'partial_success', margin };
  if (margin >= -3) return { label: `NEAR MISS (missed DC by ${Math.abs(margin)})`, degree: 'near_miss', margin };
  return { label: `CLEAR FAILURE (missed DC by ${Math.abs(margin)})`, degree: 'clear_fail', margin };
}

export function getRollFlavorHint(
  rollContext: RollOutcomeContext,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
): string {
  if (isCritSuccess && rollContext.critSuccessDescription) return rollContext.critSuccessDescription;
  if (isCritFail && rollContext.critFailDescription) return rollContext.critFailDescription;
  return success ? rollContext.successDescription : rollContext.failDescription;
}

export function parseRollOutcomeResponse(raw: string | null | undefined): RollOutcomeResult {
  const parsed = parseJsonRecord(raw);

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
    loot: cleanLoot(parsed.loot),
  };
}

const DEGREE_GUIDANCE: Record<RollDegree, string> = {
  crit_fail: 'CRITICAL FAILURE: Something goes dramatically wrong beyond just failing. A new complication emerges - a weapon drops, a secret is exposed, an enemy is emboldened, the situation escalates into something worse.',
  clear_fail: 'CLEAR FAILURE: Direct consequence, no ambiguity. A door closed, a suspicion confirmed, a resource spent for nothing. Don\'t soften it - but also have something happen AS a result of failing, not just absence of success.',
  near_miss: 'NEAR MISS: "Almost" - the player nearly had it. A minor setback or complication, not the full failure consequence. They slip but catch themselves. The lie almost holds. Partial information, partial progress. The story continues - just slightly worse.',
  partial_success: 'PARTIAL SUCCESS: They do it, but with a cost or complication. The door opens but they made noise. The persuasion works but the NPC wants something in return. The attack lands but leaves them exposed. Yes, AND something costs them.',
  clean_success: 'CLEAN SUCCESS: Exactly what was attempted, cleanly executed. No asterisks, no complications. A moment of competence. Let it feel good.',
  crit_success: 'CRITICAL SUCCESS: Exceed expectations dramatically. The task is accomplished AND something extra happens - an enemy is off-balance, a new opportunity appears, an ally is inspired, a bonus is earned. This is a highlight moment.',
};

export function buildRollOutcomePrompt(args: Omit<RollOutcomeArgs, 'openai' | 'logAiCall'>): { prompt: string; resultLabel: string; degree: RollDegree } {
  const {
    rollResult,
    rollTotal,
    dc,
    success,
    isCritSuccess,
    isCritFail,
    rollContext,
    worldState,
    character,
    recentHistory,
  } = args;
  const { label: resultLabel, degree } = getDegreeOfSuccess(rollTotal, dc, isCritSuccess, isCritFail);
  const flavorHint = getRollFlavorHint(rollContext, success, isCritSuccess, isCritFail);
  const combatState = worldState.combatState;
  const combatStakesBlock = combatState?.inCombat
    ? `
ACTIVE COMBAT - Round ${combatState.roundNumber}. Enemies: ${(combatState.enemies || []).filter(e => !e.isDefeated).map(e => `${e.name} (${e.condition})`).join(', ') || `${combatState.enemyName} (${combatState.enemyCondition})`}.
COMBAT STAKES: the enemies act on this outcome too. On near_miss, clear_fail, or crit_fail, an enemy's counterattack usually LANDS - apply it via hpChange (a typical hit costs ~10-20% of the character's max HP; bosses hit harder). On partial_success the attack succeeds but usually costs something - often a hit taken in exchange. Only clean_success and crit_success normally escape unscathed. Never narrate a wound without setting hpChange, and never set hpChange without narrating the hit.`
    : '';

  const prompt = `You are a DM resolving the outcome of a dice roll.
The player attempted: ${rollContext.description}
They rolled ${rollResult} + ${rollTotal - rollResult} (${rollContext.stat.toUpperCase()} modifier) = ${rollTotal} vs DC ${dc} - ${resultLabel}.
Flavor hint for this outcome: "${flavorHint}"

DEGREE OF SUCCESS DIRECTIVE:
${DEGREE_GUIDANCE[degree]}${combatStakesBlock}

Character: ${character.name} (${character.race} ${character.class}, Level ${character.level})${characterGenderLine(character)}
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

  return { prompt, resultLabel, degree };
}

function characterSummary(character: Character): string {
  return `${character.name} (${character.race} ${character.class}, Level ${character.level})${characterGenderLine(character)}
HP: ${character.hp}/${character.max_hp}
Inventory: ${character.inventory.slice(0, 5).map(i => i.name).join(', ') || 'nothing special'}
Available abilities: ${(character.abilities || []).filter(a => !a.currentCooldown || a.currentCooldown <= 0).slice(0, 5).map(a => a.name).join(', ') || 'none'}`;
}

export function buildCoopRollOutcomePrompt(args: Omit<CoopRollOutcomeArgs, 'openai' | 'logAiCall'>): { prompt: string; resultLabel: string; degree: RollDegree } {
  const {
    rollResult,
    rollTotal,
    dc,
    success,
    isCritSuccess,
    isCritFail,
    rollContext,
    worldState,
    worldBible,
    actingCharacter,
    partnerCharacter,
    actions,
    recentHistory,
    rolls,
  } = args;
  const { label: resultLabel, degree } = getDegreeOfSuccess(rollTotal, dc, isCritSuccess, isCritFail);
  const flavorHint = getRollFlavorHint(rollContext, success, isCritSuccess, isCritFail);
  const combatState = worldState.combatState;
  const combatStakesBlock = combatState?.inCombat
    ? `
ACTIVE COMBAT - Round ${combatState.roundNumber}. Enemies: ${(combatState.enemies || []).filter(e => !e.isDefeated).map(e => `${e.name} (${e.condition})`).join(', ') || `${combatState.enemyName} (${combatState.enemyCondition})`}.
COMBAT STAKES: the enemies act on this outcome too. On near_miss, clear_fail, or crit_fail, an enemy's counterattack usually LANDS on the rolling character unless the narration clearly positions the partner as the target. Apply acting-character damage via hpChange. Never narrate a wound without setting hpChange.`
    : '';

  const actionLines = actions.map(action => `- ${action.characterName}: ${action.action}`).join('\n');
  const rollLines = rolls && rolls.length > 0
    ? rolls.map(roll => `- ${roll.characterName}: ${roll.rollResult} (${roll.stat.toUpperCase()} total ${roll.rollTotal}) vs DC ${roll.dc} — ${roll.success ? 'SUCCESS' : 'FAILURE'} for "${roll.description}"`).join('\n')
    : `- ${actingCharacter.name}: ${rollResult} (${rollContext.stat.toUpperCase()} total ${rollTotal}) vs DC ${dc} — ${success ? 'SUCCESS' : 'FAILURE'}`;

  const prompt = `You are a DM resolving ONE SHARED CO-OP dice roll.
This is not a solo beat. The roll outcome must resolve BOTH players' submitted actions as one coordinated scene.

Roll attempted: ${rollContext.description}
Rolling character: ${actingCharacter.name}
Partner character: ${partnerCharacter.name}
They rolled ${rollResult} + ${rollTotal - rollResult} (${rollContext.stat.toUpperCase()} modifier) = ${rollTotal} vs DC ${dc} - ${resultLabel}.
Flavor hint for this outcome: "${flavorHint}"

DEGREE OF SUCCESS DIRECTIVE:
${DEGREE_GUIDANCE[degree]}${combatStakesBlock}

WORLD: ${worldBible.era} | ${worldBible.magicSystem}
Central conflict: ${worldBible.centralConflict || 'unknown'}
Location: ${worldState.currentLocation || 'unknown'}
Scene state: ${worldState.currentSceneSummary || 'use recent history and the roll outcome'}

CHARACTERS:
${characterSummary(actingCharacter)}

${characterSummary(partnerCharacter)}

SUBMITTED CO-OP ACTIONS TO HONOR:
${actionLines}

ROLL RESULTS TO HONOR:
${rollLines}

Recent history:
${recentHistory.slice(-6).join('\n') || '(none)'}

Write vivid outcome narration (120-180 words) that precisely matches the ${resultLabel} degree.
Requirements:
- Name both ${actingCharacter.name} and ${partnerCharacter.name}.
- Resolve every roll result listed above AND show how the two submitted actions helped, complicated, protected, or changed the outcome.
- Do not write the partner as passive scenery.
- If the result fails, the failure should affect the shared scene, not erase the partner's input.
- Suggested actions should be 3-4 optional ideas grounded in the changed situation after this shared roll.

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

  return { prompt, resultLabel, degree };
}

export async function generateRollOutcomeFromService(args: RollOutcomeArgs): Promise<RollOutcomeResult> {
  const { openai, logAiCall, character } = args;
  const { prompt } = buildRollOutcomePrompt(args);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master Dungeon Master resolving dice roll outcomes in a dynamic, genre-fluid fantasy sandbox RPG. Match the outcome tone to the current scene and world bible. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
      { role: 'system', content: STYLE_ANTI_REPETITION },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = parseRollOutcomeResponse(content);
  const gated = await runRollOutcomeQualityGate(openai, logAiCall, {
    ...args,
    result: parsed,
    isCoop: false,
    actorNames: [character.name],
  });

  logAiCall?.('generateRollOutcome', {
    character: character.id,
    model: 'gpt-4o',
    temperature: 0.7,
    prompt,
    rawResponse: content,
    parsed: gated,
  });

  return gated;
}

export async function generateCoopRollOutcomeFromService(args: CoopRollOutcomeArgs): Promise<RollOutcomeResult> {
  const { openai, logAiCall, actingCharacter } = args;
  const { prompt } = buildCoopRollOutcomePrompt(args);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a master Dungeon Master resolving co-op dice roll outcomes. Honor both players as separate characters in one shared scene. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
      { role: 'system', content: STYLE_ANTI_REPETITION },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = parseRollOutcomeResponse(content);
  const gated = await runRollOutcomeQualityGate(openai, logAiCall, {
    ...args,
    result: parsed,
    isCoop: true,
    actorNames: [args.actingCharacter.name, args.partnerCharacter.name],
    rolls: args.rolls,
  });

  logAiCall?.('generateCoopRollOutcome', {
    character: actingCharacter.id,
    partner: args.partnerCharacter.id,
    model: 'gpt-4o',
    rollResult: args.rollResult,
    rollTotal: args.rollTotal,
    dc: args.dc,
    success: args.success,
    rawResponse: content,
    parsed: gated,
  });

  return gated;
}
