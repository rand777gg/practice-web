const DB_NAME = 'practice-offline'
const DB_VERSION = 2

interface PendingAnswer {
  id?: number
  user_id: string
  question_id: string
  selected_answer: unknown
  is_correct: boolean
  mode: 'practice' | 'exam'
  exam_session_id: string | null
  answered_at: string
  synced: 0 | 1
}

interface QuestionStat {
  question_id: string
  attemptCount: number
  wrongCount: number
  lastAnsweredAt: string
}

interface PrefetchedQuestion {
  id: string
  data: unknown
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('pending_answers')) {
        db.createObjectStore('pending_answers', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('prefetched_questions')) {
        db.createObjectStore('prefetched_questions', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('question_stats')) {
        db.createObjectStore('question_stats', { keyPath: 'question_id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Pending answers (offline queue) ──

export async function addPendingAnswer(answer: Omit<PendingAnswer, 'id' | 'synced'>): Promise<number> {
  const db = await openDB()
  const tx = db.transaction('pending_answers', 'readwrite')
  const store = tx.objectStore('pending_answers')
  const id = await promisify(store.add({ ...answer, synced: 0 as const }))
  db.close()
  return id as number
}

export async function getPendingAnswers(): Promise<PendingAnswer[]> {
  const db = await openDB()
  const tx = db.transaction('pending_answers', 'readonly')
  const store = tx.objectStore('pending_answers')
  const all = await promisify(store.getAll())
  db.close()
  return all
}

export async function removePendingAnswers(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDB()
  const tx = db.transaction('pending_answers', 'readwrite')
  const store = tx.objectStore('pending_answers')
  for (const id of ids) store.delete(id)
  await promisify(tx as unknown as IDBRequest<void>)
  db.close()
}

export async function getPendingCount(): Promise<number> {
  const db = await openDB()
  const tx = db.transaction('pending_answers', 'readonly')
  const store = tx.objectStore('pending_answers')
  const count = await promisify(store.count())
  db.close()
  return count
}

export async function syncPendingAnswers(
  insertFn: (answers: PendingAnswer[]) => Promise<number[]>,
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingAnswers()
  if (pending.length === 0) return { synced: 0, failed: 0 }
  try {
    const succeeded = await insertFn(pending)
    await removePendingAnswers(succeeded)
    return { synced: succeeded.length, failed: pending.length - succeeded.length }
  } catch {
    return { synced: 0, failed: pending.length }
  }
}

// ── Question stats (local cache for attempt/wrong counts) ──

export async function upsertQuestionStat(stat: QuestionStat): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('question_stats', 'readwrite')
  const store = tx.objectStore('question_stats')
  const existing = await promisify(store.get(stat.question_id))
  if (existing) {
    const e = existing as QuestionStat
    e.attemptCount += stat.attemptCount
    e.wrongCount += stat.wrongCount
    e.lastAnsweredAt = stat.lastAnsweredAt
    store.put(e)
  } else {
    store.add(stat)
  }
  await promisify(tx as unknown as IDBRequest<void>)
  db.close()
}

export async function getQuestionStat(questionId: string): Promise<QuestionStat | null> {
  const db = await openDB()
  const tx = db.transaction('question_stats', 'readonly')
  const store = tx.objectStore('question_stats')
  const stat = await promisify(store.get(questionId))
  db.close()
  return (stat as QuestionStat) ?? null
}

export async function getAllQuestionStats(): Promise<Map<string, QuestionStat>> {
  const db = await openDB()
  const tx = db.transaction('question_stats', 'readonly')
  const store = tx.objectStore('question_stats')
  const all = await promisify(store.getAll())
  db.close()
  const map = new Map<string, QuestionStat>()
  for (const s of all as QuestionStat[]) map.set(s.question_id, s)
  return map
}

// ── Prefetched questions ──

export async function bulkPrefetchQuestions(questions: { id: string; data: unknown }[]): Promise<void> {
  if (questions.length === 0) return
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readwrite')
  const store = tx.objectStore('prefetched_questions')
  for (const q of questions) store.put(q)
  await promisify(tx as unknown as IDBRequest<void>)
  db.close()
}

export async function getPrefetchedQuestion(id: string): Promise<unknown | null> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readonly')
  const store = tx.objectStore('prefetched_questions')
  const result = await promisify(store.get(id))
  db.close()
  if (!result) return null
  return (result as PrefetchedQuestion).data
}

export async function getPrefetchedQuestionIds(): Promise<string[]> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readonly')
  const store = tx.objectStore('prefetched_questions')
  const all = await promisify(store.getAllKeys())
  db.close()
  return all as string[]
}

export async function clearPrefetchedQuestions(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readwrite')
  const store = tx.objectStore('prefetched_questions')
  store.clear()
  await promisify(tx as unknown as IDBRequest<void>)
  db.close()
}
