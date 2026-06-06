import type { Profile, Question, ExamSession, UserAnswer } from './index'

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: { id: string; role?: 'admin' | 'user'; deadline?: string | null; plan_subjects?: string | null; daily_targets?: string | null; daily_deadline?: string | null }
        Update: { role?: 'admin' | 'user'; deadline?: string | null; plan_subjects?: string | null; daily_targets?: string | null; daily_deadline?: string | null }
      }
      questions: {
        Row: Question
        Insert: Omit<Question, 'id' | 'created_at' | 'created_by'> & { created_by?: string }
        Update: Partial<Omit<Question, 'id'>>
      }
      exam_sessions: {
        Row: ExamSession
        Insert: Omit<ExamSession, 'id' | 'started_at' | 'completed_at' | 'score' | 'correct_count' | 'status'> & { status?: string }
        Update: Partial<Omit<ExamSession, 'id'>>
      }
      user_answers: {
        Row: UserAnswer
        Insert: Omit<UserAnswer, 'id' | 'answered_at'>
        Update: { note?: string | null; is_public?: boolean }
      }
      favorites: {
        Row: { id: string; user_id: string; question_id: string; created_at: string }
        Insert: { user_id: string; question_id: string }
        Update: Record<string, never>
      }
    }
  }
}
