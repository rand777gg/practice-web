-- ============================================================================
-- 005_fix_rpc_distinct.sql
-- 1. 已有数据库加 session_key + 联合主键
-- 2. get_subject_progress 用 COUNT(DISTINCT) 避免同一题多次作答重复计数
-- ============================================================================

-- 多会话支持（已有数据库兼容）
ALTER TABLE public.practice_sequential_state ADD COLUMN IF NOT EXISTS session_key TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.practice_sequential_state DROP CONSTRAINT IF EXISTS practice_sequential_state_pkey;
ALTER TABLE public.practice_sequential_state ADD PRIMARY KEY (user_id, session_key);

-- 重建 RPC，DISTINCT 去重
DROP FUNCTION IF EXISTS public.get_subject_progress(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_subject_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]);

CREATE OR REPLACE FUNCTION public.get_subject_progress(
  p_user_id        UUID,
  p_plan_reset_at  TIMESTAMPTZ DEFAULT NULL,
  p_today_since    TIMESTAMPTZ DEFAULT NULL,
  p_subjects       TEXT[]      DEFAULT NULL
)
RETURNS TABLE(subject TEXT, total BIGINT, done_all BIGINT, done_today BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COALESCE(q.subject, 'Other')          AS subject,
    COUNT(DISTINCT q.id)                  AS total,
    COUNT(DISTINCT ua_all.question_id)    AS done_all,
    COUNT(DISTINCT ua_today.question_id)  AS done_today
  FROM public.questions q
  LEFT JOIN public.user_answers ua_all
    ON ua_all.question_id = q.id
    AND ua_all.user_id = p_user_id
    AND (p_plan_reset_at IS NULL OR ua_all.answered_at >= p_plan_reset_at)
  LEFT JOIN public.user_answers ua_today
    ON ua_today.question_id = q.id
    AND ua_today.user_id = p_user_id
    AND ua_today.answered_at >= p_today_since
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
  GROUP BY COALESCE(q.subject, 'Other')
  ORDER BY subject;
$$;

GRANT EXECUTE ON FUNCTION public.get_subject_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated;
