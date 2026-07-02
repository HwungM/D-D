import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from './supabase';
import type { Character, WorldState, WorldBible, StorySeedOption } from '../../../shared/types';
import {
  generateNextArcRoadmapSegment as generateNextArcRoadmapSegmentFromService,
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
import { generateSceneSummaryFromService } from './sceneSummaryService';
import {
  extractBackstoryHooksFromService,
  generateEpilogueFromService,
  generateVillainMoveFromService,
} from './campaignSupportService';
import { generateSignatureItemQuest as generateSignatureItemQuestFromService } from './signatureRewardsService';
import {
  buildCharacterPortraitRequest,
  generateImageFromService,
} from './imageGenerationService';
import {
  generateCoopNarrationFromService,
  generateNarrationFromService,
  generateNarrationStreamingFromService,
} from './narrationGenerationService';
import type { NarrationResult } from './narrationResponseParser';
import type { NarrationCampaignContext } from './narrationPromptBuilder';
import { generateCoopRollOutcomeFromService, generateRollOutcomeFromService, type RollOutcomeContext } from './rollNarrationService';
import { runMicroAction, type MicroActionResult } from './microActionService';
import { generateSubLocationsFromService } from './subLocationSystem';
import type { LocationNode, SceneInteractable, SubLocation } from '../../../shared/types';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateSceneSummary(
  recentHistory: string[],
  currentLocation: string,
  characterName: string,
  combatState: WorldState['combatState']
): Promise<string> {
  return generateSceneSummaryFromService(openai, {
    recentHistory,
    currentLocation,
    characterName,
    combatState,
  });
}

export type { NarrationResult } from './narrationResponseParser';

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
  return generateNarrationFromService(openai, logAiCall, action, worldState, worldBible, character, recentHistory, campaignContext);
}

export async function* generateNarrationStreaming(
  action: string,
  worldState: WorldState,
  worldBible: WorldBible,
  character: Character,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null
): AsyncGenerator<{ type: 'token'; token: string } | { type: 'done'; result: NarrationResult }> {
  yield* generateNarrationStreamingFromService(openai, action, worldState, worldBible, character, recentHistory, campaignContext);
}

export async function generateCoopNarration(
  actions: { character: Character; action: string }[],
  worldState: WorldState,
  worldBible: WorldBible,
  recentHistory: string[],
  campaignContext?: NarrationCampaignContext | null
): Promise<NarrationResult & { character1Changes?: NarrationResult['character1Changes']; character2Changes?: NarrationResult['character2Changes']; character1SuggestedActions?: string[]; character2SuggestedActions?: string[] }> {
  return generateCoopNarrationFromService(openai, logAiCall, actions, worldState, worldBible, recentHistory, campaignContext);
}

export async function generateMicroActionReaction(
  action: string,
  character: Character,
  worldState: WorldState,
  worldBible: WorldBible,
  sceneInteractables: SceneInteractable[],
  recentFreeRoam?: { action: string; reaction: string }[],
): Promise<MicroActionResult> {
  return runMicroAction(openai, logAiCall, { action, character, worldState, worldBible, sceneInteractables, recentFreeRoam });
}

// One-time (per location) generation of the enterable sub-locations inside a
// city/region/landmark node — see subLocationSystem.ts. Cheap gpt-4o-mini
// call, only made when the node doesn't already have subLocations cached.
export async function generateSubLocations(
  node: LocationNode,
  worldBible: WorldBible,
): Promise<SubLocation[]> {
  return generateSubLocationsFromService(openai, logAiCall, node, worldBible);
}

export async function generateRollOutcome(
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: RollOutcomeContext,
  worldState: WorldState,
  character: Character,
  recentHistory: string[]
): Promise<{ narration: string; worldStateChanges?: Partial<WorldState>; hpChange?: number; goldChange?: number; suggestedActions: string[]; sceneImagePrompt: string; isDeath?: boolean; isVictory?: boolean; isCombat?: boolean; loot?: unknown[] }> {
  return generateRollOutcomeFromService({
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
    openai,
    logAiCall,
  });
}

export async function generateCoopRollOutcome(
  rollResult: number,
  rollTotal: number,
  dc: number,
  success: boolean,
  isCritSuccess: boolean,
  isCritFail: boolean,
  rollContext: RollOutcomeContext,
  worldState: WorldState,
  worldBible: WorldBible,
  actingCharacter: Character,
  partnerCharacter: Character,
  actions: { characterId: string; characterName: string; action: string }[],
  recentHistory: string[],
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
  }[]
): Promise<{ narration: string; worldStateChanges?: Partial<WorldState>; hpChange?: number; goldChange?: number; suggestedActions: string[]; sceneImagePrompt: string; isDeath?: boolean; isVictory?: boolean; isCombat?: boolean; loot?: unknown[] }> {
  return generateCoopRollOutcomeFromService({
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
    openai,
    logAiCall,
  });
}

export async function generateImage(description: string, cacheKey: string): Promise<string> {
  return generateImageFromService(openai, supabaseAdmin, description, cacheKey);
}

export async function generateCharacterPortrait(
  name: string,
  race: string,
  characterClass: string,
  backstory?: string
): Promise<string> {
  const { description, cacheKey } = buildCharacterPortraitRequest(name, race, characterClass, backstory);
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
  return extractBackstoryHooksFromService(openai, backstory, characterName, race, characterClass, worldBible, characterId);
}

export async function generateSignatureItemQuest(
  hook: import('../../../shared/types').BackstoryHook,
  race: string,
  characterClass: string,
  worldBible: WorldBible,
): Promise<import('../../../shared/types').SignatureItemQuest> {
  return generateSignatureItemQuestFromService(openai, hook, race, characterClass, worldBible);
}

export async function generateVillainMove(
  worldState: WorldState,
  worldBible: WorldBible,
  actNumber: number
): Promise<{ narration: string; sessionNote: string }> {
  return generateVillainMoveFromService(openai, worldState, worldBible, actNumber);
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
export async function generateNextArcRoadmap(
  worldBible: WorldBible,
  worldState: WorldState,
  arcNumber: number,
): Promise<import('../../../shared/types').DmRoadmapArcSegment> {
  return generateNextArcRoadmapSegmentFromService(openai, worldBible, worldState, arcNumber);
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
  return generateEpilogueFromService(openai, worldState, worldBible, character, victory);
}
