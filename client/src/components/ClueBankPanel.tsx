import type { WorldState } from '../../../shared/types'

interface Props {
  worldState: WorldState | null
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  revealed: { color: '#22d3ee', label: 'Revealed' },
  resolved: { color: '#4ade80', label: 'Resolved' },
}

// Detective-board style ledger of concrete mystery clues. Only ever shows
// entries the DM has actually revealed to the player ('revealed'/'resolved')
// — 'undiscovered' clues stay hidden so this never spoils what's ahead.
export default function ClueBankPanel({ worldState }: Props) {
  const allClues = worldState?.mysteryClues || []
  const clues = allClues.filter(c => c.status === 'revealed' || c.status === 'resolved')
  const centralQuestion = worldState?.campaignSpine?.currentArc?.label

  if (clues.length === 0) {
    return (
      <div className="p-4">
        <p className="border border-white/14 bg-white/[0.035] px-4 py-5 font-serif text-sm italic" style={{ color: 'rgba(220,195,155,0.6)' }}>
          No clues uncovered yet. Keep pulling threads — anything you find will pin to this board.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="font-fantasy text-xs uppercase tracking-[0.16em]" style={{ color: 'rgba(34,211,238,0.8)' }}>
          Clue Board
        </p>
        {centralQuestion && (
          <p className="mt-1 font-serif text-xs italic" style={{ color: 'rgba(220,195,155,0.62)' }}>
            {centralQuestion}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {clues.map(clue => {
          const style = STATUS_STYLE[clue.status] || STATUS_STYLE.revealed
          return (
            <article
              key={clue.id}
              className="relative border px-4 py-3"
              style={{ borderColor: `${style.color}50`, background: `${style.color}12`, borderLeftWidth: 3, borderLeftColor: style.color }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-serif text-sm leading-relaxed" style={{ color: 'rgba(240,228,200,0.94)' }}>
                  {clue.clue}
                </p>
                <span
                  className="shrink-0 font-fantasy text-[9px] uppercase tracking-[0.16em] px-2 py-0.5"
                  style={{ color: style.color, border: `1px solid ${style.color}66`, background: `${style.color}1c` }}
                >
                  {style.label}
                </span>
              </div>
              <p className="mt-2 font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(200,180,140,0.72)' }}>
                Points toward: {clue.pointsToward}
              </p>
              {clue.possibleSources && clue.possibleSources.length > 0 && (
                <p className="mt-1.5 font-serif text-[11px]" style={{ color: 'rgba(180,160,120,0.55)' }}>
                  Sources: {clue.possibleSources.join(', ')}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
