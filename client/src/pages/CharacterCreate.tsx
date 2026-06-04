import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { characterApi } from '../lib/api'
import type { Race, CharacterClass } from '../../../shared/types'

type Gender = 'male' | 'female'

const RACE_STAT_BONUSES: Record<Race, Partial<Record<string, number>>> = {
  Human: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  Elf: { dex: 2, int: 1 },
  Dwarf: { con: 2, wis: 1 },
  Halfling: { dex: 2, cha: 1 },
  Gnome: { int: 2, dex: 1 },
  'Half-Orc': { str: 2, con: 1 },
  Tiefling: { cha: 2, int: 1 },
  Dragonborn: { str: 2, cha: 1 },
}

const RACES: Race[] = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn']
const CLASSES: CharacterClass[] = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Sorcerer', 'Warlock']

const RACE_DESCRIPTIONS: Record<Race, string> = {
  Human: 'Versatile and ambitious. Bonus to all stats.',
  Elf: 'Ancient and graceful. Swift and wise.',
  Dwarf: 'Stoic and enduring. Built to outlast.',
  Halfling: 'Nimble and lucky. Small, but never overlooked.',
  Gnome: 'Inventive and curious. Magic in their blood.',
  'Half-Orc': 'Fierce and resilient. Born for the fight.',
  Tiefling: 'Infernal heritage. Power and price.',
  Dragonborn: 'Draconic blood. Fire in their veins.',
}

const CLASS_DESCRIPTIONS: Record<CharacterClass, string> = {
  Fighter: 'Master of combat, weapon, and shield.',
  Wizard: 'Scholar of arcane magic. Fragile but devastating.',
  Rogue: 'Shadow-walker. Stealth and precision.',
  Cleric: 'Divine conduit. Healing and holy wrath.',
  Ranger: 'Wilderness hunter. Bow and blade.',
  Paladin: 'Holy warrior. Oath-bound and unyielding.',
  Barbarian: 'Primal fury. Reckless and unstoppable.',
  Bard: 'Silver tongue and secret lore.',
  Druid: "Nature's will made flesh.",
  Monk: 'Discipline incarnate. Fist and focus.',
  Sorcerer: 'Magic in the blood. Raw, unstable power.',
  Warlock: 'Pact-bound. Power at a terrible price.',
}

const CLASS_STATS: Record<CharacterClass, string> = {
  Fighter: 'STR · CON',
  Wizard: 'INT · WIS',
  Rogue: 'DEX · INT',
  Cleric: 'WIS · CHA',
  Ranger: 'DEX · WIS',
  Paladin: 'STR · CHA',
  Barbarian: 'STR · CON',
  Bard: 'CHA · DEX',
  Druid: 'WIS · CON',
  Monk: 'DEX · WIS',
  Sorcerer: 'CHA · CON',
  Warlock: 'CHA · INT',
}

// Returns all portrait options for a given race+gender combo
function getPortraits(race: Race, gender: Gender): { url: string; label: string }[] {
  const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
  const portraits: { url: string; label: string }[] = []

  if (gender === 'male') {
    // Default (usually male)
    portraits.push({ url: `/assets/races/${key}.png`, label: 'Classic' })
    // Black variant
    if (['human', 'elf', 'dwarf', 'halfling', 'gnome'].includes(key)) {
      portraits.push({ url: `/assets/races/${key}-m-black.png`, label: 'Dark' })
    }
  } else {
    portraits.push({ url: `/assets/races/${key}-f.png`, label: 'Classic' })
    if (['human', 'elf', 'dwarf', 'halfling', 'gnome'].includes(key)) {
      portraits.push({ url: `/assets/races/${key}-f-black.png`, label: 'Dark' })
    }
  }

  return portraits
}

function classImageUrl(cls: CharacterClass): string {
  return `/assets/classes/${cls.toLowerCase()}.png`
}

const STEPS = ['Gender', 'Race', 'Look', 'Class', 'Identity']

export default function CharacterCreate() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [gender, setGender] = useState<Gender | null>(null)
  const [selectedRace, setSelectedRace] = useState<Race | null>(null)
  const [selectedPortrait, setSelectedPortrait] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null)
  const [name, setName] = useState('')
  const [backstory, setBackstory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!selectedRace || !selectedClass || !name.trim() || !campaignId) return
    setLoading(true)
    setError('')
    try {
      const { data } = await characterApi.create({
        campaignId,
        name,
        race: selectedRace,
        class: selectedClass,
        backstory,
        portraitUrl: selectedPortrait || undefined,
      })
      navigate(`/campaign/${campaignId}/play/${data.character.id}`)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create character')
      setLoading(false)
    }
  }

  const portraits = selectedRace && gender ? getPortraits(selectedRace, gender) : []

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(ellipse at center top, #0f1923 0%, #070d14 100%)' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-ember-400/60 font-sans mb-1">Character Creation</p>
          <div className="flex items-center gap-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full border flex items-center justify-center text-xs font-sans transition-all duration-300"
                    style={i < step
                      ? { borderColor: '#c0392b', background: '#641e16', color: '#f5e6c8' }
                      : i === step
                      ? { borderColor: '#c0392b', background: 'rgba(192,57,43,0.15)', color: '#c0392b' }
                      : { borderColor: '#374151', background: 'transparent', color: '#4b5563' }
                    }
                  >
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-sans hidden sm:block ${i === step ? 'text-parchment-200' : i < step ? 'text-slate-500' : 'text-slate-700'}`}>
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-8 h-px" style={{ background: i < step ? '#641e16' : '#1f2937' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">

        {/* STEP 0: Gender */}
        {step === 0 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Who Are You?</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-8">This shapes your appearance in the world.</p>
            <div className="grid grid-cols-2 gap-6 max-w-lg">
              {(['male', 'female'] as Gender[]).map(g => (
                <button
                  key={g}
                  onClick={() => { setGender(g); setSelectedPortrait(null) }}
                  className="group relative border transition-all duration-300 overflow-hidden"
                  style={gender === g
                    ? { borderColor: '#c0392b', background: 'rgba(192,57,43,0.08)', boxShadow: '0 0 20px rgba(192,57,43,0.2)' }
                    : { borderColor: '#1f2937', background: 'rgba(15,25,35,0.8)' }
                  }
                >
                  <div className="p-10 flex flex-col items-center gap-3">
                    <div
                      className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl transition-all duration-300"
                      style={gender === g
                        ? { borderColor: '#c0392b', background: 'rgba(192,57,43,0.15)' }
                        : { borderColor: '#374151', background: 'rgba(15,25,35,0.5)' }
                      }
                    >
                      {g === 'male' ? '♂' : '♀'}
                    </div>
                    <span className="font-fantasy text-lg capitalize" style={{ color: gender === g ? '#f5e6c8' : '#6b7280' }}>
                      {g === 'male' ? 'Male' : 'Female'}
                    </span>
                  </div>
                  {gender === g && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ember-400" />
                  )}
                </button>
              ))}
            </div>
            <div className="mt-10">
              <button
                onClick={() => setStep(1)}
                disabled={!gender}
                className="fantasy-btn px-8 disabled:opacity-40"
              >
                Choose Your Race →
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Race */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Heritage</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">Where did you come from? What blood runs in your veins?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RACES.map(race => {
                const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
                const imgUrl = gender === 'female' ? `/assets/races/${key}-f.png` : `/assets/races/${key}.png`
                return (
                  <button
                    key={race}
                    onClick={() => { setSelectedRace(race); setSelectedPortrait(null) }}
                    className="group relative border overflow-hidden transition-all duration-300 text-left"
                    style={selectedRace === race
                      ? { borderColor: '#c0392b', boxShadow: '0 0 15px rgba(192,57,43,0.3)' }
                      : { borderColor: '#1f2937' }
                    }
                  >
                    <div className="relative h-32 bg-slate-900 overflow-hidden">
                      <img
                        src={imgUrl}
                        alt={race}
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                        onError={e => {
                          const img = e.target as HTMLImageElement
                          img.src = `/assets/races/${key}.png`
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                      {selectedRace === race && (
                        <div className="absolute inset-0 border-2 border-ember-400/60" style={{ background: 'rgba(192,57,43,0.1)' }} />
                      )}
                    </div>
                    <div className="p-2.5" style={{ background: selectedRace === race ? 'rgba(192,57,43,0.06)' : '#0a0e18' }}>
                      <p className="font-fantasy text-sm text-parchment-200">{race}</p>
                      <p className="text-xs text-slate-600 mt-0.5 font-serif">
                        {Object.entries(RACE_STAT_BONUSES[race]).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedRace && (
              <div className="mt-4 p-4 border border-slate-800 bg-slate-900/50">
                <p className="text-parchment-200 font-serif text-sm">{RACE_DESCRIPTIONS[selectedRace]}</p>
              </div>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(0)} className="fantasy-btn-secondary">← Back</button>
              <button onClick={() => setStep(2)} disabled={!selectedRace} className="fantasy-btn px-8 disabled:opacity-40">
                Choose Your Look →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Portrait */}
        {step === 2 && selectedRace && gender && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Face</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">Choose how the world sees you.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {portraits.map((p) => (
                <button
                  key={p.url}
                  onClick={() => setSelectedPortrait(p.url)}
                  className="group relative border overflow-hidden transition-all duration-300"
                  style={selectedPortrait === p.url
                    ? { borderColor: '#c0392b', boxShadow: '0 0 20px rgba(192,57,43,0.4)' }
                    : { borderColor: '#1f2937' }
                  }
                >
                  <div className="relative aspect-square overflow-hidden">
                    <img
                      src={p.url}
                      alt={p.label}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                    />
                    {selectedPortrait === p.url && (
                      <div className="absolute inset-0 border-2 border-ember-400" style={{ background: 'rgba(192,57,43,0.15)' }}>
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-ember-500 flex items-center justify-center text-white text-xs">✓</div>
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-center" style={{ background: '#0a0e18' }}>
                    <p className="text-xs font-serif text-slate-400">{p.label}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(1)} className="fantasy-btn-secondary">← Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedPortrait}
                className="fantasy-btn px-8 disabled:opacity-40"
              >
                Choose Your Class →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Class */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Path</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-6">How do you survive in a world like this?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CLASSES.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className="group relative border overflow-hidden transition-all duration-300 text-left"
                  style={selectedClass === cls
                    ? { borderColor: '#c0392b', boxShadow: '0 0 15px rgba(192,57,43,0.25)' }
                    : { borderColor: '#1f2937' }
                  }
                >
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={classImageUrl(cls)}
                      alt={cls}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                    {selectedClass === cls && (
                      <div className="absolute inset-0 border-2 border-ember-400/60" style={{ background: 'rgba(192,57,43,0.1)' }} />
                    )}
                  </div>
                  <div className="p-2.5" style={{ background: selectedClass === cls ? 'rgba(192,57,43,0.06)' : '#0a0e18' }}>
                    <p className="font-fantasy text-sm text-parchment-200">{cls}</p>
                    <p className="text-xs text-slate-600 font-sans mt-0.5">{CLASS_STATS[cls]}</p>
                  </div>
                </button>
              ))}
            </div>
            {selectedClass && (
              <div className="mt-4 p-4 border border-slate-800 bg-slate-900/50">
                <p className="text-parchment-200 font-serif text-sm">{CLASS_DESCRIPTIONS[selectedClass]}</p>
              </div>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(2)} className="fantasy-btn-secondary">← Back</button>
              <button onClick={() => setStep(4)} disabled={!selectedClass} className="fantasy-btn px-8 disabled:opacity-40">
                Name Your Legend →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Name & Review */}
        {step === 4 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">Your Legend</h2>
            <p className="text-slate-500 font-serif italic text-sm mb-8">What do they call you? What brought you here?</p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Form */}
              <div className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="fantasy-input w-full text-lg font-serif"
                    placeholder="What do they call you?"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
                    Backstory <span className="text-slate-700 normal-case tracking-normal">(optional — the DM reads this)</span>
                  </label>
                  <textarea
                    value={backstory}
                    onChange={e => setBackstory(e.target.value)}
                    className="fantasy-input w-full h-36 resize-none font-serif text-sm"
                    placeholder="Who were you before? What drives you? What have you lost?"
                  />
                </div>
              </div>

              {/* Preview card */}
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-600 mb-3">Preview</p>
                <div className="border border-slate-800 bg-slate-900/60 overflow-hidden">
                  {selectedPortrait && (
                    <div className="relative h-48 overflow-hidden">
                      <img src={selectedPortrait} alt="portrait" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <p className="font-fantasy text-xl text-parchment-100">{name || '—'}</p>
                        <p className="text-slate-400 text-xs font-serif">{selectedRace} {selectedClass}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    {selectedClass && (
                      <p className="text-slate-400 font-serif text-xs italic">{CLASS_DESCRIPTIONS[selectedClass]}</p>
                    )}
                    {selectedRace && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(RACE_STAT_BONUSES[selectedRace]).map(([stat, bonus]) => (
                          <span key={stat} className="text-xs border border-slate-700 px-2 py-0.5 text-slate-400 font-sans">
                            +{bonus} {stat.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 border border-ember-600 bg-ember-600/10 px-3 py-2 text-ember-400 text-sm">
                {error}
              </div>
            )}

            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(3)} className="fantasy-btn-secondary">← Back</button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                className="fantasy-btn px-10 disabled:opacity-40"
              >
                {loading ? <span className="animate-pulse">Forging your legend...</span> : 'Enter the World'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
