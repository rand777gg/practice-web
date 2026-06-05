import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { RegisterForm } from '@/components/auth/RegisterForm'

export function Component() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) return null
  if (user) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <RegisterForm />
    </div>
  )
}
