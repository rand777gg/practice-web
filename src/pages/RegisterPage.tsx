import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { AuthForm } from '@/components/auth/AuthForm'
import Lightfall from '@/components/ui/Lightfall'

export function Component() {
  const { user } = useAuthStore()
  if (user) return <Navigate to="/" replace />

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 overflow-hidden bg-[#00245f]">
      <Lightfall
        colors={['#A6C8FF', '#5227FF', '#FF9FFC']}
        backgroundColor="#00245f"
        speed={0.6}
        streakCount={2}
        streakWidth={1}
        streakLength={1}
        glow={1}
        density={0.8}
        twinkle={1}
        zoom={2.3}
        backgroundGlow={0}
        opacity={1}
        mouseInteraction={false}
        mouseStrength={0.5}
        mouseRadius={0.75}
      />
      <div className="relative z-10 w-full max-w-sm">
        <AuthForm mode="register" />
      </div>
    </div>
  )
}
