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
}

const NARRATOR_COUNT = 10

// Each campaign keeps the same narrator persona throughout — picking by mood made the
// "same" DM look like a different person from one message to the next.
export function pickNarratorPortrait(campaignId: string): string {
  let hash = 0
  for (let i = 0; i < campaignId.length; i++) {
    hash = (hash * 31 + campaignId.charCodeAt(i)) | 0
  }
  const index = (Math.abs(hash) % NARRATOR_COUNT) + 1
  return `/assets/dm/dm-${String(index).padStart(2, '0')}.png`
}

const MOOD_BORDER_COLOR: Record<Mood, string> = {
  neutral: 'rgba(192,57,43,0.3)',
  amused: 'rgba(212,168,67,0.4)',
  serious: 'rgba(100,30,22,0.5)',
  menacing: 'rgba(139,28,28,0.6)',
  surprised: 'rgba(192,100,43,0.4)',
  pleased: 'rgba(150,180,100,0.4)',
}

export default function NarratorBox({ text, mood = 'neutral', isPlayerAction = false, instant = false, playerName, playerPortrait, narratorPortrait, onComplete }: NarratorBoxProps) {
  const [displayed, setDisplayed] = useState('')
  const [typing, setTyping] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    if (!text) return
    // Historical events show instantly, with no animation or sound.
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

  if (isPlayerAction) {
    const isOtherPlayer = !!playerName
    return (
      <div className="animate-fade-in flex items-start gap-3 px-1 py-1 sm:px-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border text-xs font-fantasy"
          style={isOtherPlayer
            ? { background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(196,181,253,0.38)', color: '#ddd6fe', boxShadow: '0 0 24px rgba(139,92,246,0.14)' }
            : { background: 'rgba(34,211,238,0.085)', borderColor: 'rgba(103,232,249,0.34)', color: '#cffafe', boxShadow: '0 0 24px rgba(34,211,238,0.12)' }
          }
        >
          {playerPortrait ? (
            <img src={playerPortrait} alt="" className="h-full w-full object-cover object-top" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : 'PC'}
        </div>
        <div
          className="relative flex-1 border px-3 py-2 shadow-[0_14px_48px_rgba(0,0,0,0.24)]"
          style={isOtherPlayer
            ? { background: 'linear-gradient(90deg, rgba(139,92,246,0.085), rgba(0,0,0,0.32))', borderColor: 'rgba(196,181,253,0.2)' }
            : { background: 'linear-gradient(90deg, rgba(34,211,238,0.065), rgba(0,0,0,0.32))', borderColor: 'rgba(103,232,249,0.17)' }
          }
        >
          {isOtherPlayer && (
            <p className="mb-0.5 font-fantasy text-[10px] uppercase tracking-[0.2em] text-violet-200/68">{playerName}</p>
          )}
          <p className="font-serif text-sm italic leading-relaxed text-parchment-100/74">
            {displayed}
            {typing && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle bg-cyan-200/56" style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
            )}
          </p>
        </div>
      </div>
    )
  }

  const portraitUrl = narratorPortrait
  const borderColor = MOOD_BORDER_COLOR[mood]

  return (
    <div className="animate-fade-in narrator-box relative px-1 sm:px-2">
      <div
        className="relative overflow-hidden border bg-black/42 p-4 sm:p-5 backdrop-blur-sm"
        style={{
          borderColor,
          boxShadow: '0 18px 70px rgba(0,0,0,0.34)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-1 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, rgba(245,158,11,0), rgba(245,158,11,0.7), rgba(34,211,238,0.55), rgba(34,211,238,0))',
          }}
        />
        <div className="flex gap-3 sm:gap-4 relative z-10">
          <div className="shrink-0">
            <div
              className="w-12 h-12 sm:w-[60px] sm:h-[60px] overflow-hidden border relative bg-black/60"
              style={{
                borderColor: 'rgba(255,255,255,0.13)',
                boxShadow: `0 0 26px ${borderColor}`,
              }}
            >
              <img src={portraitUrl} alt="Dungeon Master" className="w-full h-full object-cover" />
            </div>
            {typing && (
              <div className="mt-1 text-center font-fantasy text-[9px] uppercase tracking-[0.16em] text-amber-200/54 select-none" style={{ animation: 'candleFlame 0.8s ease-in-out infinite' }}>
                writing
              </div>
            )}
          </div>
          <p className="font-serif text-sm sm:text-base leading-relaxed text-parchment-100/82 whitespace-pre-wrap flex-1 pt-0.5">
            {displayed}
            {typing && (
              <span className="inline-block w-0.5 h-4 bg-amber-200/60 ml-0.5 align-middle" style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
            )}
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)`,
        }} />
      </div>
    </div>
  )
}
