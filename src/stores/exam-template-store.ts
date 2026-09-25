import { create } from 'zustand'
import { createExamTemplate, deleteExamTemplate, fetchExamTemplates, toExamTemplate, updateExamTemplate } from '@/services/exam'
import { logError, userMessage } from '@/services/errors'
import type { ExamTemplate, ExamTemplateSection, ExamOrderMode, ExamSampleMode } from '@/types'
import type { ExamTemplateCover } from '@/lib/paper-cover'
import type { ExamTemplateLayout } from '@/lib/paper-layout'
import { BUILTIN_EXAM_TEMPLATES, isBuiltinTemplate } from '@/lib/exam-presets'
import { registerUserScopedStore } from '@/stores/user-scope'

export type ExamTemplateDraft = {
  name: string
  /** 整卷学科(可多选); 空数组 / null = 不限学科 */
  subject: string[] | null
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

/** 读一行 exam_templates(或一份模板快照 JSONB) → 模板对象; 归一化在服务层, 这里只是既有调用方的入口 */
export function normalizeTemplate(row: Record<string, unknown>): ExamTemplate {
  return toExamTemplate(row)
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
    try {
      set({ templates: await fetchExamTemplates(userId), isLoading: false })
    } catch (e) {
      logError('examTemplate.load', e)
      set({ isLoading: false, error: userMessage(e) })
    }
  },

  create: async (userId, draft) => {
    set({ error: null })
    try {
      const created = await createExamTemplate(userId, { ...draft, sort_order: get().templates.length })
      if (!created) {
        set({ error: 'Failed to create template' })
        return null
      }
      set({ templates: [...get().templates, created] })
      return created
    } catch (e) {
      logError('examTemplate.create', e)
      set({ error: userMessage(e) })
      return null
    }
  },

  update: async (id, patch) => {
    if (isBuiltinTemplate(id)) return
    set({ error: null })
    try {
      const updated = await updateExamTemplate(id, patch)
      if (!updated) {
        set({ error: 'Failed to update template' })
        return
      }
      set({ templates: get().templates.map((t) => (t.id === id ? updated : t)) })
    } catch (e) {
      logError('examTemplate.update', e)
      set({ error: userMessage(e) })
    }
  },

  remove: async (id) => {
    if (isBuiltinTemplate(id)) return
    set({ error: null })
    try {
      await deleteExamTemplate(id)
      set({ templates: get().templates.filter((t) => t.id !== id) })
    } catch (e) {
      logError('examTemplate.remove', e)
      set({ error: userMessage(e) })
    }
  },

  clear: () => set({ templates: [], isLoading: false, error: null }),
}))

registerUserScopedStore(() => useExamTemplateStore.getState().clear())

/** 用户模板在前, 内置预设在后 */
export function selectAllTemplates(user: ExamTemplate[]): ExamTemplate[] {
  return [...user, ...BUILTIN_EXAM_TEMPLATES]
}
