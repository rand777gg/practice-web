import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { RegisterForm } from '@/components/register-form'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

function useBgImage() {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const isMobile = window.innerWidth < 768
    const img = new Image()
    img.onload = () => setSrc(`url(https://r2-rpw.pguide.dev/images/${isMobile ? 'mobile' : 'desktop'}.webp)`)
    img.src = `https://r2-rpw.pguide.dev/images/${isMobile ? 'mobile' : 'desktop'}.webp`
  }, [])

  return src
}

export function Component() {
  const { user } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  const bgImage = useBgImage()
  if (user) return <Navigate to="/" replace />

  const isDark = theme === 'dark'

  return (
    <div
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10"
      style={bgImage ? {
        background: `linear-gradient(rgba(0,0,0,0.20), rgba(0,0,0,0.20)), ${bgImage} center/cover no-repeat`,
      } : undefined}
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
        <RegisterForm visible={!!bgImage} />
      </div>
    </div>
  )
}
