-- 题目元数据缓存表：避免前端反复扫全表拿学科/分类下拉选项
-- 每次 questions 表有增删改时，触发器自动刷新此表

CREATE TABLE IF NOT EXISTS public.question_meta_cache (
  id         BOOLEAN PRIMARY KEY DEFAULT true,
  subjects   JSONB NOT NULL DEFAULT '[]',
  categories JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初始填充
INSERT INTO public.question_meta_cache (subjects, categories)
SELECT
  (SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL),
  (SELECT jsonb_agg(DISTINCT cat ORDER BY cat) FROM (
    SELECT DISTINCT category AS cat FROM public.questions WHERE category IS NOT NULL
    UNION
    SELECT DISTINCT cat FROM public.questions, LATERAL jsonb_array_elements_text(categories) AS cat WHERE categories IS NOT NULL
  ) t);

-- 刷新函数
CREATE OR REPLACE FUNCTION public.refresh_question_meta_cache()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.question_meta_cache (subjects, categories, updated_at)
  SELECT
    (SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL),
    (SELECT jsonb_agg(DISTINCT cat ORDER BY cat) FROM (
      SELECT DISTINCT category AS cat FROM public.questions WHERE category IS NOT NULL
      UNION
      SELECT DISTINCT cat FROM public.questions, LATERAL jsonb_array_elements_text(categories) AS cat WHERE categories IS NOT NULL
    ) t),
    NOW()
  ON CONFLICT (id) DO UPDATE SET
    subjects = EXCLUDED.subjects,
    categories = EXCLUDED.categories,
    updated_at = NOW();
$$;

-- 触发器：questions 表变动时自动刷新
CREATE OR REPLACE FUNCTION public.trg_refresh_question_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.refresh_question_meta_cache();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_meta_refresh ON public.questions;
CREATE TRIGGER trg_question_meta_refresh
AFTER INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_refresh_question_meta();

-- RLS：所有认证用户可读
ALTER TABLE public.question_meta_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qmc_select ON public.question_meta_cache;
CREATE POLICY qmc_select ON public.question_meta_cache FOR SELECT TO authenticated USING (true);

-- questions.subject 索引（加速按学科筛选查询）
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);

-- favorites.created_at 索引（Supabase Advisor 建议）
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON public.favorites(created_at);
