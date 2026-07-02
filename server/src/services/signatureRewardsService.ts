import { randomUUID } from 'crypto';
import type { BackstoryHook, CompanionCharacter, InventoryItem, PartyAsset, SignatureItemQuest, WorldBible, WorldState } from '../../../shared/types';
import { parseJsonValueOrFallback } from './aiResponseParser';

type ChatClient = {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: { role: 'system' | 'user'; content: string }[];
        temperature: number;
        max_tokens?: number;
        response_format?: { type: 'json_object' };
      }): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const VALID_ITEM_TYPES = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);

// ── Seeding: one signature item quest per character, tied to a BackstoryHook ──
// Vox Machina-style: a specific item (Vex's bow, Grog's gauntlets) earned
// through THAT character's own story, not a random loot roll. Seeded once,
// lazily, at character creation whenever a backstory hook exists for them.

export function buildSignatureItemQuestPrompt(
  hook: BackstoryHook,
  race: string,
  characterClass: string,
  worldBible: WorldBible,
): string {
  return `You are a DM designing ONE signature legendary item for a hero, Critical Role's Vox Machina style (Vex'ahlia's bow, Grog's Belt of Fire Giant Strength): a specific, named item tied to THEIR personal story, not random loot.

CHARACTER: ${hook.characterName}, ${race} ${characterClass}
BACKSTORY HOOK ALREADY SEEDED FOR THEM: ${hook.hook}

CAMPAIGN CONTEXT:
Central conflict: ${worldBible.centralConflict}
Era: ${worldBible.era}

Design a single specific item (give it a real name) that could become theirs through play - tied to the hook above, and useful for a ${characterClass}.

Return JSON:
{
  "itemName": "specific evocative name, e.g. 'Whisperwind, the Hunter's Longbow'",
  "itemFlavor": "1-2 sentences: what it is, why it matters to this character specifically",
  "itemType": "weapon" | "armor" | "potion" | "misc" | "key",
  "questHook": "1-2 sentences, loose and narrative (not a hard mechanical trigger): what kind of story beat in play would earn it - e.g. 'recover it from the ruins tied to their family's past'"
}`;
}

function inferItemType(itemName: string, itemFlavor: string): InventoryItem['type'] {
  const text = `${itemName} ${itemFlavor}`.toLowerCase();
  if (/\b(armor|plate|mail|cloak|robe|shield|boots|gauntlet|helm|breastplate|cuirass)\b/.test(text)) return 'armor';
  if (/\b(potion|elixir|vial|draught|tonic)\b/.test(text)) return 'potion';
  if (/\b(key|sigil|seal)\b/.test(text)) return 'key';
  if (/\b(bow|sword|blade|axe|dagger|staff|wand|hammer|mace|spear|rapier|scythe|whip|glaive|bardiche|crossbow)\b/.test(text)) return 'weapon';
  return 'misc';
}

export function parseSignatureItemQuest(
  raw: string | null | undefined,
  hook: BackstoryHook,
): SignatureItemQuest {
  const parsed = parseJsonValueOrFallback<Record<string, unknown>>(raw, {});
  const itemName = asString(parsed.itemName) || `${hook.characterName}'s Heirloom`;
  const itemFlavor = asString(parsed.itemFlavor) || `An item tied to ${hook.characterName}'s past, waiting to be reclaimed.`;
  const questHook = asString(parsed.questHook) || hook.hook;
  return {
    id: randomUUID(),
    characterId: hook.characterId,
    characterName: hook.characterName,
    itemName,
    itemFlavor,
    questHook,
    status: 'seeded',
    createdAt: new Date().toISOString(),
  };
}

export async function generateSignatureItemQuest(
  openai: ChatClient,
  hook: BackstoryHook,
  race: string,
  characterClass: string,
  worldBible: WorldBible,
): Promise<SignatureItemQuest> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: buildSignatureItemQuestPrompt(hook, race, characterClass, worldBible),
    }],
    max_tokens: 300,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  return parseSignatureItemQuest(response.choices[0].message.content, hook);
}

// Deterministic, no-AI-call fallback (also useful for tests and any path that
// wants a quest without spending a request) — same shape, simpler content.
export function buildTemplateSignatureItemQuest(
  hook: BackstoryHook,
  characterClass: string,
): SignatureItemQuest {
  return {
    id: randomUUID(),
    characterId: hook.characterId,
    characterName: hook.characterName,
    itemName: `${hook.characterName}'s ${characterClass === 'Wizard' || characterClass === 'Sorcerer' || characterClass === 'Warlock' ? 'Grimoire' : 'Heirloom'}`,
    itemFlavor: `An item bound to ${hook.characterName}'s past - tied to: ${hook.hook}`,
    questHook: hook.hook,
    status: 'seeded',
    createdAt: new Date().toISOString(),
  };
}

// ── Earning: converting a completed quest into a real InventoryItem ─────────

export function buildSignatureInventoryItem(quest: SignatureItemQuest): InventoryItem {
  return {
    id: randomUUID(),
    name: quest.itemName,
    description: quest.itemFlavor,
    quantity: 1,
    type: inferItemType(quest.itemName, quest.itemFlavor),
    value: 500,
    equipped: false,
  };
}

// A signature item is a major earned story beat, not a routine drop - mirrors
// the soft-guard style used for companion death (companionSystem.guardCompanionDeaths):
// rather than a second LLM round-trip, we simply refuse to honor the signal
// unless the moment plausibly earned it, and the referenced quest is real,
// owned by the named character, and not already earned.
const MIN_ACTIONS_BEFORE_SIGNATURE_ITEM = 8;

export function guardSignatureItemEarned(
  earned: { characterId: string; questId: string } | undefined,
  worldState: WorldState,
  context: { isHighStakes: boolean; actionCount: number },
): { characterId: string; questId: string } | undefined {
  if (!earned) return undefined;
  if (context.actionCount < MIN_ACTIONS_BEFORE_SIGNATURE_ITEM) return undefined;
  if (!context.isHighStakes) return undefined;
  const quest = (worldState.signatureItemQuests || []).find(q => q.id === earned.questId && q.characterId === earned.characterId);
  if (!quest || quest.status === 'earned') return undefined;
  return earned;
}

// ── Party assets: a title/property/position granted instead of (or with) gold ──

export function buildPartyAsset(
  granted: { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string },
  grantedBy: string,
): PartyAsset {
  return {
    id: randomUUID(),
    kind: granted.kind,
    name: granted.name,
    description: granted.description,
    grantedAt: new Date().toISOString(),
    grantedBy,
    locationName: granted.locationName,
    unlocksHint: granted.unlocksHint,
  };
}

const MIN_ACTIONS_BEFORE_PARTY_ASSET = 8;

export function guardPartyAssetGranted(
  granted: { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string } | undefined,
  context: { isHighStakes: boolean; advanceAct: boolean; actionCount: number },
): { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string } | undefined {
  if (!granted) return undefined;
  if (context.actionCount < MIN_ACTIONS_BEFORE_PARTY_ASSET) return undefined;
  if (!context.isHighStakes && !context.advanceAct) return undefined;
  return granted;
}

export function cleanSignatureItemEarned(value: unknown): { characterId: string; questId: string } | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const characterId = asString(record.characterId);
  const questId = asString(record.questId);
  if (!characterId || !questId) return undefined;
  return { characterId, questId };
}

const VALID_ASSET_KINDS = new Set(['property', 'title', 'position']);

export function cleanPartyAssetGranted(value: unknown): { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string } | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const kind = asString(record.kind);
  const name = asString(record.name);
  const description = asString(record.description);
  if (!kind || !VALID_ASSET_KINDS.has(kind) || !name || !description) return undefined;
  return {
    kind: kind as PartyAsset['kind'],
    name,
    description,
    locationName: asString(record.locationName),
    unlocksHint: asString(record.unlocksHint),
  };
}

// ── Pure resolution helpers (DB-free, so they're directly testable) ─────────
// Applies an already-guarded signatureItemEarned signal onto a WorldState
// snapshot: marks the quest earned and routes the built item either into the
// acting character's loot (picked up by the normal character-consequence
// pipeline) or directly into a companion's inventory. Returns {} (no changes)
// if the quest can't be resolved (already earned, or id/owner mismatch) —
// callers should treat that as a no-op, not an error.
export function resolveSignatureItemEarned(
  worldState: WorldState,
  earned: { characterId: string; questId: string } | undefined,
  actingCharacterId: string,
): {
  signatureItemQuests?: SignatureItemQuest[];
  companions?: CompanionCharacter[];
  extraLootForActingCharacter?: InventoryItem[];
} {
  if (!earned) return {};
  const quests = worldState.signatureItemQuests || [];
  const questIndex = quests.findIndex(q => q.id === earned.questId && q.characterId === earned.characterId && q.status !== 'earned');
  if (questIndex === -1) return {};

  const quest = quests[questIndex];
  const earnedItem = buildSignatureInventoryItem(quest);
  const updatedQuests = [...quests];
  updatedQuests[questIndex] = { ...quest, status: 'earned', earnedItem, earnedAt: new Date().toISOString() };

  if (earned.characterId === actingCharacterId) {
    return { signatureItemQuests: updatedQuests, extraLootForActingCharacter: [earnedItem] };
  }

  const companions = worldState.companions || [];
  const companionIndex = companions.findIndex(c => c.id === earned.characterId);
  if (companionIndex !== -1) {
    const updatedCompanions = [...companions];
    updatedCompanions[companionIndex] = {
      ...companions[companionIndex],
      inventory: [...(companions[companionIndex].inventory || []), earnedItem],
    };
    return { signatureItemQuests: updatedQuests, companions: updatedCompanions };
  }

  // Owner isn't the acting character or a tracked companion (e.g. a co-op
  // partner's PC not loaded in this call) — still mark the quest earned with
  // earnedItem attached so nothing is lost; the caller can sync inventory
  // the next time that character's own row is touched.
  return { signatureItemQuests: updatedQuests };
}

export function resolvePartyAssetGranted(
  worldState: WorldState,
  granted: { kind: PartyAsset['kind']; name: string; description: string; locationName?: string; unlocksHint?: string } | undefined,
  grantedBy: string,
): PartyAsset[] | undefined {
  if (!granted) return undefined;
  const asset = buildPartyAsset(granted, grantedBy);
  return [...(worldState.partyAssets || []), asset];
}

// Item type export kept private-ish but exposed for tests/reuse if needed.
export { inferItemType, VALID_ITEM_TYPES };
