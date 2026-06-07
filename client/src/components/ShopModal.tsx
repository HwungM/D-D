import { useState } from 'react'
import type { ShopItem, InventoryItem } from '../../../shared/types'

interface ShopModalProps {
  shopItems: ShopItem[]
  playerGold: number
  onBuy: (item: ShopItem) => void
  onSell?: (item: InventoryItem) => void
  playerInventory?: InventoryItem[]
  onClose: () => void
}

const TYPE_COLORS: Record<string, string> = {
  weapon: '#fca5a5',
  armor: '#93c5fd',
  potion: '#86efac',
  key: '#f8d27a',
  misc: '#c4a484',
}

const TYPE_LABELS: Record<string, string> = {
  weapon: 'WPN',
  armor: 'ARM',
  potion: 'POT',
  key: 'KEY',
  misc: 'GEAR',
}

export default function ShopModal({ shopItems, playerGold, onBuy, onSell, playerInventory = [], onClose }: ShopModalProps) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [purchased, setPurchased] = useState<Set<string>>(new Set())

  function handleBuy(item: ShopItem) {
    if (playerGold < item.price) return
    setPurchased(prev => new Set(prev).add(item.id))
    onBuy(item)
  }

  const sellableItems = playerInventory.filter(i => i.type !== 'key' && (i.value || 0) > 0)
  const visibleItems = tab === 'buy' ? shopItems : sellableItems

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden border border-parchment-100/34 bg-black/88 shadow-[0_30px_130px_rgba(0,0,0,0.82)]">
        <img src="/media/loading/everrealm-crystal-party.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.13]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0.68),rgba(0,0,0,0.92))]" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-cyan-200/62">Merchant</p>
              <h2 className="mt-2 font-fantasy text-3xl text-parchment-100">Merchant's Wares</h2>
              <p className="mt-1 font-serif text-xs uppercase tracking-[0.18em] text-amber-200/62">
                Gold <span className="text-amber-100">{playerGold}g</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="border border-white/10 bg-white/[0.025] px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-parchment-200/58 transition-all hover:border-amber-200/38 hover:text-parchment-100"
            >
              Close
            </button>
          </header>

          {sellableItems.length > 0 && (
            <div className="grid grid-cols-2 border-b border-white/10">
              {(['buy', 'sell'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`py-3 font-fantasy text-[10px] uppercase tracking-[0.22em] transition-all ${
                    tab === t ? 'bg-amber-300/10 text-amber-100' : 'text-parchment-200/42 hover:text-parchment-100'
                  }`}
                >
                  {t === 'buy' ? 'Buy' : 'Sell'}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(200,146,42,0.35) transparent' }}>
            {visibleItems.length === 0 ? (
              <p className="py-10 text-center font-serif text-sm italic text-parchment-200/44">
                {tab === 'buy' ? 'The merchant has nothing to offer.' : 'Nothing worth selling.'}
              </p>
            ) : (
              <div className="space-y-2">
                {tab === 'buy'
                  ? shopItems.map(item => {
                    const canAfford = playerGold >= item.price
                    const alreadyBought = purchased.has(item.id)
                    const color = TYPE_COLORS[item.type] || TYPE_COLORS.misc
                    return (
                      <div
                        key={item.id}
                        className="grid gap-3 border p-3 transition-all sm:grid-cols-[42px_minmax(0,1fr)_96px]"
                        style={{
                          borderColor: alreadyBought ? 'rgba(255,255,255,0.06)' : `${color}36`,
                          background: alreadyBought ? 'rgba(255,255,255,0.014)' : 'rgba(255,255,255,0.025)',
                          opacity: alreadyBought ? 0.54 : 1,
                        }}
                      >
                        <span className="flex h-9 items-center justify-center border border-white/10 bg-white/[0.025] font-fantasy text-[9px] uppercase tracking-[0.1em]" style={{ color }}>
                          {TYPE_LABELS[item.type] || TYPE_LABELS.misc}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-fantasy text-base text-parchment-100">{item.name}</span>
                            {item.quantity > 1 && (
                              <span className="font-mono text-xs text-parchment-200/42">x{item.quantity}</span>
                            )}
                          </div>
                          <p className="mt-1 font-serif text-xs leading-relaxed text-parchment-200/58">{item.description}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="font-fantasy text-sm" style={{ color: canAfford ? '#f8d27a' : 'rgba(248,165,165,0.62)' }}>{item.price}g</p>
                          {!alreadyBought ? (
                            <button
                              onClick={() => handleBuy(item)}
                              disabled={!canAfford}
                              className="mt-2 border px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] transition-all disabled:cursor-not-allowed disabled:opacity-40"
                              style={{
                                background: canAfford ? 'rgba(245,158,11,0.12)' : 'transparent',
                                borderColor: canAfford ? 'rgba(245,158,11,0.42)' : 'rgba(255,255,255,0.08)',
                                color: canAfford ? '#f8d27a' : 'rgba(180,160,120,0.38)',
                              }}
                            >
                              Buy
                            </button>
                          ) : (
                            <p className="mt-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-emerald-100/72">Purchased</p>
                          )}
                        </div>
                      </div>
                    )
                  })
                  : sellableItems.map(item => {
                    const sellPrice = Math.floor((item.value || 0) / 2)
                    const color = TYPE_COLORS[item.type] || TYPE_COLORS.misc
                    return (
                      <div key={item.id} className="grid gap-3 border p-3 sm:grid-cols-[42px_minmax(0,1fr)_96px]" style={{ borderColor: `${color}2c`, background: 'rgba(255,255,255,0.025)' }}>
                        <span className="flex h-9 items-center justify-center border border-white/10 bg-white/[0.025] font-fantasy text-[9px] uppercase tracking-[0.1em]" style={{ color }}>
                          {TYPE_LABELS[item.type] || TYPE_LABELS.misc}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-fantasy text-base text-parchment-100">{item.name}</span>
                            {item.quantity > 1 && <span className="font-mono text-xs text-parchment-200/42">x{item.quantity}</span>}
                          </div>
                          <p className="mt-1 font-serif text-xs text-parchment-200/48">Value: {item.value}g</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="font-fantasy text-sm text-amber-100">{sellPrice}g</p>
                          <button
                            onClick={() => onSell?.(item)}
                            className="mt-2 border border-amber-300/36 bg-amber-300/10 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-amber-100 transition-all hover:border-amber-200"
                          >
                            Sell
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          <footer className="border-t border-white/10 px-5 py-3 text-center">
            <button onClick={onClose} className="font-fantasy text-[10px] uppercase tracking-[0.18em] text-parchment-200/52 transition-all hover:text-parchment-100">
              Leave the Merchant
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
