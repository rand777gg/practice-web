import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ExamTemplate, ExamTemplateSection, ExamOrderMode, ExamSampleMode, QuestionType } from '@/types'
import { BUILTIN_EXAM_TEMPLATES, isBuiltinTemplate } from '@/lib/exam-presets'

export type ExamTemplateDraft = {
  name: string
  subject: string | null
  duration_min: number
  order_mode: ExamOrderMode
  sample_mode: ExamSampleMode
  sections: ExamTemplateSection[]
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
