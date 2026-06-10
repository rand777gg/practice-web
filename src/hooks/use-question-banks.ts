import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

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

export function useQuestionBanks() {
  const user = useAuthStore((s) => s.user)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchBanks = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supabase
      .from('question_banks')
      .select('*')
      .order('name', { ascending: true })
    const banksData = (data ?? []) as QuestionBank[]

    // Fetch question counts
    const bankIds = banksData.map((b) => b.id)
    if (bankIds.length > 0) {
      const { data: counts } = await supabase
        .from('question_bank_items')
        .select('bank_id')
        .in('bank_id', bankIds)
      const countMap = new Map<string, number>()
      for (const row of counts ?? []) {
        countMap.set(row.bank_id, (countMap.get(row.bank_id) ?? 0) + 1)
      }
      for (const b of banksData) {
        b.question_count = countMap.get(b.id) ?? 0
      }
    }
    setBanks(banksData)
    setIsLoading(false)
  }, [])

  const createBank = useCallback(async (data: { name: string; description?: string; logo_url?: string; is_public?: boolean }) => {
    const { data: result, error } = await supabase
      .from('question_banks')
      .insert({
        name: data.name,
        description: data.description || null,
        logo_url: data.logo_url || null,
        is_public: data.is_public ?? false,
        created_by: user!.id,
      })
      .select()
      .single()
    if (error) throw error
    return result as QuestionBank
  }, [user])

  const updateBank = useCallback(async (id: string, data: { name?: string; description?: string; logo_url?: string; is_public?: boolean }) => {
    const { error } = await supabase
      .from('question_banks')
      .update(data)
      .eq('id', id)
    if (error) throw error
  }, [])

  const deleteBank = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('question_banks')
      .delete()
      .eq('id', id)
    if (error) throw error
  }, [])

  const fetchBankItems = useCallback(async (bankId: string) => {
    const { data } = await supabase
      .from('question_bank_items')
      .select('*, questions(*)')
      .eq('bank_id', bankId)
      .order('added_at', { ascending: true })
    return (data ?? []) as Array<{ id: string; bank_id: string; question_id: string; added_at: string; questions: Record<string, unknown> }>
  }, [])

  const addBankItems = useCallback(async (bankId: string, questionIds: string[]) => {
    const rows = questionIds.map((qid) => ({ bank_id: bankId, question_id: qid }))
    const { error } = await supabase.from('question_bank_items').insert(rows)
    if (error) throw error
  }, [])

  const removeBankItem = useCallback(async (itemId: string) => {
    const { error } = await supabase.from('question_bank_items').delete().eq('id', itemId)
    if (error) throw error
  }, [])

  const removeBankItems = useCallback(async (itemIds: string[]) => {
    const { error } = await supabase.from('question_bank_items').delete().in('id', itemIds)
    if (error) throw error
  }, [])

  return { banks, isLoading, fetchBanks, createBank, updateBank, deleteBank, fetchBankItems, addBankItems, removeBankItem, removeBankItems }
}
