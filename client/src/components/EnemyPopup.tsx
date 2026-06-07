import { useEffect, useState } from 'react'

interface EnemyPopupProps {
  enemyName: string
  onDismiss: () => void
}

const ENEMY_IMAGES: [string, string][] = [
  ['ancient dragon', 'dragon-ancient'],
  ['young dragon', 'dragon-young'],
  ['dragon', 'dragon-young'],
  ['goblin shaman', 'goblin-shaman'],
  ['goblin', 'goblin'],
  ['bandit leader', 'bandit-leader'],
  ['bandit', 'bandit'],
  ['dark knight', 'dark-knight'],
  ['dark wizard', 'dark-wizard'],
  ['fallen paladin', 'fallen-paladin'],
  ['mind flayer', 'mind-flayer'],
  ['orc warchief', 'orc-warchief'],
  ['orc warrior', 'orc-warrior'],
  ['orc', 'orc-warrior'],
  ['shadow demon', 'shadow-demon'],
  ['skeleton archer', 'skeleton-archer'],
  ['skeleton', 'skeleton'],
  ['sea monster', 'sea-monster'],
  ['assassin', 'assassin'],
  ['cultist', 'cultist'],
  ['demon', 'demon'],
  ['ghost', 'ghost'],
  ['giant rat', 'giant-rat'],
  ['rat', 'giant-rat'],
  ['giant spider', 'giant-spider'],
  ['spider', 'giant-spider'],
  ['harpy', 'harpy'],
  ['imp', 'imp'],
  ['lich', 'lich'],
  ['necromancer', 'necromancer'],
  ['ogre', 'ogre'],
  ['succubus', 'succubus'],
  ['troll', 'troll'],
  ['vampire', 'vampire'],
  ['warlord', 'warlord'],
  ['wight', 'wight'],
  ['wolf', 'wolf'],
  ['wyvern', 'wyvern'],
  ['zombie', 'zombie'],
]

function getEnemyImage(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, file] of ENEMY_IMAGES) {
    if (lower.includes(key)) return `/assets/enemies/${file}.png`
  }
  return '/assets/enemies/bandit.png'
}

export default function EnemyPopup({ enemyName, onDismiss }: EnemyPopupProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const imageUrl = getEnemyImage(enemyName)

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end pointer-events-none"
      style={{ padding: '80px 24px 24px' }}
    >
      <div
        onClick={onDismiss}
        className="pointer-events-auto cursor-pointer"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateX(0)' : 'translateX(120px)',
          transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div
          className="relative w-64 overflow-hidden border border-red-200/34 bg-black/82 shadow-[0_30px_110px_rgba(0,0,0,0.76)] backdrop-blur-md"
          style={{
            boxShadow: '0 0 42px rgba(248,113,113,0.16), 0 30px 110px rgba(0,0,0,0.76)',
          }}
        >
          <div className="flex items-center justify-between border-b border-red-200/14 bg-red-500/10 px-3 py-2">
            <span className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-red-100/72">Combat</span>
            <span className="h-1.5 w-1.5 animate-pulse bg-red-300" />
          </div>

          <div className="relative h-48 overflow-hidden">
            <img
              src={imageUrl}
              alt={enemyName}
              className="w-full h-full object-cover object-top"
              style={{ filter: 'contrast(1.1) saturate(0.85)' }}
            />
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom, transparent 36%, rgba(0,0,0,0.94) 100%)',
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 50% 100%, rgba(248,113,113,0.22) 0%, transparent 70%)',
            }} />
          </div>

          <div className="px-4 pb-4 pt-3 text-center">
            <h3
              className="font-fantasy text-2xl leading-tight text-red-100"
              style={{ textShadow: '0 0 24px rgba(248,113,113,0.36)' }}
            >
              {enemyName}
            </h3>
            <p className="mt-2 font-fantasy text-[10px] uppercase tracking-[0.24em] text-red-100/48">
              Appears before you
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
