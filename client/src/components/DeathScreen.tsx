import { useEffect, useState } from 'react'

interface DeathScreenProps {
  characterName: string
  deathNote?: string
  campaignId: string
  onRiseAgain: () => void
  onReturnToHall: () => void
}

export default function DeathScreen({ characterName, deathNote, onRiseAgain, onReturnToHall }: DeathScreenProps) {
  const [visible, setVisible] = useState(false)
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    const t1 = window.setTimeout(() => setVisible(true), 100)
    const t2 = window.setTimeout(() => setShowButtons(true), 2400)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-[#050607] text-parchment-100"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.1s ease-in',
      }}
    >
      <div className="absolute inset-0">
        <img src="/media/loading/everrealm-storm-party.png" alt="" className="h-full w-full object-cover opacity-[0.38]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.66)_50%,rgba(0,0,0,0.94)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(127,29,29,0.28)_0%,rgba(0,0,0,0)_56%)]" />
      </div>

      <div
        className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 1.4s ease-out 0.35s, transform 1.4s ease-out 0.35s',
        }}
      >
        <section className="w-full max-w-2xl border border-red-200/24 bg-black/72 p-6 text-center shadow-[0_30px_130px_rgba(0,0,0,0.82)] backdrop-blur-md sm:p-8">
          <p className="font-fantasy text-[10px] uppercase tracking-[0.34em] text-red-200/62">Final Breath</p>
          <h1 className="mt-3 font-fantasy text-5xl uppercase tracking-[0.08em] text-red-100 sm:text-6xl">
            You Have Fallen
          </h1>
          <p className="mt-4 font-fantasy text-xl text-parchment-100">{characterName}</p>

          {deathNote && (
            <div className="mx-auto mt-6 max-w-xl border border-white/10 bg-white/[0.025] p-4 text-left">
              <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/48">Last Chronicle</p>
              <p className="mt-2 font-serif text-sm italic leading-relaxed text-parchment-200/68">"{deathNote}"</p>
            </div>
          )}

          <div className="mx-auto my-8 h-px w-32 bg-[linear-gradient(90deg,transparent,rgba(248,113,113,0.54),transparent)]" />

          <p className="font-serif text-sm italic text-parchment-200/48">
            The realm does not mourn long, but it remembers.
          </p>

          {showButtons && (
            <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3" style={{ animation: 'fadeIn 0.8s ease-out forwards' }}>
              <button
                onClick={onRiseAgain}
                className="border border-red-300/42 bg-red-500/12 px-5 py-4 font-fantasy text-xs uppercase tracking-[0.22em] text-red-100 transition-all hover:border-red-200 hover:bg-red-500/18"
              >
                Rise Again
                <span className="mt-1 block font-serif text-[10px] uppercase tracking-[0.18em] text-red-100/44">Create a new character</span>
              </button>

              <button
                onClick={onReturnToHall}
                className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
              >
                Return to the Hall
              </button>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
