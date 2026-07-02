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
    is_alive: boolean;
    death_note?: string;
    created_at: string;
    updated_at: string;
}
export interface WorldState {
    currentLocation?: string;
    timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
    activeQuests?: string[];
    completedEvents?: string[];
    factionStandings?: Record<string, number>;
    discoveredLocations?: string[];
    globalFlags?: Record<string, boolean | string | number>;
}
export interface WorldBible {
    geography: GeographyEntry[];
    pantheon: God[];
    toneRules: string[];
    forbiddenLoreHooks: string[];
    factions: Faction[];
    era: string;
    magicSystem: string;
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
export interface ActionResult {
    narration: string;
    diceRoll?: DiceRollResult;
    worldStateChanges?: Partial<WorldState>;
    characterChanges?: Partial<Character>;
    newNPCs?: NPC[];
    sceneImagePrompt?: string;
    suggestedActions?: string[];
    isLevelUp?: boolean;
    isDeath?: boolean;
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
export type Race = 'Human' | 'Elf' | 'Dwarf' | 'Halfling' | 'Gnome' | 'Half-Orc' | 'Tiefling' | 'Dragonborn';
export type CharacterClass = 'Fighter' | 'Wizard' | 'Rogue' | 'Cleric' | 'Ranger' | 'Paladin' | 'Barbarian' | 'Bard' | 'Druid' | 'Monk' | 'Sorcerer' | 'Warlock';
export declare const RACE_STAT_BONUSES: Record<Race, Partial<CharacterStats>>;
export declare const CLASS_BASE_HP: Record<CharacterClass, number>;
export declare const XP_THRESHOLDS: number[];
//# sourceMappingURL=types.d.ts.map
