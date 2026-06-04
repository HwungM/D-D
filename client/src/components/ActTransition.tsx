import { useState, useEffect } from 'react'

interface ActTransitionProps {
  actNumber: number
  onComplete: () => void
}

export default function ActTransition({ actNumber, onComplete }: ActTransitionProps) {
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 300)
    const t2 = setTimeout(() => setPhase('out'), 3500)
    const t3 = setTimeout(() => onComplete(), 4800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: '#000',
        opacity: phase === 'in' ? 0 : phase === 'show' ? 1 : 0,
        transition: phase === 'in' ? 'opacity 0.8s ease-in' : phase === 'out' ? 'opacity 1.2s ease-out' : 'opacity 0.8s ease-in',
        pointerEvents: phase === 'out' ? 'none' : 'all',
      }}
    >
      <div
        className="text-center"
        style={{
          opacity: phase === 'show' ? 1 : 0,
          transform: phase === 'show' ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s',
        }}
      >
        <p
          className="font-serif uppercase tracking-[0.4em] mb-4"
          style={{ color: 'rgba(200,146,42,0.5)', fontSize: '0.65rem', letterSpacing: '0.4em' }}
        >
          Chapter
        </p>
        <h1
          className="font-fantasy"
          style={{
            fontSize: '6rem',
            color: '#c8922a',
            textShadow: '0 0 60px rgba(200,146,42,0.4), 0 0 120px rgba(200,146,42,0.2)',
            lineHeight: 1,
          }}
        >
          {toRoman(actNumber)}
        </h1>
        <div
          className="w-32 mx-auto mt-6"
          style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,146,42,0.5), transparent)' }}
        />
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
