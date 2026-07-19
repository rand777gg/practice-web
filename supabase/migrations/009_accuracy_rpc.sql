-- 正确率变化 RPC：今日 vs 昨日 各学科正确率
CREATE OR REPLACE FUNCTION public.get_accuracy_change(p_user_id UUID)
RETURNS TABLE(subject TEXT, today_correct BIGINT, today_total BIGINT, yesterday_correct BIGINT, yesterday_total BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH today AS (
    SELECT COALESCE(q.subject, 'Other') AS subject,
           COUNT(*) FILTER (WHERE ua.is_correct) AS correct,
           COUNT(*) AS total
    FROM public.user_answers ua
    JOIN public.questions q ON q.id = ua.question_id
    WHERE ua.user_id = p_user_id AND ua.answered_at::DATE = CURRENT_DATE
    GROUP BY q.subject
  ),
  yesterday AS (
    SELECT COALESCE(q.subject, 'Other') AS subject,
           COUNT(*) FILTER (WHERE ua.is_correct) AS correct,
           COUNT(*) AS total
    FROM public.user_answers ua
    JOIN public.questions q ON q.id = ua.question_id
    WHERE ua.user_id = p_user_id AND ua.answered_at::DATE = CURRENT_DATE - 1
    GROUP BY q.subject
  )
  SELECT
    COALESCE(t.subject, y.subject) AS subject,
    COALESCE(t.correct, 0) AS today_correct,
    COALESCE(t.total, 0) AS today_total,
    COALESCE(y.correct, 0) AS yesterday_correct,
    COALESCE(y.total, 0) AS yesterday_total
  FROM today t
  FULL OUTER JOIN yesterday y ON t.subject = y.subject
  WHERE COALESCE(t.total, 0) + COALESCE(y.total, 0) > 0
  ORDER BY subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_accuracy_change(UUID) TO authenticated;
