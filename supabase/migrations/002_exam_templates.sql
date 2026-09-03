-- Section 22 (增量): 考试模板预设 —— 每种题型的数量与出题顺序
--   与 001_initial_schema.sql 的 Section 22 内容一致(幂等, 可重复执行)
--   001 已在线上应用, 故以本迁移将 exam_templates + compose_exam 增量上线

-- ============================================================================
-- Section 22: 考试模板预设 —— 每种题型的数量与出题顺序
--   exam_templates: 用户私有模板(RLS 按 user_id 隔离); 通用内置预设写在前端代码里, 不入库
--   compose_exam:   一次 RPC 完成 "逐分区抽题 → 抽题策略排序 → 整卷排序"
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  subject      TEXT,
  duration_min INT  NOT NULL DEFAULT 60,
  order_mode   TEXT NOT NULL DEFAULT 'section'
                 CHECK (order_mode IN ('section', 'shuffle')),
  sample_mode  TEXT NOT NULL DEFAULT 'random'
                 CHECK (sample_mode IN ('random', 'wrong_first', 'unseen_first', 'seq')),
  sections     JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_templates_user    ON public.exam_templates(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_exam_templates_subject ON public.exam_templates(user_id, subject);

ALTER TABLE public.exam_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_templates_own_rw ON public.exam_templates;
CREATE POLICY exam_templates_own_rw ON public.exam_templates FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_exam_templates_updated_at ON public.exam_templates;
CREATE TRIGGER trg_exam_templates_updated_at BEFORE UPDATE ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 22.1 按模板组卷
--   p_types:     分区未指定题型时的兜底题型白名单(旧版多选题型筛选用)
--   p_sections: [{ type: 题型|null(不限), count: 题数, categories?: 分区分类(空则回落整卷) }], 数组顺序即分区顺序
--   p_sample_mode: random 随机 / wrong_first 错题优先 / unseen_first 未做优先 / seq 真题原序
--   p_order_mode:  section 按分区顺序拼接 / shuffle 全卷打散
--   返回: { question_ids: [...], sections: [{ type, requested, got }] }
-- 清理旧签名的过载函数(若曾以不同参数集创建过), 再重建为当前签名
DROP FUNCTION IF EXISTS public.compose_exam(TEXT[], TEXT[], JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.compose_exam(TEXT[], TEXT[], JSONB, TEXT[], TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.compose_exam(
  p_subjects    TEXT[],
  p_categories  TEXT[],
  p_sections    JSONB,
  p_types       TEXT[] DEFAULT NULL,
  p_sample_mode TEXT DEFAULT 'random',
  p_order_mode  TEXT DEFAULT 'section'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_sec  JSONB;
  v_ids  UUID[];
  v_all  UUID[] := ARRAY[]::UUID[];
  v_stat JSONB  := '[]'::jsonb;
  v_want INT;
  v_sec_cats TEXT[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_sections IS NULL OR jsonb_array_length(p_sections) = 0 THEN
    RETURN jsonb_build_object('question_ids', '[]'::jsonb, 'sections', '[]'::jsonb);
  END IF;

  FOR v_sec IN SELECT value FROM jsonb_array_elements(p_sections) AS t(value) LOOP
    v_want := GREATEST(COALESCE(NULLIF(v_sec->>'count', '')::INT, 0), 0);
    CONTINUE WHEN v_want = 0;

    -- 分区自带分类时优先用它, 否则回落到整卷分类
    v_sec_cats := CASE
      WHEN jsonb_typeof(v_sec->'categories') = 'array' AND jsonb_array_length(v_sec->'categories') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(v_sec->'categories'))
      ELSE NULL END;

    WITH picked AS (
      SELECT q.id,
             CASE p_sample_mode
               WHEN 'wrong_first'  THEN -COALESCE(a.wrong_count, 0)
               WHEN 'unseen_first' THEN  COALESCE(a.answer_count, 0)
               ELSE 0
             END AS rank_key,
             q.seq_number,
             random() AS rnd
      FROM public.questions q
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE NOT ua.is_correct) AS wrong_count,
               COUNT(*) AS answer_count
        FROM public.user_answers ua
        WHERE ua.user_id = v_uid AND ua.question_id = q.id
      ) a ON TRUE
      WHERE (p_subjects IS NULL OR cardinality(p_subjects) = 0 OR q.subject = ANY(p_subjects))
        AND ((NULLIF(v_sec->>'type', '') IS NOT NULL AND q.question_type = v_sec->>'type')
             OR (NULLIF(v_sec->>'type', '') IS NULL
                 AND (p_types IS NULL OR cardinality(p_types) = 0 OR q.question_type = ANY(p_types))))
        AND (cardinality(COALESCE(v_sec_cats, p_categories)) IS NULL
             OR cardinality(COALESCE(v_sec_cats, p_categories)) = 0
             OR q.categories ?| COALESCE(v_sec_cats, p_categories))
        AND NOT (q.id = ANY(v_all))
      ORDER BY rank_key ASC,
               CASE WHEN p_sample_mode = 'seq' THEN q.seq_number END ASC NULLS LAST,
               rnd
      LIMIT v_want
    )
    SELECT COALESCE(
             ARRAY(
               SELECT p.id FROM picked p
               ORDER BY p.rank_key ASC,
                        CASE WHEN p_sample_mode = 'seq' THEN p.seq_number END ASC NULLS LAST,
                        p.rnd
             ),
             ARRAY[]::UUID[]
           )
      INTO v_ids;

    v_all  := v_all || v_ids;
    v_stat := v_stat || jsonb_build_object(
      'type',      NULLIF(v_sec->>'type', ''),
      'requested', v_want,
      'got',       cardinality(v_ids)
    );
  END LOOP;

  IF p_order_mode = 'shuffle' THEN
    SELECT ARRAY(SELECT u FROM unnest(v_all) AS u ORDER BY random()) INTO v_all;
  END IF;

  RETURN jsonb_build_object('question_ids', to_jsonb(v_all), 'sections', v_stat);
END;
$$;
GRANT EXECUTE ON FUNCTION public.compose_exam(TEXT[], TEXT[], JSONB, TEXT[], TEXT, TEXT) TO authenticated;
