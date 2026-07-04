export interface LoginResult {
  ok: boolean
  token?: string
  error?: string
}

export async function handleLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  if (!username.trim() || !password) {
    return { ok: false, error: '用户名和密码不能为空' }
  }

  try {
    const { data, error } = await import('@/lib/supabase').then((m) =>
      m.supabase.auth.signInWithPassword({ email: username, password }),
    )

    if (error) return { ok: false, error: error.message }
    if (!data.session?.access_token) return { ok: false, error: '登录失败' }

    return { ok: true, token: data.session.access_token }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '未知错误' }
  }
}
