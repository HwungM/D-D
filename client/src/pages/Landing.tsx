import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuthStore } from '../lib/store'
import EmberParticles from '../components/EmberParticles'
import { audioManager } from '../lib/audio'

const HARDCODED_PASSWORD = 'tavern2024'

const CHARACTERS = [
  { id: 'king', name: 'King', subtitle: 'The Warlord King', description: 'Conqueror of realms, keeper of an iron crown.' },
  { id: 'sunmi', name: 'Sun Mi', subtitle: 'The Shadow Weaver', description: 'Her past is a riddle only the dead remember.' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { setSession, setUser } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleLogin(displayName: string) {
    setError('')
    setLoading(displayName)
    audioManager.startGameplay()
    audioManager.startAmbient()
    // Sanitize: remove spaces, lowercase for API key
    const apiUsername = displayName.replace(/\s+/g, '').toLowerCase()
    try {
      // Always try login first
      try {
        const { data } = await authApi.login(apiUsername, HARDCODED_PASSWORD)
        setSession(data.session)
        setUser({ ...data.user, username: displayName })
        navigate('/dashboard')
        return
      } catch {
        // Login failed — try register
      }
      // Try register
      try {
        const { data } = await authApi.register(apiUsername, HARDCODED_PASSWORD, apiUsername)
        setSession(data.session)
        setUser({ ...data.user, username: displayName })
        navigate('/dashboard')
        return
      } catch {
        // Register failed — account likely exists with old credentials, force recreate
      }
      setError('Having trouble signing in. Ask King to check the server.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Deep atmospheric background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-[#0a0810] to-slate-950" />
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(192,57,43,0.12) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(26,71,49,0.18) 0%, transparent 60%)',
      }} />
      {/* Subtle stone texture overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
      }} />

      {/* Floating ember particles */}
      <EmberParticles />

      {/* Top vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(7,13,20,0.6) 100%)',
      }} />

      {/* Title */}
      <div className="relative z-10 text-center mb-14 px-4">
        <p className="font-fantasy text-ember-400 text-xs uppercase tracking-[0.3em] mb-3 opacity-70">
          — Enter the Realm —
        </p>
        <h1 className="font-fantasy text-5xl md:text-6xl text-parchment-100 mb-1 tracking-wide" style={{
          textShadow: '0 0 60px rgba(192,57,43,0.5), 0 2px 4px rgba(0,0,0,0.8)',
        }}>
          Chronicles of the
        </h1>
        <h1 className="font-fantasy text-5xl md:text-6xl text-ember-400 tracking-wide" style={{
          textShadow: '0 0 40px rgba(192,57,43,0.8), 0 2px 4px rgba(0,0,0,0.8)',
        }}>
          Fallen Age
        </h1>
        <div className="mt-5 flex justify-center gap-3 items-center">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-full bg-ember-400 animate-flicker"
              style={{
                width: i === 3 ? '6px' : '3px',
                height: i === 3 ? '6px' : '3px',
                opacity: i === 3 ? 1 : 0.5,
                animationDelay: `${i * 0.22}s`,
              }}
            />
          ))}
        </div>
        <p className="mt-4 text-slate-400 font-serif italic text-base md:text-lg">
          "Who dares enter these halls of shadow and flame?"
        </p>
      </div>

      {/* Portrait cards */}
      <div className="relative z-10 flex flex-col sm:flex-row gap-8 px-6 max-w-3xl w-full justify-center">
        {CHARACTERS.map((char) => (
          <button
            key={char.id}
            onClick={() => handleLogin(char.name)}
            disabled={loading !== null}
            className="group relative flex-1 max-w-xs mx-auto sm:mx-0 cursor-pointer border border-slate-700 hover:border-ember-400 transition-all duration-500 overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #0f1923 0%, #0a0e18 100%)',
              boxShadow: '0 0 0 1px rgba(192,57,43,0.1)',
            }}
          >
            {/* Candle glow effect on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 50% 100%, rgba(192,57,43,0.18) 0%, transparent 70%)',
            }} />

            {/* Card title */}
            <div className="relative px-6 pt-6 pb-3 border-b border-slate-800 group-hover:border-ember-400/30 transition-colors duration-500">
              <p className="font-fantasy text-xs uppercase tracking-[0.25em] text-ember-400 opacity-70 mb-1">
                Chronicles of the Fallen Age
              </p>
            </div>

            {/* Portrait placeholder area */}
            <div className="relative h-56 overflow-hidden flex items-center justify-center"
              style={{ background: 'linear-gradient(180deg, #0a0e18 0%, #070d14 100%)' }}>
              {/* Animated candle flame ornament */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
                {/* Flame */}
                <div
                  className="candle-flame"
                  style={{
                    width: '10px',
                    height: '20px',
                    background: 'radial-gradient(ellipse at 50% 80%, #f97316 0%, #c0392b 60%, transparent 100%)',
                    borderRadius: '50% 50% 30% 30%',
                    filter: 'blur(1px)',
                    boxShadow: '0 0 12px #f97316, 0 0 24px #c0392b66',
                  }}
                />
                {/* Candle body */}
                <div style={{
                  width: '6px',
                  height: '40px',
                  background: 'linear-gradient(180deg, #e8d4aa 0%, #c4a870 100%)',
                  borderRadius: '1px',
                  boxShadow: '0 0 8px rgba(192,57,43,0.3)',
                }} />
              </div>

              {/* Character silhouette / placeholder */}
              <div className="relative z-10 flex flex-col items-center justify-center gap-2">
                <div
                  className="w-24 h-24 rounded-full border-2 border-slate-700 group-hover:border-ember-400/50 transition-colors duration-500 flex items-center justify-center"
                  style={{
                    background: 'radial-gradient(circle, #1a2332 0%, #070d14 100%)',
                    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
                    animation: 'torchFlicker 2s ease-in-out infinite',
                  }}
                >
                  <span className="font-fantasy text-3xl text-parchment-200/40">
                    {char.name.charAt(0)}
                  </span>
                </div>
              </div>

              {/* Corner ornaments */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-ember-400/30 group-hover:border-ember-400/60 transition-colors duration-500" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-ember-400/30 group-hover:border-ember-400/60 transition-colors duration-500" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-ember-400/30 group-hover:border-ember-400/60 transition-colors duration-500" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-ember-400/30 group-hover:border-ember-400/60 transition-colors duration-500" />
            </div>

            {/* Name & description */}
            <div className="relative px-6 py-5 text-center">
              <h2 className="font-fantasy text-2xl text-parchment-100 mb-1 tracking-wide group-hover:text-ember-400 transition-colors duration-300" style={{
                textShadow: '0 0 20px rgba(192,57,43,0)',
              }}>
                {char.name}
              </h2>
              <p className="text-ember-400/70 text-xs font-serif uppercase tracking-widest mb-2">
                {char.subtitle}
              </p>
              <p className="text-slate-400 font-serif italic text-sm leading-relaxed">
                {char.description}
              </p>

              {/* Enter button */}
              <div className="mt-4 py-2 px-4 border border-slate-700 group-hover:border-ember-400 group-hover:bg-ember-600/10 transition-all duration-300">
                <span className="font-fantasy text-xs uppercase tracking-[0.2em] text-slate-400 group-hover:text-parchment-100 transition-colors duration-300">
                  {loading === char.name ? (
                    <span className="animate-pulse">Entering realm...</span>
                  ) : (
                    'Enter as this soul'
                  )}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="relative z-10 mt-6 border border-ember-600 bg-ember-600/10 px-4 py-2 text-ember-400 text-sm font-serif max-w-md text-center">
          {error}
        </div>
      )}

      <p className="relative z-10 mt-10 text-slate-700 text-xs font-serif italic">
        "Choose wisely — for the realm remembers."
      </p>
    </div>
  )
}
