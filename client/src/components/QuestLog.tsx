import type { WorldState } from '../../../shared/types'

interface QuestLogProps {
  worldState: WorldState | null
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
}

function formatLabel(value?: string) {
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
}

export default function QuestLog({ worldState }: QuestLogProps) {
  const allQuests = Array.isArray(worldState?.activeQuests) ? worldState.activeQuests : []
  const activeQuests = allQuests.filter(quest => quest?.status === 'active')
  const resolvedQuests = allQuests.filter(quest => quest?.status && quest.status !== 'active')
  const locations = Array.isArray(worldState?.discoveredLocations) ? worldState.discoveredLocations : []

  if (!worldState) {
    return (
      <div className="p-5 text-center">
        <p className="font-serif text-sm italic text-parchment-200/52">The adventure has not yet begun.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 text-sm text-parchment-100">
      <div className="grid grid-cols-2 gap-2">
        {worldState.currentLocation && (
          <div className="border border-cyan-200/18 bg-cyan-200/[0.055] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-cyan-200/64">Location</p>
            <p className="mt-1 font-serif text-sm text-parchment-100">{worldState.currentLocation}</p>
          </div>
        )}
        {(worldState.timeOfDay || worldState.weather) && (
          <div className="border border-amber-300/18 bg-amber-300/[0.055] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/64">Conditions</p>
            <p className="mt-1 font-serif text-sm text-parchment-100">
              {[formatLabel(worldState.timeOfDay), formatLabel(worldState.weather)].filter(Boolean).join(' / ')}
            </p>
          </div>
        )}
      </div>

      <section>
        <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Active Quests</p>
        {activeQuests.length === 0 ? (
          <p className="border border-white/8 bg-white/[0.025] px-3 py-4 font-serif text-sm italic text-parchment-200/52">
            No active quests have been logged yet. Keep pressing the world for names, promises, and stakes.
          </p>
        ) : (
          <div className="space-y-2">
            {activeQuests.map((quest, index) => {
              const style = STATUS_STYLE[quest.status] ?? STATUS_STYLE.active
              return (
                <article key={`${quest.title}-${index}`} className="border border-amber-300/18 bg-amber-300/[0.045] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0" style={{ background: style.color, boxShadow: `0 0 14px ${style.color}` }} />
                    <h3 className="font-serif text-base font-semibold text-parchment-100">{quest.title}</h3>
                    <span className="ml-auto font-fantasy text-[10px] uppercase tracking-[0.16em]" style={{ color: style.color }}>{style.label}</span>
                  </div>
                  <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/72">{quest.description}</p>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {resolvedQuests.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/52">Resolved</p>
          <div className="space-y-2">
            {resolvedQuests.map((quest, index) => {
              const style = STATUS_STYLE[quest.status] ?? STATUS_STYLE.completed
              return (
                <article key={`${quest.title}-${index}`} className="border border-white/8 bg-white/[0.025] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 opacity-70" style={{ background: style.color }} />
                    <h3 className="font-serif text-sm text-parchment-200/68">{quest.title}</h3>
                    <span className="ml-auto font-fantasy text-[10px] uppercase tracking-[0.16em]" style={{ color: style.color }}>{style.label}</span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {locations.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/52">Discovered Places</p>
          <div className="flex flex-wrap gap-2">
            {locations.map(location => (
              <span key={location} className="border border-white/10 bg-white/[0.025] px-3 py-2 font-serif text-xs text-parchment-200/68">
                {location}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
