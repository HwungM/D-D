import { useEffect, useState } from 'react'
import type { Ability } from '../../../shared/types'

interface LevelUpScreenProps {
  level: number
  hpGained: number
  newAbility: Ability | null
  characterName: string
  onContinue: () => void
}

export default function LevelUpScreen({ level, hpGained, newAbility, characterName, onContinue }: LevelUpScreenProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(2,6,12,0.92)' }}
    >
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, rgba(212,168,67,0.15) 0%, transparent 65%)',
      }} />

      <div
        className="relative z-10 text-center max-w-lg px-8"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        {/* Level badge */}
        <div className="relative inline-block mb-6">
          <div
            className="w-32 h-32 rounded-full border-4 border-amber-400/60 flex items-center justify-center mx-auto"
            style={{
              background: 'radial-gradient(circle, #1a1206 0%, #0a0904 100%)',
              boxShadow: '0 0 60px rgba(212,168,67,0.5), 0 0 120px rgba(212,168,67,0.2)',
              animation: 'torchFlicker 2s ease-in-out infinite',
            }}
          >
            <span className="font-fantasy text-5xl text-amber-400" style={{ textShadow: '0 0 20px rgba(212,168,67,0.8)' }}>
              {level}
            </span>
          </div>
          {/* Orbiting sparkles */}
          {[0, 60, 120, 180, 240, 300].map((deg, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-amber-400"
              style={{
                top: '50%',
                left: '50%',
                transform: `rotate(${deg}deg) translateX(72px) translateY(-50%)`,
                opacity: 0.6,
                animation: `flicker ${0.8 + i * 0.15}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>

        <p className="text-amber-400/70 text-xs uppercase tracking-[0.3em] mb-2 font-sans">
          — Level Attained —
        </p>
        <h1
          className="font-fantasy text-5xl mb-1"
          style={{
            color: '#d4a843',
            textShadow: '0 0 30px rgba(212,168,67,0.7), 0 2px 4px rgba(0,0,0,0.9)',
          }}
        >
          Level {level}
        </h1>
        <p className="text-parchment-300/60 font-serif italic text-sm mb-8">
          {characterName} grows stronger
        </p>

        {/* Stats gained */}
        <div className="flex justify-center gap-4 mb-8">
          <div className="border border-amber-400/30 bg-amber-400/5 px-5 py-3 text-center">
            <p className="text-xs uppercase tracking-widest text-amber-400/60 mb-1">Hit Points</p>
            <p className="font-fantasy text-2xl text-amber-400">+{hpGained}</p>
          </div>
          {newAbility && (
            <div className="border border-amber-400/30 bg-amber-400/5 px-5 py-3 text-center">
              <p className="text-xs uppercase tracking-widest text-amber-400/60 mb-1">New Ability</p>
              <p className="font-fantasy text-lg text-amber-400">{newAbility.name}</p>
            </div>
          )}
        </div>

        {/* Ability description */}
        {newAbility && (
          <div
            className="mb-8 p-5 text-left"
            style={{
              background: 'linear-gradient(135deg, #f5e6c8 0%, #e8d49a 100%)',
              borderTop: '2px solid rgba(212,168,67,0.5)',
              borderBottom: '2px solid rgba(212,168,67,0.5)',
              boxShadow: '0 0 20px rgba(212,168,67,0.15)',
            }}
          >
            <p className="text-xs uppercase tracking-widest text-amber-800/70 mb-1 font-sans">Ability Unlocked</p>
            <h3 className="font-fantasy text-xl text-gray-800 mb-2">{newAbility.name}</h3>
            <p className="font-serif text-sm text-gray-700 leading-relaxed">{newAbility.description}</p>
          </div>
        )}

        <button
          onClick={onContinue}
          className="fantasy-btn text-sm px-10 py-3"
          style={{ boxShadow: '0 0 20px rgba(192,57,43,0.3)' }}
        >
          Continue Your Journey
        </button>
      </div>
    </div>
  )
}
