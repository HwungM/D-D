import { useEffect, useState, useCallback } from 'react'
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
    premise: 'A king has been murdered and his throne sits empty. Five factions each claim the right to rule. The kingdom is weeks from civil war — and something ancient stirs beneath the capital, waiting for the chaos.',
    tone: 'Political intrigue & betrayal',
    startingLocation: 'Ashveil City',
  },
  {
    id: 'seed-2',
    title: 'The Bleaching',
    premise: 'Animals die without cause. Crops rot before harvest. Magic itself feels thin. Something is draining the life from the land, slowly, from somewhere deep in the northern wastes. No one who went to investigate has returned.',
    tone: 'Creeping dread & mystery',
    startingLocation: 'The village of Dunmore',
  },
  {
    id: 'seed-3',
    title: 'Oathbreakers',
    premise: 'The most powerful archmage in the world was found dead this morning. Every nation wants the killer found immediately. You were seen near the tower the night it happened. You have until dawn to prove your innocence — or flee.',
    tone: 'Tense investigation & survival',
    startingLocation: 'The city of Vareth',
  },
  {
    id: 'seed-4',
    title: 'The Last Gate',
    premise: 'A portal to the Abyss tore open thirty days ago. Demons poured through for a week — then went silent. The silence is worse. Something is organizing them. Something that does not want to be found until it is ready.',
    tone: 'Dark horror & desperate odds',
    startingLocation: 'Fort Ashenmere',
  },
  {
    id: 'seed-5',
    title: 'The Hollow Crown',
    premise: 'The young queen has not been seen in three days. The court pretends everything is normal. The guards pretend everything is normal. The city pretends everything is normal. You are the only one who finds this strange.',
    tone: 'Paranoia & conspiracy',
    startingLocation: 'The Royal Capital',
  },
  {
    id: 'seed-6',
    title: 'Salt and Iron',
    premise: "The merchant guilds hired you to escort a shipment to a coastal fort. Simple work. Except the ship's captain is lying, the cargo is not what they claimed, and the fort stopped responding to ravens two weeks ago.",
    tone: 'Gritty survival & secrets',
    startingLocation: 'The port of Thornhaven',
  },
  {
    id: 'seed-7',
    title: 'The Buried God',
    premise: 'Miners broke through into something old beneath the mountain. The dreams started the next night. Miners who went back down never came up. Now the town hears the voice too — a deep voice, patient, promising everything.',
    tone: 'Cosmic horror & temptation',
    startingLocation: 'The mining town of Greyfall',
  },
  {
    id: 'seed-8',
    title: 'Blood of the Compact',
    premise: "A century ago, seven heroes bound themselves in a pact with a death god to seal away a great evil. The pact is breaking. The heroes' descendants are dying one by one — and you are one of them.",
    tone: 'Fate, legacy & urgency',
    startingLocation: 'The Shrine of Ash',
  },
  {
    id: 'seed-9',
    title: "The Warlord's Road",
    premise: 'An unstoppable warlord has united the eastern tribes and is marching west. You have been sent to assassinate them before they reach the mountain pass. You arrive and discover the warlord is twelve years old.',
    tone: 'Moral weight & war',
    startingLocation: 'The eastern border camp',
  },
  {
    id: 'seed-10',
    title: 'City of Masks',
    premise: 'In the floating city of Vel Soran, everyone wears a mask and no one speaks their real name. You came here to find someone. The problem is you\'ve forgotten who.',
    tone: 'Surreal mystery & identity',
    startingLocation: 'Vel Soran',
  },
  {
    id: 'seed-11',
    title: 'The Long Winter',
    premise: 'It has not stopped snowing for six months. The sun rises for three hours a day now. Refugees pour into the southern cities. Something ended the seasons — and it was not an accident.',
    tone: 'Survival & epic stakes',
    startingLocation: 'The city of Emberwall',
  },
  {
    id: 'seed-12',
    title: 'The Debt',
    premise: 'A powerful patron did you a great favor once. Now they have called in the debt. You owe them one task — no questions asked. The task: retrieve a box from a vault beneath the most heavily guarded city in the world.',
    tone: 'Heist & moral compromise',
    startingLocation: 'The city of Ironveil',
  },
]

const TONE_ICONS: Record<string, string> = {
  'Political intrigue & betrayal': '👑',
  'Creeping dread & mystery': '🌑',
  'Tense investigation & survival': '🕯',
  'Dark horror & desperate odds': '🩸',
  'Paranoia & conspiracy': '🎭',
  'Gritty survival & secrets': '⚓',
  'Cosmic horror & temptation': '🕳',
  'Fate, legacy & urgency': '⚔️',
  'Moral weight & war': '🏹',
  'Surreal mystery & identity': '🎭',
  'Survival & epic stakes': '❄️',
  'Heist & moral compromise': '🗝',
}

function pickRandom4(exclude: string[] = []): StorySeedOption[] {
  const pool = ALL_SEEDS.filter(s => !exclude.includes(s.id))
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 4)
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

  const startAudio = useCallback(() => { audioManager.startAmbient() }, [])

  useEffect(() => {
    audioManager.startAmbient()
    document.addEventListener('click', startAudio, { once: true })
    campaignApi.list().then(({ data }) => {
      setCampaigns(data.campaigns || [])
    }).finally(() => setLoading(false))
    return () => document.removeEventListener('click', startAudio)
  }, [startAudio])

  function openNewCampaign() {
    setSeeds(pickRandom4())
    setSelectedSeed(null)
    setCampaignName('')
    setUseCustomPremise(false)
    setCustomPremise('')
    setCampaignError('')
    setShowNewCampaign(true)
  }

  function refreshSeeds() {
    const currentIds = seeds.map(s => s.id)
    setSelectedSeed(null)
    setSeeds(pickRandom4(currentIds))
  }

  async function createCampaign() {
    const premise = useCustomPremise ? customPremise.trim() : selectedSeed?.premise
    if (!premise || !campaignName.trim()) return
    setCreatingCampaign(true)
    setCampaignError('')
    try {
      const { data } = await campaignApi.create(campaignName, premise)
      navigate(`/campaign/${data.campaign.id}/create-character`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create campaign. Try again.'
      setCampaignError(typeof msg === 'string' ? msg : 'Failed to create campaign.')
      setCreatingCampaign(false)
    }
  }

  async function handleContinue(campaign: Campaign) {
    try {
      const { data } = await characterApi.listByCampaign(campaign.id)
      const chars = data.characters || []
      const alive = chars.find((c: { is_alive: boolean }) => c.is_alive)
      const char = alive || chars[chars.length - 1]
      if (char) {
        navigate(`/campaign/${campaign.id}/play/${char.id}`)
      } else {
        navigate(`/campaign/${campaign.id}/create-character`)
      }
    } catch {
      navigate(`/campaign/${campaign.id}/create-character`)
    }
  }

  async function deleteCampaign(id: string) {
    setDeletingId(id)
    try {
      await campaignApi.delete(id)
      setCampaigns(prev => prev.filter(c => c.id !== id))
    } catch {
      // silently fail
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
    logout()
    navigate('/')
  }

  const canCreate = campaignName.trim() && (useCustomPremise ? customPremise.trim().length > 20 : !!selectedSeed)

  if (creatingCampaign) {
    return <LoadingScreen mode="campaign" />
  }

  return (
    <div className="min-h-screen text-parchment-100 relative" style={{ background: '#0a0d12' }}>
      {/* Background atmospheric layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `url('/assets/scenes/tavern.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          opacity: 0.07,
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(120,50,20,0.15) 0%, transparent 60%)',
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-64" style={{
          background: 'linear-gradient(to top, #0a0d12, transparent)',
        }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-5 flex items-center justify-between" style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(10,13,18,0.8)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 flex items-center justify-center" style={{
            color: '#c8922a',
            filter: 'drop-shadow(0 0 8px rgba(200,146,42,0.5))',
          }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <path d="M12 2L14.5 8.5H21L15.7 12.6L17.9 19.5L12 15.5L6.1 19.5L8.3 12.6L3 8.5H9.5L12 2Z"/>
            </svg>
          </div>
          <div>
            <h1 className="font-fantasy text-xl text-parchment-200 leading-none" style={{ letterSpacing: '0.05em' }}>Chronicles of the Fallen Age</h1>
            <p className="text-xs font-serif mt-0.5" style={{ color: 'rgba(200,146,42,0.6)', letterSpacing: '0.12em' }}>ADVENTURER'S HALL</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-serif" style={{ color: 'rgba(180,160,120,0.5)' }}>{user?.username || 'Adventurer'}</span>
          <button onClick={handleLogout} className="text-xs font-serif px-3 py-1.5 transition-all" style={{
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(180,160,120,0.6)',
          }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'rgba(180,160,120,0.3)'; (e.target as HTMLElement).style.color = 'rgba(220,200,160,0.9)' }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.target as HTMLElement).style.color = 'rgba(180,160,120,0.6)' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-10">

        {/* Your Campaigns */}
        <section className="mb-14">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-fantasy text-2xl text-parchment-200">Your Campaigns</h2>
              <p className="text-xs font-serif mt-1" style={{ color: 'rgba(180,160,120,0.5)', letterSpacing: '0.1em' }}>ONGOING LEGENDS</p>
            </div>
            <button
              onClick={openNewCampaign}
              className="flex items-center gap-2 px-4 py-2 font-serif text-sm transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(192,57,43,0.2), rgba(120,30,20,0.3))',
                border: '1px solid rgba(192,57,43,0.4)',
                color: '#e8b89a',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(140,40,25,0.4))' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(192,57,43,0.2), rgba(120,30,20,0.3))' }}
            >
              <span style={{ color: '#e8855a' }}>+</span> New Campaign
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-8" style={{ color: 'rgba(180,160,120,0.4)' }}>
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(200,146,42,0.3)', borderTopColor: 'rgba(200,146,42,0.8)' }} />
              <span className="text-sm font-serif italic">Consulting the annals...</span>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-16 text-center" style={{
              border: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div className="text-4xl mb-4 opacity-30">⚔</div>
              <p className="font-serif italic text-sm mb-4" style={{ color: 'rgba(180,160,120,0.5)' }}>No campaigns yet. The realm awaits your tale.</p>
              <button onClick={openNewCampaign} className="fantasy-btn text-xs">Begin a Campaign</button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onContinue={() => handleContinue(campaign)}
                  onDelete={() => setConfirmDeleteId(campaign.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Join Campaign */}
        <section className="max-w-md">
          <div className="mb-4">
            <h2 className="font-fantasy text-xl text-parchment-200">Join a Party</h2>
            <p className="text-xs font-serif mt-1" style={{ color: 'rgba(180,160,120,0.5)', letterSpacing: '0.1em' }}>ENTER INVITE CODE</p>
          </div>
          <div style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: '20px' }}>
            <p className="text-xs font-serif italic mb-4" style={{ color: 'rgba(180,160,120,0.5)' }}>
              Your companion will share an 8-letter code from their game.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
                className="flex-1 bg-transparent font-mono text-center text-lg tracking-[0.3em] uppercase outline-none py-2 px-3"
                style={{
                  border: '1px solid rgba(200,146,42,0.25)',
                  color: '#e8c87a',
                  background: 'rgba(200,146,42,0.05)',
                }}
                placeholder="· · · · · · · ·"
                maxLength={8}
              />
              <button
                onClick={joinByCode}
                disabled={joiningByCode || joinCode.trim().length < 6}
                className="px-5 py-2 font-serif text-sm transition-all disabled:opacity-40"
                style={{
                  background: 'rgba(200,146,42,0.15)',
                  border: '1px solid rgba(200,146,42,0.3)',
                  color: '#e8c87a',
                }}
              >
                {joiningByCode ? '...' : 'Join'}
              </button>
            </div>
            {joinError && <p className="text-xs font-serif mt-2" style={{ color: '#e87a7a' }}>{joinError}</p>}
          </div>
        </section>
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div style={{ background: '#111318', border: '1px solid rgba(192,57,43,0.4)', padding: '28px', maxWidth: '380px', width: '100%' }}>
            <h3 className="font-fantasy text-lg text-parchment-200 mb-2">Destroy This Campaign?</h3>
            <p className="text-sm font-serif mb-6" style={{ color: 'rgba(180,160,120,0.7)' }}>
              All progress, characters, and story will be lost forever. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 text-sm font-serif transition-all"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(180,160,120,0.7)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteCampaign(confirmDeleteId)}
                disabled={!!deletingId}
                className="flex-1 py-2 text-sm font-serif transition-all disabled:opacity-50"
                style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid rgba(192,57,43,0.5)', color: '#e87a7a' }}
              >
                {deletingId ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.9)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{
            background: '#0e1118',
            border: '1px solid rgba(200,146,42,0.2)',
            boxShadow: '0 0 60px rgba(200,146,42,0.08)',
          }}>
            {/* Modal header */}
            <div className="flex justify-between items-center px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <h2 className="font-fantasy text-xl text-parchment-200">Begin a New Legend</h2>
                <p className="text-xs font-serif mt-1" style={{ color: 'rgba(200,146,42,0.5)', letterSpacing: '0.1em' }}>CHOOSE YOUR FATE</p>
              </div>
              <button onClick={() => setShowNewCampaign(false)} style={{ color: 'rgba(180,160,120,0.4)' }} className="text-xl hover:text-parchment-300 transition-colors">✕</button>
            </div>

            <div className="px-6 py-5">
              {/* Campaign name */}
              <div className="mb-6">
                <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(200,146,42,0.7)', letterSpacing: '0.12em' }}>Campaign Name</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  className="w-full bg-transparent outline-none py-2.5 px-3 font-serif text-parchment-200"
                  style={{ border: '1px solid rgba(200,146,42,0.25)', background: 'rgba(200,146,42,0.04)' }}
                  placeholder="Name your legend..."
                />
              </div>

              {/* Premise toggle */}
              <div className="flex items-center justify-between mb-4">
                <label className="text-xs uppercase tracking-widest" style={{ color: 'rgba(180,160,120,0.6)', letterSpacing: '0.12em' }}>
                  {useCustomPremise ? 'Write Your Premise' : 'Choose a Premise'}
                </label>
                <div className="flex gap-2">
                  {!useCustomPremise && (
                    <button
                      onClick={refreshSeeds}
                      className="text-xs font-serif px-2 py-1 transition-all"
                      style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(180,160,120,0.5)' }}
                    >
                      ↻ More
                    </button>
                  )}
                  <button
                    onClick={() => { setUseCustomPremise(!useCustomPremise); setSelectedSeed(null) }}
                    className="text-xs font-serif px-2 py-1 transition-all"
                    style={{ border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(220,130,100,0.8)' }}
                  >
                    {useCustomPremise ? '← Browse' : '✎ Write My Own'}
                  </button>
                </div>
              </div>

              {useCustomPremise ? (
                <div className="mb-6">
                  <textarea
                    value={customPremise}
                    onChange={e => setCustomPremise(e.target.value)}
                    className="w-full bg-transparent outline-none py-3 px-3 font-serif text-sm resize-none"
                    style={{ border: '1px solid rgba(200,146,42,0.2)', background: 'rgba(200,146,42,0.03)', minHeight: '140px', color: '#d4c5a0' }}
                    placeholder="Describe the world, the conflict, the opening scene... The Dungeon Master will weave your words into a living campaign."
                  />
                  <p className="text-xs font-serif mt-1.5" style={{ color: customPremise.length < 20 ? 'rgba(220,100,80,0.6)' : 'rgba(120,160,100,0.7)' }}>
                    {customPremise.length < 20 ? 'Write at least a sentence...' : `${customPremise.length} characters — the Dungeon Master is intrigued`}
                  </p>
                </div>
              ) : (
                <div className="mb-6 space-y-2.5">
                  {seeds.map((seed) => (
                    <button
                      key={seed.id}
                      onClick={() => setSelectedSeed(seed)}
                      className="w-full text-left p-4 transition-all"
                      style={selectedSeed?.id === seed.id
                        ? { background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.45)' }
                        : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }
                      }
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5 shrink-0">{TONE_ICONS[seed.tone] || '📜'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="font-fantasy text-base text-parchment-200">{seed.title}</h4>
                            {selectedSeed?.id === seed.id && (
                              <span className="text-xs shrink-0" style={{ color: 'rgba(192,57,43,0.9)' }}>Selected ✓</span>
                            )}
                          </div>
                          <p className="text-sm font-serif leading-relaxed mb-2" style={{ color: 'rgba(200,185,155,0.8)' }}>{seed.premise}</p>
                          <div className="flex gap-3 text-xs font-serif" style={{ color: 'rgba(150,140,110,0.6)' }}>
                            <span>{seed.tone}</span>
                            <span>·</span>
                            <span>{seed.startingLocation}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {campaignError && (
                <div className="px-3 py-2 mb-4 text-sm font-serif" style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#e87a7a' }}>
                  {campaignError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowNewCampaign(false); setCampaignError('') }}
                  className="flex-1 py-2.5 text-sm font-serif transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(180,160,120,0.6)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={createCampaign}
                  disabled={!canCreate}
                  className="flex-1 py-2.5 text-sm font-serif transition-all disabled:opacity-40"
                  style={{
                    background: canCreate ? 'linear-gradient(135deg, rgba(192,57,43,0.3), rgba(140,30,20,0.4))' : 'transparent',
                    border: '1px solid rgba(192,57,43,0.4)',
                    color: '#e8b09a',
                  }}
                >
                  Begin the Legend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CampaignCard({ campaign, onContinue, onDelete }: {
  campaign: Campaign
  onContinue: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const backgroundScenes: Record<number, string> = {
    1: '/assets/scenes/tavern.png',
    2: '/assets/scenes/forest-road.png',
    3: '/assets/scenes/dungeon-corridor.png',
    4: '/assets/scenes/castle-gate.png',
    5: '/assets/scenes/ancient-ruins.png',
  }
  const sceneIndex = (campaign.name.charCodeAt(0) % 5) + 1
  const bgScene = backgroundScenes[sceneIndex] || backgroundScenes[1]

  return (
    <div
      className="relative overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        border: hovered ? '1px solid rgba(200,146,42,0.35)' : '1px solid rgba(255,255,255,0.07)',
        background: '#0d1017',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 30px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.3)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Scene thumbnail */}
      <div className="h-28 relative overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-700"
          style={{
            backgroundImage: `url('${bgScene}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            opacity: 0.5,
          }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(13,16,23,0.2) 0%, rgba(13,16,23,0.7) 100%)' }} />
        <div className="absolute bottom-2 left-3 right-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full" style={{ background: '#16a34a', boxShadow: '0 0 4px #16a34a' }} />
            <span className="text-xs font-serif" style={{ color: 'rgba(180,230,180,0.7)', letterSpacing: '0.08em' }}>Act {campaign.act}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-fantasy text-base text-parchment-200 mb-1.5 leading-tight">{campaign.name}</h3>
        <p className="text-xs font-serif leading-relaxed mb-3 line-clamp-2" style={{ color: 'rgba(180,160,120,0.6)' }}>
          {campaign.story_seed}
        </p>
        <div className="flex items-center justify-between text-xs font-serif mb-3" style={{ color: 'rgba(150,140,110,0.5)' }}>
          <span>{new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); onContinue() }}
            className="flex-1 py-2 text-xs font-serif transition-all"
            style={{
              background: 'rgba(192,57,43,0.15)',
              border: '1px solid rgba(192,57,43,0.35)',
              color: '#e8a090',
            }}
          >
            Continue
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="px-3 py-2 text-xs font-serif transition-all"
            style={{
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(180,160,120,0.35)',
            }}
            title="Delete campaign"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
