import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuthStore } from '../lib/store'

type Mode = 'login' | 'register'

export default function Landing() {
  const navigate = useNavigate()
  const { setSession, setUser } = useAuthStore()
  const [mode, setMode] = useState<Mode>('login')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const { data } = await authApi.register(username, password, username)
        setSession(data.session)
        setUser(data.user)
      } else {
        const { data } = await authApi.login(username, password)
        setSession(data.session)
        setUser(data.user)
      }
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Something went wrong'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 opacity-90" />
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(ellipse at 50% 0%, #c0392b22 0%, transparent 60%), radial-gradient(ellipse at 50% 100%, #1a4731aa 0%, transparent 60%)',
        }}
      />

      {/* Title */}
      <div className="relative z-10 text-center mb-12">
        <h1 className="font-fantasy text-6xl text-parchment-200 mb-2 tracking-wide" style={{ textShadow: '0 0 40px #c0392b88' }}>
          Chronicles of the
        </h1>
        <h1 className="font-fantasy text-6xl text-ember-400 tracking-wide" style={{ textShadow: '0 0 40px #c0392b' }}>
          Fallen Age
        </h1>
        <p className="mt-4 text-slate-400 font-serif italic text-lg">
          "The world does not care for heroes. It merely endures them."
        </p>
        <div className="mt-3 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-ember-600 animate-flicker" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      </div>

      {/* Auth Panel */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-slate-900 border border-slate-700 p-8 shadow-2xl">
          <div className="flex mb-6 border-b border-slate-700">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 pb-3 text-sm uppercase tracking-widest font-serif transition-colors ${mode === 'login' ? 'text-parchment-200 border-b-2 border-ember-500 -mb-px' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Enter
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 pb-3 text-sm uppercase tracking-widest font-serif transition-colors ${mode === 'register' ? 'text-parchment-200 border-b-2 border-ember-500 -mb-px' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Begin Journey
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Adventurer Name</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="fantasy-input w-full"
                  placeholder="your_name"
                  required
                />
              </div>
            )}
            {mode === 'login' && (
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Adventurer Name</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="fantasy-input w-full"
                  placeholder="your_name"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Passphrase</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="fantasy-input w-full"
                placeholder="••••••••"
                required
                minLength={mode === 'register' ? 8 : undefined}
              />
            </div>

            {error && (
              <div className="border border-ember-600 bg-ember-600/10 px-3 py-2 text-ember-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="fantasy-btn w-full mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Consulting the fates...' : mode === 'login' ? 'Enter the Realm' : 'Forge Your Destiny'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4 font-serif italic">
          Adventures await those bold enough to seek them.
        </p>
      </div>
    </div>
  )
}
