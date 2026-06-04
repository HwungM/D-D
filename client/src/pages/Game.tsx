import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { gameApi, assetApi, campaignApi } from '../lib/api'
import { useGameStore, useAuthStore } from '../lib/store'
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
import { audioManager } from '../lib/audio'
import type { Ability, Character, StoryEvent, ActionResult, InventoryItem, PartyMember } from '../../../shared/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

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

const DEFAULT_SCENES = [
  '/assets/scenes/tavern.png',
  '/assets/scenes/forest-road.png',
  '/assets/scenes/dungeon-corridor.png',
  '/assets/scenes/castle-gate.png',
  '/assets/scenes/ancient-ruins.png',
]

export default function Game() {
  const { campaignId, characterId } = useParams<{ campaignId: string; characterId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    currentCharacter, setCharacter, setLastActionResult, lastActionResult,
    isLoading, setLoading, currentSceneImage, setSceneImage, events, setEvents, addEvent,
  } = useGameStore()

  const [started, setStarted] = useState(false)
  const [showDice, setShowDice] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const narratorRef = useRef<HTMLDivElement>(null)
  const historicalIds = useRef<Set<string>>(new Set())

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

  useEffect(() => {
    audioManager.startAmbient()
    document.addEventListener('click', () => audioManager.startAmbient(), { once: true })
  }, [])

  const refreshParty = useCallback(() => {
    if (!campaignId) return
    campaignApi.getParty(campaignId).then(({ data }) => {
      setPartyMembers(data.members || [])
    }).catch(() => {})
  }, [campaignId])

  useEffect(() => {
    if (!campaignId || !characterId) return
    gameApi.getScene(campaignId, characterId).then(({ data }) => {
      if (data.character) setCharacter(data.character as Character)
      if (!currentSceneImage) setSceneImage(DEFAULT_SCENES[Math.floor(Math.random() * DEFAULT_SCENES.length)])
    })
    gameApi.getHistory(campaignId, characterId, 50, true).then(({ data }) => {
      const loaded: StoryEvent[] = data.events || []
      historicalIds.current = new Set(loaded.map(e => e.id))
      setEvents(loaded)
      if (loaded.length > 0) setStarted(true)
    })
    campaignApi.get(campaignId).then(({ data }) => {
      setCampaignName(data.campaign.name)
    }).catch(() => {})
    refreshParty()
  }, [campaignId, characterId])

  // Supabase Realtime
  useEffect(() => {
    if (!campaignId || !supabaseUrl || !supabaseAnonKey) return

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const channel = supabase
      .channel(`campaign:${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'story_events', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const newEvent = payload.new as StoryEvent
          if (newEvent.character_id && newEvent.character_id !== characterId) {
            addEvent(newEvent)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'characters', filter: `campaign_id=eq.${campaignId}` },
        () => { refreshParty() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [campaignId, characterId, addEvent, refreshParty])

  useEffect(() => {
    if (narratorRef.current) narratorRef.current.scrollTop = narratorRef.current.scrollHeight
  }, [events])

  async function handleStart() {
    if (!campaignId || !characterId) return
    setLoading(true)
    try {
      const { data } = await gameApi.start(characterId, campaignId)
      const result = data as ActionResult
      setLastActionResult(result)
      setStarted(true)
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
      if (result.sceneImagePrompt) {
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-start`).then(({ data: img }) => setSceneImage(img.url)).catch(() => {})
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleAction(action: string) {
    if (!campaignId || !characterId || isLoading) return
    setLoading(true)
    setShowDice(false)
    addEvent({
      id: `temp-${Date.now()}`,
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'action',
      content: action,
      metadata: {},
      created_at: new Date().toISOString(),
    })
    try {
      const { data } = await gameApi.action(characterId, campaignId, action)
      const result = data as ActionResult
      setLastActionResult(result)

      if (result.diceRoll) setShowDice(true)
      if (result.isCombat) audioManager.playCombat()
      if (result.isVictory) audioManager.playVictory()
      if (result.isLevelUp) audioManager.playLevelUp()
      if (result.loot?.length) audioManager.playItemPickup()

      if (result.isCombat && result.enemyName) {
        setInCombat(true)
        setEnemyPopupName(result.enemyName)
        setShowEnemyPopup(true)
      }
      if (result.isVictory) setInCombat(false)

      if ((result.loot && result.loot.length > 0) || (result.characterChanges?.gold && currentCharacter && result.characterChanges.gold > currentCharacter.gold)) {
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
      if (result.sceneImagePrompt) {
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-${Date.now()}`).then(({ data: img }) => setSceneImage(img.url)).catch(() => {})
      }
      if (result.isDeath) setTimeout(() => navigate('/dashboard'), 5000)
      refreshParty()
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#060a0f' }}>
        <div className="absolute inset-0" style={{ backgroundImage: `url(${DEFAULT_SCENES[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.12, filter: 'blur(3px)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(180,80,30,0.08) 0%, #060a0f 65%)' }} />
        <div className="relative z-10 text-center max-w-lg px-8">
          {currentCharacter?.portrait_url ? (
            <div className="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden border-2" style={{ borderColor: 'rgba(192,57,43,0.5)', boxShadow: '0 0 40px rgba(192,57,43,0.3)' }}>
              <img src={currentCharacter.portrait_url} alt="" className="w-full h-full object-cover object-top" />
            </div>
          ) : (
            <div className="w-24 h-24 mx-auto mb-6 rounded-full border-2 border-ember-400/40 flex items-center justify-center" style={{ animation: 'torchFlicker 2s ease-in-out infinite', boxShadow: '0 0 40px rgba(192,57,43,0.3)' }}>
              <span className="font-fantasy text-3xl text-ember-400">⚔</span>
            </div>
          )}
          <h2 className="font-fantasy text-4xl text-parchment-200 mb-2" style={{ textShadow: '0 0 40px rgba(192,57,43,0.3)' }}>Your Adventure Awaits</h2>
          {currentCharacter && (
            <p className="font-serif text-sm uppercase tracking-widest mb-6" style={{ color: 'rgba(200,146,42,0.6)', letterSpacing: '0.15em' }}>
              {currentCharacter.name} · {currentCharacter.race} {currentCharacter.class}
            </p>
          )}
          {campaignName && (
            <p className="font-serif text-sm italic mb-8" style={{ color: 'rgba(180,160,120,0.5)' }}>{campaignName}</p>
          )}
          <p className="font-serif italic mb-10 leading-relaxed text-sm" style={{ color: 'rgba(160,140,110,0.7)' }}>The Dungeon Master stands ready. When you step through, there is no turning back.</p>
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="font-serif text-base px-12 py-3 transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(192,57,43,0.25), rgba(140,30,20,0.35))',
              border: '1px solid rgba(192,57,43,0.45)',
              color: '#e8b09a',
              letterSpacing: '0.08em',
            }}
          >
            {isLoading ? <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>The world stirs...</span> : 'Enter the Story'}
          </button>
        </div>
      </div>
    )
  }

  const otherPartyMembers = partyMembers.filter(m => m.userId !== user?.id)
  const hpPercent = currentCharacter ? (currentCharacter.hp / currentCharacter.max_hp) * 100 : 100
  const hpColor = hpPercent > 60 ? '#22c55e' : hpPercent > 30 ? '#eab308' : '#ef4444'

  return (
    <div className="h-screen text-parchment-100 flex flex-col overflow-hidden" style={{ background: '#08090e' }}>
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5" style={{
        background: 'rgba(8,9,14,0.97)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="font-serif text-xs transition-colors px-2 py-1"
            style={{ color: 'rgba(180,160,120,0.45)' }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = 'rgba(220,200,160,0.8)'}
            onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(180,160,120,0.45)'}
          >
            ← Hall
          </button>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
          {currentCharacter && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0" style={{ border: '1px solid rgba(200,146,42,0.3)' }}>
                <img
                  src={currentCharacter.portrait_url || `/assets/races/${currentCharacter.race.toLowerCase().replace(/['\s]/g, '-')}.png`}
                  alt=""
                  className="w-full h-full object-cover object-top"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-sm" style={{ color: '#d4c5a0' }}>{currentCharacter.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                <span className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.5)' }}>{currentCharacter.race} {currentCharacter.class}</span>
                <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                <span className="font-serif text-xs" style={{ color: 'rgba(200,146,42,0.8)' }}>Lv {currentCharacter.level}</span>
              </div>
              <div className="flex items-center gap-1.5 ml-1">
                <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${hpPercent}%`, background: hpColor, boxShadow: `0 0 6px ${hpColor}80` }} />
                </div>
                <span className="font-mono text-xs" style={{ color: 'rgba(160,140,110,0.5)', fontSize: '10px' }}>{currentCharacter.hp}/{currentCharacter.max_hp}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AudioControls />
          {campaignId && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="font-serif text-xs px-2.5 py-1 transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(180,160,120,0.5)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.3)'; (e.currentTarget as HTMLElement).style.color = 'rgba(200,146,42,0.8)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(180,160,120,0.5)' }}
            >
              + Invite
            </button>
          )}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="font-serif text-xs px-2.5 py-1 transition-all"
            style={showSidebar
              ? { border: '1px solid rgba(192,57,43,0.4)', color: 'rgba(232,176,154,0.9)', background: 'rgba(192,57,43,0.08)' }
              : { border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(180,160,120,0.5)' }
            }
          >
            {showSidebar ? 'Hide Sheet' : 'Sheet'}
          </button>
        </div>
      </header>

      {otherPartyMembers.length > 0 && (
        <PartyPanel members={partyMembers} currentUserId={user?.id || ''} />
      )}

      {inCombat && (
        <div className="shrink-0 flex items-center justify-between px-5 py-1" style={{
          background: 'linear-gradient(90deg, rgba(127,10,10,0.0), rgba(200,20,20,0.15), rgba(127,10,10,0.0))',
          borderBottom: '1px solid rgba(220,38,38,0.25)',
        }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f87171', boxShadow: '0 0 6px #f87171', animation: 'pulse 1s ease-in-out infinite' }} />
            <span className="font-sans text-xs uppercase tracking-widest" style={{ color: '#f87171', letterSpacing: '0.2em' }}>Combat</span>
          </div>
          <span className="font-serif text-xs italic" style={{ color: 'rgba(220,100,100,0.5)' }}>Fight, flee, or find another way</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Scene image — taller and more cinematic */}
          <div className="shrink-0 relative" style={{ height: '220px' }}>
            <SceneDisplay imageUrl={currentSceneImage} />
            {/* Bottom gradient to blend into content */}
            <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none" style={{
              background: 'linear-gradient(to top, #08090e, transparent)',
            }} />
          </div>

          {showDice && lastActionResult?.diceRoll && (
            <DiceRoll rolling={showDice} result={lastActionResult.diceRoll.total} modifier={lastActionResult.diceRoll.modifier} label={lastActionResult.diceRoll.description || 'Roll'} />
          )}

          <div ref={narratorRef} className="flex-1 overflow-y-auto py-3 space-y-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
            {normalizeEvents(events).map((event, i) => {
              const isOtherPlayer = event.character_id && event.character_id !== characterId
              const partyMember = isOtherPlayer ? partyMembers.find(m => m.character?.id === event.character_id) : null
              const isMyAction = event.event_type === 'action' && event.character_id === characterId
              return (
                <NarratorBox
                  key={event.id || i}
                  text={event.content}
                  mood={event.event_type === 'narration' ? 'neutral' : 'serious'}
                  isPlayerAction={event.event_type === 'action'}
                  instant={historicalIds.current.has(event.id) || historicalIds.current.has(event.id.replace(/-[an]$/, ''))}
                  playerName={partyMember?.username}
                  playerPortrait={isMyAction ? currentCharacter?.portrait_url || undefined : partyMember?.character?.portrait_url || undefined}
                />
              )
            })}
            {isLoading && (
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border" style={{ borderColor: 'rgba(192,57,43,0.3)' }}>
                  <img src="/assets/dm/dm-neutral.png" alt="DM" className="w-full h-full object-cover opacity-40" />
                </div>
                <div className="flex gap-1.5 items-center">
                  {[0, 1, 2].map(j => (
                    <div key={j} className="w-2 h-2 rounded-full" style={{ background: 'rgba(192,57,43,0.5)', animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <ActionPanel suggestedActions={lastActionResult?.suggestedActions || []} onAction={handleAction} disabled={isLoading || currentCharacter?.is_alive === false} />
        </div>

        {showSidebar && currentCharacter && (
          <aside className="w-72 shrink-0 overflow-y-auto" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#0a0b10' }}>
            <CharacterSheet character={currentCharacter} />
          </aside>
        )}
      </div>

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
    </div>
  )
}
