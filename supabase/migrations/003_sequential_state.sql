-- 顺序刷题模式跨设备进度同步表
CREATE TABLE IF NOT EXISTS public.practice_sequential_state (
  user_id       UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  selected_kps  TEXT[] NOT NULL DEFAULT '{}',
  question_ids  UUID[] NOT NULL DEFAULT '{}',
  current_index INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.practice_sequential_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pss_own ON public.practice_sequential_state;
CREATE POLICY pss_own ON public.practice_sequential_state FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());
