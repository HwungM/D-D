import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import { supabase } from './lib/supabase'

const Landing = lazy(() => import('./pages/Landing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CharacterCreate = lazy(() => import('./pages/CharacterCreate'))
const Game = lazy(() => import('./pages/Game'))
const JoinCampaign = lazy(() => import('./pages/JoinCampaign'))
const CampaignWizard = lazy(() => import('./pages/CampaignWizard'))
const CampaignBrief = lazy(() => import('./pages/CampaignBrief'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAuthStore()
  return session ? <>{children}</> : <Navigate to="/" replace />
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="font-fantasy text-2xl tracking-[0.08em] text-[#e8d4a8]/70 animate-pulse">
        The Everrealm
      </div>
    </div>
  )
}

class CampaignErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Campaign screen crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="min-h-screen bg-[#050607] px-6 py-16 text-center text-parchment-100">
        <p className="font-fantasy text-xs uppercase tracking-[0.28em] text-red-300/80">The realm lost its footing</p>
        <h1 className="mt-4 font-fantasy text-3xl">Campaign state could not be displayed.</h1>
        <p className="mx-auto mt-3 max-w-xl font-serif text-sm text-parchment-200/70">Your campaign is still saved. Reload to recover; if this continues, return to the Hall and try again.</p>
        <div className="mt-7 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="border border-amber-300/40 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-amber-100">Reload</button>
          <button onClick={() => { window.location.href = '/dashboard' }} className="border border-white/16 px-5 py-3 font-fantasy text-xs uppercase tracking-[0.18em] text-parchment-200">Return to Hall</button>
        </div>
      </main>
    )
  }
}

export default function App() {
  const { setSession, setUser, logout } = useAuthStore()

  // Keep Zustand session in sync with Supabase auto-refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        setUser({ id: session.user.id, email: session.user.email })
      } else {
        logout()
      }
    })
    return () => subscription.unsubscribe()
  }, [setSession, setUser, logout])

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join/:code" element={<JoinCampaign />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/create-campaign" element={<PrivateRoute><CampaignWizard /></PrivateRoute>} />
        <Route path="/campaign/:campaignId/brief" element={<PrivateRoute><CampaignBrief /></PrivateRoute>} />
        <Route path="/campaign/:campaignId/create-character" element={<PrivateRoute><CharacterCreate /></PrivateRoute>} />
        <Route path="/campaign/:campaignId/play/:characterId" element={<PrivateRoute><CampaignErrorBoundary><Game /></CampaignErrorBoundary></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
