import { DOC_TYPES } from '@/lib/resource-library'

/** 录入与编辑共用同一套元数据字段的表单值, 免得两处表单慢慢长歪 */
export interface MetaFormValue {
  title: string
  authors: string
  source: string
  pubYear: string
  docType: string
  subject: string
  tags: string
  doi: string
  abstract: string
}

export const EMPTY_META: MetaFormValue = {
  title: '', authors: '', source: '', pubYear: '',
  docType: DOC_TYPES[0], subject: '', tags: '', doi: '', abstract: '',
}

export function splitTags(raw: string): string[] {
  return raw.split(/[,，、;；\s]+/).map((t) => t.trim()).filter(Boolean)
}

export function metaToInput(value: MetaFormValue) {
  return {
    title: value.title,
    authors: value.authors,
    source: value.source,
    pub_year: value.pubYear.trim() ? Number(value.pubYear.trim()) : null,
    doc_type: value.docType,
    subject: value.subject,
    tags: splitTags(value.tags),
    doi: value.doi,
    abstract: value.abstract,
  }
}
