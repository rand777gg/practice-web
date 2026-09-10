import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, BookmarkCheck, Check, Copy, Download, Eye, FileCode, FileDown, FileText,
  Info, LayoutTemplate, ListFilter, Pencil, Plus, Printer, RotateCcw, Search, SquareCheck,
  Table, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { topicAccent } from '@/components/topics/topic-sections'
import {
  BUILTIN_TEMPLATES, EXPORT_FIELDS, EXPORT_FORMATS, EXPORT_GROUPS, EXPORT_ORDERS,
  questionsOfSource,
  type DemoQuestion, type ExportField, type ExportFormat, type ExportTemplate,
  type QuestionSource,
} from '@/lib/export-demo'
import { buildExport, type ExportResult } from '@/lib/export-builder'
import { useExportTemplateStore } from '@/stores/export-template-store'
import { DEMO_TOPICS, topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

const FORMAT_ICONS: Record<ExportFormat, typeof FileText> = {
  markdown: FileText,
  txt: FileCode,
  csv: Table,
  html: Printer,
}

const SOURCE_META: Record<QuestionSource, { label: string; icon: typeof RotateCcw; desc: string }> = {
  wrong: { label: '错题本', icon: RotateCcw, desc: '来自错题回顾，带错误次数与错因' },
  favorite: { label: '收藏夹', icon: BookmarkCheck, desc: '来自收藏题目，带收藏时间' },
}

function formatStamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function download(result: ExportResult) {
  const blob = new Blob([result.content], { type: result.mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function QuestionRow({
  question,
  order,
  checked,
  onToggle,
}: {
  question: DemoQuestion
  order: number
  checked: boolean
  onToggle: () => void
}) {
  const topic = DEMO_TOPICS.find((item) => item.id === question.topicId)
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked ? 'border-primary/40 bg-primary/5' : 'hover:bg-accent',
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] tabular-nums text-muted-foreground">#{order}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {question.type}
          </Badge>
          {topic && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                topicAccent(topicIndexOf(question.topicId)),
              )}
            >
              {topic.name}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">难度 {question.difficulty}/5</span>
        </span>
        <span className="line-clamp-2 block text-xs leading-relaxed">{question.stem}</span>
        <span className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          {typeof question.wrongCount === 'number' && (
            <span className="text-rose-600 dark:text-rose-400">错了 {question.wrongCount} 次</span>
          )}
          {question.lastWrongAt && <span>最近 {question.lastWrongAt}</span>}
          {question.favoritedAt && <span>收藏于 {question.favoritedAt}</span>}
          <span>· {question.bankName}</span>
        </span>
      </span>
    </label>
  )
}

function TemplateCard({
  template,
  active,
  onSelect,
}: {
  template: ExportTemplate
  active: boolean
  onSelect: () => void
}) {
  const Icon = FORMAT_ICONS[template.format]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{template.name}</span>
          <Badge variant="secondary" className="text-[9px] font-normal">
            {EXPORT_FORMATS.find((item) => item.key === template.format)?.label}
          </Badge>
          {!template.builtin && (
            <Badge variant="secondary" className="border-transparent bg-violet-100 text-[9px] font-normal text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              我的
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {template.description || '未填写说明'}
        </span>
      </span>
      {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  )
}

export function Component() {
  const customTemplates = useExportTemplateStore((s) => s.templates)
  const createTemplate = useExportTemplateStore((s) => s.createTemplate)

  const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...customTemplates], [customTemplates])

  const [searchParams] = useSearchParams()
  const initialSource: QuestionSource = searchParams.get('source') === 'favorite' ? 'favorite' : 'wrong'

  const [source, setSource] = useState<QuestionSource>(initialSource)
  const [selected, setSelected] = useState<string[]>(() =>
    questionsOfSource(initialSource).map((item) => item.id),
  )
  const [query, setQuery] = useState('')
  const [topicId, setTopicId] = useState<string>('all')

  const [templateId, setTemplateId] = useState(BUILTIN_TEMPLATES[0].id)
  const [draft, setDraft] = useState<ExportTemplate>({ ...BUILTIN_TEMPLATES[0] })

  const [preview, setPreview] = useState<ExportResult | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  const pool = questionsOfSource(source)
  const keyword = query.trim().toLowerCase()
  const visible = pool.filter((question) => {
    if (topicId !== 'all' && question.topicId !== topicId) return false
    if (keyword) {
      const haystack = `${question.stem} ${question.tags.join(' ')} ${question.bankName}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    return true
  })
  const selectedQuestions = pool.filter((question) => selected.includes(question.id))
  const allVisibleSelected = visible.length > 0 && visible.every((question) => selected.includes(question.id))

  function switchSource(next: QuestionSource) {
    setSource(next)
    setSelected(questionsOfSource(next).map((item) => item.id))
    setQuery('')
    setTopicId('all')
  }

  function pickTemplate(template: ExportTemplate) {
    setTemplateId(template.id)
    setDraft({ ...template })
  }

  function toggleVisible() {
    const ids = visible.map((question) => question.id)
    setSelected((prev) =>
      allVisibleSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    )
  }

  function toggleField(field: ExportField) {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.includes(field)
        ? prev.fields.filter((item) => item !== field)
        : [...prev.fields, field],
    }))
  }

  function handlePreview() {
    setPreview(buildExport(selectedQuestions, draft, { source, generatedAt: formatStamp() }))
  }

  function handleSaveTemplate() {
    const name = saveName.trim() || '我的导出模板'
    const created = createTemplate({ ...draft, id: '', name, builtin: false })
    setSaveOpen(false)
    setSaveName('')
    pickTemplate(created)
  }

  const currentFormat = EXPORT_FORMATS.find((item) => item.key === draft.format)
  const wrongReasonAvailable = source === 'wrong'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <FileDown className="h-5 w-5 text-primary" />
          导出题目
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把错题本或收藏夹里的题目按模板导出成文件，用自己喜欢的工具复习。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            这里管的是「题目清单导出成什么格式」，和考试用的
            <Link to="/exam/templates" className="mx-1 font-medium underline">
              试卷模板
            </Link>
            是两套东西——后者负责试卷在纸上怎么排版。
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(SOURCE_META) as QuestionSource[]).map((key) => {
              const meta = SOURCE_META[key]
              const Icon = meta.icon
              const active = source === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchSource(key)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                    active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span>
                    <span className="block text-sm font-medium">
                      {meta.label}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground tabular-nums">
                        {questionsOfSource(key).length}
                      </span>
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{meta.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <Card>
            <CardContent className="space-y-3 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索题干 / 标签 / 题库"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-9" onClick={toggleVisible}>
                  <SquareCheck className="mr-1.5 h-3.5 w-3.5" />
                  {allVisibleSelected ? '取消全选' : '全选当前'}
                </Button>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  已选 {selectedQuestions.length} 题
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ListFilter className="h-3 w-3" />
                  专业课
                </span>
                <button
                  type="button"
                  onClick={() => setTopicId('all')}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    topicId === 'all'
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  全部
                </button>
                {DEMO_TOPICS.filter((topic) => pool.some((question) => question.topicId === topic.id)).map(
                  (topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setTopicId(topic.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                        topicId === topic.id
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <span className={cn('rounded px-1 text-[9px] font-bold', topicAccent(topicIndexOf(topic.id)))}>
                        {topic.short}
                      </span>
                      {topic.name}
                    </button>
                  ),
                )}
              </div>
            </CardContent>
          </Card>

          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  没有符合条件的题目。
                </CardContent>
              </Card>
            ) : (
              visible.map((question, index) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  order={index + 1}
                  checked={selected.includes(question.id)}
                  onToggle={() =>
                    setSelected((prev) =>
                      prev.includes(question.id)
                        ? prev.filter((id) => id !== question.id)
                        : [...prev, question.id],
                    )
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                导出模板
                <Link to="/export/templates" className="ml-auto text-[11px] font-normal text-primary hover:underline">
                  管理模板
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[300px] space-y-2 overflow-y-auto pt-1">
              {allTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  active={template.id === templateId}
                  onSelect={() => pickTemplate(template)}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Pencil className="h-4 w-4 text-muted-foreground" />
                本次导出设置
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                基于「{allTemplates.find((item) => item.id === templateId)?.name}」临时调整，不影响原模板
              </p>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-1">
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">文件格式</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPORT_FORMATS.map((format) => {
                    const Icon = FORMAT_ICONS[format.key]
                    return (
                      <button
                        key={format.key}
                        type="button"
                        title={format.desc}
                        onClick={() => setDraft((prev) => ({ ...prev, format: format.key }))}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                          draft.format === format.key
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {format.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">包含字段</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPORT_FIELDS.map((field) => {
                    const disabled = field.key === 'wrongReason' && !wrongReasonAvailable
                    return (
                      <button
                        key={field.key}
                        type="button"
                        disabled={disabled}
                        title={disabled ? '收藏夹没有错因字段' : field.hint}
                        onClick={() => toggleField(field.key)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          disabled
                            ? 'cursor-not-allowed border-dashed text-muted-foreground/50'
                            : draft.fields.includes(field.key)
                              ? 'border-primary bg-primary/10 font-medium text-primary'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {field.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">分组方式</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPORT_GROUPS.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, groupBy: group.key }))}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        draft.groupBy === group.key
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">题目排序</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPORT_ORDERS.map((order) => (
                    <button
                      key={order.key}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, orderBy: order.key }))}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        draft.orderBy === order.key
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {order.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2.5">
                {([
                  { key: 'includeIndex', label: '标注题号' },
                  { key: 'includeCover', label: '包含封面信息' },
                  { key: 'includeToc', label: '生成目录' },
                ] as const).map((option) => (
                  <div key={option.key} className="flex items-center justify-between gap-3">
                    <span className="text-xs">{option.label}</span>
                    <Switch
                      checked={draft[option.key]}
                      onCheckedChange={(value) => setDraft((prev) => ({ ...prev, [option.key]: value }))}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <Button size="sm" className="w-full" disabled={selectedQuestions.length === 0} onClick={handlePreview}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  预览内容
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={selectedQuestions.length === 0}
                  onClick={() => download(buildExport(selectedQuestions, draft, { source, generatedAt: formatStamp() }))}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  导出 {currentFormat?.ext?.toUpperCase()} 文件
                </Button>
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setSaveOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  另存为我的模板
                </Button>
                <p className="text-center text-[10px] text-muted-foreground">
                  DEMO：题目为内置示例数据，导出的文件可直接下载查看
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {preview && (
        <Dialog open onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-primary" />
                导出预览
              </DialogTitle>
              <DialogDescription>
                {preview.filename} · 共 {preview.questionCount} 题
              </DialogDescription>
            </DialogHeader>

            {draft.format === 'html' ? (
              <iframe
                title="导出预览"
                srcDoc={preview.content}
                className="h-[62vh] w-full rounded-lg border bg-white"
              />
            ) : (
              <pre className="h-[62vh] overflow-auto rounded-lg border bg-muted/40 p-4 text-[11px] leading-relaxed whitespace-pre-wrap">
                {preview.content}
              </pre>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  download(preview)
                  setPreview(null)
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载文件
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                关闭
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {saveOpen && (
        <Dialog open onOpenChange={(open) => !open && setSaveOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Copy className="h-4 w-4 text-primary" />
                另存为我的模板
              </DialogTitle>
              <DialogDescription>
                把当前设置保存成模板，之后在「导出模板」里可以随时复用和修改。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="save-template-name" className="text-xs">
                模板名称
              </Label>
              <Input
                id="save-template-name"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder={`${allTemplates.find((item) => item.id === templateId)?.name ?? '导出模板'} 副本`}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveTemplate}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                保存模板
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSaveOpen(false)}>
                取消
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <p className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3" />
        导出的文件只在你的浏览器里生成，不会上传服务器。
        <Link to="/export/templates" className="inline-flex items-center gap-0.5 text-primary hover:underline">
          去管理导出模板 <ArrowRight className="h-3 w-3" />
        </Link>
      </p>
    </div>
  )
}
