import { useEffect, useRef, useState } from 'react'
import type { RollContext } from '../../../shared/types'

interface DiceRollModalProps {
  narration: string
  rollContext: RollContext
  onRoll: () => Promise<{ rollResult: number; rollTotal: number; dc: number; success: boolean; isCritSuccess: boolean; isCritFail: boolean }>
  onContinue: () => void
}

export default function DiceRollModal({ narration, rollContext, onRoll, onContinue }: DiceRollModalProps) {
  const [rolled, setRolled] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayNum, setDisplayNum] = useState<number | null>(null)
  const [finalResult, setFinalResult] = useState<number | null>(null)
  const [serverResult, setServerResult] = useState<{ rollResult: number; rollTotal: number; dc: number; success: boolean; isCritSuccess: boolean; isCritFail: boolean } | null>(null)
  const [showContinue, setShowContinue] = useState(false)
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const statLabel = rollContext.stat.toUpperCase()
  const dc = rollContext.dc
  const modifier = rollContext.modifier
  const isDramatic = rollContext.isDramatic

  async function handleRollClick() {
    if (rolling || rolled) return
    setRolling(true)
    setError('')

    const duration = isDramatic ? 3000 : 1200
    const fastPhase = duration * 0.55
    const slowPhase = duration * 0.45
    let elapsed = 0
    const tickFast = 60
    const tickSlow = 180
    let useSlow = false
    let authoritativeRoll: Awaited<ReturnType<typeof onRoll>>

    try {
      authoritativeRoll = await onRoll()
    } catch {
      setRolling(false)
      setDisplayNum(null)
      setError('The roll could not be resolved. Try again.')
      return
    }

    intervalRef.current = window.setInterval(() => {
      elapsed += useSlow ? tickSlow : tickFast
      setDisplayNum(Math.floor(Math.random() * 20) + 1)

      if (!useSlow && elapsed >= fastPhase) {
        useSlow = true
        elapsed = 0
        if (intervalRef.current) window.clearInterval(intervalRef.current)
        intervalRef.current = window.setInterval(() => {
          elapsed += tickSlow
          setDisplayNum(Math.floor(Math.random() * 20) + 1)
          if (elapsed >= slowPhase) {
            if (intervalRef.current) window.clearInterval(intervalRef.current)
            setDisplayNum(authoritativeRoll.rollResult)
            setFinalResult(authoritativeRoll.rollResult)
            setServerResult(authoritativeRoll)
            setRolled(true)
            setRolling(false)
            if (isDramatic) {
              setShake(true)
              window.setTimeout(() => setShake(false), 600)
            }
            window.setTimeout(() => setShowContinue(true), 800)
          }
        }, tickSlow)
      }
    }, tickFast)
  }

  useEffect(() => {
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current) }
  }, [])

  const displayModifier = serverResult ? serverResult.rollTotal - serverResult.rollResult : modifier
  const total = serverResult?.rollTotal ?? (finalResult !== null ? finalResult + displayModifier : null)
  const success = serverResult?.success ?? (total !== null ? total >= dc : null)
  const isCritSuccess = serverResult?.isCritSuccess ?? finalResult === 20
  const isCritFail = serverResult?.isCritFail ?? finalResult === 1

  function getDieColor(): string {
    if (!rolled) return '#f8d27a'
    if (isCritSuccess) return '#f8d27a'
    if (isCritFail) return '#fca5a5'
    if (success) return '#86efac'
    return '#fca5a5'
  }

  function resultLabel(): string {
    if (isCritSuccess) return 'Critical Success'
    if (isCritFail) return 'Critical Failure'
    return success ? 'Success' : 'Failure'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/90 text-parchment-100 backdrop-blur-sm">
      <div className="absolute inset-0">
        <img src={isDramatic ? '/media/loading/everrealm-storm-party.png' : '/media/loading/everrealm-crystal-party.png'} alt="" className="h-full w-full object-cover opacity-[0.34]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.62)_50%,rgba(0,0,0,0.94)_100%)]" />
      </div>

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <section
          className="grid w-full max-w-5xl gap-5 border border-parchment-100/30 bg-black/74 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.82)] backdrop-blur-md md:grid-cols-[minmax(0,1fr)_320px] sm:p-7"
          style={{ animation: shake ? 'shake 0.5s ease-in-out' : undefined }}
        >
          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.34em] text-cyan-200/62">Ability Check</p>
            <p className="mt-4 font-serif text-lg leading-relaxed text-parchment-200/78">{narration}</p>

            <div className={`mt-6 border p-4 ${isDramatic ? 'border-red-200/26 bg-red-500/[0.045]' : 'border-amber-200/22 bg-amber-300/[0.045]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="border border-amber-200/34 bg-amber-300/10 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.18em] text-amber-100">{statLabel}</span>
                  {displayModifier !== 0 && (
                    <span className="font-mono text-xs text-parchment-200/58">{displayModifier > 0 ? `+${displayModifier}` : displayModifier}</span>
                  )}
                </div>
                <span className="border border-red-200/30 bg-red-500/10 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.18em] text-red-100">DC {dc}</span>
              </div>

              <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/68">{rollContext.description}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border border-emerald-200/18 bg-emerald-300/[0.045] p-3">
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.2em] text-emerald-100/64">Success</p>
                  <p className="mt-2 font-serif text-xs italic leading-relaxed text-emerald-100/58">{rollContext.successDescription}</p>
                </div>
                <div className="border border-red-200/18 bg-red-500/[0.045] p-3">
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.2em] text-red-100/64">Failure</p>
                  <p className="mt-2 font-serif text-xs italic leading-relaxed text-red-100/58">{rollContext.failDescription}</p>
                </div>
              </div>
            </div>
          </div>

          <aside className="flex flex-col items-center justify-center border border-white/10 bg-white/[0.025] p-5 text-center">
            <button
              onClick={handleRollClick}
              disabled={rolling || rolled}
              className="relative flex items-center justify-center transition-all disabled:cursor-default"
              style={{
                width: 132,
                height: 132,
                background: 'radial-gradient(circle, rgba(245,158,11,0.12), rgba(0,0,0,0.82))',
                border: `1px solid ${getDieColor()}`,
                boxShadow: `0 0 44px ${getDieColor()}55`,
                clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                animation: rolling ? 'spin 0.3s linear infinite' : (!rolled ? 'pulse-glow 2s ease-in-out infinite' : undefined),
              }}
            >
              <span className="select-none font-fantasy text-5xl" style={{ color: getDieColor(), textShadow: `0 0 18px ${getDieColor()}99` }}>
                {displayNum !== null ? displayNum : '?'}
              </span>
            </button>

            {!rolled && !rolling && (
              <p className="mt-5 font-serif text-sm italic text-amber-100/58">Click to roll {rollContext.diceType}</p>
            )}
            {rolling && (
              <p className="mt-5 font-serif text-sm italic text-amber-100/64">{isDramatic ? 'The moment hangs...' : 'Rolling...'}</p>
            )}
            {error && <p className="mt-5 font-serif text-sm italic text-red-100/78">{error}</p>}

            {rolled && total !== null && finalResult !== null && (
              <div className="mt-5 w-full border border-white/10 bg-black/32 p-4">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.22em]" style={{ color: getDieColor() }}>{resultLabel()}</p>
                <p className="mt-2 font-mono text-xs text-parchment-200/62">
                  {finalResult}{displayModifier !== 0 ? ` ${displayModifier > 0 ? '+' : ''}${displayModifier}` : ''} = <span style={{ color: getDieColor() }}>{total}</span> vs DC {dc}
                </p>
                {isCritSuccess && rollContext.critSuccessDescription && (
                  <p className="mt-2 font-serif text-xs italic text-amber-100/68">{rollContext.critSuccessDescription}</p>
                )}
                {isCritFail && rollContext.critFailDescription && (
                  <p className="mt-2 font-serif text-xs italic text-red-100/68">{rollContext.critFailDescription}</p>
                )}
              </div>
            )}

            {showContinue && finalResult !== null && (
              <button
                onClick={onContinue}
                className="mt-5 w-full border px-5 py-3 font-fantasy text-xs uppercase tracking-[0.2em] transition-all"
                style={{
                  background: isCritSuccess ? 'rgba(245,158,11,0.12)' : isCritFail ? 'rgba(239,68,68,0.12)' : success ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                  borderColor: isCritSuccess ? 'rgba(245,158,11,0.48)' : isCritFail ? 'rgba(239,68,68,0.48)' : success ? 'rgba(74,222,128,0.38)' : 'rgba(239,68,68,0.38)',
                  color: getDieColor(),
                }}
              >
                {isCritSuccess ? 'See What Happens' : isCritFail ? 'Face the Consequences' : success ? 'Claim the Moment' : 'Accept the Cost'}
              </button>
            )}
          </aside>
        </section>
      </main>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(245,158,11,0.32); }
          50% { box-shadow: 0 0 62px rgba(245,158,11,0.58), 0 0 100px rgba(34,211,238,0.16); }
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
