import type { PendingMacroEvent } from '../../../shared/types'

const DIFFICULTY_STYLE = {
  easy: { color: '#86efac', border: 'rgba(134,239,172,0.35)', bg: 'rgba(34,197,94,0.1)' },
  moderate: { color: '#fde68a', border: 'rgba(253,230,138,0.35)', bg: 'rgba(245,158,11,0.1)' },
  hard: { color: '#fdba74', border: 'rgba(253,186,116,0.4)', bg: 'rgba(249,115,22,0.11)' },
  deadly: { color: '#fca5a5', border: 'rgba(252,165,165,0.45)', bg: 'rgba(239,68,68,0.13)' },
}

export default function MacroEventModal({ event, loading, onChoose }: {
  event: PendingMacroEvent
  loading: boolean
  onChoose: (choice: PendingMacroEvent['choices'][number]['id']) => void
}) {
  const difficulty = DIFFICULTY_STYLE[event.difficulty]
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/78 p-4 backdrop-blur-md">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-amber-200/25 bg-[linear-gradient(145deg,rgba(31,22,12,0.99),rgba(11,10,9,0.99))] shadow-[0_32px_140px_rgba(0,0,0,0.85)]">
        <div className="border-b border-amber-200/14 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/68">
              {event.kind === 'companion_emergency' ? 'Companion Emergency' : 'Major Event'}
            </p>
            <span className="rounded-full border px-3 py-1 font-fantasy text-[9px] uppercase tracking-[0.16em]" style={{ color: difficulty.color, borderColor: difficulty.border, background: difficulty.bg }}>
              {event.difficulty} difficulty
            </span>
          </div>
          <h2 className="mt-3 font-fantasy text-3xl text-parchment-100">{event.title}</h2>
          <p className="mt-3 font-serif text-base leading-relaxed text-parchment-200/88">{event.description}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-cyan-100/66">
            <span className="rounded-full border border-cyan-200/15 bg-cyan-300/5 px-3 py-1">{event.location}{event.subLocation ? ` — ${event.subLocation}` : ''}</span>
            {event.enemy && <span className="rounded-full border border-red-200/15 bg-red-300/5 px-3 py-1">Threat: {event.enemy.name}</span>}
          </div>
        </div>
        <div className="space-y-2 p-5">
          {event.choices.map(choice => (
            <button
              key={choice.id}
              type="button"
              disabled={loading}
              onClick={() => onChoose(choice.id)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-amber-200/30 hover:bg-amber-200/[0.07] disabled:opacity-40"
            >
              <span className="block font-fantasy text-xs uppercase tracking-[0.14em] text-parchment-100">{choice.label}</span>
              <span className="mt-1 block font-serif text-sm text-parchment-200/68">{choice.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
