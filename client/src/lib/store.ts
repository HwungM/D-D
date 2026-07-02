import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'
import type { Character, Campaign, StoryEvent, ActionResult, WorldState, NpcMemory, ActiveQuest } from '../../../shared/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// Chronological order with a stable tiebreaker: when an action and the
// narration it produced share a timestamp, the action reads first.
function sortEvents(events: StoryEvent[]): StoryEvent[] {
  return [...events].sort((a, b) => {
    const ta = Date.parse(a.created_at) || 0
    const tb = Date.parse(b.created_at) || 0
    if (ta !== tb) return ta - tb
    if (a.event_type !== b.event_type) return a.event_type === 'action' ? -1 : 1
    return 0
  })
}

function isNpcMemory(value: unknown): value is NpcMemory {
  return isRecord(value) && typeof value.name === 'string' && typeof value.notes === 'string'
}

function npcMemoryKey(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function npcMemoryEntries(list: NpcMemory[] | undefined): [string, NpcMemory][] {
  return (list || [])
    .map((npc): [string, NpcMemory] => [npcMemoryKey(npc.name), npc])
    .filter((entry): entry is [string, NpcMemory] => entry[0].length > 0)
}

function isActiveQuest(value: unknown): value is ActiveQuest {
  return isRecord(value) && typeof value.title === 'string' && typeof value.description === 'string'
}

interface AuthState {
  session: Session | null
  user: { id: string; email?: string; username?: string } | null
  setSession: (session: Session | null) => void
  setUser: (user: { id: string; email?: string; username?: string } | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      user: null,
      setSession: (session) => set({ session }),
      setUser: (user) => set({ user }),
      logout: () => set({ session: null, user: null }),
    }),
    { name: 'dnd-auth' }
  )
)

interface GameState {
  currentCampaign: Campaign | null
  currentCharacter: Character | null
  events: StoryEvent[]
  isLoading: boolean
  lastActionResult: ActionResult | null
  currentSceneImage: string | null
  worldState: WorldState | null
  setCampaign: (campaign: Campaign | null) => void
  setCharacter: (character: Character | null) => void
  addEvent: (event: StoryEvent) => void
  reconcileEvent: (realEvent: StoryEvent) => void
  setEvents: (events: StoryEvent[]) => void
  setLoading: (loading: boolean) => void
  setLastActionResult: (result: ActionResult | null) => void
  setSceneImage: (url: string | null) => void
  updateCharacter: (updates: Partial<Character>) => void
  setWorldState: (ws: WorldState | null) => void
  mergeWorldState: (changes: Partial<WorldState>) => void
}

export const useGameStore = create<GameState>()((set) => ({
  currentCampaign: null,
  currentCharacter: null,
  events: [],
  isLoading: false,
  lastActionResult: null,
  currentSceneImage: null,
  worldState: null,
  setCampaign: (campaign) => set({ currentCampaign: campaign }),
  setCharacter: (character) => set({ currentCharacter: character }),
  addEvent: (event) => set((state) => {
    if (state.events.some(existing => existing.id === event.id)) return state;
    return { events: sortEvents([...state.events, event]) };
  }),
  // Replace an optimistic (client-timestamped) action with its authoritative
  // server row. Mixing client and server clocks in the sort scrambles co-op
  // turns when the two devices' clocks drift; once both actions carry server
  // timestamps the chronological sort is reliable.
  reconcileEvent: (realEvent) => set((state) => {
    if (state.events.some(existing => existing.id === realEvent.id)) return state;
    const withoutOptimistic = state.events.filter(e =>
      !(e.metadata?.optimistic
        && e.character_id === realEvent.character_id
        && e.event_type === realEvent.event_type
        && e.content === realEvent.content));
    return { events: sortEvents([...withoutOptimistic, realEvent]) };
  }),
  setEvents: (events) => set({ events }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLastActionResult: (result) => set({ lastActionResult: result }),
  setSceneImage: (url) => set({ currentSceneImage: url }),
  updateCharacter: (updates) =>
    set((state) => ({
      currentCharacter: state.currentCharacter
        ? { ...state.currentCharacter, ...updates }
        : null,
    })),
  setWorldState: (ws) => set({ worldState: ws }),
  mergeWorldState: (changes) =>
    set((state) => {
      if (!state.worldState) return { worldState: changes as WorldState };
      const current = state.worldState;
      const merged = { ...current };

      // characterLocations: per-character update
      if (changes.characterLocations) {
        merged.characterLocations = { ...current.characterLocations, ...changes.characterLocations };
      }

      // currentLocation scalar
      if (changes.currentLocation) merged.currentLocation = changes.currentLocation;

      // npcMemory: upsert by name, preserve metCharacters from both sides
      if (changes.npcMemory) {
        const npcArray = (Array.isArray(changes.npcMemory) ? changes.npcMemory : Object.values(changes.npcMemory)).filter(isNpcMemory);
        const existing = new Map<string, NpcMemory>(npcMemoryEntries(current.npcMemory));
        for (const npc of npcArray) {
          const npcKey = npcMemoryKey(npc.name);
          if (!npcKey) continue;
          // Placeholder reveal: "Mysterious Stranger" -> "Eldrin" merges into the
          // new name instead of leaving both entries behind.
          const replacesKey = npc.replacesName && npcMemoryKey(npc.replacesName) !== npcKey ? npcMemoryKey(npc.replacesName) : '';
          const placeholder = replacesKey ? existing.get(replacesKey) : undefined;
          if (placeholder && replacesKey) existing.delete(replacesKey);
          const prev = existing.get(npcKey) || placeholder;
          const { replacesName: _replacesName, ...npcRest } = npc;
          if (prev) {
            const metChars = Array.from(new Set([...(prev.metCharacters || []), ...(npcRest.metCharacters || [])]));
            existing.set(npcKey, { ...prev, ...npcRest, metCharacters: metChars });
          } else {
            existing.set(npcKey, npcRest);
          }
        }
        merged.npcMemory = Array.from(existing.values()).slice(-20);
      }

      // activeQuests: upsert by title
      if (changes.activeQuests) {
        const existing = new Map((current.activeQuests || []).map(q => [q.title, q]));
        for (const q of changes.activeQuests.filter(isActiveQuest)) existing.set(q.title, { ...existing.get(q.title), ...q });
        merged.activeQuests = Array.from(existing.values());
      }

      // discoveredLocations: union
      if (changes.discoveredLocations) {
        merged.discoveredLocations = Array.from(new Set([...(current.discoveredLocations || []), ...changes.discoveredLocations]));
      }

      // factionStandings: merge per-faction
      if (changes.factionStandings) {
        merged.factionStandings = { ...current.factionStandings, ...changes.factionStandings };
      }

      // sessionNotes: append new only
      if (changes.sessionNotes) {
        const existingSet = new Set(current.sessionNotes || []);
        const newNotes = changes.sessionNotes.filter(n => !existingSet.has(n));
        merged.sessionNotes = [...(current.sessionNotes || []), ...newNotes];
      }

      // characterLastSeen: merge
      if (changes.characterLastSeen) {
        merged.characterLastSeen = { ...current.characterLastSeen, ...changes.characterLastSeen };
      }

      // foreshadowingLedger: merge by id
      if (changes.foreshadowingLedger) {
        const existing = new Map((current.foreshadowingLedger || []).map(f => [f.id, f]));
        for (const entry of changes.foreshadowingLedger) existing.set(entry.id, { ...existing.get(entry.id), ...entry });
        merged.foreshadowingLedger = Array.from(existing.values()).slice(-50);
      }

      // backstoryHooks: merge by key
      if (changes.backstoryHooks) {
        const existing = new Map((current.backstoryHooks || []).map(h => [`${h.characterId}:${h.hook}`, h]));
        for (const hook of changes.backstoryHooks) existing.set(`${hook.characterId}:${hook.hook}`, { ...existing.get(`${hook.characterId}:${hook.hook}`), ...hook });
        merged.backstoryHooks = Array.from(existing.values());
      }

      // actGoalsAchieved: union
      if (changes.actGoalsAchieved) {
        merged.actGoalsAchieved = Array.from(new Set([...(current.actGoalsAchieved || []), ...changes.actGoalsAchieved]));
      }

      // engineAudit: merge by id and keep the latest testing breadcrumbs
      if (changes.engineAudit) {
        const existing = new Map((current.engineAudit || []).map(entry => [entry.id, entry]));
        for (const entry of changes.engineAudit) existing.set(entry.id, { ...existing.get(entry.id), ...entry });
        merged.engineAudit = Array.from(existing.values())
          .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0))
          .slice(-30);
      }

      // shopInventory: merge by location key
      if (changes.shopInventory) {
        merged.shopInventory = { ...(current.shopInventory || {}), ...changes.shopInventory };
      }

      // mysteryClues: upsert by id
      if (changes.mysteryClues) {
        const existing = new Map((current.mysteryClues || []).map(c => [c.id, c]));
        for (const clue of changes.mysteryClues) existing.set(clue.id, { ...existing.get(clue.id), ...clue });
        merged.mysteryClues = Array.from(existing.values());
      }

      // characterMemories: upsert by character, preserving bounded facts/stakes/relationships
      if (changes.characterMemories) {
        const existing = new Map((current.characterMemories || []).map(memory => [memory.characterId, memory]));
        for (const memory of changes.characterMemories) {
          const prev = existing.get(memory.characterId);
          const relationships = new Map((prev?.relationships || []).map(rel => [rel.npcName.toLowerCase(), rel]));
          for (const rel of memory.relationships || []) relationships.set(rel.npcName.toLowerCase(), { ...relationships.get(rel.npcName.toLowerCase()), ...rel });
          existing.set(memory.characterId, {
            ...prev,
            ...memory,
            knownFacts: Array.from(new Set([...(prev?.knownFacts || []), ...(memory.knownFacts || [])])).slice(-14),
            personalStakes: Array.from(new Set([...(prev?.personalStakes || []), ...(memory.personalStakes || [])])).slice(-10),
            privateNotes: Array.from(new Set([...(prev?.privateNotes || []), ...(memory.privateNotes || [])])).slice(-8),
            relationships: Array.from(relationships.values()).slice(-12),
          });
        }
        merged.characterMemories = Array.from(existing.values()).slice(-6);
      }

      // dmMemory: merge bounded campaign-brain lanes
      if (changes.dmMemory) {
        const prev = current.dmMemory;
        merged.dmMemory = {
          ...prev,
          ...changes.dmMemory,
          recurringMotifs: Array.from(new Set([...(prev?.recurringMotifs || []), ...(changes.dmMemory.recurringMotifs || [])])).slice(-10),
          tableToneNotes: Array.from(new Set([...(prev?.tableToneNotes || []), ...(changes.dmMemory.tableToneNotes || [])])).slice(-8),
          unresolvedConsequences: Array.from(new Set([...(prev?.unresolvedConsequences || []), ...(changes.dmMemory.unresolvedConsequences || [])])).slice(-12),
          runningJokes: Array.from(new Set([...(prev?.runningJokes || []), ...(changes.dmMemory.runningJokes || [])])).slice(-8),
          promisesToHonor: Array.from(new Set([...(prev?.promisesToHonor || []), ...(changes.dmMemory.promisesToHonor || [])])).slice(-10),
          lastUpdatedAt: changes.dmMemory.lastUpdatedAt || prev?.lastUpdatedAt || new Date().toISOString(),
        };
      }

      // activeNPC: direct set
      if (changes.activeNPC !== undefined) merged.activeNPC = changes.activeNPC;

      // fallenHeroes: append new entries
      if (changes.fallenHeroes) {
        const existingNames = new Set((current.fallenHeroes || []).map(h => `${h.name}:${h.diedAt}`));
        const newFallen = changes.fallenHeroes.filter(h => !existingNames.has(`${h.name}:${h.diedAt}`));
        merged.fallenHeroes = [...(current.fallenHeroes || []), ...newFallen];
      }

      // keyNPCs: merge by name (same upsert logic as npcMemory but never pruned)
      if (changes.keyNPCs) {
        const existing = new Map<string, NpcMemory>(npcMemoryEntries(current.keyNPCs));
        for (const npc of changes.keyNPCs) {
          const npcKey = npcMemoryKey(npc.name);
          if (!npcKey) continue;
          existing.set(npcKey, { ...existing.get(npcKey), ...npc });
        }
        merged.keyNPCs = Array.from(existing.values()).slice(-8);
      }

      // Simple scalar fields
      const scalarFields = ['timeOfDay', 'campaignJournal', 'campaignSpine', 'locationGraph', 'antagonistProgress', 'characterHistory', 'combatState', 'sceneState', 'currentSceneSummary', 'actionsSinceLastSummary', 'villainMoveCount', 'endgamePhase', 'actionCount', 'actionsInCurrentAct', 'unlockedAchievements', 'knownRecipes', 'companion', 'companions', 'companionLocations', 'sceneInteractables', 'freeRoam', 'spotlightBalance', 'lastPillarUsed', 'pendingDirectorBeat', 'lastHighStakesAction', 'pendingTurn', 'coopPendingRoll', 'engineDebug'] as const;
      for (const key of scalarFields) {
        if (changes[key] !== undefined) (merged as Record<string, unknown>)[key] = changes[key];
      }

      return { worldState: merged };
    }),
}))
