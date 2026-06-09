import { useEffect, useState } from 'react'

type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk'

interface SceneDisplayProps {
  imageUrl: string | null
  location?: string
  timeOfDay?: TimeOfDay
  weather?: string
  scenePurpose?: string
  pacingMode?: string
  sceneSummary?: string
  partyHereNames?: string[]
  inCombat?: boolean
}

const TIME_TINTS: Record<TimeOfDay, string> = {
  day: 'transparent',
  night: 'rgba(10,20,60,0.50)',
  dawn: 'rgba(200,100,40,0.28)',
  dusk: 'rgba(120,50,15,0.38)',
}

const TIME_LABELS: Record<TimeOfDay, string> = {
  day: 'Day',
  night: 'Night',
  dawn: 'Dawn',
  dusk: 'Dusk',
}

function formatLabel(value?: string) {
  if (!value) return ''
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const FALLBACK_SCENE_URL = '/media/loading/everrealm-crystal-party.png'

function probeImage(url: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(url)
    img.onerror = () => resolve(FALLBACK_SCENE_URL)
    img.src = url
  })
}

export default function SceneDisplay({
  imageUrl,
  location,
  timeOfDay = 'day',
  weather,
  scenePurpose,
  pacingMode,
  sceneSummary,
  partyHereNames = [],
  inCombat,
}: SceneDisplayProps) {
  const rawUrl = imageUrl || FALLBACK_SCENE_URL
  const [displayUrl, setDisplayUrl] = useState(FALLBACK_SCENE_URL)
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null)
  const [incomingVisible, setIncomingVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    probeImage(rawUrl).then(verified => {
      if (cancelled) return
      if (verified === displayUrl || verified === incomingUrl) return
      setIncomingUrl(verified)
      setIncomingVisible(false)
      const showTimer = window.setTimeout(() => { if (!cancelled) setIncomingVisible(true) }, 30)
      const swapTimer = window.setTimeout(() => {
        if (cancelled) return
        setDisplayUrl(verified)
        setIncomingUrl(null)
        setIncomingVisible(false)
      }, 750)
      return () => { window.clearTimeout(showTimer); window.clearTimeout(swapTimer) }
    })
    return () => { cancelled = true }
  }, [rawUrl])

  const tint = TIME_TINTS[timeOfDay]

  return (
    <div className="h-full w-full relative overflow-hidden bg-black/60">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${displayUrl}")` }}
      />
      {incomingUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${incomingUrl}")`,
            opacity: incomingVisible ? 1 : 0,
            transition: 'opacity 0.7s ease-in-out',
          }}
        />
      )}

      {tint !== 'transparent' && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: tint, transition: 'background 2s ease' }} />
      )}

      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.78) 100%),
          linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 30%)
        `,
      }} />

      <div className="absolute top-0 left-0 right-0 z-10 p-3 pointer-events-none">
        <div className="flex flex-wrap gap-1.5">
          {inCombat && (
            <span className="font-serif text-[10px] uppercase px-2 py-1" style={{
              color: '#fca5a5',
              background: 'rgba(127,29,29,0.55)',
              border: '1px solid rgba(248,113,113,0.28)',
              letterSpacing: '0.08em',
            }}>
              Combat
            </span>
          )}
          {scenePurpose && (
            <span className="font-serif text-[10px] uppercase px-2 py-1" style={{
              color: 'rgba(232,212,168,0.82)',
              background: 'rgba(0,0,0,0.42)',
              border: '1px solid rgba(255,255,255,0.12)',
              letterSpacing: '0.08em',
            }}>
              {formatLabel(scenePurpose)}
            </span>
          )}
          {pacingMode && (
            <span className="font-serif text-[10px] uppercase px-2 py-1" style={{
              color: 'rgba(180,160,120,0.7)',
              background: 'rgba(0,0,0,0.42)',
              border: '1px solid rgba(255,255,255,0.08)',
              letterSpacing: '0.08em',
            }}>
              {formatLabel(pacingMode)}
            </span>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8 z-10" style={{
        background: 'linear-gradient(to top, rgba(6,8,13,0.95) 0%, transparent 100%)',
      }}>
        {location && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 shrink-0" style={{ background: 'rgba(192,57,43,0.7)', boxShadow: '0 0 6px rgba(192,57,43,0.5)' }} />
            <p className="font-fantasy text-3xl uppercase tracking-[0.06em]" style={{ color: '#f4ead2', textShadow: '0 1px 14px rgba(0,0,0,0.95)' }}>
              {location}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 ml-3 mb-2">
          {timeOfDay && (
            <p className="font-serif text-xs" style={{ color: 'rgba(180,160,120,0.62)' }}>
              {TIME_LABELS[timeOfDay]}
            </p>
          )}
          {weather && (
            <p className="font-serif text-xs truncate max-w-[210px]" style={{ color: 'rgba(180,160,120,0.62)' }}>
              {formatLabel(weather)}
            </p>
          )}
          {partyHereNames.length > 0 && (
            <p className="font-serif text-xs truncate max-w-[300px]" style={{ color: 'rgba(180,160,120,0.62)' }}>
              Present: {partyHereNames.join(', ')}
            </p>
          )}
        </div>
        {sceneSummary && (
          <p className="font-serif text-xs leading-relaxed ml-3" style={{
            color: 'rgba(232,212,168,0.78)',
            textShadow: '0 1px 8px rgba(0,0,0,0.9)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {sceneSummary}
          </p>
        )}
      </div>
    </div>
  )
}
