-- 各学科各题型正确率 RPC
CREATE OR REPLACE FUNCTION public.get_type_accuracy(
  p_user_id UUID,
  p_subjects TEXT[] DEFAULT NULL
)
RETURNS TABLE(subject TEXT, question_type TEXT, correct BIGINT, total BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT
    COALESCE(q.subject, 'Other') AS subject,
    q.question_type,
    COUNT(*) FILTER (WHERE ua.is_correct) AS correct,
    COUNT(*) AS total
  FROM public.user_answers ua
  JOIN public.questions q ON q.id = ua.question_id
  WHERE ua.user_id = p_user_id
    AND q.question_type IS NOT NULL
    AND (p_subjects IS NULL OR q.subject = ANY(p_subjects))
  GROUP BY q.subject, q.question_type
  ORDER BY q.subject, q.question_type;
$$;
GRANT EXECUTE ON FUNCTION public.get_type_accuracy(UUID, TEXT[]) TO authenticated;
