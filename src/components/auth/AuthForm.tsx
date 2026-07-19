import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n/use-t'
import { GalleryVerticalEnd } from 'lucide-react'
import { version } from '../../package.json'

export function AuthForm({ className, mode = 'login', ...props }: React.ComponentProps<"div"> & { mode?: 'login' | 'register' }) {
  const { t } = useT()
  const isLogin = mode === 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    if (isLogin) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) { setError(authError.message); setIsSubmitting(false) }
      else navigate('/')
    } else {
      const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/welcome' } })
      if (authError) { setError(authError.message?.includes('already registered') || authError.status === 422 ? t('auth.alreadyRegistered') : authError.message); setIsSubmitting(false); return }
      if (data.user?.identities?.length === 0) { setError(t('auth.alreadyRegistered')); setIsSubmitting(false); return }
      navigate('/')
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a href="/" className="flex flex-col items-center gap-2 font-medium">
              <div className="flex size-8 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-6" />
              </div>
              <span className="sr-only">Practice Web</span>
            </a>
            <h1 className="text-xl font-bold">{isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}<span className="ml-2 text-xs font-normal text-white/30">v{version}</span></h1>
            <FieldDescription>
              {isLogin ? <>还没有账号？ <Link to="/register">注册</Link></> : <>已有账号？ <Link to="/login">登录</Link></>}
            </FieldDescription>
          </div>
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <Field>
            <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
            <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="text-white placeholder:text-white/40" />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="text-white placeholder:text-white/40" />
          </Field>
          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (isLogin ? t('auth.signingIn') : t('auth.creatingAccount')) : (isLogin ? t('auth.signIn') : t('auth.createAccount'))}
            </Button>
          </Field>
          <FieldSeparator>or</FieldSeparator>
          <Field className="flex justify-center">
            <Button variant="outline" type="button" className="gap-2" onClick={() => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } })}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span className="sr-only">GitHub</span>
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        点击继续即表示同意我们的<a href="/terms" className="underline underline-offset-4 hover:text-foreground">服务条款</a>和<a href="/privacy" className="underline underline-offset-4 hover:text-foreground">隐私政策</a>。
      </FieldDescription>
    </div>
  )
}
