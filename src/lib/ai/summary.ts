import { generateText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAiConfig as getConfig } from './config'
import { getPrompt } from '@/stores/prompt-store'

export interface SummaryData {
  todayStr: string
  todayCorrect: number
  todayWrong: number
  todayTotal: number
  totalAnswered: number
  overallCorrectRate: number
  recentCorrectRate: number
  weakSubjects: { subject: string; wrong: number; total: number }[]
  weakCategories: { category: string; wrong: number; total: number }[]
  planSubjects: string[]
  deadline: string | null
  remainingTotal: number
  dailyGoal: number
  daysLeft: number
  todayPeakHour: number
}

export async function generateDailySummary(data: SummaryData): Promise<string> {
  const config = getConfig()

  if (!config.apiKey) {
    throw new Error('AI_NOT_CONFIGURED')
  }

  const client = createDeepSeek({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })
  const model = client(config.model || 'deepseek-chat')

  const weakSubjectStr =
    data.weakSubjects
      .filter((s) => s.wrong > 0)
      .map((s) => `${s.subject}(错误${s.wrong}/${s.total}题,错误率${Math.round((s.wrong / s.total) * 100)}%)`)
      .join('；') || '无明显弱项'

  const weakCatStr =
    data.weakCategories
      .filter((c) => c.wrong > 0)
      .map((c) => `${c.category}(错误${c.wrong}/${c.total}题)`)
      .join('；') || '无'

  const deadlineStr = data.deadline
    ? `截止日期：${data.deadline}，剩余${data.daysLeft}天`
    : '未设置截止日期'

  const planStr =
    data.planSubjects.length > 0 ? `学习计划包含：${data.planSubjects.join('、')}` : '未设置具体学习计划'

  const todayPeak = data.todayPeakHour >= 0 ? `${data.todayPeakHour}:00前后答题最集中` : '今日暂无答题记录'

  const prompt = [
    `=== 今日答题情况（${data.todayStr}）===`,
    `今日答题：${data.todayTotal}题（正确${data.todayCorrect}，错误${data.todayWrong}）`,
    `今日答题高峰时段：${todayPeak}`,
    '',
    '=== 历史统计 ===',
    `历史总答题：${data.totalAnswered}题`,
    `总体正确率：${Math.round(data.overallCorrectRate * 100)}%`,
    `近期（近两周）正确率：${Math.round(data.recentCorrectRate * 100)}%`,
    '',
    '=== 弱项分析 ===',
    `薄弱学科：${weakSubjectStr}`,
    `薄弱分类：${weakCatStr}`,
    '',
    '=== 学习计划 ===',
    `${planStr}`,
    `${deadlineStr}`,
    `每日目标：${data.dailyGoal}题/天`,
    `剩余题目：${data.remainingTotal}题`,
  ].join('\n')

  const { text } = await generateText({
    model,
    system: getPrompt('study_summary'),
    prompt,
    temperature: 0.7,
    maxOutputTokens: 600,
  })

  return text.trim()
}
