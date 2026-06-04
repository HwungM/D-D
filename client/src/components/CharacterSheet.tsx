import type { Character, CharacterStats } from '../../../shared/types'

interface CharacterSheetProps {
  character: Character
}

const STAT_LABELS: Record<keyof CharacterStats, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

function statMod(val: number): string {
  const mod = Math.floor((val - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export default function CharacterSheet({ character }: CharacterSheetProps) {
  const hpPercent = Math.max(0, (character.hp / character.max_hp) * 100)
  const hpColor = hpPercent > 60 ? 'bg-forest-600' : hpPercent > 30 ? 'bg-yellow-700' : 'bg-ember-600'

  const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000]
  const currentThreshold = xpThresholds[character.level - 1] ?? 0
  const nextThreshold = xpThresholds[character.level] ?? xpThresholds[xpThresholds.length - 1]
  const xpPercent = Math.min(100, ((character.xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100)

  return (
    <div className="p-4 space-y-5 text-sm">
      {/* Portrait & identity */}
      <div className="text-center">
        {character.portrait_url ? (
          <img src={character.portrait_url} alt={character.name} className="w-24 h-24 mx-auto object-cover border border-slate-600" />
        ) : (
          <div className="w-24 h-24 mx-auto bg-slate-800 border border-slate-700 flex items-center justify-center text-4xl">⚔</div>
        )}
        <h3 className="font-fantasy text-parchment-200 text-lg mt-2">{character.name}</h3>
        <p className="text-slate-400 text-xs">{character.race} {character.class}</p>
        <p className="text-slate-500 text-xs">Level {character.level}</p>
        {!character.is_alive && (
          <p className="text-ember-400 text-xs font-bold uppercase mt-1">✝ Deceased</p>
        )}
      </div>

      {/* HP */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Hit Points</span>
          <span className={character.hp <= character.max_hp * 0.3 ? 'text-ember-400 font-bold' : ''}>{character.hp}/{character.max_hp}</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${hpColor} transition-all duration-500`} style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      {/* XP */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Experience</span>
          <span>{character.xp} XP</span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-parchment-300/40 transition-all duration-500" style={{ width: `${xpPercent}%` }} />
        </div>
      </div>

      {/* Stats */}
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Attributes</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(STAT_LABELS) as (keyof CharacterStats)[]).map(stat => (
            <div key={stat} className="stat-box text-center">
              <span className="text-slate-500 text-xs">{STAT_LABELS[stat]}</span>
              <span className="text-parchment-200 font-bold text-lg leading-none">{character.stats[stat]}</span>
              <span className="text-slate-400 text-xs">{statMod(character.stats[stat])}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gold */}
      <div className="flex justify-between items-center border-t border-slate-800 pt-3">
        <span className="text-xs text-slate-400 uppercase tracking-wide">Gold</span>
        <span className="text-parchment-300 font-serif">{character.gold} gp</span>
      </div>

      {/* Inventory */}
      {character.inventory.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Inventory</p>
          <div className="space-y-1">
            {character.inventory.map((item, i) => (
              <div key={item.id || i} className="flex justify-between text-xs border border-slate-800 bg-slate-900 px-2 py-1.5">
                <span className="text-slate-300 font-serif">{item.name}</span>
                {item.quantity > 1 && <span className="text-slate-500">×{item.quantity}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Abilities */}
      {character.abilities.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Abilities</p>
          <div className="space-y-1.5">
            {character.abilities.map((ability, i) => (
              <div key={i} className="border border-slate-800 bg-slate-900 px-2 py-1.5">
                <p className="text-xs text-parchment-200 font-serif">{ability.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{ability.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backstory */}
      {character.backstory && (
        <div className="border-t border-slate-800 pt-3">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Origin</p>
          <p className="text-xs text-slate-400 font-serif italic">{character.backstory}</p>
        </div>
      )}
    </div>
  )
}
