import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, Copy, FileCode, FileDown, FileText, Info, LayoutTemplate, Lock,
  Pencil, Plus, Printer, Sparkles, Table, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import {
  BUILTIN_TEMPLATES, EXPORT_FIELDS, EXPORT_FORMATS, EXPORT_GROUPS, EXPORT_ORDERS,
  blankTemplate,
  type ExportField, type ExportFormat, type ExportTemplate,
} from '@/lib/export-demo'
import { useExportTemplateStore } from '@/stores/export-template-store'
import { cn } from '@/lib/utils'

const FORMAT_ICONS: Record<ExportFormat, typeof FileText> = {
  markdown: FileText,
  txt: FileCode,
  csv: Table,
  html: Printer,
}

function formatLabel(key: ExportFormat): string {
  return EXPORT_FORMATS.find((item) => item.key === key)?.label ?? key
}

function fieldLabels(fields: ExportField[]): string {
  return fields
    .map((field) => EXPORT_FIELDS.find((item) => item.key === field)?.label ?? field)
    .join(' · ')
}

function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  template: ExportTemplate
  onEdit?: () => void
  onDuplicate: () => void
  onRemove?: () => void
}) {
  const Icon = FORMAT_ICONS[template.format]
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              template.builtin
                ? 'bg-primary/10 text-primary'
                : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{template.name}</span>
              <Badge variant="secondary" className="shrink-0 text-[9px] font-normal">
                {formatLabel(template.format)}
              </Badge>
              {template.builtin ? (
                <Badge variant="secondary" className="shrink-0 gap-0.5 text-[9px] font-normal">
                  <Lock className="h-2.5 w-2.5" />
                  内置
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0 border-transparent bg-violet-100 text-[9px] font-normal text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  我的
                </Badge>
              )}
            </div>
            {template.createdAt && (
              <p className="text-[10px] text-muted-foreground">创建于 {template.createdAt}</p>
            )}
          </div>
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {template.description || '未填写说明'}
        </p>

        <div className="space-y-1 text-[11px] text-muted-foreground">
          <p>
            <span className="text-muted-foreground/70">字段：</span>
            {fieldLabels(template.fields) || '未选择'}
          </p>
          <p>
            <span className="text-muted-foreground/70">分组：</span>
            {EXPORT_GROUPS.find((item) => item.key === template.groupBy)?.label}
            <span className="mx-1">·</span>
            <span className="text-muted-foreground/70">排序：</span>
            {EXPORT_ORDERS.find((item) => item.key === template.orderBy)?.label}
          </p>
          <p>
            {[
              template.includeIndex ? '含题号' : null,
              template.includeCover ? '含封面' : null,
              template.includeToc ? '含目录' : null,
            ]
              .filter(Boolean)
              .join(' · ') || '无附加项'}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {onEdit && (
            <Button size="sm" variant="outline" className="h-7" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" />
              编辑
            </Button>
          )}
          <Button size="sm" variant={template.builtin ? 'outline' : 'ghost'} className="h-7" onClick={onDuplicate}>
            <Copy className="mr-1 h-3 w-3" />
            {template.builtin ? '以此为模板新建' : '复制'}
          </Button>
          {onRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-rose-600 hover:text-rose-600 dark:text-rose-400"
              title="删除后不可恢复"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TemplateEditor({
  draft,
  onChange,
  onClose,
  onSave,
  isNew,
}: {
  draft: ExportTemplate
  onChange: (template: ExportTemplate) => void
  onClose: () => void
  onSave: () => void
  isNew: boolean
}) {
  function toggleField(field: ExportField) {
    onChange({
      ...draft,
      fields: draft.fields.includes(field)
        ? draft.fields.filter((item) => item !== field)
        : [...draft.fields, field],
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {isNew ? '新建导出模板' : '编辑导出模板'}
          </DialogTitle>
          <DialogDescription>
            模板只决定题目清单怎么写进文件，不涉及试卷排版——那部分请用试卷模板。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name" className="text-xs">
                模板名称
              </Label>
              <Input
                id="tpl-name"
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">文件格式</Label>
              <div className="flex flex-wrap gap-1.5">
                {EXPORT_FORMATS.map((format) => {
                  const Icon = FORMAT_ICONS[format.key]
                  return (
                    <button
                      key={format.key}
                      type="button"
                      title={format.desc}
                      onClick={() => onChange({ ...draft, format: format.key })}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-desc" className="text-xs">
              模板说明
            </Label>
            <Textarea
              id="tpl-desc"
              rows={2}
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              placeholder="说明这个模板适合什么场景"
              className="text-sm"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-medium">包含字段</p>
            <div className="flex flex-wrap gap-1.5">
              {EXPORT_FIELDS.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  title={field.hint}
                  onClick={() => toggleField(field.key)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    draft.fields.includes(field.key)
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {field.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              「我的错因」只在导出错题本时有效，导出收藏夹会自动跳过。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium">分组方式</p>
              <div className="flex flex-wrap gap-1.5">
                {EXPORT_GROUPS.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => onChange({ ...draft, groupBy: group.key })}
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
            <div className="space-y-2">
              <p className="text-xs font-medium">题目排序</p>
              <div className="flex flex-wrap gap-1.5">
                {EXPORT_ORDERS.map((order) => (
                  <button
                    key={order.key}
                    type="button"
                    onClick={() => onChange({ ...draft, orderBy: order.key })}
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
                  onCheckedChange={(value) => onChange({ ...draft, [option.key]: value })}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onSave}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              保存模板
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <span className="text-[11px] text-muted-foreground">DEMO：模板保存在本地浏览器</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Component() {
  const templates = useExportTemplateStore((s) => s.templates)
  const createTemplate = useExportTemplateStore((s) => s.createTemplate)
  const updateTemplate = useExportTemplateStore((s) => s.updateTemplate)
  const removeTemplate = useExportTemplateStore((s) => s.removeTemplate)

  const [editorDraft, setEditorDraft] = useState<ExportTemplate | null>(null)
  const [editorIsNew, setEditorIsNew] = useState(false)

  function openNew(base?: ExportTemplate) {
    setEditorIsNew(true)
    setEditorDraft(base ? { ...base, id: '', name: `${base.name} 副本`, builtin: false } : blankTemplate())
  }

  function handleSave() {
    if (!editorDraft) return
    if (editorIsNew) createTemplate(editorDraft)
    else updateTemplate(editorDraft)
    setEditorDraft(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          导出模板
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          定义「错题 / 收藏题导出的文件长什么样」：格式、字段、分组与排序。做好后可在导出页直接套用。
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            和「试卷模板」的区别
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <FileDown className="h-3.5 w-3.5" />
              导出模板（当前页）
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              管的是<b className="font-medium text-foreground">题目清单导出成什么文件</b>：Markdown / 文本 / CSV / 可打印网页，
              包含哪些字段、按什么分组排序。作用是复习与整理。
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              试卷模板
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              管的是<b className="font-medium text-foreground">试卷在纸上怎么排版</b>：封面、分区、字号行距、页边距、答题栏。
              作用是出卷与打印。
            </p>
            <Link
              to="/exam/templates"
              className="mt-2 inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
            >
              前往试卷模板（模板画布） <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">
            内置模板
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {BUILTIN_TEMPLATES.length} 个 · 不可修改
            </span>
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {BUILTIN_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} onDuplicate={() => openNew(template)} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">
            我的模板
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {templates.length} 个
            </span>
          </h2>
          <Button size="sm" className="ml-auto h-7" onClick={() => openNew()}>
            <Plus className="mr-1 h-3 w-3" />
            新建模板
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                还没有自己的模板。可以从上面任意一个内置模板「以此为模板新建」。
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => {
                  setEditorIsNew(false)
                  setEditorDraft({ ...template })
                }}
                onDuplicate={() => openNew(template)}
                onRemove={() => removeTemplate(template.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-[11px] text-muted-foreground">
          <FileDown className="h-3.5 w-3.5" />
          模板在导出页套用后还能临时微调，不影响模板本身；想长期保留就「另存为我的模板」。
          <Link to="/export" className="inline-flex items-center gap-0.5 text-primary hover:underline">
            去导出题目 <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>

      {editorDraft && (
        <TemplateEditor
          draft={editorDraft}
          isNew={editorIsNew}
          onChange={setEditorDraft}
          onClose={() => setEditorDraft(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
