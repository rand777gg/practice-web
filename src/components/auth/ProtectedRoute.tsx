import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { LoadingTips } from '@/components/layout/LoadingTips'

interface Props {
  requiredRole?: 'admin' | 'user'
}

export function ProtectedRoute({ requiredRole }: Props) {
  const { user, profile, isLoading } = useAuthStore()

  if (isLoading) return <LoadingTips className="h-screen" />
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole === 'admin' && profile?.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
