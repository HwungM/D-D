import { useEffect, useState } from 'react'
import type { DiceRollResult } from '../../../shared/types'

interface DiceRollProps {
  result: DiceRollResult
  onDismiss: () => void
}

const DICE_FACES: Record<number, string> = {
  4: '△',
  6: '⬡',
  8: '◆',
  10: '⬟',
  12: '⬠',
  20: '⬣',
  100: '%',
}

export default function DiceRoll({ result, onDismiss }: DiceRollProps) {
  const [animating, setAnimating] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setAnimating(false), 600)
    return () => clearTimeout(t)
  }, [result])

  const diceSymbol = DICE_FACES[result.sides] || '◆'
  const isNat20 = result.sides === 20 && result.rolls[0] === 20
  const isNat1 = result.sides === 20 && result.rolls[0] === 1

  return (
    <div className="border border-slate-700 bg-slate-900 p-3 flex items-center gap-4 animate-fade-in">
      <div
        className={`text-4xl font-bold transition-transform ${animating ? 'animate-dice-roll' : ''} ${isNat20 ? 'text-yellow-400' : isNat1 ? 'text-ember-400' : 'text-parchment-200'}`}
        style={{ fontFamily: 'monospace' }}
      >
        {diceSymbol}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider">d{result.sides}</span>
          <span className="text-2xl font-bold text-parchment-200">{result.total}</span>
          {result.modifier !== 0 && (
            <span className="text-sm text-slate-400">
              (rolled {result.rolls[0]}{result.modifier > 0 ? '+' : ''}{result.modifier})
            </span>
          )}
        </div>
        {isNat20 && <p className="text-yellow-400 text-xs font-serif font-bold uppercase tracking-widest">Natural 20!</p>}
        {isNat1 && <p className="text-ember-400 text-xs font-serif font-bold uppercase tracking-widest">Critical Failure</p>}
        {result.description && <p className="text-slate-500 text-xs font-serif italic mt-0.5">{result.description}</p>}
      </div>
      <button onClick={onDismiss} className="text-slate-600 hover:text-slate-400 text-sm">✕</button>
    </div>
  )
}
