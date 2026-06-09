import { lazy, Suspense, useEffect } from 'react'
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
        <Route path="/campaign/:campaignId/play/:characterId" element={<PrivateRoute><Game /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
