import { useEffect, useState } from 'react'

const MESSAGES = [
  'The Dungeon Master consults the fates',
  'The world remembers your choices',
  'Shadows stir in the dark',
  'Something ancient awakens',
  'The dice have been cast',
  'Your destiny is being written',
]

interface LoadingScreenProps {
  message?: string
}

export default function LoadingScreen({ message }: LoadingScreenProps) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [dotCount, setDotCount] = useState(1)
  const [fadeMsg, setFadeMsg] = useState(true)

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setFadeMsg(false)
      setTimeout(() => {
        setMsgIndex((i) => (i + 1) % MESSAGES.length)
        setFadeMsg(true)
      }, 400)
    }, 3000)
    return () => clearInterval(msgTimer)
  }, [])

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDotCount((d) => (d % 3) + 1)
    }, 500)
    return () => clearInterval(dotTimer)
  }, [])

  const displayMsg = message || MESSAGES[msgIndex]

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950">
      {/* Vignette pulse */}
      <div
        className="absolute inset-0 pointer-events-none animate-pulse-glow"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(7,13,20,0.85) 100%)' }}
      />

      {/* DM Portrait */}
      <div className="relative mb-8 animate-fade-in">
        <div
          className="w-40 h-40 rounded-full overflow-hidden border-2 border-ember-400/50"
          style={{ animation: 'torchFlicker 1.5s ease-in-out infinite' }}
        >
          <img
            src="/assets/dm/dm-neutral.png"
            alt="Dungeon Master"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback if image not found
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          {/* Fallback glyph */}
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <span className="font-fantasy text-5xl text-ember-400/50">⚔</span>
          </div>
        </div>
        {/* Glow ring */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ animation: 'torchFlicker 1.5s ease-in-out infinite', boxShadow: '0 0 30px #c0392b55, 0 0 60px #c0392b22' }}
        />
      </div>

      {/* Message */}
      <div className="text-center px-8 max-w-md">
        <p
          className="font-fantasy text-parchment-200 text-xl tracking-wide transition-opacity duration-400"
          style={{
            textShadow: '0 0 20px rgba(192,57,43,0.5)',
            opacity: fadeMsg ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          {displayMsg}
          <span className="text-ember-400 inline-block w-8 text-left">
            {'.'.repeat(dotCount)}
          </span>
        </p>
      </div>

      {/* Progress bar */}
      <div className="fixed bottom-0 left-0 right-0 h-1 bg-slate-900">
        <div
          className="h-full bg-gradient-to-r from-ember-600 via-ember-400 to-orange-400"
          style={{ animation: 'loadingBar 12s linear infinite' }}
        />
      </div>
    </div>
  )
}
