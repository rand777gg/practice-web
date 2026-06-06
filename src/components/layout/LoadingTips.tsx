import { useState, useEffect } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useLangStore } from '@/stores/lang-store'
import { zh, en } from '@/i18n/translations'
import { cn } from '@/lib/utils'

const tipsMap = { zh: zh.tips, en: en.tips }

export function LoadingTips({ className, compact }: { className?: string; compact?: boolean }) {
  const lang = useLangStore((s) => s.lang)
  const tips = tipsMap[lang] || zh.tips
  const [index, setIndex] = useState(() => Math.floor(Math.random() * tips.length))
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % tips.length)
        setFade(true)
      }, 300)
    }, 5000)
    return () => clearInterval(timer)
  }, [tips.length])

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="flex flex-col items-center gap-3">
        <Spinner className={compact ? 'h-5 w-5' : 'h-8 w-8'} />
        <p
          className={cn(
            'text-sm text-muted-foreground text-center max-w-xs transition-opacity duration-300',
            fade ? 'opacity-100' : 'opacity-0',
          )}
        >
          {tips[index]}
        </p>
      </div>
    </div>
  )
}
