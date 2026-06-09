import { useEffect, useState } from 'react'
import { assetApi } from '../lib/api'
import type { NpcMemory } from '../../../shared/types'

interface NPCCodexProps {
  npcMemory: NpcMemory[]
  keyNPCs?: NpcMemory[]
  campaignId: string
}

// All 32 archetypes with keyword triggers and variant counts.
// Variants are named npcs/{archetype}-01.png … npcs/{archetype}-{count}.png
const ARCHETYPE_MAP: { keywords: string[]; archetype: string; count: number }[] = [
  { keywords: ['merchant', 'trader', 'vendor', 'shopkeeper', 'peddler', 'seller', 'salesman'], archetype: 'merchant', count: 5 },
  { keywords: ['innkeeper', 'barkeep', 'barmaid', 'tavern keeper', 'landlord', 'innkeep', 'host'], archetype: 'innkeeper', count: 5 },
  { keywords: ['guard', 'watchman', 'sentry', 'city watch', 'gatekeeper', 'patrol'], archetype: 'guard', count: 5 },
  { keywords: ['noble', 'lord', 'lady', 'duke', 'duchess', 'count', 'baron', 'baroness', 'aristocrat', 'highborn', 'heir'], archetype: 'noble', count: 5 },
  { keywords: ['scholar', 'sage', 'wizard', 'mage', 'arcanist', 'librarian', 'professor', 'academic', 'magister', 'sorcerer', 'arcane'], archetype: 'scholar', count: 5 },
  { keywords: ['healer', 'herbalist', 'physician', 'medic', 'apothecary', 'nurse', 'chirurgeon', 'cleric'], archetype: 'healer', count: 5 },
  { keywords: ['priest', 'acolyte', 'friar', 'bishop', 'chaplain', 'holy man', 'holy woman', 'paladin', 'templar', 'preacher'], archetype: 'priest', count: 5 },
  { keywords: ['blacksmith', 'smith', 'weaponsmith', 'armorsmith', 'forger', 'craftsman', 'artisan', 'carpenter', 'tinkerer'], archetype: 'blacksmith', count: 5 },
  { keywords: ['informant', 'spy', 'fence', 'broker', 'operative', 'agent', 'contact', 'snitch'], archetype: 'informant', count: 5 },
  { keywords: ['elder', 'village elder', 'chief', 'headman', 'matriarch', 'patriarch', 'mayor', 'elder woman', 'elder man'], archetype: 'elder', count: 5 },
  { keywords: ['criminal', 'crime boss', 'gang leader', 'outlaw', 'brigand', 'crime lord', 'thug', 'mob boss', 'warlord'], archetype: 'criminal', count: 5 },
  { keywords: ['mysterious', 'cloaked', 'hooded', 'enigmatic', 'stranger', 'unknown figure'], archetype: 'mysterious-stranger', count: 4 },
  { keywords: ['bard', 'performer', 'musician', 'entertainer', 'acrobat', 'storyteller', 'singer', 'jester', 'troubadour'], archetype: 'bard', count: 5 },
  { keywords: ['ranger', 'scout', 'tracker', 'hunter', 'monster hunter', 'woodsman', 'pathfinder', 'trapper'], archetype: 'ranger', count: 5 },
  { keywords: ['mercenary', 'sell-sword', 'sellsword', 'hired sword', 'soldier for hire', 'soldier of fortune', 'freebooter'], archetype: 'mercenary', count: 5 },
  { keywords: ['sailor', 'pirate', 'corsair', 'captain', 'mariner', 'navigator', 'deckhand', 'smuggler', 'seafarer'], archetype: 'sailor', count: 5 },
  { keywords: ['alchemist', 'artificer', 'inventor', 'potion maker', 'potion seller', 'chemist', 'tinker'], archetype: 'alchemist', count: 4 },
  { keywords: ['bounty hunter', 'manhunter', 'tracker', 'headhunter', 'mark taker'], archetype: 'bounty-hunter', count: 4 },
  { keywords: ['oracle', 'seer', 'fortune teller', 'prophet', 'diviner', 'mystic', 'soothsayer', 'psychic'], archetype: 'oracle', count: 4 },
  { keywords: ['cultist', 'fanatic', 'zealot', 'cult', 'dark priest', 'heretic', 'devout follower'], archetype: 'cultist', count: 4 },
  { keywords: ['gladiator', 'arena fighter', 'pit fighter', 'champion', 'arena champion', 'duellist'], archetype: 'gladiator', count: 4 },
  { keywords: ['retired', 'former adventurer', 'ex-adventurer', 'veteran adventurer', 'old adventurer'], archetype: 'retired-adventurer', count: 5 },
  { keywords: ['witch', 'hedge mage', 'hedge witch', 'wise woman', 'warlock', 'crone', 'hexer'], archetype: 'witch', count: 4 },
  { keywords: ['plague doctor', 'doctor', 'surgeon', 'field surgeon', 'plague'], archetype: 'plague-doctor', count: 4 },
  { keywords: ['diplomat', 'ambassador', 'envoy', 'emissary', 'delegate', 'attaché', 'liaison'], archetype: 'diplomat', count: 4 },
  { keywords: ['beggar', 'urchin', 'refugee', 'homeless', 'street person', 'destitute', 'vagrant', 'pauper'], archetype: 'beggar', count: 4 },
  { keywords: ['ferryman', 'boatman', 'guide', 'porter', 'mountaineer', 'desert guide', 'river guide'], archetype: 'ferryman', count: 4 },
  { keywords: ['farmer', 'shepherd', 'peasant', 'farmhand', 'miller', 'fisherman', 'herder', 'grower'], archetype: 'farmer', count: 4 },
  { keywords: ['monk', 'ascetic', 'friar', 'temple monk', 'mystic monk', 'monastic'], archetype: 'monk', count: 4 },
  { keywords: ['inquisitor', 'witch hunter', 'templar inquisitor', 'interrogator', 'church enforcer'], archetype: 'inquisitor', count: 4 },
  { keywords: ['explorer', 'archaeologist', 'cartographer', 'ruins delver', 'adventurer', 'treasure hunter'], archetype: 'explorer', count: 4 },
]

// Hash an NPC name to a stable 0-based index within [0, count)
function nameHash(name: string, count: number): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h) % count
}

// Returns /assets/npcs/{archetype}-{01..count}.png, chosen by name so the
// same NPC always gets the same portrait but different NPCs vary.
function stockPortrait(npc: NpcMemory): string | null {
  const text = `${npc.name} ${npc.role || ''} ${npc.notes}`.toLowerCase()
  for (const { keywords, archetype, count } of ARCHETYPE_MAP) {
    if (keywords.some(k => text.includes(k))) {
      const idx = nameHash(npc.name, count) + 1
      return `/assets/npcs/${archetype}-${String(idx).padStart(2, '0')}.png`
    }
  }
  return null
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function npcPrompt(npc: NpcMemory): string {
  const style = 'Adult animated-fantasy character illustration in the vein of "The Legend of Vox Machina" — bold graphic-novel linework over painterly digital brushwork, exaggerated expressive faces, strong stylized proportions, vivid saturated colors, thick confident outlines, dynamic personality-driven pose, richly textured clothing and gear. Not photorealistic, not 3D-rendered — strictly 2D hand-illustrated.'
  const role = npc.role ? ` a ${npc.role}` : ''
  const disposition = npc.disposition !== 'unknown' ? `, disposition ${npc.disposition}` : ''
  return `${style} Portrait of a fantasy NPC named "${npc.name}"${role}${disposition}. ${npc.notes.slice(0, 120)}. Waist-up, atmospheric background fitting their role, memorable and distinct face.`
}

function RelationshipBar({ score }: { score: number }) {
  const clamped = Math.max(-100, Math.min(100, score))
  const pct = ((clamped + 100) / 200) * 100

  let color = '#6b7280' // neutral gray
  if (clamped >= 60) color = '#22c55e'
  else if (clamped >= 20) color = '#86efac'
  else if (clamped >= -20) color = '#d1d5db'
  else if (clamped >= -60) color = '#f87171'
  else color = '#dc2626'

  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="absolute top-0 h-full transition-all duration-700"
          style={{
            left: '50%',
            width: `${Math.abs(clamped) / 2}%`,
            transform: clamped >= 0 ? 'translateX(0)' : `translateX(-100%)`,
            background: color,
          }}
        />
        <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
      </div>
    </div>
  )
}

function relationshipColor(score?: number): string {
  if (score == null) return 'rgba(160,140,100,0.6)'
  if (score >= 60) return '#86efac'
  if (score >= 20) return '#d1fae5'
  if (score >= -20) return 'rgba(200,180,140,0.7)'
  if (score >= -60) return '#fca5a5'
  return '#f87171'
}

function NPCCard({ npc, campaignId }: { npc: NpcMemory; campaignId: string }) {
  const [portrait, setPortrait] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // 1. Use cached portrait_url if present
    if (npc.portrait_url) { setPortrait(npc.portrait_url); return }

    // 2. Try stock archetype
    const stock = stockPortrait(npc)
    if (stock) { setPortrait(stock); return }

    // 3. Check campaign-specific cache then generate
    const cacheKey = `npc-${campaignId}-${slugify(npc.name)}`
    assetApi.cached(cacheKey).then(({ data }) => {
      if (data?.url) { setPortrait(data.url); return }
      setGenerating(true)
      assetApi.generate(npcPrompt(npc), cacheKey, 'npc')
        .then(({ data: img }) => { if (img?.url) setPortrait(img.url) })
        .catch(() => {})
        .finally(() => setGenerating(false))
    }).catch(() => {
      setGenerating(true)
      assetApi.generate(npcPrompt(npc), cacheKey, 'npc')
        .then(({ data: img }) => { if (img?.url) setPortrait(img.url) })
        .catch(() => {})
        .finally(() => setGenerating(false))
    })
  }, [npc.name, npc.portrait_url, campaignId])

  const score = npc.relationshipScore ?? 0
  const label = npc.relationshipLabel || dispositionLabel(npc.disposition)
  const relColor = relationshipColor(npc.relationshipScore)

  return (
    <div
      className="border cursor-pointer select-none"
      style={{
        borderColor: 'rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        transition: 'border-color 0.2s',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex gap-3 p-3">
        {/* Portrait */}
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ width: 52, height: 52, background: 'rgba(0,0,0,0.4)' }}
        >
          {portrait ? (
            <img
              src={portrait}
              alt={npc.name}
              className="h-full w-full object-cover object-top"
              style={{ opacity: generating ? 0.4 : 1, filter: 'contrast(1.05) saturate(0.9)', transition: 'opacity 0.5s' }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span
                className="font-fantasy text-2xl"
                style={{ color: 'rgba(200,180,140,0.4)' }}
              >
                {npc.name[0]}
              </span>
            </div>
          )}
          {generating && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="animate-pulse font-fantasy text-[7px] uppercase tracking-wider" style={{ color: 'rgba(200,180,140,0.6)' }}>
                ...
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-fantasy text-sm leading-tight text-parchment-100 truncate">{npc.name}</p>
            {npc.isKeyNPC && (
              <span className="shrink-0 font-fantasy text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5" style={{
                color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)',
              }}>Key</span>
            )}
          </div>
          {npc.role && (
            <p className="font-serif text-[10px] truncate" style={{ color: 'rgba(160,140,100,0.7)' }}>{npc.role}</p>
          )}
          <p className="mt-0.5 font-serif text-[10px]" style={{ color: relColor }}>{label}</p>
          {npc.relationshipScore != null && <RelationshipBar score={score} />}
        </div>
      </div>

      {/* Expanded notes */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="font-serif text-xs leading-relaxed" style={{ color: 'rgba(220,200,160,0.72)' }}>
            {npc.notes}
          </p>
          {npc.lastMet && (
            <p className="mt-1.5 font-serif text-[10px]" style={{ color: 'rgba(160,140,100,0.5)' }}>
              Last met: {npc.lastMet}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function dispositionLabel(disposition: NpcMemory['disposition']): string {
  switch (disposition) {
    case 'friendly': return 'Friendly'
    case 'hostile': return 'Hostile'
    case 'neutral': return 'Neutral'
    default: return 'Unknown'
  }
}

export default function NPCCodex({ npcMemory, keyNPCs = [], campaignId }: NPCCodexProps) {
  const allNpcs = [
    ...keyNPCs,
    ...npcMemory.filter(n => !keyNPCs.some(k => k.name === n.name)),
  ]

  if (allNpcs.length === 0) {
    return (
      <div className="p-5 text-center">
        <p className="font-serif text-sm italic" style={{ color: 'rgba(200,180,140,0.45)' }}>
          No named souls have crossed your path yet.
        </p>
      </div>
    )
  }

  const allies = allNpcs.filter(n => (n.relationshipScore ?? 0) >= 20 || n.disposition === 'friendly')
  const neutral = allNpcs.filter(n => {
    const s = n.relationshipScore ?? 0
    return s > -20 && s < 20 && n.disposition !== 'friendly' && n.disposition !== 'hostile'
  })
  const rivals = allNpcs.filter(n => (n.relationshipScore ?? 0) <= -20 || n.disposition === 'hostile')

  function Section({ title, npcs, accent }: { title: string; npcs: NpcMemory[]; accent: string }) {
    if (npcs.length === 0) return null
    return (
      <section className="space-y-1">
        <p className="px-1 font-fantasy text-[9px] uppercase tracking-[0.26em]" style={{ color: accent }}>
          {title}
        </p>
        {npcs.map(npc => (
          <NPCCard key={npc.name} npc={npc} campaignId={campaignId} />
        ))}
      </section>
    )
  }

  return (
    <div className="space-y-5 p-4">
      <Section title="Allies & Friends" npcs={allies} accent="rgba(134,239,172,0.7)" />
      <Section title="Acquaintances" npcs={neutral} accent="rgba(200,180,140,0.5)" />
      <Section title="Rivals & Enemies" npcs={rivals} accent="rgba(248,113,113,0.7)" />
    </div>
  )
}
