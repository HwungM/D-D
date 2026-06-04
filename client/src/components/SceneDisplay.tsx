import { useEffect, useRef, useState } from 'react'

type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk'

interface SceneDisplayProps {
  imageUrl: string | null
  location?: string
  timeOfDay?: TimeOfDay
}

const TIME_TINTS: Record<TimeOfDay, string> = {
  day:   'transparent',
  night: 'rgba(10,20,60,0.50)',
  dawn:  'rgba(200,100,40,0.28)',
  dusk:  'rgba(120,50,15,0.38)',
}

const TIME_LABELS: Record<TimeOfDay, string> = {
  day: '☀ Day', night: '🌙 Night', dawn: '🌅 Dawn', dusk: '🌇 Dusk',
}

export default function SceneDisplay({ imageUrl, location, timeOfDay = 'day' }: SceneDisplayProps) {
  const [currentUrl, setCurrentUrl] = useState(imageUrl)
  const [nextUrl, setNextUrl] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (imageUrl === currentUrl) return
    if (!imageUrl) { setCurrentUrl(null); return }
    setNextUrl(imageUrl)
    setFading(true)
    const t = setTimeout(() => {
      setCurrentUrl(imageUrl)
      setNextUrl(null)
      setFading(false)
    }, 700)
    return () => clearTimeout(t)
  }, [imageUrl, currentUrl])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect()
      const cx = (e.clientX - rect.left) / rect.width - 0.5
      const cy = (e.clientY - rect.top) / rect.height - 0.5
      setParallax({ x: cx * 14, y: cy * 8 })
    }
    el.addEventListener('mousemove', onMove)
    return () => el.removeEventListener('mousemove', onMove)
  }, [])

  const tint = TIME_TINTS[timeOfDay]

  if (!currentUrl && !nextUrl) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#06080d' }}>
        <div className="text-center" style={{ color: 'rgba(160,140,110,0.3)' }}>
          <div className="text-5xl mb-3" style={{ animation: 'torchFlicker 2s ease-in-out infinite' }}>🕯</div>
          <p className="font-serif text-sm italic">The scene materializes in darkness...</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      {/* Current image */}
      {currentUrl && (
        <div className="absolute inset-0" style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.7s ease-in-out' }}>
          <img
            src={currentUrl}
            alt="Scene"
            className="w-full h-full object-cover"
            style={{
              transform: `translate(${parallax.x}px, ${parallax.y}px) scale(1.1)`,
              transition: 'transform 0.12s ease-out',
            }}
          />
        </div>
      )}

      {/* Next image crossfade */}
      {nextUrl && (
        <div className="absolute inset-0" style={{ opacity: fading ? 1 : 0, transition: 'opacity 0.7s ease-in-out' }}>
          <img
            src={nextUrl}
            alt="Scene"
            className="w-full h-full object-cover"
            style={{ transform: `translate(${parallax.x}px, ${parallax.y}px) scale(1.1)` }}
          />
        </div>
      )}

      {/* Time-of-day tint */}
      {tint !== 'transparent' && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: tint, transition: 'background 2s ease' }} />
      )}

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(ellipse at center, transparent 30%, rgba(6,8,13,0.7) 100%),
          linear-gradient(to bottom, rgba(6,8,13,0.4) 0%, transparent 30%, transparent 60%, rgba(6,8,13,0.9) 100%),
          linear-gradient(to right, rgba(6,8,13,0.3) 0%, transparent 15%, transparent 100%)
        `,
      }} />

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8 z-10" style={{
        background: 'linear-gradient(to top, rgba(6,8,13,0.95) 0%, transparent 100%)',
      }}>
        {location && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 shrink-0" style={{ background: 'rgba(192,57,43,0.7)', boxShadow: '0 0 6px rgba(192,57,43,0.5)' }} />
            <p className="font-fantasy text-sm" style={{ color: '#e8d4a8', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
              {location}
            </p>
          </div>
        )}
        {timeOfDay && timeOfDay !== 'day' && (
          <p className="font-serif text-xs ml-3" style={{ color: 'rgba(160,140,110,0.5)' }}>
            {TIME_LABELS[timeOfDay]}
          </p>
        )}
      </div>
    </div>
  )
}
