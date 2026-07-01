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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function submittedActions(actionsBlock: string, coopNames?: string[]): Map<string, string> {
  const actions = new Map<string, string>();
  for (const line of actionsBlock.split('\n').map(value => value.trim()).filter(Boolean)) {
    const coop = line.match(/^CHARACTER\s+\d+\s+\(([^,)]+)[^)]*\):\s*(.+)$/i);
    if (coop) {
      actions.set(coop[1].trim(), coop[2].trim());
      continue;
    }
    const solo = line.match(/^([A-Z][A-Za-z0-9 '\-]{0,40}):\s*(.+)$/);
    if (solo && !/^CHARACTER\s+\d+$/i.test(solo[1])) actions.set(solo[1].trim(), solo[2].trim());
  }
  for (const name of coopNames || []) {
    if (actions.has(name)) continue;
    const match = actionsBlock.match(new RegExp(`\\(${escapeRegExp(name)}(?:,|\\))[^\\n]*?:\\s*([^\\n]+)`, 'i'));
    if (match) actions.set(name, match[1].trim());
  }
  return actions;
}

function actionAllows(action: string, verbs: string[]): boolean {
  const lower = action.toLowerCase();
  return verbs.some(verb => lower.includes(verb));
}

function playerAuthorshipIssues(narration: string, actionsBlock: string, coopNames?: string[]): DmQualityIssue[] {
  const issues: DmQualityIssue[] = [];
  const actions = submittedActions(actionsBlock, coopNames);
  const speechVerbs = 'say|says|said|ask|asks|asked|reply|replies|replied|whisper|whispers|whispered|shout|shouts|shouted|rumble|rumbles|rumbled|warn|warns|warned|quip|quips|quipped';
  const voluntaryPatterns: { pattern: string; verbs: string[]; label: string }[] = [
    { pattern: 'nod(?:s|ded)?|smil(?:e|es|ed)|grin(?:s|ned)?|shrug(?:s|ged)?|laugh(?:s|ed)?|smirk(?:s|ed)?|agree(?:s|d)?|hesitat(?:e|es|ed)', verbs: ['nod', 'smil', 'grin', 'shrug', 'laugh', 'smirk', 'agree', 'hesitat'], label: 'reaction' },
    { pattern: 'reach(?:es|ed)?|prod(?:s|ded)?|touch(?:es|ed)?|pick(?:s|ed)?\s+up|inspect(?:s|ed)?|follow(?:s|ed)?', verbs: ['reach', 'prod', 'touch', 'pick', 'inspect', 'follow'], label: 'follow-up action' },
    { pattern: 'set(?:s)?\s+off|head(?:s|ed)?\s+(?:toward|for|to)|leave(?:s|d)?|depart(?:s|ed)?|walk(?:s|ed)?\s+(?:out|away)|make(?:s)?\s+(?:his|her|their)\s+way', verbs: ['set off', 'head', 'leave', 'depart', 'walk', 'make my way', 'make his way', 'make her way', 'make their way', 'go to', 'travel', 'exit'], label: 'scene transition' },
  ];

  for (const [name, action] of actions) {
    const escaped = escapeRegExp(name);
    const suppliedDialogue = /["“”]/.test(action);
    const quotedBeforeSpeaker = new RegExp(`["“][^"”]{1,180}["”][^.!?]{0,45}\\b${escaped}\\b[^.!?]{0,45}\\b(?:${speechVerbs})\\b`, 'i');
    const quotedAfterSpeaker = new RegExp(`\\b${escaped}\\b[^.!?]{0,45}\\b(?:${speechVerbs})\\b[^.!?]{0,60}["“]`, 'i');
    if (!suppliedDialogue && (quotedBeforeSpeaker.test(narration) || quotedAfterSpeaker.test(narration))) {
      issues.push(issue('invented_player_dialogue', `The narration puts exact words in ${name}'s mouth even though the player submitted only an action or intent.`));
    }
    for (const candidate of voluntaryPatterns) {
      const match = narration.match(new RegExp(`\\b${escaped}\\b[^.!?]{0,90}\\b(${candidate.pattern})\\b`, 'i'));
      if (match && !actionAllows(action, candidate.verbs)) {
        issues.push(issue(`invented_player_${candidate.label.replace(/\s+/g, '_')}`, `The narration invents a voluntary ${candidate.label} for ${name} beyond the submitted action.`));
        break;
      }
    }
  }

  if (/\b(exchange|share)(?:s|d)?\s+(?:a\s+)?(?:knowing|meaningful|wary|excited)?\s*(?:look|glance)|\bready\s+for\s+(?:the\s+)?(?:adventure|journey)|\bcuriosity\s+(?:is\s+)?piqued\b/i.test(narration)) {
    const authorized = [...actions.values()].some(action => /\b(glance|look at|signal|react|ready|curious)\b/i.test(action));
    if (!authorized) issues.push(issue('invented_player_reaction', 'The narration authors a shared glance, readiness, curiosity, or similar hero reaction that no player declared.'));
  }

  const travelAuthorized = [...actions.values()].some(action => /\b(go|leave|depart|travel|head|set off|walk out|exit|continue on|make .* way)\b/i.test(action));
  if (!travelAuthorized && /\b(?:the party|the duo|they|together,? they|[A-Z][A-Za-z'\-]+)\b[^.!?]{0,80}\b(?:set off|head(?:s|ed)? (?:toward|for|to)|leave(?:s|d)?|depart(?:s|ed)?|make(?:s)? their way|step(?:s|ped)? out into the street)\b/i.test(narration)) {
    issues.push(issue('unauthorized_scene_transition', 'The narration moves the heroes onward even though no player chose to leave or travel.'));
  }
  return issues;
}

function npcIdentityIssues(narration: string, worldState: WorldState): DmQualityIssue[] {
  const issues: DmQualityIssue[] = [];
  const seen = new Set<string>();
  for (const npc of [...(worldState.npcMemory || []), ...(worldState.keyNPCs || [])]) {
    if (!npc?.name || !npc.gender || seen.has(npc.name.toLowerCase())) continue;
    seen.add(npc.name.toLowerCase());
    const name = escapeRegExp(npc.name);
    const wrong = npc.gender === 'male' ? 'she|her|hers' : npc.gender === 'female' ? 'he|him|his' : '';
    if (!wrong) continue;
    if (new RegExp(`\\b${name}\\b(?:(?![,;.!?]).){0,60}\\b(?:${wrong})\\b`, 'i').test(narration)) {
      issues.push(issue('npc_identity_violation', `${npc.name} is canonically ${npc.gender}, but the narration uses contradictory pronouns.`));
    }
  }
  return issues;
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

  const maxNormalWords = args.isCoop ? 170 : 140;
  if (args.plan.pacingMode !== 'climax' && wordCount > maxNormalWords) {
    issues.push(issue('overlong_table_turn', `The ${wordCount}-word response is too long for an ordinary table exchange; resolve the action and return control sooner.`));
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

  issues.push(...playerAuthorshipIssues(narration, args.actionsBlock, args.coopNames));
  issues.push(...npcIdentityIssues(narration, args.worldState));

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
  const system = `You are the DM QUALITY CRITIC for a D&D game. You are not the narrator. Your job is to decide whether the draft is actually good enough to show players.
Be strict. Passing means the scene feels like a strong human DM at the table: responsive, tone-matched, coherent with recent story, not rushed, not stiff, not melodramatic unless the campaign asks for it, and mechanically honest.
If it fails, revise ONLY the narration and optional sceneImagePrompt. Preserve the beat plan, roll state, player agency, and facts. Do not add resolved outcomes when a roll is pending. The DM controls NPCs and the world; players exclusively control their heroes' voluntary speech, emotions, gestures, movement, decisions, and follow-up actions.
Return JSON only.`;

  const user = `CAMPAIGN TASTE:
- Tone: ${tone}
- Favorite pillars: ${pillars}
- Campaign: one continuous open-ended, multi-arc saga (no fixed length)
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
8. Does not invent exact hero dialogue, body language, reactions, travel, or a next action that was not submitted.
9. Stops at the first new decision point instead of playing through it.
10. Every known NPC's identity and pronouns match canon.
11. Is concise enough for table conversation; vivid table narration, not a miniature novel.

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
    let criticPassed = parsed.pass === true && deterministicIssues.filter(i => i.severity === 'fail').length === 0;
    const revisedNarration = asString(parsed.revisedNarration);
    const revisedSceneImagePrompt = asString(parsed.revisedSceneImagePrompt);
    const modelIssues = Array.isArray(parsed.issues)
      ? parsed.issues.map(asString).filter((v): v is string => !!v)
      : [];
    const issues = [
      ...deterministicIssues,
      ...modelIssues.map(label => issue(`critic_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'issue'}`, label, 'fail')),
    ];
    let shouldRevise = !criticPassed && !!revisedNarration;
    let finalNarration: string = shouldRevise && revisedNarration ? revisedNarration : args.narration;
    let finalSceneImagePrompt = shouldRevise ? (revisedSceneImagePrompt || args.sceneImagePrompt) : args.sceneImagePrompt;
    let postRevisionIssues = shouldRevise
      ? assessDmQuality({ ...args, narration: finalNarration })
      : [];

    // The critic is itself an AI and can "fix" one problem by inventing player
    // dialogue or another continuity error. Re-check its revision and give it one
    // focused retry before anything reaches the players.
    if (shouldRevise && postRevisionIssues.some(item => item.severity === 'fail')) {
      const retryResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system' as const, content: system },
          { role: 'user' as const, content: `${user}\n\nYOUR FIRST REVISION STILL FAILED THESE DETERMINISTIC CHECKS:\n${formatIssues(postRevisionIssues)}\n\nFIRST REVISION:\n"""\n${finalNarration}\n"""\nRewrite it again. Preserve facts and mechanics, but obey player authorship, NPC canon, the first-decision stopping point, and concise table pacing. Return the same JSON shape.` },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      const retryContent = retryResponse.choices[0].message.content || '{}';
      const retryParsed = parseJsonRecord(retryContent);
      const retryNarration = asString(retryParsed.revisedNarration);
      if (retryNarration) {
        const retryIssues = assessDmQuality({ ...args, narration: retryNarration });
        const retryFails = retryIssues.filter(item => item.severity === 'fail').length;
        const priorFails = postRevisionIssues.filter(item => item.severity === 'fail').length;
        if (retryFails < priorFails) {
          finalNarration = retryNarration;
          finalSceneImagePrompt = asString(retryParsed.revisedSceneImagePrompt) || finalSceneImagePrompt;
          postRevisionIssues = retryIssues;
        }
      }
      log('pipeline.qualityGate.retry', { isCoop: args.isCoop, remainingIssues: postRevisionIssues, rawResponse: retryContent });
    }

    criticPassed = postRevisionIssues.filter(item => item.severity === 'fail').length === 0
      && (parsed.pass === true || shouldRevise);
    const result: DmQualityGateResult = {
      narration: finalNarration,
      sceneImagePrompt: finalSceneImagePrompt,
      issues: [...issues, ...postRevisionIssues],
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
