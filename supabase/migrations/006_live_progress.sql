CREATE TABLE IF NOT EXISTS public.plan_live_progress (
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, subject)
);
ALTER TABLE public.plan_live_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plp_own ON public.plan_live_progress;
CREATE POLICY plp_own ON public.plan_live_progress FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());
