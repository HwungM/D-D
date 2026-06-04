import { useState, useEffect } from 'react'
import { campaignApi } from '../lib/api'

interface InviteModalProps {
  campaignId: string
  campaignName: string
  onClose: () => void
}

export default function InviteModal({ campaignId, campaignName, onClose }: InviteModalProps) {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    campaignApi.createInvite(campaignId).then(({ data }) => {
      setInviteCode(data.invite.invite_code)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [campaignId])

  const inviteUrl = `${window.location.origin}/join/${inviteCode}`

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-fantasy text-lg text-parchment-200">Invite to Party</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
        </div>

        <p className="text-slate-400 font-serif text-sm mb-4">
          Send this link to <span className="text-parchment-300">Sun Mi</span> to join <span className="text-ember-400">{campaignName}</span>.
          The link expires in 7 days.
        </p>

        {loading ? (
          <div className="h-10 bg-slate-800 animate-pulse rounded" />
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 bg-slate-800 border border-slate-700 px-3 py-2 font-mono text-xs text-slate-300 overflow-hidden text-ellipsis whitespace-nowrap">
                {inviteUrl}
              </div>
              <button
                onClick={copyLink}
                className={`px-3 py-2 border text-xs font-serif transition-colors shrink-0 ${copied ? 'border-forest-500 text-forest-400 bg-forest-600/10' : 'border-ember-600 text-ember-400 hover:bg-ember-600/10'}`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div className="border border-slate-800 bg-slate-950 p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Invite Code</p>
              <p className="font-fantasy text-2xl text-parchment-200 tracking-widest">{inviteCode}</p>
            </div>

            <p className="text-xs text-slate-600 font-serif italic text-center">
              She can also enter this code on the dashboard under "Join Campaign"
            </p>
          </div>
        )}

        <button onClick={onClose} className="fantasy-btn-secondary w-full text-xs mt-4">
          Done
        </button>
      </div>
    </div>
  )
}
