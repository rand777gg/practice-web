export const EXAM_GOALS = [
  { value: 'kaoyan', label: '考研' },
  { value: 'gongkao', label: '考公' },
  { value: 'final', label: '期末考' },
  { value: 'other', label: '其他考试' },
] as const

export type ExamGoalValue = (typeof EXAM_GOALS)[number]['value']

export function examGoalLabel(value?: string | null): string {
  if (!value) return ''
  return EXAM_GOALS.find((g) => g.value === value)?.label ?? '考试'
}
