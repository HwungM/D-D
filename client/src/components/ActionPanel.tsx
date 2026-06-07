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
    <div className="shrink-0 border-t border-parchment-100/16 bg-black/64 shadow-[0_-18px_70px_rgba(0,0,0,0.36)] backdrop-blur-md">
      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/72">
              {inCombat ? 'Combat' : isCoop ? 'Party Turn' : 'Your Turn'}
            </p>
            <p className="font-serif text-xs mt-0.5" style={{ color: 'rgba(180,160,120,0.52)' }}>
              {disabledReason || 'Say what you do. The DM will call for rolls when they matter.'}
            </p>
          </div>
          {(location || pacingMode) && (
            <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
              {location && (
                <span className="max-w-64 truncate border border-cyan-200/18 bg-cyan-200/[0.045] px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">
                  {location}
                </span>
              )}
              {pacingMode && (
                <span className="border border-amber-200/18 bg-amber-300/[0.045] px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.14em] text-amber-100/58">
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
              className="w-full resize-none border border-white/10 bg-white/[0.035] px-3 py-3 font-serif text-sm leading-relaxed text-parchment-100 outline-none transition-all duration-200 placeholder:text-parchment-200/30 focus:border-cyan-200/45"
              placeholder={disabled ? (disabledReason || 'Your character cannot act...') : 'Describe what you try, say, inspect, cast, risk, or ask. Enter to act.'}
              style={{
                caretColor: '#67e8f9',
              }}
            />
            <style>{`textarea::placeholder { color: rgba(160,140,110,0.35); font-style: italic; }`}</style>
          </div>
          <button
            type="submit"
            disabled={disabled || !input.trim()}
            className="self-stretch border px-5 font-fantasy text-xs uppercase tracking-[0.18em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30 sm:px-6"
            style={{
              background: input.trim() && !disabled
                ? 'rgba(245,158,11,0.12)'
                : 'rgba(255,255,255,0.04)',
              borderColor: input.trim() && !disabled ? 'rgba(251,191,36,0.46)' : 'rgba(255,255,255,0.08)',
              color: input.trim() && !disabled ? '#f2dfb6' : 'rgba(160,140,110,0.35)',
              minWidth: '72px',
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
            className="border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: showSuggestions ? 'rgba(34,211,238,0.09)' : 'rgba(255,255,255,0.03)',
              border: showSuggestions ? '1px solid rgba(34,211,238,0.36)' : '1px solid rgba(255,255,255,0.08)',
              color: showSuggestions ? '#bff4ff' : 'rgba(180,160,120,0.58)',
            }}
          >
            {showSuggestions ? 'Hide Ideas' : 'Ideas'}
          </button>
          <span className="font-serif text-xs italic text-parchment-200/42">
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
                className="min-h-[58px] border px-3 py-2 text-left transition-all duration-200 hover:border-amber-200/36 hover:bg-amber-300/[0.045] disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(200,146,42,0.18)',
                  color: '#d9c79a',
                }}
              >
                <span className="mb-1 block font-fantasy text-[10px] uppercase tracking-[0.16em] text-amber-200/62">
                  Draft Idea {i + 1}
                </span>
                <span className="block font-serif text-sm leading-snug text-parchment-200/78">
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
