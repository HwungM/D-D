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
    <div className="border-t border-slate-800 bg-slate-950 p-4 shrink-0">
      {suggestedActions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestedActions.slice(0, 4).map((action, i) => (
            <button
              key={i}
              onClick={() => !disabled && onAction(action)}
              disabled={disabled}
              className="text-xs border border-slate-700 hover:border-slate-500 bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 font-serif transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
          className="flex-1 fantasy-input resize-none text-sm disabled:opacity-50"
          placeholder={disabled ? 'Your character cannot act...' : 'What do you do? (Enter to send, Shift+Enter for newline)'}
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="fantasy-btn px-6 self-stretch disabled:opacity-40"
        >
          Act
        </button>
      </form>
    </div>
  )
}
