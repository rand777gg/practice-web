-- 确保 4 参数版本的 get_subject_progress 存在（兼容已部署的旧版本）
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
