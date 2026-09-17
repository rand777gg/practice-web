import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LayoutGrid, Loader2, Save, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RoadmapCanvas } from '@/components/learning-route/RoadmapCanvas'
import { RouteEditorOverlays } from '@/components/learning-route/RouteEditorOverlays'
import { useRouteEditor } from '@/hooks/use-route-editor'
import { cn } from '@/lib/utils'

/** 大画布编辑页: 整屏只放路线图, 右击加节点、拖拽摆位置都在这里做 */
export function Component() {
  const { routeId } = useParams<{ routeId: string }>()
  const navigate = useNavigate()
  const editor = useRouteEditor(routeId)

  const {
    loading, notFound, error, saving, dirty, notice, meta, updateMeta,
    stages, roadmapStages, roadmapEditor, resetLayout, handleSave,
  } = editor

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    )
  }

  if (notFound || !routeId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/admin/learning-routes')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 全部路线
        </Button>
        <p className="text-sm text-muted-foreground">路线不存在或已被删除。</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-10.5rem)] min-h-[520px] flex-col gap-2 xl:h-[calc(100vh-6.5rem)]">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/learning-routes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <input
          value={meta.title}
          onChange={(e) => updateMeta({ title: e.target.value })}
          placeholder="路线标题"
          className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground"
        />
        <span className={cn('text-xs', dirty ? 'text-amber-600' : 'text-muted-foreground')}>
          {dirty ? '有未保存改动' : '已保存'}
        </span>
        <Button
          variant="outline"
          size="sm"
          title="点击切换发布状态，随「保存」生效"
          onClick={() => updateMeta({ is_published: !meta.is_published })}
        >
          {meta.is_published ? '已发布' : '草稿'}
        </Button>
        <Button variant="outline" size="sm" disabled={stages.length === 0} onClick={resetLayout}>
          <LayoutGrid className="mr-1 h-3.5 w-3.5" />
          整理布局
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/admin/learning-routes/${routeId}/edit`}>
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
            表单编辑
          </Link>
        </Button>
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          保存
        </Button>
      </div>

      {error && (
        <p className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {notice && (
        <p className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {notice}
        </p>
      )}

      <RoadmapCanvas
        className="min-h-0 flex-1"
        stages={roadmapStages}
        editor={roadmapEditor}
        fill
        maxWidth={2600}
      />

      <RouteEditorOverlays editor={editor} />
    </div>
  )
}
