function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function cleanStringArray(value: unknown, limit = 3): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asString)
    .filter((v): v is string => !!v)
    .slice(0, limit);
}

// Validation/debug-facing proof that the turn actually resolved the action.
// Not shown prominently to the player; consumed by the bad-turn validator.
export type TurnOutcome = {
  playerIntent: string;
  concreteResult: string;
  informationRevealed: string[];
  situationChanged: boolean;
  unresolvedQuestion: string | null;
  whyNoRoll: string | null;
  whyRollNeeded: string | null;
};

// Sanitize the model's self-reported turn outcome (used by the validator + debug).
export function cleanTurnOutcome(raw: unknown): TurnOutcome | undefined {
  const r = asRecord(raw);
  if (!r) return undefined;
  return {
    playerIntent: asString(r.playerIntent) || '',
    concreteResult: asString(r.concreteResult) || '',
    informationRevealed: cleanStringArray(r.informationRevealed, 10),
    situationChanged: asBoolean(r.situationChanged),
    unresolvedQuestion: r.unresolvedQuestion == null ? null : (asString(r.unresolvedQuestion) || null),
    whyNoRoll: r.whyNoRoll == null ? null : (asString(r.whyNoRoll) || null),
    whyRollNeeded: r.whyRollNeeded == null ? null : (asString(r.whyRollNeeded) || null),
  };
}

// Detects the prose/structure violations the model keeps committing despite the
// system-prompt rules. Returns a list of corrective instructions (empty = clean).
// This is the enforcement layer: soft prompt directives are demonstrably ignored,
// so we catch the bad draft and force a targeted rewrite.
const STALL_PHRASES = [
  'just within reach', 'turning point', 'synergy', 'atmosphere is ripe',
  'promises revelations', 'lead worth pursuing', 'potential for discovery',
  'more than meets the eye', 'weight of what looms', 'echoes of ancient',
  'the weave of', 'promise of secrets', 'sowing more questions',
  'might be unlocked', 'sowing the seeds', 'pursuing the echoes',
  'hangs in the air', 'ripe with the potential', 'what the future holds',
  // Poetic summary closers - "important-sounding" fantasy filler that ends a turn
  // without leaving the players a playable situation.
  'the mystery deepens', 'deepened the mystery', 'deepening the mystery',
  'the weight of history', 'weight of the orchard', 'sense of purpose',
  'crucial step toward', 'a crucial step', 'step toward understanding',
  'significance of their discovery', 'significance of the discovery',
  'presence of something watching', 'something watching, waiting',
  'their journey continues', 'sets the stage for', 'setting the stage',
  'the path forward', 'a deeper mystery', 'unspoken history',
];

// Verbs that signal the player sought INFORMATION (must yield a fact or a roll).
const INFO_INTENT_RE = /\b(ask|asks|asked|asking|question|inquire|inquir|discuss|talk to|speak|inspect|examine|investigat|read|study|search for (?:info|clues|answers)|look into|remember|recall|learn|find out|interrogat|press (?:him|her|them|the)|probe)\b/i;
// Verbs that signal an ACTION on the world (must change the situation or roll).
const TASK_INTENT_RE = /\b(help|repair|fix|build|carry|open|search|convince|persuade|sneak|pick|climb|attack|strike|fight|follow|steal|pickpocket|disarm|push|pull|lift|break|force|cast|cross|jump|hide|free|rescue|untie|stabilize|heal)\b/i;

export function detectNarrationIssues(
  narration: string,
  isCoop: boolean,
  opts?: { action?: string; turnOutcome?: TurnOutcome },
): string[] {
  const issues: string[] = [];
  const lower = narration.toLowerCase();
  const action = opts?.action || '';
  const outcome = opts?.turnOutcome;
  const rollPending = /\bawaitingroll\b|\bdicerequired\b/i.test(narration); // narration text rarely says this; rely on outcome below
  const rollAsked = !!(outcome && (outcome.whyRollNeeded || rollPending));

  // A. Co-op split-camera failure
  if (isCoop && /\b(meanwhile|elsewhere|in another part|across town|on the other side of)\b/.test(lower)) {
    issues.push('You split the party with parallel narration ("Meanwhile"/"Elsewhere"). Rewrite as ONE shared scene: both characters in the same place and moment, reacting to each other and the same NPCs. Never cut away to a separate conversation.');
  }

  // B. Weather / atmosphere opener crutch
  const opener = lower.slice(0, 170);
  if (/(overcast|clouded (?:sky|heaven)|grey sk|gray sk|the air (?:seems|is|hangs|grows|was|filled|thick)|muted (?:glow|light|filter)|sunlight (?:filter|stream|dappl)|sky (?:casts|adds|looms|offers)|skies loom|beneath the .{0,20}sky|under the .{0,20}sky|the (?:market|crowd|square) (?:buzz|bustl|hum))/.test(opener)) {
    issues.push('You opened on weather/sky/air/ambient bustle again. Open instead on the acting character, an NPC speaking, a concrete object, the enemy\'s move, or the clue revealed. Do NOT mention sky/weather/"the air"/market bustle in the first two sentences.');
  }

  // E. Fake-mystery language with no concrete payoff
  const hitStall = STALL_PHRASES.find(p => lower.includes(p));
  const noInfo = !outcome || outcome.informationRevealed.length === 0;
  if (hitStall && noInfo && !rollAsked) {
    issues.push(`You used vague mystery filler ("${hitStall}") without revealing anything concrete. Replace it with a specific NEW fact (a name, place, number, motive, or symbol), call for a roll, or change the situation.`);
  }

  // C. Information request that revealed nothing and asked for no roll
  if (action && INFO_INTENT_RE.test(action) && noInfo && !rollAsked) {
    issues.push(`The player sought information but the turn revealed no specific fact and called for no roll. If the NPC/source plausibly knows, give at least one concrete fact; if guarded/uncertain, call for a roll; if they don't know, state what they DO know and name one concrete lead. Update turnOutcome.informationRevealed accordingly.`);
  }

  // D. Task/help action with no situation change and no roll
  if (action && TASK_INTENT_RE.test(action) && outcome && !outcome.situationChanged && !rollAsked) {
    issues.push(`The player attempted a concrete action ("${action.slice(0, 80)}") but nothing changed and no roll was called. Make measurable progress, reveal the next concrete obstacle, or call for a roll. Set turnOutcome.situationChanged truthfully.`);
  }

  return issues;
}
