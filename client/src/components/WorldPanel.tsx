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

function actRoleFor(act?: number): 1 | 2 | 3 {
  const normalized = Math.max(1, Math.floor(act || 1))
  return (((normalized - 1) % 3) + 1) as 1 | 2 | 3
}

function arcNumberFor(act?: number): number {
  return Math.floor((Math.max(1, Math.floor(act || 1)) - 1) / 3) + 1
}

function readinessReport(worldState: WorldState, npcs: NpcMemory[]) {
  const issues: string[] = []
  const audit = Array.isArray(worldState.engineAudit) ? worldState.engineAudit : []
  const latestAudit = audit.length > 0 ? audit[audit.length - 1] : undefined
  const activeCombatants = worldState.combatState?.inCombat ? (worldState.combatState.enemies?.length || 0) : 0
  const act = worldState.campaignSpine?.currentArc.act
  const role = actRoleFor(act)
  const arc = arcNumberFor(act)
  const actionCount = typeof worldState.actionCount === 'number' ? worldState.actionCount : 0

  if (audit.length === 0) issues.push('Take one fresh turn so the engine audit can verify this campaign state.')
  if (latestAudit?.checks.some(check => check.status === 'blocked')) issues.push('The last audited turn had a blocked engine rule. Inspect it before calling the test clean.')
  if (worldState.combatState?.inCombat && activeCombatants === 0) issues.push('Combat is active but no individual enemies are tracked.')
  if ((worldState.activeNPC || worldState.combatState?.enemyName) && npcs.length === 0) issues.push('A named person is active, but the People Sheet is still empty.')

  if (role === 1) {
    if (!worldState.currentLocation && !(worldState.discoveredLocations || []).length) issues.push(`Arc ${arc} setup has not established a playable location yet.`)
    if (!worldState.activeQuests?.some(quest => quest.status === 'active' || quest.status === 'completed') && !(worldState.actGoalsAchieved || []).length) {
      issues.push(`Arc ${arc} setup has not locked in a central hook as a quest, completed beat, or roadmap goal yet.`)
    }
    if (npcs.length === 0) issues.push(`Arc ${arc} setup has not saved any meaningful NPCs yet.`)
  } else if (role === 2) {
    if (!worldState.lastHighStakesAction) issues.push(`Arc ${arc} escalation has not recorded a high-stakes beat yet.`)
    if ((worldState.actGoalsAchieved || []).length < 2) issues.push(`Arc ${arc} escalation has fewer than two roadmap goals recorded.`)
  } else {
    if (worldState.endgamePhase === 'approaching') issues.push('The campaign endgame is approaching, but the final confrontation has not actually happened yet.')
    if (worldState.combatState?.inCombat) issues.push(`Arc ${arc} climax still has active combat; resolve it before treating testing as clean.`)
    const resolutionText = [
      ...(worldState.completedEvents || []),
      ...(worldState.sessionNotes || []),
      ...(worldState.campaignJournal || []).map(entry => entry.summary),
    ].join(' ').toLowerCase()
    if (!/\b(defeated|redeemed|resolved|saved|destroyed|sealed|freed|ended|confronted|victory|epilogue)\b/.test(resolutionText)) {
      issues.push(`Arc ${arc} climax has not recorded a concrete resolution yet.`)
    }
  }

  const spotlightCounts = Object.values(worldState.spotlightBalance || {}).filter((value): value is number => typeof value === 'number')
  if (spotlightCounts.length >= 2 && Math.max(...spotlightCounts) - Math.min(...spotlightCounts) >= 4) {
    issues.push('Co-op spotlight is skewed by four or more turns.')
  }

  const coopRoll = worldState.coopPendingRoll
  const pendingRolls = Array.isArray(coopRoll?.pendingRolls) ? coopRoll.pendingRolls : []
  const unresolvedRolls = pendingRolls.filter(roll => !roll.resolved)
  const expectedRollers = worldState.engineDebug?.coopRoll?.expectedRollers || []
  if (coopRoll) {
    if (pendingRolls.length === 0 && !coopRoll.actingCharacterId) {
      issues.push('A co-op roll queue is active, but no active roller or pending rollers are tracked.')
    }
    if (pendingRolls.length > 0 && unresolvedRolls.length === 0) {
      issues.push('All co-op rolls are resolved, but the co-op roll queue is still active.')
    }
    if (unresolvedRolls.length > 0 && !unresolvedRolls.some(roll => roll.characterId === coopRoll.actingCharacterId)) {
      issues.push('The active co-op roller does not match any unresolved roll in the queue.')
    }
    if (unresolvedRolls.length > 0 && expectedRollers.length === 0) {
      issues.push('A co-op roll is waiting, but engine debug is not listing expected rollers.')
    }
  }

  const pendingTurn = worldState.pendingTurn
  if (pendingTurn?.expiresAt) {
    const expiresAt = Date.parse(pendingTurn.expiresAt)
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      issues.push('A co-op action round appears expired but is still waiting for submissions.')
    }
  }

  if (actionCount >= 3 && !worldState.dmMemory) {
    issues.push('DM campaign memory has not populated after several turns.')
  }
  if (actionCount >= 3 && (!Array.isArray(worldState.characterMemories) || worldState.characterMemories.length === 0)) {
    issues.push('Player character memory has not populated after several turns.')
  }

  const score = Math.max(0, 100 - issues.length * 20)
  const label = score >= 90 ? 'Final-test ready' : score >= 70 ? 'Almost ready' : score >= 40 ? 'Needs attention' : 'Not ready'
  const color = score >= 90 ? '#4ade80' : score >= 70 ? '#f59e0b' : score >= 40 ? '#f97316' : '#f87171'
  return { issues, score, label, color }
}

function shortTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function coOpRollSnapshot(worldState: WorldState) {
  const coopRoll = worldState.coopPendingRoll
  const pendingRolls = Array.isArray(coopRoll?.pendingRolls) ? coopRoll.pendingRolls : []
  const unresolved = pendingRolls.filter(roll => !roll.resolved)
  const resolved = pendingRolls.filter(roll => roll.resolved)
  const currentRoller = unresolved.find(roll => roll.characterId === coopRoll?.actingCharacterId) || unresolved[0]
  const expectedRollers = worldState.engineDebug?.coopRoll?.expectedRollers || unresolved.map(roll => roll.characterName)
  const queueHealthy = !coopRoll
    || (pendingRolls.length === 0 && Boolean(coopRoll.actingCharacterId))
    || (unresolved.length > 0 && (!coopRoll.actingCharacterId || unresolved.some(roll => roll.characterId === coopRoll.actingCharacterId)))

  return {
    active: Boolean(coopRoll),
    description: coopRoll?.rollContext?.description || currentRoller?.rollContext.description || '',
    currentRollerName: currentRoller?.characterName || '',
    expectedRollers,
    pendingRolls,
    unresolved,
    resolved,
    queueHealthy,
  }
}

function dmMemoryItemCount(worldState: WorldState) {
  const memory = worldState.dmMemory
  if (!memory) return 0
  return [
    ...(memory.recurringMotifs || []),
    ...(memory.tableToneNotes || []),
    ...(memory.unresolvedConsequences || []),
    ...(memory.runningJokes || []),
    ...(memory.promisesToHonor || []),
  ].length
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
        <p className="font-serif text-sm italic text-parchment-200/62">The world is still taking shape.</p>
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
  const coopSnapshot = coOpRollSnapshot(worldState)
  const pendingTurnActions = worldState.pendingTurn?.actions || []
  const engineDebugChecks = worldState.engineDebug?.checks || []
  const characterMemories = Array.isArray(worldState.characterMemories) ? worldState.characterMemories : []
  const dmMemoryCount = dmMemoryItemCount(worldState)

  return (
    <div className="space-y-7 p-4 text-sm text-parchment-100">
      {spine && pressure && (
        <section className="border border-amber-200/28 bg-[linear-gradient(135deg,rgba(245,158,11,0.08),rgba(34,211,238,0.04))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-fantasy text-xs uppercase tracking-[0.16em] text-cyan-200/78">Campaign Spine</p>
              <h3 className="mt-1 font-fantasy text-xl text-parchment-100">Act {spine.currentArc.act}: {spine.currentArc.label}</h3>
            </div>
            <span className="shrink-0 border px-2 py-1 font-fantasy text-[9px] uppercase tracking-[0.14em]" style={{ color: pressure.color, borderColor: `${pressure.color}66`, background: `${pressure.color}1c` }}>
              {pressure.label}
            </span>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between gap-3">
              <span className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-parchment-200/60">Arc Momentum</span>
              <span className="font-serif text-xs text-parchment-200/66">{spine.currentArc.progress}%</span>
            </div>
            <div className="h-1.5 border border-white/16 bg-black/44">
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

          <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/86">{spine.lastRecap}</p>
          <div className="mt-4 border border-white/14 bg-black/20 px-3 py-3">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-amber-200/72">Next Pressure</p>
            <p className="mt-1 font-serif text-sm italic leading-relaxed text-parchment-200/78">{spine.nextPressure}</p>
          </div>
        </section>
      )}

      <section className="border p-4" style={{ borderColor: `${readiness.color}55`, background: `${readiness.color}12` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-fantasy text-xs uppercase tracking-[0.16em]" style={{ color: readiness.color }}>Final Test Readiness</p>
            <h3 className="mt-1 font-fantasy text-xl text-parchment-100">{readiness.label}</h3>
          </div>
          <span className="shrink-0 border px-2 py-1 font-mono text-sm" style={{ color: readiness.color, borderColor: `${readiness.color}77`, background: `${readiness.color}1c` }}>
            {readiness.score}%
          </span>
        </div>

        {readiness.issues.length === 0 ? (
          <p className="mt-3 font-serif text-sm leading-relaxed text-parchment-200/80">
            Current tracked state has no obvious readiness blockers. Testing can focus on feel, pacing, and whether the story lands.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {readiness.issues.map((issue, index) => (
              <div key={`${issue}-${index}`} className="border border-white/14 bg-black/20 px-3 py-2">
                <p className="font-serif text-sm leading-relaxed text-parchment-200/78">{issue}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-cyan-200/24 bg-cyan-300/[0.045] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-fantasy text-xs uppercase tracking-[0.16em] text-cyan-200/80">Live Engine State</p>
            <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/66">
              This is the quick truth panel for co-op turns, roll queues, and campaign memory while you test.
            </p>
          </div>
          <span className="shrink-0 border border-cyan-200/28 px-2 py-1 font-mono text-[10px] text-cyan-100/82">
            {worldState.engineDebug?.updatedAt ? shortTime(worldState.engineDebug.updatedAt) : 'live'}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="border border-white/14 bg-black/22 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-parchment-200/62">Co-op Turn</p>
              <span className={`font-fantasy text-[9px] uppercase tracking-[0.14em] ${pendingTurnActions.length ? 'text-amber-200/86' : 'text-emerald-200/82'}`}>
                {pendingTurnActions.length ? 'Waiting' : 'Clear'}
              </span>
            </div>
            <p className="mt-2 font-serif text-sm text-parchment-100">
              {pendingTurnActions.length ? `${pendingTurnActions.length} submitted action${pendingTurnActions.length === 1 ? '' : 's'}` : 'No pending party action round.'}
            </p>
            {pendingTurnActions.length > 0 && (
              <p className="mt-1 font-serif text-xs text-parchment-200/58">
                Expires {shortTime(worldState.pendingTurn?.expiresAt)}
              </p>
            )}
          </div>

          <div className="border border-white/14 bg-black/22 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-parchment-200/62">Roll Queue</p>
              <span className={`font-fantasy text-[9px] uppercase tracking-[0.14em] ${coopSnapshot.active ? (coopSnapshot.queueHealthy ? 'text-amber-200/86' : 'text-red-200/90') : 'text-emerald-200/82'}`}>
                {coopSnapshot.active ? (coopSnapshot.queueHealthy ? 'Active' : 'Check') : 'Clear'}
              </span>
            </div>
            <p className="mt-2 font-serif text-sm text-parchment-100">
              {coopSnapshot.active
                ? `${coopSnapshot.unresolved.length} unresolved / ${coopSnapshot.resolved.length} resolved`
                : 'No pending roll.'}
            </p>
            {coopSnapshot.currentRollerName && (
              <p className="mt-1 font-serif text-xs text-parchment-200/60">Now waiting on {coopSnapshot.currentRollerName}</p>
            )}
          </div>
        </div>

        {coopSnapshot.active && (
          <div className="mt-3 border border-white/14 bg-black/18 px-3 py-3">
            {coopSnapshot.description && (
              <p className="font-serif text-xs leading-relaxed text-parchment-200/70">{coopSnapshot.description}</p>
            )}
            {coopSnapshot.expectedRollers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coopSnapshot.expectedRollers.map((name, index) => (
                  <span key={`${name}-${index}`} className="border border-cyan-200/26 bg-cyan-200/[0.08] px-2 py-1 font-fantasy text-[9px] uppercase tracking-[0.13em] text-cyan-100/84">
                    {name}
                  </span>
                ))}
              </div>
            )}
            {coopSnapshot.pendingRolls.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {coopSnapshot.pendingRolls.map(roll => (
                  <div key={roll.characterId} className="flex items-center justify-between gap-3 border border-white/14 bg-white/[0.035] px-2 py-2">
                    <span className="font-serif text-xs text-parchment-100">{roll.characterName}</span>
                    <span className={`font-mono text-[10px] ${roll.resolved ? 'text-emerald-200/82' : 'text-amber-200/86'}`}>
                      {roll.resolved ? `rolled ${roll.rollTotal ?? roll.rollResult ?? '?'}` : `${roll.rollContext.stat.toUpperCase()} DC ${roll.dc ?? roll.rollContext.dc}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="border border-white/14 bg-white/[0.035] px-3 py-2">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.18em] text-purple-200/70">NPC Memory</p>
            <p className="mt-1 font-mono text-sm text-parchment-100">{npcs.length}</p>
          </div>
          <div className="border border-white/14 bg-white/[0.035] px-3 py-2">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.18em] text-purple-200/70">Hero Memory</p>
            <p className="mt-1 font-mono text-sm text-parchment-100">{characterMemories.length}</p>
          </div>
          <div className="border border-white/14 bg-white/[0.035] px-3 py-2">
            <p className="font-fantasy text-[9px] uppercase tracking-[0.18em] text-purple-200/70">DM Memory</p>
            <p className="mt-1 font-mono text-sm text-parchment-100">{dmMemoryCount}</p>
          </div>
        </div>

        {engineDebugChecks.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {engineDebugChecks.slice(-3).map((check, index) => {
              const style = AUDIT_STYLE[check.status] || AUDIT_STYLE.info
              return (
                <div key={`${check.label}-${index}`} className="border border-white/14 bg-black/18 px-2 py-2">
                  <p className="font-fantasy text-[9px] uppercase tracking-[0.16em]" style={{ color: style.color }}>
                    {style.label}: {check.label}
                  </p>
                  <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/66">{check.detail}</p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="border border-purple-300/24 bg-purple-300/[0.05] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-fantasy text-xs uppercase tracking-[0.16em] text-purple-200/78">Playtest Engine Audit</p>
            <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/66">
              Use this while testing to see why the engine allowed, blocked, or remembered things.
            </p>
          </div>
          <span className="shrink-0 border border-purple-200/28 px-2 py-1 font-mono text-[10px] text-purple-100/82">
            {auditEntries.length}/5
          </span>
        </div>

        {auditEntries.length === 0 ? (
          <div className="mt-3 border border-white/14 bg-black/20 px-3 py-3">
            <p className="font-serif text-sm italic text-parchment-200/62">
              No audit entries yet. Take a new action and this panel will start showing engine decisions.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {auditEntries.map(entry => (
              <article key={entry.id} className="border border-white/16 bg-black/24 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-purple-100/72">
                      Act {entry.act} / Action {entry.actionCount}
                    </p>
                    <p className="mt-1 truncate font-serif text-sm text-parchment-100">{entry.actionSummary}</p>
                    <p className="mt-0.5 font-serif text-xs text-parchment-200/56">
                      {[entry.location, entry.scenePurpose && formatLabel(entry.scenePurpose), entry.pacingMode && formatLabel(entry.pacingMode)].filter(Boolean).join(' / ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px] text-parchment-200/64">
                      {entry.stateDigest.combatantsTracked} foes / {entry.stateDigest.npcMemoryUpdates} NPCs
                    </p>
                    {entry.stateDigest.highStakes && (
                      <p className="mt-1 font-fantasy text-[9px] uppercase tracking-[0.14em] text-amber-200/82">High stakes</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {entry.checks.slice(0, 5).map((check, index) => {
                    const style = AUDIT_STYLE[check.status] || AUDIT_STYLE.info
                    return (
                      <div key={`${check.label}-${index}`} className="border border-white/14 bg-white/[0.035] px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color, boxShadow: `0 0 8px ${style.color}` }} />
                          <p className="font-fantasy text-[9px] uppercase tracking-[0.16em]" style={{ color: style.color }}>
                            {style.label}: {check.label}
                          </p>
                        </div>
                        <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/68">{check.detail}</p>
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
          <div className="border border-cyan-200/26 bg-cyan-200/[0.07] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-cyan-200/78">Location</p>
            <p className="mt-1 font-serif text-sm text-parchment-100">{worldState.currentLocation}</p>
          </div>
        )}
        {worldState.timeOfDay && (
          <div className="border border-amber-300/26 bg-amber-300/[0.07] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/78">Conditions</p>
            <p className="mt-1 font-serif text-sm text-parchment-100">
              {formatLabel(worldState.timeOfDay)}
            </p>
          </div>
        )}
      </div>

      {spine?.openThreads && spine.openThreads.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-xs uppercase tracking-[0.16em] text-parchment-200/78">Open Threads</p>
          <div className="space-y-2">
            {spine.openThreads.map((thread, index) => (
              <div key={`${thread}-${index}`} className="border border-cyan-200/20 bg-cyan-300/[0.045] px-3 py-2">
                <p className="font-serif text-sm leading-relaxed text-parchment-200/82">{thread}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 font-fantasy text-xs uppercase tracking-[0.16em] text-parchment-200/78">Known Characters</p>
        {npcs.length === 0 ? (
          <div className="border border-white/14 bg-white/[0.035] px-3 py-4">
            <p className="font-serif text-sm italic text-parchment-200/62">
              No named NPCs have been saved yet. Future turns now promote active named NPCs into this list automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {npcs.map(npc => {
              const disp = DISPOSITION_STYLE[npc.disposition] ?? DISPOSITION_STYLE.unknown
              return (
                <article key={npc.name} className="border border-white/16 bg-white/[0.045] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center border font-mono text-xs" style={{ color: disp.color, borderColor: `${disp.color}77`, background: `${disp.color}1c` }}>
                      {disp.marker}
                    </span>
                    <h3 className="font-serif text-base font-semibold text-parchment-100">{npc.name}</h3>
                    <span className="ml-auto font-fantasy text-[10px] uppercase tracking-[0.16em]" style={{ color: disp.color }}>{disp.label}</span>
                  </div>
                  {npc.notes && (
                    <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/82">{npc.notes}</p>
                  )}
                  {npc.lastMet && (
                    <p className="mt-1 font-serif text-xs text-parchment-200/56">Last seen: {npc.lastMet}</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {spine?.keyRelationships && spine.keyRelationships.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-xs uppercase tracking-[0.16em] text-parchment-200/78">Relationship Focus</p>
          <div className="space-y-2">
            {spine.keyRelationships.map(npc => {
              const disp = DISPOSITION_STYLE[npc.disposition] ?? DISPOSITION_STYLE.unknown
              return (
                <article key={npc.name} className="border border-white/16 bg-white/[0.035] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center border font-serif text-xs" style={{ color: disp.color, borderColor: `${disp.color}77`, background: `${disp.color}1c` }}>
                      {disp.marker}
                    </span>
                    <h3 className="font-serif text-sm font-semibold text-parchment-100">{npc.name}</h3>
                    <span className="ml-auto font-fantasy text-[9px] uppercase tracking-[0.14em]" style={{ color: disp.color }}>{disp.label}</span>
                  </div>
                  <p className="mt-2 font-serif text-xs leading-relaxed text-parchment-200/68">{npc.note}</p>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {journal.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-xs uppercase tracking-[0.16em] text-parchment-200/78">Campaign Recap</p>
          <div className="space-y-2">
            {journal.slice(-2).reverse().map((entry, index) => {
              const e = entry as Record<string, unknown>
              return (
                <article key={index} className="border border-amber-300/24 bg-amber-300/[0.06] px-3 py-3">
                  <p className="font-mono text-xs text-amber-200/78">
                    Act {safeStr(e.actNumber) || '?'} / Session {safeStr(e.sessionNumber) || '?'}
                  </p>
                  <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/86">{safeStr(e.summary)}</p>
                  {Array.isArray(e.keyDecisions) && e.keyDecisions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {(e.keyDecisions as unknown[]).slice(0, 2).map((decision, decisionIndex) => (
                        <p key={decisionIndex} className="font-serif text-xs text-parchment-200/66">- {safeStr(decision)}</p>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {worldState.partyAssets && worldState.partyAssets.length > 0 && (
        <section>
          <p className="mb-2 font-fantasy text-xs uppercase tracking-[0.16em] text-parchment-200/78">Holdings &amp; Titles</p>
          <div className="space-y-2">
            {worldState.partyAssets.map(asset => (
              <article key={asset.id} className="border border-violet-200/26 bg-violet-300/[0.055] px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 border border-violet-200/32 bg-violet-300/[0.08] px-2 py-0.5 font-fantasy text-[9px] uppercase tracking-[0.14em] text-violet-100/82">
                    {asset.kind}
                  </span>
                  <h3 className="min-w-0 flex-1 font-serif text-sm font-semibold text-parchment-100">{asset.name}</h3>
                </div>
                <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/82">{asset.description}</p>
                {asset.locationName && (
                  <p className="mt-1 font-serif text-xs text-parchment-200/56">Location: {asset.locationName}</p>
                )}
                {asset.unlocksHint && (
                  <p className="mt-1.5 font-serif text-xs italic text-violet-100/64">{asset.unlocksHint}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {factionEntries.length > 0 && (
        <section>
          <p className="mb-3 font-fantasy text-xs uppercase tracking-[0.16em] text-parchment-200/78">Faction Standing</p>
          <div className="space-y-3">
            {factionEntries.map(([name, value]) => {
              const { color, label, pct } = reputationBar(value)
              return (
                <div key={name}>
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="font-serif text-sm text-parchment-100">{name}</span>
                    <span className="font-fantasy text-[10px] uppercase tracking-[0.14em]" style={{ color }}>{label}</span>
                  </div>
                  <div className="h-1 bg-white/14">
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
