/**
 * 导出用组卷(compose.ts)
 * 复用与开考一致的中心组卷 SQL(rpc compose_exam), 抽出真实题库题目,
 * 交给 paper.ts 排版。失败返回 null, 让调用方提示错误。
 */
import { composeExamIds, fetchQuestionsByIds, buildPaperSections, type PaperSection } from '@/lib/exam-compose'
import type { ExamTemplate, ExamComposeStat } from '@/types'

export interface ComposeOutput {
  sections: PaperSection[]
  stats: ExamComposeStat[]
}

export async function composeForExport(template: ExamTemplate): Promise<ComposeOutput | null> {
  const { questionIds, stats } = await composeExamIds({
    template,
    questionCount: 0,
    sampleMode: template.sample_mode,
  })
  if (questionIds.length === 0) return { sections: [], stats }
  const questions = await fetchQuestionsByIds(questionIds)
  const sections = buildPaperSections(questions, template)
  return { sections, stats }
}
