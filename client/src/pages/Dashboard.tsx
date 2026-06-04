import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { campaignApi } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { audioManager } from '../lib/audio'
import type { Campaign, StorySeedOption } from '../../../shared/types'

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
  const [loadingSeeds, setLoadingSeeds] = useState(false)
  const [campaignError, setCampaignError] = useState('')

  useEffect(() => {
    audioManager.startAmbient()
    campaignApi.list().then(({ data }) => {
      setCampaigns(data.campaigns || [])
    }).finally(() => setLoading(false))
  }, [])

  function loadSeeds() {
    setSeeds([
      {
        id: 'seed-1',
        title: 'The Shattered Throne',
        premise: 'A king has been murdered and his throne sits empty. Five factions each claim the right to rule. The kingdom is weeks from civil war — and something ancient stirs beneath the capital, waiting for the chaos.',
        tone: 'Political intrigue and betrayal',
        startingLocation: 'Ashveil City',
      },
      {
        id: 'seed-2',
        title: 'The Bleaching',
        premise: 'Animals die without cause. Crops rot before harvest. Magic itself feels thin. Something is draining the life from the land, slowly, from somewhere deep in the northern wastes. No one who went to investigate has returned.',
        tone: 'Creeping dread and mystery',
        startingLocation: 'The village of Dunmore',
      },
      {
        id: 'seed-3',
        title: 'Oathbreakers',
        premise: 'The most powerful archmage in the world was found dead this morning. Every nation wants the killer found immediately. You were seen near the tower the night it happened. You have until dawn to prove your innocence — or flee.',
        tone: 'Tense investigation and survival',
        startingLocation: 'The city of Vareth',
      },
      {
        id: 'seed-4',
        title: 'The Last Gate',
        premise: 'A portal to the Abyss tore open thirty days ago. Demons poured through for a week — then went silent. The silence is worse. Something is organizing them. Something that does not want to be found until it is ready.',
        tone: 'Dark horror and desperate odds',
        startingLocation: 'Fort Ashenmere',
      },
    ])
  }

  async function createCampaign() {
    if (!selectedSeed || !campaignName.trim()) return
    setCreatingCampaign(true)
    setCampaignError('')
    try {
      const { data } = await campaignApi.create(campaignName, selectedSeed.premise)
      navigate(`/campaign/${data.campaign.id}/create-character`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create campaign. Try again.'
      setCampaignError(typeof msg === 'string' ? msg : 'Failed to create campaign.')
      setCreatingCampaign(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/')
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
            <button
              onClick={() => { setShowNewCampaign(true); loadSeeds() }}
              className="fantasy-btn text-xs"
            >
              + New Campaign
            </button>
          </div>

          {loading ? (
            <p className="text-slate-500 italic font-serif">Consulting the annals...</p>
          ) : campaigns.length === 0 ? (
            <div className="border border-slate-800 bg-slate-900/50 p-8 text-center">
              <p className="text-slate-500 font-serif italic mb-3">No campaigns yet. The realm awaits your tale.</p>
              <button onClick={() => { setShowNewCampaign(true); loadSeeds() }} className="fantasy-btn text-xs">
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
                    onClick={() => navigate(`/campaign/${campaign.id}/create-character`)}
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

            <div className="mb-5">
              <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-3">Select a Premise</h3>
              {loadingSeeds ? (
                <p className="text-slate-500 italic font-serif text-sm">The fates are weaving your destiny...</p>
              ) : (
                <div className="space-y-3">
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
            </div>

            {campaignError && (
              <div className="border border-ember-600 bg-ember-600/10 px-3 py-2 text-ember-400 text-sm mb-3">
                {campaignError}
              </div>
            )}

            {creatingCampaign && (
              <div className="text-center py-4">
                <p className="text-slate-400 font-serif italic text-sm animate-pulse">The AI is weaving your world... this may take 15-30 seconds.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowNewCampaign(false); setCampaignError('') }} className="fantasy-btn-secondary flex-1 text-xs" disabled={creatingCampaign}>
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={!selectedSeed || !campaignName.trim() || creatingCampaign}
                className="fantasy-btn flex-1 text-xs disabled:opacity-50"
              >
                {creatingCampaign ? 'Forging the World...' : 'Begin Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
