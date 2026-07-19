-- ============================================================================
-- 005_multi_session_sequential.sql
-- practice_sequential_state 支持多会话，每个知识点组合独立保存进度
-- ============================================================================

-- 1. 为已有数据添加默认 session_key
ALTER TABLE public.practice_sequential_state ADD COLUMN IF NOT EXISTS session_key TEXT NOT NULL DEFAULT 'default';

-- 2. 移除旧的单列主键
ALTER TABLE public.practice_sequential_state DROP CONSTRAINT IF EXISTS practice_sequential_state_pkey;

-- 3. 设置新的联合主键
ALTER TABLE public.practice_sequential_state ADD PRIMARY KEY (user_id, session_key);
