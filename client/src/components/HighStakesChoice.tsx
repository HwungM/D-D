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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(7px)' }}
    >
      <div
        className="w-full max-w-3xl"
        style={{
          background: 'linear-gradient(180deg, rgba(9,13,20,0.97), rgba(5,7,11,0.98))',
          border: '1px solid rgba(200,146,42,0.22)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.65), 0 0 44px rgba(200,146,42,0.08)',
        }}
      >
        <div className="px-5 sm:px-7 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p
            className="font-sans text-[11px] uppercase mb-3"
            style={{ color: 'rgba(200,146,42,0.72)', letterSpacing: '0.18em' }}
          >
            The situation turns
          </p>
          <p className="font-serif text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(232,212,168,0.9)' }}>
            {narration}
          </p>
        </div>

        <form onSubmit={submit} className="px-5 sm:px-7 py-5 space-y-4">
          <div>
            <label className="block font-serif text-xs uppercase mb-2" style={{ color: 'rgba(200,146,42,0.62)', letterSpacing: '0.12em' }}>
              What do you do?
            </label>
            <textarea
              ref={inputRef}
              value={response}
              onChange={e => setResponse(e.target.value)}
              rows={4}
              autoFocus
              className="w-full resize-none font-serif text-sm outline-none"
              placeholder="Write your own response. You can negotiate, run, sacrifice something, attack, reveal a secret, ask a question, use an item, or do something stranger."
              style={{
                background: 'rgba(255,255,255,0.035)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderColor: response.trim() ? 'rgba(200,146,42,0.34)' : 'rgba(255,255,255,0.09)',
                color: '#d4c5a0',
                padding: '12px 14px',
                caretColor: '#c8922a',
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowIdeas(v => !v)}
              className="font-serif text-xs px-3 py-2 transition-all"
              style={{
                background: showIdeas ? 'rgba(200,146,42,0.12)' : 'rgba(255,255,255,0.03)',
                border: showIdeas ? '1px solid rgba(200,146,42,0.42)' : '1px solid rgba(255,255,255,0.08)',
                color: showIdeas ? '#d9c79a' : 'rgba(180,160,120,0.62)',
                letterSpacing: '0.04em',
              }}
            >
              {showIdeas ? 'Hide Ideas' : 'Need Ideas?'}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCustom}
                className="font-serif text-xs px-3 py-2 transition-all"
                style={{ color: 'rgba(160,140,110,0.48)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                Return to chat
              </button>
              <button
                type="submit"
                disabled={!response.trim() || submitting}
                className="font-serif text-sm px-5 py-2 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                style={{
                  background: response.trim() && !submitting
                    ? 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(140,30,20,0.45))'
                    : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(192,57,43,0.45)',
                  color: '#e8b09a',
                  letterSpacing: '0.05em',
                }}
              >
                Respond
              </button>
            </div>
          </div>

          {showIdeas && choices.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
              {choices.map((choice, idx) => (
                <button
                  key={`${choice.title}-${idx}`}
                  type="button"
                  onClick={() => draft(choice)}
                  className="text-left min-h-[132px] px-3 py-3 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(200,146,42,0.16)',
                    color: '#d9c79a',
                  }}
                >
                  <span className="block font-fantasy text-base mb-2" style={{ color: '#e8c87a' }}>
                    {choice.title}
                  </span>
                  <span className="block font-serif text-xs leading-relaxed mb-3" style={{ color: 'rgba(200,180,140,0.72)' }}>
                    {choice.description}
                  </span>
                  <span className="block font-serif text-[11px] italic" style={{ color: 'rgba(180,80,60,0.7)' }}>
                    {choice.consequenceHint}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
