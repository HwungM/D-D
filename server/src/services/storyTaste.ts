import type { WorldBible, WorldState } from '../../../shared/types';

type ScenePurpose = NonNullable<WorldState['sceneState']>['purpose'];
type PacingMode = NonNullable<WorldState['sceneState']>['pacingMode'];

export interface StoryTasteProfile {
  tone: string;
  favoritePillars: string[];
  desiredSceneMix: Record<ScenePurpose, number>;
  clueCadence: 'fast' | 'steady' | 'slow' | 'living_world';
  transitionPressure: 'high' | 'medium' | 'low';
  downtimeAllowance: 'brief' | 'regular' | 'generous';
  dangerAppetite: 'deadly' | 'heroic' | 'measured' | 'flexible';
  mysteryDensity: 'high' | 'medium' | 'low';
  socialDensity: 'high' | 'medium' | 'low';
  preferredNextPurpose: ScenePurpose;
  preferredPacingMode: PacingMode;
  maxSceneExchanges: number;
  directiveLines: string[];
}

const DEFAULT_MIX: Record<ScenePurpose, number> = {
  explore: 1,
  gather_info: 1,
  combat: 1,
  social: 1,
  travel: 0.6,
  rest: 0.35,
  climax: 0.2,
};

function hasPillar(pillars: string[], needle: string): boolean {
  return pillars.some(p => p.toLowerCase().includes(needle));
}

function buildSceneMix(pillars: string[]): Record<ScenePurpose, number> {
  const allEqually = pillars.length === 0 || hasPillar(pillars, 'all of it');
  const mix = { ...DEFAULT_MIX };
  if (allEqually) return mix;

  if (hasPillar(pillars, 'combat')) {
    mix.combat += 1.2;
    mix.climax += 0.45;
  }
  if (hasPillar(pillars, 'exploration')) {
    mix.explore += 1.1;
    mix.travel += 0.55;
    mix.gather_info += 0.25;
  }
  if (hasPillar(pillars, 'roleplay') || hasPillar(pillars, 'social')) {
    mix.social += 1.35;
    mix.rest += 0.35;
  }
  if (hasPillar(pillars, 'puzzles') || hasPillar(pillars, 'mysteries')) {
    mix.gather_info += 1.35;
    mix.explore += 0.25;
  }
  return mix;
}

function purposeFromRecentBalance(mix: Record<ScenePurpose, number>, worldState: WorldState): ScenePurpose {
  const recent = Array.isArray(worldState.lastPillarUsed)
    ? worldState.lastPillarUsed.slice(-5)
    : typeof worldState.lastPillarUsed === 'string'
      ? [worldState.lastPillarUsed]
      : [];
  const recentCounts = new Map<string, number>();
  for (const purpose of recent) recentCounts.set(purpose, (recentCounts.get(purpose) || 0) + 1);

  const candidates = (Object.keys(mix) as ScenePurpose[])
    .filter(p => p !== 'climax' && p !== 'rest')
    .map(p => ({ purpose: p, score: mix[p] - (recentCounts.get(p) || 0) * 0.75 }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.purpose || 'explore';
}

// Every campaign is a continuous open-ended saga now, so this always uses the
// old "long/open_ended" pacing: generous scene exchanges before forcing a
// transition, since arcs chain forever rather than compressing toward an ending.
function maxSceneExchanges(preferredPurpose: ScenePurpose): number {
  const base = 5;
  if (preferredPurpose === 'social' || preferredPurpose === 'gather_info') return base + 1;
  if (preferredPurpose === 'combat') return Math.max(2, base - 1);
  return base;
}

export function buildStoryTasteProfile(worldBible: WorldBible, worldState: WorldState): StoryTasteProfile {
  const prefs = worldBible.playerPreferences;
  const tone = prefs?.tone || 'Anything Goes';
  const favoritePillars = prefs?.favoritePillars?.length ? prefs.favoritePillars : ['All of it equally'];
  const desiredSceneMix = buildSceneMix(favoritePillars);
  const preferredNextPurpose = purposeFromRecentBalance(desiredSceneMix, worldState);

  const mysteryDensity = hasPillar(favoritePillars, 'mysteries') || tone.toLowerCase().includes('mystery') ? 'high' : 'medium';
  const socialDensity = hasPillar(favoritePillars, 'roleplay') || hasPillar(favoritePillars, 'social') ? 'high' : 'medium';
  const dangerAppetite =
    tone.toLowerCase().includes('perilous') ? 'deadly' :
    tone.toLowerCase().includes('heroic') ? 'heroic' :
    tone.toLowerCase().includes('anything') ? 'flexible' :
    'measured';
  // Every campaign is a continuous open-ended saga now (no length tiers), so
  // pacing always uses the old "open_ended" behavior: living-world clue cadence,
  // low transition pressure, and generous downtime.
  const clueCadence = 'living_world' as const;
  const transitionPressure = 'low' as const;
  const downtimeAllowance = 'generous' as const;

  const preferredPacingMode: PacingMode =
    worldState.endgamePhase === 'confrontation' ? 'climax' :
    preferredNextPurpose === 'combat' ? 'climax' :
    preferredNextPurpose === 'social' || preferredNextPurpose === 'gather_info' ? 'tension' :
    'exploration';

  const directiveLines = [
    `Campaign taste: ${tone}; an ongoing open-ended saga (no fixed length); favorite pillars: ${favoritePillars.join(', ')}.`,
    `Runtime scene bias: prefer ${preferredNextPurpose} soon unless the players clearly choose otherwise.`,
    `Clue cadence: ${clueCadence}. Do not hoard necessary clues beyond this cadence.`,
    `Transition pressure: ${transitionPressure}. Allow character moments and place texture, but still end on a playable change.`,
    `Downtime allowance: ${downtimeAllowance}. Let sincere party banter, care, romance, and quiet choices matter as real scenes.`,
    `Danger appetite: ${dangerAppetite}. ${dangerAppetite === 'deadly' ? 'Let danger cost resources, position, trust, or HP when provoked.' : dangerAppetite === 'heroic' ? 'Make victories bold, but preserve risk and consequence.' : 'Keep risk fair and legible.'}`,
    `Mystery density: ${mysteryDensity}; social density: ${socialDensity}.`,
  ];

  return {
    tone,
    favoritePillars,
    desiredSceneMix,
    clueCadence,
    transitionPressure,
    downtimeAllowance,
    dangerAppetite,
    mysteryDensity,
    socialDensity,
    preferredNextPurpose,
    preferredPacingMode,
    maxSceneExchanges: maxSceneExchanges(preferredNextPurpose),
    directiveLines,
  };
}

export function formatTasteDirective(profile: StoryTasteProfile): string {
  return `STORY TASTE ENGINE:
${profile.directiveLines.map(line => `- ${line}`).join('\n')}
- Max comfortable exchanges in one scene before a payoff, roll, complication, or transition: ${profile.maxSceneExchanges}.
- The AI DM is the narrator and actor for NPCs, not the authority on rules, pacing, or continuity. Engine facts above are binding.`;
}
