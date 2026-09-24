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
