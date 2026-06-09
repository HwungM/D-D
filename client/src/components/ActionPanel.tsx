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
  suggestedActions, onAction, disabled, disabledReason,
  location, pacingMode, inCombat, isCoop,
}: ActionPanelProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const suggestions = suggestedActions.slice(0, 4)
  const hasSuggestions = suggestions.length > 0
  const hasInput = input.trim().length > 0

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
    <div
      className="shrink-0 backdrop-blur-md"
      style={{
        borderTop: '1px solid rgba(200,146,42,0.22)',
        background: 'linear-gradient(180deg, rgba(20,13,5,0.97) 0%, rgba(14,9,3,0.99) 100%)',
        boxShadow: '0 -12px 48px rgba(0,0,0,0.6)',
      }}
    >
      <div className="space-y-2.5 px-3 py-3 sm:px-4">

        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em]"
              style={{ color: inCombat ? '#fca5a5' : 'rgba(200,146,42,0.9)' }}>
              {inCombat ? '⚔ Combat' : isCoop ? 'Party Turn' : 'Your Turn'}
            </p>
            <p className="font-serif text-xs mt-0.5" style={{ color: 'rgba(200,180,140,0.6)' }}>
              {disabledReason || 'Say what you do. The DM will call for rolls when they matter.'}
            </p>
          </div>
          {(location || pacingMode) && (
            <div className="flex min-w-0 flex-wrap gap-1.5 sm:justify-end">
              {location && (
                <span className="max-w-60 truncate px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: 'rgba(191,244,255,0.78)', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}>
                  {location}
                </span>
              )}
              {pacingMode && (
                <span className="px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: 'rgba(240,210,130,0.72)', background: 'rgba(200,146,42,0.07)', border: '1px solid rgba(200,146,42,0.2)' }}>
                  {pacingMode}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Input row */}
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              rows={2}
              className="w-full resize-none px-3 py-2.5 font-serif text-sm leading-relaxed outline-none transition-all duration-200"
              placeholder={disabled
                ? (disabledReason || 'Your character cannot act...')
                : 'Describe what you try, say, inspect, cast, risk, or ask. Enter to act.'}
              style={{
                background: 'rgba(255,245,225,0.05)',
                border: `1px solid ${hasInput ? 'rgba(200,146,42,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: 'rgba(245,234,210,0.96)',
                caretColor: '#f59e0b',
                fontStyle: 'italic',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !hasInput}
            className="self-stretch px-5 font-fantasy text-xs uppercase tracking-[0.18em] transition-all duration-200 disabled:cursor-not-allowed sm:px-6"
            style={{
              background: hasInput && !disabled ? 'rgba(200,146,42,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${hasInput && !disabled ? 'rgba(200,146,42,0.6)' : 'rgba(255,255,255,0.1)'}`,
              color: hasInput && !disabled ? '#f5dea0' : 'rgba(160,140,110,0.4)',
              minWidth: 72,
              boxShadow: hasInput && !disabled ? '0 0 18px rgba(200,146,42,0.15)' : 'none',
            }}
          >
            Act
          </button>
        </form>

        {/* Suggestions row */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowSuggestions(open => !open)}
            disabled={!hasSuggestions || disabled}
            className="px-3 py-1.5 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: showSuggestions ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)',
              border: showSuggestions ? '1px solid rgba(34,211,238,0.42)' : '1px solid rgba(255,255,255,0.1)',
              color: showSuggestions ? '#bff4ff' : 'rgba(200,180,140,0.65)',
            }}
          >
            {showSuggestions ? 'Hide Ideas' : 'Ideas'}
          </button>
          <span className="font-serif text-xs italic" style={{ color: 'rgba(180,160,120,0.5)' }}>
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
                className="min-h-[56px] px-3 py-2.5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  background: 'rgba(200,146,42,0.06)',
                  border: '1px solid rgba(200,146,42,0.22)',
                  color: '#d9c79a',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(200,146,42,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.42)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(200,146,42,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.22)' }}
              >
                <span className="mb-1 block font-fantasy text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: 'rgba(200,146,42,0.8)' }}>
                  Idea {i + 1}
                </span>
                <span className="block font-serif text-sm leading-snug"
                  style={{ color: 'rgba(240,228,200,0.85)' }}>
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
