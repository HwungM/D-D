import { useEffect, useMemo, useRef, useState } from 'react'

const CAMPAIGN_TIPS = [
  { title: 'Every Choice Matters', body: 'The DM remembers small choices. A quick kindness, insult, bargain, or lie can echo three sessions later.' },
  { title: 'The World Breathes', body: 'Factions move while you adventure. Ignore a city long enough and it may become a different problem when you return.' },
  { title: 'Ask About Details', body: 'Secrets are rarely announced. Inspect murals, gossip with rivals, question strange weather, and test what looks ordinary.' },
  { title: 'Failure Still Moves', body: 'A failed roll is not a wall. It is a consequence, a cost, a complication, or a door opening in the wrong direction.' },
  { title: 'Reputation Travels', body: 'NPCs talk. Mercy, cruelty, fame, debt, and spectacle can reach places before your party does.' },
  { title: 'Loot Has History', body: 'A charm, map, blade, or ring may be more than equipment. Ask where it came from before you sell it.' },
]

const SLIDESHOW_IMAGES = [
  '/media/everrealm-hero-desktop.png',
  '/media/loading/everrealm-crystal-party.png',
  '/media/loading/everrealm-portal-party.png',
  '/media/loading/everrealm-moonlit-party.png',
  '/media/loading/everrealm-storm-party.png',
  '/media/loading/everrealm-eclipse-citadel.png',
  '/media/loading/everrealm-snow-ascent.png',
]

type LoadingMode = 'campaign' | 'opening' | 'action' | 'roll' | 'party' | 'generic'

const MODE_COPY: Record<LoadingMode, {
  eyebrow: string
  title: string
  fallback: string
  phases: string[]
}> = {
  campaign: {
    eyebrow: 'Campaign Forge',
    title: 'Forging Your World',
    fallback: 'The Dungeon Master is building your first horizon.',
    phases: ['Sketching the first horizon', 'Placing factions and secrets', 'Threading choices into the opening scene', 'Lighting the first door'],
  },
  opening: {
    eyebrow: 'Opening Scene',
    title: 'The First Door Opens',
    fallback: 'The realm is arranging your first step.',
    phases: ['Reading the campaign brief', 'Setting the first camera', 'Waking the world around you', 'Calling the party forward'],
  },
  action: {
    eyebrow: 'Resolving Action',
    title: 'The DM Weaves the Consequence',
    fallback: 'Your choice is moving through the world.',
    phases: ['Weighing intent', 'Checking the scene', 'Turning consequences', 'Writing the next beat'],
  },
  roll: {
    eyebrow: 'Dice in Motion',
    title: 'The Dice Decide',
    fallback: 'Fate is finding its number.',
    phases: ['Gathering modifiers', 'Listening to the dice', 'Reading the result', 'Making the result matter'],
  },
  party: {
    eyebrow: 'Party Gate',
    title: 'Waiting for the Party',
    fallback: 'The shared timeline is holding at the threshold.',
    phases: ['Watching the party gate', 'Syncing character threads', 'Holding the scene open', 'Keeping the fire warm'],
  },
  generic: {
    eyebrow: 'The Everrealm',
    title: 'The Realm Turns',
    fallback: 'Loading the living campaign.',
    phases: ['Opening the codex', 'Waking the map', 'Gathering the scene', 'Almost ready'],
  },
}

interface LoadingScreenProps {
  mode?: LoadingMode
  message?: string
}

export default function LoadingScreen({ mode = 'generic', message }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * CAMPAIGN_TIPS.length))
  const [tipVisible, setTipVisible] = useState(true)
  const [slideIndex, setSlideIndex] = useState(() => Math.floor(Math.random() * SLIDESHOW_IMAGES.length))
  const [slideVisible, setSlideVisible] = useState(true)
  const progressRef = useRef(0)
  const copy = MODE_COPY[mode]
  const tip = CAMPAIGN_TIPS[tipIndex]

  const currentPhase = useMemo(() => {
    const phaseIndex = Math.min(copy.phases.length - 1, Math.floor((progress / 100) * copy.phases.length))
    return copy.phases[phaseIndex]
  }, [copy.phases, progress])

  useEffect(() => {
    const targets = [12, 26, 41, 56, 69, 80, 88, 94, 97]
    let targetIndex = 0
    const tick = window.setInterval(() => {
      if (targetIndex >= targets.length) return
      const target = targets[targetIndex]
      if (progressRef.current < target) {
        progressRef.current = Math.min(target, progressRef.current + Math.random() * 1.7 + 0.45)
        setProgress(Math.floor(progressRef.current))
      } else {
        targetIndex += 1
      }
    }, 190)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTipVisible(false)
      window.setTimeout(() => {
        setTipIndex(i => (i + 1) % CAMPAIGN_TIPS.length)
        setTipVisible(true)
      }, 420)
    }, 5200)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSlideVisible(false)
      window.setTimeout(() => {
        setSlideIndex(i => (i + 1) % SLIDESHOW_IMAGES.length)
        setSlideVisible(true)
      }, 520)
    }, 4600)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#050607] text-parchment-100">
      <div className="absolute inset-0">
        <img
          key={slideIndex}
          src={SLIDESHOW_IMAGES[slideIndex]}
          alt=""
          className="h-full w-full object-cover transition-opacity duration-700"
          style={{
            opacity: slideVisible ? 0.85 : 0,
            filter: 'saturate(1.08) contrast(1.05) brightness(1.15)',
            transform: 'scale(1.025)',
          }}
          onError={e => { (e.currentTarget as HTMLImageElement).src = '/media/everrealm-hero-desktop.png' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.32)_48%,rgba(0,0,0,0.74)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.04)_42%,rgba(0,0,0,0.8)_100%)]" />
      </div>

      <main className="relative z-10 flex min-h-screen flex-col px-5 py-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-parchment-100/20 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-parchment-100/70 bg-black/28">
              <span className="font-fantasy text-xl text-amber-200">E</span>
            </div>
            <div>
              <p className="font-fantasy text-lg uppercase tracking-[0.12em] text-parchment-100 sm:text-xl">The Everrealm</p>
              <p className="font-serif text-[10px] uppercase tracking-[0.24em] text-amber-200/62 sm:text-xs">Living campaign</p>
            </div>
          </div>
          <p className="hidden font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/66 sm:block">
            {copy.eyebrow}
          </p>
        </header>

        <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-0">
          <div className="max-w-4xl">
            <p className="font-fantasy text-[11px] uppercase tracking-[0.34em] text-amber-200/78">
              {copy.eyebrow}
            </p>
            <h1 className="mt-4 font-fantasy text-5xl uppercase leading-[0.95] tracking-[0.08em] text-parchment-100 sm:text-6xl lg:text-7xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl font-serif text-lg italic leading-relaxed text-parchment-200/78">
              {message || copy.fallback}
            </p>
          </div>

          <aside className="border border-parchment-100/34 bg-black/56 p-5 shadow-[0_28px_120px_rgba(0,0,0,0.66)] backdrop-blur-md">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-cyan-200/62">Dungeon Master</p>
                <h2 className="mt-1 font-fantasy text-3xl text-parchment-100">Preparing</h2>
              </div>
              <span className="border border-amber-200/28 bg-amber-300/8 px-3 py-2 font-fantasy text-[10px] uppercase tracking-[0.18em] text-amber-100">
                {progress}%
              </span>
            </div>

            <div className="mb-5 border border-white/10 bg-white/[0.025] p-4">
              <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">Current Thread</p>
              <p className="mt-2 font-serif text-base text-parchment-100">{currentPhase}</p>
              <div className="mt-4 h-1 bg-white/8">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, rgba(34,211,238,0.8), rgba(245,158,11,0.95))',
                    boxShadow: '0 0 18px rgba(34,211,238,0.22)',
                  }}
                />
              </div>
            </div>

            <div
              className="min-h-[132px] border border-amber-200/20 bg-amber-300/[0.035] p-4 transition-all duration-500"
              style={{
                opacity: tipVisible ? 1 : 0,
                transform: tipVisible ? 'translateY(0)' : 'translateY(5px)',
              }}
            >
              <p className="font-fantasy text-[10px] uppercase tracking-[0.24em] text-amber-200/62">DM Note</p>
              <h3 className="mt-2 font-fantasy text-xl text-parchment-100">{tip.title}</h3>
              <p className="mt-2 font-serif text-sm leading-relaxed text-parchment-200/70">{tip.body}</p>
            </div>

            <div className="mt-5 flex gap-2">
              {SLIDESHOW_IMAGES.map((_, index) => (
                <span
                  key={index}
                  className="h-1 flex-1 border border-white/10 transition-all duration-300"
                  style={{
                    background: index === slideIndex ? 'rgba(245,158,11,0.75)' : 'rgba(255,255,255,0.08)',
                  }}
                />
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
