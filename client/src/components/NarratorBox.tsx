import { useEffect, useRef, useState } from 'react'
import { audioManager } from '../lib/audio'

type Mood = 'neutral' | 'amused' | 'serious' | 'menacing' | 'surprised' | 'pleased'

interface NarratorBoxProps {
  instant?: boolean
  text: string
  mood?: Mood
  isPlayerAction?: boolean
  playerName?: string
  playerPortrait?: string
  narratorPortrait: string
  onComplete?: () => void
  // In-scene micro-action reaction rather than a full DM narration beat —
  // rendered as a compact, quieter aside so it reads as flavor, not story.
  microAction?: boolean
}

const NARRATOR_COUNT = 10

export function pickNarratorPortrait(campaignId: string): string {
  let hash = 0
  for (let i = 0; i < campaignId.length; i++) {
    hash = (hash * 31 + campaignId.charCodeAt(i)) | 0
  }
  const index = (Math.abs(hash) % NARRATOR_COUNT) + 1
  return `/assets/dm/dm-${String(index).padStart(2, '0')}.png`
}

// Accent color per mood — used for the top border glow line only
const MOOD_ACCENT: Record<Mood, string> = {
  neutral:  'rgba(200,146,42,0.72)',
  amused:   'rgba(212,168,67,0.85)',
  serious:  'rgba(140,60,30,0.82)',
  menacing: 'rgba(200,40,40,0.9)',
  surprised:'rgba(200,120,40,0.82)',
  pleased:  'rgba(120,190,80,0.75)',
}

export default function NarratorBox({
  text, mood = 'neutral', isPlayerAction = false, instant = false,
  playerName, playerPortrait, narratorPortrait, onComplete, microAction = false,
}: NarratorBoxProps) {
  const [displayed, setDisplayed] = useState('')
  const [typing, setTyping] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    if (!text) return
    if (instant) {
      setDisplayed(text)
      setTyping(false)
      return
    }
    indexRef.current = 0
    setDisplayed('')
    setTyping(true)
    if (!isPlayerAction) audioManager.playPageTurn()

    const interval = setInterval(() => {
      indexRef.current += 1
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(interval)
        setTyping(false)
        onComplete?.()
      }
    }, isPlayerAction ? 10 : 18)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // ── Player action bubble ────────────────────────────────────────────────────
  if (isPlayerAction) {
    const isOtherPlayer = !!playerName
    return (
      <div className="animate-fade-in flex items-start gap-3 px-1 py-0.5 sm:px-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border text-xs font-fantasy"
          style={isOtherPlayer
            ? { background: 'rgba(139,92,246,0.18)', borderColor: 'rgba(196,181,253,0.48)', color: '#ddd6fe' }
            : { background: 'rgba(34,211,238,0.14)', borderColor: 'rgba(103,232,249,0.48)', color: '#cffafe' }
          }
        >
          {playerPortrait ? (
            <img src={playerPortrait} alt="" className="h-full w-full object-cover object-top"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : 'PC'}
        </div>
        <div
          className="relative flex-1 border px-3 py-2.5"
          style={isOtherPlayer
            ? { background: 'rgba(139,92,246,0.10)', borderColor: 'rgba(196,181,253,0.28)', borderLeftColor: 'rgba(196,181,253,0.55)', borderLeftWidth: 2 }
            : { background: 'rgba(34,211,238,0.08)', borderColor: 'rgba(103,232,249,0.22)', borderLeftColor: 'rgba(103,232,249,0.55)', borderLeftWidth: 2 }
          }
        >
          {isOtherPlayer && (
            <p className="mb-0.5 font-fantasy text-[10px] uppercase tracking-[0.2em] text-violet-200/80">{playerName}</p>
          )}
          {microAction && (
            <p className="mb-0.5 font-fantasy text-[9px] uppercase tracking-[0.2em] text-amber-200/60">In-scene</p>
          )}
          <p className="font-serif text-sm italic leading-relaxed" style={{ color: 'rgba(240,228,200,0.88)' }}>
            {displayed}
            {typing && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle bg-cyan-300/70"
                style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
            )}
          </p>
        </div>
      </div>
    )
  }

  // ── Compact micro-action reaction ───────────────────────────────────────────
  // A fast in-scene reaction, not a full DM story beat — smaller, quieter, no
  // portrait pomp, so it visually reads as an aside rather than a narration.
  if (microAction) {
    // Ambient world events are woven directly into the reaction text as a
    // "(Meanwhile: ...)" aside (see ambientWorldEventSystem.weaveAmbientEventIntoReaction).
    // Split it out once fully displayed so it reads as background flavor
    // rather than a direct response to the player's action.
    const ambientMatch = !typing ? displayed.match(/\s*(\(Meanwhile:[^)]*\))\s*$/) : null
    const mainText = ambientMatch ? displayed.slice(0, ambientMatch.index).trim() : displayed
    const ambientAside = ambientMatch ? ambientMatch[1] : null
    return (
      <div className="animate-fade-in flex items-start gap-2.5 px-1 py-0.5 sm:px-2">
        <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'rgba(200,146,42,0.55)' }} />
        <div className="relative flex-1 border-l-2 px-3 py-1.5" style={{ borderColor: 'rgba(200,146,42,0.35)', background: 'rgba(200,146,42,0.03)' }}>
          <p className="font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(220,200,160,0.78)' }}>
            {mainText}
            {ambientAside && (
              <span className="ml-1" style={{ color: 'rgba(190,172,200,0.58)', fontStyle: 'italic' }}>
                {ambientAside}
              </span>
            )}
            {typing && (
              <span className="ml-0.5 inline-block h-3 w-0.5 align-middle bg-amber-300/60"
                style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
            )}
          </p>
        </div>
      </div>
    )
  }

  // ── DM narration card ───────────────────────────────────────────────────────
  const accent = MOOD_ACCENT[mood]

  return (
    <div className="animate-fade-in narrator-box relative px-1 sm:px-2">
      <div
        className="relative overflow-hidden border px-4 py-4 sm:px-5 sm:py-5"
        style={{
          background: 'linear-gradient(135deg, rgba(28,18,8,0.96) 0%, rgba(18,12,5,0.94) 100%)',
          borderColor: 'rgba(200,146,42,0.3)',
          borderTopColor: 'rgba(200,146,42,0.5)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(200,146,42,0.12)',
        }}
      >
        {/* Glowing top accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${accent} 30%, rgba(34,211,238,0.6) 70%, transparent 100%)` }} />

        <div className="flex gap-3 sm:gap-4 relative z-10">
          {/* DM portrait */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 overflow-hidden border relative"
              style={{
                borderColor: 'rgba(200,146,42,0.35)',
                boxShadow: `0 0 18px rgba(200,146,42,0.2), 0 0 40px rgba(0,0,0,0.6)`,
                background: 'rgba(0,0,0,0.5)',
              }}
            >
              <img src={narratorPortrait} alt="Dungeon Master" className="w-full h-full object-cover" />
            </div>
            {typing && (
              <span className="font-fantasy text-[8px] uppercase tracking-[0.14em] select-none"
                style={{ color: 'rgba(200,146,42,0.65)', animation: 'candleFlame 0.8s ease-in-out infinite' }}>
                ▸▸▸
              </span>
            )}
          </div>

          {/* Narration text */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-serif text-sm sm:text-base leading-[1.75] whitespace-pre-wrap"
              style={{ color: 'rgba(245,234,210,0.96)' }}>
              {displayed}
              {typing && (
                <span className="inline-block w-0.5 h-[1.1em] bg-amber-300/70 ml-0.5 align-middle"
                  style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
              )}
            </p>
          </div>
        </div>

        {/* Subtle bottom rule */}
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(200,146,42,0.18), transparent)' }} />
      </div>
    </div>
  )
}
