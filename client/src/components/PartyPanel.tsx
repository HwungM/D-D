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

// Bond score uses the same -100..100 convention as NpcMemory.relationshipScore
// (see WorldPanel's reputationBar) — reused here for a companion's loyalty bar.
function bondMeter(value: number) {
  const clamped = Math.max(-100, Math.min(100, value))
  const color = clamped >= 50 ? '#4ade80' : clamped >= 0 ? '#f59e0b' : clamped >= -50 ? '#f97316' : '#f87171'
  const label = clamped >= 50 ? 'Devoted' : clamped >= 10 ? 'Loyal' : clamped >= -10 ? 'Neutral' : clamped >= -50 ? 'Uneasy' : 'Ready to leave'
  const pct = ((clamped + 100) / 200) * 100
  return { color, label, pct }
}

export default function PartyPanel({ members, currentUserId, worldState }: PartyPanelProps) {
  const others = members.filter(m => m.userId !== currentUserId)
  const companions = (worldState?.companions || []).filter(c => c.is_alive)
  const currentCharacterId = members.find(m => m.userId === currentUserId)?.character?.id
  const currentSubLocation = currentCharacterId
    ? worldState?.characterSubLocations?.[currentCharacterId]
    : undefined
  const currentLocation = currentCharacterId
    ? worldState?.characterLocations?.[currentCharacterId] || worldState?.currentLocation
    : worldState?.currentLocation
  if (others.length === 0 && companions.length === 0) return null

  return (
    <div className="shrink-0 border-t border-parchment-100/14 bg-black/72 px-3 py-2.5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="shrink-0 font-fantasy text-[10px] uppercase tracking-[0.24em] text-cyan-200/78">Party</span>
        <span className="font-serif text-xs text-parchment-200/62">
          {others.length + companions.length} companion{others.length + companions.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {companions.map(companion => {
          const hpPct = Math.max(0, (companion.hp / companion.max_hp) * 100)
          const hpColor = hpPct > 60 ? '#16a34a' : hpPct > 30 ? '#ca8a04' : '#dc2626'
          const bond = bondMeter(companion.bondLevel)
          const position = worldState?.companionLocations?.[companion.id]
          const companionLocation = position?.location || worldState?.currentLocation
          const sharesScene = companionLocation === currentLocation
            && (position?.subLocation || undefined) === (currentSubLocation || undefined)
          const locationLabel = [companionLocation, position?.subLocation].filter(Boolean).join(' — ')
          return (
            <div key={companion.id} className="flex min-w-[170px] flex-1 items-center gap-2 rounded-lg border border-violet-200/26 bg-violet-300/[0.07] px-2 py-1.5">
              <div className="relative shrink-0">
                <img
                  src={companion.portrait_url || racePortraitUrl(companion.race)}
                  alt={companion.name}
                  className="w-8 h-8 object-cover object-top border border-violet-200/24"
                  onError={e => { (e.target as HTMLImageElement).src = racePortraitUrl(companion.race) }}
                />
                <span
                  className="absolute -bottom-0.5 -right-0.5 border border-black bg-violet-500/80 px-0.5 font-fantasy leading-none"
                  style={{ fontSize: 7, color: '#ede9fe' }}
                  title="AI companion"
                >
                  AI
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-serif text-xs text-parchment-100">{companion.name}</span>
                  <span className="shrink-0 text-[10px] text-parchment-200/64">Lv.{companion.level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-16 overflow-hidden bg-white/10">
                    <div className="h-full transition-all duration-700" style={{ width: `${hpPct}%`, background: hpColor }} />
                  </div>
                  <span className="text-[10px] text-parchment-200/64">{companion.hp}/{companion.max_hp}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1" title={`Bond: ${bond.label}`}>
                  <div className="h-1 w-16 overflow-hidden bg-white/10">
                    <div className="h-full transition-all duration-700" style={{ width: `${bond.pct}%`, background: bond.color }} />
                  </div>
                  <span className="text-[10px]" style={{ color: bond.color }}>{bond.label}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-parchment-200/64" title={position?.activity}>
                  {sharesScene ? 'Present' : 'Away'}{position?.activity ? ` · ${position.activity}` : ''}
                </div>
                {companionLocation && (
                  <div
                    className="mt-0.5 truncate font-fantasy text-[9px] uppercase tracking-[0.1em] text-cyan-200/56"
                    title={locationLabel}
                  >
                    ↳ {locationLabel}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {others.map(member => {
          const char = member.character
          if (!char) {
            return (
              <div key={member.userId} className="flex items-center gap-2 border border-white/14 bg-white/[0.045] px-2 py-1.5">
                <div className="h-7 w-7 border border-white/16 bg-white/[0.04]" />
                <div>
                  <p className="font-serif text-xs text-parchment-200/62">{member.username}</p>
                  <p className="font-serif text-[10px] text-parchment-200/58">Creating character</p>
                </div>
              </div>
            )
          }

          const hpPct = Math.max(0, (char.hp / char.max_hp) * 100)
          const hpColor = hpPct > 60 ? '#16a34a' : hpPct > 30 ? '#ca8a04' : '#dc2626'
          const lastSeen = worldState?.characterLastSeen?.[char.id]
          const online = isOnline(lastSeen)
          const lastLocation = worldState?.characterLocations?.[char.id]
          const subLocation = worldState?.characterSubLocations?.[char.id]

          return (
            <div key={member.userId} className="flex min-w-[170px] flex-1 items-center gap-2 rounded-lg border border-white/14 bg-white/[0.05] px-2 py-1.5">
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
                  <span className="shrink-0 text-[10px] text-parchment-200/64">Lv.{char.level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-16 overflow-hidden bg-white/10">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${hpPct}%`, background: hpColor }}
                    />
                  </div>
                  <span className="text-[10px] text-parchment-200/64">{char.hp}/{char.max_hp}</span>
                </div>
                <div className="truncate text-[10px] text-parchment-200/64" title={lastLocation || undefined}>
                  {lastLocation || (online ? 'Present' : 'Away')}
                </div>
                {subLocation && (
                  <div className="mt-0.5 truncate font-fantasy text-[9px] uppercase tracking-[0.1em] text-cyan-200/56" title={subLocation}>
                    ↳ {subLocation}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
