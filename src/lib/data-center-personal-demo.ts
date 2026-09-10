/**
 * 数据中心的「我的数据」DEMO 数据。
 *
 * 说明：这里用示例数据，是为了先把版面与口径固定下来。
 * 正式版应复用仪表盘已有的个人统计 RPC（按当前登录用户拉取），
 * 组件层（如 DailyTrendBars）可以直接接真实数据，不需要改。
 */

export interface PersonalStat {
  label: string
  value: string
  hint?: string
}

export const PERSONAL_STATS: PersonalStat[] = [
  { label: '累计练习', value: '4,286', hint: '近 30 日 742 题' },
  { label: '平均正确率', value: '74%', hint: '较上月 +6%' },
  { label: '错题待复习', value: '138', hint: '其中 42 题已连续答对' },
  { label: '连续打卡', value: '32', hint: '当前最长 32 天' },
]

/** 近 15 天每日对 / 错题量，日期按今天倒推计算，保证始终是"最近"的 */
const DAILY_CORRECT = [18, 24, 12, 0, 22, 30, 26, 16, 28, 34, 20, 0, 26, 32, 24]
const DAILY_WRONG = [6, 8, 5, 0, 7, 9, 8, 4, 6, 11, 7, 0, 5, 9, 6]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function personalDaily(): { date: string; correct: number; wrong: number }[] {
  const today = new Date()
  return DAILY_CORRECT.map((correct, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (DAILY_CORRECT.length - 1 - index))
    return {
      date: `${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      correct,
      wrong: DAILY_WRONG[index],
    }
  })
}

export interface SubjectAccuracyRow {
  topicId: string
  total: number
  correct: number
  /** 与上月相比的变化，正数为进步 */
  delta: number
}

export const PERSONAL_SUBJECT_ACCURACY: SubjectAccuracyRow[] = [
  { topicId: 'ds', total: 1284, correct: 942, delta: 5 },
  { topicId: 'os', total: 986, correct: 748, delta: 8 },
  { topicId: 'co', total: 812, correct: 519, delta: -3 },
  { topicId: 'cn', total: 704, correct: 542, delta: 6 },
  { topicId: 'db', total: 386, correct: 251, delta: 2 },
  { topicId: 'cc', total: 114, correct: 68, delta: -1 },
]

export interface HourBucket {
  label: string
  count: number
}

export const PERSONAL_HOUR_DISTRIBUTION: HourBucket[] = [
  { label: '00-06', count: 218 },
  { label: '06-09', count: 386 },
  { label: '09-12', count: 742 },
  { label: '12-14', count: 498 },
  { label: '14-18', count: 1064 },
  { label: '18-21', count: 918 },
  { label: '21-24', count: 460 },
]

export const PERSONAL_WRONG_BY_TYPE: HourBucket[] = [
  { label: '单项选择', count: 62 },
  { label: '综合应用', count: 38 },
  { label: '算法设计', count: 21 },
  { label: '填空', count: 12 },
  { label: '多项选择', count: 5 },
]

export interface CompareRow {
  metric: string
  mine: string
  publicAvg: string
  better: boolean
}

export const PERSONAL_VS_PUBLIC: CompareRow[] = [
  { metric: '日均练习量', mine: '24.7 题', publicAvg: '16.2 题', better: true },
  { metric: '平均正确率', mine: '74%', publicAvg: '68%', better: true },
  { metric: '错题复盘率', mine: '41%', publicAvg: '55%', better: false },
  { metric: '单题平均用时', mine: '96 秒', publicAvg: '112 秒', better: true },
  { metric: '连续打卡', mine: '32 天', publicAvg: '11 天', better: true },
]
