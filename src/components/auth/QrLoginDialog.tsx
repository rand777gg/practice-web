import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { QrCode, RefreshCw, Loader2 } from 'lucide-react'

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QrLoginDialog({ open, onOpenChange }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [status, setStatus] = useState<'generating' | 'waiting' | 'loggingIn' | 'expired' | 'error'>('generating')
  const codeRef = useRef('')
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const navigate = useNavigate()

  const generateToken = async () => {
    setStatus('generating')
    const token = crypto.randomUUID()
    const code = crypto.randomUUID().slice(0, 12)
    codeRef.current = code

    const { error } = await supabase.from('qr_login_tokens').insert({ token, auth_code: code })
    if (error) { setStatus('error'); return }

    const confirmUrl = `${window.location.origin}/qr-confirm?token=${token}&code=${code}`
    const dataUrl = await QRCode.toDataURL(confirmUrl, { width: 240, margin: 1, color: { dark: '#ffffff', light: '#00000000' } })
    setQrDataUrl(dataUrl)
    setStatus('waiting')

    startPolling(token)
  }

  const startPolling = (token: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const { data, error } = await supabase.from('qr_login_tokens').select('status').eq('token', token).single()
      if (error || !data) { setStatus('expired'); clearInterval(pollRef.current); return }
      if (data.status === 'confirmed') {
        clearInterval(pollRef.current)
        setStatus('loggingIn')
        // Get session from Edge Function
        const res = await fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, code: codeRef.current }),
        })
        if (!res.ok) { const err = await res.json().catch(() => ({})); console.error('qr-login error:', res.status, err); setStatus('error'); return }
        const sessionData = await res.json()
        if (sessionData.access_token) {
          await supabase.auth.setSession({
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
          })
          onOpenChange(false)
          navigate('/')
        } else {
          setStatus('error')
        }
      } else if (data.status === 'expired') {
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
            {status === 'waiting' && '请使用已登录的手机扫描二维码'}
            {status === 'loggingIn' && '正在登录...'}
            {status === 'expired' && '二维码已过期，请重新生成'}
            {status === 'error' && '登录失败，请重试'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {status === 'waiting' || status === 'loggingIn' ? (
            <img src={qrDataUrl} alt="QR Code" className="size-60 rounded-xl border border-border/50" />
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
