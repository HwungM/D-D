import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { audioManager } from '../lib/audio'

const HARDCODED_PASSWORD = 'tavern2024'

const CHARACTERS = [
  {
    id: 'king',
    name: 'King',
    title: 'Realmwalker',
    description: 'Gather your party and step through the first door.',
  },
  {
    id: 'sunmi',
    name: 'Sun Mi',
    title: 'Fateweaver',
    description: 'Every choice leaves a thread for the realm to remember.',
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setSession, setUser } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showTrailer, setShowTrailer] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    audioManager.bindUiSounds()
  }, [])

  function handleWatchTrailer() {
    audioManager.playConfirm()
    setShowTrailer(true)
    setError('')
    window.setTimeout(() => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = 0
      video.muted = false
      void video.play().catch(() => {
        setError('The trailer is ready, but your browser blocked playback. Press play on the video.')
      })
    }, 0)
  }

  function handleCloseTrailer() {
    audioManager.playUiClick()
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setShowTrailer(false)
  }

  async function handleLogin(displayName: string) {
    setError('')
    setLoading(displayName)
    audioManager.playDoorOpen()
    audioManager.startGameplay()
    audioManager.startAmbient()

    const apiUsername = displayName.replace(/\s+/g, '').toLowerCase()
    const redirect = searchParams.get('redirect')
    const destination = redirect?.startsWith('/') ? redirect : '/dashboard'

    try {
      try {
        const { data } = await authApi.login(apiUsername, HARDCODED_PASSWORD)
        setSession(data.session)
        setUser({ ...data.user, username: displayName })
        navigate(destination)
        return
      } catch {
        // Create the private account on first entry.
      }

      try {
        const { data } = await authApi.register(apiUsername, HARDCODED_PASSWORD, apiUsername)
        setSession(data.session)
        setUser({ ...data.user, username: displayName })
        navigate(destination)
        return
      } catch {
        setError('Having trouble signing in. Ask King to check the server.')
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050607] text-parchment-100">
      <picture className="absolute inset-0 block">
        <source media="(max-width: 767px)" srcSet="/media/everrealm-hero-mobile.png" />
        <img
          src="/media/everrealm-hero-desktop.png"
          alt=""
          className="h-full w-full object-cover"
        />
      </picture>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,6,7,0.08)_0%,rgba(5,6,7,0.36)_58%,rgba(5,6,7,0.76)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/72 md:from-black/58 md:via-black/8 md:to-black/68" />
      <div className="absolute inset-x-0 top-0 h-[42vh] bg-gradient-to-b from-black/78 via-black/38 to-transparent" />

      <main className="relative z-10 flex min-h-screen flex-col items-center px-5 pb-8 pt-10 sm:px-8 md:pt-12">
        <section className="w-full max-w-5xl text-center">
          <p className="font-fantasy text-[11px] uppercase tracking-[0.34em] text-ember-300/80 md:text-xs">
            Enter the realm
          </p>
          <h1
            className="mt-3 font-fantasy text-5xl uppercase tracking-[0.08em] text-parchment-100 sm:text-6xl md:text-7xl"
            style={{ textShadow: '0 4px 22px rgba(0,0,0,0.9), 0 0 44px rgba(24,196,173,0.18)' }}
          >
            The Everrealm
          </h1>
          <p className="mx-auto mt-3 max-w-xl font-serif text-base italic text-parchment-200/82 md:text-lg">
            Gather your party. Let the world answer.
          </p>

          <button
            type="button"
            onClick={handleWatchTrailer}
            className="mt-7 border border-amber-300/45 bg-black/28 px-6 py-3 font-fantasy text-xs uppercase tracking-[0.24em] text-parchment-100 shadow-[0_0_32px_rgba(20,184,166,0.12)] backdrop-blur-sm transition-all duration-300 hover:border-amber-200 hover:bg-amber-300/12 hover:text-white"
          >
            Watch Trailer
          </button>
        </section>

        <section className="mt-auto w-full max-w-3xl pt-6 sm:pt-8 md:pt-10">
          <div className="grid gap-4 sm:grid-cols-2">
            {CHARACTERS.map((character) => (
              <button
                key={character.id}
                type="button"
                onClick={() => handleLogin(character.name)}
                disabled={loading !== null}
                className="group relative min-h-[154px] overflow-hidden border border-parchment-200/24 bg-black/42 px-5 py-5 text-left shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-200/70 hover:bg-black/54 disabled:cursor-wait disabled:opacity-70"
              >
                <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{
                  background: 'radial-gradient(circle at 50% 0%, rgba(20,184,166,0.14), transparent 62%), radial-gradient(circle at 20% 100%, rgba(245,158,11,0.14), transparent 55%)',
                }} />
                <div className="relative flex h-full flex-col">
                  <p className="font-fantasy text-[10px] uppercase tracking-[0.28em] text-amber-200/70">
                    Choose your soul
                  </p>
                  <div className="mt-5 flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-cyan-200/28 bg-slate-950/78 shadow-[0_0_36px_rgba(20,184,166,0.22)]">
                      <span className="font-fantasy text-2xl text-parchment-100/86">
                        {character.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <h2 className="font-fantasy text-3xl tracking-wide text-parchment-100">
                        {character.name}
                      </h2>
                      <p className="mt-1 font-serif text-xs uppercase tracking-[0.2em] text-amber-200/70">
                        {character.title}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 min-h-[40px] font-serif text-sm leading-relaxed text-parchment-200/74">
                    {character.description}
                  </p>
                  <div className="mt-4 border border-parchment-200/18 bg-parchment-200/[0.03] px-4 py-2 text-center transition-colors duration-300 group-hover:border-amber-200/55 group-hover:bg-amber-300/10">
                    <span className="font-fantasy text-[11px] uppercase tracking-[0.22em] text-parchment-200/76 group-hover:text-parchment-100">
                      {loading === character.name ? 'Entering...' : 'Enter'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div className="mx-auto mt-5 max-w-md border border-ember-500/70 bg-black/70 px-4 py-3 text-center font-serif text-sm text-ember-200 backdrop-blur">
              {error}
            </div>
          )}
        </section>
      </main>

      {showTrailer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            src="/media/dnd-game-intro.mp4"
            playsInline
            controls
            onEnded={handleCloseTrailer}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
          <button
            type="button"
            onClick={handleCloseTrailer}
            className="absolute right-5 top-5 border border-parchment-100/55 bg-black/50 px-4 py-2 font-fantasy text-xs uppercase tracking-[0.2em] text-parchment-100 transition-all duration-200 hover:bg-white/10"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  )
}
