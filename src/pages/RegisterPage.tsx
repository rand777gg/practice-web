import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { AuthForm } from '@/components/auth/AuthForm'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import Lightfall from '@/components/ui/Lightfall'

export function Component() {
  const { user, isLoading } = useAuthStore()
  const { theme, toggle } = useThemeStore()

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
        mouseInteraction
        mouseStrength={0.3}
        mouseRadius={0.8}
      />
      <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 text-white/70 hover:text-white hover:bg-white/10" onClick={toggle} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>
      <AuthForm mode="register" />
    </div>
  )
}
