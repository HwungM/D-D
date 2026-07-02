import type { WorldState } from '../../../shared/types'

interface Props {
  skillChallenge: NonNullable<WorldState['sceneState']>['skillChallenge']
}

const CONTEST_TYPE_LABEL: Record<string, string> = {
  heist: 'Heist',
  social: 'Social Maneuver',
  gambling: 'Gambling Match',
  chase: 'Chase',
  other: 'Contest',
}

// Compact progress indicator for an active non-combat structured contest
// (heist/gambling/social con/chase — see WorldState.sceneState.skillChallenge).
// Deliberately distinct from CombatPanel's red/danger accent — this isn't a
// fight, it's a tense multi-step effort, so it uses the violet/cyan "codex"
// accent already established elsewhere in the app.
export default function ContestPanel({ skillChallenge }: Props) {
  if (!skillChallenge) return null

  const successPct = skillChallenge.targetSuccesses > 0
    ? Math.min(100, (skillChallenge.successes / skillChallenge.targetSuccesses) * 100)
    : 0
  const failPct = skillChallenge.maxFailures > 0
    ? Math.min(100, (skillChallenge.failures / skillChallenge.maxFailures) * 100)
    : 0
  const typeLabel = CONTEST_TYPE_LABEL[skillChallenge.contestType || 'other'] || 'Contest'

  return (
    <div
      className="mx-4 mb-2 border px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.42)]"
      style={{
        borderColor: 'rgba(167,139,250,0.24)',
        borderTopColor: 'rgba(34,211,238,0.4)',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.05), rgba(34,211,238,0.03))',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-fantasy text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgba(196,181,253,0.82)' }}>
          {typeLabel}
        </span>
        <span className="font-serif text-xs italic truncate" style={{ color: 'rgba(191,244,255,0.6)' }}>
          {skillChallenge.objective}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between">
            <span className="font-fantasy text-[9px] uppercase tracking-[0.18em]" style={{ color: 'rgba(167,243,208,0.7)' }}>Successes</span>
            <span className="font-serif text-xs" style={{ color: 'rgba(167,243,208,0.85)' }}>
              {skillChallenge.successes}/{skillChallenge.targetSuccesses}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden border border-white/10 bg-black/44">
            <div className="h-full transition-all duration-700" style={{ width: `${successPct}%`, background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.6)' }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <span className="font-fantasy text-[9px] uppercase tracking-[0.18em]" style={{ color: 'rgba(252,165,165,0.7)' }}>Failures</span>
            <span className="font-serif text-xs" style={{ color: 'rgba(252,165,165,0.85)' }}>
              {skillChallenge.failures}/{skillChallenge.maxFailures}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden border border-white/10 bg-black/44">
            <div className="h-full transition-all duration-700" style={{ width: `${failPct}%`, background: '#f87171', boxShadow: '0 0 8px rgba(248,113,113,0.6)' }} />
          </div>
        </div>
      </div>

      {(skillChallenge.stakesDescription || skillChallenge.stakes) && (
        <p className="mt-2.5 font-serif text-xs leading-relaxed" style={{ color: 'rgba(220,200,250,0.5)' }}>
          Stakes: {skillChallenge.stakesDescription || skillChallenge.stakes}
        </p>
      )}
    </div>
  )
}
