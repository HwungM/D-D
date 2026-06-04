import { useState, useEffect } from 'react'

interface DeathScreenProps {
  characterName: string
  deathNote?: string
  campaignId: string
  onRiseAgain: () => void
  onReturnToHall: () => void
}

export default function DeathScreen({ characterName, deathNote, onRiseAgain, onReturnToHall }: DeathScreenProps) {
  const [visible, setVisible] = useState(false)
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => setShowButtons(true), 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.97)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease-in',
      }}
    >
      {/* Blood drip effect */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{
        background: 'linear-gradient(90deg, transparent, rgba(180,20,20,0.6), transparent)',
        boxShadow: '0 0 20px rgba(180,20,20,0.4)',
      }} />

      <div className="text-center max-w-lg px-8" style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 1.5s ease-out 0.5s, transform 1.5s ease-out 0.5s',
      }}>
        {/* Skull */}
        <div className="text-6xl mb-6" style={{
          filter: 'drop-shadow(0 0 20px rgba(180,20,20,0.5))',
          animation: 'pulse 3s ease-in-out infinite',
        }}>
          💀
        </div>

        <h1
          className="font-fantasy mb-3"
          style={{
            fontSize: '3.5rem',
            color: '#c0392b',
            textShadow: '0 0 40px rgba(192,57,43,0.6), 0 0 80px rgba(192,57,43,0.3)',
            letterSpacing: '0.05em',
          }}
        >
          You Have Fallen
        </h1>

        <p className="font-serif text-lg mb-3" style={{ color: 'rgba(200,175,140,0.8)' }}>
          {characterName}
        </p>

        {deathNote && (
          <p
            className="font-serif italic text-sm leading-relaxed mb-10 px-4"
            style={{ color: 'rgba(160,140,110,0.65)' }}
          >
            "{deathNote}"
          </p>
        )}

        <div
          className="w-24 mx-auto mb-10"
          style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(192,57,43,0.4), transparent)' }}
        />

        <p className="font-serif text-xs uppercase tracking-widest mb-10" style={{
          color: 'rgba(150,130,100,0.4)',
          letterSpacing: '0.3em',
        }}>
          The realm does not mourn long
        </p>

        {showButtons && (
          <div
            className="flex flex-col gap-3 items-center"
            style={{ animation: 'fadeIn 0.8s ease-out forwards' }}
          >
            <button
              onClick={onRiseAgain}
              className="w-64 py-3 font-serif text-sm transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(192,57,43,0.2), rgba(120,30,20,0.35))',
                border: '1px solid rgba(192,57,43,0.45)',
                color: '#e8b09a',
                letterSpacing: '0.06em',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(140,40,25,0.5))' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(192,57,43,0.2), rgba(120,30,20,0.35))' }}
            >
              Rise Again
              <span className="block text-xs mt-0.5" style={{ color: 'rgba(220,160,130,0.5)', letterSpacing: '0.15em' }}>
                CREATE A NEW CHARACTER
              </span>
            </button>

            <button
              onClick={onReturnToHall}
              className="w-64 py-3 font-serif text-sm transition-all"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(180,160,120,0.5)',
                letterSpacing: '0.06em',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(220,200,160,0.8)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(180,160,120,0.5)' }}
            >
              Return to the Hall
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
