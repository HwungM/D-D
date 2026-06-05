// Shared types between client and server

export interface StatusEffect {
  name: string;
  description: string;
  type: 'buff' | 'debuff' | 'neutral';
  duration?: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'armor' | 'potion' | 'misc' | 'key';
  price: number;
  quantity: number;
}


export interface CharacterStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Ability {
  name: string;
  description: string;
  cooldown?: number;
  currentCooldown?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  type: 'weapon' | 'armor' | 'potion' | 'misc' | 'key';
  value?: number;
}

export interface Character {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  race: string;
  class: string;
  subclass?: string;
  secondary_class?: string;
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  stats: CharacterStats;
  abilities: Ability[];
  inventory: InventoryItem[];
  gold: number;
  backstory?: string;
  portrait_url?: string;
  reputation: Record<string, number>;
  status_effects?: StatusEffect[];
  is_alive: boolean;
  death_note?: string;
  created_at: string;
  updated_at: string;
}

export interface NpcMemory {
  name: string;
  lastMet?: string;
  disposition: 'friendly' | 'neutral' | 'hostile' | 'unknown';
  notes: string;
  metCharacters?: string[];  // character names this NPC has met
}

export interface CharacterOnlineStatus {
  characterId: string;
  characterName: string;
  isOnline: boolean;
  lastSeen: string;
  lastLocation: string;
}

export interface ActiveQuest {
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  startedAt?: string;
}

export interface WorldState {
  currentLocation?: string;
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: string;
  activeQuests?: ActiveQuest[];
  completedEvents?: string[];
  factionStandings?: Record<string, number>;
  discoveredLocations?: string[];
  globalFlags?: Record<string, boolean | string | number>;
  npcMemory?: NpcMemory[];
  sessionNotes?: string[];
  campaignJournal?: CampaignJournalEntry[];
  characterHistory?: CharacterHistoryEntry[];
  antagonistProgress?: Record<string, { stepIndex: number; lastAction: string; knowsPlayers: boolean }>;
  sessionCount?: number;
  characterLocations?: Record<string, string>;  // characterId -> location name
  characterLastSeen?: Record<string, string>;    // characterId -> ISO timestamp
  fallenHeroes?: { name: string; race: string; class: string; level: number; cause: string; diedAt: string; location?: string }[];
  currentSceneSummary?: string;
  actionsSinceLastSummary?: number;
  combatState?: {
    inCombat: boolean;
    enemyName: string;
    enemyCondition: 'healthy' | 'wounded' | 'critical';
    roundNumber: number;
    playerActionsAttempted: string[];
  } | null;
}

export interface WorldBible {
  geography: GeographyEntry[];
  pantheon: God[];
  toneRules: string[];
  forbiddenLoreHooks: string[];
  factions: Faction[];
  era: string;
  magicSystem: string;
  primaryAntagonist: Antagonist;
  centralConflict: string;
  antagonistRoster: Antagonist[];
  openingHooks: string[];
}

export interface GeographyEntry {
  name: string;
  description: string;
  type: 'city' | 'region' | 'dungeon' | 'wilderness' | 'landmark';
}

export interface God {
  name: string;
  domain: string;
  alignment: string;
  conflict: string;
}

export interface Faction {
  name: string;
  publicFace: string;
  secretAgenda: string;
  power: 'weak' | 'moderate' | 'strong';
}

export interface Campaign {
  id: string;
  name: string;
  story_seed: string;
  world_state: WorldState;
  world_bible: WorldBible;
  act: number;
  campaign_type?: 'adventure' | 'testing';
  created_at: string;
  updated_at: string;
}

export interface StoryEvent {
  id: string;
  campaign_id: string;
  character_id?: string;
  event_type: 'narration' | 'action' | 'dice_roll' | 'combat' | 'dialogue' | 'level_up' | 'death';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NPC {
  id: string;
  campaign_id: string;
  name: string;
  description?: string;
  personality: Record<string, string>;
  relationship_map: Record<string, string>;
  portrait_url?: string;
  is_alive: boolean;
  created_at: string;
}

export interface DiceRollResult {
  sides: number;
  rolls: number[];
  modifier: number;
  total: number;
  description?: string;
}

export interface RollContext {
  stat: string;
  dc: number;
  diceType: string;
  description: string;
  successDescription: string;
  failDescription: string;
  critSuccessDescription?: string;
  critFailDescription?: string;
  isDramatic: boolean;
  modifier: number;
}

export interface ActionResult {
  narration: string;
  awaitingRoll?: boolean;
  rollContext?: RollContext;
  diceRoll?: DiceRollResult;
  worldStateChanges?: Partial<WorldState>;
  characterChanges?: Partial<Character>;
  newNPCs?: NPC[];
  sceneImagePrompt?: string;
  suggestedActions?: string[];
  isLevelUp?: boolean;
  isDeath?: boolean;
  isCombat?: boolean;
  isVictory?: boolean;
  enemyName?: string;
  newAbility?: Ability;
  loot?: InventoryItem[];
  shopItems?: ShopItem[];
  isMerchant?: boolean;
  advanceAct?: boolean;
  statusEffectChanges?: { add?: StatusEffect[]; remove?: string[] };
  isHighStakes?: boolean;
  choiceCards?: HighStakesChoice[];
  characterHistoryNote?: CharacterHistoryEntry;
  antagonistUpdate?: { name: string; newStep?: string; lastAction?: string; nowKnowsPlayers?: boolean };
}

export interface PartyMember {
  userId: string;
  username: string;
  character: Character;
}

export interface PartyInvite {
  id: string;
  campaign_id: string;
  invited_by: string;
  invite_code: string;
  expires_at: string;
  created_at: string;
}

export interface SceneData {
  narrative: string;
  imageUrl?: string;
  location: string;
  suggestedActions: string[];
  ambiance: string;
}

export interface StorySeedOption {
  id: string;
  title: string;
  premise: string;
  tone: string;
  startingLocation: string;
}

export interface Antagonist {
  name: string;
  trueName?: string;
  type: 'primary' | 'secondary' | 'faction';
  agenda: string;
  currentStep: string;
  planSteps: string[];
  whatTheyKnow: string;
  isRevealed: boolean;
  power: 'minor' | 'moderate' | 'major' | 'legendary';
  lastAction?: string;
  allies?: string[];
  weaknesses?: string[];
}

export interface CampaignJournalEntry {
  actNumber: number;
  sessionNumber: number;
  summary: string;
  keyDecisions: string[];
  majorNPCsIntroduced: string[];
  createdAt: string;
}

export interface CharacterHistoryEntry {
  type: 'choice' | 'ally' | 'enemy' | 'oath' | 'deed' | 'loss';
  description: string;
  impact: string;
  createdAt: string;
}

export interface HighStakesChoice {
  title: string;
  description: string;
  consequenceHint: string;
}

export type Race = 'Human' | 'Elf' | 'Dwarf' | 'Halfling' | 'Gnome' | 'Half-Orc' | 'Tiefling' | 'Dragonborn';
export type CharacterClass = 'Fighter' | 'Wizard' | 'Rogue' | 'Cleric' | 'Ranger' | 'Paladin' | 'Barbarian' | 'Bard' | 'Druid' | 'Monk' | 'Sorcerer' | 'Warlock';

export const RACE_STAT_BONUSES: Record<Race, Partial<CharacterStats>> = {
  Human: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  Elf: { dex: 2, int: 1 },
  Dwarf: { con: 2, wis: 1 },
  Halfling: { dex: 2, cha: 1 },
  Gnome: { int: 2, dex: 1 },
  'Half-Orc': { str: 2, con: 1 },
  Tiefling: { cha: 2, int: 1 },
  Dragonborn: { str: 2, cha: 1 },
};

export const CLASS_BASE_HP: Record<CharacterClass, number> = {
  Fighter: 10,
  Wizard: 6,
  Rogue: 8,
  Cleric: 8,
  Ranger: 10,
  Paladin: 10,
  Barbarian: 12,
  Bard: 8,
  Druid: 8,
  Monk: 8,
  Sorcerer: 6,
  Warlock: 8,
};

export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
