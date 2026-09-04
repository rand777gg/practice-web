import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ExamTemplate, ExamTemplateSection, ExamOrderMode, ExamSampleMode, QuestionType } from '@/types'
import type { ExamTemplateCover, ExamTemplateCoverBlock } from '@/lib/paper-cover'
import { normalizeLayout, type ExamTemplateLayout } from '@/lib/paper-layout'
import { BUILTIN_EXAM_TEMPLATES, isBuiltinTemplate } from '@/lib/exam-presets'

export type ExamTemplateDraft = {
  name: string
  subject: string | null
  duration_min: number
  order_mode: ExamOrderMode
  sample_mode: ExamSampleMode
  sections: ExamTemplateSection[]
  /** 可选封面, 没传 = 不变, 显式 null = 清除 */
  cover?: ExamTemplateCover | null
  /** 可选排版, 没传 = 不变, 显式 null = 清除 */
  layout?: ExamTemplateLayout | null
  /** 继承来源模板 id (快照继承: 仅记录来源) */
  parent_id?: string | null
}

const ORDER_MODES: ExamOrderMode[] = ['section', 'shuffle']
const SAMPLE_MODES: ExamSampleMode[] = ['random', 'wrong_first', 'unseen_first', 'seq']

function normalizeSection(raw: unknown, index: number): ExamTemplateSection | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const type = (typeof s.type === 'string' && s.type ? s.type : null) as QuestionType | null
  return {
    id: typeof s.id === 'string' && s.id ? s.id : `s${index}`,
    type,
    count: Math.max(0, Math.min(200, Number(s.count) || 0)),
    score: Math.max(0, Math.min(100, Number(s.score) || 0)),
    categories: Array.isArray(s.categories) ? s.categories.filter((c): c is string => typeof c === 'string') : [],
  }
}

function normalizeSections(raw: unknown): ExamTemplateSection[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSection).filter((s): s is ExamTemplateSection => s !== null)
}

function normalizeCoverBlocks(raw: unknown): ExamTemplateCoverBlock[] | null {
  if (!Array.isArray(raw)) return null
  const blocks: ExamTemplateCoverBlock[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const o = b as Record<string, unknown>
    const kind = o.kind === 'heading' || o.kind === 'paragraph' || o.kind === 'rule' ? o.kind : 'paragraph'
    const block: ExamTemplateCoverBlock = { kind }
    if (typeof o.text === 'string') block.text = o.text
    if (o.align === 'left' || o.align === 'center' || o.align === 'right') block.align = o.align
    if (typeof o.bold === 'boolean') block.bold = o.bold
    if (o.size === 'sm' || o.size === 'md' || o.size === 'lg' || o.size === 'xl') block.size = o.size
    if (o.placement === 'header' || o.placement === 'footer' || o.placement === 'cover-end') {
      block.placement = o.placement
    }
    blocks.push(block)
  }
  return blocks.length ? blocks : null
}

function normalizeCover(raw: unknown): ExamTemplateCover | null {
  if (raw == null) return null
  if (typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const pick = (k: string): string | null => {
    const v = c[k]
    return typeof v === 'string' ? v : null
  }
  const notices = Array.isArray(c.notices)
    ? c.notices.filter((n): n is string => typeof n === 'string')
    : null
  const infoTable = Array.isArray(c.infoTable)
    ? c.infoTable
        .map((r) => {
          if (!r || typeof r !== 'object') return null
          const row = r as Record<string, unknown>
          if (typeof row.label !== 'string') return null
          const boxes = Math.max(0, Math.min(60, Number(row.boxes) || 0))
          const widthMm = typeof row.widthMm === 'number' ? row.widthMm : undefined
          return { label: row.label, boxes, widthMm }
        })
        .filter((r): r is { label: string; boxes: number; widthMm: number | undefined } => r !== null)
    : null
  return {
    banner: pick('banner'),
    examName: pick('examName'),
    title: pick('title'),
    codeLine: pick('codeLine'),
    noticeTitle: pick('noticeTitle'),
    notices,
    infoHint: pick('infoHint'),
    infoTable: infoTable && infoTable.length ? infoTable : null,
    customBlocks: normalizeCoverBlocks(c.customBlocks),
  }
}

function rowToTemplate(row: Record<string, unknown>): ExamTemplate {
  return {
    id: String(row.id),
    user_id: row.user_id == null ? null : String(row.user_id),
    name: String(row.name ?? ''),
    subject: row.subject == null ? null : String(row.subject),
    duration_min: Math.max(1, Math.min(600, Number(row.duration_min) || 60)),
    order_mode: ORDER_MODES.includes(row.order_mode as ExamOrderMode) ? (row.order_mode as ExamOrderMode) : 'section',
    sample_mode: SAMPLE_MODES.includes(row.sample_mode as ExamSampleMode) ? (row.sample_mode as ExamSampleMode) : 'random',
    sections: normalizeSections(row.sections),
    cover: normalizeCover(row.cover),
    layout: normalizeLayout(row.layout),
    parent_id: row.parent_id == null ? null : String(row.parent_id),
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

interface ExamTemplateState {
  /** 仅用户自有模板; 内置预设由 selectAllTemplates 合并 */
  templates: ExamTemplate[]
  isLoading: boolean
  error: string | null

  load: (userId: string) => Promise<void>
  create: (userId: string, draft: ExamTemplateDraft) => Promise<ExamTemplate | null>
  update: (id: string, patch: Partial<ExamTemplateDraft>) => Promise<void>
  remove: (id: string) => Promise<void>
  clear: () => void
}

export const useExamTemplateStore = create<ExamTemplateState>((set, get) => ({
  templates: [],
  isLoading: false,
  error: null,

  load: async (userId) => {
    set({ isLoading: true, error: null })
    const { data, error } = await supabase
      .from('exam_templates')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      set({ isLoading: false, error: error.message })
      return
    }
    set({ templates: (data ?? []).map((r) => rowToTemplate(r as Record<string, unknown>)), isLoading: false })
  },

  create: async (userId, draft) => {
    set({ error: null })
    const { data, error } = await supabase
      .from('exam_templates')
      .insert({
        user_id: userId,
        name: draft.name,
        subject: draft.subject,
        duration_min: draft.duration_min,
        order_mode: draft.order_mode,
        sample_mode: draft.sample_mode,
        sections: draft.sections as unknown as Record<string, unknown>[],
        cover: (draft.cover ?? null) as unknown as Record<string, unknown>,
        layout: (draft.layout ?? null) as unknown as Record<string, unknown>,
        parent_id: (draft.parent_id ?? null),
        sort_order: get().templates.length,
      })
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Failed to create template' })
      return null
    }
    const created = rowToTemplate(data as Record<string, unknown>)
    set({ templates: [...get().templates, created] })
    return created
  },

  update: async (id, patch) => {
    if (isBuiltinTemplate(id)) return
    set({ error: null })
    const payload: Record<string, unknown> = {}
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.subject !== undefined) payload.subject = patch.subject
    if (patch.duration_min !== undefined) payload.duration_min = patch.duration_min
    if (patch.order_mode !== undefined) payload.order_mode = patch.order_mode
    if (patch.sample_mode !== undefined) payload.sample_mode = patch.sample_mode
    if (patch.sections !== undefined) payload.sections = patch.sections as unknown as Record<string, unknown>[]
    if (patch.cover !== undefined) payload.cover = (patch.cover ?? null) as unknown as Record<string, unknown>
    if (patch.layout !== undefined) payload.layout = (patch.layout ?? null) as unknown as Record<string, unknown>

    const { data, error } = await supabase
      .from('exam_templates')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Failed to update template' })
      return
    }
    const updated = rowToTemplate(data as Record<string, unknown>)
    set({ templates: get().templates.map((t) => (t.id === id ? updated : t)) })
  },

  remove: async (id) => {
    if (isBuiltinTemplate(id)) return
    set({ error: null })
    const { error } = await supabase.from('exam_templates').delete().eq('id', id)
    if (error) {
      set({ error: error.message })
      return
    }
    set({ templates: get().templates.filter((t) => t.id !== id) })
  },

  clear: () => set({ templates: [], isLoading: false, error: null }),
}))

/** 内置预设在前, 用户模板在后 */
export function selectAllTemplates(user: ExamTemplate[]): ExamTemplate[] {
  return [...BUILTIN_EXAM_TEMPLATES, ...user]
}
