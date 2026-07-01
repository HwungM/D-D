import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
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
  const [partyMembers, setPartyMembers] = useState<Array<{
    userId: string
    username: string
    character: { id: string; name: string; class?: string; race?: string; is_alive?: boolean } | null
  }>>([])

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

  const playerPreferences = campaign?.world_bible?.playerPreferences
  const isCollaborative = playerPreferences?.playMode === 'collaborative' || ((playerPreferences?.playerCount || 1) > 1)
  const targetPlayerCount = playerPreferences?.targetPlayerCount || playerPreferences?.playerCount || (isCollaborative ? 2 : 1)
  const waitForParty = playerPreferences?.waitForParty !== false && targetPlayerCount > 1
  const readyCount = partyMembers.filter(member => member.character && member.character.is_alive !== false).length
  const waitingForParty = Boolean(inviteCode) && targetPlayerCount > 1 && partyMembers.length < targetPlayerCount

  useEffect(() => {
    if (!campaignId || !isCollaborative) return

    let cancelled = false
    async function loadParty() {
      try {
        const { data } = await campaignApi.getParty(campaignId!)
        if (!cancelled) setPartyMembers(data.members || [])
      } catch {
        if (!cancelled) setPartyMembers([])
      }
    }

    loadParty()
    const interval = window.setInterval(loadParty, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [campaignId, isCollaborative])

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
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  // -------------------------------------------------------------------------
  // Loading / Error
  // -------------------------------------------------------------------------
  if (loading) {
    return <LoadingScreen mode="opening" message="Reading the campaign brief." />
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0d12' }}>
        <div className="text-center">
          <p className="font-serif text-sm mb-4" style={{ color: '#e87a7a' }}>{error || 'Campaign not found.'}</p>
          <button onClick={() => navigate('/dashboard')} className="border border-amber-300/46 bg-amber-300/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.2em] text-amber-100 transition-all hover:border-amber-200">Return to Hall</button>
        </div>
      </div>
    )
  }

  const brief = campaign.world_bible?.campaignBrief
  const safeHaven = campaign.world_bible?.safeHaven
  const companions = campaign.world_state?.companions || []

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen relative overflow-hidden text-parchment-100" style={{ background: '#050607' }}>

      {/* Animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url('/media/everrealm-hero-desktop.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            animation: 'subtlePulse 8s ease-in-out infinite',
          }}
        />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(90deg, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.58) 52%, rgba(0,0,0,0.9) 100%), linear-gradient(to bottom, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.62) 60%, #050607 100%)',
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(120,50,20,0.2) 0%, transparent 65%)',
        }} />
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.36; }
          50% { opacity: 0.44; }
        }
      `}</style>

      <header className="relative z-10 border-b border-parchment-100/22 bg-black/36 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-parchment-100/70 bg-black/28">
              <span className="font-fantasy text-xl text-amber-200">E</span>
            </div>
            <div>
              <p className="font-fantasy text-xl uppercase tracking-[0.1em] text-parchment-100">The Everrealm</p>
              <p className="font-serif text-xs uppercase tracking-[0.22em] text-amber-200/54">Campaign brief</p>
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

      {/* Content */}
      <div
        className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 transition-all duration-700"
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        <section className="border border-parchment-100/34 bg-black/62 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.72)] backdrop-blur-md sm:p-8">
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

        {/* Starting companions - AI-controlled party members generated with the world */}
        {companions.length > 0 && (
          <div className="mb-8 p-5" style={{
            border: '1px solid rgba(34,211,238,0.2)',
            background: 'rgba(34,211,238,0.04)',
          }}>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-lg mt-0.5" style={{ color: 'rgba(34,211,238,0.7)' }}>*</span>
              <div>
                <h3 className="font-fantasy text-lg text-parchment-200 mb-1">Your Companions</h3>
                <p className="font-serif text-sm" style={{ color: 'rgba(180,160,120,0.6)' }}>
                  These allies are already waiting for you at the start of the saga.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {companions.map(companion => (
                <div key={companion.id} className="flex items-center justify-between gap-3 p-3" style={{
                  background: 'rgba(0,0,0,0.22)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div className="min-w-0">
                    <p className="font-fantasy text-base truncate" style={{ color: '#d4c5a0' }}>{companion.name}</p>
                    <p className="font-serif text-xs truncate" style={{ color: 'rgba(180,160,120,0.55)' }}>
                      Level {companion.level} {companion.race} {companion.class}
                    </p>
                    <p className="mt-1 font-serif text-xs italic" style={{ color: 'rgba(180,160,120,0.45)' }}>
                      {companion.abilities?.[0]?.description || 'Bonded to the party and ready for whatever comes.'}
                    </p>
                  </div>
                  <span className="shrink-0 font-serif text-xs" style={{ color: 'rgba(191,244,255,0.72)' }}>
                    {companion.hp}/{companion.max_hp} HP
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite Party section - shown for collaborative campaigns */}
        {isCollaborative && (
          <div className="mb-8 p-5" style={{
            border: '1px solid rgba(200,146,42,0.2)',
            background: 'rgba(200,146,42,0.04)',
          }}>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-lg mt-0.5" style={{ color: 'rgba(200,146,42,0.7)' }}>+</span>
              <div>
                <h3 className="font-fantasy text-lg text-parchment-200 mb-1">{waitForParty ? 'Gather Your Party' : 'Invite Your Party'}</h3>
                <p className="font-serif text-sm" style={{ color: 'rgba(180,160,120,0.6)' }}>
                  {waitForParty
                    ? 'Share the invite, watch the roster, then begin once everyone has a character.'
                    : 'You can start now and keep this invite ready for companions to join later.'}
                </p>
              </div>
            </div>

            <div className="mb-4 p-3" style={{
              background: 'rgba(0,0,0,0.22)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="font-serif text-xs uppercase tracking-widest" style={{ color: 'rgba(200,146,42,0.58)' }}>
                  Party Readiness
                </span>
                <span className="font-serif text-xs" style={{ color: readyCount >= targetPlayerCount ? 'rgba(120,200,120,0.85)' : 'rgba(180,160,120,0.62)' }}>
                  {readyCount}/{targetPlayerCount} ready
                </span>
              </div>
              <div className="space-y-2">
                {partyMembers.length > 0 ? partyMembers.map(member => (
                  <div key={member.userId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-serif truncate" style={{ color: '#d4c5a0' }}>{member.username}</p>
                      {member.character ? (
                        <p className="font-serif text-xs truncate" style={{ color: 'rgba(180,160,120,0.55)' }}>
                          {member.character.name}{member.character.race || member.character.class ? ` - ${[member.character.race, member.character.class].filter(Boolean).join(' ')}` : ''}
                        </p>
                      ) : (
                        <p className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.45)' }}>No character yet</p>
                      )}
                    </div>
                    <span className="shrink-0 font-serif text-xs" style={{ color: member.character ? 'rgba(120,200,120,0.82)' : 'rgba(200,146,42,0.62)' }}>
                      {member.character ? 'Ready' : 'Creating'}
                    </span>
                  </div>
                )) : (
                  <p className="font-serif text-sm italic" style={{ color: 'rgba(180,160,120,0.45)' }}>
                    Party roster will appear here once adventurers join.
                  </p>
                )}
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
                      Start Solo for now
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
        </section>
      </div>
    </div>
  )
}
