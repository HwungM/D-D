import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { campaignApi, characterApi } from '../lib/api'
import { useAuthStore } from '../lib/store'

export default function JoinCampaign() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [inviteInfo, setInviteInfo] = useState<{
    campaigns: { name: string; story_seed: string };
    profiles: { username: string };
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
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 font-serif italic animate-pulse">Reading the summons...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <p className="text-ember-400 font-serif mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="fantasy-btn-secondary text-sm">
            Return to Landing
          </button>
        </div>
      </div>
    )
  }

  const campaign = inviteInfo?.campaigns
  const inviter = inviteInfo?.profiles

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div
          className="border p-8 text-center"
          style={{
            background: 'radial-gradient(ellipse at center, #0f1923 0%, #070d14 100%)',
            borderColor: 'rgba(192,57,43,0.4)',
            boxShadow: '0 0 40px rgba(192,57,43,0.15)',
          }}
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-full border border-ember-500/40 flex items-center justify-center" style={{ boxShadow: '0 0 20px rgba(192,57,43,0.3)' }}>
            <span className="font-fantasy text-2xl text-ember-400">⚔</span>
          </div>

          <h2 className="font-fantasy text-2xl text-parchment-200 mb-2">You've Been Called</h2>
          <p className="text-slate-400 font-serif text-sm mb-1">
            <span className="text-parchment-300">{inviter?.username}</span> invites you to join
          </p>
          <h3 className="font-fantasy text-xl text-ember-400 mb-3">{campaign?.name}</h3>
          <p className="text-slate-400 font-serif text-sm italic mb-8 leading-relaxed">
            "{campaign?.story_seed?.slice(0, 150)}..."
          </p>

          {!user ? (
            <div>
              <p className="text-slate-500 text-xs font-serif mb-4">
                You need to be logged in to join this campaign.
              </p>
              <button onClick={() => navigate(`/?redirect=/join/${code}`)} className="fantasy-btn w-full">
                Log In to Join
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button onClick={handleAccept} disabled={joining} className="fantasy-btn w-full disabled:opacity-50">
                {joining ? <span className="animate-pulse">Joining the party...</span> : 'Accept the Call'}
              </button>
              <button onClick={() => navigate('/dashboard')} className="fantasy-btn-secondary w-full text-xs">
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
