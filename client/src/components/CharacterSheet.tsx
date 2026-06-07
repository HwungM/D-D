import { useMemo, useState } from 'react'
import type { Character, CharacterStats, InventoryItem } from '../../../shared/types'

const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
const STAT_LABELS: Record<keyof CharacterStats, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

const TYPE_STYLE: Record<InventoryItem['type'], { label: string; border: string; bg: string; text: string }> = {
  weapon: { label: 'Weapon', border: 'border-red-200/24', bg: 'bg-red-400/[0.055]', text: 'text-red-100/78' },
  armor: { label: 'Armor', border: 'border-cyan-200/22', bg: 'bg-cyan-300/[0.055]', text: 'text-cyan-100/78' },
  potion: { label: 'Potion', border: 'border-emerald-200/22', bg: 'bg-emerald-300/[0.055]', text: 'text-emerald-100/78' },
  misc: { label: 'Gear', border: 'border-amber-200/20', bg: 'bg-amber-300/[0.045]', text: 'text-amber-100/78' },
  key: { label: 'Key Item', border: 'border-violet-200/22', bg: 'bg-violet-300/[0.055]', text: 'text-violet-100/78' },
}

function statMod(value: number) {
  const mod = Math.floor((value - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function racePortraitUrl(race: string) {
  return `/assets/races/${race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')}.png`
}

function itemIcon(item: InventoryItem) {
  const name = item.name.toLowerCase()
  if (name.includes('gold') || name.includes('coin')) return '/assets/items/gold-coin.png'
  if (name.includes('map')) return '/assets/items/scroll-map.png'
  if (name.includes('letter') || name.includes('note')) return '/assets/items/quest-letter.png'
  if (name.includes('journal')) return '/assets/items/journal.png'
  if (name.includes('key')) return '/assets/items/quest-key.png'
  if (name.includes('pack') || name.includes('bag') || name.includes('pouch')) return '/assets/items/gold-pouch.png'
  if (name.includes('charm') || name.includes('amulet')) return '/assets/items/amulet.png'
  if (name.includes('ring')) return '/assets/items/ring-enchanted.png'
  if (name.includes('sword') || name.includes('blade')) return '/assets/items/sword-common.png'
  if (name.includes('dagger')) return '/assets/items/dagger-common.png'
  if (name.includes('bow')) return '/assets/items/bow-long.png'
  if (name.includes('staff')) return '/assets/items/staff-arcane.png'
  if (name.includes('armor') || name.includes('plate')) return '/assets/items/armor-breastplate.png'
  if (name.includes('shield')) return '/assets/items/shield-iron.png'
  if (name.includes('potion')) return '/assets/items/potion-health.png'
  if (name.includes('scroll')) return '/assets/items/scroll.png'
  if (name.includes('torch')) return '/assets/items/tool-torch.png'
  if (name.includes('rope')) return '/assets/items/tool-rope.png'
  return item.type === 'key' ? '/assets/items/quest-orb.png' : '/assets/items/treasure-chest.png'
}

function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/64">{title}</p>
      {right && <span className="font-serif text-xs text-parchment-200/52">{right}</span>}
    </div>
  )
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden border border-white/10 bg-black/54">
      <div
        className="h-full transition-all duration-700"
        style={{ width: `${value}%`, background: color, boxShadow: `0 0 14px ${color}88` }}
      />
    </div>
  )
}

function itemTypeRank(type: InventoryItem['type']) {
  return ['weapon', 'armor', 'potion', 'key', 'misc'].indexOf(type)
}

export default function CharacterSheet({ character }: { character: Character }) {
  const [inventoryOpen, setInventoryOpen] = useState(true)
  const [abilitiesOpen, setAbilitiesOpen] = useState(true)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const hpPercent = Math.max(0, Math.min(100, (character.hp / character.max_hp) * 100))
  const hpColor = hpPercent > 60 ? '#22c55e' : hpPercent > 30 ? '#eab308' : '#ef4444'
  const xpCurrent = XP_THRESHOLDS[character.level - 1] ?? 0
  const xpNext = XP_THRESHOLDS[character.level] ?? xpCurrent
  const xpPercent = xpNext > xpCurrent ? Math.min(100, ((character.xp - xpCurrent) / (xpNext - xpCurrent)) * 100) : 100

  const sortedInventory = useMemo(() => {
    return [...character.inventory].sort((a, b) => {
      const typeDiff = itemTypeRank(a.type) - itemTypeRank(b.type)
      return typeDiff || a.name.localeCompare(b.name)
    })
  }, [character.inventory])
  const selectedItem = sortedInventory.find(item => (item.id || item.name) === selectedItemId) || sortedInventory[0]
  const keyItems = sortedInventory.filter(item => item.type === 'key').length
  const carriedValue = sortedInventory.reduce((sum, item) => sum + ((item.value || 0) * Math.max(1, item.quantity || 1)), 0)

  return (
    <div className="h-full overflow-y-auto text-sm text-parchment-100" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.36) transparent' }}>
      <div className="relative border-b border-white/8">
        <div className="h-48 overflow-hidden bg-black">
          <img
            src={character.portrait_url || racePortraitUrl(character.race)}
            alt={character.name}
            className="h-full w-full object-cover object-top opacity-85"
            onError={e => { (e.currentTarget as HTMLImageElement).src = '/media/everrealm-hero-mobile.png' }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.38)_52%,rgba(0,0,0,0.94)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_4%,rgba(245,158,11,0.18),transparent_34%)]" />
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/64">Adventurer</p>
          <h3 className="mt-1 font-fantasy text-3xl text-parchment-100">{character.name}</h3>
          <p className="mt-1 font-serif text-sm text-amber-200/76">
            {character.race} {character.class}{character.subclass ? ` / ${character.subclass}` : ''} / Level {character.level}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <section className="grid grid-cols-3 gap-2">
          <div className="border border-emerald-200/18 bg-emerald-300/[0.045] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.2em] text-emerald-100/64">HP</p>
            <p className="mt-1 font-serif text-xl text-parchment-100">{character.hp} / {character.max_hp}</p>
          </div>
          <div className="border border-amber-200/18 bg-amber-300/[0.045] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.2em] text-amber-100/64">Gold</p>
            <p className="mt-1 font-serif text-xl text-amber-100">{character.gold.toLocaleString()}</p>
          </div>
          <div className="border border-violet-200/18 bg-violet-300/[0.045] px-3 py-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.2em] text-violet-100/64">Pack</p>
            <p className="mt-1 font-serif text-xl text-parchment-100">{character.inventory.length}</p>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <div className="mb-1.5 flex justify-between">
              <span className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-parchment-200/62">Hit Points</span>
              <span className="font-serif text-xs font-semibold" style={{ color: hpColor }}>{Math.round(hpPercent)}%</span>
            </div>
            <ProgressBar value={hpPercent} color={hpColor} />
          </div>

          <div>
            <div className="mb-1.5 flex justify-between">
              <span className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-parchment-200/62">Experience</span>
              <span className="font-serif text-xs text-parchment-200/58">{character.xp.toLocaleString()} XP</span>
            </div>
            <ProgressBar value={xpPercent} color="#d4a843" />
            {character.level < 20 && (
              <p className="mt-1 text-right font-serif text-[11px] text-parchment-200/42">
                {(xpNext - character.xp).toLocaleString()} XP to level {character.level + 1}
              </p>
            )}
          </div>
        </section>

        <section>
          <SectionTitle title="Attributes" />
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(STAT_LABELS) as (keyof CharacterStats)[]).map(stat => (
              <div key={stat} className="border border-white/10 bg-white/[0.035] px-3 py-3 text-center shadow-[0_12px_42px_rgba(0,0,0,0.18)]">
                <p className="font-fantasy text-[10px] tracking-[0.16em] text-parchment-200/48">{STAT_LABELS[stat]}</p>
                <p className="mt-1 font-serif text-2xl leading-none text-parchment-100">{character.stats[stat]}</p>
                <p className="mt-1 font-serif text-xs text-emerald-300/72">{statMod(character.stats[stat])}</p>
              </div>
            ))}
          </div>
        </section>

        {character.abilities.length > 0 && (
          <section>
            <button type="button" onClick={() => setAbilitiesOpen(v => !v)} className="w-full text-left">
              <SectionTitle title="Abilities" right={abilitiesOpen ? 'Hide' : `${character.abilities.length}`} />
            </button>
            {abilitiesOpen && (
              <div className="space-y-2">
                {character.abilities.map((ability, index) => (
                  <article key={`${ability.name}-${index}`} className="border border-red-200/18 bg-[linear-gradient(90deg,rgba(239,68,68,0.065),rgba(255,255,255,0.018))] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-serif text-sm font-semibold text-red-100">{ability.name}</p>
                      {ability.cooldown != null && (
                        <span className="border border-red-200/16 bg-black/20 px-2 py-0.5 font-fantasy text-[9px] uppercase tracking-[0.14em] text-red-100/54">
                          CD {ability.currentCooldown || 0}/{ability.cooldown}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-serif text-sm leading-relaxed text-parchment-200/72">{ability.description}</p>
                    {ability.mechanic && (
                      <p className="mt-2 border-l border-amber-200/24 pl-3 font-serif text-xs italic leading-relaxed text-amber-100/62">{ability.mechanic}</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <button type="button" onClick={() => setInventoryOpen(v => !v)} className="w-full text-left">
            <SectionTitle title="Inventory" right={inventoryOpen ? 'Hide' : `${character.inventory.length} items / ${keyItems} key`} />
          </button>

          {inventoryOpen && (
            character.inventory.length === 0 ? (
              <p className="border border-white/8 bg-white/[0.025] px-3 py-4 font-serif text-sm italic text-parchment-200/52">Your pack is empty.</p>
            ) : (
              <div className="space-y-3">
                {selectedItem && (
                  <article className={`border ${TYPE_STYLE[selectedItem.type].border} ${TYPE_STYLE[selectedItem.type].bg} p-3`}>
                    <div className="flex gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center border border-white/10 bg-black/34">
                        <img
                          src={itemIcon(selectedItem)}
                          alt=""
                          className="h-11 w-11 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-fantasy text-lg leading-tight text-parchment-100">{selectedItem.name}</p>
                            <p className={`mt-1 font-fantasy text-[10px] uppercase tracking-[0.18em] ${TYPE_STYLE[selectedItem.type].text}`}>
                              {TYPE_STYLE[selectedItem.type].label}
                              {selectedItem.quantity > 1 ? ` / x${selectedItem.quantity}` : ''}
                            </p>
                          </div>
                          {selectedItem.value != null && (
                            <span className="border border-amber-200/18 bg-black/22 px-2 py-1 font-serif text-xs text-amber-100/72">{selectedItem.value} gp</span>
                          )}
                        </div>
                        {selectedItem.description && (
                          <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/72">{selectedItem.description}</p>
                        )}
                      </div>
                    </div>
                  </article>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {sortedInventory.map((item, index) => {
                    const style = TYPE_STYLE[item.type]
                    const id = item.id || item.name
                    const isSelected = selectedItem && id === (selectedItem.id || selectedItem.name)
                    return (
                      <button
                        type="button"
                        key={item.id || `${item.name}-${index}`}
                        onClick={() => setSelectedItemId(id)}
                        className={`min-w-0 border px-2 py-2 text-left transition-all ${isSelected ? `${style.border} ${style.bg}` : 'border-white/10 bg-white/[0.025] hover:border-amber-200/24 hover:bg-white/[0.04]'}`}
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={itemIcon(item)}
                            alt=""
                            className="h-8 w-8 shrink-0 object-contain"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-serif text-sm font-semibold text-parchment-100">{item.name}</p>
                            <p className={`mt-0.5 font-fantasy text-[9px] uppercase tracking-[0.14em] ${style.text}`}>
                              {style.label}{item.quantity > 1 ? ` / x${item.quantity}` : ''}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-amber-200/14 bg-amber-300/[0.035] px-3 py-2">
                    <p className="font-fantasy text-[9px] uppercase tracking-[0.18em] text-amber-100/54">Carried Value</p>
                    <p className="mt-1 font-serif text-sm text-parchment-100">{carriedValue.toLocaleString()} gp</p>
                  </div>
                  <div className="border border-violet-200/14 bg-violet-300/[0.035] px-3 py-2">
                    <p className="font-fantasy text-[9px] uppercase tracking-[0.18em] text-violet-100/54">Story Items</p>
                    <p className="mt-1 font-serif text-sm text-parchment-100">{keyItems}</p>
                  </div>
                </div>
              </div>
            )
          )}
        </section>
      </div>
    </div>
  )
}
