import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { AuthForm } from '@/components/auth/AuthForm'
import LightRays from '@/components/ui/LightRays'
import { useEffect, useState } from 'react'

export function Component() {
  const { user } = useAuthStore()
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(true) }, [])
  if (user) return <Navigate to="/" replace />

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 overflow-hidden bg-[#0a0a1a]">
      <LightRays raysOrigin="top-center" raysColor="#4f6fbf" raysSpeed={1.2} lightSpread={0.6} rayLength={1.5} followMouse mouseInfluence={0.08} saturation={0.6} fadeDistance={1.2} />
      <div className={`relative z-10 w-full max-w-sm transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <AuthForm />
      </div>
    </div>
  )
}
