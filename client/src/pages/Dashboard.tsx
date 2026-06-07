import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { campaignApi, characterApi } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { audioManager } from '../lib/audio'
import LoadingScreen from '../components/LoadingScreen'
import type { Campaign, StorySeedOption } from '../../../shared/types'

const ALL_SEEDS: StorySeedOption[] = [
  {
    id: 'seed-1',
    title: 'The Shattered Throne',
    premise: 'A king has been murdered and his throne sits empty. Five factions each claim the right to rule. The kingdom is weeks from civil war, and something ancient stirs beneath the capital, waiting for the chaos.',
    tone: 'Political intrigue and betrayal',
    startingLocation: 'Ashveil City',
  },
  {
    id: 'seed-2',
    title: 'The Bleaching',
    premise: 'Animals die without cause. Crops rot before harvest. Magic itself feels thin. Something is draining the life from the land, slowly, from somewhere deep in the northern wastes.',
    tone: 'Creeping mystery',
    startingLocation: 'The village of Dunmore',
  },
  {
    id: 'seed-3',
    title: 'Oathbreakers',
    premise: 'The most powerful archmage in the world was found dead this morning. Every nation wants the killer found immediately. You were seen near the tower the night it happened.',
    tone: 'Tense investigation',
    startingLocation: 'The city of Vareth',
  },
  {
    id: 'seed-4',
    title: 'The Last Gate',
    premise: 'A portal tore open thirty days ago. Monsters poured through for a week, then went silent. The silence is worse. Something is organizing them.',
    tone: 'Desperate odds',
    startingLocation: 'Fort Ashenmere',
  },
  {
    id: 'seed-5',
    title: 'The Hollow Crown',
    premise: 'The young queen has not been seen in three days. The court pretends everything is normal. The guards pretend everything is normal. You are the only one who finds this strange.',
    tone: 'Paranoia and conspiracy',
    startingLocation: 'The Royal Capital',
  },
  {
    id: 'seed-6',
    title: 'Salt and Iron',
    premise: "The merchant guilds hired you to escort a shipment to a coastal fort. Simple work. Except the captain is lying, the cargo is not what they claimed, and the fort stopped answering ravens.",
    tone: 'Secrets and survival',
    startingLocation: 'The port of Thornhaven',
  },
  {
    id: 'seed-7',
    title: 'The Buried God',
    premise: 'Miners broke through into something old beneath the mountain. The dreams started the next night. Miners who went back down never came up.',
    tone: 'Cosmic temptation',
    startingLocation: 'The mining town of Greyfall',
  },
  {
    id: 'seed-8',
    title: 'Blood of the Compact',
    premise: "A century ago, seven heroes sealed away a great evil. The pact is breaking. The heroes' descendants are dying one by one, and you are one of them.",
    tone: 'Legacy and urgency',
    startingLocation: 'The Shrine of Ash',
  },
]

const SYSTEMS = [
  { name: 'Party', status: 'Invite-ready', accent: '#22c55e' },
  { name: 'Scene Art', status: 'Visual-aware', accent: '#22d3ee' },
  { name: 'Memory', status: 'Long campaign spine', accent: '#f59e0b' },
  { name: 'Maps', status: 'Queued next', accent: '#a78bfa' },
  { name: 'Inventory', status: 'Needs remodel', accent: '#f97316' },
]

const FEATURED_IMAGES = [
  '/media/loading/everrealm-crystal-party.png',
  '/media/loading/everrealm-portal-party.png',
  '/media/loading/everrealm-moonlit-party.png',
  '/media/loading/everrealm-storm-party.png',
  '/media/loading/everrealm-snow-ascent.png',
  '/media/loading/everrealm-eclipse-citadel.png',
]

const CARD_SCENES = [
  '/media/everrealm-hero-desktop.png',
  '/media/loading/everrealm-crystal-party.png',
  '/media/loading/everrealm-portal-party.png',
  '/media/loading/everrealm-moonlit-party.png',
  '/media/loading/everrealm-storm-party.png',
]

function pickRandom4(exclude: string[] = []): StorySeedOption[] {
  const pool = ALL_SEEDS.filter(seed => !exclude.includes(seed.id))
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 4)
}

function campaignDate(campaign: Campaign) {
  const date = campaign.updated_at || campaign.created_at
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getCampaignImage(campaign: Campaign) {
  const index = Math.abs(campaign.name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % CARD_SCENES.length
  return CARD_SCENES[index]
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [seeds, setSeeds] = useState<StorySeedOption[]>([])
  const [selectedSeed, setSelectedSeed] = useState<StorySeedOption | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [campaignError, setCampaignError] = useState('')
  const [useCustomPremise, setUseCustomPremise] = useState(false)
  const [customPremise, setCustomPremise] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joiningByCode, setJoiningByCode] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [continuingId, setContinuingId] = useState<string | null>(null)
  const [audioUnlocked, setAudioUnlocked] = useState(() =>
    localStorage.getItem('audioUnlocked') === '1' || localStorage.getItem('audio_music') === 'true'
  )

  const adventureCampaigns = useMemo(
    () => campaigns.filter(campaign => campaign.campaign_type !== 'testing'),
    [campaigns]
  )
  const testingCampaigns = useMemo(
    () => campaigns.filter(campaign => campaign.campaign_type === 'testing'),
    [campaigns]
  )
  const featuredCampaign = adventureCampaigns[0]
  const heroImage = featuredCampaign ? getCampaignImage(featuredCampaign) : '/media/everrealm-hero-desktop.png'
  const canCreate = Boolean(campaignName.trim() && (useCustomPremise ? customPremise.trim().length > 20 : selectedSeed))

  function unlockAudio() {
    audioManager.playDoorOpen()
    audioManager.startAmbient()
    audioManager.startGameplay()
    localStorage.setItem('audioUnlocked', '1')
    setAudioUnlocked(true)
  }

  useEffect(() => {
    audioManager.bindUiSounds()
  }, [])

  useEffect(() => {
    if (audioUnlocked) {
      audioManager.startAmbient()
      audioManager.startGameplay()
    }
  }, [audioUnlocked])

  useEffect(() => {
    campaignApi.list().then(({ data }) => {
      setCampaigns(data.campaigns || [])
    }).finally(() => setLoading(false))
  }, [])

  function refreshSeeds() {
    const currentIds = seeds.map(seed => seed.id)
    setSelectedSeed(null)
    setSeeds(pickRandom4(currentIds))
  }

  function openNewTestWorld() {
    setSeeds(pickRandom4())
    setSelectedSeed(null)
    setCampaignName('')
    setUseCustomPremise(false)
    setCustomPremise('')
    setCampaignError('')
    setShowNewCampaign(true)
    audioManager.playMagic()
  }

  async function createCampaign(type: 'adventure' | 'testing' = 'adventure') {
    const premise = useCustomPremise ? customPremise.trim() : selectedSeed?.premise
    if (!premise || !campaignName.trim()) return
    setCreatingCampaign(true)
    setCampaignError('')
    audioManager.playConfirm()
    try {
      const { data } = await campaignApi.create(campaignName, premise, type)
      navigate(`/campaign/${data.campaign.id}/create-character`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create campaign. Try again.'
      setCampaignError(typeof msg === 'string' ? msg : 'Failed to create campaign.')
      setCreatingCampaign(false)
    }
  }

  async function handleContinue(campaign: Campaign) {
    setContinuingId(campaign.id)
    audioManager.playDoorOpen()
    try {
      const { data } = await characterApi.listByCampaign(campaign.id)
      const chars = data.characters || []
      const alive = chars.find((character: { is_alive: boolean }) => character.is_alive)
      const character = alive || chars[chars.length - 1]
      if (character) {
        navigate(`/campaign/${campaign.id}/play/${character.id}`)
      } else {
        navigate(`/campaign/${campaign.id}/create-character`)
      }
    } finally {
      setContinuingId(null)
    }
  }

  async function deleteCampaign(id: string) {
    setDeletingId(id)
    try {
      await campaignApi.delete(id)
      setCampaigns(prev => prev.filter(campaign => campaign.id !== id))
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  async function joinByCode() {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setJoiningByCode(true)
    setJoinError('')
    audioManager.playMagic()
    try {
      const { data } = await campaignApi.acceptInvite(code)
      navigate(`/campaign/${data.campaign.id}/create-character`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setJoinError(msg || 'Invalid or expired invite code.')
      setJoiningByCode(false)
    }
  }

  function handleLogout() {
    audioManager.playPageTurn()
    logout()
    navigate('/')
  }

  if (creatingCampaign) {
    return <LoadingScreen mode="campaign" />
  }

  if (!audioUnlocked) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
        <picture className="absolute inset-0 block">
          <source media="(max-width: 767px)" srcSet="/media/everrealm-hero-mobile.png" />
          <img src="/media/everrealm-hero-desktop.png" alt="" className="h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 bg-black/68" />
        <button
          type="button"
          onClick={unlockAudio}
          className="relative z-10 flex min-h-screen w-full items-center justify-center px-6 text-center"
        >
          <span className="block">
            <span className="block font-fantasy text-[11px] uppercase tracking-[0.36em] text-amber-200/76">
              Sound and fire await
            </span>
            <span className="mt-4 block font-fantasy text-5xl uppercase tracking-[0.1em] text-parchment-100 md:text-7xl">
              The Everrealm
            </span>
            <span className="mx-auto mt-6 block h-12 w-12 border border-cyan-200/35 bg-cyan-200/8 shadow-[0_0_42px_rgba(34,211,238,0.24)]" />
            <span className="mt-6 block font-fantasy text-xs uppercase tracking-[0.26em] text-parchment-200/72">
              Enter the hall
            </span>
          </span>
        </button>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
      <div className="fixed inset-0 pointer-events-none">
        <picture className="absolute inset-0 block">
          <source media="(max-width: 767px)" srcSet="/media/everrealm-hero-mobile.png" />
          <img src={heroImage} alt="" className="h-full w-full object-cover opacity-[0.36] blur-[1px] scale-[1.02]" />
        </picture>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(20,184,166,0.16),transparent_34%),linear-gradient(90deg,rgba(5,6,7,0.92),rgba(5,6,7,0.66)_48%,rgba(5,6,7,0.92))]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/64 via-black/18 to-[#050607]" />
      </div>

      <Header userName={user?.username || 'Adventurer'} onLogout={handleLogout} />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="relative min-h-[330px] overflow-hidden border border-cyan-200/16 bg-black/42 shadow-[0_24px_120px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/58 to-black/28" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_24%,rgba(245,158,11,0.2),transparent_30%),radial-gradient(circle_at_76%_62%,rgba(34,211,238,0.16),transparent_34%)]" />

            <div className="relative z-10 flex min-h-[330px] max-w-2xl flex-col justify-end p-5 sm:p-7">
              <p className="font-fantasy text-[11px] uppercase tracking-[0.32em] text-cyan-200/78">
                Adventurer's Hall
              </p>
              <h1 className="mt-3 font-fantasy text-4xl uppercase tracking-[0.05em] text-parchment-100 sm:text-5xl">
                The next door is waiting.
              </h1>
              <p className="mt-4 max-w-xl font-serif text-base leading-relaxed text-parchment-200/78 sm:text-lg">
                Pick up the campaign, gather Sun Mi with an invite code, or spin up a test world without disturbing the real legend.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => featuredCampaign ? handleContinue(featuredCampaign) : navigate('/create-campaign')}
                  className="group border border-amber-300/46 bg-amber-300/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.22em] text-parchment-100 shadow-[0_0_36px_rgba(245,158,11,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-300/20"
                >
                  {featuredCampaign ? (continuingId === featuredCampaign.id ? 'Opening...' : 'Continue Latest') : 'Start a Campaign'}
                  <span className="ml-3 text-cyan-200 transition-transform duration-300 group-hover:translate-x-1">-&gt;</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/create-campaign')}
                  className="border border-cyan-200/28 bg-cyan-200/8 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.22em] text-cyan-100 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-100/70 hover:bg-cyan-200/14"
                >
                  New Legend
                </button>
              </div>
            </div>
          </div>

          <PartyGate
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            joinError={joinError}
            joiningByCode={joiningByCode}
            onJoin={joinByCode}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <SectionHeader
              label="Ongoing legends"
              title="Your Campaigns"
              actionLabel="New Campaign"
              onAction={() => navigate('/create-campaign')}
            />

            {loading ? (
              <LoadingShelf />
            ) : adventureCampaigns.length === 0 ? (
              <EmptyState onStart={() => navigate('/create-campaign')} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {adventureCampaigns.map(campaign => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onContinue={() => handleContinue(campaign)}
                    onDelete={() => setConfirmDeleteId(campaign.id)}
                    isContinuing={continuingId === campaign.id}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <WorldSystems />
            <DevShelf
              campaigns={testingCampaigns}
              onNew={openNewTestWorld}
              onContinue={handleContinue}
              onDelete={setConfirmDeleteId}
              continuingId={continuingId}
            />
          </aside>
        </section>
      </div>

      {confirmDeleteId && (
        <DeleteModal
          deleting={Boolean(deletingId)}
          onCancel={() => setConfirmDeleteId(null)}
          onDelete={() => deleteCampaign(confirmDeleteId)}
        />
      )}

      {showNewCampaign && (
        <TestWorldModal
          seeds={seeds}
          selectedSeed={selectedSeed}
          setSelectedSeed={setSelectedSeed}
          refreshSeeds={refreshSeeds}
          campaignName={campaignName}
          setCampaignName={setCampaignName}
          useCustomPremise={useCustomPremise}
          setUseCustomPremise={setUseCustomPremise}
          customPremise={customPremise}
          setCustomPremise={setCustomPremise}
          canCreate={canCreate}
          campaignError={campaignError}
          onCancel={() => {
            setShowNewCampaign(false)
            setCampaignError('')
          }}
          onCreate={() => createCampaign('testing')}
        />
      )}
    </main>
  )
}

function Header({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  return (
    <header className="relative z-20 border-b border-white/8 bg-black/58 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center border border-cyan-200/26 bg-cyan-200/8 shadow-[0_0_28px_rgba(34,211,238,0.16)]">
            <span className="font-fantasy text-xl text-amber-200">E</span>
          </div>
          <div>
            <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
            <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Living campaign hub</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-serif text-sm text-parchment-200/62 sm:inline">{userName}</span>
          <button
            type="button"
            onClick={onLogout}
            className="border border-parchment-200/14 bg-black/22 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.2em] text-parchment-200/66 transition-all duration-200 hover:border-amber-200/45 hover:text-parchment-100"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  )
}

function PartyGate({ joinCode, setJoinCode, joinError, joiningByCode, onJoin }: {
  joinCode: string
  setJoinCode: (value: string) => void
  joinError: string
  joiningByCode: boolean
  onJoin: () => void
}) {
  return (
    <section className="relative overflow-hidden border border-amber-200/18 bg-black/48 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400/0 via-amber-300/75 to-cyan-300/0" />
      <p className="font-fantasy text-[11px] uppercase tracking-[0.3em] text-amber-200/72">Party Gate</p>
      <h2 className="mt-3 font-fantasy text-3xl text-parchment-100">Join Sun Mi</h2>
      <p className="mt-3 font-serif text-sm leading-relaxed text-parchment-200/68">
        Enter the shared invite code and step into the same campaign timeline.
      </p>

      <div className="mt-6 flex gap-2">
        <input
          type="text"
          value={joinCode}
          onChange={event => {
            setJoinCode(event.target.value.toUpperCase())
          }}
          className="min-w-0 flex-1 border border-amber-200/24 bg-amber-200/[0.04] px-3 py-3 text-center font-mono text-lg uppercase tracking-[0.28em] text-amber-100 outline-none transition-colors focus:border-cyan-200/55"
          placeholder="--------"
          maxLength={8}
        />
        <button
          type="button"
          onClick={onJoin}
          disabled={joiningByCode || joinCode.trim().length < 6}
          className="border border-cyan-200/28 bg-cyan-200/9 px-4 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-cyan-100 transition-all duration-200 hover:border-cyan-100/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {joiningByCode ? '...' : 'Join'}
        </button>
      </div>

      {joinError && (
        <p className="mt-3 border border-red-400/25 bg-red-500/8 px-3 py-2 font-serif text-sm text-red-200">
          {joinError}
        </p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-2">
        {['Shared turns', 'Invite codes', 'Party memory'].map(label => (
          <div key={label} className="border border-white/8 bg-white/[0.03] px-3 py-3 text-center">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.16em] text-parchment-200/68">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionHeader({ label, title, actionLabel, onAction }: {
  label: string
  title: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/58">{label}</p>
        <h2 className="mt-1 font-fantasy text-3xl text-parchment-100">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 border border-amber-300/36 bg-amber-300/10 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.18em] text-amber-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200"
      >
        + {actionLabel}
      </button>
    </div>
  )
}

function CampaignCard({ campaign, onContinue, onDelete, isContinuing = false, isTesting = false }: {
  campaign: Campaign
  onContinue: () => void
  onDelete: () => void
  isContinuing?: boolean
  isTesting?: boolean
}) {
  const image = getCampaignImage(campaign)
  const currentLocation = campaign.world_state?.currentLocation || 'Unknown road'
  const scenePurpose = (campaign.world_state as { scenePurpose?: string } | undefined)?.scenePurpose || 'The DM is holding the next beat.'

  return (
    <article className="group relative min-h-[360px] overflow-hidden border border-white/10 bg-black/50 shadow-[0_18px_80px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-200/42 hover:shadow-[0_30px_110px_rgba(0,0,0,0.52)]">
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-48 transition-transform duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/64 to-black/12" />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300/0 via-amber-300/75 to-cyan-300/0 opacity-65" />

      <div className="relative z-10 flex min-h-[360px] flex-col p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="border border-white/12 bg-black/42 px-3 py-1 font-fantasy text-[10px] uppercase tracking-[0.18em] text-parchment-200/76">
            {isTesting ? 'Test World' : `Act ${campaign.act || 1}`}
          </span>
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onDelete()
            }}
            className="grid h-8 w-8 place-items-center border border-white/10 bg-black/36 font-serif text-parchment-200/42 transition-colors hover:border-red-300/40 hover:text-red-200"
            title="Delete campaign"
          >
            x
          </button>
        </div>

        <div className="mt-auto">
          <p className="font-serif text-xs uppercase tracking-[0.2em] text-cyan-200/62">{currentLocation}</p>
          <h3 className="mt-2 font-fantasy text-3xl leading-tight text-parchment-100">{campaign.name}</h3>
          <p
            className="mt-3 font-serif text-sm leading-relaxed text-parchment-200/72"
            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {scenePurpose || campaign.story_seed}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="font-serif text-xs text-parchment-200/46">Last changed {campaignDate(campaign)}</p>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                onContinue()
              }}
              disabled={isContinuing}
              className="border border-amber-300/38 bg-amber-300/12 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.18em] text-amber-100 transition-all duration-200 hover:border-amber-200 hover:bg-amber-300/18 disabled:opacity-50"
            >
              {isContinuing ? 'Opening...' : 'Enter'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function WorldSystems() {
  return (
    <section className="border border-cyan-200/14 bg-black/44 p-5 backdrop-blur-md">
      <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/58">World Engine</p>
      <h2 className="mt-2 font-fantasy text-2xl text-parchment-100">Living systems</h2>
      <div className="mt-5 space-y-3">
        {SYSTEMS.map(system => (
          <div key={system.name} className="flex items-center justify-between gap-3 border border-white/8 bg-white/[0.025] px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5" style={{ background: system.accent, boxShadow: `0 0 18px ${system.accent}` }} />
              <span className="font-fantasy text-sm uppercase tracking-[0.12em] text-parchment-100">{system.name}</span>
            </div>
            <span className="font-serif text-xs text-parchment-200/54">{system.status}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DevShelf({ campaigns, onNew, onContinue, onDelete, continuingId }: {
  campaigns: Campaign[]
  onNew: () => void
  onContinue: (campaign: Campaign) => void
  onDelete: (id: string) => void
  continuingId: string | null
}) {
  return (
    <section className="border border-violet-300/14 bg-violet-950/12 p-5 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-violet-200/52">Dev Shelf</p>
          <h2 className="mt-2 font-fantasy text-2xl text-parchment-100">Test Worlds</h2>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="border border-violet-200/26 bg-violet-300/9 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.14em] text-violet-100 transition-colors hover:border-violet-100/60"
        >
          + Test
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {campaigns.length === 0 ? (
          <p className="border border-white/8 bg-white/[0.025] px-3 py-4 font-serif text-sm italic text-parchment-200/44">
            No sandbox worlds yet.
          </p>
        ) : (
          campaigns.map(campaign => (
            <div key={campaign.id} className="flex items-center justify-between gap-3 border border-white/8 bg-black/28 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-fantasy text-sm text-parchment-100">{campaign.name}</p>
                <p className="font-serif text-xs text-violet-100/45">Act {campaign.act || 1}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onContinue(campaign)}
                  className="border border-violet-200/22 px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.12em] text-violet-100/72"
                >
                  {continuingId === campaign.id ? '...' : 'Open'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(campaign.id)}
                  className="border border-red-300/18 px-2 py-1 font-fantasy text-[10px] uppercase tracking-[0.12em] text-red-100/62"
                >
                  x
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function LoadingShelf() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {FEATURED_IMAGES.slice(0, 3).map((image, index) => (
        <div key={image} className="min-h-[300px] overflow-hidden border border-white/8 bg-black/44">
          <img src={image} alt="" className="h-full min-h-[300px] w-full object-cover opacity-30" />
          <div className="-mt-24 p-4">
            <div className="h-4 w-24 animate-pulse bg-parchment-200/12" style={{ animationDelay: `${index * 120}ms` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative min-h-[320px] overflow-hidden border border-cyan-200/14 bg-black/46 p-6 backdrop-blur-md">
      <img src="/media/loading/everrealm-portal-party.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.36]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/68 to-black/42" />
      <div className="relative z-10 max-w-lg">
        <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/64">Blank canvas</p>
        <h3 className="mt-4 font-fantasy text-4xl text-parchment-100">No campaign yet.</h3>
        <p className="mt-4 font-serif text-base leading-relaxed text-parchment-200/72">
          Start with a vibe, a party, and a first choice. The DM will build the rest into a world that can shift from strange, bright, heroic, eerie, or brutal as the story demands.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-7 border border-amber-300/42 bg-amber-300/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200"
        >
          Begin
        </button>
      </div>
    </section>
  )
}

function DeleteModal({ deleting, onCancel, onDelete }: {
  deleting: boolean
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/86 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md border border-red-300/34 bg-[#090b10] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.72)]">
        <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-red-200/62">Danger</p>
        <h3 className="mt-2 font-fantasy text-3xl text-parchment-100">Delete this campaign?</h3>
        <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-200/70">
          This removes the story, party state, characters, and world memory for this campaign.
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="border border-white/12 px-4 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/70">
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="border border-red-300/42 bg-red-500/12 px-4 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-red-100 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TestWorldModal({ seeds, selectedSeed, setSelectedSeed, refreshSeeds, campaignName, setCampaignName, useCustomPremise, setUseCustomPremise, customPremise, setCustomPremise, canCreate, campaignError, onCancel, onCreate }: {
  seeds: StorySeedOption[]
  selectedSeed: StorySeedOption | null
  setSelectedSeed: (seed: StorySeedOption | null) => void
  refreshSeeds: () => void
  campaignName: string
  setCampaignName: (name: string) => void
  useCustomPremise: boolean
  setUseCustomPremise: (value: boolean) => void
  customPremise: string
  setCustomPremise: (value: string) => void
  canCreate: boolean
  campaignError: string
  onCancel: () => void
  onCreate: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/88 p-4 backdrop-blur-sm">
      <section className="my-8 w-full max-w-3xl border border-violet-200/24 bg-[#080a10] shadow-[0_30px_130px_rgba(0,0,0,0.78)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-5">
          <div>
            <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-violet-200/62">Sandbox creator</p>
            <h2 className="mt-2 font-fantasy text-3xl text-parchment-100">New Test World</h2>
          </div>
          <button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center border border-white/10 text-parchment-200/54">
            x
          </button>
        </header>

        <div className="space-y-5 p-5">
          <label className="block">
            <span className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-amber-200/58">World Name</span>
            <input
              type="text"
              value={campaignName}
              onChange={event => setCampaignName(event.target.value)}
              className="mt-2 w-full border border-amber-200/22 bg-amber-200/[0.04] px-3 py-3 font-serif text-parchment-100 outline-none focus:border-cyan-200/50"
              placeholder="Name the sandbox..."
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-fantasy text-[10px] uppercase tracking-[0.22em] text-parchment-200/54">
              {useCustomPremise ? 'Custom premise' : 'Seed premise'}
            </p>
            <div className="flex gap-2">
              {!useCustomPremise && (
                <button type="button" onClick={refreshSeeds} className="border border-white/10 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.14em] text-parchment-200/64">
                  More
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setUseCustomPremise(!useCustomPremise)
                  setSelectedSeed(null)
                }}
                className="border border-violet-200/22 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.14em] text-violet-100/74"
              >
                {useCustomPremise ? 'Browse Seeds' : 'Write One'}
              </button>
            </div>
          </div>

          {useCustomPremise ? (
            <textarea
              value={customPremise}
              onChange={event => setCustomPremise(event.target.value)}
              className="min-h-[150px] w-full resize-none border border-violet-200/18 bg-violet-300/[0.04] px-3 py-3 font-serif text-sm leading-relaxed text-parchment-100 outline-none focus:border-cyan-200/42"
              placeholder="Describe the experiment, the opening scene, or the system you want to stress test."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {seeds.map(seed => (
                <button
                  key={seed.id}
                  type="button"
                  onClick={() => setSelectedSeed(seed)}
                  className={`min-h-[168px] border p-4 text-left transition-all duration-200 ${
                    selectedSeed?.id === seed.id
                      ? 'border-cyan-200/55 bg-cyan-200/9'
                      : 'border-white/9 bg-white/[0.025] hover:border-amber-200/32'
                  }`}
                >
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.18em] text-amber-200/58">{seed.tone}</p>
                  <h3 className="mt-2 font-fantasy text-xl text-parchment-100">{seed.title}</h3>
                  <p
                    className="mt-3 font-serif text-sm leading-relaxed text-parchment-200/68"
                    style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {seed.premise}
                  </p>
                  <p className="mt-3 font-serif text-xs uppercase tracking-[0.14em] text-cyan-200/48">{seed.startingLocation}</p>
                </button>
              ))}
            </div>
          )}

          {campaignError && (
            <p className="border border-red-300/24 bg-red-500/8 px-3 py-2 font-serif text-sm text-red-200">{campaignError}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={onCancel} className="border border-white/12 px-4 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66">
              Cancel
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate}
              className="border border-violet-200/34 bg-violet-300/10 px-4 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-violet-100 transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Test World
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
