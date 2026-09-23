import { useEffect, useState } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Check, X, ShieldAlert } from 'lucide-react'

/**
 * 手机上确认"桌面端登录"。
 *
 * 为什么要点一下而不是自动确认: 二维码里只有 token, 谁都能生成一个自己的 token 印成码
 * 让受害者去扫 —— 自动确认的话, 受害者一扫码就把登录态交给了对方(login CSRF)。
 * 所以这里把"正在为哪个账号授权"摆在眼前, 由用户自己点头。
 */
export function Component() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { user } = useAuthStore()
  const [status, setStatus] = useState<'ready' | 'confirming' | 'success' | 'error'>('ready')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token || !user) { setStatus('error'); setErrorMsg('无效的二维码或未登录') }
  }, [token, user])

  const confirm = async () => {
    if (!token || !user) return
    setStatus('confirming')
    // 表对客户端完全不可读不可写: 确认走这条 SECURITY DEFINER 的窄接口,
    // 它只会把"还在等确认且没过期"的行绑到**调用者自己**名下
    const { data, error } = await supabase.rpc('qr_login_confirm', {
      p_token: token,
      p_device_info: navigator.userAgent.slice(0, 200),
    })

    if (error || data !== true) { setStatus('error'); setErrorMsg('二维码已过期或已被使用'); return }
    setStatus('success')
  }

  if (!user) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2">
            {status === 'success' ? <Check className="h-6 w-6 text-green-500" /> : status === 'error' ? <X className="h-6 w-6 text-destructive" /> : <ShieldAlert className="h-6 w-6 text-blue-500" />}
          </CardTitle>
          <CardDescription>
            {status === 'ready' && '有一台设备正在请求用你的账号登录'}
            {status === 'confirming' && '正在确认登录...'}
            {status === 'success' && '登录已确认'}
            {status === 'error' && errorMsg}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'ready' && (
            <>
              <p className="text-sm">
                授权账号：<span className="font-medium">{user.email}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                如果这不是你刚在电脑上发起的登录，请直接关闭本页。
              </p>
              <Button className="w-full" onClick={confirm}>确认登录</Button>
            </>
          )}
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">桌面端将自动跳转，请返回桌面端继续。</p>
          )}
          {status === 'error' && (
            <Button variant="outline" className="mt-2" onClick={() => window.close()}>关闭</Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
