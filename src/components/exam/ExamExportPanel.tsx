/**
 * 导出试卷面板(ExamExportPanel)
 * 放在「考试模式」开始页一个独立 Tab(历史 之后):
 *   选模板 → 生成一套真实题库试卷 → 用现成真卷面(PaperPreview / PaperSpreadView)预览
 *   → 导出 Word(.docx) / HTML / 打印·PDF。
 *
 * 预览与打印直接复用 app 自身的 A4 卷面排版(模板的封面 / 纸张 / 边距 / 字族 token),
 * 因此导出观感与 /exam/templates、考试卷面一致, 不再是另一套样式。
 * .docx 本质是 Word 文档, 用排版整洁的卷(标题居中 + 分区 + 连续题号)近似。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ExamTemplatePanel } from './ExamTemplatePanel'
import { PaperPreview } from './PaperPreview'
import { useT } from '@/i18n/use-t'
import { FileText, Printer, RefreshCcw, Sparkles, Download, CheckCircle2, AlertTriangle, Columns2, X } from 'lucide-react'
import type { ExamTemplate } from '@/types'
import type { PaperSection } from '@/lib/exam-compose'
import { buildPaperDoc } from '@/lib/exam-export/paper'
import { composeForExport } from '@/lib/exam-export/compose'
import { buildHtmlDocument } from '@/lib/exam-export/html'
import { buildDocxBlob } from '@/lib/exam-export/docx'
import { downloadBlob } from '@/lib/exam-export/download'
import { cn } from '@/lib/utils'

export function ExamExportPanel({ userId }: { userId: string }) {
  const { t } = useT()

  const [template, setTemplate] = useState<ExamTemplate | null>(null)
  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])

  const [generating, setGenerating] = useState(false)
  /** 生成后的一组真实题目卷面分区(真卷预览/导出的唯一数据源) */
  const [sections, setSections] = useState<PaperSection[] | null>(null)
  const [error, setError] = useState('')
  const [insufficient, setInsufficient] = useState(false)
  const [genCount, setGenCount] = useState<number | null>(null)

  const [exporting, setExporting] = useState<'docx' | 'html' | null>(null)
  const [exported, setExported] = useState<Set<'docx' | 'html'>>(new Set())
  const [printOpen, setPrintOpen] = useState(false)
  /** 卷面预览形态: 单页长卷(sheet) / 双页摊开(spread) */
  const [previewView, setPreviewView] = useState<'sheet' | 'spread'>('sheet')
  /** 导出/打印/预览是否显示分值(打分框); 关掉则隐藏分值相关 */
  const [showScore, setShowScore] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadFilters() {
      const { data } = await supabase.from('questions').select('subject, category')
      if (cancelled) return
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      setSubjects([...subs].sort())
      setCategories([...cats].sort())
    }
    loadFilters()
    return () => { cancelled = true }
  }, [])

  /** 卷首标题与抬头: 与 /exam/templates / 开考卷一致(有封面大标题优先) */
  const title = useMemo(() => {
    const c = template?.cover
    if (c?.title?.trim()) return c.title.trim()
    if (c?.examName?.trim()) return c.examName.trim()
    return template?.name?.trim() || ''
  }, [template])

  const meta = useMemo(() => {
    if (!template) return ''
    const parts: string[] = []
    if (template.subject?.length) parts.push(template.subject.join('、'))
    if (template.duration_min > 0) parts.push(`${template.duration_min} ${t('exam.minutes')}`)
    return parts.join(' · ')
  }, [template, t])

  const fileName = template?.name?.trim() || '试卷'

  /** 生效版式: 关掉分值时分发一份 scoreBox:'none' 的副本(隐藏真卷打分框) */
  const effPaperLayout = useMemo(() => {
    if (!template?.layout) return template?.layout ?? null
    if (showScore) return template.layout
    return { ...template.layout, scoreBox: 'none' as const }
  }, [template, showScore])

  const regenerate = useCallback(async () => {
    if (!template) {
      setError(t('examExport.needTemplate'))
      return
    }
    setGenerating(true)
    setError('')
    setInsufficient(false)
    setSections(null)
    setGenCount(null)
    setExported(new Set())
    try {
      const out = await composeForExport(template)
      if (!out) {
        setError(t('examExport.genFailed'))
        return
      }
      if (out.sections.length === 0) {
        setError(t('examExport.emptyQuestion'))
        return
      }
      setSections(out.sections)
      setGenCount(out.sections.reduce((a, s) => a + s.questions.length, 0))
      if (out.stats?.some((s) => s.got < s.requested)) setInsufficient(true)
    } catch {
      setError(t('examExport.genFailed'))
    } finally {
      setGenerating(false)
    }
  }, [template, t])

  const buildDoc = useCallback(() => {
    if (!sections || !template) return null
    return buildPaperDoc(sections, {
      template,
      subjectLabel: template.subject?.length ? template.subject.join('、') : null,
      durationMin: template.duration_min || 0,
    })
  }, [sections, template])

  const runFileExport = useCallback(
    async (kind: 'docx' | 'html') => {
      if (exporting) return
      const doc = buildDoc()
      if (!doc) return
      setExporting(kind)
      setError('')
      try {
        if (kind === 'docx') {
          const blob = await buildDocxBlob(doc)
          downloadBlob(blob, `${fileName}.docx`)
          setExported((prev) => new Set(prev).add('docx'))
        } else {
          const html = buildHtmlDocument(doc)
          downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${fileName}.html`)
          setExported((prev) => new Set(prev).add('html'))
        }
      } catch {
        setError(t('examExport.exportFailed'))
      } finally {
        setExporting(null)
      }
    },
    [exporting, buildDoc, fileName, t],
  )

  const openPrint = () => {
    if (!sections || !template) return
    setPrintOpen(true)
  }

  const hasPaper = !!sections && !!template && sections.length > 0

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
      {/* 左:模板 + 生成 + 导出入口 */}
      <Card className="min-w-0 overflow-hidden xl:sticky xl:top-24">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="space-y-1">
            <h2 className="flex items-center gap-1.5 text-base font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              {t('examExport.ready')}
            </h2>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('examExport.step1')}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('examExport.pickTemplate')}</Label>
            <ExamTemplatePanel
              userId={userId}
              subjects={subjects}
              categories={categories}
              value={template}
              onChange={(next) => {
                setTemplate(next)
                setSections(null)
                setGenCount(null)
                setInsufficient(false)
                setError('')
              }}
            />
          </div>

          <Button className="w-full gap-1.5" size="lg" disabled={!template || generating} onClick={regenerate}>
            {generating ? <Spinner /> : <Sparkles className="h-4 w-4" />}
            {generating ? t('examExport.generating') : t('examExport.generate')}
          </Button>

          {error && (
            <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {hasPaper && (
            <>
              <div className="flex items-center justify-between rounded-md border bg-background px-2.5 py-2 text-xs">
                <span className="text-muted-foreground">
                  {t('examExport.qCount')}: <b className="tabular-nums text-foreground">{genCount}</b>
                </span>
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={generating}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCcw className={cn('h-3 w-3', generating && 'animate-spin')} />
                  {t('examExport.regenerate')}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
                <span className="text-xs text-foreground/80">{t('examExport.hideScore')}</span>
                <Switch checked={!showScore} onCheckedChange={(on) => setShowScore(!on)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('examExport.exportLabel')}</Label>
                <Button className="w-full gap-1.5" disabled={exporting !== null} onClick={() => runFileExport('docx')}>
                  {exporting === 'docx' ? <Spinner /> : exported.has('docx') ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {t('examExport.toDocx')}
                </Button>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="outline" className="gap-1.5" disabled={exporting !== null} onClick={() => runFileExport('html')}>
                    {exporting === 'html' ? <Spinner /> : exported.has('html') ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                    {t('examExport.toHtml')}
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={openPrint}>
                    <Printer className="h-4 w-4" />
                    {t('examExport.toPrint')}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">{t('examExport.fidelityNote')}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 右:真卷预览(与 /exam/templates、开考卷同一套 A4 卷面) */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card/30">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background/70 px-3 py-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="truncate text-sm font-semibold">{title || t('examExport.preview')}</h2>
          {insufficient && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('examExport.insufficient')}</span>
            </span>
          )}
          {hasPaper && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewView('sheet')}
                className={cn(
                  'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
                  previewView === 'sheet' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
                title={t('examTemplate.singlePage')}
              >
                <FileText className="h-3 w-3" />
                <span className="hidden sm:inline">{t('examTemplate.singlePage')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewView('spread')}
                className={cn(
                  'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
                  previewView === 'spread' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
                title={t('examTemplate.spreadPage')}
              >
                <Columns2 className="h-3 w-3" />
                <span className="hidden sm:inline">{t('examTemplate.spreadPage')}</span>
              </button>
            </div>
          )}
        </header>

        {!hasPaper ? (
          <div className="flex min-h-[420px] flex-1 items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
            {generating ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> {t('examExport.composing')}
              </span>
            ) : (
              t('examExport.previewEmpty')
            )}
          </div>
        ) : (
          <div
            className={cn(
              'flex-1 bg-neutral-200/40 dark:bg-neutral-950/40',
              previewView === 'spread' ? 'overflow-hidden' : 'overflow-auto p-3',
            )}
          >
            <div
              className={cn(
                previewView === 'spread'
                  ? 'relative h-[58vh] min-h-[440px] w-full overflow-hidden'
                  : 'flex min-h-[440px] justify-center',
              )}
            >
              <PaperPreview
                title={title}
                meta={meta}
                sections={sections!}
                answers={new Map()}
                readOnly
                layout={previewView}
                cover={template!.cover ?? null}
                paperLayout={effPaperLayout}
              />
            </div>
          </div>
        )}
      </section>

      {printOpen && hasPaper && (
        <PrintPaper
          title={title}
          meta={meta}
          sections={sections!}
          cover={template!.cover ?? null}
          paperLayout={effPaperLayout}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * 打印视图: Portal 到 body, 只含一张 A4 单栏长卷(continuous sheet), 进入即 window.print。
 * .paper-sheet 自带打印 CSS(question 不跨页、隐藏 .paper-no-print), 观感与真卷一致。
 */
function PrintPaper({
  cover,
  paperLayout,
  title,
  meta,
  sections,
  onClose,
}: {
  cover: ExamTemplate['cover'] | null
  paperLayout: ExamTemplate['layout'] | null
  title: string
  meta: string
  sections: PaperSection[]
  onClose: () => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      window.print()
    }, 400)
    return () => window.clearTimeout(t1)
  }, [])
  useEffect(() => {
    const after = () => onClose()
    window.addEventListener('afterprint', after)
    return () => window.removeEventListener('afterprint', after)
  }, [onClose])

  return createPortal(
    <>
      <style>{`
        @media print {
          body > #root, body > :not(.exam-print-surface) { display: none !important; }
          html, body { background: #fff !important; }
          .exam-print-surface { position: static !important; inset: auto !important; overflow: visible !important; }
          .exam-print-closebar { display: none !important; }
        }
      `}</style>
      <div ref={wrapRef} className="exam-print-surface fixed inset-0 z-[100] overflow-auto bg-white print:static print:overflow-visible">
        <div className="exam-print-closebar sticky top-0 z-10 flex justify-end border-b bg-white px-3 py-2 print:hidden">
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="mr-1 h-3.5 w-3.5" />
            关闭
          </Button>
        </div>
        <div className="mx-auto w-fit px-2 py-4 print:px-0 print:py-0">
          <PaperPreview
            title={title}
            meta={meta}
            sections={sections}
            answers={new Map()}
            readOnly
            layout="sheet"
            cover={cover}
            paperLayout={paperLayout}
          />
        </div>
      </div>
    </>,
    document.body,
  )
}
