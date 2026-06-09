import type { WorldState } from '../../../shared/types'

interface QuestLogProps {
  worldState: WorldState | null
}

function formatLabel(value?: string) {
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 font-fantasy text-[9px] uppercase tracking-[0.26em]"
      style={{ color: 'rgba(200,146,42,0.65)' }}>
      {children}
    </p>
  )
}

export default function QuestLog({ worldState }: QuestLogProps) {
  if (!worldState) {
    return (
      <div className="p-5 text-center">
        <p className="font-serif text-sm italic" style={{ color: 'rgba(200,180,140,0.45)' }}>
          The adventure has not yet begun.
        </p>
      </div>
    )
  }

  const allQuests = Array.isArray(worldState.activeQuests) ? worldState.activeQuests : []
  const activeQuests = allQuests.filter(q => q?.status === 'active')
  const resolvedQuests = allQuests.filter(q => q?.status && q.status !== 'active')
  const locations = Array.isArray(worldState.discoveredLocations) ? worldState.discoveredLocations : []

  return (
    <div className="space-y-5 p-4">

      {/* World conditions */}
      {(worldState.currentLocation || worldState.timeOfDay || worldState.weather) && (
        <div className="grid grid-cols-2 gap-1.5">
          {worldState.currentLocation && (
            <div className="px-3 py-2.5"
              style={{ border: '1px solid rgba(103,232,249,0.2)', background: 'rgba(34,211,238,0.07)' }}>
              <p className="font-fantasy text-[9px] uppercase tracking-[0.2em]" style={{ color: 'rgba(103,232,249,0.7)' }}>Location</p>
              <p className="mt-1 font-serif text-sm" style={{ color: '#e8d9b8' }}>{worldState.currentLocation}</p>
            </div>
          )}
          {(worldState.timeOfDay || worldState.weather) && (
            <div className="px-3 py-2.5"
              style={{ border: '1px solid rgba(200,146,42,0.22)', background: 'rgba(200,146,42,0.07)' }}>
              <p className="font-fantasy text-[9px] uppercase tracking-[0.2em]" style={{ color: 'rgba(200,146,42,0.72)' }}>Conditions</p>
              <p className="mt-1 font-serif text-sm" style={{ color: '#e8d9b8' }}>
                {[formatLabel(worldState.timeOfDay), formatLabel(worldState.weather)].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Active quests */}
      <section>
        <SectionLabel>Active Quests</SectionLabel>
        {activeQuests.length === 0 ? (
          <p className="px-3 py-4 font-serif text-sm italic"
            style={{ color: 'rgba(200,180,140,0.55)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
            No quests yet. Press the world for names, promises, and stakes.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeQuests.map((quest, i) => (
              <article key={`${quest.title}-${i}`} className="px-3 py-3"
                style={{ border: '1px solid rgba(200,146,42,0.28)', borderLeftColor: '#f59e0b', borderLeftWidth: 2, background: 'rgba(200,146,42,0.07)' }}>
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0" style={{ background: '#f59e0b', boxShadow: '0 0 10px rgba(245,158,11,0.5)' }} />
                  <h3 className="font-fantasy text-sm" style={{ color: '#f5dea0' }}>{quest.title}</h3>
                  <span className="ml-auto font-fantasy text-[9px] uppercase tracking-[0.16em]" style={{ color: '#f59e0b' }}>Active</span>
                </div>
                {quest.description && (
                  <p className="mt-2 font-serif text-sm leading-relaxed" style={{ color: 'rgba(220,200,165,0.82)' }}>{quest.description}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Resolved quests */}
      {resolvedQuests.length > 0 && (
        <section>
          <SectionLabel>Resolved</SectionLabel>
          <div className="space-y-1">
            {resolvedQuests.map((quest, i) => {
              const color = quest.status === 'completed' ? '#86efac' : '#f87171'
              return (
                <article key={`${quest.title}-${i}`} className="flex items-center gap-2.5 px-3 py-2.5"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.18)' }}>
                  <span className="h-1.5 w-1.5 shrink-0 opacity-60" style={{ background: color }} />
                  <h3 className="font-serif text-sm flex-1 truncate" style={{ color: 'rgba(200,180,140,0.65)' }}>{quest.title}</h3>
                  <span className="font-fantasy text-[9px] uppercase tracking-[0.14em]" style={{ color, opacity: 0.7 }}>
                    {quest.status === 'completed' ? 'Done' : 'Failed'}
                  </span>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* Discovered locations */}
      {locations.length > 0 && (
        <section>
          <SectionLabel>Discovered Places</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {locations.map(loc => (
              <span key={loc} className="px-2.5 py-1 font-serif text-xs"
                style={{ border: '1px solid rgba(200,146,42,0.18)', background: 'rgba(200,146,42,0.06)', color: 'rgba(220,200,165,0.78)' }}>
                {loc}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
