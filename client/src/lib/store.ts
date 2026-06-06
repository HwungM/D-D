import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'
import type { Character, Campaign, StoryEvent, ActionResult, WorldState, NpcMemory, ActiveQuest } from '../../../shared/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNpcMemory(value: unknown): value is NpcMemory {
  return isRecord(value) && typeof value.name === 'string' && typeof value.notes === 'string'
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
    return { events: [...state.events, event] };
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
        const existing = new Map((current.npcMemory || []).map(n => [n.name, n]));
        for (const npc of npcArray) {
          const prev = existing.get(npc.name);
          if (prev) {
            const metChars = Array.from(new Set([...(prev.metCharacters || []), ...(npc.metCharacters || [])]));
            existing.set(npc.name, { ...prev, ...npc, metCharacters: metChars });
          } else {
            existing.set(npc.name, npc);
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

      // shopInventory: merge by location key
      if (changes.shopInventory) {
        merged.shopInventory = { ...(current.shopInventory || {}), ...changes.shopInventory };
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
        const existing = new Map((current.keyNPCs || []).map(n => [n.name, n]));
        for (const npc of changes.keyNPCs) {
          existing.set(npc.name, { ...existing.get(npc.name), ...npc });
        }
        merged.keyNPCs = Array.from(existing.values()).slice(-8);
      }

      // Simple scalar fields
      const scalarFields = ['timeOfDay', 'weather', 'campaignJournal', 'antagonistProgress', 'characterHistory', 'combatState', 'sceneState', 'currentSceneSummary', 'actionsSinceLastSummary', 'villainMoveCount', 'endgamePhase', 'actionCount', 'actionsInCurrentAct'] as const;
      for (const key of scalarFields) {
        if (changes[key] !== undefined) (merged as Record<string, unknown>)[key] = changes[key];
      }

      return { worldState: merged };
    }),
}))
