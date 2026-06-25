import type { Character, WorldBible, WorldState } from '../../../shared/types';
import type { ActionRail } from './storyRails';

type ScenePurpose = NonNullable<WorldState['sceneState']>['purpose'];
type PacingMode = NonNullable<WorldState['sceneState']>['pacingMode'];
type SkillChallengeState = NonNullable<NonNullable<WorldState['sceneState']>['skillChallenge']>;

export type RollAdjudicationMode = 'none' | 'single' | 'assisted' | 'group' | 'separate' | 'skill_challenge';

export interface DndTableProfile {
  rollMode: RollAdjudicationMode;
  rollDirective: string;
  identityLines: string[];
  worldReactionLines: string[];
  pacingLines: string[];
  skillChallenge?: SkillChallengeState;
}

function compact(value: string | undefined | null, max = 160): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function statMod(value: number | undefined): string {
  const mod = Math.floor(((value ?? 10) - 10) / 2);
  return `${mod >= 0 ? '+' : ''}${mod}`;
}

function strongestStats(character: Character): string {
  return Object.entries(character.stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([stat, value]) => `${stat.toUpperCase()} ${value} (${statMod(value)})`)
    .join(', ');
}

function weakestStat(character: Character): string {
  const [stat, value] = Object.entries(character.stats).sort((a, b) => a[1] - b[1])[0] || ['?', 10];
  return `${stat.toUpperCase()} ${value} (${statMod(value)})`;
}

function relationBand(score: number): string {
  if (score <= -60) return 'enemy';
  if (score <= -25) return 'hostile';
  if (score <= -8) return 'wary';
  if (score >= 60) return 'devoted';
  if (score >= 25) return 'ally';
  if (score >= 8) return 'warm';
  return 'neutral';
}

function buildIdentityLines(characters: Character[], worldState: WorldState): string[] {
  const hooks = worldState.backstoryHooks || [];
  const history = worldState.characterHistory || [];
  return characters.map(character => {
    const hook = hooks.find(h => h.characterId === character.id && h.status !== 'resolved');
    const personalHistory = history
      .filter(h => h.description.toLowerCase().includes(character.name.toLowerCase()))
      .slice(-2)
      .map(h => `${h.type}: ${h.description}`)
      .join('; ');
    const reputations = Object.entries(character.reputation || {})
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 2)
      .map(([name, score]) => `${name} ${score} (${relationBand(score)})`)
      .join(', ');
    return [
      `${character.name}: ${character.race} ${character.class}${character.subclass ? ` (${character.subclass})` : ''}, strongest ${strongestStats(character)}, weakest ${weakestStat(character)}.`,
      compact(character.backstory) ? `Backstory cue: ${compact(character.backstory)}` : undefined,
      hook ? `Live hook: ${hook.hook} (${hook.status}).` : undefined,
      personalHistory ? `Remembered deeds: ${personalHistory}.` : undefined,
      reputations ? `Reputation: ${reputations}.` : undefined,
    ].filter((line): line is string => !!line).join(' ');
  });
}

function rollModeFromRails(rails: ActionRail[], worldState: WorldState): RollAdjudicationMode {
  const rolled = rails.filter(r => r.roll);
  if (worldState.sceneState?.skillChallenge) return 'skill_challenge';
  if (rolled.length === 0) return 'none';
  if (rolled.length === 1) {
    return rails.some(r => r.intent === 'help') ? 'assisted' : 'single';
  }
  const intents = new Set(rolled.map(r => r.intent));
  const stats = new Set(rolled.map(r => r.roll?.stat));
  const isSameObjective = intents.size === 1 || stats.size === 1;
  if ((worldState.sceneState?.stalledCount ?? 0) >= 1 && ['investigation', 'persuasion', 'intimidation', 'sense magic'].some(intent => intents.has(intent))) {
    return 'skill_challenge';
  }
  return isSameObjective ? 'group' : 'separate';
}

function rollDirective(mode: RollAdjudicationMode, rails: ActionRail[]): string {
  const rolled = rails.filter(r => r.roll);
  const rollList = rolled.map(r => `${r.characterName}: ${r.roll!.stat.toUpperCase()} DC ${r.roll!.dc} for ${r.roll!.reason}`).join('; ');
  const base = rollList ? `Detected checks: ${rollList}.` : 'No mandatory check detected from the submitted action.';
  const modeText: Record<RollAdjudicationMode, string> = {
    none: 'Do not call for dice unless the fiction adds uncertainty with a real cost. Pure expression, safe travel, visible facts, and party banter should resolve through narration.',
    single: 'Use one player-facing d20 check. Stop before the outcome, then let the roll decide success, complication, or cost.',
    assisted: 'Use one primary check. Treat the helper as fictional advantage: lower the DC slightly, improve the success effect, or soften the failure cost; do not make the helper roll separately unless their own action is independently risky.',
    group: 'Use a group check when both characters attempt the same risky objective. Each prompted character gets their own roll; the final narration should read the combined result, not ignore one screen.',
    separate: 'Use separate checks when both characters attempt different risky things. Queue/resolve all required rolls before the DM narrates the final outcome; never accept the first roll and discard the second.',
    skill_challenge: 'Run this as a skill challenge: multiple distinct approaches can count as successes or failures toward the shared objective. Do not ask for the same skill repeatedly; invite different stats, tools, spells, or social angles.',
  };
  return `${base} Ruling: ${modeText[mode]}`;
}

function buildWorldReactionLines(worldState: WorldState, worldBible?: WorldBible): string[] {
  const factions = Object.entries(worldState.factionStandings || {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([name, score]) => `${name} ${score} (${relationBand(score)})`);
  const npcs = (worldState.npcMemory || [])
    .slice(-6)
    .map(npc => `${npc.name}: ${npc.relationshipLabel || relationBand(npc.relationshipScore ?? 0)}, ${compact(npc.notes, 90) || npc.disposition}`);
  const ledger = (worldState.storyLedger || [])
    .filter(entry => entry.status !== 'resolved')
    .sort((a, b) => (b.urgency === 'high' ? 1 : 0) - (a.urgency === 'high' ? 1 : 0))
    .slice(0, 4)
    .map(entry => `${entry.urgency.toUpperCase()} ${entry.kind}: ${entry.title}`);
  const antagonist = worldBible?.primaryAntagonist
    ? [`${worldBible.primaryAntagonist.isRevealed ? worldBible.primaryAntagonist.name : 'Hidden antagonist'} wants: ${compact(worldBible.primaryAntagonist.agenda, 120)}`]
    : [];

  return [
    factions.length ? `Faction pressure: ${factions.join(', ')}.` : 'Faction pressure: no strong standings yet; create consequences when actions would help, harm, betray, or impress a faction.',
    npcs.length ? `NPC memory to honor: ${npcs.join(' | ')}.` : 'NPC memory: any named person who appears should gain/refresh npcMemory if the scene changes their relationship to the party.',
    ledger.length ? `Open threads that can react: ${ledger.join(' | ')}.` : undefined,
    ...antagonist,
  ].filter((line): line is string => !!line);
}

function buildPacingLines(worldState: WorldState, purpose: ScenePurpose, pacingMode: PacingMode, maxSceneExchanges?: number): string[] {
  const scene = worldState.sceneState;
  const budget = maxSceneExchanges ?? (purpose === 'combat' ? 3 : purpose === 'social' || purpose === 'gather_info' ? 5 : 4);
  const exchangeCount = scene?.exchangeCount ?? 0;
  const stalled = scene?.stalledCount ?? 0;
  return [
    `Scene pacing: ${purpose}/${pacingMode}, exchange ${exchangeCount} of about ${budget}.`,
    exchangeCount >= budget ? 'This scene is at budget: force a payoff, decision, cost, clue, roll, or exit this turn.' : 'Keep the scene moving toward a playable change; do not end on pure atmosphere.',
    stalled > 0 ? `Stall pressure ${stalled}: reveal a concrete fact, introduce pushback, or make the next choice explicit.` : 'If the players already earned information, give it; do not hide mandatory clues behind extra loops.',
  ];
}

export function maybeBuildSkillChallenge(rails: ActionRail[], worldState: WorldState, frame: { purpose: ScenePurpose; objective: string; stakes: string }): SkillChallengeState | undefined {
  const existing = worldState.sceneState?.skillChallenge;
  if (existing) return { ...existing, updatedAt: new Date().toISOString() };
  const rolled = rails.filter(r => r.roll);
  const challengePurpose = frame.purpose === 'gather_info' || frame.purpose === 'social' || frame.purpose === 'explore' || frame.purpose === 'climax';
  const repeatedPressure = (worldState.sceneState?.stalledCount ?? 0) >= 1 || (worldState.sceneState?.exchangeCount ?? 0) >= 3;
  if (!challengePurpose || rolled.length === 0 || (!repeatedPressure && rolled.length < 2)) return undefined;
  return {
    id: `sc-${Date.now()}`,
    objective: frame.objective,
    successes: 0,
    failures: 0,
    targetSuccesses: rolled.length >= 2 ? 3 : 2,
    maxFailures: 3,
    participantIds: Array.from(new Set(rails.map(r => r.characterId))),
    stakes: frame.stakes,
    updatedAt: new Date().toISOString(),
  };
}

export function buildDndTableProfile(args: {
  characters: Character[];
  worldState: WorldState;
  worldBible?: WorldBible;
  rails?: ActionRail[];
  scenePurpose?: ScenePurpose;
  pacingMode?: PacingMode;
  maxSceneExchanges?: number;
  skillChallenge?: SkillChallengeState;
}): DndTableProfile {
  const rollMode = args.rails ? rollModeFromRails(args.rails, args.worldState) : 'none';
  const skillChallenge = args.skillChallenge || args.worldState.sceneState?.skillChallenge || undefined;
  return {
    rollMode: skillChallenge ? 'skill_challenge' : rollMode,
    rollDirective: args.rails ? rollDirective(skillChallenge ? 'skill_challenge' : rollMode, args.rails) : rollDirective('none', []),
    identityLines: buildIdentityLines(args.characters, args.worldState),
    worldReactionLines: buildWorldReactionLines(args.worldState, args.worldBible),
    pacingLines: buildPacingLines(
      args.worldState,
      args.scenePurpose || args.worldState.sceneState?.purpose || 'explore',
      args.pacingMode || args.worldState.sceneState?.pacingMode || 'exploration',
      args.maxSceneExchanges,
    ),
    skillChallenge,
  };
}

export function formatDndTableDirectives(profile: DndTableProfile): string {
  const challenge = profile.skillChallenge
    ? `\nSKILL CHALLENGE STATE:\n- Objective: ${profile.skillChallenge.objective}\n- Track: ${profile.skillChallenge.successes}/${profile.skillChallenge.targetSuccesses} successes before ${profile.skillChallenge.failures}/${profile.skillChallenge.maxFailures} failures.\n- Stakes: ${profile.skillChallenge.stakes}\n- Let different approaches matter; after each resolved roll, narrate progress, cost, or changed position.`
    : '';
  return `D&D TABLE SYSTEMS:
ROLL ADJUDICATION:
- ${profile.rollDirective}
- Ask for rolls only when the outcome is uncertain and failure would change the situation. Failure should move the story with cost/complication, not dead-end.
- In co-op, never resolve a final outcome until all required player-facing rolls for the submitted actions are resolved.

CHARACTER IDENTITY & SPOTLIGHT:
${profile.identityLines.map(line => `- ${line}`).join('\n') || '- No character identity profile available.'}
- Let race, class, reputation, backstory, equipment, and past deeds change how NPCs and the world react when relevant. Do not make every reaction generic.

WORLD REACTION:
${profile.worldReactionLines.map(line => `- ${line}`).join('\n')}
- Violence, mercy, public embarrassment, theft, rescue, and betrayal should move relationshipScore/factionRepChange by a meaningful amount. A defeated or humiliated enemy should not remain nearly neutral.

SCENE PACING:
${profile.pacingLines.map(line => `- ${line}`).join('\n')}${challenge}`;
}
