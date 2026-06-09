import { useEffect, useState } from 'react'

interface EnemyPopupProps {
  enemyName: string
  campaignId: string
  isBossFight?: boolean
  onDismiss: () => void
}

const ENEMY_IMAGES: [string, string][] = [
  // ── ORIGINAL ROSTER ───────────────────────────────────────────────────────
  ['ancient dragon', 'dragon-ancient'],
  ['young dragon', 'dragon-young'],
  ['dragon', 'dragon-young'],
  ['goblin shaman', 'goblin-shaman'],
  ['goblin elite', 'goblin-elite'],
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
  // ── EXPANDED BESTIARY ─────────────────────────────────────────────────────
  ['basilisk', 'basilisk'],
  ['beholder', 'beholder'],
  ['bugbear', 'bugbear'],
  ['chimera', 'chimera'],
  ['cyclops', 'cyclops'],
  ['death knight', 'death-knight'],
  ['doppelganger', 'doppelganger'],
  ['earth elemental', 'earth-elemental'],
  ['fire elemental', 'fire-elemental'],
  ['frost giant', 'frost-giant'],
  ['gargoyle', 'gargoyle'],
  ['gnoll pack lord', 'gnoll-pack-lord'],
  ['gnoll', 'gnoll'],
  ['iron golem', 'golem-iron'],
  ['stone golem', 'golem-stone'],
  ['golem', 'golem-stone'],
  ['hell hound', 'hell-hound'],
  ['hill giant', 'hill-giant'],
  ['giant', 'hill-giant'],
  ['hydra', 'hydra'],
  ['kobold shaman', 'kobold-shaman'],
  ['kobold', 'kobold'],
  ['lamia', 'lamia'],
  ['manticore', 'manticore'],
  ['medusa', 'medusa'],
  ['minotaur', 'minotaur'],
  ['mummy', 'mummy'],
  ['owlbear', 'owlbear'],
  ['pit fiend', 'pit-fiend'],
  ['revenant', 'revenant'],
  ['specter', 'specter'],
  ['spectre', 'specter'],
  ['stone giant', 'stone-giant'],
  ['treant', 'treant'],
  ['wendigo', 'wendigo'],
  ['werewolf', 'werewolf'],
  ['will-o-wisp', 'will-o-wisp'],
  ['will o wisp', 'will-o-wisp'],
  ['wraith', 'wraith'],
  ['yuan-ti', 'yuan-ti'],
  ['yuan ti', 'yuan-ti'],
  // Vol. 2
  ['orc berserker', 'orc-berserker'], ['skeleton mage', 'skeleton-mage'], ['bone mage', 'skeleton-mage'],
  ['zombie giant', 'zombie-giant'], ['vampire thrall', 'vampire-thrall'], ['vampire spawn', 'vampire-thrall'],
  ['dire wolf', 'dire-wolf'],
  ['drow warrior', 'drow'], ['dark elf warrior', 'drow'], ['drow', 'drow'],
  ['drow priestess', 'drow-priestess'], ['dark elf priestess', 'drow-priestess'],
  ['drider', 'drider'], ['rakshasa', 'rakshasa'],
  ['night hag', 'night-hag'], ['sea hag', 'sea-hag'], ['hag', 'night-hag'],
  ['displacer beast', 'displacer-beast'], ['bulette', 'bulette'], ['land shark', 'bulette'],
  ['purple worm', 'purple-worm'], ['remorhaz', 'remorhaz'], ['frost worm', 'remorhaz'],
  ['carrion crawler', 'carrion-crawler'], ['gibbering mouther', 'gibbering-mouther'],
  ['flesh golem', 'flesh-golem'], ['clay golem', 'clay-golem'], ['naga', 'naga'],
  ['marilith', 'marilith'], ['balor', 'balor'],
  ['chain devil', 'chain-devil'], ['bone devil', 'bone-devil'],
  ['aboleth', 'aboleth'], ['chuul', 'chuul'], ['roper', 'roper'],
  ['intellect devourer', 'intellect-devourer'], ['phase spider', 'phase-spider'],
  ['ettercap', 'ettercap'], ['ankheg', 'ankheg'], ['umber hulk', 'umber-hulk'],
  ['rust monster', 'rust-monster'], ['gnoll berserker', 'gnoll-berserker'],
  ['kobold trapper', 'kobold-trapper'], ['vampire bride', 'vampire-bride'],
  ['fallen angel', 'fallen-angel'], ['dragon turtle', 'dragon-turtle'],
  ['storm giant', 'storm-giant'], ['fire giant', 'fire-giant'],
  // ── GENDER / ELITE VARIANTS ───────────────────────────────────────────────
  ['goblin-f', 'goblin-f'], ['skeleton-f', 'skeleton-f'], ['zombie-f', 'zombie-f'],
  ['orc warrior-f', 'orc-warrior-f'], ['bandit-f', 'bandit-f'],
  ['ghost-f', 'ghost-f'], ['cultist-f', 'cultist-f'], ['demon-f', 'demon-f'],
  ['gnoll-f', 'gnoll-f'], ['kobold-f', 'kobold-f'], ['wight-f', 'wight-f'],
  ['wraith-f', 'wraith-f'], ['troll-f', 'troll-f'], ['ogre-f', 'ogre-f'],
]

const VILLAIN_PORTRAITS = [
  'ancient-lich', 'blood-countess', 'corrupted-priest', 'cruel-noble', 'cult-prophet',
  'dark-sorceress', 'death-herald', 'demon-lord', 'fallen-champion', 'forsaken-ranger',
  'frost-witch', 'iron-tyrant', 'mad-alchemist', 'masked-villain', 'merchant-of-doom',
  'necromancer-queen', 'pirate-lord', 'plague-bearer-lord', 'serpent-queen', 'shadow-master',
  'storm-tyrant', 'undead-warlord', 'void-herald', 'war-tyrant', 'witch-queen',
]

function nameHash(name: string, count: number): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h) % count
}

function villainPortrait(name: string): string {
  return `/assets/villains/${VILLAIN_PORTRAITS[nameHash(name, VILLAIN_PORTRAITS.length)]}.png`
}

function staticMatch(name: string): string | null {
  const lower = name.toLowerCase()
  for (const [key, file] of ENEMY_IMAGES) {
    if (lower.includes(key)) return `/assets/enemies/${file}.png`
  }
  return null
}

function resolvePortrait(name: string, isBoss?: boolean): string {
  if (isBoss) return villainPortrait(name)
  const match = staticMatch(name)
  if (match) return match
  return villainPortrait(name)
}

export default function EnemyPopup({ enemyName, campaignId: _campaignId, isBossFight, onDismiss }: EnemyPopupProps) {
  const [visible, setVisible] = useState(false)
  const imageUrl = resolvePortrait(enemyName, isBossFight)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

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
