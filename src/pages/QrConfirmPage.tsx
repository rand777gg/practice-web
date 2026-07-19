import { useEffect, useState } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Check, X, ShieldAlert } from 'lucide-react'

export function Component() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { user } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'confirming' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token || !user) { setStatus('error'); setErrorMsg('无效的二维码或未登录'); return }
    // Auto-confirm after a brief delay for user to see the page
    const timer = setTimeout(async () => {
      setStatus('confirming')
      const { error } = await supabase.from('qr_login_tokens').update({
        user_id: user.id,
        status: 'confirmed',
        device_info: navigator.userAgent.slice(0, 200),
      }).eq('token', token).eq('status', 'pending').gt('expires_at', new Date().toISOString())

      if (error) { setStatus('error'); setErrorMsg('二维码已过期或已被使用'); return }
      setStatus('success')
    }, 800)
    return () => clearTimeout(timer)
  }, [token, user])

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2">
            {status === 'success' ? <Check className="h-6 w-6 text-green-500" /> : status === 'error' ? <X className="h-6 w-6 text-destructive" /> : <ShieldAlert className="h-6 w-6 text-blue-500" />}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && '正在验证二维码...'}
            {status === 'confirming' && '正在确认登录...'}
            {status === 'success' && '登录已确认'}
            {status === 'error' && errorMsg}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
