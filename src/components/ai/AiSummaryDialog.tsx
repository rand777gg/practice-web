import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { generateDailySummary, type SummaryData } from '@/lib/ai/summary'
import { hasAiConfig } from '@/lib/ai/config'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Pencil, Sparkles } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function cleanMarkdown(text: string): string {
  return text.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1').replace(/#{1,4}\s/g, '')
}

export function AiSummaryDialog({ open, onOpenChange }: Props) {
  const { user, profile } = useAuthStore()
  const [rawSummary, setRawSummary] = useState<string | null>(null)
  const [displayed, setDisplayed] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const [borderGlow, setBorderGlow] = useState(false)
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startTypewriter = useCallback((text: string) => {
    const clean = cleanMarkdown(text)
    setRawSummary(clean)
    setDisplayed('')
    setDone(false)
    setOpacity(0.3)
    if (typewriterRef.current) clearTimeout(typewriterRef.current)

    let i = 0
    const len = clean.length
    function tick() {
      i++
      const progress = Math.min(i / Math.max(len, 1), 1)
      setDisplayed(clean.slice(0, i))
      setOpacity(0.3 + progress * 0.7)
      if (i >= len) {
        typewriterRef.current = null
        setOpacity(1)
        setDone(true)
        setBorderGlow(true)
        setTimeout(() => setBorderGlow(false), 2000)
        return
      }
      const ch = clean[i]
      const baseDelay = 12
      const randomDelay = Math.random() * 25
      const punctDelay = /[，,。；;、]/.test(ch) ? 40 : 0
      typewriterRef.current = setTimeout(tick, baseDelay + randomDelay + punctDelay)
    }
    typewriterRef.current = setTimeout(tick, 30)
  }, [])

  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearTimeout(typewriterRef.current)
    }
  }, [])

  async function loadSummary() {
    if (!user) return
    setLoading(true)
    setError(null)
    setRawSummary(null)
    setDisplayed('')
    setDone(false)

    try {
      if (!hasAiConfig()) throw new Error('AI_NOT_CONFIGURED')

      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)
      const todayStart = `${todayStr}T00:00:00`
      const twoWeeksAgo = new Date(now)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

      const [
        { data: allAnswers },
        { data: todayAnswers },
        { data: recentAnswers },
        { data: questions },
      ] = await Promise.all([
        supabase.from('user_answers').select('is_correct, answered_at, question_id').eq('user_id', user.id),
        supabase.from('user_answers').select('is_correct, answered_at, question_id').eq('user_id', user.id).gte('answered_at', todayStart),
        supabase.from('user_answers').select('is_correct, answered_at, question_id').eq('user_id', user.id).gte('answered_at', twoWeeksAgo.toISOString()),
        supabase.from('questions').select('id, subject, category'),
      ])

      const qMap = new Map<string, { subject: string; category: string }>()
      for (const q of questions ?? []) qMap.set(q.id, { subject: q.subject ?? '未分类', category: q.category ?? '未分类' })

      const allList = allAnswers ?? []
      const recentList = recentAnswers ?? []
      const todayList = todayAnswers ?? []

      let todayCorrect = 0; let todayWrong = 0
      const todayHourCount = new Array(24).fill(0)
      for (const a of todayList) {
        if (a.is_correct) todayCorrect++; else todayWrong++
        todayHourCount[new Date(a.answered_at as string).getHours()]++
      }
      const todayPeakHour = todayHourCount.indexOf(Math.max(...todayHourCount))

      const totalAnswered = allList.length
      const overallCorrect = allList.filter((a) => a.is_correct).length
      const overallCorrectRate = totalAnswered > 0 ? overallCorrect / totalAnswered : 0
      const recentCorrect = recentList.filter((a) => a.is_correct).length
      const recentCorrectRate = recentList.length > 0 ? recentCorrect / recentList.length : 0

      const subjectStats = new Map<string, { wrong: number; total: number }>()
      const categoryStats = new Map<string, { wrong: number; total: number }>()
      for (const a of allList) {
        const q = qMap.get(a.question_id)
        const subj = q?.subject ?? '未分类'
        const cat = q?.category ?? '未分类'
        if (!subjectStats.has(subj)) subjectStats.set(subj, { wrong: 0, total: 0 })
        if (!categoryStats.has(cat)) categoryStats.set(cat, { wrong: 0, total: 0 })
        subjectStats.get(subj)!.total++
        categoryStats.get(cat)!.total++
        if (!a.is_correct) { subjectStats.get(subj)!.wrong++; categoryStats.get(cat)!.wrong++ }
      }
      const weakSubjects = Array.from(subjectStats.entries())
        .map(([subject, v]) => ({ subject, ...v })).sort((a, b) => b.wrong - a.wrong).slice(0, 5)
      const weakCategories = Array.from(categoryStats.entries())
        .map(([category, v]) => ({ category, ...v })).sort((a, b) => b.wrong - a.wrong).slice(0, 5)

      const deadline = profile?.deadline ?? null
      const planSubjects: string[] = (() => {
        if (!profile?.plan_subjects) return []
        try { return JSON.parse(profile.plan_subjects) as string[] } catch { return [] }
      })()
      const scopeIds = new Set((questions ?? []).filter((q) => planSubjects.length === 0 || planSubjects.includes(q.subject ?? '')).map((q) => q.id))
      const doneIds = new Set(allList.filter((a) => scopeIds.has(a.question_id)).map((a) => a.question_id))
      const remainingTotal = Math.max(scopeIds.size - doneIds.size, 0)
      const daysLeft = deadline ? Math.max(Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000), 1) : 30

      const summaryData: SummaryData = {
        todayStr, todayCorrect, todayWrong, todayTotal: todayCorrect + todayWrong,
        totalAnswered, overallCorrectRate, recentCorrectRate,
        weakSubjects, weakCategories, planSubjects, deadline,
        remainingTotal, dailyGoal: Math.ceil(remainingTotal / daysLeft), daysLeft,
        todayPeakHour: todayCorrect + todayWrong > 0 ? todayPeakHour : -1,
      }

      const result = await generateDailySummary(summaryData)
      setLoading(false)
      startTypewriter(result)
    } catch (e) {
      setLoading(false)
      const msg = (e as Error).message
      setError(msg === 'AI_NOT_CONFIGURED' ? '请先在管理后台配置 AI 服务（设置 > AI 管理）' : `生成失败：${msg}`)
    }
  }

  useEffect(() => {
    if (open && !rawSummary && !loading && !error) loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose(open: boolean) {
    if (!open && typewriterRef.current) { clearTimeout(typewriterRef.current); typewriterRef.current = null }
    onOpenChange(open)
  }

  function renderChars(text: string) {
    return [...text].map((ch, i) => {
      if (/^\d$/.test(ch)) {
        return (
          <span key={i} className="animate-[charReveal_0.3s_ease-out_both] font-semibold text-blue-600 dark:text-blue-400">
            {ch}
          </span>
        )
      }
      return (
        <span key={i} className="animate-[charReveal_0.3s_ease-out_both]">
          {ch}
        </span>
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={`max-w-lg max-h-[80vh] overflow-y-auto border-2 transition-all duration-700 ${
          loading
            ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]'
            : borderGlow
              ? 'border-purple-500 shadow-[0_0_16px_rgba(139,92,246,0.5)]'
              : ''
        }`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI 学习总结
          </DialogTitle>
          <DialogDescription>
            基于你的答题数据和学习计划，AI 为你生成今日学习建议
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[180px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative">
                <div className="h-8 w-8 rounded-full border-2 border-transparent [animation:colorWheel_3s_linear_infinite]" />
                <Sparkles className="absolute inset-0 m-auto h-4 w-4 text-yellow-500 animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground animate-pulse">
                AI 正在分析你的学习数据...
              </p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadSummary}>重试</Button>
            </div>
          )}

          {rawSummary && (
            <div className="space-y-4">
              <div className="whitespace-pre-wrap leading-relaxed text-sm text-foreground/90" style={{ opacity }}>
                {done ? (
                  <>
                    {[...displayed].map((ch, i) => {
                      if (/^\d$/.test(ch)) {
                        return <span key={i} className="font-semibold text-blue-600 dark:text-blue-400">{ch}</span>
                      }
                      return <span key={i}>{ch}</span>
                    })}
                  </>
                ) : (
                  renderChars(displayed)
                )}
              </div>
              {done && (
                <div className="flex justify-end pt-2 border-t">
                  <Button asChild size="sm" onClick={() => onOpenChange(false)}>
                    <Link to="/practice">
                      <Pencil className="h-4 w-4" />
                      开始学习
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
