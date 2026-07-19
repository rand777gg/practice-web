-- ============================================================================
-- 003_get_subject_progress.sql
-- 单次查询替代多轮分页 + 客户端 Set 计数
-- 用 PostgreSQL GROUP BY + LEFT JOIN 一步得出每个 subject 的 total / done_all / done_today
-- ============================================================================

-- 显式删除旧签名，避免函数重载导致调用到旧版
DROP FUNCTION IF EXISTS public.get_subject_progress(UUID, TIMESTAMPTZ);

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
    COALESCE(q.subject, 'Other') AS subject,
    COUNT(*)                     AS total,
    COUNT(ua_all.question_id)    AS done_all,
    COUNT(ua_today.question_id)  AS done_today
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
