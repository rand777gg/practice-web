-- 001_initial_schema.sql

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  deadline   DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- QUESTIONS
CREATE TABLE IF NOT EXISTS public.questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text   TEXT NOT NULL,
  options         JSONB NOT NULL,
  correct_answer  INTEGER NOT NULL,
  category        TEXT,
  subject         TEXT,
  analysis        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- EXAM SESSIONS
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  total_questions   INTEGER NOT NULL DEFAULT 50,
  correct_count     INTEGER NOT NULL DEFAULT 0,
  score             INTEGER,
  question_ids      JSONB NOT NULL,
  current_index     INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER NOT NULL DEFAULT 3600000,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- USER ANSWERS
CREATE TABLE IF NOT EXISTS public.user_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer INTEGER NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  mode            TEXT NOT NULL CHECK (mode IN ('practice', 'exam')),
  exam_session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  note            TEXT,
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_questions_category ON public.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_user_answers_user_id ON public.user_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON public.user_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_exam_session ON public.user_answers(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_wrong ON public.user_answers(user_id, is_correct) WHERE is_correct = false;
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON public.exam_sessions(user_id);

-- TRIGGER: first user becomes admin
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

-- Helper: SECURITY DEFINER function to avoid RLS recursion
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

-- ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- Questions
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

-- Exam Sessions
DROP POLICY IF EXISTS exam_sessions_own ON public.exam_sessions;
CREATE POLICY exam_sessions_own ON public.exam_sessions FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());

-- User Answers
DROP POLICY IF EXISTS user_answers_own ON public.user_answers;
CREATE POLICY user_answers_own ON public.user_answers FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());
