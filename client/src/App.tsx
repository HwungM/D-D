import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, useGameStore } from './lib/store'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import CharacterCreate from './pages/CharacterCreate'
import Game from './pages/Game'
import LoadingScreen from './components/LoadingScreen'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAuthStore()
  return session ? <>{children}</> : <Navigate to="/" replace />
}

function GlobalLoadingOverlay() {
  const { isLoading } = useGameStore()
  const location = useLocation()
  // Only show loading overlay on game routes
  const isGameRoute = location.pathname.includes('/play/')
  if (!isLoading || !isGameRoute) return null
  return <LoadingScreen />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/campaign/:campaignId/create-character" element={<PrivateRoute><CharacterCreate /></PrivateRoute>} />
        <Route path="/campaign/:campaignId/play/:characterId" element={<PrivateRoute><Game /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalLoadingOverlay />
    </>
  )
}
