import type { WorldBible, WorldState } from '../../../shared/types';

// The clue bank is a REAL, pre-authored ledger: every entry is seeded straight
// from WorldBible.mysteryLayer.clues the moment a campaign has a mystery layer,
// as 'undiscovered'. The AI (macro-turn extractor or micro-action service)
// never invents a clue — it can only mark an existing seeded id 'revealed'
// when the narration it just wrote concretely reveals that clue. This keeps
// every entry traceable to something actually authored, per the design brief.

type MysteryClue = NonNullable<WorldState['mysteryClues']>[number];

export function seedMysteryClues(worldState: WorldState, worldBible: WorldBible): MysteryClue[] | undefined {
  const layer = worldBible.mysteryLayer;
  if (!layer || !layer.clues?.length) return undefined;
  const existing = worldState.mysteryClues || [];
  const existingClueTexts = new Set(existing.map(c => c.clue));
  const toAdd = layer.clues.filter(clueText => clueText && !existingClueTexts.has(clueText));
  if (toAdd.length === 0) return undefined;

  const possibleSources = [
    worldBible.primaryAntagonist?.name,
    ...(worldBible.antagonistRoster || []).map(a => a.name),
  ].filter((v): v is string => !!v).slice(0, 3);

  const additions: MysteryClue[] = toAdd.map((clueText, i) => ({
    id: `mystery-clue-${existing.length + i}`,
    status: 'undiscovered',
    clue: clueText,
    pointsToward: layer.centralQuestion,
    possibleSources,
  }));

  return [...existing, ...additions];
}

// Builds the prompt block listing currently-undiscovered clues so the AI can
// cite an exact id in revealedClueIds instead of inventing new clue text.
export function buildClueBankBlock(worldState: WorldState): string {
  const clues = worldState.mysteryClues || [];
  const undiscovered = clues.filter(c => c.status === 'undiscovered');
  if (undiscovered.length === 0) return '';
  return `
═══ MYSTERY CLUE BANK (undiscovered) ═══
${undiscovered.map(c => `  (id: ${c.id}) ${c.clue}`).join('\n')}
If this beat's narration concretely and specifically reveals one or more of these, list their exact ids in revealedClueIds. NEVER invent a clue id that is not listed here, and never mark one revealed on a vague hint alone — only when the fact is actually delivered.
═════════════════════════════════════`;
}

// Applies AI-reported reveals against the (already seeded) clue bank. Only
// flips ids that exist and are still 'undiscovered' — an id the AI invents or
// one that's already revealed is silently ignored, so nothing gets granted
// that wasn't actually earned/seeded. Returns undefined when nothing changed.
export function applyClueReveals(
  bank: MysteryClue[],
  revealedClueIds: string[] | undefined,
  eventId?: string,
): MysteryClue[] | undefined {
  if (!revealedClueIds || revealedClueIds.length === 0) return undefined;
  const idSet = new Set(revealedClueIds);
  let changed = false;
  const updated = bank.map(clue => {
    if (idSet.has(clue.id) && clue.status === 'undiscovered') {
      changed = true;
      return { ...clue, status: 'revealed' as const, revealedAtEventId: eventId };
    }
    return clue;
  });
  return changed ? updated : undefined;
}

// Single entry point for the turn processors/micro-action service: seeds the
// bank if needed, applies any reveals reported for this beat, and returns the
// array to persist (or undefined if nothing about the clue bank changed).
export function resolveMysteryClueChanges(
  worldState: WorldState,
  worldBible: WorldBible,
  revealedClueIds: string[] | undefined,
  eventId?: string,
): MysteryClue[] | undefined {
  const seeded = seedMysteryClues(worldState, worldBible);
  const bank = seeded || worldState.mysteryClues || [];
  const revealed = applyClueReveals(bank, revealedClueIds, eventId);
  return revealed || seeded;
}
