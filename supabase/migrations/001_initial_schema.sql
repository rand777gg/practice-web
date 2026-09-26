-- ============================================================================
-- 001_initial_schema.sql — 完整数据库结构 & 行级安全策略
-- ============================================================================

-- 清理已废弃的对象（旧部署兼容）
DROP TABLE IF EXISTS public.plan_live_progress;
DROP FUNCTION IF EXISTS public.get_subject_progress(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_subject_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]);

-- ============================================================================
-- 1. PROFILES — 用户资料表
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  nickname        TEXT,
  deadline        DATE,
  plan_subjects   TEXT,
  daily_targets   TEXT,
  daily_deadline  TEXT,
  plan_reset_at     TIMESTAMPTZ,
  subject_reset_at  JSONB DEFAULT '{}'::jsonb,
  plan_scope        JSONB,
  daily_reset_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.profiles.plan_scope IS
  '计划学科 -> 认领知识点数组的映射。如 {"数学":["一元二次方程"]}。NULL 或缺省=该学科全部知识点。';

CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);

-- ============================================================================
-- 2. QUESTIONS — 题目表
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_type     TEXT NOT NULL DEFAULT 'single_choice',
  question_text     TEXT NOT NULL,
  options           JSONB NOT NULL,
  correct_answer    JSONB NOT NULL DEFAULT '0',
  category          TEXT,
  categories        JSONB DEFAULT '[]'::jsonb,
  subject           TEXT,
  analysis          TEXT,
  key_points        TEXT,
  answer_explanation TEXT,
  seq_number        INTEGER,
  verified          BOOLEAN NOT NULL DEFAULT false,
  import_mode       TEXT,
  allow_unordered   BOOLEAN NOT NULL DEFAULT false,
  unordered_blanks  INTEGER[] DEFAULT NULL,
  source_page       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_category   ON public.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_subject    ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_subj_cat   ON public.questions(subject, category);
CREATE INDEX IF NOT EXISTS idx_questions_type       ON public.questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_filter     ON public.questions(subject, category, question_type);
CREATE INDEX IF NOT EXISTS idx_questions_categories ON public.questions USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_questions_updated_at ON public.questions(updated_at);

-- Keep category in sync with categories[0]
CREATE OR REPLACE FUNCTION public.sync_category_from_categories()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.categories IS NOT NULL AND jsonb_array_length(NEW.categories) > 0 THEN
    NEW.category = NEW.categories->>0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_category ON public.questions;
CREATE TRIGGER trg_sync_category
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.sync_category_from_categories();

-- updated_at auto-set
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.questions;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. EXAM SESSIONS — 考试会话
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  total_questions INTEGER NOT NULL DEFAULT 50,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  score           INTEGER,
  question_ids    JSONB NOT NULL,
  current_index   INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 3600000,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON public.exam_sessions(user_id);

-- ============================================================================
-- 4. USER ANSWERS — 用户答题记录
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer JSONB NOT NULL DEFAULT '0',
  is_correct      BOOLEAN NOT NULL,
  mode            TEXT NOT NULL CHECK (mode IN ('practice', 'exam')),
  exam_session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  note            TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT false,
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ua_user            ON public.user_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_ua_question         ON public.user_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_ua_user_answered    ON public.user_answers(user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_ua_user_question    ON public.user_answers(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_ua_question_correct ON public.user_answers(question_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_ua_exam             ON public.user_answers(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_ua_wrong            ON public.user_answers(user_id, is_correct) WHERE is_correct = false;
CREATE INDEX IF NOT EXISTS idx_ua_public           ON public.user_answers(user_id, answered_at DESC) WHERE is_public = true;

-- ============================================================================
-- 5. FAVORITES — 用户收藏
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user     ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_question ON public.favorites(question_id);

-- ============================================================================
-- 6. PARSE HISTORY — AI 解析历史
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.parse_history (
  id              SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL DEFAULT '',
  markdown        TEXT NOT NULL DEFAULT '',
  json_data       TEXT,
  questions_json  TEXT,
  mode            TEXT NOT NULL DEFAULT 'lightweight',
  status_json     TEXT,
  page_ranges     TEXT,
  extra_formats   TEXT,
  pdf_total_pages INTEGER,
  pdf_page_urls   TEXT,
  subject         TEXT,
  category        TEXT,
  key_points      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parse_history_user ON public.parse_history(user_id, created_at DESC);

-- ============================================================================
-- 7. QUESTION BANKS — 试题库
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_banks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  logo_url    TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.question_bank_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id     UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bank_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_qb_created_by ON public.question_banks(created_by);
CREATE INDEX IF NOT EXISTS idx_qb_public     ON public.question_banks(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_qbi_bank      ON public.question_bank_items(bank_id);
CREATE INDEX IF NOT EXISTS idx_qbi_question  ON public.question_bank_items(question_id);

-- ============================================================================
-- 8. USER DAILY STATS — 每日答题统计
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_daily_stats (
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL DEFAULT '',
  total         INTEGER NOT NULL DEFAULT 0,
  correct       INTEGER NOT NULL DEFAULT 0,
  hourly        INTEGER[24] NOT NULL DEFAULT '{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0}',
  PRIMARY KEY (user_id, date, subject, question_type)
);

CREATE INDEX IF NOT EXISTS idx_uds_user_date ON public.user_daily_stats(user_id, date);

-- Auto-upsert on new answer
CREATE OR REPLACE FUNCTION public.upsert_daily_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_subject       TEXT;
  v_question_type TEXT;
  v_hour          INTEGER;
BEGIN
  SELECT COALESCE(q.subject, ''), COALESCE(q.question_type, '')
    INTO v_subject, v_question_type
    FROM public.questions q WHERE q.id = NEW.question_id;
  v_hour := EXTRACT(HOUR FROM NEW.answered_at);
  INSERT INTO public.user_daily_stats (user_id, date, subject, question_type, total, correct, hourly)
  VALUES (
    NEW.user_id, NEW.answered_at::DATE, v_subject, v_question_type,
    1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    (SELECT array_agg(CASE WHEN i = v_hour THEN 1 ELSE 0 END) FROM generate_series(0, 23) i)
  )
  ON CONFLICT (user_id, date, subject, question_type) DO UPDATE SET
    total   = user_daily_stats.total + 1,
    correct = user_daily_stats.correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    hourly  = (
      SELECT array_agg(user_daily_stats.hourly[idx] + CASE WHEN idx - 1 = v_hour THEN 1 ELSE 0 END)
      FROM generate_subscripts(user_daily_stats.hourly, 1) idx
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_daily_stats ON public.user_answers;
CREATE TRIGGER trg_upsert_daily_stats
  AFTER INSERT ON public.user_answers
  FOR EACH ROW EXECUTE FUNCTION public.upsert_daily_stats();

-- Backfill helper
CREATE OR REPLACE FUNCTION public.backfill_daily_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r RECORD;
BEGIN
  DELETE FROM public.user_daily_stats;
  FOR r IN
    SELECT ua.user_id, ua.answered_at::DATE AS date,
           COALESCE(q.subject, '') AS subject, COALESCE(q.question_type, '') AS question_type,
           COUNT(*) AS total, COUNT(*) FILTER (WHERE ua.is_correct) AS correct,
           array_agg(EXTRACT(HOUR FROM ua.answered_at)::INTEGER) AS hours_list
    FROM public.user_answers ua
    JOIN public.questions q ON q.id = ua.question_id
    GROUP BY ua.user_id, ua.answered_at::DATE, q.subject, q.question_type
  LOOP
    INSERT INTO public.user_daily_stats (user_id, date, subject, question_type, total, correct, hourly)
    VALUES (r.user_id, r.date, r.subject, r.question_type, r.total, r.correct,
      (SELECT array_agg(COALESCE(cnt, 0)) FROM generate_series(0, 23) g(h)
       LEFT JOIN LATERAL (SELECT COUNT(*)::INTEGER FROM unnest(r.hours_list) t(h2) WHERE t.h2 = g.h) sub(cnt) ON true))
    ON CONFLICT (user_id, date, subject, question_type) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- 9. QUESTION META CACHE — 学科/分类缓存
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_meta_cache (
  id                   BOOLEAN PRIMARY KEY DEFAULT true,
  subjects             JSONB NOT NULL DEFAULT '[]',
  categories           JSONB NOT NULL DEFAULT '[]',
  key_points_by_subject JSONB NOT NULL DEFAULT '[]',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.question_meta_cache (subjects, categories, key_points_by_subject)
SELECT
  COALESCE((SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(DISTINCT cat ORDER BY cat) FROM (
    SELECT DISTINCT category AS cat FROM public.questions WHERE category IS NOT NULL
    UNION SELECT DISTINCT cat FROM public.questions, LATERAL jsonb_array_elements_text(categories) AS cat WHERE categories IS NOT NULL
  ) t), '[]'::jsonb),
  (WITH expanded AS (
    SELECT DISTINCT q.subject, trim(kp) AS kp
    FROM public.questions q,
    LATERAL unnest(regexp_split_to_array(q.key_points, '[,，;；]')) AS kp
    WHERE q.key_points IS NOT NULL AND trim(kp) <> ''
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('subject', subject, 'key_points', key_points)
    ORDER BY subject
  ), '[]'::jsonb)
  FROM (
    SELECT subject, jsonb_agg(kp ORDER BY kp) AS key_points
    FROM expanded
    GROUP BY subject
  ) t2);

CREATE OR REPLACE FUNCTION public.refresh_question_meta_cache()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  INSERT INTO public.question_meta_cache (subjects, categories, key_points_by_subject, updated_at)
  SELECT
    COALESCE((SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(DISTINCT cat ORDER BY cat) FROM (
      SELECT DISTINCT category AS cat FROM public.questions WHERE category IS NOT NULL
      UNION SELECT DISTINCT cat FROM public.questions, LATERAL jsonb_array_elements_text(categories) AS cat WHERE categories IS NOT NULL
    ) t), '[]'::jsonb),
    (WITH with_kp AS (
      SELECT subject, jsonb_agg(kp ORDER BY kp) AS key_points
      FROM (
        SELECT DISTINCT q.subject, trim(kp) AS kp
        FROM public.questions q,
        LATERAL unnest(regexp_split_to_array(q.key_points, '[,，;；]')) AS kp
        WHERE q.key_points IS NOT NULL AND trim(kp) <> ''
      ) sub
      GROUP BY subject
    ), all_subj AS (
      SELECT DISTINCT subject FROM public.questions WHERE subject IS NOT NULL
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('subject', a.subject, 'key_points', COALESCE(w.key_points, '[]'::jsonb))
      ORDER BY a.subject
    ), '[]'::jsonb)
    FROM all_subj a
    LEFT JOIN with_kp w ON a.subject = w.subject),
    NOW()
  ON CONFLICT (id) DO UPDATE SET
    subjects = EXCLUDED.subjects,
    categories = EXCLUDED.categories,
    key_points_by_subject = EXCLUDED.key_points_by_subject,
    updated_at = NOW();
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_question_meta()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN PERFORM public.refresh_question_meta_cache(); RETURN NULL; END; $$;

DROP TRIGGER IF EXISTS trg_question_meta_refresh ON public.questions;
CREATE TRIGGER trg_question_meta_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_question_meta();

-- KP–Question mapping (pre-computed, replaces ILIKE scans)
CREATE TABLE IF NOT EXISTS public.kp_question_map (
  kp          TEXT NOT NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  subject     TEXT,
  seq_number  INT,
  PRIMARY KEY (kp, question_id)
);
CREATE INDEX IF NOT EXISTS idx_kqm_kp ON public.kp_question_map(kp);
CREATE INDEX IF NOT EXISTS idx_kqm_question ON public.kp_question_map(question_id);

INSERT INTO public.kp_question_map (kp, question_id, subject, seq_number)
SELECT DISTINCT trim(kpx) AS kp, q.id, q.subject, q.seq_number
FROM public.questions q,
LATERAL unnest(regexp_split_to_array(q.key_points, '[,，;；]')) kpx
WHERE q.key_points IS NOT NULL AND trim(kpx) <> ''
ON CONFLICT (kp, question_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_kp_question_map()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.kp_question_map WHERE true;
  INSERT INTO public.kp_question_map (kp, question_id, subject, seq_number)
  SELECT DISTINCT trim(kpx) AS kp, q.id, q.subject, q.seq_number
  FROM public.questions q,
  LATERAL unnest(regexp_split_to_array(q.key_points, '[,，;；]')) kpx
  WHERE q.key_points IS NOT NULL AND trim(kpx) <> '';
$$;

-- Update trigger to also refresh kp_question_map
CREATE OR REPLACE FUNCTION public.trg_refresh_question_meta()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN PERFORM public.refresh_question_meta_cache(); PERFORM public.refresh_kp_question_map(); RETURN NULL; END; $$;

ALTER TABLE public.kp_question_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kqm_select ON public.kp_question_map;
CREATE POLICY kqm_select ON public.kp_question_map FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 10. PRACTICE SEQUENTIAL STATE — 顺序刷题跨设备进度
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.practice_sequential_state (
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_key   TEXT NOT NULL DEFAULT 'default',
  selected_kps  TEXT[] NOT NULL DEFAULT '{}',
  plan_subjects TEXT[] NOT NULL DEFAULT '{}',
  question_ids  UUID[] NOT NULL DEFAULT '{}',
  current_index    INTEGER NOT NULL DEFAULT 0,
  subject_positions JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, session_key)
);

-- ============================================================================
-- 11. USER EXCLUDED QUESTIONS — "太简单"排除表
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_excluded_questions (
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

-- ============================================================================
-- 12. QR LOGIN TOKENS — 扫码登录令牌
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.qr_login_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  auth_code   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_info TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_qr_token   ON public.qr_login_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_expires ON public.qr_login_tokens(expires_at);

-- ============================================================================
-- 13. USER PREFERENCES — 用户偏好云同步
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  practice_filters  JSONB NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. HELPER FUNCTIONS
-- ============================================================================

-- 新用户注册 → 自动创建 profile，首位 = admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE existing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM public.profiles;
  IF existing_count = 0 THEN
    INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 管理员判断
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'); $$;

-- 获取用户邮箱
CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT email FROM auth.users WHERE id = user_id; $$;

-- OAuth providers
CREATE OR REPLACE FUNCTION public.get_user_providers(user_id UUID)
RETURNS TEXT[] LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(array_agg(provider), ARRAY[]::TEXT[]) FROM auth.identities WHERE user_id = $1 AND provider != 'email'; $$;

-- 解绑 OAuth
CREATE OR REPLACE FUNCTION public.unlink_oauth_identity(p_provider TEXT, p_user_id TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ DELETE FROM auth.identities WHERE provider = p_provider AND user_id::text = p_user_id; $$;
GRANT EXECUTE ON FUNCTION public.unlink_oauth_identity TO authenticated;

-- 上次登录时间
CREATE OR REPLACE FUNCTION public.get_user_last_online(user_id UUID)
RETURNS TIMESTAMPTZ LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT last_sign_in_at FROM auth.users WHERE id = $1;
$$;

-- 安全获取昵称（绕过 RLS）
CREATE OR REPLACE FUNCTION public.get_profile_nicknames(user_ids UUID[])
RETURNS TABLE(id UUID, nickname TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN RETURN QUERY SELECT p.id, p.nickname FROM public.profiles p WHERE p.id = ANY(user_ids); END; $$;

-- 随机抽取未做题目（两阶段：先未做，再全部，排除太简单）
CREATE OR REPLACE FUNCTION public.get_random_question_id(
  p_user_id UUID, p_subjects TEXT[] DEFAULT NULL, p_categories TEXT[] DEFAULT NULL, p_question_type TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT q.id INTO v_id FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    AND NOT EXISTS (SELECT 1 FROM public.user_answers ua WHERE ua.question_id = q.id AND ua.user_id = p_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.user_excluded_questions ueq WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id)
  ORDER BY random() LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT q.id INTO v_id FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    AND NOT EXISTS (SELECT 1 FROM public.user_excluded_questions ueq WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id)
  ORDER BY random() LIMIT 1;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_random_question_id(UUID, TEXT[], TEXT[], TEXT) TO authenticated;

-- 加载顺序刷体会话（合并12+次查询为1次RPC）
CREATE OR REPLACE FUNCTION public.load_practice_session(p_user_id UUID, p_session_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_session RECORD;
  v_existing_ids UUID[];
  v_kp_arr TEXT[];
  v_subj_arr TEXT[];
  v_restored_index INT;
  v_saved_kps TEXT[];
  v_sps JSONB;
  v_new_data JSONB;
  v_all_ids UUID[];
  v_all_kps TEXT[];
  v_all_subjs TEXT[];
  v_current_id UUID;
  v_new_idx INT;
  v_first_q_id UUID;
  v_first_question JSONB;
  v_first_stats JSONB;
  v_result JSONB;
BEGIN
  SELECT * INTO v_session FROM public.practice_sequential_state
  WHERE user_id = p_user_id AND session_key = p_session_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_saved_kps := COALESCE(v_session.selected_kps, '{}'::TEXT[]);
  v_sps := COALESCE(v_session.subject_positions, '{}'::jsonb);
  v_restored_index := COALESCE(v_session.current_index, 0);

  -- Validate stored IDs, preserve order, extract first KP + subject
  WITH ordered AS (
    SELECT q.id, q.subject,
           (SELECT trim(kpx) FROM unnest(regexp_split_to_array(q.key_points, '[,，;；]')) kpx WHERE trim(kpx) <> '' LIMIT 1) AS kp,
           t.pos
    FROM unnest(v_session.question_ids) WITH ORDINALITY AS t(qid, pos)
    JOIN public.questions q ON q.id = t.qid
  )
  SELECT
    array_agg(o.id ORDER BY o.pos),
    array_agg(o.kp ORDER BY o.pos),
    array_agg(COALESCE(o.subject, '') ORDER BY o.pos)
  INTO v_existing_ids, v_kp_arr, v_subj_arr
  FROM ordered o;

  IF v_existing_ids IS NULL THEN
    v_existing_ids := '{}'::UUID[];
    v_kp_arr := '{}'::TEXT[];
    v_subj_arr := '{}'::TEXT[];
  END IF;

  IF v_restored_index >= array_length(v_existing_ids, 1) THEN
    v_restored_index := GREATEST(0, array_length(v_existing_ids, 1) - 1);
  END IF;

  -- Find new questions via kp_question_map (pre-computed, no ILIKE scan)
  v_new_data := '[]'::jsonb;
  IF array_length(v_saved_kps, 1) > 0 THEN
    WITH new_qs AS (
      SELECT DISTINCT q.id, q.subject,
             COALESCE(q.seq_number, 999999) AS seq_number,
             kqm.kp
      FROM public.kp_question_map kqm
      JOIN public.questions q ON q.id = kqm.question_id
      WHERE kqm.kp = ANY(v_saved_kps)
        AND NOT (q.id = ANY(v_existing_ids))
        AND NOT EXISTS (
          SELECT 1 FROM public.user_excluded_questions ueq
          WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
        )
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', nq.id,
        'subject', nq.subject,
        'kp', nq.kp,
        'seq', nq.seq_number
      )
    ), '[]'::jsonb) INTO v_new_data
    FROM new_qs nq;
  END IF;

  -- Merge existing + new, sort by (kp, seq)
  v_current_id := v_existing_ids[v_restored_index + 1];

  WITH existing AS (
    SELECT e.id, e.kp, e.subj, NULL::INT AS seq
    FROM unnest(v_existing_ids, v_kp_arr, v_subj_arr) AS e(id, kp, subj)
  ),
  new_items AS (
    SELECT (n->>'id')::UUID AS id, n->>'kp' AS kp, n->>'subject' AS subj, (n->>'seq')::INT AS seq
    FROM jsonb_array_elements(v_new_data) n
  ),
  sorted AS (
    SELECT id, kp, subj,
           row_number() OVER (ORDER BY COALESCE(subj, ''), kp, seq, id) - 1 AS rn
    FROM (SELECT * FROM existing UNION ALL SELECT * FROM new_items) u
  )
  SELECT
    array_agg(s.id ORDER BY s.rn),
    array_agg(s.kp ORDER BY s.rn),
    array_agg(s.subj ORDER BY s.rn)
  INTO v_all_ids, v_all_kps, v_all_subjs
  FROM sorted s;

  -- Find new position of current question
  v_new_idx := array_position(v_all_ids, v_current_id);
  IF v_new_idx IS NOT NULL THEN
    v_restored_index := v_new_idx - 1;
  ELSIF array_length(v_all_ids, 1) > 0 THEN
    v_restored_index := LEAST(v_restored_index, array_length(v_all_ids, 1) - 1);
  ELSE
    v_restored_index := 0;
  END IF;

  -- P1: Preload first question + stats into response (skip loadSequentialQuestion round-trip)
  v_first_question := NULL;
  v_first_stats := NULL;
  IF array_length(v_all_ids, 1) > 0 THEN
    v_first_q_id := v_all_ids[v_restored_index + 1];
    SELECT row_to_json(q) INTO v_first_question FROM public.questions q WHERE q.id = v_first_q_id;

    SELECT jsonb_build_object(
      'total', COUNT(*),
      'wrong', COUNT(*) FILTER (WHERE NOT is_correct),
      'note', (SELECT ua2.note FROM public.user_answers ua2 WHERE ua2.user_id = p_user_id AND ua2.question_id = v_first_q_id AND ua2.note IS NOT NULL ORDER BY ua2.answered_at DESC LIMIT 1),
      'isPublic', (SELECT ua3.is_public FROM public.user_answers ua3 WHERE ua3.user_id = p_user_id AND ua3.question_id = v_first_q_id AND ua3.note IS NOT NULL ORDER BY ua3.answered_at DESC LIMIT 1)
    ) INTO v_first_stats
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id AND ua.question_id = v_first_q_id;

    IF v_first_stats IS NULL THEN
      v_first_stats := jsonb_build_object('total', 0, 'wrong', 0, 'note', NULL, 'isPublic', false);
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'found', true,
    'savedKps', to_jsonb(v_saved_kps),
    'subjectPositions', v_sps,
    'questionIds', to_jsonb(v_all_ids),
    'questionKps', to_jsonb(v_all_kps),
    'questionSubjects', to_jsonb(v_all_subjs),
    'currentIndex', v_restored_index,
    'firstQuestion', v_first_question,
    'firstStats', v_first_stats
  );

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.load_practice_session(UUID, TEXT) TO authenticated;

-- 开始顺序刷体会话（合并ILIK+excluded+profiles+answers查询为1次RPC）
CREATE OR REPLACE FUNCTION public.start_sequential_session(p_user_id UUID, p_kps TEXT[], p_subjects TEXT[] DEFAULT NULL, p_question_type TEXT DEFAULT NULL, p_session_key TEXT DEFAULT NULL, p_ignore_answered BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_ids UUID[];
  v_kps_arr TEXT[];
  v_subj_arr TEXT[];
  v_resume_idx INT := 0;
  v_plan_reset TIMESTAMPTZ;
  v_subject_resets JSONB;
  v_answered_set UUID[];
  v_q_subj TEXT;
  v_i INT;
  v_session_key TEXT;
  v_result JSONB;
BEGIN
  IF p_session_key IS NOT NULL THEN
    v_session_key := p_session_key;
  ELSE
    SELECT array_to_string(array_agg(kp ORDER BY kp), '|') INTO v_session_key FROM unnest(p_kps) kp;
  END IF;

  -- 1. Query matching questions via kp_question_map (pre-computed, no ILIKE scan)
  WITH matched AS (
    SELECT DISTINCT q.id, q.subject,
           COALESCE(q.seq_number, 999999) AS seq_number,
           kqm.kp
    FROM public.kp_question_map kqm
    JOIN public.questions q ON q.id = kqm.question_id
    WHERE kqm.kp = ANY(p_kps)
      AND (p_subjects IS NULL OR q.subject = ANY(p_subjects))
      AND (p_question_type IS NULL OR q.question_type = p_question_type)
      AND NOT EXISTS (SELECT 1 FROM public.user_excluded_questions ueq WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id)
  ),
  deduped AS (
    SELECT DISTINCT ON (m.id) m.id, m.subject, m.seq_number, m.kp FROM matched m
  ),
  sorted AS (
    SELECT d.id, d.subject, d.kp, d.seq_number FROM deduped d ORDER BY COALESCE(d.subject, ''), d.kp, d.seq_number
  )
  SELECT array_agg(s.id), array_agg(s.kp), array_agg(COALESCE(s.subject, ''))
  INTO v_ids, v_kps_arr, v_subj_arr FROM sorted s;

  IF v_ids IS NULL THEN
    v_ids := '{}'::UUID[]; v_kps_arr := '{}'::TEXT[]; v_subj_arr := '{}'::TEXT[];
  END IF;

  IF NOT p_ignore_answered THEN
    -- 2. Get profile reset timestamps
    SELECT pd.plan_reset_at, COALESCE(pd.subject_reset_at, '{}'::jsonb)
    INTO v_plan_reset, v_subject_resets FROM public.profiles pd WHERE pd.id = p_user_id;

    -- 3. Get answered question set (respecting per-subject resets)
    IF array_length(v_ids, 1) > 0 THEN
      SELECT array_agg(ua.question_id) INTO v_answered_set
      FROM public.user_answers ua
      WHERE ua.user_id = p_user_id AND ua.question_id = ANY(v_ids)
        AND (v_plan_reset IS NULL OR ua.answered_at >= v_plan_reset);

      IF v_answered_set IS NULL THEN v_answered_set := '{}'::UUID[]; END IF;

      FOR v_i IN 1..array_length(v_ids, 1) LOOP
        v_q_subj := v_subj_arr[v_i];
        IF v_subject_resets ? v_q_subj THEN
          PERFORM 1 FROM public.user_answers ua
          WHERE ua.user_id = p_user_id AND ua.question_id = v_ids[v_i]
            AND ua.answered_at >= (v_subject_resets->>v_q_subj)::TIMESTAMPTZ;
          IF NOT FOUND THEN v_answered_set := array_remove(v_answered_set, v_ids[v_i]); END IF;
        END IF;
      END LOOP;

      -- 4. Find first unanswered question
      v_resume_idx := 0;
      FOR v_i IN 1..array_length(v_ids, 1) LOOP
        IF NOT (v_ids[v_i] = ANY(v_answered_set)) THEN v_resume_idx := v_i - 1; EXIT; END IF;
        v_resume_idx := v_i;
      END LOOP;
      IF v_resume_idx >= array_length(v_ids, 1) THEN
        v_resume_idx := GREATEST(0, array_length(v_ids, 1) - 1);
      END IF;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'sessionKey', v_session_key,
    'questionIds', to_jsonb(v_ids),
    'questionKps', to_jsonb(v_kps_arr),
    'questionSubjects', to_jsonb(v_subj_arr),
    'currentIndex', v_resume_idx
  );
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_sequential_session(UUID, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN) TO authenticated;

-- 获取学科/分类元数据
CREATE OR REPLACE FUNCTION public.get_question_meta(p_subject TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'subjects', (SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL),
    'categories', (SELECT jsonb_agg(DISTINCT category ORDER BY category) FROM public.questions WHERE category IS NOT NULL),
    'key_points', (SELECT jsonb_agg(DISTINCT kp ORDER BY kp) FROM public.questions, LATERAL unnest(string_to_array(key_points, ', ')) AS kp WHERE key_points IS NOT NULL AND kp <> '' AND (p_subject IS NULL OR subject = p_subject))
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_question_meta(TEXT) TO authenticated;

-- 计划进度聚合 — 一次查询替代客户端分页+Set计数
-- 注: 本函数此前在文件里是坏的 —— missing_kp 写成了 GROUP BY 查询 SELECT 列表里的相关子查询
--     (WHERE q2.subject = COALESCE(q.subject,'Other')),Postgres 报 "subquery uses ungrouped column",
--     整条 CREATE 失败,导致全新库根本没有这个函数(而前端 3 处在用 5 参数版)。
--     下面两段取自线上可用定义:5 参数版把 missing_kp 拆成独立 CTE 再 LEFT JOIN,规避了该限制。
CREATE OR REPLACE FUNCTION public.get_subject_progress(p_user_id uuid, p_plan_reset_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_today_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_subjects text[] DEFAULT NULL::text[])
 RETURNS TABLE(subject text, total bigint, done_all bigint, done_today bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;
GRANT EXECUTE ON FUNCTION public.get_subject_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_subject_progress(p_user_id uuid, p_plan_reset_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_today_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_subjects text[] DEFAULT NULL::text[], p_subject_resets jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(subject text, total bigint, done_all bigint, done_today bigint, missing_kp bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT
      COALESCE(q.subject, 'Other')          AS subj,
      COUNT(DISTINCT q.id)                  AS total,
      COUNT(DISTINCT ua_all.question_id)    AS done_all,
      COUNT(DISTINCT ua_today.question_id)  AS done_today
    FROM public.questions q
    LEFT JOIN public.user_answers ua_all
      ON ua_all.question_id = q.id
      AND ua_all.user_id = p_user_id
      AND (
        (p_subject_resets IS NOT NULL AND p_subject_resets ? q.subject AND ua_all.answered_at >= (p_subject_resets->>q.subject)::TIMESTAMPTZ)
        OR
        (p_subject_resets IS NULL OR NOT (p_subject_resets ? q.subject)) AND (p_plan_reset_at IS NULL OR ua_all.answered_at >= p_plan_reset_at)
      )
    LEFT JOIN public.user_answers ua_today
      ON ua_today.question_id = q.id
      AND ua_today.user_id = p_user_id
      AND ua_today.answered_at >= p_today_since
      AND (
        (p_subject_resets IS NOT NULL AND p_subject_resets ? q.subject AND ua_today.answered_at >= (p_subject_resets->>q.subject)::TIMESTAMPTZ)
        OR
        (p_subject_resets IS NULL OR NOT (p_subject_resets ? q.subject)) AND (p_plan_reset_at IS NULL OR ua_today.answered_at >= p_plan_reset_at)
      )
    WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
      AND q.key_points IS NOT NULL AND q.key_points != ''
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ueq
        WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
      )
    GROUP BY COALESCE(q.subject, 'Other')
  ),
  missing AS (
    SELECT COALESCE(q.subject, 'Other') AS subj, COUNT(*) AS cnt
    FROM public.questions q
    WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
      AND (q.key_points IS NULL OR q.key_points = '')
      AND NOT EXISTS (SELECT 1 FROM public.user_excluded_questions ueq WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id)
    GROUP BY COALESCE(q.subject, 'Other')
  )
  SELECT b.subj, b.total, b.done_all, b.done_today, COALESCE(m.cnt, 0) AS missing_kp
  FROM base b
  LEFT JOIN missing m ON m.subj = b.subj
  ORDER BY b.subj;
$function$;
GRANT EXECUTE ON FUNCTION public.get_subject_progress(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], JSONB) TO authenticated;

-- 计划知识点范围(plan_scope)进度 — 按“选中知识点集合”统计,解决学习计划按学科统计总量、
-- 刷题会话按选中知识点统计题量时“分母不一致”的问题。
--   语义:计划学科 S 认领了一组知识点 K[S],则该学科的“可刷总量” = 属于 S 且命中 K[S] 的
--   去重题目数(而非整科题量)。当 K[S] = S 全部知识点时,该值 ≈ 整科 total(整科还含 missing_kp)。
--   原 get_subject_progress 保持整科口径不变(零回归);客户端对设置了 plan_scope 的学科
--   用本函数,未设置的学科(默认整科)继续走 get_subject_progress —— 二者分母对齐。
--   返回的 missing_kp 恒为 0:该口径只关心已打标题、被认领知识点下的题。
CREATE OR REPLACE FUNCTION public.get_kp_scope_progress(
  p_user_id          UUID,
  p_kp_scope         JSONB,
  p_plan_reset_at    TIMESTAMPTZ DEFAULT NULL,
  p_today_since      TIMESTAMPTZ DEFAULT NULL,
  p_subject_resets   JSONB       DEFAULT NULL
)
RETURNS TABLE(
  subject     TEXT,
  total       BIGINT,
  done_all    BIGINT,
  done_today  BIGINT,
  missing_kp  BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    sc.subject,
    COUNT(DISTINCT sc.qid)                        AS total,
    COUNT(DISTINCT CASE WHEN ua_all.question_id IS NOT NULL THEN sc.qid END)   AS done_all,
    COUNT(DISTINCT CASE WHEN ua_today.question_id IS NOT NULL THEN sc.qid END) AS done_today,
    0::BIGINT                                     AS missing_kp
  FROM (
    -- 命中认领知识点的题目(学科维度,同题多知识点去重)
    SELECT q.subject AS subject, m.question_id AS qid
    FROM public.kp_question_map m
    JOIN public.questions q ON q.id = m.question_id
    JOIN jsonb_each_text(p_kp_scope) sc ON sc.key = q.subject
    WHERE sc.value::jsonb ? m.kp
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ueq
        WHERE ueq.question_id = m.question_id AND ueq.user_id = p_user_id
      )
    GROUP BY q.subject, m.question_id
  ) sc
  LEFT JOIN public.user_answers ua_all
    ON ua_all.question_id = sc.qid
    AND ua_all.user_id = p_user_id
    AND (
      (p_subject_resets IS NOT NULL AND p_subject_resets ? sc.subject
          AND ua_all.answered_at >= (p_subject_resets->>sc.subject)::TIMESTAMPTZ)
      OR
      ((p_subject_resets IS NULL OR NOT (p_subject_resets ? sc.subject))
          AND (p_plan_reset_at IS NULL OR ua_all.answered_at >= p_plan_reset_at))
    )
  LEFT JOIN public.user_answers ua_today
    ON ua_today.question_id = sc.qid
    AND ua_today.user_id = p_user_id
    AND ua_today.answered_at >= p_today_since
    AND (
      (p_subject_resets IS NOT NULL AND p_subject_resets ? sc.subject
          AND ua_today.answered_at >= (p_subject_resets->>sc.subject)::TIMESTAMPTZ)
      OR
      ((p_subject_resets IS NULL OR NOT (p_subject_resets ? sc.subject))
          AND (p_plan_reset_at IS NULL OR ua_today.answered_at >= p_plan_reset_at))
    )
  GROUP BY sc.subject
  ORDER BY sc.subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_kp_scope_progress(UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;

-- 每日各学科完成情况
CREATE OR REPLACE FUNCTION public.get_daily_completion(
  p_user_id UUID, p_days INTEGER DEFAULT 30, p_subjects TEXT[] DEFAULT NULL
)
RETURNS TABLE(day DATE, subject TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT ua.answered_at::DATE AS day, COALESCE(q.subject, 'Other') AS subject,
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

-- 正确率变化：今日 vs 昨日
CREATE OR REPLACE FUNCTION public.get_accuracy_change(p_user_id UUID)
RETURNS TABLE(subject TEXT, today_correct BIGINT, today_total BIGINT, yesterday_correct BIGINT, yesterday_total BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH today AS (
    SELECT COALESCE(q.subject, 'Other') AS subject,
           COUNT(*) FILTER (WHERE ua.is_correct) AS correct, COUNT(*) AS total
    FROM public.user_answers ua JOIN public.questions q ON q.id = ua.question_id
    WHERE ua.user_id = p_user_id AND ua.answered_at::DATE = CURRENT_DATE
    GROUP BY q.subject
  ),
  yesterday AS (
    SELECT COALESCE(q.subject, 'Other') AS subject,
           COUNT(*) FILTER (WHERE ua.is_correct) AS correct, COUNT(*) AS total
    FROM public.user_answers ua JOIN public.questions q ON q.id = ua.question_id
    WHERE ua.user_id = p_user_id AND ua.answered_at::DATE = CURRENT_DATE - 1
    GROUP BY q.subject
  )
  SELECT COALESCE(t.subject, y.subject) AS subject,
         COALESCE(t.correct, 0) AS today_correct, COALESCE(t.total, 0) AS today_total,
         COALESCE(y.correct, 0) AS yesterday_correct, COALESCE(y.total, 0) AS yesterday_total
  FROM today t FULL OUTER JOIN yesterday y ON t.subject = y.subject
  WHERE COALESCE(t.total, 0) + COALESCE(y.total, 0) > 0
  ORDER BY subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_accuracy_change(UUID) TO authenticated;

-- 各学科各题型正确率
CREATE OR REPLACE FUNCTION public.get_type_accuracy(p_user_id UUID, p_subjects TEXT[] DEFAULT NULL)
RETURNS TABLE(subject TEXT, question_type TEXT, correct BIGINT, total BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE(q.subject, 'Other') AS subject, q.question_type,
         COUNT(*) FILTER (WHERE ua.is_correct) AS correct, COUNT(*) AS total
  FROM public.user_answers ua JOIN public.questions q ON q.id = ua.question_id
  WHERE ua.user_id = p_user_id AND q.question_type IS NOT NULL
    AND (p_subjects IS NULL OR q.subject = ANY(p_subjects))
  GROUP BY q.subject, q.question_type
  ORDER BY q.subject, q.question_type;
$$;
GRANT EXECUTE ON FUNCTION public.get_type_accuracy(UUID, TEXT[]) TO authenticated;

-- ============================================================================
-- 14. ROW LEVEL SECURITY — 行级安全
-- ============================================================================
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parse_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_banks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_meta_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sequential_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_excluded_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_login_tokens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences         ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- questions
DROP POLICY IF EXISTS questions_select_all ON public.questions;
CREATE POLICY questions_select_all ON public.questions FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS questions_insert_admin ON public.questions;
CREATE POLICY questions_insert_admin ON public.questions FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS questions_update_admin ON public.questions;
CREATE POLICY questions_update_admin ON public.questions FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS questions_delete_admin ON public.questions;
CREATE POLICY questions_delete_admin ON public.questions FOR DELETE USING (public.is_admin());

-- exam_sessions
DROP POLICY IF EXISTS exam_sessions_own ON public.exam_sessions;
CREATE POLICY exam_sessions_own ON public.exam_sessions FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- user_answers
DROP POLICY IF EXISTS user_answers_own ON public.user_answers;
CREATE POLICY user_answers_own ON public.user_answers FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS user_answers_public_select ON public.user_answers;
CREATE POLICY user_answers_public_select ON public.user_answers FOR SELECT
  USING (is_public = true OR user_id = auth.uid() OR public.is_admin());

-- favorites
DROP POLICY IF EXISTS favorites_own ON public.favorites;
CREATE POLICY favorites_own ON public.favorites FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- parse_history
DROP POLICY IF EXISTS parse_history_own ON public.parse_history;
CREATE POLICY parse_history_own ON public.parse_history FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- question_banks
DROP POLICY IF EXISTS qb_select ON public.question_banks;
CREATE POLICY qb_select ON public.question_banks FOR SELECT
  USING (is_public = true OR created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS qb_insert ON public.question_banks;
CREATE POLICY qb_insert ON public.question_banks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS qb_update ON public.question_banks;
CREATE POLICY qb_update ON public.question_banks FOR UPDATE
  USING (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS qb_delete ON public.question_banks;
CREATE POLICY qb_delete ON public.question_banks FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin());

-- question_bank_items
DROP POLICY IF EXISTS qbi_select ON public.question_bank_items;
CREATE POLICY qbi_select ON public.question_bank_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.question_banks WHERE id = bank_id AND (is_public = true OR created_by = auth.uid() OR public.is_admin())));
DROP POLICY IF EXISTS qbi_insert ON public.question_bank_items;
CREATE POLICY qbi_insert ON public.question_bank_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.question_banks WHERE id = bank_id AND (created_by = auth.uid() OR public.is_admin())));
DROP POLICY IF EXISTS qbi_delete ON public.question_bank_items;
CREATE POLICY qbi_delete ON public.question_bank_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.question_banks WHERE id = bank_id AND (created_by = auth.uid() OR public.is_admin())));

-- user_daily_stats
DROP POLICY IF EXISTS uds_own ON public.user_daily_stats;
CREATE POLICY uds_own ON public.user_daily_stats FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- question_meta_cache
DROP POLICY IF EXISTS qmc_select ON public.question_meta_cache;
CREATE POLICY qmc_select ON public.question_meta_cache FOR SELECT TO authenticated USING (true);

-- practice_sequential_state
DROP POLICY IF EXISTS pss_own ON public.practice_sequential_state;
CREATE POLICY pss_own ON public.practice_sequential_state FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- user_excluded_questions
DROP POLICY IF EXISTS ueq_own ON public.user_excluded_questions;
CREATE POLICY ueq_own ON public.user_excluded_questions FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- qr_login_tokens
DROP POLICY IF EXISTS qr_insert ON public.qr_login_tokens;
CREATE POLICY qr_insert ON public.qr_login_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS qr_select ON public.qr_login_tokens;
CREATE POLICY qr_select ON public.qr_login_tokens FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS qr_update ON public.qr_login_tokens;
CREATE POLICY qr_update ON public.qr_login_tokens FOR UPDATE TO authenticated
  USING (status = 'pending' AND expires_at > NOW())
  WITH CHECK (user_id IS NOT NULL AND status = 'confirmed');

-- user_preferences
DROP POLICY IF EXISTS upref_own ON public.user_preferences;
CREATE POLICY upref_own ON public.user_preferences FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 15. SECURITY HARDENING
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;

-- files bucket
DROP POLICY IF EXISTS "allow_read"       ON storage.objects;
DROP POLICY IF EXISTS "files_select_auth" ON storage.objects;
CREATE POLICY "files_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'files');
DROP POLICY IF EXISTS "files_insert_auth" ON storage.objects;
CREATE POLICY "files_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'files');
DROP POLICY IF EXISTS "files_delete_auth" ON storage.objects;
CREATE POLICY "files_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'files');

-- ============================================================================
-- 16. DATA MIGRATIONS — 兼容旧数据
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'correct_answer' AND data_type = 'integer') THEN
    ALTER TABLE public.questions ALTER COLUMN correct_answer TYPE JSONB USING to_jsonb(correct_answer);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_answers' AND column_name = 'selected_answer' AND data_type = 'integer') THEN
    ALTER TABLE public.user_answers ALTER COLUMN selected_answer TYPE JSONB USING to_jsonb(selected_answer);
  END IF;
END $$;

-- ============================================================================
-- 17. TOTP 二次验证 & 设备信任
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS totp_secret  TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_trusted_devices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,
  device_name TEXT,
  custom_name TEXT,
  device_info JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_utd_user ON public.user_trusted_devices(user_id);

ALTER TABLE public.user_trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS utd_own ON public.user_trusted_devices;
CREATE POLICY utd_own ON public.user_trusted_devices FOR ALL
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cleanup_expired_devices()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.user_trusted_devices WHERE expires_at < NOW();
$$;

-- ============================================================================
-- Section 8: WebAuthn / Passkey 支持
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_2fa TEXT NOT NULL DEFAULT 'totp'
  CHECK (preferred_2fa IN ('totp', 'passkey'));

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    JSONB DEFAULT '[]'::jsonb,
  device_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_passkey_user ON public.passkey_credentials(user_id);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pkc_own ON public.passkey_credentials;
CREATE POLICY pkc_own ON public.passkey_credentials
  FOR ALL
  USING (user_id = auth.uid());

-- Challenge store for WebAuthn registration/authentication flows
CREATE TABLE IF NOT EXISTS public.auth_challenges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_user ON public.auth_challenges(user_id);

-- Cleanup expired challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.auth_challenges WHERE expires_at < NOW();
$$;

-- ============================================================================
-- Section 9: 登录审计日志 & Session 管理
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auth_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip         TEXT,
  user_agent TEXT,
  region     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_log_user    ON public.auth_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_log_created ON public.auth_log(created_at DESC);

-- ============================================================================
-- Section 10: Passkey enhancement — platform info & re-verification timeout
-- ============================================================================

ALTER TABLE public.passkey_credentials
  ADD COLUMN IF NOT EXISTS platform              TEXT,
  ADD COLUMN IF NOT EXISTS credential_device_type TEXT,
  ADD COLUMN IF NOT EXISTS credential_backed_up  BOOLEAN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passkey_timeout_minutes INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- Section 11: TOTP secret isolation — move to service_role-only table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_totp (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  totp_secret TEXT NOT NULL
);

ALTER TABLE public.user_totp ENABLE ROW LEVEL SECURITY;

-- Migrate existing secrets
INSERT INTO public.user_totp (user_id, totp_secret)
  SELECT id, totp_secret FROM public.profiles
  WHERE totp_secret IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS totp_secret;

-- ============================================================================
-- Section 12: Coding question type & code submission judge
-- ============================================================================

-- Extend question_type to support coding
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('single_choice','multi_select','true_false','fill_blank','short_answer','analysis','judge_correct','coding'));

-- Test cases for coding questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS test_cases JSONB DEFAULT '[]'::jsonb;

-- Runtime config: timeout_ms, memory_mb per question
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS runtime_config JSONB DEFAULT '{"timeout_ms":2000,"memory_mb":256}'::jsonb;

-- Code submissions table
CREATE TABLE IF NOT EXISTS public.submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id       UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,
  language          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','accepted','wrong_answer','runtime_error','timeout','compile_error')),
  results           JSONB,
  error             TEXT,
  execution_time_ms INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_question ON public.submissions(question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_question ON public.submissions(user_id, question_id, created_at DESC);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS submissions_own ON public.submissions;
CREATE POLICY submissions_own ON public.submissions FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- Execution mode for coding questions: stdio (default) or function (LeetCode-style)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'stdio'
  CHECK (execution_mode IN ('stdio', 'function'));

-- Visible example cases shown in question description (LeetCode-style Example 1/2/3)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS examples JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- Section 13: TOTP Recovery Codes
-- ============================================================================

-- Hashed recovery codes (SHA-256), service_role access only
CREATE TABLE IF NOT EXISTS public.user_recovery_codes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  codes   TEXT[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.user_recovery_codes ENABLE ROW LEVEL SECURITY;
-- No user-facing RLS policy — only service_role (Edge Function) accesses this table

-- ============================================================================
-- Section 14: Subject arrangement explanations (practice directory)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subject_explanations (
  subject    TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subject_explanations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_explanations_select_all ON public.subject_explanations;
CREATE POLICY subject_explanations_select_all ON public.subject_explanations FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS subject_explanations_write_admin ON public.subject_explanations;
CREATE POLICY subject_explanations_write_admin ON public.subject_explanations FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- Section 15: Excluded (too-easy) knowledge point stats & restore queries
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kp_exclusion_stats(p_user_id UUID, p_kps TEXT[])
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kp', s.kp, 'subject', s.subject, 'total', s.total, 'excluded', s.excluded
  )), '[]'::jsonb)
  FROM (
    SELECT kqm.kp, COALESCE(q.subject, '其他') AS subject,
           COUNT(DISTINCT kqm.question_id) AS total,
           COUNT(DISTINCT kqm.question_id) FILTER (WHERE ueq.question_id IS NOT NULL) AS excluded
    FROM public.kp_question_map kqm
    JOIN public.questions q ON q.id = kqm.question_id
    LEFT JOIN public.user_excluded_questions ueq
      ON ueq.question_id = kqm.question_id AND ueq.user_id = p_user_id
    WHERE kqm.kp = ANY(p_kps)
    GROUP BY kqm.kp, q.subject
  ) s;
$$;
GRANT EXECUTE ON FUNCTION public.get_kp_exclusion_stats(UUID, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_excluded_kp_questions(p_user_id UUID, p_kp TEXT)
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'question', (SELECT row_to_json(q) FROM public.questions q WHERE q.id = ueq.question_id),
      'latest_answer', (
        SELECT jsonb_build_object(
          'selected_answer', ua.selected_answer,
          'is_correct', ua.is_correct,
          'note', ua.note,
          'answered_at', ua.answered_at
        )
        FROM public.user_answers ua
        WHERE ua.user_id = p_user_id AND ua.question_id = ueq.question_id
        ORDER BY ua.answered_at DESC LIMIT 1
      ),
      'attempts', (SELECT count(*) FROM public.user_answers ua2 WHERE ua2.user_id = p_user_id AND ua2.question_id = ueq.question_id),
      'wrongs', (SELECT count(*) FROM public.user_answers ua3 WHERE ua3.user_id = p_user_id AND ua3.question_id = ueq.question_id AND NOT ua3.is_correct)
    )
  ), '[]'::jsonb)
  FROM public.user_excluded_questions ueq
  WHERE ueq.user_id = p_user_id
    AND ueq.question_id IN (SELECT question_id FROM public.kp_question_map WHERE kp = p_kp);
$$;
GRANT EXECUTE ON FUNCTION public.get_excluded_kp_questions(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Section 16: Short session IDs for practice_sequential_state (URL param)
-- ============================================================================

ALTER TABLE public.practice_sequential_state
  ADD COLUMN IF NOT EXISTS short_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pss_short_id ON public.practice_sequential_state(short_id);

-- Backfill existing rows
UPDATE public.practice_sequential_state p
SET short_id = t.sid
FROM (
  SELECT user_id, session_key, substr(md5(gen_random_uuid()::text), 1, 12) AS sid
  FROM public.practice_sequential_state
  WHERE short_id IS NULL
) t
WHERE p.user_id = t.user_id AND p.session_key = t.session_key;

CREATE OR REPLACE FUNCTION public.assign_session_short_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.short_id IS NULL THEN
    NEW.short_id := substr(md5(gen_random_uuid()::text), 1, 12);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pss_short_id ON public.practice_sequential_state;
CREATE TRIGGER trg_pss_short_id
  BEFORE INSERT ON public.practice_sequential_state
  FOR EACH ROW EXECUTE FUNCTION public.assign_session_short_id();

-- Return short_id from load_practice_session so the client can sync the URL param
CREATE OR REPLACE FUNCTION public.load_practice_session(p_user_id UUID, p_session_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_session RECORD;
  v_existing_ids UUID[];
  v_kp_arr TEXT[];
  v_subj_arr TEXT[];
  v_restored_index INT;
  v_saved_kps TEXT[];
  v_sps JSONB;
  v_new_data JSONB;
  v_all_ids UUID[];
  v_all_kps TEXT[];
  v_all_subjs TEXT[];
  v_current_id UUID;
  v_new_idx INT;
  v_first_q_id UUID;
  v_first_question JSONB;
  v_first_stats JSONB;
  v_result JSONB;
BEGIN
  SELECT * INTO v_session FROM public.practice_sequential_state
  WHERE user_id = p_user_id AND session_key = p_session_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_saved_kps := COALESCE(v_session.selected_kps, '{}'::TEXT[]);
  v_sps := COALESCE(v_session.subject_positions, '{}'::jsonb);
  v_restored_index := COALESCE(v_session.current_index, 0);

  -- Validate stored IDs, preserve order, extract first KP + subject
  WITH ordered AS (
    SELECT q.id, q.subject,
           (SELECT trim(kpx) FROM unnest(regexp_split_to_array(q.key_points, '[,，;；]')) kpx WHERE trim(kpx) <> '' LIMIT 1) AS kp,
           t.pos
    FROM unnest(v_session.question_ids) WITH ORDINALITY AS t(qid, pos)
    JOIN public.questions q ON q.id = t.qid
  )
  SELECT
    array_agg(o.id ORDER BY o.pos),
    array_agg(o.kp ORDER BY o.pos),
    array_agg(COALESCE(o.subject, '') ORDER BY o.pos)
  INTO v_existing_ids, v_kp_arr, v_subj_arr
  FROM ordered o;

  IF v_existing_ids IS NULL THEN
    v_existing_ids := '{}'::UUID[];
    v_kp_arr := '{}'::TEXT[];
    v_subj_arr := '{}'::TEXT[];
  END IF;

  IF v_restored_index >= array_length(v_existing_ids, 1) THEN
    v_restored_index := GREATEST(0, array_length(v_existing_ids, 1) - 1);
  END IF;

  -- Find new questions via kp_question_map (pre-computed, no ILIKE scan)
  v_new_data := '[]'::jsonb;
  IF array_length(v_saved_kps, 1) > 0 THEN
    WITH new_qs AS (
      SELECT DISTINCT q.id, q.subject,
             COALESCE(q.seq_number, 999999) AS seq_number,
             kqm.kp
      FROM public.kp_question_map kqm
      JOIN public.questions q ON q.id = kqm.question_id
      WHERE kqm.kp = ANY(v_saved_kps)
        AND NOT (q.id = ANY(v_existing_ids))
        AND NOT EXISTS (
          SELECT 1 FROM public.user_excluded_questions ueq
          WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
        )
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', nq.id,
        'subject', nq.subject,
        'kp', nq.kp,
        'seq', nq.seq_number
      )
    ), '[]'::jsonb) INTO v_new_data
    FROM new_qs nq;
  END IF;

  -- Merge existing + new, sort by (kp, seq)
  v_current_id := v_existing_ids[v_restored_index + 1];

  WITH existing AS (
    SELECT e.id, e.kp, e.subj, NULL::INT AS seq
    FROM unnest(v_existing_ids, v_kp_arr, v_subj_arr) AS e(id, kp, subj)
  ),
  new_items AS (
    SELECT (n->>'id')::UUID AS id, n->>'kp' AS kp, n->>'subject' AS subj, (n->>'seq')::INT AS seq
    FROM jsonb_array_elements(v_new_data) n
  ),
  sorted AS (
    SELECT id, kp, subj,
           row_number() OVER (ORDER BY COALESCE(subj, ''), kp, seq, id) - 1 AS rn
    FROM (SELECT * FROM existing UNION ALL SELECT * FROM new_items) u
  )
  SELECT
    array_agg(s.id ORDER BY s.rn),
    array_agg(s.kp ORDER BY s.rn),
    array_agg(s.subj ORDER BY s.rn)
  INTO v_all_ids, v_all_kps, v_all_subjs
  FROM sorted s;

  -- Find new position of current question
  v_new_idx := array_position(v_all_ids, v_current_id);
  IF v_new_idx IS NOT NULL THEN
    v_restored_index := v_new_idx - 1;
  ELSIF array_length(v_all_ids, 1) > 0 THEN
    v_restored_index := LEAST(v_restored_index, array_length(v_all_ids, 1) - 1);
  ELSE
    v_restored_index := 0;
  END IF;

  -- P1: Preload first question + stats into response (skip loadSequentialQuestion round-trip)
  v_first_question := NULL;
  v_first_stats := NULL;
  IF array_length(v_all_ids, 1) > 0 THEN
    v_first_q_id := v_all_ids[v_restored_index + 1];
    SELECT row_to_json(q) INTO v_first_question FROM public.questions q WHERE q.id = v_first_q_id;

    SELECT jsonb_build_object(
      'total', COUNT(*),
      'wrong', COUNT(*) FILTER (WHERE NOT is_correct),
      'note', (SELECT ua2.note FROM public.user_answers ua2 WHERE ua2.user_id = p_user_id AND ua2.question_id = v_first_q_id AND ua2.note IS NOT NULL ORDER BY ua2.answered_at DESC LIMIT 1),
      'isPublic', (SELECT ua3.is_public FROM public.user_answers ua3 WHERE ua3.user_id = p_user_id AND ua3.question_id = v_first_q_id AND ua3.note IS NOT NULL ORDER BY ua3.answered_at DESC LIMIT 1)
    ) INTO v_first_stats
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id AND ua.question_id = v_first_q_id;

    IF v_first_stats IS NULL THEN
      v_first_stats := jsonb_build_object('total', 0, 'wrong', 0, 'note', NULL, 'isPublic', false);
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'found', true,
    'shortId', v_session.short_id,
    'savedKps', to_jsonb(v_saved_kps),
    'subjectPositions', v_sps,
    'questionIds', to_jsonb(v_all_ids),
    'questionKps', to_jsonb(v_all_kps),
    'questionSubjects', to_jsonb(v_all_subjs),
    'currentIndex', v_restored_index,
    'firstQuestion', v_first_question,
    'firstStats', v_first_stats
  );

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.load_practice_session(UUID, TEXT) TO authenticated;


-- ============================================================================
-- Section 18: 融合 MFA —— 会话级验证(GitHub) + 账号级宽限期(腾讯云) + 敏感操作保护
-- ============================================================================

-- L2: 账号级宽限期(0 = 严格模式,每次登录都验证;默认 7 天,腾讯云同款)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_grace_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_validity_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS onboarded_at      TIMESTAMPTZ;   -- 新用户全屏引导完成/跳过时间

-- L1: 会话级已验证记录(仅 Edge Function 经 service_role 写入;用户可查/可撤销自己的行)
CREATE TABLE IF NOT EXISTS public.user_mfa_sessions (
  session_id  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  method      TEXT NOT NULL DEFAULT 'totp' CHECK (method IN ('totp','passkey')),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ums_user ON public.user_mfa_sessions(user_id);

ALTER TABLE public.user_mfa_sessions ENABLE ROW LEVEL SECURITY;

-- 用户可读自己的已验证会话(设置页列表)
DROP POLICY IF EXISTS ums_own_select ON public.user_mfa_sessions;
CREATE POLICY ums_own_select ON public.user_mfa_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 用户可撤销自己的已验证会话(退出该会话的免验证)
DROP POLICY IF EXISTS ums_own_delete ON public.user_mfa_sessions;
CREATE POLICY ums_own_delete ON public.user_mfa_sessions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- 注意:无 INSERT/UPDATE 策略 —— 客户端绝不能自标记已验证,写入只走 Edge Function(service_role)

-- 过期清理(与 cleanup_expired_devices 同风格)
CREATE OR REPLACE FUNCTION public.cleanup_mfa_expired()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.user_mfa_sessions WHERE expires_at < NOW();
$$;

-- ============================================================================
-- Section 19: 题目问题标记 —— 发现题目可能有错但来不及修改时,先打标待处理
--   issue_flag: none(无) / suspected(疑似有错) / confirmed(已确认有错)
-- ============================================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS issue_flag  TEXT NOT NULL DEFAULT 'none'
    CHECK (issue_flag IN ('none', 'suspected', 'confirmed')),
  ADD COLUMN IF NOT EXISTS issue_note  TEXT,
  ADD COLUMN IF NOT EXISTS flagged_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_questions_issue_flag ON public.questions(issue_flag);
-- ============================================================================
-- Section 20: 题目查重 —— 同科跨分类重复题扫描 + 人工复核 + 安全合并
--   用法: 管理员在「后台 → 题目查重」页按学科扫描;
--   扫描输出候选对与「重复概率」,可逐对选择: 合并(保留一条) / 保留两题 / 标记非重复
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER EXTENSION pg_trgm SET SCHEMA public;

-- 20.1 文本规范化: 去掉 HTML 标签、空白、标点(含中文全角)后小写,用于精确指纹
-- 中文标点用 translate 显式删除(避免超长正则字符类的兼容性问题), ASCII 标点/空白走 POSIX 类
CREATE OR REPLACE FUNCTION public.norm_dup_compact(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(regexp_replace(
    translate(
      regexp_replace(
        regexp_replace(coalesce(p_text, ''), '<[^>]*>', ' ', 'g'),
        '[[:space:]]+', ' ', 'g'),
      '，。！？；：、（）《》【】“”‘’…—·～『』「」〈〉﹏＿─—', ''),
    '[[:punct:]]+', '', 'g'))
$$;

-- 20.2 文本规范化: 仅折叠空白、去标签,保留结构用于 trigram 相似度
CREATE OR REPLACE FUNCTION public.norm_dup_stem(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(coalesce(p_text, ''), '<[^>]*>', ' ', 'g'),
    '[[:space:]]+', ' ', 'g')))
$$;

-- 20.3 选项重叠度: 两个规范化选项数组的 Jaccard(交集 / 较大集合大小)
CREATE OR REPLACE FUNCTION public.dup_arr_jaccard(a TEXT[], b TEXT[])
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN cardinality(a) IS NULL OR cardinality(b) IS NULL THEN 0
    WHEN cardinality(a) = 0 AND cardinality(b) = 0 THEN 1
    WHEN cardinality(a) = 0 OR cardinality(b) = 0 THEN 0
    ELSE (SELECT count(*)::numeric FROM (SELECT unnest(a) INTERSECT SELECT unnest(b)) i)
         / GREATEST(cardinality(a), cardinality(b))::numeric
  END
$$;

-- 20.4 分数 → 重复概率(规则版,未校准; 抽样人工复核后可迭代)
CREATE OR REPLACE FUNCTION public.dup_score_prob(p_score NUMERIC)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_score >= 0.95 THEN 1.0
    WHEN p_score >= 0.85 THEN 0.93
    WHEN p_score >= 0.75 THEN 0.85
    WHEN p_score >= 0.65 THEN 0.72
    WHEN p_score >= 0.55 THEN 0.58
    ELSE 0.45
  END
$$;

-- 20.5 题目正文 JSON(供扫描结果直接返回,避免二次查询)
CREATE OR REPLACE FUNCTION public.dup_question_json(p_id UUID)
RETURNS jsonb LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT jsonb_build_object(
    'id', q.id,
    'subject', q.subject,
    'category', q.category,
    'categories', COALESCE(q.categories, '[]'::jsonb),
    'questionType', q.question_type,
    'questionText', q.question_text,
    'options', COALESCE(q.options, '[]'::jsonb),
    'correctAnswer', q.correct_answer,
    'keyPoints', q.key_points,
    'verified', q.verified,
    'importMode', q.import_mode,
    'sourcePage', q.source_page,
    'seqNumber', q.seq_number,
    'createdAt', q.created_at,
    'answerExplanation', q.answer_explanation,
    'analysis', q.analysis,
    'allowUnordered', q.allow_unordered,
    'unorderedBlanks', q.unordered_blanks)
  FROM public.questions q
  WHERE q.id = p_id
$$;

-- 20.6 查重缓存表(规范化指纹 + trigram,由触发器维护)
CREATE TABLE IF NOT EXISTS public.question_dup_cache (
  question_id UUID PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL DEFAULT '',
  stem        TEXT NOT NULL DEFAULT '',
  stem_fp     TEXT NOT NULL DEFAULT '',
  opts        TEXT[] NOT NULL DEFAULT '{}',
  opts_fp     TEXT NOT NULL DEFAULT '',
  ans_fp      TEXT NOT NULL DEFAULT '',
  len         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qdc_subject ON public.question_dup_cache(subject);
CREATE INDEX IF NOT EXISTS idx_qdc_fp      ON public.question_dup_cache(subject, stem_fp);
CREATE INDEX IF NOT EXISTS idx_qdc_trgm    ON public.question_dup_cache USING gin (stem public.gin_trgm_ops);
ALTER TABLE public.question_dup_cache ENABLE ROW LEVEL SECURITY;

-- 单行同步(INSERT/SELECT 共用的指纹计算)
CREATE OR REPLACE FUNCTION public.sync_dup_cache_question(p_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.question_dup_cache (question_id, subject, stem, stem_fp, opts, opts_fp, ans_fp, len)
  SELECT q.id,
         COALESCE(q.subject, ''),
         f.stem,
         md5(f.compact),
         f.opts,
         md5(COALESCE(array_to_string(f.opts, '|'), '')),
         md5(public.norm_dup_compact(q.correct_answer::text)),
         length(f.stem)
  FROM public.questions q
  CROSS JOIN LATERAL (
    SELECT public.norm_dup_stem(q.question_text) AS stem,
           public.norm_dup_compact(q.question_text) AS compact,
           COALESCE((SELECT array_agg(nv ORDER BY nv)
            FROM (SELECT DISTINCT public.norm_dup_compact(v) AS nv
                  FROM jsonb_array_elements_text(q.options) v) s
            WHERE nv <> ''), '{}'::text[]) AS opts
  ) f
  WHERE q.id = p_id
  ON CONFLICT (question_id) DO UPDATE SET
    subject = EXCLUDED.subject, stem = EXCLUDED.stem, stem_fp = EXCLUDED.stem_fp,
    opts = EXCLUDED.opts, opts_fp = EXCLUDED.opts_fp, ans_fp = EXCLUDED.ans_fp, len = EXCLUDED.len
$$;

-- 整学科 / 全量重建(扫描前调用)
CREATE OR REPLACE FUNCTION public.refresh_dup_cache(p_subject TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.question_dup_cache c
  WHERE (p_subject IS NULL OR c.subject = p_subject)
    AND NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.id = c.question_id);

  INSERT INTO public.question_dup_cache (question_id, subject, stem, stem_fp, opts, opts_fp, ans_fp, len)
  SELECT q.id, COALESCE(q.subject, ''), f.stem, md5(f.compact), f.opts,
         md5(COALESCE(array_to_string(f.opts, '|'), '')),
         md5(public.norm_dup_compact(q.correct_answer::text)), length(f.stem)
  FROM public.questions q
  CROSS JOIN LATERAL (
    SELECT public.norm_dup_stem(q.question_text) AS stem,
           public.norm_dup_compact(q.question_text) AS compact,
           COALESCE((SELECT array_agg(nv ORDER BY nv)
            FROM (SELECT DISTINCT public.norm_dup_compact(v) AS nv
                  FROM jsonb_array_elements_text(q.options) v) s
            WHERE nv <> ''), '{}'::text[]) AS opts
  ) f
  WHERE (p_subject IS NULL OR COALESCE(q.subject, '') = p_subject)
  ON CONFLICT (question_id) DO UPDATE SET
    subject = EXCLUDED.subject, stem = EXCLUDED.stem, stem_fp = EXCLUDED.stem_fp,
    opts = EXCLUDED.opts, opts_fp = EXCLUDED.opts_fp, ans_fp = EXCLUDED.ans_fp, len = EXCLUDED.len;
END
$$;

-- 行级触发器: 题目增删改时保持缓存新鲜
CREATE OR REPLACE FUNCTION public.trg_dup_cache_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.question_dup_cache WHERE question_id = OLD.id;
  ELSE
    PERFORM public.sync_dup_cache_question(NEW.id);
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_dup_cache_sync ON public.questions;
CREATE TRIGGER trg_dup_cache_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.trg_dup_cache_sync();

-- 20.7 人工复核表: keep=有意保留两题, not_dup=判定非重复(二者都让该对不再出现在扫描里)
CREATE TABLE IF NOT EXISTS public.question_dup_reviews (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  q1_id      UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  q2_id      UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL CHECK (status IN ('keep', 'not_dup')),
  note       TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (q1_id, q2_id)
);
CREATE INDEX IF NOT EXISTS idx_qdr_subject_status ON public.question_dup_reviews(subject, status);
ALTER TABLE public.question_dup_reviews ENABLE ROW LEVEL SECURITY;

-- 20.8 合并审计表(被删题删除后仍保留记录; 无外键避免级联丢失历史)
CREATE TABLE IF NOT EXISTS public.question_merge_log (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject          TEXT NOT NULL DEFAULT '',
  kept_id          UUID NOT NULL,
  removed_id       UUID NOT NULL,
  score            NUMERIC(6,4),
  reason           TEXT,
  merged_categories JSONB,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qml_removed ON public.question_merge_log(removed_id);
CREATE INDEX IF NOT EXISTS idx_qml_created  ON public.question_merge_log(created_at DESC);
ALTER TABLE public.question_merge_log ENABLE ROW LEVEL SECURITY;

-- 20.9 扫描函数: 同学科内 精确指纹(L0) + trigram 近似(L1) 候选,按重复概率排序
CREATE OR REPLACE FUNCTION public.scan_question_duplicates(
  p_subject TEXT DEFAULT NULL,
  p_min_sim NUMERIC DEFAULT 0.55,
  p_limit   INTEGER DEFAULT 300
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_sim   NUMERIC := GREATEST(0.4, LEAST(COALESCE(p_min_sim, 0.55), 0.95));
  v_lim   INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 300), 1000));
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM public.refresh_dup_cache(p_subject);

  IF p_subject IS NULL AND (SELECT count(*) FROM public.question_dup_cache) > 20000 THEN
    RAISE EXCEPTION '题库超过 20000 题,请按学科扫描以控制耗时';
  END IF;

  PERFORM set_config('pg_trgm.similarity_threshold', v_sim::text, true);

  WITH exact AS (
    SELECT a.question_id AS q1, b.question_id AS q2,
           'exact'::text AS kind, 1.0::numeric AS score,
           1.0::numeric AS s_text, 1.0::numeric AS o_overlap,
           CASE WHEN a.ans_fp = b.ans_fp THEN 1.0::numeric ELSE 0.0::numeric END AS a_same,
           md5(a.subject || '|' || a.stem_fp) AS gkey,
           (SELECT count(*) FROM public.question_dup_cache cc
             WHERE cc.subject = a.subject AND cc.stem_fp = a.stem_fp)::int AS gsize
    FROM public.question_dup_cache a
    JOIN public.question_dup_cache b
      ON a.stem_fp = b.stem_fp AND a.subject = b.subject AND a.question_id < b.question_id
    WHERE p_subject IS NULL OR a.subject = p_subject
  ),
  fuzzy AS (
    SELECT a.question_id AS q1, b.question_id AS q2,
           'fuzzy'::text AS kind,
           round(
             public.similarity(a.stem, b.stem)::numeric
             * (0.55 + 0.25 * public.dup_arr_jaccard(a.opts, b.opts)
                     + 0.20 * CASE WHEN a.ans_fp = b.ans_fp THEN 1 ELSE 0 END),
             4
           ) AS score,
           public.similarity(a.stem, b.stem)::numeric AS s_text,
           public.dup_arr_jaccard(a.opts, b.opts) AS o_overlap,
           CASE WHEN a.ans_fp = b.ans_fp THEN 1.0::numeric ELSE 0.0::numeric END AS a_same,
           NULL::text AS gkey, NULL::int AS gsize
    FROM public.question_dup_cache a
    JOIN public.question_dup_cache b
      ON a.subject = b.subject AND a.question_id < b.question_id
     AND a.stem % b.stem
     AND a.len BETWEEN b.len * 0.7 AND b.len * 1.45
     AND a.stem_fp <> b.stem_fp
    WHERE (p_subject IS NULL OR a.subject = p_subject)
      AND a.len >= 10 AND b.len >= 10
  ),
  merged AS (
    SELECT q1, q2, kind, score, s_text, o_overlap, a_same, gkey, gsize,
           row_number() OVER (PARTITION BY q1, q2
                              ORDER BY (kind = 'exact') DESC, score DESC) AS rn
    FROM (
      SELECT q1, q2, kind, score, s_text, o_overlap, a_same, gkey, gsize FROM exact
      UNION ALL
      SELECT q1, q2, kind, score, s_text, o_overlap, a_same, gkey, gsize FROM fuzzy
    ) u
  ),
  filtered AS MATERIALIZED (
    SELECT q1, q2, kind, score, s_text, o_overlap, a_same, gkey, gsize
    FROM merged
    WHERE rn = 1
      AND score >= 0.55
      AND NOT EXISTS (
        SELECT 1 FROM public.question_dup_reviews r
        WHERE (r.q1_id = q1 AND r.q2_id = q2) OR (r.q1_id = q2 AND r.q2_id = q1))
      AND NOT EXISTS (
        SELECT 1 FROM public.question_merge_log m
        WHERE (m.kept_id = q1 AND m.removed_id = q2) OR (m.kept_id = q2 AND m.removed_id = q1))
  ),
  ranked AS (
    SELECT f.*, row_number() OVER (ORDER BY f.score DESC, f.q1, f.q2) AS rr
    FROM filtered f
  )
  SELECT jsonb_build_object(
    'subject', p_subject,
    'total', (SELECT count(*)::int FROM filtered),
    'limit', v_lim,
    'truncated', (SELECT count(*)::int FROM filtered) > v_lim,
    'candidates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', kind,
        'score', score,
        'prob', public.dup_score_prob(score),
        'level', CASE WHEN score >= 0.85 THEN 'high' WHEN score >= 0.65 THEN 'mid' ELSE 'low' END,
        'signals', jsonb_build_object('sText', s_text, 'oOverlap', o_overlap, 'aSame', a_same),
        'group', CASE WHEN gkey IS NOT NULL THEN jsonb_build_object(
                   'key', gkey, 'size', gsize,
                   'members', (SELECT COALESCE(
                                jsonb_agg(public.dup_question_json(cc.question_id)
                                          ORDER BY q.created_at, cc.question_id), '[]'::jsonb)
                               FROM public.question_dup_cache cc
                               JOIN public.questions q ON q.id = cc.question_id
                               WHERE md5(cc.subject || '|' || cc.stem_fp) = gkey))
                   ELSE NULL END,
        'a', public.dup_question_json(q1),
        'b', public.dup_question_json(q2)
      ) ORDER BY score DESC, q1, q2)
      FROM ranked WHERE rr <= v_lim), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END
$$;

-- 20.10 人工复核: 保留两题(keep) / 判定非重复(not_dup)
CREATE OR REPLACE FUNCTION public.save_dup_review(
  p_q1 UUID, p_q2 UUID, p_status TEXT, p_note TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('keep', 'not_dup') THEN RAISE EXCEPTION 'invalid status: %', p_status; END IF;

  INSERT INTO public.question_dup_reviews (q1_id, q2_id, subject, status, note, created_by)
  SELECT LEAST(p_q1, p_q2), GREATEST(p_q1, p_q2),
         COALESCE((SELECT q.subject FROM public.questions q WHERE q.id = p_q1), ''),
         p_status, p_note, auth.uid()
  ON CONFLICT (q1_id, q2_id) DO UPDATE SET
    status = EXCLUDED.status, note = EXCLUDED.note,
    created_by = EXCLUDED.created_by, created_at = NOW();
END
$$;

-- 20.11 合并: 保留 p_keep, 删除 p_remove; 先重指所有引用,合并分类/解析,再删除
CREATE OR REPLACE FUNCTION public.merge_dup_questions(
  p_keep UUID, p_remove UUID, p_reason TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_subject   TEXT;
  v_moved_ua  INT := 0;
  v_moved_sub INT := 0;
  v_kcats     jsonb;
  v_rcats     jsonb;
  v_merged    jsonb;
  v_rkp       TEXT;
  v_rexp      TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_keep = p_remove THEN RAISE EXCEPTION 'keep 与 remove 不能相同'; END IF;

  SELECT COALESCE(k.subject, ''), COALESCE(k.categories, '[]'::jsonb),
         COALESCE(r.categories, '[]'::jsonb), r.key_points, r.answer_explanation
    INTO v_subject, v_kcats, v_rcats, v_rkp, v_rexp
    FROM public.questions k
    JOIN public.questions r ON r.id = p_remove
    WHERE k.id = p_keep;
  IF NOT FOUND THEN RAISE EXCEPTION '题目不存在: keep=% remove=%', p_keep, p_remove; END IF;

  -- 合并分类(保留 keep 原有顺序, 末尾追加 remove 独有分类)
  SELECT COALESCE(jsonb_agg(t.elem ORDER BY t.pos), '[]'::jsonb) INTO v_merged
  FROM (
    SELECT kk.elem, kk.pos
    FROM jsonb_array_elements_text(v_kcats) WITH ORDINALITY AS kk(elem, pos)
    UNION ALL
    SELECT rr.elem, 100000 + rr.pos
    FROM jsonb_array_elements_text(v_rcats) WITH ORDINALITY AS rr(elem, pos)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_kcats) x WHERE x = rr.elem)
  ) t;

  -- 合并期间暂停全量元数据重建触发器(结束后手动刷新一次),避免每步都全表重建
  ALTER TABLE public.questions DISABLE TRIGGER trg_question_meta_refresh;

  UPDATE public.questions qk
  SET categories = v_merged,
      key_points = COALESCE(NULLIF(qk.key_points, ''), v_rkp),
      answer_explanation = COALESCE(NULLIF(qk.answer_explanation, ''), v_rexp)
  WHERE qk.id = p_keep;

  UPDATE public.user_answers SET question_id = p_keep WHERE question_id = p_remove;
  GET DIAGNOSTICS v_moved_ua = ROW_COUNT;

  INSERT INTO public.favorites (user_id, question_id, created_at)
  SELECT user_id, p_keep, MIN(created_at) FROM public.favorites WHERE question_id = p_remove GROUP BY user_id
  ON CONFLICT (user_id, question_id) DO NOTHING;
  DELETE FROM public.favorites WHERE question_id = p_remove;

  INSERT INTO public.user_excluded_questions (user_id, question_id, created_at)
  SELECT user_id, p_keep, MIN(created_at) FROM public.user_excluded_questions WHERE question_id = p_remove GROUP BY user_id
  ON CONFLICT (user_id, question_id) DO NOTHING;
  DELETE FROM public.user_excluded_questions WHERE question_id = p_remove;

  INSERT INTO public.question_bank_items (bank_id, question_id, added_at)
  SELECT bank_id, p_keep, MIN(added_at) FROM public.question_bank_items WHERE question_id = p_remove GROUP BY bank_id
  ON CONFLICT (bank_id, question_id) DO NOTHING;
  DELETE FROM public.question_bank_items WHERE question_id = p_remove;

  UPDATE public.submissions SET question_id = p_keep WHERE question_id = p_remove;
  GET DIAGNOSTICS v_moved_sub = ROW_COUNT;

  -- 历史会话/顺序刷题里已记录的题目 id 一并重指(避免断链)
  UPDATE public.exam_sessions es
  SET question_ids = COALESCE((
    SELECT jsonb_agg(CASE WHEN v = p_remove::text THEN p_keep::text ELSE v END)
    FROM jsonb_array_elements_text(es.question_ids) v), '[]'::jsonb)
  WHERE es.question_ids ? p_remove::text;

  UPDATE public.practice_sequential_state ps
  SET question_ids = COALESCE((
    SELECT array_agg(CASE WHEN x = p_remove THEN p_keep ELSE x END)
    FROM unnest(ps.question_ids) x), '{}'::uuid[])
  WHERE p_remove = ANY(ps.question_ids);

  INSERT INTO public.question_merge_log (subject, kept_id, removed_id, reason, merged_categories, created_by)
  VALUES (v_subject, p_keep, p_remove, p_reason, v_merged, auth.uid());

  DELETE FROM public.questions WHERE id = p_remove;

  ALTER TABLE public.questions ENABLE TRIGGER trg_question_meta_refresh;
  PERFORM public.refresh_question_meta_cache();
  PERFORM public.refresh_kp_question_map();

  RETURN jsonb_build_object(
    'ok', true, 'kept', p_keep, 'removed', p_remove,
    'movedUserAnswers', v_moved_ua, 'movedSubmissions', v_moved_sub);
END
$$;

-- 20.12 组内一键合并: 保留 p_keep, 依次合并删除 p_removes 里的其余重复(单事务)
CREATE OR REPLACE FUNCTION public.merge_dup_group(
  p_keep UUID, p_removes UUID[], p_reason TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r       UUID;
  v_count INT := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOREACH r IN ARRAY COALESCE(p_removes, '{}'::uuid[]) LOOP
    IF r <> p_keep THEN
      PERFORM public.merge_dup_questions(p_keep, r, p_reason);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'kept', p_keep, 'merged', v_count);
END
$$;

-- 20.13 组内全部保留: 对组内任意两两组合记录 keep 复核(避免下次扫描再提示)
CREATE OR REPLACE FUNCTION public.keep_dup_group(
  p_ids UUID[], p_note TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  i INT; j INT; v_count INT := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids) < 2 THEN
    RETURN jsonb_build_object('ok', true, 'recorded', 0);
  END IF;
  FOR i IN 1 .. cardinality(p_ids) LOOP
    FOR j IN i + 1 .. cardinality(p_ids) LOOP
      PERFORM public.save_dup_review(p_ids[i], p_ids[j], 'keep', p_note);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'recorded', v_count);
END
$$;

REVOKE EXECUTE ON FUNCTION public.scan_question_duplicates(text, numeric, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_dup_review(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_dup_questions(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_dup_group(uuid, uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.keep_dup_group(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.scan_question_duplicates(text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_dup_review(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_dup_questions(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_dup_group(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.keep_dup_group(uuid[], text) TO authenticated;

-- ============================================================================
-- Section 21: 知识点解读 —— 管理员按 (学科, 知识点) 维护 Markdown 解读,
--   练习模式答完题目后可点击查看（顺序刷题答完当前知识点自动提示）。
--   用法与 subject_explanations 一致: 所有登录用户可读, 仅管理员可写。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kp_explanations (
  subject    TEXT NOT NULL,
  kp         TEXT NOT NULL,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subject, kp)
);
CREATE INDEX IF NOT EXISTS idx_kp_explanations_kp ON public.kp_explanations(kp);

ALTER TABLE public.kp_explanations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kp_explanations_select_all ON public.kp_explanations;
CREATE POLICY kp_explanations_select_all ON public.kp_explanations FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS kp_explanations_write_admin ON public.kp_explanations;
CREATE POLICY kp_explanations_write_admin ON public.kp_explanations FOR ALL
  USING (public.is_admin());

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
--   p_sections: [{ type: 题型|null(不限), count: 题数, categories?: 分区分类(空则回落整卷),
--                 subject?: 分区学科(null/缺省=继承整卷 p_subjects) }], 数组顺序即分区顺序
--   p_sample_mode: random 随机 / wrong_first 错题优先 / unseen_first 未做优先 / seq 真题原序
--   p_order_mode:  section 按分区顺序拼接 / shuffle 全卷打散
--   返回: { question_ids: [...], sections: [{ type, requested, got }] }
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
  v_sec_subjs TEXT[];
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

    -- 分区自带学科(可多选数组, 兼容旧版单字符串)时按该批学科抽题; 缺省回落整卷学科(p_subjects)
    v_sec_subjs := CASE
      WHEN jsonb_typeof(v_sec->'subject') = 'array' AND jsonb_array_length(v_sec->'subject') > 0
      THEN ARRAY(SELECT trim(x) FROM jsonb_array_elements_text(v_sec->'subject') AS x WHERE trim(x) <> '')
      WHEN jsonb_typeof(v_sec->'subject') = 'string' AND NULLIF(v_sec->>'subject', '') IS NOT NULL
      THEN ARRAY[v_sec->>'subject']
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
      WHERE (v_sec_subjs IS NOT NULL AND q.subject = ANY(v_sec_subjs)
             OR v_sec_subjs IS NULL
                AND (p_subjects IS NULL OR cardinality(p_subjects) = 0 OR q.subject = ANY(p_subjects)))
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

-- ============================================================================
-- Section 23: 考试模板封面(cover) —— 每张模板可选自带一张封面
--   结构: 密级条 / 居中标题组(考试名+科目+科目代码) / 考生注意事项标题 /
--         编号注意事项列表 / 信息表(考生编号+姓名 等填涂行) / 自定义附加块。
--   存储: JSONB; 内置预设不带 cover, 不存表里; 用户模板可空。
-- ============================================================================
ALTER TABLE public.exam_templates ADD COLUMN IF NOT EXISTS cover JSONB;

-- ============================================================================
-- Section 24: 考试模板排版 (layout) —— 控制整张卷子的纸张/边距/字号/分栏/
--   装订线/密封条/水印/页眉页脚/得分框/附加块。结构见 src/lib/paper-layout.ts。
--   与 cover 独立: cover 只管「封面写了什么」, layout 管「卷子长什么样」。
-- ============================================================================
ALTER TABLE public.exam_templates ADD COLUMN IF NOT EXISTS layout JSONB;

-- ============================================================================
-- Section 25: 考试模板继承 (parent_id) —— 新建模板时可选择一个父模板做「快照继承」,
--   父模板的 sections/cover/layout 会被复制进新模板, 保存后两者互不影响,
--   parent_id 仅用于展示来源 (列表里显示「继承自 XX」)。
--   不做外键: 父可能是内置预设(builtin:*) 或已被删除, 子模板不应因此失效。
-- ============================================================================
ALTER TABLE public.exam_templates ADD COLUMN IF NOT EXISTS parent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_exam_templates_parent ON public.exam_templates(user_id, parent_id);

-- ============================================================================
-- Section 26: 案例分析题 (case_analysis) —— 一条题目 = 一段共用案例材料 + 若干小题
--   材料存 question_text(题干), 小题列表存 case_questions JSONB:
--     [{ id, type, text, options, answer }]
--   小题允许类型: single_choice / multi_select / true_false / judge_correct /
--                 fill_blank / short_answer (可自动判分)
--   用户作答以复合结构存 user_answers.selected_answer:
--     { "subs": [{ "id": <小题id>, "value": <该小题作答> }] }
-- ============================================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS case_questions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('single_choice','multi_select','true_false','fill_blank','short_answer','analysis','judge_correct','coding','case_analysis'));

-- ============================================================================
-- Section 27: 整卷学科多选 —— exam_templates.subject TEXT → TEXT[]
--   模板「学科」从单选升级为多选: 旧记录(单值字符串)迁移为单元素数组。
--   null / 空数组 = 不限学科; 组卷 RPC compose_exam 的 p_subjects 本就接收 TEXT[],
--   前端写入数组后抽题逻辑无需改动。
-- ============================================================================
DROP INDEX IF EXISTS idx_exam_templates_subject;

ALTER TABLE public.exam_templates
  ALTER COLUMN subject TYPE TEXT[]
  USING CASE WHEN subject IS NULL OR subject = '' THEN NULL ELSE ARRAY[subject] END;

CREATE INDEX IF NOT EXISTS idx_exam_templates_subject ON public.exam_templates USING GIN (subject);

-- ============================================================================
-- Section 28: 预约考试 (exam_schedules) —— 周期定时考试
--   到点在周几(days_of_week, 0=周日..6=周六, 与 JS Date#getDay 一致)的
--   fire_time(当日分钟 0..1439) 触发一场考试。
--   组卷所需内容以「模板快照」整份存进 template JSONB(与 cover/layout 同级,
--   来自用户模板或内置预设)。存快照而非外键: 之后模板被改/删, 已预约的
--   周期考试仍按建约时的卷面配置开考, 语义与 exam_templates.parent_id 一致。
--   last_fire_date: 该预约最近一次"已开考"的业务日(YYYY-MM-DD, 客户端本地日期),
--   用于同一天内去重与「今日待考」判断; 错过到点后当天补开考会就地更新。
--   到点触发 = 前端定时器(应用打开期间, 弹窗+系统通知) + 服务端 cron(见 28.1
--   notify-exam Edge Function, 关屏/关浏览器也能推 Web Push)。tz: 建约时写入的
--   IANA 时区, 服务端按它换算到点时刻; last_notify_date: 最近一次已推送提醒的
--   业务日, 用于 cron 侧"每场每天只推一次"。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  days_of_week   SMALLINT[] NOT NULL DEFAULT ARRAY[6,0]::SMALLINT[],
  fire_time      SMALLINT NOT NULL DEFAULT 1200
                   CHECK (fire_time >= 0 AND fire_time < 1440),
  template       JSONB NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  last_fire_date DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_schedules_weekdays_valid
    CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]),
  CONSTRAINT exam_schedules_weekdays_nonempty
    CHECK (cardinality(days_of_week) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_user ON public.exam_schedules(user_id);

ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_schedules_own_rw ON public.exam_schedules;
CREATE POLICY exam_schedules_own_rw ON public.exam_schedules FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_exam_schedules_updated_at ON public.exam_schedules;
CREATE TRIGGER trg_exam_schedules_updated_at BEFORE UPDATE ON public.exam_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 28.1 预约考试 Web Push 支持
--   exam_schedules 增列: tz(IANA 时区, 服务端 cron 据此判断到点) /
--   last_notify_date(最近一次已推送提醒的业务日, 保证每场每天只推一次)。
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS tz TEXT NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS last_notify_date DATE;

-- push_subscriptions: 每个用户每台设备一条浏览器推送订阅(Web Push 协议三要素)。
--   由前端在用户授权通知后 upsert; notify-exam 函数向它推送并清理失效项。
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_own_rw ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own_rw ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- Section 29: 备考目标类型 (profiles.goal_type) —— 考研/考公/期末考等,首页仪表盘个性化
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS goal_type TEXT
  CHECK (goal_type IN ('kaoyan', 'gongkao', 'final', 'other') OR goal_type IS NULL);

COMMENT ON COLUMN public.profiles.goal_type IS 'kaoyan=考研,gongkao=考公,final=期末考,other=其他考试;NULL=未设定';


-- ============================================================================
-- Section 30: user_answers 考试作答自动保存唯一键 —— 修复「考试中刷新丢答题记录」
--   作答中每选一题 exam-store 都会 upsert(onConflict: user_id,question_id,exam_session_id);
--   缺该唯一索引时 upsert 恒报 21000,答案从未落库,刷新续考便读不到。
--   练习行 exam_session_id 为 NULL,PostgreSQL 唯一约束将 NULL 视作互异,不影响重复练习。
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_answers_session
  ON public.user_answers (user_id, question_id, exam_session_id);


-- ============================================================================
-- Section 31: exam_sessions.template —— 开考模板快照,修复「刷新后封面/工具栏模板名消失」
--   存 JSON 快照(name/cover/layout/sections),与模板本体解耦(后续改/删模板不影响本场)。
--   前端在列缺失时自动降级插入,故先部署代码后执行本迁移也不会开考失败。
-- ============================================================================
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS template JSONB;

COMMENT ON COLUMN public.exam_sessions.template IS '开考时模板快照(name/cover/layout/sections);刷新续考时还原卷首与工具栏名称,缺列时前端降级不落快照';


-- ============================================================================
-- Section 32: 本地判题来源 (submissions.judge_source) —— 自部署 Judge0 自测,不进入公共成绩
--   中心判题(平台 Judge0)落 'central' ;用户自部署本地判题落 'local'。
--   排行榜/竞赛/认证等公共可信成绩查询一律 WHERE judge_source='central' 过滤;
--   本地结果只服务个人历史与跨设备同步。默认 'central' 兼容老数据。
-- ============================================================================
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS judge_source TEXT DEFAULT 'central'
  CHECK (judge_source IN ('central', 'local'));

CREATE INDEX IF NOT EXISTS idx_submissions_source
  ON public.submissions(judge_source, created_at DESC);

COMMENT ON COLUMN public.submissions.judge_source IS 'central=平台中心判题(Judge0),local=用户本地自部署 Judge0 自测(不计入公共成绩)';


-- ============================================================================
-- Section 33: 测试题目 —— 编程题(stdio)OJ 判题示例:两数之和 Two Sum
--   由本地 Judge0 / 中心判题均可评测;stdin 读入,stdout 输出两个下标。
-- ============================================================================
INSERT INTO public.questions (
  question_type, question_text, options, correct_answer, category,
  categories, subject, analysis, key_points, answer_explanation,
  verified, import_mode, execution_mode, examples, test_cases, runtime_config
) VALUES (
  'coding',
  '## 两数之和(Two Sum)\n\n给定一个整数数组 `nums` 和目标值 `target`,请找出和为 `target` 的两个数的下标,并以空格分隔输出。\n\n- 输入(第一行两个整数 n target,第二行 n 个整数,空格分隔)\n- 输出:两个下标 i、j(0 起),满足 `nums[i] + nums[j] == target`,保证恰好存在一组解。\n\n### 输入\n```\n4 9\n2 7 11 15\n```\n\n### 输出\n```\n0 1\n```',
  '[]'::jsonb,
  '{"code":"","language":"python","allPassed":false}'::jsonb,
  '本地判题测试',
  '["本地判题测试","OJ示例"]'::jsonb,
  '算法',
  '用哈希表记录已遍历元素,一次遍历即可 O(n) 求解。',
  '哈希表,双指针',
  '建立「数值->下标」的哈希表;遍历每个 nums[i] 时查 target-nums[i] 是否已存在,存在则输出其下标与 i。',
  false,
  'manual',
  'stdio',
  '[
    {"input":"4 9\\n2 7 11 15","expected":"0 1","explanation":"nums[0]+nums[1]=2+7=9"},
    {"input":"3 6\\n3 2 4","expected":"1 2","explanation":"nums[1]+nums[2]=2+4=6"}
  ]'::jsonb,
  '[
    {"input":"4 9\\n2 7 11 15","expected":"0 1"},
    {"input":"3 6\\n3 2 4","expected":"1 2"},
    {"input":"2 0\\n0 0","expected":"0 1"},
    {"input":"5 10\\n1 5 3 7 2","expected":"2 3"},
    {"input":"6 20\\n2 4 6 8 10 12","expected":"3 5"}
  ]'::jsonb,
  '{"timeout_ms":1000,"memory_mb":128}'::jsonb
);

-- ============================================================================
-- Section 34: 自习室(study rooms)—— 邀请码制学习小组
--   邀请: 创建者把 6 位邀请码分享给好友, 对方凭码加入(join_study_room)。
--   打卡判定(完成当日计划目标)与提醒邮件在 Edge Function study-room 内计算,
--   这里只存房间/成员关系 + 防刷的提醒记录。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.study_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  invite_code  TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_rooms_owner ON public.study_rooms(owner_id);

CREATE TABLE IF NOT EXISTS public.study_room_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_srm_user ON public.study_room_members(user_id);

-- 提醒邮件流水: 只做频控(同人同房间 2 小时内不重复提醒), 仅服务端可写
CREATE TABLE IF NOT EXISTS public.study_room_reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srr_room_user_time
  ON public.study_room_reminders(room_id, user_id, reminded_at DESC);

-- RLS 辅助函数(绕过 RLS, 避免策略子查询互相递归)
CREATE OR REPLACE FUNCTION public.is_study_room_member(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.study_room_members
  WHERE room_id = p_room_id AND user_id = p_user_id
); $$;

CREATE OR REPLACE FUNCTION public.is_study_room_owner(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.study_rooms WHERE id = p_room_id AND owner_id = p_user_id
); $$;

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_reminders ENABLE ROW LEVEL SECURITY;

-- 房间: 房主/成员可读; 只有房主可改、删(创建只走 create_study_room)
DROP POLICY IF EXISTS study_rooms_select ON public.study_rooms;
CREATE POLICY study_rooms_select ON public.study_rooms FOR SELECT
  USING (owner_id = auth.uid() OR public.is_study_room_member(id, auth.uid()));

DROP POLICY IF EXISTS study_rooms_update ON public.study_rooms;
CREATE POLICY study_rooms_update ON public.study_rooms FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS study_rooms_delete ON public.study_rooms;
CREATE POLICY study_rooms_delete ON public.study_rooms FOR DELETE
  USING (owner_id = auth.uid());

-- 成员: 本人 + 同房成员可见; 本人可退房; 房主可移除成员
DROP POLICY IF EXISTS srm_select ON public.study_room_members;
CREATE POLICY srm_select ON public.study_room_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_study_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS srm_delete ON public.study_room_members;
CREATE POLICY srm_delete ON public.study_room_members FOR DELETE
  USING (user_id = auth.uid() OR public.is_study_room_owner(room_id, auth.uid()));

-- 创建自习室: 生成 6 位无歧义邀请码(去 0/O/1/I/L), 房主自动成为成员
CREATE OR REPLACE FUNCTION public.create_study_room(p_name TEXT, p_description TEXT DEFAULT '')
RETURNS TABLE(id UUID, owner_id UUID, name TEXT, description TEXT, invite_code TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code  TEXT := '';
  v_i     INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(btrim(p_name)) = 0 THEN RAISE EXCEPTION 'name_required'; END IF;
  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::INTEGER, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.study_rooms r WHERE r.invite_code = v_code);
  END LOOP;

  RETURN QUERY
    WITH ins AS (
      INSERT INTO public.study_rooms (owner_id, name, description, invite_code)
      VALUES (auth.uid(), btrim(p_name), coalesce(p_description, ''), v_code)
      RETURNING *
    )
    SELECT * FROM ins;

  INSERT INTO public.study_room_members (room_id, user_id)
  SELECT r.id, r.owner_id FROM public.study_rooms r WHERE r.invite_code = v_code;
END;
$$;

-- 凭邀请码加入自习室
CREATE OR REPLACE FUNCTION public.join_study_room(p_code TEXT)
RETURNS TABLE(id UUID, room_id UUID, user_id UUID, joined_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_room public.study_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_room FROM public.study_rooms WHERE invite_code = upper(btrim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF v_room.owner_id = auth.uid() THEN RAISE EXCEPTION 'already_member'; END IF;
  BEGIN
    INSERT INTO public.study_room_members (room_id, user_id) VALUES (v_room.id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_member';
  END;
  RETURN QUERY SELECT m.id, m.room_id, m.user_id, m.joined_at
    FROM public.study_room_members m
    WHERE m.room_id = v_room.id AND m.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_study_room(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_study_room(TEXT) TO authenticated;

-- ============================================================================
-- Section 35: 预约考试「定时邮件通知」
--   在 28.1 Web Push 之外新增邮件通道: 用户自选「发送日期(email_send_date)+
--   发送时刻(email_time)」, 到点后向用户注册邮箱发提醒。
--   email_send_date 为空时兼容旧行为(按每周重复日发); last_email_date 保证
--   每个业务日只发一次(由 notify-exam cron 维护)。
-- ============================================================================
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_time SMALLINT
    CHECK (email_time IS NULL OR (email_time >= 0 AND email_time < 1440));
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_send_date DATE;
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS last_email_date DATE;

-- ============================================================================
-- Section 36: 学习路线 (Learning Routes)
--   管理员把「知识点 / 题集」编排成带阶段顺序的学习路线; 用户沿路线自由刷题
--   (不做强制解锁), 每道题“通过” = user_answers 中存在一次答对, 路线/阶段
--   进度由客户端按 user_answers 现算, 无需额外用户进度表。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.learning_routes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  route_order  INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_routes_published ON public.learning_routes(route_order) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_learning_routes_created_by ON public.learning_routes(created_by);

CREATE TABLE IF NOT EXISTS public.learning_route_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    UUID NOT NULL REFERENCES public.learning_routes(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, position)
);
CREATE INDEX IF NOT EXISTS idx_learning_route_stages_route ON public.learning_route_stages(route_id, position);

CREATE TABLE IF NOT EXISTS public.learning_route_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id    UUID NOT NULL REFERENCES public.learning_route_stages(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, question_id),
  UNIQUE (stage_id, position)
);
CREATE INDEX IF NOT EXISTS idx_learning_route_questions_stage ON public.learning_route_questions(stage_id, position);

ALTER TABLE public.learning_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_route_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_route_questions ENABLE ROW LEVEL SECURITY;

-- 已发布路线对登录用户可见; 草稿/内容仅管理员可见可写。
DROP POLICY IF EXISTS lr_select ON public.learning_routes;
CREATE POLICY lr_select ON public.learning_routes FOR SELECT
  USING (auth.role() = 'authenticated' AND (is_published OR public.is_admin()));
DROP POLICY IF EXISTS lr_insert ON public.learning_routes;
CREATE POLICY lr_insert ON public.learning_routes FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS lr_update ON public.learning_routes;
CREATE POLICY lr_update ON public.learning_routes FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS lr_delete ON public.learning_routes;
CREATE POLICY lr_delete ON public.learning_routes FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS lrs_select ON public.learning_route_stages;
CREATE POLICY lrs_select ON public.learning_route_stages FOR SELECT
  USING (auth.role() = 'authenticated' AND (public.is_admin()
    OR EXISTS (SELECT 1 FROM public.learning_routes r WHERE r.id = route_id AND r.is_published)));
DROP POLICY IF EXISTS lrs_insert ON public.learning_route_stages;
CREATE POLICY lrs_insert ON public.learning_route_stages FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS lrs_update ON public.learning_route_stages;
CREATE POLICY lrs_update ON public.learning_route_stages FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS lrs_delete ON public.learning_route_stages;
CREATE POLICY lrs_delete ON public.learning_route_stages FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS lrq_select ON public.learning_route_questions;
CREATE POLICY lrq_select ON public.learning_route_questions FOR SELECT
  USING (auth.role() = 'authenticated' AND (public.is_admin()
    OR EXISTS (SELECT 1 FROM public.learning_route_stages s
               JOIN public.learning_routes r ON r.id = s.route_id
               WHERE s.id = stage_id AND r.is_published)));
DROP POLICY IF EXISTS lrq_insert ON public.learning_route_questions;
CREATE POLICY lrq_insert ON public.learning_route_questions FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS lrq_update ON public.learning_route_questions;
CREATE POLICY lrq_update ON public.learning_route_questions FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS lrq_delete ON public.learning_route_questions;
CREATE POLICY lrq_delete ON public.learning_route_questions FOR DELETE USING (public.is_admin());

-- ============================================================================
-- Section 37: 管理员用户列表 —— 邮箱是否已确认 (email confirmed flag)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_email_confirmed(user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = $1; $$;
REVOKE EXECUTE ON FUNCTION public.get_user_email_confirmed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_email_confirmed TO authenticated;

-- ============================================================================
-- Section 38: 学习路线 draw.io 路线图 (route diagram)
--   管理员用内嵌 draw.io 编辑器为路线画一张自由版式流程图, 以 mxGraph XML
--   存库; 为空时前台按阶段自动生成示意图。复用 lr_select/lr_update 策略,
--   无需新增 RLS。
-- ============================================================================
ALTER TABLE public.learning_routes
  ADD COLUMN IF NOT EXISTS diagram_xml TEXT;
-- ============================================================================
-- Section 39: 专注时长 (focus_sessions) —— 秒表/番茄钟记录, 后续统计数据源
--   一条记录 = 一次专注会话: started_at 开始, ended_at 结束(进行中为 NULL),
--   duration_sec 累计秒数(暂停不计时), mode 区分秒表(stopwatch)/番茄钟(pomodoro)。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'stopwatch' CHECK (mode IN ('stopwatch', 'pomodoro')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  duration_sec INTEGER NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_time
  ON public.focus_sessions(user_id, started_at DESC);

ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fs_select ON public.focus_sessions;
CREATE POLICY fs_select ON public.focus_sessions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS fs_insert ON public.focus_sessions;
CREATE POLICY fs_insert ON public.focus_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS fs_update ON public.focus_sessions;
CREATE POLICY fs_update ON public.focus_sessions FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS fs_delete ON public.focus_sessions;
CREATE POLICY fs_delete ON public.focus_sessions FOR DELETE USING (auth.uid() = user_id);


-- ============================================================================
-- Section 40: 计划批次 (plan rounds / plan goals)
--   profiles.plan_rounds = [{ id, subject, round, target, createdAt, doneAt }]
--     长期计划的一轮 = 该学科刷完一遍题, 一批的题量 = 该学科题量
--   profiles.plan_goals  = [{ id, subject, count, target, createdAt, doneAt }]
--     自定义计划的一批 = 该学科刷够 count 题(题数自己定)
--   两者是同一套模型, 只是"一批刷多少题"不同:
--     target    这批的计划完成日, 用户设定, 不超过长期计划 deadline
--     createdAt 创建这批的那天 —— 既是统计起点, 也是甘特图条形左端
--     doneAt    实际刷够的那天, 检测到跨过阈值后写入, 甘特图的旗子插在这天
--   一批只属于一个学科, 没有时间窗, 也不要求相邻批次首尾相接。
--   注意: 只看作答历史, 不受"重置进度"(plan_reset_at/subject_reset_at)影响,
--   否则重置一次就会抹掉已经插上的旗子。
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_rounds JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_goals JSONB DEFAULT '[]'::jsonb;

-- 旧的时间窗里程碑 / 每日定额已废弃(客户端首次加载时一次性搬成上面两列), 列保留仅作历史
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.get_milestone_progress(UUID, JSONB);
DROP FUNCTION IF EXISTS public.get_plan_round_stats(UUID, JSONB);

-- 只有"顺序学习"模式的作答推进批次; 复习(自由随机刷)、考试都不计入。
-- 老数据没有 source, 按顺序学习算 —— 否则历史批次会凭空消失。
ALTER TABLE public.user_answers
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE OR REPLACE FUNCTION public.get_plan_stats(
  p_user_id UUID,
  -- { "学科": { "since": "YYYY-MM-DD", "size": 128, "steps": [128, 50] } }
  --   since 统计起点(该科第一批的创建日); size/steps 都不给 = 每批一科题量(长期计划的轮次)
  --   steps 给的是每批题数, 内部累加成阈值(自定义计划的批次可以每批题数不同)
  p_plan    JSONB
)
RETURNS TABLE(subject TEXT, total BIGINT, attempts BIGINT, done_dates JSONB)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT e.key AS subject,
           (e.value->>'since')::DATE              AS since,
           NULLIF(e.value->>'size', '')::BIGINT   AS size,
           COALESCE(e.value->'steps', '[]'::jsonb) AS steps
    FROM jsonb_each(COALESCE(p_plan, '{}'::jsonb)) AS e
  ),
  tot AS (
    SELECT b.subject, b.since, b.size, b.steps, COUNT(q.id)::BIGINT AS total
    FROM base b
    LEFT JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    GROUP BY b.subject, b.since, b.size, b.steps
  ),
  att AS (
    SELECT t.id, t.subject, t.answered_at,
           ROW_NUMBER() OVER (PARTITION BY t.subject ORDER BY t.answered_at, t.id) AS rn
    FROM (
      SELECT ua.id, ua.answered_at, q.subject
      FROM public.user_answers ua
      JOIN public.questions q ON q.id = ua.question_id
      JOIN base b ON b.subject = q.subject
      WHERE ua.user_id = p_user_id
        AND ua.mode = 'practice'
        AND ua.source IS DISTINCT FROM 'random'
        -- 起点按北京时间当天 00:00 算(与客户端"今日"的 UTC 16:00 口径一致)
        AND ua.answered_at >= (b.since::text || ' 00:00:00+08')::TIMESTAMPTZ
        AND q.key_points IS NOT NULL AND q.key_points <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.user_excluded_questions ueq
          WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
        )
    ) t
  ),
  -- 第 k 批刷够的时刻 = 起点以来第 (前 k 批题数之和) 次作答
  mark AS (
    SELECT b.subject, SUM(s.v) OVER (PARTITION BY b.subject ORDER BY s.ord) AS rn
    FROM tot b
    CROSS JOIN LATERAL (
      SELECT (x.value)::BIGINT AS v, x.ord
      FROM jsonb_array_elements_text(b.steps) WITH ORDINALITY AS x(value, ord)
    ) s
    UNION ALL
    -- 没给每批题数: 按 size(缺省 = 整科题量)的整数倍算
    SELECT a.subject, a.rn
    FROM att a
    JOIN tot b ON b.subject = a.subject
    WHERE jsonb_array_length(b.steps) = 0
      AND COALESCE(b.size, b.total) > 0
      AND a.rn % COALESCE(b.size, b.total) = 0
  )
  SELECT
    tot.subject,
    tot.total,
    COALESCE(cnt.attempts, 0) AS attempts,
    COALESCE(dd.dates, '[]'::jsonb) AS done_dates
  FROM tot
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS attempts
    FROM att WHERE att.subject = tot.subject
  ) cnt ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             to_char((a.answered_at AT TIME ZONE 'Asia/Shanghai')::DATE, 'YYYY-MM-DD')
             ORDER BY a.rn
           ) AS dates
    FROM att a
    JOIN mark m ON m.subject = a.subject AND m.rn = a.rn
    WHERE a.subject = tot.subject
  ) dd ON TRUE
  ORDER BY tot.subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_plan_stats(UUID, JSONB) TO authenticated;

-- ============================================================================
-- Section 41: 用户头像 (profiles.avatar_url / profiles.avatar_preset)
--   avatar_url    显式选定的头像地址 —— 绑定 GitHub 的账号在登录时自动写入 GitHub 头像
--   avatar_preset 显式选定的"生成头像", 格式 <样式>:<配色索引>:<种子>, 如 aurora:3:12345;
--                 客户端据此本地画 SVG(data URI), 不占存储也不依赖外部图片服务
--   两列都为空 = 没选过: 已绑定 GitHub 用 GitHub 头像, 否则按用户 ID 生成一张固定的
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_preset TEXT;

COMMENT ON COLUMN public.profiles.avatar_preset IS
  '生成的预设头像, 格式 <样式>:<配色索引>:<种子>, 如 aurora:3:12345; NULL=未显式选择';

-- 公开笔记/自习室要显示他人的昵称与头像, 但 profiles 的 RLS 只放行本人和管理员
CREATE OR REPLACE FUNCTION public.get_profile_cards(user_ids UUID[])
RETURNS TABLE(id UUID, nickname TEXT, avatar_url TEXT, avatar_preset TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, p.nickname, p.avatar_url, p.avatar_preset
  FROM public.profiles p WHERE p.id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_cards(UUID[]) TO authenticated;

-- ============================================================================
-- Section 42: 自习室公开资料 (profiles.target_school / exam_status / profile_visibility)
--   自习室成员自己决定公开哪些备考资料:
--     profile_visibility 形如 {"goal_type":true,"exam_status":true,"target_school":false}
--     缺键或 false = 不公开; 未公开的字段在 get_public_profiles 里直接回 NULL,
--     客户端根本拿不到值, 不靠前端隐藏。
--   昵称与头像不在开关范围内: 自习室/公开笔记靠它们认人。
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS target_school TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exam_status TEXT
  CHECK (exam_status IN ('school', 'full', 'working', 'repeat', 'done') OR exam_status IS NULL);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.target_school IS '目标院校, 自由文本; NULL=未填写';
COMMENT ON COLUMN public.profiles.exam_status IS
  '备考状态: school=在校备考,full=全职备考,working=在职备考,repeat=二战及以后,done=已上岸; NULL=未填写';
COMMENT ON COLUMN public.profiles.profile_visibility IS
  '公开开关 {goal_type,exam_status,target_school}; 缺键或 false=不公开';

-- 自习室按成员的公开设置取资料; 未公开的字段一律回 NULL
CREATE OR REPLACE FUNCTION public.get_public_profiles(user_ids UUID[])
RETURNS TABLE(
  id UUID,
  nickname TEXT,
  avatar_url TEXT,
  avatar_preset TEXT,
  goal_type TEXT,
  exam_status TEXT,
  target_school TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    p.id,
    p.nickname,
    p.avatar_url,
    p.avatar_preset,
    CASE WHEN p.profile_visibility -> 'goal_type' = 'true'::jsonb THEN p.goal_type END,
    CASE WHEN p.profile_visibility -> 'exam_status' = 'true'::jsonb THEN p.exam_status END,
    CASE WHEN p.profile_visibility -> 'target_school' = 'true'::jsonb THEN p.target_school END
  FROM public.profiles p
  WHERE p.id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated;

-- ============================================================================
-- 29. USER PROMPTS — 用户提示词(覆盖内置默认 / 自建提示词)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_key  TEXT NOT NULL,
  title       TEXT,
  body        TEXT NOT NULL,
  variables   TEXT[] NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS idx_user_prompts_user     ON public.user_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prompts_user_key ON public.user_prompts(user_id, prompt_key);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.user_prompts;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.user_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_prompts_own ON public.user_prompts;
CREATE POLICY user_prompts_own ON public.user_prompts FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 30. USER PLUGINS — 插件开关与配置(每个用户一份,插件定义在代码里)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_plugins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plugin_id   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS idx_user_plugins_user ON public.user_plugins(user_id);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.user_plugins;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.user_plugins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_plugins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_plugins_own ON public.user_plugins;
CREATE POLICY user_plugins_own ON public.user_plugins FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- Section 44: 复习题量(错题 ∪ 收藏, 按题目去重) —— "今日任务"要把这部分也算进去
--   一道题既错过又收藏了只算一次; 排除"太简单"题; 可按学科过滤(计划范围内)。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_review_count(
  p_user_id  UUID,
  p_subjects TEXT[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COUNT(*)::BIGINT
  FROM (
    SELECT ua.question_id
    FROM public.user_answers ua
    JOIN public.questions q ON q.id = ua.question_id
    WHERE ua.user_id = p_user_id
      AND NOT ua.is_correct
      AND (p_subjects IS NULL OR q.subject = ANY(p_subjects))
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ue
        WHERE ue.question_id = ua.question_id AND ue.user_id = p_user_id
      )
    UNION  -- UNION 自带去重: 同一题既错过又收藏只算一次
    SELECT f.question_id
    FROM public.favorites f
    JOIN public.questions q ON q.id = f.question_id
    WHERE f.user_id = p_user_id
      AND (p_subjects IS NULL OR q.subject = ANY(p_subjects))
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ue
        WHERE ue.question_id = f.question_id AND ue.user_id = p_user_id
      )
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_review_count(UUID, TEXT[]) TO authenticated;

-- ============================================================================
-- Section 45: 复习池按"轮次时间窗"统计 —— 复习模式自己选学科+轮次, 单独算
--   p_windows = [{ "subject":"医学史", "since":"2026-09-14", "until":"2026-09-30" }]
--   since/until 都按北京时间当天 00:00 起算; until 为空 = 至今。
--   池子 = 窗口内答错的题 ∪ 窗口内收藏的题, 按题目去重。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_review_pool_count(
  p_user_id UUID,
  p_windows JSONB
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH win AS (
    SELECT (e.value->>'subject')                AS subject,
           (e.value->>'since')::DATE            AS since,
           NULLIF(e.value->>'until', '')::DATE  AS until
    FROM jsonb_array_elements(COALESCE(p_windows, '[]'::jsonb)) AS e(value)
    WHERE COALESCE(e.value->>'subject', '') <> ''
      AND COALESCE(e.value->>'since', '') <> ''
  )
  SELECT COUNT(*)::BIGINT
  FROM (
    SELECT ua.question_id
    FROM public.user_answers ua
    JOIN public.questions q ON q.id = ua.question_id
    JOIN win w ON w.subject = q.subject
    WHERE ua.user_id = p_user_id
      AND NOT ua.is_correct
      AND ua.answered_at >= (w.since::text || ' 00:00:00+08')::TIMESTAMPTZ
      AND (w.until IS NULL OR ua.answered_at < ((w.until + 1)::text || ' 00:00:00+08')::TIMESTAMPTZ)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ue
        WHERE ue.question_id = ua.question_id AND ue.user_id = p_user_id
      )
    UNION  -- 去重
    SELECT f.question_id
    FROM public.favorites f
    JOIN public.questions q ON q.id = f.question_id
    JOIN win w ON w.subject = q.subject
    WHERE f.user_id = p_user_id
      AND f.created_at >= (w.since::text || ' 00:00:00+08')::TIMESTAMPTZ
      AND (w.until IS NULL OR f.created_at < ((w.until + 1)::text || ' 00:00:00+08')::TIMESTAMPTZ)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ue
        WHERE ue.question_id = f.question_id AND ue.user_id = p_user_id
      )
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_review_pool_count(UUID, JSONB) TO authenticated;

-- ============================================================================
-- Section 46: 轮次的"一遍"以当前顺序刷题会话为准
--   轮次 = 某学科刷完一遍。这一遍到底有多少题, 原来按"整科题量"算, 和用户实际
--   在刷的那条会话队列对不上: 会话是按认领的知识点组出来的(还可能少几道没有
--   知识点的题), 题量比整科少, 于是轮次永远卡在 60/100 这类进度上, 也不会
--   在被判"刷完"的时机落完成日。
--   现在改成: 该科这一轮的题量 = 当前会话队列里属于该科的题数, 作答也只数
--   会话里那几道题。"当前会话" = 该用户最近更新的一条 practice_sequential_state
--   (练习页每次作答/翻页都会更新它)。没有会话时(计划刚建、会话被删)退回整科
--   口径, 与旧行为一致。
--   自定义计划的批次(steps 非空)题量由用户自己定, 不跟会话走, 沿用旧口径。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_plan_stats(
  p_user_id UUID,
  -- { "学科": { "since": "YYYY-MM-DD", "size": 128, "steps": [128, 50] } }
  --   since 统计起点(该科第一批的创建日); size/steps 都不给 = 每批一科一遍(长期计划的轮次, 跟会话走)
  --   steps 给的是每批题数, 内部累加成阈值(自定义计划的批次可以每批题数不同)
  p_plan    JSONB
)
RETURNS TABLE(subject TEXT, total BIGINT, attempts BIGINT, done_dates JSONB)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT e.key AS subject,
           (e.value->>'since')::DATE              AS since,
           NULLIF(e.value->>'size', '')::BIGINT   AS size,
           COALESCE(e.value->'steps', '[]'::jsonb) AS steps
    FROM jsonb_each(COALESCE(p_plan, '{}'::jsonb)) AS e
  ),
  -- 当前顺序刷题会话的题目队列; 没有会话时下面退回整科口径
  sess AS (
    SELECT s.question_ids
    FROM public.practice_sequential_state s
    WHERE s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT 1
  ),
  -- 每个学科"这一遍要刷的题": 自定义批次不跟会话走; 有会话就只看会话里的题
  scope AS (
    SELECT q.id, q.subject, b.since, b.size, b.steps
    FROM base b
    JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) > 0
       OR (SELECT question_ids FROM sess) IS NULL
       OR q.id = ANY(COALESCE((SELECT question_ids FROM sess), '{}'::UUID[]))
  ),
  tot AS (
    SELECT sc.subject, sc.since, sc.size, sc.steps, COUNT(sc.id)::BIGINT AS total
    FROM scope sc
    GROUP BY sc.subject, sc.since, sc.size, sc.steps
  ),
  att AS (
    SELECT t.id, t.subject, t.answered_at,
           ROW_NUMBER() OVER (PARTITION BY t.subject ORDER BY t.answered_at, t.id) AS rn
    FROM (
      SELECT ua.id, ua.answered_at, sc.subject
      FROM public.user_answers ua
      JOIN scope sc ON sc.id = ua.question_id
      WHERE ua.user_id = p_user_id
        AND ua.mode = 'practice'
        AND ua.source IS DISTINCT FROM 'random'
        -- 起点按北京时间当天 00:00 算(与客户端"今日"的 UTC 16:00 口径一致)
        AND ua.answered_at >= (sc.since::text || ' 00:00:00+08')::TIMESTAMPTZ
    ) t
  ),
  -- 第 k 批刷够的时刻 = 起点以来第 (前 k 批题数之和) 次作答
  mark AS (
    SELECT b.subject, SUM(s.v) OVER (PARTITION BY b.subject ORDER BY s.ord) AS rn
    FROM tot b
    CROSS JOIN LATERAL (
      SELECT (x.value)::BIGINT AS v, x.ord
      FROM jsonb_array_elements_text(b.steps) WITH ORDINALITY AS x(value, ord)
    ) s
    UNION ALL
    -- 没给每批题数: 按 size(缺省 = 这一遍的题量)的整数倍算
    SELECT a.subject, a.rn
    FROM att a
    JOIN tot b ON b.subject = a.subject
    WHERE jsonb_array_length(b.steps) = 0
      AND COALESCE(b.size, b.total) > 0
      AND a.rn % COALESCE(b.size, b.total) = 0
  )
  SELECT
    tot.subject,
    tot.total,
    COALESCE(cnt.attempts, 0) AS attempts,
    COALESCE(dd.dates, '[]'::jsonb) AS done_dates
  FROM tot
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS attempts
    FROM att WHERE att.subject = tot.subject
  ) cnt ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             to_char((a.answered_at AT TIME ZONE 'Asia/Shanghai')::DATE, 'YYYY-MM-DD')
             ORDER BY a.rn
           ) AS dates
    FROM att a
    JOIN mark m ON m.subject = a.subject AND m.rn = a.rn
    WHERE a.subject = tot.subject
  ) dd ON TRUE
  ORDER BY tot.subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_plan_stats(UUID, JSONB) TO authenticated;

-- ============================================================================
-- Section 47: 轮次的进度 = 会话"这一遍"的进度(覆盖 Section 46 里的同一个函数)
--   轮次 = 某学科刷完一遍。原来这一遍是按"自该轮创建日起的作答次数"累计推的:
--   排期里第 1 轮显示 6/580, 练习页这一遍却早答了 301/580 —— 两个数字对不上,
--   新建一轮更是把整科题量当成新账重记一遍(0/580)。
--   现在跟练习页同一个口径:
--     total      = 会话队列里属于该科的题数(Section 46 的口径)
--     attempts   = 这一遍做过的题数(按题去重; 练习、复习、考试做过的都算做过 ——
--                  练习页那份"本次会话已作答"就是这么数的, 两边必须是同一个数)
--     done_dates = 这一遍把该科所有题都过了一遍的那一刻(最多一条; 没刷满就是空)
--   "这一遍"的起点由客户端算好放在 since 里: 该科上一个已完成轮次实际刷完的那天(按当天零点),
--   和学科重置日 / 计划重置日 —— 和练习页判断"本次会话已作答"的规则完全一致, 取晚的那个;
--   都没有 = 不限起点。since 可以是 ISO 时刻(重置)也可以是 YYYY-MM-DD(按当天 00:00 北京)。
--   配套改动: PlanWatcher 只把 done_dates[0] 记到"第一个还没完成的轮次"上, 不再按
--   累计阈值凭空补轮次; 客户端算 since 的地方见 roundPlanSpec。
--   自定义计划的批次(steps 非空)口径不变: 题量自己定, 进度数作答次数。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_plan_stats(
  p_user_id UUID,
  -- { "学科": { "since": "2026-08-14T11:36:50.375Z", "size": 128, "steps": [128, 50] } }
  --   since 这一遍的起点(可空 = 不限); size/steps 都不给 = 长期计划的轮次(跟会话走)
  --   steps 给的是每批题数, 内部累加成阈值(自定义计划的批次可以每批题数不同)
  p_plan    JSONB
)
RETURNS TABLE(subject TEXT, total BIGINT, attempts BIGINT, done_dates JSONB)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT e.key AS subject,
           -- 起点: ISO 时刻(重置) 或 日期(按当天 00:00 北京)
           CASE
             WHEN COALESCE(e.value->>'since', '') = '' THEN NULL
             WHEN (e.value->>'since') ~ '^\d{4}-\d{2}-\d{2}$'
               THEN ((e.value->>'since') || ' 00:00:00+08')::TIMESTAMPTZ
             ELSE (e.value->>'since')::TIMESTAMPTZ
           END                                     AS since,
           NULLIF(e.value->>'size', '')::BIGINT    AS size,
           COALESCE(e.value->'steps', '[]'::jsonb) AS steps
    FROM jsonb_each(COALESCE(p_plan, '{}'::jsonb)) AS e
  ),
  -- 当前顺序刷题会话的题目队列; 没有会话时下面退回整科口径
  sess AS (
    SELECT s.question_ids
    FROM public.practice_sequential_state s
    WHERE s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT 1
  ),
  -- 每个学科"这一遍要刷的题": 自定义批次不跟会话走; 有会话就只看会话里的题
  scope AS (
    SELECT q.id, q.subject, b.since, b.size, b.steps
    FROM base b
    JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) > 0
       OR (SELECT question_ids FROM sess) IS NULL
       OR q.id = ANY(COALESCE((SELECT question_ids FROM sess), '{}'::UUID[]))
  ),
  tot AS (
    SELECT sc.subject, sc.since, sc.size, sc.steps, COUNT(sc.id)::BIGINT AS total
    FROM scope sc
    GROUP BY sc.subject, sc.since, sc.size, sc.steps
  ),
  -- 这一遍的作答: 不限模式、不限来源 —— 和练习页"本次会话已作答"同一个口径;
  -- 复习刷到的、考试里做过的, 都算"这题这一遍过了一遍"
  answered AS (
    SELECT sc.subject, ua.question_id, ua.id AS answer_id, ua.answered_at, ua.mode, ua.source
    FROM scope sc
    JOIN public.user_answers ua ON ua.question_id = sc.id
    WHERE ua.user_id = p_user_id
      AND (sc.since IS NULL OR ua.answered_at >= sc.since)
  ),
  -- 轮次: 同一题在这一遍里重复刷只算一道, 取最早那次
  q_once AS (
    SELECT a.subject, a.question_id, MIN(a.answered_at) AS answered_at
    FROM answered a
    GROUP BY a.subject, a.question_id
  ),
  q_rank AS (
    SELECT q.subject, q.question_id, q.answered_at,
           ROW_NUMBER() OVER (PARTITION BY q.subject ORDER BY q.answered_at, q.question_id) AS rn
    FROM q_once q
  ),
  -- 自定义批次: 题量是自己定的, 只认练习作答(考试不算), 仍然数作答次数
  evt AS (
    SELECT a.subject, a.answered_at,
           ROW_NUMBER() OVER (PARTITION BY a.subject ORDER BY a.answered_at, a.answer_id) AS rn
    FROM answered a
    WHERE a.mode = 'practice' AND a.source IS DISTINCT FROM 'random'
  ),
  -- 批次完成时刻 = 起点以来第 (前 k 批题数之和) 次作答
  mark_goal AS (
    SELECT b.subject, SUM(x.v) OVER (PARTITION BY b.subject ORDER BY x.ord) AS rn
    FROM tot b
    CROSS JOIN LATERAL (
      SELECT (v.value)::BIGINT AS v, v.ord
      FROM jsonb_array_elements_text(b.steps) WITH ORDINALITY AS v(value, ord)
    ) x
  ),
  -- 一轮完成时刻 = 这一遍把该科的题都答过的那一刻(最多一条)
  mark_round AS (
    SELECT d.subject, d.rn, d.answered_at
    FROM q_rank d
    JOIN tot b ON b.subject = d.subject
    WHERE jsonb_array_length(b.steps) = 0
      AND COALESCE(b.size, b.total) > 0
      AND d.rn = COALESCE(b.size, b.total)
  ),
  dated AS (
    SELECT g.subject, e.answered_at
    FROM mark_goal g
    JOIN evt e ON e.subject = g.subject AND e.rn = g.rn
    UNION ALL
    SELECT r.subject, r.answered_at FROM mark_round r
  )
  SELECT
    tot.subject,
    tot.total,
    CASE WHEN jsonb_array_length(tot.steps) > 0
      THEN COALESCE((SELECT COUNT(*) FROM evt e WHERE e.subject = tot.subject), 0)
      ELSE LEAST(COALESCE((SELECT COUNT(*) FROM q_once q WHERE q.subject = tot.subject), 0), tot.total)
    END AS attempts,
    COALESCE((
      SELECT jsonb_agg(
               to_char((d.answered_at AT TIME ZONE 'Asia/Shanghai')::DATE, 'YYYY-MM-DD')
               ORDER BY d.answered_at
             )
      FROM dated d WHERE d.subject = tot.subject
    ), '[]'::jsonb) AS done_dates
  FROM tot
  ORDER BY tot.subject;
$$;
GRANT EXECUTE ON FUNCTION public.get_plan_stats(UUID, JSONB) TO authenticated;

-- ============================================================================
-- Section 48: 路线节点样式与手动拖拽坐标 (learning route node style)
--   管理端把阶段 / 阶段内的题渲染成可拖拽画布, 每个节点可以单独存样式:
--     accent   —— 强调色 (amber / emerald / sky / violet / rose / slate)
--     size     —— 节点尺寸 (sm / md / lg)
--     emphasis —— 是否高亮该节点
--     x / y    —— 手动拖拽后的画布坐标(缺省 = 跟随客户端自动布局)
--   样式以 jsonb 挂在节点自己那一行上: 阶段 = learning_route_stages.node_style,
--   阶段内的题 = learning_route_questions.node_style。默认 '{}' 表示没改过样式,
--   前台照旧按自动布局画。复用 Section 36 的 lrs_/lrq_ 策略, 无需新增 RLS。
-- ============================================================================
alter table public.learning_route_stages
  add column if not exists node_style jsonb not null default '{}'::jsonb;

alter table public.learning_route_questions
  add column if not exists node_style jsonb not null default '{}'::jsonb;

-- ============================================================================
-- Section 49: 资料库 (resource library) —— 管理员录入原始文献, MinerU 解析产物存 R2
--   resource_documents —— 文献元数据 + R2 上的 PDF / 预渲染页图地址 + full.md 正文
--   resource_blocks    —— MinerU layout.json 扁平化后的区块, 带页码与 bbox
--     区块表是 PDF ↔ Markdown 双向定位的唯一锚点: Markdown 上显示的一段 = 表里的一行,
--     PDF 上高亮那个框 = 同一行的 bbox。它同时是检索的最小单元。
--   检索用 pg_trgm 而不是分词器: 中文没有空格, 子串匹配本来就是对的模型。
--   但 pg_trgm 对 2 字词(「死锁」「调度」)生成不出内部 trigram, GIN 索引根本用不上,
--   所以另存一份"逐字加空格"的 search_text 并只对它建索引:
--     text = '进程调度'  →  search_text = '进 程 调 度 '
--   查询侧做同样变换后按 '%调 度 %' 匹配, 2 字词也能走索引, 语义与原字串匹配完全一致。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.resource_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  authors         TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT '',
  pub_year        INTEGER,
  doc_type        TEXT NOT NULL DEFAULT '论文',
  subject         TEXT NOT NULL DEFAULT '',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  abstract        TEXT NOT NULL DEFAULT '',
  doi             TEXT NOT NULL DEFAULT '',
  language        TEXT NOT NULL DEFAULT 'ch',
  pdf_url         TEXT NOT NULL DEFAULT '',
  pdf_key         TEXT NOT NULL DEFAULT '',
  pdf_total_pages INTEGER,
  pdf_page_urls   TEXT,
  markdown        TEXT NOT NULL DEFAULT '',
  parse_mode      TEXT NOT NULL DEFAULT 'precision',
  parse_status    TEXT NOT NULL DEFAULT 'pending',
  parse_error     TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT true,
  uploaded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 生成列只能调用 immutable 函数, 而拼 tags 要用的 array_to_string / anyarray::text 都是
-- STABLE, 所以这一份改用触发器维护(区块表只有 lower + regexp_replace, 用生成列即可)。
ALTER TABLE public.resource_documents ADD COLUMN IF NOT EXISTS search_text TEXT;

CREATE OR REPLACE FUNCTION public.resource_documents_sync_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text := regexp_replace(
    lower(NEW.title || ' ' || NEW.authors || ' ' || NEW.source || ' ' || NEW.subject || ' '
          || NEW.doc_type || ' ' || NEW.doi || ' ' || coalesce(array_to_string(NEW.tags, ' '), '')
          || ' ' || NEW.abstract),
    '(.)', '\1 ', 'g');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rd_search_text ON public.resource_documents;
CREATE TRIGGER trg_rd_search_text
  BEFORE INSERT OR UPDATE ON public.resource_documents
  FOR EACH ROW EXECUTE FUNCTION public.resource_documents_sync_search_text();

CREATE TABLE IF NOT EXISTS public.resource_blocks (
  id            BIGSERIAL PRIMARY KEY,
  document_id   UUID NOT NULL REFERENCES public.resource_documents(id) ON DELETE CASCADE,
  block_index   INTEGER NOT NULL,
  page_no       INTEGER NOT NULL,
  bbox          REAL[],
  block_type    TEXT NOT NULL DEFAULT 'text',
  heading_level SMALLINT NOT NULL DEFAULT 0,
  text          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resource_blocks
  ADD COLUMN IF NOT EXISTS search_text TEXT GENERATED ALWAYS AS (
    regexp_replace(lower(text), '(.)', '\1 ', 'g')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_rd_created      ON public.resource_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rd_subject      ON public.resource_documents(subject) WHERE subject <> '';
CREATE INDEX IF NOT EXISTS idx_rd_tags         ON public.resource_documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_rd_search_trgm  ON public.resource_documents USING GIN (search_text gin_trgm_ops);
-- (document_id, block_index) 既是定位锚点也是目录查询路径: 唯一索引顺带做约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_rb_doc_index ON public.resource_blocks(document_id, block_index);
CREATE INDEX IF NOT EXISTS idx_rb_search_trgm  ON public.resource_blocks USING GIN (search_text gin_trgm_ops);

ALTER TABLE public.resource_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_blocks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rd_select ON public.resource_documents;
CREATE POLICY rd_select ON public.resource_documents FOR SELECT
  USING (auth.role() = 'authenticated' AND (is_published OR public.is_admin()));
DROP POLICY IF EXISTS rd_insert ON public.resource_documents;
CREATE POLICY rd_insert ON public.resource_documents FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS rd_update ON public.resource_documents;
CREATE POLICY rd_update ON public.resource_documents FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS rd_delete ON public.resource_documents;
CREATE POLICY rd_delete ON public.resource_documents FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS rb_select ON public.resource_blocks;
CREATE POLICY rb_select ON public.resource_blocks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.resource_documents d
                 WHERE d.id = document_id AND (d.is_published OR public.is_admin())));
DROP POLICY IF EXISTS rb_insert ON public.resource_blocks;
CREATE POLICY rb_insert ON public.resource_blocks FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS rb_update ON public.resource_blocks;
CREATE POLICY rb_update ON public.resource_blocks FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS rb_delete ON public.resource_blocks;
CREATE POLICY rb_delete ON public.resource_blocks FOR DELETE USING (public.is_admin());

-- 区块检索: 知识点 / 关键字命中后要能直接落到 PDF 页 + 区块。
-- p_document_id 为 NULL 时全库检索, 否则限定单篇(阅读页内的检索)。
DROP FUNCTION IF EXISTS public.search_resource_blocks(TEXT, UUID, TEXT, TEXT, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.search_resource_blocks(
  p_query       TEXT,
  p_document_id UUID    DEFAULT NULL,
  p_subject     TEXT    DEFAULT NULL,
  p_doc_type    TEXT    DEFAULT NULL,
  p_tag         TEXT    DEFAULT NULL,
  p_limit       INTEGER DEFAULT 50
) RETURNS TABLE (
  document_id   UUID,
  doc_title     TEXT,
  page_no       INTEGER,
  block_index   INTEGER,
  bbox          REAL[],
  block_type    TEXT,
  heading_level SMALLINT,
  snippet       TEXT,
  score         REAL,
  total_hits    BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q      TEXT := btrim(coalesce(p_query, ''));
  padded TEXT;
BEGIN
  IF q = '' THEN RETURN; END IF;
  padded := regexp_replace(q, '(.)', '\1 ', 'g');

  RETURN QUERY
  WITH hit AS (
    SELECT b.document_id AS doc_id,
           d.title       AS d_title,
           b.page_no     AS p_no,
           b.block_index AS b_idx,
           b.bbox        AS b_box,
           b.block_type  AS b_type,
           b.heading_level AS b_level,
           b.text        AS b_text,
           (CASE WHEN b.heading_level > 0 THEN 2.0 ELSE 0.0 END
            + CASE WHEN d.title ILIKE '%' || q || '%' THEN 1.5 ELSE 0.0 END
            + CASE WHEN b.text ILIKE q || '%' THEN 0.5 ELSE 0.0 END)::REAL AS sc
    FROM public.resource_blocks b
    JOIN public.resource_documents d ON d.id = b.document_id
    WHERE b.search_text ILIKE '%' || padded || '%'
      AND (p_document_id IS NULL OR b.document_id = p_document_id)
      AND (p_subject     IS NULL OR d.subject  = p_subject)
      AND (p_doc_type    IS NULL OR d.doc_type = p_doc_type)
      AND (p_tag         IS NULL OR p_tag = ANY(d.tags))
  )
  SELECT h.doc_id, h.d_title, h.p_no, h.b_idx, h.b_box, h.b_type, h.b_level,
         substring(h.b_text FROM greatest(1, strpos(lower(h.b_text), lower(q)) - 40) FOR 160),
         h.sc,
         count(*) OVER ()
  FROM hit h
  ORDER BY h.sc DESC, h.d_title, h.p_no, h.b_idx
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

-- 文献检索: 标题/作者/来源/学科/标签/摘要命中。空关键词 = 按时间浏览全部。
DROP FUNCTION IF EXISTS public.search_resource_documents(TEXT, TEXT, TEXT, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.search_resource_documents(
  p_query    TEXT,
  p_subject  TEXT    DEFAULT NULL,
  p_doc_type TEXT    DEFAULT NULL,
  p_tag      TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 30,
  p_offset   INTEGER DEFAULT 0
) RETURNS TABLE (
  id              UUID,
  title           TEXT,
  authors         TEXT,
  source          TEXT,
  pub_year        INTEGER,
  doc_type        TEXT,
  subject         TEXT,
  tags            TEXT[],
  abstract        TEXT,
  pdf_total_pages INTEGER,
  parse_status    TEXT,
  created_at      TIMESTAMPTZ,
  snippet         TEXT,
  total_hits      BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q TEXT := btrim(coalesce(p_query, ''));
BEGIN
  RETURN QUERY
  WITH hit AS (
    SELECT d.id AS d_id, d.title AS d_title, d.authors AS d_authors, d.source AS d_source,
           d.pub_year AS d_year, d.doc_type AS d_type, d.subject AS d_subject, d.tags AS d_tags,
           d.abstract AS d_abstract, d.pdf_total_pages AS d_pages, d.parse_status AS d_status,
           d.created_at AS d_created,
           substring(d.abstract FROM greatest(1, strpos(lower(d.abstract), lower(q)) - 30) FOR 120) AS d_snippet,
           (CASE WHEN q <> '' AND d.title ILIKE '%' || q || '%' THEN 0 ELSE 1 END) AS rank
    FROM public.resource_documents d
    WHERE (q = '' OR d.search_text ILIKE '%' || regexp_replace(q, '(.)', '\1 ', 'g') || '%')
      AND (p_subject  IS NULL OR d.subject  = p_subject)
      AND (p_doc_type IS NULL OR d.doc_type = p_doc_type)
      AND (p_tag      IS NULL OR p_tag = ANY(d.tags))
  )
  SELECT h.d_id, h.d_title, h.d_authors, h.d_source, h.d_year, h.d_type, h.d_subject,
         h.d_tags, h.d_abstract, h.d_pages, h.d_status, h.d_created, h.d_snippet,
         count(*) OVER ()
  FROM hit h
  ORDER BY h.rank, h.d_created DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_resource_blocks(TEXT, UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_resource_documents(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- Section 50: 会话列表的"本轮已作答"计数 (session answered counts)
--   练习页的会话列表原来显示 current_index(光标走到第几题), 很容易被读成"完成数", 和计划 /
--   练习页主进度条的"本轮已作答"对不上。这里按和 isAnsweredAfterReset 同一口径实算:
--   每个会话的题, 只要在该科本轮起点(p_starts, 客户端按 passStartBySubject 算好)之后作答过
--   就算一题(按题去重); p_starts 里没有的学科 = 没有门槛, 做过就算。
--   服务端一次算完所有会话: 题量表 + 作答表都在库里, 不用把上千个 UUID 传到前端再分页拉。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sessions_answered(
  p_user_id UUID,
  p_starts  JSONB DEFAULT '{}'::jsonb   -- { "学科": "2026-08-14T11:38:38.533Z" }, 缺 = 不限时间
)
RETURNS TABLE(session_key TEXT, answered BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT s.session_key, COUNT(DISTINCT q.id) AS answered
  FROM public.practice_sequential_state s
  CROSS JOIN LATERAL unnest(s.question_ids) AS ids(question_id)
  JOIN public.questions q ON q.id = ids.question_id
  WHERE s.user_id = p_user_id
    -- 该科有门槛就只认门槛之后的作答; 没门槛(不在 p_starts 里) = 做过就算
    AND EXISTS (
      SELECT 1 FROM public.user_answers ua
      WHERE ua.question_id = q.id
        AND ua.user_id = p_user_id
        AND (NULLIF(p_starts->>q.subject, '') IS NULL
             OR ua.answered_at >= (p_starts->>q.subject)::TIMESTAMPTZ)
    )
  GROUP BY s.session_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_sessions_answered(UUID, JSONB) TO authenticated;

-- ============================================================================
-- Section 52: 卷面素材进题目记录 (questions.paper)
--   英语（一）这类真题要「像真题」地还原卷面: Section 标题、Directions 原文、
--   整篇完形正文(挖空带题号)、四篇阅读正文、Part B 段落与顺序骨架、翻译全文与待译句、
--   两篇写作的来信方框与图表数据。
--   这些素材现在跟题目记录一起走: 一条记录 = 卷面的一大题(完形整篇 / 一篇 Text /
--   Part B / 翻译 / 一篇写作), 小题挂在该记录的 case_questions 上, **小题 id 就是卷面题号**。
--   于是不再需要 Section 51 那张 paper_layouts 快照表(已删): 少一套数据通路,
--   也不会出现「题库换了、快照没换」的错位。
--   形状见 src/lib/exam-paper.ts 的 QuestionPaper。
--   放库里而不是烤进仓库: 真题原文有版权, 这个仓库是公开的。
-- ============================================================================
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS paper JSONB;

COMMENT ON COLUMN public.questions.paper IS
  '真题卷面素材(分区标题/Directions/整篇正文/段落骨架/图表); 有它的记录就是卷面的一大题, 小题 id 即卷面题号';

-- Section 51 的 paper_layouts 快照表作废(素材已进 questions.paper)
DROP TABLE IF EXISTS public.paper_layouts;

-- 题型白名单补上卷面专用题型。Section 12 / 26 那份是旧的, 不补的话入库直接违反 CHECK
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN (
    'single_choice','multi_select','true_false','fill_blank','short_answer','analysis','judge_correct','coding',
    'case_analysis','cloze','reading_set','sentence_order','translation','writing'));

-- ============================================================================
-- Section 53: 小题口径的计题数 (questions.item_count + count_question_items)
--   卷面题型一条记录含多个小题(完形 20 空 / 阅读一篇 5 问 / 翻译 5 句), 题库列表和侧边
--   统计按「记录」计数会让英语一从 52 变成 9, 看着像丢了题。这里落一个生成列:
--     item_count = 多小题题型的小题数, 其余 = 1
--   口径与前端 MULTI_ITEM_QUESTION_TYPES 一致(见 src/lib/constants.ts)。
--   count_question_items 给同一个筛选条件下的「记录数 + 小题数」, 供列表头部展示;
--   筛选语义与前端 use-questions 的查询保持一致。
-- ============================================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS item_count INTEGER
  GENERATED ALWAYS AS (
    CASE
      WHEN question_type IN ('cloze','reading_set','sentence_order','translation','case_analysis')
      THEN GREATEST(
             jsonb_array_length(
               CASE WHEN jsonb_typeof(case_questions) = 'array' THEN case_questions ELSE '[]'::jsonb END
             ),
             1)
      ELSE 1
    END
  ) STORED;

COMMENT ON COLUMN public.questions.item_count IS
  '按小题口径的计题数: 多小题题型 = 小题数, 其余 = 1 (生成列)';

CREATE OR REPLACE FUNCTION public.count_question_items(
  p_search        TEXT DEFAULT NULL,
  p_subject       TEXT DEFAULT NULL,
  p_category      TEXT DEFAULT NULL,   -- '__unset__' = 无分类
  p_question_type TEXT DEFAULT NULL,
  p_import_mode   TEXT DEFAULT NULL,
  p_verified      BOOLEAN DEFAULT NULL,
  p_key_points    TEXT DEFAULT NULL,   -- '__none__' = 无知识点
  p_issue_flag    TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT jsonb_build_object('rows', count(*), 'items', COALESCE(sum(q.item_count), 0))
  FROM public.questions q
  WHERE (p_search IS NULL OR q.question_text ILIKE '%' || p_search || '%')
    AND (p_subject IS NULL OR q.subject = p_subject)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
    AND (p_import_mode IS NULL OR q.import_mode = p_import_mode)
    AND (p_verified IS NULL OR q.verified = p_verified)
    AND (p_issue_flag IS NULL OR q.issue_flag = p_issue_flag)
    AND (CASE
           WHEN p_category IS NULL THEN TRUE
           WHEN p_category = '__unset__' THEN q.category IS NULL
           ELSE q.category = p_category OR q.categories @> to_jsonb(ARRAY[p_category])
         END)
    AND (CASE
           WHEN p_key_points IS NULL THEN TRUE
           WHEN p_key_points = '__none__' THEN q.key_points IS NULL OR q.key_points = ''
           ELSE q.key_points ILIKE '%' || p_key_points || '%'
         END);
$$;

GRANT EXECUTE ON FUNCTION public.count_question_items(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Section 54: 资料库分卷 (resource parts) —— 超长文献自动切片解析
--   MinerU 单次最多解析 200 页(实测报 "number of pages exceeds limit (200 pages)"),
--   一本 295 页的教材必须切成 1-200 / 201-295 两次解析。为了让前台仍然是"一本书",
--   解析产物按卷存, 但页码一律用原文页码(全局):
--     - resource_blocks.page_no   = 原文页码, 跨卷连续(见 page_offset 的用法)
--     - resource_parts.page_urls  里每个 p 也是原文页码
--   这样阅读页、目录、检索、PDF↔正文定位全都不用感知"卷"的存在。
--
--   实测注意: MinerU 传 page_ranges 时返回的 layout.json 页码是**相对**的
--   (解析 3-5 页 → pdf_info 只有 3 项, page_idx = 0,1,2), 所以写区块时要加
--   page_offset = 本卷起始页 - 1; 而页图是按原始页码渲染的, 不需要偏移。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.resource_parts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.resource_documents(id) ON DELETE CASCADE,
  part_index   INTEGER NOT NULL,
  page_from    INTEGER NOT NULL,
  page_to      INTEGER NOT NULL,
  page_urls    TEXT,
  markdown     TEXT NOT NULL DEFAULT '',
  parse_mode   TEXT NOT NULL DEFAULT 'precision',
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rp_doc_index ON public.resource_parts(document_id, part_index);

ALTER TABLE public.resource_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_select ON public.resource_parts;
CREATE POLICY rp_select ON public.resource_parts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.resource_documents d
                 WHERE d.id = document_id AND (d.is_published OR public.is_admin())));
DROP POLICY IF EXISTS rp_insert ON public.resource_parts;
CREATE POLICY rp_insert ON public.resource_parts FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS rp_update ON public.resource_parts;
CREATE POLICY rp_update ON public.resource_parts FOR UPDATE USING (public.is_admin());
DROP POLICY IF EXISTS rp_delete ON public.resource_parts;
CREATE POLICY rp_delete ON public.resource_parts FOR DELETE USING (public.is_admin());

-- ============================================================================
-- Section 55: RAG —— 跨来源知识索引 (rag chunks) + 混合检索
--   把可被引用的内容统一成"块"存到一张表里, 检索只需要一条路径:
--     resource  文献区块(resource_blocks)  → 有页码+bbox, 可跳到阅读页那一段
--     question  题库题目(题干+选项+解析+知识点)
--     kp        知识点解读(kp_explanations)
--     subject   学科解读(subject_explanations)
--     note      公开笔记(user_answers.note, 只收 is_public 的)
--
--   为什么统一成一张表而不是给每张源表加向量列: 混合检索(向量+全文)的融合排序需要
--   一次 ORDER BY, 分成几张表就得 UNION 再对不上权重; 而且重新切块时只动这张表。
--   文本冗余无所谓 —— 真正占空间的是向量(1024 维 ≈ 4KB/块), 文本比它小两个数量级。
--
--   可见性: 只索引"所有登录用户都能看到"的内容(公开笔记 + 已发布的文献 + 题库/解读),
--   所以 rag_chunks 直接对 authenticated 开放读, 不会泄露草稿或私密笔记。
--
--   向量由 Edge Function(rag-index) 写入, 用服务端 Qwen key, 前端拿不到 key。
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.rag_chunks (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL DEFAULT 0,
  label        TEXT NOT NULL DEFAULT '',
  sub_label    TEXT,
  content      TEXT NOT NULL,
  -- 逐字加空格: 中文没空格, pg_trgm 对 2 字词生成不出 trigram, 加空格后 2 字词也能走 GIN 索引
  search_text  TEXT GENERATED ALWAYS AS (regexp_replace(lower(content), '(.)', '\1 ', 'g')) STORED,
  -- 定位信息(只有 resource 填)
  page_no      INTEGER,
  bbox         REAL[],
  block_index  INTEGER,
  anchor       TEXT,
  -- halfvec 而不是 vector: 1024 维 float 是 4KB/块, 18k 块光向量就 61MB(全在 TOAST 里),
  -- 半精度把它砍到一半, 而实测 top-40 召回 40/40 完全一致、名次零位移。见 Section 59。
  embedding    halfvec(1024),
  embedded_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_embedding  ON public.rag_chunks USING hnsw (embedding halfvec_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_rag_search     ON public.rag_chunks USING GIN (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rag_src        ON public.rag_chunks(source, source_id);

ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rag_select ON public.rag_chunks;
CREATE POLICY rag_select ON public.rag_chunks FOR SELECT
  USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS rag_write_admin ON public.rag_chunks;
CREATE POLICY rag_write_admin ON public.rag_chunks FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 混合检索: 向量召回 + 全文召回, 用 RRF(倒数排名融合)合并。
--
-- p_terms 是查询里抽出来的关键词。为什么要它: 全文那一路原本拿**整句**当子串匹配,
-- 而用户问的是「灵气学派是什么？」——正文里有"灵气学派", 却绝不会有这一整句,
-- 于是整句匹配恒为空。向量那一路能处理这种改写, 可一旦 embedding 服务不可用
-- (实测撞上过 DashScope 欠费), 降级成纯全文就等于什么都搜不到。
-- 所以抽词后按"命中几个词"排序: 命中的词越多越靠前, 命不中就退回整句匹配。
--
-- p_embedding 收 TEXT 而不是 vector: PostgREST 对 vector 参数的解析不可靠,
-- 收文本在函数内 cast, 传 null 或空串就是"只走全文检索"。
CREATE OR REPLACE FUNCTION public.search_rag(
  p_query     TEXT,
  p_embedding TEXT    DEFAULT NULL,
  p_sources   TEXT[]  DEFAULT NULL,
  p_limit     INTEGER DEFAULT 12,
  p_terms     TEXT[]  DEFAULT NULL
) RETURNS TABLE (
  id          BIGINT,
  source      TEXT,
  source_id   TEXT,
  label       TEXT,
  sub_label   TEXT,
  content     TEXT,
  page_no     INTEGER,
  bbox        REAL[],
  block_index INTEGER,
  anchor      TEXT,
  vec_rank    BIGINT,
  txt_rank    BIGINT,
  score       DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_emb   halfvec(1024);
  v_terms TEXT[];
BEGIN
  IF p_embedding IS NOT NULL AND btrim(p_embedding) <> '' THEN
    v_emb := p_embedding::halfvec;
  END IF;

  -- 只用 2 个字以上的词, 单字命中太吵
  IF p_terms IS NOT NULL THEN
    SELECT array_agg(DISTINCT t) INTO v_terms FROM unnest(p_terms) t WHERE length(btrim(t)) >= 2;
  END IF;

  RETURN QUERY
  WITH vec AS (
    SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> v_emb) AS rnk
    FROM public.rag_chunks c
    WHERE v_emb IS NOT NULL
      AND c.embedding IS NOT NULL
      AND (p_sources IS NULL OR c.source = ANY(p_sources))
    ORDER BY c.embedding <=> v_emb
    LIMIT 40
  ),
  txt AS (
    SELECT b.id, row_number() OVER (
             ORDER BY b.hits DESC, similarity(b.content, p_query) DESC
           ) AS rnk
    FROM (
      SELECT c.id,
             c.content,
             (CASE WHEN v_terms IS NULL THEN 0
                   ELSE (SELECT count(*) FROM unnest(v_terms) t WHERE c.content ILIKE '%' || t || '%')
              END) AS hits
      FROM public.rag_chunks c
      WHERE (p_sources IS NULL OR c.source = ANY(p_sources))
        AND (
          c.search_text ILIKE '%' || regexp_replace(p_query, '(.)', '\1 ', 'g') || '%'
          OR (v_terms IS NOT NULL
              AND EXISTS (SELECT 1 FROM unnest(v_terms) t WHERE c.content ILIKE '%' || t || '%'))
        )
    ) b
    LIMIT 40
  ),
  fused AS (
    SELECT coalesce(v.id, t.id) AS fid,
           v.rnk AS vr,
           t.rnk AS tr,
           -- 必须 cast: 1.0 在 PG 里是 numeric, 不 cast 就对不上 RETURNS TABLE 声明的
           -- double precision, 会报 structure of query does not match function result type
           (coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + t.rnk), 0))::double precision AS sc
    FROM vec v FULL OUTER JOIN txt t ON v.id = t.id
  )
  SELECT c.id, c.source, c.source_id, c.label, c.sub_label, c.content,
         c.page_no, c.bbox, c.block_index, c.anchor,
         f.vr, f.tr, f.sc
  FROM fused f
  JOIN public.rag_chunks c ON c.id = f.fid
  ORDER BY f.sc DESC, c.id
  LIMIT greatest(1, least(coalesce(p_limit, 12), 40));
END;
$$;

-- 旧签名(4 参数)已被 5 参数版取代, 删掉免得 PostgREST 调用时二义
DROP FUNCTION IF EXISTS public.search_rag(TEXT, TEXT, TEXT[], INTEGER);

GRANT EXECUTE ON FUNCTION public.search_rag(TEXT, TEXT, TEXT[], INTEGER, TEXT[]) TO authenticated;

-- ============================================================================
-- Section 56: 小Q 会话记录 (chat conversations & messages)
--
--   为什么要落库而不是只留在浏览器里: 会话里带的是**引用出处**(文献名 + 页码 + 段落
--   跳转地址)。存在本地等于"换个设备、清个缓存, 之前查过的依据就找不回来了"; 而且同一个
--   会话要在 /assistant 页和阅读页的悬浮面板里接着聊, 两边各存一份状态必然会分叉。
--
--   两张表而不是一张: 会话列表只需要标题和时间, 消息是长文本 + 引用 JSON。合成一张表,
--   "列出我的会话"这条最频繁的查询就得跟着读一堆正文。
--
--   tags / sources / followups 存 JSONB: 它们的形状由前端定义(引用条目以后还会加字段),
--   拆成列会让每次改前端都要配一次迁移; 而这里从不需要按引用内容检索 —— 真正要搜的是正文。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '新会话',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 列表按"最近聊过"倒序取, 这是唯一的高频查询
CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON public.chat_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  sub             TEXT,
  tags            TEXT[],
  sources         JSONB,
  followups       TEXT[],
  emotion         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按 id 而不是 created_at: 同一毫秒写入的两条消息用时间排序不稳定, 会串序
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON public.chat_messages(conversation_id, id);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conv_own ON public.chat_conversations;
CREATE POLICY chat_conv_own ON public.chat_conversations FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 消息表不带 user_id: 归属靠会话反查。少一列冗余, 也就少一次"两处不一致"的机会。
-- 代价是策略里多一个 EXISTS; 消息量按会话取, 有 idx_chat_msg_conv 在前面挡着。
DROP POLICY IF EXISTS chat_msg_own ON public.chat_messages;
CREATE POLICY chat_msg_own ON public.chat_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.chat_conversations c
                 WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_conversations c
                      WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- 会话的 updated_at 由消息写入带起来: 让前端每次发消息都多写一次 conversations 表,
-- 迟早会漏(比如补发失败重试那条路径), 而这里漏了的后果是会话排到列表最底下, 很难发现。
CREATE OR REPLACE FUNCTION public.bump_chat_conversation() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_chat_conversation() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_msg_bump ON public.chat_messages;
CREATE TRIGGER trg_chat_msg_bump AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_chat_conversation();

-- ============================================================================
-- Section 57: 小Q 指令 (/create, /export, /skill) 产生的结构化消息
--
--   指令的结果不是一段文本, 而是一张可交互的卡片: /create 要给"预览 → 改学科分类 →
--   确认入库"三步, 入库之后那张卡还得变成"已入库 3 道"。所以它必须跟消息一起存下来,
--   而不是只放在内存里 —— 否则刷新一下, 还没确认的草稿就没了, 但那道题其实还在等你确认。
--
--   为什么用 JSONB 而不是给每种卡片加列: 卡片种类会一直加(以后可能还有 /plan 之类),
--   每加一种就要迁移一次; 而这些字段只被前端自己读, 从不参与检索或排序。
--   真正要搜的是消息正文, 那个仍然是 content + 索引。
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS meta JSONB;

-- ============================================================================
-- Section 58: search_rag 支持按"具体哪一篇"过滤 (RAG 出题: 从指定文献出题)
--
--   原先只能按 source 过滤(文献/题库/…), 但 /create 要能"就从《医学史（第3版）》出题"。
--   在前端拿 40 条结果再筛是不行的: 库里文献一多, 这一篇的块根本进不了召回窗口,
--   于是"限定这篇出题"会静默退化成"随便哪篇", 出的题和选的文献对不上。
--
--   加参数必须 DROP 旧的: 只 CREATE OR REPLACE 会变成重载, PostgREST 按名字调用时二义。
-- ============================================================================
DROP FUNCTION IF EXISTS public.search_rag(TEXT, TEXT, TEXT[], INTEGER, TEXT[]);

CREATE OR REPLACE FUNCTION public.search_rag(
  p_query      TEXT,
  p_embedding  TEXT    DEFAULT NULL,
  p_sources    TEXT[]  DEFAULT NULL,
  p_limit      INTEGER DEFAULT 12,
  p_terms      TEXT[]  DEFAULT NULL,
  p_source_ids TEXT[]  DEFAULT NULL
) RETURNS TABLE (
  id          BIGINT,
  source      TEXT,
  source_id   TEXT,
  label       TEXT,
  sub_label   TEXT,
  content     TEXT,
  page_no     INTEGER,
  bbox        REAL[],
  block_index INTEGER,
  anchor      TEXT,
  vec_rank    BIGINT,
  txt_rank    BIGINT,
  score       DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_emb   halfvec(1024);
  v_terms TEXT[];
BEGIN
  IF p_embedding IS NOT NULL AND btrim(p_embedding) <> '' THEN
    v_emb := p_embedding::halfvec;
  END IF;

  -- 只用 2 个字以上的词, 单字命中太吵
  IF p_terms IS NOT NULL THEN
    SELECT array_agg(DISTINCT t) INTO v_terms FROM unnest(p_terms) t WHERE length(btrim(t)) >= 2;
  END IF;

  RETURN QUERY
  WITH vec AS (
    SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> v_emb) AS rnk
    FROM public.rag_chunks c
    WHERE v_emb IS NOT NULL
      AND c.embedding IS NOT NULL
      AND (p_sources IS NULL OR c.source = ANY(p_sources))
      AND (p_source_ids IS NULL OR c.source_id = ANY(p_source_ids))
    ORDER BY c.embedding <=> v_emb
    LIMIT 40
  ),
  txt AS (
    SELECT b.id, row_number() OVER (
             ORDER BY b.hits DESC, similarity(b.content, p_query) DESC
           ) AS rnk
    FROM (
      SELECT c.id,
             c.content,
             (CASE WHEN v_terms IS NULL THEN 0
                   ELSE (SELECT count(*) FROM unnest(v_terms) t WHERE c.content ILIKE '%' || t || '%')
              END) AS hits
      FROM public.rag_chunks c
      WHERE (p_sources IS NULL OR c.source = ANY(p_sources))
        AND (p_source_ids IS NULL OR c.source_id = ANY(p_source_ids))
        AND (
          c.search_text ILIKE '%' || regexp_replace(p_query, '(.)', '\1 ', 'g') || '%'
          OR (v_terms IS NOT NULL
              AND EXISTS (SELECT 1 FROM unnest(v_terms) t WHERE c.content ILIKE '%' || t || '%'))
        )
    ) b
    LIMIT 40
  ),
  fused AS (
    SELECT coalesce(v.id, t.id) AS fid,
           v.rnk AS vr,
           t.rnk AS tr,
           -- 必须 cast: 1.0 在 PG 里是 numeric, 不 cast 就对不上 RETURNS TABLE 声明的
           -- double precision, 会报 structure of query does not match function result type
           (coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + t.rnk), 0))::double precision AS sc
    FROM vec v FULL OUTER JOIN txt t ON v.id = t.id
  )
  SELECT c.id, c.source, c.source_id, c.label, c.sub_label, c.content,
         c.page_no, c.bbox, c.block_index, c.anchor,
         f.vr, f.tr, f.sc
  FROM fused f
  JOIN public.rag_chunks c ON c.id = f.fid
  ORDER BY f.sc DESC, c.id
  LIMIT greatest(1, least(coalesce(p_limit, 12), 40));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_rag(TEXT, TEXT, TEXT[], INTEGER, TEXT[], TEXT[]) TO authenticated;

-- ============================================================================
-- Section 59: RAG 检索提速 —— 向量路回到 halfvec HNSW, 全文路匹配 search_text
--
--   症状: 小Q「查不到资料」。rag-search 里检索失败是被吞掉的(只 console.warn),
--   于是看起来像"资料没了", 实际是检索语句撞了 authenticated 的 statement_timeout = 8s。
--
--   1) 向量路退化成顺序扫。1024 维 float 存 TOAST(≈4KB/块), 顺序扫 18k 块要多读
--      1.5 万次 TOAST, 实测 9.5s。索引重建为 halfvec —— 121MB → 49MB, 而实测 top-40
--      召回 40/40 完全一致、名次零位移, 半精度对召回没有可测影响。顺带 TOAST 里的
--      向量 61MB → 30MB(这次连带把增量重建攒下的膨胀一起清了, 库 222MB → 150MB)。
--
--   2) 全文路(抽词那一路)匹配的是 c.content —— content 太大存 TOAST, 每个候选行都要
--      先 detoast 才能做匹配, 实测 4.5s。改成匹配 search_text(生成列, 行内存得下):
--      同一个 CTE 从 4.5s 降到 14ms。
--      注意: 这不是"用上了 GIN 索引"。实测 EXPLAIN 里 planner 仍然选顺序扫 ——
--      因为 LIMIT 40 能在扫到第 40 个命中时就停(常见词只扫百来行), 比走索引更便宜;
--      冷门词也一样(扫 441 行)。idx_rag_search 留着只是保险, 目前基本不生效,
--      真到了几万块以上再回头看要不要留。顺带修掉原来漏 lower() 的问题
--      (search_text 存的是小写, 大写查询词永远匹配不上)。
--
--   实测(修复后, 直接打 RPC, 含 PostgREST 开销): 纯全文 621ms / 混合 394ms / 纯向量 172ms。
--
--   改列类型会重建表上的所有索引: 所以先把 idx_rag_embedding 删掉 —— 否则 ALTER 会因为
--   halfvec 上不存在 vector_cosine_ops 而失败(生产上排障时已经手工删过, 这里是补上);
--   idx_rag_search 一起删只是为了让这次重写快点(GIN 重建是重写里最贵的部分), 之后重建。
--   新库按 Section 55 的定义直接就是 halfvec, 两个 DROP 都是空操作。
-- ============================================================================
DROP INDEX IF EXISTS public.idx_rag_embedding;
DROP INDEX IF EXISTS public.idx_rag_search;

ALTER TABLE public.rag_chunks
  ALTER COLUMN embedding TYPE halfvec(1024) USING embedding::halfvec(1024);

CREATE INDEX IF NOT EXISTS idx_rag_embedding
  ON public.rag_chunks USING hnsw (embedding halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_rag_search ON public.rag_chunks USING GIN (search_text gin_trgm_ops);

DROP FUNCTION IF EXISTS public.search_rag(TEXT, TEXT, TEXT[], INTEGER, TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION public.search_rag(
  p_query      TEXT,
  p_embedding  TEXT    DEFAULT NULL,
  p_sources    TEXT[]  DEFAULT NULL,
  p_limit      INTEGER DEFAULT 12,
  p_terms      TEXT[]  DEFAULT NULL,
  p_source_ids TEXT[]  DEFAULT NULL
) RETURNS TABLE (
  id          BIGINT,
  source      TEXT,
  source_id   TEXT,
  label       TEXT,
  sub_label   TEXT,
  content     TEXT,
  page_no     INTEGER,
  bbox        REAL[],
  block_index INTEGER,
  anchor      TEXT,
  vec_rank    BIGINT,
  txt_rank    BIGINT,
  score       DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_emb     halfvec(1024);
  v_query   TEXT;
  v_terms   TEXT[];
BEGIN
  IF p_embedding IS NOT NULL AND btrim(p_embedding) <> '' THEN
    v_emb := p_embedding::halfvec;
  END IF;

  -- 逐字加空格后才是 search_text 里的形态; 顺带 lower, 和 search_text 的大小写一致
  v_query := regexp_replace(lower(btrim(p_query)), '(.)', '\1 ', 'g');

  -- 只用 2 个字以上的词, 单字命中太吵
  IF p_terms IS NOT NULL THEN
    SELECT array_agg(DISTINCT regexp_replace(lower(btrim(t)), '(.)', '\1 ', 'g'))
      INTO v_terms
      FROM unnest(p_terms) t
     WHERE length(btrim(t)) >= 2;
  END IF;

  RETURN QUERY
  WITH vec AS (
    SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> v_emb) AS rnk
    FROM public.rag_chunks c
    WHERE v_emb IS NOT NULL
      AND c.embedding IS NOT NULL
      AND (p_sources IS NULL OR c.source = ANY(p_sources))
      AND (p_source_ids IS NULL OR c.source_id = ANY(p_source_ids))
    ORDER BY c.embedding <=> v_emb
    LIMIT 40
  ),
  txt AS (
    SELECT b.id, row_number() OVER (
             ORDER BY b.hits DESC, similarity(b.content, p_query) DESC
           ) AS rnk
    FROM (
      SELECT c.id,
             c.content,
             (CASE WHEN v_terms IS NULL THEN 0
                   ELSE (SELECT count(*) FROM unnest(v_terms) t WHERE c.search_text LIKE '%' || t || '%')
              END) AS hits
      FROM public.rag_chunks c
      WHERE (p_sources IS NULL OR c.source = ANY(p_sources))
        AND (p_source_ids IS NULL OR c.source_id = ANY(p_source_ids))
        AND (
          c.search_text LIKE '%' || v_query || '%'
          OR (v_terms IS NOT NULL
              AND EXISTS (SELECT 1 FROM unnest(v_terms) t WHERE c.search_text LIKE '%' || t || '%'))
        )
    ) b
    LIMIT 40
  ),
  fused AS (
    SELECT coalesce(v.id, t.id) AS fid,
           v.rnk AS vr,
           t.rnk AS tr,
           -- 必须 cast: 1.0 在 PG 里是 numeric, 不 cast 就对不上 RETURNS TABLE 声明的
           -- double precision, 会报 structure of query does not match function result type
           (coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + t.rnk), 0))::double precision AS sc
    FROM vec v FULL OUTER JOIN txt t ON v.id = t.id
  )
  SELECT c.id, c.source, c.source_id, c.label, c.sub_label, c.content,
         c.page_no, c.bbox, c.block_index, c.anchor,
         f.vr, f.tr, f.sc
  FROM fused f
  JOIN public.rag_chunks c ON c.id = f.fid
  ORDER BY f.sc DESC, c.id
  LIMIT greatest(1, least(coalesce(p_limit, 12), 40));
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_rag(TEXT, TEXT, TEXT[], INTEGER, TEXT[], TEXT[]) TO authenticated;


-- ============================================================================
-- Section 60: 人工目录 —— MinerU 解析错的目录允许管理员改
--
--   目录原本是"读的时候现推": resource_blocks 里 heading_level > 0 的就是目录项,
--   层级来自标题编号(「第一章」=1 级 / 「1.1」=2 级 / 「1.1.1」=3 级)。MinerU 会错在四处 ——
--   把页眉当标题(多一条)、真标题被并进正文(少一条)、层级判错、标题被正文撑长。
--   这些都是解析产物的性质, 改不了源头, 所以加一层人工覆盖。
--
--   为什么是"整份快照"而不是"逐条 diff": 人工改过之后这份目录就以人写的为准。
--   diff 形式在重新解析后 block_index 会整体位移, 改动会静默错位到别的段落上 —— 那是
--   "看不见的错"; 快照至少是"看得见的错", 编辑器里能把失效的映射标出来重指。
--   toc_source 记住当前用哪一份, 一键可以退回自动。
--
--   为什么是 sort_order + level 的平铺表, 而不是 parent_id 的树: 下游(RAG 出题的章节范围 /
--   阅读页目录 / PDF↔Markdown 双向定位)消费的全是 TocEntry[], 平铺 + 显式 level 就是它的
--   形状 —— 一行对一条, 不用递归查也不用树转平; 改层级就是改这个数字, 「添加子目录」就是
--   在它后面插一行 level+1, 删父节点也不会留下孤儿子树。
--
--   block_index 可空: 允许"纯分组项"(MinerU 整个漏掉的「第一篇 总论」)。它没有正文落点,
--   只带页码 —— 点它跳 PDF 页, 正文里不高亮, 但出题范围照样按页码区间切得出来。
-- ============================================================================
ALTER TABLE public.resource_documents
  ADD COLUMN IF NOT EXISTS toc_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (toc_source IN ('auto', 'manual'));

CREATE TABLE IF NOT EXISTS public.resource_toc_entries (
  id          BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.resource_documents(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL,
  level       SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 6),
  title       TEXT NOT NULL DEFAULT '',
  block_index INTEGER,
  page_no     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_rte_doc ON public.resource_toc_entries(document_id, sort_order);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.resource_toc_entries;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.resource_toc_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.resource_toc_entries ENABLE ROW LEVEL SECURITY;

-- 目录是给所有登录用户看的(阅读页左边那一栏), 所以沿用 resource_blocks 的口径:
-- 已发布文献的目录谁都能读, 未发布的只有管理员读得到。
DROP POLICY IF EXISTS rte_select ON public.resource_toc_entries;
CREATE POLICY rte_select ON public.resource_toc_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.resource_documents d
                 WHERE d.id = document_id AND (d.is_published OR public.is_admin())));
DROP POLICY IF EXISTS rte_write_admin ON public.resource_toc_entries;
CREATE POLICY rte_write_admin ON public.resource_toc_entries FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 保存人工目录: 删旧 + 插新 + 翻 toc_source 必须在同一个事务里。
-- 客户端分两步(先 delete 再 insert)一旦中间失败, 管理员刚编了半天的目录就没了。
-- 用 INVOKER + 显式 is_admin(): 走 RLS 更保险, 也不需要在函数里再判一遍权限口径。
CREATE OR REPLACE FUNCTION public.save_resource_toc(p_document_id UUID, p_entries JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '只有管理员能改目录';
  END IF;

  DELETE FROM public.resource_toc_entries WHERE document_id = p_document_id;

  INSERT INTO public.resource_toc_entries (document_id, sort_order, level, title, block_index, page_no)
  SELECT p_document_id,
         (e.ord - 1)::INTEGER,
         greatest(1, least(6, coalesce((e.item ->> 'level')::INTEGER, 1))),
         coalesce(e.item ->> 'title', ''),
         nullif(e.item ->> 'block_index', '')::INTEGER,
         greatest(1, coalesce((e.item ->> 'page_no')::INTEGER, 1))
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::JSONB)) WITH ORDINALITY AS e(item, ord);

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.resource_documents
     SET toc_source = 'manual', updated_at = NOW()
   WHERE id = p_document_id;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_resource_toc(UUID, JSONB) TO authenticated;

-- 退回自动目录: 清掉人工条目, toc_source 回 'auto', 阅读页当场变回按 heading_level 现推的那份
CREATE OR REPLACE FUNCTION public.reset_resource_toc(p_document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '只有管理员能改目录';
  END IF;

  DELETE FROM public.resource_toc_entries WHERE document_id = p_document_id;

  UPDATE public.resource_documents
     SET toc_source = 'auto', updated_at = NOW()
   WHERE id = p_document_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_resource_toc(UUID) TO authenticated;


-- ============================================================================
-- Section 61: 区块带上图片地址与表格 HTML —— 让图片和表格真的显示出来
--
--   原来两者都看不到, 原因不是阅读页不渲染, 是数据里根本没有:
--     图片: MinerU 的图片块自身没有文字(文字是图注), 而入库时按"没文本就跳过"处理,
--           于是整个图片块被丢掉 —— 库里 image/figure 类型一条都没有。而且解析产物里的
--           images/xxx.jpg 从来没上传过 R2, 连整篇视图里的图片引用都是悬空的。
--     表格: 入库时把表格所有单元格拼成一个字符串存进 text, 结构没保留; "逐段"视图
--           只能把这一长串原样显示, 所以看起来不像表格。
--
--   image_url 存的是**上传 R2 之后的地址**(解析时才拿得到), 不是产物里的文件名:
--   文件名只对人有用, 阅读页要的是能直接放进 <img src> 的东西。
--   table_html 直接用 MinerU 给的 table_body, 它本身就是一段 <table>;
--   text 仍然保留(检索/摘要/无 HTML 时的降级都还要用它)。
-- ============================================================================
ALTER TABLE public.resource_blocks
  ADD COLUMN IF NOT EXISTS image_url  TEXT,
  ADD COLUMN IF NOT EXISTS table_html TEXT;

-- ============================================================================
-- Section 62: 区块类型标签 —— 代码语言 + 检索跳过页面装饰
--
--   1) code_language: MinerU 给的代码语言(middle.json 的 guess_lang, content_list_v2 的
--      content.code_language)。阅读页按它选 shiki 的语法; 没有就只能当纯文本, 高亮等于没做。
--   2) 页眉/页脚/页码/边注/脚注/注音这些"页面装饰"现在也会入区块(阅读页能看到、能一键藏起来),
--      但它们是每页重复的页面家具: 不排掉的话搜一个常用词会命中几百条页眉, 把真正文挤出前 50 条。
--      只影响检索, 阅读页照样显示。
-- ============================================================================
ALTER TABLE public.resource_blocks
  ADD COLUMN IF NOT EXISTS code_language TEXT;

DROP FUNCTION IF EXISTS public.search_resource_blocks(TEXT, UUID, TEXT, TEXT, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.search_resource_blocks(
  p_query       TEXT,
  p_document_id UUID    DEFAULT NULL,
  p_subject     TEXT    DEFAULT NULL,
  p_doc_type    TEXT    DEFAULT NULL,
  p_tag         TEXT    DEFAULT NULL,
  p_limit       INTEGER DEFAULT 50
) RETURNS TABLE (
  document_id   UUID,
  doc_title     TEXT,
  page_no       INTEGER,
  block_index   INTEGER,
  bbox          REAL[],
  block_type    TEXT,
  heading_level SMALLINT,
  snippet       TEXT,
  score         REAL,
  total_hits    BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q      TEXT := btrim(coalesce(p_query, ''));
  padded TEXT;
BEGIN
  IF q = '' THEN RETURN; END IF;
  padded := regexp_replace(q, '(.)', '\1 ', 'g');

  RETURN QUERY
  WITH hit AS (
    SELECT b.document_id AS doc_id,
           d.title       AS d_title,
           b.page_no     AS p_no,
           b.block_index AS b_idx,
           b.bbox        AS b_box,
           b.block_type  AS b_type,
           b.heading_level AS b_level,
           b.text        AS b_text,
           (CASE WHEN b.heading_level > 0 THEN 2.0 ELSE 0.0 END
            + CASE WHEN d.title ILIKE '%' || q || '%' THEN 1.5 ELSE 0.0 END
            + CASE WHEN b.text ILIKE q || '%' THEN 0.5 ELSE 0.0 END)::REAL AS sc
    FROM public.resource_blocks b
    JOIN public.resource_documents d ON d.id = b.document_id
    WHERE b.search_text ILIKE '%' || padded || '%'
      AND b.block_type <> ALL (ARRAY[
        'header', 'footer', 'page_number', 'aside_text', 'page_footnote', 'phonetic', 'discarded',
        'page_header', 'page_footer', 'page_aside_text', 'abandon', 'low_score_text'
      ])
      AND (p_document_id IS NULL OR b.document_id = p_document_id)
      AND (p_subject     IS NULL OR d.subject  = p_subject)
      AND (p_doc_type    IS NULL OR d.doc_type = p_doc_type)
      AND (p_tag         IS NULL OR p_tag = ANY(d.tags))
  )
  SELECT h.doc_id, h.d_title, h.p_no, h.b_idx, h.b_box, h.b_type, h.b_level,
         substring(h.b_text FROM greatest(1, strpos(lower(h.b_text), lower(q)) - 40) FOR 160),
         h.sc,
         count(*) OVER ()
  FROM hit h
  ORDER BY h.sc DESC, h.d_title, h.p_no, h.b_idx
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

-- DROP + CREATE 会把权限一起丢掉, 这里补回来(原样沿用 Section 49 的那条)
GRANT EXECUTE ON FUNCTION public.search_resource_blocks(TEXT, UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- Section 63: 知识点解读的「依据原文」—— 把解读挂回资料库的具体段落
--   知识点的来源之一就是资料库文献, 所以一条解读要能说清"依据的是哪几段":
--     · 编写端(KpExplanationManagerDialog) 按文献 → 章节 → 段落挑, 或按关键词搜库挑
--     · 解读端(KpExplanationDialog / 阅读页右侧抽屉) 展示依据并可跳回原文那一段
--     · 阅读端反向(ResourceReader) 给被引用的区块打标记, 点开就看到"这段支撑了哪个知识点"
--
--   为什么独立成表而不是 kp_explanations 上的一个 JSONB 列: 反向查询("这一段被哪些知识点引用")
--   是三条路径里的一条, 存 JSONB 就只能全表扫; 而且改一条依据要重写整个数组。
--
--   为什么不把引用嵌进解读正文的 Markdown: 解读是给人读的散文, 嵌 token 会把编辑器复杂一大截;
--   文献重解析/下线后正文里还会留下死链, 又要多养一套清洗逻辑。
--
--   生命周期(这张表最容易埋坑的地方):
--     · block_index 是区块在**本篇内的下标**, 重新解析后会整体重排(人工目录已经踩过这个坑),
--       所以同时存 page_from/page_to 兜底: 映射失效时至少还能翻到那一页去看。
--     · doc_title / label / snippet 都是落库那一刻的**快照**。依据是"当初确实引了这段"的历史
--       事实: 文献被删或改成未发布时, 依据本身不该跟着消失, 而是显示成"原文已下线", 摘录照旧
--       可读。所以 document_id 是 ON DELETE SET NULL, 不是 CASCADE。
--     · 解读被删时依据一起删(复合外键 CASCADE): 没有解读, 依据无从展示。
--     · 可见性跟 resource_documents.is_published 对齐 —— 否则未发布草稿的段落会顺着解读漏出去。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kp_resource_refs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      TEXT NOT NULL,
  kp           TEXT NOT NULL,
  document_id  UUID REFERENCES public.resource_documents(id) ON DELETE SET NULL,
  -- 精确到段时就是 blocks 的第一段; **整节选中的依据为 NULL**(落点是下面的页码区间)
  block_index  INTEGER,
  page_from    INTEGER NOT NULL DEFAULT 1,
  page_to      INTEGER NOT NULL DEFAULT 1,
  -- 精确勾中的段落下标; 空数组 = 整个 [page_from, page_to] 区间
  blocks       INTEGER[] NOT NULL DEFAULT '{}',
  doc_title    TEXT NOT NULL DEFAULT '',
  label        TEXT NOT NULL DEFAULT '',
  snippet      TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (subject, kp) REFERENCES public.kp_explanations(subject, kp) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_krr_kp  ON public.kp_resource_refs(subject, kp, sort_order);
-- 阅读页要按文献反查"这些段被哪些知识点引用", 走这条
CREATE INDEX IF NOT EXISTS idx_krr_doc ON public.kp_resource_refs(document_id);

ALTER TABLE public.kp_resource_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS krr_select ON public.kp_resource_refs;
CREATE POLICY krr_select ON public.kp_resource_refs FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.is_admin()
      -- document_id IS NULL = 原文献已删, 只剩快照; 一段摘录本身不泄露什么
      OR document_id IS NULL
      OR EXISTS (SELECT 1 FROM public.resource_documents d
                  WHERE d.id = document_id AND d.is_published)
    )
  );

DROP POLICY IF EXISTS krr_write_admin ON public.kp_resource_refs;
CREATE POLICY krr_write_admin ON public.kp_resource_refs FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 一次保存某条解读的全部依据: 删旧 + 插新 + **由服务端补快照**。
--
-- 快照为什么不让前端传: 前端为了取摘录得把整篇正文拉下来, 而"整节"这种粗选本来就没有逐段
-- 内容; 服务端一句 SQL 就能从 resource_blocks 里取到。所以前端只传"选了哪篇、哪几段或哪段
-- 页码区间"以及那句备注, 页码、标题、摘录一律在这里补齐。
CREATE OR REPLACE FUNCTION public.save_kp_resource_refs(
  p_subject TEXT,
  p_kp      TEXT,
  p_refs    JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '只有管理员能维护知识点解读的依据';
  END IF;
  -- 复合外键会拦住"解读还不存在"的情况, 但那样报的是外键错误, 看不出是为什么
  IF NOT EXISTS (SELECT 1 FROM public.kp_explanations WHERE subject = p_subject AND kp = p_kp) THEN
    RAISE EXCEPTION '解读正文还不存在, 依据无处挂靠';
  END IF;

  DELETE FROM public.kp_resource_refs WHERE subject = p_subject AND kp = p_kp;

  INSERT INTO public.kp_resource_refs (
    subject, kp, document_id, block_index, page_from, page_to, blocks,
    doc_title, label, snippet, note, sort_order
  )
  SELECT p_subject,
         p_kp,
         r.document_id,
         CASE WHEN cardinality(r.blocks) > 0 THEN r.blocks[1] ELSE NULL END,
         r.page_from,
         r.page_to,
         r.blocks,
         coalesce(d.title, ''),
         coalesce(r.label, ''),
         -- 摘录取"区间里第一个有正文的块": 精确到段时就是那几段里最靠前的一段, 整节时就是本节开头
         left(coalesce(sn.snippet, ''), 400),
         coalesce(r.note, ''),
         (e.ord - 1)::INTEGER
  FROM jsonb_array_elements(coalesce(p_refs, '[]'::JSONB)) WITH ORDINALITY AS e(item, ord)
  CROSS JOIN LATERAL (
    SELECT (e.item ->> 'document_id')::UUID AS document_id,
           least(greatest(1, coalesce((e.item ->> 'page_from')::INTEGER, 1)),
                 greatest(1, coalesce((e.item ->> 'page_to')::INTEGER, 1))) AS page_from,
           greatest(greatest(1, coalesce((e.item ->> 'page_from')::INTEGER, 1)),
                    greatest(1, coalesce((e.item ->> 'page_to')::INTEGER, 1))) AS page_to,
           coalesce(
             (SELECT array_agg(x::INTEGER ORDER BY x::INTEGER)
                FROM jsonb_array_elements_text(coalesce(e.item -> 'blocks', '[]'::JSONB)) AS t(x)),
             '{}'::INTEGER[]
           ) AS blocks,
           e.item ->> 'label' AS label,
           e.item ->> 'note'  AS note
  ) r
  LEFT JOIN public.resource_documents d ON d.id = r.document_id
  -- LEFT JOIN 而不是 CROSS JOIN: 取不到摘录(区间里全是图片/公式块)时不能把整条依据丢掉
  LEFT JOIN LATERAL (
    SELECT b.text AS snippet
    FROM public.resource_blocks b
    WHERE b.document_id = r.document_id
      AND b.text <> ''
      AND (
        (cardinality(r.blocks) > 0 AND b.block_index = ANY(r.blocks))
        OR (cardinality(r.blocks) = 0 AND b.page_no BETWEEN r.page_from AND r.page_to)
      )
    ORDER BY b.block_index
    LIMIT 1
  ) sn ON TRUE;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_kp_resource_refs(TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- Section 64: 知识点解读的「相关真题」—— 把历年真题挂到解读上
--   「真题」在这套题库里不是一个独立实体, 而是**分类约定**: questions.category / categories
--   里形如 `2024年真题` 的那一条(见 lib/kp-question-refs.ts 的 REAL_YEAR_RE)。所以这里挂的
--   就是一道具体的题: 读者在解读里展开就能看到题干、选项、答案与解析 —— 这正是"这个知识点
--   历年是怎么考的"。
--
--   为什么不复用 Section 63 的 kp_resource_refs: 那边引的是"文献里的一段"(文档 + 页码 +
--   段落 + 摘录快照), 这边引的是一道题(题目 id), 两类东西的字段与生命周期都对不上; 硬塞一张表
--   会让两边都多出一堆恒为 NULL 的列。
--
--   为什么 question_id 用 ON DELETE CASCADE, 而文献那边留快照: 文献被删时"当初确实引了这一段"
--   仍有价值(摘录还在); 题目被删或被合并(题库里天天在合并重复题)时, 这条关联指向的东西已经
--   不存在了, 留个空壳只会让读者点到一个空条目。题干也不需要快照 —— 题本身还在题库里。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kp_question_refs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT NOT NULL,
  kp          TEXT NOT NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  -- 这道真题考的是这个知识点的哪一面(选填)
  note        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (subject, kp) REFERENCES public.kp_explanations(subject, kp) ON DELETE CASCADE,
  -- 同一条解读里同一道题只挂一次
  UNIQUE (subject, kp, question_id)
);

CREATE INDEX IF NOT EXISTS idx_kqr_kp       ON public.kp_question_refs(subject, kp, sort_order);
CREATE INDEX IF NOT EXISTS idx_kqr_question ON public.kp_question_refs(question_id);

ALTER TABLE public.kp_question_refs ENABLE ROW LEVEL SECURITY;

-- 题目本身就是所有登录用户可读的(questions_select_all), 这里跟同一个口径
DROP POLICY IF EXISTS kqr_select ON public.kp_question_refs;
CREATE POLICY kqr_select ON public.kp_question_refs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS kqr_write_admin ON public.kp_question_refs;
CREATE POLICY kqr_write_admin ON public.kp_question_refs FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 一次保存某条解读的全部真题(删旧插新), 与 save_kp_resource_refs 同一个套路
CREATE OR REPLACE FUNCTION public.save_kp_question_refs(
  p_subject TEXT,
  p_kp      TEXT,
  p_refs    JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '只有管理员能维护知识点解读的真题';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kp_explanations WHERE subject = p_subject AND kp = p_kp) THEN
    RAISE EXCEPTION '解读正文还不存在, 真题无处挂靠';
  END IF;

  DELETE FROM public.kp_question_refs WHERE subject = p_subject AND kp = p_kp;

  INSERT INTO public.kp_question_refs (subject, kp, question_id, note, sort_order)
  -- DISTINCT ON: 同一次提交里勾重了不该整个保存失败(界面那边也会去重, 这里兜住)
  SELECT p_subject,
         p_kp,
         x.qid,
         x.note,
         (row_number() OVER (ORDER BY x.ord))::INTEGER - 1
  FROM (
    SELECT DISTINCT ON ((e.item ->> 'question_id')::UUID)
           (e.item ->> 'question_id')::UUID AS qid,
           coalesce(e.item ->> 'note', '')  AS note,
           e.ord
    FROM jsonb_array_elements(coalesce(p_refs, '[]'::JSONB)) WITH ORDINALITY AS e(item, ord)
    WHERE (e.item ->> 'question_id') ~ '^[0-9a-fA-F-]{36}$'
    ORDER BY (e.item ->> 'question_id')::UUID, e.ord
  ) x;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_kp_question_refs(TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- Section 65: 删文献时清掉它的检索块 —— 给 rag_chunks 补上"级联删除"
--   症状: 删掉一篇文献后, 小Q 照旧检索到它的正文, 照旧给出
--   /resource-library/<id>?block=N 的出处, 点进去是「文献不存在或未发布」。
--   实测: resource 来源 30868 个块里 27480 个是已删文献的(11 篇, 占 89%), 而题库/笔记/
--   知识点/学科解读 0 孤儿 —— 只有文献这一路漏。
--
--   为什么只能在数据库这层做: rag_chunks.source_id 是多态 TEXT(source = resource /
--   question / kp / subject / note 共用一张表), 建不了外键, 所以删源行本来什么都不会发生。
--   而 Edge Function 也救不回来 —— rag-index 拿到一个不存在的文献 id 会直接 404(它要先查
--   标题拿 label), 管理页的"整表重建"又是逐篇已发布文献各起一个 job、scope 带 source_id
--   过滤, 已删文档的块连差集都进不去, 永远看不见。除了手工 SQL 没人清得掉。
--
--   为什么删除可以放触发器(而索引写入仍然留在 rag-index): 当初不放触发器的理由是
--   "算向量要发外部请求, 放到写入路径上会让保存一道题变成等 1 秒"。删块是纯 SQL, 没有
--   这个代价; 而且删除没有"稍后重试"的机会 —— 行都没了, 差分同步再也看不到它。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.purge_resource_rag_chunks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.rag_chunks WHERE source = 'resource' AND source_id = OLD.id::text;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_purge_rag_chunks ON public.resource_documents;
CREATE TRIGGER trg_purge_rag_chunks
  AFTER DELETE ON public.resource_documents
  FOR EACH ROW EXECUTE FUNCTION public.purge_resource_rag_chunks();

-- 存量清理: 触发器只管以后。已经留在表里的那些已删文献的块要手工删一次,
-- 之后重放这段就是幂等的空操作(NOT EXISTS 只认"文档确实不在了"的块)。
DELETE FROM public.rag_chunks c
WHERE c.source = 'resource'
  AND NOT EXISTS (SELECT 1 FROM public.resource_documents d WHERE d.id::text = c.source_id);

-- ============================================================================
-- Section 66: 权限收紧 —— 普通用户不能给自己改角色, 也不能关掉自己的二次验证
--   症状(线上实测): profiles_update_own 只校验 id = auth.uid(), 而 role 这一列对
--   authenticated 可写, is_admin() 读的又正是 profiles.role。于是一个刚注册的账号
--   一句 `PATCH /rest/v1/profiles?id=eq.<自己> {"role":"admin"}`(实测 200)就成了管理员,
--   is_admin() 随即返回 true —— 题库、资料库、RAG 索引、知识点解读、全部用户数据一起打开。
--
--   为什么用触发器, 不用列级 REVOKE: 管理员的「用户管理」页就是以前端身份改 role 的
--   (src/pages/admin/UsersManagePage.tsx:78), 列级 REVOKE 会把那个功能一并废掉。
--   触发器可以精确表达"只放行管理员与服务端"。
--
--   同一条链上还有两处:
--     · mfa_grace_until 只该由 edge function 用服务端身份写(前端写的是 user_trusted_devices,
--       见 src/pages/SettingsPage.tsx:130-153)。若允许前端直写, 任何拿到会话的人都能把
--       二次验证永久关掉 —— 这正是 MFA 存在的意义所在。
--     · mfa_validity_days 是用户自己的设置(设置页只提供 0/7/14/30 天), 前端确实要能改,
--       所以只加 CHECK 卡住上限; 否则填个 999999 等于永久免验证。
-- ============================================================================
--   注意这里**不能**写 SECURITY DEFINER: 那会让 current_user 变成函数属主(postgres),
--   于是下面"服务端放行"那一支永远命中, 等于没有守卫(第一版就是这么写的, 实测放行了越权更新)。
--   守卫只需要读 NEW/OLD, 用调用者身份执行即可。
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- 放行: 直连 SQL / dashboard(没有 JWT claims)、service_role、管理员
  IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION '只有管理员能修改用户角色';
  END IF;
  IF NEW.totp_enabled IS DISTINCT FROM OLD.totp_enabled THEN
    RAISE EXCEPTION 'totp_enabled 只能由服务端写入';
  END IF;
  IF NEW.mfa_grace_until IS DISTINCT FROM OLD.mfa_grace_until THEN
    RAISE EXCEPTION 'mfa_grace_until 只能由服务端写入';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- 自建 profile 只能是普通用户。真实注册走 handle_new_user(SECURITY DEFINER, 不受策略约束),
-- 这条只是把"自己插一行 admin"的路堵掉。
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'user');

-- MFA 宽限期上限(设置页提供的最大值就是 30 天)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_mfa_validity_days_range;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_mfa_validity_days_range
  CHECK (mfa_validity_days >= 0 AND mfa_validity_days <= 30);

-- ============================================================================
-- Section 67: 扫码登录 —— 修掉"匿名账号接管"链路
--   症状(线上实测): 整条链是一个匿名可用的账号接管。桌面端把 token 和 auth_code 一起写进
--   qr_login_tokens, 而这张表
--     · SELECT 对 anon 完全开放(USING (true)) —— 任何访客都能把 confirmed 行的 token+auth_code 读走;
--     · INSERT 也是 WITH CHECK (true) —— 任何访客都能直接插一行 {status:'confirmed', user_id:<别人>},
--   qr-login 又只比对 token+code、既不校验 expires_at 也不核对调用者, 于是换一个 magic link 就登进去了。
--   实测: 匿名 INSERT 201 → POST qr-login 200 拿到真实 magic link。库里还留着 18 行从未兑换的
--   confirmed 行(2026-07-19), 按旧逻辑它们**永久可兑换**, 等于 18 个账号一直敞着。
--
--   修法 —— 把"取件凭证"拆成两半:
--     token   公开, 只进二维码(手机用它确认);
--     secret  桌面端本地随机生成, **只存 sha256**, 既不进二维码也不进表, 谁读到表都没用。
--   再配三条:
--     · anon 只能插"待确认且未绑定用户"的行, 不能读整表;
--     · 手机确认走 RLS(status='pending' 且未过期 才能改, 且只能绑到自己名下);
--     · 兑换用 qr_login_claim() 一条 UPDATE ... RETURNING 原子消费, 过期/重复/错 secret 都拿不到东西。
--   顺带修掉: auth_code 不再出现在二维码 URL 里(原先会经历史记录/日志泄漏)。
-- ============================================================================
ALTER TABLE public.qr_login_tokens ADD COLUMN IF NOT EXISTS secret_hash TEXT;

DROP POLICY IF EXISTS qr_insert ON public.qr_login_tokens;
CREATE POLICY qr_insert ON public.qr_login_tokens FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND user_id IS NULL AND secret_hash IS NOT NULL);

-- 客户端对这张表: 只能插(匿名, 且只能是"待确认未绑定"的行), 不能读、不能改。
-- 为什么一个 SELECT 策略都不留: UPDATE 定位行时 Postgres 会再套一层 SELECT 策略, 而"待确认"
-- 的行本来就没有归属人(user_id 为空), 留不出既能找到它、又不让别人看见的策略 ——
-- 所以确认这一步干脆走 SECURITY DEFINER 的 qr_login_confirm(), 表对客户端完全不开放。
DROP POLICY IF EXISTS qr_select ON public.qr_login_tokens;
DROP POLICY IF EXISTS qr_select_own ON public.qr_login_tokens;
DROP POLICY IF EXISTS qr_select_auth ON public.qr_login_tokens;
DROP POLICY IF EXISTS qr_update ON public.qr_login_tokens;
DROP POLICY IF EXISTS qr_update_auth ON public.qr_login_tokens;

-- 存量: 按新规矩一律作废(旧行既没有 secret_hash, 又可能永久可兑换)
UPDATE public.qr_login_tokens SET status = 'expired' WHERE status <> 'expired';

-- 手机端确认: 只能把"还在等确认且没过期"的行绑到**自己**名下(auth.uid() 由服务端取, 不接受传参)
CREATE OR REPLACE FUNCTION public.qr_login_confirm(p_token TEXT, p_device_info TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH updated AS (
    UPDATE public.qr_login_tokens t
       SET status = 'confirmed',
           user_id = auth.uid(),
           device_info = left(coalesce(p_device_info, ''), 200)
     WHERE t.token = p_token
       AND t.status = 'pending'
       AND t.expires_at > NOW()
       AND auth.uid() IS NOT NULL
    RETURNING t.id
  )
  SELECT count(*) > 0 FROM updated;
$$;
REVOKE EXECUTE ON FUNCTION public.qr_login_confirm(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qr_login_confirm(TEXT, TEXT) TO authenticated;

-- 桌面端轮询: 给对的 secret 才回答状态, 过期一律答 expired
CREATE OR REPLACE FUNCTION public.qr_login_status(p_token TEXT, p_secret TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN t.expires_at <= NOW() THEN 'expired' ELSE t.status END
  FROM public.qr_login_tokens t
  WHERE t.token = p_token
    AND t.secret_hash = encode(sha256(p_secret::bytea), 'hex');
$$;
REVOKE EXECUTE ON FUNCTION public.qr_login_status(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qr_login_status(TEXT, TEXT) TO anon, authenticated;
-- 兑换: 原子消费(改状态与取 user_id 同一条语句), 只给服务端调。
-- 注意这里必须把 anon/authenticated 一起撤掉: Supabase 给 public schema 设了默认权限,
-- 新建函数会自动被显式授予 anon/authenticated(实测 proacl 里能看到), 只 REVOKE PUBLIC 是撤不掉的。
CREATE OR REPLACE FUNCTION public.qr_login_claim(p_token TEXT, p_secret TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.qr_login_tokens t
     SET status = 'expired'
   WHERE t.token = p_token
     AND t.status = 'confirmed'
     AND t.expires_at > NOW()
     AND t.secret_hash = encode(sha256(p_secret::bytea), 'hex')
  RETURNING t.user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.qr_login_claim(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_login_claim(TEXT, TEXT) TO service_role;

-- ============================================================================
-- Section 68: SECURITY DEFINER 那一批函数 —— 收紧到"自己或管理员"
--   两个线上实测出来的问题:
--     1) 这批函数是 SECURITY DEFINER 又对 anon 开放, 于是**任何访客**都能:
--          select get_user_email('<uuid>')      → 拿到真实邮箱(实测 200 返回邮箱)
--          select unlink_oauth_identity('github', '<uuid>') → 204 执行成功
--        后者函数体只有一句 DELETE auth.identities, 没有任何 auth.uid() 校验 ——
--        解绑任意用户的登录身份(连 email 身份也能删), 是账号接管/锁定的前置动作。
--     2) 早期写的 `REVOKE EXECUTE ... FROM anon` 是**无效的**: Postgres 默认把 EXECUTE
--        授给 PUBLIC(anon 属于 PUBLIC), 而 Supabase 又给 public schema 设了默认权限,
--        新建函数会被显式授予 anon/authenticated。两处都得撤。
--
--   策略: PII 读取一律"只能读自己或管理员"; 解绑只能解绑自己(服务端路径仍可代操作);
--   维护类函数(缓存刷新/回填)客户端一律不可调用。
-- ============================================================================

-- 只读自己或管理员(服务端一律放行: service_role 本来就是可信身份, 免得后端哪天要用却被挡)
CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_admin() OR user_id = auth.uid() OR auth.role() = 'service_role'
              THEN (SELECT email FROM auth.users WHERE id = user_id) END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_email_confirmed(user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_admin() OR user_id = auth.uid() OR auth.role() = 'service_role'
              THEN (SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = user_id) END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_providers(user_id UUID)
RETURNS TEXT[] LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_admin() OR user_id = auth.uid() OR auth.role() = 'service_role'
              THEN (SELECT COALESCE(array_agg(provider), ARRAY[]::TEXT[]) FROM auth.identities WHERE user_id = $1 AND provider <> 'email') END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_last_online(user_id UUID)
RETURNS TIMESTAMPTZ LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_admin() OR user_id = auth.uid() OR auth.role() = 'service_role'
              THEN (SELECT last_sign_in_at FROM auth.users WHERE id = $1) END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_last_sign_in(user_id UUID)
RETURNS TIMESTAMPTZ LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_admin() OR user_id = auth.uid() OR auth.role() = 'service_role'
              THEN (SELECT last_sign_in_at FROM auth.users WHERE id = $1) END;
$$;

-- 解绑登录身份: 前端以前把 p_user_id 当参数传, 于是谁都能解绑别人。
-- 现在这个参数只对服务端(edge function 已经校验过调用者)有意义, 其他身份一律用 auth.uid()。
CREATE OR REPLACE FUNCTION public.unlink_oauth_identity(p_provider TEXT, p_user_id TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_target TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_target := p_user_id;
  ELSE
    -- 邮箱身份是密码登录的根, 不允许自行解绑(要换绑走邮箱变更流程)
    IF p_provider = 'email' THEN RAISE EXCEPTION '邮箱身份不能自行解绑'; END IF;
    v_target := auth.uid()::text;
  END IF;
  IF v_target IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  DELETE FROM auth.identities WHERE provider = p_provider AND user_id::text = v_target;
END $$;

-- 撤销: PUBLIC(默认授权) + anon/authenticated(Supabase 默认权限) 都要撤
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_email_confirmed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_providers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_last_online(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_last_sign_in(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email_confirmed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_providers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_last_online(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_last_sign_in(uuid) TO authenticated;

-- 公开资料卡这几个是给"看别人的昵称/头像"用的, 保留 authenticated, 但别让 anon 也能刷
REVOKE EXECUTE ON FUNCTION public.get_profile_cards(UUID[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_nicknames(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_cards(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_nicknames(UUID[]) TO authenticated;

-- 维护类: 只由触发器/服务端调用, 客户端没有理由能触发全表重建
REVOKE EXECUTE ON FUNCTION public.backfill_daily_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_question_meta_cache() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_kp_question_map() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_daily_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_resource_rag_chunks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_dup_cache_question(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_dup_cache(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
-- 但 anon 必须留着: 好几条 RLS 策略里调用了 is_admin()(例如 profiles_select_own),
-- anon 请求时若没有执行权, 查询会直接报 "permission denied for function" 而不是干净地返回 0 行。
-- 对 anon 来说它恒为 false, 给了也不泄露任何东西。
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 早期那几处 REVOKE FROM anon 撤不掉 PUBLIC 的授权, 这里补齐(这些函数内部有 is_admin() 校验,
-- 所以没有实际漏洞, 但读代码的人不该被误导)
REVOKE EXECUTE ON FUNCTION public.scan_question_duplicates(text, numeric, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_dup_review(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_dup_questions(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.keep_dup_group(uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_kp_question_refs(text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_kp_resource_refs(text, text, jsonb) FROM PUBLIC, anon;

-- ============================================================================
-- Section 69: storage `files` 桶 —— 从"整个桶"收到"自己那层目录"
--   原来的三条策略只判 bucket_id, 于是任何登录用户都能: 列举/下载别人的上传、
--   **删掉别人的对象**(正在解析的临时文件也会被删), 以及往公共桶里传任意内容
--   (桶是 public, 借平台域名托管什么都行)。
--   现在: 对象路径按上传者分目录(mineru-temp/<uid>/…, 见 src/lib/ai/mineru.ts),
--   策略只放行"自己那一层", 管理员不受限。
--   历史对象在老路径上(mineru-temp/<ts>-<name>), 用户已无法删改, 只能由管理员/服务端清理。
-- ============================================================================
DROP POLICY IF EXISTS files_select_auth ON storage.objects;
DROP POLICY IF EXISTS files_insert_auth ON storage.objects;
DROP POLICY IF EXISTS files_delete_auth ON storage.objects;
DROP POLICY IF EXISTS allow_upload ON storage.objects;
DROP POLICY IF EXISTS files_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS files_rw_own ON storage.objects;
CREATE POLICY files_rw_own ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'files'
    -- 路径形如 mineru-temp/<uid>/…, 所以判"路径里有没有自己这一层"而不是固定第几段
    AND (public.is_admin() OR auth.uid()::text = ANY (storage.foldername(name)))
  )
  WITH CHECK (
    bucket_id = 'files'
    AND (public.is_admin() OR auth.uid()::text = ANY (storage.foldername(name)))
  );

-- ============================================================================
-- Section 70: 二审剩下的几处 —— 登录日志限流、题库归属、空库首人成管理员
-- ============================================================================

-- 70.1 二次验证的限流落到库里。
--   原来 verify-totp 用的是 per-isolate 的内存 Map, 键还是 x-forwarded-for 的第一跳 ——
--   边缘实例短命又横向扩展, 计数器既不持久也不全局; 而 security_sb_forwarded_for_enabled=false,
--   那个头调用方可以自己写, 换个头就"重置"了。对"拿到密码后暴力试 6 位 TOTP"这个真实场景等于没有。
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL,
  kind       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
-- 不给任何策略: 只有服务端(service_role)读写
CREATE INDEX IF NOT EXISTS idx_auth_attempts_lookup ON public.auth_attempts(user_id, kind, created_at DESC);

CREATE OR REPLACE FUNCTION public.auth_attempt(
  p_user_id UUID,
  p_kind TEXT,
  p_window_seconds INTEGER DEFAULT 300
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing user'; END IF;
  INSERT INTO public.auth_attempts(user_id, kind) VALUES (p_user_id, p_kind);
  SELECT COUNT(*) INTO v_count
    FROM public.auth_attempts
   WHERE user_id = p_user_id
     AND kind = p_kind
     AND created_at > NOW() - make_interval(secs => GREATEST(p_window_seconds, 1));
  -- 顺手清掉过期记录, 免得这张表只涨不消
  DELETE FROM public.auth_attempts WHERE created_at < NOW() - INTERVAL '1 day';
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.auth_attempt(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_attempt(uuid, text, integer) TO service_role;

-- 70.4 自习室的两个判定函数不再接受"别人的 user_id"。
--   它们被 RLS 策略调用(策略里传的就是 auth.uid()), 但因为是默认的 PUBLIC 可执行, 谁都能
--   拿任意 (room_id, user_id) 组合去问"这个人在不在这间房" —— 一个成员关系预言机。
--   加上"只能问自己"之后, 策略行为不变, 预言机没了。
CREATE OR REPLACE FUNCTION public.is_study_room_member(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_room_members m
     WHERE m.room_id = p_room_id
       AND m.user_id = p_user_id
       AND (auth.role() = 'service_role' OR p_user_id = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_study_room_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_study_room_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_study_room_owner(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_rooms r
     WHERE r.id = p_room_id
       AND r.owner_id = p_user_id
       AND (auth.role() = 'service_role' OR p_user_id = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_study_room_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_study_room_owner(uuid, uuid) TO authenticated, service_role;

-- 70.2 题库归属: 原策略只要求"已登录", 于是可以建一个挂在别人名下的题库
-- (公开题库随后会显示成那个人的), 而自己又改不动它(update 策略要求 created_by = auth.uid())。
DROP POLICY IF EXISTS qb_insert ON public.question_banks;
CREATE POLICY qb_insert ON public.question_banks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 70.3 "第一个人自动成为管理员"的判据换个表。
--   原来数的是 public.profiles —— 而这张表是能被清空的(admin-delete-user 会删 profile,
--   手工清数据同理), 一旦为空, 下一个注册的人就直接拿到管理员。改数 auth.users:
--   只有"这个项目至今只有你一个账号"才命中, 即真正全新的库。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE existing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM auth.users WHERE id <> NEW.id;
  IF existing_count = 0 THEN
    INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Section 71: RAG 管理页 —— 索引概览与清空
--   原来只有资料库管理页那颗「重建检索索引」: 它能建, 却答不出管理一份索引真正要问的问题 ——
--   现在索引了多少块、哪些块还没算上向量、占多大、最后同步在什么时候, 以及不想要了怎么删
--   (以前只能手工 SQL)。
--
--   概览必须走函数: 前端的 count(*) 拿不到 pg_column_size 这种行级占用, 也分不出"总数"和
--   "已算向量数" —— 而这两者的差正是 embedding 欠费/中断留下的半拉索引: 它不报错, 只是那部分
--   内容永远搜不到, 是最需要被看见的一种坏法。
--
--   SECURITY DEFINER 里**不能**拿 current_user 判管理员: 属主(postgres)会让它恒真, 等于没有
--   守卫(见 Section 66 的教训)。这里只认 is_admin() 和"确实没有 JWT"的两种身份。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rag_admin_stats()
RETURNS TABLE (
  source         TEXT,
  chunks         BIGINT,
  embedded       BIGINT,
  unembedded     BIGINT,
  content_bytes  BIGINT,
  last_embedded  TIMESTAMPTZ,
  last_created   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT c.source,
         count(*),
         count(c.embedding),
         count(*) - count(c.embedding),
         coalesce(sum(pg_column_size(c.content)), 0)::bigint,
         max(c.embedded_at),
         max(c.created_at)
    FROM public.rag_chunks c
   GROUP BY c.source
   ORDER BY c.source;
$$;

-- 清空: p_source 为 null 就是整表。返回真正删掉的块数, 让前端能确认"确实删干净了"。
CREATE OR REPLACE FUNCTION public.rag_clear_index(p_source TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_deleted BIGINT;
BEGIN
  -- 放行: 管理员, 以及直连 SQL / 服务端(没有 JWT claims, 例如 supabase db query 与迁移)
  IF NOT (public.is_admin() OR auth.role() IS NULL OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.rag_chunks WHERE p_source IS NULL OR source = p_source;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE EXECUTE ON FUNCTION public.rag_admin_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rag_admin_stats() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rag_clear_index(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rag_clear_index(text) TO authenticated;

-- ============================================================================
-- Section 72: AI 用量埋点 —— 调用日志、趋势与成本
--   「AI 接入管理」页要做看板, 而在此之前平台**一条调用记录都没有**: 既不知道谁在用、
--   哪个功能在烧额度, 也说不清"这个月花了多少"。所以先落一张事实表。
--
--   为什么记在服务端(ai 代理函数)而不是前端: 平台模型全部经 /functions/v1/ai 转发(见该函数
--   注释), 那里一次请求就能拿到 调用者 / 模型名 / 状态码 / 耗时 / 上游返回的 usage ——
--   前端那十几处 generateText 调用点一行都不用改, 也改不出"漏记"。
--
--   成本为什么用一张单价表而不是写死: 单价会随厂商调价、也随你的结算方式变。留表 = 改一行
--   SQL 就改口径, 而且页面上能把"按什么单价算出来的"摊开给人看。没有单价记录的模型成本记 0,
--   页面会把这类模型标出来 —— 宁可显示"未定价", 也不要编一个数字。
--
--   权限: 普通用户只看自己的行(自己的用量本来就不该给别人看), 管理员看全部; 写入只有服务端
--   (service_role 绕过 RLS), 客户端一条写策略都不留 —— 否则"用量"就成了客户端随便填的数字。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL,
  model             TEXT NOT NULL DEFAULT '',
  -- 调用场景(小Q 对话 / AI 导题 / 简答批改 …), 由前端在 x-ai-source 头里带, 见 src/lib/ai/config.ts
  source            TEXT,
  ok                BOOLEAN NOT NULL DEFAULT TRUE,
  status_code       INTEGER,
  latency_ms        INTEGER,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON public.ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_time      ON public.ai_usage(created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_select_own ON public.ai_usage;
CREATE POLICY ai_usage_select_own ON public.ai_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 单价表: 每百万 tokens 的价(与厂商报价口径一致, 免得在 SQL 里反复折算)
CREATE TABLE IF NOT EXISTS public.ai_model_prices (
  model         TEXT PRIMARY KEY,
  input_per_1m  NUMERIC(12,4) NOT NULL DEFAULT 0,
  output_per_1m NUMERIC(12,4) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'CNY',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_model_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prices_select ON public.ai_model_prices;
CREATE POLICY ai_prices_select ON public.ai_model_prices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ai_prices_write_admin ON public.ai_model_prices;
CREATE POLICY ai_prices_write_admin ON public.ai_model_prices FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 初始单价: 只填平台实际在用的 DeepSeek(代理出口固定走它), 单位 元/百万 tokens。
-- 这两个是**公开标价**的初值, 不是你的结算价 —— 改成自己的价格只需 UPDATE 这一张表。
INSERT INTO public.ai_model_prices (model, input_per_1m, output_per_1m) VALUES
  ('deepseek-chat',     2.0000,  8.0000),
  ('deepseek-reasoner', 4.0000, 16.0000)
ON CONFLICT (model) DO NOTHING;

/**
 * 看板要的全部聚合, 一次调用拿回。
 *
 * 为什么返回 JSONB 而不是几张表: 页面一次要四样东西(总计、按天趋势、按模型占比、最近日志),
 * 分成四条 RPC 就是四次往返、而且四份数据之间还可能对不上(跨秒边界); 在这里一次算完天然一致。
 *
 * 权限靠 RLS 而不是函数里判管理员: 它是 SECURITY INVOKER, 读 ai_usage 时策略照常生效 ——
 * 普通用户拿到的是自己的数, 管理员拿到全站, 同一段 SQL 不用分叉。
 */
CREATE OR REPLACE FUNCTION public.ai_usage_overview(p_days INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH span AS (
  SELECT GREATEST(COALESCE(p_days, 7), 1)::INTEGER AS days
),
b AS (
  SELECT days,
         (CURRENT_DATE - (days - 1))::TIMESTAMPTZ AS cur_from,
         (CURRENT_DATE + 1)::TIMESTAMPTZ          AS cur_to,
         (CURRENT_DATE - (2 * days - 1))::TIMESTAMPTZ AS prv_from
  FROM span
),
scoped AS (
  SELECT u.id, u.model, u.source, u.ok, u.status_code, u.latency_ms, u.created_at,
         COALESCE(u.prompt_tokens, 0)     AS prompt_tokens,
         COALESCE(u.completion_tokens, 0) AS completion_tokens,
         (u.created_at >= b.cur_from)     AS in_current,
         ((COALESCE(u.prompt_tokens, 0) * COALESCE(pr.input_per_1m, 0)
           + COALESCE(u.completion_tokens, 0) * COALESCE(pr.output_per_1m, 0)) / 1000000.0)::NUMERIC(14,4) AS cost,
         (pr.model IS NOT NULL) AS priced
    FROM public.ai_usage u
    CROSS JOIN b
    LEFT JOIN public.ai_model_prices pr ON pr.model = u.model
   WHERE u.created_at >= b.prv_from AND u.created_at < b.cur_to
),
cur AS (SELECT * FROM scoped WHERE in_current),
prv AS (SELECT * FROM scoped WHERE NOT in_current),
totals AS (
  SELECT jsonb_build_object(
    'calls',          count(*),
    'failed',         count(*) FILTER (WHERE NOT ok),
    'prompt_tokens',  COALESCE(sum(prompt_tokens), 0),
    'completion_tokens', COALESCE(sum(completion_tokens), 0),
    'tokens',         COALESCE(sum(prompt_tokens + completion_tokens), 0),
    'cost',           COALESCE(round(sum(cost), 4), 0),
    'avg_latency_ms', COALESCE(round(avg(latency_ms) FILTER (WHERE ok AND latency_ms IS NOT NULL)), 0),
    'unpriced_calls', count(*) FILTER (WHERE NOT priced)
  ) AS v FROM cur
),
prev AS (
  SELECT jsonb_build_object(
    'calls',  count(*),
    'tokens', COALESCE(sum(prompt_tokens + completion_tokens), 0),
    'cost',   COALESCE(round(sum(cost), 4), 0)
  ) AS v FROM prv
),
days_series AS (
  SELECT generate_series((SELECT cur_from::DATE FROM b), CURRENT_DATE, INTERVAL '1 day')::DATE AS day
),
daily_totals AS (
  SELECT created_at::DATE AS day,
         count(*) AS calls,
         count(*) FILTER (WHERE NOT ok) AS failed,
         COALESCE(sum(prompt_tokens + completion_tokens), 0) AS tokens,
         COALESCE(round(sum(cost), 4), 0) AS cost
    FROM cur GROUP BY 1
),
daily_models AS (
  SELECT day, jsonb_object_agg(model, calls) AS by_model
    FROM (SELECT created_at::DATE AS day, model, count(*) AS calls FROM cur GROUP BY 1, 2) t
   GROUP BY day
),
daily AS (
  SELECT jsonb_agg(jsonb_build_object(
           'day',      d.day,
           'calls',    COALESCE(t.calls, 0),
           'failed',   COALESCE(t.failed, 0),
           'tokens',   COALESCE(t.tokens, 0),
           'cost',     COALESCE(t.cost, 0),
           'by_model', COALESCE(m.by_model, '{}'::JSONB)
         ) ORDER BY d.day) AS v
    FROM days_series d
    LEFT JOIN daily_totals t ON t.day = d.day
    LEFT JOIN daily_models m ON m.day = d.day
),
model_rows AS (
  SELECT model,
         count(*) AS calls,
         COALESCE(sum(prompt_tokens + completion_tokens), 0) AS tokens,
         COALESCE(round(sum(cost), 4), 0) AS cost,
         COALESCE(round(avg(latency_ms) FILTER (WHERE ok AND latency_ms IS NOT NULL)), 0) AS avg_latency_ms,
         bool_and(priced) AS priced
    FROM cur GROUP BY model
   ORDER BY calls DESC
   LIMIT 8
),
models AS (
  SELECT jsonb_agg(jsonb_build_object(
           'model',         m.model,
           'calls',         m.calls,
           'tokens',        m.tokens,
           'cost',          m.cost,
           'avg_latency_ms', m.avg_latency_ms,
           'priced',        m.priced,
           'share',         CASE WHEN (SELECT sum(calls) FROM model_rows) > 0
                                 THEN round(m.calls::NUMERIC / (SELECT sum(calls) FROM model_rows), 4)
                                 ELSE 0 END
         ) ORDER BY m.calls DESC) AS v
    FROM model_rows m
),
recent AS (
  SELECT jsonb_agg(jsonb_build_object(
           'id',          r.id,
           'model',       r.model,
           'source',      r.source,
           'ok',          r.ok,
           'status_code', r.status_code,
           'latency_ms',  r.latency_ms,
           'tokens',      r.prompt_tokens + r.completion_tokens,
           'created_at',  r.created_at
         ) ORDER BY r.created_at DESC) AS v
    FROM (SELECT * FROM cur ORDER BY created_at DESC LIMIT 12) r
)
SELECT jsonb_build_object(
  'days',   (SELECT days FROM b),
  'totals', (SELECT v FROM totals),
  'prev',   (SELECT v FROM prev),
  'daily',  COALESCE((SELECT v FROM daily), '[]'::JSONB),
  'models', COALESCE((SELECT v FROM models), '[]'::JSONB),
  'recent', COALESCE((SELECT v FROM recent), '[]'::JSONB)
);
$$;

REVOKE EXECUTE ON FUNCTION public.ai_usage_overview(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ai_usage_overview(integer) TO authenticated;

-- ============================================================================
-- Section 73: 修回 questions 的写入 —— Section 68 回收执行权时把触发器一起带走了
--   Section 68 把 refresh_question_meta_cache / refresh_kp_question_map /
--   sync_dup_cache_question 的 EXECUTE 从 authenticated 收回, 本意是"客户端别自己
--   触发全表重建"。但 questions 上那两个触发器函数是 **SECURITY INVOKER**,
--   触发器以调用者身份执行, 里面的 PERFORM 于是在 42501 上被拒。
--   表现: 管理员在题库页删题 → PostgREST 把 42501 映射成 403, 浏览器只看到
--   "Failed to load resource: the server responded with a status of 403"。
--   删/改/增一起挂(row 级 trg_dup_cache_sync 先炸 UPDATE/INSERT, statement 级
--   trg_refresh_question_meta 炸 DELETE)。表权限和 is_admin() 都是好的, 别去查 RLS。
--
--   修法: 这两个函数只可能由 questions 的写入触发, 而该表的写策略已经限定
--   is_admin(), 所以给它们 SECURITY DEFINER 不会给客户端多开任何能力
--   (refresh_question_meta_cache 本身已经是 SECURITY DEFINER, 不新增暴露面)。
--   不要反过来给 authenticated 重新 GRANT EXECUTE —— 那正是 Section 68 要封的口子。
--   触发器函数直接调用会被 Postgres 拒掉("can only be called as triggers"),
--   所以权限维持原样即可, 这里不动 ACL。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_question_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN PERFORM public.refresh_question_meta_cache(); PERFORM public.refresh_kp_question_map(); RETURN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.trg_dup_cache_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.question_dup_cache WHERE question_id = OLD.id;
  ELSE
    PERFORM public.sync_dup_cache_question(NEW.id);
  END IF;
  RETURN NULL;
END
$$;

-- ============================================================================
-- Section 74: 试题库套卷 —— 历年真题(按年份) 与 模拟真题(按章节/知识点/综合)
--   套卷 = 「题库范围 + 组卷模板」生成出来的一份**固定题单**。范围直接取题目自身的标签:
--     历年真题: categories 里的 `YYYY年真题`(平台既有约定, 见 Section 51)
--     章节模拟: 该库里除年份标签以外的 categories
--     知识点模拟: key_points 按 [,，;；] 拆出的知识点, 走 kp_question_map 保证与
--                 平台知识点统计同一口径(不是 ILIKE 扫 key_points)
--     综合模拟: 整库
--   题单落库(question_ids)而不是每次开考重抽, 有两个理由:
--     - 同一套卷反复练, 分数才可比;
--     - 真题必须按卷面原序抽题(sample_mode='seq'), 重抽会让"完形第 3 空"变成别的题。
--   想换一套就点「重新组卷」, 已开考的 exam_sessions 各自留着当时的 question_ids 快照,
--   不受影响。template 存模板快照, 之后模板被改/删, 已生成的卷照旧能还原卷首与排版。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_bank_papers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id      UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('real', 'mock')),
  scope_type   TEXT NOT NULL
                 CHECK (scope_type IN ('year', 'chapter', 'key_point', 'comprehensive')),
  -- 仅 scope_type='year' 时有值; 年份同时冗余进 scope_values(`2024年真题`)当分类过滤用
  year         INT,
  -- 章节名 / 知识点名(可多选); 综合卷为空数组
  scope_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 该卷限定的学科, 取模板快照的整卷学科; null = 不限
  subject      TEXT[],
  duration_min INT NOT NULL DEFAULT 60,
  -- 组卷模板快照(含 sections/cover/layout)
  template     JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_ids UUID[] NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbp_bank    ON public.question_bank_papers(bank_id, kind, year DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_qbp_creator ON public.question_bank_papers(created_by);

ALTER TABLE public.question_bank_papers ENABLE ROW LEVEL SECURITY;

-- 读: 跟着试题库的可见性走(公开库的套卷人人可看可考)
DROP POLICY IF EXISTS qbp_select ON public.question_bank_papers;
CREATE POLICY qbp_select ON public.question_bank_papers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = bank_id AND (b.is_public = true OR b.created_by = auth.uid() OR public.is_admin())
  ));

-- 写: 只有库主/管理员(与 question_bank_items 同口径), 且 created_by 必须是本人
DROP POLICY IF EXISTS qbp_insert ON public.question_bank_papers;
CREATE POLICY qbp_insert ON public.question_bank_papers FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.question_banks b
      WHERE b.id = bank_id AND (b.created_by = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS qbp_update ON public.question_bank_papers;
CREATE POLICY qbp_update ON public.question_bank_papers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = bank_id AND (b.created_by = auth.uid() OR public.is_admin())
  ));

DROP POLICY IF EXISTS qbp_delete ON public.question_bank_papers;
CREATE POLICY qbp_delete ON public.question_bank_papers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = bank_id AND (b.created_by = auth.uid() OR public.is_admin())
  ));

DROP TRIGGER IF EXISTS trg_question_bank_papers_updated_at ON public.question_bank_papers;
CREATE TRIGGER trg_question_bank_papers_updated_at BEFORE UPDATE ON public.question_bank_papers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 74.1 compose_exam 加「题库范围」—— 同一个模板在某个试题库里组卷
--   新增的三个参数全部可选, 老的 6 参数命名调用行为完全不变(POST 时缺省即 NULL):
--     p_bank_id          只在指定试题库的题目里抽题
--     p_scope_categories 套卷范围分类, **硬过滤(AND)**。与分区 categories 的「回落」语义
--                        不同: 年份/章节范围必须始终生效, 不能被分区自带的 categories 顶掉,
--                        否则一份"2024 年真题卷"会混进别的年份。
--     p_key_points       知识点范围, 命中 kp_question_map
-- ============================================================================
DROP FUNCTION IF EXISTS public.compose_exam(TEXT[], TEXT[], JSONB, TEXT[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.compose_exam(
  p_subjects         TEXT[],
  p_categories       TEXT[],
  p_sections         JSONB,
  p_types            TEXT[] DEFAULT NULL,
  p_sample_mode      TEXT DEFAULT 'random',
  p_order_mode       TEXT DEFAULT 'section',
  p_bank_id          UUID DEFAULT NULL,
  p_scope_categories TEXT[] DEFAULT NULL,
  p_key_points       TEXT[] DEFAULT NULL
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
  v_sec_subjs TEXT[];
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

    -- 分区自带学科(可多选数组, 兼容旧版单字符串)时按该批学科抽题; 缺省回落整卷学科(p_subjects)
    v_sec_subjs := CASE
      WHEN jsonb_typeof(v_sec->'subject') = 'array' AND jsonb_array_length(v_sec->'subject') > 0
      THEN ARRAY(SELECT trim(x) FROM jsonb_array_elements_text(v_sec->'subject') AS x WHERE trim(x) <> '')
      WHEN jsonb_typeof(v_sec->'subject') = 'string' AND NULLIF(v_sec->>'subject', '') IS NOT NULL
      THEN ARRAY[v_sec->>'subject']
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
      WHERE (v_sec_subjs IS NOT NULL AND q.subject = ANY(v_sec_subjs)
             OR v_sec_subjs IS NULL
                AND (p_subjects IS NULL OR cardinality(p_subjects) = 0 OR q.subject = ANY(p_subjects)))
        AND ((NULLIF(v_sec->>'type', '') IS NOT NULL AND q.question_type = v_sec->>'type')
             OR (NULLIF(v_sec->>'type', '') IS NULL
                 AND (p_types IS NULL OR cardinality(p_types) = 0 OR q.question_type = ANY(p_types))))
        AND (cardinality(COALESCE(v_sec_cats, p_categories)) IS NULL
             OR cardinality(COALESCE(v_sec_cats, p_categories)) = 0
             OR q.categories ?| COALESCE(v_sec_cats, p_categories))
        AND (p_bank_id IS NULL
             OR EXISTS (SELECT 1 FROM public.question_bank_items i
                        WHERE i.bank_id = p_bank_id AND i.question_id = q.id))
        AND (p_scope_categories IS NULL OR cardinality(p_scope_categories) = 0
             OR q.categories ?| p_scope_categories)
        AND (p_key_points IS NULL OR cardinality(p_key_points) = 0
             OR EXISTS (SELECT 1 FROM public.kp_question_map m
                        WHERE m.question_id = q.id AND m.kp = ANY(p_key_points)))
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

REVOKE EXECUTE ON FUNCTION public.compose_exam(TEXT[], TEXT[], JSONB, TEXT[], TEXT, TEXT, UUID, TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compose_exam(TEXT[], TEXT[], JSONB, TEXT[], TEXT, TEXT, UUID, TEXT[], TEXT[]) TO authenticated;

-- ============================================================================
-- Section 75: 删题目/删笔记/删解读时清掉检索块 —— Section 65 只补了文献这一路
--   症状: 题库页「批量删除」直接 delete().in('id', ids), 查重合并走 RPC 里的
--   DELETE FROM questions, 两者都不经过前端那个 autoIndex 调用, 于是 rag_chunks 里
--   留下 source='question' 的孤儿块 —— 删掉的题小Q 照旧检索得到、照旧引用得出来。
--   同一条链上还有三处:
--     · 删题目会级联删掉 user_answers(ON DELETE CASCADE), 别人挂在这道题上的**公开笔记**
--       一起没了, 但 source='note' 的块留着;
--     · 收藏页/错题页改笔记走的是裸 update, 只有练习页那条(useUserAnswers)会同步;
--     · 删账号(delete-account / admin-delete-user)整批删 user_answers, 同样没人清块。
--
--   为什么四源统一放数据库这层, 而不是把前端漏掉的 autoIndex 补齐就完事:
--   前端补得完"我这页点得到"的路径, 补不完 RPC、级联、Edge Function、导入脚本 ——
--   那些地方根本没有前端代码可以下手。删块是纯 SQL, 没有算向量的代价,
--   而删除没有"稍后重试"的机会(行都没了, 差分同步再也看不到它), 所以只能在这里兜底。
--   改内容的路径仍然留在 rag-index: 那要发外部请求, 放触发器上会让保存变慢。
--
--   source_id 的拼法各源不同, 必须和 rag-index 的 chunksFor* 完全一致:
--     question / note → 行 id 的文本;  kp → '学科::知识点';  subject → 学科名。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.purge_rag_chunks_on_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_source TEXT := TG_ARGV[0];
BEGIN
  IF v_source = 'kp' THEN
    DELETE FROM public.rag_chunks WHERE source = 'kp' AND source_id = OLD.subject || '::' || OLD.kp;
  ELSIF v_source = 'subject' THEN
    DELETE FROM public.rag_chunks WHERE source = 'subject' AND source_id = OLD.subject;
  ELSE
    DELETE FROM public.rag_chunks WHERE source = v_source AND source_id = OLD.id::text;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_purge_rag_chunks ON public.questions;
CREATE TRIGGER trg_purge_rag_chunks
  AFTER DELETE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.purge_rag_chunks_on_delete('question');

DROP TRIGGER IF EXISTS trg_purge_rag_chunks ON public.user_answers;
CREATE TRIGGER trg_purge_rag_chunks
  AFTER DELETE ON public.user_answers
  FOR EACH ROW EXECUTE FUNCTION public.purge_rag_chunks_on_delete('note');

DROP TRIGGER IF EXISTS trg_purge_rag_chunks ON public.kp_explanations;
CREATE TRIGGER trg_purge_rag_chunks
  AFTER DELETE ON public.kp_explanations
  FOR EACH ROW EXECUTE FUNCTION public.purge_rag_chunks_on_delete('kp');

DROP TRIGGER IF EXISTS trg_purge_rag_chunks ON public.subject_explanations;
CREATE TRIGGER trg_purge_rag_chunks
  AFTER DELETE ON public.subject_explanations
  FOR EACH ROW EXECUTE FUNCTION public.purge_rag_chunks_on_delete('subject');

-- 存量清理: 触发器只管以后。已经在表里的孤儿块手工删一次, 之后重放这段是幂等的空操作。
-- 先按 id 文本的形态筛一下再 cast: 万一有非 uuid 的 source_id, 直接 ::uuid 会让整段报错回滚。
DELETE FROM public.rag_chunks c
WHERE c.source = 'question'
  AND (c.source_id !~ '^[0-9a-fA-F-]{36}$'
       OR NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.id = c.source_id::uuid));

DELETE FROM public.rag_chunks c
WHERE c.source = 'note'
  AND (c.source_id !~ '^[0-9a-fA-F-]{36}$'
       OR NOT EXISTS (SELECT 1 FROM public.user_answers a WHERE a.id = c.source_id::uuid));

DELETE FROM public.rag_chunks c
WHERE c.source = 'kp'
  AND NOT EXISTS (
    SELECT 1 FROM public.kp_explanations k WHERE k.subject || '::' || k.kp = c.source_id);

DELETE FROM public.rag_chunks c
WHERE c.source = 'subject'
  AND NOT EXISTS (
    SELECT 1 FROM public.subject_explanations s WHERE s.subject = c.source_id);

REVOKE EXECUTE ON FUNCTION public.purge_rag_chunks_on_delete() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Section 76: 小Q 本轮用量 —— 每条回答记 tokens, 会话维度接进「AI 接入管理」
--   需求: 对话里要看得见"这一轮花了多少", 管理页要能按会话看用量。
--
--   为什么 tokens 跟着消息再存一份(chat_messages.usage), 而不是显示时回查 ai_usage:
--   ai_usage 记的是调用者/模型/耗时, 没有"这次调用属于哪条消息"的关联, 要按时间戳去猜;
--   而用户往上翻历史问的是"当时那一轮花了多少", 每翻一次猜一次既慢又可能猜错。
--   这里**只存 tokens 和模型名, 不存金额** —— 金额由 ai_model_prices 现算,
--   否则以后改一次单价, 历史消息里的钱就和看板上的钱对不上了。
--
--   为什么 ai_usage 加一列 conversation_id 而不是建关联表: 埋点路径上只多一个可空列。
--   故意不加外键 —— 用量是账单数据, 会话被删之后这些行还得留在账上; 标题那侧按缺失显示。
-- ============================================================================
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS usage JSONB;

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS conversation_id UUID;

CREATE INDEX IF NOT EXISTS idx_ai_usage_conversation
  ON public.ai_usage(conversation_id) WHERE conversation_id IS NOT NULL;

/**
 * 看板重写: 在原来的 总计/趋势/模型/最近日志 之外加一段「按会话」。
 *
 * 为什么重写整个函数而不是再写一个 RPC: 这个函数的全部意义就是"一次调用拿回全部聚合",
 * 分成两次就可能落在不同的秒边界上, 于是卡片里的总数和下面的明细对不上。
 *
 * 会话标题 LEFT JOIN 取。取不到只有两种可能: 会话被删了, 或者管理员在看别人的会话
 * (chat_conversations 的策略只放行本人的行)。所以这里除了标题还回一个 owned ——
 * 页面据此决定要不要给"跳到会话"的链接, 以及怎么称呼这一行, 而不是让 SQL 编一句中文出来。
 */
CREATE OR REPLACE FUNCTION public.ai_usage_overview(p_days INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH span AS (
  SELECT GREATEST(COALESCE(p_days, 7), 1)::INTEGER AS days
),
b AS (
  SELECT days,
         (CURRENT_DATE - (days - 1))::TIMESTAMPTZ AS cur_from,
         (CURRENT_DATE + 1)::TIMESTAMPTZ          AS cur_to,
         (CURRENT_DATE - (2 * days - 1))::TIMESTAMPTZ AS prv_from
   FROM span
),
scoped AS (
  SELECT u.id, u.model, u.source, u.ok, u.status_code, u.latency_ms, u.created_at, u.conversation_id,
         COALESCE(u.prompt_tokens, 0)     AS prompt_tokens,
         COALESCE(u.completion_tokens, 0) AS completion_tokens,
         (u.created_at >= b.cur_from)     AS in_current,
         ((COALESCE(u.prompt_tokens, 0) * COALESCE(pr.input_per_1m, 0)
           + COALESCE(u.completion_tokens, 0) * COALESCE(pr.output_per_1m, 0)) / 1000000.0)::NUMERIC(14,4) AS cost,
         (pr.model IS NOT NULL) AS priced
    FROM public.ai_usage u
    CROSS JOIN b
    LEFT JOIN public.ai_model_prices pr ON pr.model = u.model
   WHERE u.created_at >= b.prv_from AND u.created_at < b.cur_to
),
cur AS (SELECT * FROM scoped WHERE in_current),
prv AS (SELECT * FROM scoped WHERE NOT in_current),
totals AS (
  SELECT jsonb_build_object(
    'calls',          count(*),
    'failed',         count(*) FILTER (WHERE NOT ok),
    'prompt_tokens',  COALESCE(sum(prompt_tokens), 0),
    'completion_tokens', COALESCE(sum(completion_tokens), 0),
    'tokens',         COALESCE(sum(prompt_tokens + completion_tokens), 0),
    'cost',           COALESCE(round(sum(cost), 4), 0),
    'avg_latency_ms', COALESCE(round(avg(latency_ms) FILTER (WHERE ok AND latency_ms IS NOT NULL)), 0),
    'unpriced_calls', count(*) FILTER (WHERE NOT priced)
  ) AS v FROM cur
),
prev AS (
  SELECT jsonb_build_object(
    'calls',  count(*),
    'tokens', COALESCE(sum(prompt_tokens + completion_tokens), 0),
    'cost',   COALESCE(round(sum(cost), 4), 0)
  ) AS v FROM prv
),
days_series AS (
  SELECT generate_series((SELECT cur_from::DATE FROM b), CURRENT_DATE, INTERVAL '1 day')::DATE AS day
),
daily_totals AS (
  SELECT created_at::DATE AS day,
         count(*) AS calls,
         count(*) FILTER (WHERE NOT ok) AS failed,
         COALESCE(sum(prompt_tokens + completion_tokens), 0) AS tokens,
         COALESCE(round(sum(cost), 4), 0) AS cost
    FROM cur GROUP BY 1
),
daily_models AS (
  SELECT day, jsonb_object_agg(model, calls) AS by_model
    FROM (SELECT created_at::DATE AS day, model, count(*) AS calls FROM cur GROUP BY 1, 2) t
   GROUP BY day
),
daily AS (
  SELECT jsonb_agg(jsonb_build_object(
           'day',      d.day,
           'calls',    COALESCE(t.calls, 0),
           'failed',   COALESCE(t.failed, 0),
           'tokens',   COALESCE(t.tokens, 0),
           'cost',     COALESCE(t.cost, 0),
           'by_model', COALESCE(m.by_model, '{}'::JSONB)
         ) ORDER BY d.day) AS v
    FROM days_series d
    LEFT JOIN daily_totals t ON t.day = d.day
    LEFT JOIN daily_models m ON m.day = d.day
),
model_rows AS (
  SELECT model,
         count(*) AS calls,
         COALESCE(sum(prompt_tokens + completion_tokens), 0) AS tokens,
         COALESCE(round(sum(cost), 4), 0) AS cost,
         COALESCE(round(avg(latency_ms) FILTER (WHERE ok AND latency_ms IS NOT NULL)), 0) AS avg_latency_ms,
         bool_and(priced) AS priced
    FROM cur GROUP BY model
   ORDER BY calls DESC
   LIMIT 8
),
models AS (
  SELECT jsonb_agg(jsonb_build_object(
           'model',         m.model,
           'calls',         m.calls,
           'tokens',        m.tokens,
           'cost',          m.cost,
           'avg_latency_ms', m.avg_latency_ms,
           'priced',        m.priced,
           'share',         CASE WHEN (SELECT sum(calls) FROM model_rows) > 0
                                 THEN round(m.calls::NUMERIC / (SELECT sum(calls) FROM model_rows), 4)
                                 ELSE 0 END
         ) ORDER BY m.calls DESC) AS v
    FROM model_rows m
),
recent AS (
  SELECT jsonb_agg(jsonb_build_object(
           'id',          r.id,
           'model',       r.model,
           'source',      r.source,
           'ok',          r.ok,
           'status_code', r.status_code,
           'latency_ms',  r.latency_ms,
           'tokens',      r.prompt_tokens + r.completion_tokens,
           'created_at',  r.created_at
         ) ORDER BY r.created_at DESC) AS v
    FROM (SELECT * FROM cur ORDER BY created_at DESC LIMIT 12) r
),
-- 只按 tokens 排, 不按金额: 没单价的模型金额是 0, 拿金额排会把烧得最多的会话排到看不见的地方
conv_rows AS (
  SELECT conversation_id,
         count(*) AS calls,
         COALESCE(sum(prompt_tokens + completion_tokens), 0) AS tokens,
         COALESCE(round(sum(cost), 4), 0) AS cost,
         max(created_at) AS last_at
    FROM cur
   WHERE conversation_id IS NOT NULL
   GROUP BY conversation_id
   ORDER BY tokens DESC
   LIMIT 8
),
conversations AS (
  SELECT jsonb_agg(jsonb_build_object(
           'conversation_id', r.conversation_id,
           'title',           NULLIF(c.title, ''),
           'owned',           (c.id IS NOT NULL),
           'calls',           r.calls,
           'tokens',          r.tokens,
           'cost',            r.cost,
           'last_at',         r.last_at
         ) ORDER BY r.tokens DESC) AS v
    FROM conv_rows r
    LEFT JOIN public.chat_conversations c ON c.id = r.conversation_id
)
SELECT jsonb_build_object(
  'days',   (SELECT days FROM b),
  'totals', (SELECT v FROM totals),
  'prev',   (SELECT v FROM prev),
  'daily',  COALESCE((SELECT v FROM daily), '[]'::JSONB),
  'models', COALESCE((SELECT v FROM models), '[]'::JSONB),
  'recent', COALESCE((SELECT v FROM recent), '[]'::JSONB),
  'conversations', COALESCE((SELECT v FROM conversations), '[]'::JSONB)
);
$$;

REVOKE EXECUTE ON FUNCTION public.ai_usage_overview(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ai_usage_overview(integer) TO authenticated;

-- ============================================================================
-- Section 77: 题目草稿箱 —— 写到一半的题先存着，不进正式题库
--   草稿单独一张表而不是 questions 加 status: 练习/考试/组卷/图谱十几处查询
--   都得记得排掉草稿, 漏一处草稿就漏进练习。分表则一处都不用改。
--   payload 存整个表单 (与 QuestionForm 提交的结构同形), 发布时才落进 questions。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 编辑已有题目时草稿记着原题 id, 发布时走 update 而不是再插一条
  question_id   UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL DEFAULT 'single_choice',
  question_text TEXT NOT NULL DEFAULT '',
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_drafts_updated ON public.question_drafts(updated_at DESC);

ALTER TABLE public.question_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_drafts_select_admin ON public.question_drafts;
CREATE POLICY question_drafts_select_admin ON public.question_drafts FOR SELECT
  USING (public.is_admin());
DROP POLICY IF EXISTS question_drafts_insert_admin ON public.question_drafts;
CREATE POLICY question_drafts_insert_admin ON public.question_drafts FOR INSERT
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS question_drafts_update_admin ON public.question_drafts;
CREATE POLICY question_drafts_update_admin ON public.question_drafts FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS question_drafts_delete_admin ON public.question_drafts;
CREATE POLICY question_drafts_delete_admin ON public.question_drafts FOR DELETE
  USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_question_drafts_updated_at ON public.question_drafts;
CREATE TRIGGER trg_question_drafts_updated_at BEFORE UPDATE ON public.question_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Section 78: correct_answer 放开 NULL —— 分析题本来就没有标准答案
--   症状: 出题页选「分析题」保存 → PostgREST 400, 浏览器只留下
--   "Failed to load resource: the server responded with a status of 400" 和
--   "Save question failed: Object"(错误体被 console.error 成对象, 看不到真正的原因)。
--   根因: 这一列是 NOT NULL, 而题库模型里**分析题是人工批改、没有答案**:
--     types.ts 的 CorrectAnswer 里 null 的注释就是 "analysis: manual grading";
--     answer-utils 的 getDefaultAnswer('analysis') 返回 null;
--     isAnswerCorrect 的 'analysis' 分支直接 return false, 压根不读答案。
--   于是保存必然带上 correct_answer: null → 23502 → 400。
--   受影响的写入点不止出题页: 草稿箱发布是把整份 payload 原样 insert(见 lib/question-drafts),
--   编辑老题时把类型改成分析题走的是 update, 两条路撞的是同一个约束。
--   放开约束不改变任何判分/展示行为: 读回来的 SQL NULL 与库里已有的 jsonb 'null'
--   (cloze / reading_set / sentence_order 那几条) 在 JS 里都是 null。
--   自查方法(不要只看前端提示): 对每个题型各 insert 一条并回滚, 只有 analysis 会 23502。
-- ============================================================================
ALTER TABLE public.questions ALTER COLUMN correct_answer DROP NOT NULL;

-- ============================================================================
-- Section 79: 题目 ↔ 信源的软链接 + 每题一个专属小Q 会话
--   练习模式里问小Q 解释当前题目, 这轮回答用到的「信源」(文献/题库/知识点解读/学科解读/
--   公开笔记 —— 与 rag_chunks 的 source 同一套口径) 可以挂到这道题上。题目 → 信源(题面下方
--   列出来) 和 信源 → 题目(阅读页/解读/笔记里的「关联题目」) 是**同一条边的两个方向**,
--   所以只存一张表, 反查走 (source, source_id) 那条索引。
--
--   为什么不复用 kp_question_refs(解读挂真题): 那张表左端固定是一条解读、右端固定是一道题,
--   两个字段都 NOT NULL, 挂不下"题 → 文献里那一段"这种边; 而这条边还要带定位(页码/段落/锚点)
--   与摘录快照, 形状与它完全对不上。硬塞进去会让两边都多出一堆恒为 NULL 的列。
--
--   为什么按用户分而不是全平台共用一份: 挂链是**用户自己的**学习痕迹(和笔记、收藏同一层)。
--   共用一份意味着任何人都能往所有人都看得见的题面下加内容, 就得再养一套审核; 反查也因此
--   只看得到自己挂过的题 —— 「我在这一段上挂过哪几道题」。
--
--   快照(label / sub_label / snippet / anchor)是落库那一刻的: 原文献下线、解读被改、笔记转
--   私密之后, "当初引的是这段"仍然成立, 摘录照旧可读。所以 source_id 是 TEXT 且**不加外键**
--   (多态, 和 rag_chunks 同一个理由), 行不会跟着源一起消失。
--
--   block_index 用 -1 表示"整篇/整条"(不是某一段): 唯一键里的 NULL 互不相等, 会放进重复行。
--
--   每题一个专属会话: chat_conversations.question_id 非空即"这是一道题的会话", 它不进 /assistant
--   的会话列表(那边只列 question_id IS NULL 的), 而练习页每点一次「问小Q」都回到同一个会话 ——
--   同一道题问两遍不该在侧栏留下一串一次性的会话。
-- ============================================================================
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE;

-- 一题一会话: 找会话靠这条唯一索引, 不会有第二条
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conv_question
  ON public.chat_conversations(user_id, question_id)
  WHERE question_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.question_source_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  -- 与 rag_chunks 的 source 同一套取值, 前端 types/rag 的 RagSource 就是这五个
  source      TEXT NOT NULL CHECK (source IN ('resource', 'question', 'kp', 'subject', 'note')),
  source_id   TEXT NOT NULL,
  block_index INTEGER NOT NULL DEFAULT -1,
  page_no     INTEGER,
  label       TEXT NOT NULL DEFAULT '',
  sub_label   TEXT,
  anchor      TEXT,
  snippet     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  -- 谁挂的: 小Q 回答里一键挂的, 还是用户自己搜出来挑的
  origin      TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'littleq')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 题面下方那张清单
CREATE INDEX IF NOT EXISTS idx_qsl_question ON public.question_source_links(user_id, question_id);
-- 信源侧反查"这一段/这条解读上挂了哪些题"
CREATE INDEX IF NOT EXISTS idx_qsl_source ON public.question_source_links(source, source_id);
-- 同一道题的同一个信源(同一段)只挂一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsl_uniq
  ON public.question_source_links(user_id, question_id, source, source_id, block_index);

ALTER TABLE public.question_source_links ENABLE ROW LEVEL SECURITY;

-- 归属靠 user_id 直接判, 不需要反查会话那种 EXISTS
DROP POLICY IF EXISTS qsl_own ON public.question_source_links;
CREATE POLICY qsl_own ON public.question_source_links FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Section 80: 知识点范围 —— 把文献里的「一节/一段区间」指定给它所属的知识点
--   管理员在资料库阅读页圈范围: 「A14-医学教育教学概论与现代医学教育思想 = 《医学导论》第六章
--   (第 74-90 页)」。有了这条边, 知识点才知道自己的材料长在哪 —— 阅读时知道这一段属于哪个
--   知识点, 从知识点能反查到材料在哪几篇哪几段, 题目、专题、路线图都能一跳直达那一段。
--
--   为什么不复用 kp_resource_refs(知识点解读的「依据原文」): 那张表的复合外键指向
--   kp_explanations, **必须先有一条解读正文**才挂得上; 而"这一段讲的是 A14"与"解读引用了
--   这一段"是两件事 —— 大纲里有几百个知识点, 绝大多数不会写解读, 却都需要材料落点。
--   语义也不同: 依据是"论证支持", 范围是"归属/边界", 前者可以只引一段话。
--
--   为什么写成段落闭区间 [block_from, block_to] 而不是目录项外键: 目录可以被改成人工版、
--   重新解析后 block_index 会整体重排, 而范围必须能在那一刻自己活下来 —— 出题/练习范围切错
--   一段是"静默错"。所以区间是权威值, toc_title 只是圈的时候顺手记下的来路(展示与找回用)。
--
--   可见性: 写只有管理员(与人工目录同一口径), **读对所有登录用户开放** —— 范围的意义就在于
--   别人能顺着它跳过来(己发布文献才看得到, 未发布草稿的范围跟着 doc 的可见性走)。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.resource_kp_scopes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.resource_documents(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  kp          TEXT NOT NULL,
  -- 正文里的段落闭区间(含两端); 一键圈一节时就是"该目录项 → 下一个同级目录项之前"
  block_from  INTEGER NOT NULL,
  block_to    INTEGER NOT NULL,
  -- 页码冗余一份: 重新解析后段落映射失效时, 至少还能翻到那一页(与 kp_resource_refs 同一个理由)
  page_from   INTEGER NOT NULL DEFAULT 1,
  page_to     INTEGER NOT NULL DEFAULT 1,
  -- 圈的时候用的是哪条目录项(纯分组项也可以圈, 那是按页码区间记的)
  toc_title   TEXT NOT NULL DEFAULT '',
  toc_level   SMALLINT NOT NULL DEFAULT 1,
  note        TEXT NOT NULL DEFAULT '',
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (block_to >= block_from),
  CHECK (page_to >= page_from)
);

CREATE INDEX IF NOT EXISTS idx_rks_doc ON public.resource_kp_scopes(document_id, block_from);
-- 知识点那一侧的反查: "A14 的材料在哪几篇哪几段"
CREATE INDEX IF NOT EXISTS idx_rks_kp  ON public.resource_kp_scopes(subject, kp, document_id);
-- 同一篇的同一段不重复挂同一个知识点(重复圈不会报错, 但也别堆垃圾)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rks_uniq
  ON public.resource_kp_scopes(document_id, subject, kp, block_from, block_to);

ALTER TABLE public.resource_kp_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rks_select ON public.resource_kp_scopes;
CREATE POLICY rks_select ON public.resource_kp_scopes FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.resource_documents d
                 WHERE d.id = document_id AND (d.is_published OR public.is_admin()))
  );

DROP POLICY IF EXISTS rks_write_admin ON public.resource_kp_scopes;
CREATE POLICY rks_write_admin ON public.resource_kp_scopes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_resource_kp_scopes_updated_at ON public.resource_kp_scopes;
CREATE TRIGGER trg_resource_kp_scopes_updated_at BEFORE UPDATE ON public.resource_kp_scopes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Section 81: RLS 性能修复 —— 策略里的 helper 函数包成 (select ...)
-- ============================================================================
-- 背景(2026-09 实测,自建 Supabase CE 2C4G,与线上同 schema 同规模数据):
--   策略里裸写 auth.uid() / auth.role() / is_admin() 会被 Postgres 逐行求值, 而
--   is_admin() 内部是 EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'),
--   于是退化成"每行查一次 profiles"。包成 (select ...) 后变成 InitPlan, 整个查询只求值一次。
--
--   本地实测:
--     user_answers LIMIT 50     396 ms  ->  1 ms          (~100x)
--     search_rag                581-1021 ms -> 94-148 ms   (~7x)
--     search_resource_blocks    2040 ms -> ~200 ms          (~10x)
--   端到端(2 核, 100 虚拟用户真实配比):
--     200 用户 14.80% 错误 -> 300 用户 0.00% / 400 用户 0.88%
--
--   线上托管版实测(同一用户, 中位耗时, 三次一致):
--     user_answers     294 ms -> 92-107 ms   (DB 侧 ~200ms -> ~0, 余下是到 ap-southeast-1 的网络地板)
--     rpc search_rag   1444 ms -> 170-172 ms  (8.4x)
--     fn rag-search    2994 ms -> 1492-1872 ms (2x, 余下主要是外部 embedding API)
--
-- 语义: 只改表达式, 不动 roles/cmd, 所以"谁能访问"完全不变。
-- 已回归验证: 读 5 张表正常; 合法写入 201 -> 读回 200 -> 删除 204;
--            伪造成他人 user_id 写入被 403 RLS 拒绝; 中心判题 accepted。
--
-- 注意: 跨表引用型策略(如 resource_blocks.rb_select 的 EXISTS 子查询)即使包了
--   (select ...) 仍会让规划器放弃 trigram 索引并执行 32 万次关联子计划。
--   该表的进一步优化(改成 document_id = ANY (ARRAY(...)) 或反范式化)未包含在本节。
-- ============================================================================

DROP POLICY IF EXISTS "ai_prices_select" ON public."ai_model_prices";
CREATE POLICY "ai_prices_select" ON public."ai_model_prices" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ai_prices_write_admin" ON public."ai_model_prices";
CREATE POLICY "ai_prices_write_admin" ON public."ai_model_prices" AS PERMISSIVE FOR ALL TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "ai_usage_select_own" ON public."ai_usage";
CREATE POLICY "ai_usage_select_own" ON public."ai_usage" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "chat_conv_own" ON public."chat_conversations";
CREATE POLICY "chat_conv_own" ON public."chat_conversations" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "chat_msg_own" ON public."chat_messages";
CREATE POLICY "chat_msg_own" ON public."chat_messages" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_messages.conversation_id) AND (c.user_id = (select auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM chat_conversations c
  WHERE ((c.id = chat_messages.conversation_id) AND (c.user_id = (select auth.uid()))))));
DROP POLICY IF EXISTS "exam_schedules_own_rw" ON public."exam_schedules";
CREATE POLICY "exam_schedules_own_rw" ON public."exam_schedules" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "exam_sessions_own" ON public."exam_sessions";
CREATE POLICY "exam_sessions_own" ON public."exam_sessions" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "exam_templates_own_rw" ON public."exam_templates";
CREATE POLICY "exam_templates_own_rw" ON public."exam_templates" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "favorites_own" ON public."favorites";
CREATE POLICY "favorites_own" ON public."favorites" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "fs_delete" ON public."focus_sessions";
CREATE POLICY "fs_delete" ON public."focus_sessions" AS PERMISSIVE FOR DELETE TO public USING (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "fs_insert" ON public."focus_sessions";
CREATE POLICY "fs_insert" ON public."focus_sessions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "fs_select" ON public."focus_sessions";
CREATE POLICY "fs_select" ON public."focus_sessions" AS PERMISSIVE FOR SELECT TO public USING (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "fs_update" ON public."focus_sessions";
CREATE POLICY "fs_update" ON public."focus_sessions" AS PERMISSIVE FOR UPDATE TO public USING (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "kp_explanations_select_all" ON public."kp_explanations";
CREATE POLICY "kp_explanations_select_all" ON public."kp_explanations" AS PERMISSIVE FOR SELECT TO public USING (((select auth.role()) = 'authenticated'::text));
DROP POLICY IF EXISTS "kp_explanations_write_admin" ON public."kp_explanations";
CREATE POLICY "kp_explanations_write_admin" ON public."kp_explanations" AS PERMISSIVE FOR ALL TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "kqm_select" ON public."kp_question_map";
CREATE POLICY "kqm_select" ON public."kp_question_map" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "kqr_select" ON public."kp_question_refs";
CREATE POLICY "kqr_select" ON public."kp_question_refs" AS PERMISSIVE FOR SELECT TO public USING (((select auth.role()) = 'authenticated'::text));
DROP POLICY IF EXISTS "kqr_write_admin" ON public."kp_question_refs";
CREATE POLICY "kqr_write_admin" ON public."kp_question_refs" AS PERMISSIVE FOR ALL TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "krr_select" ON public."kp_resource_refs";
CREATE POLICY "krr_select" ON public."kp_resource_refs" AS PERMISSIVE FOR SELECT TO public USING ((((select auth.role()) = 'authenticated'::text) AND ((select is_admin()) OR (document_id IS NULL) OR (EXISTS ( SELECT 1
   FROM resource_documents d
  WHERE ((d.id = kp_resource_refs.document_id) AND d.is_published))))));
DROP POLICY IF EXISTS "krr_write_admin" ON public."kp_resource_refs";
CREATE POLICY "krr_write_admin" ON public."kp_resource_refs" AS PERMISSIVE FOR ALL TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "lrq_delete" ON public."learning_route_questions";
CREATE POLICY "lrq_delete" ON public."learning_route_questions" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "lrq_insert" ON public."learning_route_questions";
CREATE POLICY "lrq_insert" ON public."learning_route_questions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "lrq_select" ON public."learning_route_questions";
CREATE POLICY "lrq_select" ON public."learning_route_questions" AS PERMISSIVE FOR SELECT TO public USING ((((select auth.role()) = 'authenticated'::text) AND ((select is_admin()) OR (EXISTS ( SELECT 1
   FROM (learning_route_stages s
     JOIN learning_routes r ON ((r.id = s.route_id)))
  WHERE ((s.id = learning_route_questions.stage_id) AND r.is_published))))));
DROP POLICY IF EXISTS "lrq_update" ON public."learning_route_questions";
CREATE POLICY "lrq_update" ON public."learning_route_questions" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "lrs_delete" ON public."learning_route_stages";
CREATE POLICY "lrs_delete" ON public."learning_route_stages" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "lrs_insert" ON public."learning_route_stages";
CREATE POLICY "lrs_insert" ON public."learning_route_stages" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "lrs_select" ON public."learning_route_stages";
CREATE POLICY "lrs_select" ON public."learning_route_stages" AS PERMISSIVE FOR SELECT TO public USING ((((select auth.role()) = 'authenticated'::text) AND ((select is_admin()) OR (EXISTS ( SELECT 1
   FROM learning_routes r
  WHERE ((r.id = learning_route_stages.route_id) AND r.is_published))))));
DROP POLICY IF EXISTS "lrs_update" ON public."learning_route_stages";
CREATE POLICY "lrs_update" ON public."learning_route_stages" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "lr_delete" ON public."learning_routes";
CREATE POLICY "lr_delete" ON public."learning_routes" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "lr_insert" ON public."learning_routes";
CREATE POLICY "lr_insert" ON public."learning_routes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "lr_select" ON public."learning_routes";
CREATE POLICY "lr_select" ON public."learning_routes" AS PERMISSIVE FOR SELECT TO public USING ((((select auth.role()) = 'authenticated'::text) AND (is_published OR (select is_admin()))));
DROP POLICY IF EXISTS "lr_update" ON public."learning_routes";
CREATE POLICY "lr_update" ON public."learning_routes" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "Users can delete own history" ON public."parse_history";
CREATE POLICY "Users can delete own history" ON public."parse_history" AS PERMISSIVE FOR DELETE TO public USING (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "Users can insert own history" ON public."parse_history";
CREATE POLICY "Users can insert own history" ON public."parse_history" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "Users can read own history" ON public."parse_history";
CREATE POLICY "Users can read own history" ON public."parse_history" AS PERMISSIVE FOR SELECT TO public USING (((select auth.uid()) = user_id));
DROP POLICY IF EXISTS "parse_history_own" ON public."parse_history";
CREATE POLICY "parse_history_own" ON public."parse_history" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "pkc_own" ON public."passkey_credentials";
CREATE POLICY "pkc_own" ON public."passkey_credentials" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid())));
-- practice_daily_assignments 的策略不在这里建: 该表直到 Section 83 才 CREATE TABLE,
-- 而 DROP POLICY 即使带 IF EXISTS 也不容忍"表不存在"(只容忍"策略不存在")。
-- 本文件是从生产目录导出后追加拼接的, 导出顺序不等于拓扑顺序, 所以这两条必须删掉,
-- 交给 Section 83 里建表之后再建(那边有等价的同名策略)。
DROP POLICY IF EXISTS "pss_own" ON public."practice_sequential_state";
CREATE POLICY "pss_own" ON public."practice_sequential_state" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "profiles_insert_own" ON public."profiles";
CREATE POLICY "profiles_insert_own" ON public."profiles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((id = (select auth.uid())) AND (role = 'user'::text)));
DROP POLICY IF EXISTS "profiles_select_own" ON public."profiles";
CREATE POLICY "profiles_select_own" ON public."profiles" AS PERMISSIVE FOR SELECT TO public USING (((id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "profiles_update_admin" ON public."profiles";
CREATE POLICY "profiles_update_admin" ON public."profiles" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "profiles_update_own" ON public."profiles";
CREATE POLICY "profiles_update_own" ON public."profiles" AS PERMISSIVE FOR UPDATE TO public USING ((id = (select auth.uid()))) WITH CHECK ((id = (select auth.uid())));
DROP POLICY IF EXISTS "push_subscriptions_own_rw" ON public."push_subscriptions";
CREATE POLICY "push_subscriptions_own_rw" ON public."push_subscriptions" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "qr_insert" ON public."qr_login_tokens";
CREATE POLICY "qr_insert" ON public."qr_login_tokens" AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (((status = 'pending'::text) AND (user_id IS NULL) AND (secret_hash IS NOT NULL)));
DROP POLICY IF EXISTS "qbi_delete" ON public."question_bank_items";
CREATE POLICY "qbi_delete" ON public."question_bank_items" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM question_banks
  WHERE ((question_banks.id = question_bank_items.bank_id) AND ((question_banks.created_by = (select auth.uid())) OR (select is_admin()))))));
DROP POLICY IF EXISTS "qbi_insert" ON public."question_bank_items";
CREATE POLICY "qbi_insert" ON public."question_bank_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM question_banks
  WHERE ((question_banks.id = question_bank_items.bank_id) AND ((question_banks.created_by = (select auth.uid())) OR (select is_admin()))))));
DROP POLICY IF EXISTS "qbi_select" ON public."question_bank_items";
CREATE POLICY "qbi_select" ON public."question_bank_items" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM question_banks
  WHERE ((question_banks.id = question_bank_items.bank_id) AND ((question_banks.is_public = true) OR (question_banks.created_by = (select auth.uid())) OR (select is_admin()))))));
DROP POLICY IF EXISTS "qbp_delete" ON public."question_bank_papers";
CREATE POLICY "qbp_delete" ON public."question_bank_papers" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM question_banks b
  WHERE ((b.id = question_bank_papers.bank_id) AND ((b.created_by = (select auth.uid())) OR (select is_admin()))))));
DROP POLICY IF EXISTS "qbp_insert" ON public."question_bank_papers";
CREATE POLICY "qbp_insert" ON public."question_bank_papers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM question_banks b
  WHERE ((b.id = question_bank_papers.bank_id) AND ((b.created_by = (select auth.uid())) OR (select is_admin())))))));
DROP POLICY IF EXISTS "qbp_select" ON public."question_bank_papers";
CREATE POLICY "qbp_select" ON public."question_bank_papers" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM question_banks b
  WHERE ((b.id = question_bank_papers.bank_id) AND ((b.is_public = true) OR (b.created_by = (select auth.uid())) OR (select is_admin()))))));
DROP POLICY IF EXISTS "qbp_update" ON public."question_bank_papers";
CREATE POLICY "qbp_update" ON public."question_bank_papers" AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM question_banks b
  WHERE ((b.id = question_bank_papers.bank_id) AND ((b.created_by = (select auth.uid())) OR (select is_admin()))))));
DROP POLICY IF EXISTS "qb_delete" ON public."question_banks";
CREATE POLICY "qb_delete" ON public."question_banks" AS PERMISSIVE FOR DELETE TO public USING (((created_by = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "qb_insert" ON public."question_banks";
CREATE POLICY "qb_insert" ON public."question_banks" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = (select auth.uid())));
DROP POLICY IF EXISTS "qb_select" ON public."question_banks";
CREATE POLICY "qb_select" ON public."question_banks" AS PERMISSIVE FOR SELECT TO public USING (((is_public = true) OR (created_by = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "qb_update" ON public."question_banks";
CREATE POLICY "qb_update" ON public."question_banks" AS PERMISSIVE FOR UPDATE TO public USING (((created_by = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "question_drafts_delete_admin" ON public."question_drafts";
CREATE POLICY "question_drafts_delete_admin" ON public."question_drafts" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "question_drafts_insert_admin" ON public."question_drafts";
CREATE POLICY "question_drafts_insert_admin" ON public."question_drafts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "question_drafts_select_admin" ON public."question_drafts";
CREATE POLICY "question_drafts_select_admin" ON public."question_drafts" AS PERMISSIVE FOR SELECT TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "question_drafts_update_admin" ON public."question_drafts";
CREATE POLICY "question_drafts_update_admin" ON public."question_drafts" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "qmc_select" ON public."question_meta_cache";
CREATE POLICY "qmc_select" ON public."question_meta_cache" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "qsl_own" ON public."question_source_links";
CREATE POLICY "qsl_own" ON public."question_source_links" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "questions_delete_admin" ON public."questions";
CREATE POLICY "questions_delete_admin" ON public."questions" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "questions_insert_admin" ON public."questions";
CREATE POLICY "questions_insert_admin" ON public."questions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "questions_select_all" ON public."questions";
CREATE POLICY "questions_select_all" ON public."questions" AS PERMISSIVE FOR SELECT TO public USING (((select auth.role()) = 'authenticated'::text));
DROP POLICY IF EXISTS "questions_update_admin" ON public."questions";
CREATE POLICY "questions_update_admin" ON public."questions" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rag_select" ON public."rag_chunks";
CREATE POLICY "rag_select" ON public."rag_chunks" AS PERMISSIVE FOR SELECT TO public USING (((select auth.role()) = 'authenticated'::text));
DROP POLICY IF EXISTS "rag_write_admin" ON public."rag_chunks";
CREATE POLICY "rag_write_admin" ON public."rag_chunks" AS PERMISSIVE FOR ALL TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "rb_delete" ON public."resource_blocks";
CREATE POLICY "rb_delete" ON public."resource_blocks" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rb_insert" ON public."resource_blocks";
CREATE POLICY "rb_insert" ON public."resource_blocks" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "rb_select" ON public."resource_blocks";
CREATE POLICY "rb_select" ON public."resource_blocks" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM resource_documents d
  WHERE ((d.id = resource_blocks.document_id) AND (d.is_published OR (select is_admin()))))));
DROP POLICY IF EXISTS "rb_update" ON public."resource_blocks";
CREATE POLICY "rb_update" ON public."resource_blocks" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rd_delete" ON public."resource_documents";
CREATE POLICY "rd_delete" ON public."resource_documents" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rd_insert" ON public."resource_documents";
CREATE POLICY "rd_insert" ON public."resource_documents" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "rd_select" ON public."resource_documents";
CREATE POLICY "rd_select" ON public."resource_documents" AS PERMISSIVE FOR SELECT TO public USING ((((select auth.role()) = 'authenticated'::text) AND (is_published OR (select is_admin()))));
DROP POLICY IF EXISTS "rd_update" ON public."resource_documents";
CREATE POLICY "rd_update" ON public."resource_documents" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rks_select" ON public."resource_kp_scopes";
CREATE POLICY "rks_select" ON public."resource_kp_scopes" AS PERMISSIVE FOR SELECT TO public USING ((((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM resource_documents d
  WHERE ((d.id = resource_kp_scopes.document_id) AND (d.is_published OR (select is_admin())))))));
DROP POLICY IF EXISTS "rks_write_admin" ON public."resource_kp_scopes";
CREATE POLICY "rks_write_admin" ON public."resource_kp_scopes" AS PERMISSIVE FOR ALL TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "rp_delete" ON public."resource_parts";
CREATE POLICY "rp_delete" ON public."resource_parts" AS PERMISSIVE FOR DELETE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rp_insert" ON public."resource_parts";
CREATE POLICY "rp_insert" ON public."resource_parts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "rp_select" ON public."resource_parts";
CREATE POLICY "rp_select" ON public."resource_parts" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM resource_documents d
  WHERE ((d.id = resource_parts.document_id) AND (d.is_published OR (select is_admin()))))));
DROP POLICY IF EXISTS "rp_update" ON public."resource_parts";
CREATE POLICY "rp_update" ON public."resource_parts" AS PERMISSIVE FOR UPDATE TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "rte_select" ON public."resource_toc_entries";
CREATE POLICY "rte_select" ON public."resource_toc_entries" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM resource_documents d
  WHERE ((d.id = resource_toc_entries.document_id) AND (d.is_published OR (select is_admin()))))));
DROP POLICY IF EXISTS "rte_write_admin" ON public."resource_toc_entries";
CREATE POLICY "rte_write_admin" ON public."resource_toc_entries" AS PERMISSIVE FOR ALL TO public USING ((select is_admin())) WITH CHECK ((select is_admin()));
DROP POLICY IF EXISTS "srm_delete" ON public."study_room_members";
CREATE POLICY "srm_delete" ON public."study_room_members" AS PERMISSIVE FOR DELETE TO public USING (((user_id = (select auth.uid())) OR is_study_room_owner(room_id, (select auth.uid()))));
DROP POLICY IF EXISTS "srm_select" ON public."study_room_members";
CREATE POLICY "srm_select" ON public."study_room_members" AS PERMISSIVE FOR SELECT TO public USING (((user_id = (select auth.uid())) OR is_study_room_member(room_id, (select auth.uid()))));
DROP POLICY IF EXISTS "study_rooms_delete" ON public."study_rooms";
CREATE POLICY "study_rooms_delete" ON public."study_rooms" AS PERMISSIVE FOR DELETE TO public USING ((owner_id = (select auth.uid())));
DROP POLICY IF EXISTS "study_rooms_select" ON public."study_rooms";
CREATE POLICY "study_rooms_select" ON public."study_rooms" AS PERMISSIVE FOR SELECT TO public USING (((owner_id = (select auth.uid())) OR is_study_room_member(id, (select auth.uid()))));
DROP POLICY IF EXISTS "study_rooms_update" ON public."study_rooms";
CREATE POLICY "study_rooms_update" ON public."study_rooms" AS PERMISSIVE FOR UPDATE TO public USING ((owner_id = (select auth.uid()))) WITH CHECK ((owner_id = (select auth.uid())));
DROP POLICY IF EXISTS "subject_explanations_select_all" ON public."subject_explanations";
CREATE POLICY "subject_explanations_select_all" ON public."subject_explanations" AS PERMISSIVE FOR SELECT TO public USING (((select auth.role()) = 'authenticated'::text));
DROP POLICY IF EXISTS "subject_explanations_write_admin" ON public."subject_explanations";
CREATE POLICY "subject_explanations_write_admin" ON public."subject_explanations" AS PERMISSIVE FOR ALL TO public USING ((select is_admin()));
DROP POLICY IF EXISTS "submissions_own" ON public."submissions";
CREATE POLICY "submissions_own" ON public."submissions" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "user_answers_own" ON public."user_answers";
CREATE POLICY "user_answers_own" ON public."user_answers" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "user_answers_public_select" ON public."user_answers";
CREATE POLICY "user_answers_public_select" ON public."user_answers" AS PERMISSIVE FOR SELECT TO public USING (((is_public = true) OR (user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "uds_own" ON public."user_daily_stats";
CREATE POLICY "uds_own" ON public."user_daily_stats" AS PERMISSIVE FOR SELECT TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "ueq_own" ON public."user_excluded_questions";
CREATE POLICY "ueq_own" ON public."user_excluded_questions" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "ums_own_delete" ON public."user_mfa_sessions";
CREATE POLICY "ums_own_delete" ON public."user_mfa_sessions" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "ums_own_select" ON public."user_mfa_sessions";
CREATE POLICY "ums_own_select" ON public."user_mfa_sessions" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "user_plugins_own" ON public."user_plugins";
CREATE POLICY "user_plugins_own" ON public."user_plugins" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin()))) WITH CHECK (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "up_own" ON public."user_preferences";
CREATE POLICY "up_own" ON public."user_preferences" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
DROP POLICY IF EXISTS "upref_own" ON public."user_preferences";
CREATE POLICY "upref_own" ON public."user_preferences" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin())));
DROP POLICY IF EXISTS "user_prompts_own" ON public."user_prompts";
CREATE POLICY "user_prompts_own" ON public."user_prompts" AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR (select is_admin()))) WITH CHECK (((user_id = (select auth.uid())) OR (select is_admin())));
-- 同上: user_settings 直到 Section 83 才建表, 策略留到那边建
DROP POLICY IF EXISTS "utd_own" ON public."user_trusted_devices";
CREATE POLICY "utd_own" ON public."user_trusted_devices" AS PERMISSIVE FOR ALL TO public USING ((user_id = (select auth.uid())));

-- ============================================================================
-- Section 82: search_resource_blocks 提速 —— SECURITY DEFINER + 自校验
-- ============================================================================
-- 问题(实测): 该函数最慢 3.3 秒, 线上 0 命中也要 327ms。根因两条:
--   (1) RLS 屏障挡住了 trigram 索引。ILIKE(texticlike) 与 is_admin() 都不是 leakproof,
--       Postgres 不允许把 ILIKE 下推成索引条件(会泄露哪些行匹配给无权限者),
--       于是退化成 32634 行全表扫。对照实验: 策略为 true 时 Bitmap Index Scan 0.12ms,
--       有真实策略时 Seq Scan 89ms —— 相差 740 倍。
--   (2) count(*) OVER () 强制为全部匹配行计算 snippet, 而 snippet 里对全文做了
--       lower() + strpos(); LIMIT 只在最后生效。
--
-- 修法:
--   (1) SECURITY DEFINER —— 表 owner(postgres, relforcerowsecurity=false) 绕过 RLS,
--       索引恢复可用。必须自己补上原来由 RLS 提供的两道门:
--         auth.role() = authenticated     <- 原 rd_select
--         d.is_published OR is_admin()    <- 原 rb_select 的 EXISTS 子查询
--   (2) total 独立算, snippet 只给最终返回的 <=200 行算。
--
-- 本地实测(3 万行匹配): 0 命中 66-75ms -> 0-1ms (~70x); 3 万命中 3104-3245ms -> 1225-1324ms (2.5x)
-- 线上实测: 管理 483->188ms / 组织 385->163ms / 理学 388->180ms / 绩效 343->133ms /
--           斯蒂芬(8 命中) 333->100ms / 0 命中 327->132ms
-- 等价性: 5 组输入(limit 20/50/200, 含 0 命中) 集合差异 0、有序差异 0;
--         未发布文档不泄露; 线上 total_hits 与直接 SQL 统计逐词一致(3221/2977/567/8)。
--
-- 注意: 线上当前 10 份文档全部 is_published=true, 所以新增的可见性过滤在今天
--       是 no-op、输出必然不变; 它从出现未发布文档起才实际生效。
-- 回滚: docs/srb-fn-rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_resource_blocks(
  p_query text, p_document_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text,
  p_doc_type text DEFAULT NULL::text, p_tag text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(document_id uuid, doc_title text, page_no integer, block_index integer, bbox real[],
               block_type text, heading_level smallint, snippet text, score real, total_hits bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q      TEXT := btrim(coalesce(p_query, ''));
  padded TEXT;
BEGIN
  IF q = '' THEN RETURN; END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'authenticated' THEN RETURN; END IF;
  padded := regexp_replace(q, '(.)', '\1 ', 'g');

  RETURN QUERY
  WITH hit AS (
    SELECT b.document_id AS doc_id,
           d.title       AS d_title,
           b.page_no     AS p_no,
           b.block_index AS b_idx,
           b.bbox        AS b_box,
           b.block_type  AS b_type,
           b.heading_level AS b_level,
           b.text        AS b_text,
           (CASE WHEN b.heading_level > 0 THEN 2.0 ELSE 0.0 END
            + CASE WHEN d.title ILIKE '%' || q || '%' THEN 1.5 ELSE 0.0 END
            + CASE WHEN b.text ILIKE q || '%' THEN 0.5 ELSE 0.0 END)::REAL AS sc
    FROM public.resource_blocks b
    JOIN public.resource_documents d ON d.id = b.document_id
    WHERE b.search_text ILIKE '%' || padded || '%'
      AND b.block_type <> ALL (ARRAY[
        'header', 'footer', 'page_number', 'aside_text', 'page_footnote', 'phonetic', 'discarded',
        'page_header', 'page_footer', 'page_aside_text', 'abandon', 'low_score_text'
      ])
      AND (d.is_published OR (SELECT public.is_admin()))
      AND (p_document_id IS NULL OR b.document_id = p_document_id)
      AND (p_subject     IS NULL OR d.subject  = p_subject)
      AND (p_doc_type    IS NULL OR d.doc_type = p_doc_type)
      AND (p_tag         IS NULL OR p_tag = ANY(d.tags))
  ),
  top AS (
    SELECT h.* FROM hit h
    ORDER BY h.sc DESC, h.d_title, h.p_no, h.b_idx
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  ),
  tot AS (SELECT count(*) AS n FROM hit)
  SELECT t.doc_id, t.d_title, t.p_no, t.b_idx, t.b_box, t.b_type, t.b_level,
         substring(t.b_text FROM greatest(1, strpos(lower(t.b_text), lower(q)) - 40) FOR 160),
         t.sc,
         (SELECT n FROM tot)
  FROM top t
  ORDER BY t.sc DESC, t.d_title, t.p_no, t.b_idx;
END;
$function$;

-- ============================================================================
-- Section 83: 补上漂移缺失的 2 张表 —— practice_daily_assignments / user_settings
-- ============================================================================
-- 背景: 001_initial_schema.sql 只 CREATE 了 56 张表, 而线上有 58 张。
--       这两张表在线上存在、文件里从未创建, 导致这份迁移文件无法重建出可用的库
--       (在全新数据库上执行后, 每日任务与用户设置相关功能会直接报 relation does not exist)。
--       注意它们还带有 RLS 策略, 所以之前 Section 81 对线上那 104 条策略的改写里,
--       也包含这两张表的策略。
--
-- 来源: 由线上 catalog 反向导出(pg_attribute / pg_constraint / pg_indexes /
--       pg_policies / pg_trigger), 因此与线上当前定义一致, 策略也已是 Section 81 的写法。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.practice_daily_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assign_date date NOT NULL,
  subject text NOT NULL,
  kp_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  qids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  goal_count integer NOT NULL DEFAULT 0,
  carry_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_carry_count_check CHECK ((carry_count >= 0));
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_goal_count_check CHECK ((goal_count >= 0));
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_qids_goal CHECK ((cardinality(qids) = goal_count));
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_review_count_check CHECK ((review_count >= 0));
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.practice_daily_assignments ADD CONSTRAINT practice_daily_assignments_uniq UNIQUE (user_id, assign_date, subject);
CREATE INDEX IF NOT EXISTS idx_pda_user_assign_date ON public.practice_daily_assignments USING btree (user_id, assign_date);
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.practice_daily_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE public.practice_daily_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pda_own ON public.practice_daily_assignments;
CREATE POLICY pda_own ON public.practice_daily_assignments AS PERMISSIVE FOR ALL TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uset_own ON public.user_settings;
CREATE POLICY uset_own ON public.user_settings AS PERMISSIVE FOR ALL TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));

-- ============================================================================
-- Section 84: 补上漂移残留的 3 个函数与 1 个触发器
-- ============================================================================
-- 背景: 与 Section 83 同源 —— 这些对象存在于线上, 但 001_initial_schema.sql 从未创建。
--       实测对比(排除扩展自带成员后): 线上 82 个函数 / 文件 75 个;
--       线上 24 个触发器 / 文件 23 个。缺的就是下面这些。
--   函数: get_random_question_id_mixed, kp_build_sort_key, kp_set_sort_key
--   触发器: user_preferences.trg_up_updated_at
--
-- 未包含 rls_auto_enable(): 它是 Supabase 平台自带的 RLS 辅助函数, 不属于本项目代码。
-- 用 CREATE OR REPLACE(不 DROP 函数), 因为 kp_set_sort_key 可能是触发器函数, DROP 会因依赖失败。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_random_question_id_mixed(p_user_id uuid, p_subjects text[] DEFAULT NULL::text[], p_categories text[] DEFAULT NULL::text[], p_question_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
BEGIN
  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
  ORDER BY random()
  LIMIT 1;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kp_build_sort_key(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_big   TEXT := '';
  v_small TEXT := '';
  v_ch    TEXT := '';
  v_sec   TEXT := '';
  v_dot   INT;
  v_rest  TEXT;
BEGIN
  IF p_code IS NULL OR p_code = '' THEN
    RETURN '';
  END IF;

  -- level 1: A
  v_big := substring(p_code FROM 1 FOR 1);
  IF length(p_code) = 1 THEN
    RETURN v_big;
  END IF;

  -- level 2: Aa
  v_small := substring(p_code FROM 2 FOR 1);
  IF length(p_code) = 2 THEN
    RETURN v_big || '|' || v_small;
  END IF;

  -- level 3+: Aa1 或 Aa1.1
  v_rest := substring(p_code FROM 3);
  v_dot := position('.' IN v_rest);

  IF v_dot = 0 THEN
    -- level 3: 只有章
    v_ch := lpad(v_rest, 2, '0');
    RETURN v_big || '|' || v_small || '|' || v_ch;
  ELSE
    -- level 4: 章.节
    v_ch  := lpad(substring(v_rest FROM 1 FOR v_dot - 1), 2, '0');
    v_sec := lpad(substring(v_rest FROM v_dot + 1), 2, '0');
    RETURN v_big || '|' || v_small || '|' || v_ch || '|' || v_sec;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kp_set_sort_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.sort_key := public.kp_build_sort_key(NEW.code);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_up_updated_at ON public.user_preferences;

CREATE TRIGGER trg_up_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================================
-- Section 85: 清掉 13 个用不上的索引 —— 库 269MB → 241MB, public 索引 127MB → 99MB
--
--   依据 pg_stat_user_indexes 全量统计(这台库的统计从未 reset, 窗口覆盖全部历史,
--   同期 uq_user_answers_session 已经攒到 1851 万次扫描, 所以 0 次是可信的):
--
--   1) idx_rag_search (19MB) —— Section 59 自己就写了: LIMIT 40 能在扫到第 40 个命中
--      时早停, planner 永远选顺序扫, 这个 GIN 只是"保险"。它还在每次 RAG 灌库时白付
--      GIN 写入与 pending list 刷盘的开销, 而灌库正是这库里最重的写操作。真到几万块
--      以上要回头用时再建 —— 2.2 万行重建是秒级。
--   2) idx_qdc_trgm (8.5MB) —— 建在 stem 上, 但查重只用 a.stem % b.stem 这种列对列
--      相似度, 两列来自同一张表, GIN 对这种形式根本用不上(操作数必须是常量)。join
--      前面已经有 a.stem_fp = b.stem_fp AND a.subject = b.subject 做粗筛。
--   3) idx_qdc_subject —— (subject) 是 idx_qdc_fp(subject, stem_fp) 的前缀。
--   4~13) user_answers / questions 上的一批老索引, 每一个都有一个定义完全相同、正在
--      被使用的"新名字"双胞胎, 例如 idx_user_answers_user_question ≡ idx_ua_user_question
--      (652317 次)。这一批从没进过迁移文件 —— 全新库从来就没有它们, 只有这台生产库有,
--      这正是"改名后忘了删旧的"的痕迹。逐对核对过列与谓词完全一致:
--        (user_id, question_id) / (user_id, answered_at DESC) / (question_id, is_correct)
--        / (question_id) / (user_id) / (exam_session_id)
--        / (user_id, is_correct) WHERE is_correct = false
--        / (user_id, answered_at DESC) WHERE is_public = true
--        / (subject, category) / (question_type)
--
--   user_answers 上另外 3 个同样 0 scan 的索引(idx_ua_question_correct / idx_ua_wrong /
--   idx_ua_public)故意留着: 它们对应"错题回顾""公开笔记"这类已经写完的功能, 现在只是
--   数据量小走不上索引, 三个加起来 192kB, 不值得为省这点空间赌一次计划回退。
--
--   回滚: docs/idx-grant-cleanup-rollback.sql
-- ============================================================================
DROP INDEX IF EXISTS public.idx_rag_search;
DROP INDEX IF EXISTS public.idx_qdc_trgm;
DROP INDEX IF EXISTS public.idx_qdc_subject;
DROP INDEX IF EXISTS public.idx_user_answers_user_question;
DROP INDEX IF EXISTS public.idx_user_answers_user_answered;
DROP INDEX IF EXISTS public.idx_user_answers_question_correct;
DROP INDEX IF EXISTS public.idx_user_answers_question_id;
DROP INDEX IF EXISTS public.idx_user_answers_user_id;
DROP INDEX IF EXISTS public.idx_user_answers_exam_session;
DROP INDEX IF EXISTS public.idx_user_answers_wrong;
DROP INDEX IF EXISTS public.idx_user_answers_public;
DROP INDEX IF EXISTS public.idx_questions_subject_category;
DROP INDEX IF EXISTS public.idx_questions_type;


-- ============================================================================
-- Section 86: 补上迁移漏建的 3 个索引(让全新库与生产一致)
--
--   逐名比对生产 public 下 187 个索引与迁移里的 CREATE INDEX 声明:
--   迁移声明过的 97 个在生产全部存在(没有"建了但没用"的), 反向缺 3 个
--   —— 其余差异都是 PRIMARY KEY / UNIQUE 约束隐式生成的索引名, 不是真差异。
--   缺的这 3 个都在被使用(favorites.created_at 127 次扫描 / questions.key_points
--   三字组 8 次 / questions(subject) INCLUDE(id) 142 次), 所以是迁移漏了而不是索引该删。
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_favorites_created_at
  ON public.favorites (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_key_points_trgm
  ON public.questions USING gin (key_points gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_questions_subject_id
  ON public.questions (subject) INCLUDE (id);


-- ============================================================================
-- Section 87: 收紧函数 EXECUTE —— anon 可直接调用的 SECURITY DEFINER 函数从 15 个降到 4 个
--
--   背景: public 下函数出厂带 PUBLIC EXECUTE, 而本库还给每个业务函数显式再 GRANT 了
--   一次 anon/authenticated, 于是只拿 anon key 就能直接 RPC 一批 SECURITY DEFINER 函数。
--   前端所有功能路由都在 OtpGuard 后面(router/index.tsx 里 /terms /privacy /qr-confirm
--   /welcome /guide /mfa /farewell 之外全部要求登录), 所以除扫码登录外 anon 没有合法调用点。
--
--   1) 触发器 / 事件触发器函数 —— 触发器派发根本不检查 EXECUTE。实测: 以 service_role
--      执行 UPDATE questions / UPDATE profiles / INSERT chat_messages / CREATE TABLE,
--      此时它已经没有这些函数的 EXECUTE, 全部正常触发(short_id 写入成功、RLS 被自动打开)。
--      所以 PUBLIC, anon, authenticated 一起收回。
--   2) cleanup_expired_challenges / _devices / cleanup_mfa_expired —— SECURITY DEFINER
--      且会删数据。顺手记录一个发现: cron.job 是空的, 迁移里也从没 schedule 过它们 ——
--      这三个目前是死代码。只留 service_role/postgres。
--   3) unlink_oauth_identity —— SECURITY DEFINER 且直接删 auth.identities。函数内部有防线
--      (非 service_role 时只认 auth.uid(), 并且拒绝解绑 email 身份), 唯一调用点是
--      unlink-identity Edge Function 里的 service_role 客户端, 所以 anon/authenticated 都收掉。
--   4) merge_dup_group / create_study_room / join_study_room —— SECURITY DEFINER 应用 RPC,
--      只需要 authenticated(merge_dup_group 内部另有 public.is_admin() 断言)。
--   5) search_rag / search_resource_blocks / search_resource_documents —— 收掉 anon
--      (search_resource_blocks 内部本来就有 auth.role() 断言, 匿名只拿到空结果)。
--      以后若要把资料库做成公开页面, 记得单独 GRANT 回 anon。
--
--   故意保留 anon EXECUTE 的 4 个 SECURITY DEFINER 函数, 都是有意为之:
--     is_admin / is_study_room_member / is_study_room_owner —— RLS 策略里直接调用,
--       策略表达式以查询角色求值, 收回会让匿名读表直接 permission denied。
--     qr_login_status —— 扫码登录必须未登录可调, 且内部要求 secret_hash 匹配。
--
--   回滚: docs/idx-grant-cleanup-rollback.sql
-- ============================================================================
REVOKE ALL ON FUNCTION public.assign_session_short_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_chat_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_privileged_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kp_set_sort_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resource_documents_sync_search_text() FROM PUBLIC, anon, authenticated;
-- rls_auto_enable() 是 Supabase 平台自带的函数(见上方说明), 不属于本项目代码。
-- 自建的空库里它不存在, 直接 REVOKE 会以 "function does not exist" 中断迁移,
-- 所以先判存在性再收权限 —— 托管环境收到权限, 自建环境安静跳过。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_category_from_categories() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_dup_cache_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_question_meta() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.cleanup_expired_challenges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_devices() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_mfa_expired() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlink_oauth_identity(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.merge_dup_group(UUID, UUID[], TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_study_room(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_study_room(TEXT) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.search_rag(TEXT, TEXT, TEXT[], INTEGER, TEXT[], TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_resource_blocks(TEXT, UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_resource_documents(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;

-- ============================================================================
-- Section 88: get_subject_progress 重写 —— 去掉 questions × user_answers 的行乘开
--
--   症状: 这个 RPC 在 pg_stat_statements 里 mean 373.9ms / 1959 次调用, 看着是
--   仅次于 get_plan_stats 的第二大 DB 时间消耗。但那个 mean 是被历史拖累的:
--   最小执行时间只有 24.78ms, 是均值被长尾拉高了 15 倍。实测当前真实延迟:
--     计划级 reset 在   → 17.1ms      没有计划级 reset → 37.0ms
--   同一个函数因为一个参数从 17ms 跳到 37ms, 说明问题在计划形状, 不在数据量
--   (questions 2022 行 / user_answers 3548 行, 全部只有 2 个用户有作答记录)。
--
--   原因: 原写法是
--       FROM questions q
--       LEFT JOIN user_answers ua_all   ON ... AND <一串时间条件>
--       LEFT JOIN user_answers ua_today ON ... AND <一串时间条件>
--       GROUP BY subject   -- 三个 COUNT(DISTINCT ...)
--   p_plan_reset_at 为 NULL 时那串时间条件整条恒真, planner 无法用参数剪枝, 于是
--   先把 questions × user_answers 乘开(3671 行), 再做三个 COUNT(DISTINCT) —— 每个
--   COUNT(DISTINCT) 都要建一个哈希集合。"有没有答过"本质上是每道题一个布尔值, 用不着
--   把作答行乘开。
--
--   改法: 先把作答按题压成一行(MAX(answered_at) 就是"最后一次作答"),
--   "存在一条作答晚于阈值 T" 等价于 "最后作答 >= T", 于是三个计数都变成
--   对同一份"每题一行"的数据做 COUNT(*) FILTER。顺带把原来独立的 missing CTE
--   (第二遍扫 questions 数 key_points 为空的题) 合成同一个 CTE 里的一列,
--   questions 从扫两遍变扫一遍。
--
--   实测(生产, 以 authenticated 身份并带 RLS, 同参数各 6 次取均值):
--     5 参数版, 无 reset: 37.0ms → 7.9ms (4.7x)
--     5 参数版, 有计划 reset: 17.1ms → 7.6ms (2.2x)
--     4 参数版: 17.8ms → 7.3ms (2.4x)
--   更重要的是新写法对这些参数**不敏感**(7.3~9.0ms), 不会因为某个用户没设计划
--   起点就慢一倍。
--
--   等价性: 用 2 个真实用户 × 8/5 组参数(全 NULL / 只给 today / 给计划 reset /
--   给两个科目 / 给学科级 reset / 给两个学科 reset / 不给 today / 400 天前的 reset)
--   跑 EXCEPT 双向对比, 48 行输出 0 差异; 4 参数版同样 48 行 0 差异。
--
--   注意 HAVING COUNT(*) FILTER (WHERE NOT no_kp) > 0: 原写法 base 只统计
--   key_points 非空的题, 所以"只有空 key_points 题目的科目"根本不会出现在结果里;
--   合并成一遍扫描后必须显式保持这个行为。
--
--   回滚: docs/gsp-rewrite-rollback.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_subject_progress(
  p_user_id uuid,
  p_plan_reset_at timestamptz DEFAULT NULL,
  p_today_since timestamptz DEFAULT NULL,
  p_subjects text[] DEFAULT NULL,
  p_subject_resets jsonb DEFAULT NULL
) RETURNS TABLE(subject text, total bigint, done_all bigint, done_today bigint, missing_kp bigint)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH ans AS (
    SELECT ua.question_id, MAX(ua.answered_at) AS last_at
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id
    GROUP BY ua.question_id
  ),
  qs AS (
    SELECT COALESCE(q.subject, 'Other') AS subj,
           (q.key_points IS NULL OR q.key_points = '') AS no_kp,
           CASE WHEN p_subject_resets ? q.subject
                THEN (p_subject_resets ->> q.subject)::TIMESTAMPTZ
                ELSE p_plan_reset_at
           END AS thr,
           a.last_at
    FROM public.questions q
    LEFT JOIN ans a ON a.question_id = q.id
    WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
      AND NOT EXISTS (
        SELECT 1 FROM public.user_excluded_questions ueq
        WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
      )
  )
  SELECT qs.subj,
         COUNT(*) FILTER (WHERE NOT qs.no_kp)::BIGINT,
         COUNT(*) FILTER (WHERE NOT qs.no_kp AND qs.last_at IS NOT NULL
                            AND (qs.thr IS NULL OR qs.last_at >= qs.thr))::BIGINT,
         COUNT(*) FILTER (WHERE NOT qs.no_kp AND p_today_since IS NOT NULL
                            AND qs.last_at >= p_today_since
                            AND (qs.thr IS NULL OR qs.last_at >= qs.thr))::BIGINT,
         COUNT(*) FILTER (WHERE qs.no_kp)::BIGINT
  FROM qs
  GROUP BY qs.subj
  HAVING COUNT(*) FILTER (WHERE NOT qs.no_kp) > 0
  ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_subject_progress(
  p_user_id uuid,
  p_plan_reset_at timestamptz DEFAULT NULL,
  p_today_since timestamptz DEFAULT NULL,
  p_subjects text[] DEFAULT NULL
) RETURNS TABLE(subject text, total bigint, done_all bigint, done_today bigint)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH ans AS (
    SELECT ua.question_id, MAX(ua.answered_at) AS last_at
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id
    GROUP BY ua.question_id
  )
  SELECT COALESCE(q.subject, 'Other'),
         COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE a.last_at IS NOT NULL
                            AND (p_plan_reset_at IS NULL OR a.last_at >= p_plan_reset_at))::BIGINT,
         COUNT(*) FILTER (WHERE p_today_since IS NOT NULL
                            AND a.last_at >= p_today_since
                            AND (p_plan_reset_at IS NULL OR a.last_at >= p_plan_reset_at))::BIGINT
  FROM public.questions q
  LEFT JOIN ans a ON a.question_id = q.id
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_excluded_questions ueq
      WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
    )
  GROUP BY COALESCE(q.subject, 'Other')
  ORDER BY 1;
$function$;


-- ============================================================================
-- Section 89: get_plan_stats 重写 —— 把 1356 个元素的 uuid[] 从逐行 ANY 换成哈希半连接
--
--   这个 RPC 在 pg_stat_statements 里 mean 282.7ms / 3520 次, 是单项第一。同样地,
--   那个均值是被历史拉高的: min 只有 24.78ms, 实测当前 ~21ms(目标型计划) / ~33ms
--   (数量型计划)。真正卡住的是这一句:
--       WHERE jsonb_array_length(b.steps) > 0
--          OR (SELECT question_ids FROM sess) IS NULL
--          OR q.id = ANY(COALESCE((SELECT question_ids FROM sess), '{}'::UUID[]))
--   practice_sequential_state.question_ids 是"这次顺序练习铺开的全部题", 生产上最大
--   一条有 1356 个 uuid(21716 字节)。`= ANY(数组)` 是逐行的线性扫描, 而且数组来自
--   InitPlan 所以 planner 没法把它变成哈希 —— 1370 行 questions 各扫 1356 个元素,
--   约 186 万次 uuid 比较。EXPLAIN 里这一段(Hash Join 节点自身耗时, 不含子节点)
--   是 14.6ms。
--
--   改法: 把那个析取拆成三段 UNION ALL, 让"会话题集"变成一个可以哈希的连接。
--     1) 目标型(steps 非空): 该科全部题;
--     2) 数量型(steps 为空, 且有会话): questions JOIN (SELECT DISTINCT unnest(question_ids));
--     3) 数量型(steps 为空, 且没有会话行): 全部题。
--   三段互斥(按 steps 是否为空 / 会话是否存在), 所以不会重复计数。
--   必须 DISTINCT: 原写法 `= ANY` 天然去重, 而连接不会 —— 会话数组里若有重复 id,
--   tot.total 会被撑大。已用伪造的重复数组实测过。
--
--   同时清掉两处重复计算: (a) evt 与 q_once 原来对**所有**科目都各算一遍窗口函数,
--   实际只有"目标型"用 evt、"数量型"用 q_once, 现在按 by_goal 分开; (b) 结尾三个
--   相关子查询(每科一次 COUNT(evt)/COUNT(q_once)/jsonb_agg(dated))改成三个 GROUP BY CTE。
--
--   实测(生产, authenticated + RLS, 同参数各 6 次取均值):
--     目标型计划: 22.3ms → 15.8ms
--     数量型计划: 33.4ms → 15.1ms (2.2x)
--   数量型是新旧差距最大的地方, 也正是"会话数组很长"的那条路径。
--
--   等价性: 2 个真实用户 × 11 组计划(空 / 单科目标 / 全科目标 / 全科数量 /
--   目标数量混合 / 只给日期 / 不给 since / 超长 steps / 不存在的科目 / since 为空串 /
--   阈值超过总题数)共 50 行 0 差异; 另外在一个会回滚的事务里伪造 practice_sequential_state
--   覆盖了 4 个边界: 正常会话 / question_ids 为空数组 / 完全没有会话行 / 数组内有重复 id,
--   全部 0 差异。
--
--   回滚: docs/gps-rewrite-rollback.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_plan_stats(p_user_id uuid, p_plan jsonb)
RETURNS TABLE(subject text, total bigint, attempts bigint, done_dates jsonb)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT e.key AS subject,
           CASE
             WHEN COALESCE(e.value->>'since', '') = '' THEN NULL
             WHEN (e.value->>'since') ~ '^\d{4}-\d{2}-\d{2}$'
               THEN ((e.value->>'since') || ' 00:00:00+08')::TIMESTAMPTZ
             ELSE (e.value->>'since')::TIMESTAMPTZ
           END                                     AS since,
           NULLIF(e.value->>'size', '')::BIGINT    AS size,
           COALESCE(e.value->'steps', '[]'::jsonb) AS steps
    FROM jsonb_each(COALESCE(p_plan, '{}'::jsonb)) AS e
  ),
  sess AS (
    SELECT s.question_ids
    FROM public.practice_sequential_state s
    WHERE s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT 1
  ),
  sess_ids AS (
    SELECT DISTINCT unnest(s.question_ids) AS qid
    FROM sess s
    WHERE s.question_ids IS NOT NULL
  ),
  scope AS (
    SELECT q.id, b.subject, b.since, b.size, b.steps, true AS by_goal
    FROM base b
    JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) > 0
    UNION ALL
    SELECT q.id, b.subject, b.since, b.size, b.steps, false
    FROM base b
    JOIN sess_ids si ON true
    JOIN public.questions q
      ON q.id = si.qid AND q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) = 0
    UNION ALL
    SELECT q.id, b.subject, b.since, b.size, b.steps, false
    FROM base b
    JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) = 0
      AND (SELECT question_ids FROM sess) IS NULL
  ),
  tot AS (
    SELECT sc.subject, sc.since, sc.size, sc.steps, sc.by_goal, COUNT(sc.id)::BIGINT AS total
    FROM scope sc
    GROUP BY sc.subject, sc.since, sc.size, sc.steps, sc.by_goal
  ),
  ua_u AS MATERIALIZED (
    SELECT ua.id AS answer_id, ua.question_id, ua.answered_at, ua.mode, ua.source
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id
  ),
  answered AS (
    SELECT sc.subject, sc.by_goal, ua.question_id, ua.answer_id, ua.answered_at, ua.mode, ua.source
    FROM scope sc
    JOIN ua_u ua ON ua.question_id = sc.id
    WHERE sc.since IS NULL OR ua.answered_at >= sc.since
  ),
  q_once AS (
    SELECT a.subject, a.question_id, MIN(a.answered_at) AS answered_at
    FROM answered a
    WHERE NOT a.by_goal
    GROUP BY a.subject, a.question_id
  ),
  q_rank AS (
    SELECT q.subject, q.question_id, q.answered_at,
           ROW_NUMBER() OVER (PARTITION BY q.subject ORDER BY q.answered_at, q.question_id) AS rn
    FROM q_once q
  ),
  evt AS (
    SELECT a.subject, a.answered_at,
           ROW_NUMBER() OVER (PARTITION BY a.subject ORDER BY a.answered_at, a.answer_id) AS rn
    FROM answered a
    WHERE a.by_goal AND a.mode = 'practice' AND a.source IS DISTINCT FROM 'random'
  ),
  mark_goal AS (
    SELECT b.subject, SUM(x.v) OVER (PARTITION BY b.subject ORDER BY x.ord) AS rn
    FROM tot b
    CROSS JOIN LATERAL (
      SELECT (v.value)::BIGINT AS v, v.ord
      FROM jsonb_array_elements_text(b.steps) WITH ORDINALITY AS v(value, ord)
    ) x
  ),
  mark_round AS (
    SELECT d.subject, d.rn, d.answered_at
    FROM q_rank d
    JOIN tot b ON b.subject = d.subject
    WHERE jsonb_array_length(b.steps) = 0
      AND COALESCE(b.size, b.total) > 0
      AND d.rn = COALESCE(b.size, b.total)
  ),
  dated AS (
    SELECT g.subject, e.answered_at
    FROM mark_goal g
    JOIN evt e ON e.subject = g.subject AND e.rn = g.rn
    UNION ALL
    SELECT r.subject, r.answered_at FROM mark_round r
  ),
  evt_cnt AS (SELECT subject, COUNT(*) AS n FROM evt GROUP BY subject),
  q_once_cnt AS (SELECT subject, COUNT(*) AS n FROM q_once GROUP BY subject),
  dated_agg AS (
    SELECT subject,
           jsonb_agg(to_char((answered_at AT TIME ZONE 'Asia/Shanghai')::DATE, 'YYYY-MM-DD')
                     ORDER BY answered_at) AS arr
    FROM dated
    GROUP BY subject
  )
  SELECT tot.subject,
         tot.total,
         CASE WHEN jsonb_array_length(tot.steps) > 0
              THEN COALESCE(ec.n, 0)
              ELSE LEAST(COALESCE(qc.n, 0), tot.total)
         END AS attempts,
         COALESCE(da.arr, '[]'::jsonb) AS done_dates
  FROM tot
  LEFT JOIN evt_cnt ec ON ec.subject = tot.subject
  LEFT JOIN q_once_cnt qc ON qc.subject = tot.subject
  LEFT JOIN dated_agg da ON da.subject = tot.subject
  ORDER BY tot.subject;
$function$;
-- ============================================================================
-- Section 90: 与生产 schema 的逐列对齐（可重放一致性修复）
-- ----------------------------------------------------------------------------
-- 背景：001_initial_schema.sql 定位是生产的「可重放快照」。本次用一个空库把
-- 本文件完整跑一遍，再与生产库做 information_schema 逐列 diff，发现 20 处偏差：
--   · 缺 13 个列  —— 前端/服务端在用的列，靠重放做灾备会直接报「列不存在」
--   · 5 处定义不一致 —— 类型 / 默认值 / 可空性
--   · 1 处迁移超前于生产（exam_schedules.email_send_date）—— 当时判断为「尚未上线的
--     功能」故保留；后经线上验证这是误判，该列是线上 bug 而非超前，已于 Section 96 补齐
-- 本 section 全部幂等：已经是从生产 schema.sql 灌出来的库跑它等于无操作。
-- ============================================================================

-- ---- 90.1 profiles 缺 11 列 ----
-- 前端「学习计划」相关字段，生产有、本文件漏建。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_wrong_only     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_categories     TEXT,
  ADD COLUMN IF NOT EXISTS plan_key_points     TEXT,
  ADD COLUMN IF NOT EXISTS plan_targets        TEXT,
  ADD COLUMN IF NOT EXISTS kp_order_pos        TEXT,
  ADD COLUMN IF NOT EXISTS last_question_id    TEXT,
  ADD COLUMN IF NOT EXISTS skip_question_ids   TEXT,
  ADD COLUMN IF NOT EXISTS show_overall        BOOLEAN,
  ADD COLUMN IF NOT EXISTS show_overall_date   TEXT,
  ADD COLUMN IF NOT EXISTS show_long_overall   BOOLEAN,
  ADD COLUMN IF NOT EXISTS show_custom_overall BOOLEAN;

-- ---- 90.2 parse_history 缺 1 列 ----
ALTER TABLE public.parse_history
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ---- 90.3 user_answers 缺 1 列 ----
ALTER TABLE public.user_answers
  ADD COLUMN IF NOT EXISTS wrong_reason TEXT;

-- ---- 90.4 parse_history.id: SERIAL(integer) -> BIGINT ----
-- 生产是 BIGINT。本文件用 SERIAL，重放出来的库主键类型与生产不一致。
-- 没有任何外键引用该列，转换安全。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'parse_history'
      AND column_name  = 'id'
      AND data_type    = 'integer'
  ) THEN
    ALTER TABLE public.parse_history ALTER COLUMN id TYPE BIGINT;
  END IF;
END $$;

-- ---- 90.5 去掉生产没有的默认值 ----
-- 生产这 4 列的 column_default 都是 NULL，本文件多给了占位默认值。
-- 其中 questions.correct_answer 的 '0' 与 Section 78「分析题本来就没有标准答案」
-- 的意图直接冲突：有默认值就永远不会是 NULL。
ALTER TABLE public.parse_history ALTER COLUMN file_name       DROP DEFAULT;
ALTER TABLE public.parse_history ALTER COLUMN markdown        DROP DEFAULT;
ALTER TABLE public.questions    ALTER COLUMN correct_answer   DROP DEFAULT;
ALTER TABLE public.user_answers ALTER COLUMN selected_answer  DROP DEFAULT;

-- ---- 90.6 practice_sequential_state.subject_positions 放开 NOT NULL ----
-- 生产可空（默认 '{}'），且读取侧到处是 COALESCE(subject_positions, '{}')，
-- 说明代码本来就预期它可能为 NULL。
ALTER TABLE public.practice_sequential_state
  ALTER COLUMN subject_positions DROP NOT NULL;

-- ---- 90.7 user_answers 缺唯一约束 ----
-- 生产有：UNIQUE (user_id, question_id, exam_session_id)，本文件漏建。
-- 注意：这是「同一场考试里同一道题只允许一条作答记录」的业务约束，不是性能索引。
-- 表非空且已有重复行时 ADD CONSTRAINT 会失败 —— 那说明生产数据本身有问题，
-- 应当先查数据而不是跳过约束。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint co
    JOIN pg_class c     ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_answers'
      AND co.conname = 'user_answers_session_uniq'
  ) THEN
    ALTER TABLE public.user_answers
      ADD CONSTRAINT user_answers_session_uniq
      UNIQUE (user_id, question_id, exam_session_id);
  END IF;
END $$;

-- ---- 90.8 user_answers.wrong_reason 缺 CHECK 约束 ----
-- 90.3 刚补上 wrong_reason 这一列，生产上与之配套的取值约束也要一起补。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint co
    JOIN pg_class c     ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_answers'
      AND co.conname = 'user_answers_wrong_reason_check'
  ) THEN
    ALTER TABLE public.user_answers
      ADD CONSTRAINT user_answers_wrong_reason_check
      CHECK (wrong_reason IS NULL OR wrong_reason = ANY (ARRAY['concept', 'careless', 'misread', 'unlearned']));
  END IF;
END $$;

-- ---- 90.9 questions(question_type) 缺索引 ----
-- 本文件原来建的是 idx_questions_type，随后在「清理重复索引」那一节被 DROP 掉了，
-- 但那次清理的依据是「它和另一个在用的索引定义完全相同，删掉重复的那个」——
-- 而那个「在用的」叫 idx_questions_question_type，生产有、本文件从来没有。
-- 结果就是重放出来的库在 questions(question_type) 上一条索引都不剩。
-- 这里按生产的名字补回来，保持「只留一条」的清理意图。
CREATE INDEX IF NOT EXISTS idx_questions_question_type
  ON public.questions USING btree (question_type);

-- ---- 90.10 生产上残留的旧函数重载（不是本文件的缺口，方向相反）----
-- 改函数签名时 PostgreSQL 会新建重载而保留旧的，生产因此多出两个永远不会被命中的版本：
--   public.get_question_meta()                                    ← 已被 (p_subject TEXT DEFAULT NULL) 取代
--   public.start_sequential_session(UUID, TEXT[], TEXT[], TEXT, TEXT)  ← 已被带 p_ignore_answered 的 6 参数版取代
-- 二者语义与新版本完全一致（新版本的默认值补齐后行为相同），本文件正确地只保留新版本。
--
-- 危害已实测复现（在香港库上直接调 PostgREST RPC）：
--   传齐具名参数      -> 200，只有一个候选能匹配
--   少传一个可空参数  -> 300 PGRST203，两个重载同时可匹配
-- 实测数据：get_question_meta 传 {} 得 300、传 {p_subject:null} 得 200；
--          start_sequential_session 传 5 个参数得 300、传 6 个参数得 200。
-- 即这不是理论风险，只要有任何调用方少传一个可选参数就会直接失败。
--
-- 香港库已执行清理，清理后上述 4 种调用全部 200：
--   DROP FUNCTION IF EXISTS public.get_question_meta();
--   DROP FUNCTION IF EXISTS public.start_sequential_session(UUID, TEXT[], TEXT[], TEXT, TEXT);
--   NOTIFY pgrst, 'reload schema';
-- 云上生产库仍有这两个残留（前端每次都传齐参数，所以暂时没暴露），建议一并清理。
--
-- 注：get_subject_progress 同样有 4 参数/5 参数两个版本，但**两个都写在本文件里**，
-- 属于有意的重载设计，不在本次清理范围。前端三个调用点都传了 p_subject_resets，
-- 因此目前不报错；将来若有调用方只传 4 个参数，会得到同样的 PGRST203。

-- ---- 90.11 已知的「迁移超前」项，故意不动 ----
-- public.exam_schedules.email_send_date —— 原判断为「尚未上线的邮件提醒功能，属于迁移
-- 超前于生产」。这个判断是错的，已在 Section 96 纠正：该列确实是线上缺列，且已经造成
-- 线上故障（预约考试的保存、notify-exam 的查询都会 400）。对齐方向没错（把生产补上），
-- 但性质是补故障，不是等发版，所以不再「故意不动」。
--
-- public.rls_auto_enable() 是 Supabase 平台托管的 event trigger 函数：云上和自建的
-- supabase/postgres 镜像都会在 initdb 阶段把它建进 public，不由本文件创建。
-- 本文件对它的 REVOKE 已经用 IF EXISTS 守卫 —— 实测在「只跑本文件」的空库上它确实
-- 不存在（那种场景 public 是空的），在生产库和自建栈上都存在。
-- 本文件对每张表都显式写了 ENABLE ROW LEVEL SECURITY，不依赖这个平台钩子。
-- ============================================================================
-- Section 91: 网络路径对照探针
-- ----------------------------------------------------------------------------
-- 背景：实测中国大陆到香港源站直连裸 TCP 只要 52ms，而经 Cloudflare 免费版
-- 被 anycast 落到美西/欧洲边缘要 272ms，单次 API 调用从 0.17s 变成 1.42s（8.3 倍）。
-- 但那只是一条电信线路的样本，不足以决定是否把整个 API 切到直连。
--
-- 这张表用来收集真实用户浏览器里两条路径的对比数据：
--   direct_* —— https://api.pguide.dev   （DNS-only 直连香港源站）
--   cdn_*    —— https://supabase.pguide.dev（经 Cloudflare）
-- 前端只用它做「只上报不改行为」的测量，切换与否由数据决定。
--
-- 写入走 Edge Function net-probe（service_role），前端不直接写这张表。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.net_probe_samples (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 两条路径各自的耗时（毫秒）与是否成功
  direct_ms    NUMERIC,
  cdn_ms       NUMERIC,
  direct_ok    BOOLEAN NOT NULL DEFAULT false,
  cdn_ok       BOOLEAN NOT NULL DEFAULT false,

  -- 采样点信息：CF 边缘机房、网络类型、运营商侧 RTT、连接方式
  colo         TEXT,
  conn_type    TEXT,
  downlink_mbps NUMERIC,
  client_rtt_ms NUMERIC,
  save_data    BOOLEAN,

  -- 粗粒度地域与 UA（不做精确 IP 定位，避免存个人信息）
  region       TEXT,
  ua           TEXT
);

COMMENT ON TABLE public.net_probe_samples IS
  '网络路径对照探针：同一浏览器同一时刻分别打 api.pguide.dev（直连）与 supabase.pguide.dev（经 CF）的耗时对比。只上报不改行为。';
COMMENT ON COLUMN public.net_probe_samples.colo IS
  'Cloudflare 边缘机房代码（取自 /cdn-cgi/trace 的 colo=），用于判断用户被调度到了哪个边缘。';

CREATE INDEX IF NOT EXISTS idx_net_probe_created_at ON public.net_probe_samples(created_at DESC);

ALTER TABLE public.net_probe_samples ENABLE ROW LEVEL SECURITY;

-- 只有管理员能读（含聚合分析）
DROP POLICY IF EXISTS net_probe_admin_read ON public.net_probe_samples;
CREATE POLICY net_probe_admin_read ON public.net_probe_samples
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 前端不直接写这张表，全部经 Edge Function net-probe（service_role）写入；
-- 因此这里不给 anon/authenticated 任何 INSERT 权限，避免被刷。
REVOKE INSERT, UPDATE, DELETE ON public.net_probe_samples FROM anon, authenticated;
GRANT SELECT ON public.net_probe_samples TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.net_probe_samples_id_seq TO service_role;
GRANT ALL ON public.net_probe_samples TO service_role;
-- ============================================================================
-- Section 92: 收回 anon/authenticated 上不该有的表权限（含默认权限治根）
-- ----------------------------------------------------------------------------
-- 背景：production 的 59 张 public 表全部把 TRUNCATE / REFERENCES / TRIGGER
-- 授予了 anon 和 authenticated。其中 TRUNCATE 最危险 —— 它【不受 RLS 约束】，
-- has_table_privilege('anon','public.profiles','TRUNCATE') 实测为 true。
--
-- 今天不可直接利用：PostgREST 只把 GET/POST/PATCH/DELETE 映射到
-- SELECT/INSERT/UPDATE/DELETE，不暴露 TRUNCATE。但这是明确的权限过宽 ——
-- 任何 SECURITY INVOKER 函数、或将来新增的 RPC，都可能把它变成真漏洞。
--
-- 这三项权限客户端角色永远不需要：
--   TRUNCATE   —— 清空整表，绕过 RLS
--   REFERENCES —— 建外键引用该表
--   TRIGGER    —— 在该表上建触发器
--   MAINTAIN   —— PG17 起的新权限，含 LOCK TABLE（anon 可借此对表加排他锁做 DoS）
--
-- 注意【不收回序列的 USAGE】：BIGSERIAL 主键的 DEFAULT nextval() 需要它，
-- 收了会让 INSERT 直接失败。
--
-- 已确认没有任何函数体依赖这三项权限（扫过 pg_get_functiondef）。
-- ============================================================================

-- ---- 92.1 现存表：逐表收回 ----
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.%I FROM anon, authenticated',
      r.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Section 92: 已处理 % 张表', n;
END $$;

-- ---- 92.2 治根：改默认权限，让新表不再自动带上这些 ----
-- 不改的话每建一张新表都会重新长出这个问题（实测确认过）。
-- 需要是该默认权限所属的角色；ANON/AUTHENTICATED 在 public 下由 postgres 建表，
-- 所以改 postgres 即可。若当前执行角色没有权限（例如在某些托管环境里），
-- 忽略错误并给出提示 —— 这一句失败不影响 92.1 已经生效的结果。
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
       || 'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated';
  RAISE NOTICE 'Section 92: 已修改 postgres 的默认权限';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Section 92: 无权修改 postgres 的默认权限（需要超级用户），跳过；新建表仍会带上这几项权限，部署后需手动执行一次。';
END $$;
-- ============================================================================
-- Section 93: 补上基础表权限（生产有、本文件从未显式授予）
-- ----------------------------------------------------------------------------
-- 实测对比「香港生产库」与「空库重放本文件」在 public 上的授权：
--   生产 465 条，重放 1 条。
-- 也就是说重放出来的库 anon 读不了任何表、authenticated 只在 net_probe_samples
-- 上有 SELECT —— 全新部署会直接不可用。
--
-- 根因：生产的这些权限来自建表时的 ALTER DEFAULT PRIVILEGES（postgres 角色在
-- public 下默认把 arwdDxtm 授予 anon/authenticated），而本文件从没显式写过。
-- 之前只对比了列/索引/约束/函数，权限这一维一直没查。
--
-- 本 section 只授到生产实际拥有的那四项，【不含】TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
-- —— 那四项已由 Section 92 收回，92 在前、93 在后，最终结果正好是 arwd。
-- 真正的访问控制是 RLS（本文件有 105 条策略），这里的 GRANT 只是让 RLS 有机会生效。
--
-- 序列权限必须一起给：BIGSERIAL 主键的 DEFAULT nextval() 需要 USAGE，
-- 缺了 INSERT 会直接失败（生产有 20 条序列授权，重放 0 条）。
-- ============================================================================

-- ---- 93.1 现存对象 ----
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ---- 93.2 治根：默认权限，让将来新建的对象自动带上正确的权限 ----
-- 与 Section 92.2 是配套的：那边收回危险项，这边授予必需项。
-- 同样需要是该默认权限所属的角色；无权时忽略并提示。
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
       || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
       || 'GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated';
  RAISE NOTICE 'Section 93: 已修改 postgres 的默认权限（授予 arwd / 序列 USAGE,SELECT,UPDATE）';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Section 93: 无权修改 postgres 的默认权限（需要超级用户），跳过；新建对象需手动授权。';
END $$;

-- ============================================================================
-- Section 94: get_plan_stats 去掉 ua_u 上的 MATERIALIZED（压测发现的最大热点）
-- ----------------------------------------------------------------------------
-- 压测数据：并发 50 时数据库总执行时间 83.7 秒，其中 get_plan_stats 占 54.4 秒（65%），
-- 单次 58ms（空载 31ms）。按「Postgres 占系统 CPU 55%」折算，这一个函数吃掉整机约 36% 的 CPU。
--
-- 原因：ua_u 是「该用户的全部作答记录」，加了 MATERIALIZED 会被强制全量物化
-- （实测 3505 行），而下游 answered 只引用它一次 —— 计划器因此无法把
-- question_id = scope.id 谓词下推，只能先物化再连接。
--
-- 改动只有一处：去掉 MATERIALIZED。
-- 效果（数据库内计时 30 次）：p50 31.0ms -> 22.9ms，-26%。
--
-- 等价性验证：用 10 种参数形状逐一比对输出（roundPlanSpec 的 {since}、
-- goalPlanSpec 的 {since, steps}、steps 为空、size、size+steps、size=0、
-- 无 since、日期格式 since、NULL 计划、空计划），全部逐字节一致。
--
-- 注意：本文件前面还有一份带 MATERIALIZED 的旧定义，这一段在后面，会覆盖它。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_plan_stats(p_user_id uuid, p_plan jsonb)
 RETURNS TABLE(subject text, total bigint, attempts bigint, done_dates jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT e.key AS subject,
           CASE
             WHEN COALESCE(e.value->>'since', '') = '' THEN NULL
             WHEN (e.value->>'since') ~ '^\d{4}-\d{2}-\d{2}$'
               THEN ((e.value->>'since') || ' 00:00:00+08')::TIMESTAMPTZ
             ELSE (e.value->>'since')::TIMESTAMPTZ
           END                                     AS since,
           NULLIF(e.value->>'size', '')::BIGINT    AS size,
           COALESCE(e.value->'steps', '[]'::jsonb) AS steps
    FROM jsonb_each(COALESCE(p_plan, '{}'::jsonb)) AS e
  ),
  sess AS (
    SELECT s.question_ids
    FROM public.practice_sequential_state s
    WHERE s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT 1
  ),
  sess_ids AS (
    SELECT DISTINCT unnest(s.question_ids) AS qid
    FROM sess s
    WHERE s.question_ids IS NOT NULL
  ),
  scope AS (
    SELECT q.id, b.subject, b.since, b.size, b.steps, true AS by_goal
    FROM base b
    JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) > 0
    UNION ALL
    SELECT q.id, b.subject, b.since, b.size, b.steps, false
    FROM base b
    JOIN sess_ids si ON true
    JOIN public.questions q
      ON q.id = si.qid AND q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) = 0
    UNION ALL
    SELECT q.id, b.subject, b.since, b.size, b.steps, false
    FROM base b
    JOIN public.questions q
      ON q.subject = b.subject
     AND q.key_points IS NOT NULL AND q.key_points <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.user_excluded_questions ueq
       WHERE ueq.question_id = q.id AND ueq.user_id = p_user_id
     )
    WHERE jsonb_array_length(b.steps) = 0
      AND (SELECT question_ids FROM sess) IS NULL
  ),
  tot AS (
    SELECT sc.subject, sc.since, sc.size, sc.steps, sc.by_goal, COUNT(sc.id)::BIGINT AS total
    FROM scope sc
    GROUP BY sc.subject, sc.since, sc.size, sc.steps, sc.by_goal
  ),
  ua_u AS (
    SELECT ua.id AS answer_id, ua.question_id, ua.answered_at, ua.mode, ua.source
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id
  ),
  answered AS (
    SELECT sc.subject, sc.by_goal, ua.question_id, ua.answer_id, ua.answered_at, ua.mode, ua.source
    FROM scope sc
    JOIN ua_u ua ON ua.question_id = sc.id
    WHERE sc.since IS NULL OR ua.answered_at >= sc.since
  ),
  q_once AS (
    SELECT a.subject, a.question_id, MIN(a.answered_at) AS answered_at
    FROM answered a
    WHERE NOT a.by_goal
    GROUP BY a.subject, a.question_id
  ),
  q_rank AS (
    SELECT q.subject, q.question_id, q.answered_at,
           ROW_NUMBER() OVER (PARTITION BY q.subject ORDER BY q.answered_at, q.question_id) AS rn
    FROM q_once q
  ),
  evt AS (
    SELECT a.subject, a.answered_at,
           ROW_NUMBER() OVER (PARTITION BY a.subject ORDER BY a.answered_at, a.answer_id) AS rn
    FROM answered a
    WHERE a.by_goal AND a.mode = 'practice' AND a.source IS DISTINCT FROM 'random'
  ),
  mark_goal AS (
    SELECT b.subject, SUM(x.v) OVER (PARTITION BY b.subject ORDER BY x.ord) AS rn
    FROM tot b
    CROSS JOIN LATERAL (
      SELECT (v.value)::BIGINT AS v, v.ord
      FROM jsonb_array_elements_text(b.steps) WITH ORDINALITY AS v(value, ord)
    ) x
  ),
  mark_round AS (
    SELECT d.subject, d.rn, d.answered_at
    FROM q_rank d
    JOIN tot b ON b.subject = d.subject
    WHERE jsonb_array_length(b.steps) = 0
      AND COALESCE(b.size, b.total) > 0
      AND d.rn = COALESCE(b.size, b.total)
  ),
  dated AS (
    SELECT g.subject, e.answered_at
    FROM mark_goal g
    JOIN evt e ON e.subject = g.subject AND e.rn = g.rn
    UNION ALL
    SELECT r.subject, r.answered_at FROM mark_round r
  ),
  evt_cnt AS (SELECT subject, COUNT(*) AS n FROM evt GROUP BY subject),
  q_once_cnt AS (SELECT subject, COUNT(*) AS n FROM q_once GROUP BY subject),
  dated_agg AS (
    SELECT subject,
           jsonb_agg(to_char((answered_at AT TIME ZONE 'Asia/Shanghai')::DATE, 'YYYY-MM-DD')
                     ORDER BY answered_at) AS arr
    FROM dated
    GROUP BY subject
  )
  SELECT tot.subject,
         tot.total,
         CASE WHEN jsonb_array_length(tot.steps) > 0
              THEN COALESCE(ec.n, 0)
              ELSE LEAST(COALESCE(qc.n, 0), tot.total)
         END AS attempts,
         COALESCE(da.arr, '[]'::jsonb) AS done_dates
  FROM tot
  LEFT JOIN evt_cnt ec ON ec.subject = tot.subject
  LEFT JOIN q_once_cnt qc ON qc.subject = tot.subject
  LEFT JOIN dated_agg da ON da.subject = tot.subject
  ORDER BY tot.subject;
$function$;

-- ============================================================================
-- Section 95: 让「小表也能被自动 ANALYZE」
-- ----------------------------------------------------------------------------
-- 实测发现 public.user_excluded_questions（1 行）和 public.practice_sequential_state（3 行）
-- 在 pg_class 里 reltuples = -1，也就是【从未被统计过】。
--
-- 原因：autovacuum_analyze_threshold 默认 50、autovacuum_analyze_scale_factor 默认 0.1，
-- 触发条件是「改动行数 > 50 + 表行数*10%」。一张 1 行的表永远达不到 50，于是永远不统计，
-- 计划器只能靠默认估算。而这张表在 get_plan_stats 的 scope 构建里，每次调用要被反连接探测
-- 1356 次 —— 计划器对它的判断直接影响选哪种连接算法。
--
-- 手动 ANALYZE 后实测该函数 p50 从 16.01ms 降到 15.24ms（5%）。收益不大，
-- 但这是配置缺陷：数据库里每张"永远长不到 50 行"的小表都会踩到，且会随数据增长再次影响计划。
--
-- 修法是给这类表单独放低阈值。这里只给确认受影响、且在热路径上的两张表设置，
-- 不做全库铺开 —— 大表用默认阈值是对的。
-- ============================================================================

ALTER TABLE public.user_excluded_questions
  SET (autovacuum_analyze_threshold = 1, autovacuum_analyze_scale_factor = 0);

ALTER TABLE public.practice_sequential_state
  SET (autovacuum_analyze_threshold = 1, autovacuum_analyze_scale_factor = 0);

-- ============================================================================
-- Section 96: 生产库反向对齐（补漏列 + 清死函数）
-- ----------------------------------------------------------------------------
-- 背景：Section 90 把本文件按「生产快照」对齐过一轮，但当时把唯一剩下的差异
-- exam_schedules.email_send_date 判成了「迁移超前于生产，故意不动」。这次把
-- Section 95 加进来重跑空库重放，差异只剩它一项，于是回到线上实测，结论是判错了。
--
-- ---- 96.1 exam_schedules.email_send_date 是线上缺列，不是超前 ----
-- 实测（经 PostgREST 直查生产库）：
--     GET /rest/v1/exam_schedules?select=id,email_send_date
--     -> HTTP 400 {"code":"42703","message":"column exam_schedules.email_send_date does not exist"}
-- 这个列有三个线上调用方，全都已经上线：
--   · supabase/functions/notify-exam/index.ts:217 —— 它把 email_send_date 和其余 11 个
--     列写在同一条 select 里，所以整条查询一起失败，schedules 拿到 null，
--     邮件/推送提醒【全部静默不发】，而函数还是返回 200，日志里看不出问题。
--   · src/stores/exam-schedule-store.ts:67 —— 新建预约时无条件带上该列，
--     于是前端「保存预约」直接报列不存在。
--   · src/lib/exam-schedule.ts:101 —— 读路径，null 容错，只是静默丢字段。
-- 本文件 Section 28.1 一直有这个列，所以【空库重放出来的库是好的，生产才是坏的那边】。
-- 修法是把生产补上（已执行），本节只留幂等语句保证任何环境都补齐。
--
-- ALTER 用 DATE 与原定义一致；补列不会动既有授权（public 各表是表级 GRANT，
-- 新列自动被覆盖），补完记得让 PostgREST 重载 schema cache。
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_send_date DATE;

-- ---- 96.2 清理死函数 get_plan_stats_v3 ----
-- 生产库里有 get_plan_stats 和 get_plan_stats_v3 两个同签名函数（都是一次优化实验的
-- 残留）。前端只调 get_plan_stats（src/hooks/use-plan-completion.ts:183），库内也没有
-- 任何视图/函数依赖 v3，而它同样对 anon / authenticated 开放 RPC —— 一个没人用却对外
-- 可调的死接口。它也是重放 diff 里最后一项「生产多出来的函数」（另一项
-- rls_auto_enable 是平台托管，见 90.11）。已从生产删除，定义备份在服务器
-- /root/gps-v3-orig.sql。
-- 全新部署本来就不会有它，所以这里只需 DROP IF EXISTS，对空库是空操作。
DROP FUNCTION IF EXISTS public.get_plan_stats_v3(uuid, jsonb);

-- Public 的 RPC 只应暴露前端真正在用的那一个。若将来还要做优化实验，请在事务里
-- 改名验证，别把实验版本留在生产上对 anon 开放。
-- ============================================================================
-- Section 97: 探针字段语义随「入口变更」固定下来（仅注释，不改结构）
-- ----------------------------------------------------------------------------
-- Section 91 建 net_probe_samples 时，生产入口 supabase.pguide.dev 还挂在 Cloudflare
-- 后面，所以那是「直连 vs 经 CF」的两条路径对照。
--
-- 2026-09-25 的经过（留档，避免以后又按旧假设读这张表）：
--   ① 先试了把生产入口切成直连香港源站 —— **只改 DNS 记录，hostname 不变**。
--      为什么不动 hostname：换 hostname 会让 supabase-js 的 storageKey 从
--      sb-supabase-auth-token 变掉，等于把全体用户登出，还会牵动 OAuth callback /
--      邮件 magic link / CORS 白名单。
--      同机受控对比很悬殊：直连 87ms vs 经 CF 1328ms（CF 把香港的请求甩到美西再回
--      香港源站，边缘机房先后见过 AMS / SJC / PDX，是漂的）。
--   ② 但真实用户端体感没有差别，于是当晚回滚：supabase.pguide.dev 恢复 CF 代理，
--      直连入口 api.pguide.dev 的 DNS 记录删除（源站 IP 暴露是回滚的主要理由之一）。
--
-- 所以字段含义按「生产入口 / 对照组」来理解，而不是按「直连 / CDN」：
--   direct_ms / direct_ok —— 生产入口(= VITE_SUPABASE_URL)的往返耗时 / 是否成功
--   cdn_ms    / cdn_ok    —— 可选对照组的耗时 / 是否成功，未配置时为 null / false
--   colo                  —— 对照组的 Cloudflare 边缘机房，未配置时为 null
--
-- 前端 src/lib/net-probe.ts 只在 VITE_NET_PROBE_CONTROL_HOST 配了对照入口时才填
-- cdn_* 与 colo，所以正常情况下这两列为 null —— 这是预期，不是采集失败。
--
-- 两个踩过的坑：
--   · 对照域名必须真实存在：指向已删除的 api.pguide.dev 会让浏览器报
--     ERR_NAME_NOT_RESOLVED（try/catch 拦不住浏览器的控制台报错）。
--   · 对照域名必须是 Cloudflare 代理的：readColo() 读的是 CF 专有的 /cdn-cgi/trace，
--     直连源站没这个端点，404 且不带 CORS 头，每次会话多 2 条控制台错误。
--     nginx 侧已给该路径留了带 CORS 的空 204 垫片，兜住还在跑旧构建的用户。
--   · 两条路径要顺序测，不能 Promise.all：窄带上两条 TLS 握手互相抢带宽，
--     3G 实测给出 420.6ms vs 419.8ms 这种把差异抹平的数字，等于白测。已改成顺序测。
-- ============================================================================

COMMENT ON TABLE  public.net_probe_samples IS '网络路径探针：记录真实用户浏览器测到的生产入口(及可选对照组)往返耗时。只上报不改行为。字段语义见 Section 97。';
COMMENT ON COLUMN public.net_probe_samples.direct_ms IS '生产入口(= VITE_SUPABASE_URL)往返耗时 ms';
COMMENT ON COLUMN public.net_probe_samples.cdn_ms    IS '可选对照组(另一条入口)往返耗时 ms；未配置 VITE_NET_PROBE_CONTROL_HOST 时为 null';
COMMENT ON COLUMN public.net_probe_samples.direct_ok IS '生产入口是否请求成功';
COMMENT ON COLUMN public.net_probe_samples.cdn_ok    IS '对照组是否请求成功；未配置对照组时为 false';
COMMENT ON COLUMN public.net_probe_samples.colo      IS '对照组的 Cloudflare 边缘机房；未配置对照组或对照组非 CF 代理时为 null';
COMMENT ON COLUMN public.net_probe_samples.client_rtt_ms IS '浏览器 Network Information API 报的网络 RTT，精度粗糙仅供分档';

-- ============================================================================
-- Section 98: 补回 on_auth_user_created —— 新用户没有 profile 会让 Passkey 卡死在 /guide
-- ----------------------------------------------------------------------------
-- 症状（2026-09-25 线上实测，自建香港栈）：
--     POST /functions/v1/manage-passkey {action:"register-begin"}
--   -> 200，且正常带回 challenge；但 auth_challenges 里【没有】对应行，
--      于是紧接着的 register-complete 里那句「取最近一条未过期挑战」查不到东西，
--      返回 400 {"error":"no valid challenge found, try again"}，前端把它原样显示在引导页。
--
-- 根因不在 passkey 代码，而在 auth.users 上少了 on_auth_user_created（本文件 Section 13 建的那条）：
--   · 香港自建栈是按「生产 schema 克隆」搭起来的，而当时对账的五个维度是
--     列 / 索引 / 约束 / 函数 / 表权限 —— 触发器不在其中，整条链就这么漏过去了；
--   · 于是新用户只写进 auth.users，没有 profiles 行（实测 3 个用户缺 profile，含 2 个真实用户）；
--   · 而 auth_challenges.user_id REFERENCES profiles(id)，插入直接 23503 外键失败；
--   · manage-passkey 的 register-begin 当时没有检查 insert 的返回值（本次一并修掉），
--     所以这个失败被静默吞掉，前端只看到一句误导性的 400。
--
-- 影响面不限于 passkey：任何以 profiles 为外键的写入（user_answers / favorites /
-- exam_sessions / user_preferences …）对新用户都会失败 —— 引导页只是最先撞上的那一步。
--
-- 复现与验证都用同一对查询：
--   select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
--     join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='auth' and c.relname='users' and not t.tgisinternal;   -- 修复前 0，修复后 1
--   select count(*) from auth.users u left join public.profiles p on p.id=u.id where p.id is null;
--
-- 本节两件事，都幂等：① 补回触发器；② 回填历史缺失的 profile。
-- 函数 handle_new_user 已由 Section 70.3 定义（本文件重放时一定在前面），这里只建触发器；
-- 函数真的缺失时应该报错中断 —— 那正是需要被看见的环境问题。
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 回填只补缺失的行，已存在的一律不动（不覆盖 role / onboarded_at 等已有状态）。
-- 回填一律给普通用户：「首位用户自动成为管理员」是注册那一刻的判定，不属于回填语义。
-- ON CONFLICT 兜住并发注册（触发器与本节同时生效时不会撞主键）。
INSERT INTO public.profiles (id, role)
SELECT u.id, 'user'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Section 99: 匿名暴露面审计记录（只读实测 + 静态核对，未附可执行 DDL）
-- ----------------------------------------------------------------------------
-- 本节只留结论，**故意不含 SQL**：下面这些收紧都会改变"未登录访客能不能读/调"的语义，
-- 而我这次只拿到了 publishable key（匿名身份），无法完成 anon / 普通用户 / 管理员
-- 三种身份的对照测试。没有那个对照就改权限，等于拿线上行为做赌注。
-- 复跑方式：node scripts/audit-anon-exposure.mjs（只读，不打印行内容）
--
-- ---- 99.1 表读取：3 张表对匿名可读，均走 is_public「公开内容」路径，未发现私有数据外泄 ----
--   · user_answers      21 行（全部 is_public = true，即「公开笔记」）
--   · question_banks    is_public = true 的公开题库
--   · question_bank_items 上述题库里的题
--   三张表的策略（user_answers_public_select / qb_select / qbi_select）都带了
--   `OR user_id = auth.uid() OR is_admin()`，只是**没写 TO authenticated**，所以对 anon 也生效。
--   这些页面在应用里全在 OtpGuard 之后，未登录访客本来也看不到 —— 如果确认公开内容不需要
--   给匿名访客看，逐个加 `TO authenticated` 即可，对已登录用户零影响。
--
-- ---- 99.2 函数 EXECUTE：24/67 个函数对匿名可调，只有 1 个值得盯 ----
--   Supabase 给 public schema 设了默认权限，新建函数会被显式授予 anon / authenticated，
--   所以判据不是"有没有 GRANT"，而是"有没有 REVOKE FROM anon"（Section 68 已踩过这个坑）。
--   **这一条判据后来被 Section 101 修正了**：PG 对函数的内建默认是 GRANT EXECUTE TO PUBLIC，
--   实测 proacl 上同时存在 `=X/postgres`（PUBLIC）与 `anon=X/postgres` 两条 —— 只撤其中一条
--   都撤不干净，必须 `FROM anon, PUBLIC`。所以下面这个"24"是**候选集**，不是最终可调数。
--   24 个匿名可调里：
--     · qr_login_status —— 匿名可调 + SECURITY DEFINER + 函数体不判身份。**这是有意为之**：
--       扫码页在未登录时轮询它，安全性来自 `secret_hash = sha256(p_secret)` 这个只有
--       发起端知道的秘密，不是身份。它的兄弟 qr_login_claim（真正换 user_id 的那个）已经
--       只授权给 service_role。抽查确认无问题。
--     · is_study_room_member / is_study_room_owner —— DEFINER 但函数体有身份判断，
--       且它们本来就是给 RLS 策略当谓词用的，匿名执行是 RLS 求值的一部分。
--     · 其余 21 个都是 SECURITY INVOKER（按调用者权限跑，受 RLS 约束），属于多余的暴露面，
--       不是漏洞。登录前真正需要匿名的只有 qr_login_status，其余都可以收回
--       （写法见 Section 101.1：`REVOKE EXECUTE ON FUNCTION ... FROM anon, PUBLIC`）。
--
-- ---- 99.3 需要留意的一类"现在安全、但很脆"的写法（未改） ----
--   下面 11 个函数都接收 p_user_id，但没有一个校验 `p_user_id = auth.uid()`，
--   函数体里也完全没有 auth.uid() / is_admin()：
--     get_plan_stats, get_subject_progress, get_review_count, get_review_pool_count,
--     get_kp_exclusion_stats, get_excluded_kp_questions, load_practice_session,
--     get_sessions_answered, get_type_accuracy, get_accuracy_change, get_daily_completion
--   现在**不构成越权**：它们都是 SECURITY INVOKER，读 user_answers / profiles 时照样受 RLS
--   约束，传别人的 uuid 只会读到空。但这层保护完全靠"记得不要改成 SECURITY DEFINER" ——
--   而为了跨表读取把函数改成 DEFINER 是很自然的下一步，那一刻这 11 个会同时变成 IDOR
--   （任何登录用户传别人的 uuid 就能读别人的统计）。建议补一句
--   `IF p_user_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION ...`。
--   Section 66/68/71 的教训（"DEFINER 里不能拿 current_user 判管理员"）是同一类问题的另一面。
--
-- ---- 99.4 策略层：88 条策略没有 TO 子句，但没有一条是"漏写身份判断" ----
--   静态扫过全部策略：不带 TO 子句的 88 条里，每一条的 USING/WITH CHECK 都引用了
--   auth.uid() / auth.role() / auth.jwt() / is_admin()，没有出现"完全不判身份"的策略。
--   它们对 anon 生效是因为未加 TO 限制，但谓词本身在 anon 身份下恒假（auth.uid() 为 NULL），
--   所以实测匿名读不到行。这类策略是"看起来危险、实际安全"，收尾时加 TO authenticated
--   可以少一层解释成本。
-- ============================================================================

-- ============================================================================
-- Section 100: 离线 Outbox 的服务端幂等键
-- ----------------------------------------------------------------------------
-- 背景：客户端的离线队列（src/lib/offline-db.ts）已经给每次作答生成了
-- client_operation_id，并在 outbox 里按它去重、按错误类型退避重试。但那只解决了
-- "客户端不重复入队"，解决不了"请求发出去了、响应没回来、服务端其实已经写入"——
-- 这种情况下重试会多写一条作答，把错误率和计划进度都算多。
--
-- 这里补上服务端的去重键。**本节是向后兼容的**：新列可空，部分唯一索引只约束非空值，
-- 所以旧客户端（不带这一列）继续按原样插入，不会因为这次迁移而失败。
--
-- 配套的客户端改动（还没做，等这一列上线后再动，否则插入会报列不存在）：
--   1. `OutboxOperation.payload` 增加 client_operation_id；
--   2. `sync-store` 排空时把它一起发给 insertAnswer；
--   3. **关键**：重复插入会撞唯一索引得到 23505 —— 那意味着"这次操作早就成功了"，
--      应当按成功处理（从队列里删掉），而不是像现在这样归类成 conflict 停在队列里。
--      也就是说 `drainOutbox` 里的 conflict 分支要区分"幂等键冲突"和"真正的数据冲突"。
--
-- 顺带说明为什么不能直接靠 upsert 去重：考试作答确实可以按
-- (user_id, question_id, exam_session_id) upsert（services/practice.ts 的 upsertAnswer 就是这么做的），
-- 但练习模式 intentionally 允许同一道题反复作答并保留每一次记录（错题回顾和遗忘曲线都依赖这个），
-- 所以练习路径只能新增一列幂等键，不能改唯一约束。
-- ============================================================================
ALTER TABLE public.user_answers
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

-- 部分唯一索引：只为带键的行保证唯一，既存数据（全为 NULL）不受影响
CREATE UNIQUE INDEX IF NOT EXISTS user_answers_client_operation_id_key
  ON public.user_answers (client_operation_id)
  WHERE client_operation_id IS NOT NULL;

COMMENT ON COLUMN public.user_answers.client_operation_id IS
  '离线队列的幂等键：同一次用户动作的重试共用一个值，用来让服务端识别"这条已经写过了"';

-- ============================================================================
-- Section 101: 匿名暴露面收敛 —— 收回 anon 的函数 EXECUTE（可执行 DDL）
-- ----------------------------------------------------------------------------
-- Section 99 记了审计结论但没给 SQL；这一节把其中**结论明确**的那部分变成可执行语句。
-- 仍未在线上执行过，见本节末尾的说明。
--
-- 为什么可以断言"anon 不需要这些函数"：Supabase 给 public schema 设了默认权限，
-- 新建函数会被显式授予 anon/authenticated，所以线上 67 个函数里有 24 个匿名可调 ——
-- 但那是**默认权限的副作用**，不是谁决定要给匿名用的。逐条看过之后：
--   · 匿名真正需要的只有 qr_login_status（扫码页在未登录时轮询它，安全性来自
--     `secret_hash = sha256(p_secret)` 这个只有发起端知道的秘密，不是身份）；
--   · is_study_room_member / is_study_room_owner 是给 RLS 策略当谓词用的，而
--     **策略谓词是以调用者身份求值的**，所以它们必须保持匿名可执行；
--   · 其余 21 个都是 SECURITY INVOKER，按调用者权限跑、受 RLS 约束 —— 多余的暴露面。
--
-- ---- 101.1 逐函数收回，并**自动护住被 RLS 策略引用的那些** ----
-- 这一段的关键是那条白名单不是手写的：策略谓词以调用者身份求值，一旦把某个谓词函数
-- 的 EXECUTE 从 anon 收回，匿名查询就不再是"读到 0 行"，而是直接
-- `permission denied for function ...`。所以先从 pg_policy 的表达式里把函数名扫出来，
-- 连同一份"有意保留"的短名单一起排除。宁可少收几个，也不能把策略求值弄坏。
--
-- 白名单里的关键字（AND / EXISTS / FROM / ON / OR / WHERE）和 `uid` / `role`（来自
-- auth.uid() / auth.role()）是正则的副作用 —— 这个清单只用来**排除**，多几个不存在的名字
-- 没有影响，少一个才会出问题。
--
-- **必须排除 extension 拥有的函数**：这个库把 pgvector / pg_trgm 装在了 public schema 里，
-- 于是 array_to_vector / cosine_distance / gin_trgm_consistent 这些也出现在"public 函数"里。
-- 它们在 101.1 的第一版里被一起收掉了 —— 那是索引支持函数，属于扩展的一部分，
-- 收权限既没有意义、又可能把基于 trgm 的检索弄坏。判据是 pg_depend.deptype = 'e'。
--
-- 在 linked 库上只读实测过这条查询：public 下 225 个函数（含扩展），其中应用自己的 76 个，
-- **匿名可调的 26 个**，全部是"必须登录才有意义"的 RPC（get_plan_stats / get_random_question_id /
-- load_practice_session / get_subject_progress / save_resource_toc ...），与 Section 99.2 的结论一致；
-- qr_login_status 不在其中（已在白名单）。
--
-- ---- ⚠ 修正 Section 99.2 的一个前提：光 `FROM anon` 是撤不掉的 ----
-- 实测 `proacl`，一个典型函数上是：
--     {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- 开头那个没有受让者的 `=X/postgres` 就是 **PUBLIC** 的授权 —— 而 PostgreSQL 对函数的内建默认
-- 就是 `GRANT EXECUTE ... TO PUBLIC`。于是：
--   · 只 `REVOKE ... FROM anon`   → anon 仍然通过 PUBLIC 拿到 EXECUTE（has_function_privilege 仍为 true）；
--   · 只 `REVOKE ... FROM PUBLIC` → anon 那条**显式**授权还在（Section 68 记的正是这个方向）。
-- 两个方向都得撤，所以下面写的是 `FROM anon, PUBLIC`。
-- 顺带说明为什么这样收不会影响登录用户：`authenticated` 也有自己的显式授权，撤 PUBLIC 不影响它 ——
-- 实测收完之后 `has_function_privilege('authenticated', ...)` 仍为 true 的有 200/225 个。
-- 也因此 Section 99.2 里"没有显式 REVOKE FROM anon ⇒ 匿名可调"这个判据**偏保守但方向对**：
-- 它列出的是候选集，不是最终结论；要定论得查 has_function_privilege 或用匿名身份真调一次
-- （scripts/audit-anon-exposure.mjs 对只读 RPC 做的就是后者）。
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  CREATE TEMP TABLE section101_keep ON COMMIT DROP AS
  SELECT DISTINCT name FROM (
    SELECT m[1] AS name
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    CROSS JOIN LATERAL regexp_matches(
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
      '([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*[(]', 'g') AS m
    WHERE ns.nspname = 'public'
    UNION ALL
    -- 有意保留的：匿名扫码轮询 + 两个自习室谓词（后者即使没被策略扫到也留着）
    SELECT unnest(ARRAY['qr_login_status', 'is_study_room_member', 'is_study_room_owner'])
  ) names;

  RAISE NOTICE 'Section 101: 白名单 % 个函数（含 RLS 策略引用）', (SELECT count(*) FROM section101_keep);

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind IN ('f', 'w')          -- 不含 PROCEDURE/AGGREGATE：REVOKE ... ON FUNCTION 对它们会报错
      AND p.proname::text NOT IN (SELECT name FROM section101_keep)
      AND NOT EXISTS (                     -- 扩展自带的函数不动（见上面 pgvector / pg_trgm 那段）
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')   -- 已经收过的就不再进循环
  LOOP
    -- FROM anon, PUBLIC 两个都要（原因见上面「修正 Section 99.2 的一个前提」那段）
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', r.proname, r.args);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Section 101: 已对 % 个函数收回 anon 的 EXECUTE', n;
END $$;

-- ---- 101.2 治根：让新建对象不再自动带上 anon ----
-- 与 Section 92 同理，不治根的话下一次建函数/建表又会重新长出来。
--
-- **两个角色都要改**：线上 pg_default_acl 里 `postgres` 与 `supabase_admin` 各有一份默认权限
-- （这台机器的 POSTGRES_USER 是 supabase_admin，迁移多半也是用它在跑）。Section 92.2 当时只改了
-- postgres 那一份，所以 supabase_admin 的默认权限一直还是宽的 —— 实测它给新**表**的默认里
-- `anon=arwdDxtm`，即连 TRUNCATE / REFERENCES / TRIGGER / MAINTAIN 一起给，正是 Section 92 要治的那几项。
-- 所以这里连表的一并收紧。
--
-- 只收 anon（函数）与 anon,authenticated（表上那四项危险权限），SELECT/INSERT/UPDATE/DELETE 照旧：
-- 应用要靠它们，RLS 才是真正拦人的那一层。
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated', role_name);
      RAISE NOTICE 'Section 101.2: 已收紧 % 对新建对象（函数/表）的默认权限', role_name;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Section 101.2: 无权修改 % 的默认权限（需要超级用户），跳过', role_name;
    END;
  END LOOP;
END $$;

-- ---- 101.3 三张"公开内容"表的策略加 TO authenticated（**故意注释掉**） ----
-- Section 99.1 实测出的匿名可读就是这三条策略造成的：它们都带 `OR is_public`，
-- 只是没写 TO 子句，所以对 anon 也生效。应用侧**目前**用不到匿名读：
-- PublicNotesPage（/notes）在 OtpGuard 之内（router 第 51 行的 OtpGuard 包住了它），
-- 未登录访客进不去，公开笔记是给**已登录的其他用户**看的。
--
-- 但它是不是该给匿名看，是个产品决定而不是代码清理：这一列叫 `is_public`，
-- "公开"的字面语义就是"谁都能看"，将来若要做分享链接（把 /notes 挪到 OtpGuard 之外）
-- 就会依赖它。所以这里只把语句准备好，不动线上语义。确认"公开内容不给未登录访客"之后
-- 取消注释执行即可：
--
--   ALTER POLICY user_answers_public_select ON public.user_answers TO authenticated;
--   ALTER POLICY qb_select ON public.question_banks TO authenticated;
--   ALTER POLICY qbi_select ON public.question_bank_items TO authenticated;
--
-- （策略名取自 Section 99.1 的实测清单；执行前先 `\d+ public.user_answers` 核一遍名字，
--   ALTER POLICY 没有 IF EXISTS，名字错了会整段失败。）
--
-- ---- 执行状态：**没有在线上执行过** ----
-- 本节是按仓库约定（单文件迁移 + 追加编号 section）落盘的，不是"已生效"的记录。
-- 没执行的原因与 Section 99 相同：改权限会改变"未登录访客能不能调"的语义，而这轮只拿到
-- 匿名身份（publishable key），做不了 anon / 普通用户 / 管理员三种身份的对照测试。
-- 真要上线时的核对顺序：
--   1. 先跑 node scripts/audit-anon-exposure.mjs 存一份基线（只读，不打印行内容）；
--   2. 在预发库执行本节，再跑一次，比对"匿名可调函数数"应从 24 降到 3；
--   3. 未登录状态实测登录前的路径：扫码登录（qr_login_status 轮询 + qr_login_claim）、
--      落地页、/qr-confirm —— 这三处是唯一可能用到匿名身份的地方；
--   4. 登录后抽查一个读公开笔记的页面（/notes）与自习室（依赖那两个谓词函数）。
-- ============================================================================

-- ============================================================================
-- Section 102: complete_exam —— 把「交卷」收敛成一个事务
-- ----------------------------------------------------------------------------
-- 背景（docs/architecture-optimization.md 第 6 条）：交卷原来是前端编排的**两次写** ——
-- 先把整卷作答 upsert 进 user_answers，再 update exam_sessions 标成 completed。两次之间没有
-- 事务，第二步失败就留下一个半成品：作答已经判完写库了，会话却还是 in_progress、分数还是 0。
-- 用户看到"交卷失败"可以再点一次（upsert 是幂等的，会自愈），但**如果他就此关掉页面**，
-- 这场考试会永远显示"进行中"：下次进 /exam 还会被当成可续考的场次弹出来，
-- 而用户认为自己已经交过了。
--
-- 这一节把两次写收进一个函数，于是要么都成、要么都不成。
--
-- 边界说明（重要）：**判分仍然在客户端**（lib/answer-utils.ts 的 isAnswerCorrect 要处理
-- 单选/多选/填空/翻译/写作/案例分析按小题计分这些口径，移植成 SQL 只会多出一份会漂移的实现）。
-- 这里只保证"作答入库"与"会话完成"这两件事原子，以及幂等与并发安全。
--
-- 幂等：已经 completed 的场次直接返回现状，**不覆盖** completed_at / score / correct_count。
-- 这也是客户端 exam-store 里那道 phase 守卫的服务端版本 —— 两边都有才叫真的挡住。
--
-- 并发：先对会话行 FOR UPDATE。两个人（或两个标签页）同时点交卷时，第二个会等第一个提交，
-- 然后走上面的幂等早返回，而不是把自己算的分数再覆盖一遍。
--
-- duration_ms 由服务端按 started_at 算，不再让客户端拿本地时钟减 —— 少一个时钟来源。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_exam(
  p_session_id UUID,
  p_answers JSONB,
  p_correct_count INT,
  p_score INT,
  p_current_index INT DEFAULT 0
)
RETURNS public.exam_sessions
LANGUAGE plpgsql
-- 按调用者权限跑：user_answers 的 INSERT 与 exam_sessions 的 UPDATE 各自还要过 RLS。
-- 这是有意的 —— 与 Section 99.3 的告警同源，别为了省事改成 DEFINER。
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_session public.exam_sessions;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'complete_exam: 需要登录' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_session
    FROM public.exam_sessions
   WHERE id = p_session_id AND user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    -- 不存在、或不是自己的场次：两种情况回同一个错，不泄露"这个 id 存在但不属于你"
    RAISE EXCEPTION 'complete_exam: 找不到这场考试' USING ERRCODE = 'P0002';
  END IF;

  -- 幂等：已经交过就直接回现状
  IF v_session.status = 'completed' THEN
    RETURN v_session;
  END IF;

  -- 整卷作答一次写入；冲突键与客户端的 upsert 一致（uq_user_answers_session）
  INSERT INTO public.user_answers AS ua
    (user_id, question_id, selected_answer, is_correct, mode, exam_session_id)
  SELECT v_uid,
         (a->>'question_id')::UUID,
         COALESCE(a->'selected_answer', 'null'::JSONB),
         COALESCE((a->>'is_correct')::BOOLEAN, FALSE),
         'exam',
         p_session_id
    FROM jsonb_array_elements(COALESCE(p_answers, '[]'::JSONB)) AS a
  ON CONFLICT (user_id, question_id, exam_session_id)
  DO UPDATE SET selected_answer = EXCLUDED.selected_answer,
                is_correct      = EXCLUDED.is_correct;
  -- 冲突时【不】动 answered_at：那是作答时的自动保存写下的时间，交卷不该把它改成交卷时刻。

  UPDATE public.exam_sessions
     SET status        = 'completed',
         correct_count = COALESCE(p_correct_count, 0),
         score         = p_score,
         duration_ms   = GREATEST(0, (EXTRACT(EPOCH FROM (v_now - v_session.started_at)) * 1000)::BIGINT),
         current_index = COALESCE(p_current_index, 0),
         completed_at  = v_now
   WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END $$;

COMMENT ON FUNCTION public.complete_exam(UUID, JSONB, INT, INT, INT) IS
  '交卷：整卷作答 upsert + 会话完成，同一个事务；已完成的场次幂等早返回';

-- 权限：登录用户可调，匿名不行。注意 PUBLIC 那条内建默认也得撤（Section 101 的实测结论：
-- 只写 FROM anon 撤不掉 PUBLIC 那条，匿名照样能调）。
REVOKE EXECUTE ON FUNCTION public.complete_exam(UUID, JSONB, INT, INT, INT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_exam(UUID, JSONB, INT, INT, INT) TO authenticated;

-- 配套的客户端改动（本次已做）：services/exam.ts 的 completeExam 调这个函数，
-- exam-store.submitExam 用它替换掉原来的 upsertAnswers + completeExamSession 两次写。
--
-- 按仓库「先发代码、后跑迁移」的部署约定（Section 31 的原话），客户端在函数还不存在时
-- **自动降级**回那两步写：PostgREST 回 404 + `PGRST202: Could not find the function ...`，
-- services/exam.ts 的 isFunctionMissing 只认这一种错（网络抖动、权限不足都不能算），
-- 命中才退回旧路径。所以 upsertAnswers / completeExamSession 被保留下来，只服务于这条回退分支 ——
-- 迁移执行之后那个分支就应当永不进入。冒烟测试里有一条断言专门盯这个：
-- 交卷必须是 `POST /rest/v1/rpc/complete_exam`，且**不允许**出现 `PATCH /exam_sessions`。
--
-- 这个函数是纯新增，不破坏兼容：老客户端继续走它自己那两步，不受影响。
-- ============================================================================

-- ============================================================================
-- Section 103: save_learning_route —— 把「保存路线」收敛成一个事务
-- ----------------------------------------------------------------------------
-- 背景（docs/architecture-optimization.md 第 6 条）：路线编辑器一次保存要做的事在
-- `use-route-editor.ts:handleSave` 里是这么一长串**顺序请求**：
--
--   存路线 → 逐个建/改分区 → 重排分区 → 对每个分区：加题、**逐题删**、重排题、**逐题改 node_style**
--   → 逐个删分区 → 存画布 XML → 重新加载
--
-- 两件事同时坏掉了：
--   · **没有事务**。中途任何一步失败（断网、超时、唯一约束冲突）都会留下一条结构错乱的路线：
--     分区建了一半、题加了一半、顺序没应用、该删的还在。这不是"少存一点"，而是把用户已经
--     攒好的内容弄坏 —— 比交卷那个半成品更严重。
--   · **请求数随题目数线性增长**。`removeRouteQuestion` 与 `updateRouteQuestionItem` 都在
--     per-item 循环里，40 道题的一节就是 40 次往返；一节一节串起来，一次保存几十次请求。
--
-- 这里把它收成一个函数：客户端**一次**把整棵树发上来，服务端在一个事务里做差异化 reconcile。
--
-- 幂等：不做"先清空再重建" —— 那会换掉所有 id，丢掉 created_at，也让别人正在看的链接失效。
-- 按 id / (stage_id, question_id) 做 upsert，只删"这次没带上来"的行。所以同一棵树存两次，
-- 第二次是空操作（除了 position 重写一次）。
--
-- 重排为什么要两段式：`UNIQUE(route_id, position)` 与 `UNIQUE(stage_id, position)` 都不是
-- DEFERRABLE 的，逐行改成目标位置时"交换两行"必然中途撞约束 —— `services/learning-routes.ts`
-- 的 reorderPositions 当年就栽在这里（界面表现是"拖了但顺序没变"）。所以先把该范围的行整体挪到
-- 负数区间腾出非负空间，再写目标位置。
--
-- SECURITY INVOKER：三张表的写策略都是 `is_admin()`（读策略是"authenticated 且（管理员或已发布）"），
-- 函数不越过它们 —— 非管理员调用会被 RLS 拒掉，这正是想要的。与 Section 99.3 的告警同源：
-- 别为了省事改成 DEFINER。
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_learning_route(
  p_route_id UUID,                 -- NULL = 新建
  p_title TEXT,
  p_description TEXT,
  p_is_published BOOLEAN,
  p_route_order INT,               -- NULL = 新建时自动取 MAX+1
  p_stages JSONB,                  -- [{id?, title, description, node_style, items:[{question_id, node_style}]}]
  p_diagram_xml TEXT DEFAULT NULL  -- NULL = 不动这一列
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_route UUID := p_route_id;
  v_stage JSONB;
  v_item JSONB;
  v_stage_id UUID;
  v_question_id UUID;
  v_saved_id UUID;
  v_pos INT := 0;
  v_qpos INT;
  v_keep_stages UUID[] := ARRAY[]::UUID[];
  v_keep_items UUID[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'save_learning_route: 需要登录' USING ERRCODE = '28000';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'save_learning_route: 路线标题不能为空' USING ERRCODE = '22023';
  END IF;

  -- ---- 1) 路线本体 ----
  IF v_route IS NULL THEN
    INSERT INTO public.learning_routes (title, description, is_published, route_order, created_by, diagram_xml)
    VALUES (
      p_title,
      COALESCE(p_description, ''),
      COALESCE(p_is_published, FALSE),
      COALESCE(p_route_order, (SELECT COALESCE(MAX(route_order), -1) + 1 FROM public.learning_routes)),
      v_uid,
      p_diagram_xml
    )
    RETURNING id INTO v_route;
  ELSE
    UPDATE public.learning_routes
       SET title        = p_title,
           description  = COALESCE(p_description, ''),
           is_published = COALESCE(p_is_published, FALSE),
           route_order  = COALESCE(p_route_order, route_order),
           diagram_xml  = COALESCE(p_diagram_xml, diagram_xml),
           updated_at   = NOW()          -- 这三张表没有 updated_at 触发器，得自己写
     WHERE id = v_route;
    IF NOT FOUND THEN
      -- 不存在与"不是你的/不是管理员"回同一个错，与 complete_exam 一致
      RAISE EXCEPTION 'save_learning_route: 找不到这条路线' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ---- 2) 先把本路线所有分区挪到负数区间，腾出非负位置（见上面"重排为什么要两段式"）----
  UPDATE public.learning_route_stages s
     SET position = -o.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS rn
        FROM public.learning_route_stages
       WHERE route_id = v_route
    ) o
   WHERE s.id = o.id;

  -- ---- 3) 按数组顺序 upsert 分区，并在每个分区里 reconcile 题目 ----
  FOR v_stage IN SELECT * FROM jsonb_array_elements(COALESCE(p_stages, '[]'::JSONB)) LOOP
    v_stage_id := NULLIF(v_stage->>'id', '')::UUID;

    -- 带了 id 但不是这条路线下的（别人删过、或伪造）→ 当新分区处理，不静默改别人的数据
    IF v_stage_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.learning_route_stages WHERE id = v_stage_id AND route_id = v_route
    ) THEN
      v_stage_id := NULL;
    END IF;

    IF v_stage_id IS NULL THEN
      INSERT INTO public.learning_route_stages (route_id, position, title, description, node_style)
      VALUES (v_route, v_pos,
              COALESCE(v_stage->>'title', ''),
              COALESCE(v_stage->>'description', ''),
              COALESCE(v_stage->'node_style', '{}'::JSONB))
      RETURNING id INTO v_stage_id;
    ELSE
      UPDATE public.learning_route_stages
         SET position    = v_pos,
             title       = COALESCE(v_stage->>'title', ''),
             description = COALESCE(v_stage->>'description', ''),
             node_style  = COALESCE(v_stage->'node_style', '{}'::JSONB)
       WHERE id = v_stage_id;
    END IF;

    v_keep_stages := v_keep_stages || v_stage_id;

    -- 这个分区下的题目：同样先腾位置
    UPDATE public.learning_route_questions q
       SET position = -o.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS rn
          FROM public.learning_route_questions
         WHERE stage_id = v_stage_id
      ) o
     WHERE q.id = o.id;

    v_qpos := 0;
    v_keep_items := ARRAY[]::UUID[];

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'items', '[]'::JSONB)) LOOP
      v_question_id := NULLIF(v_item->>'question_id', '')::UUID;
      CONTINUE WHEN v_question_id IS NULL;

      -- 身份按 (stage_id, question_id) 认（有唯一约束），item_id 只是客户端的副本，
      -- 所以服务端不依赖它 —— 客户端漏回传 id 也不会因此插出重复行
      INSERT INTO public.learning_route_questions (stage_id, question_id, position, node_style)
      VALUES (v_stage_id, v_question_id, v_qpos, COALESCE(v_item->'node_style', '{}'::JSONB))
      ON CONFLICT (stage_id, question_id)
      DO UPDATE SET position   = EXCLUDED.position,
                    node_style = EXCLUDED.node_style
      RETURNING id INTO v_saved_id;

      v_keep_items := v_keep_items || v_saved_id;
      v_qpos := v_qpos + 1;
    END LOOP;

    -- 这次没带上来的题目 → 删掉（空数组 = 清空该分区的题目）
    DELETE FROM public.learning_route_questions
     WHERE stage_id = v_stage_id
       AND NOT (id = ANY (v_keep_items));

    v_pos := v_pos + 1;
  END LOOP;

  -- ---- 4) 这次没带上来的分区 → 删掉（题目随 ON DELETE CASCADE 一起走）----
  DELETE FROM public.learning_route_stages
   WHERE route_id = v_route
     AND NOT (id = ANY (v_keep_stages));

  RETURN v_route;
END $$;

COMMENT ON FUNCTION public.save_learning_route(UUID, TEXT, TEXT, BOOLEAN, INT, JSONB, TEXT) IS
  '保存整棵学习路线树：一个事务里做差异化 reconcile（分区与题目的增/改/删/重排 + 画布 XML）';

-- 权限：管理员工具，登录用户可调；匿名不行（两个授权都要撤，见 Section 101 的实测）
REVOKE EXECUTE ON FUNCTION public.save_learning_route(UUID, TEXT, TEXT, BOOLEAN, INT, JSONB, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_learning_route(UUID, TEXT, TEXT, BOOLEAN, INT, JSONB, TEXT) TO authenticated;

-- 客户端改动（本次已做）：`use-route-editor.ts` 的 handleSave 改调这个函数，
-- 整串顺序写变成一次请求；函数不存在时退回旧路径（部署顺序见 Section 102 的同一段说明）。
-- ============================================================================

-- ============================================================================
-- Section 104: client_events —— 让"生产里到底有没有走降级路径"看得见
-- ----------------------------------------------------------------------------
-- 背景（docs/architecture-optimization.md 第 7 条 P2 可观测性）：现在 `logError` 在生产是**空操作**
-- （`if (import.meta.env.PROD) return`），所以有两件事在线上完全不可见：
--
--   1. 交卷（Section 102）与保存路线（Section 103）都留了"RPC 函数不存在就退回旧路径"的降级分支。
--      迁移执行后那些分支**应当永不进入**；可一旦因为什么原因真进去了，客户端没有任何信号 ——
--      用户只是在用那条没有事务的老路，谁也不知道。
--   2. 其它被 catch 掉的错误：只在开发环境打 console，线上连个数都没有。
--
-- 这一节给它们一个落点。沿用 `net_probe_samples` 那一套（Section 91）的做法：
-- **前端没有 INSERT 权限**，写入走 service_role 的 Edge Function（`report-client-event`），
-- 免得这个表被刷；读取只给管理员。
--
-- 注意 Section 91 的加固只针对 net_probe_samples，新表要自己再收一遍默认权限 ——
-- 否则 `anon` / `authenticated` 会通过平台默认权限拿到 INSERT（Section 101 的同一课）。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 尽量识别调用者但不强制：未登录时的错误同样有价值（user_id 记 null）
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 'rpc_missing'（降级分支被触发）/ 'error'（被 catch 的错误）/ 'slow_request'
  kind        TEXT NOT NULL CHECK (kind IN ('rpc_missing', 'error', 'slow_request', 'other')),
  -- 具体是谁：函数名或 logError 的 context，例如 'complete_exam' / 'exam.submitExam'
  name        TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::JSONB,
  ua          TEXT,
  region      TEXT,
  app_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_events_created ON public.client_events(created_at DESC);
-- 最常见的查法就是"降级分支最近有没有被触发过"，所以按 (kind, name) 也留一个
CREATE INDEX IF NOT EXISTS idx_client_events_kind_name ON public.client_events(kind, name, created_at DESC);

ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;

-- 读：只给管理员（与 net_probe_samples 一致）。写：没有任何策略 —— 客户端角色写不进来，
-- 只有 service_role（绕过 RLS）能写。
DROP POLICY IF EXISTS client_events_admin_read ON public.client_events;
CREATE POLICY client_events_admin_read ON public.client_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 治根那一份：这张表是迁移建的，平台默认权限会给 anon/authenticated 一堆表权限（Section 101 的实测：
-- 连 TRUNCATE/REFERENCES/TRIGGER/MAINTAIN 都在）。这里按同样的口径收干净，只留管理员需要的 SELECT。
REVOKE ALL ON public.client_events FROM anon, authenticated;
GRANT SELECT ON public.client_events TO authenticated;

-- 写入方只有 Edge Function 的 service_role；deno 里用的是 SUPABASE_SERVICE_ROLE_KEY。
GRANT SELECT, INSERT ON public.client_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.client_events_id_seq TO service_role;

COMMENT ON TABLE public.client_events IS
  '客户端上报的事件（降级路径被触发 / 被 catch 的错误）。写入只走 Edge Function report-client-event，前端无 INSERT 权限';
COMMENT ON COLUMN public.client_events.kind IS
  'rpc_missing = Section 102/103 的降级分支被触发（迁移执行后应当永不出现）；error = 被 catch 的错误';

-- 客户端改动（本次已做）：`src/lib/client-events.ts` 的 reportClientEvent 调这个函数，
-- 在交卷/保存路线的降级分支与生产环境的 logError 里各调一次；节流 + 每会话去重，永不抛错。
-- 查看：`npm run events`（走 SSH 直连库，不经过 PostgREST）。
-- ============================================================================

