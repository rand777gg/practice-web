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
  (SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL),
  (SELECT jsonb_agg(DISTINCT cat ORDER BY cat) FROM (
    SELECT DISTINCT category AS cat FROM public.questions WHERE category IS NOT NULL
    UNION SELECT DISTINCT cat FROM public.questions, LATERAL jsonb_array_elements_text(categories) AS cat WHERE categories IS NOT NULL
  ) t),
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
    (SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL),
    (SELECT jsonb_agg(DISTINCT cat ORDER BY cat) FROM (
      SELECT DISTINCT category AS cat FROM public.questions WHERE category IS NOT NULL
      UNION SELECT DISTINCT cat FROM public.questions, LATERAL jsonb_array_elements_text(categories) AS cat WHERE categories IS NOT NULL
    ) t),
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
CREATE OR REPLACE FUNCTION public.get_subject_progress(
  p_user_id          UUID,
  p_plan_reset_at    TIMESTAMPTZ DEFAULT NULL,
  p_today_since      TIMESTAMPTZ DEFAULT NULL,
  p_subjects         TEXT[]      DEFAULT NULL,
  p_subject_resets   JSONB       DEFAULT NULL
)
RETURNS TABLE(subject TEXT, total BIGINT, done_all BIGINT, done_today BIGINT, missing_kp BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COALESCE(q.subject, 'Other')          AS subject,
    COUNT(DISTINCT q.id)                  AS total,
    COUNT(DISTINCT ua_all.question_id)    AS done_all,
    COUNT(DISTINCT ua_today.question_id)  AS done_today,
    (SELECT COUNT(*) FROM public.questions q2
     WHERE q2.subject = COALESCE(q.subject, 'Other')
       AND (p_subjects IS NULL OR q2.subject = ANY(p_subjects))
       AND (q2.key_points IS NULL OR q2.key_points = '')
       AND NOT EXISTS (SELECT 1 FROM public.user_excluded_questions ueq2 WHERE ueq2.question_id = q2.id AND ueq2.user_id = p_user_id)
    )                                   AS missing_kp
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
  ORDER BY subject;
$$;
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
