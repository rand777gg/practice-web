import { supabase } from '@/lib/supabase'

export interface ReviewItem {
  questionId: string
  subject: string
  category: string
  lastAnswerAt: string
  wrongCount: number
  totalAttempts: number
}

export interface SubjectUrgency {
  subject: string
  /** 0-100 */
  urgency: number
  /** 错误率 0-1 */
  errorRate: number
  /** 距上次复习天数 */
  daysSinceReview: number
  /** 该学科题目总数 */
  totalQuestions: number
  /** 待复习题目数（遗忘临界） */
  reviewQueue: number
}

export interface ForgettingCurvePoint {
  /** 距学习后天数 */
  day: number
  /** 记忆留存率 0-1 */
  retention: number
  /** 该时间点需复习的题数 */
  atRisk: number
}

export interface EbbinghausData {
  curve: ForgettingCurvePoint[]
  urgency: SubjectUrgency[]
  totalReviewQueue: number
  reviewItems: ReviewItem[]
}

/** Ebbinghaus 遗忘曲线：R = e^(-t/S)，S 为记忆强度系数 */
function retention(tDays: number, strength = 1): number {
  return Math.exp(-tDays / (strength * 7))
}

/** 距今天数 */
function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

export async function computeEbbinghaus(userId: string): Promise<EbbinghausData> {
  // 1. Fetch all wrong answers with question info
  const { data: answers } = await supabase
    .from('user_answers')
    .select('question_id, is_correct, answered_at, questions(subject, category)')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false })
    .limit(2000)

  if (!answers?.length) {
    return { curve: [], urgency: [], totalReviewQueue: 0, reviewItems: [] }
  }

  // 2. Group by question: track wrong count, last answer time
  const questionMap = new Map<string, {
    subject: string
    category: string
    lastAnswerAt: string
    wrongCount: number
    totalAttempts: number
    history: { correct: boolean; at: string }[]
  }>()

  for (const a of answers) {
    const q = (a as any).questions as { subject?: string; category?: string } | null
    const existing = questionMap.get(a.question_id)
    const entry = {
      subject: q?.subject || 'Other',
      category: q?.category || 'Other',
      lastAnswerAt: existing?.lastAnswerAt || a.answered_at,
      wrongCount: (existing?.wrongCount ?? 0) + (a.is_correct ? 0 : 1),
      totalAttempts: (existing?.totalAttempts ?? 0) + 1,
      history: [...(existing?.history ?? []), { correct: a.is_correct, at: a.answered_at }],
    }
    questionMap.set(a.question_id, entry)
  }

  // 3. Compute per-subject urgency and collect at-risk questions
  const subjData = new Map<string, {
    wrongCount: number
    totalAttempts: number
    lastReviewAt: string
    totalQuestions: number
    reviewQueue: number
  }>()
  const reviewItems: ReviewItem[] = []

  for (const [qId, q] of questionMap) {
    const s = q.subject
    const entry = subjData.get(s) || { wrongCount: 0, totalAttempts: 0, lastReviewAt: q.lastAnswerAt, totalQuestions: 0, reviewQueue: 0 }
    entry.wrongCount += q.wrongCount
    entry.totalAttempts += q.totalAttempts
    if (q.lastAnswerAt > entry.lastReviewAt) entry.lastReviewAt = q.lastAnswerAt
    // A question is "at risk" if last wrong + retention < 0.5
    if (q.wrongCount > 0 && retention(daysAgo(q.lastAnswerAt), 0.8 ** (q.wrongCount - 1)) < 0.5) {
      entry.reviewQueue++
      reviewItems.push({
        questionId: qId,
        subject: q.subject,
        category: q.category,
        lastAnswerAt: q.lastAnswerAt,
        wrongCount: q.wrongCount,
        totalAttempts: q.totalAttempts,
      })
    }
    entry.totalQuestions++
    subjData.set(s, entry)
  }

  // 4. Fetch total questions per subject for ratio
  const { data: allQs } = await supabase.from('questions').select('subject').limit(5000)
  const totalPerSubject = new Map<string, number>()
  for (const q of (allQs ?? [])) {
    const s = q.subject || 'Other'
    totalPerSubject.set(s, (totalPerSubject.get(s) ?? 0) + 1)
  }

  // 5. Calculate urgency scores (0-100)
  const maxReviewQueue = Math.max(1, ...[...subjData.values()].map(d => d.reviewQueue))
  const maxDaysSince = Math.max(1, ...[...subjData.values()].map(d => daysAgo(d.lastReviewAt)))
  const maxErrRate = Math.max(0.01, ...[...subjData.values()].map(d => d.totalAttempts > 0 ? d.wrongCount / d.totalAttempts : 0))

  const urgency: SubjectUrgency[] = [...subjData.entries()]
    .map(([subject, d]) => {
      const errorRate = d.totalAttempts > 0 ? d.wrongCount / d.totalAttempts : 0
      const daysSince = daysAgo(d.lastReviewAt)
      const totalQ = totalPerSubject.get(subject) ?? d.totalQuestions
      // Weighted: error rate (40%) + days since review (35%) + review queue ratio (25%)
      const score = Math.round(
        ((errorRate / maxErrRate) * 40 +
         (daysSince / maxDaysSince) * 35 +
         (d.reviewQueue / maxReviewQueue) * 25) * (100 / 100)
      )
      return {
        subject,
        urgency: Math.min(100, Math.max(0, score)),
        errorRate,
        daysSinceReview: Math.round(daysSince),
        totalQuestions: totalQ,
        reviewQueue: d.reviewQueue,
      }
    })
    .sort((a, b) => b.urgency - a.urgency)

  // 6. Forgetting curve (population-level, key time points)
  const checkPoints = [1, 2, 3, 5, 7, 10, 15, 21, 30]
  const curve: ForgettingCurvePoint[] = checkPoints.map(day => {
    let atRisk = 0
    for (const [, q] of questionMap) {
      if (q.wrongCount > 0) {
        const str = 0.8 ** (q.wrongCount - 1)
        if (retention(day, str) < 0.5) atRisk++
      }
    }
    return {
      day,
      retention: Math.round(retention(day, 1) * 100),
      atRisk,
    }
  })

  const totalReviewQueue = [...subjData.values()].reduce((sum, d) => sum + d.reviewQueue, 0)

  return { curve, urgency, totalReviewQueue, reviewItems }
}

// Lightweight: only returns review queue question IDs, sorted by urgency (most at-risk first)
export async function getReviewQueueIds(userId: string): Promise<ReviewItem[]> {
  const { data: answers } = await supabase
    .from('user_answers')
    .select('question_id, is_correct, answered_at, questions(subject, category)')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false })
    .limit(2000)

  if (!answers?.length) return []

  const qMap = new Map<string, { subject: string; category: string; lastAnswerAt: string; wrongCount: number; totalAttempts: number }>()
  for (const a of answers) {
    const q = (a as any).questions as { subject?: string; category?: string } | null
    const e = qMap.get(a.question_id)
    qMap.set(a.question_id, {
      subject: q?.subject || 'Other',
      category: q?.category || 'Other',
      lastAnswerAt: e?.lastAnswerAt || a.answered_at,
      wrongCount: (e?.wrongCount ?? 0) + (a.is_correct ? 0 : 1),
      totalAttempts: (e?.totalAttempts ?? 0) + 1,
    })
  }

  const items: ReviewItem[] = []
  for (const [qId, q] of qMap) {
    if (q.wrongCount > 0 && retention(daysAgo(q.lastAnswerAt), 0.8 ** (q.wrongCount - 1)) < 0.5) {
      items.push({ questionId: qId, subject: q.subject, category: q.category, lastAnswerAt: q.lastAnswerAt, wrongCount: q.wrongCount, totalAttempts: q.totalAttempts })
    }
  }
  // Sort by most at-risk first (lowest retention = most urgent)
  items.sort((a, b) => {
    const ra = retention(daysAgo(a.lastAnswerAt), 0.8 ** (a.wrongCount - 1))
    const rb = retention(daysAgo(b.lastAnswerAt), 0.8 ** (b.wrongCount - 1))
    return ra - rb
  })
  return items
}
