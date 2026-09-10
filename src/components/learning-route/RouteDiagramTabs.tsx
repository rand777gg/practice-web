import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Download, Loader2, Network, RotateCw, Save, Shapes } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DrawioFigure, type DrawioFigureHandle } from '@/components/learning-route/DrawioFigure'
import { RouteMapFigure, type RouteMapNodeState, type RouteMapStageNode } from '@/components/learning-route/RouteMapFigure'
import { buildRouteDiagramXml, diagramFileName } from '@/lib/route-map/drawio'

interface Props {
  /** 路线标题, 用于 draw.io 兜底图与 archify 图 */
  title: string
  stages: RouteMapStageNode[]
  /** archify 侧节点着色(阶段 id -> 状态) */
  state?: Record<string, RouteMapNodeState>
  /** 已保存的 draw.io 数据(learning_routes.diagram_xml) */
  diagramXml?: string | null
  /** 内嵌 draw.io 编辑器(管理员); false = 只读浏览 */
  editable?: boolean
  /** 保存画布到路线; 不传(如新建路线)时只保留「重新生成/下载」 */
  onSaveDiagram?: (xml: string) => Promise<void>
  /** 传给 DrawioFigure 的 ref, 供外层「保存路线」时取回画布数据 */
  editorRef?: RefObject<DrawioFigureHandle | null>
  height?: number
  className?: string
}

/**
 * 学习路线图区: draw.io 为主视图, 原 archify 路线图作为并列 tab 保留(开发中)。
 * 两个 tab 一旦访问过就常驻挂载 —— 切 tab 不会丢掉 draw.io 未保存的改动,
 * archify 也只需编译一次。
 */
export function RouteDiagramTabs({
  title, stages, state, diagramXml, editable = false, onSaveDiagram, editorRef, height = 620, className,
}: Props) {
  const [tab, setTab] = useState('drawio')
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({ drawio: true })
  const savedXml = diagramXml ?? null
  /** 本地草稿只在来源版本未变时生效, 库里数据刷新后自动作废 */
  const [draft, setDraft] = useState<{ from: string | null; xml: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const statusTimer = useRef<number | undefined>(undefined)

  const flash = useCallback((text: string) => {
    setStatus(text)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(''), 2600)
  }, [])
  useEffect(() => () => window.clearTimeout(statusTimer.current), [])

  const keepDraft = useCallback((xml: string) => setDraft({ from: savedXml, xml }), [savedXml])

  const handleTabChange = useCallback(async (next: string) => {
    // 离开 draw.io 前把画布内容取回本地草稿, 不依赖 iframe 存活
    if (tab === 'drawio' && next !== 'drawio' && editable) {
      const current = await editorRef?.current?.exportXml()
      if (current) keepDraft(current)
    }
    setMountedTabs((prev) => (prev[next] ? prev : { ...prev, [next]: true }))
    setTab(next)
  }, [tab, editable, editorRef, keepDraft])

  const effectiveXml = draft && draft.from === savedXml ? draft.xml : savedXml
  const fallbackXml = stages.length > 0 ? buildRouteDiagramXml({ title, stages }) : ''

  const handleEditorSave = useCallback(async (xml: string) => {
    keepDraft(xml)
    if (!onSaveDiagram) return
    setBusy(true)
    try {
      await onSaveDiagram(xml)
      flash('已保存到路线')
    } catch (err) {
      console.error(err)
      flash('保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }, [onSaveDiagram, keepDraft, flash])

  const handleSaveFromToolbar = useCallback(async () => {
    const xml = await editorRef?.current?.exportXml()
    if (!xml) {
      flash('没能从 draw.io 取回内容，请在编辑器里用 Save 或 Ctrl+S')
      return
    }
    await handleEditorSave(xml)
  }, [editorRef, handleEditorSave, flash])

  const handleRegenerate = useCallback(() => {
    if (stages.length === 0) return
    const generated = buildRouteDiagramXml({ title, stages })
    keepDraft(generated)
    editorRef?.current?.loadXml(generated)
    flash('已按当前阶段重新生成，保存后生效')
  }, [title, stages, editorRef, keepDraft, flash])

  const handleDownload = useCallback(async () => {
    const xml = await editorRef?.current?.exportXml()
    const content = xml ?? effectiveXml ?? fallbackXml
    if (!content) return
    const url = URL.createObjectURL(new Blob([content], { type: 'application/xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = diagramFileName(title)
    a.click()
    URL.revokeObjectURL(url)
  }, [editorRef, effectiveXml, fallbackXml, title])

  const keepMounted = (value: string) => (mountedTabs[value] ? true : undefined)

  const actions: ReactNode = editable ? (
    <div className="flex flex-wrap items-center gap-2">
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
      {onSaveDiagram && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleSaveFromToolbar()}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          保存图
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={stages.length === 0} onClick={handleRegenerate}>
        <RotateCw className="mr-1 h-3.5 w-3.5" />
        按阶段重画
      </Button>
      <Button variant="outline" size="sm" onClick={() => void handleDownload()}>
        <Download className="mr-1 h-3.5 w-3.5" />
        下载 .drawio
      </Button>
    </div>
  ) : null

  return (
    <Tabs value={tab} onValueChange={(v) => void handleTabChange(v)} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="drawio">
            <Shapes className="mr-1.5 h-3.5 w-3.5" />
            draw.io 路线图
          </TabsTrigger>
          <TabsTrigger value="archify">
            <Network className="mr-1.5 h-3.5 w-3.5" />
            archify 路线图
            <Badge variant="secondary" className="ml-1.5 border-0 bg-amber-500/15 text-[10px] text-amber-600">
              开发中
            </Badge>
          </TabsTrigger>
        </TabsList>
        {actions}
      </div>

      <TabsContent value="drawio" forceMount={keepMounted('drawio')} className="mt-3">
        <DrawioFigure
          ref={editorRef}
          xml={effectiveXml}
          fallbackXml={fallbackXml}
          editable={editable}
          onSave={editable ? (xml) => void handleEditorSave(xml) : undefined}
          height={height}
        />
        {editable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            draw.io 内可用工具栏 Save 或 Ctrl+S 直接存到本路线；点「保存路线」也会一并提交画布内容。
          </p>
        ) : !diagramXml && stages.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            该路线还没配置专属路线图，当前展示按阶段自动生成的示意图。
          </p>
        ) : null}
      </TabsContent>

      <TabsContent value="archify" forceMount={keepMounted('archify')} className="mt-3">
        <RouteMapFigure title={title} stages={stages} state={state} height={height} />
        <p className="mt-2 text-xs text-muted-foreground">
          archify 路线图仍在开发中，进度着色与交互可能与最终形态有差异，正式版以 draw.io 路线图为准。
        </p>
      </TabsContent>
    </Tabs>
  )
}
