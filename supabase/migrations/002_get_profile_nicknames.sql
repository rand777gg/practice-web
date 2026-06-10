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
