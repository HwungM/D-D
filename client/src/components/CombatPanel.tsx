import type { WorldState, Ability, CombatEnemy } from '../../../shared/types'

interface Props {
  combatState: WorldState['combatState']
  abilities: Ability[]
  onAction: (action: string) => void
  disabled: boolean
}

const ARCHETYPE_ICONS: Record<string, string> = {
  beast: 'BST',
  soldier: 'GRD',
  mage: 'ARC',
  boss: 'BOS',
  minion: 'MIN',
}

const CONDITION_COLOR: Record<string, string> = {
  healthy: '#22c55e',
  wounded: '#eab308',
  critical: '#ef4444',
}

const CONDITION_WIDTH: Record<string, string> = {
  healthy: '100%',
  wounded: '45%',
  critical: '15%',
}

function EnemyBar({ enemy }: { enemy: CombatEnemy }) {
  const color = CONDITION_COLOR[enemy.condition]
  const width = CONDITION_WIDTH[enemy.condition]
  const icon = ARCHETYPE_ICONS[enemy.archetype] || 'FOE'

  return (
    <div
      className="flex items-center gap-2"
      style={{
        opacity: enemy.isDefeated ? 0.35 : 1,
        textDecoration: enemy.isDefeated ? 'line-through' : 'none',
      }}
    >
      <span className="border border-white/10 bg-white/[0.025] px-1.5 py-0.5 font-fantasy text-[8px] uppercase tracking-[0.1em] text-parchment-200/48">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className="font-serif text-xs truncate"
            style={{ color: enemy.isDefeated ? 'rgba(160,140,110,0.3)' : 'rgba(200,180,140,0.85)' }}
          >
            {enemy.name}
          </span>
          <span
            className="font-sans text-xs ml-2 shrink-0"
            style={{ color, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            {enemy.isDefeated ? 'defeated' : enemy.condition}
          </span>
        </div>
        <div className="w-full overflow-hidden" style={{ height: 2, background: 'rgba(255,255,255,0.08)' }}>
          {!enemy.isDefeated && (
            <div
              className="h-full transition-all duration-700"
              style={{ width, background: color, boxShadow: `0 0 4px ${color}80` }}
            />
          )}
        </div>
        {enemy.specialAbility && !enemy.isDefeated && (
          <p className="font-serif text-xs mt-0.5 truncate" style={{ color: 'rgba(180,100,100,0.5)', fontSize: 9 }}>
            {enemy.specialAbility}
          </p>
        )}
      </div>
    </div>
  )
}

export default function CombatPanel({ combatState, abilities, onAction, disabled }: Props) {
  if (!combatState?.inCombat) return null

  const availableAbilities = abilities.filter(a => !a.currentCooldown || a.currentCooldown <= 0)
  const onCooldown = abilities.filter(a => a.currentCooldown && a.currentCooldown > 0)
  const enemies = combatState.enemies || [
    { name: combatState.enemyName, archetype: 'soldier' as const, maxHp: 30, condition: combatState.enemyCondition, isDefeated: false },
  ]

  const livingEnemies = enemies.filter(e => !e.isDefeated)
  const allDefeated = livingEnemies.length === 0

  return (
    <div
      className="mx-4 mb-2 border border-red-200/20 bg-black/58 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.42)]"
      style={{
        borderTopColor: combatState.isBossFight ? 'rgba(248,113,113,0.55)' : 'rgba(245,158,11,0.38)',
      }}
    >
      {/* Enemy status */}
      <div className="mb-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-red-100/70">
            {combatState.isBossFight ? `Boss Fight / Phase ${combatState.bossPhase || 1}` : `Enemies / Round ${combatState.roundNumber}`}
          </span>
          {allDefeated && (
            <span className="font-fantasy text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(34,197,94,0.78)' }}>All Fallen</span>
          )}
        </div>
        <div className="space-y-1.5">
          {enemies.map((enemy, i) => <EnemyBar key={i} enemy={enemy} />)}
        </div>
      </div>

      {/* Abilities */}
      {availableAbilities.length > 0 && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 10 }} />
          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/58 mb-2">
              Available Abilities
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableAbilities.map(ability => (
                <button
                  key={ability.name}
                  disabled={disabled}
                  onClick={() => onAction(`Use ${ability.name}`)}
                  title={ability.description}
                  className="border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.14em] transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: 'rgba(200,146,42,0.08)',
                    border: '1px solid rgba(200,146,42,0.25)',
                    color: 'rgba(200,146,42,0.85)',
                  }}
                  onMouseEnter={e => {
                    if (!disabled) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(200,146,42,0.18)'
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.5)'
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(200,146,42,0.08)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(200,146,42,0.25)'
                  }}
                >
                  {ability.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Cooldowns hint */}
      {onCooldown.length > 0 && (
        <p className="font-serif text-xs mt-1.5" style={{ color: 'rgba(160,120,80,0.35)', fontSize: 10 }}>
          On cooldown: {onCooldown.map(a => `${a.name} (${a.currentCooldown})`).join(' / ')}
        </p>
      )}
    </div>
  )
}
