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
  daily_reset_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  DELETE FROM public.kp_question_map;
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
  v_plan_reset TIMESTAMPTZ;
  v_subject_resets JSONB;
  v_answered_set UUID[];
  v_q_subj TEXT;
  v_i INT;
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
           row_number() OVER (ORDER BY kp, seq, id) - 1 AS rn
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

  -- Recalculate resume index based on answered questions (same logic as start_sequential_session)
  v_answered_set := '{}'::UUID[];
  SELECT pd.plan_reset_at, COALESCE(pd.subject_reset_at, '{}'::jsonb)
  INTO v_plan_reset, v_subject_resets FROM public.profiles pd WHERE pd.id = p_user_id;
  IF array_length(v_all_ids, 1) > 0 THEN
    SELECT array_agg(ua.question_id) INTO v_answered_set
    FROM public.user_answers ua
    WHERE ua.user_id = p_user_id AND ua.question_id = ANY(v_all_ids)
      AND (v_plan_reset IS NULL OR ua.answered_at >= v_plan_reset);
    IF v_answered_set IS NULL THEN v_answered_set := '{}'::UUID[]; END IF;
    FOR v_i IN 1..array_length(v_all_ids, 1) LOOP
      v_q_subj := v_all_subjs[v_i];
      IF v_subject_resets ? v_q_subj THEN
        PERFORM 1 FROM public.user_answers ua
        WHERE ua.user_id = p_user_id AND ua.question_id = v_all_ids[v_i]
          AND ua.answered_at >= (v_subject_resets->>v_q_subj)::TIMESTAMPTZ;
        IF NOT FOUND THEN v_answered_set := array_remove(v_answered_set, v_all_ids[v_i]); END IF;
      END IF;
    END LOOP;
    -- Find first unanswered question
    v_restored_index := 0;
    FOR v_i IN 1..array_length(v_all_ids, 1) LOOP
      IF NOT (v_all_ids[v_i] = ANY(v_answered_set)) THEN v_restored_index := v_i - 1; EXIT; END IF;
      v_restored_index := v_i;
    END LOOP;
    IF v_restored_index >= array_length(v_all_ids, 1) THEN
      v_restored_index := GREATEST(0, array_length(v_all_ids, 1) - 1);
    END IF;
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
CREATE OR REPLACE FUNCTION public.start_sequential_session(p_user_id UUID, p_kps TEXT[], p_subjects TEXT[] DEFAULT NULL, p_question_type TEXT DEFAULT NULL, p_session_key TEXT DEFAULT NULL)
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
    SELECT d.id, d.subject, d.kp, d.seq_number FROM deduped d ORDER BY d.kp, d.seq_number
  )
  SELECT array_agg(s.id), array_agg(s.kp), array_agg(COALESCE(s.subject, ''))
  INTO v_ids, v_kps_arr, v_subj_arr FROM sorted s;

  IF v_ids IS NULL THEN
    v_ids := '{}'::UUID[]; v_kps_arr := '{}'::TEXT[]; v_subj_arr := '{}'::TEXT[];
  END IF;

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
GRANT EXECUTE ON FUNCTION public.start_sequential_session(UUID, TEXT[], TEXT[], TEXT, TEXT) TO authenticated;

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
