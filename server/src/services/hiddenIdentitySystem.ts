import { randomUUID } from 'crypto';
import type { HiddenIdentity, NpcMemory, StoryLedgerEntry, WorldBible, WorldState } from '../../../shared/types';

// ── Phase 14: the planted hidden-identity twist ──────────────────────────────
// WorldBible.plannedBetrayal is an authoring-time SEED (set once at world-bible
// generation, see campaignGenerationService.ts). This module is where that seed
// becomes a real, tracked WorldState.hiddenIdentities[] entry once the matching
// NPC is actually introduced in play, and where an eventual reveal gets
// resolved into a durable story beat. At most ONE hidden identity is tracked
// at a time — see the WorldBible.plannedBetrayal doc comment in shared/types.ts.

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'who', 'has', 'have', 'been', 'with', 'and', 'or', 'to', 'in', 'at', 'for',
  'on', 'is', 'are', 'early', 'party', 'this', 'that', 'their', 'they', 'them', 'very', 'just',
  'not', 'into', 'from', 'meets', 'meet', 'aids', 'aid', 'helps', 'helping', 'help',
]);

function extractKeywords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) || []).filter(word => word.length > 3 && !STOPWORDS.has(word));
}

// A lightweight, code-side match: does this newly introduced NPC's role/notes
// plausibly correspond to the planned betrayal's described role? Intentionally
// loose (a keyword overlap, not an exact match) — the narrator is separately
// instructed to consciously introduce the planned NPC (see
// narrationPromptBuilder.buildLoreContextBlock), so this heuristic mainly
// confirms that instruction was followed rather than doing the matching alone.
function npcMatchesPlannedRole(npc: NpcMemory, npcRole: string): boolean {
  const roleKeywords = extractKeywords(npcRole);
  if (roleKeywords.length === 0) return false;
  const npcText = `${npc.role || ''} ${npc.notes || ''}`.toLowerCase();
  return roleKeywords.some(keyword => npcText.includes(keyword));
}

// ── Seeding → live: convert WorldBible.plannedBetrayal into a real HiddenIdentity
// the first time a plausibly-matching NPC is introduced in play.
export function detectHiddenIdentityIntroduction(
  worldState: WorldState,
  worldBible: WorldBible,
  newlyIntroducedNpcs: NpcMemory[],
): HiddenIdentity | undefined {
  const planned = worldBible.plannedBetrayal;
  if (!planned?.npcRole || !planned.trueIdentity) return undefined;
  if ((worldState.hiddenIdentities || []).length > 0) return undefined; // one at a time
  const match = newlyIntroducedNpcs.find(npc => npc.name && npcMatchesPlannedRole(npc, planned.npcRole));
  if (!match) return undefined;

  return {
    id: randomUUID(),
    npcName: match.name,
    trueIdentity: planned.trueIdentity,
    revealCondition: planned.setupHint
      ? `Reveal only once the story has genuinely built trust and history around ${match.name} (not in the opening arc), and a moment paying off "${planned.setupHint}" has made the reveal feel earned rather than arbitrary.`
      : `Reveal only once the story has genuinely built trust and history around ${match.name}, not in the opening arc.`,
    isRevealed: false,
    createdAt: new Date().toISOString(),
  };
}

// ── Guard against a premature/unearned reveal ────────────────────────────────
// Mirrors signatureRewardsService's soft-guard pattern (Phase 13): rather than
// a second AI round-trip, simply refuse to honor the signal unless the moment
// plausibly earned it. Requires the beat to be high-stakes (a reveal is a major
// turning point, not a throwaway line) AND either enough actions have passed
// since hidden identities generally start mattering, or a mystery clue already
// points at this NPC by name — reusing the existing clue bank as a readiness
// signal instead of inventing a parallel one.
const MIN_ACTIONS_BEFORE_IDENTITY_REVEAL = 10;

export function guardIdentityRevealed(
  revealed: { npcName: string } | undefined,
  worldState: WorldState,
  context: { isHighStakes: boolean; actionCount: number },
): { npcName: string } | undefined {
  if (!revealed) return undefined;
  const identity = (worldState.hiddenIdentities || []).find(
    h => h.npcName.toLowerCase() === revealed.npcName.toLowerCase() && !h.isRevealed,
  );
  if (!identity) return undefined;
  if (!context.isHighStakes) return undefined;

  const nameLower = identity.npcName.toLowerCase();
  const supportingClueRevealed = (worldState.mysteryClues || []).some(
    clue => clue.status !== 'undiscovered' && (clue.pointsToward || '').toLowerCase().includes(nameLower),
  );
  if (context.actionCount < MIN_ACTIONS_BEFORE_IDENTITY_REVEAL && !supportingClueRevealed) return undefined;

  return revealed;
}

// ── Resolve an already-guarded reveal into world-state changes ──────────────
// Marks the identity revealed and pushes a high-urgency StoryLedgerEntry (the
// existing storyMemory.ts mechanism already surfaces high-urgency ledger
// entries as pressing threads) so the reveal becomes a prominent turning point
// rather than a throwaway line the narration forgets next turn.
export function resolveIdentityRevealed(
  worldState: WorldState,
  revealed: { npcName: string } | undefined,
): { hiddenIdentities?: HiddenIdentity[]; storyLedger?: StoryLedgerEntry[] } {
  if (!revealed) return {};
  const identities = worldState.hiddenIdentities || [];
  const index = identities.findIndex(
    h => h.npcName.toLowerCase() === revealed.npcName.toLowerCase() && !h.isRevealed,
  );
  if (index === -1) return {};

  const now = new Date().toISOString();
  const identity = identities[index];
  const updatedIdentities = [...identities];
  updatedIdentities[index] = { ...identity, isRevealed: true, revealedAt: now };

  const ledgerEntry: StoryLedgerEntry = {
    id: randomUUID(),
    kind: 'threat',
    title: `${identity.npcName}'s true identity is revealed`,
    summary: `${identity.npcName} is revealed to be ${identity.trueIdentity}. This reframes everything the party thought they knew about them.`,
    status: 'pressing',
    urgency: 'high',
    anchorNpc: identity.npcName,
    createdAt: now,
  };

  return {
    hiddenIdentities: updatedIdentities,
    storyLedger: [...(worldState.storyLedger || []), ledgerEntry],
  };
}

export function cleanIdentityRevealed(value: unknown): { npcName: string } | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const npcName = asString(record.npcName);
  if (!npcName) return undefined;
  return { npcName };
}
