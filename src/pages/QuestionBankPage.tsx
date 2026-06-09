import { useT } from '@/i18n/use-t'
import { Library } from 'lucide-react'

export function Component() {
  const { t } = useT()

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl lg:text-2xl font-bold">{t('nav.questionBank')}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground/70">ALPHA</span>
      </div>
      <div className="text-center py-20 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
          <Library className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground text-sm">试题库功能即将推出，敬请期待。</p>
      </div>
    </div>
  )
}
