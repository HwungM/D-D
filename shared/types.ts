// Shared types between client and server

export interface ForeshadowingEntry {
  id: string;
  description: string;
  type: 'npc' | 'rumor' | 'object' | 'event' | 'place';
  introducedInAct: number;
  payoffStatus: 'planted' | 'developing' | 'paid_off';
  payoffDescription?: string;
  createdAt: string;
}

export interface BackstoryHook {
  characterId: string;
  characterName: string;
  hook: string;
  status: 'dormant' | 'active' | 'resolved';
  seededAt?: string;
}

export interface DmRoadmap {
  act1Goals: string[];
  act1MustIntroduce: string[];
  act1ClimaxEvent: string;
  act2Goals: string[];
  act2VillainEscalation: string;
  act2ClimaxEvent: string;
  act3ConvergenceThreads: string[];
  act3ClimaxEvent: string;
  act3ResolutionOptions: string[];
  // Additional arcs beyond the opening one. The campaign is a single continuous
  // saga (Critical Role-style): once arc 1's climax resolves, the story opens a
  // fresh 3-act arc rather than ending. arcSegments[0] is arc 2, arcSegments[1]
  // is arc 3, etc. Segments are generated lazily (see actAdvancementState.ts /
  // campaignGenerationService.ts) as each prior arc closes, so this can be
  // shorter than the number of arcs actually played.
  arcSegments?: DmRoadmapArcSegment[];
}

export interface DmRoadmapArcSegment {
  arcNumber: number;
  antagonistName?: string;
  act1Goals: string[];
  act1MustIntroduce: string[];
  act1ClimaxEvent: string;
  act2Goals: string[];
  act2VillainEscalation: string;
  act2ClimaxEvent: string;
  act3ConvergenceThreads: string[];
  act3ClimaxEvent: string;
  act3ResolutionOptions: string[];
}

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


// Pet/familiar-style bonded creature — distinct from a full CompanionCharacter
// party member. This is a narrative flavor companion (see worldState.companion)
// that can assist in combat at higher bond levels but does not have its own
// character sheet.
export interface Companion {
  name: string;
  species: string;
  description: string;
  bondLevel: number;
  abilityHint?: string;
}

// A full party member controlled by the DM rather than a human player. Has a
// real character sheet (reusing the same stats/abilities/inventory shapes as a
// human Character) plus a bond/loyalty score toward the party. Companions can
// be generated at campaign creation or recruited/lost organically mid-campaign,
// and can die permanently (with narrative plot-armor, not casual death).
export interface CompanionCharacter {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  stats: CharacterStats;
  abilities: Ability[];
  inventory: InventoryItem[];
  // -100 (about to abandon the party) to 100 (devoted, would die for them), 0 = neutral.
  // Same convention as NpcMemory.relationshipScore.
  bondLevel: number;
  is_alive: boolean;
  deathNote?: string;
  recruitedAt: string;
  lastSeenAt?: string;
  portrait_url?: string;
}

// One companion's mechanical delta for a single turn, as reported by the AI
// extractor. Mirrors the PC character2Changes convention (deltas, not absolute
// values) so the same apply/repair pipeline shape works for both.
export interface CompanionChangeEntry {
  hpChange?: number;
  xpGained?: number;
  bondLevelChange?: number;
  isDeath?: boolean;
  deathDescription?: string;
}

// A single seat in the party: either a human player (filled or still invited)
// or an AI-controlled companion. Companions can be met/recruited/lost mid-campaign,
// so this describes the starting composition, not a permanent roster lock.
export interface PartySlot {
  id: string;
  kind: 'human' | 'ai_companion';
  // For kind 'human': is this seat filled by a joined player, or still an open invite?
  status: 'filled' | 'invited' | 'open';
  userId?: string;          // set once a human fills this slot
  companionId?: string;     // links to a CompanionCharacter.id once generated/assigned
}

// Chosen at campaign creation: how big the starting party is and which seats
// are human vs. AI companion. At least one human slot is required.
export interface PartyComposition {
  startingSize: number;
  slots: PartySlot[];
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  resultItem: { name: string; description: string; type: 'weapon' | 'armor' | 'potion' | 'misc' | 'key'; value?: number };
  materials: { name: string; quantity: number }[];
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
  mechanic?: string; // exact mechanical effect: what numbers change, what conditions apply
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
  equipped?: boolean;
  slot?: 'mainhand' | 'offhand' | 'armor' | 'helmet' | 'cloak' | 'accessory';
  setName?: string;
  setBonus?: string;
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
  gender?: 'male' | 'female';
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
  interactionCount?: number; // incremented each time this NPC appears in worldStateChanges
  isKeyNPC?: boolean;        // if true, pinned to keyNPCs and never pruned
  // Relationship system
  relationshipScore?: number;  // -100 (bitter enemy) to 100 (devoted ally), 0 = neutral
  relationshipLabel?: string;  // e.g. "trusted ally", "bitter rival", "romantic interest", "wary stranger"
  role?: string;               // e.g. "merchant", "guard captain", "innkeeper", "quest giver"
  portrait_url?: string;       // cached AI-generated or stock portrait URL
  gender?: 'male' | 'female' | 'nonbinary'; // set on introduction, used for portrait matching
  replacesName?: string; // when a placeholder ("Mysterious Stranger") reveals their real name, set this to the placeholder's name so the old entry is merged into this one rather than duplicated
}

export interface CampaignSpineSnapshot {
  currentArc: {
    act: number;
    label: string;
    progress: number;
    pressure: 'low' | 'rising' | 'dangerous' | 'climax';
  };
  lastRecap: string;
  openThreads: string[];
  keyRelationships: {
    name: string;
    disposition: NpcMemory['disposition'];
    note: string;
  }[];
  nextPressure: string;
  updatedAt: string;
}

export interface StoryLedgerEntry {
  id: string;
  kind: 'lead' | 'clue' | 'promise' | 'npc_thread' | 'relationship' | 'threat' | 'choice';
  title: string;
  summary: string;
  status: 'open' | 'pressing' | 'resolved';
  urgency: 'low' | 'medium' | 'high';
  anchorLocation?: string;
  anchorNpc?: string;
  characterIds?: string[];
  sourceAction?: string;
  createdAt: string;
  updatedAt?: string;
  dueByAction?: number;
  resolvedAt?: string;
}

export interface StoryActionMemory {
  characterId: string;
  characterName: string;
  action: string;
  intent: string;
  scenePurpose: NonNullable<WorldState['sceneState']>['purpose'];
  location?: string;
  targetLocation?: string;
  resultDigest?: string;
  concreteChange: boolean;
  rollRequested: boolean;
  createdAt: string;
}

export interface CharacterMemory {
  characterId: string;
  characterName: string;
  knownFacts: string[];
  personalStakes: string[];
  relationships: {
    npcName: string;
    summary: string;
    score?: number;
    label?: string;
    lastUpdatedAt: string;
  }[];
  privateNotes?: string[];
  lastUpdatedAt: string;
}

export interface DmCampaignMemory {
  recurringMotifs: string[];
  tableToneNotes: string[];
  unresolvedConsequences: string[];
  runningJokes: string[];
  promisesToHonor: string[];
  lastUpdatedAt: string;
}

export interface EngineAuditCheck {
  label: string;
  status: 'pass' | 'warn' | 'blocked' | 'info';
  detail: string;
}

export interface EngineAuditEntry {
  id: string;
  createdAt: string;
  actionCount: number;
  act: number;
  actors: string[];
  actionSummary: string;
  location?: string;
  scenePurpose?: NonNullable<WorldState['sceneState']>['purpose'];
  pacingMode?: NonNullable<WorldState['sceneState']>['pacingMode'];
  checks: EngineAuditCheck[];
  stateDigest: {
    combatantsTracked: number;
    npcMemoryUpdates: number;
    actGoalsCompleted: number;
    highStakes: boolean;
    spotlightCharacterId?: string;
    advanceActProposed?: boolean;
    advanceActAllowed?: boolean;
  };
}

export interface LocationNode {
  name: string;
  region: string;
  description?: string;
  type?: 'city' | 'region' | 'dungeon' | 'wilderness' | 'landmark' | 'unknown';
  discoveredAt?: string;
  lastVisitedAt?: string;
  visits: number;
  connectedTo: string[];
  npcsPresent: string[];
  questHooks: string[];
  partyHere: string[];
  tags: string[];
}

export interface LocationGraph {
  currentLocation?: string;
  nodes: LocationNode[];
  regions: { name: string; locations: string[] }[];
  nearby: string[];
  updatedAt: string;
}

export interface CombatEnemy {
  name: string;
  archetype: 'beast' | 'soldier' | 'mage' | 'boss' | 'minion';
  maxHp: number;
  currentHp?: number;
  armorClass?: number;
  condition: 'healthy' | 'wounded' | 'critical';
  isDefeated?: boolean;
  specialAbility?: string; // one-line description of what makes them dangerous
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

// What/who is currently present and interactable at the player's current
// location — the free-roam layer's map of the room. Built from existing
// location/NPC presence data (LocationGraph.currentLocation's node,
// npcMemory, activeNPC) rather than a parallel tracking system, and
// regenerated whenever the location or scene context changes.
export interface SceneInteractable {
  kind: 'npc' | 'object' | 'exit';
  name: string;
  // One-line hook: what this NPC might know/offer, what's notable about this
  // object/feature, or where this exit leads.
  hook: string;
}

export interface WorldState {
  currentLocation?: string;
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: string;
  activeQuests?: ActiveQuest[];
  completedEvents?: string[];
  factionStandings?: Record<string, number>;
  discoveredLocations?: string[];
  locationGraph?: LocationGraph;
  globalFlags?: Record<string, boolean | string | number>;
  npcMemory?: NpcMemory[];
  sessionNotes?: string[];
  campaignJournal?: CampaignJournalEntry[];
  campaignSpine?: CampaignSpineSnapshot;
  storyLedger?: StoryLedgerEntry[];
  recentPlayerActions?: StoryActionMemory[];
  characterMemories?: CharacterMemory[];
  dmMemory?: DmCampaignMemory;
  engineAudit?: EngineAuditEntry[];
  engineDebug?: {
    updatedAt: string;
    checks: EngineAuditCheck[];
    coopRoll?: {
      active: boolean;
      actingCharacterId?: string;
      unresolvedCount: number;
      resolvedCount: number;
      expectedRollers: string[];
    };
    pendingTurn?: {
      active: boolean;
      submittedCount: number;
      expiresAt?: string;
    };
  };
  characterHistory?: CharacterHistoryEntry[];
  antagonistProgress?: Record<string, { stepIndex: number; lastAction: string; knowsPlayers: boolean }>;
  sessionCount?: number;
  activeSession?: {
    id: string;
    sessionNumber: number;
    startedAt: string;
    startedBy: string;
  } | null;
  lastSessionRecap?: CampaignJournalEntry | null;
  processedActionRequests?: string[];
  foreshadowingLedger?: ForeshadowingEntry[];
  backstoryHooks?: BackstoryHook[];
  villainMoveCount?: number;
  actGoalsAchieved?: string[];
  characterLocations?: Record<string, string>;  // characterId -> location name
  characterLastSeen?: Record<string, string>;    // characterId -> ISO timestamp
  fallenHeroes?: { name: string; race: string; class: string; level: number; cause: string; diedAt: string; location?: string }[];
  currentSceneSummary?: string;
  actionsSinceLastSummary?: number;
  sceneState?: {
    purpose: 'explore' | 'gather_info' | 'combat' | 'social' | 'travel' | 'rest' | 'climax';
    exchangeCount: number;
    stalledCount: number;
    pacingMode: 'exploration' | 'tension' | 'climax' | 'resolution';
    cluesThisScene?: number; // concrete clues revealed since this scene began; drives clue-to-choice escalation
    skillChallenge?: {
      id: string;
      objective: string;
      successes: number;
      failures: number;
      targetSuccesses: number;
      maxFailures: number;
      participantIds: string[];
      stakes: string;
      updatedAt: string;
    } | null;
  };
  combatState?: {
    inCombat: boolean;
    enemyName: string;  // primary/focused enemy for backward compat
    enemyCondition: 'healthy' | 'wounded' | 'critical';
    roundNumber: number;
    playerActionsAttempted: string[];
    // Multi-enemy support
    enemies?: CombatEnemy[];
    isBossFight?: boolean;
    bossPhase?: number;
  } | null;
  // Scene-level escalation tracker while the party is hiding/fled from a live
  // threat WITHIN the current scene (combatState.inCombat is false, but the
  // encounter hasn't actually concluded). Each subsequent micro-action taken
  // while this is active rolls a code-side (not AI) chance the threat finds
  // the party again, re-triggering combatState via the preserved enemy
  // snapshot. See server/src/services/tensionSystem.ts.
  tensionMeter?: {
    active: boolean;
    heat: number; // 0-100, escalates with each action taken while hidden — flavor/telemetry only
    hunterName?: string; // who/what is stalking the party
    huntingEnemies?: CombatEnemy[]; // snapshot of the paused encounter's enemies, used to resume combat
    roundNumber?: number; // combat round the encounter paused at
    isBossFight?: boolean;
    bossPhase?: number;
    actionsHidden: number; // micro-actions taken since successfully hiding/fleeing — drives the find-chance curve, NOT wall-clock time
  } | null;
  // Set when a live combat/tension sequence that played out through
  // micro-actions concludes (victory, successful evasion held through to
  // Advance, etc.) — folded into Advance's context so the macro-turn pipeline
  // responds to how the fight actually ended instead of re-litigating it.
  // Cleared whenever a macro-turn resolves and a new scene begins.
  lastCombatOutcome?: {
    outcome: 'victory' | 'fled' | 'negotiated';
    enemyName?: string;
    concludedAt: string;
  } | null;
  activeNPC?: string | null;
  // What/who is present and interactable in the current scene — reused by the
  // micro-action free-roam layer so it knows who/what the player can poke at
  // without running the full macro-turn pacing engine. See SceneInteractable.
  sceneInteractables?: SceneInteractable[];
  // Free-roam ledger: micro-actions taken since the last Advance (macro-turn),
  // given to the next Advance call as "what the DM already knows happened"
  // context. Cleared whenever a macro-turn (Advance, or the legacy single
  // action route) resolves and a new scene begins.
  freeRoam?: {
    startedAt: string;
    location?: string;
    actions: { action: string; reaction: string; createdAt: string }[];
  } | null;
  // The clue bank: the DM's ledger of concrete mystery clues, referenced every
  // turn to decide what can be revealed next. Every entry must trace back to
  // something WorldBible.mysteryLayer actually seeded (its centralQuestion,
  // clues, or redHerrings) — no throwaway noise invented on the fly.
  mysteryClues?: {
    id: string;
    status: 'undiscovered' | 'revealed' | 'resolved';
    clue: string;
    pointsToward: string;
    possibleSources: string[];
    revealedAtEventId?: string;
  }[];
  shopInventory?: Record<string, ShopItem[]>;
  keyNPCs?: NpcMemory[];         // pinned NPCs that survive the rolling 20-NPC cap, max 8
  actionsInCurrentAct?: number;  // resets to 0 each time the act advances
  endgamePhase?: 'none' | 'approaching' | 'confrontation';
  actionCount?: number; // total actions taken this campaign, used for villain move timing
  lastHighStakesAction?: number; // actionCount value when the last high stakes moment fired
  futureHooks?: { id: string; description: string; source: string; createdAt: string; resolved: boolean }[];
  spotlightBalance?: Record<string, number>;  // characterId -> spotlight moment count
  pendingDirectorBeat?: { beat: string; urgency: 'low' | 'high' | 'critical'; expiresAfter: number } | null;
  unlockedAchievements?: UnlockedAchievement[];
  knownRecipes?: Recipe[];
  companion?: Companion | null;
  // Full AI-controlled party members with real character sheets (distinct from
  // the pet-like `companion` above). Populated at campaign creation according
  // to PartyComposition, and can grow/shrink as companions are recruited or lost.
  companions?: CompanionCharacter[];
  lastPillarUsed?: string[];  // last 5 scene pillars used, for three-pillar balance tracking
  pendingTurn?: {
    actions: { characterId: string; userId: string; action: string; characterName: string; submittedAt: string }[];
    roundId: string;
    createdAt?: string;
    expiresAt?: string;
  } | null;
  coopPendingRoll?: {
    actingCharacterId: string;
    rollContext: RollContext;
    actions: { characterId: string; userId: string; action: string; characterName: string; submittedAt: string }[];
    setupNarration?: string;
    sceneImagePrompt?: string | null;
    pendingRolls?: {
      characterId: string;
      characterName: string;
      rollContext: RollContext;
      resolved?: boolean;
      rollResult?: number;
      rollTotal?: number;
      dc?: number;
      success?: boolean;
      isCritSuccess?: boolean;
      isCritFail?: boolean;
    }[];
  } | null;
}

export interface WorldBible {
  geography: GeographyEntry[];
  pantheon: God[];
  toneRules: string[];
  artBible?: ArtBible;
  forbiddenLoreHooks: string[];
  factions: Faction[];
  era: string;
  magicSystem: string;
  primaryAntagonist: Antagonist;
  centralConflict: string;
  antagonistRoster: Antagonist[];
  openingHooks: string[];
  dmRoadmap?: DmRoadmap;
  lieutenant?: Antagonist;
  plotTwist?: string;
  mysteryLayer?: {
    centralQuestion: string;
    clues: string[];
    redHerrings: string[];
    revelation: string;
  };
  safeHaven?: {
    name: string;
    description: string;
    keyNPC: string;
    flavor: string;
  };
  toneBreaks?: string[];
  futureHookSeeds?: string[];
  campaignBrief?: {
    hook: string;
    objective: string;
    motivation: string;
    whereToStart: string;
    worldStakes: string;
    characterStakes: string;
    mysteryHint: string;
  };
  spotlightDesign?: {
    sharedMoments: string[];
    encounterCurve: string;
  };
  playerPreferences?: {
    playMode?: 'solo' | 'collaborative';
    partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now';
    tone: string;
    artStyle?: string;
    favoritePillars: string[];
    playerCount: number;
    targetPlayerCount?: number;
    waitForParty?: boolean;
    characterConcepts: string[];
    // Starting party size + human/AI-companion seat breakdown, chosen at creation.
    partyComposition?: PartyComposition;
  };
}

export interface ArtBible {
  styleName: string;
  masterPrompt: string;
  characterStyle: string[];
  environmentStyle: string[];
  lighting: string[];
  toneRules: string[];
  avoid: string[];
  scenePromptRules: string[];
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
  combatEnemies?: CombatEnemy[];
  enemyDefeated?: string;
  isBossFight?: boolean;
  bossPhaseAdvance?: boolean;
  combatDamage?: { target: string; amount: number; defeated: boolean };
  isHighStakes?: boolean;
  choiceCards?: HighStakesChoice[];
  characterHistoryNote?: CharacterHistoryEntry;
  antagonistUpdate?: { name: string; newStep?: string; lastAction?: string; nowKnowsPlayers?: boolean };
  actingCharacterId?: string;
  character1Id?: string;
  character2Id?: string;
  deathDescription?: string;
  character2Changes?: {
    hp?: number;
    max_hp?: number;
    gold?: number;
    inventory?: unknown;
    xp?: number;
    level?: number;
    status_effects?: StatusEffect[];
    isLevelUp?: boolean;
    newAbility?: Ability;
    isDeath?: boolean;
    deathDescription?: string;
    loot?: InventoryItem[];
    statusEffectChanges?: { add?: StatusEffect[]; remove?: string[] };
  };
  achievementUnlocked?: { title: string; description: string };
  comboBonus?: boolean;
  newRecipe?: Recipe;
  factionRepChange?: { faction: string; delta: number };
  // Final applied per-companion state after this turn's HP/XP/level/bond/death
  // changes were resolved, keyed by CompanionCharacter.id. Only companions that
  // actually changed this turn appear here.
  companionChanges?: Record<string, Partial<CompanionCharacter>>;
  // A brand-new ally who joined the party as a full companion this turn.
  newCompanion?: CompanionCharacter;
  // An existing companion who left the party (not died) this turn.
  companionDeparted?: { id: string; name: string; reason?: string };
}

export interface UnlockedAchievement {
  title: string;
  description: string;
  characterName: string;
  unlockedAt: string;
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

export type Race =
  'Human' | 'Elf' | 'Dwarf' | 'Halfling' | 'Gnome' | 'Half-Orc' | 'Tiefling' | 'Dragonborn' |
  'Aasimar' | 'Fire Genasi' | 'Water Genasi' | 'Earth Genasi' | 'Air Genasi' |
  'Warforged' | 'Tabaxi' | 'Goliath' | 'Firbolg' | 'Changeling' | 'Kenku' | 'Dhampir' | 'Owlin' |
  'Lizardfolk' | 'Satyr' | 'Harengon' | 'Yuan-Ti' | 'Triton' | 'Leonin' |
  'Minotaur' | 'Bugbear' | 'Hobgoblin' | 'Goblin' | 'Tortle';
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
  // Expanded races
  Aasimar: { cha: 2, wis: 1 },
  'Fire Genasi': { con: 2, int: 1 },
  'Water Genasi': { con: 2, wis: 1 },
  'Earth Genasi': { con: 2, str: 1 },
  'Air Genasi': { dex: 2, int: 1 },
  Warforged: { con: 2, str: 1 },
  Tabaxi: { dex: 2, cha: 1 },
  Goliath: { str: 2, con: 1 },
  Firbolg: { wis: 2, str: 1 },
  Changeling: { cha: 2, dex: 1 },
  Kenku: { dex: 2, wis: 1 },
  Dhampir: { dex: 2, cha: 1 },
  Owlin: { wis: 2, dex: 1 },
  Lizardfolk: { con: 2, str: 1 },
  Satyr: { cha: 2, dex: 1 },
  Harengon: { dex: 2, wis: 1 },
  'Yuan-Ti': { cha: 2, int: 1 },
  Triton: { str: 1, con: 1, cha: 1 },
  Leonin: { con: 2, str: 1 },
  Minotaur: { str: 2, con: 1 },
  Bugbear: { str: 2, dex: 1 },
  Hobgoblin: { con: 2, int: 1 },
  Goblin: { dex: 2, con: 1 },
  Tortle: { con: 2, wis: 1 },
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
