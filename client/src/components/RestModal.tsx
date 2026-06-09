interface RestOption {
  id: string
  icon: string
  label: string
  duration: string
  effect: string
  cost?: string
  disabled?: boolean
  disabledReason?: string
  action: string
}

interface Props {
  locationHint: string
  playerGold: number
  hpPercent: number
  inCombat: boolean
  onRest: (action: string) => void
  onClose: () => void
}

export default function RestModal({ locationHint, playerGold, hpPercent, inCombat, onRest, onClose }: Props) {
  const loc = locationHint.toLowerCase()
  const hasTavern = loc.includes('inn') || loc.includes('tavern') || loc.includes('town') || loc.includes('city') || loc.includes('village')
  const hasCamp = !loc.includes('dungeon') && !loc.includes('combat')
  const innCost = 5
  const canAffordInn = playerGold >= innCost

  const options: RestOption[] = [
    {
      id: 'short',
      icon: '🕐',
      label: 'Short Rest',
      duration: '1 hour',
      effect: 'Spend a hit die to recover some HP. Recharge short-rest abilities.',
      action: 'I take a short rest, spending a hit die to recover.',
    },
    {
      id: 'camp',
      icon: '⛺',
      label: 'Make Camp',
      duration: '8 hours',
      effect: 'Full HP recovery. Reset all abilities. Requires a safe location.',
      action: 'We make camp and take a long rest through the night.',
      disabled: !hasCamp,
      disabledReason: 'Not safe enough to camp here',
    },
    {
      id: 'inn',
      icon: '🏠',
      label: 'Inn Stay',
      duration: '8 hours',
      effect: `Full recovery + inspired. Costs ${innCost} gold.`,
      cost: `${innCost} gp`,
      action: `I pay ${innCost} gold for a room at the inn and take a proper rest.`,
      disabled: !hasTavern || !canAffordInn,
      disabledReason: !hasTavern ? 'No inn nearby' : 'Not enough gold',
    },
  ]

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div
        className="relative w-full max-w-md"
        style={{ background: 'rgba(12,8,3,0.98)', border: '1px solid rgba(200,146,42,0.3)', boxShadow: '0 30px 120px rgba(0,0,0,0.8)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(200,146,42,0.15)' }}>
          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em]" style={{ color: 'rgba(200,146,42,0.7)' }}>Recovery</p>
            <h2 className="mt-0.5 font-fantasy text-2xl" style={{ color: '#f5e6c8' }}>Rest</h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-opacity hover:opacity-100 opacity-60"
            style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(220,200,160,0.7)' }}
          >
            Cancel
          </button>
        </div>

        {inCombat && (
          <div className="px-5 py-3" style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.12)' }}>
            <p className="font-serif text-sm italic" style={{ color: 'rgba(248,113,113,0.8)' }}>
              You cannot rest during combat.
            </p>
          </div>
        )}

        <div className="space-y-2 p-4">
          {options.map(opt => (
            <button
              key={opt.id}
              disabled={inCombat || opt.disabled}
              onClick={() => { onClose(); onRest(opt.action) }}
              className="w-full text-left transition-all disabled:cursor-not-allowed disabled:opacity-38"
              style={{
                border: '1px solid rgba(200,146,42,0.2)',
                background: 'rgba(200,146,42,0.04)',
                padding: '14px 16px',
              }}
              onMouseEnter={e => { if (!opt.disabled && !inCombat) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.48)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.2)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 22 }}>{opt.icon}</span>
                  <div>
                    <p className="font-fantasy text-base" style={{ color: '#f5e6c8' }}>{opt.label}</p>
                    <p className="font-serif text-[11px]" style={{ color: 'rgba(200,146,42,0.65)' }}>{opt.duration}</p>
                  </div>
                </div>
                {opt.cost && (
                  <span className="shrink-0 font-serif text-sm" style={{ color: 'rgba(251,191,36,0.75)' }}>{opt.cost}</span>
                )}
              </div>
              <p className="mt-2 font-serif text-sm leading-relaxed" style={{ color: 'rgba(220,195,155,0.65)' }}>
                {opt.disabled && opt.disabledReason ? opt.disabledReason : opt.effect}
              </p>
            </button>
          ))}
        </div>

        <div className="px-5 pb-4">
          <p className="font-serif text-xs italic" style={{ color: 'rgba(180,155,110,0.38)' }}>
            HP: {Math.round(hpPercent)}% · Gold: {playerGold} gp
            {hasTavern ? ' · Inn available' : hasCamp ? ' · Camp possible' : ' · No safe rest nearby'}
          </p>
        </div>
      </div>
    </div>
  )
}
