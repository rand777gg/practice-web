import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore, selectAuthPending } from '@/stores/auth-store'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { LandingPage } from '@/pages/LandingPage'

export function RootGate() {
  const user = useAuthStore((s) => s.user)
  const pending = useAuthStore(selectAuthPending)
  const { pathname } = useLocation()

  if (pending) return <LoadingTips className="h-screen" />
  // While MFA is pending (inline verification on the landing page) keep showing the landing page
  if (user && !sessionStorage.getItem('mfa_pending')) return <Outlet />
  if (pathname === '/') return <LandingPage />
  return <Navigate to="/" replace />
}
