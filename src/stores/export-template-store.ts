import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CUSTOM_TEMPLATES, type ExportTemplate } from '@/lib/export-demo'

interface ExportTemplateState {
  /** 仅存用户自建模板；内置模板是常量，不参与持久化 */
  templates: ExportTemplate[]
  createTemplate: (template: ExportTemplate) => ExportTemplate
  updateTemplate: (template: ExportTemplate) => void
  removeTemplate: (id: string) => void
  resetTemplates: () => void
}

function nextId(existing: ExportTemplate[]): string {
  let index = existing.length + 1
  while (existing.some((item) => item.id === `tpl-custom-${index}`)) index += 1
  return `tpl-custom-${index}`
}

export const useExportTemplateStore = create<ExportTemplateState>()(
  persist(
    (set) => ({
      templates: DEFAULT_CUSTOM_TEMPLATES,

      createTemplate: (template) => {
        let created = template
        set((state) => {
          created = {
            ...template,
            id: template.id || nextId(state.templates),
            builtin: false,
            createdAt: new Date().toISOString().slice(0, 10),
          }
          return { templates: [created, ...state.templates] }
        })
        return created
      },

      updateTemplate: (template) =>
        set((state) => ({
          templates: state.templates.map((item) => (item.id === template.id ? template : item)),
        })),

      removeTemplate: (id) =>
        set((state) => ({ templates: state.templates.filter((item) => item.id !== id) })),

      resetTemplates: () => set({ templates: DEFAULT_CUSTOM_TEMPLATES }),
    }),
    { name: 'export_templates' },
  ),
)
