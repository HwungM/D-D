import { useState, FormEvent, KeyboardEvent } from 'react'

interface ActionPanelProps {
  suggestedActions: string[]
  onAction: (action: string) => void
  disabled: boolean
  location?: string
  pacingMode?: string
  inCombat?: boolean
  isCoop?: boolean
}

export default function ActionPanel({
  suggestedActions,
  onAction,
  disabled,
  location,
  pacingMode,
  inCombat,
  isCoop,
}: ActionPanelProps) {
  const [input, setInput] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const choices = suggestedActions.slice(0, 4)
  const hasChoices = choices.length > 0

  function submitAction(action: string) {
    const trimmed = action.trim()
    if (!trimmed || disabled) return
    onAction(trimmed)
    setInput('')
    setCustomOpen(false)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submitAction(input)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitAction(input)
    }
  }

  return (
    <div className="shrink-0" style={{ background: 'rgba(6,8,13,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-4 pt-3 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-[11px] uppercase" style={{ color: 'rgba(200,146,42,0.9)', letterSpacing: '0.08em' }}>
              {inCombat ? 'Combat Choice' : 'Moment of Choice'}
            </p>
            <p className="font-serif text-xs mt-0.5" style={{ color: 'rgba(180,160,120,0.52)' }}>
              {isCoop ? 'Choose your move while the party weighs the moment.' : 'Choose a path, or write your own.'}
            </p>
          </div>
          {(location || pacingMode) && (
            <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-0">
              {location && (
                <span className="font-serif text-xs truncate max-w-56" style={{ color: 'rgba(232,212,168,0.7)' }}>
                  {location}
                </span>
              )}
              {pacingMode && (
                <span className="font-serif text-[10px] uppercase" style={{ color: 'rgba(160,140,110,0.42)', letterSpacing: '0.08em' }}>
                  {pacingMode}
                </span>
              )}
            </div>
          )}
        </div>

        {hasChoices && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {choices.map((action, i) => (
              <button
                key={`${action}-${i}`}
                type="button"
                onClick={() => submitAction(action)}
                disabled={disabled}
                className="group text-left min-h-[76px] px-4 py-3 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: i === 0 ? 'rgba(200,146,42,0.09)' : 'rgba(255,255,255,0.03)',
                  border: i === 0 ? '1px solid rgba(200,146,42,0.45)' : '1px solid rgba(200,146,42,0.18)',
                  boxShadow: i === 0 ? '0 0 22px rgba(200,146,42,0.08)' : 'none',
                }}
              >
                <span className="block font-serif text-[10px] uppercase mb-1" style={{ color: 'rgba(200,146,42,0.78)', letterSpacing: '0.08em' }}>
                  Choice {i + 1}
                </span>
                <span className="block font-serif text-sm leading-snug" style={{ color: '#d9c79a' }}>
                  {action}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCustomOpen(open => !open)}
            disabled={disabled && !customOpen}
            className="font-serif text-xs px-3 py-2 transition-all duration-200 disabled:opacity-30"
            style={{
              background: customOpen || !hasChoices ? 'rgba(192,57,43,0.16)' : 'rgba(255,255,255,0.03)',
              border: customOpen || !hasChoices ? '1px solid rgba(192,57,43,0.42)' : '1px solid rgba(255,255,255,0.08)',
              color: customOpen || !hasChoices ? '#e8b09a' : 'rgba(180,160,120,0.58)',
              letterSpacing: '0.04em',
            }}
          >
            {customOpen || !hasChoices ? 'Custom Action' : 'Write Custom Action'}
          </button>
          {!hasChoices && (
            <span className="font-serif text-xs italic" style={{ color: 'rgba(160,140,110,0.42)' }}>
              The DM is waiting for your move.
            </span>
          )}
        </div>

        {(customOpen || !hasChoices) && (
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                rows={2}
                className="w-full resize-none font-serif text-sm outline-none transition-all duration-200"
                placeholder={disabled ? 'Your character cannot act...' : 'What do you do? Enter to act, Shift+Enter for a new line.'}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderColor: input.trim() ? 'rgba(192,57,43,0.35)' : 'rgba(255,255,255,0.08)',
                  color: '#d4c5a0',
                  padding: '10px 12px',
                  caretColor: '#c89228',
                }}
              />
              <style>{`textarea::placeholder { color: rgba(160,140,110,0.35); font-style: italic; }`}</style>
            </div>
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className="font-serif text-sm px-5 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed self-stretch"
              style={{
                background: input.trim() && !disabled
                  ? 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(140,30,20,0.45))'
                  : 'rgba(255,255,255,0.04)',
                border: '1px solid',
                borderColor: input.trim() && !disabled ? 'rgba(192,57,43,0.5)' : 'rgba(255,255,255,0.08)',
                color: input.trim() && !disabled ? '#e8b09a' : 'rgba(160,140,110,0.35)',
                letterSpacing: '0.05em',
                minWidth: '64px',
              }}
            >
              Act
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
