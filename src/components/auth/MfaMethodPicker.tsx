import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KeyRound, Smartphone } from 'lucide-react'

// Official setup guides for authenticator apps
const TOTP_GUIDE_GOOGLE = 'https://support.google.com/accounts/answer/1066447'
const TOTP_GUIDE_MICROSOFT = 'https://support.microsoft.com/zh-cn/authenticator/about-microsoft-authenticator'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPickPasskey: () => void
  onPickTotp: () => void
}

/** Pick a verification method before configuring (passkey or authenticator app). */
export function MfaMethodPicker({ open, onOpenChange, onPickPasskey, onPickTotp }: Props) {
  const { t } = useT()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[100]">
        <DialogHeader>
          <DialogTitle>{t('auth.mfaPickTitle')}</DialogTitle>
          <DialogDescription>{t('auth.mfaPickDesc')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* Passkey */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="h-auto flex-col gap-1.5 py-4 text-sm"
              onClick={() => { onOpenChange(false); onPickPasskey() }}
            >
              <KeyRound className="h-5 w-5" />
              <span className="flex items-center gap-1">
                {t('auth.passkeyMethod')}
                <span className="text-[10px] font-medium text-primary">{t('auth.obRecommended')}</span>
              </span>
            </Button>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('auth.obPasskeyExplain')}</p>
          </div>

          {/* Authenticator App */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="h-auto flex-col gap-1.5 py-4 text-sm"
              onClick={() => { onOpenChange(false); onPickTotp() }}
            >
              <Smartphone className="h-5 w-5" />
              {t('auth.totpMethod')}
            </Button>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('auth.obTotpExplain')}</p>
            <div className="flex flex-col gap-1">
              <a
                href={TOTP_GUIDE_GOOGLE}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {t('auth.mfaTotpGuideGoogle')}
              </a>
              <a
                href={TOTP_GUIDE_MICROSOFT}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {t('auth.mfaTotpGuideMicrosoft')}
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
