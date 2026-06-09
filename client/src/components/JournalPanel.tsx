import type { WorldState } from '../../../shared/types'

interface Props {
  worldState: WorldState | null
}

const ACT_NAMES: Record<number, string> = {
  1: 'Act I — The Call',
  2: 'Act II — The Trial',
  3: 'Act III — The Reckoning',
}

export default function JournalPanel({ worldState }: Props) {
  const recap = worldState?.campaignSpine?.lastRecap
  const journal = worldState?.campaignJournal ?? []
  const threads = worldState?.campaignSpine?.openThreads ?? []
  const spine = worldState?.campaignSpine

  if (!recap && journal.length === 0) {
    return (
      <div className="p-4">
        <p className="border border-white/8 bg-white/[0.025] px-4 py-5 font-serif text-sm italic" style={{ color: 'rgba(220,195,155,0.48)' }}>
          No journal entries yet. The adventure is just beginning.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
      {recap && (
        <section>
          <p className="font-fantasy text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
            Previously in The Everrealm
          </p>
          <blockquote
            className="mt-3 border-l-2 pl-4 font-serif text-sm leading-relaxed italic"
            style={{ borderColor: 'rgba(200,146,42,0.38)', color: 'rgba(220,195,155,0.82)' }}
          >
            {recap}
          </blockquote>
        </section>
      )}

      {spine && (
        <section>
          <p className="font-fantasy text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
            Current Arc
          </p>
          <div className="mt-3 border border-amber-200/18 bg-amber-300/[0.04] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-fantasy text-base" style={{ color: '#f5e6c8' }}>
                {ACT_NAMES[spine.currentArc.act] ?? `Act ${spine.currentArc.act}`}
              </p>
              <span
                className="font-fantasy text-[9px] uppercase tracking-[0.16em] px-2 py-0.5"
                style={{
                  border: `1px solid ${spine.currentArc.pressure === 'climax' ? 'rgba(239,68,68,0.4)' : spine.currentArc.pressure === 'dangerous' ? 'rgba(239,130,68,0.4)' : 'rgba(200,146,42,0.3)'}`,
                  color: spine.currentArc.pressure === 'climax' ? '#f87171' : spine.currentArc.pressure === 'dangerous' ? '#fb923c' : '#fbbf24',
                  background: 'rgba(0,0,0,0.3)',
                }}
              >
                {spine.currentArc.pressure}
              </span>
            </div>
            <p className="mt-2 font-serif text-xs" style={{ color: 'rgba(220,195,155,0.6)' }}>
              {spine.currentArc.label}
            </p>
            <div className="mt-3 h-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full transition-all"
                style={{
                  width: `${spine.currentArc.progress}%`,
                  background: 'linear-gradient(90deg, rgba(200,146,42,0.6), rgba(200,146,42,1))',
                  boxShadow: '0 0 8px rgba(200,146,42,0.4)',
                }}
              />
            </div>
          </div>
        </section>
      )}

      {threads.length > 0 && (
        <section>
          <p className="font-fantasy text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
            Open Threads
          </p>
          <ul className="mt-3 space-y-2">
            {threads.map((thread, i) => (
              <li key={i} className="flex items-start gap-2 font-serif text-sm" style={{ color: 'rgba(220,195,155,0.68)' }}>
                <span style={{ color: 'rgba(200,146,42,0.5)', marginTop: 2 }}>◆</span>
                {thread}
              </li>
            ))}
          </ul>
        </section>
      )}

      {journal.length > 0 && (
        <section>
          <p className="font-fantasy text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
            Chronicle
          </p>
          <div className="mt-3 space-y-3">
            {[...journal].reverse().map((entry, i) => (
              <article
                key={i}
                className="border px-4 py-4"
                style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(200,146,42,0.62)' }}>
                    {ACT_NAMES[entry.actNumber] ?? `Act ${entry.actNumber}`} · Session {entry.sessionNumber}
                  </p>
                  <span className="font-serif text-[10px]" style={{ color: 'rgba(180,155,110,0.38)' }}>
                    {new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="font-serif text-sm leading-relaxed" style={{ color: 'rgba(220,195,155,0.75)' }}>
                  {entry.summary}
                </p>
                {entry.keyDecisions.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {entry.keyDecisions.map((d, j) => (
                      <p key={j} className="flex items-start gap-2 font-serif text-xs" style={{ color: 'rgba(180,155,110,0.62)' }}>
                        <span style={{ color: 'rgba(200,146,42,0.4)', flexShrink: 0 }}>›</span> {d}
                      </p>
                    ))}
                  </div>
                )}
                {entry.majorNPCsIntroduced.length > 0 && (
                  <p className="mt-3 font-serif text-[11px]" style={{ color: 'rgba(150,200,220,0.5)' }}>
                    Met: {entry.majorNPCsIntroduced.join(', ')}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
