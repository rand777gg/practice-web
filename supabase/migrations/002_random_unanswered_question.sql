-- ============================================================================
-- 002_random_unanswered_question.sql
-- Server-side RPC to pick a random unanswered question matching filters.
-- Eliminates the separate round-trip to fetch all answered question IDs.
-- ============================================================================

-- Returns a single random question ID that the user hasn't answered yet.
-- Falls back to a random answered question if all matching questions have been answered.
CREATE OR REPLACE FUNCTION public.get_random_question_id(
  p_user_id       UUID,
  p_subjects      TEXT[]  DEFAULT NULL,
  p_category      TEXT    DEFAULT NULL,
  p_question_type TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Try unanswered first
  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_category IS NULL OR q.category = p_category)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_answers ua
      WHERE ua.question_id = q.id AND ua.user_id = p_user_id
    )
  ORDER BY random()
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Fallback: pick any matching question (all have been answered)
  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_category IS NULL OR q.category = p_category)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
  ORDER BY random()
  LIMIT 1;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_question_id TO authenticated;
