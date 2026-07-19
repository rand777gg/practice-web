-- ============================================================================
-- 006_excluded_questions.sql
-- 太简单功能：标记题目不再推送，从计划题库中剔除（不删除）
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_excluded_questions (
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

ALTER TABLE public.user_excluded_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ueq_own ON public.user_excluded_questions;
CREATE POLICY ueq_own ON public.user_excluded_questions FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- 更新 get_subject_progress：排除已标记太简单的题目
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
    AND NOT EXISTS (
      SELECT 1 FROM public.user_excluded_questions ueq
      WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
    )
  GROUP BY COALESCE(q.subject, 'Other')
  ORDER BY subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_subject_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated;

-- 更新 get_random_question_id：排除已标记太简单的题目
CREATE OR REPLACE FUNCTION public.get_random_question_id(
  p_user_id       UUID,
  p_subjects      TEXT[]  DEFAULT NULL,
  p_categories    TEXT[]  DEFAULT NULL,
  p_question_type TEXT    DEFAULT NULL,
  p_kp_codes      TEXT[]  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    AND (p_kp_codes IS NULL OR EXISTS (
      SELECT 1 FROM public.question_kps qk WHERE qk.question_id = q.id AND qk.kp_code = ANY(p_kp_codes)
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_answers ua WHERE ua.question_id = q.id AND ua.user_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_excluded_questions ueq WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
    )
  ORDER BY random()
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    AND (p_kp_codes IS NULL OR EXISTS (
      SELECT 1 FROM public.question_kps qk WHERE qk.question_id = q.id AND qk.kp_code = ANY(p_kp_codes)
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_excluded_questions ueq WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
    )
  ORDER BY random()
  LIMIT 1;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_random_question_id(UUID, TEXT[], TEXT[], TEXT, TEXT[]) TO authenticated;
