import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteLearningRoute,
  fetchLearningRoutes,
  saveLearningRoute,
} from '@/hooks/use-learning-routes'
import type { RouteListEntry } from '@/types/learning-routes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Map, Pencil, Plus, Trash2 } from 'lucide-react'

export function Component() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<RouteListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RouteListEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchLearningRoutes(true)
      setEntries(list)
      setError('')
    } catch (err) {
      console.error(err)
      setError('加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const togglePublish = async (entry: RouteListEntry) => {
    const route = entry.route
    setBusyId(route.id)
    setError('')
    try {
      await saveLearningRoute({
        id: route.id,
        title: route.title,
        description: route.description,
        is_published: !route.is_published,
        route_order: route.route_order,
      })
      await load()
    } catch (err) {
      console.error(err)
      setError('操作失败，请稍后重试')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.route.id
    setDeleteTarget(null)
    setBusyId(id)
    setError('')
    try {
      await deleteLearningRoute(id)
      await load()
    } catch (err) {
      console.error(err)
      setError('删除失败，请稍后重试')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Map className="h-5 w-5 text-primary" />
            学习路线管理
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            编排精选题目为阶段化的学习路线，草稿仅管理员可见。
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/admin/learning-routes/new')}>
          <Plus className="mr-1 h-4 w-4" />
          新建路线
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="mt-3 h-4 w-2/3" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-14 text-center">
          <Map className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            还没有学习路线，点右上角「新建路线」开始编排。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const route = entry.route
            const busy = busyId === route.id
            return (
              <div key={route.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-sm font-semibold">
                        {route.title || '未命名路线'}
                      </h3>
                      {route.is_published ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                          已发布
                        </Badge>
                      ) : (
                        <Badge variant="secondary">草稿</Badge>
                      )}
                    </div>
                    {route.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                        {route.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {entry.stageCount} 个阶段 · {entry.questionCount} 道题
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => togglePublish(entry)}
                    >
                      {busy ? '处理中…' : route.is_published ? '下架' : '发布'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => navigate(`/admin/learning-routes/${route.id}/edit`)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除学习路线</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleteTarget?.route.title || '未命名路线'}」吗？其下的阶段与题目编排将一并删除，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
