import type { Character, RollContext, WorldBible, WorldState } from '../../../shared/types';
import type { NarrationResult } from './openai';
import {
  analyzeActionRail,
  buildRailWorldStatePatch,
  formatRailBlock,
  railToRollContext,
  rollRailDirective,
  type ActionRail,
  type ResolvedRailRoll,
} from './storyRails';
import { buildStoryTasteProfile, formatTasteDirective, type StoryTasteProfile } from './storyTaste';

type ScenePurpose = NonNullable<WorldState['sceneState']>['purpose'];
type PacingMode = NonNullable<WorldState['sceneState']>['pacingMode'];

export interface SceneFrame {
  location: string;
  purpose: ScenePurpose;
  pacingMode: PacingMode;
  objective: string;
  stakes: string;
  exits: string[];
  presentNpcs: string[];
  concreteReveal?: string;
  taste: StoryTasteProfile;
}

export interface EngineTurnPlan {
  rails: ActionRail[];
  characters: Character[];
  worldStatePatch: Partial<WorldState>;
  worldStateForNarration: WorldState;
  guardrails: string;
  sceneFrame: SceneFrame;
  suggestedActions: string[];
  awaitingRoll?: { characterId: string; characterName: string; rollContext: RollContext };
  resolvedRolls: ResolvedRailRoll[];
}

function mergeForNarration(current: WorldState, patch: Partial<WorldState>): WorldState {
  return {
    ...current,
    ...patch,
    characterLocations: { ...(current.characterLocations || {}), ...(patch.characterLocations || {}) },
    characterLastSeen: { ...(current.characterLastSeen || {}), ...(patch.characterLastSeen || {}) },
    discoveredLocations: patch.discoveredLocations || current.discoveredLocations,
    activeQuests: patch.activeQuests || current.activeQuests,
    npcMemory: patch.npcMemory || current.npcMemory,
  };
}

function firstText(...values: Array<string | undefined | null>): string {
  return values.find(v => typeof v === 'string' && v.trim().length > 0)?.trim() || '';
}

function actionPurpose(rails: ActionRail[], taste: StoryTasteProfile): ScenePurpose {
  if (rails.some(r => r.intent === 'rest')) return 'rest';
  if (rails.some(r => r.intent === 'attack')) return 'combat';
  if (rails.some(r => r.targetLocation)) return 'travel';
  if (rails.some(r => r.intent === 'bond')) return 'social';
  if (rails.some(r => r.intent === 'shop')) return 'social';
  if (rails.some(r => r.intent === 'help')) return taste.preferredNextPurpose === 'combat' ? 'combat' : 'social';
  if (rails.some(r => r.intent === 'intimidation' || r.intent === 'persuasion')) return 'social';
  if (rails.some(r => r.intent === 'sense magic' || r.intent === 'investigation')) return 'gather_info';
  return taste.preferredNextPurpose;
}

function frameLocation(rails: ActionRail[], worldState: WorldState, worldBible: WorldBible): string {
  return firstText(
    [...rails].reverse().find(r => r.targetLocation)?.targetLocation,
    worldState.currentLocation,
    worldState.locationGraph?.currentLocation,
    worldBible.campaignBrief?.whereToStart,
    worldBible.safeHaven?.name,
    worldBible.geography?.[0]?.name,
    'The Road'
  );
}

function locationChoices(worldState: WorldState, worldBible: WorldBible, location: string): string[] {
  const raw = [
    ...(worldState.locationGraph?.nearby || []),
    ...(worldState.discoveredLocations || []),
    ...(worldBible.geography || []).map(g => g.name),
    worldBible.safeHaven?.name,
  ].filter((v): v is string => !!v);
  return Array.from(new Set(raw)).filter(v => v !== location).slice(0, 5);
}

function presentNpcs(worldState: WorldState): string[] {
  return Array.from(new Set([
    worldState.activeNPC || undefined,
    ...(worldState.locationGraph?.nodes?.find(n => n.name === worldState.currentLocation)?.npcsPresent || []),
    ...(worldState.keyNPCs || []).slice(-3).map(n => n.name),
    ...(worldState.npcMemory || []).slice(-4).map(n => n.name),
  ].filter((v): v is string => !!v))).slice(0, 5);
}

function concreteReveal(worldState: WorldState, worldBible: WorldBible, rails: ActionRail[]): string | undefined {
  const pressure = (worldState.sceneState?.stalledCount ?? 0) >= 1 || rails.some(r =>
    ['intimidation', 'persuasion', 'sense magic', 'investigation'].includes(r.intent)
  );
  if (!pressure) return undefined;

  const clues = worldBible.mysteryLayer?.clues || [];
  const clueIndex = clues.length > 0 ? Math.min(Math.max(0, Math.floor((worldState.actionCount || 0) / 3)), clues.length - 1) : -1;
  return firstText(
    clueIndex >= 0 ? clues[clueIndex] : undefined,
    worldBible.campaignBrief?.mysteryHint,
    worldBible.primaryAntagonist?.agenda,
    worldBible.centralConflict
  ) || undefined;
}

function buildSceneFrame(rails: ActionRail[], worldState: WorldState, worldBible: WorldBible, taste: StoryTasteProfile): SceneFrame {
  const location = frameLocation(rails, worldState, worldBible);
  const purpose = actionPurpose(rails, taste);
  const pacingMode: PacingMode =
    worldState.endgamePhase === 'confrontation' ? 'climax' :
    purpose === 'combat' ? 'climax' :
    purpose === 'social' || purpose === 'gather_info' ? 'tension' :
    taste.preferredPacingMode;

  return {
    location,
    purpose,
    pacingMode,
    objective: firstText(
      worldBible.campaignBrief?.objective,
      worldState.activeQuests?.find(q => q.status === 'active')?.description,
      worldBible.dmRoadmap?.act1Goals?.[0],
      worldBible.centralConflict,
      'Find what is really happening and decide what it costs to intervene.'
    ),
    stakes: firstText(
      worldBible.campaignBrief?.worldStakes,
      worldBible.campaignBrief?.characterStakes,
      worldBible.centralConflict,
      'Delay gives hostile forces time to move.'
    ),
    exits: locationChoices(worldState, worldBible, location),
    presentNpcs: presentNpcs(worldState),
    concreteReveal: concreteReveal(worldState, worldBible, rails),
    taste,
  };
}

function seedQuestIfNeeded(worldState: WorldState, worldBible: WorldBible): Partial<WorldState> {
  if ((worldState.activeQuests || []).some(q => q.status === 'active')) return {};
  const objective = firstText(worldBible.campaignBrief?.objective, worldBible.centralConflict);
  if (!objective) return {};
  return {
    activeQuests: [{
      title: 'Main Thread',
      description: objective,
      status: 'active',
      startedAt: new Date().toISOString(),
    }],
  };
}

function buildWorldPatch(rails: ActionRail[], frame: SceneFrame, worldState: WorldState, characters: Character[]): Partial<WorldState> {
  const railPatch = buildRailWorldStatePatch(rails, worldState);
  const now = new Date().toISOString();
  const priorScene = worldState.sceneState;
  const isTransition = !!railPatch.currentLocation || frame.purpose === 'travel';
  return {
    ...railPatch,
    currentLocation: railPatch.currentLocation || frame.location,
    discoveredLocations: Array.from(new Set([...(worldState.discoveredLocations || []), frame.location])),
    characterLocations: {
      ...(worldState.characterLocations || {}),
      ...Object.fromEntries(characters.map(c => [c.id, railPatch.currentLocation || frame.location])),
    },
    characterLastSeen: {
      ...(worldState.characterLastSeen || {}),
      ...Object.fromEntries(characters.map(c => [c.id, now])),
    },
    sceneState: {
      purpose: frame.purpose,
      exchangeCount: isTransition ? 0 : (priorScene?.exchangeCount ?? 0) + 1,
      stalledCount: frame.concreteReveal ? 0 : (priorScene?.stalledCount ?? 0),
      pacingMode: frame.pacingMode,
      cluesThisScene: frame.concreteReveal ? (priorScene?.cluesThisScene ?? 0) + 1 : priorScene?.cluesThisScene ?? 0,
    },
  };
}

function buildSuggestedActions(frame: SceneFrame, rails: ActionRail[]): string[] {
  const actions = new Set<string>();
  if (frame.concreteReveal) actions.add('Follow the concrete lead');
  if (frame.presentNpcs.length > 0) actions.add(`Question ${frame.presentNpcs[0]} directly`);
  if (rails.some(r => r.intent === 'sense magic')) actions.add('Trace the magical source');
  if (rails.some(r => r.intent === 'intimidation' || r.intent === 'persuasion')) actions.add('Push for a name, place, or price');
  if (frame.exits.length > 0) actions.add(`Travel to ${frame.exits[0]}`);
  actions.add('Search for something others missed');
  return Array.from(actions).slice(0, 4);
}

function buildGuardrails(plan: Omit<EngineTurnPlan, 'guardrails'>): string {
  const frame = plan.sceneFrame;
  const rollBlock = plan.resolvedRolls.length
    ? `\nRESOLVED CHECKS:\n${plan.resolvedRolls.map(r => `- ${r.characterName}: ${r.rollResult} ${r.modifier >= 0 ? '+' : ''}${r.modifier} = ${r.rollTotal} vs DC ${r.dc}; ${r.success ? 'success' : 'failure'} for ${r.reason}`).join('\n')}`
    : '';
  const revealLine = frame.concreteReveal
    ? `- This turn must reveal or confirm this concrete information: ${frame.concreteReveal}`
    : '- Do not repeat a vague warning. If information is limited, give a concrete cost, obstacle, name, place, or next step.';

  return `${formatRailBlock(plan.rails, plan.resolvedRolls)}

${formatTasteDirective(frame.taste)}

GAME ENGINE TURN CONTRACT - NON-NEGOTIABLE:
- Open at location: ${frame.location}
- Scene purpose: ${frame.purpose}
- Scene objective: ${frame.objective}
- Stakes: ${frame.stakes}
- Preferred next pillar if the players leave this scene open-ended: ${frame.taste.preferredNextPurpose}
- Scene exchange budget from taste engine: ${frame.taste.maxSceneExchanges}. If this scene is at/over budget, force payoff, roll, complication, or transition.
${frame.presentNpcs.length ? `- Present/remembered NPCs available: ${frame.presentNpcs.join(', ')}` : '- No active NPC is guaranteed present unless introduced in this scene.'}
${frame.exits.length ? `- Known exits/leads: ${frame.exits.join(', ')}` : '- Create one concrete reachable lead if the scene would otherwise dead-end.'}
${revealLine}
- Suggested actions must be actionable choices, not generic advice.
- worldStateChanges must agree with the engine location and scene purpose.${rollBlock}`;
}

function buildPlan(characters: Character[], actions: string[], worldState: WorldState, worldBible: WorldBible, resolveRolls: boolean): EngineTurnPlan {
  const rails = actions.map((action, i) => analyzeActionRail(characters[i], action, worldState, worldBible));
  const taste = buildStoryTasteProfile(worldBible, worldState);
  const frame = buildSceneFrame(rails, worldState, worldBible, taste);
  const worldStatePatch = {
    ...seedQuestIfNeeded(worldState, worldBible),
    ...buildWorldPatch(rails, frame, worldState, characters),
  };
  const resolvedRolls = resolveRolls
    ? rails.filter(r => !!r.roll).map(r => rollRailDirective(r.roll!, characters.find(c => c.id === r.characterId) || characters[0]))
    : [];
  const pendingRail = !resolveRolls ? rails.find(r => !!r.roll) : undefined;
  const pendingRollContext = pendingRail ? railToRollContext(pendingRail) : undefined;
  const partial = {
    rails,
    characters,
    worldStatePatch,
    worldStateForNarration: mergeForNarration(worldState, worldStatePatch),
    sceneFrame: frame,
    suggestedActions: buildSuggestedActions(frame, rails),
    awaitingRoll: pendingRail && pendingRollContext ? { characterId: pendingRail.characterId, characterName: pendingRail.characterName, rollContext: pendingRollContext } : undefined,
    resolvedRolls,
  };
  return { ...partial, guardrails: buildGuardrails(partial) };
}

export function planSoloTurn(character: Character, action: string, worldState: WorldState, worldBible: WorldBible): EngineTurnPlan {
  return buildPlan([character], [action], worldState, worldBible, false);
}

export function planCoopTurn(characters: Character[], actions: string[], worldState: WorldState, worldBible: WorldBible): EngineTurnPlan {
  return buildPlan(characters, actions, worldState, worldBible, true);
}

export function planOpeningTurn(character: Character, worldState: WorldState, worldBible: WorldBible): EngineTurnPlan {
  return buildPlan([character], ['OPENING_SCENE'], worldState, worldBible, false);
}

function repairPronounsInSentence(sentence: string, character: Character, allCharacters: Character[]): string {
  if (!sentence.includes(character.name)) return sentence;
  if (allCharacters.some(c => c.id !== character.id && sentence.includes(c.name))) return sentence;
  if (character.gender === 'male') {
    return sentence.replace(/\bShe\b/g, 'He').replace(/\bshe\b/g, 'he').replace(/\bHer(?=\s+\w)/g, 'His').replace(/\bher(?=\s+\w)/g, 'his').replace(/\bHer\b/g, 'Him').replace(/\bher\b/g, 'him');
  }
  if (character.gender === 'female') {
    return sentence.replace(/\bHe\b/g, 'She').replace(/\bhe\b/g, 'she').replace(/\bHis(?=\s+\w)/g, 'Her').replace(/\bhis(?=\s+\w)/g, 'her').replace(/\bHim\b/g, 'Her').replace(/\bhim\b/g, 'her');
  }
  return sentence;
}

function repairPronouns(narration: string, characters: Character[]): string {
  return narration.split(/(?<=[.!?])\s+/)
    .map(part => characters.reduce((sentence, character) => repairPronounsInSentence(sentence, character, characters), part))
    .join(' ');
}

function looksLikeVagueLoop(narration: string): boolean {
  const lower = narration.toLowerCase();
  const vagueHits = ['more than it seems', 'not as it seems', 'secrets', 'shadows', 'answers', 'tread carefully', 'watching and waiting']
    .filter(phrase => lower.includes(phrase)).length;
  return vagueHits >= 3;
}

export function enforceTurnPlanNarration<T extends NarrationResult>(response: T, plan: EngineTurnPlan): T {
  response.narration = repairPronouns(response.narration || '', plan.characters);
  if (plan.sceneFrame.location && !response.narration.toLowerCase().includes(plan.sceneFrame.location.toLowerCase())) {
    response.narration = `At ${plan.sceneFrame.location}, ${response.narration.charAt(0).toLowerCase()}${response.narration.slice(1)}`;
  }
  if (plan.sceneFrame.concreteReveal && looksLikeVagueLoop(response.narration)) {
    response.narration += ` The concrete lead is this: ${plan.sceneFrame.concreteReveal}`;
  }
  response.worldStateChanges = {
    ...(response.worldStateChanges || {}),
    ...plan.worldStatePatch,
    currentLocation: plan.worldStatePatch.currentLocation || response.worldStateChanges?.currentLocation,
  };
  response.suggestedActions = Array.from(new Set([...(response.suggestedActions || []), ...plan.suggestedActions]))
    .filter(action => action && action.trim().length > 0)
    .slice(0, 4);
  response.scenePurpose = response.scenePurpose || plan.sceneFrame.purpose;
  response.pacingMode = response.pacingMode || plan.sceneFrame.pacingMode;
  response.sceneMomentum = plan.rails.some(r => r.mustTransition) ? 'transitioning' : (response.sceneMomentum || 'advancing');
  return response;
}

export function buildAwaitingRollNarration(plan: EngineTurnPlan): string {
  const pending = plan.awaitingRoll;
  if (!pending) return 'The moment turns on a roll.';
  return `${pending.characterName}'s choice has teeth now. ${pending.rollContext.description} will decide what opens, what breaks, and who notices.`;
}
