import { useEffect, useRef, useState } from 'react'
import EmberParticles from './EmberParticles'

const CAMPAIGN_TIPS = [
  { title: 'Every Choice Matters', body: 'The Game Master remembers everything. An offhand remark to a tavern keeper may become crucial three acts later.' },
  { title: 'Death is Permanent', body: 'This world has no respawns. Fight wisely, negotiate when possible, and know when to run.' },
  { title: 'The World Breathes', body: 'Factions rise and fall while you adventure. Return to a city you ignored, and find it changed.' },
  { title: 'Party Up', body: 'Two adventurers can share a scene. Sometimes a problem needs two minds, and two swords.' },
  { title: 'Explore Everything', body: 'The most valuable secrets are never announced. Ask about the cracks in the wall. Inspect the old painting.' },
  { title: 'Your Reputation Precedes You', body: 'NPCs talk. Word of your deeds, heroic or terrible, will spread to places you have never been.' },
  { title: 'The Dice are Honest', body: 'A failed roll is not the end. It is a different story. The DM will weave failure into something interesting.' },
  { title: 'Campaign Scope Matters', body: 'One-shots move fast. Long sagas let mysteries breathe. The world now paces itself around the legend you chose.' },
  { title: 'Loot Has History', body: 'A rusted dagger from a defeated captain. A ring found in a ruin. These items carry stories. Ask about them.' },
  { title: 'Rest When You Can', body: 'Exhausted adventurers make fatal mistakes. Push too far and you will roll with disadvantage when it counts most.' },
]

const SLIDESHOW_IMAGES = [
  '/media/loading/everrealm-crystal-party.png',
  '/media/loading/everrealm-portal-party.png',
  '/media/loading/everrealm-moonlit-party.png',
  '/media/loading/everrealm-storm-party.png',
  '/media/loading/everrealm-eclipse-citadel.png',
  '/media/loading/everrealm-snow-ascent.png',
]

interface LoadingScreenProps {
  mode?: 'campaign' | 'generic'
  message?: string
}

export default function LoadingScreen({ mode = 'generic', message }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * CAMPAIGN_TIPS.length))
  const [tipVisible, setTipVisible] = useState(true)
  const [slideIndex, setSlideIndex] = useState(() => Math.floor(Math.random() * SLIDESHOW_IMAGES.length))
  const [slideVisible, setSlideVisible] = useState(true)
  const progressRef = useRef(0)
  const isCampaign = mode === 'campaign'
  const tip = CAMPAIGN_TIPS[tipIndex]

  useEffect(() => {
    const targets = [15, 30, 48, 62, 74, 83, 89, 94, 97]
    let targetIdx = 0
    const tick = setInterval(() => {
      if (targetIdx >= targets.length) return
      const target = targets[targetIdx]
      if (progressRef.current < target) {
        progressRef.current = Math.min(target, progressRef.current + Math.random() * 2 + 0.5)
        setProgress(Math.floor(progressRef.current))
      } else {
        targetIdx++
      }
    }, 200)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(i => (i + 1) % CAMPAIGN_TIPS.length)
        setTipVisible(true)
      }, 500)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setSlideVisible(false)
      setTimeout(() => {
        setSlideIndex(i => (i + 1) % SLIDESHOW_IMAGES.length)
        setSlideVisible(true)
      }, 600)
    }, 4200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden">
      <EmberParticles />

      <div className="absolute inset-0">
        <img
          key={slideIndex}
          src={SLIDESHOW_IMAGES[slideIndex]}
          alt=""
          className="w-full h-full object-cover"
          style={{
            opacity: slideVisible ? (isCampaign ? 0.5 : 0.32) : 0,
            transition: 'opacity 0.6s ease',
            filter: 'saturate(0.95) contrast(1.05)',
          }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(90deg, rgba(2,6,12,0.92) 0%, rgba(2,6,12,0.58) 48%, rgba(2,6,12,0.88) 100%), linear-gradient(to bottom, rgba(2,6,12,0.5) 0%, rgba(2,6,12,0.18) 45%, rgba(2,6,12,0.93) 100%)',
        }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 sm:px-8">
        <div className="mb-8" style={{ animation: 'torchFlicker 2s ease-in-out infinite' }}>
          <div
            className="w-24 h-24 rounded-full border-2 border-ember-400/40 flex items-center justify-center bg-slate-950/35"
            style={{ boxShadow: '0 0 40px rgba(200,146,42,0.25), 0 0 80px rgba(192,57,43,0.12)' }}
          >
            <span className="font-fantasy text-4xl text-ember-400/80">E</span>
          </div>
        </div>

        <h1 className="font-fantasy text-3xl md:text-4xl text-parchment-100 mb-2 text-center" style={{
          textShadow: '0 0 40px rgba(192,57,43,0.45)',
        }}>
          {isCampaign ? 'Forging Your World' : 'The Everrealm'}
        </h1>
        <p className="text-slate-300/70 font-serif italic text-sm mb-10 text-center">
          {message || (isCampaign ? 'The Game Master is breathing life into your realm...' : 'Loading...')}
        </p>

        <div
          className="max-w-lg w-full border border-amber-600/20 bg-slate-950/70 p-5 mb-10"
          style={{
            opacity: tipVisible ? 1 : 0,
            transform: tipVisible ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
            boxShadow: '0 0 28px rgba(0,0,0,0.45)',
          }}
        >
          <p className="text-xs uppercase tracking-widest text-amber-300/65 mb-1 font-sans">
            Game Master's Tip
          </p>
          <h3 className="font-fantasy text-parchment-200 text-lg mb-1">{tip.title}</h3>
          <p className="text-slate-300/75 font-serif text-sm leading-relaxed">{tip.body}</p>
        </div>

        <div className="flex gap-2 mb-8">
          {SLIDESHOW_IMAGES.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === slideIndex ? '20px' : '6px',
                height: '6px',
                background: i === slideIndex ? '#c8922a' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 px-0 pb-0">
        <div className="px-6 pb-2 flex items-center justify-between">
          <p className="text-slate-400/70 text-xs font-serif italic animate-pulse">
            {isCampaign
              ? progress < 40 ? 'Sketching the first horizon...'
              : progress < 65 ? 'Placing factions and secrets...'
              : progress < 85 ? 'Threading choices into the opening scene...'
              : 'Almost ready...'
              : 'Loading...'}
          </p>
          <p className="text-slate-400/70 text-xs font-mono">{progress}%</p>
        </div>

        <div className="w-full h-1 bg-slate-900">
          <div
            className="h-full transition-all duration-200"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #7f1d1d, #c8922a, #f97316)',
              boxShadow: '0 0 8px rgba(200,146,42,0.6)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
