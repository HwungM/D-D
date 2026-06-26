import type { WorldBible, WorldState } from '../../../shared/types';
import { parseJsonRecord } from './aiResponseParser';
import { asString } from './narrationResponseParser';
import type { BeatPlan, ChatClient } from './turnPipeline';

type AiCallLogger = (fn: string, data: Record<string, unknown>) => void;

export type DmQualityIssue = {
  code: string;
  severity: 'warn' | 'fail';
  message: string;
};

export type DmQualityGateResult = {
  narration: string;
  sceneImagePrompt: string;
  issues: DmQualityIssue[];
  revised: boolean;
  criticPassed: boolean;
  criticRationale?: string;
};

type QualityGateArgs = {
  narration: string;
  sceneImagePrompt: string;
  plan: BeatPlan;
  actionsBlock: string;
  worldState: WorldState;
  worldBible: WorldBible;
  recentHistory: string[];
  isCoop: boolean;
  coopNames?: string[];
  tableDirectives?: string;
};

function firstSentence(text: string): string {
  return (text.match(/^(.{1,240}?[.!?])\s/)?.[1] || text.slice(0, 180)).trim();
}

function toneText(worldBible: WorldBible): string {
  return [
    worldBible.playerPreferences?.tone,
    ...(worldBible.toneRules || []),
    worldBible.centralConflict,
  ].filter(Boolean).join(' ').toLowerCase();
}

function issue(code: string, message: string, severity: 'warn' | 'fail' = 'fail'): DmQualityIssue {
  return { code, severity, message };
}

function actionFragments(actionsBlock: string): string[] {
  return actionsBlock
    .split('\n')
    .map(line => line.replace(/^.*?:\s*/, '').toLowerCase())
    .flatMap(action => action.match(/\b[a-z][a-z'-]{3,}\b/g) || [])
    .filter(word => !['character', 'action', 'with', 'their', 'that', 'this', 'from', 'into', 'they', 'them', 'then'].includes(word))
    .slice(0, 16);
}

function overlapsRecentOpening(narration: string, recentHistory: string[]): boolean {
  const opening = firstSentence(narration).toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(w => w.length > 3);
  if (opening.length < 5) return false;
  return recentHistory.slice(-4).some(entry => {
    const recent = firstSentence(entry).toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(w => w.length > 3);
    if (recent.length < 5) return false;
    const shared = opening.filter(word => recent.includes(word)).length;
    return shared >= Math.min(6, Math.ceil(opening.length * 0.55));
  });
}

export function assessDmQuality(args: QualityGateArgs): DmQualityIssue[] {
  const narration = args.narration || '';
  const lower = narration.toLowerCase();
  const tone = toneText(args.worldBible);
  const issues: DmQualityIssue[] = [];
  const wordCount = narration.trim().split(/\s+/).filter(Boolean).length;

  if (wordCount < 35 && !args.plan.needsRoll) {
    issues.push(issue('too_thin', 'The narration is too thin for a resolved beat; it likely lacks table texture, NPC reaction, or a concrete playable change.', 'warn'));
  }

  if (/\b(dc|skill check|ability check|roll a|rolled|modifier|advantage|disadvantage|mechanic|json)\b/i.test(narration)) {
    issues.push(issue('mechanics_leak', 'The player-facing narration exposes mechanics/system language instead of staying in fiction.'));
  }

  if (args.plan.needsRoll && /\b(succeeds?|fails?|successfully|manages to|reveals?|learns?|discovers?|defeats?|kills?|escapes?)\b/i.test(narration)) {
    issues.push(issue('resolved_pending_roll', 'The scene appears to resolve the uncertain action even though this beat must stop before the roll outcome.'));
  }

  if (args.isCoop && args.coopNames?.length) {
    const missing = args.coopNames.filter(name => !new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(narration));
    if (missing.length > 0) {
      issues.push(issue('coop_character_missing', `The narration dropped co-op character(s): ${missing.join(', ')}.`));
    }
  }

  if (/\b(you feel|you are filled with|you cannot help but|you realize with|you know in your heart|fear grips you|hope rises in you)\b/i.test(narration)) {
    issues.push(issue('agency_violation', 'The narration assigns inner feelings or conclusions to the player instead of presenting pressure and letting the player decide.'));
  }

  if (/\b(the party|the group|the duo|they both|together, they)\b/i.test(firstSentence(narration)) && args.isCoop) {
    issues.push(issue('stiff_coop_summary', 'The co-op opening summarizes the party instead of opening on a named character action, NPC reaction, or concrete table moment.', 'warn'));
  }

  if (/\b(weeks pass|days pass|hours pass|before long|after a long journey|eventually|with that, the act|the next act|final confrontation)\b/i.test(narration)) {
    issues.push(issue('rushed_pacing', 'The narration appears to fast-forward or compress campaign structure instead of playing the current table moment.'));
  }

  const gentleTone = /\b(cozy|light|romance|romantic|whimsical|funny|comedy|playful|slice of life|hopeful)\b/.test(tone);
  const darkWords = (lower.match(/\b(blood-soaked|doom|despair|horror|screaming|viscera|mortal terror|hopeless|nightmare|agony)\b/g) || []).length;
  if (gentleTone && darkWords >= 2) {
    issues.push(issue('tone_overdramatic', 'The narration is too grim or melodramatic for the selected lighter/romantic/playful tone.'));
  }

  const grittyTone = /\b(grim|dark|horror|deadly|perilous|survival|tragic)\b/.test(tone);
  if (grittyTone && /\b(wacky|goofy|silly|cartoonish|zany|hijinks)\b/i.test(narration)) {
    issues.push(issue('tone_too_silly', 'The narration undercuts the selected darker/perilous tone with silly language.'));
  }

  const fragments = actionFragments(args.actionsBlock);
  const matched = fragments.filter(fragment => lower.includes(fragment)).length;
  if (fragments.length >= 5 && matched === 0) {
    issues.push(issue('action_disconnected', 'The narration appears disconnected from the submitted player action(s).'));
  }

  if (overlapsRecentOpening(narration, args.recentHistory)) {
    issues.push(issue('repeated_opening', 'The narration opens too similarly to recent history instead of varying the table rhythm.', 'warn'));
  }

  return issues;
}

function formatIssues(issues: DmQualityIssue[]): string {
  return issues.length
    ? issues.map(i => `- [${i.severity.toUpperCase()}:${i.code}] ${i.message}`).join('\n')
    : '- No deterministic issues detected. Still judge tone, coherence, continuity, and DM quality.';
}

export async function runDmQualityGate(
  openai: ChatClient,
  log: AiCallLogger,
  args: QualityGateArgs,
): Promise<DmQualityGateResult> {
  const deterministicIssues = assessDmQuality(args);
  const tone = args.worldBible.playerPreferences?.tone || 'Anything Goes';
  const pillars = args.worldBible.playerPreferences?.favoritePillars?.join(', ') || 'All of it equally';
  const campaignLength = args.worldBible.playerPreferences?.campaignLength || 'medium';
  const system = `You are the DM QUALITY CRITIC for a D&D game. You are not the narrator. Your job is to decide whether the draft is actually good enough to show players.
Be strict. Passing means the scene feels like a strong human DM at the table: responsive, tone-matched, coherent with recent story, not rushed, not stiff, not melodramatic unless the campaign asks for it, and mechanically honest.
If it fails, revise ONLY the narration and optional sceneImagePrompt. Preserve the beat plan, roll state, player agency, and facts. Do not add resolved outcomes when a roll is pending.
Return JSON only.`;

  const user = `CAMPAIGN TASTE:
- Tone: ${tone}
- Favorite pillars: ${pillars}
- Campaign length: ${campaignLength}
- World conflict: ${args.worldBible.centralConflict || 'unknown'}

CURRENT SCENE:
- Location: ${args.worldState.currentLocation || 'Unknown'}
- Scene purpose: ${args.plan.scenePurpose}
- Pacing mode: ${args.plan.pacingMode}
- Needs pending roll: ${args.plan.needsRoll}${args.plan.rollReason ? ` (${args.plan.rollReason})` : ''}
- Priorities: ${args.plan.priorities.join(' | ')}
${args.tableDirectives ? `\nTABLE DIRECTIVES:\n${args.tableDirectives.slice(0, 2500)}` : ''}

PLAYER ACTIONS:
${args.actionsBlock}

RECENT HISTORY:
${args.recentHistory.slice(-5).join('\n') || '(beginning)'}

DETERMINISTIC QUALITY FINDINGS:
${formatIssues(deterministicIssues)}

DRAFT NARRATION:
"""
${args.narration}
"""

Judge with this checklist:
1. Directly answers the latest player action(s), not stale context.
2. Matches the selected tone and campaign length.
3. Fits current pacing: no speedrun, no filler, no melodrama beyond tone.
4. Preserves player agency; no forced feelings/choices.
5. If co-op, every player character has distinct named presence.
6. If a roll is pending, it stops before outcome.
7. Uses established NPC/world memory when relevant.
8. Feels like vivid table narration, not a stiff summary.

Respond JSON:
{
  "pass": boolean,
  "issues": ["short issue labels"],
  "rationale": "one sentence",
  "revisedNarration": "string or null - required if pass is false",
  "revisedSceneImagePrompt": "string or null"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user },
      ],
      temperature: 0.25,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0].message.content || '{}';
    const parsed = parseJsonRecord(content);
    const criticPassed = parsed.pass === true && deterministicIssues.filter(i => i.severity === 'fail').length === 0;
    const revisedNarration = asString(parsed.revisedNarration);
    const revisedSceneImagePrompt = asString(parsed.revisedSceneImagePrompt);
    const modelIssues = Array.isArray(parsed.issues)
      ? parsed.issues.map(asString).filter((v): v is string => !!v)
      : [];
    const issues = [
      ...deterministicIssues,
      ...modelIssues.map(label => issue(`critic_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'issue'}`, label, 'fail')),
    ];
    const shouldRevise = !criticPassed && !!revisedNarration;
    const result: DmQualityGateResult = {
      narration: shouldRevise ? revisedNarration : args.narration,
      sceneImagePrompt: shouldRevise ? (revisedSceneImagePrompt || args.sceneImagePrompt) : args.sceneImagePrompt,
      issues,
      revised: shouldRevise,
      criticPassed,
      criticRationale: asString(parsed.rationale),
    };
    log('pipeline.qualityGate', {
      isCoop: args.isCoop,
      deterministicIssues,
      criticPassed,
      revised: result.revised,
      rawResponse: content,
    });
    return result;
  } catch (error) {
    log('pipeline.qualityGate.error', { error: error instanceof Error ? error.message : String(error), deterministicIssues });
    return {
      narration: args.narration,
      sceneImagePrompt: args.sceneImagePrompt,
      issues: deterministicIssues,
      revised: false,
      criticPassed: deterministicIssues.filter(i => i.severity === 'fail').length === 0,
      criticRationale: 'Quality critic failed; deterministic gate only.',
    };
  }
}
