import { supabase } from '@/lib/supabase'

const PUSH_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * 把当前浏览器/设备的推送订阅登记到 push_subscriptions(供服务端 cron 推送)。
 * 任何不支持/未授权/缺 VAPID 公钥的场景都安静返回 false, 不抛错、不阻塞业务。
 */
export async function ensurePushSubscription(userId: string): Promise<boolean> {
  if (!PUSH_PUBLIC_KEY) return false
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return false

  let reg: ServiceWorkerRegistration
  try {
    reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('sw-timeout')), 5000)
      }),
    ])
  } catch {
    return false
  }

  try {
    const options: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY),
    }
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe(options)
    } else {
      try {
        // 已存在订阅: 若仍是用当前公钥创建的, subscribe 会原样返回它;
        // 若来自旧公钥(VAPID 轮换过), 会抛错 —— 退订后用新公钥重订,
        // 否则旧订阅永远收不到推送(推送服务会按订阅时的公钥校验发送方)。
        sub = await reg.pushManager.subscribe(options)
      } catch {
        await sub.unsubscribe().catch(() => {})
        sub = await reg.pushManager.subscribe(options)
      }
    }
    const json = sub.toJSON()
    const endpoint = sub.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) return false

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    return !error
  } catch {
    return false
  }
}
