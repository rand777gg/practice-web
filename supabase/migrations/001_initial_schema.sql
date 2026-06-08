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

-- ----------------------------------------------------------------------------
-- 2. QUESTIONS — 题目表
--    选项以 JSONB 数组存储，correct_answer 是选项索引（0-based）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text  TEXT NOT NULL,
  options        JSONB NOT NULL,
  correct_answer INTEGER NOT NULL,
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
  selected_answer INTEGER NOT NULL,
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

-- questions: filter dropdowns, random pick, dashboard metadata
CREATE INDEX IF NOT EXISTS idx_questions_category       ON public.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_subject        ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_subj_cat       ON public.questions(subject, category);
CREATE INDEX IF NOT EXISTS idx_questions_type           ON public.questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_filter         ON public.questions(subject, category, question_type);

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

-- 9b. 禁止 rls_auto_enable 被外部调用（Supabase 内部函数）
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- 9c. 收紧 files bucket 权限：认证用户可读写，禁止 anon 列出文件
-- 文件仍可通过 publicUrl 访问，MinerU 上传不受影响
DROP POLICY IF EXISTS "allow_read" ON storage.objects;
CREATE POLICY "files_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'files');
CREATE POLICY IF NOT EXISTS "files_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files');
CREATE POLICY IF NOT EXISTS "files_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'files');
