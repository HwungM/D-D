import type { PartyMember, WorldState } from '../../../shared/types'

interface PartyPanelProps {
  members: PartyMember[]
  currentUserId: string
  worldState?: WorldState | null
}

function racePortraitUrl(race: string): string {
  return `/assets/races/${race.toLowerCase().replace(/['\s]/g, '-')}.png`
}

function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false
  return (Date.now() - new Date(lastSeen).getTime()) < 15 * 60 * 1000
}

export default function PartyPanel({ members, currentUserId, worldState }: PartyPanelProps) {
  const others = members.filter(m => m.userId !== currentUserId)
  if (others.length === 0) return null

  return (
    <div className="shrink-0 border-t border-parchment-100/14 bg-black/62 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="shrink-0 font-fantasy text-[10px] uppercase tracking-[0.24em] text-cyan-200/58">Party</span>
        <span className="font-serif text-xs text-parchment-200/42">{others.length} companion{others.length === 1 ? '' : 's'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {others.map(member => {
          const char = member.character
          if (!char) {
            return (
              <div key={member.userId} className="flex items-center gap-2 border border-white/8 bg-white/[0.025] px-2 py-1.5">
                <div className="h-7 w-7 border border-white/10 bg-white/[0.025]" />
                <div>
                  <p className="font-serif text-xs text-parchment-200/62">{member.username}</p>
                  <p className="font-serif text-[10px] text-parchment-200/34">Creating character</p>
                </div>
              </div>
            )
          }

          const hpPct = Math.max(0, (char.hp / char.max_hp) * 100)
          const hpColor = hpPct > 60 ? '#16a34a' : hpPct > 30 ? '#ca8a04' : '#dc2626'
          const lastSeen = worldState?.characterLastSeen?.[char.id]
          const online = isOnline(lastSeen)
          const lastLocation = worldState?.characterLocations?.[char.id]

          return (
            <div key={member.userId} className="flex items-center gap-2 min-w-[180px] border border-white/8 bg-white/[0.025] px-2 py-1.5">
              <div className="relative shrink-0">
                <img
                  src={char.portrait_url || racePortraitUrl(char.race)}
                  alt={char.name}
                  className="w-8 h-8 object-cover object-top border border-amber-200/20"
                  onError={e => { (e.target as HTMLImageElement).src = racePortraitUrl(char.race) }}
                />
                {!char.is_alive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <span className="text-xs text-red-300">X</span>
                  </div>
                )}
                <div
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border border-black"
                  style={{ background: online ? '#22c55e' : '#6b7280' }}
                  title={online ? 'Online' : lastSeen ? `Last seen ${new Date(lastSeen).toLocaleTimeString()}` : 'Offline'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-serif text-xs text-parchment-100">{char.name}</span>
                  <span className="shrink-0 text-[10px] text-parchment-200/38">Lv.{char.level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-16 overflow-hidden bg-white/10">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${hpPct}%`, background: hpColor }}
                    />
                  </div>
                  <span className="text-[10px] text-parchment-200/38">{char.hp}/{char.max_hp}</span>
                </div>
                <div className="truncate text-[10px] text-parchment-200/38" title={lastLocation || undefined}>
                  {lastLocation || (online ? 'Present' : 'Away')}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
