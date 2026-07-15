-- ============================================================================
-- 002_mvp: 顺序刷题 + 计划进度 + 用户偏好 + Live 计数器
-- ============================================================================

-- 解析历史元数据
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.parse_history ADD COLUMN IF NOT EXISTS key_points text;

-- 顺序刷题跨设备进度同步
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

-- 计划进度重置时间戳
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_reset_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_reset_at TIMESTAMPTZ;

-- 前端实时进度计数器
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

-- 用户偏好设置（练习模式筛选条件云同步）
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  practice_filters  JSONB NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upref_own ON public.user_preferences;
CREATE POLICY upref_own ON public.user_preferences FOR ALL
  USING (user_id = auth.uid() OR public.is_admin());
