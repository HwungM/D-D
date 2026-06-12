import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import { campaignApi } from '../lib/api'
import { TONE_ICONS, pickRandom4 } from '../lib/seeds'
import type { StorySeedOption } from '../../../shared/types'

type ToneChoice = 'Perilous & Grounded' | 'Heroic & Epic' | 'Mystery & Intrigue' | 'Anything Goes'
type Pillar = 'Combat & Tactics' | 'Exploration & Discovery' | 'Roleplay & Social' | 'Puzzles & Mysteries' | 'All of it equally'
type PartyIntent = 'solo_alone' | 'solo_ai_companions' | 'collab_wait_for_party' | 'collab_start_now'
type CampaignLength = 'one_shot' | 'short' | 'medium' | 'long' | 'open_ended'

interface WizardState {
  isCollaborative: boolean
  partyIntent: PartyIntent
  campaignLength: CampaignLength
  tone: ToneChoice | null
  pillars: Pillar[]
  playerCount: 1 | 2 | 3
  targetPlayerCount: 1 | 2 | 3
  waitForParty: boolean
  selectedSeed: StorySeedOption | null
  useCustomPremise: boolean
  customPremise: string
  campaignName: string
}

const EVERREALM_ART_STYLE =
  'Hand-painted western fantasy animation, anime-aware but not anime; sharp expressive faces, varied silhouettes, rugged adventuring gear, painterly cinematic lighting, and strong personality in every character.'

const STEPS = [
  { eyebrow: 'Party Shape', title: 'Set the table', detail: 'Decide whether this legend belongs to one player or a shared party.' },
  { eyebrow: 'Tone', title: 'Tune the world', detail: 'Give the DM a north star without locking the realm into one mood forever.' },
  { eyebrow: 'Scope', title: 'Set the arc', detail: 'Choose how much room the campaign should have to breathe, twist, and resolve.' },
  { eyebrow: 'Pillars', title: 'Pick the pressure', detail: 'Tell the DM what kind of play should show up most often at the table.' },
  { eyebrow: 'Party Gate', title: 'Plan the roster', detail: 'Choose whether to wait for characters, begin now, or leave room for companions later.' },
  { eyebrow: 'World Spark', title: 'Light the first scene', detail: 'Pick a seed or write the trouble you want the DM to build around.' },
  { eyebrow: 'Legend Name', title: 'Seal the campaign', detail: 'Name the timeline. After this, you will review the brief and create your character.' },
]

const TONE_CARDS: { label: ToneChoice; description: string }[] = [
  { label: 'Perilous & Grounded', description: 'Danger, hard choices, and consequences without forcing the world into constant grimdark.' },
  { label: 'Heroic & Epic', description: 'Rising heroes, impossible odds, clear purpose, legendary deeds, and a world worth saving.' },
  { label: 'Mystery & Intrigue', description: 'Secrets, conspiracies, double meanings, false friends, and truths buried in layers.' },
  { label: 'Anything Goes', description: 'Let the DM surprise you with whatever best fits the opening spark.' },
]

const LENGTH_CARDS: { value: CampaignLength; label: string; description: string }[] = [
  { value: 'one_shot', label: 'One-Shot', description: 'A focused adventure with a sharp ending in one big session.' },
  { value: 'short', label: 'Short Adventure', description: 'A few sessions, fast reveals, and a compact villain arc.' },
  { value: 'medium', label: 'Medium Campaign', description: 'A full arc with room for twists, travel, growth, and hard choices.' },
  { value: 'long', label: 'Long Campaign', description: 'A slow-burn saga with factions, mysteries, rivals, and deep payoffs.' },
  { value: 'open_ended', label: 'Open-Ended Saga', description: 'A living world with no fixed finish until the story earns one.' },
]

const PILLARS: Pillar[] = [
  'Combat & Tactics',
  'Exploration & Discovery',
  'Roleplay & Social',
  'Puzzles & Mysteries',
  'All of it equally',
]

const PILLAR_DESCRIPTIONS: Record<Pillar, string> = {
  'Combat & Tactics': 'Danger, positioning, monsters, clever plans, and meaningful risk.',
  'Exploration & Discovery': 'Ruins, travel, hidden places, strange weather, and secrets in the world.',
  'Roleplay & Social': 'NPCs, factions, rivalries, bargains, reputation, and emotional choices.',
  'Puzzles & Mysteries': 'Clues, symbols, locked doors, conspiracies, and layered reveals.',
  'All of it equally': 'A balanced campaign where the DM rotates the spotlight between pillars.',
}

function ChoiceCard({
  selected,
  disabled,
  title,
  description,
  meta,
  actionLabel,
  onClick,
}: {
  selected?: boolean
  disabled?: boolean
  title: string
  description: string
  meta?: string
  actionLabel?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group min-h-[132px] border p-5 text-left transition-all duration-200 disabled:cursor-not-allowed"
      style={{
        borderColor: selected ? 'rgba(245,158,11,0.62)' : 'rgba(255,255,255,0.12)',
        background: disabled
          ? 'rgba(255,255,255,0.018)'
          : selected
            ? 'linear-gradient(135deg, rgba(245,158,11,0.13), rgba(34,211,238,0.06))'
            : 'rgba(0,0,0,0.38)',
        boxShadow: selected ? '0 0 42px rgba(245,158,11,0.1)' : 'none',
        opacity: disabled ? 0.52 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-fantasy text-xl text-parchment-100">{title}</p>
          {meta && <p className="mt-1 font-fantasy text-[10px] uppercase tracking-[0.2em] text-cyan-200/58">{meta}</p>}
        </div>
        <span
          className="shrink-0 border px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.16em]"
          style={{
            borderColor: selected ? 'rgba(245,158,11,0.44)' : 'rgba(255,255,255,0.08)',
            color: selected ? 'rgba(254,243,199,0.92)' : 'rgba(180,160,120,0.42)',
          }}
        >
          {disabled ? 'Soon' : selected ? 'Set' : actionLabel || 'Choose'}
        </span>
      </div>
      <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/66">{description}</p>
    </button>
  )
}

function suggestedCampaignName(state: WizardState) {
  if (state.campaignName.trim()) return state.campaignName
  if (state.selectedSeed) return state.selectedSeed.title
  return ''
}

export default function CampaignWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [seeds, setSeeds] = useState<StorySeedOption[]>(() => pickRandom4())
  const [state, setState] = useState<WizardState>({
    isCollaborative: false,
    partyIntent: 'solo_alone',
    campaignLength: 'medium',
    tone: null,
    pillars: [],
    playerCount: 1,
    targetPlayerCount: 1,
    waitForParty: false,
    selectedSeed: null,
    useCustomPremise: false,
    customPremise: '',
    campaignName: '',
  })

  const premise = state.useCustomPremise ? state.customPremise.trim() : state.selectedSeed?.premise
  const canProceed = [
    true,
    !!state.tone,
    true,
    state.pillars.length > 0,
    true,
    !!(state.selectedSeed || (state.useCustomPremise && state.customPremise.trim().length > 20)),
    !!state.campaignName.trim(),
  ]

  const summary = useMemo(() => [
    state.isCollaborative
      ? state.waitForParty ? `Collaborative party / wait for ${state.targetPlayerCount}` : 'Collaborative party / start now'
      : state.partyIntent === 'solo_ai_companions' ? 'Solo with companions' : 'Solo campaign',
    state.tone || 'Tone unset',
    LENGTH_CARDS.find(card => card.value === state.campaignLength)?.label || 'Medium Campaign',
    state.pillars.length ? state.pillars.join(', ') : 'Focus unset',
    state.useCustomPremise ? 'Custom premise' : state.selectedSeed?.title || 'Premise unset',
  ], [state])

  function animateTo(nextStep: number) {
    setVisible(false)
    window.setTimeout(() => {
      setStep(nextStep)
      setVisible(true)
    }, 180)
  }

  function togglePillar(pillar: Pillar) {
    setState(prev => {
      const has = prev.pillars.includes(pillar)
      if (pillar === 'All of it equally') return { ...prev, pillars: has ? [] : ['All of it equally'] }
      const withoutEqual = prev.pillars.filter(p => p !== 'All of it equally')
      return { ...prev, pillars: has ? withoutEqual.filter(p => p !== pillar) : [...withoutEqual, pillar] }
    })
  }

  function refreshSeeds() {
    setSeeds(pickRandom4(seeds.map(seed => seed.id)))
    setState(prev => ({ ...prev, selectedSeed: null }))
  }

  async function handleCreate() {
    if (!premise || !state.campaignName.trim()) return
    setCreating(true)
    setError('')
    try {
      const playerPreferences = {
        playMode: state.isCollaborative ? 'collaborative' as const : 'solo' as const,
        partyIntent: state.partyIntent,
        campaignLength: state.campaignLength,
        tone: state.tone || 'Anything Goes',
        artStyle: EVERREALM_ART_STYLE,
        favoritePillars: state.pillars,
        playerCount: state.playerCount,
        targetPlayerCount: state.targetPlayerCount,
        waitForParty: state.waitForParty,
        characterConcepts: [],
      }
      const { data } = await campaignApi.create(state.campaignName.trim(), premise, 'adventure', playerPreferences)
      navigate(`/campaign/${data.campaign.id}/brief`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create campaign. Try again.'
      setError(typeof msg === 'string' ? msg : 'Failed to create campaign.')
      setCreating(false)
    }
  }

  if (creating) {
    return <LoadingScreen mode="campaign" message="The Dungeon Master is building your first horizon." />
  }

  const content = [
    <div key="mode" className="grid gap-4 sm:grid-cols-2">
      <ChoiceCard
        selected={!state.isCollaborative}
        title="Solo Adventure"
        meta="One player"
        description="A campaign focused tightly on your character. The next step after the brief is character creation."
        actionLabel="Solo"
        onClick={() => setState(prev => ({
          ...prev,
          isCollaborative: false,
          partyIntent: 'solo_alone',
          playerCount: 1,
          targetPlayerCount: 1,
          waitForParty: false,
        }))}
      />
      <ChoiceCard
        selected={state.isCollaborative}
        title="Collaborative Party"
        meta="Shared timeline"
        description="Real players can join the same campaign, create characters, share scenes, and lock in party-aware turns."
        actionLabel="Party"
        onClick={() => setState(prev => ({
          ...prev,
          isCollaborative: true,
          partyIntent: 'collab_wait_for_party',
          playerCount: 2,
          targetPlayerCount: 2,
          waitForParty: true,
        }))}
      />
    </div>,

    <div key="tone" className="grid gap-4 sm:grid-cols-2">
      {TONE_CARDS.map(card => (
        <ChoiceCard
          key={card.label}
          selected={state.tone === card.label}
          title={card.label}
          meta="Story tone"
          description={card.description}
          actionLabel="Tune"
          onClick={() => setState(prev => ({ ...prev, tone: card.label }))}
        />
      ))}
    </div>,

    <div key="length" className="grid gap-3">
      {LENGTH_CARDS.map(card => (
        <ChoiceCard
          key={card.value}
          selected={state.campaignLength === card.value}
          title={card.label}
          meta="Pacing"
          description={card.description}
          actionLabel="Set Arc"
          onClick={() => setState(prev => ({ ...prev, campaignLength: card.value }))}
        />
      ))}
    </div>,

    <div key="pillars" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PILLARS.map(pillar => {
        const selected = state.pillars.includes(pillar)
        return (
          <button
            key={pillar}
            type="button"
            onClick={() => togglePillar(pillar)}
            className="min-h-[86px] border p-4 text-left transition-all"
            style={{
              borderColor: selected ? 'rgba(34,211,238,0.46)' : 'rgba(255,255,255,0.1)',
              background: selected ? 'rgba(34,211,238,0.08)' : 'rgba(0,0,0,0.34)',
            }}
          >
            <p className="font-fantasy text-base text-parchment-100">{pillar}</p>
            <p className="mt-2 font-serif text-xs leading-relaxed text-parchment-200/56">{PILLAR_DESCRIPTIONS[pillar]}</p>
            <p className="mt-3 font-fantasy text-[10px] uppercase tracking-[0.18em]" style={{ color: selected ? 'rgba(191,244,255,0.86)' : 'rgba(180,160,120,0.56)' }}>
              {selected ? 'Threaded in' : 'Available'}
            </p>
          </button>
        )
      })}
    </div>,

    <div key="party" className="grid gap-4">
      {state.isCollaborative ? (
        [
          { intent: 'collab_wait_for_party' as const, title: 'Wait for your partner', meta: '2 players', description: 'Create the campaign brief, generate an invite, then hold at the party gate until both characters exist.', playerCount: 2 as const, targetPlayerCount: 2 as const, waitForParty: true },
          { intent: 'collab_start_now' as const, title: 'Start now, invite later', meta: 'Host first', description: 'Create your character and begin. The invite stays ready so another player can join when they arrive.', playerCount: 1 as const, targetPlayerCount: 2 as const, waitForParty: false },
          { intent: 'collab_wait_for_party' as const, title: 'Wait for a larger party', meta: '3 players', description: 'Plan around three real players sharing spotlight, danger, scenes, and turn resolution.', playerCount: 3 as const, targetPlayerCount: 3 as const, waitForParty: true },
        ].map(option => (
          <ChoiceCard
            key={`${option.title}-${option.targetPlayerCount}`}
            selected={state.partyIntent === option.intent && state.targetPlayerCount === option.targetPlayerCount && state.waitForParty === option.waitForParty}
            title={option.title}
            meta={option.meta}
            description={option.description}
            actionLabel="Roster"
            onClick={() => setState(prev => ({
              ...prev,
              partyIntent: option.intent,
              playerCount: option.playerCount,
              targetPlayerCount: option.targetPlayerCount,
              waitForParty: option.waitForParty,
            }))}
          />
        ))
      ) : (
        <>
          <ChoiceCard
            selected={state.partyIntent === 'solo_alone'}
            title="Just me"
            meta="Focused solo"
            description="One human player, one lead character, and a world that reacts to your decisions."
            actionLabel="Focus"
            onClick={() => setState(prev => ({ ...prev, partyIntent: 'solo_alone', playerCount: 1, targetPlayerCount: 1, waitForParty: false }))}
          />
          <ChoiceCard
            disabled
            title="Me + AI companions"
            meta="Queued"
            description="Companions with goals, personalities, and relationships are planned after the core campaign flow."
            onClick={() => undefined}
          />
        </>
      )}
    </div>,

    <div key="premise" className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {!state.useCustomPremise && (
          <button type="button" onClick={refreshSeeds} className="border border-white/12 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-parchment-200/64 transition-all hover:border-cyan-200/36 hover:text-parchment-100">
            New Seeds
          </button>
        )}
        <button
          type="button"
          onClick={() => setState(prev => ({ ...prev, useCustomPremise: !prev.useCustomPremise, selectedSeed: null }))}
          className="border border-amber-300/36 bg-amber-300/8 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-amber-100 transition-all hover:border-amber-200"
        >
          {state.useCustomPremise ? 'Browse Seeds' : 'Write Premise'}
        </button>
      </div>

      {state.useCustomPremise ? (
        <div>
          <textarea
            value={state.customPremise}
            onChange={event => setState(prev => ({ ...prev, customPremise: event.target.value }))}
            className="min-h-[210px] w-full resize-none border border-cyan-200/18 bg-black/42 p-4 font-serif text-base leading-relaxed text-parchment-100 outline-none placeholder:text-parchment-200/32"
            placeholder="Describe the world, the conflict, the opening image, or the kind of trouble you want the DM to build around."
          />
          <p className="mt-2 font-serif text-xs italic text-parchment-200/44">
            {state.customPremise.trim().length < 20 ? 'Give the DM at least one strong sentence.' : `${state.customPremise.trim().length} characters. The DM has enough to begin.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {seeds.map(seed => {
            const selected = state.selectedSeed?.id === seed.id
            return (
              <button
                key={seed.id}
                type="button"
                onClick={() => setState(prev => ({
                  ...prev,
                  selectedSeed: seed,
                  campaignName: prev.campaignName.trim() ? prev.campaignName : seed.title,
                }))}
                className="border p-4 text-left transition-all"
                style={{
                  borderColor: selected ? 'rgba(245,158,11,0.56)' : 'rgba(255,255,255,0.1)',
                  background: selected ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.36)',
                }}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/12 bg-black/44 text-lg">{TONE_ICONS[seed.tone] || '?'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-fantasy text-xl text-parchment-100">{seed.title}</h3>
                      <span className="shrink-0 font-fantasy text-[10px] uppercase tracking-[0.16em] text-amber-100/70">{selected ? 'Opening Set' : seed.tone}</span>
                    </div>
                    <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/68">{seed.premise}</p>
                    <p className="mt-3 font-fantasy text-[10px] uppercase tracking-[0.18em] text-cyan-200/50">{seed.startingLocation}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>,

    <div key="name" className="mx-auto max-w-xl">
      <label className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/64">Campaign Name</label>
      <input
        type="text"
        value={suggestedCampaignName(state)}
        onChange={event => setState(prev => ({ ...prev, campaignName: event.target.value }))}
        onKeyDown={event => { if (event.key === 'Enter' && canProceed[6]) handleCreate() }}
        className="mt-3 w-full border border-amber-300/34 bg-black/44 px-4 py-4 font-fantasy text-2xl text-parchment-100 outline-none placeholder:text-parchment-200/28"
        placeholder={state.selectedSeed ? state.selectedSeed.title : 'Name your legend'}
        autoFocus
      />
      <div className="mt-4 border border-cyan-200/16 bg-cyan-300/[0.045] px-4 py-3">
        <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-cyan-200/64">What Happens Next</p>
        <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/68">
          The DM creates a campaign brief first. Then you create your character. {state.isCollaborative ? state.waitForParty ? 'After you copy the invite, the campaign can wait until the party is ready.' : 'Your invite remains available for the other player while you begin.' : 'No character questions are needed here because character creation comes next.'}
        </p>
      </div>
      {error && <p className="mt-4 border border-red-300/30 bg-red-500/10 px-4 py-3 font-serif text-sm text-red-100/82">{error}</p>}
      <button
        type="button"
        onClick={handleCreate}
        disabled={!canProceed[6]}
        className="mt-5 w-full border border-amber-300/46 bg-amber-300/12 px-5 py-4 font-fantasy text-xs uppercase tracking-[0.22em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {state.isCollaborative ? 'Create Campaign and Invite Party' : 'Create Campaign'}
      </button>
    </div>,
  ]

  return (
    <div className="min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
      <div className="fixed inset-0 pointer-events-none">
        <picture>
          <source media="(max-width: 767px)" srcSet="/media/everrealm-hero-mobile.png" />
          <img src="/media/everrealm-hero-desktop.png" alt="" className="h-full w-full object-cover opacity-[0.46]" />
        </picture>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.93)_0%,rgba(0,0,0,0.62)_52%,rgba(0,0,0,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,rgba(0,0,0,0.54)_58%,rgba(0,0,0,0.96)_100%)]" />
      </div>

      <header className="relative z-10 border-b border-parchment-100/22 bg-black/36 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-parchment-100/70 bg-black/28">
              <span className="font-fantasy text-xl text-amber-200">E</span>
            </div>
            <div>
              <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
              <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Campaign forge</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="border border-parchment-200/14 bg-black/22 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.2em] text-parchment-200/66 transition-all hover:border-amber-200/45 hover:text-parchment-100"
          >
            Hall
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1340px] gap-5 px-4 py-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-6 lg:py-7">
        <aside className="border border-parchment-100/28 bg-black/56 p-5 backdrop-blur-md">
          <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">New Legend</p>
          <h1 className="mt-2 font-fantasy text-4xl leading-none text-parchment-100">Campaign Forge</h1>
          <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/66">
            Build the table, tone, scope, and first spark. The DM turns these choices into a brief before character creation begins.
          </p>

          <div className="mt-7 space-y-2">
            {STEPS.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                disabled={index > step}
                onClick={() => animateTo(index)}
                className="flex w-full items-center justify-between border px-3 py-3 text-left transition-all disabled:cursor-not-allowed"
                style={{
                  borderColor: index === step ? 'rgba(245,158,11,0.52)' : 'rgba(255,255,255,0.08)',
                  background: index === step ? 'rgba(245,158,11,0.08)' : index < step ? 'rgba(34,211,238,0.05)' : 'rgba(255,255,255,0.018)',
                  opacity: index > step ? 0.48 : 1,
                }}
              >
                <span>
                  <span className="block font-fantasy text-[10px] uppercase tracking-[0.18em] text-parchment-200/48">{item.eyebrow}</span>
                  <span className="mt-1 block font-fantasy text-sm text-parchment-100">{item.title}</span>
                </span>
                <span className="font-fantasy text-[10px] text-amber-100/64">{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 border border-white/10 bg-white/[0.025] p-4">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/58">Current Build</p>
            <div className="mt-3 space-y-2">
              {summary.map(item => (
                <p key={item} className="truncate font-serif text-sm text-parchment-200/62">{item}</p>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-h-[680px] border border-parchment-100/34 bg-black/62 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.72)] backdrop-blur-md sm:p-7">
          <div className="mb-7 flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-cyan-200/62">{STEPS[step].eyebrow}</p>
              <h2 className="mt-2 font-fantasy text-4xl text-parchment-100">{STEPS[step].title}</h2>
              <p className="mt-3 max-w-2xl font-serif text-sm leading-relaxed text-parchment-200/62">{STEPS[step].detail}</p>
            </div>
            <div className="flex gap-1">
              {STEPS.map((_, index) => (
                <span
                  key={index}
                  className="h-1 w-10 border border-white/10"
                  style={{ background: index <= step ? 'rgba(245,158,11,0.72)' : 'rgba(255,255,255,0.08)' }}
                />
              ))}
            </div>
          </div>

          <div
            className="transition-all duration-200"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
            }}
          >
            {content[step]}
          </div>

          {step < STEPS.length - 1 && (
            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={step === 0 ? () => navigate('/dashboard') : () => animateTo(step - 1)}
                className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
              >
                {step === 0 ? 'Cancel' : 'Back'}
              </button>
              <button
                type="button"
                onClick={() => animateTo(step + 1)}
                disabled={!canProceed[step]}
                className="border border-amber-300/46 bg-amber-300/12 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Continue
              </button>
            </div>
          )}

          {step === STEPS.length - 1 && (
            <div className="mt-8 border-t border-white/10 pt-5">
              <button
                type="button"
                onClick={() => animateTo(step - 1)}
                className="border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
              >
                Back
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
