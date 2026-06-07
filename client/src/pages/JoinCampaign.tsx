import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { campaignApi, characterApi } from '../lib/api'
import { useAuthStore } from '../lib/store'
import LoadingScreen from '../components/LoadingScreen'

export default function JoinCampaign() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [inviteInfo, setInviteInfo] = useState<{
    campaigns: { name: string; story_seed: string }
    profiles: { username: string }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) return
    campaignApi.getInvite(code).then(({ data }) => {
      setInviteInfo(data.invite)
    }).catch(() => {
      setError('This invite link is invalid or has expired.')
    }).finally(() => setLoading(false))
  }, [code])

  async function handleAccept() {
    if (!code) return
    if (!user) {
      navigate(`/?redirect=/join/${code}`)
      return
    }
    setJoining(true)
    try {
      const { data } = await campaignApi.acceptInvite(code)
      const campaignId = data.campaign.id
      try {
        const { data: characterData } = await characterApi.listByCampaign(campaignId)
        const existingCharacter = (characterData.characters || []).find((character: { is_alive?: boolean }) => character.is_alive !== false)
        if (existingCharacter?.id) {
          navigate(`/campaign/${campaignId}/play/${existingCharacter.id}`)
          return
        }
      } catch {
        // If character lookup fails, send them to character creation.
      }
      navigate(`/campaign/${campaignId}/create-character`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Failed to join campaign.')
      setJoining(false)
    }
  }

  if (loading) {
    return <LoadingScreen mode="party" message="Reading the shared invite." />
  }

  const campaign = inviteInfo?.campaigns
  const inviter = inviteInfo?.profiles

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
      <div className="absolute inset-0">
        <picture>
          <source media="(max-width: 767px)" srcSet="/media/everrealm-hero-mobile.png" />
          <img src="/media/loading/everrealm-portal-party.png" alt="" className="h-full w-full object-cover opacity-[0.58]" />
        </picture>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.58)_48%,rgba(0,0,0,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.24)_0%,rgba(0,0,0,0.5)_55%,rgba(0,0,0,0.95)_100%)]" />
      </div>

      <header className="relative z-10 border-b border-parchment-100/22 bg-black/36 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-parchment-100/70 bg-black/28">
              <span className="font-fantasy text-xl text-amber-200">E</span>
            </div>
            <div>
              <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
              <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Party gate</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="border border-parchment-200/14 bg-black/22 px-4 py-2 font-fantasy text-[10px] uppercase tracking-[0.2em] text-parchment-200/66 transition-all hover:border-amber-200/45 hover:text-parchment-100"
          >
            Home
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-73px)] max-w-[1180px] items-center gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-6">
        <section>
          <p className="font-fantasy text-[11px] uppercase tracking-[0.36em] text-amber-200/78">Shared Timeline</p>
          <h1 className="mt-4 font-fantasy text-5xl uppercase leading-[0.95] tracking-[0.08em] text-parchment-100 sm:text-6xl lg:text-7xl">
            Join the Party
          </h1>
          <p className="mt-5 max-w-2xl font-serif text-lg italic leading-relaxed text-parchment-200/74">
            Step into the same campaign thread, create your character, and let the world remember more than one fate.
          </p>
        </section>

        <aside className="border border-parchment-100/34 bg-black/62 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.72)] backdrop-blur-md">
          {error ? (
            <div className="text-center">
              <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-red-200/62">Invite Failed</p>
              <h2 className="mt-2 font-fantasy text-3xl text-parchment-100">The gate is closed.</h2>
              <p className="mt-4 font-serif text-sm leading-relaxed text-red-100/74">{error}</p>
              <button
                onClick={() => navigate('/')}
                className="mt-6 w-full border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
              >
                Return Home
              </button>
            </div>
          ) : (
            <>
              <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">Summons From</p>
              <h2 className="mt-2 font-fantasy text-3xl text-parchment-100">{inviter?.username || 'A party host'}</h2>

              <div className="mt-5 border border-amber-200/22 bg-amber-300/[0.045] p-4">
                <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">Campaign</p>
                <h3 className="mt-2 font-fantasy text-2xl text-parchment-100">{campaign?.name || 'Untitled legend'}</h3>
                <p className="mt-3 font-serif text-sm italic leading-relaxed text-parchment-200/66">
                  "{campaign?.story_seed ? `${campaign.story_seed.slice(0, 190)}${campaign.story_seed.length > 190 ? '...' : ''}` : 'A shared adventure waits beyond the gate.'}"
                </p>
              </div>

              {!user ? (
                <div className="mt-5">
                  <p className="font-serif text-sm leading-relaxed text-parchment-200/58">
                    Log in first. After joining, you will create your character for this party.
                  </p>
                  <button
                    onClick={() => navigate(`/?redirect=/join/${code}`)}
                    className="mt-5 w-full border border-amber-300/46 bg-amber-300/12 px-5 py-4 font-fantasy text-xs uppercase tracking-[0.22em] text-amber-100 transition-all hover:border-amber-200 disabled:opacity-45"
                  >
                    Log In to Join
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <button
                    onClick={handleAccept}
                    disabled={joining}
                    className="w-full border border-amber-300/46 bg-amber-300/12 px-5 py-4 font-fantasy text-xs uppercase tracking-[0.22em] text-amber-100 transition-all hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {joining ? <span className="animate-pulse">Joining the Party</span> : 'Accept and Create Character'}
                  </button>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="w-full border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
                  >
                    Decline
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
