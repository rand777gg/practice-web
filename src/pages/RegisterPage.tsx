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
        colors={['#A6C8FF', '#5227FF', '#FF9FFC']}
        backgroundColor="#ffffff"
        speed={0.8}
        streakCount={2}
        streakWidth={1.3}
        streakLength={1}
        glow={0.9}
        density={0.6}
        twinkle={1}
        zoom={1}
        backgroundGlow={0}
        opacity={1}
        mouseInteraction={false}
        mouseStrength={0.6}
        mouseRadius={0.8}
      />
      <div className="relative z-10 w-full flex justify-center">
        <AuthForm mode="register" />
      </div>
    </div>
  )
}
