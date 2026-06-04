import { useEffect, useRef, useState } from 'react'
import { audioManager } from '../lib/audio'

type Mood = 'neutral' | 'amused' | 'serious' | 'menacing' | 'surprised' | 'pleased'

interface NarratorBoxProps {
  instant?: boolean
  text: string
  mood?: Mood
  isPlayerAction?: boolean
  onComplete?: () => void
}

const MOOD_PORTRAIT: Record<Mood, string> = {
  neutral: '/assets/dm/dm-neutral.png',
  amused: '/assets/dm/dm-amused.png',
  serious: '/assets/dm/dm-serious.png',
  menacing: '/assets/dm/dm-menacing.png',
  surprised: '/assets/dm/dm-surprised.png',
  pleased: '/assets/dm/dm-pleased.png',
}

const MOOD_BORDER_COLOR: Record<Mood, string> = {
  neutral: 'rgba(192,57,43,0.3)',
  amused: 'rgba(212,168,67,0.4)',
  serious: 'rgba(100,30,22,0.5)',
  menacing: 'rgba(139,28,28,0.6)',
  surprised: 'rgba(192,100,43,0.4)',
  pleased: 'rgba(150,180,100,0.4)',
}

export default function NarratorBox({ text, mood = 'neutral', isPlayerAction = false, instant = false, onComplete }: NarratorBoxProps) {
  const [displayed, setDisplayed] = useState('')
  const [typing, setTyping] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    if (!text) return
    // Historical events show instantly — no animation, no sound
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
    return (
      <div className="animate-fade-in flex items-start gap-3 px-2 py-1">
        <div className="shrink-0 w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs text-parchment-300 font-fantasy">
          ⚔
        </div>
        <div className="flex-1 bg-slate-800/60 border border-slate-700 px-3 py-2">
          <p className="text-slate-300 font-serif text-sm italic">
            {displayed}
            {typing && (
              <span className="inline-block w-0.5 h-3.5 bg-slate-500 ml-0.5 align-middle" style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
            )}
          </p>
        </div>
      </div>
    )
  }

  const portraitUrl = MOOD_PORTRAIT[mood]
  const borderColor = MOOD_BORDER_COLOR[mood]

  return (
    <div className="animate-fade-in narrator-box relative">
      <div
        className="relative p-5 pt-6"
        style={{
          background: 'linear-gradient(135deg, #f5e6c8 0%, #ede0b8 30%, #f0dba8 60%, #e8d49a 100%)',
          borderTop: `2px solid ${borderColor}`,
          borderBottom: `2px solid ${borderColor}`,
          boxShadow: `0 0 15px ${borderColor}, inset 0 0 30px rgba(0,0,0,0.08)`,
          animation: 'flickerBorder 4s ease-in-out infinite',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='0.2'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="flex gap-4 relative z-10">
          <div className="shrink-0">
            <div
              className="w-[60px] h-[60px] rounded-full overflow-hidden border-2 relative"
              style={{
                borderColor: 'rgba(139,90,43,0.5)',
                boxShadow: `0 0 12px ${borderColor}, inset 0 0 8px rgba(0,0,0,0.3)`,
                animation: 'torchFlicker 2s ease-in-out infinite',
              }}
            >
              <img src={portraitUrl} alt="Dungeon Master" className="w-full h-full object-cover" />
            </div>
            {typing && (
              <div className="mt-1 text-center text-amber-700/70 text-base select-none" style={{ animation: 'candleFlame 0.8s ease-in-out infinite' }}>
                ✍
              </div>
            )}
          </div>
          <p className="font-serif text-sm leading-relaxed text-gray-800 whitespace-pre-wrap flex-1 pt-1">
            {displayed}
            {typing && (
              <span className="inline-block w-0.5 h-4 bg-gray-600 ml-0.5 align-middle" style={{ animation: 'flicker 0.8s ease-in-out infinite' }} />
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
