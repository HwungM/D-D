interface TurnIndicatorProps {
  roster: Array<{ name: string; id: string; isMe: boolean }>
  submittedIds: Set<string>
  expiresAt?: string | null
}

export default function TurnIndicator({ roster, submittedIds, expiresAt }: TurnIndicatorProps) {
  if (roster.length < 2) return null

  return (
    <div
      className="flex shrink-0 items-center gap-2 px-4 py-2"
      style={{ borderBottom: '1px solid rgba(34,211,238,0.10)', background: 'rgba(4,14,22,0.72)', backdropFilter: 'blur(8px)' }}
    >
      <span className="shrink-0 font-fantasy text-[9px] uppercase tracking-[0.22em]" style={{ color: 'rgba(150,210,240,0.38)' }}>
        Turn
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {roster.map(member => {
          const done = submittedIds.has(member.id)
          return (
            <div
              key={member.id}
              className="flex items-center gap-1.5 px-2 py-1"
              style={{
                border: done ? '1px solid rgba(34,211,238,0.38)' : '1px solid rgba(255,255,255,0.09)',
                background: done ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.015)',
              }}
            >
              {done ? (
                <span style={{ color: '#22d3ee', fontSize: 10, lineHeight: 1 }}>✓</span>
              ) : (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300"
                  style={{ animation: 'pulse 1.4s ease-in-out infinite' }}
                />
              )}
              <span
                className="font-fantasy text-[9px] uppercase tracking-[0.14em]"
                style={{ color: done ? 'rgba(191,244,255,0.82)' : 'rgba(220,200,155,0.48)' }}
              >
                {member.isMe ? 'You' : member.name}
              </span>
            </div>
          )
        })}
      </div>
      {expiresAt && (
        <span className="ml-auto shrink-0 font-serif text-[9px]" style={{ color: 'rgba(180,155,110,0.38)' }}>
          expires {new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}
