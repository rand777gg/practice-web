import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { OtpSetupDialog } from '@/components/auth/OtpSetupDialog'
import { OtpVerifyDialog } from '@/components/auth/OtpVerifyDialog'
import { PasskeyVerifyDialog } from '@/components/auth/PasskeyVerifyDialog'
import { isDeviceTrusted, getTrustInfo } from '@/lib/otp-trust'
import { DeviceLabel } from '@/components/ui/device-label'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
}

function TrustedDeviceToast({ deviceName }: { deviceName?: string }) {
  const { t } = useT()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-[60] max-w-xs rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm shadow-lg dark:border-green-800 dark:bg-green-950 transition-all duration-500',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
      )}
    >
      <p className="font-medium text-green-800 dark:text-green-200">
        {t('auth.otpTrustedLogin')}
      </p>
      {deviceName && (
        <DeviceLabel deviceName={deviceName} className="text-xs text-green-600 dark:text-green-400 mt-0.5" />
      )}
    </div>
  )
}

export function OtpGuard({ children }: Props) {
  const { user, isInitialized, refreshProfile } = useAuthStore()
  const [showSetup, setShowSetup] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
  const [showPasskeyVerify, setShowPasskeyVerify] = useState(false)
  const [otpCleared, setOtpCleared] = useState(false)
  const [showTrustedToast, setShowTrustedToast] = useState(false)

  const checkOtp = useCallback(async () => {
    if (!user || !isInitialized) return

    await refreshProfile()
    const p = useAuthStore.getState().profile

    if (!p) return

    if (!p.totp_enabled) {
      setShowSetup(true)
      return
    }

    // Check preferred 2FA method
    if (p.preferred_2fa === 'passkey') {
      setShowPasskeyVerify(true)
      return
    }

    // Default TOTP flow
    if (isDeviceTrusted()) {
      setShowTrustedToast(true)
      setOtpCleared(true)
      return
    }

    setShowVerify(true)
  }, [user, isInitialized, refreshProfile])

  useEffect(() => {
    checkOtp()
  }, [checkOtp])

  const handleSetupComplete = useCallback(() => {
    setShowSetup(false)
    refreshProfile().then(() => {
      setOtpCleared(true)
    })
  }, [refreshProfile])

  const handleVerifyComplete = useCallback(() => {
    setShowVerify(false)
    setOtpCleared(true)
  }, [])

  const handlePasskeyVerified = useCallback(() => {
    setShowPasskeyVerify(false)
    setOtpCleared(true)
  }, [])

  const handlePasskeyFallback = useCallback(() => {
    setShowPasskeyVerify(false)
    // Check device trust before falling back to TOTP
    if (isDeviceTrusted()) {
      setShowTrustedToast(true)
      setOtpCleared(true)
    } else {
      setShowVerify(true)
    }
  }, [])

  if (!user || !isInitialized) return <>{children}</>
  if (!otpCleared) {
    return (
      <>
        {children}
        <OtpSetupDialog open={showSetup} onSetupComplete={handleSetupComplete} />
        <OtpVerifyDialog open={showVerify} onVerified={handleVerifyComplete} />
        <PasskeyVerifyDialog
          open={showPasskeyVerify}
          onVerified={handlePasskeyVerified}
          onFallback={handlePasskeyFallback}
        />
      </>
    )
  }

  const trustInfo = getTrustInfo()

  return (
    <>
      {children}
      {showTrustedToast && (
        <TrustedDeviceToast deviceName={trustInfo?.deviceName} />
      )}
    </>
  )
}
