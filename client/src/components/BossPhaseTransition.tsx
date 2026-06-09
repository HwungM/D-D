import { useEffect, useState } from 'react'

interface Props {
  phase: number
  bossName: string
  onComplete: () => void
}

const PHASE_LINES: Record<number, string> = {
  2: 'The mask shatters. Something worse emerges.',
  3: 'Its true form is finally revealed.',
  4: 'There is no going back now.',
}

export default function BossPhaseTransition({ phase, bossName, onComplete }: Props) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 3500)
    const doneTimer = setTimeout(onComplete, 4200)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: 'rgba(8,2,2,0.96)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.7s ease',
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 38%, rgba(200,20,20,0.30) 0%, transparent 62%)' }} />
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.6), transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.4), transparent)' }} />

      <div className="relative text-center px-8">
        <p
          className="font-fantasy text-[10px] uppercase tracking-[0.52em]"
          style={{ color: 'rgba(255,90,90,0.5)', letterSpacing: '0.52em' }}
        >
          Boss Phase
        </p>

        <div
          className="mt-4 font-fantasy leading-none"
          style={{
            fontSize: 'clamp(5rem, 18vw, 11rem)',
            color: '#ef4444',
            textShadow: '0 0 50px rgba(239,68,68,0.9), 0 0 100px rgba(239,68,68,0.5), 0 0 200px rgba(239,68,68,0.2)',
          }}
        >
          {phase}
        </div>

        <p
          className="mt-5 font-fantasy text-3xl uppercase tracking-[0.14em]"
          style={{ color: '#f5e6c8', textShadow: '0 0 30px rgba(245,230,200,0.2)' }}
        >
          {bossName}
        </p>

        <p className="mt-4 font-serif text-base italic" style={{ color: 'rgba(220,175,135,0.55)' }}>
          {PHASE_LINES[phase] || 'The battle is far from over.'}
        </p>

        <div
          className="mx-auto mt-10 h-px w-64"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.65), transparent)',
            animation: 'pulse 1.4s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}
