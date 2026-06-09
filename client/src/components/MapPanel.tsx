import type { LocationNode, WorldState } from '../../../shared/types'

interface MapPanelProps {
  worldState: WorldState | null
}

const TYPE_STYLE: Record<string, { label: string; accent: string }> = {
  city:       { label: 'City',     accent: '#67e8f9' },
  region:     { label: 'Region',   accent: '#c4b5fd' },
  dungeon:    { label: 'Dungeon',  accent: '#f87171' },
  wilderness: { label: 'Wilds',   accent: '#86efac' },
  landmark:   { label: 'Landmark',accent: '#fbbf24' },
  unknown:    { label: 'Place',   accent: '#d4b97a' },
}

function fallbackNodes(worldState: WorldState): LocationNode[] {
  const names = Array.from(new Set([
    worldState.currentLocation,
    ...(worldState.discoveredLocations || []),
    ...Object.values(worldState.characterLocations || {}),
  ].filter((n): n is string => !!n && n.trim().length > 0)))

  return names.map(name => ({
    name,
    region: 'Known Realm',
    type: 'unknown',
    visits: worldState.currentLocation === name ? 1 : 0,
    connectedTo: worldState.currentLocation && worldState.currentLocation !== name ? [worldState.currentLocation] : [],
    npcsPresent: worldState.activeNPC && worldState.currentLocation === name ? [worldState.activeNPC] : [],
    questHooks: [],
    partyHere: worldState.currentLocation === name ? ['current'] : [],
    tags: worldState.currentLocation === name ? ['current'] : [],
  }))
}

function LocationCard({ node, active }: { node: LocationNode; active?: boolean }) {
  const style = TYPE_STYLE[node.type || 'unknown'] || TYPE_STYLE.unknown
  const hasMarkers = node.partyHere.length > 0 || node.npcsPresent.length > 0 || node.questHooks.length > 0

  return (
    <article
      className="border px-3 py-3 transition-all"
      style={active
        ? { borderColor: 'rgba(200,146,42,0.5)', background: 'rgba(200,146,42,0.08)', boxShadow: '0 0 20px rgba(200,146,42,0.07)' }
        : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-fantasy text-base" style={{ color: active ? '#f5dea0' : '#e8d9b8' }}>{node.name}</p>
          <p className="mt-0.5 font-fantasy text-[9px] uppercase tracking-[0.18em]" style={{ color: style.accent, opacity: 0.85 }}>
            {style.label} / {node.region}
          </p>
        </div>
        {hasMarkers && (
          <span className="shrink-0 px-2 py-0.5 font-serif text-[10px]"
            style={{ color: 'rgba(200,146,42,0.85)', border: '1px solid rgba(200,146,42,0.28)', background: 'rgba(200,146,42,0.07)' }}>
            {node.partyHere.length + node.npcsPresent.length + node.questHooks.length} marks
          </span>
        )}
      </div>

      {node.description && (
        <p className="mt-2 font-serif text-xs leading-relaxed"
          style={{ color: 'rgba(220,200,165,0.75)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {node.description}
        </p>
      )}

      {(node.partyHere.length > 0 || node.npcsPresent.length > 0 || node.questHooks.length > 0 || node.connectedTo.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {node.partyHere.length > 0 && (
            <Tag color="rgba(134,239,172,0.85)" bg="rgba(34,197,94,0.08)" border="rgba(134,239,172,0.22)">Party</Tag>
          )}
          {node.npcsPresent.length > 0 && (
            <Tag color="rgba(196,181,253,0.85)" bg="rgba(139,92,246,0.08)" border="rgba(196,181,253,0.22)">NPC</Tag>
          )}
          {node.questHooks.length > 0 && (
            <Tag color="rgba(251,191,36,0.85)" bg="rgba(200,146,42,0.08)" border="rgba(251,191,36,0.22)">Quest</Tag>
          )}
          {node.connectedTo.slice(0, 3).map(place => (
            <Tag key={place} color="rgba(200,180,140,0.6)" bg="rgba(0,0,0,0.2)" border="rgba(255,255,255,0.09)">
              → {place}
            </Tag>
          ))}
        </div>
      )}
    </article>
  )
}

function Tag({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <span className="px-2 py-0.5 font-fantasy text-[9px] uppercase tracking-[0.14em]"
      style={{ color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  )
}

export default function MapPanel({ worldState }: MapPanelProps) {
  if (!worldState) {
    return (
      <div className="p-5 text-center">
        <p className="font-serif text-sm italic" style={{ color: 'rgba(200,180,140,0.45)' }}>No map has been drawn yet.</p>
      </div>
    )
  }

  const graph = worldState.locationGraph
  const nodes = graph?.nodes?.length ? graph.nodes : fallbackNodes(worldState)
  const currentName = graph?.currentLocation || worldState.currentLocation
  const current = nodes.find(n => n.name === currentName) || nodes[0]
  const regions = graph?.regions?.length
    ? graph.regions
    : [{ name: 'Known Realm', locations: nodes.map(n => n.name) }]
  const nearby = graph?.nearby?.length
    ? graph.nearby
    : current?.connectedTo || nodes.filter(n => n.name !== current?.name).slice(0, 6).map(n => n.name)

  return (
    <div className="space-y-5 p-4">

      {/* Current location hero card */}
      <section className="p-4" style={{
        background: 'linear-gradient(135deg, rgba(200,146,42,0.1), rgba(200,80,30,0.05))',
        border: '1px solid rgba(200,146,42,0.32)',
        boxShadow: '0 0 30px rgba(200,146,42,0.06)',
      }}>
        <p className="font-fantasy text-[9px] uppercase tracking-[0.26em]" style={{ color: 'rgba(200,146,42,0.72)' }}>
          Current Location
        </p>
        <h3 className="mt-1 font-fantasy text-2xl" style={{ color: '#f5dea0' }}>
          {current?.name || 'Unknown Road'}
        </h3>
        {current?.description && (
          <p className="mt-2 font-serif text-sm leading-relaxed" style={{ color: 'rgba(220,200,165,0.8)' }}>
            {current.description}
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Places',  value: nodes.length },
            { label: 'Regions', value: regions.length },
            { label: 'Nearby',  value: nearby.length },
          ].map(stat => (
            <div key={stat.label} className="px-2 py-2 text-center"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="font-fantasy text-[8px] uppercase tracking-[0.14em]" style={{ color: 'rgba(180,160,120,0.6)' }}>{stat.label}</p>
              <p className="mt-0.5 font-fantasy text-xl" style={{ color: '#f5e6c8' }}>{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Nearby roads */}
      {nearby.length > 0 && (
        <section>
          <p className="mb-2 px-1 font-fantasy text-[9px] uppercase tracking-[0.26em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
            Nearby Roads
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {nearby.map(place => (
              <div key={place} className="px-3 py-2"
                style={{ background: 'rgba(200,146,42,0.05)', border: '1px solid rgba(200,146,42,0.18)' }}>
                <p className="truncate font-serif text-sm" style={{ color: '#ddd0b0' }}>{place}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All locations by region */}
      <section>
        <p className="mb-2 px-1 font-fantasy text-[9px] uppercase tracking-[0.26em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
          Known World
        </p>
        <div className="space-y-3">
          {regions.map(region => {
            const regionNodes = region.locations
              .map(name => nodes.find(n => n.name === name))
              .filter((n): n is LocationNode => !!n)
            return (
              <div key={region.name}
                style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                <div className="flex items-center justify-between gap-3 border-b px-3 py-2"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <h4 className="font-fantasy text-sm" style={{ color: '#e8d9b8' }}>{region.name}</h4>
                  <span className="font-serif text-[10px]" style={{ color: 'rgba(180,160,120,0.5)' }}>{regionNodes.length} places</span>
                </div>
                <div className="space-y-px p-1.5">
                  {regionNodes.map(node => (
                    <LocationCard key={node.name} node={node} active={node.name === current?.name} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Active markers at current location */}
      {current && (current.npcsPresent.length > 0 || current.questHooks.length > 0) && (
        <section>
          <p className="mb-2 px-1 font-fantasy text-[9px] uppercase tracking-[0.26em]" style={{ color: 'rgba(200,146,42,0.65)' }}>
            Here Now
          </p>
          <div className="space-y-1.5">
            {current.npcsPresent.map(npc => (
              <p key={npc} className="px-3 py-2 font-serif text-sm"
                style={{ color: 'rgba(220,200,165,0.82)', border: '1px solid rgba(196,181,253,0.2)', background: 'rgba(139,92,246,0.06)' }}>
                {npc}
              </p>
            ))}
            {current.questHooks.map(quest => (
              <p key={quest} className="px-3 py-2 font-serif text-sm"
                style={{ color: 'rgba(220,200,165,0.82)', border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(200,146,42,0.06)' }}>
                {quest}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
