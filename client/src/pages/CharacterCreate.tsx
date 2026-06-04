import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { characterApi } from '../lib/api'
import type { Race, CharacterClass } from '../../../shared/types'
import { RACE_STAT_BONUSES } from '../../../shared/types'

const RACES: Race[] = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn']
const CLASSES: CharacterClass[] = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Sorcerer', 'Warlock']

const RACE_DESCRIPTIONS: Record<Race, string> = {
  Human: 'Versatile and ambitious. +1 to all stats.',
  Elf: 'Ancient and graceful. +2 DEX, +1 INT.',
  Dwarf: 'Stoic and enduring. +2 CON, +1 WIS.',
  Halfling: 'Nimble and lucky. +2 DEX, +1 CHA.',
  Gnome: 'Inventive and curious. +2 INT, +1 DEX.',
  'Half-Orc': 'Fierce and resilient. +2 STR, +1 CON.',
  Tiefling: 'Infernal heritage. +2 CHA, +1 INT.',
  Dragonborn: 'Draconic blood. +2 STR, +1 CHA.',
}

const CLASS_DESCRIPTIONS: Record<CharacterClass, string> = {
  Fighter: 'Master of combat, weapon, and shield.',
  Wizard: 'Scholar of arcane magic. Fragile but powerful.',
  Rogue: 'Shadow-walker. Stealth and precision.',
  Cleric: 'Divine conduit. Healing and holy wrath.',
  Ranger: 'Wilderness hunter. Bow and blade.',
  Paladin: 'Holy warrior. Oath-bound and unyielding.',
  Barbarian: 'Primal fury. Reckless and unstoppable.',
  Bard: 'Silver tongue and secret lore.',
  Druid: "Nature's will made flesh.",
  Monk: 'Discipline incarnate. Fist and focus.',
  Sorcerer: 'Magic in the blood. Unstable power.',
  Warlock: 'Pact-bound. Power at a price.',
}

function raceImageUrl(race: Race): string {
  const key = race.toLowerCase().replace(/['\s]/g, '-').replace('--', '-')
  return `/assets/races/${key}.png`
}

function classImageUrl(cls: CharacterClass): string {
  return `/assets/classes/${cls.toLowerCase()}.png`
}

export default function CharacterCreate() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [selectedRace, setSelectedRace] = useState<Race | null>(null)
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null)
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
      })
      navigate(`/campaign/${campaignId}/play/${data.character.id}`)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create character')
    } finally {
      setLoading(false)
    }
  }

  const racialBonuses = selectedRace ? RACE_STAT_BONUSES[selectedRace] : {}

  return (
    <div className="min-h-screen bg-slate-950 text-parchment-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="font-fantasy text-2xl text-parchment-200">Forge Your Character</h1>
        <div className="flex gap-2 mt-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 ${step >= s ? 'bg-ember-500' : 'bg-slate-700'}`} />
          ))}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Step 1: Race & Class */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-xl text-parchment-200 mb-6">Choose Your Heritage & Calling</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Race */}
              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-3">Race</h3>
                <div className="grid grid-cols-2 gap-2">
                  {RACES.map(race => (
                    <button
                      key={race}
                      onClick={() => setSelectedRace(race)}
                      className={`border text-left transition-all overflow-hidden group ${selectedRace === race ? 'border-ember-500' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      <div className="relative h-24 bg-slate-900 overflow-hidden">
                        <img
                          src={raceImageUrl(race)}
                          alt={race}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        {selectedRace === race && (
                          <div className="absolute inset-0 bg-ember-600/20 border-2 border-ember-500" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="font-serif text-sm text-parchment-200">{race}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-tight">{RACE_DESCRIPTIONS[race].split('. ').slice(1).join('. ')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Class */}
              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-3">Class</h3>
                <div className="grid grid-cols-2 gap-2">
                  {CLASSES.map(cls => (
                    <button
                      key={cls}
                      onClick={() => setSelectedClass(cls)}
                      className={`border text-left transition-all overflow-hidden group ${selectedClass === cls ? 'border-ember-500' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      <div className="relative h-24 bg-slate-900 overflow-hidden">
                        <img
                          src={classImageUrl(cls)}
                          alt={cls}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        {selectedClass === cls && (
                          <div className="absolute inset-0 bg-ember-600/20 border-2 border-ember-500" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="font-serif text-sm text-parchment-200">{cls}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-tight line-clamp-1">{CLASS_DESCRIPTIONS[cls]}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {selectedRace && selectedClass && (
              <div className="mt-5 border border-ember-600/30 bg-ember-600/5 p-4 flex gap-4 items-center">
                <img
                  src={raceImageUrl(selectedRace)}
                  alt={selectedRace}
                  className="w-16 h-16 object-cover object-top border border-slate-700 shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <div>
                  <p className="font-fantasy text-parchment-200 text-lg">{selectedRace} {selectedClass}</p>
                  <p className="text-slate-400 text-sm font-serif">{RACE_DESCRIPTIONS[selectedRace]} {CLASS_DESCRIPTIONS[selectedClass]}</p>
                  {Object.keys(racialBonuses).length > 0 && (
                    <p className="text-slate-500 text-xs mt-1">
                      Racial bonuses: {Object.entries(racialBonuses).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!selectedRace || !selectedClass}
                className="fantasy-btn disabled:opacity-50"
              >
                Next: Name & Story →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Name & Backstory */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-xl text-parchment-200 mb-6">Name & Origin</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Character Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="fantasy-input w-full text-lg"
                    placeholder="What do they call you?"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Backstory (optional)</label>
                  <textarea
                    value={backstory}
                    onChange={e => setBackstory(e.target.value)}
                    className="fantasy-input w-full h-40 resize-none"
                    placeholder="Who were you before? What drives you? What have you lost?"
                  />
                  <p className="text-slate-600 text-xs mt-1">The DM reads this. Choose wisely.</p>
                </div>
              </div>
              {selectedRace && (
                <div className="flex flex-col items-center justify-center">
                  <img
                    src={raceImageUrl(selectedRace)}
                    alt={selectedRace}
                    className="w-48 h-48 object-cover object-top border border-slate-700"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <p className="text-slate-500 text-xs mt-2 font-serif italic">{selectedRace} {selectedClass}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(1)} className="fantasy-btn-secondary">← Back</button>
              <button onClick={() => setStep(3)} disabled={!name.trim()} className="fantasy-btn disabled:opacity-50">
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="font-fantasy text-xl text-parchment-200 mb-6">Your Legend Begins</h2>
            <div className="border border-slate-700 bg-slate-900 p-6 max-w-lg flex gap-6 items-start">
              <img
                src={raceImageUrl(selectedRace!)}
                alt={selectedRace!}
                className="w-28 h-28 object-cover object-top border border-slate-700 shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <div className="flex-1">
                <h3 className="font-fantasy text-2xl text-parchment-200">{name}</h3>
                <p className="text-slate-400 font-serif">{selectedRace} {selectedClass}</p>
                <div className="flex gap-2 mt-2">
                  <img
                    src={classImageUrl(selectedClass!)}
                    alt={selectedClass!}
                    className="w-10 h-10 object-cover border border-slate-700"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <p className="text-slate-500 text-xs font-serif italic flex-1 self-center">{CLASS_DESCRIPTIONS[selectedClass!]}</p>
                </div>
                {Object.keys(racialBonuses).length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {Object.entries(racialBonuses).map(([stat, bonus]) => (
                      <div key={stat} className="stat-box text-center px-2 py-1">
                        <span className="text-slate-400 text-xs uppercase block">{stat}</span>
                        <span className="text-parchment-200 font-bold">+{bonus}</span>
                      </div>
                    ))}
                  </div>
                )}
                {backstory && (
                  <div className="mt-3 border-t border-slate-700 pt-3">
                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Origin</p>
                    <p className="text-slate-300 text-xs font-serif italic line-clamp-3">{backstory}</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 border border-ember-600 bg-ember-600/10 px-3 py-2 text-ember-400 text-sm max-w-lg">
                {error}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(2)} className="fantasy-btn-secondary">← Back</button>
              <button onClick={handleCreate} disabled={loading} className="fantasy-btn disabled:opacity-50">
                {loading ? 'Entering the realm...' : 'Enter the World'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
