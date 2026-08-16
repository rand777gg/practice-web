import { useState, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { OtpSetupDialog } from '@/components/auth/OtpSetupDialog'
import { registerPasskey } from '@/lib/passkey'
import { completeOnboarding, type MfaStatus } from '@/lib/mfa'
import { Icon } from '@/lib/icons'
import { ShieldCheck, KeyRound, Smartphone, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Step = 'welcome' | 'security' | 'done'
type MfaChoice = 'passkey' | 'totp' | 'skip'

interface Props {
  status: MfaStatus
  onDone: () => void
}

export function OnboardingGuide({ status, onDone }: Props) {
  const { t } = useT()
  const { user } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const [step, setStep] = useState<Step>('welcome')
  const [selected, setSelected] = useState<MfaChoice | null>(null)
  const [passkeyRegistering, setPasskeyRegistering] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')
  const [totpOpen, setTotpOpen] = useState(false)
  const [mfaDone, setMfaDone] = useState(status.availableMethods.passkey || status.availableMethods.totp)
  const isAdmin = status.role === 'admin'

  // Reset selection when entering the security step
  useEffect(() => {
    if (step === 'security') setSelected(null)
  }, [step])

  const handlePasskeyRegister = useCallback(async () => {
    if (!user || passkeyRegistering || mfaDone) return
    setPasskeyRegistering(true)
    setPasskeyError('')
    try {
      const ok = await registerPasskey(user.id)
      if (ok) {
        setMfaDone(true)
        setStep('done')
      } else {
        setPasskeyError(t('auth.passkeyRegisterError'))
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.message?.includes('cancelled') || e?.message?.includes('Cancelled')) {
        setPasskeyError(t('auth.passkeyCancelled'))
      } else if (e?.message?.includes('SecurityError')) {
        setPasskeyError(t('auth.passkeySecurityError'))
      } else {
        setPasskeyError(e?.message || t('auth.passkeyRegisterError'))
      }
    } finally {
      setPasskeyRegistering(false)
    }
  }, [user, passkeyRegistering, mfaDone, t])

  const handleTotpComplete = useCallback(() => {
    setTotpOpen(false)
    setMfaDone(true)
    setStep('done')
  }, [])

  const handleSkip = useCallback(async () => {
    await completeOnboarding()
    onDone()
  }, [onDone])

  const handleStart = useCallback(async () => {
    if (isAdmin && !mfaDone) return
    await completeOnboarding()
    onDone()
  }, [isAdmin, mfaDone, onDone])

  const steps = [
    { key: 'welcome', label: t('auth.obStepWelcome') },
    { key: 'security', label: t('auth.obStepSecurity') },
    { key: 'done', label: t('auth.obStepDone') },
  ]
  const stepIndex = step === 'welcome' ? 0 : step === 'security' ? 1 : 2

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* progress bar + language switcher (no overlap on mobile) */}
      <div className="w-full max-w-xl mx-auto pt-4 px-4">
        <div className="flex justify-end mb-2">
          <div className="flex items-center gap-1 rounded-full border bg-background p-0.5 shadow-sm">
            <button
              onClick={() => setLang('zh')}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                lang === 'zh' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              中文
            </button>
            <button
              onClick={() => setLang('en')}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              EN
            </button>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {steps.map((s, i) => {
            const done = i < stepIndex
            const current = i === stepIndex
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'h-1.5 w-full rounded-full transition-colors duration-300',
                    done ? 'bg-green-500' : current ? 'bg-primary' : 'bg-muted',
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] leading-none',
                    done ? 'text-green-600' : current ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pt-6 overflow-y-auto">
        {step === 'welcome' && (
          <div className="max-w-xl w-full text-center flex flex-col items-center gap-6 animate-[passkey-success-pop_0.5s_ease-out]">
            <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10">
              <Icon icon="material-symbols:quiz-outline" className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('auth.obWelcome')}</h1>
              <p className="text-sm text-muted-foreground mt-2">{t('auth.obWelcomeDesc')}</p>
            </div>
            <div className="w-full space-y-2 text-left">
              {[t('auth.obFeature1'), t('auth.obFeature2'), t('auth.obFeature3')].map((f) => (
                <div key={f} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-sm">{f}</span>
                </div>
              ))}
            </div>
            <Button className="w-full" size="lg" onClick={() => setStep('security')}>
              {t('auth.obNext')}
            </Button>
          </div>
        )}

        {step === 'security' && (
          <div className="max-w-xl w-full text-center flex flex-col items-center gap-4 animate-[passkey-success-pop_0.5s_ease-out]">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{t('auth.obSecurityTitle')}</h1>
              <p className="text-xs text-muted-foreground mt-1.5">{t('auth.obSecurityDesc')}</p>
            </div>

            {/* Why 2FA (with standard references) */}
            <div className="w-full rounded-lg border bg-muted/30 p-4 text-left">
              <p className="text-xs font-medium mb-1.5">{t('auth.obWhyTitle')}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t('auth.obWhyDesc')}</p>
            </div>

            <div className="w-full grid gap-3" style={{ gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr 1fr 1fr' }}>
              {/* Passkey (recommended) */}
              <Button
                variant="outline"
                onClick={() => setSelected('passkey')}
                disabled={passkeyRegistering || (mfaDone && status.availableMethods.passkey)}
                className={cn(
                  'h-auto flex-col gap-1.5 py-4 px-2 text-sm transition-shadow',
                  selected === 'passkey' && 'ring-2 ring-primary ring-offset-2',
                )}
              >
                <KeyRound className="h-5 w-5" />
                <span className="flex items-center gap-1">
                  {t('auth.passkeyMethod')}
                  <span className="text-[10px] font-medium text-primary">{t('auth.obRecommended')}</span>
                </span>
                {mfaDone && status.availableMethods.passkey && (
                  <span className="text-green-600 flex items-center gap-1 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />{t('auth.obPasskeyDone')}
                  </span>
                )}
              </Button>

              {/* TOTP */}
              <Button
                variant="outline"
                onClick={() => setSelected('totp')}
                disabled={mfaDone && status.availableMethods.totp}
                className={cn(
                  'h-auto flex-col gap-1.5 py-4 px-2 text-sm transition-shadow',
                  selected === 'totp' && 'ring-2 ring-primary ring-offset-2',
                )}
              >
                <Smartphone className="h-5 w-5" />
                {t('auth.totpMethod')}
                {mfaDone && status.availableMethods.totp && (
                  <span className="text-green-600 flex items-center gap-1 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />{t('auth.obTotpDone')}
                  </span>
                )}
              </Button>

              {/* Skip (regular users only) */}
              {!isAdmin && (
                <Button
                  variant="ghost"
                  onClick={() => setSelected('skip')}
                  className={cn(
                    'h-auto flex-col gap-1.5 py-4 px-2 text-sm transition-shadow',
                    selected === 'skip' && 'ring-2 ring-primary ring-offset-2',
                  )}
                >
                  <X className="h-5 w-5" />
                  {t('auth.obSkip')}
                </Button>
              )}
            </div>

            {/* shared explanation area — plain text */}
            <div className="w-full min-h-[76px]">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {selected === 'passkey' && t('auth.obPasskeyExplain')}
                {selected === 'totp' && t('auth.obTotpExplain')}
                {selected === 'skip' && t('auth.obSkipExplain')}
                {selected === null && t('auth.obChooseHint')}
              </p>
            </div>

            {passkeyError && <p className="text-xs text-destructive w-full text-center">{passkeyError}</p>}

            {isAdmin && !mfaDone && (
              <p className="text-xs text-destructive">{t('auth.obAdminRequired')}</p>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                if (selected === 'passkey') { handlePasskeyRegister(); return }
                if (selected === 'totp') { setTotpOpen(true); return }
                if (selected === 'skip') { handleSkip(); return }
              }}
              disabled={selected === null || passkeyRegistering}
            >
              {t('auth.obNext')}
            </Button>
          </div>
        )}

        {step === 'done' && (
          <div className="max-w-xl w-full text-center flex flex-col items-center gap-6 animate-[passkey-success-pop_0.5s_ease-out]">
            <div className="animate-[passkey-success-pop_0.6s_ease-out] flex items-center justify-center w-20 h-20">
              <svg className="h-14 w-14 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" strokeDasharray="113" strokeDashoffset="113" className="animate-[passkey-check-circle_0.6s_ease-out_0.2s_forwards]" />
                <path d="M8 12l3 3 5-5" strokeDasharray="48" strokeDashoffset="48" className="animate-[passkey-check-path_0.5s_ease-out_0.8s_forwards]" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">{mfaDone ? t('auth.obSecurityTitle') : t('auth.obWelcome')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.obWelcomeDesc')}</p>
            <Button className="w-full" size="lg" onClick={handleStart}>
              {t('auth.obStart')}
            </Button>
          </div>
        )}
      </div>

      {/* TOTP setup embedded */}
      <OtpSetupDialog open={totpOpen} onSetupComplete={handleTotpComplete} onCancel={() => setTotpOpen(false)} />
    </div>
  )
}
