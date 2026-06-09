import { useEffect, useState } from 'react'
import { assetApi } from '../lib/api'

interface EnemyPopupProps {
  enemyName: string
  campaignId: string
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

const STYLE = 'Adult animated-fantasy character illustration in the vein of "The Legend of Vox Machina" — bold graphic-novel linework over painterly digital brushwork, exaggerated expressive faces, strong stylized proportions, vivid saturated colors, thick confident outlines, dynamic personality-driven pose, richly textured clothing and gear. Not photorealistic, not 3D-rendered — strictly 2D hand-illustrated, like a single frame from a high-end adult animated fantasy series.'

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function staticMatch(name: string): string | null {
  const lower = name.toLowerCase()
  for (const [key, file] of ENEMY_IMAGES) {
    if (lower.includes(key)) return `/assets/enemies/${file}.png`
  }
  return null
}

function enemyCacheKey(campaignId: string, name: string): string {
  return `enemy-${campaignId}-${slugify(name)}`
}

function enemyPrompt(name: string): string {
  return `${STYLE} Portrait of a menacing fantasy enemy named "${name}" — unique and memorable, with a strong readable silhouette, full of threat and personality. Waist-up composition, dark atmospheric background, dramatic lighting.`
}

export default function EnemyPopup({ enemyName, campaignId, onDismiss }: EnemyPopupProps) {
  const [visible, setVisible] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>(() => staticMatch(enemyName) ?? '/assets/enemies/bandit.png')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  // If no static match, generate a bespoke portrait cached per-campaign so the
  // same enemy always gets the same portrait throughout that story.
  useEffect(() => {
    if (staticMatch(enemyName)) return
    const cacheKey = enemyCacheKey(campaignId, enemyName)

    // Check cache first — free if it was already generated earlier in this campaign
    assetApi.cached(cacheKey).then(({ data }) => {
      if (data?.url) { setImageUrl(data.url); return }
      // Not cached — generate and store
      setGenerating(true)
      assetApi.generate(enemyPrompt(enemyName), cacheKey, 'enemy')
        .then(({ data: img }) => { if (img?.url) setImageUrl(img.url) })
        .catch(() => {}) // keep the generic fallback on error
        .finally(() => setGenerating(false))
    }).catch(() => {
      // Cache check failed — fall through to generate directly
      setGenerating(true)
      assetApi.generate(enemyPrompt(enemyName), cacheKey, 'enemy')
        .then(({ data: img }) => { if (img?.url) setImageUrl(img.url) })
        .catch(() => {})
        .finally(() => setGenerating(false))
    })
  }, [enemyName, campaignId])

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
          style={{ boxShadow: '0 0 42px rgba(248,113,113,0.16), 0 30px 110px rgba(0,0,0,0.76)' }}
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
              style={{
                filter: 'contrast(1.1) saturate(0.85)',
                transition: 'opacity 0.6s ease',
                opacity: generating ? 0.5 : 1,
              }}
            />
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-fantasy text-[9px] uppercase tracking-[0.2em] text-red-200/60 animate-pulse">
                  Summoning...
                </span>
              </div>
            )}
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
