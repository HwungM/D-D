import type { WorldState } from '../../../shared/types'

interface WorldPanelProps {
  worldState: WorldState | null
}

const DISPOSITION_STYLE: Record<string, { color: string; label: string; icon: string }> = {
  friendly: { color: '#4ade80', label: 'Friendly', icon: '+' },
  neutral:  { color: '#c89228', label: 'Neutral',  icon: '=' },
  hostile:  { color: '#f87171', label: 'Hostile',  icon: '!' },
  unknown:  { color: 'rgba(180,160,120,0.4)', label: 'Unknown', icon: '?' },
}

function reputationBar(value: unknown) {
  const num = typeof value === 'number' ? value : 0
  const clamped = Math.max(-100, Math.min(100, num))
  const color = clamped >= 50 ? '#4ade80' : clamped >= 0 ? '#c89228' : clamped >= -50 ? '#f97316' : '#f87171'
  const label = clamped >= 50 ? 'Allied' : clamped >= 10 ? 'Friendly' : clamped >= -10 ? 'Neutral' : clamped >= -50 ? 'Hostile' : 'Enemy'
  const pct = ((clamped + 100) / 200) * 100
  return { color, label, pct }
}

function safeStr(val: unknown): string {
  if (typeof val === 'string') return val
  if (val === null || val === undefined) return ''
  return String(val)
}

export default function WorldPanel({ worldState }: WorldPanelProps) {
  if (!worldState) {
    return (
      <div className="p-5 text-center" style={{ color: 'rgba(160,140,110,0.4)' }}>
        <p className="font-serif text-sm italic">The world is still taking shape...</p>
      </div>
    )
  }

  const npcs = Array.isArray(worldState.npcMemory) ? worldState.npcMemory : []
  const factionEntries = worldState.factionStandings && typeof worldState.factionStandings === 'object'
    ? Object.entries(worldState.factionStandings)
    : []
  const sessionNotes = Array.isArray(worldState.sessionNotes) ? worldState.sessionNotes : []
  const fallenHeroes = Array.isArray(worldState.fallenHeroes) ? worldState.fallenHeroes : []
  const journal = Array.isArray((worldState as Record<string, unknown>).campaignJournal)
    ? ((worldState as Record<string, unknown>).campaignJournal as unknown[])
    : []

  return (
    <div className="p-4 space-y-5 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {worldState.currentLocation && (
          <div className="rounded-md px-3 py-2" style={{ background: 'rgba(34,211,238,0.045)', border: '1px solid rgba(34,211,238,0.12)' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(34,211,238,0.55)' }}>Location</p>
            <p className="font-serif text-xs truncate" style={{ color: '#d4c5a0' }}>{worldState.currentLocation}</p>
          </div>
        )}
        {worldState.weather && (
          <div className="rounded-md px-3 py-2" style={{ background: 'rgba(200,146,42,0.045)', border: '1px solid rgba(200,146,42,0.12)' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(200,146,42,0.55)' }}>Weather</p>
            <p className="font-serif text-xs truncate" style={{ color: '#d4c5a0' }}>{safeStr(worldState.weather).replace(/_/g, ' ')}</p>
          </div>
        )}
      </div>

      {journal.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Campaign Journal</p>
          <div className="space-y-2">
            {journal.slice(-4).map((entry, i) => {
              const e = entry as Record<string, unknown>
              return (
                <div key={i} className="rounded-md px-3 py-2.5" style={{ background: 'rgba(200,146,42,0.04)', border: '1px solid rgba(200,146,42,0.12)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono" style={{ color: 'rgba(200,146,42,0.5)' }}>
                      Act {safeStr(e.actNumber)} / Session {safeStr(e.sessionNumber)}
                    </span>
                  </div>
                  <p className="font-serif text-xs leading-relaxed" style={{ color: 'rgba(180,160,120,0.7)' }}>
                    {safeStr(e.summary)}
                  </p>
                  {Array.isArray(e.keyDecisions) && e.keyDecisions.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {(e.keyDecisions as unknown[]).slice(0, 3).map((d, j) => (
                        <p key={j} className="text-xs" style={{ color: 'rgba(160,140,110,0.5)', paddingLeft: '8px' }}>
                          - {safeStr(d)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Known Characters</p>
        {npcs.length === 0 ? (
          <p className="font-serif text-xs italic" style={{ color: 'rgba(160,140,110,0.3)' }}>No one of note encountered yet</p>
        ) : (
          <div className="space-y-2">
            {npcs.map((npc, i) => {
              if (!npc || typeof npc !== 'object') return null
              const disp = DISPOSITION_STYLE[safeStr(npc.disposition)] ?? DISPOSITION_STYLE.unknown
              return (
                <div key={i} className="rounded-md px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs" style={{ color: disp.color, background: `${disp.color}18`, border: `1px solid ${disp.color}33` }}>{disp.icon}</span>
                    <span className="font-serif text-xs" style={{ color: '#d4c5a0' }}>{safeStr(npc.name)}</span>
                    <span className="ml-auto text-xs" style={{ color: disp.color, fontSize: '10px' }}>{disp.label}</span>
                  </div>
                  {npc.notes && (
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(160,140,110,0.55)', paddingLeft: '28px' }}>{safeStr(npc.notes)}</p>
                  )}
                  {npc.lastMet && (
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(160,140,110,0.3)', paddingLeft: '28px', fontSize: '10px' }}>Last seen: {safeStr(npc.lastMet)}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {factionEntries.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Faction Standings</p>
          <div className="space-y-3">
            {factionEntries.map(([name, val]) => {
              const { color, label, pct } = reputationBar(val)
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

      {fallenHeroes.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)', letterSpacing: '0.15em' }}>Fallen Heroes</p>
          <div className="space-y-2">
            {fallenHeroes.map((hero, i) => (
              <div key={i} className="rounded-md px-3 py-2" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span style={{ color: 'rgba(239,68,68,0.6)', fontSize: 10 }}>X</span>
                  <span className="font-serif text-xs font-semibold" style={{ color: 'rgba(220,160,140,0.8)' }}>
                    {safeStr(hero.name)}
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'rgba(160,130,110,0.5)' }}>
                    Lv.{hero.level} {safeStr(hero.race)} {safeStr(hero.class)}
                  </span>
                </div>
                <p className="font-serif text-xs italic" style={{ color: 'rgba(180,140,130,0.6)' }}>
                  {safeStr(hero.cause)}
                  {hero.location ? ` - ${safeStr(hero.location)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessionNotes.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>DM Notes</p>
          <div className="space-y-1">
            {sessionNotes.map((note, i) => (
              <p key={i} className="font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(160,140,110,0.5)' }}>- {safeStr(note)}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
