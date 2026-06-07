import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { gameApi, assetApi, campaignApi, characterApi } from '../lib/api'
import { useGameStore, useAuthStore } from '../lib/store'
import { matchSceneImage, inferMood } from '../lib/sceneUtils'
import { createClient } from '@supabase/supabase-js'
import SceneDisplay from '../components/SceneDisplay'
import ActionPanel from '../components/ActionPanel'
import CharacterSheet from '../components/CharacterSheet'
import NarratorBox from '../components/NarratorBox'
import DiceRoll from '../components/DiceRoll'
import AudioControls from '../components/AudioControls'
import LevelUpScreen from '../components/LevelUpScreen'
import EnemyPopup from '../components/EnemyPopup'
import LootPopup from '../components/LootPopup'
import PartyPanel from '../components/PartyPanel'
import InviteModal from '../components/InviteModal'
import QuestLog from '../components/QuestLog'
import WorldPanel from '../components/WorldPanel'
import MapPanel from '../components/MapPanel'
import DeathScreen from '../components/DeathScreen'
import CombatPanel from '../components/CombatPanel'
import EpilogueScreen from '../components/EpilogueScreen'
import ShopModal from '../components/ShopModal'
import ActTransition from '../components/ActTransition'
import HighStakesChoice from '../components/HighStakesChoice'
import SidebarErrorBoundary from '../components/SidebarErrorBoundary'
import DiceRollModal from '../components/DiceRollModal'
import DevPanel from '../components/DevPanel'
import { audioManager } from '../lib/audio'
import type { Ability, Character, StoryEvent, ActionResult, InventoryItem, PartyMember, ShopItem, HighStakesChoice as HighStakesChoiceType, RollContext } from '../../../shared/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const DEFAULT_SCENES = [
  '/media/loading/everrealm-crystal-party.png',
  '/media/loading/everrealm-portal-party.png',
  '/media/loading/everrealm-moonlit-party.png',
  '/media/loading/everrealm-storm-party.png',
  '/media/loading/everrealm-snow-ascent.png',
]

function visibleSceneArt(imageUrl: string | null) {
  if (!imageUrl) return '/media/loading/everrealm-crystal-party.png'
  if (imageUrl.startsWith('/assets/scenes/')) return '/media/loading/everrealm-crystal-party.png'
  return imageUrl
}

function normalizeEvents(events: StoryEvent[]): StoryEvent[] {
  const result: StoryEvent[] = []
  for (const ev of events) {
    const hasOldFormat = ev.content.includes('NARRATION:') && (ev.content.startsWith('ACTION:') || ev.content.includes('\nNARRATION:'))
    if (hasOldFormat) {
      const narrationIdx = ev.content.indexOf('NARRATION:')
      const rawAction = ev.content.slice(0, narrationIdx).replace(/^ACTION:\s*/i, '').trim()
      const narration = ev.content.slice(narrationIdx).replace(/^NARRATION:\s*/i, '').trim()
      if (rawAction && !rawAction.includes('BEGIN_CAMPAIGN_OPENING') && !rawAction.includes('OPENING_SCENE')) {
        result.push({ ...ev, id: `${ev.id}-a`, event_type: 'action', content: rawAction })
      }
      if (narration) result.push({ ...ev, id: `${ev.id}-n`, event_type: 'narration', content: narration })
    } else {
      if (ev.content === 'BEGIN_CAMPAIGN_OPENING' || ev.content === 'OPENING_SCENE') continue
      result.push(ev)
    }
  }
  return result
}

function getErrorMessage(err: unknown): string {
  const responseMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return responseMessage || 'The action could not be resolved. Try again.'
}

export default function Game() {
  const { campaignId, characterId } = useParams<{ campaignId: string; characterId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    currentCharacter, setCharacter, setLastActionResult, lastActionResult,
    isLoading, setLoading, currentSceneImage, setSceneImage, events, setEvents, addEvent,
    worldState, setWorldState, mergeWorldState,
  } = useGameStore()

  const [started, setStarted] = useState(false)
  const [showDice, setShowDice] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'character' | 'quests' | 'map' | 'world'>('character')
  const narratorRef = useRef<HTMLDivElement>(null)
  const historicalIds = useRef<Set<string>>(new Set())
  const coopWaitingRef = useRef(false)
  const coopResolvedAtRef = useRef(0)


  const [showLevelUp, setShowLevelUp] = useState(false)
  const [levelUpData, setLevelUpData] = useState<{ level: number; hpGained: number; newAbility: Ability | null; characterName: string } | null>(null)
  const [showEnemyPopup, setShowEnemyPopup] = useState(false)
  const [enemyPopupName, setEnemyPopupName] = useState('')
  const [inCombat, setInCombat] = useState(false)

  const [lootItems, setLootItems] = useState<InventoryItem[]>([])
  const [lootGold, setLootGold] = useState<number | undefined>()
  const [showLoot, setShowLoot] = useState(false)

  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [showDeathScreen, setShowDeathScreen] = useState(false)
  const [shopItems, setShopItems] = useState<ShopItem[]>([])
  const [showShop, setShowShop] = useState(false)
  const [showActTransition, setShowActTransition] = useState(false)
  const [nextAct, setNextAct] = useState(1)
  const [recentNarrations, setRecentNarrations] = useState<string[]>([])
  const [showHighStakes, setShowHighStakes] = useState(false)
  const [highStakesData, setHighStakesData] = useState<{ narration: string; choices: HighStakesChoiceType[] } | null>(null)
  const [showEpilogue, setShowEpilogue] = useState(false)
  const [epilogueData, setEpilogueData] = useState<{ text: string; victory: boolean } | null>(null)

  const [showDiceModal, setShowDiceModal] = useState(false)
  const [diceModalData, setDiceModalData] = useState<{ narration: string; rollContext: RollContext } | null>(null)
  const [partyActionMode, setPartyActionMode] = useState(false)
  const [isNewCharacter, setIsNewCharacter] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [campaignType, setCampaignType] = useState<'adventure' | 'testing'>('adventure')
  const [coopWaiting, setCoopWaitingState] = useState(false)
  const [coopPartnerName, setCoopPartnerName] = useState('')
  const [coopSubmittedCount, setCoopSubmittedCount] = useState(0)
  const [coopNeededCount, setCoopNeededCount] = useState(0)
  const [coopExpiresAt, setCoopExpiresAt] = useState<string | null>(null)
  function setCoopWaiting(val: boolean) { coopWaitingRef.current = val; setCoopWaitingState(val) }

  useEffect(() => {
    audioManager.bindUiSounds()
    audioManager.startAmbient()
    document.addEventListener('click', () => { audioManager.startAmbient(); audioManager.startGameplay() }, { once: true })
  }, [])

  const refreshParty = useCallback(() => {
    if (!campaignId) return
    campaignApi.getParty(campaignId).then(({ data }) => {
      const members: PartyMember[] = data.members || []
      setPartyMembers(members)
      // Find partner's character name for co-op waiting banner
      const partner = members.find(m => m.userId !== user?.id)
      if (partner?.character?.name) setCoopPartnerName(partner.character.name)
    }).catch(() => {})
  }, [campaignId, user?.id])

  const syncSceneState = useCallback(() => {
    if (!campaignId || !characterId) return
    gameApi.getScene(campaignId, characterId).then(({ data }) => {
      if (data.character) {
        setCharacter(data.character as Character)
        if (data.character.is_alive === false) setTimeout(() => setShowDeathScreen(true), 300)
      }
      if (data.worldState) {
        setWorldState(data.worldState)
        const pendingTurn = data.worldState.pendingTurn
        if (pendingTurn?.actions?.length) {
          const submitted = pendingTurn.actions.some((action: { characterId: string }) => action.characterId === characterId)
          const readyMemberCount = partyMembers.filter(member => member.character && member.character.is_alive !== false).length
          setCoopSubmittedCount(pendingTurn.actions.length)
          setCoopNeededCount(Math.max(pendingTurn.actions.length + (submitted ? 1 : 0), readyMemberCount || pendingTurn.actions.length + 1))
          setCoopExpiresAt(pendingTurn.expiresAt || null)
          // Guard against a stale poll re-locking input right after realtime resolved this turn
          const justResolved = Date.now() - coopResolvedAtRef.current < 8000
          if (submitted && !justResolved) {
            setCoopWaiting(true)
            setLoading(false)
          }
        } else {
          coopResolvedAtRef.current = 0
          setCoopSubmittedCount(0)
          setCoopNeededCount(0)
          setCoopExpiresAt(null)
          if (coopWaitingRef.current) setCoopWaiting(false)
        }
      }
    }).catch(() => {})
  }, [campaignId, characterId, partyMembers.length, setCharacter, setLoading, setWorldState])

  useEffect(() => {
    if (!campaignId || !characterId) return
    gameApi.getScene(campaignId, characterId).then(({ data }) => {
      if (data.character) {
        setCharacter(data.character as Character)
        if (data.character.is_alive === false) {
          setTimeout(() => setShowDeathScreen(true), 300)
          return
        }
      }
      if (data.worldState) {
        setWorldState(data.worldState)
        if (data.worldState.currentLocation) audioManager.setLocation(data.worldState.currentLocation)
        const localScene = matchSceneImage(
          [data.worldState.currentLocation, data.worldState.weather].filter(Boolean).join(' ')
        )
        setSceneImage(localScene || DEFAULT_SCENES[Math.floor(Math.random() * DEFAULT_SCENES.length)])
      } else if (!currentSceneImage) {
        setSceneImage(DEFAULT_SCENES[Math.floor(Math.random() * DEFAULT_SCENES.length)])
      }
    })
    gameApi.getHistory(campaignId, characterId, 50, true).then(({ data }) => {
      const loaded: StoryEvent[] = data.events || []
      historicalIds.current = new Set(loaded.map(e => e.id))
      setEvents(loaded)
      // Only auto-start if THIS character has their own history - not just party members'
      const myEvents = loaded.filter(e => e.character_id === characterId)
      if (myEvents.length === 0) setIsNewCharacter(true)
      if (myEvents.length > 0) {
        setStarted(true)
        const recent = loaded
          .filter(e => e.event_type === 'narration')
          .slice(-5)
          .map(e => e.content)
        setRecentNarrations(recent)
        // Restore suggested actions from last narration event metadata
        const lastNarration = [...loaded].reverse().find(e => e.event_type === 'narration' && e.character_id === characterId)
        if (lastNarration?.metadata?.suggestedActions) {
          setLastActionResult({
            narration: lastNarration.content,
            suggestedActions: lastNarration.metadata.suggestedActions as string[],
          } as ActionResult)
        }
        // Restore pending dice roll if player disconnected mid-roll
        if (lastNarration?.metadata?.awaitingRoll && lastNarration.metadata.rollContext) {
          setDiceModalData({
            narration: lastNarration.content,
            rollContext: lastNarration.metadata.rollContext as RollContext,
          })
          setShowDiceModal(true)
        }
      } else if (loaded.length > 0) {
        // Party has history but this character is new - show recent story on start screen for context
        const recent = loaded.filter(e => e.event_type === 'narration').slice(-5).map(e => e.content)
        setRecentNarrations(recent)
      }
    })
    campaignApi.get(campaignId).then(({ data }) => {
      setCampaignName(data.campaign.name)
      setNextAct(data.campaign.act ?? 1)
      if (data.campaign.campaign_type) setCampaignType(data.campaign.campaign_type)
    }).catch(() => {})
    refreshParty()
  }, [campaignId, characterId])

  useEffect(() => {
    if (!campaignId || !characterId || partyMembers.length < 2) return
    const interval = window.setInterval(() => {
      syncSceneState()
      refreshParty()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [campaignId, characterId, partyMembers.length, refreshParty, syncSceneState])

  // Supabase Realtime
  useEffect(() => {
    if (!campaignId || !supabaseUrl || !supabaseAnonKey) return
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const channel = supabase
      .channel(`campaign:${campaignId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_events', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const newEvent = payload.new as StoryEvent
          const isOwnEvent = newEvent.character_id === characterId
          const isPartnerEvent = !!newEvent.character_id && newEvent.character_id !== characterId

          if (coopWaitingRef.current && isOwnEvent && newEvent.event_type === 'narration') {
            addEvent(newEvent)
            coopResolvedAtRef.current = Date.now()
            setCoopWaiting(false)
            setCoopSubmittedCount(0)
            setCoopNeededCount(0)
            setCoopExpiresAt(null)
            setLoading(false)
            setIsTyping(true)
            const suggestedActions = Array.isArray(newEvent.metadata?.suggestedActions)
              ? newEvent.metadata.suggestedActions as string[]
              : undefined
            setLastActionResult({ narration: newEvent.content, suggestedActions } as ActionResult)
            syncSceneState()
            refreshParty()
            return
          }

          if (isPartnerEvent && newEvent.event_type === 'action') {
            addEvent(newEvent)
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'characters', filter: `campaign_id=eq.${campaignId}` },
        () => { refreshParty() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId, characterId, addEvent, refreshParty, syncSceneState])

  useEffect(() => {
    if (narratorRef.current) narratorRef.current.scrollTop = narratorRef.current.scrollHeight
  }, [events])


  async function handleRollComplete() {
    if (!campaignId || !characterId || !diceModalData) throw new Error('Roll context missing')
    setLoading(true)
    try {
      const { data } = await gameApi.resolveRoll({
        characterId,
        campaignId,
        rollContext: diceModalData.rollContext,
      })
      const result = data as ActionResult
      setLastActionResult(result)

      if (result.isCombat) audioManager.playCombat()
      if (result.isVictory) audioManager.playVictory()
      if (result.loot?.length) audioManager.playItemPickup()

      if (result.isCombat && result.enemyName) {
        setInCombat(true)
        setEnemyPopupName(result.enemyName)
        setShowEnemyPopup(true)
      }
      if (result.isVictory) setInCombat(false)

      if ((result.loot && result.loot.length > 0) || (result.characterChanges?.gold && currentCharacter && (result.characterChanges.gold as number) > currentCharacter.gold)) {
        const goldGained = result.characterChanges?.gold !== undefined && currentCharacter
          ? (result.characterChanges.gold as number) - currentCharacter.gold
          : undefined
        setLootItems((result.loot as InventoryItem[]) || [])
        setLootGold(goldGained && goldGained > 0 ? goldGained : undefined)
        setShowLoot(true)
      }

      setIsTyping(true)
      addEvent({
        id: `roll-dm-${Date.now()}`,
        campaign_id: campaignId,
        character_id: characterId,
        event_type: 'narration',
        content: result.narration,
        metadata: { suggestedActions: result.suggestedActions, fromRoll: true },
        created_at: new Date().toISOString(),
      })

      if (result.characterChanges) setCharacter({ ...currentCharacter!, ...result.characterChanges } as Character)
      if (result.worldStateChanges) mergeWorldState(result.worldStateChanges)

      if (result.sceneImagePrompt) {
        const local = matchSceneImage(result.sceneImagePrompt)
        if (local) setSceneImage(local)
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-${Date.now()}`).then(({ data: img }) => setSceneImage(img.url)).catch(() => {})
      }

      if (result.isDeath) {
        setTimeout(() => setShowDeathScreen(true), 1200)
      }

      refreshParty()
      return {
        rollResult: result.diceRoll?.rolls?.[0] ?? 1,
        rollTotal: result.diceRoll?.total ?? 1,
        dc: diceModalData.rollContext.dc,
        success: (result.diceRoll?.total ?? 0) >= diceModalData.rollContext.dc,
        isCritSuccess: result.diceRoll?.rolls?.[0] === 20,
        isCritFail: result.diceRoll?.rolls?.[0] === 1,
      }
    } catch (err) {
      console.error(err)
      throw err
    } finally { setLoading(false) }
  }

  async function handleStart() {
    if (!campaignId || !characterId) return
    setLoading(true)
    try {
      const { data } = await gameApi.start(characterId, campaignId)
      const result = data as ActionResult
      setLastActionResult(result)
      setStarted(true)
      setIsNewCharacter(false)
      if (result.narration) {
        addEvent({
          id: `start-${Date.now()}`,
          campaign_id: campaignId,
          character_id: characterId,
          event_type: 'narration',
          content: result.narration,
          metadata: { suggestedActions: result.suggestedActions },
          created_at: new Date().toISOString(),
        })
      }
      if (result.worldStateChanges) mergeWorldState(result.worldStateChanges)
      if (result.sceneImagePrompt) {
        const local = matchSceneImage(result.sceneImagePrompt)
        if (local) setSceneImage(local)
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-start`).then(({ data: img }) => setSceneImage(img.url)).catch(() => {})
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleAction(action: string) {
    if (!campaignId || !characterId || isLoading || isTyping) return
    setLoading(true)
    setShowDice(false)
    setShowHighStakes(false)
    // Clear stale suggested actions immediately so old choices don't persist
    setLastActionResult(null)
    setHighStakesData(null)

    // Prefix with [PARTY ACTION] if party action mode is enabled and party members are present
    const finalAction = partyActionMode && partyMembersHere.length > 0
      ? `[PARTY ACTION] ${action}`
      : action

    // Only switch scene immediately based on location - not action text (avoids wrong images)
    const immediateScene = matchSceneImage(worldState?.currentLocation || '')
    if (immediateScene) setSceneImage(immediateScene)

    const clientRequestId = `action-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticActionId = `temp-${clientRequestId}`
    addEvent({
      id: optimisticActionId,
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'action',
      content: finalAction,
      metadata: { optimistic: true, clientRequestId },
      created_at: new Date().toISOString(),
    })
    try {
      const { data } = await gameApi.action(characterId, campaignId, finalAction)
      const result = data as ActionResult & { status?: string; submittedCount?: number; neededCount?: number; expiresAt?: string }
      setLastActionResult(result)

      // Co-op waiting - partner hasn't submitted yet
      if (result.status === 'waiting') {
        setCoopWaiting(true)
        setCoopSubmittedCount(typeof result.submittedCount === 'number' ? result.submittedCount : 1)
        setCoopNeededCount(typeof result.neededCount === 'number' ? result.neededCount : Math.max(2, partyMembers.length))
        setCoopExpiresAt(typeof result.expiresAt === 'string' ? result.expiresAt : null)
        setLoading(false)
        return
      }
      // Co-op complete - partner submitted, we got the combined narration
      if (result.status === 'complete') {
        setCoopWaiting(false)
        setCoopSubmittedCount(0)
        setCoopNeededCount(0)
        setCoopExpiresAt(null)
      }

      // Player-driven dice roll
      if (result.awaitingRoll && result.rollContext) {
        addEvent({
          id: `temp-dm-${Date.now()}`,
          campaign_id: campaignId,
          character_id: characterId,
          event_type: 'narration',
          content: result.narration,
          metadata: { awaitingRoll: true, suggestedActions: result.suggestedActions },
          created_at: new Date().toISOString(),
        })
        setDiceModalData({ narration: result.narration, rollContext: result.rollContext })
        setShowDiceModal(true)
        setLoading(false)
        return
      }

      if (result.diceRoll) setShowDice(true)
      if (result.isCombat) audioManager.playCombat()
      if (result.isVictory) audioManager.playVictory()
      // If we were in combat but this action is neither combat nor victory, combat ended (escape/retreat)
      if (inCombat && !result.isCombat && !result.isVictory) audioManager.stopMusic()
      if (result.isLevelUp) audioManager.playLevelUp()
      if (result.loot?.length) audioManager.playItemPickup()
      if (result.isMerchant) audioManager.playGold()
      if (result.worldStateChanges?.currentLocation) audioManager.playDoorOpen()
      if (/cast|spell|magic|enchant|summon/i.test(result.narration || '')) audioManager.playMagic()

      if (result.isCombat && result.enemyName) {
        setInCombat(true)
        setEnemyPopupName(result.enemyName)
        setShowEnemyPopup(true)
      }
      if (result.isVictory) setInCombat(false)

      if ((result.loot && result.loot.length > 0) || (result.characterChanges?.gold && currentCharacter && (result.characterChanges.gold as number) > currentCharacter.gold)) {
        const goldGained = result.characterChanges?.gold !== undefined && currentCharacter
          ? (result.characterChanges.gold as number) - currentCharacter.gold
          : undefined
        setLootItems((result.loot as InventoryItem[]) || [])
        setLootGold(goldGained && goldGained > 0 ? goldGained : undefined)
        setShowLoot(true)
      }

      if (result.isLevelUp && result.characterChanges?.level && currentCharacter) {
        const newLevel = result.characterChanges.level as number
        const newMaxHp = (result.characterChanges as Partial<Character>).max_hp ?? currentCharacter.max_hp
        setLevelUpData({
          level: newLevel,
          hpGained: Math.max(1, newMaxHp - currentCharacter.max_hp),
          newAbility: result.newAbility ?? null,
          characterName: currentCharacter.name,
        })
        setShowLevelUp(true)
      }

      setIsTyping(true)
      addEvent({
        id: `temp-dm-${Date.now()}`,
        campaign_id: campaignId,
        character_id: characterId,
        event_type: 'narration',
        content: result.narration,
        metadata: { diceRoll: result.diceRoll, suggestedActions: result.suggestedActions },
        created_at: new Date().toISOString(),
      })

      if (result.characterChanges) setCharacter({ ...currentCharacter!, ...result.characterChanges } as Character)
      if (result.worldStateChanges) {
        mergeWorldState(result.worldStateChanges)
        if (result.worldStateChanges.currentLocation) audioManager.setLocation(result.worldStateChanges.currentLocation)
      }

      // Scene: try AI prompt match first, then async AI generation
      if (result.sceneImagePrompt) {
        const local = matchSceneImage(result.sceneImagePrompt)
        if (local) setSceneImage(local)
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-${Date.now()}`).then(({ data: img }) => setSceneImage(img.url)).catch(() => {})
      } else if (result.worldStateChanges?.currentLocation) {
        const local = matchSceneImage(result.worldStateChanges.currentLocation)
        if (local) setSceneImage(local)
      }

      if (result.isDeath) {
        setTimeout(() => setShowDeathScreen(true), 1200)
      }
      if (result.isMerchant && result.shopItems && result.shopItems.length > 0) {
        setShopItems(result.shopItems as ShopItem[])
        setTimeout(() => setShowShop(true), 800)
      }
      if (result.advanceAct) {
        setNextAct(prev => prev + 1)
        setTimeout(() => setShowActTransition(true), 600)
      }

      // Epilogue - triggered when endgameResolved fires
      if ((result as ActionResult & { endgameResolved?: boolean }).endgameResolved && campaignId && characterId) {
        const victory = !!result.isVictory
        setTimeout(async () => {
          try {
            const { data } = await gameApi.epilogue(campaignId, characterId, victory)
            setEpilogueData({ text: data.epilogue, victory })
            setShowEpilogue(true)
          } catch { /* show nothing if epilogue gen fails */ }
        }, 3000)
      }

      // High stakes choice overlay
      if (result.isHighStakes && result.choiceCards && result.choiceCards.length > 0) {
        setHighStakesData({ narration: result.narration, choices: result.choiceCards as HighStakesChoiceType[] })
        setShowHighStakes(true)
      }

      refreshParty()
    } catch (err) {
      console.error(err)
      const message = getErrorMessage(err)
      const currentEvents = useGameStore.getState().events
      setEvents(currentEvents.filter(event => event.id !== optimisticActionId))
      setCoopWaiting(false)
      setIsTyping(false)
      addEvent({
        id: `action-error-${clientRequestId}`,
        campaign_id: campaignId,
        character_id: characterId,
        event_type: 'narration',
        content: `The table pauses: ${message}`,
        metadata: { error: true, clientRequestId },
        created_at: new Date().toISOString(),
      })
    }
    finally { setLoading(false) }
  }

  async function handleDevClearCombat() {
    if (!campaignId) return
    try {
      await gameApi.devClearCombat(campaignId)
      setInCombat(false)
      audioManager.stopMusic()
    } catch (err) { console.error('Dev clear combat failed:', err) }
  }

  async function handleDevKill() {
    if (!currentCharacter) return
    if (!confirm(`Kill ${currentCharacter.name}? This is for testing the death flow.`)) return
    try {
      await gameApi.devKill(currentCharacter.id)
      setCharacter({ ...currentCharacter, hp: 0, is_alive: false, death_note: 'Slain by mysterious forces during a dev test.' } as Character)
      setTimeout(() => setShowDeathScreen(true), 500)
    } catch (err) {
      console.error('Dev kill failed:', err)
    }
  }

  // -- Start screen ----------------------------------------------------------
  if (!started) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
        <div className="absolute inset-0">
          <img
            src={DEFAULT_SCENES[0]}
            alt=""
            className="h-full w-full object-cover"
            style={{ opacity: 0.54, filter: 'saturate(1.02) contrast(1.08)' }}
            onError={e => { (e.currentTarget as HTMLImageElement).src = '/media/everrealm-hero-desktop.png' }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.58)_48%,rgba(0,0,0,0.91)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.42)_48%,rgba(0,0,0,0.94)_100%)]" />
        </div>

        <header className="relative z-10 border-b border-parchment-100/22 bg-black/34 px-5 py-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-parchment-100/70 bg-black/28">
                <span className="font-fantasy text-xl text-amber-200">E</span>
              </div>
              <div>
                <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
                <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Living campaign</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="border border-parchment-200/14 bg-black/22 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.2em] text-parchment-200/66 transition-all hover:border-amber-200/45 hover:text-parchment-100"
            >
              Hall
            </button>
          </div>
        </header>

        <main className="relative z-10 mx-auto grid min-h-[calc(100vh-73px)] max-w-[1320px] items-center gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:px-6">
          <section className="max-w-4xl">
            <p className="font-fantasy text-[11px] uppercase tracking-[0.36em] text-amber-200/78">
              {isNewCharacter ? 'First Door' : 'Continue Legend'}
            </p>
            <h1 className="mt-4 font-fantasy text-5xl uppercase leading-[0.95] tracking-[0.08em] text-parchment-100 sm:text-6xl lg:text-7xl">
              Enter the Story
            </h1>
            <p className="mt-5 max-w-2xl font-serif text-lg italic leading-relaxed text-parchment-200/74">
              {recentNarrations.length > 0 && !isNewCharacter
                ? 'The scene is waiting where you left it. Step back through the door and let the next choice matter.'
                : 'The Dungeon Master stands ready. When you step through, the world begins listening.'}
            </p>
          </section>

          <aside className="border border-parchment-100/34 bg-black/62 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <div className="flex items-start gap-4 border-b border-white/10 pb-5">
              {currentCharacter?.portrait_url ? (
                <div className="h-24 w-24 shrink-0 overflow-hidden border border-amber-200/34 bg-black/48">
                  <img src={currentCharacter.portrait_url} alt="" className="h-full w-full object-cover object-top" />
                </div>
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center border border-amber-200/34 bg-black/48">
                  <span className="font-fantasy text-3xl text-amber-200">E</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">Adventurer</p>
                <h2 className="mt-2 truncate font-fantasy text-3xl text-parchment-100">
                  {currentCharacter?.name || 'Unnamed Hero'}
                </h2>
                {currentCharacter && (
                  <p className="mt-1 font-serif text-xs uppercase tracking-[0.18em] text-amber-200/62">
                    {currentCharacter.race} {currentCharacter.class}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="border border-cyan-200/18 bg-cyan-200/[0.045] p-3">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-cyan-200/64">Campaign</p>
                <p className="mt-2 truncate font-serif text-sm text-parchment-100">{campaignName || 'Unknown timeline'}</p>
              </div>
              <div className="border border-amber-200/18 bg-amber-300/[0.045] p-3">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/64">Status</p>
                <p className="mt-2 font-serif text-sm text-parchment-100">{isNewCharacter ? 'Opening scene' : 'Ready to resume'}</p>
              </div>
            </div>

            {recentNarrations.length > 0 && !isNewCharacter && (
              <div className="mt-5 border border-white/10 bg-white/[0.025] p-4">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">Story So Far</p>
                <div className="mt-3 space-y-3">
                  {recentNarrations.slice(-2).map((n, i) => (
                    <p key={i} className="line-clamp-3 font-serif text-sm leading-relaxed text-parchment-200/64">
                      {n.slice(0, 220)}{n.length > 220 ? '...' : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={isLoading || isTyping}
              className="mt-5 w-full border border-amber-300/46 bg-amber-300/12 px-5 py-4 font-fantasy text-xs uppercase tracking-[0.22em] text-amber-100 shadow-[0_0_36px_rgba(245,158,11,0.12)] transition-all hover:border-amber-200 hover:bg-amber-300/18 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading ? <span className="animate-pulse">The World Stirs</span> : 'Enter the Story'}
            </button>
          </aside>
        </main>
      </div>
    )
  }

  const otherPartyMembers = partyMembers.filter(m => m.userId !== user?.id)
  const myLocation = worldState?.characterLocations?.[characterId || ''] || worldState?.currentLocation
  const partyMembersHere = otherPartyMembers.filter(m => {
    if (!m.character) return false
    const theirLocation = worldState?.characterLocations?.[m.character.id]
    return theirLocation && theirLocation === myLocation
  })
  const pendingTurnActions = worldState?.pendingTurn?.actions || []
  const pendingCharacterIds = new Set(pendingTurnActions.map(action => action.characterId))
  const partyRosterHere = [
    currentCharacter ? { name: currentCharacter.name, id: currentCharacter.id, isMe: true } : null,
    ...partyMembersHere.map(member => member.character ? { name: member.character.name, id: member.character.id, isMe: false } : null),
  ].filter(Boolean) as Array<{ name: string; id: string; isMe: boolean }>
  const lockedInNames = partyRosterHere.filter(member => pendingCharacterIds.has(member.id)).map(member => member.isMe ? 'You' : member.name)
  const stillChoosingNames = partyRosterHere.filter(member => !pendingCharacterIds.has(member.id)).map(member => member.isMe ? 'you' : member.name)
  const coopProgressLabel = coopNeededCount > 0
    ? `${coopSubmittedCount}/${coopNeededCount} locked in`
    : lockedInNames.length > 0
      ? `${lockedInNames.length}/${partyRosterHere.length || lockedInNames.length} locked in`
      : ''
  const hpPercent = currentCharacter ? (currentCharacter.hp / currentCharacter.max_hp) * 100 : 100
  const hpColor = hpPercent > 60 ? '#22c55e' : hpPercent > 30 ? '#eab308' : '#ef4444'
  const partyHereNames = [
    currentCharacter?.name,
    ...partyMembersHere.map(member => member.character?.name),
  ].filter(Boolean) as string[]
  const sidebarLabels = { character: 'Character Sheet', quests: 'Quest Log', map: 'Realm Map', world: 'World' } as const
  const sceneArtUrl = visibleSceneArt(currentSceneImage)

  // -- Main game layout ------------------------------------------------------
  return (
    <div className="everrealm-game-shell relative h-screen flex flex-col overflow-hidden bg-[#050607] text-parchment-100">
      <div className="fixed inset-0 pointer-events-none">
        <img
          src={sceneArtUrl}
          alt=""
          className="h-full w-full object-cover opacity-[0.34] blur-[1px] scale-[1.02]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_10%,rgba(20,184,166,0.16),transparent_34%),linear-gradient(90deg,rgba(5,6,7,0.95),rgba(5,6,7,0.68)_48%,rgba(5,6,7,0.95))]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/22 to-[#050607]" />
      </div>

      {/* -- Header -- */}
      <header className="relative z-20 shrink-0 border-b border-white/8 bg-black/58 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4">
        {/* Left: nav + character */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center border border-cyan-200/26 bg-cyan-200/8 shadow-[0_0_28px_rgba(34,211,238,0.16)]">
            <span className="font-fantasy text-xl text-amber-200">E</span>
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
            <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Living campaign</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="ml-0 border border-parchment-200/14 bg-black/22 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.18em] text-parchment-200/58 transition-all duration-200 hover:border-amber-200/45 hover:text-parchment-100 sm:ml-3"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(220,200,160,0.8)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(232,212,168,0.58)' }}
          >
            Hall
          </button>

          {currentCharacter && (
            <div className="flex items-center gap-2.5 min-w-0 border-l border-white/8 pl-3">
              <div className="w-9 h-9 overflow-hidden shrink-0 border border-amber-200/24 bg-black/42">
                <img
                  src={currentCharacter.portrait_url || `/assets/races/${currentCharacter.race.toLowerCase().replace(/['\s]/g, '-')}.png`}
                  alt=""
                  className="w-full h-full object-cover object-top"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <span className="font-fantasy text-sm truncate text-parchment-100">{currentCharacter.name}</span>
              <span className="font-serif text-xs shrink-0 text-amber-200/68">Lv {currentCharacter.level}</span>
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <div className="h-1.5 w-20 overflow-hidden border border-white/10 bg-black/52">
                  <div className="h-full transition-all duration-700" style={{ width: `${hpPercent}%`, background: hpColor, boxShadow: `0 0 5px ${hpColor}70` }} />
                </div>
                <span className="font-serif text-[10px] text-parchment-200/52">{currentCharacter.hp}/{currentCharacter.max_hp}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1 shrink-0">
          <AudioControls />
          {campaignId && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="border border-amber-300/34 bg-amber-300/9 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-amber-100 transition-all duration-200 hover:border-amber-200"
            >
              Invite
            </button>
          )}
          {(['character', 'quests', 'map', 'world'] as const).map(tab => {
            const labels = { character: 'Sheet', quests: 'Quests', map: 'Map', world: 'World' }
            const isActive = showSidebar && sidebarTab === tab
            return (
              <button
                key={tab}
                onClick={() => { setSidebarTab(tab); setShowSidebar(sidebarTab !== tab || !showSidebar) }}
                className={`border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all duration-200 ${
                  isActive
                    ? 'border-cyan-200/50 bg-cyan-200/12 text-cyan-50'
                    : 'border-white/10 bg-white/[0.025] text-parchment-200/62 hover:border-amber-200/34 hover:text-parchment-100'
                }`}
              >
                {labels[tab]}
              </button>
            )
          })}
        </div>
        </div>
      </header>

      {/* Combat banner */}
      {inCombat && (
        <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-red-300/20 bg-red-950/16 px-5 py-2 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 border border-red-200/40 bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.54)]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            <span className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-red-200">
              {worldState?.combatState?.isBossFight ? `Boss - Phase ${worldState.combatState.bossPhase || 1}` : 'Combat'}
            </span>
            {worldState?.combatState?.roundNumber && (
              <span className="border border-red-200/14 bg-black/18 px-2 py-0.5 font-serif text-[10px] uppercase tracking-[0.16em] text-red-100/50">
                Round {worldState.combatState.roundNumber}
              </span>
            )}
          </div>
          <span className="font-serif text-xs italic text-red-100/56">Fight, flee, or find another way</span>
        </div>
      )}

      {/* Status effects strip */}
      {currentCharacter?.status_effects && currentCharacter.status_effects.length > 0 && (
        <div className="relative z-10 flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/8 bg-black/54 px-4 py-2 backdrop-blur-md" style={{ scrollbarWidth: 'none' }}>
          {currentCharacter.status_effects.map((effect, i) => (
            <div
              key={i}
              title={effect.description}
              className="flex shrink-0 items-center gap-1 border px-2 py-1"
              style={{
                background: effect.type === 'buff' ? 'rgba(34,197,94,0.08)' : effect.type === 'debuff' ? 'rgba(239,68,68,0.08)' : 'rgba(200,146,42,0.08)',
                border: `1px solid ${effect.type === 'buff' ? 'rgba(34,197,94,0.25)' : effect.type === 'debuff' ? 'rgba(239,68,68,0.25)' : 'rgba(200,146,42,0.2)'}`,
              }}
            >
              <span style={{ fontSize: 8, color: effect.type === 'buff' ? '#22c55e' : effect.type === 'debuff' ? '#ef4444' : '#c8922a' }}>
                {effect.type === 'buff' ? '+' : effect.type === 'debuff' ? '-' : '*'}
              </span>
              <span className="font-serif" style={{ fontSize: 10, color: effect.type === 'buff' ? 'rgba(34,197,94,0.8)' : effect.type === 'debuff' ? 'rgba(239,68,68,0.75)' : 'rgba(200,146,42,0.75)' }}>
                {effect.name}
              </span>
              {effect.duration != null && (
                <span style={{ fontSize: 9, color: 'rgba(160,140,100,0.4)' }}>{effect.duration}t</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* -- Dev Panel (testing campaigns only) -- */}
      {campaignType === 'testing' && campaignId && currentCharacter && (
        <DevPanel
          campaignId={campaignId}
          character={currentCharacter}
          inCombat={inCombat}
          onKill={handleDevKill}
          onClearCombat={handleDevClearCombat}
          onCharacterUpdate={(updates) => setCharacter({ ...currentCharacter, ...updates } as Character)}
        />
      )}

      {/* -- Main content area -- */}
      <div className="relative z-10 everrealm-game-main mx-auto flex w-full max-w-[1540px] flex-col lg:flex-row flex-1 overflow-hidden gap-4 p-3 sm:p-4 min-h-0">

        {/* -- LEFT: Persistent scene panel -- */}
        <div className="everrealm-scene-column flex flex-col shrink-0 overflow-hidden border border-cyan-200/16 bg-black/42 shadow-[0_24px_120px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <div className="w-full h-[36vh] min-h-[250px] lg:w-[42vw] xl:w-[46vw] lg:max-w-[760px] lg:h-full lg:min-h-0">
            <SceneDisplay
              imageUrl={sceneArtUrl}
              location={worldState?.currentLocation}
              timeOfDay={worldState?.timeOfDay}
              weather={worldState?.weather}
              scenePurpose={worldState?.sceneState?.purpose}
              pacingMode={worldState?.sceneState?.pacingMode}
              sceneSummary={worldState?.currentSceneSummary}
              partyHereNames={partyHereNames}
              inCombat={inCombat}
            />
          </div>

          {/* Party panel below scene */}
          {otherPartyMembers.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <PartyPanel members={partyMembers} currentUserId={user?.id || ''} worldState={worldState} />
            </div>
          )}
        </div>

        {/* -- CENTER: Narrative feed -- */}
        <div className="everrealm-story-column flex-1 flex flex-col overflow-hidden min-h-0 border border-white/10 bg-black/50 shadow-[0_18px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-3" style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.58), rgba(20,184,166,0.06), rgba(0,0,0,0.2))',
          }}>
            <div className="min-w-0">
              <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">
                Dungeon Master
              </p>
              <h1 className="mt-1 font-fantasy text-3xl truncate text-parchment-100">
                {campaignName || 'The Everrealm'}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {worldState?.sceneState?.purpose && (
                <span className="font-serif text-[10px] uppercase px-2 py-1" style={{
                  color: 'rgba(232,212,168,0.72)',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  letterSpacing: '0.1em',
                }}>
                  {worldState.sceneState.purpose.replace(/_/g, ' ')}
                </span>
              )}
              {partyHereNames.length > 1 && (
                <span className="font-serif text-[10px] uppercase px-2 py-1" style={{
                  color: 'rgba(191,244,255,0.7)',
                  background: 'rgba(34,211,238,0.06)',
                  border: '1px solid rgba(34,211,238,0.14)',
                  letterSpacing: '0.1em',
                }}>
                  Party gathered
                </span>
              )}
            </div>
          </div>

          <div ref={narratorRef} className="everrealm-story-feed flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.35) transparent' }}>

              {showDice && lastActionResult?.diceRoll && (
                <div className="px-4">
                  <DiceRoll rolling={showDice} result={lastActionResult.diceRoll.total} modifier={lastActionResult.diceRoll.modifier} label={lastActionResult.diceRoll.description || 'Roll'} />
                </div>
              )}

              {(() => {
                const filtered = normalizeEvents(events.filter(e => !e.character_id || e.character_id === characterId || e.event_type === 'action'))
                return filtered.map((event, i) => {
                  const isLast = i === filtered.length - 1
                  const isInstant = historicalIds.current.has(event.id) || historicalIds.current.has(event.id.replace(/-[an]$/, ''))
                  const isOtherPlayer = event.character_id && event.character_id !== characterId
                  const partyMember = isOtherPlayer ? partyMembers.find(m => m.character?.id === event.character_id) : null
                  const isMyAction = event.event_type === 'action' && event.character_id === characterId
                  const mood = event.event_type === 'narration' ? inferMood(event.content) : 'serious'
                  return (
                    <NarratorBox
                      key={event.id || i}
                      text={event.content}
                      mood={mood}
                      isPlayerAction={event.event_type === 'action'}
                      instant={isInstant}
                      playerName={partyMember?.username}
                      playerPortrait={isMyAction ? currentCharacter?.portrait_url || undefined : partyMember?.character?.portrait_url || undefined}
                      onComplete={isLast && !isInstant ? () => {
                        setIsTyping(false)
                        historicalIds.current.add(event.id)
                      } : undefined}
                    />
                  )
                })
              })()}

              {isLoading && (
                <div className="mx-1 border border-amber-200/24 bg-black/48 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-fantasy text-[10px] uppercase tracking-[0.26em] text-cyan-200/62">Resolving Action</p>
                      <p className="mt-1 font-serif text-sm italic text-parchment-200/72">
                        The Dungeon Master is weighing the scene.
                      </p>
                    </div>
                    <span className="hidden border border-amber-200/24 bg-amber-300/8 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-amber-100/80 sm:block">
                      Weaving
                    </span>
                  </div>
                  <div className="mt-3 h-px overflow-hidden bg-white/10">
                    <div className="h-full w-1/3 animate-pulse bg-[linear-gradient(90deg,rgba(34,211,238,0.2),rgba(245,158,11,0.85),rgba(34,211,238,0.2))]" />
                  </div>
                </div>
              )}
          </div>

          {/* Party Action toggle - only shown when co-op members share same location */}
          {partyMembersHere.length > 0 && (
            <div className="px-4 pt-2 pb-0 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPartyActionMode(p => !p)}
                className="flex items-center gap-1.5 border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all"
                style={partyActionMode
                  ? { border: '1px solid rgba(34,211,238,0.42)', color: 'rgba(191,244,255,0.9)', background: 'rgba(34,211,238,0.08)' }
                  : { border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(232,212,168,0.56)', background: 'rgba(255,255,255,0.025)' }
                }
              >
                <span style={{ fontSize: 10 }}>+</span>
                Coordinate Action
                {partyActionMode && <span style={{ color: 'rgba(200,146,42,0.7)', fontSize: 10 }}>ON</span>}
              </button>
              {partyActionMode && (
                <span className="font-serif text-xs text-parchment-200/54">
                  Locks this round until everyone present acts: {partyMembersHere.map(m => m.character?.name).filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          )}
          {coopWaiting && (
            <div className="flex shrink-0 items-center gap-2 border-t border-amber-200/18 bg-[linear-gradient(90deg,rgba(245,158,11,0.08),rgba(34,211,238,0.05))] px-4 py-2">
              <div className="h-2 w-2 shrink-0 border border-amber-100/40 bg-amber-300" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0">
                <span className="font-fantasy text-[10px] uppercase tracking-[0.18em] text-amber-100/76">
                  {(() => {
                    const holdouts = stillChoosingNames.filter(name => name !== 'you')
                    if (holdouts.length > 0) return `Waiting for ${holdouts.join(' and ')}`
                    if (coopPartnerName) return `Waiting for ${coopPartnerName}`
                    return 'Waiting for your party'
                  })()}
                </span>
                {(coopProgressLabel || stillChoosingNames.length > 0) && (
                  <span className="font-serif text-xs text-parchment-200/54">
                    {coopProgressLabel}{stillChoosingNames.length > 0 ? ` - still choosing: ${stillChoosingNames.join(', ')}` : ''}{coopExpiresAt ? ` - expires ${new Date(coopExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                  </span>
                )}
              </div>
            </div>
          )}
          {inCombat && currentCharacter && (
            <CombatPanel
              combatState={worldState?.combatState}
              abilities={currentCharacter.abilities || []}
              onAction={handleAction}
              disabled={isLoading || isTyping || coopWaiting}
            />
          )}
          <ActionPanel
            suggestedActions={lastActionResult?.suggestedActions || []}
            onAction={handleAction}
            disabled={isLoading || isTyping || currentCharacter?.is_alive === false || coopWaiting}
            disabledReason={coopWaiting ? 'Your action is locked in. Waiting for the party to submit.' : undefined}
            location={worldState?.currentLocation}
            pacingMode={worldState?.sceneState?.pacingMode}
            inCombat={inCombat}
            isCoop={partyMembersHere.length > 0}
          />
        </div>

        {showSidebar && (
          <aside className="fixed bottom-4 right-4 top-[92px] z-40 hidden w-[380px] flex-col overflow-hidden border border-cyan-200/18 bg-black/82 shadow-[0_30px_130px_rgba(0,0,0,0.7)] backdrop-blur-md xl:flex animate-slide-in-right">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/58">Codex</p>
                <h2 className="mt-1 font-fantasy text-2xl text-parchment-100">{sidebarLabels[sidebarTab]}</h2>
              </div>
              <button
                onClick={() => setShowSidebar(false)}
                className="border border-white/10 bg-white/[0.025] px-2.5 py-1 font-fantasy text-[10px] uppercase tracking-[0.14em] text-parchment-200/56 transition-all hover:border-amber-200/38 hover:text-parchment-100"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(180,160,120,0.56)', background: 'rgba(255,255,255,0.03)' }}
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.18) transparent' }}>
              <SidebarErrorBoundary tabName={sidebarTab}>
                {sidebarTab === 'character' && currentCharacter && <CharacterSheet character={currentCharacter} />}
                {sidebarTab === 'quests' && <QuestLog worldState={isNewCharacter ? null : worldState} />}
                {sidebarTab === 'map' && <MapPanel worldState={worldState} />}
                {sidebarTab === 'world' && <WorldPanel worldState={worldState} />}
              </SidebarErrorBoundary>
            </div>
          </aside>
        )}
      </div>

      {showSidebar && (
        <div className="fixed inset-0 z-40 xl:hidden" style={{ background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(6px)' }}>
          <button className="absolute inset-0 cursor-default" aria-label="Close panel" onClick={() => setShowSidebar(false)} />
          <div className="absolute inset-x-2 bottom-2 max-h-[86vh] overflow-hidden border border-cyan-200/18 bg-black/88 backdrop-blur-md animate-slide-up-panel" style={{
            border: '1px solid rgba(34,211,238,0.18)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          }}>
            <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div>
                <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/58">Codex</p>
                <h2 className="mt-1 font-fantasy text-2xl text-parchment-100">{sidebarLabels[sidebarTab]}</h2>
              </div>
              <button
                onClick={() => setShowSidebar(false)}
                className="border border-white/10 bg-white/[0.025] px-2.5 py-1 font-fantasy text-[10px] uppercase tracking-[0.14em] text-parchment-200/56 transition-all hover:border-amber-200/38 hover:text-parchment-100"
              >
                Close
              </button>
            </div>
            <div className="max-h-[74vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.18) transparent' }}>
              <SidebarErrorBoundary tabName={sidebarTab}>
                {sidebarTab === 'character' && currentCharacter && <CharacterSheet character={currentCharacter} />}
                {sidebarTab === 'quests' && <QuestLog worldState={isNewCharacter ? null : worldState} />}
                {sidebarTab === 'map' && <MapPanel worldState={worldState} />}
                {sidebarTab === 'world' && <WorldPanel worldState={worldState} />}
              </SidebarErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      {showLevelUp && levelUpData && (
        <LevelUpScreen level={levelUpData.level} hpGained={levelUpData.hpGained} newAbility={levelUpData.newAbility} characterName={levelUpData.characterName} onContinue={() => setShowLevelUp(false)} />
      )}
      {showEnemyPopup && (
        <EnemyPopup enemyName={enemyPopupName} onDismiss={() => setShowEnemyPopup(false)} />
      )}
      {showLoot && (
        <LootPopup items={lootItems} goldChange={lootGold} onDismiss={() => setShowLoot(false)} />
      )}
      {showInviteModal && campaignId && (
        <InviteModal campaignId={campaignId} campaignName={campaignName} onClose={() => setShowInviteModal(false)} />
      )}
      {showDeathScreen && currentCharacter && (
        <DeathScreen
          characterName={currentCharacter.name}
          deathNote={currentCharacter.death_note}
          campaignId={campaignId!}
          onRiseAgain={() => navigate(`/campaign/${campaignId}/create-character`)}
          onReturnToHall={() => navigate('/dashboard')}
        />
      )}
      {showShop && shopItems.length > 0 && currentCharacter && (
        <ShopModal
          shopItems={shopItems}
          playerGold={currentCharacter.gold}
          playerInventory={currentCharacter.inventory}
          onBuy={async (item) => {
            try {
              const res = await characterApi.purchase(currentCharacter.id, item, campaignId!)
              setCharacter(res.data.character)
            } catch (e: unknown) {
              const err = e as { response?: { data?: { error?: string } } }
              alert(err?.response?.data?.error || 'Purchase failed')
            }
          }}
          onSell={async (item) => {
            const sellPrice = Math.floor((item.value || 0) / 2)
            try {
              const res = await characterApi.sell(currentCharacter.id, item.name, sellPrice)
              setCharacter(res.data.character)
            } catch (e: unknown) {
              const err = e as { response?: { data?: { error?: string } } }
              alert(err?.response?.data?.error || 'Sale failed')
            }
          }}
          onClose={() => setShowShop(false)}
        />
      )}
      {showActTransition && (
        <ActTransition actNumber={nextAct} onComplete={() => setShowActTransition(false)} />
      )}
      {showDiceModal && diceModalData && currentCharacter && (
        <DiceRollModal
          narration={diceModalData.narration}
          rollContext={diceModalData.rollContext}
          onRoll={handleRollComplete}
          onContinue={() => {
            setShowDiceModal(false)
            setDiceModalData(null)
          }}
        />
      )}
      {showHighStakes && highStakesData && (
        <HighStakesChoice
          narration={highStakesData.narration}
          choices={highStakesData.choices}
          onChoose={(choiceTitle) => {
            setShowHighStakes(false)
            setHighStakesData(null)
            handleAction(choiceTitle)
          }}
          onCustom={() => {
            setShowHighStakes(false)
            setHighStakesData(null)
          }}
        />
      )}
      {showEpilogue && epilogueData && currentCharacter && (
        <EpilogueScreen
          epilogue={epilogueData.text}
          characterName={currentCharacter.name}
          victory={epilogueData.victory}
          onClose={() => navigate('/dashboard')}
        />
      )}
    </div>
  )
}
