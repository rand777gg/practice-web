-- ============================================================================
-- 001_initial_schema.sql
-- 初始数据库结构 & 行级安全策略
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES — 用户资料表
--    关联 auth.users，首次注册的用户自动成为管理员
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  deadline     DATE,
  plan_subjects TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_subjects TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_targets TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_deadline TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname TEXT;

-- ----------------------------------------------------------------------------
-- 2. QUESTIONS — 题目表
--    选项以 JSONB 数组存储，correct_answer 是选项索引（0-based）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text  TEXT NOT NULL,
  options        JSONB NOT NULL,
  correct_answer JSONB NOT NULL DEFAULT '0',
  category       TEXT,
  subject        TEXT,
  analysis       TEXT,
  key_points     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 3. EXAM SESSIONS — 考试会话
--    记录考试进度、答题列表、计时与得分
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  total_questions INTEGER NOT NULL DEFAULT 50,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  score           INTEGER,
  question_ids    JSONB NOT NULL,
  current_index   INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 3600000,  -- 默认 60 分钟
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 4. USER ANSWERS — 用户答题记录
--    每条记录对应一次作答，可附加私人/公开笔记
-- ----------------------------------------------------------------------------
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
ALTER TABLE public.user_answers ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.user_answers ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 5. FAVORITES — 用户收藏题目
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, question_id)  -- 同一用户不能重复收藏同一题目
);

-- ----------------------------------------------------------------------------
-- 6. INDEXES — 查询性能优化
-- ----------------------------------------------------------------------------

-- Ensure question_type column exists (added post-initial schema)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'single_choice';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_explanation TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS seq_number INTEGER;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;

-- questions: filter dropdowns, random pick, dashboard metadata
CREATE INDEX IF NOT EXISTS idx_questions_category       ON public.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_subject        ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_subj_cat       ON public.questions(subject, category);
CREATE INDEX IF NOT EXISTS idx_questions_type           ON public.questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_filter         ON public.questions(subject, category, question_type);
CREATE INDEX IF NOT EXISTS idx_questions_categories     ON public.questions USING GIN (categories);

-- Keep category in sync with categories[0] automatically
CREATE OR REPLACE FUNCTION public.sync_category_from_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_category_from_categories();

-- user_answers: dashboard time-range, per-question stats, review
CREATE INDEX IF NOT EXISTS idx_ua_user                ON public.user_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_ua_question             ON public.user_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_ua_user_answered        ON public.user_answers(user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_ua_user_question        ON public.user_answers(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_ua_question_correct     ON public.user_answers(question_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_ua_exam                 ON public.user_answers(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_ua_wrong                ON public.user_answers(user_id, is_correct) WHERE is_correct = false;
CREATE INDEX IF NOT EXISTS idx_ua_public               ON public.user_answers(user_id, answered_at DESC) WHERE is_public = true;

-- exam_sessions
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user      ON public.exam_sessions(user_id);

-- favorites
CREATE INDEX IF NOT EXISTS idx_favorites_user          ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_question      ON public.favorites(question_id);

-- profiles: auth lookup on every page load
CREATE INDEX IF NOT EXISTS idx_profiles_id             ON public.profiles(id);

-- ----------------------------------------------------------------------------
-- 7. TRIGGER & HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- 新用户注册时自动创建 profile，首位用户设为 admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  existing_count INTEGER;
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
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 判断当前用户是否为管理员（避免 RLS 递归查询）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 获取用户邮箱（公开笔记展示作者用）
CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT email FROM auth.users WHERE id = user_id;
$$;

-- 获取用户绑定的身份提供商（如 github）
CREATE OR REPLACE FUNCTION public.get_user_providers(user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(provider), ARRAY[]::TEXT[])
  FROM auth.identities
  WHERE user_id = $1 AND provider != 'email';
$$;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY — 行级安全策略
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites     ENABLE ROW LEVEL SECURITY;

-- 8a. Profiles — 用户可查看自己的资料，管理员可查看全部
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 8b. Questions — 所有已认证用户可读，增删改仅限管理员
DROP POLICY IF EXISTS questions_select_all ON public.questions;
CREATE POLICY questions_select_all ON public.questions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS questions_insert_admin ON public.questions;
CREATE POLICY questions_insert_admin ON public.questions FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS questions_update_admin ON public.questions;
CREATE POLICY questions_update_admin ON public.questions FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS questions_delete_admin ON public.questions;
CREATE POLICY questions_delete_admin ON public.questions FOR DELETE
  USING (public.is_admin());

-- 8c. Exam Sessions — 用户仅能访问自己的考试记录
DROP POLICY IF EXISTS exam_sessions_own ON public.exam_sessions;
CREATE POLICY exam_sessions_own ON public.exam_sessions FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- 8d. User Answers — 用户可访问自己的记录；公开笔记所有人可读
DROP POLICY IF EXISTS user_answers_own ON public.user_answers;
CREATE POLICY user_answers_own ON public.user_answers FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS user_answers_public_select ON public.user_answers;
CREATE POLICY user_answers_public_select ON public.user_answers FOR SELECT
  USING (is_public = true OR user_id = auth.uid() OR public.is_admin());

-- 8e. Favorites — 用户仅能访问自己的收藏
DROP POLICY IF EXISTS favorites_own ON public.favorites;
CREATE POLICY favorites_own ON public.favorites FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. SECURITY HARDENING — 修复 Security Advisor 警告
-- ----------------------------------------------------------------------------

-- 9a. 禁止未认证用户调用 SECURITY DEFINER 函数
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin()       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;
-- get_user_email 供认证用户（管理员页、公开笔记）使用，保留 authenticated 权限

-- 9b. 禁止 rls_auto_enable 被外部调用（Supabase 内部函数，新版已移除）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
  END IF;
END $$;

-- 9c. 收紧 files bucket 权限：认证用户可读写，禁止 anon 列出文件
-- 文件仍可通过 publicUrl 访问，MinerU 上传不受影响
DROP POLICY IF EXISTS "allow_read" ON storage.objects;
DROP POLICY IF EXISTS "files_select_auth" ON storage.objects;
CREATE POLICY "files_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'files');
DROP POLICY IF EXISTS "files_insert_auth" ON storage.objects;
CREATE POLICY "files_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files');
DROP POLICY IF EXISTS "files_delete_auth" ON storage.objects;
CREATE POLICY "files_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'files');

-- ----------------------------------------------------------------------------
-- 10. PARSE HISTORY — AI 智能解析历史记录
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parse_history (
  id             SERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL DEFAULT '',
  markdown       TEXT NOT NULL DEFAULT '',
  json_data      TEXT,
  questions_json TEXT,
  mode           TEXT NOT NULL DEFAULT 'lightweight',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS status_json TEXT;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS page_ranges TEXT;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS extra_formats TEXT;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS pdf_total_pages INTEGER;

CREATE INDEX IF NOT EXISTS idx_parse_history_user
  ON public.parse_history(user_id, created_at DESC);

ALTER TABLE public.parse_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parse_history_own ON public.parse_history;
CREATE POLICY parse_history_own ON public.parse_history FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. UNLINK IDENTITY — 解绑 OAuth 身份
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlink_oauth_identity(p_provider TEXT, p_user_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM auth.identities WHERE provider = p_provider AND user_id::text = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_oauth_identity TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. QUESTION BANKS — 试题库
-- ----------------------------------------------------------------------------
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

ALTER TABLE public.question_banks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_items  ENABLE ROW LEVEL SECURITY;

-- question_banks: anyone authenticated can view public or own banks; admin sees all
DROP POLICY IF EXISTS qb_select ON public.question_banks;
CREATE POLICY qb_select ON public.question_banks FOR SELECT
  USING (is_public = true OR created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS qb_insert ON public.question_banks;
CREATE POLICY qb_insert ON public.question_banks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS qb_update ON public.question_banks;
CREATE POLICY qb_update ON public.question_banks FOR UPDATE
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS qb_delete ON public.question_banks;
CREATE POLICY qb_delete ON public.question_banks FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin());

-- question_bank_items: viewable if bank is viewable; modifiable by bank owner/admin
DROP POLICY IF EXISTS qbi_select ON public.question_bank_items;
CREATE POLICY qbi_select ON public.question_bank_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.question_banks
      WHERE id = bank_id AND (is_public = true OR created_by = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS qbi_insert ON public.question_bank_items;
CREATE POLICY qbi_insert ON public.question_bank_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.question_banks
      WHERE id = bank_id AND (created_by = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS qbi_delete ON public.question_bank_items;
CREATE POLICY qbi_delete ON public.question_bank_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.question_banks
      WHERE id = bank_id AND (created_by = auth.uid() OR public.is_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- 12. RANDOM UNANSWERED QUESTION PICKER — 服务端随机抽取未做题目
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_random_question_id(
  p_user_id       UUID,
  p_subjects      TEXT[]  DEFAULT NULL,
  p_categories    TEXT[]  DEFAULT NULL,
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
  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
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

  SELECT q.id INTO v_id
  FROM public.questions q
  WHERE (p_subjects IS NULL OR q.subject = ANY(p_subjects))
    AND (p_categories IS NULL OR q.categories ?| p_categories)
    AND (p_question_type IS NULL OR q.question_type = p_question_type)
  ORDER BY random()
  LIMIT 1;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_question_id(UUID, TEXT[], TEXT[], TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 13. UPDATED_AT TRIGGER — 自动记录题目变更时间，支持增量同步
-- ----------------------------------------------------------------------------
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_questions_updated_at ON public.questions(updated_at);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.questions;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. USER DAILY STATS — 预聚合每日答题统计，加速 Dashboard
-- ----------------------------------------------------------------------------
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

ALTER TABLE public.user_daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uds_own ON public.user_daily_stats;
CREATE POLICY uds_own ON public.user_daily_stats FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Trigger: auto-upsert stats when a new answer is inserted
CREATE OR REPLACE FUNCTION public.upsert_daily_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
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
    NEW.user_id,
    NEW.answered_at::DATE,
    v_subject,
    v_question_type,
    1,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    (SELECT array_agg(CASE WHEN i = v_hour THEN 1 ELSE 0 END) FROM generate_series(0, 23) i)
  )
  ON CONFLICT (user_id, date, subject, question_type)
  DO UPDATE SET
    total   = user_daily_stats.total + 1,
    correct = user_daily_stats.correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    hourly  = (
      SELECT array_agg(
        user_daily_stats.hourly[idx] + CASE WHEN idx - 1 = v_hour THEN 1 ELSE 0 END
      ) FROM generate_subscripts(user_daily_stats.hourly, 1) idx
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_daily_stats ON public.user_answers;
CREATE TRIGGER trg_upsert_daily_stats
  AFTER INSERT ON public.user_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.upsert_daily_stats();

-- Backfill: populate user_daily_stats from existing user_answers (run once)
CREATE OR REPLACE FUNCTION public.backfill_daily_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  r RECORD;
BEGIN
  DELETE FROM public.user_daily_stats;
  FOR r IN
    SELECT
      ua.user_id,
      ua.answered_at::DATE AS date,
      COALESCE(q.subject, '') AS subject,
      COALESCE(q.question_type, '') AS question_type,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ua.is_correct) AS correct,
      array_agg(EXTRACT(HOUR FROM ua.answered_at)::INTEGER) AS hours_list
    FROM public.user_answers ua
    JOIN public.questions q ON q.id = ua.question_id
    GROUP BY ua.user_id, ua.answered_at::DATE, q.subject, q.question_type
  LOOP
    INSERT INTO public.user_daily_stats (user_id, date, subject, question_type, total, correct, hourly)
    VALUES (
      r.user_id, r.date, r.subject, r.question_type, r.total, r.correct,
      (SELECT array_agg(COALESCE(cnt, 0)) FROM generate_series(0, 23) g(h)
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INTEGER FROM unnest(r.hours_list) t(h2) WHERE t.h2 = g.h
       ) sub(cnt) ON true)
    )
    ON CONFLICT (user_id, date, subject, question_type) DO NOTHING;
  END LOOP;
END;
$$;

-- 为公开笔记场景提供安全获取用户昵称的函数
-- SECURITY DEFINER 绕过 RLS，只暴露 id 和 nickname
CREATE OR REPLACE FUNCTION public.get_profile_nicknames(user_ids UUID[])
RETURNS TABLE(id UUID, nickname TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.nickname
    FROM public.profiles p
    WHERE p.id = ANY(user_ids);
END;
$$;

-- 兼容已有数据库：将 correct_answer 和 selected_answer 从 INTEGER 迁移到 JSONB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'questions' AND column_name = 'correct_answer' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.questions ALTER COLUMN correct_answer TYPE JSONB USING to_jsonb(correct_answer);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_answers' AND column_name = 'selected_answer' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.user_answers ALTER COLUMN selected_answer TYPE JSONB USING to_jsonb(selected_answer);
  END IF;
END;
$$;

-- 人工验证标识
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- 导入方式
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS import_mode TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS allow_unordered BOOLEAN NOT NULL DEFAULT false;

-- 查询用户最后在线时间（最近一次答题时间，fallback 到登录时间）
CREATE OR REPLACE FUNCTION public.get_user_last_online(user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT answered_at FROM public.user_answers WHERE user_id = $1 ORDER BY answered_at DESC LIMIT 1),
    (SELECT last_sign_in_at FROM auth.users WHERE id = $1)
  );
$$;

-- ----------------------------------------------------------------------------
-- 19. DISTINCT 学科/分类查询 — 绕过 SELECT 默认 1000 行分页限制
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_question_meta(p_subject TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'subjects', (SELECT jsonb_agg(DISTINCT subject ORDER BY subject) FROM public.questions WHERE subject IS NOT NULL),
    'categories', (SELECT jsonb_agg(DISTINCT category ORDER BY category) FROM public.questions WHERE category IS NOT NULL),
    'key_points', (SELECT jsonb_agg(DISTINCT kp ORDER BY kp) FROM public.questions, LATERAL unnest(string_to_array(key_points, ', ')) AS kp WHERE key_points IS NOT NULL AND kp <> '' AND (p_subject IS NULL OR subject = p_subject))
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_question_meta(TEXT) TO authenticated;
