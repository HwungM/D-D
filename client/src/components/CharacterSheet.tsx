import type { Character, CharacterStats } from '../../../shared/types'

interface CharacterSheetProps {
  character: Character
}

const STAT_LABELS: Record<keyof CharacterStats, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

function statMod(val: number): string {
  const mod = Math.floor((val - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function racePortraitUrl(race: string): string {
  const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
  return `/assets/races/${key}.png`
}

function itemIconUrl(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('sword') || n.includes('blade') || n.includes('longsword')) return '/assets/items/sword-common.png'
  if (n.includes('dagger') || n.includes('knife') || n.includes('shortsword')) return '/assets/items/dagger.png'
  if (n.includes('axe') || n.includes('hatchet')) return '/assets/items/axe.png'
  if (n.includes('bow') && !n.includes('elbow')) return '/assets/items/bow.png'
  if (n.includes('arrow') || n.includes('bolt')) return '/assets/items/arrows.png'
  if (n.includes('staff')) return '/assets/items/staff-wooden.png'
  if (n.includes('wand')) return '/assets/items/wand-basic.png'
  if (n.includes('spear') || n.includes('lance')) return '/assets/items/spear.png'
  if (n.includes('mace') || n.includes('flail') || n.includes('club')) return '/assets/items/mace.png'
  if (n.includes('halberd') || n.includes('polearm') || n.includes('glaive')) return '/assets/items/halberd.png'
  if (n.includes('hammer') || n.includes('warhammer')) return '/assets/items/warhammer.png'
  if (n.includes('potion') && (n.includes('health') || n.includes('heal') || n.includes('hp'))) return '/assets/items/potion-health.png'
  if (n.includes('potion') && (n.includes('mana') || n.includes('magic'))) return '/assets/items/potion-mana.png'
  if (n.includes('potion') || n.includes('elixir') || n.includes('brew')) return '/assets/items/potion-health.png'
  if (n.includes('armor') || n.includes('mail') || n.includes('plate') || n.includes('breastplate')) return '/assets/items/armor-chain.png'
  if (n.includes('leather armor') || n.includes('hide armor')) return '/assets/items/armor-leather.png'
  if (n.includes('shield')) return '/assets/items/shield.png'
  if (n.includes('helmet') || n.includes('helm') || n.includes('hood')) return '/assets/items/helmet-iron.png'
  if (n.includes('cloak') || n.includes('robe') || n.includes('cape') || n.includes('mantle')) return '/assets/items/cloak.png'
  if (n.includes('boots') || n.includes('shoes') || n.includes('greaves')) return '/assets/items/boots.png'
  if (n.includes('gloves') || n.includes('gauntlets') || n.includes('bracers')) return '/assets/items/gloves-leather.png'
  if (n.includes('ring')) return '/assets/items/ring.png'
  if (n.includes('amulet') || n.includes('necklace') || n.includes('pendant') || n.includes('talisman')) return '/assets/items/amulet.png'
  if (n.includes('scroll')) return '/assets/items/scroll.png'
  if (n.includes('tome') || n.includes('book') || n.includes('spellbook') || n.includes('grimoire')) return '/assets/items/tome.png'
  if (n.includes('torch')) return '/assets/items/tool-torch.png'
  if (n.includes('rope')) return '/assets/items/tool-rope.png'
  if (n.includes('lockpick')) return '/assets/items/tool-lockpick.png'
  if (n.includes('key')) return '/assets/items/key.png'
  if (n.includes('food') || n.includes('bread') || n.includes('ration') || n.includes('meal')) return '/assets/items/food-bread.png'
  if (n.includes('gold') || n.includes('coin')) return '/assets/items/gold-coin.png'
  if (n.includes('gem') || n.includes('jewel') || n.includes('ruby') || n.includes('sapphire')) return '/assets/items/gem-currency.png'
  if (n.includes('pack') || n.includes('bag') || n.includes('backpack') || n.includes('kit')) return '/assets/items/tool-rope.png'
  if (n.includes('journal') || n.includes('diary') || n.includes('letter')) return '/assets/items/journal.png'
  if (n.includes('map')) return '/assets/items/scroll-map.png'
  return '/assets/items/quest-orb.png'
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
        <div className="w-24 h-24 mx-auto border border-slate-600 overflow-hidden">
          <img
            src={character.portrait_url || racePortraitUrl(character.race)}
            alt={character.name}
            className="w-full h-full object-cover object-top"
            onError={e => {
              const img = e.target as HTMLImageElement
              img.src = '/assets/items/quest-orb.png'
            }}
          />
        </div>
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
        <div className="flex items-center gap-1.5">
          <img src="/assets/items/gold-coin.png" alt="gold" className="w-4 h-4 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span className="text-parchment-300 font-serif">{character.gold} gp</span>
        </div>
      </div>

      {/* Inventory */}
      {character.inventory.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Inventory</p>
          <div className="space-y-1">
            {character.inventory.map((item, i) => (
              <div key={item.id || i} className="flex items-center gap-2 border border-slate-800 bg-slate-900 px-2 py-1.5">
                <img
                  src={itemIconUrl(item.name)}
                  alt={item.name}
                  className="w-6 h-6 object-cover shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <span className="text-slate-300 font-serif text-xs flex-1">{item.name}</span>
                {item.quantity > 1 && <span className="text-slate-500 text-xs">×{item.quantity}</span>}
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
