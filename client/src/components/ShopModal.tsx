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
  weapon: '#e87a7a',
  armor: '#7ab0e8',
  potion: '#7ae87a',
  key: '#e8c87a',
  misc: '#b09070',
}

const TYPE_ICONS: Record<string, string> = {
  weapon: '⚔',
  armor: '🛡',
  potion: '⚗',
  key: '🗝',
  misc: '⚙',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.88)' }}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col"
        style={{
          background: '#0d1017',
          border: '1px solid rgba(200,146,42,0.3)',
          boxShadow: '0 0 60px rgba(200,146,42,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-fantasy text-lg text-parchment-200">Merchant's Wares</h2>
            <p className="text-xs font-serif mt-0.5" style={{ color: 'rgba(200,146,42,0.6)' }}>
              Your gold: <span style={{ color: '#e8c87a' }}>{playerGold}g</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'rgba(180,160,120,0.4)', fontSize: '1.2rem' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(220,200,160,0.8)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(180,160,120,0.4)' }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        {sellableItems.length > 0 && (
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {(['buy', 'sell'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2.5 text-xs uppercase tracking-widest font-serif transition-all"
                style={tab === t
                  ? { color: '#e8c87a', borderBottom: '1px solid rgba(200,146,42,0.5)' }
                  : { color: 'rgba(180,160,120,0.4)' }
                }
              >
                {t === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
          {tab === 'buy' ? (
            <div className="p-4 space-y-2">
              {shopItems.map(item => {
                const canAfford = playerGold >= item.price
                const alreadyBought = purchased.has(item.id)
                const color = TYPE_COLORS[item.type] || '#b09070'
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 transition-all"
                    style={{
                      border: `1px solid ${alreadyBought ? 'rgba(255,255,255,0.04)' : `${color}22`}`,
                      background: alreadyBought ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                      opacity: alreadyBought ? 0.5 : 1,
                    }}
                  >
                    <span className="text-lg shrink-0" style={{ color }}>{TYPE_ICONS[item.type] || '•'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-serif text-sm" style={{ color: '#d4c5a0' }}>{item.name}</span>
                        {item.quantity > 1 && (
                          <span className="text-xs font-mono" style={{ color: 'rgba(160,140,110,0.5)' }}>×{item.quantity}</span>
                        )}
                      </div>
                      <p className="text-xs font-serif" style={{ color: 'rgba(160,140,110,0.6)' }}>{item.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm mb-1" style={{ color: canAfford ? '#e8c87a' : 'rgba(180,120,100,0.6)' }}>
                        {item.price}g
                      </div>
                      {!alreadyBought && (
                        <button
                          onClick={() => handleBuy(item)}
                          disabled={!canAfford}
                          className="text-xs font-serif px-3 py-1 transition-all disabled:opacity-40"
                          style={{
                            background: canAfford ? 'rgba(200,146,42,0.15)' : 'transparent',
                            border: `1px solid ${canAfford ? 'rgba(200,146,42,0.4)' : 'rgba(255,255,255,0.07)'}`,
                            color: canAfford ? '#e8c87a' : 'rgba(160,140,110,0.4)',
                          }}
                        >
                          Buy
                        </button>
                      )}
                      {alreadyBought && <span className="text-xs font-serif" style={{ color: 'rgba(120,180,100,0.7)' }}>Purchased</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {sellableItems.length === 0 ? (
                <p className="text-sm font-serif italic text-center py-6" style={{ color: 'rgba(160,140,110,0.4)' }}>
                  Nothing worth selling.
                </p>
              ) : (
                sellableItems.map(item => {
                  const sellPrice = Math.floor((item.value || 0) / 2)
                  const color = TYPE_COLORS[item.type] || '#b09070'
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3" style={{ border: `1px solid ${color}18`, background: 'rgba(255,255,255,0.02)' }}>
                      <span className="text-lg shrink-0" style={{ color }}>{TYPE_ICONS[item.type] || '•'}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-serif text-sm" style={{ color: '#d4c5a0' }}>{item.name}</span>
                        {item.quantity > 1 && <span className="text-xs font-mono ml-2" style={{ color: 'rgba(160,140,110,0.5)' }}>×{item.quantity}</span>}
                        <p className="text-xs font-serif mt-0.5" style={{ color: 'rgba(160,140,110,0.5)' }}>Value: {item.value}g</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-sm mb-1" style={{ color: '#e8c87a' }}>{sellPrice}g</div>
                        <button
                          onClick={() => onSell?.(item)}
                          className="text-xs font-serif px-3 py-1 transition-all"
                          style={{
                            background: 'rgba(200,146,42,0.1)',
                            border: '1px solid rgba(200,146,42,0.3)',
                            color: '#e8c87a',
                          }}
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={onClose} className="font-serif text-xs" style={{ color: 'rgba(160,140,110,0.5)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(220,200,160,0.8)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(160,140,110,0.5)' }}
          >
            Leave the merchant
          </button>
        </div>
      </div>
    </div>
  )
}
