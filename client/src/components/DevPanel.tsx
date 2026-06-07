import { useState } from 'react'
import { characterApi } from '../lib/api'
import type { Character } from '../../../shared/types'

interface DevPanelProps {
  campaignId: string
  character: Character
  inCombat: boolean
  onKill: () => void
  onClearCombat: () => void
  onCharacterUpdate: (updates: Partial<Character>) => void
}

export default function DevPanel({ character, inCombat, onKill, onClearCombat, onCharacterUpdate }: DevPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [hpInput, setHpInput] = useState('')
  const [goldInput, setGoldInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function setHP() {
    const val = parseInt(hpInput)
    if (isNaN(val) || val < 0) return
    setBusy('hp')
    try {
      const newHp = Math.min(val, character.max_hp)
      await characterApi.update(character.id, { hp: newHp })
      onCharacterUpdate({ hp: newHp })
      setHpInput('')
    } catch (err) { console.error(err) }
    finally { setBusy(null) }
  }

  async function addGold() {
    const val = parseInt(goldInput)
    if (isNaN(val)) return
    setBusy('gold')
    try {
      const newGold = Math.max(0, character.gold + val)
      await characterApi.update(character.id, { gold: newGold })
      onCharacterUpdate({ gold: newGold })
      setGoldInput('')
    } catch (err) { console.error(err) }
    finally { setBusy(null) }
  }

  async function fullHeal() {
    setBusy('heal')
    try {
      await characterApi.update(character.id, { hp: character.max_hp })
      onCharacterUpdate({ hp: character.max_hp })
    } catch (err) { console.error(err) }
    finally { setBusy(null) }
  }

  return (
    <div className="shrink-0 border-b border-violet-200/18 bg-violet-300/[0.045]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-4 py-1.5 font-fantasy text-[10px] uppercase tracking-[0.18em] text-violet-100/62 transition-colors hover:text-violet-100"
      >
        <span>Dev Panel / Testing Mode</span>
        <span>{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
          <button
            onClick={onKill}
            disabled={!character.is_alive}
            className="border border-red-300/40 bg-red-500/8 px-3 py-1.5 font-mono text-xs text-red-100/80 transition-all disabled:opacity-40"
          >
            Kill Character
          </button>

          <button
            onClick={onClearCombat}
            disabled={!inCombat}
            className="border border-blue-300/40 bg-blue-500/8 px-3 py-1.5 font-mono text-xs text-blue-100/80 transition-all disabled:opacity-40"
          >
            Clear Combat
          </button>

          <button
            onClick={fullHeal}
            disabled={busy === 'heal' || character.hp === character.max_hp}
            className="border border-emerald-300/40 bg-emerald-500/8 px-3 py-1.5 font-mono text-xs text-emerald-100/80 transition-all disabled:opacity-40"
          >
            {busy === 'heal' ? '...' : 'Full Heal'}
          </button>

          <div className="flex items-center gap-1">
            <input
              type="number"
              value={hpInput}
              onChange={e => setHpInput(e.target.value)}
              placeholder="HP"
              className="w-16 border border-violet-200/20 bg-black/20 px-2 py-1.5 font-mono text-xs text-violet-100/80 outline-none"
              min={0}
              max={character.max_hp}
            />
            <button
              onClick={setHP}
              disabled={busy === 'hp' || !hpInput}
              className="border border-violet-200/30 bg-violet-300/8 px-2 py-1.5 font-mono text-xs text-violet-100/70 transition-all disabled:opacity-40"
            >
              {busy === 'hp' ? '...' : 'Set HP'}
            </button>
          </div>

          <div className="flex items-center gap-1">
            <input
              type="number"
              value={goldInput}
              onChange={e => setGoldInput(e.target.value)}
              placeholder="Gold +/-"
              className="w-24 border border-amber-200/20 bg-black/20 px-2 py-1.5 font-mono text-xs text-amber-100/80 outline-none"
            />
            <button
              onClick={addGold}
              disabled={busy === 'gold' || !goldInput}
              className="border border-amber-200/30 bg-amber-300/8 px-2 py-1.5 font-mono text-xs text-amber-100/70 transition-all disabled:opacity-40"
            >
              {busy === 'gold' ? '...' : 'Add Gold'}
            </button>
          </div>

          <span className="ml-1 font-mono text-xs text-violet-100/30">
            HP: {character.hp}/{character.max_hp} / Gold: {character.gold}g
          </span>
        </div>
      )}
    </div>
  )
}
