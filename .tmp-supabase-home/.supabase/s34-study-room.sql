-- Section 34: 自习室(study rooms)—— 邀请码制学习小组
--   邀请: 创建者把 6 位邀请码分享给好友, 对方凭码加入(join_study_room)。
--   打卡判定(完成当日计划目标)与提醒邮件在 Edge Function study-room 内计算,
--   这里只存房间/成员关系 + 防刷的提醒记录。
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.study_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  invite_code  TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_rooms_owner ON public.study_rooms(owner_id);

CREATE TABLE IF NOT EXISTS public.study_room_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_srm_user ON public.study_room_members(user_id);

-- 提醒邮件流水: 只做频控(同人同房间 2 小时内不重复提醒), 仅服务端可写
CREATE TABLE IF NOT EXISTS public.study_room_reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srr_room_user_time
  ON public.study_room_reminders(room_id, user_id, reminded_at DESC);

-- RLS 辅助函数(绕过 RLS, 避免策略子查询互相递归)
CREATE OR REPLACE FUNCTION public.is_study_room_member(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.study_room_members
  WHERE room_id = p_room_id AND user_id = p_user_id
); $$;

CREATE OR REPLACE FUNCTION public.is_study_room_owner(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.study_rooms WHERE id = p_room_id AND owner_id = p_user_id
); $$;

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_reminders ENABLE ROW LEVEL SECURITY;

-- 房间: 房主/成员可读; 只有房主可改、删(创建只走 create_study_room)
DROP POLICY IF EXISTS study_rooms_select ON public.study_rooms;
CREATE POLICY study_rooms_select ON public.study_rooms FOR SELECT
  USING (owner_id = auth.uid() OR public.is_study_room_member(id, auth.uid()));

DROP POLICY IF EXISTS study_rooms_update ON public.study_rooms;
CREATE POLICY study_rooms_update ON public.study_rooms FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS study_rooms_delete ON public.study_rooms;
CREATE POLICY study_rooms_delete ON public.study_rooms FOR DELETE
  USING (owner_id = auth.uid());

-- 成员: 本人 + 同房成员可见; 本人可退房; 房主可移除成员
DROP POLICY IF EXISTS srm_select ON public.study_room_members;
CREATE POLICY srm_select ON public.study_room_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_study_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS srm_delete ON public.study_room_members;
CREATE POLICY srm_delete ON public.study_room_members FOR DELETE
  USING (user_id = auth.uid() OR public.is_study_room_owner(room_id, auth.uid()));

-- 创建自习室: 生成 6 位无歧义邀请码(去 0/O/1/I/L), 房主自动成为成员
CREATE OR REPLACE FUNCTION public.create_study_room(p_name TEXT, p_description TEXT DEFAULT '')
RETURNS TABLE(id UUID, owner_id UUID, name TEXT, description TEXT, invite_code TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code  TEXT := '';
  v_i     INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(btrim(p_name)) = 0 THEN RAISE EXCEPTION 'name_required'; END IF;
  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::INTEGER, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.study_rooms r WHERE r.invite_code = v_code);
  END LOOP;

  RETURN QUERY
    WITH ins AS (
      INSERT INTO public.study_rooms (owner_id, name, description, invite_code)
      VALUES (auth.uid(), btrim(p_name), coalesce(p_description, ''), v_code)
      RETURNING *
    )
    SELECT * FROM ins;

  INSERT INTO public.study_room_members (room_id, user_id)
  SELECT r.id, r.owner_id FROM public.study_rooms r WHERE r.invite_code = v_code;
END;
$$;

-- 凭邀请码加入自习室
CREATE OR REPLACE FUNCTION public.join_study_room(p_code TEXT)
RETURNS TABLE(id UUID, room_id UUID, user_id UUID, joined_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_room public.study_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_room FROM public.study_rooms WHERE invite_code = upper(btrim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF v_room.owner_id = auth.uid() THEN RAISE EXCEPTION 'already_member'; END IF;
  BEGIN
    INSERT INTO public.study_room_members (room_id, user_id) VALUES (v_room.id, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_member';
  END;
  RETURN QUERY SELECT m.id, m.room_id, m.user_id, m.joined_at
    FROM public.study_room_members m
    WHERE m.room_id = v_room.id AND m.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_study_room(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_study_room(TEXT) TO authenticated;

-- ============================================================================
-- Section 35: 预约考试「定时邮件通知」
--   在 28.1 Web Push 之外新增邮件通道: 用户自选「发送日期(email_send_date)+
--   发送时刻(email_time)」, 到点后向用户注册邮箱发提醒。
--   email_send_date 为空时兼容旧行为(按每周重复日发); last_email_date 保证
--   每个业务日只发一次(由 notify-exam cron 维护)。
-- ============================================================================
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_time SMALLINT
    CHECK (email_time IS NULL OR (email_time >= 0 AND email_time < 1440));
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS email_send_date DATE;
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS last_email_date DATE;
