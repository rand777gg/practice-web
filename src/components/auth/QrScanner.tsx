import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { X, Check, Camera } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QrScanner({ open, onOpenChange }: Props) {
  const { user } = useAuthStore()
  const [status, setStatus] = useState<'scanning' | 'confirming' | 'success' | 'error'>('scanning')
  const [errorMsg, setErrorMsg] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    if (!open || !user) return
    stoppedRef.current = false
    setStatus('scanning')

    // Wait for dialog to render the DOM element
    const timer = setTimeout(() => {
      if (stoppedRef.current) return
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner

      scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        if (stoppedRef.current) return
        // Parse token from URL
        const url = new URL(decodedText)
        const token = url.searchParams.get('token')
        if (!token || !url.pathname.includes('qr-confirm')) return

        stoppedRef.current = true
        setStatus('confirming')
        await scanner.stop()

        const { error } = await supabase.from('qr_login_tokens').update({
          user_id: user.id,
          status: 'confirmed',
          device_info: navigator.userAgent.slice(0, 200),
        }).eq('token', token).eq('status', 'pending').gt('expires_at', new Date().toISOString())

        if (error) { setStatus('error'); setErrorMsg('二维码已过期或已被使用'); return }
        setStatus('success')
      },
      () => {}
      ).catch(() => {
        setStatus('error')
        setErrorMsg('无法打开摄像头，请检查权限')
      })
    }, 300)

    return () => {
      clearTimeout(timer)
      stoppedRef.current = true
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [open, user])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2">
            {status === 'success' ? <Check className="h-5 w-5 text-green-500" /> : status === 'error' ? <X className="h-5 w-5 text-destructive" /> : <Camera className="h-5 w-5" />}
          </DialogTitle>
          <DialogDescription>
            {status === 'scanning' && '请对准桌面端的二维码扫描'}
            {status === 'confirming' && '正在确认...'}
            {status === 'success' && '登录已确认'}
            {status === 'error' && errorMsg}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div id="qr-reader" className="w-full rounded-lg overflow-hidden" />
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">桌面端将自动跳转</p>
          )}
          {(status === 'error' || status === 'success') && (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
