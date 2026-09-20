import { useEffect, useRef, useState } from 'react'
import { Coffee } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useExamStore } from '@/stores/exam-store'
import { usePluginStore } from '@/stores/plugin-store'
import { pluginDefaults } from '@/lib/plugin-catalog'
import { onPluginSignal } from '@/lib/plugin-events'
import { useT } from '@/i18n/use-t'
import { Separator } from '@/components/ui/separator'

export function EyeRestReminder() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const row = usePluginStore((s) => s.rows['eye-rest'])
  const examActive = useExamStore((s) => s.session?.status === 'in_progress')

  const fallback = pluginDefaults('eye-rest') as { interval_min: number; break_sec: number; skip_in_exam: boolean }
  const intervalMin = Number(row?.config?.interval_min ?? fallback.interval_min)
  const breakSec = Number(row?.config?.break_sec ?? fallback.break_sec)
  const skipInExam = Boolean(row?.config?.skip_in_exam ?? fallback.skip_in_exam)

  const active = Boolean(row?.enabled) && !(skipInExam && examActive)

  // 累积秒数只写不读,放 ref;要参与渲染的倒计时必须是 state
  const accumulatedRef = useRef(0)
  const [breaking, setBreaking] = useState(false)
  const [left, setLeft] = useState(0)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    return onPluginSignal('eye-rest', () => {
      setLeft(Math.max(5, Math.round(breakSec)))
      setBreaking(true)
      setPreview(true)
    })
  }, [breakSec])

  useEffect(() => {
    if (!active && !preview) return
    const intervalSec = Math.max(60, Math.round(intervalMin * 60))
    const id = window.setInterval(() => {
      // 切走了就不算:用户没在看屏幕,提醒也没意义
      if (document.visibilityState !== 'visible') return
      if (breaking) {
        const next = left - 1
        setLeft(Math.max(next, 0))
        if (next <= 0) {
          setBreaking(false)
          setPreview(false)
          accumulatedRef.current = 0
        }
        return
      }
      if (!active) return
      accumulatedRef.current += 1
      if (accumulatedRef.current >= intervalSec) {
        accumulatedRef.current = 0
        setLeft(Math.max(5, Math.round(breakSec)))
        setBreaking(true)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [active, preview, breaking, left, intervalMin, breakSec])

  function close() {
    accumulatedRef.current = 0
    setBreaking(false)
    setLeft(0)
    setPreview(false)
  }

  if (!(breaking && left > 0 && (active || preview))) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/95 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Coffee className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-3 text-lg font-semibold">{zh ? '让眼睛歇一下' : 'Give your eyes a break'}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {zh
            ? '看向 6 米外的东西，把视线放到远处，不用眯眼，20 秒就够。'
            : 'Look at something about 6 metres away and let your focus drift out. No squinting, 20 seconds is enough.'}
        </p>
        <div className="mt-4 text-4xl font-semibold tabular-nums text-primary">{left}s</div>
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={close}>{zh ? '休息好了' : 'Done resting'}</Button>
          <Button size="sm" variant="ghost" onClick={close}>{zh ? '稍后再说' : 'Later'}</Button>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          {zh
            ? <>每 {intervalMin} 分钟提醒一次<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />可在「插件」页调整</>
            : <>Every {intervalMin} min<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />tune it on the Plugins page</>}
        </p>
      </div>
    </div>
  )
}
