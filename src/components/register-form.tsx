import { useState, useRef, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { TurnstileWidget, type TurnstileHandle } from '@/components/auth/TurnstileWidget'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n/use-t'

const rowBase = 'transition-[opacity,transform] duration-500 ease-out'
const rowIn = 'opacity-100 translate-y-0'
const rowOut = 'opacity-0 translate-y-2'

export function RegisterForm({ className, visible, ...props }: React.ComponentProps<'div'> & { visible?: boolean }) {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const turnstileRef = useRef<TurnstileHandle>(null)

  async function validateTurnstile() {
    const token = await turnstileRef.current?.getFreshToken()
    if (!token) throw new Error('验证未通过，请重试')
    const { data } = await supabase.functions.invoke('cloudflare-turnstile', { body: { token } })
    if (!(data as { success: boolean })?.success) throw new Error('安全验证失败，请重试')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await validateTurnstile()
      const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + '/welcome' },
      })
      if (authError) {
        setError(authError.message?.includes('already registered') || authError.status === 422 ? t('auth.alreadyRegistered') : authError.message)
        setIsSubmitting(false)
        return
      }
      if (data.user?.identities?.length === 0) {
        setError(t('auth.alreadyRegistered'))
        setIsSubmitting(false)
        return
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败')
      setIsSubmitting(false)
    }
  }

  const v = visible ? rowIn : rowOut

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <div className={cn(rowBase, visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2')}>
        <Card className="border-gray-200 bg-white/80 backdrop-blur-md shadow-xl dark:border-white/10 dark:bg-black/30 dark:shadow-2xl">
          <CardHeader className="text-center pb-4">
            <div className={cn(rowBase, v)} style={{ transitionDelay: '200ms' }}>
              <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">{t('auth.createAccount')}</CardTitle>
            </div>
            <div className={cn(rowBase, v)} style={{ transitionDelay: '300ms' }}>
              <CardDescription className="text-gray-600 dark:text-white/60">{t('auth.registerDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <form onSubmit={handleSubmit}>
              <div className="grid gap-6">
                <div className={cn(rowBase, v)} style={{ transitionDelay: '400ms' }}>
                  <div className="flex justify-center gap-4">
                    <Button variant="outline" size="icon" type="button" className="rounded-full size-12 border-gray-300 bg-white hover:bg-gray-50 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10 backdrop-blur" onClick={async () => { try { await validateTurnstile(); supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } }) } catch (err) { setError(err instanceof Error ? err.message : '验证失败') } }} title="GitHub 注册">
                      <svg className="h-6 w-6 text-gray-800 dark:text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                    </Button>
                  </div>
                </div>
                <div className={cn(rowBase, v)} style={{ transitionDelay: '500ms' }}>
                  <div className="max-w-[300px] mx-auto">
                    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-gray-200 dark:after:border-white/15">
                      <span className="relative z-10 px-2 text-gray-500 dark:text-white/50">{t('auth.emailLogin')}</span>
                    </div>
                  </div>
                </div>
                {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20 dark:text-red-300 backdrop-blur-md">{error}</div>}
                <div className={cn(rowBase, v)} style={{ transitionDelay: '600ms' }}>
                  <div className="grid gap-4 max-w-[300px] mx-auto w-full">
                    <div className="grid gap-2">
                      <Label htmlFor="email" className="text-gray-800 dark:text-white/80">{t('auth.email')}</Label>
                      <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="text-gray-900 placeholder:text-gray-400 border-gray-300 bg-white dark:text-white dark:placeholder:text-white/30 dark:border-white/20 dark:bg-white/5 backdrop-blur-md focus:border-gray-400 dark:focus:border-white/50" />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center">
                        <Label htmlFor="password" className="text-gray-800 dark:text-white/80">{t('auth.password')}</Label>
                      </div>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="text-gray-900 placeholder:text-gray-400 border-gray-300 bg-white dark:text-white dark:placeholder:text-white/30 dark:border-white/20 dark:bg-white/5 backdrop-blur-md focus:border-gray-400 dark:focus:border-white/50" />
                    </div>
                    <TurnstileWidget ref={turnstileRef} />
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? t('auth.creatingAccount') : t('auth.createAccount')}
                    </Button>
                  </div>
                </div>
                <div className={cn(rowBase, v)} style={{ transitionDelay: '700ms' }}>
                  <div className="text-center text-sm mt-4">
                    <span className="text-gray-500 dark:text-white/50">{t('auth.hasAccount')} </span>
                    <Link to="/login" className="text-gray-800 underline underline-offset-4 hover:text-gray-900 dark:text-white/80 dark:hover:text-white">{t('auth.login')}</Link>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <div className={cn(rowBase, visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2')} style={{ transitionDelay: '800ms' }}>
        <div className="text-balance text-center text-xs text-white/70 dark:text-white/40 [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-white dark:[&_a]:hover:text-white/70">
          点击继续即表示同意我们的 <a href="/terms?from=register">服务条款</a> 和 <a href="/privacy?from=register">隐私政策</a>
        </div>
      </div>
    </div>
  )
}
