import { useEffect, useRef, useState } from 'react'

type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk'

interface SceneDisplayProps {
  imageUrl: string | null
  title?: string
  timeOfDay?: TimeOfDay
}

const TIME_TINTS: Record<TimeOfDay, string> = {
  day: 'transparent',
  night: 'rgba(10, 20, 60, 0.45)',
  dawn: 'rgba(200, 100, 40, 0.3)',
  dusk: 'rgba(140, 60, 20, 0.4)',
}

export default function SceneDisplay({ imageUrl, title, timeOfDay = 'day' }: SceneDisplayProps) {
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
    }, 600)
    return () => clearTimeout(t)
  }, [imageUrl, currentUrl])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect()
      const cx = (e.clientX - rect.left) / rect.width - 0.5
      const cy = (e.clientY - rect.top) / rect.height - 0.5
      setParallax({ x: cx * 10, y: cy * 6 })
    }
    el.addEventListener('mousemove', onMove)
    return () => el.removeEventListener('mousemove', onMove)
  }, [])

  const tint = TIME_TINTS[timeOfDay]

  if (!currentUrl && !nextUrl) {
    return (
      <div className="h-48 bg-slate-900 border-b border-slate-800 flex items-center justify-center shrink-0">
        <div className="text-center text-slate-700">
          <div className="text-4xl mb-2 animate-flicker">🕯</div>
          <p className="text-xs font-serif italic">The scene materializes in darkness...</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-48 relative overflow-hidden shrink-0 border-b border-slate-800">
      {/* Current image */}
      {currentUrl && (
        <div
          className="absolute inset-0"
          style={{
            opacity: fading ? 0 : 1,
            transition: 'opacity 0.6s ease-in-out',
          }}
        >
          <img
            src={currentUrl}
            alt="Current scene"
            className="w-full h-full object-cover"
            style={{
              transform: `translate(${parallax.x}px, ${parallax.y}px) scale(1.08)`,
              transition: 'transform 0.1s ease-out',
            }}
          />
        </div>
      )}

      {/* Next image crossfade */}
      {nextUrl && (
        <div
          className="absolute inset-0"
          style={{
            opacity: fading ? 1 : 0,
            transition: 'opacity 0.6s ease-in-out',
          }}
        >
          <img
            src={nextUrl}
            alt="Next scene"
            className="w-full h-full object-cover"
            style={{
              transform: `translate(${parallax.x}px, ${parallax.y}px) scale(1.08)`,
            }}
          />
        </div>
      )}

      {/* Time of day tint */}
      {tint !== 'transparent' && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: tint }} />
      )}

      {/* Vignette overlay — strong edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at center, transparent 35%, rgba(7,13,20,0.75) 100%),
            linear-gradient(to bottom, rgba(7,13,20,0.35) 0%, transparent 35%, rgba(7,13,20,0.85) 100%)
          `,
        }}
      />

      {/* Scene title — bottom-left, fantasy font */}
      {title && (
        <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-3">
          <div className="flex items-end gap-2">
            <div className="w-1 h-5 bg-ember-400 shrink-0 animate-flicker" />
            <p
              className="font-fantasy text-parchment-200 text-sm tracking-wide leading-tight"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.7)' }}
            >
              {title}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
