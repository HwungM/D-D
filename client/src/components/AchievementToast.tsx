import { useEffect, useState } from 'react'

interface AchievementToastProps {
  title: string
  description: string
  onComplete: () => void
}

export default function AchievementToast({ title, description, onComplete }: AchievementToastProps) {
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in')

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('show'), 50)
    const t2 = window.setTimeout(() => setPhase('out'), 4200)
    const t3 = window.setTimeout(() => onComplete(), 4900)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3) }
  }, [onComplete])

  return (
    <div
      className="fixed top-6 left-1/2 z-[60] w-full max-w-sm -translate-x-1/2 px-4"
      style={{
        opacity: phase === 'show' ? 1 : 0,
        transform: `translate(-50%, ${phase === 'show' ? '0' : '-16px'})`,
        transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
        pointerEvents: 'none',
      }}
    >
      <div className="flex items-center gap-3 border border-amber-300/50 bg-black/85 px-5 py-3 shadow-[0_10px_50px_rgba(245,158,11,0.25)] backdrop-blur-md">
        <span className="text-2xl">🏆</span>
        <div className="min-w-0">
          <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-amber-300/80">Achievement Unlocked</p>
          <p className="truncate font-fantasy text-base text-amber-100">{title}</p>
          <p className="truncate font-serif text-xs italic text-parchment-200/70">{description}</p>
        </div>
      </div>
    </div>
  )
}
