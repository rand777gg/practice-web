import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { LoadingScreen } from '@/components/layout/LoadingScreen'

interface Props {
  requiredRole?: 'admin' | 'user'
}

export function ProtectedRoute({ requiredRole }: Props) {
  const { user, profile, isLoading } = useAuthStore()

  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole === 'admin' && profile?.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
