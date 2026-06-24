import type { WorldBible, WorldState } from '../../../shared/types';

// ── Consolidated story memory ────────────────────────────────────────────────
// The campaign tracks "threads to pay off" across SIX separate structures:
// foreshadowingLedger, futureHooks, backstoryHooks, storyLedger, mysteryClues,
// and the pendingDirectorBeat. Feeding all six verbatim into one prompt buries
// the model in overlapping reminders. This module merges them into ONE ranked
// list and surfaces only the most pressing threads, so the DM gets a sharp,
// prioritized "what still matters" view instead of six competing ledgers.

export type StoryThreadKind =
  | 'director_beat'
  | 'backstory'
  | 'future_hook'
  | 'foreshadowing'
  | 'mystery'
  | 'ledger'
  | 'quest'
  | 'antagonist';

export type RankedStoryThread = {
  id: string;
  kind: StoryThreadKind;
  text: string;
  /** Higher = more pressing. Used for ordering and to pick the top N. */
  score: number;
  /** Optional character this thread belongs to (backstory/relationship threads). */
  characterId?: string;
  /** Optional place this thread is anchored to, for "where to go next" framing. */
  anchorLocation?: string;
};

function recencyBoost(createdAt: string | undefined, now: number): number {
  if (!createdAt) return 0;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return 0;
  const ageHours = (now - ts) / (1000 * 60 * 60);
  // Newer threads get a small nudge; everything decays gently toward 0.
  if (ageHours <= 1) return 6;
  if (ageHours <= 24) return 4;
  if (ageHours <= 24 * 7) return 2;
  return 0;
}

export type RankStoryThreadsOptions = {
  /** Max threads to surface. Default 6. */
  limit?: number;
  /** Current action count, used to flag overdue ledger items. */
  actionCount?: number;
  now?: number;
};

/**
 * Merge every "open thread" source into a single ranked list, most pressing first.
 * Resolved/paid-off/closed items are dropped. Deterministic and side-effect free.
 */
export function rankStoryThreads(
  worldState: WorldState,
  worldBible: WorldBible | undefined,
  options: RankStoryThreadsOptions = {},
): RankedStoryThread[] {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, options.limit ?? 6);
  const actionCount = options.actionCount ?? worldState.actionCount ?? 0;
  const threads: RankedStoryThread[] = [];

  // 1. Director beat — a campaign-health directive from a higher system. Top priority.
  const beat = worldState.pendingDirectorBeat;
  if (beat?.beat) {
    const urgencyScore = beat.urgency === 'critical' ? 100 : beat.urgency === 'high' ? 84 : 60;
    threads.push({ id: 'director-beat', kind: 'director_beat', text: beat.beat, score: urgencyScore });
  }

  // 2. Story ledger — explicitly typed leads/promises/threats with their own urgency.
  for (const entry of worldState.storyLedger || []) {
    if (entry.status === 'resolved') continue;
    const base = entry.status === 'pressing' ? 70 : 52;
    const urgency = entry.urgency === 'high' ? 14 : entry.urgency === 'medium' ? 7 : 0;
    const overdue = typeof entry.dueByAction === 'number' && actionCount >= entry.dueByAction ? 18 : 0;
    threads.push({
      id: `ledger:${entry.id}`,
      kind: entry.kind === 'relationship' ? 'ledger' : 'ledger',
      text: `${entry.title}: ${entry.summary}`,
      score: base + urgency + overdue + recencyBoost(entry.updatedAt || entry.createdAt, now),
      anchorLocation: entry.anchorLocation,
    });
  }

  // 3. Backstory hooks — personal payoffs. Active hooks outrank dormant ones.
  for (const hook of worldState.backstoryHooks || []) {
    if (hook.status === 'resolved') continue;
    const base = hook.status === 'active' ? 66 : 40;
    threads.push({
      id: `backstory:${hook.characterId}:${hook.hook.slice(0, 24)}`,
      kind: 'backstory',
      text: `[${hook.characterName}] ${hook.hook}`,
      score: base + recencyBoost(hook.seededAt, now),
      characterId: hook.characterId,
    });
  }

  // 4. Foreshadowing — developing threads are closer to payoff than freshly planted.
  for (const entry of worldState.foreshadowingLedger || []) {
    if (entry.payoffStatus === 'paid_off') continue;
    const base = entry.payoffStatus === 'developing' ? 58 : 44;
    threads.push({
      id: `foreshadow:${entry.id}`,
      kind: 'foreshadowing',
      text: entry.description,
      score: base + recencyBoost(entry.createdAt, now),
    });
  }

  // 5. Future hooks — consequences of past choices waiting to land.
  for (const hook of worldState.futureHooks || []) {
    if (hook.resolved) continue;
    threads.push({
      id: `future:${hook.id}`,
      kind: 'future_hook',
      text: hook.description,
      score: 50 + recencyBoost(hook.createdAt, now),
    });
  }

  // 6. Mystery clues — revealed-but-unresolved clues are an active investigation.
  for (const clue of worldState.mysteryClues || []) {
    if (clue.status === 'resolved') continue;
    const base = clue.status === 'revealed' ? 56 : 38;
    threads.push({
      id: `mystery:${clue.id}`,
      kind: 'mystery',
      text: `${clue.clue}${clue.pointsToward ? ` (points toward: ${clue.pointsToward})` : ''}`,
      score: base,
    });
  }

  // 7. Active quests — concrete objectives the party has accepted.
  for (const quest of worldState.activeQuests || []) {
    if (quest.status !== 'active') continue;
    threads.push({
      id: `quest:${quest.title}`,
      kind: 'quest',
      text: `${quest.title}: ${quest.description}`,
      score: 62,
    });
  }

  // 8. Revealed antagonist — the engine of the whole campaign, once in the open.
  const antagonist = worldBible?.primaryAntagonist;
  if (antagonist?.isRevealed) {
    threads.push({
      id: `antagonist:${antagonist.name}`,
      kind: 'antagonist',
      text: `${antagonist.name} is pursuing: ${antagonist.agenda}`,
      score: 64,
    });
  }

  // Dedupe by near-identical text (the six sources genuinely overlap), keeping the
  // highest-scored copy, then return the most pressing threads.
  const seen = new Map<string, RankedStoryThread>();
  for (const thread of threads.sort((a, b) => b.score - a.score)) {
    const key = thread.text.trim().toLowerCase().slice(0, 60);
    if (!seen.has(key)) seen.set(key, thread);
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const KIND_LABELS: Record<StoryThreadKind, string> = {
  director_beat: 'DIRECTOR BEAT (mandatory)',
  backstory: 'Backstory',
  future_hook: 'Past choice coming due',
  foreshadowing: 'Foreshadowing',
  mystery: 'Mystery',
  ledger: 'Open thread',
  quest: 'Quest',
  antagonist: 'Antagonist',
};

/**
 * Render the ranked threads as a compact prompt block. Returns '' when there is
 * nothing open, so callers can drop the section entirely.
 */
export function formatStoryThreadsBlock(threads: RankedStoryThread[]): string {
  if (threads.length === 0) return '';
  const lines = threads.map(thread => {
    const anchor = thread.anchorLocation ? ` (at ${thread.anchorLocation})` : '';
    return `- [${KIND_LABELS[thread.kind]}] ${thread.text}${anchor}`;
  });
  return `═══ OPEN STORY THREADS (most pressing first — advance or pay one off, don't just restate) ═══
${lines.join('\n')}
When you pay one off, mark it via the matching field (paidOffForeshadowing, resolvedFutureHooks, backstoryHookResolved, actGoalAchieved, or directorBeatExecuted).
═══════════════════════════════════════════════════════════════════════════════`;
}
