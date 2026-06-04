import { useState, useEffect, useRef } from 'react'
import type { RollContext } from '../../../shared/types'

interface DiceRollModalProps {
  narration: string
  rollContext: RollContext
  characterName: string
  onRoll: (result: number, total: number, success: boolean, isCritSuccess: boolean, isCritFail: boolean) => void
}

export default function DiceRollModal({ narration, rollContext, characterName, onRoll }: DiceRollModalProps) {
  const [rolled, setRolled] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayNum, setDisplayNum] = useState<number | null>(null)
  const [finalResult, setFinalResult] = useState<number | null>(null)
  const [showContinue, setShowContinue] = useState(false)
  const [shake, setShake] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const statLabel = rollContext.stat.toUpperCase()
  const dc = rollContext.dc
  const modifier = rollContext.modifier
  const isDramatic = rollContext.isDramatic

  function handleRollClick() {
    if (rolling || rolled) return
    setRolling(true)

    const trueRoll = Math.floor(Math.random() * 20) + 1
    const total = trueRoll + modifier
    const success = total >= dc
    const isCritSuccess = trueRoll === 20
    const isCritFail = trueRoll === 1

    const duration = isDramatic ? 3000 : 1200
    const fastPhase = duration * 0.55
    const slowPhase = duration * 0.45
    let elapsed = 0
    const tickFast = 60
    const tickSlow = 180

    let useSlow = false

    intervalRef.current = setInterval(() => {
      elapsed += useSlow ? tickSlow : tickFast
      setDisplayNum(Math.floor(Math.random() * 20) + 1)

      if (!useSlow && elapsed >= fastPhase) {
        useSlow = true
        elapsed = 0
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(() => {
          elapsed += tickSlow
          setDisplayNum(Math.floor(Math.random() * 20) + 1)
          if (elapsed >= slowPhase) {
            if (intervalRef.current) clearInterval(intervalRef.current)
            setDisplayNum(trueRoll)
            setFinalResult(trueRoll)
            setRolled(true)
            setRolling(false)
            if (isDramatic) {
              setShake(true)
              setTimeout(() => setShake(false), 600)
            }
            setTimeout(() => setShowContinue(true), 800)
          }
        }, tickSlow)
      }
    }, tickFast)
  }

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const total = finalResult !== null ? finalResult + modifier : null
  const success = total !== null ? total >= dc : null
  const isCritSuccess = finalResult === 20
  const isCritFail = finalResult === 1

  function getDieColor(): string {
    if (!rolled) return 'rgba(200,146,42,0.9)'
    if (isCritSuccess) return '#fbbf24'
    if (isCritFail) return '#ef4444'
    if (success) return '#4ade80'
    return 'rgba(180,160,120,0.8)'
  }

  function getDieGlow(): string {
    if (!rolled) return '0 0 30px rgba(200,146,42,0.4)'
    if (isCritSuccess) return '0 0 50px rgba(251,191,36,0.7), 0 0 100px rgba(251,191,36,0.3)'
    if (isCritFail) return '0 0 50px rgba(239,68,68,0.7), 0 0 100px rgba(239,68,68,0.3)'
    if (success) return '0 0 40px rgba(74,222,128,0.5)'
    return '0 0 20px rgba(180,160,120,0.2)'
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="w-full max-w-2xl flex flex-col items-center gap-8 px-6 py-10"
        style={{ animation: shake ? 'shake 0.5s ease-in-out' : undefined }}
      >
        {/* Setup narration */}
        <div className="max-w-lg text-center">
          <p className="font-serif text-lg leading-relaxed" style={{ color: 'rgba(212,197,160,0.9)', textShadow: '0 0 20px rgba(200,146,42,0.15)' }}>
            {narration}
          </p>
        </div>

        {/* Roll context card */}
        <div
          className="w-full max-w-md p-5"
          style={{
            background: isDramatic ? 'rgba(80,20,20,0.6)' : 'rgba(20,20,30,0.7)',
            border: isDramatic
              ? '1px solid rgba(200,80,80,0.5)'
              : '1px solid rgba(200,146,42,0.2)',
            animation: isDramatic && !rolled ? 'pulse-border 1.5s ease-in-out infinite' : undefined,
            boxShadow: isDramatic ? '0 0 30px rgba(200,50,50,0.15)' : 'none',
          }}
        >
          {/* Stat + DC badges */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-xs font-bold px-2 py-1 uppercase tracking-widest"
                style={{ background: 'rgba(200,146,42,0.15)', border: '1px solid rgba(200,146,42,0.35)', color: '#c89228' }}
              >
                {statLabel}
              </span>
              {modifier !== 0 && (
                <span className="font-mono text-xs" style={{ color: modifier > 0 ? 'rgba(100,180,100,0.8)' : 'rgba(220,80,80,0.8)' }}>
                  {modifier > 0 ? `+${modifier}` : modifier}
                </span>
              )}
            </div>
            <span
              className="font-mono text-xs font-bold px-2 py-1"
              style={{ background: 'rgba(180,60,60,0.15)', border: '1px solid rgba(180,60,60,0.35)', color: '#e87a7a' }}
            >
              DC {dc}
            </span>
          </div>

          {/* Description */}
          <p className="font-serif text-sm mb-4 leading-relaxed" style={{ color: 'rgba(200,180,140,0.8)' }}>
            {rollContext.description}
          </p>

          {/* Success/Failure hints */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3"
              style={{ background: 'rgba(40,100,60,0.2)', border: '1px solid rgba(74,222,128,0.2)' }}
            >
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'rgba(74,222,128,0.6)', letterSpacing: '0.15em' }}>Success</p>
              <p className="font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(160,220,160,0.7)' }}>
                {rollContext.successDescription}
              </p>
            </div>
            <div
              className="p-3"
              style={{ background: 'rgba(100,30,30,0.2)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'rgba(239,68,68,0.6)', letterSpacing: '0.15em' }}>Failure</p>
              <p className="font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(220,140,140,0.7)' }}>
                {rollContext.failDescription}
              </p>
            </div>
          </div>
        </div>

        {/* The D20 */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleRollClick}
            disabled={rolling || rolled}
            className="relative flex items-center justify-center transition-all"
            style={{
              width: 120,
              height: 120,
              background: rolled
                ? `radial-gradient(circle, ${getDieColor()}22, rgba(0,0,0,0.8))`
                : rolling
                  ? 'radial-gradient(circle, rgba(200,146,42,0.15), rgba(0,0,0,0.8))'
                  : 'radial-gradient(circle, rgba(200,146,42,0.1), rgba(0,0,0,0.8))',
              border: `2px solid ${getDieColor()}`,
              borderRadius: 8,
              boxShadow: getDieGlow(),
              cursor: rolling || rolled ? 'default' : 'pointer',
              clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
              transform: rolling ? 'rotate(var(--spin, 0deg))' : 'none',
              animation: rolling ? 'spin 0.3s linear infinite' : (!rolled ? 'pulse-glow 2s ease-in-out infinite' : undefined),
            }}
          >
            <span
              className="font-mono font-black select-none"
              style={{
                fontSize: displayNum !== null ? 40 : 36,
                color: getDieColor(),
                textShadow: `0 0 20px ${getDieColor()}`,
              }}
            >
              {displayNum !== null ? displayNum : '?'}
            </span>
          </button>

          {!rolled && !rolling && (
            <p className="font-serif text-sm" style={{ color: 'rgba(200,146,42,0.5)', animation: 'pulse 2s ease-in-out infinite' }}>
              Click to roll {rollContext.diceType}
            </p>
          )}

          {rolling && (
            <p className="font-serif text-sm italic" style={{ color: 'rgba(200,146,42,0.6)' }}>
              {isDramatic ? 'The moment hangs...' : 'Rolling...'}
            </p>
          )}

          {/* Result display */}
          {rolled && total !== null && finalResult !== null && (
            <div className="text-center">
              <p className="font-mono text-sm" style={{ color: 'rgba(160,140,110,0.7)' }}>
                Rolled {finalResult}
                {modifier !== 0 && (
                  <span style={{ color: modifier > 0 ? 'rgba(100,180,100,0.8)' : 'rgba(220,80,80,0.8)' }}>
                    {' '}{modifier > 0 ? '+' : ''}{modifier} {statLabel}
                  </span>
                )}
                {' '}= <span style={{ color: getDieColor(), fontWeight: 'bold' }}>{total}</span>
                {' '}vs DC {dc} —{' '}
                <span style={{
                  color: isCritSuccess ? '#fbbf24' : isCritFail ? '#ef4444' : success ? '#4ade80' : 'rgba(220,80,80,0.8)',
                  fontWeight: 'bold',
                  textShadow: `0 0 10px ${getDieColor()}`,
                }}>
                  {isCritSuccess ? 'CRITICAL SUCCESS!' : isCritFail ? 'CRITICAL FAILURE!' : success ? 'SUCCESS' : 'FAILURE'}
                </span>
              </p>
              {isCritSuccess && rollContext.critSuccessDescription && (
                <p className="font-serif text-xs italic mt-1" style={{ color: 'rgba(251,191,36,0.7)' }}>{rollContext.critSuccessDescription}</p>
              )}
              {isCritFail && rollContext.critFailDescription && (
                <p className="font-serif text-xs italic mt-1" style={{ color: 'rgba(239,68,68,0.7)' }}>{rollContext.critFailDescription}</p>
              )}
            </div>
          )}
        </div>

        {/* Continue button — player must click to see outcome */}
        {showContinue && finalResult !== null && (
          <button
            onClick={() => {
              const t = finalResult + modifier
              onRoll(finalResult, t, t >= dc, finalResult === 20, finalResult === 1)
            }}
            className="font-serif px-8 py-3 transition-all"
            style={{
              background: isCritSuccess ? 'rgba(251,191,36,0.12)' : isCritFail ? 'rgba(239,68,68,0.12)' : success ? 'rgba(74,222,128,0.1)' : 'rgba(200,80,80,0.1)',
              border: `1px solid ${isCritSuccess ? 'rgba(251,191,36,0.5)' : isCritFail ? 'rgba(239,68,68,0.5)' : success ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.4)'}`,
              color: isCritSuccess ? '#fbbf24' : isCritFail ? '#ef4444' : success ? '#4ade80' : 'rgba(220,100,100,0.9)',
              fontSize: 14,
              letterSpacing: '0.1em',
            }}
          >
            {isCritSuccess ? 'See What Happens →' : isCritFail ? 'Face the Consequences →' : success ? 'Claim Your Victory →' : 'Accept Your Fate →'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(200,80,80,0.5); box-shadow: 0 0 30px rgba(200,50,50,0.15); }
          50% { border-color: rgba(200,80,80,0.9); box-shadow: 0 0 50px rgba(200,50,50,0.3); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(200,146,42,0.4); }
          50% { box-shadow: 0 0 60px rgba(200,146,42,0.7), 0 0 100px rgba(200,146,42,0.3); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-8px); }
          30%, 70% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  )
}
