import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { campaignApi } from '../lib/api'
import type { Campaign } from '../../../shared/types'

export default function CampaignBrief() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [waitingForParty, setWaitingForParty] = useState(false)

  useEffect(() => {
    if (!campaignId) return
    campaignApi.get(campaignId)
      .then(({ data }) => {
        setCampaign(data.campaign)
        setTimeout(() => setRevealed(true), 500)
      })
      .catch(() => setError('Failed to load campaign.'))
      .finally(() => setLoading(false))
  }, [campaignId])

  function handleShare() {
    const url = window.location.origin
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleGenerateInvite() {
    if (!campaignId) return
    setInviteLoading(true)
    try {
      const { data } = await campaignApi.createInvite(campaignId)
      setInviteCode(data.invite?.invite_code || data.inviteCode || null)
    } catch {
      // ignore
    } finally {
      setInviteLoading(false)
    }
  }

  function handleCopyInvite() {
    if (!inviteCode) return
    const inviteUrl = `${window.location.origin}/join/${inviteCode}`
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setInviteCopied(true)
      setWaitingForParty(true)
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  // -------------------------------------------------------------------------
  // Loading / Error
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0d12' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{
          borderColor: 'rgba(200,146,42,0.25)',
          borderTopColor: '#c8922a',
        }} />
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0d12' }}>
        <div className="text-center">
          <p className="font-serif text-sm mb-4" style={{ color: '#e87a7a' }}>{error || 'Campaign not found.'}</p>
          <button onClick={() => navigate('/dashboard')} className="fantasy-btn text-xs">Return to Hall</button>
        </div>
      </div>
    )
  }

  const brief = campaign.world_bible?.campaignBrief
  const safeHaven = campaign.world_bible?.safeHaven

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen relative overflow-hidden text-parchment-100" style={{ background: '#0a0d12' }}>

      {/* Animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url('/assets/scenes/castle-gate.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            animation: 'subtlePulse 8s ease-in-out infinite',
          }}
        />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, rgba(10,13,18,0.6) 0%, rgba(10,13,18,0.85) 60%, #0a0d12 100%)',
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(120,50,20,0.2) 0%, transparent 65%)',
        }} />
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.18; }
        }
      `}</style>

      {/* Content */}
      <div
        className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16 transition-all duration-700"
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {/* Campaign name */}
        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-[0.25em] font-serif mb-3" style={{ color: 'rgba(200,146,42,0.5)' }}>
            Your Campaign
          </p>
          <h1 className="font-fantasy text-3xl sm:text-5xl text-parchment-200 leading-tight" style={{
            textShadow: '0 0 60px rgba(200,146,42,0.25)',
            letterSpacing: '0.04em',
          }}>
            {campaign.name}
          </h1>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(200,146,42,0.35))' }} />
          <div className="w-2 h-2 rotate-45" style={{ background: '#c8922a', opacity: 0.6 }} />
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(200,146,42,0.35))' }} />
        </div>

        {brief ? (
          <div className="space-y-8">
            {/* The Hook */}
            <div>
              <p className="text-xs uppercase tracking-widest mb-3 font-serif" style={{ color: 'rgba(200,146,42,0.55)', letterSpacing: '0.15em' }}>The Hook</p>
              <p className="font-serif text-xl italic leading-relaxed" style={{ color: '#e8d8b0' }}>
                "{brief.hook}"
              </p>
            </div>

            {/* Divider */}
            <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* Objective */}
            <div>
              <p className="text-xs uppercase tracking-widest mb-2 font-serif" style={{ color: 'rgba(200,146,42,0.55)', letterSpacing: '0.15em' }}>Your Objective</p>
              <p className="font-serif text-base leading-relaxed" style={{ color: 'rgba(210,195,165,0.9)' }}>{brief.objective}</p>
            </div>

            {/* Stakes */}
            <div>
              <p className="text-xs uppercase tracking-widest mb-2 font-serif" style={{ color: 'rgba(200,146,42,0.55)', letterSpacing: '0.15em' }}>The Stakes</p>
              <p className="font-serif text-base leading-relaxed" style={{ color: 'rgba(210,195,165,0.9)' }}>{brief.worldStakes}</p>
            </div>

            {/* Mystery */}
            <div className="p-4" style={{
              border: '1px solid rgba(200,146,42,0.2)',
              background: 'rgba(200,146,42,0.04)',
            }}>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5" style={{ color: 'rgba(200,146,42,0.7)' }}>?</span>
                <div>
                  <p className="text-xs uppercase tracking-widest mb-2 font-serif" style={{ color: 'rgba(200,146,42,0.55)', letterSpacing: '0.15em' }}>What you'll be trying to discover...</p>
                  <p className="font-serif text-base italic leading-relaxed" style={{ color: 'rgba(210,195,165,0.85)' }}>{brief.mysteryHint}</p>
                </div>
              </div>
            </div>

            {/* Where to Begin */}
            <div>
              <p className="text-xs uppercase tracking-widest mb-2 font-serif" style={{ color: 'rgba(200,146,42,0.55)', letterSpacing: '0.15em' }}>Where to Begin</p>
              <p className="font-serif text-base leading-relaxed" style={{ color: 'rgba(210,195,165,0.9)' }}>{brief.whereToStart}</p>
            </div>

            {/* Safe Haven */}
            {safeHaven && (
              <>
                <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div>
                  <p className="text-xs uppercase tracking-widest mb-2 font-serif" style={{ color: 'rgba(200,146,42,0.55)', letterSpacing: '0.15em' }}>Your Haven</p>
                  <p className="font-fantasy text-lg text-parchment-200 mb-1">{safeHaven.name}</p>
                  <p className="font-serif text-sm italic" style={{ color: 'rgba(180,160,120,0.7)' }}>{safeHaven.flavor}</p>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Fallback for old campaigns */
          <div className="text-center py-8">
            <p className="font-serif text-xl italic mb-3" style={{ color: '#e8d8b0' }}>
              "Your adventure awaits."
            </p>
            <p className="font-serif text-sm" style={{ color: 'rgba(180,160,120,0.6)' }}>
              {campaign.story_seed}
            </p>
          </div>
        )}

        {/* Decorative divider */}
        <div className="flex items-center gap-4 my-10">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(200,146,42,0.25))' }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: '#c8922a', opacity: 0.4 }} />
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(200,146,42,0.25))' }} />
        </div>

        {/* Invite Party section — shown for collaborative campaigns */}
        {campaign.world_bible?.playerPreferences?.playerCount && campaign.world_bible.playerPreferences.playerCount > 1 && (
          <div className="mb-8 p-5" style={{
            border: '1px solid rgba(200,146,42,0.2)',
            background: 'rgba(200,146,42,0.04)',
          }}>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-lg mt-0.5" style={{ color: 'rgba(200,146,42,0.7)' }}>⚔</span>
              <div>
                <h3 className="font-fantasy text-lg text-parchment-200 mb-1">Invite Your Party</h3>
                <p className="font-serif text-sm" style={{ color: 'rgba(180,160,120,0.6)' }}>
                  Share this link with your adventuring companions so they can join the campaign.
                </p>
              </div>
            </div>

            {!inviteCode ? (
              <button
                onClick={handleGenerateInvite}
                disabled={inviteLoading}
                className="w-full py-2.5 font-serif text-sm transition-all disabled:opacity-50"
                style={{
                  border: '1px solid rgba(200,146,42,0.35)',
                  color: '#e8c87a',
                  background: 'rgba(200,146,42,0.08)',
                }}
              >
                {inviteLoading ? 'Generating link...' : 'Generate Invite Link'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-3 py-2" style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <span className="flex-1 font-mono text-xs truncate" style={{ color: 'rgba(200,185,155,0.8)' }}>
                    {`${window.location.origin}/join/${inviteCode}`}
                  </span>
                  <button
                    onClick={handleCopyInvite}
                    className="shrink-0 font-serif text-xs px-3 py-1 transition-all"
                    style={{
                      border: '1px solid rgba(200,146,42,0.3)',
                      color: inviteCopied ? 'rgba(120,200,120,0.9)' : 'rgba(200,146,42,0.8)',
                    }}
                  >
                    {inviteCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>

                {waitingForParty && (
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c8922a', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      <span className="font-serif text-sm" style={{ color: 'rgba(200,146,42,0.7)' }}>Waiting for party...</span>
                    </div>
                    <button
                      onClick={() => navigate(`/campaign/${campaignId}/create-character`)}
                      className="font-serif text-xs px-3 py-1 transition-all"
                      style={{ color: 'rgba(180,160,120,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      Start Solo for now →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate(`/campaign/${campaignId}/create-character`)}
            className="w-full py-3.5 font-fantasy text-base transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(192,57,43,0.25), rgba(140,30,20,0.35))',
              border: '1px solid rgba(192,57,43,0.45)',
              color: '#e8b09a',
              letterSpacing: '0.04em',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(192,57,43,0.4), rgba(140,30,20,0.5))' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(192,57,43,0.25), rgba(140,30,20,0.35))' }}
          >
            Create Your Character
          </button>
          <button
            onClick={handleShare}
            className="w-full py-3.5 font-serif text-sm transition-all"
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              color: copied ? 'rgba(120,200,120,0.9)' : 'rgba(180,160,120,0.7)',
            }}
            onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}
          >
            {copied ? 'Link copied!' : 'Share & Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
