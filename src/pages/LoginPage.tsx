import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { AuthForm } from '@/components/auth/AuthForm'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'

export function Component() {
  const { user, isLoading } = useAuthStore()
  const { theme, toggle } = useThemeStore()

  if (isLoading) return null
  if (user) return <Navigate to="/" replace />

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4338ca 60%, #1e1b4b 100%)' }}>
      {/* Decorative blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/20 blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] rounded-full bg-blue-500/20 blur-3xl" />
      <div className="absolute top-[40%] right-[15%] w-[20%] h-[20%] rounded-full bg-indigo-400/20 blur-3xl" />
      <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 text-white hover:text-white hover:bg-white/10" onClick={toggle} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>
      <AuthForm />
    </div>
  )
}
