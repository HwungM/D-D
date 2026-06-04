import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'
import type { Character, Campaign, StoryEvent, ActionResult } from '../../../shared/types'

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
  setCampaign: (campaign: Campaign | null) => void
  setCharacter: (character: Character | null) => void
  addEvent: (event: StoryEvent) => void
  setEvents: (events: StoryEvent[]) => void
  setLoading: (loading: boolean) => void
  setLastActionResult: (result: ActionResult | null) => void
  setSceneImage: (url: string | null) => void
  updateCharacter: (updates: Partial<Character>) => void
}

export const useGameStore = create<GameState>()((set) => ({
  currentCampaign: null,
  currentCharacter: null,
  events: [],
  isLoading: false,
  lastActionResult: null,
  currentSceneImage: null,
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
}))
