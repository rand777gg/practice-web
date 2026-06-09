import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { QuestionCard } from '@/components/questions/QuestionCard'
import type { ExamSession, UserAnswer, Question } from '@/types'
import { RotateCcw, Home } from 'lucide-react'
import { useT } from '@/i18n/use-t'

interface Props {
  sessionId: string
}

export function ExamResultCard({ sessionId }: Props) {
  const { t } = useT()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'
  const [session, setSession] = useState<ExamSession | null>(null)
  const [answers, setAnswers] = useState<(UserAnswer & { questions: Question })[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: sData } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sData) {
        setSession(sData as ExamSession)
      }

      const { data: aData } = await supabase
        .from('user_answers')
        .select('*, questions(*)')
        .eq('exam_session_id', sessionId)
        .order('answered_at', { ascending: true })

      if (aData) {
        setAnswers(aData as (UserAnswer & { questions: Question })[])
      }

      setIsLoading(false)
    }
    load()
  }, [sessionId])

  const textColor = isDark ? '#d1d5db' : '#374151'

  const subjectStats = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>()
    for (const a of answers) {
      const s = a.questions?.subject || 'Other'
      const entry = map.get(s) || { total: 0, correct: 0 }
      entry.total++
      if (a.is_correct) entry.correct++
      map.set(s, entry)
    }
    return [...map.entries()].map(([name, v]) => ({ name, total: v.total, correct: v.correct, rate: Math.round((v.correct / v.total) * 100) }))
  }, [answers])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (!session) {
    return <p className="text-muted-foreground">{t('exam.sessionNotFound')}</p>
  }

  const correct = session.correct_count
  const wrong = session.total_questions - correct

  const gaugeOption = {
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      center: ['50%', '60%'],
      radius: '90%',
      min: 0,
      max: 100,
      axisLine: {
        show: true,
        lineStyle: { width: 18, color: [[0.6, '#ff4d4f'], [0.8, '#faad14'], [1, '#52c41a']] },
      },
      pointer: { length: '60%', width: 6, itemStyle: { color: textColor } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        fontSize: 28,
        fontWeight: 'bold',
        color: textColor,
        offsetCenter: [0, '70%'],
      },
      title: { show: false },
      data: [{ value: session.score }],
    }],
  }

  const donutOption = {
    tooltip: { trigger: 'item' as const },
    legend: { bottom: 0, textStyle: { color: textColor, fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '45%'],
      itemStyle: { borderRadius: 4, borderColor: isDark ? '#1f2937' : '#faf8f5', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: [
        { name: t('exam.correct'), value: correct, itemStyle: { color: '#52c41a' } },
        { name: t('exam.wrong'), value: wrong, itemStyle: { color: '#ff4d4f' } },
      ],
    }],
  }

  const subjectBarOption = subjectStats.length > 0 ? {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 8, right: 30, top: 8, bottom: 20 },
    xAxis: {
      type: 'value' as const, max: 100,
      axisLabel: { fontSize: 10, color: textColor, formatter: '{value}%' },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } },
    },
    yAxis: {
      type: 'category' as const,
      data: subjectStats.map(s => s.name).reverse(),
      axisLabel: { fontSize: 10, color: textColor },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: subjectStats.map(s => s.rate).reverse(),
      barWidth: 14,
      itemStyle: {
        borderRadius: [0, 6, 6, 0],
        color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#8b5cf6' }] },
      },
      label: { show: true, position: 'right' as const, fontSize: 10, color: textColor, formatter: '{c}%' },
    }],
  } : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-0"><CardTitle className="text-sm text-muted-foreground">{t('exam.score')}</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={gaugeOption} style={{ height: 220 }} />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-0"><CardTitle className="text-sm text-muted-foreground">{t('exam.correctRate')}</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={donutOption} style={{ height: 220 }} />
          </CardContent>
        </Card>
      </div>

      {subjectBarOption && (
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-0"><CardTitle className="text-sm text-muted-foreground">各学科正确率</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={subjectBarOption} style={{ height: Math.max(120, subjectStats.length * 32) }} />
          </CardContent>
        </Card>
      )}

      {session.completed_at && (
        <p className="text-xs text-muted-foreground text-center -mt-4">
          {new Date(session.completed_at).toLocaleString()}
        </p>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('exam.reviewAnswers')}</h2>
        {answers.map((ans) => (
          <QuestionCard
            key={ans.id}
            question={ans.questions}
            selectedAnswer={ans.selected_answer}
            showResult
            showEditLink={isAdmin}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/exam">
            <RotateCcw className="h-4 w-4" />
            {t('exam.newExam')}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">
            <Home className="h-4 w-4" />
            {t('exam.backDashboard')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
