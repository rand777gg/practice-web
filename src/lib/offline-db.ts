const DB_NAME = 'practice-offline'
const DB_VERSION = 1

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

export async function prefetchQuestions(questions: { id: string; data: unknown }[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readwrite')
  const store = tx.objectStore('prefetched_questions')
  for (const q of questions) store.put(q)
  await promisify(tx as unknown as IDBRequest<void>)
  db.close()
}

export async function getPrefetchedQuestions(): Promise<unknown[]> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readonly')
  const store = tx.objectStore('prefetched_questions')
  const all = await promisify(store.getAll())
  db.close()
  return all.map((q: PrefetchedQuestion) => q.data)
}

export async function clearPrefetchedQuestions(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readwrite')
  const store = tx.objectStore('prefetched_questions')
  store.clear()
  await promisify(tx as unknown as IDBRequest<void>)
  db.close()
}

export async function getPendingAnswerIdsForQuestion(questionId: string): Promise<number[]> {
  const db = await openDB()
  const tx = db.transaction('pending_answers', 'readonly')
  const store = tx.objectStore('pending_answers')
  const all = await promisify(store.getAll())
  db.close()
  return all.filter((a: PendingAnswer) => a.question_id === questionId).map((a: PendingAnswer) => a.id!)
}

// Get IDs of all prefetched questions (for offline fallback)
export async function getPrefetchedQuestionIds(): Promise<string[]> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readonly')
  const store = tx.objectStore('prefetched_questions')
  const all = await promisify(store.getAllKeys())
  db.close()
  return all as string[]
}

// Get a single prefetched question by ID
export async function getPrefetchedQuestion(id: string): Promise<unknown | null> {
  const db = await openDB()
  const tx = db.transaction('prefetched_questions', 'readonly')
  const store = tx.objectStore('prefetched_questions')
  const result = await promisify(store.get(id))
  db.close()
  if (!result) return null
  return (result as PrefetchedQuestion).data
}

// Utility for sync
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
