import { useRef, useState, FormEvent, KeyboardEvent } from 'react'

interface ActionPanelProps {
  suggestedActions: string[]
  onAction: (action: string) => void
  disabled: boolean
  disabledReason?: string
  location?: string
  pacingMode?: string
  inCombat?: boolean
  isCoop?: boolean
}

export default function ActionPanel({
  suggestedActions,
  onAction,
  disabled,
  disabledReason,
  location,
  pacingMode,
  inCombat,
  isCoop,
}: ActionPanelProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  function draftSuggestion(action: string) {
    if (disabled) return
    setInput(action)
    setShowSuggestions(false)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  return (
    <div className="shrink-0" style={{
      background: 'linear-gradient(180deg, rgba(13,18,28,0.98), rgba(6,8,13,0.99))',
      borderTop: '1px solid rgba(200,146,42,0.14)',
      boxShadow: '0 -16px 48px rgba(0,0,0,0.28)',
    }}>
      <div className="px-3 sm:px-4 py-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="font-serif text-[11px] uppercase" style={{ color: 'rgba(200,146,42,0.88)', letterSpacing: '0.08em' }}>
              {inCombat ? 'Combat' : isCoop ? 'Party Turn' : 'Your Turn'}
            </p>
            <p className="font-serif text-xs mt-0.5" style={{ color: 'rgba(180,160,120,0.52)' }}>
              {disabledReason || 'Say what you do. The DM will call for rolls when they matter.'}
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
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              rows={2}
              className="w-full resize-none font-serif text-sm outline-none transition-all duration-200 rounded-md"
              placeholder={disabled ? (disabledReason || 'Your character cannot act...') : 'Describe what you try, say, inspect, cast, risk, or ask. Enter to act.'}
              style={{
                background: 'rgba(255,255,255,0.045)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderColor: input.trim() ? 'rgba(34,211,238,0.34)' : 'rgba(255,255,255,0.09)',
                color: '#d4c5a0',
                padding: '11px 13px',
                caretColor: '#67e8f9',
                boxShadow: input.trim() ? '0 0 0 1px rgba(34,211,238,0.08), 0 0 22px rgba(34,211,238,0.08)' : 'inset 0 0 24px rgba(0,0,0,0.18)',
              }}
            />
            <style>{`textarea::placeholder { color: rgba(160,140,110,0.35); font-style: italic; }`}</style>
          </div>
          <button
            type="submit"
            disabled={disabled || !input.trim()}
            className="font-serif text-sm px-5 sm:px-6 rounded-md transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed self-stretch"
            style={{
              background: input.trim() && !disabled
                ? 'linear-gradient(135deg, rgba(192,57,43,0.36), rgba(34,211,238,0.16))'
                : 'rgba(255,255,255,0.04)',
              border: '1px solid',
              borderColor: input.trim() && !disabled ? 'rgba(200,146,42,0.46)' : 'rgba(255,255,255,0.08)',
              color: input.trim() && !disabled ? '#f2dfb6' : 'rgba(160,140,110,0.35)',
              letterSpacing: '0.05em',
              minWidth: '72px',
              boxShadow: input.trim() && !disabled ? '0 10px 30px rgba(0,0,0,0.24), 0 0 20px rgba(200,146,42,0.1)' : undefined,
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
            className="font-serif text-xs px-3 py-2 rounded-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: showSuggestions ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
              border: showSuggestions ? '1px solid rgba(34,211,238,0.36)' : '1px solid rgba(255,255,255,0.08)',
              color: showSuggestions ? '#bff4ff' : 'rgba(180,160,120,0.58)',
              letterSpacing: '0.04em',
            }}
          >
            {showSuggestions ? 'Hide Ideas' : 'Ideas'}
          </button>
          <span className="font-serif text-xs italic" style={{ color: 'rgba(160,140,110,0.42)' }}>
            {hasSuggestions ? 'Optional nudges. Click one to draft it, then edit or send.' : 'No ideas yet. Trust your instinct.'}
          </span>
        </div>

        {showSuggestions && hasSuggestions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-fade-in">
            {suggestions.map((action, i) => (
              <button
                key={`${action}-${i}`}
                type="button"
                onClick={() => draftSuggestion(action)}
                disabled={disabled}
                className="text-left min-h-[54px] px-3 py-2 rounded-md transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(34,211,238,0.025))',
                  border: '1px solid rgba(200,146,42,0.18)',
                  color: '#d9c79a',
                }}
              >
                <span className="block font-serif text-[10px] uppercase mb-1" style={{ color: 'rgba(200,146,42,0.62)', letterSpacing: '0.08em' }}>
                  Draft Idea {i + 1}
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
