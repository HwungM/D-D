import { useEffect, useState } from 'react'
import { assetApi } from '../lib/api'
import type { NpcMemory } from '../../../shared/types'

interface NPCCodexProps {
  npcMemory: NpcMemory[]
  keyNPCs?: NpcMemory[]
  campaignId: string
}

// Stock archetype portraits for common NPC roles — instant fallbacks
const STOCK_MAP: [string[], string][] = [
  [['merchant', 'trader', 'vendor', 'shopkeeper', 'peddler'], 'merchant'],
  [['innkeeper', 'barkeep', 'barmaid', 'tavern keeper', 'landlord'], 'innkeeper'],
  [['guard', 'soldier', 'sentry', 'watchman', 'city watch'], 'guard'],
  [['noble', 'lord', 'lady', 'duke', 'duchess', 'count', 'baron', 'aristocrat'], 'noble'],
  [['blacksmith', 'smith', 'weaponsmith', 'armorsmith', 'forger'], 'blacksmith'],
  [['healer', 'herbalist', 'physician', 'cleric', 'medic', 'apothecary'], 'healer'],
  [['scholar', 'sage', 'wizard', 'mage', 'arcanist', 'librarian', 'professor'], 'scholar'],
  [['informant', 'spy', 'thief', 'rogue', 'fence', 'broker'], 'informant'],
  [['elder', 'village elder', 'chief', 'headman', 'matriarch', 'patriarch'], 'elder'],
  [['priest', 'acolyte', 'monk', 'friar', 'bishop', 'chaplain', 'holy'], 'priest'],
  [['criminal', 'bandit', 'crime boss', 'gang leader', 'outlaw', 'brigand'], 'criminal'],
  [['mysterious', 'stranger', 'unknown', 'cloaked', 'hooded', 'enigmatic'], 'mysterious-stranger'],
]

function stockPortrait(npc: NpcMemory): string | null {
  const text = `${npc.name} ${npc.role || ''} ${npc.notes}`.toLowerCase()
  for (const [keywords, file] of STOCK_MAP) {
    if (keywords.some(k => text.includes(k))) {
      // If notes hint female, prefer -f variant when available (merchant, innkeeper, guard, noble)
      const femaleHints = ['she ', 'her ', 'woman', 'female', 'girl', 'lady', 'madam', 'wife', 'mother']
      const isFemale = femaleHints.some(h => text.includes(h))
      const hasF = ['merchant', 'innkeeper', 'guard', 'noble'].includes(file)
      return `/assets/npcs/${file}${isFemale && hasF ? '-f' : ''}.png`
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
