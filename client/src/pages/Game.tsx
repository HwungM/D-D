import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { gameApi, assetApi } from '../lib/api'
import { useGameStore } from '../lib/store'
import SceneDisplay from '../components/SceneDisplay'
import ActionPanel from '../components/ActionPanel'
import CharacterSheet from '../components/CharacterSheet'
import NarratorBox from '../components/NarratorBox'
import DiceRoll from '../components/DiceRoll'
import type { Character, StoryEvent, ActionResult } from '../../../shared/types'

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

  useEffect(() => {
    if (!campaignId || !characterId) return

    // Load scene / character state
    gameApi.getScene(campaignId, characterId).then(({ data }) => {
      if (data.character) setCharacter(data.character as Character)
    })

    // Load history
    gameApi.getHistory(campaignId, characterId, 50).then(({ data }) => {
      setEvents(data.events || [])
      if (data.events?.length > 0) setStarted(true)
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

      if (result.sceneImagePrompt) {
        const cacheKey = `scene-${campaignId}-start`
        assetApi.generate(result.sceneImagePrompt, cacheKey).then(({ data: img }) => {
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

    // Optimistically add player action to events
    const playerEvent: StoryEvent = {
      id: `temp-${Date.now()}`,
      campaign_id: campaignId,
      character_id: characterId,
      event_type: 'action',
      content: action,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    addEvent(playerEvent)

    try {
      const { data } = await gameApi.action(characterId, campaignId, action)
      const result = data as ActionResult
      setLastActionResult(result)

      if (result.diceRoll) setShowDice(true)

      const dmEvent: StoryEvent = {
        id: `temp-dm-${Date.now()}`,
        campaign_id: campaignId,
        character_id: characterId,
        event_type: 'narration',
        content: result.narration,
        metadata: { diceRoll: result.diceRoll, suggestedActions: result.suggestedActions },
        created_at: new Date().toISOString(),
      }
      addEvent(dmEvent)

      if (result.characterChanges) {
        setCharacter({ ...currentCharacter!, ...result.characterChanges } as Character)
      }

      if (result.sceneImagePrompt) {
        const cacheKey = `scene-${campaignId}-${Date.now()}`
        assetApi.generate(result.sceneImagePrompt, cacheKey).then(({ data: img }) => {
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-6xl mb-6">⚔️</div>
          <h2 className="font-fantasy text-3xl text-parchment-200 mb-4">Your Adventure Awaits</h2>
          <p className="text-slate-400 font-serif italic mb-8">
            The Dungeon Master is preparing your world. When you step through, there is no turning back.
          </p>
          <button onClick={handleStart} disabled={isLoading} className="fantasy-btn text-lg px-8 py-3 disabled:opacity-50">
            {isLoading ? 'The world stirs...' : 'Begin Your Story'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-parchment-100 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-slate-500 hover:text-slate-300 text-sm">
            ← Leave
          </button>
          <span className="text-slate-700">|</span>
          {currentCharacter && (
            <span className="text-sm font-serif text-slate-400">
              {currentCharacter.name} · {currentCharacter.race} {currentCharacter.class} · Lv.{currentCharacter.level}
            </span>
          )}
        </div>
        <button onClick={() => setShowSidebar(!showSidebar)} className="fantasy-btn-secondary text-xs">
          {showSidebar ? 'Hide Sheet' : 'Character Sheet'}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main game area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Scene image */}
          <SceneDisplay imageUrl={currentSceneImage} />

          {/* Dice roll display */}
          {showDice && lastActionResult?.diceRoll && (
            <DiceRoll
              rolling={showDice}
              result={lastActionResult.diceRoll.total}
              modifier={lastActionResult.diceRoll.modifier}
              label={lastActionResult.diceRoll.description || 'Roll'}
            />
          )}

          {/* Narrator history */}
          <div ref={narratorRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {events.map((event, i) => (
              <NarratorBox
                key={event.id || i}
                text={event.content}
                mood={event.event_type === 'narration' ? 'neutral' : 'serious'}
              />
            ))}
            {isLoading && (
              <div className="parchment-box p-4 animate-pulse">
                <p className="text-slate-500 font-serif italic text-sm">The Dungeon Master considers your fate...</p>
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

        {/* Character sidebar */}
        {showSidebar && currentCharacter && (
          <aside className="w-72 border-l border-slate-800 overflow-y-auto shrink-0">
            <CharacterSheet character={currentCharacter} />
          </aside>
        )}
      </div>
    </div>
  )
}
