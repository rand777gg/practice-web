-- Add user_settings table for settings cloud sync
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  settings   JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uset_own ON public.user_settings;
CREATE POLICY uset_own ON public.user_settings FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());
