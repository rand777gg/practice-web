import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight, BookmarkCheck, Check, ClipboardList, ExternalLink, FileText, Info, Layers,
  LayoutTemplate, Maximize2, Printer, RotateCcw, Ruler, Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AnswerSheetPreview } from '@/components/templates/AnswerSheetPreview'
import { AnswerSheetPrintSurface } from '@/components/templates/AnswerSheetPrintSurface'
import { B4AnswerSheetStack, B4PrintSurface } from '@/components/templates/B4AnswerSheet'
import { OfficialAnswerCardStack, OfficialAnswerCardStyles } from '@/components/templates/OfficialAnswerCard'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { B4_SHEET, DEFAULT_B4_INFO, buildSheetFaces, type B4AnswerSheetInfo } from '@/lib/answer-sheet-b4'
import {
  A3_SHEET, OFFICIAL_ANSWER_CARDS, allQuestions, emptyDraft, idDigitsToText, officialCardById,
  textToIdDigits, type OfficialAnswerCard, type OfficialCardDraft,
} from '@/lib/answer-sheet-official'
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

const B4_TEMPLATE_ID = 'sheet-b4-real'
const MM_TO_PX = 96 / 25.4

/** 真实 B4 答题纸的入口卡片——与 DEMO 模板并列，但选中的是 1:1 复刻版式 */
function B4AnswerSheetCard({ active, onSelect }: { active: boolean; onSelect: () => void }) {
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
        <span className="text-sm font-semibold">自命题科目答题纸 · B4</span>
        <Badge className="border-transparent bg-emerald-100 text-[9px] font-normal text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          按真件复刻
        </Badge>
        <Badge variant="outline" className="text-[9px] font-normal">
          B4 双面
        </Badge>
        {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        B4 横向 364×257mm 上并排两张 B5，双面印刷。封面有考生编号 15 格、装订线、
        题号 / 分数 / 阅卷人评分表与注意事项；其余是空白答题页，只留装订线和「第 N 页（共{'\u3000'}页）」。
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>可填招生单位 / 考试科目</span>
        <span>页数可调</span>
        <span>按 B4 直接打印</span>
      </div>
    </button>
  )
}

/** 预览按纸宽自适应缩放：量容器宽度，换算成 mm→px 的比例，最多 1:1 */
function useSheetScale(sheetWidthMm: number, fit: boolean) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width))
    observer.observe(el)
    setBoxWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const scale = fit && boxWidth > 0 ? Math.min(1, boxWidth / (sheetWidthMm * MM_TO_PX)) : 1
  return { boxRef, scale }
}

function B4AnswerSheetPane({ info, onChange }: { info: B4AnswerSheetInfo; onChange: (next: B4AnswerSheetInfo) => void }) {
  const [fit, setFit] = useState(true)
  const [printing, setPrinting] = useState(false)

  const pages = Math.max(info.totalPages, 1)
  const faces = buildSheetFaces(pages)
  const { boxRef, scale } = useSheetScale(B4_SHEET.width, fit)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" />
            卷面信息
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            填进去的内容会直接印在封面对应位置：招生单位 / 考试科目印在两条填空线上，
            考生编号按位进左边的 15 格，姓名与报考专业竖排写在各自的线上。
            页脚的「共{'\u3000'}页」始终留空——那是考生在考场自己填的。
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 pt-1 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b4-institution" className="text-[11px] font-normal text-muted-foreground">
              招生单位代码及名称
            </Label>
            <Input
              id="b4-institution"
              value={info.institution}
              onChange={(e) => onChange({ ...info, institution: e.target.value })}
              placeholder="如 10611 重庆大学"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b4-subject" className="text-[11px] font-normal text-muted-foreground">
              考试科目代码及名称
            </Label>
            <Input
              id="b4-subject"
              value={info.subject}
              onChange={(e) => onChange({ ...info, subject: e.target.value })}
              placeholder="如 845 计算机学科专业基础"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b4-candidate-no" className="text-[11px] font-normal text-muted-foreground">
              考生编号（最多 15 位）
            </Label>
            <Input
              id="b4-candidate-no"
              value={info.candidateNo}
              onChange={(e) => onChange({ ...info, candidateNo: e.target.value.replace(/\D/g, '').slice(0, 15) })}
              placeholder="如 106112026010001"
              inputMode="numeric"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b4-candidate-name" className="text-[11px] font-normal text-muted-foreground">
              姓名
            </Label>
            <Input
              id="b4-candidate-name"
              value={info.candidateName}
              onChange={(e) => onChange({ ...info, candidateName: e.target.value })}
              placeholder="如 张三"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b4-major" className="text-[11px] font-normal text-muted-foreground">
              报考专业
            </Label>
            <Input
              id="b4-major"
              value={info.major}
              onChange={(e) => onChange({ ...info, major: e.target.value })}
              placeholder="如 计算机科学与技术"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b4-pages" className="text-[11px] font-normal text-muted-foreground">
              生成页数（不含封面）
            </Label>
            <Input
              id="b4-pages"
              type="number"
              min={1}
              max={31}
              value={Math.max(1, info.totalPages - 1)}
              onChange={(e) => onChange({ ...info, totalPages: Math.min(31, Math.max(1, Number(e.target.value) || 1)) + 1 })}
              className="h-8 w-24 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-normal text-muted-foreground">成品</span>
            <p className="flex h-8 items-center gap-1.5 text-[11px]">
              <Ruler className="h-3 w-3 text-muted-foreground" />
              {pages} 页（含封面）· {faces.length} 个 B4 面 · {Math.ceil(faces.length / 2)} 张 B4 双面
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4 text-primary" />
              预览 · 按真实 B4 尺寸
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant={fit ? 'secondary' : 'outline'} className="h-7 text-[11px]" onClick={() => setFit(true)}>
                <Maximize2 className="mr-1 h-3 w-3" />
                适应宽度
              </Button>
              <Button size="sm" variant={fit ? 'outline' : 'secondary'} className="h-7 text-[11px]" onClick={() => setFit(false)}>
                100%
              </Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={() => setPrinting(true)}>
                <Printer className="mr-1 h-3 w-3" />
                打印 / 存 PDF
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            一张 B4 横向 = 两张 B5 竖版并排；打印时按 364×257mm、边距 0 出纸，双面短边翻页。
          </p>
        </CardHeader>
        <CardContent className="pt-1">
          <div ref={boxRef} className="max-h-[70vh] overflow-auto border bg-neutral-100 p-3 dark:bg-neutral-900">
            <B4AnswerSheetStack info={info} scale={scale} />
          </div>
        </CardContent>
      </Card>

      {printing && <B4PrintSurface info={info} onClose={() => setPrinting(false)} />}
    </div>
  )
}

/** 统考答题卡入口卡片：数学 / 英语一 / 政治，原件是转曲矢量，所以走 200dpi 底图 */
function OfficialCardButton({ card, active, onSelect }: { card: OfficialAnswerCard; active: boolean; onSelect: () => void }) {
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
        <span className="text-sm font-semibold">{card.name}</span>
        <Badge variant="outline" className="text-[9px] font-normal">
          A3 × {card.faces.length} 面
        </Badge>
        {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{card.description}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>{card.subject}</span>
        <span>共 {card.totalPages} 页</span>
        <span>每面 {card.foldPanels} 折</span>
        <span className="text-primary">可点击涂卡</span>
      </div>
    </button>
  )
}

function OfficialAnswerCardPane({ card }: { card: OfficialAnswerCard }) {
  const [fit, setFit] = useState(true)
  const [printJob, setPrintJob] = useState<'filled' | 'blank' | null>(null)
  const [drafts, setDrafts] = useState<Record<string, OfficialCardDraft>>({})
  const { boxRef, scale } = useSheetScale(A3_SHEET.width, fit)

  const draft = drafts[card.id] ?? emptyDraft()
  /** 一律走函数式更新：涂卡是连点操作，用渲染时闭包里的 draft 会互相覆盖 */
  const patch = (change: (cur: OfficialCardDraft) => Partial<OfficialCardDraft>) =>
    setDrafts((all) => {
      const cur = all[card.id] ?? emptyDraft()
      return { ...all, [card.id]: { ...cur, ...change(cur) } }
    })

  const toggleAnswer = (q: number, option: number, multi: boolean) =>
    patch((cur) => {
      const list = cur.answers[q] ?? []
      const next = list.includes(option) ? list.filter((o) => o !== option) : multi ? [...list, option].sort((a, b) => a - b) : [option]
      const answers = { ...cur.answers }
      if (next.length) answers[q] = next
      else delete answers[q]
      return { answers }
    })

  const setDigit = (pos: number, digit: number) =>
    patch((cur) => {
      const idDigits = [...cur.idDigits]
      idDigits[pos] = idDigits[pos] === digit ? null : digit
      return { idDigits }
    })

  const totalQuestions = allQuestions(card).length
  const doneQuestions = Object.keys(draft.answers).length
  const idFilled = draft.idDigits.filter((d) => d !== null).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-primary" />
            {card.name}
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{card.description}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Ruler className="h-3 w-3" />
            A3 横向 420 × 294mm
          </span>
          <span>{card.faces.length} 个面 · 共 {card.totalPages} 页</span>
          <span>客观题 {totalQuestions} 题</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" />
            卷面信息与涂卡
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            报考单位 / 考生姓名会叠印在原件留白行里；准考证号按位涂成实心格。
            涂卡区直接点格子就能涂——再点一下取消，单选一题只能涂一个，多选可以涂多个。
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${card.id}-institution`} className="text-[11px] font-normal text-muted-foreground">
                报考单位
              </Label>
              <Input
                id={`${card.id}-institution`}
                value={draft.institution}
                onChange={(e) => patch(() => ({ institution: e.target.value }))}
                placeholder="如 重庆大学"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${card.id}-name`} className="text-[11px] font-normal text-muted-foreground">
                考生姓名
              </Label>
              <Input
                id={`${card.id}-name`}
                value={draft.candidateName}
                onChange={(e) => patch(() => ({ candidateName: e.target.value }))}
                placeholder="如 张三"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${card.id}-id`} className="text-[11px] font-normal text-muted-foreground">
                准考证号（15 位，按位涂卡）
              </Label>
              <Input
                id={`${card.id}-id`}
                value={idDigitsToText(draft.idDigits)}
                onChange={(e) => patch(() => ({ idDigits: textToIdDigits(e.target.value) }))}
                placeholder="如 106112026010001"
                inputMode="numeric"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums">已涂 {doneQuestions} / {totalQuestions} 题</span>
            <span className="tabular-nums">准考证号已涂 {idFilled} / 15 位</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => patch(() => ({ answers: {}, idDigits: Array.from({ length: 15 }, () => null), institution: '', candidateName: '' }))}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              清空
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4 text-primary" />
              预览 · 按真实 A3 尺寸
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant={fit ? 'secondary' : 'outline'} className="h-7 text-[11px]" onClick={() => setFit(true)}>
                <Maximize2 className="mr-1 h-3 w-3" />
                适应宽度
              </Button>
              <Button size="sm" variant={fit ? 'outline' : 'secondary'} className="h-7 text-[11px]" onClick={() => setFit(false)}>
                100%
              </Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={() => setPrintJob('filled')}>
                <Printer className="mr-1 h-3 w-3" />
                打印 / 存 PDF
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPrintJob('blank')}>
                <Printer className="mr-1 h-3 w-3" />
                打印空白卡
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            原件是字体转曲的矢量 PDF，这里按 200dpi 出图当底图；每一面就是一张 A3，折 {card.foldPanels} 折。
            打印时尺寸选 A3 横向、边距选「无」。
          </p>
        </CardHeader>
        <CardContent className="pt-1">
          <div ref={boxRef} className="max-h-[70vh] overflow-auto border bg-neutral-100 p-3 dark:bg-neutral-900">
            <OfficialAnswerCardStyles />
            <OfficialAnswerCardStack card={card} scale={scale} draft={draft} onToggleAnswer={toggleAnswer} onSetIdDigit={setDigit} />
          </div>
        </CardContent>
      </Card>

      {printJob && (
        <AnswerSheetPrintSurface pageWidthMm={A3_SHEET.width} pageHeightMm={A3_SHEET.height} sheetSelector=".official-sheet" onClose={() => setPrintJob(null)}>
          <OfficialAnswerCardStyles />
          <OfficialAnswerCardStack card={card} draft={printJob === 'filled' ? draft : undefined} />
        </AnswerSheetPrintSurface>
      )}
    </div>
  )
}

function AnswerSheetTab() {
  const [activeId, setActiveId] = useState(B4_TEMPLATE_ID)
  const [b4Info, setB4Info] = useState(DEFAULT_B4_INFO)
  const official = officialCardById(activeId)
  const isB4 = activeId === B4_TEMPLATE_ID
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
            前四个是按真件复刻的：自命题科目答题纸按 B4，数学 / 英语一 / 政治三张统考答题卡按 A3，
            都能直接原尺寸打印；最后四个 DEMO 模板是示例数据。
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-2.5">
          <B4AnswerSheetCard active={isB4} onSelect={() => setActiveId(B4_TEMPLATE_ID)} />
          {OFFICIAL_ANSWER_CARDS.map((card) => (
            <OfficialCardButton key={card.id} card={card} active={card.id === activeId} onSelect={() => setActiveId(card.id)} />
          ))}
          {ANSWER_SHEET_TEMPLATES.map((template) => (
            <AnswerSheetCard
              key={template.id}
              template={template}
              active={template.id === activeId}
              onSelect={() => setActiveId(template.id)}
            />
          ))}
        </div>

        {isB4 && <B4AnswerSheetPane info={b4Info} onChange={setB4Info} />}
        {official && <OfficialAnswerCardPane card={official} />}
        {!isB4 && !official && (
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
        )}
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
