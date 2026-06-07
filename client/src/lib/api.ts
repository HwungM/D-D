import axios from 'axios'
import { useAuthStore } from './store'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
})

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, clear session and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

// Auth
export const authApi = {
  register: (email: string, password: string, username: string) =>
    api.post('/auth/register', { email, password, username }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
}

// Campaigns
export const campaignApi = {
  getSeeds: () => api.get('/campaigns/seeds'),
  create: (name: string, storySeed: string, campaignType?: 'adventure' | 'testing', playerPreferences?: {
    playMode?: 'solo' | 'collaborative'
    partyIntent?: 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now'
    campaignLength?: 'one_shot' | 'short' | 'medium' | 'long' | 'open_ended'
    tone: string
    artStyle?: string
    favoritePillars: string[]
    playerCount: number
    targetPlayerCount?: number
    waitForParty?: boolean
    characterConcepts: string[]
  }) =>
    api.post('/campaigns', { name, storySeed, campaignType, playerPreferences }),
  list: () => api.get('/campaigns'),
  get: (id: string) => api.get(`/campaigns/${id}`),
  join: (id: string) => api.post(`/campaigns/${id}/join`),
  createInvite: (campaignId: string) => api.post(`/campaigns/${campaignId}/invite`),
  getInvite: (code: string) => api.get(`/campaigns/invite/${code}`),
  acceptInvite: (code: string) => api.post(`/campaigns/invite/${code}/accept`),
  getParty: (campaignId: string) => api.get(`/campaigns/${campaignId}/party`),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
}

// Characters
export const characterApi = {
  create: (data: {
    campaignId: string
    name: string
    race: string
    class: string
    backstory?: string
    generatePortrait?: boolean
    portraitUrl?: string
    stats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  }) => api.post('/characters', data),
  listByCampaign: (campaignId: string) => api.get(`/characters/campaign/${campaignId}`),
  get: (id: string) => api.get(`/characters/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/characters/${id}`, data),
  purchase: (id: string, item: { id: string; name: string; description: string; type: string; price: number; quantity: number }, campaignId: string) =>
    api.post(`/characters/${id}/purchase`, { item, campaignId }),
  sell: (id: string, itemName: string, sellPrice: number) =>
    api.post(`/characters/${id}/sell`, { itemName, sellPrice }),
}

// Game
export const gameApi = {
  start: (characterId: string, campaignId: string) =>
    api.post('/game/start', { characterId, campaignId }),
  action: (characterId: string, campaignId: string, action: string) =>
    api.post('/game/action', { characterId, campaignId, action }),
  getHistory: (campaignId: string, characterId: string, limit?: number, party?: boolean) =>
    api.get(`/game/history/${campaignId}/${characterId}?limit=${limit || 50}${party ? '&party=true' : ''}`),
  getScene: (campaignId: string, characterId: string) =>
    api.get(`/game/scene/${campaignId}/${characterId}`),
  resolveRoll: (data: { characterId: string; campaignId: string; rollContext: unknown }) =>
    api.post('/game/resolve-roll', data),
  devKill: (characterId: string) => api.post(`/game/dev-kill/${characterId}`),
  devClearCombat: (campaignId: string) => api.post(`/game/dev-clear-combat/${campaignId}`),
  epilogue: (campaignId: string, characterId: string, victory: boolean) =>
    api.post(`/game/epilogue/${campaignId}/${characterId}`, { victory }),
}

// TTS
export const ttsApi = {
  speak: (text: string, voice?: string) =>
    api.post('/tts', { text, voice }, { responseType: 'arraybuffer' }),
}

// Assets
export const assetApi = {
  generate: (description: string, cacheKey: string, assetType = 'scene') =>
    api.post('/assets/generate', { description, cacheKey, assetType }),
}
