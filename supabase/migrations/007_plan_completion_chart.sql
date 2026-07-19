-- 仪表盘统计：每日各学科完成情况 RPC
CREATE OR REPLACE FUNCTION public.get_daily_completion(
  p_user_id   UUID,
  p_days      INTEGER DEFAULT 30,
  p_subjects  TEXT[] DEFAULT NULL
)
RETURNS TABLE(day DATE, subject TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    ua.answered_at::DATE AS day,
    COALESCE(q.subject, 'Other') AS subject,
    COUNT(DISTINCT ua.question_id) AS count
  FROM public.user_answers ua
  JOIN public.questions q ON q.id = ua.question_id
  WHERE ua.user_id = p_user_id
    AND ua.answered_at >= CURRENT_DATE - p_days
    AND (p_subjects IS NULL OR q.subject = ANY(p_subjects))
  GROUP BY day, q.subject
  ORDER BY day, q.subject;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_completion(UUID, INTEGER, TEXT[]) TO authenticated;
