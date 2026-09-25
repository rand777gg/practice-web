import { useMemo, useState } from 'react'
import { Check, RefreshCw, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateProfile } from '@/services/profiles'
import { logError } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/i18n/use-t'
import {
  avatarDataUri,
  generateAvatarOptions,
  githubAvatarOf,
  hasGitHubIdentity,
  initialsOf,
  isGitHubAvatarUrl,
  parseAvatarPreset,
  serializeAvatarPreset,
  type AvatarSpec,
} from '@/lib/avatar'
import { cn } from '@/lib/utils'

const OPTION_COUNT = 14

export function AvatarPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const [round, setRound] = useState(0)

  const initials = initialsOf(profile?.nickname || user?.email?.split('@')[0], user?.id)
  const options = useMemo(() => generateAvatarOptions(user?.id ?? 'guest', OPTION_COUNT, round), [user?.id, round])
  const githubAvatar = hasGitHubIdentity(user) ? githubAvatarOf(user) : null
  const currentPreset = profile?.avatar_preset ?? null
  const usingGitHub = !currentPreset && isGitHubAvatarUrl(profile?.avatar_url)
  const sameSpec = (a: AvatarSpec, b: AvatarSpec) => a.style === b.style && a.palette === b.palette && a.seed === b.seed
  const selected = parseAvatarPreset(currentPreset)

  const apply = async (patch: { avatar_preset: string | null; avatar_url: string | null }) => {
    if (!user) return
    await updateProfile(user.id, patch).catch((e) => logError('avatarPicker.apply', e))
    await refreshProfile()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.avatarTitle')}</DialogTitle>
          <DialogDescription>{t('settings.avatarDesc')}</DialogDescription>
        </DialogHeader>

        {githubAvatar && (
          <button
            type="button"
            onClick={() => apply({ avatar_preset: null, avatar_url: githubAvatar })}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
              usingGitHub ? 'border-primary bg-primary/5' : 'hover:bg-accent',
            )}
          >
            <img src={githubAvatar} alt="" className="size-10 shrink-0 rounded-full object-cover" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t('settings.avatarUseGithub')}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {user?.user_metadata?.user_name ? `@${user.user_metadata.user_name}` : 'github.com'}
              </span>
            </span>
            {usingGitHub && <Check className="size-4 shrink-0 text-primary" />}
          </button>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('settings.avatarGenerated')}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] text-muted-foreground"
              onClick={() => setRound((r) => r + 1)}
            >
              <RefreshCw className="size-3" />
              {t('settings.avatarRegenerate')}
            </Button>
          </div>
          <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-7">
            {options.map((spec) => {
              const active = !usingGitHub && !!selected && sameSpec(spec, selected)
              return (
                <button
                  key={serializeAvatarPreset(spec)}
                  type="button"
                  onClick={() => apply({ avatar_preset: serializeAvatarPreset(spec), avatar_url: null })}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-full ring-offset-2 ring-offset-background transition-all hover:scale-105',
                    active ? 'ring-2 ring-primary' : 'ring-1 ring-border hover:ring-primary/50',
                  )}
                >
                  <img src={avatarDataUri(spec, initials, 96)} alt="" className="size-full object-cover" />
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <Check className="size-4 text-white" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          {githubAvatar ? t('settings.avatarHintLinked') : t('settings.avatarHintUnlinked')}
        </p>
      </DialogContent>
    </Dialog>
  )
}
