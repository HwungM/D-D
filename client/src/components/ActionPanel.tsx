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
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestions = suggestedActions.slice(0, 4)
  const hasSuggestions = suggestions.length > 0

  function submitAction(action: string) {
    const trimmed = action.trim()
    if (!trimmed || disabled) return
    onAction(trimmed)
    setInput('')
    setShowSuggestions(false)
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
      <div className="px-4 py-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="font-serif text-[11px] uppercase" style={{ color: 'rgba(200,146,42,0.88)', letterSpacing: '0.08em' }}>
              {inCombat ? 'Combat' : isCoop ? 'Party Turn' : 'Your Turn'}
            </p>
            <p className="font-serif text-xs mt-0.5" style={{ color: 'rgba(180,160,120,0.52)' }}>
              Say what you do. The DM will call for rolls when they matter.
            </p>
          </div>
          {(location || pacingMode) && (
            <div className="flex sm:flex-col sm:items-end gap-2 sm:gap-0.5 min-w-0">
              {location && (
                <span className="font-serif text-xs truncate max-w-64" style={{ color: 'rgba(232,212,168,0.7)' }}>
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

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowSuggestions(open => !open)}
            disabled={!hasSuggestions || disabled}
            className="font-serif text-xs px-3 py-2 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: showSuggestions ? 'rgba(200,146,42,0.12)' : 'rgba(255,255,255,0.03)',
              border: showSuggestions ? '1px solid rgba(200,146,42,0.42)' : '1px solid rgba(255,255,255,0.08)',
              color: showSuggestions ? '#d9c79a' : 'rgba(180,160,120,0.58)',
              letterSpacing: '0.04em',
            }}
          >
            {showSuggestions ? 'Hide Suggestions' : 'Suggestions'}
          </button>
          <span className="font-serif text-xs italic" style={{ color: 'rgba(160,140,110,0.42)' }}>
            {hasSuggestions ? 'Optional ideas if you want a nudge.' : 'No suggestions yet.'}
          </span>
        </div>

        {showSuggestions && hasSuggestions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((action, i) => (
              <button
                key={`${action}-${i}`}
                type="button"
                onClick={() => submitAction(action)}
                disabled={disabled}
                className="text-left min-h-[54px] px-3 py-2 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(200,146,42,0.18)',
                  color: '#d9c79a',
                }}
              >
                <span className="block font-serif text-[10px] uppercase mb-1" style={{ color: 'rgba(200,146,42,0.62)', letterSpacing: '0.08em' }}>
                  Idea {i + 1}
                </span>
                <span className="block font-serif text-sm leading-snug">
                  {action}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
