export const EXAM_DEFAULT_COUNT = 50
export const EXAM_MIN_COUNT = 5
export const EXAM_MAX_COUNT = 200
export const EXAM_DEFAULT_DURATION_MIN = 60
export const EXAM_MIN_DURATION_MIN = 5
export const EXAM_MAX_DURATION_MIN = 300
/** localStorage: { sessionId: { title, sections } } —— 开考时记录模板标题与分区分值, 供历史/成绩页回顾时显示卷首标题与得分框 */
export const EXAM_PAPER_TITLE_KEY = 'exam_paper_title_map'
export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice' as const, label: '单选题' },
  { value: 'multi_select' as const, label: '多选题' },
  { value: 'true_false' as const, label: '判断题' },
  { value: 'judge_correct' as const, label: '判断改错题' },
  { value: 'fill_blank' as const, label: '填空题' },
  { value: 'short_answer' as const, label: '简答题' },
  { value: 'analysis' as const, label: '分析题' },
  { value: 'coding' as const, label: '编程题' },
  { value: 'case_analysis' as const, label: '案例分析题' },
]

export const QUESTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  QUESTION_TYPE_OPTIONS.map(o => [o.value, o.label])
)

/** 案例分析题允许的小题型(可自动判分, 不包含分析/编程/案例自身) */
export const CASE_SUB_TYPE_OPTIONS = QUESTION_TYPE_OPTIONS.filter(
  (o) => o.value !== 'analysis' && o.value !== 'coding' && o.value !== 'case_analysis'
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

export const TYPE_COLORS: Record<string, string> = {
  single_choice: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  multi_select:  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  true_false:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  judge_correct: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  fill_blank:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  short_answer:  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  analysis:      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  coding:        'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  case_analysis: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
}

export const POINT_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
]
