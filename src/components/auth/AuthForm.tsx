import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n/use-t'
import { Eye, EyeOff } from 'lucide-react'

export function AuthForm({ className, mode = 'login', ...props }: React.ComponentProps<"div"> & { mode?: 'login' | 'register' }) {
  const { t } = useT()
  const isLogin = mode === 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageHidden, setImageHidden] = useState(false)
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
      const { data, error: authError } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin + '/welcome' },
      })
      if (authError) {
        setError(authError.message?.includes('already registered') || authError.status === 422 ? t('auth.alreadyRegistered') : authError.message)
        setIsSubmitting(false)
        return
      }
      if (data.user?.identities?.length === 0) { setError(t('auth.alreadyRegistered')); setIsSubmitting(false); return }
      // Registration email sent — show success state handled by parent
      navigate('/')
    }
  }

  return (
    <div className={cn("flex flex-col gap-6 w-full transition-all duration-500", imageHidden ? "max-w-md" : "max-w-4xl", className)} {...props}>
      <div className="relative md:min-h-[560px]">
        <Card className={cn("overflow-hidden p-0 md:min-h-[560px] flex flex-col transition-opacity duration-500 absolute inset-0 !bg-black/40 backdrop-blur-xl border-0 shadow-2xl shadow-black/30", imageLoaded ? "opacity-0 pointer-events-none" : "opacity-100 z-10")}>
          <CardContent className={cn("grid p-0 flex-1", !imageHidden && "md:grid-cols-2")}>
            <div className="p-6 md:p-8 space-y-4 flex flex-col justify-center">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            {!imageHidden && <div className="hidden md:block bg-muted/50" />}
          </CardContent>
        </Card>
        <Card className={cn("overflow-hidden p-0 md:min-h-[560px] flex flex-col transition-opacity duration-500 !bg-black/40 backdrop-blur-xl border-0 shadow-2xl shadow-black/30", imageLoaded ? "opacity-100" : "opacity-0")}>
        <CardContent className={cn("grid p-0 flex-1", !imageHidden && "md:grid-cols-2")}>
          <form className="p-6 md:p-8 flex flex-col justify-center h-full relative" onSubmit={handleSubmit}>
            {imageHidden && (
              <button type="button" onClick={() => setImageHidden(false)} className="absolute top-3 right-3 rounded-full bg-muted/50 hover:bg-muted p-1.5 transition-colors" title="显示图片">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">{isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}</h1>
                <p className="text-balance text-muted-foreground">{isLogin ? t('auth.signInDesc') : t('auth.registerDesc')}</p>
              </div>
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <Field>
                <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
                <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (isLogin ? t('auth.signingIn') : t('auth.creatingAccount')) : (isLogin ? t('auth.signIn') : t('auth.createAccount'))}
                </Button>
              </Field>
              <FieldSeparator className="[&>span]:bg-card">or continue with</FieldSeparator>
              <Field className="flex justify-center">
                <Button variant="outline" type="button" className="gap-2" onClick={() => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } })}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  {isLogin ? t('auth.githubLogin') : t('auth.githubRegister')}
                </Button>
              </Field>
            </FieldGroup>
          </form>
          {!imageHidden && (
          <div className="relative hidden md:block bg-muted h-full group">
            <img src="https://r2-rpw.pguide.dev/images/thu.webp" alt="" onLoad={() => setImageLoaded(true)} className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <button type="button" onClick={() => setImageHidden(true)} className="absolute top-2 right-2 z-10 rounded-full bg-black/30 backdrop-blur-sm p-1.5 opacity-0 group-hover:opacity-100 transition-opacity" title="隐藏图片">
              <Eye className="h-4 w-4 text-white/80" />
            </button>
          </div>
          )}
        </CardContent>
      </Card>
      </div>
      <FieldDescription className="px-6 text-center">
        {isLogin ? <>还没有账号？<a href="/register" className="underline underline-offset-2 hover:text-foreground">立即注册</a></> : <>已有账号？<a href="/login" className="underline underline-offset-2 hover:text-foreground">去登录</a></>}
      </FieldDescription>
    </div>
  )
}
