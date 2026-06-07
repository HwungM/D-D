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
    <div className="shrink-0 border-t border-white/8 bg-black/54 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs uppercase tracking-widest shrink-0" style={{ color: 'rgba(34,211,238,0.52)' }}>Party</span>
        <span className="text-xs font-serif" style={{ color: 'rgba(180,160,120,0.42)' }}>{others.length} companion{others.length === 1 ? '' : 's'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {others.map(member => {
          const char = member.character
          if (!char) {
            return (
              <div key={member.userId} className="flex items-center gap-2 border border-white/8 bg-white/[0.025] px-2 py-1.5">
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700" />
                <div>
                  <p className="text-xs text-slate-400 font-serif">{member.username}</p>
                  <p className="text-[10px] text-slate-600 font-serif">Creating character</p>
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
                  <div className="absolute inset-0 rounded-full bg-black/70 flex items-center justify-center">
                    <span className="text-xs text-red-300">X</span>
                  </div>
                )}
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border border-slate-950"
                  style={{ background: online ? '#22c55e' : '#6b7280' }}
                  title={online ? 'Online' : lastSeen ? `Last seen ${new Date(lastSeen).toLocaleTimeString()}` : 'Offline'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-parchment-300 font-serif truncate">{char.name}</span>
                  <span className="text-[10px] text-slate-600 shrink-0">Lv.{char.level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${hpPct}%`, background: hpColor }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-600">{char.hp}/{char.max_hp}</span>
                </div>
                <div className="text-[10px] text-slate-600 truncate" title={lastLocation || undefined}>
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
