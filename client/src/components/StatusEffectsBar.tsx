import { useState } from 'react'
import type { StatusEffect } from '../../../shared/types'

const EFFECT_ICONS: Record<string, string> = {
  // Debuffs
  poisoned: '☠',
  poison: '☠',
  cursed: '🌑',
  curse: '🌑',
  burning: '🔥',
  fire: '🔥',
  stunned: '⚡',
  stun: '⚡',
  paralyzed: '🔒',
  paralysis: '🔒',
  blinded: '👁',
  blind: '👁',
  silenced: '🔇',
  silence: '🔇',
  slowed: '🐢',
  slow: '🐢',
  weakened: '💔',
  weak: '💔',
  bleeding: '🩸',
  bleed: '🩸',
  frightened: '💀',
  fear: '💀',
  exhausted: '😴',
  exhaustion: '😴',
  diseased: '🦠',
  disease: '🦠',
  charmed: '💜',
  charm: '💜',
  // Buffs
  blessed: '✨',
  blessing: '✨',
  inspired: '🎵',
  inspiration: '🎵',
  haste: '💨',
  hasted: '💨',
  invisible: '👻',
  invisibility: '👻',
  shielded: '🛡',
  shield: '🛡',
  regenerating: '💚',
  regeneration: '💚',
  regen: '💚',
  strengthened: '💪',
  strength: '💪',
  empowered: '⚔',
  empower: '⚔',
  flying: '🦅',
  fly: '🦅',
  protected: '🌟',
  protection: '🌟',
  attuned: '🔮',
  attunement: '🔮',
}

function effectIcon(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(EFFECT_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '◆'
}

const TYPE_COLORS = {
  buff:    { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.30)',   text: '#4ade80',  dim: 'rgba(74,222,128,0.55)',  glow: 'rgba(34,197,94,0.25)' },
  debuff:  { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.35)',   text: '#f87171',  dim: 'rgba(248,113,113,0.55)', glow: 'rgba(239,68,68,0.30)' },
  neutral: { bg: 'rgba(200,146,42,0.09)',  border: 'rgba(200,146,42,0.28)', text: '#fbbf24',  dim: 'rgba(251,191,36,0.55)',  glow: 'rgba(200,146,42,0.20)' },
}

function EffectPill({ effect }: { effect: StatusEffect }) {
  const [open, setOpen] = useState(false)
  const c = TYPE_COLORS[effect.type] ?? TYPE_COLORS.neutral
  const icon = effectIcon(effect.name)
  const isDebuff = effect.type === 'debuff'

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 transition-all"
        style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
          boxShadow: isDebuff ? `0 0 8px ${c.glow}` : undefined,
          animation: isDebuff ? 'debuff-pulse 2.5s ease-in-out infinite' : undefined,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
        <span className="font-fantasy text-[10px] uppercase tracking-[0.16em]" style={{ color: c.text }}>
          {effect.name}
        </span>
        {effect.duration != null && (
          <span className="font-serif text-[9px]" style={{ color: c.dim }}>
            {effect.duration}t
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full left-0 z-50 mb-2 w-52 p-3"
            style={{ background: 'rgba(14,9,3,0.97)', border: `1px solid ${c.border}`, boxShadow: `0 4px 24px rgba(0,0,0,0.7), 0 0 12px ${c.glow}` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 18 }}>{icon}</span>
              <div>
                <p className="font-fantasy text-xs uppercase tracking-[0.14em]" style={{ color: c.text }}>{effect.name}</p>
                <p className="font-fantasy text-[9px] uppercase tracking-[0.12em] opacity-60" style={{ color: c.text }}>
                  {effect.type}{effect.duration != null ? ` · ${effect.duration} turn${effect.duration !== 1 ? 's' : ''} left` : ' · ongoing'}
                </p>
              </div>
            </div>
            <p className="font-serif text-xs leading-relaxed" style={{ color: 'rgba(220,200,165,0.82)' }}>
              {effect.description}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

interface StatusEffectsBarProps {
  effects: StatusEffect[]
}

export default function StatusEffectsBar({ effects }: StatusEffectsBarProps) {
  if (!effects || effects.length === 0) return null

  const debuffs = effects.filter(e => e.type === 'debuff')
  const buffs   = effects.filter(e => e.type === 'buff')
  const neutral = effects.filter(e => e.type === 'neutral')
  const ordered = [...debuffs, ...buffs, ...neutral]

  return (
    <>
      <style>{`
        @keyframes debuff-pulse {
          0%, 100% { box-shadow: 0 0 6px rgba(239,68,68,0.25); }
          50%       { box-shadow: 0 0 14px rgba(239,68,68,0.55); }
        }
      `}</style>
      <div
        className="relative z-10 flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-2"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(8,5,2,0.75)',
          backdropFilter: 'blur(8px)',
          scrollbarWidth: 'none',
        }}
      >
        <span className="mr-1 shrink-0 font-fantasy text-[9px] uppercase tracking-[0.22em]" style={{ color: 'rgba(180,140,80,0.45)' }}>
          Conditions
        </span>
        {ordered.map((effect, i) => (
          <EffectPill key={`${effect.name}-${i}`} effect={effect} />
        ))}
      </div>
    </>
  )
}
