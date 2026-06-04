import type { StoryEvent } from '../../../shared/types'

interface JournalTabProps {
  events: StoryEvent[]
  characterId?: string
}

export default function JournalTab({ events, characterId }: JournalTabProps) {
  const journalEvents = events
    .filter(e => e.event_type === 'narration' || e.event_type === 'action')
    .filter(e => !e.content.startsWith('BEGIN_CAMPAIGN') && !e.content.startsWith('OPENING_SCENE'))

  if (journalEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="font-serif italic text-sm" style={{ color: 'rgba(160,140,110,0.4)' }}>
          Your story has not yet begun...
        </p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-5 flex items-center gap-3">
        <h3 className="font-fantasy text-base" style={{ color: '#d4c5a0' }}>The Chronicle</h3>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(200,146,42,0.2), transparent)' }} />
        <span className="text-xs font-serif" style={{ color: 'rgba(160,140,110,0.4)' }}>
          {journalEvents.length} entries
        </span>
      </div>

      <div className="space-y-0">
        {journalEvents.map((event, i) => {
          const isAction = event.event_type === 'action'
          const isMyAction = isAction && event.character_id === characterId
          const date = new Date(event.created_at)
          const showDate = i === 0 || new Date(journalEvents[i - 1]?.created_at).toDateString() !== date.toDateString()

          return (
            <div key={event.id || i}>
              {showDate && (
                <div className="flex items-center gap-2 py-3">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <span className="text-xs font-serif" style={{ color: 'rgba(160,140,110,0.3)', letterSpacing: '0.1em' }}>
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                </div>
              )}

              {isAction ? (
                <div className="flex items-start gap-2.5 py-2 pl-2">
                  <span className="text-xs mt-0.5 shrink-0" style={{ color: isMyAction ? 'rgba(192,57,43,0.6)' : 'rgba(200,146,42,0.6)' }}>
                    {isMyAction ? '▶' : '◈'}
                  </span>
                  <p className="font-serif text-xs italic" style={{ color: 'rgba(180,160,120,0.5)' }}>
                    {event.content}
                  </p>
                </div>
              ) : (
                <div
                  className="py-3 px-4 my-1"
                  style={{
                    borderLeft: '2px solid rgba(200,146,42,0.15)',
                    background: 'rgba(255,255,255,0.015)',
                  }}
                >
                  <p className="font-serif text-sm leading-relaxed" style={{ color: 'rgba(212,197,160,0.85)' }}>
                    {event.content}
                  </p>
                  <p className="text-xs font-serif mt-2" style={{ color: 'rgba(160,140,110,0.3)' }}>
                    {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
