import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { RegisterForm } from '@/components/register-form'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StarsBackground } from '@/components/animate-ui/components/backgrounds/stars'

export function Component() {
  const { user } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Stay on this page while the register form is handling MFA/onboarding (mfa_pending is set)
  if (user && !sessionStorage.getItem('mfa_pending')) return <Navigate to="/" replace />

  const isDark = theme === 'dark'

  return (
    <StarsBackground className="min-h-svh w-full flex flex-col items-center justify-center gap-6 px-4 py-6 md:p-10">
      <Button
        variant="ghost"
        size="icon"
        className={`absolute top-4 right-4 z-20 rounded-full backdrop-blur-md ${
          isDark ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-gray-900 hover:text-black hover:bg-gray-200/50'
        }`}
        onClick={toggle}
        title={isDark ? '亮色模式' : '暗色模式'}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
      <div className="relative z-10 w-full max-w-sm page-enter">
        <RegisterForm visible={ready} />
      </div>
    </StarsBackground>
  )
}
