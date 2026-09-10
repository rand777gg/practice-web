import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight, BookmarkCheck, Check, ClipboardList, ExternalLink, FileText, Info, Layers,
  LayoutTemplate, Printer, RotateCcw, Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AnswerSheetPreview } from '@/components/templates/AnswerSheetPreview'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import {
  ANSWER_SHEET_TEMPLATES, KIND_LABEL, type AnswerSheetTemplate,
} from '@/lib/answer-sheet-demo'
import {
  BUILTIN_TEMPLATES, EXPORT_FIELDS, EXPORT_FORMATS, templateAppliesTo,
  type ExportTemplate, type QuestionSource,
} from '@/lib/export-demo'
import { BUILTIN_EXAM_TEMPLATES, totalQuestions, totalScore } from '@/lib/exam-presets'
import { useExportTemplateStore } from '@/stores/export-template-store'
import { cn } from '@/lib/utils'

type TabKey = 'exam' | 'wrong' | 'favorite' | 'answer-sheet'

const TABS: { key: TabKey; label: string; icon: typeof FileText; desc: string }[] = [
  { key: 'exam', label: '考试模板', icon: FileText, desc: '决定试卷本身怎么排版：封面、分区、字号行距、页边距' },
  { key: 'wrong', label: '错题模板', icon: RotateCcw, desc: '决定错题导出成什么文件：格式、字段、分组与排序' },
  { key: 'favorite', label: '收藏模板', icon: BookmarkCheck, desc: '决定收藏题导出成什么文件，通常比错题版更轻' },
  { key: 'answer-sheet', label: '答题卡模板', icon: ClipboardList, desc: '决定学生作答区：涂卡格规格与主观题答题行数' },
]

function formatLabel(key: ExportTemplate['format']): string {
  return EXPORT_FORMATS.find((item) => item.key === key)?.label ?? key
}

function ExportTemplateCard({ template, source }: { template: ExportTemplate; source: QuestionSource }) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{template.name}</span>
          <Badge variant="secondary" className="text-[9px] font-normal">
            {formatLabel(template.format)}
          </Badge>
          {template.builtin ? (
            <Badge variant="secondary" className="text-[9px] font-normal">
              内置
            </Badge>
          ) : (
            <Badge variant="secondary" className="border-transparent bg-violet-100 text-[9px] font-normal text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              我的
            </Badge>
          )}
          {templateAppliesTo(template).length === 1 && (
            <Badge variant="outline" className="text-[9px] font-normal">
              {templateAppliesTo(template)[0] === 'wrong' ? '错题专用' : '收藏专用'}
            </Badge>
          )}
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{template.description}</p>

        <div className="flex flex-wrap gap-1">
          {template.fields.map((field) => (
            <span key={field} className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {EXPORT_FIELDS.find((item) => item.key === field)?.label ?? field}
            </span>
          ))}
        </div>

        <Button asChild size="sm" variant="outline" className="mt-auto h-7 w-fit">
          <Link to={`/export?source=${source}`}>
            用它导出 <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function ExportTemplateTab({ source, tabLabel }: { source: QuestionSource; tabLabel: string }) {
  const customTemplates = useExportTemplateStore((s) => s.templates)
  const templates = [...BUILTIN_TEMPLATES, ...customTemplates].filter((template) =>
    templateAppliesTo(template).includes(source),
  )
  const owned = templates.filter((template) => templateAppliesTo(template).length === 1).length

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs leading-relaxed">
            {tabLabel}管的是
            <b className="font-medium text-foreground">
              {source === 'wrong' ? '错题本' : '收藏夹'}导出成什么文件
            </b>
            ：文件格式、包含哪些字段、按什么分组排序。它不涉及试卷排版，也不涉及答题卡。
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Link to={`/export?source=${source}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
              直接去导出{source === 'wrong' ? '错题' : '收藏题'} <ArrowRight className="h-3 w-3" />
            </Link>
            <span>·</span>
            <Link to="/export/templates" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              管理导出模板 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          可用模板
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            {templates.length} 个 · 其中 {owned} 个是 {source === 'wrong' ? '错题' : '收藏'}专用
          </span>
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <ExportTemplateCard key={template.id} template={template} source={source} />
        ))}
      </div>
    </div>
  )
}

function ExamTemplateTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            考试模板管什么
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <p className="text-xs leading-relaxed">
            考试模板决定
            <b className="font-medium text-foreground">一份试卷在纸上长什么样</b>
            ：封面内容、分区结构、每题分值、字号行距与页边距。它的产物是一张可打印的试卷，
            和「题目导出成 Markdown / CSV」是两件事。
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { title: '考试模板', desc: '试卷排版：封面、分区、字号、边距', now: true },
              { title: '导出模板', desc: '题目清单导出：格式、字段、分组', now: false },
              { title: '答题卡模板', desc: '作答区：涂卡格与答题行规格', now: false },
            ].map((item) => (
              <div
                key={item.title}
                className={cn(
                  'rounded-lg border p-2.5',
                  item.now ? 'border-primary/40 bg-primary/5' : '',
                )}
              >
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  {item.now && <Check className="h-3 w-3 text-primary" />}
                  {item.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link to="/exam/templates">
                打开模板画布 <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <span className="text-[11px] text-muted-foreground">
              在画布上点选文字即可就地调字号、对齐与页边距
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          内置预设
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            {BUILTIN_EXAM_TEMPLATES.length} 个
          </span>
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BUILTIN_EXAM_TEMPLATES.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold">{template.name}</span>
                <Badge variant="secondary" className="text-[9px] font-normal">
                  内置
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {template.sections.length} 个分区
                </span>
                <span className="tabular-nums">共 {totalQuestions(template.sections)} 题</span>
                <span className="tabular-nums">满分 {totalScore(template.sections)} 分</span>
                <span className="tabular-nums">{template.duration_min} 分钟</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {template.sections.map((section) => (
                  <span key={section.id} className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {section.type ?? '不限'} × {section.count}
                  </span>
                ))}
              </div>
              <Button asChild size="sm" variant="outline" className="mt-auto h-7 w-fit">
                <Link to="/exam/templates">
                  进入画布 <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function AnswerSheetCard({
  template,
  active,
  onSelect,
}: {
  template: AnswerSheetTemplate
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3.5 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold">{template.name}</span>
        <Badge variant="secondary" className="text-[9px] font-normal">
          {KIND_LABEL[template.kind]}
        </Badge>
        <Badge variant="outline" className="text-[9px] font-normal">
          {template.paperSize}
        </Badge>
        {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{template.description}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {template.objectiveCount > 0 && (
          <span>
            客观 {template.objectiveCount} 题 · {template.optionCount} 选项 · {template.columns} 栏
          </span>
        )}
        {template.subjectiveCount > 0 && (
          <span>
            主观 {template.subjectiveCount} 题 · 每题 {template.linesPerQuestion} 行
          </span>
        )}
      </div>
    </button>
  )
}

function AnswerSheetTab() {
  const [activeId, setActiveId] = useState(ANSWER_SHEET_TEMPLATES[0].id)
  const active = ANSWER_SHEET_TEMPLATES.find((item) => item.id === activeId) ?? ANSWER_SHEET_TEMPLATES[0]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs leading-relaxed">
            答题卡模板只描述
            <b className="font-medium text-foreground">学生在哪里作答</b>
            ：客观题的涂卡格规格（题量、选项数、分栏）与主观题的答题行数、得分框。
            它和考试模板配合使用——考试模板出卷，答题卡模板出卡。
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Printer className="h-3 w-3" />
            正式版可把答题卡与试卷合并导出成一个 PDF，双面打印后直接成套使用。
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-2.5">
          {ANSWER_SHEET_TEMPLATES.map((template) => (
            <AnswerSheetCard
              key={template.id}
              template={template}
              active={template.id === active.id}
              onSelect={() => setActiveId(template.id)}
            />
          ))}
        </div>

        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <ClipboardList className="h-4 w-4 text-primary" />
              预览 · {active.name}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              按真实纸张呈现，白底直角；实际打印时按 {active.paperSize} 尺寸输出
            </p>
          </CardHeader>
          <CardContent className="max-h-[62vh] overflow-auto pt-1">
            <AnswerSheetPreview template={active} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function Component() {
  const { tab } = useParams<{ tab?: string }>()
  const activeTab: TabKey = TABS.some((item) => item.key === tab) ? (tab as TabKey) : 'exam'
  const meta = TABS.find((item) => item.key === activeTab)!

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          模板
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          四类模板集中在这里：考试模板管试卷排版，错题 / 收藏模板管题目导出，答题卡模板管作答区。
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = item.key === activeTab
          return (
            <Link
              key={item.key}
              to={`/templates/${item.key}`}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
              )}
            >
              <p className={cn('flex items-center gap-1.5 text-xs font-medium', active && 'text-primary')}>
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>
            </Link>
          )
        })}
      </div>

      {activeTab === 'exam' && <ExamTemplateTab />}
      {activeTab === 'wrong' && <ExportTemplateTab source="wrong" tabLabel="错题模板" />}
      {activeTab === 'favorite' && <ExportTemplateTab source="favorite" tabLabel="收藏模板" />}
      {activeTab === 'answer-sheet' && <AnswerSheetTab />}

      <p className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3" />
        {meta.desc}
        <Link to="/export/templates" className="inline-flex items-center gap-0.5 text-primary hover:underline">
          导出模板管理 <ArrowRight className="h-3 w-3" />
        </Link>
        <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3 w-3" />
          DEMO：答题卡模板与部分预设为示例数据
        </span>
      </p>
    </div>
  )
}
