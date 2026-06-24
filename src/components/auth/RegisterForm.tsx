import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { MailCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'passwordWeak'
  if (!/[a-zA-Z]/.test(pw)) return 'passwordNeedLetter'
  if (!/[0-9]/.test(pw)) return 'passwordNeedNumber'
  return null
}

export function RegisterForm() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    setPasswordError(value ? validatePassword(value) : null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsSubmitting(true)

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + '/welcome' },
    })
    if (authError) {
      if (authError.message?.includes('already registered') || authError.status === 422) {
        setError(t('auth.alreadyRegistered'))
      } else {
        setError(authError.message)
      }
      setIsSubmitting(false)
      return
    }

    if (data.user?.identities?.length === 0) {
      setError(t('auth.alreadyRegistered'))
      setIsSubmitting(false)
      return
    }

    setSuccess(t('auth.checkEmail'))
    setIsSubmitting(false)
  }

  if (success) {
    return <SuccessCard message={success} />
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t('auth.register')}</CardTitle>
        <CardDescription>{t('auth.registerDesc')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              required
              minLength={8}
            />
            {passwordError ? (
              <p className="text-sm text-destructive">{t(`auth.${passwordError}`)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('auth.passwordHint')}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={isSubmitting || password.length === 0 || passwordError !== null}>
            {isSubmitting ? t('auth.creatingAccount') : t('auth.createAccount')}
          </Button>
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } })}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            {t('auth.githubRegister')}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-primary underline underline-offset-4">
              {t('auth.signIn')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}

function SuccessCard({ message }: { message: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t) }, [])

  return (
    <Card className={cn(
      'w-full max-w-sm transition-all duration-500 ease-out',
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
    )}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 transition-all duration-500 delay-200',
            visible ? 'scale-100' : 'scale-0',
          )}>
            <MailCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          </span>
          注册成功
        </CardTitle>
        <CardDescription>请查收验证邮件</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn(
          'rounded-md bg-green-50 dark:bg-green-950 p-4 text-sm text-green-700 dark:text-green-300 leading-relaxed transition-all duration-500 delay-300',
          visible ? 'opacity-100' : 'opacity-0',
        )}>
          {message}
        </div>
      </CardContent>
    </Card>
  )
}
