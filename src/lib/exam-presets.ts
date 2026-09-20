import type { ExamTemplate, ExamTemplateSection, QuestionType } from '@/types'
import { paperItemsPerRecord } from '@/lib/exam-paper'

export const BUILTIN_PREFIX = 'builtin:'

function section(type: QuestionType, count: number, score: number): ExamTemplateSection {
  return { id: `s-${type}-${count}-${score}`, type, count, score, categories: [] }
}

/**
 * 总题数 / 总分都按「小题」口径算：卷面题型一条记录含多个小题
 * （完形 20 空、阅读一篇 5 问），模板还没组卷时只能按卷面的固定小题数折算。
 */
export function totalQuestions(sections: ExamTemplateSection[]): number {
  return sections.reduce((n, s) => n + Math.max(0, s.count) * paperItemsPerRecord(s.type), 0)
}

export function totalScore(sections: ExamTemplateSection[]): number {
  return sections.reduce((n, s) => n + Math.max(0, s.count) * paperItemsPerRecord(s.type) * Math.max(0, s.score), 0)
}

export const BUILTIN_EXAM_TEMPLATES: ExamTemplate[] = [
  {
    id: `${BUILTIN_PREFIX}standard`,
    user_id: null,
    name: '通用标准卷',
    subject: null,
    duration_min: 120,
    order_mode: 'section',
    sample_mode: 'random',
    sort_order: 0,
    created_at: '',
    updated_at: '',
    builtin: true,
    sections: [
      section('single_choice', 20, 2),
      section('multi_select', 10, 3),
      section('true_false', 10, 1),
      section('fill_blank', 10, 1),
      section('short_answer', 2, 5),
    ],
  },
  {
    id: `${BUILTIN_PREFIX}objective`,
    user_id: null,
    name: '客观题速测',
    subject: null,
    duration_min: 60,
    order_mode: 'section',
    sample_mode: 'random',
    sort_order: 1,
    created_at: '',
    updated_at: '',
    builtin: true,
    sections: [
      section('single_choice', 30, 2),
      section('multi_select', 10, 3),
      section('true_false', 10, 1),
    ],
  },
  {
    id: `${BUILTIN_PREFIX}subjective`,
    user_id: null,
    name: '主观题强化',
    subject: null,
    duration_min: 90,
    order_mode: 'section',
    sample_mode: 'wrong_first',
    sort_order: 2,
    created_at: '',
    updated_at: '',
    builtin: true,
    sections: [
      section('judge_correct', 5, 4),
      section('short_answer', 4, 10),
      section('analysis', 2, 20),
    ],
  },
  {
    id: `${BUILTIN_PREFIX}coding`,
    user_id: null,
    name: '编程专项',
    subject: null,
    duration_min: 120,
    order_mode: 'section',
    sample_mode: 'random',
    sort_order: 3,
    created_at: '',
    updated_at: '',
    builtin: true,
    sections: [
      section('single_choice', 10, 2),
      section('fill_blank', 10, 2),
      section('coding', 4, 15),
    ],
  },
  {
    id: `${BUILTIN_PREFIX}comprehensive`,
    user_id: null,
    name: '全题型综合',
    subject: null,
    duration_min: 150,
    order_mode: 'section',
    sample_mode: 'random',
    sort_order: 4,
    created_at: '',
    updated_at: '',
    builtin: true,
    sections: [
      section('single_choice', 15, 2),
      section('multi_select', 5, 4),
      section('true_false', 5, 2),
      section('judge_correct', 5, 2),
      section('fill_blank', 5, 2),
      section('short_answer', 2, 5),
      section('analysis', 1, 5),
      section('coding', 1, 5),
    ],
  },
  /**
   * 英语（一）真题卷。
   *
   * 两处不能改：
   *   - `sample_mode: 'seq'` —— 真题必须按卷面原序抽题。分区内随机抽会让"完形第 3 题"变成别的题，
   *     自动涂卡直接涂错位（真实答题卡的格位是卷面题号，不是抽题顺序）。
   *   - `order_mode: 'section'` —— 分区顺序就是卷面题号顺序。
   *
   * `count` 在这里是**记录数**（一条记录 = 卷面的一大题），不是小题数：
   * 完形整篇一条、阅读四篇四条、新题型一条、翻译一条、两篇写作各一条，共 9 条。
   * 题面题型各不相同，所以分区只按题型过滤，不再靠 `categories` 标签去分同一个 single_choice。
   */
  {
    id: `${BUILTIN_PREFIX}english1`,
    user_id: null,
    name: '英语（一）真题卷',
    subject: ['英语一'],
    duration_min: 180,
    order_mode: 'section',
    sample_mode: 'seq',
    sort_order: 5,
    created_at: '',
    updated_at: '',
    builtin: true,
    sections: [
      section('cloze', 1, 0.5),            // 完形 20 空 × 0.5 = 10
      section('reading_set', 4, 2),        // 4 篇 × 5 问 × 2 = 40
      section('sentence_order', 1, 2),     // 5 空 × 2 = 10
      section('translation', 1, 2),        // 5 句 × 2 = 10
      section('writing', 1, 10),           // 应用文 10
      section('writing', 1, 20),           // 短文写作 20
    ],
  },
]

export function isBuiltinTemplate(id: string): boolean {
  return id.startsWith(BUILTIN_PREFIX)
}

let seq = 0
export function newSectionId(): string {
  seq += 1
  return `s${Date.now().toString(36)}${seq.toString(36)}`
}

export function blankSection(): ExamTemplateSection {
  return { id: newSectionId(), type: 'single_choice', count: 5, score: 2, categories: [] }
}

export function blankTemplate(name: string, subject: string[] | null): Omit<ExamTemplate, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: null,
    name,
    subject,
    duration_min: 60,
    order_mode: 'section',
    sample_mode: 'random',
    sort_order: 0,
    sections: [blankSection()],
  }
}
