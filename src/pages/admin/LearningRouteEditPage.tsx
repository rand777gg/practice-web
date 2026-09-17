import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteDiagramTabs } from '@/components/learning-route/RouteDiagramTabs'
import { RouteEditorOverlays } from '@/components/learning-route/RouteEditorOverlays'
import { questionPreview, useRouteEditor } from '@/hooks/use-route-editor'
import { saveRouteDiagram } from '@/hooks/use-learning-routes'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import { ArrowDown, ArrowLeft, ArrowUp, Maximize2, Map as MapIcon, Plus, Save, Trash2 } from 'lucide-react'

export function Component() {
  const { routeId } = useParams<{ routeId: string }>()
  const navigate = useNavigate()
  const editor = useRouteEditor(routeId)
  const [showMap, setShowMap] = useState(Boolean(routeId))

  const {
    isNew, loading, notFound, error, saving, dirty, notice, meta, updateMeta,
    stages, updateStage, addStage, moveStage, removeStage, moveItem, removeItem,
    diagramXml, drawioRef, roadmapStages, roadmapEditor, handleSave,
  } = editor

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" disabled>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-16 w-full" />
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/learning-routes')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">编辑学习路线</h1>
        </div>
        <p className="text-sm text-muted-foreground">路线不存在或已被删除</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/learning-routes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="min-w-0 flex-1 text-xl font-bold">
          {isNew ? '新建学习路线' : '编辑学习路线'}
        </h1>
        {dirty && <span className="text-xs text-muted-foreground">有未保存改动</span>}
        {routeId && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/admin/learning-routes/${routeId}/canvas`}>
              <Maximize2 className="mr-1 h-3.5 w-3.5" />
              大画布编辑
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          title="点击切换发布状态，随「保存路线」生效"
          onClick={() => updateMeta({ is_published: !meta.is_published })}
        >
          {meta.is_published ? '已发布' : '草稿'}
        </Button>
        {stages.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
            <MapIcon className="mr-1 h-3.5 w-3.5" />
            {showMap ? '收起路线图' : '路线图'}
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {notice && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {notice}
        </p>
      )}

      {showMap && stages.length > 0 && (
        <RouteDiagramTabs
          title={meta.title || '路线图预览'}
          stages={stages.map((s, i) => ({
            id: s.id ?? `preview-${i}`,
            label: s.title || `阶段${i + 1}`,
            sublabel: `${s.items.length} 题`,
          }))}
          roadmap={roadmapStages}
          roadmapEditor={roadmapEditor}
          diagramXml={diagramXml}
          editable
          editorRef={drawioRef}
          onSaveDiagram={routeId ? (xml) => saveRouteDiagram(routeId, xml) : undefined}
          height={560}
        />
      )}

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">标题</Label>
          <Input
            value={meta.title}
            placeholder="给学习路线起个名字，如：高等数学基础强化"
            onChange={(e) => updateMeta({ title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">简介</Label>
          <Textarea
            rows={3}
            value={meta.description}
            placeholder="说明这条路线适合谁、覆盖哪些内容、预计用时…"
            onChange={(e) => updateMeta({ description: e.target.value })}
          />
        </div>
      </div>

      {stages.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
          还没有阶段，点击下方「添加阶段」开始编排题目。
        </p>
      )}

      {stages.map((stage, si) => (
        <div
          key={stage.id ?? `local-${stage.localKey ?? si}`}
          className="overflow-hidden rounded-xl border bg-card"
        >
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">阶段 {si + 1}</span>
            <Input
              className="h-8 flex-1 font-medium"
              value={stage.title}
              onChange={(e) => updateStage(si, { title: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={si === 0}
              title="上移阶段"
              onClick={() => moveStage(si, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={si === stages.length - 1}
              title="下移阶段"
              onClick={() => moveStage(si, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="删除阶段"
              onClick={() => removeStage(si)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-3 px-4 py-3">
            <Textarea
              rows={2}
              className="text-xs"
              value={stage.description}
              placeholder="阶段简介（可选）"
              onChange={(e) => updateStage(si, { description: e.target.value })}
            />
            {stage.items.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {stage.items.map((item, ii) => (
                  <li key={item.itemId ?? item.questionId} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {ii + 1}
                    </span>
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                      {item.question
                        ? QUESTION_TYPE_LABELS[item.question.question_type] || item.question.question_type
                        : '题目'}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.question ? questionPreview(item.question) : item.questionId}>
                      {item.question ? questionPreview(item.question) : item.questionId}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={ii === 0}
                      title="上移题目"
                      onClick={() => moveItem(si, ii, -1)}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={ii === stage.items.length - 1}
                      title="下移题目"
                      onClick={() => moveItem(si, ii, 1)}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="移除题目"
                      onClick={() => removeItem(si, ii)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={() => editor.setPickerStage(si)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加题目
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full" onClick={addStage}>
        <Plus className="mr-1 h-4 w-4" />
        添加阶段
      </Button>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/learning-routes')}>
          取消
        </Button>
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? (
            '保存中…'
          ) : (
            <>
              <Save className="mr-1 h-3.5 w-3.5" />
              保存路线
            </>
          )}
        </Button>
      </div>

      <RouteEditorOverlays editor={editor} />
    </div>
  )
}
