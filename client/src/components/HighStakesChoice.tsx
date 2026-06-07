import { useState } from 'react'
import type { HighStakesChoice as HighStakesChoiceType } from '../../../shared/types'

interface Props {
  narration: string
  choices: HighStakesChoiceType[]
  onChoose: (choice: string) => void
  onCustom: () => void
}

export default function HighStakesChoice({ narration, choices, onChoose, onCustom }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)

  function handleChoose(idx: number, title: string) {
    if (chosen !== null) return
    setChosen(idx)
    setTimeout(() => onChoose(title), 400)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)' }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <p
          className="font-sans text-xs uppercase tracking-[0.3em] mb-4"
          style={{ color: 'rgba(200,146,42,0.7)' }}
        >
          Critical Decision
        </p>
        <div
          style={{
            width: 60,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(200,146,42,0.5), transparent)',
            margin: '0 auto',
          }}
        />
      </div>

      {/* Narration setup text */}
      <div className="max-w-xl text-center mb-10 px-6">
        <p
          className="font-serif text-base leading-relaxed"
          style={{ color: 'rgba(212,197,160,0.85)' }}
        >
          {narration}
        </p>
      </div>

      {/* Choice cards */}
      <div
        className="flex gap-4 px-6 max-w-4xl w-full"
        style={{ flexWrap: choices.length > 2 ? 'wrap' : 'nowrap', justifyContent: 'center' }}
      >
        {choices.map((choice, idx) => {
          const isHovered = hoveredIdx === idx
          const isChosen = chosen === idx
          return (
            <button
              key={idx}
              onClick={() => handleChoose(idx, choice.title)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              disabled={chosen !== null}
              style={{
                flex: '1 1 220px',
                maxWidth: '280px',
                minHeight: '200px',
                background: isChosen
                  ? 'rgba(200,146,42,0.12)'
                  : isHovered
                    ? 'rgba(200,146,42,0.07)'
                    : 'rgba(255,255,255,0.025)',
                border: isChosen
                  ? '1px solid rgba(200,146,42,0.7)'
                  : isHovered
                    ? '1px solid rgba(200,146,42,0.5)'
                    : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isHovered || isChosen
                  ? '0 0 24px rgba(200,146,42,0.15)'
                  : 'none',
                transform: isHovered && chosen === null ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.2s ease',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                cursor: chosen !== null ? 'default' : 'pointer',
              }}
            >
              {/* Card title */}
              <h3
                className="font-fantasy text-xl mb-3"
                style={{ color: isHovered || isChosen ? '#c8922a' : '#d4c5a0' }}
              >
                {choice.title}
              </h3>

              {/* Description */}
              <p
                className="font-serif text-sm leading-relaxed flex-1"
                style={{ color: 'rgba(200,180,140,0.75)' }}
              >
                {choice.description}
              </p>

              {/* Consequence hint */}
              <p
                className="font-serif text-xs italic mt-4"
                style={{ color: 'rgba(180,80,60,0.7)' }}
              >
                {choice.consequenceHint}
              </p>
            </button>
          )
        })}
      </div>

      {/* Custom response escape hatch */}
      <div className="mt-8">
        <button
          onClick={onCustom}
          className="font-serif text-xs transition-colors"
          style={{ color: 'rgba(160,140,110,0.35)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(200,180,140,0.6)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(160,140,110,0.35)' }}
        >
          write my own response instead
        </button>
      </div>
    </div>
  )
}
