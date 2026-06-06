import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import CharacterCreate from './pages/CharacterCreate'
import Game from './pages/Game'
import JoinCampaign from './pages/JoinCampaign'
import CampaignWizard from './pages/CampaignWizard'
import CampaignBrief from './pages/CampaignBrief'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAuthStore()
  return session ? <>{children}</> : <Navigate to="/" replace />
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
  )
}
