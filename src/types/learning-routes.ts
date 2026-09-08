import type { Question } from '@/types'

/** 学习路线(管理员编排的精选题集路线) */
export interface LearningRoute {
  id: string
  title: string
  description: string
  is_published: boolean
  route_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

/** 路线内的一个阶段(阶段内题目有序) */
export interface RouteStage {
  id: string
  route_id: string
  position: number
  title: string
  description: string
  created_at?: string
}

/** 阶段详情:阶段 + 其有序题目 */
export interface RouteStageWithQuestions extends RouteStage {
  questions: Question[]
}

/** 路线详情(含阶段与题目) */
export interface RouteDetail {
  route: LearningRoute
  stages: RouteStageWithQuestions[]
  totalCount: number
  doneCount: number
  /** question_id -> 是否至少答对过一次(用于逐题/逐阶段标记) */
  passByQuestion: Record<string, boolean>
}

/** 列表卡片所需的汇总 */
export interface RouteListEntry {
  route: LearningRoute
  stageCount: number
  questionCount: number
  doneCount: number
}
