import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { AiImportUpload } from '@/components/ai-import/AiImportUpload'
import { AiImportPreview } from '@/components/ai-import/AiImportPreview'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PdfMarkdownViewer, parseLayoutTree } from '@/components/ai-import/PdfMarkdownViewer'
import { ParseHistoryDialog, type HistoryEntry } from '@/components/ai-import/ParseHistoryDialog'
import { R2PdfGallery } from '@/components/ai-import/R2PdfGallery'
import {
  DeepSeekParser, MinerUClient, getAiConfig, hasAiConfig,
  getMinerUToken, setMinerUToken, getMinerUModelVersion, setMinerUModelVersion,
  generateQuestions, generateFromText,
} from '@/lib/ai'
import { extractFileText } from '@/lib/file-text'
import { getPrompt, setPrompt, resetPrompt } from '@/stores/prompt-store'
import { useSettingsStore } from '@/stores/settings-store'
import { cn } from '@/lib/utils'
import type { ParsedQuestion, MinerUModelVersion } from '@/lib/ai/types'
import { QUESTION_TYPE_OPTIONS } from '@/lib/constants'
import { Icon } from '@iconify/react'
import { ArrowLeft, ArrowRight, Check, CheckCircle, AlertCircle, ChevronDown, ChevronRight, Clock, Pencil, Play, Plus, Upload, X } from 'lucide-react'

type Step = 'upload' | 'parsing' | 'metadata' | 'preview' | 'importing' | 'done'
type ParseMode = 'lightweight' | 'precision' | 'generate'

export function Component() {
  const [searchParams, setSearchParams] = useSearchParams()
  const step = (searchParams.get('step') as Step) || 'upload'
  const urlHistoryId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const setStepPersisted = (s: Step, historyId?: number | null) => {
    const params: Record<string, string> = {}
    if (s !== 'upload') params.step = s
    if (historyId) params.id = String(historyId)
    else if (urlHistoryId && s !== 'upload') params.id = String(urlHistoryId)
    setSearchParams(params, { replace: true })
  }
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [questions, setQuestions] = useState<ParsedQuestion[]>(() => {
    try {
      const saved = sessionStorage.getItem('ai-import-questions')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [subject, setSubject] = useState(() => sessionStorage.getItem('ai-import-subject') || '')
  const [category, setCategory] = useState(() => sessionStorage.getItem('ai-import-category') || '')
  const [keyPoints, setKeyPoints] = useState(() => sessionStorage.getItem('ai-import-keypoints') || '')
  const [lineBreakEnabled, setLineBreakEnabled] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [parseMsg, setParseMsg] = useState('')
  const [parseStatus, setParseStatus] = useState<Record<string, unknown> | null>(null)
  const parseStatusRef = useRef(parseStatus)
  parseStatusRef.current = parseStatus
  const [importCount, setImportCount] = useState(0)
  const [error, setError] = useState('')

  // Persist metadata — survives page reload and step transitions
  useEffect(() => {
    sessionStorage.setItem('ai-import-subject', subject)
    sessionStorage.setItem('ai-import-category', category)
    sessionStorage.setItem('ai-import-keypoints', keyPoints)
  }, [subject, category, keyPoints])

  // Persist questions for preview recovery, clear on done
  useEffect(() => {
    if (questions.length > 0 && step === 'preview') {
      sessionStorage.setItem('ai-import-questions', JSON.stringify(questions))
    }
    if (step === 'done') {
      sessionStorage.removeItem('ai-import-questions')
      sessionStorage.removeItem('ai-import-subject')
      sessionStorage.removeItem('ai-import-category')
      sessionStorage.removeItem('ai-import-keypoints')
    }
  }, [questions, step])
  const [existingSubjects, setExistingSubjects] = useState<string[]>([])
  const [existingCategories, setExistingCategories] = useState<string[]>([])
  const [existingKeyPoints, setExistingKeyPoints] = useState<string[]>([])

  // Local lists for new items added during the session (for subject/category/kp dropdowns)
  const [localSubjects, setLocalSubjects] = useState<string[]>([])
  const [localCategories, setLocalCategories] = useState<string[]>([])
  const [localKeyPoints, setLocalKeyPoints] = useState<string[]>([])
  const allSubjects = [...new Set([...existingSubjects, ...localSubjects])].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const allCategories = [...new Set([...existingCategories, ...localCategories])].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const allKeyPoints = [...new Set([...existingKeyPoints, ...localKeyPoints])].sort((a, b) => a.localeCompare(b, 'zh-CN'))

  // MinerU precision parsing settings
  const [parseMode, setParseMode] = useState<ParseMode>('precision')
  const [modelVersion, setModelVersion] = useState<MinerUModelVersion>(getMinerUModelVersion())
  const [mineruToken, setMineruTokenState] = useState(getMinerUToken())
  const [enableOcr, setEnableOcr] = useState(false)
  const [enableFormula, setEnableFormula] = useState(true)
  const [enableTable, setEnableTable] = useState(true)
  const [batchMode, setBatchMode] = useState(false)
  const [useR2Upload, setUseR2Upload] = useState(false)
  const [manualPdfUrl, setManualPdfUrl] = useState('')
  const [historyPdfUrl, setHistoryPdfUrl] = useState<string | null>(null)
  const [pageUrls, setPageUrls] = useState<{ p: number; w: number; h: number; src: string }[]>([])
  const [pageRendering, setPageRendering] = useState(false)
  const [r2Pdfs, setR2Pdfs] = useState<{ key: string; url: string; size: number }[]>([])
  const [r2Loading, setR2Loading] = useState(true)
  const [r2DisplayNames, setR2DisplayNames] = useState<Map<string, string>>(() => {
    try {
      const saved = localStorage.getItem('r2-pdf-names')
      return saved ? new Map(JSON.parse(saved)) : new Map()
    } catch { return new Map() }
  })

  const saveR2DisplayNames = (map: Map<string, string>) => {
    setR2DisplayNames(map)
    localStorage.setItem('r2-pdf-names', JSON.stringify([...map]))
  }
  const [pageRanges, setPageRanges] = useState('')
  const pageRangesRef = useRef(pageRanges)
  pageRangesRef.current = pageRanges
  const [extraFormats, setExtraFormats] = useState<string[]>([])

  // Load existing PDFs from R2
  useEffect(() => {
    setR2Loading(true)
    supabase.functions.invoke('r2-list', { body: { prefix: 'pdf/' } })
      .then(({ data }) => {
        if (data?.files) setR2Pdfs((data.files as { key: string; url: string; size: number }[]).filter(f => f.key !== 'pdf/' && !f.key.endsWith('/')))
      })
      .catch(() => {})
      .finally(() => setR2Loading(false))
  }, [])

  const [noCache, setNoCache] = useState(false)
  const [cacheTolerance, setCacheTolerance] = useState('')
  const [dataId, setDataId] = useState('')

  // AI Generate state
  const [newSubject, setNewSubject] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newKeyPoint, setNewKeyPoint] = useState('')
  const [genSubject, setGenSubject] = useState('')
  const [genTypes, setGenTypes] = useState<Set<string>>(new Set(['single_choice']))
  const [genCount, setGenCount] = useState(5)
  const [genTopic, setGenTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genFile, setGenFile] = useState<File | null>(null)
  const [genFileText, setGenFileText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [genPageRanges, setGenPageRanges] = useState('')
  const genPageRangesRef = useRef(genPageRanges)
  genPageRangesRef.current = genPageRanges

  // Manual import state

  // Custom prompts
  const [extractPrompt, setExtractPrompt] = useState(() => getPrompt('extract'))
  const [generateDocPrompt, setGenerateDocPrompt] = useState(() => getPrompt('generate_doc'))
  const basePromptRef = useRef(generateDocPrompt)
  const baseExtractPromptRef = useRef(extractPrompt)

  const { isEnabled } = useSettingsStore()
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [currentHistoryId, setCurrentHistoryId] = useState<number | null>(urlHistoryId)

  // Sync historyId to URL
  useEffect(() => {
    if (currentHistoryId && step !== 'upload') {
      const params: Record<string, string> = { step }
      params.id = String(currentHistoryId)
      setSearchParams(params, { replace: true })
    }
  }, [currentHistoryId, step])
  const [dedupHistoryIds, setDedupHistoryIds] = useState<Set<number>>(new Set())
  const [dedupOpen, setDedupOpen] = useState(true)

  // Inject dedup context into prompts when selection changes
  useEffect(() => {
    const dedupRecords = history.filter((h) => dedupHistoryIds.has(h.id) && h.questions_json)
    if (dedupRecords.length === 0) {
      setGenerateDocPrompt(basePromptRef.current)
      setExtractPrompt(baseExtractPromptRef.current)
      return
    }
    const dedupText = `\n\n⚠️ 重要：以下是你之前生成过的题目，请务必避免重复，不要生成与以下题目相同或高度相似的题目：\n${
      dedupRecords.map((h, i) => `【历史记录${i + 1}】${h.questions_json}`).join('\n')
    }`
    setGenerateDocPrompt(basePromptRef.current + dedupText)
    setExtractPrompt(baseExtractPromptRef.current + dedupText)
  }, [dedupHistoryIds, history])

  const user = useAuthStore((s) => s.user)

  const loadHistoryList = async () => {
    if (!user) return
    setHistoryLoading(true)
    const { data, error } = await supabase
      .from('parse_history')
      .select('id, file_name, display_name, markdown, json_data, questions_json, status_json, page_ranges, pdf_total_pages, mode, created_at, pdf_page_urls, subject, category, key_points')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('loadHistoryList error:', error)
      setHistoryError(error.message || '加载失败')
    }
    setHistory(data ?? [])
    setHistoryLoading(false)
  }

  const saveToHistory = async (record: { fileName: string; markdown: string; jsonData?: string; questions?: ParsedQuestion[]; mode: string; pageRanges?: string; extraFormats?: string[]; pdfTotalPages?: number }) => {
    if (!user) return null
    const { data } = await supabase.from('parse_history').insert({
      user_id: user.id,
      file_name: record.fileName,
      markdown: record.markdown,
      json_data: record.jsonData || null,
      questions_json: record.questions ? JSON.stringify(record.questions) : null,
      mode: record.mode,
      status_json: parseStatusRef.current ? JSON.stringify(parseStatusRef.current) : null,
      page_ranges: record.pageRanges || null,
      extra_formats: record.extraFormats?.length ? JSON.stringify(record.extraFormats) : null,
      pdf_total_pages: record.pdfTotalPages || null,
      subject: subject || null,
      category: category || null,
      key_points: keyPoints || null,
    }).select('id').single()
    return data?.id ?? null
  }

  const updateHistoryEntry = async (id: number, updates: { questions?: ParsedQuestion[]; status?: Record<string, unknown> }) => {
    const payload: Record<string, unknown> = {}
    if (updates.questions) payload.questions_json = JSON.stringify(updates.questions)
    if (updates.status) payload.status_json = JSON.stringify(updates.status)
    await supabase.from('parse_history').update(payload).eq('id', id)
  }

  const loadHistory = async (id: number) => {
    const entry = history.find(h => h.id === id)
    if (entry) {
      setCurrentHistoryId(id)
      setParseResult({ markdown: entry.markdown, fileName: entry.file_name, jsonData: entry.json_data || undefined })
      if (entry.questions_json) {
        try { setQuestions(JSON.parse(entry.questions_json)) } catch { /* ignore */ }
      }
      setPageRanges(entry.page_ranges || '')
      if (entry.mode === 'precision' || entry.mode === 'lightweight' || entry.mode === 'generate') {
        setParseMode(entry.mode)
      }
      if (entry.status_json) {
        try { setParseStatus(JSON.parse(entry.status_json)) } catch { /* ignore */ }
      } else {
        setParseStatus(null)
      }
      // Detect if file_name is a URL → use for PDF viewer
      if (entry.file_name.startsWith('http')) {
        const isOwnStorage = entry.file_name.includes('/storage/v1/object/') || entry.file_name.includes('/r2/') || entry.file_name.includes('r2.dev') || entry.file_name.includes('r2-rpw.pguide.dev')
        if (isOwnStorage) {
          setHistoryPdfUrl(entry.file_name)
        } else {
          const proxyBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mineru-proxy`
          setHistoryPdfUrl(`${proxyBase}/pdf-proxy?url=${encodeURIComponent(entry.file_name)}`)
        }
      } else {
        setHistoryPdfUrl(null)
      }
      if (entry.pdf_page_urls) {
        try { setPageUrls(JSON.parse(entry.pdf_page_urls)) } catch { setPageUrls([]) }
      } else {
        setPageUrls([])
      }
      setPageRendering(false)
      setSelectedSectionIdx(new Set())
      setSelectionMode('off')
      setRangeAnchor(null)
      setCurrentDisplayName(entry.display_name || (() => {
        if (entry.file_name.includes('r2-rpw.pguide.dev')) {
          const idx = entry.file_name.indexOf('pdf/')
          if (idx >= 0) return r2DisplayNames.get(entry.file_name.slice(idx)) || null
        }
        return null
      })())
      setParseMsg('已从历史记录加载')
      setParsingDone(true)
      setStepPersisted('parsing', id)
    }
  }

  // Auto-load history from URL param on mount
  const historyLoadedRef = useRef(false)
  useEffect(() => {
    if (historyLoadedRef.current || history.length === 0 || !urlHistoryId) return
    const entry = history.find(h => h.id === urlHistoryId)
    if (entry) { historyLoadedRef.current = true; loadHistory(urlHistoryId) }
  }, [history, urlHistoryId])

  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: number[] } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteConfirm = async (deleteCache: boolean) => {
    if (!deleteConfirm) return
    const ids = deleteConfirm.ids
    setDeleteConfirm(null)
    setDeleting(true)
    try {
      if (deleteCache) {
        for (const id of ids) {
          await supabase.functions.invoke('r2-delete', { body: { prefix: `pdf-cache/${id}/` } }).catch(() => {})
        }
      }
      await supabase.from('parse_history').delete().in('id', ids)
      setHistory(prev => prev.filter(h => !ids.includes(h.id)))
    } finally {
      setDeleting(false)
    }
  }

  const deleteHistory = (id: number) => setDeleteConfirm({ ids: [id] })

  const batchDeleteHistory = (ids: number[]) => setDeleteConfirm({ ids })

  const [editPdfId, setEditPdfId] = useState<number | null>(null)
  const [editPdfUrl, setEditPdfUrl] = useState('')

  const savePdfUrl = async () => {
    if (!editPdfId || !editPdfUrl.trim()) return
    const id = editPdfId; const newUrl = editPdfUrl.trim()
    await supabase.from('parse_history').update({ file_name: newUrl, pdf_page_urls: null }).eq('id', id)
    setHistory(prev => prev.map(h => h.id === id ? { ...h, file_name: newUrl, pdf_page_urls: null } : h))
    setEditPdfId(null)
    setParseResult(prev => prev ? { ...prev, fileName: newUrl } : null)
    if (newUrl.startsWith('http')) {
      const isOwn = newUrl.includes('/storage/v1/object/') || newUrl.includes('/r2/') || newUrl.includes('r2.dev') || newUrl.includes('r2-rpw.pguide.dev')
      setHistoryPdfUrl(isOwn ? newUrl : null)
    } else { setHistoryPdfUrl(null) }
  }

  const aiConfigured = hasAiConfig()
  const precisionReady = parseMode === 'lightweight' || (parseMode === 'precision' && !!mineruToken)
  const genReady = parseMode === 'generate' && !!genSubject && genTypes.size > 0 && aiConfigured
  const canStart = parseMode === 'generate'
    ? genReady
    : !!manualPdfUrl && precisionReady
      ? true
      : parseMode === 'precision'
        ? (batchMode ? files.length > 0 : !!file) && aiConfigured && precisionReady
        : !!file && aiConfigured

  // Detect if current file/URL already has a parse result in history
  const existingHistoryEntry = useMemo(() => {
    if (!manualPdfUrl && !file && files.length === 0) return null
    if (manualPdfUrl) {
      return history.find(h => h.file_name === manualPdfUrl && h.markdown) || null
    }
    if (file) {
      return history.find(h => h.file_name === file.name && h.markdown) || null
    }
    return null
  }, [manualPdfUrl, file, files, history])

  const handleViewExistingParse = () => {
    if (existingHistoryEntry) loadHistory(existingHistoryEntry.id)
  }

  useEffect(() => {
    if (!user) return
    async function loadMeta() {
      // Use question_meta_cache for complete subject/category lists (not get_question_meta RPC which only checks old category column)
      const { data, error } = await supabase.from('question_meta_cache').select('subjects, categories').single()
      if (error) { console.warn('loadMeta error:', error); return }
      setExistingSubjects((data?.subjects ?? []) as string[])
      setExistingCategories((data?.categories ?? []) as string[])
    }
    loadMeta()
  }, [user?.id])

  // Load existing key_points filtered by subject
  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_question_meta', { p_subject: subject || null }) as { data: { key_points?: string[] } | null; error: unknown }
        if (!error && data?.key_points) setExistingKeyPoints(data.key_points)
        else setExistingKeyPoints([])
      } catch { setExistingKeyPoints([]) }
    })()
  }, [subject])

  useEffect(() => {
    if (user) loadHistoryList()
  }, [user?.id])

  const handleFile = (f: File) => { setFile(f); setFiles([]); if (f.size > 50 * 1024 * 1024) setUseR2Upload(true) }
  const handleFiles = (fs: File[]) => { setFiles(fs); setFile(null); if (fs.some(f => f.size > 50 * 1024 * 1024)) setUseR2Upload(true) }

  const handleTokenChange = (token: string) => {
    setMineruTokenState(token)
    setMinerUToken(token)
  }

  const handleModelChange = (model: MinerUModelVersion) => {
    setModelVersion(model)
    setMinerUModelVersion(model)
  }

  // Render+upload page by page — each page is persisted to R2 as it completes
  const renderAndUploadPages = async (pdfUrl: string, historyId: number, pageRangesOverride?: string): Promise<void> => {
    const { renderAndUploadPdfPages } = await import('@/lib/pdf-page-renderer')
    const ranges = pageRangesOverride ?? (pageRangesRef.current || undefined)
    const acc: { p: number; w: number; h: number; src: string }[] = []

    const saveUrls = async (urls: typeof acc) => {
      const { error } = await supabase.from('parse_history').update({
        pdf_page_urls: JSON.stringify(urls),
      }).eq('id', historyId)
      if (error) console.error('Failed to save pdf_page_urls:', error)
    }

    setPageRendering(true)
    setPageUrls([])

    try {
      await renderAndUploadPdfPages(pdfUrl, `pdf-cache/${historyId}`, ranges, (done, total, pageUrl) => {
        setParseMsg(`正在渲染并上传 PDF 页面... ${done}/${total}`)
        if (!pageUrl.src) return
        acc.push(pageUrl)
        setPageUrls([...acc])
        // Progressive save so browser close doesn't lose completed pages
        saveUrls(acc)
      })
    } finally {
      setPageRendering(false)
      // Final authoritative save to ensure DB is up to date
      if (acc.length > 0) await saveUrls(acc)
    }
  }

  const startParse = async () => {
    setStepPersisted('parsing')
    setError('')
    setParseResult(null)
    setParsingDone(false)
    setParsePage(0)
    setQuestions([])
    setHistoryPdfUrl(null)
    setPageUrls([])
    setPageRendering(false)
    setCurrentDisplayName(null)
    setSelectedSectionIdx(new Set())
    setSelectionMode('off')
    setRangeAnchor(null)
    setParseStatus({ state: 'connecting' })

    try {
      if (manualPdfUrl) {
        await runUrlParse()
      } else if (parseMode === 'precision') {
        await runPrecisionParse()
      } else {
        await runLightweightParse()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
      setStepPersisted('upload')
    }
  }

  const runUrlParse = async () => {
    const fileName = manualPdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf'
    const mineru = new MinerUClient()

    const dedupKey = `pdf/${fileName}`

    // Background: ensure PDF is persisted to R2 (skip if already cached)
    let r2Url: string
    const ensureR2 = (async () => {
      try {
        // Check if already in R2
        const check = await fetch(`https://r2-rpw.pguide.dev/${dedupKey}`, { method: 'HEAD' })
        if (check.ok) return
      } catch { /* HEAD may fail on CORS, proceed with upload */ }

      try {
        const pdfRes = await fetch(manualPdfUrl)
        if (!pdfRes.ok) return
        const pdfBlob = await pdfRes.blob()
        const pdfFile = new File([pdfBlob], fileName, { type: pdfBlob.type || 'application/pdf' })
        const { data: presignData, error: presignErr } = await supabase.functions.invoke('r2-upload-url', {
          body: { key: dedupKey, contentType: pdfFile.type },
        })
        if (presignErr || !(presignData as any)?.url) return
        await fetch((presignData as any).url, { method: 'PUT', body: pdfFile, headers: { 'Content-Type': pdfFile.type } })
      } catch { /* best-effort */ }
    })()
    r2Url = `https://r2-rpw.pguide.dev/${dedupKey}`

    // Start MinerU immediately — don't wait for R2 upload
    const options = {
      token: mineruToken,
      modelVersion,
      isOcr: enableOcr,
      enableFormula,
      enableTable,
      language: 'ch',
      pageRanges: pageRangesRef.current || undefined,
      extraFormats: extraFormats.length > 0 ? extraFormats : undefined,
      noCache: noCache || undefined,
      cacheTolerance: cacheTolerance ? Number(cacheTolerance) : undefined,
    }
    setParseMsg('正在创建解析任务...')
    const task = await mineru.createTask(manualPdfUrl, options)
    setParseStatus({ ...task, state: 'running' } as unknown as Record<string, unknown>)

    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const pollResult = await mineru.pollTask(task.taskId, options.token)
      setParseStatus(pollResult as unknown as Record<string, unknown>)
      if (pollResult.state === 'done' && pollResult.fullZipUrl) {
        setParseMsg('正在提取解析结果...')
        const { fetchZipAndExtractFiles } = await import('@/lib/ai/mineru')
        const { markdown, jsonData } = await fetchZipAndExtractFiles(pollResult.fullZipUrl)
        setParseResult({ markdown, fileName, jsonData })
        setParsingDone(true)
        await ensureR2  // wait for R2 upload to finish before showing preview
        setHistoryPdfUrl(r2Url)
        const historyId = await saveToHistory({ fileName: r2Url, markdown, jsonData, mode: 'precision', pageRanges: pageRangesRef.current || undefined, extraFormats: extraFormats.length > 0 ? extraFormats : undefined, pdfTotalPages: (pollResult as any)?.extractProgress?.totalPages })
        if (historyId) {
          setCurrentHistoryId(historyId)
          renderAndUploadPages(r2Url, historyId).catch(err => console.warn('Page render+upload failed:', err))
        }
        return
      }
      if (pollResult.state === 'failed') throw new Error(`解析失败: ${(pollResult as any).errMsg}`)
      if (i % 5 === 0) setParseMsg(`精准解析中... ${pollResult.state}`)
    }
    throw new Error('解析超时')
  }

  const runLightweightParse = async () => {
    if (!file) return
    const mineru = new MinerUClient()
    const result = await mineru.uploadAndParse(file, { pageRanges: pageRangesRef.current || undefined }, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
    setParseResult(result)
    setParsingDone(true)
    const historyId = await saveToHistory({ fileName: result.pdfUrl || file!.name, markdown: result.markdown, jsonData: result.jsonData, mode: 'lightweight', pageRanges: pageRangesRef.current || undefined, pdfTotalPages: (parseStatusRef.current as any)?.extractProgress?.totalPages })
    if (historyId) {
      setCurrentHistoryId(historyId)
      renderAndUploadPages(result.pdfUrl!, historyId).catch(err => console.warn('Page render+upload failed:', err))
    }
  }

  const runPrecisionParse = async () => {
    const mineru = new MinerUClient()
    const options = {
      token: mineruToken,
      modelVersion,
      isOcr: enableOcr,
      enableFormula,
      enableTable,
      language: 'ch',
      pageRanges: pageRangesRef.current || undefined,
      extraFormats: extraFormats.length > 0 ? extraFormats : undefined,
      noCache: noCache || undefined,
      cacheTolerance: cacheTolerance ? Number(cacheTolerance) : undefined,
      dataId: dataId || undefined,
    }

    if (batchMode && files.length > 0) {
      const results = await mineru.uploadAndParseBatchPrecision(files, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
      if (results.length === 0) {
        setError('所有文件解析失败')
        setStepPersisted('upload')
        return
      }
      const mergedMd = results.map(r => `## ${r.fileName}\n\n${r.markdown}`).join('\n\n---\n\n')
      setParseResult({ markdown: mergedMd, fileName: files.map(f => f.name).join(', '), jsonData: results[0]?.jsonData })
      setParsingDone(true)
      const historyId = await saveToHistory({ fileName: files.map(f => f.name).join(', '), markdown: mergedMd, jsonData: results[0]?.jsonData, mode: 'precision', pageRanges: pageRangesRef.current || undefined, extraFormats: extraFormats.length > 0 ? extraFormats : undefined, pdfTotalPages: (parseStatusRef.current as any)?.extractProgress?.totalPages })
      if (historyId) setCurrentHistoryId(historyId)
      // ponytail: skip page render for batch — too many PDFs, add if batch preview needed
    } else if (file) {
      const result = useR2Upload
        ? await mineru.uploadAndParsePrecisionR2(file, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
        : await mineru.uploadAndParsePrecision(file, options, (msg) => setParseMsg(msg), (status) => setParseStatus(status as unknown as Record<string, unknown>))
      setParseResult(result)
      setParsingDone(true)
      const historyId = await saveToHistory({ fileName: result.pdfUrl || file.name, markdown: result.markdown, jsonData: result.jsonData, mode: 'precision', pageRanges: pageRangesRef.current || undefined, extraFormats: extraFormats.length > 0 ? extraFormats : undefined, pdfTotalPages: (parseStatusRef.current as any)?.extractProgress?.totalPages })
      if (historyId) {
        setCurrentHistoryId(historyId)
        renderAndUploadPages(result.pdfUrl!, historyId).catch(err => console.warn('Page render+upload failed:', err))
      }
    }
  }

  const [parseResult, setParseResult] = useState<{ markdown: string; fileName: string; jsonData?: string } | null>(null)
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null)
  const [parsingDone, setParsingDone] = useState(false)
  const [parsePage, setParsePage] = useState(0)
  const [selectionMode, setSelectionMode] = useState<'off' | 'single' | 'range'>('off')
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<Set<number>>(new Set())
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null)
  const CHARS_PER_PAGE = 3000
  const pdfUrl = file ? URL.createObjectURL(file) : files.length > 0 ? URL.createObjectURL(files[0]) : null

  const extractQuestions = async (markdown: string) => {
    setParseMsg('AI 正在提取题目...')
    const parser = new DeepSeekParser(getAiConfig())
    const result = await parser.parseDocument(markdown, extractPrompt)

    // Apply upload-step metadata defaults to extracted questions
    const kp = keyPoints || category || ''
    let merged = result.questions.map((q) => ({ ...q, key_points: q.key_points || kp || undefined }))

    // Auto line-break formatting — batch all questions in one API call
    if (lineBreakEnabled && merged.length > 0) {
      setParseMsg('AI 正在换行格式化...')
      try {
        const { generateText } = await import('ai')
        const { createDeepSeek } = await import('@ai-sdk/deepseek')
        const client = createDeepSeek(getAiConfig())
        const items = merged.map((q, i) => `[${i}] ${q.question_text}`).join('\n\n---\n\n')
        const { text } = await generateText({
          model: client('deepseek-chat'),
          system: '你是一个纯文本格式化工具。对下面每段 [N] 标记的文本，在段落和列表项之间插入 <br> 换行符。逐字保留原文，不得修改任何内容。保持 [N] 标记不变。直接输出格式化后的文本。',
          prompt: `以下是要格式化的 ${merged.length} 段文本，严格原样保留，只在需要的地方添加 <br>：\n\n---\n${items}\n---`,
          temperature: 0.1,
          maxOutputTokens: 16000,
        })
        if (text) {
          const parts = text.split(/\n*\[(\d+)\]\s*/)
          for (let i = 1; i < parts.length; i += 2) {
            const idx = Number(parts[i])
            const content = parts[i + 1]?.trim()
            if (idx >= 0 && idx < merged.length && content) {
              merged[idx] = { ...merged[idx], question_text: content }
            }
          }
        }
      } catch (e) { console.error('Auto line break failed:', e) }
    }

    setQuestions(merged)
    setSelectedIds(new Set(merged.map((_, i) => i)))
    setStepPersisted('preview')
    if (parseResult) {
      if (currentHistoryId) {
        await updateHistoryEntry(currentHistoryId, { questions: merged, status: { state: 'questions_extracted' } })
      } else {
        const historyId = await saveToHistory({ fileName: parseResult.fileName, markdown: parseResult.markdown, jsonData: parseResult.jsonData, questions: merged, mode: parseMode === 'lightweight' ? 'lightweight' : 'precision' })
        if (historyId) setCurrentHistoryId(historyId)
      }
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      let result
      if (genFileText) {
        result = await generateFromText({
          documentText: genFileText,
          subject: genSubject || undefined,
          questionTypes: [...genTypes],
          count: genCount,
        }, generateDocPrompt)
      } else {
        result = await generateQuestions({
          subject: genSubject,
          questionTypes: [...genTypes],
          count: genCount,
          topicDescription: genTopic || undefined,
        }, generateDocPrompt)
      }
      const questions = genTopic
        ? result.questions.map((q) => ({ ...q, key_points: genTopic }))
        : result.questions
      setQuestions(questions)
      setSelectedIds(new Set(questions.map((_, i) => i)))
      setSubject(genSubject)
      setCategory('AI生成')
      setStepPersisted('preview')
      if (currentHistoryId) {
        await updateHistoryEntry(currentHistoryId, { questions, status: { state: 'questions_generated' } })
      } else {
        let historyId: number | null = null
        if (genFile) {
          historyId = await saveToHistory({ fileName: genFile.name, markdown: genFileText, questions, mode: 'generate', pageRanges: genPageRangesRef.current || undefined })
        } else {
          historyId = await saveToHistory({ fileName: genSubject || '手动生成', markdown: genTopic || '', questions, mode: 'generate' })
        }
        if (historyId) setCurrentHistoryId(historyId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenFile = async (f: File) => {
    setGenFile(f)
    setExtracting(true)
    setError('')
    try {
      const text = await extractFileText(f, genPageRangesRef.current)
      setGenFileText(text)
      // Auto-select history records with same file name for dedup
      const matched = history.filter((h) => h.file_name === f.name && h.questions_json)
      if (matched.length > 0) setDedupHistoryIds(new Set(matched.map((h) => h.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件读取失败')
      setGenFile(null)
    } finally {
      setExtracting(false)
    }
  }

  const startImport = async () => {
    setStepPersisted('importing')
    const toImport = questions.filter((_, i) => selectedIds.has(i))

    try {
      const { error: insertErr } = await supabase.from('questions').insert(
        toImport.map((q) => ({
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer as any,
          category: category ? (Array.isArray(category) ? category[0] : category) : null,
          categories: category ? (Array.isArray(category) ? category : [category]) : [],
          subject: subject || null,
          analysis: q.analysis?.trim() || null,
          key_points: q.key_points?.trim() || null,
          answer_explanation: null,
          seq_number: null,
          import_mode: parseMode,
          source_page: q.source_page || pageRangesRef.current || null,
          verified: q.verified ?? false,
          allow_unordered: q.allow_unordered ?? false,
        })),
      )

      if (insertErr) throw insertErr
      setImportCount(toImport.length)
      if (currentHistoryId) {
        await supabase.from('parse_history').update({ status_json: JSON.stringify({ state: 'imported' }) }).eq('id', currentHistoryId)
      }
      setStepPersisted('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
      setStepPersisted('preview')
    }
  }

  const toggleSelect = (i: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(questions.map((_, i) => i)))
    }
  }

  const changeQuestion = (i: number, q: ParsedQuestion) => {
    setQuestions((prev) => prev.map((p, idx) => idx === i ? q : p))
  }

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
    setSelectedIds((prev) => {
      const next = new Set<number>()
      for (const id of prev) {
        if (id < i) next.add(id)
        else if (id > i) next.add(id - 1)
      }
      return next
    })
  }

  const resetState = () => {
    setStepPersisted('upload')
    setFile(null)
    setFiles([])
    setQuestions([])
    setSubject('')
    setCategory('')
    setKeyPoints('')
    setSelectedIds(new Set())
    setGenSubject('')
    setGenTypes(new Set(['single_choice']))
    setGenCount(5)
    setGenTopic('')
    setGenerating(false)
    setGenFile(null)
    setGenFileText('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/questions"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
<Button variant="ghost" size="sm" className="gap-1 text-xs ml-auto" onClick={() => setShowHistoryDialog(true)}>
          <Clock className="h-3.5 w-3.5" />
          历史记录{history.length > 0 ? ` (${history.length})` : ''}
        </Button>
      </div>

      <ParseHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        history={history}
        loading={historyLoading || deleting}
        error={historyError}
        onLoad={(id) => loadHistory(id)}
        onDelete={(id) => deleteHistory(id)}
        onBatchDelete={(ids) => batchDeleteHistory(ids)}
        onBatchCache={async (ids) => {
          for (const id of ids) {
            const entry = history.find(h => h.id === id)
            if (entry && entry.file_name.startsWith('http')) {
              const isOwn = entry.file_name.includes('/storage/v1/object/') || entry.file_name.includes('/r2/') || entry.file_name.includes('r2.dev') || entry.file_name.includes('r2-rpw.pguide.dev')
              const pdfUrl = isOwn ? entry.file_name : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mineru-proxy/pdf-proxy?url=${encodeURIComponent(entry.file_name)}`
              setParseMsg(`正在缓存: ${entry.file_name.split('/').pop() || entry.file_name}`)
              await renderAndUploadPages(pdfUrl, id, entry.page_ranges || undefined)
            }
          }
          setParseMsg('批量缓存完成')
          loadHistoryList()
        }}
        onRename={async (id, displayName) => {
          await supabase.from('parse_history').update({ display_name: displayName }).eq('id', id)
          setHistory(prev => prev.map(h => h.id === id ? { ...h, display_name: displayName } : h))
          if (id === currentHistoryId) setCurrentDisplayName(displayName)
        }}
        onBatchReplaceUrl={async (ids, newUrl) => {
          // Optimistic update: reflect new URL and clear cache immediately
          setHistory(prev => prev.map(h =>
            ids.includes(h.id) ? { ...h, file_name: newUrl, pdf_page_urls: null } : h
          ))
          await Promise.all(ids.map(id =>
            supabase.from('parse_history').update({
              file_name: newUrl,
              pdf_page_urls: null,
            }).eq('id', id)
          ))
          loadHistoryList()
        }}
        r2DisplayNames={r2DisplayNames}
        r2Pdfs={r2Pdfs}
        onShowQuestions={(json) => {
          try { setQuestions(JSON.parse(json)) } catch { /* ignore */ }
          setSelectedIds(new Set())
          setStepPersisted('preview')
        }}
      />

      {!aiConfigured && (
        <Card className="border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10">
          <CardContent className="py-3 text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            请在 EdgeOne 环境变量中配置 VITE_DEEPSEEK_API_KEY
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-6 space-y-4">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_35%] gap-6">
              {/* ===== LEFT PANEL: Mode + Settings + Upload ===== */}
              <div className="space-y-4">
              {/* Common metadata: subject / category / key_points */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Subject */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">学科 <span className="text-muted-foreground font-normal text-xs">(选填)</span></label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between text-sm font-normal h-8">
                          {subject || '选择学科'}
                          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                        <div className="flex items-center gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
                          <Input placeholder="新增学科..." value={newSubject}
                            onChange={(e) => setNewSubject(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newSubject.trim(); if (v) { if (!allSubjects.includes(v)) setLocalSubjects(p => [...p, v]); setSubject(v); setNewSubject('') } } }}
                            className="h-7 text-xs flex-1" />
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                            onClick={() => { const v = newSubject.trim(); if (v) { if (!allSubjects.includes(v)) setLocalSubjects(p => [...p, v]); setSubject(v); setNewSubject('') } }}
                            disabled={!newSubject.trim()}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSubject('')}>
                          <span className="text-muted-foreground">不限学科</span>
                          {!subject && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                        {allSubjects.map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setSubject(s)}>
                            {s}
                            {subject === s && <Check className="h-4 w-4 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Category */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">分类 <span className="text-muted-foreground font-normal text-xs">(选填)</span></label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between text-sm font-normal h-8">
                          {category || '选择分类'}
                          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                        <div className="flex items-center gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
                          <Input placeholder="新增分类..." value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newCategory.trim(); if (v) { if (!allCategories.includes(v)) setLocalCategories(p => [...p, v]); setCategory(v); setNewCategory('') } } }}
                            className="h-7 text-xs flex-1" />
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                            onClick={() => { const v = newCategory.trim(); if (v) { if (!allCategories.includes(v)) setLocalCategories(p => [...p, v]); setCategory(v); setNewCategory('') } }}
                            disabled={!newCategory.trim()}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setCategory('')}>
                          <span className="text-muted-foreground">不限分类</span>
                          {!category && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                        {(() => {
                          const yearCats = allCategories.filter((c) => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a))
                          const nonYearCats = allCategories.filter((c) => !/^\d{4}年真题$/.test(c))
                          return (<>
                            {yearCats.length > 0 && (<>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>历年真题</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                  {yearCats.map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => setCategory(s)}>{s}{category === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </>)}
                            {nonYearCats.length > 0 && yearCats.length > 0 && <DropdownMenuSeparator />}
                            {nonYearCats.map((s) => (
                              <DropdownMenuItem key={s} onClick={() => setCategory(s)}>{s}{category === s && <Check className="h-4 w-4 ml-auto" />}</DropdownMenuItem>
                            ))}
                          </>)
                        })()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Key points */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">知识点 <span className="text-muted-foreground font-normal text-xs">(选填)</span></label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between text-sm font-normal h-8">
                          {keyPoints || '选择知识点'}
                          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                        <div className="flex items-center gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
                          <Input placeholder="新增知识点..." value={newKeyPoint}
                            onChange={(e) => setNewKeyPoint(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newKeyPoint.trim(); if (v) { if (!allKeyPoints.includes(v)) setLocalKeyPoints(p => [...p, v]); setKeyPoints(v); setNewKeyPoint('') } } }}
                            className="h-7 text-xs flex-1" />
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                            onClick={() => { const v = newKeyPoint.trim(); if (v) { if (!allKeyPoints.includes(v)) setLocalKeyPoints(p => [...p, v]); setKeyPoints(v); setNewKeyPoint('') } }}
                            disabled={!newKeyPoint.trim()}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setKeyPoints('')}>
                          <span className="text-muted-foreground">不限知识点</span>
                          {!keyPoints && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                        {allKeyPoints.map((s) => (
                          <DropdownMenuItem key={s} onClick={() => setKeyPoints(s)}>
                            {s}
                            {keyPoints === s && <Check className="h-4 w-4 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer pt-2 border-t">
                  <Switch id="line-break-sw" checked={lineBreakEnabled} onCheckedChange={setLineBreakEnabled} />
                  <span className="text-xs text-muted-foreground">AI 自动换行（解析后逐个格式化题干）</span>
                </label>
              </div>

              {/* Parse mode selection */}
              <Tabs value={parseMode} onValueChange={(v) => { setParseMode(v as ParseMode); if (v === 'lightweight') setBatchMode(false) }}>
                <TabsList>
                  <TabsTrigger value="lightweight">轻量解析</TabsTrigger>
                  {isEnabled('mineru') && (
                    <TabsTrigger value="precision">精准解析</TabsTrigger>
                  )}
                  <TabsTrigger value="generate">AI 生成</TabsTrigger>
                </TabsList>
              </Tabs>

              {parseMode === 'lightweight' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">单文件 ≤ 10MB、≤ 20 页，无需 Token。</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">指定页数</label>
                    <Input
                      placeholder="如: 1-10,15-20 (留空=全部)"
                      value={pageRanges}
                      onChange={(e) => setPageRanges(e.target.value)}
                      className="h-7 text-xs max-w-[220px]"
                    />
                  </div>
                </div>
              )}
              {parseMode === 'precision' && (
                <p className="text-xs text-muted-foreground">单文件 ≤ 200MB、≤ 200 页，批量最多 200 个文件。需配置 MinerU Token。</p>
              )}

              {/* Precision mode settings */}
              {parseMode === 'precision' && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div>
                    <label className="text-sm font-medium">MinerU Token</label>
                    <Input
                      type="password"
                      className="mt-1"
                      placeholder="输入 MinerU API Token"
                      value={mineruToken}
                      onChange={(e) => handleTokenChange(e.target.value)}
                    />
                    {!mineruToken && (
                      <p className="text-xs text-muted-foreground mt-1">
                        可在 MinerU API 管理页面创建 Token。也可通过 VITE_MINERU_TOKEN 环境变量配置。
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer" htmlFor="batch-mode-sw">
                      <Switch
                        id="batch-mode-sw"
                        checked={batchMode}
                        onCheckedChange={(v) => { setBatchMode(v); setFile(null); setFiles([]) }}
                      />
                      <span className="text-xs">批量模式</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          模型版本: {modelVersion}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup value={modelVersion} onValueChange={(v) => handleModelChange(v as MinerUModelVersion)}>
                          <DropdownMenuRadioItem value="vlm">vlm</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="pipeline">pipeline</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="MinerU-HTML">MinerU-HTML</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          识别选项
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuCheckboxItem checked={enableFormula} onCheckedChange={setEnableFormula}>
                          公式识别
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={enableTable} onCheckedChange={setEnableTable}>
                          表格识别
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={enableOcr} onCheckedChange={setEnableOcr}>
                          OCR
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          导出格式{extraFormats.length > 0 ? ` (${extraFormats.length})` : ''}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {[
                          { key: 'docx', label: 'DOCX' },
                          { key: 'html', label: 'HTML' },
                          { key: 'latex', label: 'LaTeX' },
                        ].map((fmt) => (
                          <DropdownMenuCheckboxItem
                            key={fmt.key}
                            checked={extraFormats.includes(fmt.key)}
                            onCheckedChange={(v) => {
                              setExtraFormats((prev) =>
                                v ? [...prev, fmt.key] : prev.filter((x) => x !== fmt.key),
                              )
                            }}
                          >
                            {fmt.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground whitespace-nowrap">
                        指定页数{batchMode ? ' (所有文件)' : ''}
                      </label>
                      <Input
                        placeholder="如: 1-10,15-20"
                        value={pageRanges}
                        onChange={(e) => setPageRanges(e.target.value)}
                        className="h-7 text-xs w-[160px]"
                      />
                    </div>
                    {!batchMode && (
                      <>
                        <label className="flex items-center gap-1.5 cursor-pointer" htmlFor="no-cache-sw">
                          <Switch id="no-cache-sw" checked={noCache} onCheckedChange={setNoCache} />
                          <span className="text-xs">绕过缓存</span>
                        </label>
                        {!noCache && (
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-muted-foreground whitespace-nowrap">缓存容忍</label>
                            <Input
                              type="number"
                              placeholder="900s"
                              value={cacheTolerance}
                              onChange={(e) => setCacheTolerance(e.target.value)}
                              className="h-7 text-xs w-[70px]"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">数据 ID</label>
                          <Input
                            placeholder="业务标识"
                            value={dataId}
                            onChange={(e) => setDataId(e.target.value)}
                            className="h-7 text-xs w-[100px]"
                          />
                        </div>
                      </>
                    )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-sm flex items-center gap-1">
                        使用 R2 上传
                        <Icon icon="logos:cloudflare-icon" className="h-3.5 w-3.5 shrink-0" />
                      </p>
                      <p className="text-xs text-muted-foreground">大文件（＞50MB）通过 Cloudflare R2 上传，无大小限制</p>
                    </div>
                    <Switch checked={useR2Upload} onCheckedChange={setUseR2Upload} />
                  </div>
                  </div>
                </div>
              )}

              {parseMode === 'generate' ? (
                <div className="space-y-5">
                  <p className="text-xs text-muted-foreground">上传原始资料，AI 直接阅读文献并生成练习题。支持 PDF、Word、TXT。</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">指定页数</label>
                    <Input
                      placeholder="如: 1-10,15-20 (留空=全部)"
                      value={genPageRanges}
                      onChange={(e) => setGenPageRanges(e.target.value)}
                      className="h-7 text-xs max-w-[220px]"
                    />
                  </div>

                  {/* File upload */}
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">上传资料文件</p>
                        {genFile && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => { setGenFile(null); setGenFileText('') }}>
                            <X className="h-3 w-3 mr-1" />移除文件
                          </Button>
                        )}
                      </div>
                      {genFile ? (
                        <div className="flex items-center gap-3 bg-muted/40 rounded-lg border p-3">
                          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{genFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {extracting ? '提取中...' : `已提取 ${genFileText.length} 字符`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors" htmlFor="gen-file-input">
                          <input id="gen-file-input" type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGenFile(f) }} />
                          <Upload className="h-5 w-5 text-muted-foreground/60" />
                          <span className="text-sm text-muted-foreground">点击选择文件，或拖拽到此处</span>
                          <span className="text-xs text-muted-foreground/50">PDF、Word (.docx)、TXT</span>
                        </label>
                      )}
                      {extracting && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Spinner /> 正在提取文本...
                        </div>
                      )}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {genFileText && !extracting && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1 font-medium">预览提取内容</summary>
                            <pre className="mt-1 p-3 bg-muted/50 rounded-lg border max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">{genFileText.slice(0, 2000)}{genFileText.length > 2000 ? '\n\n... 内容过长，已截断预览' : ''}</pre>
                          </details>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1 font-medium">
                            避免重复 {dedupHistoryIds.size > 0 ? `(已选 ${dedupHistoryIds.size})` : ''}
                          </summary>
                          {history.filter((h) => h.questions_json).length === 0 ? (
                            <p className="text-muted-foreground py-1">暂无历史生成记录</p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-0.5 mt-1 rounded border p-1.5">
                              {history.filter((h) => h.questions_json).map((h) => {
                                const checked = dedupHistoryIds.has(h.id)
                                return (
                                <div key={h.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1.5 py-0.5">
                                  <button type="button" onClick={() => {
                                    setDedupHistoryIds((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(h.id)) next.delete(h.id)
                                      else next.add(h.id)
                                      return next
                                    })
                                  }} className={cn(
                                    'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                                    checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'
                                  )}>
                                    {checked && <Check className="h-3 w-3" />}
                                  </button>
                                  <span className="truncate flex-1 text-xs">
                                    {h.display_name || (h.file_name.startsWith('http') ? h.file_name.split('/').pop() : h.file_name)}
                                    {h.mode !== 'generate' && <span className="text-[10px] text-muted-foreground ml-1">({h.page_ranges || '全部'})</span>}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(h.created_at).toLocaleDateString()}</span>
                                </div>
                                )
                              })}
                            </div>
                          )}
                          {dedupHistoryIds.size > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">已选 {dedupHistoryIds.size} 条历史题目加入提示词，AI 将避免重复</p>
                          )}
                        </details>
                      </div>
                    </CardContent>
                  </Card>

                  <PromptEditor label="提示词" value={generateDocPrompt}
                    onChange={(v) => { setGenerateDocPrompt(v); setPrompt('generate_doc', v) }}
                    onReset={() => setGenerateDocPrompt(resetPrompt('generate_doc'))}
                  />

                  {/* Config */}
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">学科 <span className="text-muted-foreground font-normal text-xs">(选填)</span></label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between text-sm font-normal">
                                {genSubject || '选择学科'}
                                <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                              <DropdownMenuItem onClick={() => setGenSubject('')}>
                                <span className="text-muted-foreground">不限学科</span>
                                {!genSubject && <Check className="h-4 w-4 ml-auto" />}
                              </DropdownMenuItem>
                              {existingSubjects.map((s) => (
                                <DropdownMenuItem key={s} onClick={() => setGenSubject(s)}>
                                  {s}
                                  {genSubject === s && <Check className="h-4 w-4 ml-auto" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">题目数量</label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between text-sm font-normal">
                                {genCount} 题
                                <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {[1, 3, 5, 10, 15, 20, 25, 30].map((n) => (
                                <DropdownMenuItem key={n} onClick={() => setGenCount(n)}>
                                  {n} 题
                                  {genCount === n && <Check className="h-4 w-4 ml-auto" />}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">题型 <span className="text-muted-foreground font-normal text-xs">(至少选一个)</span></label>
                        <div className="flex flex-wrap gap-2">
                          {QUESTION_TYPE_OPTIONS.map((t) => {
                            const selected = genTypes.has(t.value)
                            return (
                              <Button
                                key={t.value}
                                type="button"
                                variant={selected ? 'default' : 'outline'}
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  setGenTypes((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(t.value)) {
                                      if (next.size > 1) next.delete(t.value)
                                    } else {
                                      next.add(t.value)
                                    }
                                    return next
                                  })
                                }}
                              >
                                {t.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">知识点范围</label>
                        <Input placeholder="如：三段论、假言推理、选言推理"
                          value={genTopic} onChange={(e) => setGenTopic(e.target.value)} />
                      </div>
                    </CardContent>
                  </Card>

                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">PDF URL <span className="text-muted-foreground font-normal text-xs">(选填，直接填入 URL 无需上传)</span></label>
                    <Input placeholder="https://example.com/document.pdf" value={manualPdfUrl}
                      onChange={(e) => { setManualPdfUrl(e.target.value); if (e.target.value) { setFile(null); setFiles([]) } }}
                      className="h-9 text-sm" />
                  </div>
                  <AiImportUpload
                    onFile={handleFile}
                    onFiles={handleFiles}
                    disabled={!aiConfigured || (parseMode === 'precision' && !mineruToken)}
                    multiple={parseMode === 'precision' && batchMode}
                  />
                </>
              )}

              {error && <p className="text-sm text-destructive mt-2">{error}</p>}

              {parseMode === 'generate' ? (
                <Button onClick={handleGenerate} disabled={!canStart || generating} className="w-full mt-4">
                  {generating ? (
                    <>
                      <Spinner />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      生成题目
                    </>
                  )}
                </Button>
              ) : existingHistoryEntry ? (
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleViewExistingParse} variant="default" className="flex-1">
                    <ArrowRight className="h-4 w-4" />
                    查看已有解析
                  </Button>
                  <Button onClick={startParse} disabled={!canStart} variant="outline" className="flex-1">
                    <Play className="h-4 w-4" />
                    重新解析
                  </Button>
                </div>
              ) : (
                <Button onClick={startParse} disabled={!canStart} className="w-full mt-4">
                  <Play className="h-4 w-4" />
                  {parseMode === 'precision' ? '开始精准解析' : '开始解析'}
                </Button>
              )}
              </div>

              {/* ===== RIGHT PANEL: Cloudflare R2 ===== */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                    <Icon icon="logos:cloudflare-icon" className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">Cloudflare R2</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">PDF 存储桶</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {r2Pdfs.length} 文件
                  </span>
                </div>
                <R2PdfGallery
                  pdfs={r2Pdfs}
                  loading={r2Loading}
                  displayNames={r2DisplayNames}
                  onSelect={(url) => { setManualPdfUrl(url); setFile(null); setFiles([]) }}
                  onRename={(key, name) => {
                    const next = new Map(r2DisplayNames)
                    if (name) next.set(key, name)
                    else next.delete(key)
                    saveR2DisplayNames(next)
                  }}
                  onRefresh={() => {
                    setR2Loading(true)
                    supabase.functions.invoke('r2-list', { body: { prefix: 'pdf/' } })
                      .then(({ data }) => {
                        if (data?.files) setR2Pdfs((data.files as { key: string; url: string; size: number }[]).filter(f => f.key !== 'pdf/' && !f.key.endsWith('/')))
                      })
                      .catch(() => {})
                      .finally(() => setR2Loading(false))
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 2: Parsing */}
          {step === 'parsing' && (
            <div className="space-y-4">
              <ParsingProgress msg={parseMsg} status={parseStatus} parsingDone={parsingDone} hasQuestions={questions.length > 0} />

              {parsingDone && parseResult ? (
                <>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setStepPersisted('upload'); setParsingDone(false); setParseResult(null) }}>
                      重新解析
                    </Button>
                    <Button size="sm" onClick={() => {
                      let markdown = parseResult.markdown
                      if (parseResult?.jsonData && selectedSectionIdx.size > 0) {
                        try {
                          const { sections } = parseLayoutTree(parseResult.jsonData, pageRanges)
                          markdown = sections.filter((_, i) => selectedSectionIdx.has(i)).map(s => s.text).join('\n\n')
                        } catch { /* use full markdown */ }
                      }
                      extractQuestions(markdown)
                    }}>
                      <ArrowRight className="h-4 w-4" />
                      AI 提取题目
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <PromptEditor
                      label="提取题目"
                      value={extractPrompt}
                      onChange={(v) => { setExtractPrompt(v); setPrompt('extract', v) }}
                      onReset={() => setExtractPrompt(resetPrompt('extract'))}
                    />
                    <Card>
                      <CardContent className="py-3 space-y-2">
                        <button type="button"
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium"
                          onClick={() => setDedupOpen(!dedupOpen)}>
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${dedupOpen ? 'rotate-90' : ''}`} />
                          避免重复 {dedupHistoryIds.size > 0 ? `(已选 ${dedupHistoryIds.size})` : ''}
                        </button>
                        {dedupOpen && (
                          <>
                            {history.filter((h) => h.questions_json).length === 0 ? (
                              <p className="text-muted-foreground py-1">暂无历史生成记录</p>
                            ) : (
                              <div className="max-h-40 overflow-y-auto space-y-0.5 rounded border p-1.5">
                                {history.filter((h) => h.questions_json).map((h) => {
                                  const checked = dedupHistoryIds.has(h.id)
                                  return (
                                    <div key={h.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1.5 py-0.5">
                                      <button type="button" onClick={() => {
                                        setDedupHistoryIds((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(h.id)) next.delete(h.id)
                                          else next.add(h.id)
                                          return next
                                        })
                                      }} className={cn(
                                        'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'
                                      )}>
                                        {checked && <Check className="h-3 w-3" />}
                                      </button>
                                      <span className="truncate flex-1 text-[10px]">
                                        {h.display_name || (h.file_name.startsWith('http') ? h.file_name.split('/').pop() : h.file_name)}
                                        {h.mode !== 'generate' && <span className="text-[9px] text-muted-foreground ml-1">({h.page_ranges || '全部'})</span>}
                                      </span>
                                      <span className="text-[9px] text-muted-foreground shrink-0">{new Date(h.created_at).toLocaleDateString()}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {dedupHistoryIds.size > 0 && (
                              <p className="text-[9px] text-muted-foreground">已选 {dedupHistoryIds.size} 条历史题目加入提示词，AI 将避免重复</p>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium">MinerU 解析结果</p>
                      {editPdfId === currentHistoryId ? (
                        <div className="flex items-center gap-1">
                          <Input value={editPdfUrl} onChange={(e) => setEditPdfUrl(e.target.value)} className="h-7 text-xs w-80" placeholder="PDF URL" onKeyDown={(e) => { if (e.key === 'Enter') savePdfUrl() }} />
                          {r2Pdfs.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">R2 <ChevronDown className="h-3 w-3" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto max-w-sm">
                                {r2Pdfs.filter(f => f.key !== 'pdf/' && !f.key.endsWith('/')).map((f) => (
                                  <DropdownMenuItem key={f.key} className="text-xs" onClick={() => setEditPdfUrl(f.url)}>
                                    <span className="truncate">{r2DisplayNames.get(f.key) || f.key.replace('pdf/', '')}</span>
                                    <span className="ml-2 text-[10px] text-muted-foreground shrink-0">{formatSize(f.size)}</span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <Button size="sm" className="h-7 text-xs" onClick={savePdfUrl} disabled={!editPdfUrl.trim()}>确定</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditPdfId(null)}>取消</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          {currentDisplayName || (parseResult.fileName.startsWith('http') ? parseResult.fileName.split('/').pop() : parseResult.fileName)}
                          {currentHistoryId && (
                            <button type="button" className="text-muted-foreground/50 hover:text-foreground" title="更换 PDF 链接"
                              onClick={() => { setEditPdfId(currentHistoryId); setEditPdfUrl(parseResult.fileName) }}>
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {parseResult?.jsonData && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                              {selectionMode === 'off' ? '段落选择' : selectionMode === 'single' ? `单击 · ${selectedSectionIdx.size}` : `范围 · ${selectedSectionIdx.size}`}
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuRadioGroup value={selectionMode} onValueChange={(v) => { setSelectionMode(v as typeof selectionMode); setRangeAnchor(null) }}>
                              <DropdownMenuRadioItem value="off">关闭</DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="single">单击选择</DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="range">范围选择（起点 + 终点）</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                            {selectionMode !== 'off' && (
                              <DropdownMenuItem onClick={() => { setSelectedSectionIdx(new Set()); setRangeAnchor(null) }}>
                                清除选择
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {currentHistoryId && !pageRendering && historyPdfUrl && (
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => renderAndUploadPages(historyPdfUrl, currentHistoryId)}>
                          {pageUrls.length > 0 ? '重新缓存' : '缓存页面到 R2'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {(historyPdfUrl || pdfUrl) && parseResult?.jsonData ? (
                    <Card className="border-0 shadow-none">
                      <CardContent className="p-0 h-[calc(100vh-100px)]">
                        <PdfMarkdownViewer key={currentHistoryId ?? 'live'} pdfUrl={historyPdfUrl || pdfUrl} jsonData={parseResult.jsonData} markdown={parseResult.markdown} pageRanges={pageRanges} pageUrls={pageUrls.length > 0 ? pageUrls : undefined} rendering={pageRendering}
                          selectionMode={selectionMode}
                          selectedSections={selectedSectionIdx}
                          rangeAnchor={rangeAnchor}
                          onToggleSection={(i) => {
                            if (selectionMode === 'range' && rangeAnchor === null) {
                              setRangeAnchor(i)
                            }
                            setSelectedSectionIdx(prev => {
                              const next = new Set(prev)
                              if (next.has(i)) { next.delete(i) } else { next.add(i) }
                              return next
                            })
                          }}
                          onRangeSelect={(from, to) => {
                            const next = new Set<number>()
                            for (let j = from; j <= to; j++) next.add(j)
                            setSelectedSectionIdx(next)
                            setRangeAnchor(null)
                          }}
                        >
                          <button type="button" className="text-[10px] underline text-muted-foreground hover:text-foreground" onClick={() => {
                            const w = window.open('', '_blank', 'width=800,height=600')
                            if (w) {
                              w.document.write(`<pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;font-family:monospace;padding:16px">${parseResult.jsonData!.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`)
                            }
                          }}>
                            预览 JSON
                          </button>
                        </PdfMarkdownViewer>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="border-0 shadow-none">
                      <CardContent className="py-4 space-y-2">
                        <p className="text-xs text-muted-foreground">MinerU 解析结果</p>
                        <ScrollArea className="bg-muted/50 rounded-lg p-3 h-[calc(100vh-100px)]">
                          <pre className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed">
                            {(() => {
                              const start = parsePage * CHARS_PER_PAGE
                              return parseResult.markdown.slice(start, start + CHARS_PER_PAGE)
                            })()}
                          </pre>
                        </ScrollArea>
                        {(() => {
                          const totalPages = Math.ceil(parseResult.markdown.length / CHARS_PER_PAGE)
                          if (totalPages <= 1) return null
                          return (
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={parsePage === 0} onClick={() => setParsePage(p => p - 1)}>上一页</Button>
                              <span className="text-xs text-muted-foreground tabular-nums">{parsePage + 1} / {totalPages}</span>
                              <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={parsePage >= totalPages - 1} onClick={() => setParsePage(p => p + 1)}>下一页</Button>
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-28" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="py-3 space-y-3">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-40 w-full" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-3 space-y-2">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Card>
                      <CardContent className="py-4 space-y-2">
                        <Skeleton className="h-64 w-full" />
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 'preview' && (
            <>
              <AiImportPreview
                questions={questions}
                selectedIds={selectedIds}
                subject={subject}
                category={category}
                existingSubjects={existingSubjects}
                existingCategories={existingCategories}
                existingKeyPoints={existingKeyPoints}
                onSubjectChange={setSubject}
                onCategoryChange={setCategory}
                onSetKeyPoints={(indexes, kp) => {
                  setQuestions(prev => prev.map((q, i) =>
                    indexes.includes(i) ? { ...q, key_points: kp } : q
                  ))
                }}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onChangeQuestion={changeQuestion}
                onRemoveQuestion={removeQuestion}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStepPersisted('upload')}>
                  <ArrowLeft className="h-4 w-4" /> 返回
                </Button>
                <Button onClick={startImport} disabled={selectedIds.size === 0}>
                  导入选中 ({selectedIds.size})
                </Button>
              </div>
            </>
          )}

          {/* Step 5: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner />
              <p className="text-sm text-muted-foreground">正在导入题目...</p>
            </div>
          )}

          {/* Step 6: Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="text-lg font-semibold">导入完成</p>
                <p className="text-sm text-muted-foreground">成功导入 {importCount} 道题目</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetState}>
                  继续导入
                </Button>
                <Button asChild>
                  <Link to="/admin/questions">返回题目管理</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除解析记录</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm ? `确定删除选中的 ${deleteConfirm.ids.length} 条记录？` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Button variant="destructive" className="w-full" onClick={() => handleDeleteConfirm(true)}>
              删除记录和缓存 PDF 图片
            </Button>
            <AlertDialogCancel onClick={() => handleDeleteConfirm(false)}>
              仅删除记录
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PromptEditor({ label, value, onChange, onReset }: { label: string; value: string; onChange: (v: string) => void; onReset: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <button type="button"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium"
          onClick={() => setOpen(!open)}>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
          提示词 {label && `— ${label}`}
        </button>
        {open && (
          <>
            <textarea
              className="w-full h-40 text-xs font-mono p-3 rounded-lg border bg-muted/30 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
            />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onReset}>
                恢复默认
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SkeletonRow({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-4 rounded bg-muted/50 ${w}`} />
}

function s(v: unknown): string { return v != null ? String(v) : '' }

function ParsingProgress({ msg, status, parsingDone, hasQuestions }: { msg: string; status: Record<string, unknown> | null; parsingDone: boolean; hasQuestions: boolean }) {
  const steps = [
    { label: '上传文档', key: 'upload' },
    { label: '文档解析', key: 'mineru' },
    { label: 'AI 提取', key: 'ai' },
  ]

  // Determine current active step from msg
  let activeIdx = -1
  if (msg.includes('上传') || msg.includes('批量任务')) activeIdx = 0
  else if (msg.includes('MinerU') || msg.includes('解析') || msg.includes('Batch')) activeIdx = 1
  else if (msg.includes('AI') || msg.includes('提取')) activeIdx = 2

  const stepDone = (i: number) => {
    if (i === 0) return parsingDone || activeIdx > 0
    if (i === 1) return parsingDone || activeIdx > 1
    if (i === 2) return hasQuestions
    return false
  }
  const stepActive = (i: number) => i === activeIdx && !stepDone(i)

  const stateLabel = (s: unknown) => {
    if (s === 'done') return '已完成'
    if (s === 'failed') return '失败'
    if (s === 'running') return '处理中'
    if (s === 'pending') return '排队中'
    if (s === 'converting') return '转换中'
    if (s === 'connecting') return '连接中'
    return String(s)
  }
  const stateColor = (s: unknown) => {
    if (s === 'done') return 'text-green-600 bg-green-100 dark:bg-green-900/30'
    if (s === 'failed') return 'text-red-500 bg-red-100 dark:bg-red-900/30'
    if (s === 'connecting') return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'
    return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30'
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: Progress card */}
      <Card className="border-0 shadow-none">
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center w-full max-w-xs">
              {steps.map((s, i) => {
                const done = stepDone(i)
                const active = stepActive(i)
                return (
                <div key={s.key} className="flex items-center flex-1 last:flex-[0]">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500
                      ${done || active ? 'bg-primary text-primary-foreground scale-110 shadow-md' : 'bg-muted text-muted-foreground'}`}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className={`text-[10px] whitespace-nowrap transition-colors duration-500
                      ${done || active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 mt-[-12px] rounded bg-muted transition-all duration-700">
                      <div className="h-full rounded bg-primary transition-all duration-700 ease-out"
                        style={{ width: done ? '100%' : active ? '50%' : '0%' }} />
                    </div>
                  )}
                </div>
                )
              })}
            </div>
            <p className="text-sm font-medium shimmer-text">{msg || '正在解析...'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Right: Response data card */}
      <Card className="border-0 shadow-none">
        <CardContent className="py-6 space-y-3 text-[11px]">
          <p className="font-medium text-muted-foreground">MinerU API 响应</p>

          {!status ? (
            <div className="space-y-2 animate-pulse">
              <SkeletonRow />
              <SkeletonRow w="w-3/4" />
              <SkeletonRow w="w-1/2" />
              <SkeletonRow />
              <SkeletonRow w="w-2/3" />
            </div>
          ) : (
            <>
              {/* Basic info table */}
              <table className="w-full border-collapse">
                <tbody>
                  {s(status.taskId) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Task ID</td><td className="py-1 font-mono break-all">{s(status.taskId)}</td></tr>}
                  {s(status.batchId) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Batch ID</td><td className="py-1 font-mono break-all">{s(status.batchId)}</td></tr>}
                  {s(status.dataId) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Data ID</td><td className="py-1 font-mono break-all">{s(status.dataId)}</td></tr>}
                  {status.code !== undefined && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Code</td><td className={`py-1 ${(status.code as number) === 0 ? 'text-green-600' : 'text-red-500'}`}>{s(status.code)}{status.msg ? ` — ${s(status.msg)}` : ''}</td></tr>}
                  {status.state !== undefined && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">State</td><td className="py-1"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stateColor(status.state)}`}>{stateLabel(status.state)}</span></td></tr>}
                  {s(status.markdownUrl) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Markdown URL</td><td className="py-1 font-mono break-all text-[10px]">{s(status.markdownUrl)}</td></tr>}
                  {s(status.fullZipUrl) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">ZIP URL</td><td className="py-1 font-mono break-all text-[10px]">{s(status.fullZipUrl)}</td></tr>}
                  {s(status.errMsg) && <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Error</td><td className="py-1 text-red-500">{s(status.errMsg)}</td></tr>}
                  {status.extractProgress ? <tr><td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">Pages</td><td className="py-1">{s((status.extractProgress as Record<string, number>).extractedPages)} / {s((status.extractProgress as Record<string, number>).totalPages)}</td></tr> : null}
                </tbody>
              </table>

              {/* File list for batch */}
              {s(status.files) && (status.files as Array<Record<string, unknown>>).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1.5">文件列表</p>
                  <table className="w-full border-collapse text-[10px]">
                    <thead><tr className="text-muted-foreground text-left"><th className="py-0.5 pr-2 font-normal">文件</th><th className="py-0.5 pr-2 font-normal">状态</th><th className="py-0.5 font-normal">Data ID</th></tr></thead>
                    <tbody>
                      {(status.files as Array<Record<string, unknown>>).map((f: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="py-1 pr-2 max-w-[120px] truncate">{f.fileName as string}</td>
                          <td className="py-1 pr-2"><span className={`px-1 py-0.5 rounded text-[10px] ${stateColor(f.state)}`}>{stateLabel(f.state)}</span></td>
                          <td className="py-1 font-mono text-[10px] text-muted-foreground">{f.dataId ? String(f.dataId) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


