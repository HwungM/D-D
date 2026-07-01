import { useRef, useState, FormEvent, KeyboardEvent } from 'react'
import type { SceneInteractable, WorldState, Ability } from '../../../shared/types'

interface ActionPanelProps {
  suggestedActions: string[]
  onAction: (action: string) => void
  disabled: boolean
  disabledReason?: string
  location?: string
  pacingMode?: string
  inCombat?: boolean
  isCoop?: boolean
  // Micro-action support: what/who is in the scene right now (quick-tap
  // shortcuts that fire a small in-scene reaction immediately), plus the
  // always-visible Advance control that moves the story forward with the
  // full DM turn.
  sceneInteractables?: SceneInteractable[]
  onAdvance?: (framingAction?: string) => void
  advanceDisabled?: boolean
  freeRoamCount?: number
  // Live combat/danger: while combatState.inCombat is true, contextual
  // Attack/Defend/Hide/Flee + ability buttons appear here and fire real
  // micro-actions (onAction) with real dice/HP consequences, instead of
  // routing through the old macro-turn Advance path.
  combatState?: WorldState['combatState']
  abilities?: Ability[]
  // Party is hiding/fled from a live threat that hasn't fully resolved —
  // a subtle danger cue near the composer, consistent with the combat accent.
  tensionActive?: boolean
}

const INTERACTABLE_ICON: Record<string, string> = { npc: 'talk', object: 'look', exit: 'go' }

export default function ActionPanel({
  suggestedActions, onAction, disabled, disabledReason,
  location, pacingMode, inCombat, isCoop,
  sceneInteractables = [], onAdvance, advanceDisabled, freeRoamCount = 0,
  combatState, abilities = [], tensionActive,
}: ActionPanelProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const suggestions = suggestedActions.slice(0, 4)
  const hasSuggestions = suggestions.length > 0
  const hasInput = input.trim().length > 0
  const interactables = sceneInteractables.slice(0, 8)

  function submitAction(action: string) {
    const trimmed = action.trim()
    if (!trimmed || disabled) return
    onAction(trimmed)
    setInput('')
    setShowSuggestions(false)
  }

  function fireInteractable(item: SceneInteractable) {
    if (disabled) return
    const phrase = item.kind === 'npc' ? `Talk to ${item.name}` : item.kind === 'exit' ? `Head toward ${item.name}` : `Look closely at ${item.name}`
    onAction(phrase)
  }

  function fireCombatAction(phrase: string) {
    if (disabled) return
    onAction(phrase)
  }

  const livingEnemies = combatState?.inCombat
    ? (combatState.enemies?.filter(e => !e.isDefeated) ?? (combatState.enemyName ? [{ name: combatState.enemyName }] : []))
    : []
  const readyAbilities = abilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0)

  function handleAdvanceClick() {
    if (advanceDisabled || !onAdvance) return
    const trimmed = input.trim()
    onAdvance(trimmed || undefined)
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

        {/* Live combat/danger: contextual Attack/Defend/Hide/Flee + ability
            shortcuts, firing real micro-actions with live dice/HP consequences. */}
        {combatState?.inCombat && (
          <div className="flex flex-wrap gap-1.5">
            {livingEnemies.map((enemy, i) => (
              <button
                key={`attack-${i}`}
                type="button"
                onClick={() => fireCombatAction(`Attack ${enemy.name}`)}
                disabled={disabled}
                className="px-2.5 py-1 font-serif text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                style={{ border: '1px solid rgba(248,113,113,0.34)', background: 'rgba(239,68,68,0.08)', color: 'rgba(254,202,202,0.88)' }}
              >
                <span className="mr-1 font-fantasy text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgba(248,113,113,0.62)' }}>atk</span>
                Attack {enemy.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => fireCombatAction('Defend and brace for the next attack')}
              disabled={disabled}
              className="px-2.5 py-1 font-serif text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ border: '1px solid rgba(200,146,42,0.32)', background: 'rgba(200,146,42,0.07)', color: 'rgba(240,210,150,0.85)' }}
            >
              Defend
            </button>
            <button
              type="button"
              onClick={() => fireCombatAction('Try to hide from the fight')}
              disabled={disabled}
              className="px-2.5 py-1 font-serif text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ border: '1px solid rgba(34,211,238,0.24)', background: 'rgba(34,211,238,0.05)', color: 'rgba(191,244,255,0.78)' }}
            >
              Hide
            </button>
            <button
              type="button"
              onClick={() => fireCombatAction('Flee the fight')}
              disabled={disabled}
              className="px-2.5 py-1 font-serif text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ border: '1px solid rgba(34,211,238,0.24)', background: 'rgba(34,211,238,0.05)', color: 'rgba(191,244,255,0.78)' }}
            >
              Flee
            </button>
            {readyAbilities.map(ability => (
              <button
                key={ability.name}
                type="button"
                onClick={() => fireCombatAction(`Use ${ability.name}`)}
                disabled={disabled}
                title={ability.description}
                className="px-2.5 py-1 font-serif text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                style={{ border: '1px solid rgba(200,146,42,0.28)', background: 'rgba(200,146,42,0.06)', color: 'rgba(240,210,150,0.85)' }}
              >
                {ability.name}
              </button>
            ))}
          </div>
        )}

        {/* Tension cue: party hid/fled but the threat hasn't fully lost interest */}
        {tensionActive && !combatState?.inCombat && (
          <div className="flex items-center gap-2 px-0.5">
            <div className="h-1.5 w-1.5 shrink-0 border border-red-200/40 bg-red-400/80" style={{ animation: 'pulse 1.4s ease-in-out infinite' }} />
            <span className="font-serif text-xs italic" style={{ color: 'rgba(252,165,165,0.6)' }}>
              Something may still be looking for you...
            </span>
          </div>
        )}

        {/* Scene interactables: quick-tap in-scene shortcuts */}
        {interactables.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {interactables.map((item, i) => (
              <button
                key={`${item.kind}-${item.name}-${i}`}
                type="button"
                onClick={() => fireInteractable(item)}
                disabled={disabled}
                title={item.hook}
                className="px-2.5 py-1 font-serif text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  border: '1px solid rgba(34,211,238,0.22)',
                  background: 'rgba(34,211,238,0.05)',
                  color: 'rgba(191,244,255,0.72)',
                }}
              >
                <span className="mr-1 font-fantasy text-[9px] uppercase tracking-[0.1em]" style={{ color: 'rgba(34,211,238,0.5)' }}>
                  {INTERACTABLE_ICON[item.kind] || 'look'}
                </span>
                {item.name}
              </button>
            ))}
          </div>
        )}

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
                : 'Describe what you try, say, inspect, cast, risk, or ask. Enter to react in the scene.'}
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

        {/* Advance: always-visible control that moves the full story forward */}
        {onAdvance && (
          <button
            type="button"
            onClick={handleAdvanceClick}
            disabled={advanceDisabled}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 font-fantasy text-xs uppercase tracking-[0.2em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: 'linear-gradient(90deg, rgba(139,92,246,0.14), rgba(34,211,238,0.1))',
              border: '1px solid rgba(167,139,250,0.42)',
              color: '#ede9fe',
              boxShadow: '0 0 20px rgba(139,92,246,0.12)',
            }}
          >
            <span>Move the Story Forward</span>
            <span className="font-serif text-[10px] normal-case italic" style={{ color: 'rgba(221,214,254,0.62)' }}>
              {freeRoamCount > 0 ? `${freeRoamCount} in-scene action${freeRoamCount === 1 ? '' : 's'} noted - moves time and scene ahead` : 'Moves time and scene ahead, once the moment has settled'}
            </span>
          </button>
        )}

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
