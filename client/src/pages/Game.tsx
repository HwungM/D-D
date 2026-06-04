import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { gameApi, assetApi } from '../lib/api'
import { useGameStore } from '../lib/store'
import SceneDisplay from '../components/SceneDisplay'
import ActionPanel from '../components/ActionPanel'
import CharacterSheet from '../components/CharacterSheet'
import NarratorBox from '../components/NarratorBox'
import DiceRoll from '../components/DiceRoll'
import AudioControls from '../components/AudioControls'
import LevelUpScreen from '../components/LevelUpScreen'
import EnemyPopup from '../components/EnemyPopup'
import { audioManager } from '../lib/audio'
import type { Ability, Character, StoryEvent, ActionResult } from '../../../shared/types'

// Handle old DB format: "ACTION: ...\nNARRATION: ..." stored as single event
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
      if (narration) {
        result.push({ ...ev, id: `${ev.id}-n`, event_type: 'narration', content: narration })
      }
    } else {
      // Skip bare opening placeholders
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
  const {
    currentCharacter, setCharacter, setLastActionResult, lastActionResult,
    isLoading, setLoading, currentSceneImage, setSceneImage, events, setEvents, addEvent,
  } = useGameStore()

  const [started, setStarted] = useState(false)
  const [showDice, setShowDice] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const narratorRef = useRef<HTMLDivElement>(null)
  // Track IDs from history load — these display instantly, no animation
  const historicalIds = useRef<Set<string>>(new Set())

  // Level up overlay
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [levelUpData, setLevelUpData] = useState<{ level: number; hpGained: number; newAbility: Ability | null; characterName: string } | null>(null)

  // Enemy encounter popup
  const [showEnemyPopup, setShowEnemyPopup] = useState(false)
  const [enemyPopupName, setEnemyPopupName] = useState('')

  // Combat mode
  const [inCombat, setInCombat] = useState(false)

  useEffect(() => {
    audioManager.startAmbient()
    document.addEventListener('click', () => audioManager.startAmbient(), { once: true })
  }, [])

  useEffect(() => {
    if (!campaignId || !characterId) return

    gameApi.getScene(campaignId, characterId).then(({ data }) => {
      if (data.character) setCharacter(data.character as Character)
      if (!currentSceneImage) {
        setSceneImage(DEFAULT_SCENES[Math.floor(Math.random() * DEFAULT_SCENES.length)])
      }
    })

    gameApi.getHistory(campaignId, characterId, 50).then(({ data }) => {
      const loaded: StoryEvent[] = data.events || []
      historicalIds.current = new Set(loaded.map(e => e.id))
      setEvents(loaded)
      if (loaded.length > 0) setStarted(true)
    })
  }, [campaignId, characterId])

  useEffect(() => {
    if (narratorRef.current) {
      narratorRef.current.scrollTop = narratorRef.current.scrollHeight
    }
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
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-start`).then(({ data: img }) => {
          setSceneImage(img.url)
        }).catch(() => {})
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
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

      // Combat state tracking
      if (result.isCombat && result.enemyName) {
        setInCombat(true)
        setEnemyPopupName(result.enemyName)
        setShowEnemyPopup(true)
      }
      if (result.isVictory) {
        setInCombat(false)
      }

      // Level up overlay
      if (result.isLevelUp && result.characterChanges?.level && currentCharacter) {
        const newLevel = result.characterChanges.level as number
        const oldMaxHp = currentCharacter.max_hp
        const newMaxHp = (result.characterChanges as Partial<Character>).max_hp ?? oldMaxHp
        const hpGained = newMaxHp - oldMaxHp
        setLevelUpData({
          level: newLevel,
          hpGained: hpGained > 0 ? hpGained : 1,
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

      if (result.characterChanges) {
        setCharacter({ ...currentCharacter!, ...result.characterChanges } as Character)
      }

      if (result.sceneImagePrompt) {
        assetApi.generate(result.sceneImagePrompt, `scene-${campaignId}-${Date.now()}`).then(({ data: img }) => {
          setSceneImage(img.url)
        }).catch(() => {})
      }

      if (result.isDeath) {
        setTimeout(() => navigate('/dashboard'), 5000)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{
        background: 'radial-gradient(ellipse at center, #0f1923 0%, #070d14 100%)',
      }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `url(${DEFAULT_SCENES[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15, filter: 'blur(2px)' }}
        />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center, transparent 20%, rgba(7,13,20,0.9) 100%)',
        }} />
        <div className="relative z-10 text-center max-w-lg px-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-ember-400/50 flex items-center justify-center" style={{
            animation: 'torchFlicker 2s ease-in-out infinite',
            boxShadow: '0 0 40px rgba(192,57,43,0.4)',
          }}>
            <span className="font-fantasy text-3xl text-ember-400">⚔</span>
          </div>
          <h2 className="font-fantasy text-4xl text-parchment-200 mb-3" style={{ textShadow: '0 0 30px rgba(192,57,43,0.4)' }}>
            Your Adventure Awaits
          </h2>
          {currentCharacter && (
            <p className="text-ember-400/70 font-serif text-sm uppercase tracking-widest mb-4">
              {currentCharacter.name} · {currentCharacter.race} {currentCharacter.class}
            </p>
          )}
          <p className="text-slate-400 font-serif italic mb-10 leading-relaxed">
            The Dungeon Master stands ready. When you step through, there is no turning back.
          </p>
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="fantasy-btn text-base px-10 py-3 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="animate-pulse">The world stirs...</span>
            ) : (
              'Begin Your Story'
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-950 text-parchment-100 flex flex-col overflow-hidden">
      {/* Level Up overlay */}
      {showLevelUp && levelUpData && (
        <LevelUpScreen
          level={levelUpData.level}
          hpGained={levelUpData.hpGained}
          newAbility={levelUpData.newAbility}
          characterName={levelUpData.characterName}
          onContinue={() => setShowLevelUp(false)}
        />
      )}

      {/* Enemy encounter popup */}
      {showEnemyPopup && (
        <EnemyPopup
          enemyName={enemyPopupName}
          onDismiss={() => setShowEnemyPopup(false)}
        />
      )}

      {/* Top bar */}
      <header className="border-b border-slate-800/60 px-4 py-2 flex items-center justify-between shrink-0 bg-slate-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-slate-600 hover:text-slate-300 text-sm transition-colors font-serif"
          >
            ← Leave
          </button>
          <span className="text-slate-800">|</span>
          {currentCharacter && (
            <div className="flex items-center gap-2">
              <img
                src={`/assets/races/${currentCharacter.race.toLowerCase().replace(/['\s]/g, '-')}.png`}
                alt=""
                className="w-6 h-6 rounded-full object-cover object-top border border-slate-700"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <span className="text-sm font-serif text-slate-400">
                <span className="text-parchment-300">{currentCharacter.name}</span>
                <span className="text-slate-600 mx-1">·</span>
                {currentCharacter.race} {currentCharacter.class}
                <span className="text-slate-600 mx-1">·</span>
                <span className="text-ember-400">Lv.{currentCharacter.level}</span>
              </span>
              {/* HP indicator */}
              <div className="flex items-center gap-1 ml-2">
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(currentCharacter.hp / currentCharacter.max_hp) * 100}%`,
                      background: currentCharacter.hp > currentCharacter.max_hp * 0.6 ? '#16a34a' : currentCharacter.hp > currentCharacter.max_hp * 0.3 ? '#ca8a04' : '#dc2626',
                    }}
                  />
                </div>
                <span className="text-xs text-slate-600">{currentCharacter.hp}/{currentCharacter.max_hp}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AudioControls />
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`text-xs px-3 py-1 border transition-colors font-serif ${showSidebar ? 'border-ember-500 text-ember-400 bg-ember-600/10' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
          >
            {showSidebar ? 'Hide Sheet' : 'Character Sheet'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Scene image — taller, more dramatic */}
          <div className="shrink-0" style={{ height: '200px' }}>
            <SceneDisplay imageUrl={currentSceneImage} />
          </div>

          {/* Dice */}
          {showDice && lastActionResult?.diceRoll && (
            <DiceRoll
              rolling={showDice}
              result={lastActionResult.diceRoll.total}
              modifier={lastActionResult.diceRoll.modifier}
              label={lastActionResult.diceRoll.description || 'Roll'}
            />
          )}

          {/* Combat active banner */}
          {inCombat && (
            <div
              className="shrink-0 flex items-center justify-center gap-2 py-1.5 text-xs font-serif uppercase tracking-widest text-red-400 border-b border-red-800/40"
              style={{
                background: 'rgba(127,29,29,0.15)',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            >
              <span>⚔</span>
              <span>COMBAT ACTIVE — Fight or flee</span>
              <span>⚔</span>
            </div>
          )}

          {/* Combat banner */}
          {inCombat && (
            <div
              className="shrink-0 flex items-center justify-between px-4 py-1.5"
              style={{
                background: 'linear-gradient(90deg, rgba(127,29,29,0.4), rgba(185,28,28,0.25), rgba(127,29,29,0.4))',
                borderTop: '1px solid rgba(220,38,38,0.4)',
                borderBottom: '1px solid rgba(220,38,38,0.4)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs uppercase tracking-widest text-red-400 font-sans">Combat Active</span>
              </div>
              <span className="text-xs text-red-600/70 font-serif italic">Fight, flee, or find another way</span>
            </div>
          )}

          {/* Story feed */}
          <div
            ref={narratorRef}
            className="flex-1 overflow-y-auto py-4 space-y-2"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
          >
            {normalizeEvents(events).map((event, i) => (
              <NarratorBox
                key={event.id || i}
                text={event.content}
                mood={event.event_type === 'narration' ? 'neutral' : 'serious'}
                isPlayerAction={event.event_type === 'action'}
                instant={historicalIds.current.has(event.id) || historicalIds.current.has(event.id.replace(/-[an]$/, ''))}
              />
            ))}
            {isLoading && (
              <div className="flex items-center gap-3 px-6 py-2">
                <div className="w-[60px] h-[60px] rounded-full border border-slate-700 flex items-center justify-center shrink-0">
                  <img src="/assets/dm/dm-neutral.png" alt="DM" className="w-full h-full rounded-full object-cover opacity-50" />
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-ember-400/50" style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action input */}
          <ActionPanel
            suggestedActions={lastActionResult?.suggestedActions || []}
            onAction={handleAction}
            disabled={isLoading || currentCharacter?.is_alive === false}
          />
        </div>

        {/* Sidebar */}
        {showSidebar && currentCharacter && (
          <aside className="w-72 border-l border-slate-800 overflow-y-auto shrink-0 bg-slate-950">
            <CharacterSheet character={currentCharacter} />
          </aside>
        )}
      </div>
    </div>
  )
}
