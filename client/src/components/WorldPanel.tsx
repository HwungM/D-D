import type { NpcMemory, WorldState } from '../../../shared/types'

interface WorldPanelProps {
  worldState: WorldState | null
}

const DISPOSITION_STYLE: Record<string, { color: string; label: string; marker: string }> = {
  friendly: { color: '#4ade80', label: 'Friendly', marker: '+' },
  neutral: { color: '#f59e0b', label: 'Neutral', marker: '=' },
  hostile: { color: '#f87171', label: 'Hostile', marker: '!' },
  unknown: { color: '#94a3b8', label: 'Unknown', marker: '?' },
}

const PRESSURE_STYLE: Record<string, { label: string; color: string }> = {
  low: { label: 'Low Pressure', color: '#22d3ee' },
  rising: { label: 'Rising', color: '#f59e0b' },
  dangerous: { label: 'Dangerous', color: '#f97316' },
  climax: { label: 'Climax', color: '#f87171' },
}

const AUDIT_STYLE: Record<string, { color: string; label: string }> = {
  pass: { color: '#4ade80', label: 'Pass' },
  warn: { color: '#f59e0b', label: 'Watch' },
  blocked: { color: '#f87171', label: 'Blocked' },
  info: { color: '#94a3b8', label: 'Info' },
}

function safeStr(value: unknown) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatLabel(value?: string) {
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
}

function reputationBar(value: unknown) {
  const num = typeof value === 'number' ? value : 0
  const clamped = Math.max(-100, Math.min(100, num))
  const color = clamped >= 50 ? '#4ade80' : clamped >= 0 ? '#f59e0b' : clamped >= -50 ? '#f97316' : '#f87171'
  const label = clamped >= 50 ? 'Allied' : clamped >= 10 ? 'Friendly' : clamped >= -10 ? 'Neutral' : clamped >= -50 ? 'Hostile' : 'Enemy'
  const pct = ((clamped + 100) / 200) * 100
  return { color, label, pct }
}

function readinessReport(worldState: WorldState, npcs: NpcMemory[]) {
  const issues: string[] = []
  const audit = Array.isArray(worldState.engineAudit) ? worldState.engineAudit : []
  const latestAudit = audit.length > 0 ? audit[audit.length - 1] : undefined
  const activeCombatants = worldState.combatState?.inCombat ? (worldState.combatState.enemies?.length || 0) : 0
  const act = worldState.campaignSpine?.currentArc.act

  if (audit.length === 0) issues.push('Take one fresh turn so the engine audit can verify this campaign state.')
  if (latestAudit?.checks.some(check => check.status === 'blocked')) issues.push('The last audited turn had a blocked engine rule. Inspect it before calling the test clean.')
  if (worldState.combatState?.inCombat && activeCombatants === 0) issues.push('Combat is active but no individual enemies are tracked.')
  if ((worldState.activeNPC || worldState.combatState?.enemyName) && npcs.length === 0) issues.push('A named person is active, but the People Sheet is still empty.')
  if (act === 2 && !worldState.lastHighStakesAction) issues.push('Act II has not recorded a high-stakes beat yet.')

  const spotlightCounts = Object.values(worldState.spotlightBalance || {}).filter((value): value is number => typeof value === 'number')
  if (spotlightCounts.length >= 2 && Math.max(...spotlightCounts) - Math.min(...spotlightCounts) >= 4) {
    issues.push('Co-op spotlight is skewed by four or more turns.')
  }

  const score = Math.max(0, 100 - issues.length * 20)
  const label = score >= 90 ? 'Final-test ready' : score >= 70 ? 'Almost ready' : score >= 40 ? 'Needs attention' : 'Not ready'
  const color = score >= 90 ? '#4ade80' : score >= 70 ? '#f59e0b' : score >= 40 ? '#f97316' : '#f87171'
  return { issues, score, label, color }
}

function uniqueNpcList(worldState: WorldState): NpcMemory[] {
  const byName = new Map<string, NpcMemory>()
  const add = (npc: unknown) => {
    if (!npc || typeof npc !== 'object') return
    const candidate = npc as Partial<NpcMemory>
    const name = safeStr(candidate.name).trim()
    if (!name) return
    byName.set(name.toLowerCase(), {
      name,
      disposition: candidate.disposition || 'unknown',
      notes: safeStr(candidate.notes) || 'Encountered in the current campaign.',
      lastMet: candidate.lastMet,
      metCharacters: candidate.metCharacters,
      interactionCount: candidate.interactionCount,
      isKeyNPC: candidate.isKeyNPC,
      relationshipScore: candidate.relationshipScore,
      relationshipLabel: candidate.relationshipLabel,
      role: candidate.role,
      portrait_url: candidate.portrait_url,
      gender: candidate.gender,
    })
  }

  if (Array.isArray(worldState.keyNPCs)) worldState.keyNPCs.forEach(add)
  if (Array.isArray(worldState.npcMemory)) worldState.npcMemory.forEach(add)
  if (worldState.activeNPC) {
    add({
      name: worldState.activeNPC,
      disposition: 'unknown',
      notes: `Currently relevant near ${worldState.currentLocation || 'the party'}.`,
      lastMet: worldState.currentLocation,
    })
  }
  if (Array.isArray(worldState.campaignJournal)) {
    worldState.campaignJournal.forEach(entry => {
      entry.majorNPCsIntroduced?.forEach(name => {
        add({
          name,
          disposition: 'unknown',
          notes: 'Mentioned in the campaign recap. Needs a fresher interaction note.',
          lastMet: `Session ${entry.sessionNumber}`,
        })
      })
    })
  }

  return Array.from(byName.values())
}

export default function WorldPanel({ worldState }: WorldPanelProps) {
  if (!worldState) {
    return (
      <div className="p-5 text-center">
        <p className="font-serif text-sm italic text-parchment-200/52">The world is still taking shape.</p>
      </div>
    )
  }

  const npcs = uniqueNpcList(worldState)
  const factionEntries = worldState.factionStandings && typeof worldState.factionStandings === 'object'
    ? Object.entries(worldState.factionStandings)
    : []
  const journal = Array.isArray((worldState as Record<string, unknown>).campaignJournal)
    ? ((worldState as Record<string, unknown>).campaignJournal as unknown[])
    : []
  const spine = worldState.campaignSpine
  const pressure = spine ? (PRESSURE_STYLE[spine.currentArc.pressure] || PRESSURE_STYLE.low) : null
  const auditEntries = Array.isArray(worldState.engineAudit) ? worldState.engineAudit.slice(-5).reverse() : []
  const readiness = readinessReport(worldState, npcs)

  return (
    <div className="space-y-6 p-4 text-sm text-parchment-100">
      {spine && pressure && (
        <section className="border border-amber-200/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.07),rgba(34,211,238,0.035))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-cyan-200/62">Campaign Spine</p>
              <h3 className="mt-1 font-fantasy text-xl text-parchment-100">Act {spine.currentArc.act}: {spine.currentArc.label}</h3>
            </div>
            <span className="shrink-0 border px-2 py-1 font-fantasy text-[9px] uppercase tracking-[0.14em]" style={{ color: pressure.color, borderColor: `${pressure.color}55`, background: `${pressure.color}14` }}>
              {pressure.label}
            </span>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between gap-3">
              <span className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-parchment-200/46">Arc Momentum</span>
              <span className="font-serif text-xs text-parchment-200/56">{spine.currentArc.progress}%</span>
            </div>
            <div className="h-1.5 border border-white/10 bg-black/44">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${spine.currentArc.progress}%`,
                  background: `linear-gradient(90deg, rgba(34,211,238,0.72), ${pressure.color})`,
                  boxShadow: `0 0 14px ${pressure.color}66`,
                }}
              />
            </div>
          </div>

          <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/76">{spine.lastRecap}</p>
          <div className="mt-4 border border-white/8 bg-black/20 px-3 py-3">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-amber-200/58">Next Pressure</p>
            <p className="mt-1 font-serif text-sm italic leading-relaxed text-parchment-200/68">{spine.nextPressure}</p>
          </div>
        </section>
      )}

      <section className="border p-4" style={{ borderColor: `${readiness.color}44`, background: `${readiness.color}10` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.24em]" style={{ color: readiness.color }}>Final Test Readiness</p>
            <h3 className="mt-1 font-fantasy text-xl text-parchment-100">{readiness.label}</h3>
          </div>
          <span className="shrink-0 border px-2 py-1 font-mono text-sm" style={{ color: readiness.color, borderColor: `${readiness.color}66`, background: `${readiness.color}14` }}>
            {readiness.score}%
          </span>
        </div>

        {readiness.issues.length === 0 ? (
          <p className="mt-3 font-serif text-sm leading-relaxed text-parchment-200/70">
            Current tracked state has no obvious readiness blockers. Testing can focus on feel, pacing, and whether the story lands.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {readiness.issues.map((issue, index) => (
              <div key={`${issue}-${index}`} className="border border-white/8 bg-black/20 px-3 py-2">
                <p className="font-serif text-sm leading-relaxed text-parchment-200/68">{issue}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-purple-300/16 bg-purple-300/[0.035] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-purple-200/64">Playtest Engine Audit</p>
            <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/56">
              Use this while testing to see why the engine allowed, blocked, or remembered things.
            </p>
          </div>
          <span className="shrink-0 border border-purple-200/20 px-2 py-1 font-mono text-[10px] text-purple-100/70">
            {auditEntries.length}/5
          </span>
        </div>

        {auditEntries.length === 0 ? (
          <div className="mt-3 border border-white/8 bg-black/20 px-3 py-3">
            <p className="font-serif text-sm italic text-parchment-200/50">
              No audit entries yet. Take a new action and this panel will start showing engine decisions.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {auditEntries.map(entry => (
              <article key={entry.id} className="border border-white/10 bg-black/24 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-purple-100/60">
                      Act {entry.act} / Action {entry.actionCount}
                    </p>
                    <p className="mt-1 truncate font-serif text-sm text-parchment-100">{entry.actionSummary}</p>
                    <p className="mt-0.5 font-serif text-xs text-parchment-200/42">
                      {[entry.location, entry.scenePurpose && formatLabel(entry.scenePurpose), entry.pacingMode && formatLabel(entry.pacingMode)].filter(Boolean).join(' / ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px] text-parchment-200/52">
                      {entry.stateDigest.combatantsTracked} foes / {entry.stateDigest.npcMemoryUpdates} NPCs
                    </p>
                    {entry.stateDigest.highStakes && (
                      <p className="mt-1 font-fantasy text-[9px] uppercase tracking-[0.14em] text-amber-200/70">High stakes</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {entry.checks.slice(0, 5).map((check, index) => {
                    const style = AUDIT_STYLE[check.status] || AUDIT_STYLE.info
                    return (
                      <div key={`${check.label}-${index}`} className="border border-white/8 bg-white/[0.025] px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color, boxShadow: `0 0 8px ${style.color}` }} />
                          <p className="font-fantasy text-[9px] uppercase tracking-[0.16em]" style={{ color: style.color }}>
                            {style.label}: {check.label}
                          </p>
                        </div>
                        <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/58">{check.detail}</p>
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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

      {spine?.openThreads && spine.openThreads.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Open Threads</p>
          <div className="space-y-2">
            {spine.openThreads.map((thread, index) => (
              <div key={`${thread}-${index}`} className="border border-cyan-200/14 bg-cyan-300/[0.035] px-3 py-2">
                <p className="font-serif text-sm leading-relaxed text-parchment-200/72">{thread}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Known Characters</p>
        {npcs.length === 0 ? (
          <div className="border border-white/8 bg-white/[0.025] px-3 py-4">
            <p className="font-serif text-sm italic text-parchment-200/52">
              No named NPCs have been saved yet. Future turns now promote active named NPCs into this list automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {npcs.map(npc => {
              const disp = DISPOSITION_STYLE[npc.disposition] ?? DISPOSITION_STYLE.unknown
              return (
                <article key={npc.name} className="border border-white/10 bg-white/[0.035] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center border font-mono text-xs" style={{ color: disp.color, borderColor: `${disp.color}66`, background: `${disp.color}14` }}>
                      {disp.marker}
                    </span>
                    <h3 className="font-serif text-base font-semibold text-parchment-100">{npc.name}</h3>
                    <span className="ml-auto font-fantasy text-[10px] uppercase tracking-[0.16em]" style={{ color: disp.color }}>{disp.label}</span>
                  </div>
                  {npc.notes && (
                    <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/72">{npc.notes}</p>
                  )}
                  {npc.lastMet && (
                    <p className="mt-1 font-serif text-xs text-parchment-200/42">Last seen: {npc.lastMet}</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {spine?.keyRelationships && spine.keyRelationships.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Relationship Focus</p>
          <div className="space-y-2">
            {spine.keyRelationships.map(npc => {
              const disp = DISPOSITION_STYLE[npc.disposition] ?? DISPOSITION_STYLE.unknown
              return (
                <article key={npc.name} className="border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center border font-serif text-xs" style={{ color: disp.color, borderColor: `${disp.color}66`, background: `${disp.color}14` }}>
                      {disp.marker}
                    </span>
                    <h3 className="font-serif text-sm font-semibold text-parchment-100">{npc.name}</h3>
                    <span className="ml-auto font-fantasy text-[9px] uppercase tracking-[0.14em]" style={{ color: disp.color }}>{disp.label}</span>
                  </div>
                  <p className="mt-2 font-serif text-xs leading-relaxed text-parchment-200/58">{npc.note}</p>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {journal.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Campaign Recap</p>
          <div className="space-y-2">
            {journal.slice(-2).reverse().map((entry, index) => {
              const e = entry as Record<string, unknown>
              return (
                <article key={index} className="border border-amber-300/16 bg-amber-300/[0.045] px-3 py-3">
                  <p className="font-mono text-xs text-amber-200/66">
                    Act {safeStr(e.actNumber) || '?'} / Session {safeStr(e.sessionNumber) || '?'}
                  </p>
                  <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/76">{safeStr(e.summary)}</p>
                  {Array.isArray(e.keyDecisions) && e.keyDecisions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {(e.keyDecisions as unknown[]).slice(0, 2).map((decision, decisionIndex) => (
                        <p key={decisionIndex} className="font-serif text-xs text-parchment-200/56">- {safeStr(decision)}</p>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {factionEntries.length > 0 && (
        <section>
          <p className="mb-3 font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">Faction Standing</p>
          <div className="space-y-3">
            {factionEntries.map(([name, value]) => {
              const { color, label, pct } = reputationBar(value)
              return (
                <div key={name}>
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="font-serif text-sm text-parchment-100">{name}</span>
                    <span className="font-fantasy text-[10px] uppercase tracking-[0.14em]" style={{ color }}>{label}</span>
                  </div>
                  <div className="h-1 bg-white/8">
                    <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
