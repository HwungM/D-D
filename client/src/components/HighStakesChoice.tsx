import { FormEvent, useRef, useState } from 'react'
import type { HighStakesChoice as HighStakesChoiceType } from '../../../shared/types'

interface Props {
  narration: string
  choices: HighStakesChoiceType[]
  onChoose: (choice: string) => void
  onCustom: () => void
}

export default function HighStakesChoice({ narration, choices, onChoose, onCustom }: Props) {
  const [response, setResponse] = useState('')
  const [showIdeas, setShowIdeas] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = response.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    window.setTimeout(() => onChoose(trimmed), 220)
  }

  function draft(choice: HighStakesChoiceType) {
    setResponse(choice.title)
    setShowIdeas(false)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/88 text-parchment-100 backdrop-blur-sm">
      <div className="absolute inset-0">
        <img src="/media/loading/everrealm-storm-party.png" alt="" className="h-full w-full object-cover opacity-[0.32]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.66)_50%,rgba(0,0,0,0.94)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(248,113,113,0.18)_0%,rgba(0,0,0,0)_58%)]" />
      </div>

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <section className="w-full max-w-4xl border border-red-200/24 bg-black/74 shadow-[0_30px_130px_rgba(0,0,0,0.82)] backdrop-blur-md">
          <header className="border-b border-white/10 px-5 py-5 sm:px-7">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.34em] text-red-200/62">
              High Stakes
            </p>
            <h2 className="mt-2 font-fantasy text-4xl text-parchment-100">The scene turns.</h2>
            <p className="mt-4 max-h-[28vh] overflow-y-auto whitespace-pre-wrap font-serif text-base leading-relaxed text-parchment-200/76">
              {narration}
            </p>
          </header>

          <form onSubmit={submit} className="space-y-4 px-5 py-5 sm:px-7">
            <div>
              <label className="block font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62 mb-2">
                What do you do?
              </label>
              <textarea
                ref={inputRef}
                value={response}
                onChange={e => setResponse(e.target.value)}
                rows={4}
                autoFocus
                className="w-full resize-none border border-white/10 bg-white/[0.035] px-4 py-3 font-serif text-sm leading-relaxed text-parchment-100 outline-none transition-all placeholder:text-parchment-200/30 focus:border-cyan-200/42"
                placeholder="Write your own response. Negotiate, run, sacrifice something, attack, reveal a secret, use an item, or do something stranger."
                style={{ caretColor: '#67e8f9', borderColor: response.trim() ? 'rgba(34,211,238,0.38)' : undefined }}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setShowIdeas(v => !v)}
                className="border px-4 py-3 font-fantasy text-[10px] uppercase tracking-[0.18em] transition-all"
                style={{
                  background: showIdeas ? 'rgba(34,211,238,0.09)' : 'rgba(255,255,255,0.03)',
                  borderColor: showIdeas ? 'rgba(34,211,238,0.36)' : 'rgba(255,255,255,0.08)',
                  color: showIdeas ? '#bff4ff' : 'rgba(180,160,120,0.58)',
                }}
              >
                {showIdeas ? 'Hide Ideas' : 'Ideas'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCustom}
                  className="border border-white/12 px-4 py-3 font-fantasy text-[10px] uppercase tracking-[0.18em] text-parchment-200/60 transition-all hover:border-white/24 hover:text-parchment-100"
                >
                  Return
                </button>
                <button
                  type="submit"
                  disabled={!response.trim() || submitting}
                  className="border border-amber-300/46 bg-amber-300/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Respond
                </button>
              </div>
            </div>

            {showIdeas && choices.length > 0 && (
              <div className="grid grid-cols-1 gap-2 pt-1 md:grid-cols-3">
                {choices.map((choice, idx) => (
                  <button
                    key={`${choice.title}-${idx}`}
                    type="button"
                    onClick={() => draft(choice)}
                    className="min-h-[148px] border border-amber-200/18 bg-white/[0.025] px-4 py-4 text-left transition-all hover:border-amber-200/36 hover:bg-amber-300/[0.045]"
                  >
                    <span className="block font-fantasy text-lg text-parchment-100">{choice.title}</span>
                    <span className="mt-3 block font-serif text-xs leading-relaxed text-parchment-200/64">{choice.description}</span>
                    <span className="mt-3 block font-serif text-[11px] italic text-red-100/58">{choice.consequenceHint}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </section>
      </main>
    </div>
  )
}
