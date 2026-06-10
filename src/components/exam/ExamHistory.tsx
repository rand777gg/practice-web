import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight } from 'lucide-react'
import type { ExamSession } from '@/types'
import { useT } from '@/i18n/use-t'

function formatDuration(ms: number) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function ExamHistory() {
  const { t } = useT()
  const { user } = useAuthStore()
  const version = useRefreshStore((s) => s.version)
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setSessions([])
      setIsLoading(false)
      return
    }
    supabase
      .from('exam_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSessions((data ?? []) as ExamSession[])
        setIsLoading(false)
      })
  }, [user?.id, version])

  if (isLoading) return (
    <div className="rounded-lg border animate-pulse">
      <Table>
        <TableHeader>
          <TableRow>
            {[...Array(6)].map((_, i) => (
              <TableHead key={i}><Skeleton className="h-4 w-12" /></TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(5)].map((_, i) => (
            <TableRow key={i}>
              {[...Array(6)].map((_, j) => (
                <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">{t('exam.noHistory')}</p>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead>{t('exam.historyTime')}</TableHead>
            <TableHead className="text-center">{t('exam.historyCorrectRate')}</TableHead>
            <TableHead className="text-center">{t('exam.historyDuration')}</TableHead>
            <TableHead className="text-center">{t('exam.historyAvgTime')}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s, i) => {
            const avgSec = s.total_questions > 0
              ? Math.round(s.duration_ms / s.total_questions / 1000)
              : 0
            return (
              <TableRow key={s.id}>
                <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {s.completed_at ? new Date(s.completed_at).toLocaleString() : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-medium">{s.score}%</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({s.correct_count}/{s.total_questions})
                  </span>
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {formatDuration(s.duration_ms)}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {avgSec}s
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                    <Link to={`/exam/result/${s.id}`}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
