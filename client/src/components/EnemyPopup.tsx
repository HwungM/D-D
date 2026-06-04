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
        {/* Card */}
        <div
          className="relative w-56 overflow-hidden"
          style={{
            border: '2px solid rgba(220,38,38,0.7)',
            boxShadow: '0 0 30px rgba(220,38,38,0.5), 0 0 60px rgba(220,38,38,0.2), inset 0 0 30px rgba(0,0,0,0.5)',
            background: 'linear-gradient(180deg, #0f0505 0%, #0a0a0a 100%)',
          }}
        >
          {/* Red top bar */}
          <div className="bg-red-700/80 px-3 py-1.5 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-300 animate-pulse" />
            <span className="text-xs uppercase tracking-widest text-red-200 font-sans">Combat</span>
          </div>

          {/* Enemy portrait */}
          <div className="relative h-48 overflow-hidden">
            <img
              src={imageUrl}
              alt={enemyName}
              className="w-full h-full object-cover object-top"
              style={{ filter: 'contrast(1.1) saturate(0.85)' }}
            />
            {/* Dark vignette bottom */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom, transparent 40%, rgba(10,5,5,0.9) 100%)',
            }} />
            {/* Red glow overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 50% 100%, rgba(220,38,38,0.2) 0%, transparent 70%)',
            }} />
          </div>

          {/* Name */}
          <div className="px-3 pb-3 pt-1 text-center">
            <h3
              className="font-fantasy text-lg text-red-400 leading-tight"
              style={{ textShadow: '0 0 15px rgba(220,38,38,0.8)' }}
            >
              {enemyName}
            </h3>
            <p className="text-xs text-red-600/70 uppercase tracking-widest font-sans mt-0.5">
              Appears before you
            </p>
          </div>

          {/* Corner ornaments */}
          <div className="absolute top-8 left-1.5 w-3 h-3 border-t border-l border-red-500/40" />
          <div className="absolute top-8 right-1.5 w-3 h-3 border-t border-r border-red-500/40" />
          <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b border-l border-red-500/40" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b border-r border-red-500/40" />
        </div>
      </div>
    </div>
  )
}
