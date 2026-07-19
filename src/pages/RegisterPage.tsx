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
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={toggle} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>
      <AuthForm mode="register" />
    </div>
  )
}
