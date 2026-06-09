import { useEffect, useState } from 'react'
import type { InventoryItem } from '../../../shared/types'

interface LootPopupProps {
  items: InventoryItem[]
  goldChange?: number
  onDismiss: () => void
}

function itemIcon(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('sword') || n.includes('blade')) return '/assets/items/sword-common.png'
  if (n.includes('dagger') || n.includes('knife')) return '/assets/items/dagger.png'
  if (n.includes('axe')) return '/assets/items/axe.png'
  if (n.includes('bow')) return '/assets/items/bow.png'
  if (n.includes('staff')) return '/assets/items/staff-wooden.png'
  if (n.includes('potion') && (n.includes('heal') || n.includes('hp'))) return '/assets/items/potion-health.png'
  if (n.includes('potion') || n.includes('elixir')) return '/assets/items/potion-health.png'
  if (n.includes('armor') || n.includes('mail') || n.includes('plate')) return '/assets/items/armor-chain.png'
  if (n.includes('leather armor') || n.includes('hide')) return '/assets/items/armor-leather.png'
  if (n.includes('shield')) return '/assets/items/shield.png'
  if (n.includes('helmet') || n.includes('helm')) return '/assets/items/helmet-iron.png'
  if (n.includes('cloak') || n.includes('robe')) return '/assets/items/cloak.png'
  if (n.includes('ring')) return '/assets/items/ring.png'
  if (n.includes('amulet') || n.includes('necklace')) return '/assets/items/amulet.png'
  if (n.includes('scroll')) return '/assets/items/scroll.png'
  if (n.includes('tome') || n.includes('book')) return '/assets/items/tome.png'
  if (n.includes('key')) return '/assets/items/key.png'
  if (n.includes('gold') || n.includes('coin')) return '/assets/items/gold-coin.png'
  if (n.includes('gem') || n.includes('jewel')) return '/assets/items/gem-currency.png'
  return '/assets/items/quest-orb.png'
}

export default function LootPopup({ items, goldChange, onDismiss }: LootPopupProps) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => dismiss(), 5000)
    return () => clearTimeout(timer)
  }, [])

  function dismiss() {
    setLeaving(true)
    setTimeout(onDismiss, 400)
  }

  return (
    <div
      className="fixed inset-0 pointer-events-none z-40 flex items-end justify-center pb-32"
    >
      <div
        className="pointer-events-auto cursor-pointer"
        onClick={dismiss}
        style={{
          transform: visible && !leaving ? 'translateY(0)' : 'translateY(120px)',
          opacity: visible && !leaving ? 1 : 0,
          transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
        }}
      >
        <div className="max-w-sm border border-amber-200/34 bg-black/82 px-5 py-4 shadow-[0_24px_90px_rgba(0,0,0,0.72)] backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-amber-500" />
            <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-100/72">
              {items.length > 0 && goldChange ? 'Loot & Gold' : items.length > 0 ? 'Item Found' : 'Gold Acquired'}
            </p>
          </div>

          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={item.id || i} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 border flex items-center justify-center shrink-0"
                  style={{ borderColor: 'rgba(212,168,67,0.4)', background: 'rgba(212,168,67,0.05)' }}
                >
                  <img
                    src={itemIcon(item.name)}
                    alt={item.name}
                    className="w-7 h-7 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
                <div>
                  <p className="font-serif text-sm text-parchment-100">
                    {item.name}
                    {item.quantity > 1 && <span className="ml-1 text-amber-200/70">x{item.quantity}</span>}
                  </p>
                  <p className="font-serif text-xs italic text-parchment-200/48">{item.description}</p>
                </div>
              </div>
            ))}

            {goldChange && goldChange > 0 && (
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 border flex items-center justify-center shrink-0"
                  style={{ borderColor: 'rgba(212,168,67,0.4)', background: 'rgba(212,168,67,0.05)' }}
                >
                  <img src="/assets/items/gold-coin.png" alt="gold" className="w-7 h-7 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
                <div>
                  <p className="font-serif text-sm text-amber-100">+{goldChange} gold pieces</p>
                  <p className="font-serif text-xs italic text-parchment-200/48">Added to your purse</p>
                </div>
              </div>
            )}
          </div>

          <p className="mt-3 text-right font-serif text-xs italic text-parchment-200/34">tap to dismiss</p>
        </div>
      </div>
    </div>
  )
}
