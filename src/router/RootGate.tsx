import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { LandingPage } from '@/pages/LandingPage'

export function RootGate() {
  const { user, isLoading } = useAuthStore()
  const { pathname } = useLocation()

  if (isLoading) return <LoadingTips className="h-screen" />
  if (user) return <Outlet />
  if (pathname === '/') return <LandingPage />
  return <Navigate to="/login" replace />
}
