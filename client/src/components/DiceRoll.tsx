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
  const color = isCritFail ? '#fca5a5' : isCritHit ? '#f8d27a' : '#f5e6c8'
  const glow = isCritFail
    ? '0 0 30px rgba(248,113,113,0.5), 0 0 70px rgba(127,29,29,0.38)'
    : isCritHit
      ? '0 0 40px rgba(245,158,11,0.55), 0 0 90px rgba(34,211,238,0.18)'
      : '0 0 28px rgba(245,230,200,0.22)'

  useEffect(() => {
    if (rolling) {
      setVisible(true)
      setExiting(false)
      setSpinning(true)
      audioManager.playDiceRoll()

      let count = 0
      const scramble = window.setInterval(() => {
        setDisplayNum(Math.floor(Math.random() * 20) + 1)
        count += 1
        if (count > 15) {
          window.clearInterval(scramble)
          setDisplayNum(result)
          setSpinning(false)
        }
      }, 60)

      const startExit = window.setTimeout(() => {
        setExiting(true)
      }, 3600)

      const hide = window.setTimeout(() => {
        setVisible(false)
        setExiting(false)
      }, 4100)

      return () => {
        window.clearInterval(scramble)
        window.clearTimeout(startExit)
        window.clearTimeout(hide)
      }
    }
  }, [rolling, result])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-5 left-1/2 z-40 flex flex-col items-center border border-parchment-100/24 bg-black/78 px-6 py-4 shadow-[0_24px_90px_rgba(0,0,0,0.72)] backdrop-blur-md"
      style={{
        transform: 'translateX(-50%)',
        animation: exiting
          ? 'slideDownOut 0.4s ease-in forwards'
          : 'slideUpIn 0.4s ease-out forwards',
      }}
    >
      <p className="mb-3 font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">Dice in Motion</p>
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '112px',
          height: '112px',
          animation: spinning ? 'spin 0.25s linear infinite' : 'none',
        }}
      >
        <div
          style={{
            width: '104px',
            height: '104px',
            clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
            background: 'linear-gradient(135deg, rgba(0,0,0,0.96) 0%, rgba(20,26,32,0.95) 50%, rgba(0,0,0,0.98) 100%)',
            border: `1px solid ${color}`,
            boxShadow: glow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="font-fantasy font-bold select-none"
            style={{
              fontSize: displayNum >= 10 ? '2.1rem' : '2.65rem',
              color,
              textShadow: glow,
            }}
          >
            {displayNum}
          </span>
        </div>

        {(isCritHit || isCritFail) && !spinning && (
          <div
            className="absolute inset-0 animate-pulse"
            style={{ boxShadow: glow }}
          />
        )}
      </div>

      <div className="mt-3 text-center">
        {isCritHit && (
          <p className="mb-1 animate-pulse font-fantasy text-sm uppercase tracking-[0.18em]" style={{ color: '#f8d27a' }}>
            Natural 20
          </p>
        )}
        {isCritFail && (
          <p className="mb-1 animate-pulse font-fantasy text-sm uppercase tracking-[0.18em]" style={{ color: '#fca5a5' }}>
            Critical Failure
          </p>
        )}
        <p className="font-serif text-sm text-parchment-200">{label}</p>
        {modifier !== 0 && (
          <p className="mt-0.5 font-serif text-xs text-parchment-200/48">
            rolled {result} {modifier > 0 ? `+${modifier}` : modifier} = {result + modifier}
          </p>
        )}
      </div>
    </div>
  )
}
