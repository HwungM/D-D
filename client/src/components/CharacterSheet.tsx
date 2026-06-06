import { useState } from 'react'
import type { Character, CharacterStats } from '../../../shared/types'
import { getItemProperties, getRarityColor } from '../lib/itemSystem'

const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

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
  return `/assets/races/${race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')}.png`
}

const EXACT_ASSETS = new Set([
  'sword-iron','sword-steel','sword-silver','sword-enchanted','sword-rare','sword-legendary','sword-cursed',
  'sword-common','longsword',
  'dagger','dagger-common','dagger-enchanted','dagger-poison',
  'axe','axe-hand','axe-battle','axe-great',
  'bow','bow-short','bow-long','bow-enchanted',
  'staff-wooden','staff-arcane','staff-elemental',
  'wand-basic','wand-enchanted',
  'spear','mace','halberd','warhammer',
  'armor-leather','armor-studded','armor-chain','armor-breastplate','armor-plate','armor-dark-plate',
  'shield','shield-wooden','shield-iron','shield-enchanted',
  'helmet-iron','helmet-horned','gauntlets-iron','gloves-leather',
  'boots','boots-leather','boots-enchanted',
  'cloak','cloak-common','cloak-elvish','cloak-shadow',
  'ring','ring-iron','ring-gold','ring-enchanted',
  'amulet','amulet-silver','amulet-bone','amulet-enchanted',
  'potion-health','potion-health-small','potion-health-medium','potion-health-large',
  'potion-mana','potion-mana-small','potion-mana-medium','potion-mana-large',
  'potion-invisibility','potion-speed','potion-strength','potion-poison',
  'scroll','scroll-spell','scroll-ancient','scroll-map',
  'tome','tome-ancient','journal',
  'tool-torch','tool-rope','tool-lockpick','tool-grapple',
  'arrows','arrows-magic','bolts',
  'food-bread','food-meat','drink-ale','drink-wine',
  'key','quest-key','quest-letter','quest-rune','quest-orb','quest-gem',
  'gem-currency','gold-coin','gold-pouch','silver-coin','treasure-chest',
])

function itemIconUrl(name: string): string {
  const n = name.toLowerCase().trim()
  // Exact asset name match
  if (EXACT_ASSETS.has(n)) return `/assets/items/${n}.png`
  // Slug match (replace spaces with dashes)
  const slug = n.replace(/\s+/g, '-')
  if (EXACT_ASSETS.has(slug)) return `/assets/items/${slug}.png`
  // Keyword matching (most specific first)
  if (n.includes('sword-iron') || n.includes('iron sword')) return '/assets/items/sword-iron.png'
  if (n.includes('sword-steel') || n.includes('steel sword')) return '/assets/items/sword-steel.png'
  if (n.includes('sword-silver') || n.includes('silver sword')) return '/assets/items/sword-silver.png'
  if (n.includes('sword-enchanted') || n.includes('enchanted sword') || (n.includes('sword') && n.includes('enchant'))) return '/assets/items/sword-enchanted.png'
  if (n.includes('sword-legendary') || n.includes('legendary sword')) return '/assets/items/sword-legendary.png'
  if (n.includes('sword-cursed') || n.includes('cursed sword')) return '/assets/items/sword-cursed.png'
  if (n.includes('sword-rare') || n.includes('rare sword')) return '/assets/items/sword-rare.png'
  if (n.includes('longsword')) return '/assets/items/longsword.png'
  if (n.includes('sword') || n.includes('blade')) return '/assets/items/sword-common.png'
  if (n.includes('dagger-enchanted') || (n.includes('dagger') && n.includes('enchant'))) return '/assets/items/dagger-enchanted.png'
  if (n.includes('dagger-poison') || n.includes('poison dagger')) return '/assets/items/dagger-poison.png'
  if (n.includes('dagger') || n.includes('knife') || n.includes('shortsword')) return '/assets/items/dagger.png'
  if (n.includes('axe-great') || n.includes('greataxe') || n.includes('great axe')) return '/assets/items/axe-great.png'
  if (n.includes('axe-battle') || n.includes('battleaxe') || n.includes('battle axe')) return '/assets/items/axe-battle.png'
  if (n.includes('axe-hand') || n.includes('hand axe') || n.includes('hatchet')) return '/assets/items/axe-hand.png'
  if (n.includes('axe')) return '/assets/items/axe.png'
  if (n.includes('bow-enchanted') || (n.includes('bow') && n.includes('enchant'))) return '/assets/items/bow-enchanted.png'
  if (n.includes('longbow') || n.includes('bow-long') || n.includes('long bow')) return '/assets/items/bow-long.png'
  if (n.includes('shortbow') || n.includes('bow-short') || n.includes('short bow')) return '/assets/items/bow-short.png'
  if (n.includes('bow') && !n.includes('elbow')) return '/assets/items/bow.png'
  if (n.includes('staff-elemental') || (n.includes('staff') && n.includes('element'))) return '/assets/items/staff-elemental.png'
  if (n.includes('staff-arcane') || (n.includes('staff') && n.includes('arcane'))) return '/assets/items/staff-arcane.png'
  if (n.includes('staff')) return '/assets/items/staff-wooden.png'
  if (n.includes('wand-enchanted') || (n.includes('wand') && n.includes('enchant'))) return '/assets/items/wand-enchanted.png'
  if (n.includes('wand')) return '/assets/items/wand-basic.png'
  if (n.includes('spear') || n.includes('lance')) return '/assets/items/spear.png'
  if (n.includes('mace') || n.includes('flail') || n.includes('club')) return '/assets/items/mace.png'
  if (n.includes('halberd') || n.includes('polearm') || n.includes('glaive')) return '/assets/items/halberd.png'
  if (n.includes('hammer') || n.includes('warhammer')) return '/assets/items/warhammer.png'
  if (n.includes('armor-dark') || n.includes('dark plate') || n.includes('darkplate')) return '/assets/items/armor-dark-plate.png'
  if (n.includes('armor-plate') || n.includes('plate armor') || (n.includes('plate') && !n.includes('breast'))) return '/assets/items/armor-plate.png'
  if (n.includes('armor-breast') || n.includes('breastplate')) return '/assets/items/armor-breastplate.png'
  if (n.includes('armor-stud') || n.includes('studded leather')) return '/assets/items/armor-studded.png'
  if (n.includes('armor-chain') || n.includes('chainmail') || n.includes('chain mail') || n.includes('mail') || n.includes('ring mail')) return '/assets/items/armor-chain.png'
  if (n.includes('armor-leather') || n.includes('leather armor') || n.includes('hide armor')) return '/assets/items/armor-leather.png'
  if (n.includes('armor') || n.includes('plate')) return '/assets/items/armor-chain.png'
  if (n.includes('shield-enchanted') || (n.includes('shield') && n.includes('enchant'))) return '/assets/items/shield-enchanted.png'
  if (n.includes('shield-iron') || n.includes('iron shield')) return '/assets/items/shield-iron.png'
  if (n.includes('shield-wooden') || n.includes('wooden shield') || n.includes('wood shield')) return '/assets/items/shield-wooden.png'
  if (n.includes('shield')) return '/assets/items/shield.png'
  if (n.includes('helmet-horned') || n.includes('horned helm')) return '/assets/items/helmet-horned.png'
  if (n.includes('helmet') || n.includes('helm') || n.includes('hood')) return '/assets/items/helmet-iron.png'
  if (n.includes('gauntlet')) return '/assets/items/gauntlets-iron.png'
  if (n.includes('gloves') || n.includes('bracers')) return '/assets/items/gloves-leather.png'
  if (n.includes('boots-enchanted') || (n.includes('boots') && n.includes('enchant'))) return '/assets/items/boots-enchanted.png'
  if (n.includes('boots-leather') || n.includes('leather boots')) return '/assets/items/boots-leather.png'
  if (n.includes('boots') || n.includes('shoes') || n.includes('greaves')) return '/assets/items/boots.png'
  if (n.includes('cloak-shadow') || n.includes('shadow cloak')) return '/assets/items/cloak-shadow.png'
  if (n.includes('cloak-elvish') || n.includes('elven cloak') || n.includes('elvish cloak')) return '/assets/items/cloak-elvish.png'
  if (n.includes('cloak') || n.includes('robe') || n.includes('cape')) return '/assets/items/cloak.png'
  if (n.includes('ring-enchanted') || (n.includes('ring') && n.includes('enchant'))) return '/assets/items/ring-enchanted.png'
  if (n.includes('ring-gold') || n.includes('gold ring')) return '/assets/items/ring-gold.png'
  if (n.includes('ring-iron') || n.includes('iron ring')) return '/assets/items/ring-iron.png'
  if (n.includes('ring')) return '/assets/items/ring.png'
  if (n.includes('amulet-enchanted') || (n.includes('amulet') && n.includes('enchant'))) return '/assets/items/amulet-enchanted.png'
  if (n.includes('amulet-bone') || n.includes('bone amulet')) return '/assets/items/amulet-bone.png'
  if (n.includes('amulet-silver') || n.includes('silver amulet')) return '/assets/items/amulet-silver.png'
  if (n.includes('amulet') || n.includes('necklace') || n.includes('pendant') || n.includes('talisman')) return '/assets/items/amulet.png'
  if (n.includes('potion') && n.includes('health') && n.includes('large')) return '/assets/items/potion-health-large.png'
  if (n.includes('potion') && n.includes('health') && n.includes('medium')) return '/assets/items/potion-health-medium.png'
  if (n.includes('potion') && n.includes('health') && n.includes('small')) return '/assets/items/potion-health-small.png'
  if (n.includes('potion') && (n.includes('health') || n.includes('heal') || n.includes('hp'))) return '/assets/items/potion-health.png'
  if (n.includes('potion') && n.includes('mana') && n.includes('large')) return '/assets/items/potion-mana-large.png'
  if (n.includes('potion') && n.includes('mana') && n.includes('medium')) return '/assets/items/potion-mana-medium.png'
  if (n.includes('potion') && n.includes('mana') && n.includes('small')) return '/assets/items/potion-mana-small.png'
  if (n.includes('potion') && (n.includes('mana') || n.includes('magic'))) return '/assets/items/potion-mana.png'
  if (n.includes('potion') && n.includes('invisib')) return '/assets/items/potion-invisibility.png'
  if (n.includes('potion') && n.includes('speed')) return '/assets/items/potion-speed.png'
  if (n.includes('potion') && n.includes('strength')) return '/assets/items/potion-strength.png'
  if (n.includes('potion') && n.includes('poison')) return '/assets/items/potion-poison.png'
  if (n.includes('potion') || n.includes('elixir') || n.includes('vial') || n.includes('flask')) return '/assets/items/potion-health.png'
  if (n.includes('scroll-ancient') || n.includes('ancient scroll')) return '/assets/items/scroll-ancient.png'
  if (n.includes('scroll-map') || n.includes('map scroll')) return '/assets/items/scroll-map.png'
  if (n.includes('scroll-spell') || (n.includes('scroll') && n.includes('spell'))) return '/assets/items/scroll-spell.png'
  if (n.includes('scroll')) return '/assets/items/scroll.png'
  if (n.includes('tome-ancient') || n.includes('ancient tome')) return '/assets/items/tome-ancient.png'
  if (n.includes('tome') || n.includes('book') || n.includes('spellbook') || n.includes('grimoire')) return '/assets/items/tome.png'
  if (n.includes('journal') || n.includes('diary')) return '/assets/items/journal.png'
  if (n.includes('letter') || n.includes('quest-letter')) return '/assets/items/quest-letter.png'
  if (n.includes('torch')) return '/assets/items/tool-torch.png'
  if (n.includes('rope')) return '/assets/items/tool-rope.png'
  if (n.includes('lockpick') || n.includes('lock pick') || n.includes('thieves')) return '/assets/items/tool-lockpick.png'
  if (n.includes('grapple') || n.includes('grappling hook')) return '/assets/items/tool-grapple.png'
  if (n.includes('arrows-magic') || n.includes('magic arrow') || n.includes('magical arrow')) return '/assets/items/arrows-magic.png'
  if (n.includes('arrows') || n.includes('arrow')) return '/assets/items/arrows.png'
  if (n.includes('bolts') || n.includes('bolt') || n.includes('crossbow bolt')) return '/assets/items/bolts.png'
  if (n.includes('quest-key') || (n.includes('key') && n.includes('quest'))) return '/assets/items/quest-key.png'
  if (n.includes('key')) return '/assets/items/key.png'
  if (n.includes('quest-rune') || n.includes('rune')) return '/assets/items/quest-rune.png'
  if (n.includes('quest-orb') || n.includes('orb')) return '/assets/items/quest-orb.png'
  if (n.includes('quest-gem') || (n.includes('gem') && n.includes('quest'))) return '/assets/items/quest-gem.png'
  if (n.includes('gem') || n.includes('ruby') || n.includes('sapphire') || n.includes('jewel') || n.includes('crystal')) return '/assets/items/gem-currency.png'
  if (n.includes('gold-pouch') || n.includes('gold pouch') || n.includes('coin pouch')) return '/assets/items/gold-pouch.png'
  if (n.includes('silver-coin') || n.includes('silver coin')) return '/assets/items/silver-coin.png'
  if (n.includes('gold') || n.includes('coin')) return '/assets/items/gold-coin.png'
  if (n.includes('treasure-chest') || n.includes('chest')) return '/assets/items/treasure-chest.png'
  if (n.includes('food-meat') || n.includes('cooked meat') || n.includes('meat')) return '/assets/items/food-meat.png'
  if (n.includes('food') || n.includes('bread') || n.includes('ration') || n.includes('meal')) return '/assets/items/food-bread.png'
  if (n.includes('drink-ale') || n.includes('ale') || n.includes('beer') || n.includes('flagon')) return '/assets/items/drink-ale.png'
  if (n.includes('drink-wine') || n.includes('wine')) return '/assets/items/drink-wine.png'
  if (n.includes('map')) return '/assets/items/scroll-map.png'
  return '/assets/items/quest-orb.png'
}

const ITEM_TYPE_COLOR: Record<string, string> = {
  weapon: 'rgba(192,57,43,0.4)',
  armor: 'rgba(100,130,180,0.4)',
  potion: 'rgba(100,180,80,0.4)',
  key: 'rgba(200,146,42,0.5)',
  misc: 'rgba(180,160,120,0.2)',
}

export default function CharacterSheet({ character }: CharacterSheetProps) {
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [abilitiesOpen, setAbilitiesOpen] = useState(true)

  const hpPercent = Math.max(0, (character.hp / character.max_hp) * 100)
  const hpColor = hpPercent > 60 ? '#22c55e' : hpPercent > 30 ? '#eab308' : '#ef4444'

  const xpCurrent = XP_THRESHOLDS[character.level - 1] ?? 0
  const xpNext    = XP_THRESHOLDS[character.level] ?? xpCurrent
  const xpPercent = xpNext > xpCurrent ? Math.min(100, ((character.xp - xpCurrent) / (xpNext - xpCurrent)) * 100) : 100

  const reputation = Object.entries(character.reputation ?? {}).filter(([, v]) => v !== 0)

  return (
    <div className="text-sm h-full overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
      {/* Portrait + identity */}
      <div className="relative">
        <div className="w-full h-40 overflow-hidden relative">
          <img
            src={character.portrait_url || racePortraitUrl(character.race)}
            alt={character.name}
            className="w-full h-full object-cover object-top"
            onError={e => { (e.target as HTMLImageElement).src = '/assets/items/quest-orb.png' }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 50%, #0a0b10 100%)' }} />
        </div>
        <div className="px-4 pb-3 -mt-10 relative z-10">
          <h3 className="font-fantasy text-xl" style={{ color: '#e8d4a8', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>{character.name}</h3>
          <p className="font-serif text-xs mt-0.5" style={{ color: 'rgba(200,146,42,0.7)' }}>
            {character.race} {character.class}{character.subclass ? ` Â· ${character.subclass}` : ''} Â· Level {character.level}
          </p>
          {!character.is_alive && (
            <p className="font-sans text-xs font-bold uppercase tracking-widest mt-1" style={{ color: '#f87171' }}>âœ Fallen</p>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4 pb-6">
        {/* HP */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(160,140,110,0.5)' }}>Hit Points</span>
            <span className="font-mono text-xs font-bold" style={{ color: hpColor }}>{character.hp} / {character.max_hp}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${hpPercent}%`, background: hpColor, boxShadow: `0 0 8px ${hpColor}60` }} />
          </div>
        </div>

        {/* XP */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(160,140,110,0.5)' }}>Experience</span>
            <span className="font-mono text-xs" style={{ color: 'rgba(180,160,120,0.5)' }}>{character.xp.toLocaleString()} XP</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${xpPercent}%`, background: 'rgba(200,146,42,0.6)' }} />
          </div>
          {character.level < 20 && (
            <p className="text-xs mt-1 text-right" style={{ color: 'rgba(160,140,110,0.3)', fontSize: '10px' }}>
              {(xpNext - character.xp).toLocaleString()} XP to level {character.level + 1}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Attributes</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(STAT_LABELS) as (keyof CharacterStats)[]).map(stat => {
              const val = character.stats[stat]
              const mod = Math.floor((val - 10) / 2)
              return (
                <div key={stat} className="text-center py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="text-xs mb-0.5" style={{ color: 'rgba(160,140,110,0.45)', letterSpacing: '0.1em' }}>{STAT_LABELS[stat]}</div>
                  <div className="font-serif text-xl leading-none" style={{ color: '#d4c5a0' }}>{val}</div>
                  <div className="text-xs mt-0.5 font-mono" style={{ color: mod >= 0 ? 'rgba(100,180,100,0.7)' : 'rgba(220,80,80,0.7)' }}>{statMod(val)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Gold */}
        <div className="flex items-center justify-between py-2 px-3" style={{ background: 'rgba(200,146,42,0.06)', border: '1px solid rgba(200,146,42,0.15)' }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(200,146,42,0.5)' }}>Gold</span>
          <div className="flex items-center gap-1.5">
            <img src="/assets/items/gold-coin.png" alt="" className="w-4 h-4" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="font-serif font-bold" style={{ color: '#c89228' }}>{character.gold.toLocaleString()} gp</span>
          </div>
        </div>

        {/* Status Effects */}
        {character.status_effects && character.status_effects.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Status Effects</p>
            <div className="flex flex-wrap gap-1.5">
              {character.status_effects.map((effect, i) => {
                const color = effect.type === 'buff' ? '#7ae87a' : effect.type === 'debuff' ? '#e87a7a' : '#b09070'
                return (
                  <div
                    key={i}
                    className="px-2 py-1 text-xs font-serif"
                    title={effect.description}
                    style={{
                      border: `1px solid ${color}40`,
                      background: `${color}0d`,
                      color,
                    }}
                  >
                    {effect.type === 'buff' ? 'â†‘' : effect.type === 'debuff' ? 'â†“' : '~'} {effect.name}
                    {effect.duration && <span style={{ opacity: 0.5 }}> ({effect.duration})</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Abilities */}
        {character.abilities.length > 0 && (
          <div>
            <button
              onClick={() => setAbilitiesOpen(!abilitiesOpen)}
              className="w-full flex items-center justify-between mb-2"
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(160,140,110,0.45)' }}>Abilities</span>
              <span className="text-xs" style={{ color: 'rgba(160,140,110,0.3)' }}>{abilitiesOpen ? 'â–²' : `â–¼ ${character.abilities.length}`}</span>
            </button>
            {abilitiesOpen && (
              <div className="space-y-1.5">
                {character.abilities.map((ability, i) => (
                  <div key={i} className="px-3 py-2" style={{ background: 'rgba(192,57,43,0.04)', border: '1px solid rgba(192,57,43,0.12)' }}>
                    <p className="font-serif text-xs font-bold mb-0.5" style={{ color: '#e8b09a' }}>{ability.name}</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(180,160,120,0.6)' }}>{ability.description}</p>
                    {ability.cooldown && (
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(160,140,110,0.35)', fontSize: '10px' }}>Cooldown: {ability.cooldown} turns</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inventory toggle */}
        <div>
          <button
            onClick={() => setInventoryOpen(!inventoryOpen)}
            className="w-full flex items-center justify-between mb-2 group"
          >
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(160,140,110,0.45)' }}>Inventory</span>
            <span className="text-xs" style={{ color: 'rgba(160,140,110,0.3)' }}>
              {inventoryOpen ? 'â–² Hide' : `â–¼ ${character.inventory.length} items`}
            </span>
          </button>
          {inventoryOpen && (
            character.inventory.length === 0 ? (
              <p className="font-serif text-xs italic text-center py-2" style={{ color: 'rgba(160,140,110,0.3)' }}>Your pack is empty</p>
            ) : (
              <div className="space-y-1">
                {character.inventory.map((item, i) => {
                  const props = getItemProperties(item.name)
                  const rarityCol = props?.rarity ? getRarityColor(props.rarity) : null
                  return (
                    <div key={item.id || i} className="flex items-start gap-2 px-2 py-1.5" style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${rarityCol || ITEM_TYPE_COLOR[item.type] || 'rgba(255,255,255,0.06)'}`,
                    }}>
                      <img
                        src={itemIconUrl(item.name)}
                        alt=""
                        className="w-6 h-6 object-cover shrink-0 mt-0.5"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {rarityCol && (
                            <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: rarityCol, boxShadow: `0 0 4px ${rarityCol}` }} />
                          )}
                          <p className="font-serif text-xs truncate" style={{ color: '#c8bfa0' }}>{item.name}</p>
                        </div>
                        {props?.damageRoll && (
                          <p className="text-xs" style={{ color: 'rgba(200,146,42,0.65)', fontSize: '10px' }}>
                            {props.damageRoll} {props.damageType}
                          </p>
                        )}
                        {props?.acBonus && !props.damageRoll && (
                          <p className="text-xs" style={{ color: 'rgba(100,130,200,0.7)', fontSize: '10px' }}>
                            +{props.acBonus} AC
                          </p>
                        )}
                        {props?.effect && (
                          <p className="text-xs truncate" style={{ color: 'rgba(160,140,110,0.5)', fontSize: '10px' }}>
                            {props.effect.slice(0, 60)}{props.effect.length > 60 ? 'â€¦' : ''}
                          </p>
                        )}
                        {!props?.effect && item.description && (
                          <p className="text-xs truncate" style={{ color: 'rgba(160,140,110,0.4)', fontSize: '10px' }}>{item.description}</p>
                        )}
                        {props?.consumable && (
                          <p className="text-xs" style={{ color: 'rgba(160,120,80,0.5)', fontSize: '9px' }}>Single use</p>
                        )}
                      </div>
                      {item.quantity > 1 && <span className="text-xs shrink-0" style={{ color: 'rgba(160,140,110,0.4)' }}>Ã—{item.quantity}</span>}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        {/* Reputation */}
        {reputation.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.45)' }}>Reputation</p>
            <div className="space-y-2">
              {reputation.map(([faction, val]) => {
                const v = val as number
                const color = v >= 50 ? '#4ade80' : v >= 10 ? '#c89228' : v >= -10 ? 'rgba(180,160,120,0.5)' : '#f87171'
                const label = v >= 50 ? 'Allied' : v >= 10 ? 'Friendly' : v >= -10 ? 'Neutral' : v >= -50 ? 'Hostile' : 'Enemy'
                const pct = ((v + 100) / 200) * 100
                return (
                  <div key={faction}>
                    <div className="flex justify-between mb-1">
                      <span className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.6)' }}>{faction}</span>
                      <span className="text-xs" style={{ color, fontSize: '10px' }}>{label}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.7s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Backstory */}
        {character.backstory && (
          <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(160,140,110,0.35)' }}>Origin</p>
            <p className="font-serif text-xs italic leading-relaxed" style={{ color: 'rgba(160,140,110,0.5)' }}>{character.backstory}</p>
          </div>
        )}
      </div>
    </div>
  )
}
