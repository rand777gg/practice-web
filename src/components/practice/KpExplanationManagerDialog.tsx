import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Check, LibraryBig, Search, Trash2, MessageSquareText, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import { ContentPickerDialog } from '@/components/assistant/ContentPickerDialog'
import { KpRefPickerDialog } from './KpRefPickerDialog'
import { KpQuestionPickerDialog } from './KpQuestionPickerDialog'
import { kpExplanationKey, useKpExplanations } from '@/hooks/use-kp-explanations'
import { naturalSort } from '@/lib/utils'
import { autoIndex } from '@/lib/rag'
import {
  draftFromRef, draftFromSelection, refWhere,
  type KpRefDraft, type KpResourceRef,
} from '@/lib/kp-resource-refs'
import { listKpRefs, saveKpRefs } from '@/lib/kp-resource-refs-store'
import {
  questionStem, questionTypeLabel, realYearOf,
  type KpQuestionDraft, type KpQuestionLink,
} from '@/lib/kp-question-refs'
import { listKpQuestions, saveKpQuestions } from '@/lib/kp-question-refs-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface KpBySubject {
  subject: string
  keyPoints: string[]
}

interface Doc {
  id: string
  title: string
}

interface RefState {
  /** 这份依据属于哪条解读(学科\u0000知识点) */
  key: string
  drafts: KpRefDraft[]
  /** 原文献已被删除的依据: 只剩快照, 编辑不了 */
  orphans: KpResourceRef[]
}

const EMPTY_DRAFTS: KpRefDraft[] = []
const EMPTY_ORPHANS: KpResourceRef[] = []

/** 同一条依据(同一篇 + 同一个落点)不该挂两遍: 重复只会在读者那边显示两行一样的东西 */
function sameRef(a: KpRefDraft, b: KpRefDraft): boolean {
  return a.documentId === b.documentId
    && a.pageFrom === b.pageFrom
    && a.pageTo === b.pageTo
    && a.blocks.join(',') === b.blocks.join(',')
}

async function fetchRefs(subject: string, kp: string): Promise<RefState> {
  const list = await listKpRefs(subject, kp).catch(() => [] as KpResourceRef[])
  const drafts: KpRefDraft[] = []
  const orphans: KpResourceRef[] = []
  for (const item of list) {
    const editable = draftFromRef(item)
    if (editable) drafts.push(editable)
    else orphans.push(item)
  }
  return { key: `${subject}\u0000${kp}`, drafts, orphans }
}

interface QuestionState {
  key: string
  items: KpQuestionDraft[]
}

const EMPTY_QUESTIONS: KpQuestionDraft[] = []

/**
 * 挂在这条解读上的真题。
 *
 * 题被删掉时外键会级联删掉整行, 所以正常情况下不会有"关联还在、题没了"; 真碰上(比如权限把题目
 * 挡住了)就跳过 —— 保存时那份关联本来也会被这次覆盖写掉, 正好清干净。
 */
async function fetchQuestions(subject: string, kp: string): Promise<QuestionState> {
  const links = await listKpQuestions(subject, kp).catch(() => [] as KpQuestionLink[])
  const items: KpQuestionDraft[] = []
  for (const link of links) {
    const q = link.question
    if (!q) continue
    items.push({
      questionId: q.id,
      note: link.note,
      year: realYearOf(q),
      type: q.questionType,
      stem: questionStem(q.questionText, 120),
    })
  }
  return { key: `${subject}\u0000${kp}`, items }
}

/** 依据与真题两份清单共用的行尾操作 */
function RowActions({ index, total, onMove, onRemove }: {
  index: number
  total: number
  onMove: (index: number, delta: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="上移"
        disabled={index === 0} onClick={() => onMove(index, -1)}>
        <ArrowUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="下移"
        disabled={index === total - 1} onClick={() => onMove(index, 1)}>
        <ArrowDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="移除"
        onClick={onRemove}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function KpExplanationManagerDialog({ open, onOpenChange }: Props) {
  const { explanations, refresh } = useKpExplanations()
  const [kpBySubject, setKpBySubject] = useState<KpBySubject[]>([])
  const [metaLoading, setMetaLoading] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedKp, setSelectedKp] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [documents, setDocuments] = useState<Doc[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false)
  /** 保存报错连着"它属于哪条解读"一起存: 换了知识点之后旧报错自动不显示 */
  const [saveError, setSaveError] = useState<{ key: string; message: string } | null>(null)

  /**
   * 依据的编辑状态按 (学科, 知识点) 打 key。
   *
   * 于是"换一条解读就清空"是派生出来的(对不上 key 就等于还没数据), 不必在 effect 里同步
   * setState 清空 —— 那样会多渲一轮, 而且拉取回来之前会先把上一条解读的依据显示出来。
   */
  const refsKey = `${selectedSubject}\u0000${selectedKp}`
  const [refState, setRefState] = useState<RefState | null>(null)
  const current = refState && refState.key === refsKey ? refState : null
  const refs = current?.drafts ?? EMPTY_DRAFTS
  const orphanRefs = current?.orphans ?? EMPTY_ORPHANS
  const visibleError = saveError && saveError.key === refsKey ? saveError.message : null

  // 真题那份同理: 换一条解读时旧状态自动失效
  const [qState, setQState] = useState<QuestionState | null>(null)
  const questionItems = qState && qState.key === refsKey ? qState.items : EMPTY_QUESTIONS
  const linkedQuestionIds = useMemo(
    () => new Set(questionItems.map((i) => i.questionId)),
    [questionItems],
  )

  const sortedSubjects = useMemo(
    () => kpBySubject.map((s) => s.subject).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [kpBySubject],
  )
  const subjectKps = useMemo(
    () => kpBySubject.find((s) => s.subject === selectedSubject)?.keyPoints ?? [],
    [kpBySubject, selectedSubject],
  )
  const hasContent = selectedSubject && selectedKp ? explanations.has(kpExplanationKey(selectedSubject, selectedKp)) : false

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMetaLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.from('question_meta_cache').select('key_points_by_subject').single()
        if (cancelled) return
        const raw = (data?.key_points_by_subject ?? []) as { subject: string; key_points: string[] }[]
        const items = raw
          .map((item) => ({ subject: item.subject || '其他', keyPoints: [...item.key_points].sort(naturalSort) }))
          .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-CN'))
        setKpBySubject(items)
      } catch { /* ignore */ } finally { if (!cancelled) setMetaLoading(false) }
    })()
    // 文献列表只给"按章节挑"用, 而 resource-library 会拖进 MinerU/PDF 那一堆模块,
    // 所以按需动态加载, 不在打开管理弹窗时就拉进来
    void import('@/lib/resource-library')
      .then(async ({ listResourceDocuments }) => {
        const list = await listResourceDocuments()
        if (!cancelled) setDocuments(list.map((d) => ({ id: d.id, title: d.title })))
      })
      .catch(() => { /* 读不到文献列表就只剩"搜资料库"那条路 */ })
    return () => { cancelled = true }
  }, [open])

  // Auto-select first configured subject → first configured KP, else first entries
  useEffect(() => {
    if (!open || kpBySubject.length === 0) return
    const firstWithContent = sortedSubjects.find((s) => s && [...(kpBySubject.find((x) => x.subject === s)?.keyPoints ?? [])].some((k) => explanations.has(kpExplanationKey(s, k))))
    const target = firstWithContent ?? sortedSubjects[0]
    if (!target) return
    setSelectedSubject(target)
    const kps = kpBySubject.find((x) => x.subject === target)?.keyPoints ?? []
    const firstKpWithContent = kps.find((k) => explanations.has(kpExplanationKey(target, k)))
    setSelectedKp(firstKpWithContent ?? kps[0] ?? '')
  }, [open, kpBySubject, sortedSubjects, explanations])

  useEffect(() => {
    if (!open || !selectedSubject || !selectedKp) return
    setDraft(explanations.get(kpExplanationKey(selectedSubject, selectedKp))?.content ?? '')
  }, [open, selectedSubject, selectedKp, explanations])

  useEffect(() => {
    if (!open || !selectedSubject || !selectedKp) return
    let cancelled = false
    void fetchRefs(selectedSubject, selectedKp).then((state) => { if (!cancelled) setRefState(state) })
    void fetchQuestions(selectedSubject, selectedKp).then((state) => { if (!cancelled) setQState(state) })
    return () => { cancelled = true }
  }, [open, selectedSubject, selectedKp])

  const handleSubjectChange = (s: string) => {
    setSelectedSubject(s)
    setSelectedKp('')
    const kps = kpBySubject.find((x) => x.subject === s)?.keyPoints ?? []
    const firstKpWithContent = kps.find((k) => explanations.has(kpExplanationKey(s, k)))
    setSelectedKp(firstKpWithContent ?? kps[0] ?? '')
  }

  const updateRefs = useCallback((fn: (drafts: KpRefDraft[]) => KpRefDraft[]) => {
    setRefState((prev) => {
      const base: RefState = prev && prev.key === refsKey ? prev : { key: refsKey, drafts: [], orphans: [] }
      return { ...base, drafts: fn(base.drafts) }
    })
  }, [refsKey])

  const addRefs = useCallback((adds: KpRefDraft[]) => {
    updateRefs((prev) => [...prev, ...adds.filter((a) => !prev.some((p) => sameRef(p, a)))])
  }, [updateRefs])

  const moveRef = useCallback((index: number, delta: number) => {
    updateRefs((prev) => {
      const to = index + delta
      if (to < 0 || to >= prev.length) return prev
      const next = prev.slice()
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
  }, [updateRefs])

  const updateQuestions = useCallback((fn: (items: KpQuestionDraft[]) => KpQuestionDraft[]) => {
    setQState((prev) => {
      const base: QuestionState = prev && prev.key === refsKey ? prev : { key: refsKey, items: [] }
      return { ...base, items: fn(base.items) }
    })
  }, [refsKey])

  const addQuestions = useCallback((adds: KpQuestionDraft[]) => {
    updateQuestions((prev) => {
      const have = new Set(prev.map((i) => i.questionId))
      return [...prev, ...adds.filter((a) => !have.has(a.questionId))]
    })
  }, [updateQuestions])

  const moveQuestion = useCallback((index: number, delta: number) => {
    updateQuestions((prev) => {
      const to = index + delta
      if (to < 0 || to >= prev.length) return prev
      const next = prev.slice()
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
  }, [updateQuestions])

  const handleSave = async () => {
    if (!selectedSubject || !selectedKp) return
    setSaving(true)
    setSaveError(null)
    const content = draft.trim()
    try {
      if (content) {
        const { error } = await supabase.from('kp_explanations').upsert({
          subject: selectedSubject, kp: selectedKp, content, updated_at: new Date().toISOString(),
        })
        if (error) throw new Error(error.message)
        // 依据挂在解读上(复合外键), 所以必须等正文落库之后再写。
        // 写完重拉一次: 页码与摘录是服务端从 resource_blocks 补的, 本地这份没有
        await saveKpRefs(selectedSubject, selectedKp, refs)
        await saveKpQuestions(selectedSubject, selectedKp, questionItems)
        setRefState(await fetchRefs(selectedSubject, selectedKp))
        setQState(await fetchQuestions(selectedSubject, selectedKp))
      } else if (hasContent) {
        // 正文清空 = 删掉这条解读, 依据和真题跟着级联删掉
        const { error } = await supabase.from('kp_explanations').delete()
          .eq('subject', selectedSubject).eq('kp', selectedKp)
        if (error) throw new Error(error.message)
        setRefState({ key: refsKey, drafts: [], orphans: [] })
        setQState({ key: refsKey, items: [] })
      }
      // 知识点解读只有管理员能改, 整源增量同步(这张表很小, 内容没变就等于不花钱)
      autoIndex('kp')
      await refresh()
    } catch (err) {
      setSaveError({ key: refsKey, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            知识点解读管理
            <Link
              to="/admin/crawler?tab=experience"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              经验分享管理
            </Link>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs">{selectedSubject || '选择学科'}<ChevronDown className="h-3 w-3" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {sortedSubjects.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleSubjectChange(s)}>
                    {s}
                    {[...(kpBySubject.find((x) => x.subject === s)?.keyPoints ?? [])].some((k) => explanations.has(kpExplanationKey(s, k)))
                      && <Check className="h-4 w-4 ml-auto text-green-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-xs max-w-56 truncate" disabled={!selectedSubject}>
                  {selectedKp || '选择知识点'}<ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {subjectKps.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">该学科暂无知识点</div>
                ) : subjectKps.map((k) => (
                  <DropdownMenuItem key={k} onClick={() => setSelectedKp(k)}>
                    {k}
                    {selectedSubject && explanations.has(kpExplanationKey(selectedSubject, k))
                      && <Check className="h-4 w-4 ml-auto text-green-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {metaLoading && <span className="text-xs text-muted-foreground">加载中...</span>}
            {hasContent && <span className="text-xs text-green-600">已设置</span>}
          </div>

          {selectedSubject && selectedKp && (
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              minHeight="300px"
              placeholder={`编写「${selectedKp}」的知识点解读（支持 Markdown、图片与视频；粘贴/拖入图片后可选择直接插入或 OCR 识别为文字）。留空保存将删除该解读。`}
            />
          )}

          {selectedSubject && selectedKp && (
            <div className="space-y-1.5 rounded-md border p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-xs font-medium">
                  <LibraryBig className="h-3.5 w-3.5" />
                  依据原文
                </span>
                <span className="text-[10px] text-muted-foreground">
                  解读的来源：挂上文献段落，读者在解读里就能点回原文核对
                </span>
                <span className="flex-1" />
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setPickerOpen(true)}>
                  <Search className="h-3 w-3" />搜资料库
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 text-[11px]"
                  disabled={documents.length === 0}
                  title={documents.length === 0 ? '资料库里还没有文献' : '按 文献 → 章节 → 段落 挑'}
                  onClick={() => setBrowseOpen(true)}
                >
                  按章节挑
                </Button>
              </div>

              {refs.length === 0 ? (
                <p className="px-1 py-2 text-[10px] leading-relaxed text-muted-foreground">
                  还没有依据。点「搜资料库」用知识点当关键词找那段原文，或点「按章节挑」整节整节地选。
                </p>
              ) : (
                <div className="space-y-1">
                  {refs.map((item, i) => (
                    <div key={`${item.documentId}:${item.pageFrom}:${item.blocks.join('-')}:${i}`} className="flex items-start gap-1.5 rounded border bg-muted/20 px-1.5 py-1">
                      <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-1.5 text-[11px]">
                          <span className="min-w-0 flex-1 truncate">{item.docTitle || '（未知文献）'}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{refWhere(item)}</span>
                          {item.label && <span className="shrink-0 truncate text-muted-foreground">{item.label}</span>}
                        </p>
                        <Input
                          value={item.note}
                          onChange={(e) => {
                            const note = e.target.value
                            updateRefs((prev) => prev.map((r, k) => (k === i ? { ...r, note } : r)))
                          }}
                          placeholder="这条依据说明了什么（选填，会显示在解读里）"
                          className="h-6 text-[11px]"
                        />
                      </div>
                      <RowActions
                        index={i}
                        total={refs.length}
                        onMove={moveRef}
                        onRemove={() => updateRefs((prev) => prev.filter((_, k) => k !== i))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {orphanRefs.length > 0 && (
                <p className="px-1 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                  {orphanRefs.length} 条依据的原文文献已被删除（只剩快照），保存后会一并移除：
                  <span className="text-muted-foreground">
                    {orphanRefs.map((r) => `${r.docTitle || '未知文献'} · ${refWhere(r)}`).join('；')}
                  </span>
                </p>
              )}
            </div>
          )}

          {selectedSubject && selectedKp && (
            <div className="space-y-1.5 rounded-md border p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-xs font-medium">
                  <BookOpen className="h-3.5 w-3.5" />
                  相关真题
                </span>
                <span className="text-[10px] text-muted-foreground">
                  挂上历年真题，读者在解读里展开就能看到题干、选项、答案与解析
                </span>
                <span className="flex-1" />
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setQuestionPickerOpen(true)}>
                  <Search className="h-3 w-3" />链接真题
                </Button>
              </div>

              {questionItems.length === 0 ? (
                <p className="px-1 py-2 text-[10px] leading-relaxed text-muted-foreground">
                  还没有挂真题。点「链接真题」按年份挑几道——默认落在最新一年，也可以清掉年份搜全部题目。
                </p>
              ) : (
                <div className="space-y-1">
                  {questionItems.map((item, i) => (
                    <div key={`${item.questionId}:${i}`} className="flex items-start gap-1.5 rounded border bg-muted/20 px-1.5 py-1">
                      <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-1.5 text-[11px]">
                          {item.year && (
                            <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              {item.year}
                            </span>
                          )}
                          <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                            {questionTypeLabel(item.type)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.stem}</span>
                        </p>
                        <Input
                          value={item.note}
                          onChange={(e) => {
                            const note = e.target.value
                            updateQuestions((prev) => prev.map((q, k) => (k === i ? { ...q, note } : q)))
                          }}
                          placeholder="这道真题考的是这个知识点的哪一面（选填，会显示在解读里）"
                          className="h-6 text-[11px]"
                        />
                      </div>
                      <RowActions
                        index={i}
                        total={questionItems.length}
                        onMove={moveQuestion}
                        onRemove={() => updateQuestions((prev) => prev.filter((_, k) => k !== i))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!draft.trim() && questionItems.length > 0 && (
                <p className="px-1 text-[10px] text-amber-600 dark:text-amber-400">
                  解读正文是空的，保存会删除这条解读，这些真题也会一起解绑。
                </p>
              )}
            </div>
          )}

          {visibleError && <p className="px-1 text-[10px] text-destructive">保存失败：{visibleError}</p>}
        </div>
        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false) }}>关闭</Button>
          {hasContent && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={saving || !selectedKp}
              onClick={async () => {
                if (!selectedSubject || !selectedKp) return
                setSaving(true)
                await supabase.from('kp_explanations').delete().eq('subject', selectedSubject).eq('kp', selectedKp)
                setSaving(false)
                setDraft('')
                setRefState({ key: refsKey, drafts: [], orphans: [] })
                setQState({ key: refsKey, items: [] })
                await refresh()
              }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !selectedSubject || !selectedKp}>{saving ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>

      <KpRefPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kp={selectedKp}
        onAdd={addRefs}
      />
      <KpQuestionPickerDialog
        open={questionPickerOpen}
        onOpenChange={setQuestionPickerOpen}
        subject={selectedSubject}
        existingIds={linkedQuestionIds}
        onAdd={addQuestions}
      />
      <ContentPickerDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        documents={documents}
        initialDocumentId={documents[0]?.id ?? null}
        initialSelection={null}
        onConfirm={(selection) => { if (selection) addRefs([draftFromSelection(selection)]) }}
      />
    </Dialog>
  )
}
