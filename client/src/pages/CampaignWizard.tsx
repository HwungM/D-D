import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { campaignApi } from '../lib/api'
import { TONE_ICONS, pickRandom4 } from '../lib/seeds'
import type { StorySeedOption } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ToneChoice = 'Dark & Gritty' | 'Heroic & Epic' | 'Mystery & Intrigue' | 'Anything Goes'
type Pillar = 'Combat & Tactics' | 'Exploration & Discovery' | 'Roleplay & Social' | 'Puzzles & Mysteries' | 'All of it equally'

interface WizardState {
  isCollaborative: boolean
  tone: ToneChoice | null
  pillars: Pillar[]
  playerCount: 1 | 2 | 3
  characterConcepts: string[]
  selectedSeed: StorySeedOption | null
  useCustomPremise: boolean
  customPremise: string
  campaignName: string
}

const TONE_CARDS: { label: ToneChoice; description: string }[] = [
  { label: 'Dark & Gritty', description: 'Betrayal, moral grey areas, victories that cost something. No heroes, only survivors.' },
  { label: 'Heroic & Epic', description: 'Rising heroes against impossible odds. Clear purpose, legendary deeds, the world needs saving.' },
  { label: 'Mystery & Intrigue', description: 'Nothing is what it seems. Secrets, conspiracies, the truth buried in layers.' },
  { label: 'Anything Goes', description: 'Surprise me. The DM decides what fits the moment.' },
]

const PILLARS: Pillar[] = [
  'Combat & Tactics',
  'Exploration & Discovery',
  'Roleplay & Social',
  'Puzzles & Mysteries',
  'All of it equally',
]

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------
function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-10">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="transition-all duration-300"
            style={{
              width: i === step ? '28px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i < step
                ? 'rgba(200,146,42,0.5)'
                : i === step
                  ? '#c8922a'
                  : 'rgba(255,255,255,0.12)',
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CampaignWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [seeds, setSeeds] = useState<StorySeedOption[]>(() => pickRandom4())

  const [state, setState] = useState<WizardState>({
    isCollaborative: false,
    tone: null,
    pillars: [],
    playerCount: 1,
    characterConcepts: ['', ''],
    selectedSeed: null,
    useCustomPremise: false,
    customPremise: '',
    campaignName: '',
  })

  const totalSteps = 7

  function animateTo(nextStep: number) {
    setVisible(false)
    setTimeout(() => {
      setStep(nextStep)
      setVisible(true)
    }, 200)
  }

  function goNext() { animateTo(step + 1) }
  function goBack() { animateTo(step - 1) }

  function togglePillar(p: Pillar) {
    setState(prev => {
      const has = prev.pillars.includes(p)
      if (p === 'All of it equally') {
        return { ...prev, pillars: has ? [] : ['All of it equally'] }
      }
      const without = prev.pillars.filter(x => x !== 'All of it equally')
      return {
        ...prev,
        pillars: has ? without.filter(x => x !== p) : [...without, p],
      }
    })
  }

  function refreshSeeds() {
    const currentIds = seeds.map(s => s.id)
    setSeeds(pickRandom4(currentIds))
    setState(prev => ({ ...prev, selectedSeed: null }))
  }

  async function handleCreate() {
    const premise = state.useCustomPremise ? state.customPremise.trim() : state.selectedSeed?.premise
    if (!premise || !state.campaignName.trim()) return
    setCreating(true)
    setError('')
    try {
      const playerPreferences = {
        tone: state.tone || 'Anything Goes',
        favoritePillars: state.pillars,
        playerCount: state.playerCount,
        characterConcepts: state.characterConcepts.filter(Boolean),
      }
      const { data } = await campaignApi.create(state.campaignName.trim(), premise, 'adventure', playerPreferences)
      navigate(`/campaign/${data.campaign.id}/brief`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create campaign. Try again.'
      setError(typeof msg === 'string' ? msg : 'Failed to create campaign.')
      setCreating(false)
    }
  }

  const canProceed: boolean[] = [
    true,                                  // step 0: collaborative choice (always has default)
    !!state.tone,                          // step 1: tone
    state.pillars.length > 0,             // step 2: pillars
    true,                                  // step 3: party (always has default)
    true,                                  // step 4: characters (optional)
    !!(state.selectedSeed || (state.useCustomPremise && state.customPremise.trim().length > 20)),  // step 5: premise
    state.campaignName.trim().length > 0, // step 6: name
  ]

  // -------------------------------------------------------------------------
  // Loading overlay
  // -------------------------------------------------------------------------
  if (creating) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: '#0a0d12' }}>
        <div className="absolute inset-0" style={{
          backgroundImage: `url('/assets/scenes/ancient-ruins.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.08,
        }} />
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 mx-auto mb-6 border-2 rounded-full animate-spin" style={{
            borderColor: 'rgba(200,146,42,0.25)',
            borderTopColor: '#c8922a',
          }} />
          <p className="font-fantasy text-2xl text-parchment-200 mb-2">The world takes shape...</p>
          <p className="font-serif text-sm" style={{ color: 'rgba(200,146,42,0.5)' }}>Your campaign is being woven into existence</p>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------
  const stepContent = [
    // Step 0 — Solo vs Collaborative
    <div key="coop">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">How are you adventuring?</h2>
      <p className="font-serif text-sm text-center mb-8" style={{ color: 'rgba(180,160,120,0.6)' }}>Choose your adventuring style</p>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg mx-auto">
        {[
          { label: 'Solo — just me', description: 'A personal story tailored entirely around you. The DM focuses every beat on your character\'s journey.', collaborative: false },
          { label: 'Collaborative — with a party', description: 'Adventure with friends. The DM weaves your actions together into a shared story. Invite your party after creating the campaign.', collaborative: true },
        ].map(option => {
          const selected = state.isCollaborative === option.collaborative
          return (
            <button
              key={option.label}
              onClick={() => setState(prev => ({
                ...prev,
                isCollaborative: option.collaborative,
                playerCount: option.collaborative ? 2 : 1,
              }))}
              className="text-left p-5 transition-all duration-200"
              style={selected
                ? { background: 'rgba(200,146,42,0.1)', border: '1px solid rgba(200,146,42,0.5)', boxShadow: '0 0 20px rgba(200,146,42,0.1)' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-fantasy text-lg" style={{ color: selected ? '#e8c87a' : '#d4c5a0' }}>{option.label}</h3>
                {selected && <span style={{ color: '#c8922a' }}>✓</span>}
              </div>
              <p className="font-serif text-sm leading-relaxed" style={{ color: 'rgba(180,160,120,0.7)' }}>{option.description}</p>
            </button>
          )
        })}
      </div>
    </div>,

    // Step 1 — Tone
    <div key="tone">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">What kind of story calls to you?</h2>
      <p className="font-serif text-sm text-center mb-8" style={{ color: 'rgba(180,160,120,0.6)' }}>Choose the tone that excites you most</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TONE_CARDS.map(card => {
          const selected = state.tone === card.label
          return (
            <button
              key={card.label}
              onClick={() => setState(prev => ({ ...prev, tone: card.label }))}
              className="text-left p-5 transition-all duration-200"
              style={selected
                ? { background: 'rgba(200,146,42,0.1)', border: '1px solid rgba(200,146,42,0.5)', boxShadow: '0 0 20px rgba(200,146,42,0.1)' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-fantasy text-lg" style={{ color: selected ? '#e8c87a' : '#d4c5a0' }}>{card.label}</h3>
                {selected && <span style={{ color: '#c8922a' }}>✓</span>}
              </div>
              <p className="font-serif text-sm leading-relaxed" style={{ color: 'rgba(180,160,120,0.7)' }}>{card.description}</p>
            </button>
          )
        })}
      </div>
    </div>,

    // Step 1 — Pillars
    <div key="pillars">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">What do you love most at the table?</h2>
      <p className="font-serif text-sm text-center mb-8" style={{ color: 'rgba(180,160,120,0.6)' }}>Select all that apply — minimum one</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map(p => {
          const selected = state.pillars.includes(p)
          return (
            <button
              key={p}
              onClick={() => togglePillar(p)}
              className="p-4 text-left transition-all duration-200 font-serif"
              style={selected
                ? { background: 'rgba(200,146,42,0.1)', border: '1px solid rgba(200,146,42,0.5)', color: '#e8c87a' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(180,160,120,0.8)' }
              }
            >
              <div className="flex items-center justify-between">
                <span>{p}</span>
                {selected && <span style={{ color: '#c8922a' }}>✓</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>,

    // Step 2 — Party size
    <div key="party">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">Who's adventuring?</h2>
      <p className="font-serif text-sm text-center mb-8" style={{ color: 'rgba(180,160,120,0.6)' }}>The DM will tailor the challenge accordingly</p>
      <div className="grid gap-4 max-w-lg mx-auto">
        {([
          { count: 1 as const, label: 'Solo — just me', note: null },
          { count: 2 as const, label: 'Two of us', note: 'Great for building camaraderie' },
          { count: 3 as const, label: 'Three or more', note: null },
        ] as { count: 1 | 2 | 3; label: string; note: string | null }[]).map(({ count, label, note }) => {
          const selected = state.playerCount === count
          return (
            <button
              key={count}
              onClick={() => setState(prev => ({ ...prev, playerCount: count }))}
              className="p-5 text-left transition-all duration-200"
              style={selected
                ? { background: 'rgba(200,146,42,0.1)', border: '1px solid rgba(200,146,42,0.5)' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-fantasy text-lg" style={{ color: selected ? '#e8c87a' : '#d4c5a0' }}>{label}</span>
                  {note && <p className="font-serif text-xs mt-1" style={{ color: 'rgba(180,160,120,0.5)' }}>{note}</p>}
                </div>
                {selected && <span style={{ color: '#c8922a' }}>✓</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>,

    // Step 3 — Characters
    <div key="characters">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">Tell me about your characters</h2>
      <p className="font-serif text-sm text-center mb-8" style={{ color: 'rgba(180,160,120,0.6)' }}>
        These are optional — the more you share, the more personal the story becomes
      </p>
      <div className="space-y-5 max-w-xl mx-auto">
        {Array.from({ length: Math.min(state.playerCount, 2) }, (_, i) => (
          <div key={i}>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(200,146,42,0.6)', letterSpacing: '0.12em' }}>
              Character {i + 1} concept <span style={{ color: 'rgba(180,160,120,0.4)' }}>(optional)</span>
            </label>
            <textarea
              value={state.characterConcepts[i] || ''}
              onChange={e => {
                const updated = [...state.characterConcepts]
                updated[i] = e.target.value
                setState(prev => ({ ...prev, characterConcepts: updated }))
              }}
              className="w-full bg-transparent outline-none py-3 px-3 font-serif text-sm resize-none"
              style={{
                border: '1px solid rgba(200,146,42,0.2)',
                background: 'rgba(200,146,42,0.03)',
                minHeight: '90px',
                color: '#d4c5a0',
              }}
              placeholder={i === 0
                ? 'A disgraced knight seeking to reclaim her family\'s honor...'
                : 'A wandering scholar haunted by something they witnessed long ago...'
              }
            />
            <p className="text-xs font-serif mt-1" style={{ color: 'rgba(180,160,120,0.4)' }}>
              What does this person care about? What do they fear? What drives them?
            </p>
          </div>
        ))}
      </div>
    </div>,

    // Step 4 — Premise
    <div key="premise">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">Choose your world</h2>
      <p className="font-serif text-sm text-center mb-6" style={{ color: 'rgba(180,160,120,0.6)' }}>
        The spark that ignites your campaign
      </p>
      <div className="flex items-center justify-end gap-2 mb-4">
        {!state.useCustomPremise && (
          <button
            onClick={refreshSeeds}
            className="text-xs font-serif px-3 py-1.5 transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(180,160,120,0.6)' }}
          >
            Different options →
          </button>
        )}
        <button
          onClick={() => setState(prev => ({ ...prev, useCustomPremise: !prev.useCustomPremise, selectedSeed: null }))}
          className="text-xs font-serif px-3 py-1.5 transition-all"
          style={{ border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(220,130,100,0.8)' }}
        >
          {state.useCustomPremise ? '← Browse seeds' : '✎ Write your own premise'}
        </button>
      </div>

      {state.useCustomPremise ? (
        <div>
          <textarea
            value={state.customPremise}
            onChange={e => setState(prev => ({ ...prev, customPremise: e.target.value }))}
            className="w-full bg-transparent outline-none py-3 px-3 font-serif text-sm resize-none"
            style={{
              border: '1px solid rgba(200,146,42,0.2)',
              background: 'rgba(200,146,42,0.03)',
              minHeight: '160px',
              color: '#d4c5a0',
            }}
            placeholder="Describe the world, the conflict, the opening scene... The Dungeon Master will weave your words into a living campaign."
          />
          <p className="text-xs font-serif mt-1.5" style={{ color: state.customPremise.length < 20 ? 'rgba(220,100,80,0.6)' : 'rgba(120,160,100,0.7)' }}>
            {state.customPremise.length < 20 ? 'Write at least a sentence...' : `${state.customPremise.length} characters — the Dungeon Master is intrigued`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {seeds.map(seed => {
            const selected = state.selectedSeed?.id === seed.id
            return (
              <button
                key={seed.id}
                onClick={() => setState(prev => ({ ...prev, selectedSeed: seed }))}
                className="w-full text-left p-4 transition-all duration-200"
                style={selected
                  ? { background: 'rgba(200,146,42,0.08)', border: '1px solid rgba(200,146,42,0.45)' }
                  : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }
                }
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5 shrink-0">{TONE_ICONS[seed.tone] || '📜'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-fantasy text-base" style={{ color: selected ? '#e8c87a' : '#d4c5a0' }}>{seed.title}</h4>
                      {selected && <span className="text-xs shrink-0" style={{ color: '#c8922a' }}>Selected ✓</span>}
                    </div>
                    <p className="text-sm font-serif leading-relaxed mb-2" style={{ color: 'rgba(200,185,155,0.8)' }}>{seed.premise}</p>
                    <div className="flex gap-3 text-xs font-serif" style={{ color: 'rgba(150,140,110,0.55)' }}>
                      <span>{seed.tone}</span>
                      <span>·</span>
                      <span>{seed.startingLocation}</span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>,

    // Step 6 — Name
    <div key="name">
      <h2 className="font-fantasy text-3xl text-parchment-200 mb-2 text-center">Name your campaign</h2>
      <p className="font-serif text-sm text-center mb-8" style={{ color: 'rgba(180,160,120,0.6)' }}>
        This is how your legend will be remembered
      </p>
      <div className="max-w-md mx-auto">
        <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(200,146,42,0.7)', letterSpacing: '0.12em' }}>
          Campaign Name
        </label>
        <input
          type="text"
          value={state.campaignName}
          onChange={e => setState(prev => ({ ...prev, campaignName: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter' && canProceed[6]) handleCreate() }}
          className="w-full bg-transparent outline-none py-3 px-4 font-serif text-lg text-parchment-200 mb-6"
          style={{
            border: '1px solid rgba(200,146,42,0.3)',
            background: 'rgba(200,146,42,0.04)',
          }}
          placeholder={state.selectedSeed ? `The ${state.selectedSeed.title}` : 'Name your legend...'}
          autoFocus
        />
        {error && (
          <div className="px-3 py-2 mb-4 text-sm font-serif" style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#e87a7a' }}>
            {error}
          </div>
        )}
        <button
          onClick={handleCreate}
          disabled={!canProceed[6]}
          className="w-full py-3.5 font-fantasy text-lg transition-all disabled:opacity-40"
          style={{
            background: canProceed[6] ? 'linear-gradient(135deg, rgba(200,146,42,0.25), rgba(160,100,30,0.35))' : 'transparent',
            border: '1px solid rgba(200,146,42,0.4)',
            color: '#e8c87a',
            letterSpacing: '0.05em',
          }}
        >
          {state.isCollaborative ? 'Create Campaign & Invite Party' : 'Create Campaign'}
        </button>
      </div>
    </div>,
  ]

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen text-parchment-100 relative" style={{ background: '#0a0d12' }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `url('/assets/scenes/castle-gate.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.06,
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(120,50,20,0.12) 0%, transparent 70%)',
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-48" style={{
          background: 'linear-gradient(to top, #0a0d12, transparent)',
        }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4 flex items-center gap-4" style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(10,13,18,0.8)',
        backdropFilter: 'blur(10px)',
      }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="font-serif text-sm transition-all"
          style={{ color: 'rgba(180,160,120,0.5)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(200,180,140,0.9)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(180,160,120,0.5)' }}
        >
          ← Back
        </button>
        <div className="flex-1 text-center">
          <span className="font-fantasy text-sm text-parchment-200" style={{ letterSpacing: '0.05em' }}>New Campaign</span>
        </div>
        <div style={{ width: '60px' }} /> {/* spacer */}
      </header>

      {/* Wizard content */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        <StepIndicator step={step} total={totalSteps} />

        {/* Animated step content */}
        <div
          className="transition-all duration-200"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
          }}
        >
          {stepContent[step]}
        </div>

        {/* Navigation */}
        {step < totalSteps - 1 && (
          <div className="flex items-center justify-between mt-10">
            <button
              onClick={step === 0 ? () => navigate('/dashboard') : goBack}
              className="font-serif text-sm px-5 py-2.5 transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(180,160,120,0.6)' }}
            >
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            <button
              onClick={goNext}
              disabled={!canProceed[step]}
              className="font-serif text-sm px-6 py-2.5 transition-all disabled:opacity-40"
              style={{
                background: canProceed[step] ? 'linear-gradient(135deg, rgba(200,146,42,0.2), rgba(160,100,30,0.3))' : 'transparent',
                border: '1px solid rgba(200,146,42,0.35)',
                color: '#e8c87a',
              }}
            >
              Continue →
            </button>
          </div>
        )}
        {step === totalSteps - 1 && (
          <div className="flex justify-start mt-6">
            <button
              onClick={goBack}
              className="font-serif text-sm px-5 py-2.5 transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(180,160,120,0.6)' }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
