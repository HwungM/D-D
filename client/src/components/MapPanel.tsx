import type { LocationNode, WorldState } from '../../../shared/types'

interface MapPanelProps {
  worldState: WorldState | null
}

const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  city: { label: 'City', color: '#22d3ee' },
  region: { label: 'Region', color: '#a78bfa' },
  dungeon: { label: 'Dungeon', color: '#f87171' },
  wilderness: { label: 'Wilds', color: '#4ade80' },
  landmark: { label: 'Landmark', color: '#f59e0b' },
  unknown: { label: 'Place', color: '#e8d8b0' },
}

function fallbackNodes(worldState: WorldState): LocationNode[] {
  const names = Array.from(new Set([
    worldState.currentLocation,
    ...(worldState.discoveredLocations || []),
    ...Object.values(worldState.characterLocations || {}),
  ].filter((name): name is string => !!name && name.trim().length > 0)))

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

function markerCount(node: LocationNode) {
  return node.partyHere.length + node.npcsPresent.length + node.questHooks.length
}

function LocationCard({ node, active }: { node: LocationNode; active?: boolean }) {
  const style = TYPE_STYLE[node.type || 'unknown'] || TYPE_STYLE.unknown
  return (
    <article className={`border px-3 py-3 ${active ? 'border-amber-200/42 bg-amber-300/[0.07]' : 'border-white/10 bg-white/[0.025]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-serif text-base font-semibold text-parchment-100">{node.name}</p>
          <p className="mt-1 font-fantasy text-[9px] uppercase tracking-[0.16em]" style={{ color: style.color }}>
            {style.label} / {node.region}
          </p>
        </div>
        {markerCount(node) > 0 && (
          <span className="shrink-0 border border-cyan-200/18 bg-cyan-300/[0.055] px-2 py-1 font-serif text-xs text-cyan-100/72">
            {markerCount(node)} marks
          </span>
        )}
      </div>

      {node.description && (
        <p className="mt-2 line-clamp-3 font-serif text-sm leading-relaxed text-parchment-200/62">{node.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {node.partyHere.length > 0 && (
          <span className="border border-emerald-200/18 bg-emerald-300/[0.055] px-2 py-1 font-fantasy text-[9px] uppercase tracking-[0.14em] text-emerald-100/72">Party</span>
        )}
        {node.npcsPresent.length > 0 && (
          <span className="border border-violet-200/18 bg-violet-300/[0.055] px-2 py-1 font-fantasy text-[9px] uppercase tracking-[0.14em] text-violet-100/72">NPC</span>
        )}
        {node.questHooks.length > 0 && (
          <span className="border border-amber-200/18 bg-amber-300/[0.055] px-2 py-1 font-fantasy text-[9px] uppercase tracking-[0.14em] text-amber-100/72">Quest</span>
        )}
        {node.connectedTo.slice(0, 2).map(place => (
          <span key={place} className="border border-white/8 bg-black/18 px-2 py-1 font-serif text-xs text-parchment-200/48">
            path: {place}
          </span>
        ))}
      </div>
    </article>
  )
}

export default function MapPanel({ worldState }: MapPanelProps) {
  if (!worldState) {
    return (
      <div className="p-5 text-center">
        <p className="font-serif text-sm italic text-parchment-200/52">No map has been drawn yet.</p>
      </div>
    )
  }

  const graph = worldState.locationGraph
  const nodes = graph?.nodes?.length ? graph.nodes : fallbackNodes(worldState)
  const currentName = graph?.currentLocation || worldState.currentLocation
  const current = nodes.find(node => node.name === currentName) || nodes[0]
  const regions = graph?.regions?.length
    ? graph.regions
    : [{ name: 'Known Realm', locations: nodes.map(node => node.name) }]
  const nearby = graph?.nearby?.length
    ? graph.nearby
    : current?.connectedTo || nodes.filter(node => node.name !== current?.name).slice(0, 6).map(node => node.name)

  return (
    <div className="space-y-6 p-4 text-sm text-parchment-100">
      <section className="border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.07),rgba(245,158,11,0.035))] p-4">
        <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-cyan-200/62">Realm Map</p>
        <h3 className="mt-1 font-fantasy text-2xl text-parchment-100">{current?.name || 'Unknown Road'}</h3>
        <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/68">
          {current?.description || 'The party has not mapped enough of this place to name its contours yet.'}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="border border-white/10 bg-black/22 px-3 py-2">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.16em] text-parchment-200/44">Places</p>
            <p className="mt-1 font-serif text-lg text-parchment-100">{nodes.length}</p>
          </div>
          <div className="border border-white/10 bg-black/22 px-3 py-2">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.16em] text-parchment-200/44">Regions</p>
            <p className="mt-1 font-serif text-lg text-parchment-100">{regions.length}</p>
          </div>
          <div className="border border-white/10 bg-black/22 px-3 py-2">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.16em] text-parchment-200/44">Nearby</p>
            <p className="mt-1 font-serif text-lg text-parchment-100">{nearby.length}</p>
          </div>
        </div>
      </section>

      {nearby.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Nearby Roads</p>
          <div className="grid grid-cols-2 gap-2">
            {nearby.map(place => (
              <div key={place} className="border border-amber-200/14 bg-amber-300/[0.035] px-3 py-2">
                <p className="truncate font-serif text-sm text-parchment-100">{place}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Regions</p>
        <div className="space-y-3">
          {regions.map(region => {
            const regionNodes = region.locations
              .map(name => nodes.find(node => node.name === name))
              .filter((node): node is LocationNode => !!node)
            return (
              <div key={region.name} className="border border-white/8 bg-white/[0.018] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="font-fantasy text-base text-parchment-100">{region.name}</h4>
                  <span className="font-serif text-xs text-parchment-200/44">{regionNodes.length} places</span>
                </div>
                <div className="space-y-2">
                  {regionNodes.map(node => (
                    <LocationCard key={node.name} node={node} active={node.name === current?.name} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {current && (current.npcsPresent.length > 0 || current.questHooks.length > 0 || current.partyHere.length > 0) && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Current Markers</p>
          <div className="space-y-2">
            {current.partyHere.length > 0 && <p className="border border-emerald-200/14 bg-emerald-300/[0.035] px-3 py-2 font-serif text-sm text-parchment-200/72">Party presence is marked here.</p>}
            {current.npcsPresent.map(npc => (
              <p key={npc} className="border border-violet-200/14 bg-violet-300/[0.035] px-3 py-2 font-serif text-sm text-parchment-200/72">NPC: {npc}</p>
            ))}
            {current.questHooks.map(quest => (
              <p key={quest} className="border border-amber-200/14 bg-amber-300/[0.035] px-3 py-2 font-serif text-sm text-parchment-200/72">Quest: {quest}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
