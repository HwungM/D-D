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
import DeathScreen from '../components/DeathScreen'
import CombatPanel from '../components/CombatPanel'
import EpilogueScreen from '../components/EpilogueScreen'
import ShopModal from '../components/ShopModal'
import ActTransition from '../components/ActTransition'
import JournalTab from '../components/JournalTab'
import HighStakesChoice from '../components/HighStakesChoice'
import SidebarErrorBoundary from '../components/SidebarErrorBoundary'
import DiceRollModal from '../components/DiceRollModal'
import DevPanel from '../components/DevPanel'
import { audioManager } from '../lib/audio'
import type { Ability, Character, StoryEvent, ActionResult, InventoryItem, PartyMember, ShopItem, HighStakesChoice as HighStakesChoiceType, RollContext } from '../../../shared/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const DEFAULT_SCENES = [
  '/assets/scenes/tavern.png',
  '/assets/scenes/forest-road.png',
  '/assets/scenes/dungeon-corridor.png',
  '/assets/scenes/castle-gate.png',
  '/assets/scenes/ancient-ruins.png',
]

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
  const [sidebarTab, setSidebarTab] = useState<'character' | 'quests' | 'world' | 'journal'>('character')
  const narratorRef = useRef<HTMLDivElement>(null)
  const historicalIds = useRef<Set<string>>(new Set())
  const coopWaitingRef = useRef(false)


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
          if (submitted) {
            setCoopWaiting(true)
            setLoading(false)
          }
        } else {
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
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#060a0f' }}>
        <div className="absolute inset-0" style={{ backgroundImage: `url(${DEFAULT_SCENES[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.12, filter: 'blur(3px)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(180,80,30,0.08) 0%, #060a0f 65%)' }} />
        <div className="relative z-10 text-center max-w-lg px-8">
          {currentCharacter?.portrait_url ? (
            <div className="w-28 h-28 mx-auto mb-6 rounded-full overflow-hidden border-2" style={{ borderColor: 'rgba(192,57,43,0.5)', boxShadow: '0 0 50px rgba(192,57,43,0.3)' }}>
              <img src={currentCharacter.portrait_url} alt="" className="w-full h-full object-cover object-top" />
            </div>
          ) : (
            <div className="w-28 h-28 mx-auto mb-6 rounded-full border-2 border-ember-400/40 flex items-center justify-center" style={{ boxShadow: '0 0 50px rgba(192,57,43,0.3)' }}>
              <span className="font-fantasy text-4xl text-ember-400">+</span>
            </div>
          )}
          <h2 className="font-fantasy text-5xl text-parchment-200 mb-2" style={{ textShadow: '0 0 40px rgba(192,57,43,0.3)' }}>Your Adventure Awaits</h2>
          {currentCharacter && (
            <p className="font-serif text-sm uppercase tracking-widest mb-4" style={{ color: 'rgba(200,146,42,0.6)', letterSpacing: '0.15em' }}>
              {currentCharacter.name} - {currentCharacter.race} {currentCharacter.class}
            </p>
          )}
          {campaignName && (
            <p className="font-serif text-sm italic mb-8" style={{ color: 'rgba(180,160,120,0.5)' }}>{campaignName}</p>
          )}
          {recentNarrations.length > 0 && !isNewCharacter ? (
            <div className="mb-10 text-left" style={{ border: '1px solid rgba(200,146,42,0.12)', background: 'rgba(200,146,42,0.03)', padding: '16px 20px' }}>
              <p className="text-xs uppercase tracking-widest mb-3 text-center" style={{ color: 'rgba(200,146,42,0.4)', letterSpacing: '0.2em' }}>
                The story so far...
              </p>
              <div className="space-y-2">
                {recentNarrations.slice(-3).map((n, i) => (
                  <p key={i} className="font-serif text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(160,140,110,0.65)' }}>
                    {n.slice(0, 180)}{n.length > 180 ? '...' : ''}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="font-serif italic mb-10 leading-relaxed text-sm" style={{ color: 'rgba(160,140,110,0.7)' }}>
              The Dungeon Master stands ready. When you step through, there is no turning back.
            </p>
          )}
          <button
            onClick={handleStart}
            disabled={isLoading || isTyping}
            className="font-serif text-base px-14 py-3.5 transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(192,57,43,0.25), rgba(140,30,20,0.4))',
              border: '1px solid rgba(192,57,43,0.45)',
              color: '#e8b09a',
              letterSpacing: '0.08em',
              boxShadow: '0 0 30px rgba(192,57,43,0.15)',
            }}
          >
            {isLoading ? <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>The world stirs...</span> : 'Enter the Story'}
          </button>
        </div>
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
  const sidebarLabels = { character: 'Character Sheet', quests: 'Quest Log', world: 'World', journal: 'Journal' } as const

  // -- Main game layout ------------------------------------------------------
  return (
    <div className="everrealm-game-shell h-screen flex flex-col overflow-hidden" style={{ background: '#06080d', color: '#d4c5a0' }}>

      {/* -- Header -- */}
      <header className="everrealm-game-header shrink-0 flex items-center justify-between px-3 sm:px-4 py-2.5 gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' as const,
        background: 'linear-gradient(90deg, rgba(6,8,13,0.97), rgba(13,18,28,0.96), rgba(6,8,13,0.97))',
        borderBottom: '1px solid rgba(200,146,42,0.16)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(14px)',
        zIndex: 30,
      }}>
        {/* Left: nav + character */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="font-serif text-xs shrink-0 transition-colors"
            style={{ color: 'rgba(180,160,120,0.4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(220,200,160,0.8)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(180,160,120,0.4)' }}
          >
            Back to Hall
          </button>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

          {currentCharacter && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0" style={{ border: '1px solid rgba(200,146,42,0.3)' }}>
                <img
                  src={currentCharacter.portrait_url || `/assets/races/${currentCharacter.race.toLowerCase().replace(/['\s]/g, '-')}.png`}
                  alt=""
                  className="w-full h-full object-cover object-top"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <span className="font-serif text-sm truncate" style={{ color: '#d4c5a0' }}>{currentCharacter.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>-</span>
              <span className="font-serif text-xs shrink-0" style={{ color: 'rgba(200,146,42,0.8)' }}>Lv {currentCharacter.level}</span>
              <span style={{ color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>-</span>
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${hpPercent}%`, background: hpColor, boxShadow: `0 0 5px ${hpColor}70` }} />
                </div>
                <span className="font-mono text-xs" style={{ color: 'rgba(160,140,110,0.45)', fontSize: '10px' }}>{currentCharacter.hp}/{currentCharacter.max_hp}</span>
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
              className="font-serif text-xs px-2.5 py-1 transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(180,160,120,0.4)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.3)'; (e.currentTarget as HTMLElement).style.color = 'rgba(200,146,42,0.8)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(180,160,120,0.4)' }}
            >
              + Invite
            </button>
          )}
          {(['character', 'quests', 'world', 'journal'] as const).map(tab => {
            const labels = { character: 'Sheet', quests: 'Quests', world: 'World', journal: 'Journal' }
            const isActive = showSidebar && sidebarTab === tab
            return (
              <button
                key={tab}
                onClick={() => { setSidebarTab(tab); setShowSidebar(sidebarTab !== tab || !showSidebar) }}
                className="font-serif text-xs px-2.5 py-1 transition-all"
                style={isActive
                  ? { border: '1px solid rgba(34,211,238,0.36)', color: '#bff4ff', background: 'rgba(34,211,238,0.08)' }
                  : { border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(180,160,120,0.45)' }
                }
              >
                {labels[tab]}
              </button>
            )
          })}
        </div>
      </header>

      {/* Combat banner */}
      {inCombat && (
        <div className="shrink-0 flex items-center justify-between px-5 py-1.5" style={{
          background: 'linear-gradient(90deg, rgba(127,10,10,0), rgba(200,20,20,0.18), rgba(127,10,10,0))',
          borderBottom: '1px solid rgba(220,38,38,0.2)',
        }}>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f87171', boxShadow: '0 0 8px #f87171', animation: 'pulse 1s ease-in-out infinite' }} />
            <span className="font-sans text-xs uppercase tracking-widest" style={{ color: '#f87171', letterSpacing: '0.2em' }}>
              {worldState?.combatState?.isBossFight ? `Boss - Phase ${worldState.combatState.bossPhase || 1}` : 'Combat'}
            </span>
            {worldState?.combatState?.roundNumber && (
              <span className="font-mono text-xs" style={{ color: 'rgba(220,100,100,0.4)', fontSize: 10 }}>
                Round {worldState.combatState.roundNumber}
              </span>
            )}
          </div>
          <span className="font-serif text-xs italic" style={{ color: 'rgba(220,100,100,0.45)' }}>Fight, flee, or find another way</span>
        </div>
      )}

      {/* Status effects strip */}
      {currentCharacter?.status_effects && currentCharacter.status_effects.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1 overflow-x-auto" style={{
          background: 'rgba(6,8,13,0.85)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          scrollbarWidth: 'none',
        }}>
          {currentCharacter.status_effects.map((effect, i) => (
            <div
              key={i}
              title={effect.description}
              className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full"
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
      <div className="everrealm-game-main flex flex-col lg:flex-row flex-1 overflow-hidden gap-0 lg:gap-3 lg:p-3 min-h-0">

        {/* -- LEFT: Persistent scene panel -- */}
        <div className="everrealm-scene-column flex flex-col shrink-0 overflow-hidden lg:rounded-md" style={{
          border: '1px solid rgba(200,146,42,0.12)',
          background: 'rgba(255,255,255,0.025)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.32)',
        }}>
          <div className="w-full h-[34vh] min-h-[230px] lg:w-[42vw] xl:w-[46vw] lg:max-w-[760px] lg:h-full lg:min-h-0">
            <SceneDisplay
              imageUrl={currentSceneImage}
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
        <div className="everrealm-story-column flex-1 flex flex-col overflow-hidden min-h-0 lg:rounded-md" style={{
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'linear-gradient(180deg, rgba(13,18,28,0.92), rgba(6,8,13,0.98))',
          boxShadow: '0 20px 70px rgba(0,0,0,0.24)',
        }}>
          <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-3" style={{
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'linear-gradient(90deg, rgba(200,146,42,0.06), rgba(34,211,238,0.035), transparent)',
          }}>
            <div className="min-w-0">
              <p className="font-serif text-[11px] uppercase" style={{ color: 'rgba(34,211,238,0.68)', letterSpacing: '0.16em' }}>
                Dungeon Master
              </p>
              <h1 className="font-fantasy text-base truncate" style={{ color: '#f2dfb6' }}>
                {campaignName || 'The Everrealm'}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {worldState?.sceneState?.purpose && (
                <span className="font-serif text-[10px] uppercase px-2 py-1" style={{
                  color: 'rgba(232,212,168,0.72)',
                  background: 'rgba(200,146,42,0.06)',
                  border: '1px solid rgba(200,146,42,0.14)',
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

          <div ref={narratorRef} className="everrealm-story-feed flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.18) transparent' }}>

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
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border" style={{ borderColor: 'rgba(192,57,43,0.3)' }}>
                    <img src="/assets/dm/dm-neutral.png" alt="DM" className="w-full h-full object-cover opacity-50" />
                  </div>
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map(j => (
                      <div key={j} className="w-2 h-2 rounded-full" style={{ background: 'rgba(192,57,43,0.5)', animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Party Action toggle - only shown when co-op members share same location */}
          {partyMembersHere.length > 0 && (
            <div className="px-4 pt-2 pb-0 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPartyActionMode(p => !p)}
                className="flex items-center gap-1.5 font-serif text-xs px-2.5 py-1.5 rounded-sm transition-all"
                style={partyActionMode
                  ? { border: '1px solid rgba(34,211,238,0.42)', color: 'rgba(191,244,255,0.9)', background: 'rgba(34,211,238,0.08)' }
                  : { border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(180,160,120,0.4)' }
                }
              >
                <span style={{ fontSize: 10 }}>+</span>
                Coordinate Action
                {partyActionMode && <span style={{ color: 'rgba(200,146,42,0.7)', fontSize: 10 }}>ON</span>}
              </button>
              {partyActionMode && (
                <span className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.4)' }}>
                  Locks this round until everyone present acts: {partyMembersHere.map(m => m.character?.name).filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          )}
          {coopWaiting && (
            <div className="px-4 py-2 flex items-center gap-2 shrink-0" style={{
              background: 'linear-gradient(90deg, rgba(200,146,42,0.07), rgba(34,211,238,0.04))',
              borderTop: '1px solid rgba(200,146,42,0.15)',
            }}>
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#c8922a', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0">
                <span className="font-serif text-xs" style={{ color: 'rgba(200,146,42,0.78)' }}>
                  {coopPartnerName ? `Waiting for ${coopPartnerName}` : 'Waiting for your party'}
                </span>
                {(coopProgressLabel || stillChoosingNames.length > 0) && (
                  <span className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.48)' }}>
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
          <aside className="hidden xl:flex w-[360px] shrink-0 flex-col overflow-hidden rounded-md animate-slide-in-right" style={{
            border: '1px solid rgba(34,211,238,0.14)',
            background: 'linear-gradient(180deg, rgba(13,18,28,0.98), rgba(6,8,13,0.98))',
            boxShadow: '0 24px 80px rgba(0,0,0,0.34)',
          }}>
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <p className="font-serif text-[10px] uppercase" style={{ color: 'rgba(34,211,238,0.58)', letterSpacing: '0.16em' }}>Codex</p>
                <h2 className="font-fantasy text-base" style={{ color: '#f2dfb6' }}>{sidebarLabels[sidebarTab]}</h2>
              </div>
              <button
                onClick={() => setShowSidebar(false)}
                className="font-serif text-xs px-2.5 py-1 rounded-sm transition-all"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(180,160,120,0.56)', background: 'rgba(255,255,255,0.03)' }}
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.18) transparent' }}>
              <SidebarErrorBoundary tabName={sidebarTab}>
                {sidebarTab === 'character' && currentCharacter && <CharacterSheet character={currentCharacter} />}
                {sidebarTab === 'quests' && <QuestLog worldState={isNewCharacter ? null : worldState} />}
                {sidebarTab === 'world' && <WorldPanel worldState={worldState} />}
                {sidebarTab === 'journal' && <JournalTab events={events} characterId={characterId} />}
              </SidebarErrorBoundary>
            </div>
          </aside>
        )}
      </div>

      {showSidebar && (
        <div className="fixed inset-0 z-40 xl:hidden" style={{ background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(6px)' }}>
          <button className="absolute inset-0 cursor-default" aria-label="Close panel" onClick={() => setShowSidebar(false)} />
          <div className="absolute inset-x-2 bottom-2 max-h-[86vh] overflow-hidden rounded-md animate-slide-up-panel" style={{
            border: '1px solid rgba(34,211,238,0.18)',
            background: 'linear-gradient(180deg, rgba(13,18,28,0.99), rgba(6,8,13,0.99))',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <h2 className="font-fantasy text-base" style={{ color: '#f2dfb6' }}>{sidebarLabels[sidebarTab]}</h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="font-serif text-xs px-3 py-1.5 rounded-sm"
                style={{ border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(180,160,120,0.7)', background: 'rgba(255,255,255,0.04)' }}
              >
                Close
              </button>
            </div>
            <div className="max-h-[74vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.18) transparent' }}>
              <SidebarErrorBoundary tabName={sidebarTab}>
                {sidebarTab === 'character' && currentCharacter && <CharacterSheet character={currentCharacter} />}
                {sidebarTab === 'quests' && <QuestLog worldState={isNewCharacter ? null : worldState} />}
                {sidebarTab === 'world' && <WorldPanel worldState={worldState} />}
                {sidebarTab === 'journal' && <JournalTab events={events} characterId={characterId} />}
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
