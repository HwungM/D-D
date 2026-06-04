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
    premise: 'The merchant guilds hired you to escort a shipment to a coastal fort. Simple work. Except the ship\'s captain is lying, the cargo is not what they claimed, and the fort stopped responding to ravens two weeks ago.',
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
    premise: 'A century ago, seven heroes bound themselves in a pact with a death god to seal away a great evil. The pact is breaking. The heroes\' descendants are dying one by one — and you are one of them.',
    tone: 'Fate, legacy & urgency',
    startingLocation: 'The Shrine of Ash',
  },
  {
    id: 'seed-9',
    title: 'The Warlord\'s Road',
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

  function handleLogout() {
    logout()
    navigate('/')
  }

  const canCreate = campaignName.trim() && (useCustomPremise ? customPremise.trim().length > 20 : !!selectedSeed)

  if (creatingCampaign) {
    return <LoadingScreen mode="campaign" />
  }

  return (
    <div className="min-h-screen bg-slate-950 text-parchment-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-fantasy text-2xl text-parchment-200">Chronicles of the Fallen Age</h1>
          <p className="text-slate-500 text-sm font-serif">Welcome back, {user?.username || 'Adventurer'}</p>
        </div>
        <button onClick={handleLogout} className="fantasy-btn-secondary text-xs">
          Depart
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Campaigns */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-fantasy text-xl text-parchment-200">Your Campaigns</h2>
            <button onClick={openNewCampaign} className="fantasy-btn text-xs">
              + New Campaign
            </button>
          </div>

          {loading ? (
            <p className="text-slate-500 italic font-serif">Consulting the annals...</p>
          ) : campaigns.length === 0 ? (
            <div className="border border-slate-800 bg-slate-900/50 p-8 text-center">
              <p className="text-slate-500 font-serif italic mb-3">No campaigns yet. The realm awaits your tale.</p>
              <button onClick={openNewCampaign} className="fantasy-btn text-xs">
                Begin a Campaign
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="border border-slate-700 bg-slate-900 p-5 hover:border-slate-500 transition-colors">
                  <h3 className="font-fantasy text-lg text-parchment-200 mb-1">{campaign.name}</h3>
                  <p className="text-slate-400 text-sm font-serif mb-3 line-clamp-2">{campaign.story_seed}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Act {campaign.act}</span>
                    <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => handleContinue(campaign)}
                    className="fantasy-btn-secondary text-xs mt-3 w-full"
                  >
                    Continue
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-fantasy text-xl text-parchment-200">Choose Your Fate</h2>
              <button onClick={() => setShowNewCampaign(false)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>

            {/* Campaign Name */}
            <div className="mb-5">
              <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                className="fantasy-input w-full"
                placeholder="Name your legend..."
              />
            </div>

            {/* Premise toggle */}
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-400 flex-1">
                {useCustomPremise ? 'Write Your Own Premise' : 'Select a Premise'}
              </h3>
              {!useCustomPremise && (
                <button
                  onClick={refreshSeeds}
                  className="text-xs text-slate-500 hover:text-parchment-200 border border-slate-700 hover:border-slate-500 px-2 py-1 transition-colors"
                  title="Show different premises"
                >
                  ↻ Refresh
                </button>
              )}
              <button
                onClick={() => { setUseCustomPremise(!useCustomPremise); setSelectedSeed(null) }}
                className="text-xs text-ember-400 hover:text-ember-300 border border-ember-600/40 hover:border-ember-500 px-2 py-1 transition-colors"
              >
                {useCustomPremise ? '← Use suggestions' : '✎ Write my own'}
              </button>
            </div>

            {useCustomPremise ? (
              <div className="mb-5">
                <textarea
                  value={customPremise}
                  onChange={e => setCustomPremise(e.target.value)}
                  className="fantasy-input w-full h-36 resize-none text-sm font-serif"
                  placeholder="Describe the world, the conflict, the starting situation... The more vivid, the better the Dungeon Master will weave your tale."
                />
                <p className="text-slate-600 text-xs mt-1 font-serif italic">
                  {customPremise.length < 20 ? 'Write at least a sentence or two...' : `${customPremise.length} characters — looks good`}
                </p>
              </div>
            ) : (
              <div className="mb-5 space-y-3">
                {seeds.map((seed) => (
                  <div
                    key={seed.id}
                    onClick={() => setSelectedSeed(seed)}
                    className={`border p-4 cursor-pointer transition-colors ${selectedSeed?.id === seed.id ? 'border-ember-500 bg-ember-600/10' : 'border-slate-700 hover:border-slate-500'}`}
                  >
                    <h4 className="font-fantasy text-parchment-200 mb-1">{seed.title}</h4>
                    <p className="text-slate-300 text-sm font-serif mb-2">{seed.premise}</p>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Tone: {seed.tone}</span>
                      <span>Start: {seed.startingLocation}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {campaignError && (
              <div className="border border-ember-600 bg-ember-600/10 px-3 py-2 text-ember-400 text-sm mb-3">
                {campaignError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowNewCampaign(false); setCampaignError('') }} className="fantasy-btn-secondary flex-1 text-xs">
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={!canCreate}
                className="fantasy-btn flex-1 text-xs disabled:opacity-50"
              >
                Begin Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
