import type { CombatEnemy, NpcMemory, WorldState } from '../../../shared/types';
import {
  groundedFightSearchNarration,
  hasGroundedEncounterSetup,
  isFightSeekingAction,
} from './narrativeRules';

type ContractResponse = {
  narration: string;
  isCombat?: boolean;
  isVictory?: boolean;
  enemyName?: string;
  combatEnemies?: CombatEnemy[];
  enemyDefeated?: string;
  isBossFight?: boolean;
  bossPhaseAdvance?: boolean;
  scenePurpose?: string;
  pacingMode?: string;
  suggestedActions?: string[];
  awaitingRoll?: boolean;
  rollContext?: unknown;
  diceRequired?: boolean;
  hpChange?: number;
  loot?: unknown;
  isDeath?: boolean;
  deathDescription?: string;
  isHighStakes?: boolean;
  choiceCards?: unknown;
  worldStateChanges?: Partial<WorldState>;
  character1Changes?: { hpChange?: number; loot?: unknown; isDeath?: boolean; deathDescription?: string };
  character2Changes?: { hpChange?: number; loot?: unknown; isDeath?: boolean; deathDescription?: string };
};

function toArr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const PERSON_ENEMY_WORDS = /\b(bandits?|guards?|soldiers?|cultists?|raiders?|thugs?|mercenaries|mages?|assassins?|scouts?|hunters?|pirates?|brigands?|goblins?|orcs?|kobolds?|skeletons?|zombies?)\b/i;

function pluralCountFromText(text: string): number | undefined {
  const lowered = text.toLowerCase();
  const wordCounts: Record<string, number> = {
    two: 2,
    pair: 2,
    three: 3,
    trio: 3,
    four: 4,
    several: 3,
    few: 3,
  };
  for (const [word, count] of Object.entries(wordCounts)) {
    if (new RegExp(`\\b${word}\\b.{0,24}${PERSON_ENEMY_WORDS.source}`, 'i').test(lowered)) return count;
  }
  const numeric = lowered.match(/\b([2-4])\b.{0,24}(bandits?|guards?|soldiers?|cultists?|raiders?|thugs?|mercenaries|mages?|assassins?|scouts?|hunters?|pirates?|brigands?|goblins?|orcs?|kobolds?|skeletons?|zombies?)\b/i);
  return numeric ? Number(numeric[1]) : undefined;
}

function archetypeForEnemyLabel(label: string): CombatEnemy['archetype'] {
  if (/\b(mage|cultist|shaman|warlock|wizard)\b/i.test(label)) return 'mage';
  if (/\b(goblin|kobold|zombie|skeleton|minion)\b/i.test(label)) return 'minion';
  return 'soldier';
}

function singularEnemyLabel(text: string, fallback: string): string {
  const match = text.match(PERSON_ENEMY_WORDS);
  const raw = match?.[0] || fallback || 'enemy';
  return raw
    .replace(/ies$/i, 'y')
    .replace(/s$/i, '')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function ensureCombatEncounterCompleteness(aiResponse: ContractResponse): boolean {
  if (!aiResponse.isCombat) return false;
  const existing = aiResponse.combatEnemies || [];
  const detectedCount = pluralCountFromText(`${aiResponse.enemyName || ''} ${aiResponse.narration}`) || existing.length;
  if (!detectedCount || detectedCount <= existing.length || detectedCount <= 1) return false;

  const baseLabel = singularEnemyLabel(`${aiResponse.enemyName || ''} ${aiResponse.narration}`, aiResponse.enemyName || 'enemy');
  const archetype = archetypeForEnemyLabel(baseLabel);
  const filled: CombatEnemy[] = [...existing];
  for (let i = existing.length; i < Math.min(detectedCount, 4); i += 1) {
    filled.push({
      name: `${baseLabel} ${i + 1}`,
      archetype,
      maxHp: archetype === 'mage' ? 10 : archetype === 'minion' ? 6 : 12,
      condition: 'healthy',
      isDefeated: false,
    });
  }
  aiResponse.combatEnemies = filled;
  aiResponse.enemyName = filled.find(enemy => !enemy.isDefeated)?.name || aiResponse.enemyName;
  return true;
}

export function preventUngroundedFight(
  aiResponse: ContractResponse,
  actions: string[],
  location: string | undefined,
  alreadyInCombat: boolean,
): boolean {
  if (
    alreadyInCombat
    || !aiResponse.isCombat
    || !actions.some(isFightSeekingAction)
    || hasGroundedEncounterSetup(aiResponse.narration)
  ) {
    return false;
  }

  const phantomNames = new Set([
    aiResponse.enemyName,
    ...(aiResponse.combatEnemies || []).map(enemy => enemy.name),
  ].filter((name): name is string => !!name).map(name => name.toLowerCase()));
  if (aiResponse.worldStateChanges) {
    const changes = aiResponse.worldStateChanges;
    if (changes.npcMemory) {
      changes.npcMemory = toArr<NpcMemory>(changes.npcMemory)
        .filter(npc => !phantomNames.has(npc.name.toLowerCase()));
    }
    if (typeof changes.activeNPC === 'string' && phantomNames.has(changes.activeNPC.toLowerCase())) {
      changes.activeNPC = null;
    }
    changes.combatState = null;
  }

  aiResponse.narration = groundedFightSearchNarration(location);
  aiResponse.isCombat = false;
  aiResponse.isVictory = false;
  aiResponse.enemyName = undefined;
  aiResponse.combatEnemies = undefined;
  aiResponse.enemyDefeated = undefined;
  aiResponse.isBossFight = false;
  aiResponse.bossPhaseAdvance = false;
  aiResponse.scenePurpose = 'gather_info';
  aiResponse.pacingMode = 'tension';
  aiResponse.suggestedActions = ['Follow the freshest trail', 'Question someone nearby', 'Choose a defensible ambush point'];
  aiResponse.awaitingRoll = false;
  aiResponse.rollContext = undefined;
  aiResponse.diceRequired = false;
  aiResponse.hpChange = undefined;
  aiResponse.loot = undefined;
  aiResponse.isDeath = false;
  aiResponse.deathDescription = undefined;
  aiResponse.isHighStakes = false;
  aiResponse.choiceCards = undefined;
  if (aiResponse.character1Changes) {
    aiResponse.character1Changes.hpChange = undefined;
    aiResponse.character1Changes.loot = undefined;
    aiResponse.character1Changes.isDeath = false;
    aiResponse.character1Changes.deathDescription = undefined;
  }
  if (aiResponse.character2Changes) {
    aiResponse.character2Changes.hpChange = undefined;
    aiResponse.character2Changes.loot = undefined;
    aiResponse.character2Changes.isDeath = false;
    aiResponse.character2Changes.deathDescription = undefined;
  }
  return true;
}
