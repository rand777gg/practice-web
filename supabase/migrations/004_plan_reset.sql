-- 计划进度重置：plan_reset_at / daily_reset_at 记录各自的上次重置时间
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_reset_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_reset_at TIMESTAMPTZ;
