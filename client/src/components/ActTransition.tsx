import { useEffect, useState } from 'react'

interface ActTransitionProps {
  actNumber: number
  onComplete: () => void
}

export default function ActTransition({ actNumber, onComplete }: ActTransitionProps) {
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in')

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('show'), 300)
    const t2 = window.setTimeout(() => setPhase('out'), 3500)
    const t3 = window.setTimeout(() => onComplete(), 4800)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3) }
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#050607] text-parchment-100"
      style={{
        opacity: phase === 'in' ? 0 : phase === 'show' ? 1 : 0,
        transition: phase === 'in' ? 'opacity 0.8s ease-in' : phase === 'out' ? 'opacity 1.2s ease-out' : 'opacity 0.8s ease-in',
        pointerEvents: phase === 'out' ? 'none' : 'all',
      }}
    >
      <div className="absolute inset-0">
        <img src="/media/loading/everrealm-moonlit-party.png" alt="" className="h-full w-full object-cover opacity-[0.48]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.58)_50%,rgba(0,0,0,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.16)_0%,rgba(0,0,0,0)_58%)]" />
      </div>

      <div
        className="relative z-10 flex min-h-screen items-center justify-center px-5"
        style={{
          opacity: phase === 'show' ? 1 : 0,
          transform: phase === 'show' ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s',
        }}
      >
        <section className="w-full max-w-xl border border-parchment-100/34 bg-black/68 p-7 text-center shadow-[0_30px_130px_rgba(0,0,0,0.78)] backdrop-blur-md">
          <p className="font-fantasy text-[10px] uppercase tracking-[0.38em] text-cyan-200/62">
            The Chronicle Advances
          </p>
          <h1 className="mt-5 font-fantasy text-5xl uppercase leading-none tracking-[0.08em] text-amber-100 sm:text-6xl md:text-7xl" style={{ textShadow: '0 0 60px rgba(245,158,11,0.32)' }}>
            Act {toRoman(actNumber)}
          </h1>
          <div className="mx-auto mt-7 h-px w-36 bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.58),transparent)]" />
          <p className="mt-6 font-serif text-sm italic text-parchment-200/58">
            The world shifts. New choices wake.
          </p>
        </section>
      </div>
    </div>
  )
}

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I']
  let result = ''
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i] }
  }
  return result
}
