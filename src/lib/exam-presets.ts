import type { ExamTemplate, ExamTemplateSection, QuestionType } from '@/types'

export const BUILTIN_PREFIX = 'builtin:'

function section(type: QuestionType, count: number, score: number): ExamTemplateSection {
  return { id: `s-${type}-${count}-${score}`, type, count, score, categories: [] }
}

export function totalQuestions(sections: ExamTemplateSection[]): number {
  return sections.reduce((n, s) => n + Math.max(0, s.count), 0)
}

export function totalScore(sections: ExamTemplateSection[]): number {
  return sections.reduce((n, s) => n + Math.max(0, s.count) * Math.max(0, s.score), 0)
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

export function blankTemplate(name: string, subject: string | null): Omit<ExamTemplate, 'id' | 'created_at' | 'updated_at'> {
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
