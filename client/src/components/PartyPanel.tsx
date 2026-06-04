import type { PartyMember } from '../../../shared/types'

interface PartyPanelProps {
  members: PartyMember[]
  currentUserId: string
}

function racePortraitUrl(race: string): string {
  return `/assets/races/${race.toLowerCase().replace(/['\s]/g, '-')}.png`
}

export default function PartyPanel({ members, currentUserId }: PartyPanelProps) {
  const others = members.filter(m => m.userId !== currentUserId)
  if (others.length === 0) return null

  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 py-2">
      <div className="flex items-center gap-4">
        <span className="text-xs uppercase tracking-widest text-slate-600 shrink-0">Party</span>
        {others.map(member => {
          const char = member.character
          if (!char) return (
            <div key={member.userId} className="flex items-center gap-2 opacity-40">
              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />
              <span className="text-xs text-slate-500 font-serif">{member.username} (no character)</span>
            </div>
          )

          const hpPct = Math.max(0, (char.hp / char.max_hp) * 100)
          const hpColor = hpPct > 60 ? '#16a34a' : hpPct > 30 ? '#ca8a04' : '#dc2626'

          return (
            <div key={member.userId} className="flex items-center gap-2">
              <div className="relative shrink-0">
                <img
                  src={char.portrait_url || racePortraitUrl(char.race)}
                  alt={char.name}
                  className="w-7 h-7 rounded-full object-cover object-top border border-slate-600"
                  onError={e => { (e.target as HTMLImageElement).src = racePortraitUrl(char.race) }}
                />
                {!char.is_alive && (
                  <div className="absolute inset-0 rounded-full bg-black/70 flex items-center justify-center">
                    <span className="text-xs">✝</span>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-parchment-300 font-serif">{char.name}</span>
                  <span className="text-xs text-slate-600">Lv.{char.level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-14 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${hpPct}%`, background: hpColor }}
                    />
                  </div>
                  <span className="text-xs text-slate-600">{char.hp}/{char.max_hp}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
