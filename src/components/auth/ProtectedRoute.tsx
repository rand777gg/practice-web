import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, selectAuthPending } from '@/stores/auth-store'
import { LoadingTips } from '@/components/layout/LoadingTips'

interface Props {
  requiredRole?: 'admin' | 'user'
}

export function ProtectedRoute({ requiredRole }: Props) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const status = useAuthStore((s) => s.status)
  const pending = useAuthStore(selectAuthPending)

  if (pending) return <LoadingTips className="h-screen" />
  if (!user) return <Navigate to="/" replace />
  if (requiredRole === 'admin') {
    // 资料还没落地时角色是未知的，不是"非管理员" —— 直接判定会把管理员在刷新页面时弹回首页
    if (!profile && status !== 'error') return <LoadingTips className="h-screen" />
    if (profile?.role !== 'admin') return <Navigate to="/" replace />
  }
  return <Outlet />
}
