import { supabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

export interface LoginResult {
  ok: boolean
  token?: string
  error?: string
}

export async function handleLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  if (!email.trim() || !password) {
    return { ok: false, error: '邮箱和密码不能为空' }
  }
  if (!EMAIL_RE.test(email.trim())) {
    return { ok: false, error: '请输入有效的邮箱地址' }
  }
  if (password.length < 6) {
    return { ok: false, error: '密码长度不能少于6位' }
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) return { ok: false, error: error.message }
    if (!data.session?.access_token) return { ok: false, error: '无法获取会话，请重试' }

    return { ok: true, token: data.session.access_token }
  } catch (e) {
    console.error('Login error:', e)
    return { ok: false, error: '登录服务异常，请稍后重试' }
  }
}
