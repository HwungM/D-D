import { useEffect, useState } from 'react'
import { audioManager } from '../lib/audio'

interface DiceRollProps {
  rolling: boolean
  result: number
  modifier: number
  label: string
}

export default function DiceRoll({ rolling, result, modifier, label }: DiceRollProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [displayNum, setDisplayNum] = useState(result)

  const isCritFail = result === 1
  const isCritHit = result === 20
  const color = isCritFail ? '#8b1c1c' : isCritHit ? '#d4a843' : '#f5e6c8'
  const glow = isCritFail
    ? '0 0 30px rgba(139,28,28,0.8), 0 0 60px rgba(139,28,28,0.4)'
    : isCritHit
    ? '0 0 40px rgba(212,168,67,0.8), 0 0 80px rgba(212,168,67,0.4)'
    : '0 0 20px rgba(245,230,200,0.3)'

  useEffect(() => {
    if (rolling) {
      setVisible(true)
      setExiting(false)
      setSpinning(true)
      audioManager.playDiceRoll()

      let count = 0
      const scramble = setInterval(() => {
        setDisplayNum(Math.floor(Math.random() * 20) + 1)
        count++
        if (count > 15) {
          clearInterval(scramble)
          setDisplayNum(result)
          setSpinning(false)
        }
      }, 60)

      // Begin exit after 3.6s, fully hidden at 4s
      const startExit = setTimeout(() => {
        setExiting(true)
      }, 3600)

      const hide = setTimeout(() => {
        setVisible(false)
        setExiting(false)
      }, 4100)

      return () => {
        clearInterval(scramble)
        clearTimeout(startExit)
        clearTimeout(hide)
      }
    }
  }, [rolling, result])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-1/2 z-40 flex flex-col items-center pb-6"
      style={{
        transform: 'translateX(-50%)',
        animation: exiting
          ? 'slideDownOut 0.4s ease-in forwards'
          : 'slideUpIn 0.4s ease-out forwards',
      }}
    >
      {/* D20 hexagonal shape */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '130px',
          height: '130px',
          animation: spinning ? 'spin 0.25s linear infinite' : 'none',
        }}
      >
        <div
          style={{
            width: '120px',
            height: '120px',
            clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f1923 100%)',
            border: `2px solid ${color}`,
            boxShadow: glow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="font-fantasy font-bold select-none"
            style={{
              fontSize: displayNum >= 10 ? '2.2rem' : '2.8rem',
              color,
              textShadow: glow,
            }}
          >
            {displayNum}
          </span>
        </div>

        {/* Outer glow ring for crits */}
        {(isCritHit || isCritFail) && !spinning && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ boxShadow: glow }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="mt-3 text-center">
        {isCritHit && (
          <p className="font-fantasy text-sm uppercase tracking-widest animate-pulse mb-1" style={{ color: '#d4a843' }}>
            ✦ Natural 20! ✦
          </p>
        )}
        {isCritFail && (
          <p className="font-fantasy text-sm uppercase tracking-widest animate-pulse mb-1" style={{ color: '#8b1c1c' }}>
            ✦ Critical Failure! ✦
          </p>
        )}
        <p className="text-parchment-200 font-serif text-sm">{label}</p>
        {modifier !== 0 && (
          <p className="text-slate-400 text-xs font-serif mt-0.5">
            rolled {result} {modifier > 0 ? `+${modifier}` : modifier} = {result + modifier}
          </p>
        )}
      </div>
    </div>
  )
}
