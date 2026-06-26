import type { Character, NpcMemory, WorldBible, WorldState } from '../../../shared/types';

export type ExperienceEvalIssue = {
  code: string;
  severity: 'warn' | 'fail';
  message: string;
};

export type ExperienceEvalFrame = {
  label: string;
  narration: string;
  actions?: string[];
  suggestedActions?: string[];
  isCoop?: boolean;
  characters?: Pick<Character, 'id' | 'name'>[];
  awaitingRoll?: boolean;
  rollOutcome?: {
    success: boolean;
    isCritSuccess?: boolean;
    isCritFail?: boolean;
    expectedRollerNames?: string[];
  };
  worldBible?: WorldBible;
  worldStateBefore?: WorldState;
  worldStateAfter?: WorldState;
  expectedNpcMemoryNames?: string[];
  expectedCharacterMemoryIds?: string[];
  expectDmMemory?: boolean;
  expectConsequenceMemory?: boolean;
  expectNoActRush?: boolean;
};

export type ExperienceEvalReport = {
  label: string;
  score: number;
  issues: ExperienceEvalIssue[];
  ready: boolean;
};

function issue(code: string, message: string, severity: 'warn' | 'fail' = 'fail'): ExperienceEvalIssue {
  return { code, severity, message };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesName(text: string, name: string): boolean {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text);
}

function npcByName(worldState: WorldState | undefined, name: string): NpcMemory | undefined {
  const key = name.trim().toLowerCase();
  return [...(worldState?.npcMemory || []), ...(worldState?.keyNPCs || [])]
    .find(npc => npc.name.trim().toLowerCase() === key);
}

const GENERIC_SUGGESTIONS = [
  /^continue$/i,
  /^look around$/i,
  /^move forward$/i,
  /^keep going$/i,
  /^wait$/i,
  /^see what happens$/i,
  /^investigate$/i,
  /^talk$/i,
  /^attack$/i,
  /^try again$/i,
];

function concreteSuggestions(suggestedActions: string[] | undefined): string[] {
  return (suggestedActions || [])
    .map(action => action.trim())
    .filter(action => action.length >= 8 && action.length <= 140)
    .filter(action => !GENERIC_SUGGESTIONS.some(pattern => pattern.test(action)))
    .filter(action => !action.startsWith('{') && !action.startsWith('['))
    .slice(0, 4);
}

function toneText(worldBible: WorldBible | undefined): string {
  return [
    worldBible?.playerPreferences?.tone,
    ...(worldBible?.toneRules || []),
    worldBible?.centralConflict,
  ].filter(Boolean).join(' ').toLowerCase();
}

function scoreIssues(issues: ExperienceEvalIssue[]): number {
  const penalty = issues.reduce((sum, item) => sum + (item.severity === 'fail' ? 18 : 7), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function evaluateExperienceFrame(frame: ExperienceEvalFrame): ExperienceEvalReport {
  const issues: ExperienceEvalIssue[] = [];
  const narration = frame.narration || '';
  const lower = narration.toLowerCase();

  if (wordCount(narration) < (frame.isCoop ? 80 : 45) && !frame.awaitingRoll) {
    issues.push(issue('thin_narration', 'Narration is too thin to establish consequence, reaction, and a next playable state.', 'warn'));
  }

  if (/\b(dc|skill check|ability check|modifier|json|system prompt)\b/i.test(narration)) {
    issues.push(issue('mechanics_leak', 'Player-facing narration leaks system/mechanics language.'));
  }

  if (frame.isCoop && frame.characters?.length) {
    const missing = frame.characters.filter(character => !includesName(narration, character.name));
    if (missing.length > 0) {
      issues.push(issue('coop_character_missing', `Co-op frame dropped character(s): ${missing.map(c => c.name).join(', ')}.`));
    }
    if (/\b(meanwhile|elsewhere|in another part|across town|on the other side of)\b/i.test(narration)) {
      issues.push(issue('split_camera', 'Co-op frame split the party instead of playing one shared table moment.'));
    }
  }

  if (!frame.awaitingRoll && concreteSuggestions(frame.suggestedActions).length < 3) {
    issues.push(issue('weak_suggestions', 'Suggested actions are too generic or too few for the next choice.', 'warn'));
  }

  if (frame.expectNoActRush !== false && /\b(weeks pass|days pass|after a long journey|eventually|with that, act|act ii|act iii|final confrontation|campaign ends)\b/i.test(narration)) {
    issues.push(issue('rushed_pacing', 'Frame appears to rush campaign structure instead of playing the current moment.'));
  }

  const tone = toneText(frame.worldBible);
  if (/\b(cozy|warm|romantic|whimsical|playful|light)\b/.test(tone)) {
    const grimHits = (lower.match(/\b(viscera|gore|hopeless|blood-soaked|nightmare|agony|screaming)\b/g) || []).length;
    if (grimHits >= 2) issues.push(issue('tone_mismatch', 'Frame is too grim for the selected lighter/warm tone.', 'warn'));
  }

  if (frame.rollOutcome) {
    const saysFailure = /\b(fails?|failure|cannot|can't|unable|misses?|botches?|gets nothing)\b/i.test(narration);
    const saysSuccess = /\b(succeeds?|successfully|gets exactly|cleanly accomplishes|secures?|discovers?|wins?)\b/i.test(narration);
    if (frame.rollOutcome.success && saysFailure && !/\bbut|however|cost|complication|nearly|almost\b/i.test(narration)) {
      issues.push(issue('roll_success_contradicted', 'Narration reads like failure even though the roll succeeded.'));
    }
    if (!frame.rollOutcome.success && saysSuccess && !/\bbut|however|cost|complication|not enough|too late\b/i.test(narration)) {
      issues.push(issue('roll_failure_contradicted', 'Narration reads like success even though the roll failed.'));
    }
    if (frame.rollOutcome.expectedRollerNames?.length) {
      const missing = frame.rollOutcome.expectedRollerNames.filter(name => !includesName(narration, name));
      if (missing.length > 0) {
        issues.push(issue('roll_actor_missing', `Roll outcome did not account for roller(s): ${missing.join(', ')}.`));
      }
    }
  }

  for (const name of frame.expectedNpcMemoryNames || []) {
    if (!npcByName(frame.worldStateAfter, name)) {
      issues.push(issue('npc_memory_missing', `Expected NPC memory for ${name}, but it was not present after the frame.`));
    }
  }

  if (frame.expectConsequenceMemory) {
    const before = new Set((frame.worldStateBefore?.npcMemory || []).map(npc => npc.name.toLowerCase()));
    const after = [...(frame.worldStateAfter?.npcMemory || []), ...(frame.worldStateAfter?.keyNPCs || [])]
      .filter(npc => !before.has(npc.name.toLowerCase()) || Math.abs(npc.relationshipScore ?? 0) >= 20);
    if (after.length === 0) {
      issues.push(issue('consequence_memory_missing', 'Frame expected durable relationship/consequence memory, but no meaningful NPC memory changed.'));
    }
  }

  for (const id of frame.expectedCharacterMemoryIds || []) {
    if (!(frame.worldStateAfter?.characterMemories || []).some(memory => memory.characterId === id)) {
      issues.push(issue('character_memory_missing', `Expected character memory for ${id}, but it was not present after the frame.`));
    }
  }

  if (frame.expectDmMemory) {
    const dmMemory = frame.worldStateAfter?.dmMemory;
    const hasUsefulMemory = !!dmMemory && [
      ...(dmMemory.unresolvedConsequences || []),
      ...(dmMemory.promisesToHonor || []),
      ...(dmMemory.recurringMotifs || []),
    ].length > 0;
    if (!hasUsefulMemory) {
      issues.push(issue('dm_memory_missing', 'Expected DM campaign memory, but no useful campaign-brain lanes were populated.'));
    }
  }

  const score = scoreIssues(issues);
  return {
    label: frame.label,
    score,
    issues,
    ready: !issues.some(item => item.severity === 'fail') && score >= 80,
  };
}

export function evaluateExperienceSequence(frames: ExperienceEvalFrame[]): ExperienceEvalReport {
  const reports = frames.map(evaluateExperienceFrame);
  const issues = reports.flatMap(report => report.issues.map(item => ({
    ...item,
    message: `[${report.label}] ${item.message}`,
  })));
  const score = reports.length
    ? Math.round(reports.reduce((sum, report) => sum + report.score, 0) / reports.length)
    : 100;
  return {
    label: 'experience sequence',
    score: Math.min(score, scoreIssues(issues)),
    issues,
    ready: reports.every(report => report.ready) && !issues.some(item => item.severity === 'fail'),
  };
}

export function formatExperienceEvalReport(report: ExperienceEvalReport): string {
  const header = `${report.ready ? 'READY' : 'NOT READY'} (${report.score}/100): ${report.label}`;
  if (report.issues.length === 0) return `${header}\n- No experience blockers detected.`;
  return `${header}\n${report.issues.map(item => `- [${item.severity.toUpperCase()}:${item.code}] ${item.message}`).join('\n')}`;
}
