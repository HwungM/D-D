import { useState } from 'react'
import type { Character, CharacterStats, InventoryItem } from '../../../shared/types'

const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
const STAT_LABELS: Record<keyof CharacterStats, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
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
  if (name.includes('pack') || name.includes('bag')) return '/assets/items/gold-pouch.png'
  if (name.includes('charm') || name.includes('amulet')) return '/assets/items/amulet.png'
  if (name.includes('sword') || name.includes('blade')) return '/assets/items/sword-common.png'
  if (name.includes('potion')) return '/assets/items/potion-health.png'
  return '/assets/items/quest-orb.png'
}

function SectionTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-parchment-200/62">{title}</p>
      {right && <span className="font-serif text-xs text-parchment-200/48">{right}</span>}
    </div>
  )
}

export default function CharacterSheet({ character }: { character: Character }) {
  const [inventoryOpen, setInventoryOpen] = useState(true)
  const [abilitiesOpen, setAbilitiesOpen] = useState(true)

  const hpPercent = Math.max(0, (character.hp / character.max_hp) * 100)
  const hpColor = hpPercent > 60 ? '#22c55e' : hpPercent > 30 ? '#eab308' : '#ef4444'
  const xpCurrent = XP_THRESHOLDS[character.level - 1] ?? 0
  const xpNext = XP_THRESHOLDS[character.level] ?? xpCurrent
  const xpPercent = xpNext > xpCurrent ? Math.min(100, ((character.xp - xpCurrent) / (xpNext - xpCurrent)) * 100) : 100

  return (
    <div className="h-full overflow-y-auto text-sm text-parchment-100" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.45) transparent' }}>
      <div className="relative border-b border-white/8">
        <div className="h-40 overflow-hidden bg-black">
          <img
            src={character.portrait_url || racePortraitUrl(character.race)}
            alt={character.name}
            className="h-full w-full object-cover object-top opacity-82"
            onError={e => { (e.currentTarget as HTMLImageElement).src = '/media/everrealm-hero-mobile.png' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/28 to-transparent" />
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="font-fantasy text-3xl text-parchment-100">{character.name}</h3>
          <p className="mt-1 font-serif text-sm text-amber-200/76">
            {character.race} {character.class}{character.subclass ? ` / ${character.subclass}` : ''} / Level {character.level}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <section>
          <div className="mb-1.5 flex justify-between">
            <span className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-parchment-200/62">Hit Points</span>
            <span className="font-mono text-xs font-bold" style={{ color: hpColor }}>{character.hp} / {character.max_hp}</span>
          </div>
          <div className="h-2 overflow-hidden bg-white/8">
            <div className="h-full transition-all duration-700" style={{ width: `${hpPercent}%`, background: hpColor, boxShadow: `0 0 12px ${hpColor}` }} />
          </div>
        </section>

        <section>
          <div className="mb-1.5 flex justify-between">
            <span className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-parchment-200/62">Experience</span>
            <span className="font-mono text-xs text-parchment-200/58">{character.xp.toLocaleString()} XP</span>
          </div>
          <div className="h-1 overflow-hidden bg-white/8">
            <div className="h-full bg-amber-300/72 transition-all duration-700" style={{ width: `${xpPercent}%` }} />
          </div>
          {character.level < 20 && (
            <p className="mt-1 text-right font-serif text-[11px] text-parchment-200/38">
              {(xpNext - character.xp).toLocaleString()} XP to level {character.level + 1}
            </p>
          )}
        </section>

        <section>
          <SectionTitle title="Attributes" />
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(STAT_LABELS) as (keyof CharacterStats)[]).map(stat => (
              <div key={stat} className="border border-white/10 bg-white/[0.035] px-3 py-3 text-center">
                <p className="font-fantasy text-[10px] tracking-[0.16em] text-parchment-200/48">{STAT_LABELS[stat]}</p>
                <p className="mt-1 font-serif text-2xl leading-none text-parchment-100">{character.stats[stat]}</p>
                <p className="mt-1 font-mono text-xs text-emerald-300/72">{statMod(character.stats[stat])}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-between border border-amber-300/18 bg-amber-300/[0.055] px-3 py-3">
          <span className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/62">Gold</span>
          <span className="font-serif text-lg font-semibold text-amber-100">{character.gold.toLocaleString()} gp</span>
        </section>

        {character.abilities.length > 0 && (
          <section>
            <button type="button" onClick={() => setAbilitiesOpen(v => !v)} className="w-full text-left">
              <SectionTitle title="Abilities" right={abilitiesOpen ? 'Hide' : `${character.abilities.length}`} />
            </button>
            {abilitiesOpen && (
              <div className="space-y-2">
                {character.abilities.map((ability, index) => (
                  <div key={`${ability.name}-${index}`} className="border border-red-300/16 bg-red-500/[0.045] px-3 py-3">
                    <p className="font-serif text-sm font-semibold text-red-100">{ability.name}</p>
                    <p className="mt-1 font-serif text-sm leading-relaxed text-parchment-200/72">{ability.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <button type="button" onClick={() => setInventoryOpen(v => !v)} className="w-full text-left">
            <SectionTitle title="Inventory" right={inventoryOpen ? 'Hide' : `${character.inventory.length} items`} />
          </button>
          {inventoryOpen && (
            character.inventory.length === 0 ? (
              <p className="border border-white/8 bg-white/[0.025] px-3 py-4 font-serif text-sm italic text-parchment-200/48">Your pack is empty.</p>
            ) : (
              <div className="space-y-2">
                {character.inventory.map((item, index) => (
                  <div key={item.id || `${item.name}-${index}`} className="flex gap-3 border border-white/10 bg-white/[0.035] px-3 py-3">
                    <img
                      src={itemIcon(item)}
                      alt=""
                      className="h-9 w-9 shrink-0 object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-serif text-sm font-semibold text-parchment-100">{item.name}</p>
                        {item.quantity > 1 && <span className="font-mono text-xs text-parchment-200/48">x{item.quantity}</span>}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 font-serif text-xs leading-snug text-parchment-200/58">{item.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  )
}
