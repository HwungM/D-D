import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import CharacterCreate from './pages/CharacterCreate'
import Game from './pages/Game'
import JoinCampaign from './pages/JoinCampaign'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAuthStore()
  return session ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join/:code" element={<JoinCampaign />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/campaign/:campaignId/create-character" element={<PrivateRoute><CharacterCreate /></PrivateRoute>} />
      <Route path="/campaign/:campaignId/play/:characterId" element={<PrivateRoute><Game /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
