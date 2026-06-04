import type { WorldState } from '../../../shared/types'

interface WorldPanelProps {
  worldState: WorldState | null
}

const DISPOSITION_STYLE: Record<string, { color: string; label: string; icon: string }> = {
  friendly: { color: '#4ade80', label: 'Friendly', icon: '🤝' },
  neutral:  { color: '#c89228', label: 'Neutral',  icon: '😐' },
  hostile:  { color: '#f87171', label: 'Hostile',  icon: '⚔️' },
  unknown:  { color: 'rgba(180,160,120,0.4)', label: 'Unknown', icon: '❓' },
}

function reputationBar(value: number) {
  const clamped = Math.max(-100, Math.min(100, value))
  const color = clamped >= 50 ? '#4ade80' : clamped >= 0 ? '#c89228' : clamped >= -50 ? '#f97316' : '#f87171'
  const label = clamped >= 50 ? 'Allied' : clamped >= 10 ? 'Friendly' : clamped >= -10 ? 'Neutral' : clamped >= -50 ? 'Hostile' : 'Enemy'
  const pct = ((clamped + 100) / 200) * 100
  return { color, label, pct }
}

export default function WorldPanel({ worldState }: WorldPanelProps) {
  if (!worldState) {
    return (
      <div className="p-5 text-center" style={{ color: 'rgba(160,140,110,0.4)' }}>
        <p className="font-serif text-sm italic">The world is still taking shape…</p>
      </div>
    )
  }

  const npcs = worldState.npcMemory ?? []
  const factions = Object.entries(worldState.factionStandings ?? {})

  return (
    <div className="p-4 space-y-5 text-sm">
      {/* NPCs */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Known Characters</p>
        {npcs.length === 0 ? (
          <p className="font-serif text-xs italic" style={{ color: 'rgba(160,140,110,0.3)' }}>No one of note encountered yet</p>
        ) : (
          <div className="space-y-2">
            {npcs.map((npc, i) => {
              const disp = DISPOSITION_STYLE[npc.disposition] ?? DISPOSITION_STYLE.unknown
              return (
                <div key={i} className="px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base leading-none">{disp.icon}</span>
                    <span className="font-serif text-xs" style={{ color: '#d4c5a0' }}>{npc.name}</span>
                    <span className="ml-auto text-xs" style={{ color: disp.color, fontSize: '10px' }}>{disp.label}</span>
                  </div>
                  {npc.notes && (
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(160,140,110,0.55)', paddingLeft: '26px' }}>{npc.notes}</p>
                  )}
                  {npc.lastMet && (
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(160,140,110,0.3)', paddingLeft: '26px', fontSize: '10px' }}>Last seen: {npc.lastMet}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Faction standings */}
      {factions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Faction Standings</p>
          <div className="space-y-3">
            {factions.map(([name, val]) => {
              const { color, label, pct } = reputationBar(val as number)
              return (
                <div key={name}>
                  <div className="flex justify-between mb-1">
                    <span className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.7)' }}>{name}</span>
                    <span className="text-xs" style={{ color, fontSize: '10px' }}>{label}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}60` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Session notes */}
      {(worldState.sessionNotes?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>DM Notes</p>
          <div className="space-y-1">
            {worldState.sessionNotes!.map((note, i) => (
              <p key={i} className="font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(160,140,110,0.5)' }}>• {note}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
