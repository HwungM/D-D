import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption, CampaignJournalEntry, CharacterHistoryEntry, Antagonist, RollContext, CharacterOnlineStatus, NpcMemory, CombatEnemy, Recipe, Companion } from '../../../shared/types';
import {
  CO_OP_SINGLE_CAMERA_RULE,
  STYLE_ANTI_REPETITION,
  TURN_RESOLUTION_CONTRACT,
} from './aiPromptContracts';
import { parseJsonRecord, parseJsonValueOrFallback } from './aiResponseParser';
import { repairNarrationDraftIfNeeded, type AiTurnRepairMessage } from './aiTurnRepairSystem';
import { ART_STYLE_PREFIX, EVERREALM_ART_BIBLE } from './everrealmArtPrompt';
import { cleanTurnOutcome, type TurnOutcome } from './narrationQualityValidator';
import { StreamingNarrationParser } from './streamingNarrationParser';
import {
  generateStorySeed as generateStorySeedFromService,
  generateWorldBible as generateWorldBibleFromService,
  type CampaignGenerationPlayerPreferences,
} from './campaignGenerationService';
import { runStoryDirector as runStoryDirectorFromService, type StoryDirectorBeat } from './storyDirectorService';
import {
  extractFutureHooks as extractFutureHooksFromService,
  generateProactiveEvent as generateProactiveEventFromService,
  type FutureHook,
  type ProactiveEvent,
} from './worldMotionService';
import {
  buildCampaignContextBlock,
  buildCombatBlock,
  buildEndgameDirectiveBlock,
  buildLoreContextBlock,
  buildNarrationMessages,
  buildNpcQuestMapBlock,
  buildStatHints,
  characterGenderLine,
  DM_SYSTEM_PROMPT,
  type NarrationCampaignContext,
} from './narrationPromptBuilder';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export type NarrationResult = {
  narration: string;
  turnOutcome?: TurnOutcome;
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
  achievementUnlocked?: { title: string; description: string };
  comboBonus?: boolean;
  newRecipe?: Recipe;
  companion?: Companion | null;
  factionRepChange?: { faction: string; delta: number };
  antagonistUpdate?: { name: string; newStep?: string; lastAction?: string; nowKnowsPlayers?: boolean };
  proactiveEvent?: boolean;
  awaitingRoll?: boolean;
  rollContext?: RollContext;
  sceneMomentum?: 'advancing' | 'stalling' | 'transitioning';
  pacingMode?: 'exploration' | 'tension' | 'climax' | 'resolution';
  scenePurpose?: 'explore' | 'gather_info' | 'combat' | 'social' | 'travel' | 'rest' | 'climax';
  newForeshadowing?: { id: string; description: string; type: string }[];
  paidOffForeshadowing?: string[];
  resolvedFutureHooks?: string[];
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
  character1Changes?: { hpChange?: number; loot?: NarrationResult['loot']; statusEffectChanges?: NarrationResult['statusEffectChanges']; goldChange?: number; isDeath?: boolean; deathDescription?: string; isRest?: boolean; abilityUsed?: string; consumedItems?: string[] };
  character2Changes?: { hpChange?: number; loot?: NarrationResult['loot']; statusEffectChanges?: NarrationResult['statusEffectChanges']; goldChange?: number; isDeath?: boolean; deathDescription?: string; isRest?: boolean; abilityUsed?: string; consumedItems?: string[] };
  actingCharacterId?: string;
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
        setName: asString(item.setName),
        setBonus: asString(item.setBonus),
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

const VALID_ITEM_TYPES = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);

function cleanCompanion(value: unknown): Companion | null | undefined {
  if (value === null) return null;
  const record = asRecord(value);
  if (!record) return undefined;
  const name = asString(record.name);
  const species = asString(record.species);
  const description = asString(record.description);
  if (!name || !species || !description) return undefined;
  return {
    name,
    species,
    description,
    bondLevel: clampNumber(record.bondLevel, 1, 5) || 1,
    abilityHint: asString(record.abilityHint),
  };
}

function cleanFactionRepChange(value: unknown): { faction: string; delta: number } | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const faction = asString(record.faction);
  if (!faction) return undefined;
  const delta = clampNumber(record.delta, -20, 20);
  if (delta === undefined || delta === 0) return undefined;
  return { faction, delta };
}

function cleanRecipe(value: unknown): Recipe | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = asString(record.id);
  const name = asString(record.name);
  const description = asString(record.description);
  const resultRecord = asRecord(record.resultItem);
  const resultName = resultRecord && asString(resultRecord.name);
  if (!id || !name || !description || !resultRecord || !resultName) return undefined;
  const resultType = asString(resultRecord.type);
  const materials = Array.isArray(record.materials)
    ? record.materials
        .map(asRecord)
        .filter((m): m is Record<string, unknown> => !!m)
        .map(m => ({ name: asString(m.name) || '', quantity: clampNumber(m.quantity, 1, 99) || 1 }))
        .filter(m => !!m.name)
        .slice(0, 5)
    : [];
  if (materials.length === 0) return undefined;
  return {
    id,
    name,
    description,
    resultItem: {
      name: resultName,
      description: asString(resultRecord.description) || '',
      type: VALID_ITEM_TYPES.has(resultType || '') ? resultType as Recipe['resultItem']['type'] : 'misc',
      value: clampNumber(resultRecord.value, 0, 10000),
    },
    materials,
  };
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
    turnOutcome: cleanTurnOutcome(parsed.turnOutcome),
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
    achievementUnlocked: asRecord(parsed.achievementUnlocked) as NarrationResult['achievementUnlocked'] | undefined,
    comboBonus: asBoolean(parsed.comboBonus),
    newRecipe: cleanRecipe(parsed.newRecipe),
    companion: cleanCompanion(parsed.companion),
    factionRepChange: cleanFactionRepChange(parsed.factionRepChange),
    antagonistUpdate: asRecord(parsed.antagonistUpdate) as NarrationResult['antagonistUpdate'] | undefined,
    proactiveEvent: asBoolean(parsed.proactiveEvent),
    awaitingRoll,
    rollContext: awaitingRoll ? rollContext : undefined,
    sceneMomentum: ['advancing', 'stalling', 'transitioning'].includes(asString(parsed.sceneMomentum) || '') ? parsed.sceneMomentum as NarrationResult['sceneMomentum'] : 'advancing',
    pacingMode: ['exploration', 'tension', 'climax', 'resolution'].includes(asString(parsed.pacingMode) || '') ? parsed.pacingMode as NarrationResult['pacingMode'] : 'exploration',
    scenePurpose: ['explore', 'gather_info', 'combat', 'social', 'travel', 'rest', 'climax'].includes(asString(parsed.scenePurpose) || '') ? parsed.scenePurpose as NarrationResult['scenePurpose'] : 'explore',
    newForeshadowing: cleanForeshadowing(parsed.newForeshadowing),
    paidOffForeshadowing: cleanStringArray(parsed.paidOffForeshadowing, 5),
    resolvedFutureHooks: cleanStringArray(parsed.resolvedFutureHooks, 5),
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
// Debug logger gated on AI_DEBUG_LOGS=true. Appends one JSON line per AI call to
// server/logs/ai-debug.log so we can see whether the model ignored context or
// never received it. Never enabled by default; the log dir is gitignored.
function logAiCall(fn: string, data: Record<string, unknown>): void {
  if (process.env.AI_DEBUG_LOGS !== 'true') return;
  try {
    const dir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'ai-debug.log'),
      JSON.stringify({ ts: new Date().toISOString(), fn, ...data }) + '\n',
    );
  } catch { /* logging must never break gameplay */ }
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
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  let parsed = parseJsonRecord(content);

  const repair = await repairNarrationDraftIfNeeded({
    parsed,
    rawContent: content,
    isCoop: false,
    action,
    messages,
    buildRepairInstruction: issues => `The previous response failed quality validation because it did not concretely resolve the player's action:\n- ${issues.join('\n- ')}\n\nRewrite while preserving continuity. Do not add vague mystery language. Do not open with weather or ambient atmosphere. The player's action was: "${action}". You MUST reveal a specific fact OR call for a roll OR change the situation. Return the SAME JSON object with the same mechanical values (hpChange, loot, goldChange, awaitingRoll, etc.), changing only the narration, suggestedActions, and turnOutcome as needed.`,
    requestRepair: async repairMessages => {
      const retry = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: repairMessages,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });
      return retry.choices[0].message.content || '';
    },
  });
  parsed = repair.parsed;

  logAiCall('generateNarration', {
    character: character.id, action, model: 'gpt-4o', temperature: 0.7,
    messages, rawResponse: content, parsed, validationIssues: repair.issues, retried: repair.retried,
  });

  return parseNarrationResponse(parsed);
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

  const streamingParser = new StreamingNarrationParser();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    for (const token of streamingParser.push(delta)) {
      yield { type: 'token', token };
    }
  }

  // Parse full buffer and yield done event
  try {
    const parsed = parseJsonRecord(streamingParser.getRawJson());
    yield { type: 'done', result: parseNarrationResponse(parsed) };
  } catch {
    yield { type: 'done', result: parseNarrationResponse({ narration: 'The world holds its breath...' }) };
  }
}

export async function generateCoopNarration(
  actions: { character: Character; action: string }[],
  worldState: WorldState,
  worldBible: WorldBible,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null
): Promise<NarrationResult & { character1Changes?: NarrationResult['character1Changes']; character2Changes?: NarrationResult['character2Changes']; character1SuggestedActions?: string[]; character2SuggestedActions?: string[] }> {
  if (actions.length < 2) throw new Error('generateCoopNarration requires exactly 2 actions');

  const [a1, a2] = actions;
  const c1 = a1.character;
  const c2 = a2.character;

  function charBlock(c: Character, label: string): string {
    const s = c.stats;
    const abilities = (c.abilities || []).filter(a => !a.currentCooldown || a.currentCooldown <= 0);
    return `${label}: ${c.name} (${c.race} ${c.class}, Level ${c.level})${characterGenderLine(c)}
HP: ${c.hp}/${c.max_hp} | Gold: ${c.gold}
Stats: STR ${s.str} DEX ${s.dex} CON ${s.con} INT ${s.int} WIS ${s.wis} CHA ${s.cha}
BACKSTORY: ${c.backstory || 'Unknown origins'}
${c.status_effects && c.status_effects.length > 0 ? `Status Effects: ${c.status_effects.map(e => e.name).join(', ')}` : ''}
Abilities available: ${abilities.length > 0 ? abilities.map(a => `${a.name}${a.mechanic ? ` (${a.mechanic})` : ''}`).join('; ') : 'none'}
Notable inventory: ${c.inventory.slice(0, 4).map(i => i.name).join(', ') || 'nothing special'}
STAT CONTEXT (factor into suggestedActions): ${buildStatHints(s) || 'balanced stats'}`;
  }

  const spotlightBalance = worldState.spotlightBalance || {}
  const char1Spotlights = spotlightBalance[c1.id] || 0
  const char2Spotlights = spotlightBalance[c2.id] || 0
  const spotlightDiff = char1Spotlights - char2Spotlights

  const spotlightDirective = spotlightDiff > 2
    ? `SPOTLIGHT NOTE: ${c1.name} has had significantly more spotlight moments (${char1Spotlights} vs ${char2Spotlights}). This scene should lean toward ${c2.name} - their action drives the outcome, or the scene's emotional center lands on their backstory, expertise, or relationships. A quiet beat built around ${c2.name} counts as much as a heroic one. Make their contribution feel decisive.`
    : spotlightDiff < -2
    ? `SPOTLIGHT NOTE: ${c2.name} has had significantly more spotlight moments (${char2Spotlights} vs ${char1Spotlights}). This scene should lean toward ${c1.name} - their action drives the outcome, or the scene's emotional center lands on their backstory, expertise, or relationships. A quiet beat built around ${c1.name} counts as much as a heroic one. Make their contribution feel decisive.`
    : `SPOTLIGHT NOTE: Spotlight balance is even (${char1Spotlights} vs ${char2Spotlights}). Keep it that way: give each character a distinct, personal contribution this scene - if one gets the decisive action beat, give the other the emotional, social, or clever beat.`

  const worldContext = `WORLD: ${worldBible.era} | ${worldBible.magicSystem}
Location: ${worldState.currentLocation || 'Unknown'} | Time: ${worldState.timeOfDay || 'unknown'} | Weather: ${worldState.weather || 'unclear'}
Central conflict: ${worldBible.centralConflict || ''}
Visual style: ${worldBible.artBible?.masterPrompt || EVERREALM_ART_BIBLE.masterPrompt}
${buildLoreContextBlock(worldBible)}
${buildNpcQuestMapBlock(worldState, campaignContext)}
${buildEndgameDirectiveBlock(worldState)}
${buildCombatBlock(worldState.combatState, `Party HP: ${c1.name} ${c1.hp}/${c1.max_hp} | ${c2.name} ${c2.hp}/${c2.max_hp}`)}
${worldState.activeQuests && worldState.activeQuests.filter(q => q.status === 'active').length > 0 ? `Active quests: ${worldState.activeQuests.filter(q => q.status === 'active').map(q => q.title).join(', ')}` : ''}
${worldState.unlockedAchievements && worldState.unlockedAchievements.length > 0 ? `unlockedAchievements: ${worldState.unlockedAchievements.map(a => a.title).join(', ')}` : ''}
${worldState.knownRecipes && worldState.knownRecipes.length > 0 ? `knownRecipes: ${worldState.knownRecipes.map(r => `${r.name} (needs: ${r.materials.map(m => `${m.quantity}x ${m.name}`).join(', ')} -> ${r.resultItem.name})`).join('; ')}` : ''}
${worldState.companion ? `companion: ${worldState.companion.name} the ${worldState.companion.species} (bond level ${worldState.companion.bondLevel}) - ${worldState.companion.description}` : ''}
${worldState.factionStandings && Object.keys(worldState.factionStandings).length > 0 ? `faction standings: ${Object.entries(worldState.factionStandings).map(([f, v]) => `${f} (${v})`).join(', ')}` : ''}
Scene purpose: ${worldState.sceneState?.purpose || 'explore'} | Exchanges in scene: ${worldState.sceneState?.exchangeCount ?? 0} | Pacing mode: ${worldState.sceneState?.pacingMode || 'exploration'}${worldState.sceneState && worldState.sceneState.stalledCount >= 2 ? ` - STALL DETECTED (${worldState.sceneState.stalledCount} consecutive exchanges without story advancement), consider introducing a complication.` : ''}${(worldState.sceneState?.cluesThisScene ?? 0) >= 2 ? `
⚠ CLUE-TO-CHOICE ESCALATION (this scene has already handed out enough lore): do NOT produce another pure-exposition paragraph about the same object/NPC. This turn MUST introduce ONE of: a meaningful choice the party must make, a roll with real stakes, a complication or danger, a new location/lead, an NPC demand or pushback, or a clear scene exit. The mystery object stops being a Q&A booth - it forces a decision or sends them somewhere.` : ''}
${worldState.activeNPC ? `Currently talking to: ${worldState.activeNPC}` : ''}

${buildCampaignContextBlock(campaignContext, worldBible, Math.max(c1.level, c2.level))}

${charBlock(c1, 'CHARACTER 1')}

${charBlock(c2, 'CHARACTER 2')}

RECENT HISTORY:
${recentHistory.slice(-6).join('\n')}

${campaignContext?.railDirectives ? `\n${campaignContext.railDirectives}\n` : ''}
${campaignContext?.continuityDirectives ? `\n${campaignContext.continuityDirectives}\n` : ''}

CHARACTER 1 (${c1.name}, id: ${c1.id}) ACTION: ${a1.action}
CHARACTER 2 (${c2.name}, id: ${c2.id}) ACTION: ${a2.action}
${spotlightDirective ? `\n${spotlightDirective}` : ''}
Write ONE unified narration (200-300 words) weaving both actions together. Apply the CO-OP NARRATION RULES.

DICE ROLLS & COMBAT APPLY HERE TOO - same as solo play:
- If either character's action requires a skill check (including pickpocketing/theft - this ALWAYS requires a roll), set awaitingRoll: true, populate rollContext, and set actingCharacterId to whichever character (id) is making that roll. Write a tense setup narration that builds to the roll without resolving it - DO NOT resolve either character's action's outcome in this case.
- For minor/incidental checks where you'd rather resolve the outcome immediately rather than pause for a player roll, set diceRequired: true with diceType/diceDC/diceDescription instead of awaitingRoll - the engine rolls for whichever character is acting (actingCharacterId, or Character 1 if ambiguous) and folds the result into this turn's narration.
- MANDATORY ROLL TRIGGERS apply here too (these are NOT auto-successes): a physical feat against real resistance (force/lift/bend/break/uproot/climb/clear a blocked path - "use strength to lift the sapling" is a STR check); extracting a name/secret/guarded truth from a reluctant or evasive NPC (CHA persuade/intimidate or WIS insight); identifying hidden magic or recalling obscure lore when the answer is non-obvious (INT/WIS). FAILURE MUST BE POSSIBLE - do not resolve attempt after attempt as a smooth success; if several actions in a row all just worked with no roll, the scene has no stakes. Still skip rolls for the trivial or purely expressive (looking at something in plain sight, party conversation, an automatic detection cantrip with no opposition).
- If the players provoke or engage a hostile creature, do not narrate combat away - set isCombat: true, isHighStakes appropriately, and populate combatEnemies[] with real stats so the fight actually starts.
- Follow PICKPOCKETING & THEFT RULES, CO-OP DIVERSION & TEAMWORK THEFT, MULTI-ENEMY COMBAT RULES, and COMBAT STAKES & DAMAGE RULES exactly as written for solo play.
- COMBAT STAKES are per character here: enemy damage lands via character1Changes.hpChange / character2Changes.hpChange. Spread the threat between both characters across rounds - don't always hit the same one, and don't let both walk through a real fight untouched.
- HIGH STAKES DETECTION applies here too: follow the HIGH STAKES DETECTION - MANDATORY TRIGGERS rules. When isHighStakes: true, generate 2-3 choiceCards that frame the decision for BOTH characters together (the choice the party makes as a unit), and set suggestedActions: [].
- Boss fights apply here too: follow the MULTI-ENEMY COMBAT RULES boss-fight guidance - set isBossFight: true on combat start, and bossPhaseAdvance: true with a dramatic transformation when a boss reaches "critical".
- Achievements apply here too: follow ACHIEVEMENT RULES - award achievementUnlocked occasionally for memorable moments by either character.
- WEATHER & TIME OF DAY RULES apply here too - factor timeOfDay/weather into difficulty, NPC availability, and pacing for both characters.
- SHOP/MERCHANT RULES apply here too - if either character encounters a merchant, set isMerchant: true and populate shopItems with 4-8 items appropriate to the setting (varied types: weapons, armor, potions, curiosities). Never stock a merchant with a single item.
- NPC conversation tracking applies here too - set activeNPC to the name of whichever NPC either character is actively talking to, or null if the conversation ended or the party moved on.
- QUIET CHARACTER MOMENTS and PARTY BOND & ROMANCE BEATS apply here too. If the moment is calm and the players are engaging with each other (talking, teasing, planning, an affectionate gesture), let that BE the scene - weave it warmly, give the world one small reaction, and do not interrupt it with a manufactured threat. Both characters must have concrete presence in every narration.
- IMPORTANT: If any named NPC appears, speaks, is referenced as a contact, gives information, changes disposition, or becomes the active conversation partner, update worldStateChanges.npcMemory with that NPC's name, disposition, notes, lastMet, metCharacters, interactionCount, role, gender, relationshipScore, and relationshipLabel. Adjust relationshipScore based on the interaction (+/- 5 to 50 depending on impact). When updating a known NPC, carry their established notes forward and append what changed (notes REPLACE the old ones). Update worldStateChanges.activeQuests for quest events. Update worldStateChanges.currentLocation if moving.

COMBO MOVES:
- If the two submitted actions are clearly coordinated and complementary (one distracts while the other strikes/steals, one creates an opening the other exploits, one buffs/heals while the other attacks, pincer/flanking, etc.), set comboBonus: true and narrate the synergy paying off with a tangible extra benefit (bonus damage, extra loot, an easier roll, avoided harm).
- If the actions are unrelated or work against each other, set comboBonus: false. Don't force combos that don't fit.

OPTIONAL SUGGESTIONS:
- suggestedActions are optional nudges, not required choices.
- PER-CHARACTER: each player sees their OWN list. character1SuggestedActions must fit Character 1's class, abilities, and stats; character2SuggestedActions must fit Character 2's. Never suggest the Bard's lute tricks to the Wizard or the Wizard's spells to the Bard.
- Return 3-4 ideas per character grounded in this exact scene, location, party state, active quest, inventory, abilities, and both submitted actions.
- Include at least one teamwork idea that uses both characters or lets one cover/follow up on the other.
- In a calm scene, one idea may invite a character beat between the two of them (a conversation by the fire, a shared memory, checking on each other after danger) instead of pushing plot.
- If combat is active, every idea must name a target, tactic, terrain feature, ally, or escape route.
- Do not offer generic ideas like "continue", "look around", or "move forward".
- Stay in-world: phrase each idea as something the character does or says, naming a specific person, place, or object already established in the scene - not a meta-objective like "find an NPC who might know about X" or "look for someone who can help". If no such person/place/object exists yet in the scene, suggest investigating the concrete thing in front of the character instead.
- Phrase suggestions as natural in-fiction actions, NOT as game-mechanic buttons. Write "Reach out with your senses toward the sapling's aura" or "Ask your partner to read the magic clinging to the roots", NOT "Use your wisdom to sense magical presence" or "Make an Athletics check". Name the fiction; let the stat stay implicit.

QUALITY BAR BEFORE YOU ANSWER:
- Does the narration change the situation in a concrete way?
- Do BOTH characters have concrete presence and a distinct contribution - neither reduced to "follows along"?
- Did you preserve both players' agency and avoid deciding what either character feels?
- If a known NPC appears, does their dialogue show they remember the party - and did you carry their notes forward instead of overwriting them?
- Does this scene open differently from the last one (no repeated scene skeletons)?
- If awaitingRoll is true, did you stop before the outcome, set actingCharacterId, and use suggestedActions: []?
- Did you update memory/state only for things that actually changed?

Respond with JSON:
{
  "narration": "string - unified narration addressing both characters",
  "worldStateChanges": object | null,
  "suggestedActions": ["3-4 optional action ideas; use [] if awaitingRoll or isHighStakes"],
  "character1SuggestedActions": ["3-4 ideas tailored to Character 1's class/abilities; [] if awaitingRoll or isHighStakes"],
  "character2SuggestedActions": ["3-4 ideas tailored to Character 2's class/abilities; [] if awaitingRoll or isHighStakes"],
  "sceneImagePrompt": "string",
  "turnOutcome": {
    "playerIntent": "what BOTH players were trying to do this turn",
    "concreteResult": "the concrete thing that happened in the shared scene (NOT atmosphere)",
    "informationRevealed": ["specific facts/clues/names/places learned this turn; [] only if a roll is pending or no info was sought"],
    "situationChanged": "boolean",
    "unresolvedQuestion": "string | null",
    "whyNoRoll": "string | null",
    "whyRollNeeded": "string | null"
  },
  "isLevelUp": false,
  "isDeath": false,
  "isCombat": boolean,
  "isVictory": boolean,
  "enemyName": "string | null",
  "diceRequired": "boolean - true only for a minor auto-resolved check (see DICE ROLLS above); must be false when awaitingRoll is true",
  "diceType": "d20" | null,
  "diceDC": number | null,
  "diceDescription": "string" | null,
  "advanceAct": boolean,
  "isHighStakes": boolean,
  "choiceCards": [{"title": "string", "description": "string", "consequenceHint": "string"}] | null,
  "achievementUnlocked": {"title": "string", "description": "string"} | null,
  "newRecipe": {"id": "unique-id", "name": "string", "description": "string", "resultItem": {"name": "string", "description": "string", "type": "weapon|armor|potion|misc|key", "value": 10}, "materials": [{"name": "string", "quantity": 1}]} | null,
  "companion": {"name": "string", "species": "string", "description": "string", "bondLevel": number, "abilityHint": "string"} | null,
  "factionRepChange": {"faction": "string", "delta": number} | null,
  "comboBonus": boolean,
  "sceneMomentum": "advancing" | "stalling" | "transitioning",
  "pacingMode": "exploration" | "tension" | "climax" | "resolution",
  "scenePurpose": "explore" | "gather_info" | "combat" | "social" | "travel" | "rest" | "climax",
  "isMerchant": boolean,
  "shopItems": [{"id": "item-id", "name": "item name", "description": "one sentence", "type": "weapon|armor|potion|misc|key", "price": 10, "quantity": 1}] | null,
  "activeNPC": "string | null",
  "combatEnemies": [{"name": "string", "archetype": "beast|soldier|mage|boss|minion", "maxHp": number, "condition": "healthy|wounded|critical", "isDefeated": boolean, "specialAbility": "string|null"}] | null,
  "enemyDefeated": "enemy name if one died this round" | null,
  "isBossFight": boolean,
  "bossPhaseAdvance": boolean,
  "awaitingRoll": boolean,
  "actingCharacterId": "id of the character making the roll, required if awaitingRoll is true, else null",
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
  "sessionNote": "string | null",
  "spotlightCharacterId": "characterId being spotlighted this turn, or null",
  "newForeshadowing": [{"id": "unique-id", "description": "string", "type": "npc|rumor|object|event|place"}] | null,
  "paidOffForeshadowing": ["foreshadowing id"] | null,
  "resolvedFutureHooks": ["a short exact phrase (3-8 words) copied from one of the FUTURE HOOKS TO HONOR descriptions that was resolved this turn"] | null,
  "backstoryHookActivated": "characterId whose dormant backstory hook just became active, or null",
  "backstoryHookResolved": "characterId whose active backstory hook just got resolved, or null",
  "actGoalAchieved": "string | null",
  "directorBeatExecuted": boolean,
  "triggerFinalConfrontation": boolean,
  "endgameResolved": boolean,
  "characterHistoryNote": {"type": "string", "description": "string", "impact": "string"} | null,
  "antagonistUpdate": {"name": "string", "newStep": "string|null", "lastAction": "string|null", "nowKnowsPlayers": boolean} | null,
  "character1Changes": {
    "hpChange": number | null,
    "loot": [{"id": "uid", "name": "string", "description": "string", "quantity": 1, "type": "weapon|armor|potion|misc|key", "value": 10, "setName": "string|null", "setBonus": "string|null"}] | null,
    "statusEffectChanges": {"add": [], "remove": []} | null,
    "goldChange": number | null,
    "isDeath": boolean,
    "deathDescription": "string | null",
    "isRest": boolean,
    "abilityUsed": "string | null",
    "consumedItems": ["string"] | null
  },
  "character2Changes": {
    "hpChange": number | null,
    "loot": [{"id": "uid", "name": "string", "description": "string", "quantity": 1, "type": "weapon|armor|potion|misc|key", "value": 10, "setName": "string|null", "setBonus": "string|null"}] | null,
    "statusEffectChanges": {"add": [], "remove": []} | null,
    "goldChange": number | null,
    "isDeath": boolean,
    "deathDescription": "string | null",
    "isRest": boolean,
    "abilityUsed": "string | null",
    "consumedItems": ["string"] | null
  }
}`;

  const coopContractBlock = TURN_RESOLUTION_CONTRACT + '\n' + CO_OP_SINGLE_CAMERA_RULE + '\n' + STYLE_ANTI_REPETITION;
  const messages = [
    { role: 'system', content: DM_SYSTEM_PROMPT },
    { role: 'user', content: worldContext },
    { role: 'system', content: coopContractBlock },
  ] satisfies AiTurnRepairMessage[];
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  let parsed = parseJsonRecord(content);

  const repair = await repairNarrationDraftIfNeeded({
    parsed,
    rawContent: content,
    isCoop: true,
    action: `${a1.action} || ${a2.action}`,
    messages,
    buildRepairInstruction: issues => `The previous response failed quality validation because it did not concretely resolve the players' actions:\n- ${issues.join('\n- ')}\n\nRewrite while preserving continuity. Do not add vague mystery language. Do not open with weather or ambient atmosphere. You MUST reveal a specific fact OR call for a roll OR change the situation. Keep both characters in ONE shared scene. Return the SAME JSON object with the same mechanical values (hpChange, loot, goldChange, awaitingRoll, etc.), changing only the narration, suggestedActions, and turnOutcome as needed.`,
    requestRepair: async repairMessages => {
      const retry = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: repairMessages,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });
      return retry.choices[0].message.content || '';
    },
  });
  parsed = repair.parsed;

  logAiCall('generateCoopNarration', {
    characters: [c1.id, c2.id], actions: [a1.action, a2.action], model: 'gpt-4o', temperature: 0.7,
    worldContext, rawResponse: content, parsed, validationIssues: repair.issues, retried: repair.retried,
  });

  const base = parseNarrationResponse(parsed);

  return {
    ...base,
    character1Changes: (parsed.character1Changes as NarrationResult['character1Changes']) || undefined,
    character2Changes: (parsed.character2Changes as NarrationResult['character2Changes']) || undefined,
    character1SuggestedActions: base.awaitingRoll || base.isHighStakes ? [] : cleanSuggestedActions(parsed.character1SuggestedActions, base.suggestedActions),
    character2SuggestedActions: base.awaitingRoll || base.isHighStakes ? [] : cleanSuggestedActions(parsed.character2SuggestedActions, base.suggestedActions),
    actingCharacterId: base.awaitingRoll ? asString(parsed.actingCharacterId) || c1.id : undefined,
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
${degreeGuidance[degree]}${combatStakesBlock}

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
  const parsed = parseJsonRecord(content);

  logAiCall('generateRollOutcome', {
    character: character.id, model: 'gpt-4o', temperature: 0.7,
    prompt, rawResponse: content, parsed,
  });

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
    model: 'gpt-image-2',
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

  const parsed = parseJsonValueOrFallback<{ hooks?: unknown[] }>(response.choices[0].message.content, { hooks: [] });
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

  const parsed = parseJsonRecord(response.choices[0].message.content);
  return {
    narration: (parsed.narration as string) || 'Something has changed in the world while you were away.',
    sessionNote: (parsed.sessionNote as string) || 'Villain advanced their plan.',
  };
}

export async function generateStorySeed(): Promise<StorySeedOption[]> {
  return generateStorySeedFromService(openai);
}

export async function generateWorldBible(
  storySeed: string,
  playerPreferences?: CampaignGenerationPlayerPreferences,
): Promise<WorldBible> {
  return generateWorldBibleFromService(openai, storySeed, playerPreferences);
}
export async function runStoryDirector(
  worldState: WorldState,
  worldBible: WorldBible,
  characters: Character[],
  act: number,
): Promise<StoryDirectorBeat | null> {
  return runStoryDirectorFromService(openai, worldState, worldBible, characters, act);
}
export async function extractFutureHooks(
  action: string,
  narration: string,
  worldState: WorldState,
  characterName: string,
): Promise<FutureHook[]> {
  return extractFutureHooksFromService(openai, action, narration, worldState, characterName);
}

export async function generateProactiveEvent(
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
): Promise<ProactiveEvent> {
  return generateProactiveEventFromService(openai, worldState, worldBible, character);
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
