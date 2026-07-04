import { supabase } from '@/lib/supabase'

// Client-side basic email check; Supabase handles final validation
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; error: string }

export async function handleLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  const trimmedEmail = email.trim()
  if (!trimmedEmail || !password.trim()) {
    return { ok: false, error: '邮箱和密码不能为空' }
  }
  if (!EMAIL_RE.test(trimmedEmail)) {
    return { ok: false, error: '请输入有效的邮箱地址' }
  }
  if (password.length < 8) {
    return { ok: false, error: '密码长度不能少于8位' }
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })

    if (error) return { ok: false, error: error.message }
    if (!data.session?.access_token) {
      return { ok: false, error: '登录信息缺失，请重新登录' }
    }
    if (
      data.session.expires_at == null ||
      data.session.expires_at < Date.now() / 1000
    ) {
      return { ok: false, error: '会话已过期，请重新登录' }
    }

    return { ok: true, token: data.session.access_token }
  } catch (e) {
    if (import.meta.env.DEV) console.error('Login error:', e)
    return { ok: false, error: '登录服务异常，请稍后重试' }
  }
}
