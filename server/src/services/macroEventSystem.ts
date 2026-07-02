import type { CombatEnemy, MacroEventDifficulty, PendingMacroEvent, WorldState } from '../../../shared/types';
import type { CompanionActivity } from './companionAutonomySystem';

const DIFFICULTY_ORDER: MacroEventDifficulty[] = ['easy', 'moderate', 'hard', 'deadly'];

export function rollMacroDifficulty(random: () => number = Math.random, dangerBias = 0): MacroEventDifficulty {
  const roll = Math.min(0.999, Math.max(0, random()) + dangerBias);
  if (roll < 0.34) return 'easy';
  if (roll < 0.7) return 'moderate';
  if (roll < 0.92) return 'hard';
  return 'deadly';
}

function difficultyIndex(difficulty: MacroEventDifficulty): number {
  return DIFFICULTY_ORDER.indexOf(difficulty);
}

function enemyFor(difficulty: MacroEventDifficulty, location: string): CombatEnemy {
  const level = difficultyIndex(difficulty);
  const names = ['Belligerent Cutpurse', 'Armed Street Gang', 'Veteran Mire Hunters', 'Bog-Touched Executioner'];
  return {
    name: names[level],
    archetype: level >= 3 ? 'boss' : level >= 1 ? 'soldier' : 'minion',
    maxHp: [7, 14, 23, 36][level],
    currentHp: [7, 14, 23, 36][level],
    armorClass: [10, 12, 14, 16][level],
    condition: 'healthy',
    specialAbility: level >= 2 ? `Uses ${location}'s terrain to isolate vulnerable targets.` : undefined,
  };
}

export function buildCompanionEmergency(
  activity: CompanionActivity,
  random: () => number = Math.random,
): PendingMacroEvent {
  const difficulty = rollMacroDifficulty(random, activity.subLocation ? 0 : 0.05);
  const enemy = enemyFor(difficulty, activity.subLocation || activity.location);
  return {
    id: crypto.randomUUID(),
    kind: 'companion_emergency',
    title: `${activity.companionName} is in trouble`,
    description: `${activity.companionName} has been cornered by ${enemy.name} at ${activity.subLocation || activity.location}. You can travel there immediately to join the fight, trust them to handle it, or stay out of it.`,
    difficulty,
    location: activity.location,
    subLocation: activity.subLocation,
    companionId: activity.companionId,
    companionName: activity.companionName,
    enemy,
    choices: [
      { id: 'help', label: 'Travel to Help', description: 'Go directly to them and enter live combat.' },
      { id: 'delegate', label: 'Let Them Handle It', description: 'Resolve the danger using their own ability and the event difficulty.' },
      { id: 'decline', label: 'Stay Out of It', description: 'Do not intervene; consequences may remain.' },
    ],
    createdAt: new Date().toISOString(),
  };
}

type EventTemplate = Pick<PendingMacroEvent, 'kind' | 'title' | 'description'>;

function eventTemplateForAction(action: string): EventTemplate | undefined {
  if (/\b(rob|heist|burglar|break in|steal from (?:a )?(?:house|bank|vault))\b/i.test(action)) {
    return { kind: 'heist', title: 'A Real Heist Begins', description: 'The attempt has become a full operation with witnesses, security, and consequences—not a single flavor action.' };
  }
  if (/\b(championship|tournament|contest|race|duel|compete)\b/i.test(action)) {
    return { kind: 'competition', title: 'Competition Day', description: 'The challenge has drawn real competitors and stakes. Enter it as a structured contest or walk away.' };
  }
  if (/\b(perform|concert|play a song|sing|show|audition)\b/i.test(action)) {
    return { kind: 'performance', title: 'The Crowd Is Gathering', description: 'This can become a full public performance with reputation, rewards, and the possibility of failure.' };
  }
  if (/\b(make|record|produce|write)\b.{0,25}\b(song|movie|play|album|book)\b/i.test(action)) {
    return { kind: 'production', title: 'A Major Project Takes Shape', description: 'The idea can become a multi-step creative project with cost, risk, reception, and a finished result.' };
  }
  return undefined;
}

function spontaneousTemplateForAction(action: string): EventTemplate {
  if (/\b(talk|ask|persuade|meet|greet|offer)\b/i.test(action)) {
    return { kind: 'opportunity', title: 'A Serious Offer', description: 'Someone involved sees an opening and proposes something consequential enough to become its own sequence.' };
  }
  if (/\b(search|explore|inspect|open|follow|enter)\b/i.test(action)) {
    return { kind: 'crisis', title: 'The Situation Escalates', description: 'The investigation has disturbed something consequential. Deal with the developing crisis now or back away.' };
  }
  return { kind: 'opportunity', title: 'An Unexpected Opening', description: 'A larger opportunity emerges from the current scene, with real stakes and a result the campaign will remember.' };
}

export function maybeBuildMacroEventFromMicroAction(
  action: string,
  worldState: WorldState,
  random: () => number = Math.random,
): PendingMacroEvent | undefined {
  if (worldState.pendingMacroEvent || worldState.combatState?.inCombat || worldState.sceneState?.skillChallenge) return undefined;
  const direct = eventTemplateForAction(action);
  if (!direct && random() >= 0.06) return undefined;
  const template = direct || spontaneousTemplateForAction(action);
  const dangerBias = template.kind === 'heist' || template.kind === 'crisis' ? 0.14 : 0;
  const difficulty = rollMacroDifficulty(random, dangerBias);
  return {
    id: crypto.randomUUID(),
    ...template,
    difficulty,
    location: worldState.currentLocation || 'the current area',
    choices: [
      { id: 'accept', label: template.kind === 'heist' ? 'Begin the Operation' : template.kind === 'crisis' ? 'Face It' : 'Take Part', description: 'Open a structured sequence with rolls and persistent consequences.' },
      { id: 'decline', label: 'Not Now', description: 'Leave the opportunity without starting the sequence.' },
    ],
    createdAt: new Date().toISOString(),
    sourceAction: action,
  };
}

export function combatStateForEmergency(event: PendingMacroEvent): NonNullable<WorldState['combatState']> {
  const enemy = event.enemy || enemyFor(event.difficulty, event.location);
  return {
    inCombat: true,
    enemyName: enemy.name,
    enemyCondition: 'healthy',
    roundNumber: 1,
    playerActionsAttempted: [],
    enemies: [enemy],
    isBossFight: event.difficulty === 'deadly',
    bossPhase: event.difficulty === 'deadly' ? 1 : undefined,
  };
}

export function contestForMacroEvent(event: PendingMacroEvent, participantIds: string[]): NonNullable<NonNullable<WorldState['sceneState']>['skillChallenge']> {
  const target = { easy: 2, moderate: 3, hard: 4, deadly: 5 }[event.difficulty];
  const contestType = event.kind === 'heist' ? 'heist' : event.kind === 'performance' ? 'social' : 'other';
  return {
    id: event.id,
    objective: event.title,
    successes: 0,
    failures: 0,
    targetSuccesses: target,
    maxFailures: event.difficulty === 'deadly' ? 2 : 3,
    participantIds,
    stakes: event.description,
    updatedAt: new Date().toISOString(),
    contestType,
    stakesDescription: `${event.difficulty.toUpperCase()} difficulty: ${event.description}`,
    onSuccessHint: 'Grant a concrete reward, reputation change, item, or lasting opportunity.',
    onFailureHint: 'Apply a real complication, loss, injury, suspicion, or reputational consequence.',
  };
}

export function companionDelegateOutcome(event: PendingMacroEvent, companionLevel: number, random: () => number = Math.random): { success: boolean; damage: number } {
  const dc = { easy: 0.25, moderate: 0.45, hard: 0.68, deadly: 0.86 }[event.difficulty];
  const levelBonus = Math.min(0.2, Math.max(0, companionLevel - 1) * 0.03);
  const success = random() + levelBonus >= dc;
  return { success, damage: success ? 0 : { easy: 1, moderate: 2, hard: 4, deadly: 7 }[event.difficulty] };
}
