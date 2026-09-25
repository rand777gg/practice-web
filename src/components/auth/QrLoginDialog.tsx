import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { createQrLoginChallenge, fetchQrLoginStatus } from '@/services/account'
import { logError } from '@/services/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { QrCode, RefreshCw, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QrLoginDialog({ open, onOpenChange }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [status, setStatus] = useState<'generating' | 'waiting' | 'loggingIn' | 'expired' | 'error'>('generating')
  const secretRef = useRef('')
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const generateToken = async () => {
    setStatus('generating')
    // 这把 secret 只留在本机: 表里存的是它的 sha256, 二维码里只有 token。
    // 于是"读到表"或"扫到码"都换不到登录态, 能换的只有这个窗口自己。
    const challenge = await createQrLoginChallenge().catch((e) => {
      logError('qrLogin.createChallenge', e)
      return null
    })
    if (!challenge) { setStatus('error'); return }
    const { token, secret } = challenge
    secretRef.current = secret

    const confirmUrl = `${window.location.origin}/qr-confirm?token=${token}`
    // 二维码必须深色码点 + 浅色底才扫得动（浅色写成透明在白底上会完全看不见）
    const dataUrl = await QRCode.toDataURL(confirmUrl, { width: 240, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
    setQrDataUrl(dataUrl)
    setStatus('waiting')

    startPolling(token)
  }

  const startPolling = (token: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      // 不再直读 qr_login_tokens(那张表对任何人都不再开放读): 走只认 token+secret 的窄接口
      const state = await fetchQrLoginStatus(token, secretRef.current).catch((e) => {
        logError('qrLogin.poll', e)
        return null
      })
      if (!state) { setStatus('expired'); clearInterval(pollRef.current); return }
      if (state === 'confirmed') {
        clearInterval(pollRef.current)
        setStatus('loggingIn')
        const { data: sessionData, error: fnErr } = await supabase.functions.invoke('qr-login', {
          body: { token, secret: secretRef.current },
        })
        if (fnErr || !sessionData?.magic_link) { console.error('qr-login error:', fnErr); try { const ctx = await (fnErr as any)?.context?.text?.(); console.error('qr-login body:', ctx) } catch {} setStatus('error'); return }
        // Redirect to magic link URL — auto-logs in and redirects back to app
        window.location.href = sessionData.magic_link
      } else if (state === 'expired') {
        setStatus('expired')
        clearInterval(pollRef.current)
      }
    }, 2000)
  }

  useEffect(() => {
    if (open) generateToken()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2">
            <QrCode className="h-5 w-5" />
            扫码登录
          </DialogTitle>
          <DialogDescription>
            {status === 'generating' && '正在生成二维码...'}
            {status === 'waiting' && '请使用信任设备扫描二维码'}
            {status === 'loggingIn' && '正在登录...'}
            {status === 'expired' && '二维码已过期，请重新生成'}
            {status === 'error' && '登录失败，请重试'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {status === 'waiting' || status === 'loggingIn' ? (
            <img src={qrDataUrl} alt="QR Code" className="size-60 rounded-xl border border-border/50 bg-white p-1" />
          ) : status === 'generating' ? (
            <div className="size-60 flex items-center justify-center rounded-xl border border-border/50 bg-muted/20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="size-60 flex items-center justify-center rounded-xl border border-border/50 bg-muted/20">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">{status === 'expired' ? '已过期' : '生成失败'}</p>
                <Button variant="outline" size="sm" onClick={generateToken}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  重新生成
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
