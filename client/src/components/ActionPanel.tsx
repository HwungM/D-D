import { useState, FormEvent, KeyboardEvent } from 'react'

interface ActionPanelProps {
  suggestedActions: string[]
  onAction: (action: string) => void
  disabled: boolean
}

export default function ActionPanel({ suggestedActions, onAction, disabled }: ActionPanelProps) {
  const [input, setInput] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onAction(trimmed)
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <div className="shrink-0" style={{ background: 'rgba(6,8,13,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Suggested actions */}
      {suggestedActions.length > 0 && (
        <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2">
          {suggestedActions.slice(0, 4).map((action, i) => (
            <button
              key={i}
              onClick={() => !disabled && onAction(action)}
              disabled={disabled}
              className="font-serif text-xs px-3 py-1.5 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(200,146,42,0.2)',
                color: 'rgba(200,180,130,0.7)',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={e => {
                if (!disabled) {
                  ;(e.currentTarget as HTMLElement).style.background = 'rgba(200,146,42,0.08)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.45)'
                  ;(e.currentTarget as HTMLElement).style.color = '#c89228'
                }
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.2)'
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(200,180,130,0.7)'
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="px-4 pb-4 pt-1 flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={2}
            className="w-full resize-none font-serif text-sm outline-none transition-all duration-200"
            placeholder={disabled ? 'Your character cannot act...' : 'What do you do? (Enter to act · Shift+Enter for new line)'}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderColor: input.trim() ? 'rgba(192,57,43,0.35)' : 'rgba(255,255,255,0.08)',
              color: '#d4c5a0',
              padding: '10px 12px',
              caretColor: '#c89228',
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(192,57,43,0.45)' }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = input.trim() ? 'rgba(192,57,43,0.35)' : 'rgba(255,255,255,0.08)' }}
          />
          <style>{`textarea::placeholder { color: rgba(160,140,110,0.3); font-style: italic; }`}</style>
        </div>
        <button
          type="button"
          onClick={handleSubmit as unknown as React.MouseEventHandler}
          disabled={disabled || !input.trim()}
          className="font-serif text-sm px-5 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed self-stretch"
          style={{
            background: input.trim() && !disabled
              ? 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(140,30,20,0.45))'
              : 'rgba(255,255,255,0.04)',
            border: '1px solid',
            borderColor: input.trim() && !disabled ? 'rgba(192,57,43,0.5)' : 'rgba(255,255,255,0.08)',
            color: input.trim() && !disabled ? '#e8b09a' : 'rgba(160,140,110,0.3)',
            letterSpacing: '0.05em',
            minWidth: '64px',
          }}
        >
          Act
        </button>
      </div>
    </div>
  )
}
