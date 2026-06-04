import type { WorldState } from '../../../shared/types'

interface QuestLogProps {
  worldState: WorldState | null
}

const STATUS_STYLE: Record<string, { label: string; color: string; dot: string }> = {
  active:    { label: 'Active',     color: '#c89228', dot: '#f59e0b' },
  completed: { label: 'Completed',  color: '#4ade80', dot: '#22c55e' },
  failed:    { label: 'Failed',     color: '#f87171', dot: '#ef4444' },
}

const TIME_ICONS: Record<string, string> = {
  dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙',
}

export default function QuestLog({ worldState }: QuestLogProps) {
  const allQuests = Array.isArray(worldState?.activeQuests) ? worldState!.activeQuests! : []
  const activeQuests = allQuests.filter(q => q?.status === 'active')
  const doneQuests   = allQuests.filter(q => q?.status && q.status !== 'active')
  const locations    = Array.isArray(worldState?.discoveredLocations) ? worldState!.discoveredLocations! : []

  if (!worldState) {
    return (
      <div className="p-5 text-center" style={{ color: 'rgba(160,140,110,0.4)' }}>
        <p className="font-serif text-sm italic">The adventure has not yet begun…</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5 text-sm">
      {/* World context strip */}
      <div className="flex flex-wrap gap-2">
        {worldState.currentLocation && (
          <span className="font-serif text-xs px-2 py-0.5" style={{ background: 'rgba(200,146,42,0.08)', border: '1px solid rgba(200,146,42,0.2)', color: '#c89228' }}>
            📍 {worldState.currentLocation}
          </span>
        )}
        {worldState.timeOfDay && (
          <span className="font-serif text-xs px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(180,160,120,0.6)' }}>
            {TIME_ICONS[worldState.timeOfDay] ?? '🕐'} {worldState.timeOfDay.charAt(0).toUpperCase() + worldState.timeOfDay.slice(1)}
          </span>
        )}
        {worldState.weather && (
          <span className="font-serif text-xs px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(180,160,120,0.6)' }}>
            🌤 {worldState.weather}
          </span>
        )}
      </div>

      {/* Active quests */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Active Quests</p>
        {activeQuests.length === 0 ? (
          <p className="font-serif text-xs italic" style={{ color: 'rgba(160,140,110,0.3)' }}>No active quests</p>
        ) : (
          <div className="space-y-2">
            {activeQuests.map((q, i) => {
              const st = STATUS_STYLE[q.status] ?? STATUS_STYLE.active
              return (
                <div key={i} className="px-3 py-2.5" style={{ background: 'rgba(200,146,42,0.05)', border: '1px solid rgba(200,146,42,0.15)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.dot, boxShadow: `0 0 5px ${st.dot}80` }} />
                    <span className="font-serif text-xs" style={{ color: '#d4c5a0' }}>{q.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(160,140,110,0.6)', paddingLeft: '14px' }}>{q.description}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Completed / failed quests */}
      {doneQuests.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.35)' }}>Resolved</p>
          <div className="space-y-1.5">
            {doneQuests.map((q, i) => {
              const st = STATUS_STYLE[q.status] ?? STATUS_STYLE.completed
              return (
                <div key={i} className="px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.dot, opacity: 0.5 }} />
                    <span className="font-serif text-xs line-through" style={{ color: 'rgba(160,140,110,0.4)' }}>{q.title}</span>
                    <span className="ml-auto text-xs" style={{ color: st.color, opacity: 0.6 }}>{st.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Discovered locations */}
      {locations.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.35)' }}>Discovered Places</p>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((loc, i) => (
              <span key={i} className="font-serif text-xs px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(180,160,120,0.5)' }}>
                {loc}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
