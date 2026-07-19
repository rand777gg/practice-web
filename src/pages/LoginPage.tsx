import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { AuthForm } from '@/components/auth/AuthForm'
import Lightfall from '@/components/ui/Lightfall'

export function Component() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) return null
  if (user) return <Navigate to="/" replace />

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10 overflow-hidden bg-[#0a0a2e]">
      <Lightfall
        colors={['#6366f1', '#8b5cf6', '#a78bfa']}
        backgroundColor="#1e1b4b"
        speed={0.5}
        streakCount={3}
        density={0.5}
        zoom={3}
        glow={0.8}
        backgroundGlow={0.4}
        opacity={0.6}
        mouseInteraction={false}
      />
      <div className="relative z-10 w-full flex justify-center">
        <AuthForm />
      </div>
    </div>
  )
}
