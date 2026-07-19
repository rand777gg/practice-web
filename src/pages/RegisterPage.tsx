import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { AuthForm } from '@/components/auth/AuthForm'
import Galaxy from '@/components/ui/Galaxy'

export function Component() {
  const { user } = useAuthStore()
  if (user) return <Navigate to="/" replace />

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 overflow-hidden bg-[#0a0a1a]">
      <Galaxy density={1.5} glowIntensity={0.4} saturation={0.3} hueShift={220} speed={0.8} mouseInteraction={false} mouseRepulsion={false} twinkleIntensity={0.3} rotationSpeed={0.05} transparent />
      <div className="relative z-10 w-full max-w-sm">
        <AuthForm mode="register" />
      </div>
    </div>
  )
}
