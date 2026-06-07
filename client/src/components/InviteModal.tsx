import { useEffect, useState } from 'react'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden border border-parchment-100/34 bg-black/88 shadow-[0_30px_130px_rgba(0,0,0,0.82)]">
        <img src="/media/loading/everrealm-portal-party.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.18]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.88),rgba(0,0,0,0.62),rgba(0,0,0,0.9))]" />

        <div className="relative z-10">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <p className="font-fantasy text-[10px] uppercase tracking-[0.3em] text-cyan-200/62">Party Gate</p>
              <h2 className="mt-2 font-fantasy text-3xl text-parchment-100">Invite to Party</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="border border-white/10 bg-white/[0.025] px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.16em] text-parchment-200/58 transition-all hover:border-amber-200/38 hover:text-parchment-100"
            >
              Close
            </button>
          </header>

          <div className="px-5 py-5">
            <p className="font-serif text-sm leading-relaxed text-parchment-200/68">
              Share this gate with Sun Mi to join <span className="text-amber-100">{campaignName}</span>. The link expires in 7 days.
            </p>

            {loading ? (
              <div className="mt-5 border border-white/10 bg-white/[0.025] p-4">
                <div className="h-3 w-3/4 animate-pulse bg-parchment-100/10" />
                <div className="mt-3 h-3 w-1/2 animate-pulse bg-parchment-100/8" />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1 border border-cyan-200/18 bg-cyan-200/[0.045] px-3 py-3 font-mono text-xs text-cyan-100/76">
                    <p className="truncate">{inviteUrl}</p>
                  </div>
                  <button
                    onClick={copyLink}
                    className={`shrink-0 border px-4 py-3 font-fantasy text-[10px] uppercase tracking-[0.18em] transition-all ${
                      copied
                        ? 'border-emerald-200/46 bg-emerald-300/12 text-emerald-100'
                        : 'border-amber-300/46 bg-amber-300/12 text-amber-100 hover:border-amber-200'
                    }`}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="border border-amber-200/22 bg-amber-300/[0.045] p-4 text-center">
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">Invite Code</p>
                  <p className="mt-2 font-fantasy text-3xl tracking-[0.2em] text-parchment-100">{inviteCode}</p>
                </div>

                <p className="text-center font-serif text-xs italic text-parchment-200/44">
                  The code can also be entered from the dashboard Party Gate.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full border border-white/12 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200/66 transition-all hover:border-white/24 hover:text-parchment-100"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
