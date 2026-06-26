import type { Character, CharacterMemory, DmCampaignMemory, NpcMemory, WorldBible, WorldState } from '../../../shared/types';
import type { NarrationResult } from './narrationResponseParser';
import { rankStoryThreads } from './storyMemory';

type MemoryTurnInput = {
  worldState: WorldState;
  worldBible?: WorldBible;
  characters: Character[];
  actions: string[];
  narration: string;
  aiResponse?: Partial<Pick<NarrationResult,
    'worldStateChanges'
    | 'activeNPC'
    | 'turnOutcome'
    | 'isHighStakes'
    | 'isCombat'
    | 'factionRepChange'
    | 'characterHistoryNote'
    | 'newForeshadowing'
    | 'backstoryHookActivated'
    | 'backstoryHookResolved'
    | 'actGoalAchieved'
  >>;
  location?: string;
  actionCount?: number;
};

export type MemoryPack = {
  npcMemories: NpcMemory[];
  characterMemories: CharacterMemory[];
  dmMemory?: DmCampaignMemory;
  storyThreads: ReturnType<typeof rankStoryThreads>;
  promptBlock: string;
};

function compact(text: string | undefined, limit: number): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function firstSentence(text: string | undefined, limit = 180): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.{20,220}?[.!?])\s/);
  return compact(match?.[1] || cleaned, limit);
}

function normalizeKey(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function uniqueStrings(values: (string | undefined)[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = compact(value, 180);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function asNpcArray(value: unknown): NpcMemory[] {
  return Array.isArray(value)
    ? value.filter((npc): npc is NpcMemory => !!npc && typeof npc === 'object' && typeof (npc as NpcMemory).name === 'string' && typeof (npc as NpcMemory).notes === 'string')
    : [];
}

function relationshipScoreFor(npc: NpcMemory): number {
  const score = npc.relationshipScore ?? 0;
  return Math.max(-100, Math.min(100, score));
}

function npcRelevanceScore(npc: NpcMemory, worldState: WorldState, actionText: string, characterNames: string[], location?: string): number {
  const name = npc.name || '';
  const lowerAction = actionText.toLowerCase();
  let score = 0;
  if (npc.isKeyNPC) score += 35;
  if (worldState.activeNPC && normalizeKey(worldState.activeNPC) === normalizeKey(name)) score += 40;
  if (lowerAction.includes(name.toLowerCase())) score += 35;
  if (location && npc.lastMet && normalizeKey(location) === normalizeKey(npc.lastMet)) score += 20;
  if ((npc.metCharacters || []).some(name => characterNames.includes(name))) score += 14;
  score += Math.min(18, Math.abs(relationshipScoreFor(npc)) / 4);
  score += Math.min(12, (npc.interactionCount || 0) * 3);
  if (npc.disposition === 'hostile' || npc.disposition === 'friendly') score += 8;
  return score;
}

export function selectRelevantNpcMemories(
  worldState: WorldState,
  characters: Character[],
  actions: string[],
  limit = 8,
): NpcMemory[] {
  const all = new Map<string, NpcMemory>();
  for (const npc of [...(worldState.npcMemory || []), ...(worldState.keyNPCs || [])]) {
    const key = normalizeKey(npc.name);
    if (!key) continue;
    all.set(key, { ...all.get(key), ...npc });
  }
  const actionText = actions.join(' | ');
  const characterNames = characters.map(character => character.name);
  const location = worldState.currentLocation || worldState.locationGraph?.currentLocation;
  return Array.from(all.values())
    .map(npc => ({ npc, score: npcRelevanceScore(npc, worldState, actionText, characterNames, location) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.npc);
}

export function selectCharacterMemories(worldState: WorldState, characters: Character[], limit = 4): CharacterMemory[] {
  const existing = new Map((worldState.characterMemories || []).map(memory => [memory.characterId, memory]));
  return characters
    .map(character => existing.get(character.id))
    .filter((memory): memory is CharacterMemory => !!memory)
    .slice(0, limit);
}

function formatNpcMemory(npc: NpcMemory): string {
  const relationship = npc.relationshipLabel || (npc.relationshipScore != null ? `score ${npc.relationshipScore}` : npc.disposition || 'unknown');
  const role = npc.role ? `, ${npc.role}` : '';
  const met = npc.metCharacters?.length ? `; met ${npc.metCharacters.join(', ')}` : '';
  return `- ${npc.name}${role} [${relationship}]: ${compact(npc.notes, 180)}${met}${npc.lastMet ? `; last seen ${npc.lastMet}` : ''}`;
}

function formatCharacterMemory(memory: CharacterMemory): string {
  const facts = memory.knownFacts.slice(-4).map(fact => compact(fact, 120)).join(' | ') || 'no durable facts yet';
  const stakes = memory.personalStakes.slice(-3).map(stake => compact(stake, 120)).join(' | ') || 'no personal stakes recorded yet';
  const relationships = memory.relationships
    .slice(-4)
    .map(rel => `${rel.npcName}: ${compact(rel.label || rel.summary, 70)}`)
    .join(' | ') || 'no personal NPC relationship notes yet';
  return `- ${memory.characterName}: knows ${facts}; stakes ${stakes}; relationships ${relationships}`;
}

function formatDmMemory(memory: DmCampaignMemory | undefined): string {
  if (!memory) return '';
  const parts = [
    memory.recurringMotifs?.length ? `Motifs: ${memory.recurringMotifs.slice(-4).join(' | ')}` : '',
    memory.tableToneNotes?.length ? `Tone promises: ${memory.tableToneNotes.slice(-3).join(' | ')}` : '',
    memory.unresolvedConsequences?.length ? `Consequences waiting: ${memory.unresolvedConsequences.slice(-4).join(' | ')}` : '',
    memory.promisesToHonor?.length ? `Promises/debts: ${memory.promisesToHonor.slice(-4).join(' | ')}` : '',
    memory.runningJokes?.length ? `Running jokes: ${memory.runningJokes.slice(-3).join(' | ')}` : '',
  ].filter(Boolean);
  return parts.length ? parts.map(part => `- ${part}`).join('\n') : '';
}

export function buildMemoryPack(
  worldState: WorldState,
  worldBible: WorldBible | undefined,
  characters: Character[],
  actions: string[],
): MemoryPack {
  const npcMemories = selectRelevantNpcMemories(worldState, characters, actions);
  const characterMemories = selectCharacterMemories(worldState, characters);
  const storyThreads = rankStoryThreads(worldState, worldBible, { limit: 5 });
  const dmMemory = worldState.dmMemory;
  const npcBlock = npcMemories.length ? `NPC memory that should affect reactions:\n${npcMemories.map(formatNpcMemory).join('\n')}` : '';
  const characterBlock = characterMemories.length ? `Player character memory / private continuity:\n${characterMemories.map(formatCharacterMemory).join('\n')}` : '';
  const dmBlock = formatDmMemory(dmMemory);
  const threadBlock = storyThreads.length
    ? `Most relevant unresolved story memory:\n${storyThreads.map(thread => `- ${thread.text}`).join('\n')}`
    : '';
  const promptBlock = [npcBlock, characterBlock, dmBlock ? `DM campaign memory:\n${dmBlock}` : '', threadBlock]
    .filter(Boolean)
    .join('\n\n');

  return { npcMemories, characterMemories, dmMemory, storyThreads, promptBlock };
}

function buildCharacterFact(input: MemoryTurnInput): string | undefined {
  const info = input.aiResponse?.turnOutcome?.informationRevealed || [];
  if (info.length > 0) return `${input.location || input.worldState.currentLocation || 'Unknown'}: ${info.slice(0, 2).join('; ')}`;
  if (input.aiResponse?.isHighStakes || input.aiResponse?.isCombat || input.aiResponse?.activeNPC) {
    return `${input.location || input.worldState.currentLocation || 'Unknown'}: ${firstSentence(input.narration)}`;
  }
  return undefined;
}

function buildPersonalStake(input: MemoryTurnInput, character: Character): string | undefined {
  const hook = (input.worldState.backstoryHooks || []).find(h => h.characterId === character.id && h.status !== 'resolved');
  if (input.aiResponse?.backstoryHookActivated === character.id && hook) return `Backstory surfaced: ${hook.hook}`;
  if (input.aiResponse?.backstoryHookResolved === character.id && hook) return `Backstory resolved: ${hook.hook}`;
  if (input.aiResponse?.characterHistoryNote) return `${input.aiResponse.characterHistoryNote.description} → ${input.aiResponse.characterHistoryNote.impact}`;
  return undefined;
}

function buildRelationshipUpdates(input: MemoryTurnInput, character: Character): CharacterMemory['relationships'] {
  const npcUpdates = asNpcArray((input.aiResponse?.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory);
  const activeNpc = input.aiResponse?.activeNPC || input.worldState.activeNPC;
  const updates = npcUpdates.filter(npc =>
    !npc.metCharacters?.length || npc.metCharacters.some(name => normalizeKey(name) === normalizeKey(character.name))
  );
  if (updates.length === 0 && typeof activeNpc === 'string') {
    const existing = [...(input.worldState.npcMemory || []), ...(input.worldState.keyNPCs || [])]
      .find(npc => normalizeKey(npc.name) === normalizeKey(activeNpc));
    if (existing) updates.push(existing);
  }

  const now = new Date().toISOString();
  return updates.slice(0, 4).map(npc => ({
    npcName: npc.name,
    summary: compact(npc.notes, 150) || `Met near ${input.location || input.worldState.currentLocation || 'the current scene'}.`,
    score: npc.relationshipScore,
    label: npc.relationshipLabel || npc.disposition,
    lastUpdatedAt: now,
  }));
}

export function buildLayeredMemoryChanges(input: MemoryTurnInput): Partial<WorldState> {
  const now = new Date().toISOString();
  const currentByCharacter = new Map((input.worldState.characterMemories || []).map(memory => [memory.characterId, memory]));
  const characterMemories: CharacterMemory[] = [];
  const durableFact = buildCharacterFact(input);

  for (const character of input.characters) {
    const current = currentByCharacter.get(character.id);
    const personalStake = buildPersonalStake(input, character);
    const relationshipUpdates = buildRelationshipUpdates(input, character);
    const relationshipByNpc = new Map((current?.relationships || []).map(rel => [normalizeKey(rel.npcName), rel]));
    for (const rel of relationshipUpdates) relationshipByNpc.set(normalizeKey(rel.npcName), rel);
    const next: CharacterMemory = {
      characterId: character.id,
      characterName: character.name,
      knownFacts: uniqueStrings([...(current?.knownFacts || []), durableFact], 14),
      personalStakes: uniqueStrings([...(current?.personalStakes || []), personalStake], 10),
      relationships: Array.from(relationshipByNpc.values()).slice(-12),
      privateNotes: uniqueStrings(current?.privateNotes || [], 8),
      lastUpdatedAt: now,
    };
    if (durableFact || personalStake || relationshipUpdates.length > 0 || !current) {
      characterMemories.push(next);
    }
  }

  const previousDm = input.worldState.dmMemory;
  const openThreads = rankStoryThreads(input.worldState, input.worldBible, {
    limit: 6,
    actionCount: input.actionCount ?? input.worldState.actionCount,
  });
  const relationshipConsequences = asNpcArray((input.aiResponse?.worldStateChanges as Partial<WorldState> | undefined)?.npcMemory)
    .filter(npc => Math.abs(npc.relationshipScore ?? 0) >= 25)
    .map(npc => `${npc.name}: ${npc.relationshipLabel || npc.disposition} because ${compact(npc.notes, 110)}`);
  const factionConsequence = input.aiResponse?.factionRepChange
    ? `${input.aiResponse.factionRepChange.faction} reputation shifted by ${input.aiResponse.factionRepChange.delta}`
    : undefined;
  const dmMemory: DmCampaignMemory = {
    recurringMotifs: uniqueStrings([
      ...(previousDm?.recurringMotifs || []),
      ...(input.worldState.foreshadowingLedger || []).filter(f => f.payoffStatus !== 'paid_off').slice(-2).map(f => f.description),
      ...(input.aiResponse?.newForeshadowing || []).map(f => f.description),
    ], 10),
    tableToneNotes: uniqueStrings([
      ...(previousDm?.tableToneNotes || []),
      input.worldBible?.playerPreferences?.tone ? `Honor selected tone: ${input.worldBible.playerPreferences.tone}` : undefined,
      ...(input.worldBible?.toneRules || []).slice(0, 2),
    ], 8),
    unresolvedConsequences: uniqueStrings([
      ...(previousDm?.unresolvedConsequences || []),
      ...openThreads.slice(0, 3).map(thread => thread.text),
      ...relationshipConsequences,
      factionConsequence,
    ], 12),
    runningJokes: uniqueStrings(previousDm?.runningJokes || [], 8),
    promisesToHonor: uniqueStrings([
      ...(previousDm?.promisesToHonor || []),
      ...(input.worldState.storyLedger || [])
        .filter(entry => entry.status !== 'resolved' && (entry.kind === 'promise' || entry.kind === 'relationship'))
        .slice(-4)
        .map(entry => `${entry.title}: ${entry.summary}`),
    ], 10),
    lastUpdatedAt: now,
  };

  return {
    ...(characterMemories.length > 0 ? { characterMemories } : {}),
    dmMemory,
  };
}
