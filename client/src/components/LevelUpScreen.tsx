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
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#050607] text-parchment-100">
      <div className="absolute inset-0">
        <img src="/media/loading/everrealm-eclipse-citadel.png" alt="" className="h-full w-full object-cover opacity-[0.5]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.58)_50%,rgba(0,0,0,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.16)_0%,rgba(0,0,0,0)_58%)]" />
      </div>

      <div
        className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <section className="grid w-full max-w-4xl gap-5 border border-parchment-100/34 bg-black/70 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.78)] backdrop-blur-md md:grid-cols-[260px_minmax(0,1fr)] sm:p-7">
          <div className="flex flex-col items-center justify-center border border-amber-200/22 bg-amber-300/[0.045] p-5 text-center">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-amber-200/62">Level Attained</p>
            <div className="mt-5 flex h-32 w-32 items-center justify-center border border-amber-200/52 bg-black/58 shadow-[0_0_70px_rgba(245,158,11,0.22)]">
              <span className="font-fantasy text-6xl text-amber-100" style={{ textShadow: '0 0 30px rgba(245,158,11,0.5)' }}>
                {level}
              </span>
            </div>
            <h1 className="mt-5 font-fantasy text-4xl text-parchment-100">Level {level}</h1>
            <p className="mt-2 font-serif text-sm italic text-parchment-200/58">{characterName} grows stronger</p>
          </div>

          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-cyan-200/62">The Realm Responds</p>
            <h2 className="mt-2 font-fantasy text-4xl text-parchment-100">Power takes shape.</h2>
            <p className="mt-3 font-serif text-sm leading-relaxed text-parchment-200/66">
              Your legend deepens. The next danger will know you are no longer the same adventurer who entered this story.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="border border-emerald-200/20 bg-emerald-300/[0.045] p-4">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-emerald-200/64">Hit Points</p>
                <p className="mt-2 font-fantasy text-3xl text-emerald-100">+{hpGained}</p>
              </div>
              {newAbility && (
                <div className="border border-amber-200/22 bg-amber-300/[0.045] p-4">
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/64">New Ability</p>
                  <p className="mt-2 font-fantasy text-2xl text-parchment-100">{newAbility.name}</p>
                </div>
              )}
            </div>

            {newAbility && (
              <div className="mt-5 border border-white/10 bg-white/[0.025] p-4">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">Ability Unlocked</p>
                <h3 className="mt-2 font-fantasy text-2xl text-parchment-100">{newAbility.name}</h3>
                <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/66">{newAbility.description}</p>
              </div>
            )}

            <button
              onClick={onContinue}
              className="mt-6 w-full border border-amber-300/46 bg-amber-300/12 px-5 py-4 font-fantasy text-xs uppercase tracking-[0.22em] text-amber-100 shadow-[0_0_36px_rgba(245,158,11,0.12)] transition-all hover:border-amber-200 hover:bg-amber-300/18"
            >
              Continue Your Journey
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
