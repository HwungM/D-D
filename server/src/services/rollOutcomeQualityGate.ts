import type { WorldState } from '../../../shared/types';
import { parseJsonRecord } from './aiResponseParser';
import { asString } from './narrationResponseParser';
import type { RollOutcomeContext, RollOutcomeResult } from './rollNarrationService';

type ChatClient = {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: { role: 'system' | 'user'; content: string }[];
        temperature: number;
        response_format: { type: 'json_object' };
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
};

type AiCallLogger = (fn: string, data: Record<string, unknown>) => void;

export type RollOutcomeQualityIssue = {
  code: string;
  severity: 'warn' | 'fail';
  message: string;
};

export type RollOutcomeQualityArgs = {
  result: RollOutcomeResult;
  rollResult: number;
  rollTotal: number;
  dc: number;
  success: boolean;
  isCritSuccess: boolean;
  isCritFail: boolean;
  rollContext: RollOutcomeContext;
  worldState: WorldState;
  isCoop: boolean;
  actorNames: string[];
  rolls?: {
    characterName: string;
    description: string;
    rollResult: number;
    rollTotal: number;
    dc: number;
    success: boolean;
    isCritSuccess?: boolean;
    isCritFail?: boolean;
  }[];
};

export type RollOutcomeGateResult = RollOutcomeResult & {
  qualityIssues?: RollOutcomeQualityIssue[];
  qualityRevised?: boolean;
  criticPassed?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function issue(code: string, message: string, severity: 'warn' | 'fail' = 'fail'): RollOutcomeQualityIssue {
  return { code, severity, message };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function includesName(text: string, name: string): boolean {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text);
}

const FAILURE_WORDS = /\b(fails?|failure|cannot|can't|does not|doesn't|comes up empty|gets nothing|no progress|unable|misses?|botches?)\b/i;
const SUCCESS_WORDS = /\b(succeeds?|successfully|works perfectly|gets exactly|cleanly accomplishes|achieves?|wins?|secures?|reveals?|discovers?|unlocks?)\b/i;
const MECHANICS_WORDS = /\b(dc|difficulty class|skill check|ability check|rolls?|rolled|modifier|natural 20|natural 1|crit(?:ical)? success|crit(?:ical)? failure)\b/i;
const GENERIC_ACTIONS = [
  /^continue$/i,
  /^look around$/i,
  /^move forward$/i,
  /^keep going$/i,
  /^wait$/i,
  /^see what happens$/i,
  /^investigate$/i,
  /^attack$/i,
  /^talk$/i,
  /^try again$/i,
];

function shortDescription(description: string): string {
  const cleaned = description.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 56) return cleaned;
  return `${cleaned.slice(0, 53).trim()}...`;
}

export function fallbackRollSuggestions(args: Pick<RollOutcomeQualityArgs, 'rollContext' | 'success' | 'isCritSuccess' | 'isCritFail'>): string[] {
  const focus = shortDescription(args.rollContext.description || 'what just changed');
  if (args.isCritSuccess) {
    return [
      `Press the advantage from ${focus}`,
      'Ask who notices the opening first',
      'Use the momentum before it fades',
      'Claim one concrete reward or clue',
    ];
  }
  if (args.isCritFail) {
    return [
      'Deal with the new complication immediately',
      'Protect an ally from the fallout',
      `Salvage what remains of ${focus}`,
      'Retreat, regroup, or spend a resource',
    ];
  }
  if (args.success) {
    return [
      `Follow through after ${focus}`,
      'Check who reacts to the success',
      'Use a nearby advantage now',
      'Ask what this success reveals',
    ];
  }
  return [
    'Respond to the consequence now',
    `Try a different angle on ${focus}`,
    'Look for a costlier bargain or clue',
    'Regroup before the pressure worsens',
  ];
}

export function cleanRollSuggestedActions(actions: string[], args: Pick<RollOutcomeQualityArgs, 'rollContext' | 'success' | 'isCritSuccess' | 'isCritFail'>): string[] {
  const cleaned = actions
    .filter(action => typeof action === 'string')
    .map(action => action.trim())
    .filter(action => action.length >= 8 && action.length <= 140)
    .filter(action => !action.startsWith('{') && !action.startsWith('['))
    .filter(action => !GENERIC_ACTIONS.some(pattern => pattern.test(action)))
    .slice(0, 4);

  if (cleaned.length >= 3) return cleaned;
  const seen = new Set(cleaned.map(action => action.toLowerCase()));
  for (const fallback of fallbackRollSuggestions(args)) {
    if (!seen.has(fallback.toLowerCase())) {
      cleaned.push(fallback);
      seen.add(fallback.toLowerCase());
    }
    if (cleaned.length >= 4) break;
  }
  return cleaned;
}

export function assessRollOutcomeQuality(args: RollOutcomeQualityArgs): RollOutcomeQualityIssue[] {
  const narration = args.result.narration || '';
  const lower = narration.toLowerCase();
  const issues: RollOutcomeQualityIssue[] = [];

  if (wordCount(narration) < (args.isCoop ? 80 : 55)) {
    issues.push(issue('too_thin', 'The roll outcome is too thin to carry the table consequence, character reaction, and changed situation.', 'warn'));
  }

  if (MECHANICS_WORDS.test(narration)) {
    issues.push(issue('mechanics_leak', 'The player-facing outcome leaks roll mechanics instead of staying inside the fiction.'));
  }

  const successWords = SUCCESS_WORDS.test(narration);
  const failureWords = FAILURE_WORDS.test(narration);
  if (args.success && failureWords && !/\bbut|however|cost|complication|nearly|almost\b/i.test(narration)) {
    issues.push(issue('success_reads_as_failure', 'The narration reads like a failure even though the roll succeeded.'));
  }
  if (!args.success && successWords && !/\bbut|however|cost|complication|only partially|not enough|too late\b/i.test(narration)) {
    issues.push(issue('failure_reads_as_success', 'The narration reads like a success even though the roll failed.'));
  }

  if (args.isCritSuccess && !/\b(extra|opening|advantage|opportunity|inspired|bonus|unexpected|also|more than|beyond)\b/i.test(narration)) {
    issues.push(issue('crit_success_no_extra', 'A critical success should create something extra beyond simply succeeding.'));
  }
  if (args.isCritFail && !/\b(complication|cost|worse|exposed|breaks|drops|alarms?|danger|retaliates|fallout|lost|trapped)\b/i.test(narration)) {
    issues.push(issue('crit_fail_no_complication', 'A critical failure should introduce a concrete complication or escalation.'));
  }

  if (args.isCoop && args.actorNames.length > 1) {
    const missing = args.actorNames.filter(name => !includesName(narration, name));
    if (missing.length > 0) {
      issues.push(issue('coop_character_missing', `The co-op roll outcome dropped character(s): ${missing.join(', ')}.`));
    }
  }

  for (const roll of args.rolls || []) {
    if (!includesName(narration, roll.characterName)) {
      issues.push(issue('coop_roll_missing_actor', `The narration does not visibly account for ${roll.characterName}'s resolved roll.`));
      continue;
    }
    if (roll.success && lower.includes(roll.characterName.toLowerCase()) && new RegExp(`${escapeRegExp(roll.characterName)}.{0,120}${FAILURE_WORDS.source}`, 'i').test(narration)) {
      issues.push(issue('coop_success_contradicted', `${roll.characterName}'s successful roll appears to be narrated as failure.`));
    }
  }

  const cleaned = cleanRollSuggestedActions(args.result.suggestedActions || [], args);
  if (cleaned.length < Math.min(3, (args.result.suggestedActions || []).length || 3)) {
    issues.push(issue('generic_suggestions', 'Suggested actions are too generic or malformed to help the next table choice.', 'warn'));
  }

  return issues;
}

function mergeRevisedResult(original: RollOutcomeResult, revised: Record<string, unknown> | undefined, args: RollOutcomeQualityArgs): RollOutcomeResult {
  if (!revised) {
    return {
      ...original,
      suggestedActions: cleanRollSuggestedActions(original.suggestedActions || [], args),
    };
  }
  const narration = asString(revised.narration) || original.narration;
  const sceneImagePrompt = asString(revised.sceneImagePrompt) || original.sceneImagePrompt;
  const suggestedActions = Array.isArray(revised.suggestedActions)
    ? cleanRollSuggestedActions(revised.suggestedActions.filter((item): item is string => typeof item === 'string'), args)
    : cleanRollSuggestedActions(original.suggestedActions || [], args);

  return {
    ...original,
    narration,
    sceneImagePrompt,
    suggestedActions,
    worldStateChanges: asRecord(revised.worldStateChanges) as Partial<WorldState> | undefined || original.worldStateChanges,
    hpChange: typeof revised.hpChange === 'number' ? revised.hpChange : original.hpChange,
    goldChange: typeof revised.goldChange === 'number' ? revised.goldChange : original.goldChange,
    isDeath: typeof revised.isDeath === 'boolean' ? revised.isDeath : original.isDeath,
    isVictory: typeof revised.isVictory === 'boolean' ? revised.isVictory : original.isVictory,
    isCombat: typeof revised.isCombat === 'boolean' ? revised.isCombat : original.isCombat,
    loot: Array.isArray(revised.loot) ? revised.loot : original.loot,
  };
}

function formatIssues(issues: RollOutcomeQualityIssue[]): string {
  return issues.length
    ? issues.map(i => `- [${i.severity.toUpperCase()}:${i.code}] ${i.message}`).join('\n')
    : '- No deterministic issues detected. Still judge the fiction, roll honesty, co-op spotlight, and next-play usefulness.';
}

export async function runRollOutcomeQualityGate(
  openai: ChatClient,
  log: AiCallLogger | undefined,
  args: RollOutcomeQualityArgs,
): Promise<RollOutcomeGateResult> {
  const deterministicIssues = assessRollOutcomeQuality(args);
  const cleanedOriginal = mergeRevisedResult(args.result, undefined, args);
  const hasFail = deterministicIssues.some(i => i.severity === 'fail');

  const system = `You are the ROLL OUTCOME QUALITY CRITIC for a D&D game. You are not rolling dice and you are not changing the result.
Your job: decide if the draft outcome honestly matches the dice, respects every co-op player, preserves agency, and leaves useful next choices.
If it fails, revise only the player-facing JSON fields needed to make it table-ready. Preserve mechanics and the actual success/failure facts. Return JSON only.`;

  const user = `ROLL FACTS:
- Attempt: ${args.rollContext.description}
- Result: d20 ${args.rollResult}, total ${args.rollTotal} vs DC ${args.dc}
- Success: ${args.success}
- Critical success: ${args.isCritSuccess}
- Critical failure: ${args.isCritFail}
- Co-op: ${args.isCoop}
- Characters who must matter: ${args.actorNames.join(', ') || '(unknown)'}
${args.rolls?.length ? `\nINDIVIDUAL CO-OP ROLLS:\n${args.rolls.map(roll => `- ${roll.characterName}: total ${roll.rollTotal} vs DC ${roll.dc} — ${roll.success ? 'SUCCESS' : 'FAILURE'} for "${roll.description}"`).join('\n')}` : ''}

CURRENT SCENE:
- Location: ${args.worldState.currentLocation || 'Unknown'}
- Scene summary: ${args.worldState.currentSceneSummary || 'Unknown'}

DETERMINISTIC QUALITY FINDINGS:
${formatIssues(deterministicIssues)}

DRAFT JSON:
${JSON.stringify(cleanedOriginal, null, 2)}

Checklist:
1. The fiction matches the actual success/failure degree.
2. Criticals feel special: crit success grants extra opportunity; crit fail creates real fallout.
3. Co-op outcomes name and respect every involved character and every submitted/resolved roll.
4. No mechanics leak into narration.
5. Suggested actions are concrete, scene-grounded, and useful for the next player choice.
6. The result feels like a strong human DM resolving a live table moment.

Respond JSON:
{
  "pass": boolean,
  "issues": ["short issue labels"],
  "rationale": "one sentence",
  "revised": {
    "narration": "string",
    "suggestedActions": ["3-4 concrete next choices"],
    "sceneImagePrompt": "string",
    "worldStateChanges": object | null,
    "hpChange": number | null,
    "goldChange": number | null,
    "isDeath": boolean,
    "isVictory": boolean,
    "isCombat": boolean,
    "loot": array | null
  } | null
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.25,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0].message.content || '{}';
    const parsed = parseJsonRecord(content);
    const criticPassed = parsed.pass === true && !hasFail;
    const revised = asRecord(parsed.revised);
    const modelIssues = Array.isArray(parsed.issues)
      ? parsed.issues.map(asString).filter((value): value is string => !!value)
      : [];
    const issues = [
      ...deterministicIssues,
      ...modelIssues.map(label => issue(`critic_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'issue'}`, label)),
    ];
    const shouldRevise = !criticPassed && !!asString(revised?.narration);
    const result = mergeRevisedResult(cleanedOriginal, shouldRevise ? revised : undefined, args);
    log?.('rollOutcome.qualityGate', {
      isCoop: args.isCoop,
      deterministicIssues,
      criticPassed,
      revised: shouldRevise,
      rawResponse: content,
    });
    return {
      ...result,
      qualityIssues: issues,
      qualityRevised: shouldRevise,
      criticPassed,
    };
  } catch (error) {
    log?.('rollOutcome.qualityGate.error', {
      error: error instanceof Error ? error.message : String(error),
      deterministicIssues,
    });
    return {
      ...cleanedOriginal,
      qualityIssues: deterministicIssues,
      qualityRevised: false,
      criticPassed: !hasFail,
    };
  }
}
