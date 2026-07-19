import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MailCheck } from 'lucide-react'
import { useT } from '@/i18n/use-t'

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'passwordWeak'
  if (!/[a-zA-Z]/.test(pw)) return 'passwordNeedLetter'
  if (!/[0-9]/.test(pw)) return 'passwordNeedNumber'
  return null
}

export function AuthForm({ defaultTab = 'login' }: { defaultTab?: 'login' | 'register' }) {
  const { t } = useT()
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const navigate = useNavigate()

  const isLogin = tab === 'login'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsSubmitting(true)

    if (isLogin) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) { setError(authError.message); setIsSubmitting(false) }
      else navigate('/')
    } else {
      if (passwordError) { setIsSubmitting(false); return }
      const { data, error: authError } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin + '/welcome' },
      })
      if (authError) {
        setError(authError.message?.includes('already registered') || authError.status === 422 ? t('auth.alreadyRegistered') : authError.message)
        setIsSubmitting(false)
        return
      }
      if (data.user?.identities?.length === 0) { setError(t('auth.alreadyRegistered')); setIsSubmitting(false); return }
      setSuccess(t('auth.checkEmail'))
      setIsSubmitting(false)
    }
  }

  const handleOAuth = () => {
    supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } })
  }

  if (success) {
    return (
      <AuthCard>
        <SuccessView message={success} />
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center gap-2 text-center pt-6 md:pt-8">
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(['login', 'register'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setTab(v); setError(''); setPassword(''); setPasswordError(null) }}
              className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-all', tab === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {v === 'login' ? t('auth.login') : t('auth.register')}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {isLogin ? t('auth.signInDesc') : t('auth.registerDesc')}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-4">
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center">
            <Label htmlFor="password">{t('auth.password')}</Label>
            {isLogin && (
              <Link to="/forgot-password" className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password" type="password" value={password} required minLength={8}
            onChange={(e) => { setPassword(e.target.value); if (!isLogin) setPasswordError(validatePassword(e.target.value)) }}
          />
          {!isLogin && passwordError && <p className="text-sm text-destructive">{t(`auth.${passwordError}`)}</p>}
          {!isLogin && !passwordError && <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting || (!isLogin && (password.length === 0 || passwordError !== null))}>
          {isSubmitting ? (isLogin ? t('auth.signingIn') : t('auth.creatingAccount')) : (isLogin ? t('auth.signIn') : t('auth.createAccount'))}
        </Button>
        <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div></div>
        <Button variant="outline" className="w-full gap-2" type="button" onClick={handleOAuth}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          {isLogin ? t('auth.githubLogin') : t('auth.githubRegister')}
        </Button>
      </form>
    </AuthCard>
  )
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden p-0 w-full max-w-4xl">
      <CardContent className="grid p-0 md:grid-cols-2">
        <div>{children}</div>
        <div className="relative hidden bg-muted md:flex items-center justify-center">
          <div className="text-center px-8">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Practice Web</h2>
            <p className="text-sm text-muted-foreground">系统性刷题，高效备考</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SuccessView({ message }: { message: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t) }, [])
  return (
    <div className={cn('p-6 md:p-8 space-y-4 transition-all duration-500', visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6')}>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 transition-all duration-500 delay-200', visible ? 'scale-100' : 'scale-0')}>
          <MailCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">注册成功</h3>
          <p className="text-sm text-muted-foreground">请查收验证邮件</p>
        </div>
      </div>
      <div className={cn('rounded-md bg-green-50 dark:bg-green-950 p-4 text-sm text-green-700 dark:text-green-300 transition-all duration-500 delay-300', visible ? 'opacity-100' : 'opacity-0')}>
        {message}
      </div>
    </div>
  )
}
