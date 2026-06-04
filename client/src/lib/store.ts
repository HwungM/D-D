import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'
import type { Character, Campaign, StoryEvent, ActionResult, WorldState } from '../../../shared/types'

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
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
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
        const existing = new Map((current.npcMemory || []).map(n => [n.name, n]));
        for (const npc of changes.npcMemory) {
          const prev = existing.get(npc.name);
          if (prev) {
            const metChars = Array.from(new Set([...(prev.metCharacters || []), ...(npc.metCharacters || [])]));
            existing.set(npc.name, { ...prev, ...npc, metCharacters: metChars });
          } else {
            existing.set(npc.name, npc);
          }
        }
        merged.npcMemory = Array.from(existing.values());
      }

      // activeQuests: upsert by title
      if (changes.activeQuests) {
        const existing = new Map((current.activeQuests || []).map(q => [q.title, q]));
        for (const q of changes.activeQuests) existing.set(q.title, { ...existing.get(q.title), ...q });
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

      // Simple scalar fields
      const scalarFields = ['timeOfDay', 'weather', 'campaignJournal', 'antagonistProgress', 'characterHistory'] as const;
      for (const key of scalarFields) {
        if (changes[key] !== undefined) (merged as Record<string, unknown>)[key] = changes[key];
      }

      return { worldState: merged };
    }),
}))
