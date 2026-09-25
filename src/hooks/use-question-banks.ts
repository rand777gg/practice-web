import { useState, useCallback } from 'react'
import { logError } from '@/services/errors'
import {
  addQuestionBankItems,
  countQuestionBankItems,
  createQuestionBank,
  deleteQuestionBank,
  deleteQuestionBankItem,
  deleteQuestionBankItems,
  listQuestionBankItems,
  listQuestionBanks,
  updateQuestionBank,
} from '@/services/questions'
import { useAuthStore } from '@/stores/auth-store'
import type { Question } from '@/types'

export interface QuestionBank {
  id: string
  name: string
  description: string | null
  logo_url: string | null
  is_public: boolean
  created_by: string
  created_at: string
  question_count?: number
}

/** 试题库里的一条记录(含内联的题目) */
export interface BankItem {
  id: string
  bank_id: string
  question_id: string
  added_at: string
  questions: Question
}

export function useQuestionBanks() {
  const user = useAuthStore((s) => s.user)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchBanks = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await listQuestionBanks()
      // 题量一次按 bank_id 聚合查回来, 不把每个库的 item 全列拉回来
      const counts = await countQuestionBankItems(list.map((b) => b.id))
      setBanks(list.map((b) => ({ ...b, question_count: counts.get(b.id) ?? 0 })))
    } catch (e) {
      logError('useQuestionBanks.fetchBanks', e)
      setBanks([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createBank = useCallback(async (data: { name: string; description?: string; logo_url?: string; is_public?: boolean }): Promise<QuestionBank> => {
    return await createQuestionBank({
      name: data.name,
      createdBy: user!.id,
      description: data.description,
      logoUrl: data.logo_url,
      isPublic: data.is_public,
    })
  }, [user])

  const updateBank = useCallback(async (id: string, data: { name?: string; description?: string; logo_url?: string; is_public?: boolean }) => {
    await updateQuestionBank(id, {
      name: data.name,
      description: data.description,
      logoUrl: data.logo_url,
      isPublic: data.is_public,
    })
  }, [])

  const deleteBank = useCallback(async (id: string) => {
    await deleteQuestionBank(id)
  }, [])

  const fetchBankItems = useCallback(async (bankId: string): Promise<BankItem[]> => {
    try {
      return await listQuestionBankItems(bankId)
    } catch (e) {
      logError('useQuestionBanks.fetchBankItems', e)
      return []
    }
  }, [])

  const addBankItems = useCallback(async (bankId: string, questionIds: string[]) => {
    await addQuestionBankItems(bankId, questionIds)
  }, [])

  const removeBankItem = useCallback(async (itemId: string) => {
    await deleteQuestionBankItem(itemId)
  }, [])

  const removeBankItems = useCallback(async (itemIds: string[]) => {
    await deleteQuestionBankItems(itemIds)
  }, [])

  return { banks, isLoading, fetchBanks, createBank, updateBank, deleteBank, fetchBankItems, addBankItems, removeBankItem, removeBankItems }
}
