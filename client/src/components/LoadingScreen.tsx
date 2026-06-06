import { useEffect, useState, useRef } from 'react'
import EmberParticles from './EmberParticles'

const CAMPAIGN_TIPS = [
  { title: 'Every Choice Matters', body: 'The Dungeon Master remembers everything. An offhand remark to a tavern keeper may become crucial three acts later.' },
  { title: 'Death is Permanent', body: 'This world has no respawns. Fight wisely, negotiate when possible, and know when to run.' },
  { title: 'The World Breathes', body: 'Factions rise and fall while you adventure. Return to a city you ignored, and find it changed.' },
  { title: 'Party Up', body: 'Two adventurers can share a scene. Sometimes a problem needs two minds — and two swords.' },
  { title: 'Explore Everything', body: 'The most valuable secrets are never announced. Ask about the cracks in the wall. Inspect the old painting.' },
  { title: 'Your Reputation Precedes You', body: 'NPCs talk. Word of your deeds — heroic or terrible — will spread to places you\'ve never been.' },
  { title: 'The Dice are Honest', body: 'A failed roll isn\'t the end. It\'s a different story. The DM will weave failure into something interesting.' },
  { title: 'Multiclassing Unlocks at Level 5', body: 'Reach level 5 and a second path opens. A fighter who learned magic. A rogue who found faith. The choice is yours.' },
  { title: 'Loot Has History', body: 'A rusted dagger from a defeated bandit captain. A ring found in a dungeon. These items carry stories. Ask about them.' },
  { title: 'Rest When You Can', body: 'Exhausted adventurers make fatal mistakes. Push too far and you\'ll roll with disadvantage when it counts most.' },
]

const SLIDESHOW_IMAGES = [
  '/assets/scenes/tavern-interior.png',
  '/assets/scenes/dark-forest.png',
  '/assets/scenes/dungeon-corridor.png',
  '/assets/scenes/castle-throne-room.png',
  '/assets/scenes/mountain-pass.png',
]

interface LoadingScreenProps {
  mode?: 'campaign' | 'generic'
  message?: string
}

export default function LoadingScreen({ mode = 'generic', message }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * CAMPAIGN_TIPS.length))
  const [tipVisible, setTipVisible] = useState(true)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideVisible, setSlideVisible] = useState(true)
  const progressRef = useRef(0)

  // Simulate realistic progress: fast at start, slow near end, never quite 100
  useEffect(() => {
    const targets = [15, 30, 48, 62, 74, 83, 89, 94, 97]
    let targetIdx = 0
    const tick = setInterval(() => {
      if (targetIdx >= targets.length) return
      const target = targets[targetIdx]
      if (progressRef.current < target) {
        progressRef.current = Math.min(target, progressRef.current + (Math.random() * 2 + 0.5))
        setProgress(Math.floor(progressRef.current))
      } else {
        targetIdx++
      }
    }, 200)
    return () => clearInterval(tick)
  }, [])

  // Cycle tips every 5s
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

  // Cycle slideshow images every 3.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setSlideVisible(false)
      setTimeout(() => {
        setSlideIndex(i => (i + 1) % SLIDESHOW_IMAGES.length)
        setSlideVisible(true)
      }, 600)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  const tip = CAMPAIGN_TIPS[tipIndex]
  const isCampaign = mode === 'campaign'

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden">
      <EmberParticles />

      {/* Slideshow background */}
      <div className="absolute inset-0">
        <img
          key={slideIndex}
          src={SLIDESHOW_IMAGES[slideIndex]}
          alt=""
          className="w-full h-full object-cover"
          style={{
            opacity: slideVisible ? 0.18 : 0,
            transition: 'opacity 0.6s ease',
            filter: 'blur(2px) saturate(0.6)',
          }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        {/* Dark gradient over image */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, rgba(2,6,12,0.7) 0%, rgba(2,6,12,0.4) 50%, rgba(2,6,12,0.85) 100%)',
        }} />
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-8">

        {/* Crest / icon */}
        <div className="mb-8" style={{ animation: 'torchFlicker 2s ease-in-out infinite' }}>
          <div
            className="w-24 h-24 rounded-full border-2 border-ember-400/40 flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(192,57,43,0.35), 0 0 80px rgba(192,57,43,0.15)' }}
          >
            <span className="font-fantasy text-4xl text-ember-400/80">⚔</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="font-fantasy text-3xl md:text-4xl text-parchment-100 mb-2 text-center" style={{
          textShadow: '0 0 40px rgba(192,57,43,0.5)',
        }}>
          {isCampaign ? 'Forging Your World' : 'The Everrealm'}
        </h1>
        <p className="text-slate-500 font-serif italic text-sm mb-10 text-center">
          {message || (isCampaign ? 'The Dungeon Master is breathing life into your realm...' : 'Loading...')}
        </p>

        {/* Tip card */}
        <div
          className="max-w-lg w-full border border-slate-700 bg-slate-900/70 p-5 mb-10"
          style={{
            opacity: tipVisible ? 1 : 0,
            transform: tipVisible ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
          }}
        >
          <p className="text-xs uppercase tracking-widest text-ember-400/70 mb-1 font-sans">
            Dungeon Master's Tip
          </p>
          <h3 className="font-fantasy text-parchment-200 text-lg mb-1">{tip.title}</h3>
          <p className="text-slate-400 font-serif text-sm leading-relaxed">{tip.body}</p>
        </div>

        {/* Slide dots */}
        <div className="flex gap-2 mb-8">
          {CAMPAIGN_TIPS.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === tipIndex ? '20px' : '6px',
                height: '6px',
                background: i === tipIndex ? '#c0392b' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="relative z-10 px-0 pb-0">
        {/* Status text */}
        <div className="px-6 pb-2 flex items-center justify-between">
          <p className="text-slate-600 text-xs font-serif italic animate-pulse">
            {isCampaign
              ? progress < 40 ? 'Generating world history...'
              : progress < 65 ? 'Placing factions and secrets...'
              : progress < 85 ? 'Writing your opening scene...'
              : 'Almost ready...'
              : 'Loading...'}
          </p>
          <p className="text-slate-500 text-xs font-mono">{progress}%</p>
        </div>

        {/* Track */}
        <div className="w-full h-1 bg-slate-900">
          <div
            className="h-full transition-all duration-200"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #7f1d1d, #c0392b, #f97316)',
              boxShadow: '0 0 8px rgba(192,57,43,0.6)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
