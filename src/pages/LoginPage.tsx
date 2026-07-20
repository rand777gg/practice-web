import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { LoginForm } from '@/components/login-form'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function Component() {
  const { user } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => setShow(true)
    img.src = 'https://r2-rpw.pguide.dev/images/thu.webp'
  }, [])
  if (user) return <Navigate to="/" replace />

  const isDark = theme === 'dark'

  return (
    <div
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10"
      style={{
        background: `linear-gradient(rgba(0,0,0,0.20), rgba(0,0,0,0.20)), url(https://r2-rpw.pguide.dev/images/thu.webp) center/cover no-repeat`,
      }}
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent" />
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
      <div className="relative z-10 w-full max-w-sm">
        <LoginForm visible={show} />
      </div>
    </div>
  )
}
