-- QR码登录：临时令牌表
CREATE TABLE IF NOT EXISTS public.qr_login_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_qr_token ON public.qr_login_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_expires ON public.qr_login_tokens(expires_at);

ALTER TABLE public.qr_login_tokens ENABLE ROW LEVEL SECURITY;

-- 任何已登录用户可以创建token（扫码后确认）
DROP POLICY IF EXISTS qr_insert_auth ON public.qr_login_tokens;
CREATE POLICY qr_insert_auth ON public.qr_login_tokens FOR INSERT TO authenticated WITH CHECK (true);

-- 任何人可以读取token状态（轮询）
DROP POLICY IF EXISTS qr_select ON public.qr_login_tokens;
CREATE POLICY qr_select ON public.qr_login_tokens FOR SELECT TO anon, authenticated USING (true);

-- 已登录用户可以确认token（设置user_id + status=confirmed）
DROP POLICY IF EXISTS qr_update_auth ON public.qr_login_tokens;
CREATE POLICY qr_update_auth ON public.qr_login_tokens FOR UPDATE TO authenticated
  USING (status = 'pending' AND expires_at > NOW())
  WITH CHECK (user_id IS NOT NULL AND status = 'confirmed');

-- 定时清理过期token（每5分钟）
SELECT cron.schedule(
  'qr-cleanup',
  '*/5 * * * *',
  $$ DELETE FROM public.qr_login_tokens WHERE expires_at < NOW() AND status = 'pending' $$
);
