import type { WorldState, RollContext, CombatEnemy, Recipe, Companion, CompanionChangeEntry, PartyAsset } from '../../../shared/types';
import { cleanTurnOutcome, type TurnOutcome } from './narrationQualityValidator';
import { cleanPartyAssetGranted, cleanSignatureItemEarned } from './signatureRewardsService';
import { cleanIdentityRevealed } from './hiddenIdentitySystem';

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
  // Raw per-companion deltas keyed by CompanionCharacter.id, as reported by the
  // extractor for this beat (before the death-plot-armor guard is applied).
  companionChanges?: Record<string, CompanionChangeEntry>;
  companionRecruit?: { name?: string; race?: string; class?: string };
  companionDeparture?: { id: string; reason?: string };
  // Exact ids (from the MYSTERY CLUE BANK given in context) that this beat's
  // narration concretely revealed. Never a freeform clue description — only
  // ids from the pre-seeded bank are honored (see mysteryClueSystem.ts).
  revealedClueIds?: string[];
  // Signature item quest completion — only honored at a genuine earned moment
  // (see signatureRewardsService.guardSignatureItemEarned). questId must match
  // a WorldState.signatureItemQuests[] entry given in context.
  signatureItemEarned?: { characterId: string; questId: string };
  // A persistent title/property/position granted to the party — appended to
  // WorldState.partyAssets when honored (see signatureRewardsService.guardPartyAssetGranted).
  partyAssetGranted?: { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string };
  // Set when a real story moment justifies revealing an ACTIVE HiddenIdentity's
  // true nature (see hiddenIdentitySystem.guardIdentityRevealed) — npcName must
  // match a WorldState.hiddenIdentities[] entry with isRevealed: false.
  identityRevealed?: { npcName: string };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function asString(value: unknown): string | undefined {
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

export function cleanSuggestedActions(value: unknown, fallback: string[] = []): string[] {
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

function cleanCompanionChanges(value: unknown): Record<string, CompanionChangeEntry> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Record<string, CompanionChangeEntry> = {};
  for (const item of value) {
    const record = asRecord(item);
    const id = record && asString(record.id);
    if (!record || !id) continue;
    const entry: CompanionChangeEntry = {
      hpChange: clampNumber(record.hpChange, -1000, 1000),
      xpGained: clampNumber(record.xpGained, 0, 5000),
      bondLevelChange: clampNumber(record.bondLevelChange, -20, 20),
      isDeath: asBoolean(record.isDeath),
      deathDescription: asString(record.deathDescription),
    };
    result[id] = entry;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function cleanCompanionRecruit(value: unknown): { name?: string; race?: string; class?: string } | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const name = asString(record.name);
  if (!name) return undefined;
  return { name, race: asString(record.race), class: asString(record.class) };
}

function cleanCompanionDeparture(value: unknown): { id: string; reason?: string } | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = asString(record.id);
  if (!id) return undefined;
  return { id, reason: asString(record.reason) };
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

export function cleanRollContext(value: unknown): RollContext | undefined {
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

export function parseNarrationResponse(parsed: Record<string, unknown>): NarrationResult {
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
    suggestedActions: awaitingRoll || isHighStakes ? [] : cleanSuggestedActions(parsed.suggestedActions, fallbackActions),
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
    companionChanges: cleanCompanionChanges(parsed.companionChanges),
    companionRecruit: cleanCompanionRecruit(parsed.companionRecruit),
    companionDeparture: cleanCompanionDeparture(parsed.companionDeparture),
    revealedClueIds: cleanStringArray(parsed.revealedClueIds, 5),
    signatureItemEarned: cleanSignatureItemEarned(parsed.signatureItemEarned),
    partyAssetGranted: cleanPartyAssetGranted(parsed.partyAssetGranted),
    identityRevealed: cleanIdentityRevealed(parsed.identityRevealed),
  };
}
