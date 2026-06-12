export const EXAM_DEFAULT_COUNT = 50
export const EXAM_MIN_COUNT = 5
export const EXAM_MAX_COUNT = 200
export const EXAM_DEFAULT_DURATION_MIN = 60
export const EXAM_MIN_DURATION_MIN = 5
export const EXAM_MAX_DURATION_MIN = 300
export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice' as const, label: '单选题' },
  { value: 'multi_select' as const, label: '多选题' },
  { value: 'true_false' as const, label: '判断题' },
  { value: 'judge_correct' as const, label: '判断改错题' },
  { value: 'fill_blank' as const, label: '填空题' },
  { value: 'short_answer' as const, label: '简答题' },
  { value: 'analysis' as const, label: '分析题' },
]

export const QUESTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  QUESTION_TYPE_OPTIONS.map(o => [o.value, o.label])
)

export const IMPORT_MODE_OPTIONS = [
  { value: 'manual' as const, label: '手动' },
  { value: 'lightweight' as const, label: '轻量' },
  { value: 'precision' as const, label: '精准' },
  { value: 'generate' as const, label: 'AI生成' },
]

export const IMPORT_MODE_LABELS: Record<string, string> = Object.fromEntries(
  IMPORT_MODE_OPTIONS.map(o => [o.value, o.label])
)

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50]
