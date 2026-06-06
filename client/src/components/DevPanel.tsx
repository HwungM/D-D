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
    <div className="shrink-0" style={{ borderBottom: '1px solid rgba(147,51,234,0.25)', background: 'rgba(88,28,135,0.08)' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-1.5 font-mono text-xs transition-colors"
        style={{ color: 'rgba(196,181,253,0.6)', letterSpacing: '0.1em' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(196,181,253,0.9)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(196,181,253,0.6)' }}
      >
        <span>âš™ DEV PANEL â€” TESTING MODE</span>
        <span>{expanded ? 'â–²' : 'â–¼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 flex flex-wrap gap-3 items-end">
          {/* Kill */}
          <button
            onClick={onKill}
            disabled={!character.is_alive}
            className="font-mono text-xs px-3 py-1.5 transition-all disabled:opacity-40"
            style={{ border: '1px solid rgba(239,68,68,0.4)', color: 'rgba(239,68,68,0.8)', background: 'rgba(239,68,68,0.08)' }}
          >
            â˜  Kill Character
          </button>

          {/* Clear combat */}
          <button
            onClick={onClearCombat}
            disabled={!inCombat}
            className="font-mono text-xs px-3 py-1.5 transition-all disabled:opacity-40"
            style={{ border: '1px solid rgba(96,165,250,0.4)', color: 'rgba(96,165,250,0.8)', background: 'rgba(96,165,250,0.08)' }}
          >
            âš” Clear Combat
          </button>

          {/* Full heal */}
          <button
            onClick={fullHeal}
            disabled={busy === 'heal' || character.hp === character.max_hp}
            className="font-mono text-xs px-3 py-1.5 transition-all disabled:opacity-40"
            style={{ border: '1px solid rgba(34,197,94,0.4)', color: 'rgba(34,197,94,0.8)', background: 'rgba(34,197,94,0.08)' }}
          >
            {busy === 'heal' ? '...' : '+ Full Heal'}
          </button>

          {/* Set HP */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={hpInput}
              onChange={e => setHpInput(e.target.value)}
              placeholder="HP"
              className="font-mono text-xs py-1.5 px-2 outline-none w-16 bg-transparent"
              style={{ border: '1px solid rgba(196,181,253,0.2)', color: 'rgba(196,181,253,0.8)' }}
              min={0}
              max={character.max_hp}
            />
            <button
              onClick={setHP}
              disabled={busy === 'hp' || !hpInput}
              className="font-mono text-xs px-2 py-1.5 transition-all disabled:opacity-40"
              style={{ border: '1px solid rgba(196,181,253,0.3)', color: 'rgba(196,181,253,0.7)', background: 'rgba(196,181,253,0.06)' }}
            >
              {busy === 'hp' ? '...' : 'Set HP'}
            </button>
          </div>

          {/* Add/remove gold */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={goldInput}
              onChange={e => setGoldInput(e.target.value)}
              placeholder="Gold Â±"
              className="font-mono text-xs py-1.5 px-2 outline-none w-20 bg-transparent"
              style={{ border: '1px solid rgba(234,179,8,0.2)', color: 'rgba(234,179,8,0.8)' }}
            />
            <button
              onClick={addGold}
              disabled={busy === 'gold' || !goldInput}
              className="font-mono text-xs px-2 py-1.5 transition-all disabled:opacity-40"
              style={{ border: '1px solid rgba(234,179,8,0.3)', color: 'rgba(234,179,8,0.7)', background: 'rgba(234,179,8,0.06)' }}
            >
              {busy === 'gold' ? '...' : 'Add Gold'}
            </button>
          </div>

          <span className="font-mono text-xs ml-1" style={{ color: 'rgba(196,181,253,0.3)' }}>
            HP: {character.hp}/{character.max_hp} Â· Gold: {character.gold}g
          </span>
        </div>
      )}
    </div>
  )
}
